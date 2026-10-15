/**
 * App state with undo/redo.
 *
 * Every change to the project goes through `apply(label, change)`: one named,
 * undoable step. Buttons, menus and shortcuts all call the same commands in
 * commands.ts, so there's one way to change anything. (Capture's UserAction.)
 */
import { create } from 'zustand'
import { blankProject, type Project } from '../model/project'
import { registerFixtureTypes, setTypeOverrides } from '../model/fixtureTypes'
import { settle } from '../model/physics'

const STORAGE_KEY = 'lighting-visualizer:project'
const HISTORY_LIMIT = 200

interface HistoryEntry {
  label: string
  project: Project
}

export interface AppState {
  project: Project
  selection: string[]
  past: HistoryEntry[]
  future: HistoryEntry[]
  /**
   * `merge`: if the last step had the same label and was moments ago, fold this
   * change into it (dragging a slider is one undo step, not a hundred).
   */
  apply(label: string, change: (project: Project) => Project, options?: { merge?: boolean }): void
  undo(): void
  redo(): void
  select(ids: string[]): void
  /**
   * Start a batch: everything changed until `endBatch` becomes one undo step.
   * Works across awaits (the show builder talks to Claude between changes).
   */
  beginBatch(): BatchMark
  endBatch(mark: BatchMark, label: string): void
}

export interface BatchMark {
  project: Project
  past: HistoryEntry[]
}

function loadProject(): Project {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const project = JSON.parse(saved) as Project
      registerFixtureTypes(project.fixtureTypes)
      setTypeOverrides(project.typeOverrides)
      return settle(project)
    }
  } catch {
    // Storage can be unavailable or hold an old format; start with an empty room.
  }
  return settle(blankProject())
}

let lastStep = { label: '', at: 0 }

export const useStore = create<AppState>((set, get) => ({
  project: settle(loadProject()),
  selection: [],
  past: [],
  future: [],

  apply(label, change, options) {
    const before = get().project
    const changed = change(before)
    if (changed === before) return
    registerFixtureTypes(changed.fixtureTypes)
    setTypeOverrides(changed.typeOverrides)
    // Physics: everything rests on something, attached fixtures follow their structure.
    const after = settle(changed, before)
    const now = Date.now()
    const merge = options?.merge && lastStep.label === label && now - lastStep.at < 1500 && get().past.length > 0
    lastStep = { label, at: now }
    if (merge) {
      set({ project: after, future: [] })
      return
    }
    set({
      project: after,
      past: [...get().past, { label, project: before }].slice(-HISTORY_LIMIT),
      future: []
    })
  },

  undo() {
    const { past, future, project } = get()
    const last = past.at(-1)
    if (!last) return
    setTypeOverrides(last.project.typeOverrides)
    set({ project: last.project, past: past.slice(0, -1), future: [{ label: last.label, project }, ...future] })
  },

  redo() {
    const { past, future, project } = get()
    const next = future[0]
    if (!next) return
    setTypeOverrides(next.project.typeOverrides)
    set({ project: next.project, future: future.slice(1), past: [...past, { label: next.label, project }] })
  },

  select(ids) {
    set({ selection: ids })
  },

  beginBatch() {
    return { project: get().project, past: get().past }
  },

  endBatch(mark, label) {
    if (get().project === mark.project) return
    set({ past: [...mark.past, { label, project: mark.project }].slice(-HISTORY_LIMIT), future: [] })
    lastStep = { label: '', at: 0 }
  }
}))

// Save the project automatically whenever it changes.
useStore.subscribe((state, previous) => {
  if (state.project === previous.project) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project))
  } catch {
    // Not fatal: the app still works, it just won't remember the project.
  }
})
