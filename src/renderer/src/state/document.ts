/**
 * The project as a file: where it's saved and whether it has unsaved changes.
 *
 * The app also keeps the current project in local storage after every change,
 * so quitting or a crash never loses work; saving to a file is for keeping
 * versions, backing up and moving shows between computers.
 */
import { create } from 'zustand'
import { useStore } from './store'
import { registerFixtureTypes, setTypeOverrides } from '../model/fixtureTypes'
import { defaultProject, type Project } from '../model/project'
import { notify } from './notices'
import { view } from './viewBus'

const PATH_KEY = 'soundswitch-visualizer:path'

interface DocumentState {
  /** The .ssvis file this project was opened from or saved to. */
  path: string | null
  /** The project as last saved; anything else means there are unsaved changes. */
  saved: Project | null
  setSaved(path: string | null, project: Project | null): void
}

function loadPath(): string | null {
  try {
    return localStorage.getItem(PATH_KEY)
  } catch {
    return null
  }
}

export const useDocument = create<DocumentState>((set) => ({
  path: loadPath(),
  // What's restored on launch counts as "unchanged": local storage always holds the latest.
  saved: useStore.getState().project,
  setSaved(path, project) {
    try {
      if (path) localStorage.setItem(PATH_KEY, path)
      else localStorage.removeItem(PATH_KEY)
    } catch {
      // Remembering the path is a convenience only.
    }
    set({ path, saved: project })
  }
}))

export function isEdited(): boolean {
  const { saved } = useDocument.getState()
  return saved !== useStore.getState().project
}

function updateTitle(): void {
  const { path, saved } = useDocument.getState()
  const project = useStore.getState().project
  if (typeof window !== 'undefined') window.api?.setTitle(project.name, path, saved !== project)
}

export async function saveDocument(saveAs = false): Promise<boolean> {
  if (!window.api) return false
  const project = useStore.getState().project
  try {
    const path = await window.api.saveProject(JSON.stringify(project), useDocument.getState().path, saveAs, project.name)
    if (!path) return false
    useDocument.getState().setSaved(path, project)
    notify('info', `Saved ${path.split('/').pop()}`)
    return true
  } catch (error) {
    notify('error', `Couldn't save: ${(error as Error).message}`)
    window.api.log('error', 'Save failed', String(error))
    return false
  }
}

/** Replace the project with one from a file (undoable, like everything else). */
export function loadDocument(path: string, project: Project): void {
  registerFixtureTypes(project.fixtureTypes)
  setTypeOverrides(project.typeOverrides)
  useStore.getState().apply(`Open ${path.split('/').pop()}`, () => project)
  useStore.getState().select([])
  useDocument.getState().setSaved(path, useStore.getState().project)
  // A different show: start from the usual view of it.
  setTimeout(() => view.home(), 30)
}

export async function openDocument(): Promise<void> {
  if (!window.api) return
  const result = await window.api.openProject()
  if (!result) return
  if ('error' in result) return notify('error', result.error)
  loadDocument(result.path, result.project as Project)
}

export function newDocument(): void {
  useStore.getState().apply('New project', () => defaultProject())
  useStore.getState().select([])
  useDocument.getState().setSaved(null, null)
}

// Keep the window title (and the macOS "edited" dot) up to date.
useStore.subscribe((s, prev) => {
  if (s.project !== prev.project) updateTitle()
})
useDocument.subscribe(updateTitle)
