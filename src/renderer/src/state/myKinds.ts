/**
 * Your own kinds of light: any fixture in the Studio can be saved as a kind
 * (an LED-lit stand, a string of bulbs, a light no built-in kind fits), so it
 * shows up next to the built-in kinds as a starting point for the next one.
 *
 * Each kind keeps a copy of the fixture as a template: its parts, channels,
 * modes and look. Starting from it gives a fresh fixture with its own id.
 * Kept on this Mac (the app's local storage), not in shows.
 */
import { create } from 'zustand'
import { newKey, normaliseDef, type FixtureDef } from '../model/fixtureDef'

export interface MyKind {
  id: string
  label: string
  /** What it is, in a sentence: shown as its tooltip and under its name. */
  explain: string
  template: FixtureDef
  created: string
}

const KEY = 'sv.myKinds.v1'

function load(): MyKind[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as MyKind[]
    return Array.isArray(raw) ? raw.filter((k) => k && k.id && k.template).map((k) => ({ ...k, template: normaliseDef(k.template) })) : []
  } catch {
    return []
  }
}

function persist(list: MyKind[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage full or unavailable: the kinds still work until the app closes.
  }
}

interface MyKindsState {
  kinds: MyKind[]
  /** Save a fixture as a new kind (or replace the one with the same name). Returns its id. */
  save: (def: FixtureDef, label: string, explain: string) => string
  remove: (id: string) => void
}

export const useMyKinds = create<MyKindsState>((set, get) => ({
  kinds: typeof localStorage === 'undefined' ? [] : load(),
  save: (def, label, explain) => {
    const name = label.trim() || def.name || 'My kind of light'
    const existing = get().kinds.find((k) => k.label.toLowerCase() === name.toLowerCase())
    const template: FixtureDef = JSON.parse(JSON.stringify({ ...def, history: [], revision: 0 }))
    const kind: MyKind = { id: existing?.id ?? newKey('kind'), label: name, explain: explain.trim(), template, created: new Date().toISOString() }
    const kinds = existing ? get().kinds.map((k) => (k.id === existing.id ? kind : k)) : [...get().kinds, kind]
    persist(kinds)
    set({ kinds })
    return kind.id
  },
  remove: (id) => {
    const kinds = get().kinds.filter((k) => k.id !== id)
    persist(kinds)
    set({ kinds })
  }
}))

/** A new fixture to edit, from one of your kinds. */
export function startFromMyKind(kind: MyKind, name = 'New fixture', maker = 'Generic'): FixtureDef {
  const copy: FixtureDef = JSON.parse(JSON.stringify(kind.template))
  return {
    ...copy,
    id: newKey('fx'),
    name,
    manufacturer: maker,
    revision: 0,
    history: [],
    source: { kind: 'template', label: `${kind.label} (your kind of light)` }
  }
}

/** Channel count of a kind's first mode, for its button. */
export function myKindChannels(kind: MyKind): number {
  return kind.template.modes[0]?.channels.length ?? 0
}
