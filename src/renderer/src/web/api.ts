/**
 * The browser version's `window.api`: the same API the Mac app's preload script
 * gives the page (src/shared/ipc.ts), done with what a browser can do. The rest of
 * the app doesn't know the difference.
 *
 *  - Files: File System Access API in Chrome and Edge (save in place), downloads and
 *    file inputs elsewhere (files.ts).
 *  - SoundSwitch: a folder you pick once instead of finding it on disk (soundswitch.ts).
 *  - Art-Net: through the bridge, a small program on this computer (bridge.ts).
 *  - Your fixtures, imported fixtures and settings: IndexedDB in this browser (store.ts).
 *  - Claude: straight from the page to Anthropic with your key, kept in this browser.
 */
import type { Notice, OpenedProject, VisualizerApi } from '../../../shared/ipc'
import * as bridge from './bridge'
import { connected as bridgeConnected } from './bridge'
import * as soundswitch from './soundswitch'
import { canSaveInPlace, pickFiles, safeName, saveData, type FileHandle } from './files'
import { idb } from './store'

const PROJECT = [{ name: 'Sound Visualizer show', extensions: ['ssvis'] }]
const FORMAT = 'sound-visualizer'
const OLD_FORMAT = 'soundswitch-visualizer'
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'web'

// Shows opened or saved this session, by name, so Save writes the same file again (Chrome, Edge).
const handles = new Map<string, FileHandle>()
const noticeListeners = new Set<(n: Notice) => void>()
const openedListeners = new Set<(o: OpenedProject) => void>()
const notice = (n: Notice) => noticeListeners.forEach((l) => l(n))

function readProjectText(name: string, text: string): OpenedProject {
  const parsed = JSON.parse(text)
  if ((parsed?.format !== FORMAT && parsed?.format !== OLD_FORMAT) || !parsed.project?.fixtures) throw new Error(`${name} isn't a Sound Visualizer show.`)
  return { path: name, project: parsed.project }
}

// --- Fixture library ------------------------------------------------------------------
interface OflLibrary {
  manufacturers: Record<string, string>
  fixtures: Record<string, unknown>
}
const isFixture = (v: unknown): v is { name: string; modes: unknown[]; manufacturerKey?: string } =>
  typeof (v as { name?: unknown })?.name === 'string' && Array.isArray((v as { modes?: unknown }).modes) && (v as { modes: unknown[] }).modes.length > 0

let qlc: Promise<{ source: string; url: string; built: string; entries: unknown[]; fixtures: Record<string, unknown> } | null> | null = null
const loadQlc = () => (qlc ??= fetch('library/qlcplus.json').then((r) => (r.ok ? r.json() : null)).catch(() => null))

