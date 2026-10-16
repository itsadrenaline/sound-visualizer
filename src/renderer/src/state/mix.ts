/**
 * Mute, solo and hide: quick, temporary switches while you focus on part of the rig.
 * Not part of undo (like a mixing desk's mute buttons), but remembered between runs.
 *
 * - Muted: the fixture does nothing (no light, no movement).
 * - Solo: if any fixture is soloed, only soloed fixtures do anything.
 * - Hidden: not drawn at all.
 */
import { create } from 'zustand'

const KEY = 'soundswitch-visualizer:mix'

interface Mix {
  muted: string[]
  solo: string[]
  hidden: string[]
  toggle(list: 'muted' | 'solo' | 'hidden', ids: string[]): void
  clear(list: 'muted' | 'solo' | 'hidden'): void
  /** Turn it on for these fixtures (whatever they had before). */
  add(list: 'muted' | 'solo' | 'hidden', ids: string[]): void
  /** Should this fixture produce light and movement right now? */
  isLive(id: string): boolean
}

function load(): Pick<Mix, 'muted' | 'solo' | 'hidden'> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { muted: saved.muted ?? [], solo: saved.solo ?? [], hidden: saved.hidden ?? [] }
  } catch {
    return { muted: [], solo: [], hidden: [] }
  }
}

export const useMix = create<Mix>((set, get) => ({
  ...load(),
  toggle(list, ids) {
    const current = new Set(get()[list])
    // If every chosen fixture already has it, turn it off for all; otherwise turn it on for all.
    const allOn = ids.every((id) => current.has(id))
    for (const id of ids) {
      if (allOn) current.delete(id)
      else current.add(id)
    }
    set({ [list]: [...current] } as Partial<Mix>)
  },
  clear(list) {
    set({ [list]: [] } as Partial<Mix>)
  },
  add(list, ids) {
    set({ [list]: [...new Set([...get()[list], ...ids])] } as Partial<Mix>)
  },
  isLive(id) {
    const { muted, solo } = get()
    if (muted.includes(id)) return false
    return solo.length === 0 || solo.includes(id)
  }
}))

useMix.subscribe((state) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ muted: state.muted, solo: state.solo, hidden: state.hidden }))
  } catch {
    // Not fatal.
  }
})
