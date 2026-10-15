/**
 * Fixture Studio's state: the fixture being made or edited, its own undo, the
 * selection, and what drives the twin (the channel sliders, a running test, or
 * live Art-Net from SoundSwitch).
 *
 * The Studio edits a copy. Saving puts it in My Fixtures and, when it was opened
 * from a fixture in the show (or the show uses it), updates the show in one undo
 * step there; "Back to the original" removes the edit from the show.
 */
import { create } from 'zustand'
import { blankDef, defaultRanges, defFromTypes, FN, makeChannel, studioTypeId, typeFromDef, newKey, type ChannelDef, type ChannelFn, type FixtureDef, type FixtureKind, type PartDef } from '../model/fixtureDef'
import { checkDef } from '../model/fixtureChecks'
import { restValue } from '../model/fixtureTests'
import { getFixtureType, originalFixtureType, type FixtureType } from '../model/fixtureTypes'
import { useStore } from './store'
import { useLibrary } from './library'
import { notify } from './notices'
import { addLibraryFixtures } from './commands'

export type StudioScreen = 'start' | 'edit'
export type RightTab = 'channel' | 'look' | 'tests' | 'problems' | 'learn'

export interface Driving {
  /** A test scene running, and when it started (performance.now() seconds). */
  scene: { id: string; startedAt: number } | null
  /** Live Art-Net for a fixture in the show (its universe and address). */
  follow: { universe: number; address: number; name: string } | null
}

interface StudioState {
  open: boolean
  screen: StudioScreen
  def: FixtureDef | null
  modeIndex: number
  selected: string[]
  /** The cell (part) clicked in the schematic. */
  selectedPart: string | null
  rightTab: RightTab
  past: FixtureDef[]
  future: FixtureDef[]
  dirty: boolean
  /** The slider levels for the current mode. */
  levels: number[]
  driving: Driving
  /** Hovering a channel (or a value on its bar) previews it on the twin. */
  preview: { channel: number; value: number } | null
  /** What the last import or reading found. */
  report: string[]
  /** Where it was opened from: the show's fixture type ids it stands in for. */
  origin: { typeIds: string[] } | null
  verdicts: Record<string, 'ok' | 'off'>

  start(): void
  openDef(def: FixtureDef, report?: string[], origin?: StudioState['origin']): void
  openType(type: FixtureType): void
  close(force?: boolean): void
  edit(change: (d: FixtureDef) => FixtureDef): void
  undo(): void
  redo(): void
  setMode(i: number): void
  select(ids: string[], part?: string | null): void
  setRightTab(t: RightTab): void
  setLevel(index: number, value: number): void
  resetLevels(): void
  setPreview(p: StudioState['preview']): void
  runScene(id: string | null): void
  setFollow(f: Driving['follow']): void
  setVerdict(sceneId: string, v: 'ok' | 'off'): void
  save(options?: { addToShow?: number }): Promise<boolean>
  backToOriginal(): void
}

const COLOUR_ON = new Set<ChannelFn>(['red', 'green', 'blue', 'white', 'warmWhite', 'coolWhite'])

/** Where the sliders start: resting values, with the light on in white so the twin shows something straight away. */
function levelsFor(def: FixtureDef | null, modeIndex: number): number[] {
  return def?.modes[modeIndex]?.channels.map((c) => (COLOUR_ON.has(c.fn) && !c.fine ? 255 : restValue(c))) ?? []
}

