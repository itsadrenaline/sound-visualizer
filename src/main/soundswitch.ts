/**
 * Finds the SoundSwitch project you have open and watches it for changes.
 *
 * How we find "the open project", best first:
 *  1. The project folder SoundSwitch has open right now (via `lsof`, which lists
 *     files a running program is using).
 *  2. The project you last made a show from (or picked) in the app.
 *  3. Any recent project in your usual folders (Music, Documents, Downloads, Desktop),
 *     newest first.
 * When the venue file changes (you edit the patch in SoundSwitch), it's read again
 * and the new fixture list is sent to the window.
 */
import { log } from './log'
import { app, dialog, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { parseSoundSwitchVenue } from '../shared/soundswitch'
import type { SoundSwitchStatus } from '../shared/ipc'

const VENUE_FILE = 'SoundSwitchVenues.bin'

/**
 * Fixtures to leave out, per SoundSwitch project. SoundSwitch sometimes keeps
 * records of fixtures that aren't in the profile any more; list them here (or
 * delete them in the app, which adds them for you).
 *
 * The file lives in your user data folder (an installed app can't write inside
 * itself). The first time, entries from the project folder's copy are brought over.
 */
const EXCLUDE_FILE = () => join(app.getPath('userData'), 'soundswitch-exclude.json')
const OLD_EXCLUDE_FILE = () => join(app.getAppPath(), 'soundswitch-exclude.json')

export function exclusionKey(f: { universe: number; address: number; definition: string }): string {
  return `U${f.universe + 1}.${f.address} ${f.definition}`
}

function readJson(path: string): Record<string, string[]> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string[]>
  } catch {
    return {}
  }
}

function loadExclusions(): Record<string, string[]> {
  const mine = readJson(EXCLUDE_FILE())
  // Merge in the older copy that sat next to the app's source.
  for (const [project, keys] of Object.entries(readJson(OLD_EXCLUDE_FILE()))) mine[project] = [...new Set([...(mine[project] ?? []), ...keys])].sort()
  return mine
}

export function excludeFixtures(project: string, keys: string[]): void {
  const all = loadExclusions()
  all[project] = [...new Set([...(all[project] ?? []), ...keys])].sort()
  try {
    writeFileSync(EXCLUDE_FILE(), JSON.stringify(all, null, 2) + '\n')
  } catch (error) {
    log('error', 'Could not save the SoundSwitch exclusions', error)
  }
  if (current) readAndSend(current, lastHow)
}
const settingsPath = () => join(app.getPath('userData'), 'soundswitch.json')

let window: BrowserWindow | null = null
let current: string | null = null
let watcher: FSWatcher | null = null
let debounce: NodeJS.Timeout | null = null
let lastHow: SoundSwitchStatus['how'] = 'most recent'
/**
 * The project SoundSwitch had open when we last looked. The app only switches to
 * what SoundSwitch has open when that changes, so a project you picked yourself
 * isn't swapped back a few seconds later.
 */
let lastRunning: string | null = null
/** Other projects SoundSwitch has files open in (see openInSoundSwitch). */
let alsoOpen: string[] = []

function loadChosen(): string | null {
  try {
    return (JSON.parse(readFileSync(settingsPath(), 'utf8')) as { project?: string }).project ?? null
  } catch {
    return null
  }
}

function saveChosen(project: string): void {
  try {
    writeFileSync(settingsPath(), JSON.stringify({ project }))
  } catch {
    // Not fatal: we'll just search again next time.
  }
}

const hasVenue = (dir: string) => existsSync(join(dir, VENUE_FILE))

/**
 * The .ssproj folder the running SoundSwitch has open, if any.
 *
 * SoundSwitch can hold files in more than one project at once (one it had open
 * earlier can stay in the list), so every project it has files in is counted:
 * the one with the most open files is the one on screen; on a tie, the one opened
 * last (highest file number). The others are reported too, so you can pick.
 */
