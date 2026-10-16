/** Messages the main process sends to the page. Shared so both sides agree on the shape. */
import type { SoundSwitchFixture } from './soundswitch'

export interface DmxMessage {
  universe: number
  data: Uint8Array
  /** IP address of the sender, e.g. SoundSwitch's computer. */
  from: string
}

export interface ArtNetStatus {
  listening: boolean
  /** Address and port we're bound to, e.g. "0.0.0.0:6454". */
  address: string
  error?: string
  /** Not listening, and why (in the browser: the Art-Net bridge isn't running). */
  note?: { text: string; short: string; help: string }
}

/** The SoundSwitch project the app is following, and its fixtures. */
export interface SoundSwitchStatus {
  state: 'linked' | 'not found' | 'error'
  /** Folder path of the .ssproj project. */
  project: string
  name: string
  how: 'open in SoundSwitch' | 'chosen' | 'most recent'
  fixtures: SoundSwitchFixture[]
  skipped: number
  /** Fixtures left out because they're listed in soundswitch-exclude.json. */
  hidden?: number
  error?: string
}

export interface SoundSwitchProfile {
  path: string
  name: string
  fixtures: number
  modified: number
  open: boolean
}

export interface OpenedProject {
  path: string
  project: unknown
}

/** For About and support: exactly which build is running, and where. */
export interface AboutInfo {
  version: string
  /** The commit and date it was built from, e.g. "eac7f34 · 2026-10-16". */
  build: string
  /** 'Mac app' or 'Browser'. */
  kind: string
  /** e.g. "macOS 15.1 (Apple Silicon)" or "Chrome 141 on Windows". */
  system: string
  /** Engine versions, e.g. "Electron 44.0.0 · Chrome 140.0". */
  engine: string
}

export interface Notice {
  kind: 'info' | 'error'
  text: string
}

/** What the preload script exposes on `window.api`. */
export interface VisualizerApi {
  /**
   * 'desktop': the Electron app (native menu bar, files, UDP).
   * 'web': the browser version (src/renderer/src/web): no menu bar, so the page
   * handles every shortcut itself and shows the menu items in its own menus.
   */
  platform?: 'desktop' | 'web'
  onDmx(callback: (message: DmxMessage) => void): () => void
  onArtNetStatus(callback: (status: ArtNetStatus) => void): () => void
  requestArtNetStatus(): void
  onSoundSwitch(callback: (status: SoundSwitchStatus) => void): () => void
  refreshSoundSwitch(): void
  /** Leave these fixtures out of future syncs (keys from exclusionKey). */
  excludeSoundSwitchFixtures(project: string, keys: string[]): void
  /** Every SoundSwitch project found on this Mac (the one open in SoundSwitch first). */
  soundSwitchProfiles(): Promise<SoundSwitchProfile[]>
  readSoundSwitchProfile(path: string): Promise<{ name: string; fixtures: SoundSwitchFixture[] } | { error: string }>
  browseSoundSwitchProfile(): Promise<string | null>
  /** Follow this project from now on. */
  useSoundSwitchProfile(path: string): void

  /** Project files. Save returns the path written, or null if cancelled. */
  saveProject(json: string, path: string | null, saveAs: boolean, name: string): Promise<string | null>
  openProject(): Promise<OpenedProject | { error: string } | null>
  onProjectOpened(callback: (opened: OpenedProject) => void): () => void
  setTitle(name: string, path: string | null, edited: boolean): void
  saveImage(dataUrl: string, name: string): Promise<string | null>

  /** The fixture library (Open Fixture Library plus your imported files), as raw OFL JSON. */
  loadLibrary(): Promise<unknown>
  importFixtureFiles(): Promise<{ added: number; rejected: string[] }>
  /** The bundled QLC+ library's list; each definition is fetched with qlcDefinition when it's picked. */
  loadQlcLibrary(): Promise<{ source: string; url: string; built: string; entries: unknown[] } | null>
  qlcDefinition(key: string): Promise<unknown>
  /** Fixtures made or edited in Fixture Studio, kept on this Mac. */
  myFixtures(): Promise<unknown[]>
  saveMyFixture(def: unknown): Promise<{ ok: true } | { error: string }>
  deleteMyFixture(id: string): Promise<void>

  onMenu(callback: (command: string) => void): () => void
  onNotice(callback: (notice: Notice) => void): () => void
  log(level: 'info' | 'warn' | 'error', message: string, detail?: unknown): void
  openLogs(): void

  /** Is this a new copy of the app (reinstalled or updated) on a Mac that has used it before? */
  /** Version, build and system, for the About box. */
  aboutInfo?(): Promise<AboutInfo>
  installInfo(): Promise<{ changed: boolean; firstEver: boolean; version: string; previousVersion: string | null }>
  /** Forget this Mac's SoundSwitch choices (and optionally the Claude key and imported fixtures). */
  freshStart(options: { claudeKey?: boolean; importedFixtures?: boolean }): Promise<void>

  /** The show builder's link to Claude. The key stays in the main process, encrypted. */
  claudeStatus(): Promise<{ connected: boolean; encryption: boolean }>
  setClaudeKey(key: string): Promise<{ connected: boolean; error?: string }>
  clearClaudeKey(): Promise<void>
  claudeRequest(body: unknown): Promise<{ ok: true; response: unknown } | { ok: false; error: string }>

  /** Export a file (MVR, CSV); returns the path, or null if cancelled. */
  saveFile(defaultName: string, filters: FileFilter[], data: string | Uint8Array): Promise<string | null>
  /** Pick a file to import. */
  openFile(filters: FileFilter[]): Promise<{ path: string; name: string; bytes: Uint8Array } | null>
}

export interface FileFilter {
  name: string
  extensions: string[]
}