export const useStudio = create<StudioState>((set, get) => ({
  open: false,
  screen: 'start',
  def: null,
  modeIndex: 0,
  selected: [],
  selectedPart: null,
  rightTab: 'channel',
  past: [],
  future: [],
  dirty: false,
  levels: [],
  driving: { scene: null, follow: null },
  preview: null,
  report: [],
  origin: null,
  verdicts: {},

  start() {
    set({ open: true, screen: 'start' })
  },

  openDef(def, report = [], origin = null) {
    const modeIndex = Math.max(0, def.modes.length - 1 >= 0 ? def.modes.reduce((best, m, i) => (m.channels.length > def.modes[best].channels.length ? i : best), 0) : 0)
    set({
      open: true, screen: 'edit', def, modeIndex, selected: [], selectedPart: null, past: [], future: [],
      // A fixture made just now (from a manual, a file, a type) would be lost on closing; one opened from the Library or the show wouldn't.
      dirty: def.revision === 0 && !['library', 'soundswitch'].includes(def.source.kind),
      levels: levelsFor(def, modeIndex), driving: { scene: null, follow: null }, preview: null, report, origin, verdicts: {},
      rightTab: report.length || checkDef(def, modeIndex).some((p) => p.level !== 'info') ? 'problems' : 'learn'
    })
  },

  openType(type) {
    const original = originalFixtureType(type.id)
    const shown = getFixtureType(type.id)
    // An edited fixture opens its edit; anything else is converted.
    const mine = useLibrary.getState().mine.find((d) => d.id === shown.studioId)
    if (mine) {
      get().openDef(structuredClone(mine), [], { typeIds: [type.id] })
      return
    }
    const def = defFromTypes([original], {
      name: original.name.replace(/\s*\([^()]*(\([^()]*\))?[^()]*\)\s*$/, ''),
      manufacturer: original.manufacturer || 'Unknown',
      source: { kind: original.source === 'SoundSwitch' ? 'soundswitch' : 'library', label: original.source ?? 'This show' }
    })
    const report = original.lookGuessed ? ['Its look was worked out from its channels: choose its real shape and size under Look.'] : []
    get().openDef(def, report, { typeIds: [type.id] })
  },

  close(force = false) {
    if (!force && get().dirty && get().screen === 'edit' && !confirm('Close Fixture Studio without saving this fixture?')) return
    set({ open: false, driving: { scene: null, follow: null }, preview: null })
  },

  edit(change) {
    const { def, past } = get()
    if (!def) return
    const next = change(def)
    if (next === def) return
    const modeIndex = Math.min(get().modeIndex, Math.max(0, next.modes.length - 1))
    const levels = next.modes[modeIndex]?.channels.length === get().levels.length ? get().levels : levelsFor(next, modeIndex)
    set({ def: next, past: [...past.slice(-100), def], future: [], dirty: true, modeIndex, levels })
  },

  undo() {
    const { past, def, future } = get()
    if (!past.length || !def) return
    const prev = past[past.length - 1]
    set({ def: prev, past: past.slice(0, -1), future: [def, ...future], dirty: true, levels: levelsFor(prev, Math.min(get().modeIndex, prev.modes.length - 1)) })
  },

  redo() {
    const { past, def, future } = get()
    if (!future.length || !def) return
    const next = future[0]
    set({ def: next, past: [...past, def], future: future.slice(1), dirty: true, levels: levelsFor(next, Math.min(get().modeIndex, next.modes.length - 1)) })
  },

  setMode(i) {
    set({ modeIndex: i, selected: [], levels: levelsFor(get().def, i), driving: { ...get().driving, scene: null } })
  },

  select(ids, part = null) {
    set({ selected: ids, selectedPart: part, rightTab: ids.length ? 'channel' : get().rightTab })
  },

  setRightTab(t) {
    set({ rightTab: t })
  },

  setLevel(index, value) {
    const levels = get().levels.slice()
    levels[index] = Math.max(0, Math.min(255, Math.round(value)))
    set({ levels, driving: { ...get().driving, scene: null } })
  },

  resetLevels() {
    set({ levels: levelsFor(get().def, get().modeIndex), driving: { scene: null, follow: null } })
  },

  setPreview(p) {
    set({ preview: p })
  },

  runScene(id) {
    set({ driving: { follow: null, scene: id ? { id, startedAt: performance.now() / 1000 } : null }, rightTab: 'tests' })
  },

  setFollow(f) {
    set({ driving: { scene: null, follow: f } })
  },

  setVerdict(sceneId, v) {
    const { def, modeIndex } = get()
    set({ verdicts: { ...get().verdicts, [sceneId]: v } })
    // "Looks right" turns the guessed channels it exercised into checked ones.
    if (v === 'ok' && def) {
      const mode = def.modes[modeIndex]
      const used = new Set<ChannelFn>(sceneFns(sceneId))
      get().edit((d) => ({
        ...d,
        modes: d.modes.map((m) => (m.id !== mode.id ? m : { ...m, channels: m.channels.map((c) => (c.confidence === 'guessed' && (used.size === 0 || used.has(c.fn)) ? { ...c, confidence: 'checked' as const } : c)) }))
      }))
    }
  },

  async save(options = {}) {
    const { def, origin } = get()
    if (!def) return false
    const problems = checkDef(def, get().modeIndex).filter((p) => p.level === 'error')
    if (problems.length && typeof confirm === 'function' && !confirm(`${problems.length} problem${problems.length === 1 ? '' : 's'} still to fix (${problems[0].text}). Save anyway?`)) return false
    const saved: FixtureDef = { ...def, revision: def.revision + 1, history: [...def.history, { revision: def.revision + 1, date: new Date().toISOString(), note: def.revision === 0 ? 'Created' : 'Edited' }].slice(-50) }
    if (typeof window !== 'undefined' && window.api) {
      const r = await window.api.saveMyFixture(saved)
      if ('error' in r) {
        notify('error', `Couldn’t save the fixture: ${r.error}`)
        return false
      }
      await useLibrary.getState().loadMine()
    }
    set({ def: saved, dirty: false })
    applyToShow(saved, origin?.typeIds ?? [])
    if (options.addToShow) addLibraryFixtures(typeFromDef(saved, get().modeIndex), options.addToShow)
    notify('info', `Saved “${saved.name}” to My Fixtures (version ${saved.revision}).`)
    return true
  },

  backToOriginal() {
    const { origin } = get()
    if (!origin?.typeIds.length) return
    useStore.getState().apply('Back to the original fixture', (p) => {
      const overrides = { ...(p.typeOverrides ?? {}) }
      for (const id of origin.typeIds) delete overrides[id]
      return { ...p, typeOverrides: overrides }
    })
    notify('info', 'The show uses the original fixture again. Your edited version stays in My Fixtures.')
    set({ open: false })
  }
}))