// --- Claude: your key, kept in this browser ----------------------------------------------
const KEY = 'sv.web.claudeKey'
const getKey = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const webApi: VisualizerApi = {
  platform: 'web',

  onDmx: bridge.onDmx,
  onArtNetStatus: bridge.onStatus,
  requestArtNetStatus: bridge.requestStatus,

  onSoundSwitch: soundswitch.onSoundSwitch,
  // Called on start (no click: can't ask for permission) and from the pill's menu (a click: can).
  refreshSoundSwitch: () => void soundswitch.refresh(navigator.userActivation?.isActive ?? false),
  excludeSoundSwitchFixtures: soundswitch.excludeFixtures,
  soundSwitchProfiles: soundswitch.profiles,
  readSoundSwitchProfile: soundswitch.read,
  browseSoundSwitchProfile: soundswitch.browse,
  useSoundSwitchProfile: (path) => void soundswitch.use(path),

  async saveProject(json, path, saveAs, name) {
    const body = JSON.stringify({ format: FORMAT, version: 1, savedAt: new Date().toISOString(), project: JSON.parse(json) }, null, 1)
    const existing = path && !saveAs ? handles.get(path) : undefined
    const saved = await saveData(`${safeName(name)}.ssvis`, PROJECT, new Blob([body], { type: 'application/json' }), existing)
    if (!saved) return null
    if (saved.handle) handles.set(saved.name, saved.handle)
    if (!canSaveInPlace) notice({ kind: 'info', text: `Saved “${saved.name}” to your Downloads folder. This browser can't save over a file: each save makes a new download.` })
    return saved.name
  },
  async openProject() {
    const [picked] = await pickFiles(PROJECT)
    if (!picked) return null
    try {
      const opened = readProjectText(picked.file.name, await picked.file.text())
      if (picked.handle) handles.set(picked.file.name, picked.handle)
      return opened
    } catch (error) {
      return { error: (error as Error).message }
    }
  },
  onProjectOpened(callback) {
    openedListeners.add(callback)
    return () => openedListeners.delete(callback)
  },
  setTitle(name, path, edited) {
    document.title = `${edited ? '• ' : ''}${path ?? name} — Sound Visualizer`
  },
  /** Videos for screens: kept in this browser (IndexedDB), named by their content. */
  async saveMedia(name, data) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource))
    const ext = (/\.(mp4|m4v|mov|webm)$/i.exec(name)?.[1] ?? 'mp4').toLowerCase()
    const id = `${[...hash.slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('')}.${ext}`
    await idb.set('media', id, data)
    return id
  },
  async readMedia(id) {
    return (await idb.get<Uint8Array>('media', id)) ?? null
  },
  async saveImage(dataUrl, name) {
    const blob = await (await fetch(dataUrl)).blob()
    const saved = await saveData(`${safeName(name)}.png`, [{ name: 'PNG image', extensions: ['png'] }], blob)
    return saved?.name ?? null
  },

  async loadLibrary() {
    const library = (await (await fetch('library/ofl.json')).json()) as OflLibrary
    for (const { key, fixture } of await idb.all<{ key: string; fixture: { manufacturerKey?: string } }>('imported')) {
      const man = fixture.manufacturerKey ?? 'imported'
      library.manufacturers[man] ??= man === 'imported' ? 'Imported' : man
      library.fixtures[`${man}/${key}`] = fixture
    }
    return library
  },
  async importFixtureFiles() {
    const files = await pickFiles([{ name: 'Open Fixture Library JSON', extensions: ['json'] }], true)
    let added = 0
    const rejected: string[] = []
    for (const { file } of files) {
      try {
        const fixture = JSON.parse(await file.text())
        if (!isFixture(fixture)) throw new Error('not an Open Fixture Library fixture')
        const key = file.name.replace(/\.json$/, '')
        await idb.set('imported', key, { key, fixture })
        added++
      } catch (error) {
        rejected.push(`${file.name}: ${(error as Error).message}`)
      }
    }
    return { added, rejected }
  },
  async loadQlcLibrary() {
    const lib = await loadQlc()
    return lib ? { source: lib.source, url: lib.url, built: lib.built, entries: lib.entries } : null
  },
  async qlcDefinition(key) {
    return (await loadQlc())?.fixtures[key] ?? null
  },
  myFixtures: () => idb.all('myFixtures'),
  async saveMyFixture(def) {
    const d = def as { id?: string; format?: string }
    if (d?.format !== 'sound-visualizer-fixture' || !d.id) return { error: 'Not a Fixture Studio definition.' }
    await idb.set('myFixtures', d.id, def)
    return { ok: true }
  },
  deleteMyFixture: (id) => idb.delete('myFixtures', id),

  // No menu bar in a browser: the page's own menus and shortcuts do it all.
  onMenu: () => () => {},
  onNotice(callback) {
    noticeListeners.add(callback)
    return () => noticeListeners.delete(callback)
  },
  log(level, message, detail) {
    console[level](`[Sound Visualizer] ${message}`, detail ?? '')
  },
  openLogs: () => notice({ kind: 'info', text: 'In the browser, messages go to the developer console (View ▸ Developer ▸ JavaScript Console).' }),

  async aboutInfo() {
    const ua = navigator.userAgent
    const browser = /Edg\/([\d]+)/.exec(ua) ? `Edge ${/Edg\/([\d]+)/.exec(ua)![1]}` : /Chrome\/([\d]+)/.exec(ua) ? `Chrome ${/Chrome\/([\d]+)/.exec(ua)![1]}` : /Firefox\/([\d]+)/.exec(ua) ? `Firefox ${/Firefox\/([\d]+)/.exec(ua)![1]}` : /Version\/([\d.]+).*Safari/.exec(ua) ? `Safari ${/Version\/([\d.]+)/.exec(ua)![1]}` : 'a browser'
    const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'unknown system'
    return {
      version: VERSION,
      build: typeof __BUILD__ === 'string' ? __BUILD__ : 'development',
      kind: 'Browser',
      system: `${browser} on ${os}`,
      engine: `${location.origin}${bridgeConnected() ? ' · Art-Net bridge connected' : ' · no Art-Net bridge'}`
    }
  },
  async installInfo() {
    let previous: string | null = null
    try {
      previous = localStorage.getItem('sv.web.version')
      localStorage.setItem('sv.web.version', VERSION)
    } catch {
      // No storage: every visit looks like the first.
    }
    return { changed: false, firstEver: previous === null, version: VERSION, previousVersion: previous }
  },
  async freshStart(options) {
    await soundswitch.forgetAll()
    if (options.importedFixtures) await idb.clear(['imported'])
    if (options.claudeKey) localStorage.removeItem(KEY)
  },

  async claudeStatus() {
    return { connected: !!getKey(), encryption: false }
  },
  async setClaudeKey(key) {
    const trimmed = key.replace(/[\s"'“”]/g, '')
    if (!/^sk-ant-[\w-]{20,}$/.test(trimmed)) return { connected: false, error: "That isn't an Anthropic API key. Keys start with sk-ant- and are about 100 characters: copy it with the Copy button in the Console." }
    try {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': trimmed, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } })
      if (r.status === 401 || r.status === 403) return { connected: false, error: "Anthropic didn't accept that key. It may have been deleted, or only part of it was copied." }
    } catch {
      // Offline: keep it; the first request will tell.
    }
    localStorage.setItem(KEY, trimmed)
    return { connected: true }
  },
  async clearClaudeKey() {
    localStorage.removeItem(KEY)
  },
  async claudeRequest(body) {
    const key = getKey()
    if (!key) return { ok: false, error: 'Claude is not connected: add your API key first.' }
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify(body)
      })
      const json = (await r.json().catch(() => null)) as { error?: { message?: string } } | null
      if (!r.ok) return { ok: false, error: r.status === 401 ? 'Claude rejected the API key. Check it in the builder settings.' : (json?.error?.message ?? `HTTP ${r.status}`) }
      return { ok: true, response: json }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  },

  async saveFile(defaultName, filters, data) {
    const blob = new Blob([data as BlobPart])
    const saved = await saveData(safeName(defaultName), filters, blob)
    return saved?.name ?? null
  },
  async openFile(filters) {
    const [picked] = await pickFiles(filters)
    if (!picked) return null
    return { path: picked.file.name, name: picked.file.name, bytes: new Uint8Array(await picked.file.arrayBuffer()) }
  }
}

/** A show file dropped on the page opens like File ▸ Open. */
function acceptDroppedShows(): void {
  window.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) e.preventDefault()
  })
  window.addEventListener('drop', async (e) => {
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.name.endsWith('.ssvis'))
    if (!file) return
    e.preventDefault()
    try {
      const opened = readProjectText(file.name, await file.text())
      openedListeners.forEach((l) => l(opened))
    } catch (error) {
      notice({ kind: 'error', text: (error as Error).message })
    }
  })
}

export function installWebApi(): void {
  window.api = webApi
  acceptDroppedShows()
}
