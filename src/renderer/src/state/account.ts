/**
 * Your account on the web version: sign in with Google, and your settings and shows are
 * kept online (see src/worker). Only on a site that has the account API (Cloudflare);
 * on any other host, and in the Mac app, there's no account and nothing here shows.
 *
 * A show opened from your account (or saved to it) stays linked: Save (⌘S) saves it
 * back, and changes are saved by themselves a few seconds after you stop editing.
 * Opening a file, a template or a new show unlinks it.
 */
import { create } from 'zustand'
import { useStore } from './store'
import { accountSave, loadDocument, useDocument } from './document'
import { usePrefs } from './prefs'
import { notify } from './notices'
import type { Project } from '../model/project'

export interface AccountUser {
  id: string
  email: string
  name: string
  picture: string | null
}

export interface CloudShow {
  id: string
  name: string
  size: number
  created_at: string
  updated_at: string
}

type Status = 'checking' | 'unavailable' | 'signed-out' | 'signed-in'

interface AccountState {
  status: Status
  user: AccountUser | null
  /** The open show's id in the account, while it's linked. */
  linkedId: string | null
  /** Saving to the account right now. */
  saving: boolean
  /** When the linked show was last saved (ISO). */
  savedAt: string | null
  showsOpen: boolean
  setShowsOpen(open: boolean): void
  /** The Sign in window (Google's button). */
  signInOpen: boolean
  setSignInOpen(open: boolean): void
  /** The site's Google OAuth client ID; null until it's set up on the server. */
  googleClientId: string | null
}

export const useAccount = create<AccountState>((set) => ({
  status: 'checking',
  user: null,
  linkedId: null,
  saving: false,
  savedAt: null,
  showsOpen: false,
  setShowsOpen: (showsOpen) => set({ showsOpen }),
  signInOpen: false,
  setSignInOpen: (signInOpen) => set({ signInOpen }),
  googleClientId: null
}))

const FORMAT = 'sound-visualizer'
const AUTOSAVE_MS = 4000

/** What the document's path says for a show in the account, so the title shows where it lives. */
const linkedPath = (name: string) => `${name} (in your account)`

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json', ...(init.headers ?? {}) } : init?.headers
  })
  const type = response.headers.get('content-type') ?? ''
  const body = type.includes('application/json') ? await response.json() : null
  if (!response.ok) throw new Error((body as { error?: string } | null)?.error ?? `The server said ${response.status}.`)
  return body as T
}

// --- Signing in ---------------------------------------------------------------------------

let started = false

/** Ask the site who's signed in. Call once, on the web version only. */
const SIGN_IN_PROBLEMS: Record<string, string> = {
  expired: 'That sign-in took too long. Please try again.',
  failed: 'Google’s sign-in couldn’t be checked. Please try again.',
  'not-allowed': 'That Google account isn’t on the list for this test yet.',
  unavailable: 'Google sign-in isn’t set up on this site yet.'
}

export async function startAccount(): Promise<void> {
  if (started) return
  started = true
  // Back from Google's sign-in page with a problem: say so, and tidy the address.
  const problem = new URLSearchParams(window.location.search).get('signin')
  if (problem) {
    notify('error', SIGN_IN_PROBLEMS[problem] ?? 'Signing in didn’t work. Please try again.')
    window.history.replaceState(null, '', window.location.pathname)
  }
  try {
    const response = await fetch('/api/me', { credentials: 'same-origin' })
    // Another host (GitHub Pages, a plain file server): no account API, no account.
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('application/json')) {
      useAccount.setState({ status: 'unavailable' })
      return
    }
    const { user, prefs } = (await response.json()) as { user: AccountUser | null; prefs: SavedPrefs | null }
    const config = await call<{ googleClientId: string | null }>('/api/config').catch(() => ({ googleClientId: null }))
    useAccount.setState({ googleClientId: config.googleClientId })
    if (!user) {
      useAccount.setState({ status: 'signed-out' })
      return
    }
    useAccount.setState({ status: 'signed-in', user })
    // The show that was open last time is still the account's: keep it linked.
    const link = loadLink()
    if (link && link.user === user.id && link.path === useDocument.getState().path) useAccount.setState({ linkedId: link.id })
    if (prefs) applyPrefs(prefs)
    followPrefs()
    followDocument()
  } catch {
    useAccount.setState({ status: 'unavailable' })
  }
}