/** The channel jobs a test exercises (to mark guessed rows as checked). */
function sceneFns(sceneId: string): ChannelFn[] {
  const id = sceneId.replace(/-.*/, '')
  const map: Record<string, ChannelFn[]> = {
    dim: ['dimmer'], colours: ['red', 'green', 'blue', 'white', 'warmWhite', 'coolWhite', 'amber', 'uv', 'lime'], mix: ['red', 'green', 'blue'],
    chase: ['red', 'green', 'blue', 'white', 'warmWhite', 'coolWhite'], percell: ['red', 'green', 'blue', 'white', 'warmWhite'], rainbowcells: ['red', 'green', 'blue'],
    master: ['dimmer'], strobe: ['shutter'], move: ['pan', 'tilt'], zoom: ['zoom'], gobo: ['gobo'], gspin: ['goboRotation'], prism: ['prism', 'prismRotation'],
    prog: ['program'], laser: ['laser'], rot: ['rotation'], wheel: ['colorWheel', 'colorMacro'], identify: []
  }
  return map[id] ?? []
}

/** Put the saved fixture into the show: as a stand-in for the types it was opened from, and updating any copies already in the show. */
function applyToShow(def: FixtureDef, typeIds: string[]): void {
  const project = useStore.getState().project
  const studioIds = new Set(def.modes.map((m) => studioTypeId(def, m)))
  const inShowStudio = (project.fixtureTypes ?? []).filter((t) => studioIds.has(t.id))
  const overrideIds = typeIds.filter((id) => project.fixtures.some((f) => f.typeId === id))
  if (!inShowStudio.length && !overrideIds.length) return
  useStore.getState().apply(`Update fixture “${def.name}”`, (p) => {
    const overrides = { ...(p.typeOverrides ?? {}) }
    for (const id of overrideIds) {
      const original = originalFixtureType(id)
      // The mode with the same channel count as the show's fixture (or the first).
      const mi = Math.max(0, def.modes.findIndex((m) => m.channels.length === original.channels.length))
      overrides[id] = typeFromDef(def, mi)
    }
    const types = (p.fixtureTypes ?? []).map((t) => {
      if (!studioIds.has(t.id)) return t
      const mi = def.modes.findIndex((m) => studioTypeId(def, m) === t.id)
      return mi >= 0 ? typeFromDef(def, mi) : t
    })
    return { ...p, fixtureTypes: types, typeOverrides: overrides }
  })
}

// ---------------------------------------------------------------------------
// Edits used by several panels (batch edits work on the selection)
// ---------------------------------------------------------------------------

export function editChannels(ids: string[], change: (c: ChannelDef) => ChannelDef): void {
  const { modeIndex } = useStudio.getState()
  useStudio.getState().edit((d) => ({ ...d, modes: d.modes.map((m, i) => (i !== modeIndex ? m : { ...m, channels: m.channels.map((c) => (ids.includes(c.id) ? change(c) : c)) })) }))
}

export function setChannelFn(ids: string[], fn: ChannelFn): void {
  editChannels(ids, (c) => ({ ...c, fn, name: c.name === FN[c.fn].label || /^Channel \d+$/.test(c.name) ? FN[fn].label : c.name, ranges: FN[fn].style === FN[c.fn].style && c.ranges.length ? c.ranges : defaultRanges(fn), confidence: c.confidence === 'missing' ? 'guessed' : c.confidence }))
}

export function addChannels(fns: ChannelFn[], part: string | null = null, after?: string): void {
  const { modeIndex } = useStudio.getState()
  const added = fns.map((fn) => makeChannel(fn, part))
  useStudio.getState().edit((d) => {
    if (!d.modes.length) return { ...d, modes: [{ id: newKey('m'), name: `${added.length}-channel`, channels: added }] }
    return {
      ...d,
      modes: d.modes.map((m, i) => {
        if (i !== modeIndex) return m
        const at = after ? m.channels.findIndex((c) => c.id === after) + 1 : m.channels.length
        const channels = [...m.channels.slice(0, at), ...added, ...m.channels.slice(at)]
        return { ...m, channels }
      })
    }
  })
  useStudio.getState().select(added.map((c) => c.id))
}

