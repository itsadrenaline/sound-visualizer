/**
 * SoundSwitch projects in the browser.
 *
 * The Mac app finds the project SoundSwitch has open by asking macOS which files
 * SoundSwitch is using. A web page can't do that, or look around your disk at all:
 * you pick a folder once and the page may read only that folder.
 *
 * So: pick your SoundSwitch folder (or the Music / Documents folder it's in, or one
 * project). Every project inside is found and remembered. In Chrome and Edge the page
 * keeps permission to read them (it may ask again on a later visit) and checks the
 * project you follow every two seconds, so patch changes in SoundSwitch show up like
 * in the Mac app. Safari and Firefox can only read a copy of the folder at the
 * moment you pick it: pick it again after changing the patch.
 */
import { parseSoundSwitchVenue, type SoundSwitchFixture } from '../../../shared/soundswitch'
import type { SoundSwitchProfile, SoundSwitchStatus } from '../../../shared/ipc'
import { idb } from './store'
import { canPickFolders, pickers, type DirectoryHandle, type FileHandle } from './files'

const VENUE_FILE = 'SoundSwitchVenues.bin'
const PREFIX = 'web:'

/** One remembered project: a folder we may read, or (Safari, Firefox) a copy of its venue file. */
interface Remembered {
  name: string
  handle?: DirectoryHandle
  bytes?: Uint8Array
  modified: number
}

type Listener = (status: SoundSwitchStatus) => void
const listeners = new Set<Listener>()
let current: string | null = null
let lastModified = 0
let timer: ReturnType<typeof setInterval> | null = null

export const pathOf = (name: string) => `${PREFIX}${name}`
const nameOf = (path: string) => (path.startsWith(PREFIX) ? path.slice(PREFIX.length) : path).replace(/\.ssproj$/, '')

export function onSoundSwitch(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const send = (status: SoundSwitchStatus) => listeners.forEach((l) => l(status))

// --- Fixtures left out (the Mac app keeps these in soundswitch-exclude.json) ------------
const EXCLUDE_KEY = 'sv.web.soundswitchExclude'
export const exclusionKey = (f: { universe: number; address: number; definition: string }) => `U${f.universe + 1}.${f.address} ${f.definition}`
function exclusions(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(EXCLUDE_KEY) ?? '{}')
  } catch {
    return {}
  }
}
export function excludeFixtures(project: string, keys: string[]): void {
  const all = exclusions()
  all[project] = [...new Set([...(all[project] ?? []), ...keys])].sort()
  try {
    localStorage.setItem(EXCLUDE_KEY, JSON.stringify(all))
  } catch {
    // Not fatal.
  }
  if (current) void follow(current, false)
}

// --- Reading -------------------------------------------------------------------------
async function canRead(entry: Remembered, ask: boolean): Promise<boolean> {
  if (!entry.handle) return !!entry.bytes
  let state = await entry.handle.queryPermission({ mode: 'read' })
  // Asking needs a click: it works from a menu item or button, not on page load.
  if (state === 'prompt' && ask) state = await entry.handle.requestPermission({ mode: 'read' }).catch(() => 'prompt' as PermissionState)
  return state === 'granted'
}

async function venueFile(entry: Remembered): Promise<{ bytes: Uint8Array; modified: number }> {
  if (!entry.handle) return { bytes: entry.bytes!, modified: entry.modified }
  const file = await (await entry.handle.getFileHandle(VENUE_FILE)).getFile()
  return { bytes: new Uint8Array(await file.arrayBuffer()), modified: file.lastModified }
}

function fixturesOf(name: string, bytes: Uint8Array): { fixtures: SoundSwitchFixture[]; skipped: number; hidden: number } {
  const venue = parseSoundSwitchVenue(bytes)
  const excluded = new Set(exclusions()[name] ?? [])
  const fixtures = venue.fixtures.filter((f) => !excluded.has(exclusionKey(f)))
  return { fixtures, skipped: venue.skipped, hidden: venue.fixtures.length - fixtures.length }
}

/** Follow a project: read it now, then check it for changes every two seconds. */
async function follow(name: string, ask: boolean): Promise<void> {
  current = name
  try {
    localStorage.setItem('sv.web.soundswitchCurrent', name)
  } catch {
    // Not fatal.
  }
  const entry = await idb.get<Remembered>('folders', name)
  if (!entry) return send({ state: 'not found', project: '', name: '', how: 'chosen', fixtures: [], skipped: 0 })
  if (!(await canRead(entry, ask))) {
    // Permission lapsed (a new visit): the pill's "Find the open project again" asks again.
    return send({ state: 'not found', project: pathOf(name), name, how: 'chosen', fixtures: [], skipped: 0, error: `Allow reading “${name}” again: click Find the open project again.` })
  }
  try {
    const { bytes, modified } = await venueFile(entry)
    lastModified = modified
    send({ state: 'linked', project: pathOf(name), name, how: 'chosen', ...fixturesOf(name, bytes) })
  } catch (error) {
    send({ state: 'error', project: pathOf(name), name, how: 'chosen', fixtures: [], skipped: 0, error: (error as Error).message })
  }
  timer ??= setInterval(() => void checkForChanges(), 2000)
}