export function signIn(): void {
  useAccount.setState({ signInOpen: true })
}

interface GoogleId {
  initialize(options: { client_id: string; callback?: (r: { credential: string }) => void; use_fedcm_for_button?: boolean; ux_mode?: 'popup' | 'redirect'; login_uri?: string }): void
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

let gis: Promise<GoogleId> | null = null

/** Google's sign-in library (loaded the first time someone opens Sign in). */
export function loadGoogle(): Promise<GoogleId> {
  gis ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google.accounts.id)
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in didn’t load.')))
    script.onerror = () => {
      gis = null
      reject(new Error('Couldn’t reach Google. Check your connection, or turn off a blocker for this site.'))
    }
    document.head.appendChild(script)
  })
  return gis
}

/** Google's button hands back a signed token: the server checks it and signs you in. */
export async function finishSignIn(credential: string): Promise<void> {
  await call('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) })
  // Start again signed in: your settings and shows load as the page does.
  window.location.reload()
}

export async function signOut(): Promise<void> {
  try {
    await flushAutosave()
    await call('/auth/logout', { method: 'POST' })
  } catch {
    // Signed out on this side either way.
  }
  window.location.reload()
}

// --- Which show is linked, kept across reloads (this browser only) ---------------------------

const LINK_KEY = 'sv.account.linked'

function loadLink(): { id: string; path: string; user: string } | null {
  try {
    return JSON.parse(localStorage.getItem(LINK_KEY) ?? 'null')
  } catch {
    return null
  }
}

function saveLink(): void {
  const { linkedId, user } = useAccount.getState()
  try {
    if (linkedId && user) localStorage.setItem(LINK_KEY, JSON.stringify({ id: linkedId, path: useDocument.getState().path, user: user.id }))
    else localStorage.removeItem(LINK_KEY)
  } catch {
    // A convenience only.
  }
}

// --- Settings -----------------------------------------------------------------------------

type SavedPrefs = Partial<Pick<ReturnType<typeof usePrefs.getState>, 'units' | 'grid' | 'snap' | 'gridSize' | 'planLabels'>>

function currentPrefs(): SavedPrefs {
  const { units, grid, snap, gridSize, planLabels } = usePrefs.getState()
  return { units, grid, snap, gridSize, planLabels }
}

function applyPrefs(p: SavedPrefs): void {
  const s = usePrefs.getState()
  if (p.units === 'metric' || p.units === 'imperial') s.setUnits(p.units)
  if (typeof p.grid === 'boolean') s.setGrid(p.grid)
  if (typeof p.snap === 'boolean') s.setSnap(p.snap)
  if (typeof p.gridSize === 'number' && p.gridSize > 0) s.setGridSize(p.gridSize)
  if (p.planLabels === 'name' || p.planLabels === 'patch' || p.planLabels === 'none') s.setPlanLabels(p.planLabels)
}

let prefsTimer: ReturnType<typeof setTimeout> | null = null

function followPrefs(): void {
  let last = JSON.stringify(currentPrefs())
  usePrefs.subscribe(() => {
    const next = JSON.stringify(currentPrefs())
    if (next === last) return
    last = next
    if (prefsTimer) clearTimeout(prefsTimer)
    prefsTimer = setTimeout(() => {
      void call('/api/profile', { method: 'PUT', body: JSON.stringify({ prefs: currentPrefs() }) }).catch(() => undefined)
    }, 1500)
  })
}

// --- Shows --------------------------------------------------------------------------------

export function listShows(): Promise<CloudShow[]> {
  return call<{ shows: CloudShow[] }>('/api/shows').then((r) => r.shows)
}

function showBody(project: Project) {
  return { format: FORMAT, version: 1, savedAt: new Date().toISOString(), project }
}

/** Save the open show to the account: over its linked copy, or as a new one. */
export async function saveToAccount(asNew = false): Promise<boolean> {
  const { status, linkedId } = useAccount.getState()
  if (status !== 'signed-in') return false
  const project = useStore.getState().project
  useAccount.setState({ saving: true })
  try {
    let id = asNew ? null : linkedId
    let savedAt: string
    if (id) {
      const r = await call<{ updated_at: string }>(`/api/shows/${id}`, { method: 'PUT', body: JSON.stringify({ name: project.name, data: showBody(project) }) })
      savedAt = r.updated_at
    } else {
      const r = await call<{ id: string; updated_at: string }>('/api/shows', { method: 'POST', body: JSON.stringify({ name: project.name, data: showBody(project) }) })
      id = r.id
      savedAt = r.updated_at
    }
    useDocument.getState().setSaved(linkedPath(project.name), project)
    useAccount.setState({ linkedId: id, savedAt, saving: false })
    saveLink()
    return true
  } catch (error) {
    useAccount.setState({ saving: false })
    notify('error', `Couldn't save to your account: ${(error as Error).message}`)
    return false
  }
}

export async function openFromAccount(id: string): Promise<void> {
  try {
    await flushAutosave()
    const show = await call<{ id: string; name: string; updated_at: string; data: { format?: string; project?: Project } }>(`/api/shows/${id}`)
    const project = show.data?.project
    if (!project?.fixtures) throw new Error(`“${show.name}” isn't a Sound Visualizer show.`)
    loadDocument(linkedPath(show.name), project)
    useAccount.setState({ linkedId: show.id, savedAt: show.updated_at, showsOpen: false })
  } catch (error) {
    notify('error', `Couldn't open that show: ${(error as Error).message}`)
  }
}

export async function deleteFromAccount(id: string): Promise<void> {
  await call(`/api/shows/${id}`, { method: 'DELETE' })
  if (useAccount.getState().linkedId === id) {
    useAccount.setState({ linkedId: null, savedAt: null })
    useDocument.getState().setSaved(null, null)
  }
}

export async function renameInAccount(id: string, name: string): Promise<void> {
  await call(`/api/shows/${id}`, { method: 'PUT', body: JSON.stringify({ name }) })
}

/** Save (⌘S) on a linked show saves it to the account. */
export function isLinked(): boolean {
  const { status, linkedId } = useAccount.getState()
  return status === 'signed-in' && !!linkedId
}

// --- Saving by itself -------------------------------------------------------------------

let autosaveTimer: ReturnType<typeof setTimeout> | null = null

async function flushAutosave(): Promise<void> {
  if (!autosaveTimer) return
  clearTimeout(autosaveTimer)
  autosaveTimer = null
  if (isLinked() && useDocument.getState().saved !== useStore.getState().project) await saveToAccount()
}

function followDocument(): void {
  accountSave.linked = isLinked
  accountSave.save = () => saveToAccount()
  useAccount.subscribe((s, prev) => {
    if (s.linkedId !== prev.linkedId) saveLink()
  })
  // Another show (a file, a template, New show): this one isn't the account's any more.
  useDocument.subscribe((s) => {
    const { linkedId } = useAccount.getState()
    if (linkedId && !(s.path ?? '').endsWith(' (in your account)')) useAccount.setState({ linkedId: null, savedAt: null })
  })
  // Changes to a linked show are saved a few seconds after the last one.
  useStore.subscribe((s, prev) => {
    if (s.project === prev.project || !isLinked()) return
    if (useDocument.getState().saved === s.project) return
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null
      if (isLinked() && useDocument.getState().saved !== useStore.getState().project) void saveToAccount()
    }, AUTOSAVE_MS)
  })
  window.addEventListener('beforeunload', (e) => {
    if (autosaveTimer && isLinked()) {
      // A save is waiting: ask the browser to hold on (it shows its own "leave site?" prompt).
      void flushAutosave()
      e.preventDefault()
    }
  })
}