export function deleteChannels(ids: string[]): void {
  const { modeIndex } = useStudio.getState()
  useStudio.getState().edit((d) => ({ ...d, modes: d.modes.map((m, i) => (i !== modeIndex ? m : { ...m, channels: m.channels.filter((c) => !ids.includes(c.id)) })) }))
  useStudio.getState().select([])
}

export function moveChannels(ids: string[], by: number): void {
  const { modeIndex } = useStudio.getState()
  useStudio.getState().edit((d) => ({
    ...d,
    modes: d.modes.map((m, i) => {
      if (i !== modeIndex) return m
      const list = m.channels.slice()
      const order = by < 0 ? list.map((_, k) => k) : list.map((_, k) => list.length - 1 - k)
      for (const k of order) {
        if (!ids.includes(list[k].id)) continue
        const j = k + by
        if (j < 0 || j >= list.length || ids.includes(list[j].id)) continue
        ;[list[k], list[j]] = [list[j], list[k]]
      }
      return { ...m, channels: list }
    })
  }))
}

/**
 * Repeat the selected channels once per cell: "red, green, blue" for cell 1
 * becomes red, green, blue for cells 1 to N, each set driving its own cell.
 */
export function repeatForCells(ids: string[], cells: number): void {
  const { modeIndex } = useStudio.getState()
  useStudio.getState().edit((d) => {
    const mode = d.modes[modeIndex]
    const unit = mode.channels.filter((c) => ids.includes(c.id))
    if (!unit.length) return d
    const parts: PartDef[] = [...d.parts]
    const cellPart = (k: number): string => {
      let p = parts.find((x) => x.cell === k && x.role === 'pixel')
      if (!p) {
        p = { id: newKey('p'), name: `Cell ${k + 1}`, role: 'pixel', cell: k }
        parts.push(p)
      }
      return p.id
    }
    const first = unit.map((c) => ({ ...c, part: cellPart(0) }))
    const more = Array.from({ length: Math.max(0, cells - 1) }, (_, k) => unit.map((c) => ({ ...c, id: newKey('c'), part: cellPart(k + 1), confidence: c.confidence === 'sure' ? 'guessed' as const : c.confidence })))
    const at = mode.channels.findIndex((c) => c.id === unit[unit.length - 1].id) + 1
    const rest = mode.channels.filter((c) => !ids.includes(c.id))
    const before = rest.filter((c) => mode.channels.indexOf(c) < at)
    const after = rest.filter((c) => mode.channels.indexOf(c) >= at)
    const channels = [...before, ...first, ...more.flat(), ...after]
    return { ...d, parts, modes: d.modes.map((m, i) => (i === modeIndex ? { ...m, channels, name: m.name.replace(/^\d+(?=-channel)/, String(channels.length)) } : m)) }
  })
}

/** Set how many cells the fixture has: adds or removes cells, copying the first cell's channels. */
export function setCellCount(n: number): void {
  const { def, modeIndex } = useStudio.getState()
  if (!def) return
  const mode = def.modes[modeIndex]
  const cells = def.parts.filter((p) => p.role === 'pixel').sort((a, b) => (a.cell ?? 0) - (b.cell ?? 0))
  const cellIds = [...new Set(cells.map((p) => p.cell ?? 0))].sort((a, b) => a - b)
  if (n === cellIds.length || n < 1 || n > 512) return
  if (n < cellIds.length) {
    const keep = new Set(cellIds.slice(0, n))
    const drop = new Set(cells.filter((p) => !keep.has(p.cell ?? 0)).map((p) => p.id))
    useStudio.getState().edit((d) => ({ ...d, parts: d.parts.filter((p) => !drop.has(p.id)), modes: d.modes.map((m) => ({ ...m, channels: m.channels.filter((c) => !c.part || !drop.has(c.part)) })) }))
    return
  }
  const firstCell = cellIds[0]
  const unit = firstCell === undefined ? [] : mode.channels.filter((c) => cells.some((p) => p.id === c.part && p.cell === firstCell))
  if (!unit.length) {
    // No cells yet: make the fixture's colour channels into cell 1, then repeat.
    const colour = mode.channels.filter((c) => FN[c.fn].group === 'Colour' && !c.part)
    if (!colour.length) {
      notify('info', 'Add the colour channels for one cell first (e.g. Red, Green, Blue), then set the number of cells.')
      return
    }
    repeatForCells(colour.map((c) => c.id), n)
    return
  }
  repeatForCells(unit.map((c) => c.id), n)
}

/** A fresh fixture of a kind. */
export function newFromKind(kind: FixtureKind, name?: string, manufacturer?: string): void {
  useStudio.getState().openDef(blankDef(kind, name || 'New fixture', manufacturer || 'Generic'), [])
}