async function checkForChanges(): Promise<void> {
  if (!current) return
  const entry = await idb.get<Remembered>('folders', current)
  if (!entry?.handle || (await entry.handle.queryPermission({ mode: 'read' })) !== 'granted') return
  try {
    const file = await (await entry.handle.getFileHandle(VENUE_FILE)).getFile()
    if (file.lastModified !== lastModified) await follow(current, false)
  } catch {
    // The project was moved or deleted: keep the last patch until it's back.
  }
}

/** On start, and from "Find the open project again": the project you last followed. */
export async function refresh(ask: boolean): Promise<void> {
  let name: string | null = current
  try {
    name ??= localStorage.getItem('sv.web.soundswitchCurrent')
  } catch {
    // No storage: nothing remembered.
  }
  if (!name) {
    const all = await idb.all<Remembered>('folders')
    name = all.sort((a, b) => b.modified - a.modified)[0]?.name ?? null
  }
  if (name) return follow(name, ask)
  send({ state: 'not found', project: '', name: '', how: 'chosen', fixtures: [], skipped: 0 })
}

export async function use(path: string): Promise<void> {
  await follow(nameOf(path), true)
}

export async function profiles(): Promise<SoundSwitchProfile[]> {
  const all = await idb.all<Remembered>('folders')
  const out: SoundSwitchProfile[] = []
  for (const entry of all) {
    let fixtures = 0
    let modified = entry.modified
    try {
      if (await canRead(entry, false)) {
        const venue = await venueFile(entry)
        fixtures = fixturesOf(entry.name, venue.bytes).fixtures.length
        modified = venue.modified
      }
    } catch {
      // Unreadable now: listed anyway, it's read when picked.
    }
    out.push({ path: pathOf(entry.name), name: entry.name, fixtures, modified, open: entry.name === current })
  }
  return out.sort((a, b) => b.modified - a.modified)
}

export async function read(path: string): Promise<{ name: string; fixtures: SoundSwitchFixture[] } | { error: string }> {
  const name = nameOf(path)
  const entry = await idb.get<Remembered>('folders', name)
  if (!entry) return { error: `“${name}” isn't remembered any more: choose its folder again.` }
  if (!(await canRead(entry, true))) return { error: `The browser wasn't allowed to read “${name}”. Choose its folder again and allow it.` }
  try {
    return { name, fixtures: fixturesOf(name, (await venueFile(entry)).bytes).fixtures }
  } catch (error) {
    return { error: (error as Error).message }
  }
}

// --- Choosing a folder ------------------------------------------------------------------

/** Every .ssproj project in a folder (the folder itself, or up to three levels down). */
async function projectsIn(dir: DirectoryHandle, depth = 3): Promise<DirectoryHandle[]> {
  const found: DirectoryHandle[] = []
  if (dir.name.endsWith('.ssproj')) {
    try {
      await dir.getFileHandle(VENUE_FILE)
      return [dir]
    } catch {
      return []
    }
  }
  if (depth === 0) return found
  for await (const child of dir.values()) {
    if (child.kind !== 'directory' || child.name.startsWith('.')) continue
    found.push(...(await projectsIn(child, depth - 1)))
  }
  return found
}

/**
 * Asks for a folder and remembers every project in it. Returns the newest one's
 * path (for the New Show wizard), or null if none was picked or found.
 */
export async function browse(): Promise<string | null> {
  if (canPickFolders) {
    let dir: DirectoryHandle
    try {
      dir = await pickers.showDirectoryPicker!({ id: 'soundswitch', mode: 'read', startIn: 'music' })
    } catch {
      return null
    }
    const projects = await projectsIn(dir)
    if (!projects.length) {
      alert(`No SoundSwitch projects in “${dir.name}”.\n\nPick the folder that holds your .ssproj projects (usually a SoundSwitch folder in Music or Documents), or one project.`)
      return null
    }
    let newest: { name: string; modified: number } | null = null
    for (const handle of projects) {
      const name = handle.name.replace(/\.ssproj$/, '')
      let modified = 0
      try {
        modified = (await (await (handle.getFileHandle(VENUE_FILE) as Promise<FileHandle>)).getFile()).lastModified
      } catch {
        // Listed anyway.
      }
      await idb.set('folders', name, { name, handle, modified } satisfies Remembered)
      if (!newest || modified > newest.modified) newest = { name, modified }
    }
    return newest ? pathOf(newest.name) : null
  }
  // Safari and Firefox: a one-time copy of the folder's venue files.
  const files = await pickFolderCopy()
  const venues = files.filter((f) => f.webkitRelativePath.endsWith(`.ssproj/${VENUE_FILE}`))
  if (!venues.length) {
    if (files.length) alert('No SoundSwitch projects in that folder. Pick the folder that holds your .ssproj projects.')
    return null
  }
  let newest: { name: string; modified: number } | null = null
  for (const file of venues) {
    const name = file.webkitRelativePath.split('/').at(-2)!.replace(/\.ssproj$/, '')
    await idb.set('folders', name, { name, bytes: new Uint8Array(await file.arrayBuffer()), modified: file.lastModified } satisfies Remembered)
    if (!newest || file.lastModified > newest.modified) newest = { name, modified: file.lastModified }
  }
  return newest ? pathOf(newest.name) : null
}

function pickFolderCopy(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.addEventListener('change', () => resolve([...(input.files ?? [])]))
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

export async function forgetAll(): Promise<void> {
  current = null
  if (timer) clearInterval(timer)
  timer = null
  await idb.clear(['folders'])
}
