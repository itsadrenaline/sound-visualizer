/**
 * The fixture library in the page: the Open Fixture Library and the QLC+ library
 * (both bundled), plus My Fixtures (made or edited in Fixture Studio). Loaded
 * once, searched here. Converting a fixture to one of our types only happens when
 * you pick it; QLC+ definitions are fetched one at a time from the main process.
 */
import { create } from 'zustand'
import { fixtureTypeFromOfl, libraryIndex, type LibraryEntry, type OflLibrary } from '../model/oflImport'
import type { FixtureType } from '../model/fixtureTypes'
import { typeFromDef, type FixtureDef } from '../model/fixtureDef'
import { expandDef } from '../model/qxf'
import { defFromOfl } from '../model/fixtureFiles'
import { notify } from './notices'

const RECENT_KEY = 'soundswitch-visualizer:library-recent'
const RECENT_MAX = 12

/** The library browser's categories, built from OFL's categories. */
export const CATEGORIES: Array<{ id: string; label: string; match: (c: string[]) => boolean }> = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'moving', label: 'Moving heads', match: (c) => c.includes('Moving Head') || c.includes('Scanner') || c.includes('Barrel Scanner') },
  { id: 'wash', label: 'Pars & washes', match: (c) => (c.includes('Color Changer') || c.includes('Dimmer')) && !c.includes('Moving Head') && !c.includes('Pixel Bar') },
  { id: 'pixel', label: 'Bars & pixels', match: (c) => c.includes('Pixel Bar') || c.includes('Matrix') },
  { id: 'strobe', label: 'Strobes & blinders', match: (c) => c.includes('Strobe') || c.includes('Blinder') },
  { id: 'effect', label: 'Effects & lasers', match: (c) => c.includes('Effect') || c.includes('Flower') || c.includes('Laser') },
  { id: 'atmos', label: 'Smoke & haze', match: (c) => c.includes('Smoke') || c.includes('Hazer') || c.includes('Fan') }
]

const KIND_CATEGORY: Record<FixtureDef['kind'], string[]> = {
  par: ['Color Changer'], uplight: ['Color Changer'], wash: ['Moving Head'], spot: ['Moving Head'], beam: ['Moving Head'], bar: ['Pixel Bar'],
  tube: ['Pixel Bar'], panel: ['Matrix'], cluster: ['Color Changer', 'Blinder'], gigbar: ['Effect'], strip: ['Color Changer'], strobe: ['Strobe'], laser: ['Laser'], effect: ['Effect'],
  fog: ['Smoke'], sfx: ['Other'], dimmer: ['Dimmer'], string: ['Pixel Bar'], acrylic: ['Color Changer'], other: ['Other']
}

export function entryForDef(def: FixtureDef): LibraryEntry {
  return {
    key: `mine/${def.id}`,
    manufacturer: def.manufacturer,
    name: def.name,
    categories: KIND_CATEGORY[def.kind] ?? [],
    modes: def.modes.map((m) => ({ name: m.name, channels: m.channels.length })),
    size: def.look.size,
    source: 'mine'
  }
}

interface LibraryState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
  library: OflLibrary | null
  entries: LibraryEntry[]
  qlcCredit: string | null
  /** Fixture Studio definitions: My Fixtures, and QLC+ fixtures fetched so far. */
  defs: Record<string, FixtureDef>
  mine: FixtureDef[]
  recent: string[]
  load(force?: boolean): Promise<void>
  loadMine(): Promise<void>
  /** Make sure a fixture's definition is here (QLC+ ones are fetched); returns it. */
  loadDef(key: string): Promise<FixtureDef | null>
  /** The Fixture Studio definition of any library fixture. */
  defFor(key: string): Promise<FixtureDef | null>
  /** Our fixture type for a library fixture and mode. Remembers it as recently used. */
  typeFor(key: string, modeIndex: number): FixtureType | null
  importFiles(): Promise<void>
}

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