export interface Running {
  path: string
  /** Other projects SoundSwitch also has files open in. */
  others: string[]
}

function openInSoundSwitch(): Promise<Running | null> {
  return new Promise((resolve) => {
    execFile('lsof', ['-c', 'SoundSwitch', '-Fn'], { timeout: 4000, maxBuffer: 8 * 1024 * 1024 }, (_err, stdout) => {
      const seen = new Map<string, { files: number; lastFd: number }>()
      let fd = 0
      for (const line of (stdout ?? '').split('\n')) {
        if (line.startsWith('f')) fd = Number(line.slice(1)) || fd
        const path = /^n(.*?\.ssproj)(\/|$)/.exec(line)?.[1]
        if (!path) continue
        const entry = seen.get(path) ?? { files: 0, lastFd: 0 }
        entry.files++
        entry.lastFd = Math.max(entry.lastFd, fd)
        seen.set(path, entry)
      }
      const ranked = [...seen].filter(([p]) => hasVenue(p)).sort((a, b) => b[1].files - a[1].files || b[1].lastFd - a[1].lastFd)
      if (ranked.length > 1) log('info', 'SoundSwitch has files open in several projects', ranked.map(([p, e]) => `${basename(p)}: ${e.files} files, fd ${e.lastFd}`))
      resolve(ranked.length ? { path: ranked[0][0], others: ranked.slice(1).map(([p]) => p) } : null)
    })
  })
}

/** .ssproj folders in the usual places, newest venue file first. */
function searchCommonFolders(): string[] {
  const home = homedir()
  const roots = ['Music/SoundSwitch', 'Music', 'Documents/SoundSwitch', 'Documents', 'Downloads', 'Desktop'].map((r) => join(home, r))
  const found: Array<{ dir: string; time: number }> = []
  const visit = (dir: string, depth: number) => {
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(dir, name)
      if (name.endsWith('.ssproj') && hasVenue(full)) {
        found.push({ dir: full, time: statSync(join(full, VENUE_FILE)).mtimeMs })
      } else if (depth > 0 && !name.startsWith('.')) {
        try {
          if (statSync(full).isDirectory()) visit(full, depth - 1)
        } catch {
          // Unreadable folder: skip it.
        }
      }
    }
  }
  for (const root of roots) visit(root, 1)
  return found.sort((a, b) => b.time - a.time).map((f) => f.dir)
}

async function locateProject(): Promise<{ path: string; how: SoundSwitchStatus['how'] } | null> {
  const running = await openInSoundSwitch()
  lastRunning = running?.path ?? null
  alsoOpen = running?.others ?? []
  if (running) return { path: running.path, how: 'open in SoundSwitch' }
  const chosen = loadChosen()
  if (chosen && hasVenue(chosen)) return { path: chosen, how: 'chosen' }
  const recent = searchCommonFolders()[0]
  return recent ? { path: recent, how: 'most recent' } : null
}

function send(status: SoundSwitchStatus): void {
  window?.webContents.send('soundswitch', status)
}

function readAndSend(project: string, how: SoundSwitchStatus['how']): void {
  lastHow = how
  const name = basename(project).replace(/\.ssproj$/, '')
  try {
    const venue = parseSoundSwitchVenue(new Uint8Array(readFileSync(join(project, VENUE_FILE))))
    const excluded = new Set(loadExclusions()[name] ?? [])
    const fixtures = venue.fixtures.filter((f) => !excluded.has(exclusionKey(f)))
    const others = [...new Set([lastRunning, ...alsoOpen].filter((p): p is string => !!p && p !== project))]
    send({ state: 'linked', project, name, how, fixtures, skipped: venue.skipped, hidden: venue.fixtures.length - fixtures.length, alsoOpen: others.map((path) => ({ path, name: basename(path).replace(/\.ssproj$/, '') })) })
  } catch (error) {
    send({ state: 'error', project, name, how, fixtures: [], skipped: 0, error: (error as Error).message })
  }
}