export const useLibrary = create<LibraryState>((set, get) => ({
  status: 'idle',
  library: null,
  entries: [],
  qlcCredit: null,
  defs: {},
  mine: [],
  recent: loadRecent(),

  async load(force = false) {
    if (!force && (get().status === 'loading' || get().status === 'ready')) return
    set({ status: 'loading' })
    try {
      // In the app the main process reads it from disk; in a plain browser (previews, tests) it's fetched.
      const library = (window.api ? await window.api.loadLibrary() : await (await fetch('library/ofl.json')).json()) as OflLibrary
      const ofl = libraryIndex(library).map((e) => ({ ...e, source: 'ofl' as const }))
      const qlc = window.api ? await window.api.loadQlcLibrary() : null
      const qlcEntries = ((qlc?.entries ?? []) as LibraryEntry[]).map((e) => ({ ...e, source: 'qlc' as const }))
      const entries = [...ofl, ...qlcEntries].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.name.localeCompare(b.name))
      set({ library, entries: [...get().mine.map(entryForDef), ...entries], qlcCredit: qlc ? qlc.built : null, status: 'ready', error: undefined })
      void get().loadMine()
    } catch (error) {
      set({ status: 'error', error: (error as Error).message })
      window.api?.log('error', 'Library failed to load', String(error))
    }
  },

  async loadMine() {
    if (!window.api) return
    const mine = ((await window.api.myFixtures()) as FixtureDef[]).sort((a, b) => a.name.localeCompare(b.name))
    const defs = { ...get().defs }
    for (const d of mine) defs[`mine/${d.id}`] = d
    const others = get().entries.filter((e) => e.source !== 'mine')
    set({ mine, defs, entries: [...mine.map(entryForDef), ...others] })
  },

  async loadDef(key) {
    const have = get().defs[key]
    if (have) return have
    if (key.startsWith('qlc/') && window.api) {
      const compact = await window.api.qlcDefinition(key)
      if (!compact) return null
      const def = expandDef(compact, `qlc-${key.slice(4).replace(/[^\w]+/g, '-').toLowerCase()}`, { kind: 'library', label: 'QLC+ fixture library', url: 'https://www.qlcplus.org' })
      set({ defs: { ...get().defs, [key]: def } })
      return def
    }
    return null
  },

  async defFor(key) {
    const own = await get().loadDef(key)
    if (own) return own
    const { library, entries } = get()
    const fx = library?.fixtures[key]
    const entry = entries.find((e) => e.key === key)
    if (!fx || !entry) return null
    return defFromOfl(fx, entry.manufacturer, key)
  },

  typeFor(key, modeIndex) {
    const { library, entries, defs } = get()
    const entry = entries.find((e) => e.key === key)
    if (!entry) return null
    const remember = () => {
      const recent = [key, ...get().recent.filter((k) => k !== key)].slice(0, RECENT_MAX)
      set({ recent })
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
      } catch {
        // Recent items are a convenience only.
      }
    }
    const def = defs[key]
    if (def) {
      remember()
      const type = typeFromDef(def, modeIndex)
      return entry.source === 'mine' ? type : { ...type, family: { library: key, mode: modeIndex } }
    }
    if (entry.source === 'qlc') {
      // Not fetched yet: fetch it for next time (the row's click or drag usually has already).
      void get().loadDef(key)
      return null
    }
    const fixture = library?.fixtures[key]
    if (!fixture) return null
    remember()
    return fixtureTypeFromOfl(key, entry.manufacturer, fixture, modeIndex)
  },

  async importFiles() {
    if (!window.api) return
    const { added, rejected } = await window.api.importFixtureFiles()
    if (added) {
      await get().load(true)
      notify('info', `Imported ${added} fixture file${added === 1 ? '' : 's'} into the library (under "Imported").`)
    }
    for (const r of rejected) notify('error', `Not imported: ${r}`)
  }
}))

/** Search: every word must appear in the manufacturer, name or categories. */
export function searchLibrary(entries: LibraryEntry[], query: string, category: string): LibraryEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const cat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]
  return entries.filter((e) => {
    if (!cat.match(e.categories)) return false
    const text = `${e.manufacturer} ${e.name} ${e.categories.join(' ')} ${e.bulb ?? ''}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
}