function follow(project: string, how: SoundSwitchStatus['how']): void {
  if (project !== current) {
    watcher?.close()
    current = project
    // Watch the folder rather than the file: SoundSwitch may replace the file when saving.
    watcher = watch(project, (_event, file) => {
      if (file && file !== VENUE_FILE) return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => readAndSend(project, how), 400)
    })
  }
  readAndSend(project, how)
}

/** Look for the project again, e.g. after you open a different one in SoundSwitch. */
export async function refreshSoundSwitch(): Promise<void> {
  const found = await locateProject()
  if (found) follow(found.path, found.how)
  else send({ state: 'not found', project: '', name: '', how: 'most recent', fixtures: [], skipped: 0 })
}

let polling = false

export function startSoundSwitch(target: BrowserWindow): void {
  window = target
  if (polling) return
  polling = true
  // Every 10 seconds, check whether SoundSwitch has switched to a different project.
  setInterval(async () => {
    const found = await openInSoundSwitch()
    const running = found?.path ?? null
    alsoOpen = found?.others ?? []
    if (running === lastRunning) return
    lastRunning = running
    if (running && running !== current) follow(running, 'open in SoundSwitch')
  }, 10_000)
}

// --- Profiles: every SoundSwitch project on this Mac, for the New Show wizard ---------

export interface SoundSwitchProfile {
  path: string
  name: string
  fixtures: number
  modified: number
  /** SoundSwitch has it open right now. */
  open: boolean
}

export async function listProfiles(): Promise<SoundSwitchProfile[]> {
  const running = (await openInSoundSwitch())?.path ?? null
  const chosen = loadChosen()
  const paths = [...new Set([running, chosen, ...searchCommonFolders()].filter((p): p is string => !!p && hasVenue(p)))]
  return paths.map((path) => {
    let fixtures = 0
    try {
      fixtures = readProfile(path).fixtures.length
    } catch {
      fixtures = 0
    }
    return { path, name: basename(path).replace(/\.ssproj$/, ''), fixtures, modified: statSync(join(path, VENUE_FILE)).mtimeMs, open: path === running }
  })
}

/** One project's fixtures (without the ones left out in soundswitch-exclude.json). */
export function readProfile(path: string): { name: string; fixtures: ReturnType<typeof parseSoundSwitchVenue>['fixtures'] } {
  if (!hasVenue(path)) throw new Error(`No ${VENUE_FILE} in ${basename(path)}`)
  const name = basename(path).replace(/\.ssproj$/, '')
  const venue = parseSoundSwitchVenue(new Uint8Array(readFileSync(join(path, VENUE_FILE))))
  const excluded = new Set(loadExclusions()[name] ?? [])
  return { name, fixtures: venue.fixtures.filter((f) => !excluded.has(exclusionKey(f))) }
}

/** Follow this project from now on (a new show was made from it). */
export function useProfile(path: string): void {
  if (!hasVenue(path)) return
  saveChosen(path)
  follow(path, 'chosen')
}

/** Pick a project folder anywhere, for the wizard. */
export async function browseProfile(): Promise<string | null> {
  const options = { title: 'Choose a SoundSwitch project', message: 'Pick a .ssproj project folder.', properties: ['openDirectory', 'treatPackageAsDirectory'] as Array<'openDirectory' | 'treatPackageAsDirectory'>, defaultPath: join(homedir(), 'Music') }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  const picked = result.filePaths[0]
  if (!picked) return null
  if (hasVenue(picked)) return picked
  // Say why nothing happened, rather than nothing at all.
  const message = { type: 'warning' as const, message: 'That isn’t a SoundSwitch project', detail: `There's no ${VENUE_FILE} in “${basename(picked)}”. Pick the .ssproj project folder (usually in Music ▸ SoundSwitch).` }
  if (window) await dialog.showMessageBox(window, message)
  else await dialog.showMessageBox(message)
  return null
}
