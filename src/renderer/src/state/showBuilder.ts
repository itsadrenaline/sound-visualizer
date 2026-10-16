/**
 * Build a show by describing it: "two Both Lighting 100 W moving heads on 6 ft
 * totems, one each side of the stage, the right one with pan inverted".
 *
 * The builder is a small set of tools (search the library, add an object,
 * add fixtures onto it, set invert/group, arrange, look at the scene). Claude
 * calls them through the Anthropic Messages API (tool use); without an API key,
 * a simple built-in reader understands the common requests ("N <fixtures> on
 * <height> totems / FLEXstands / the truss, one each side, invert one").
 * Either way everything it does is one undo step, and it only patches into
 * free addresses, like adding from the library by hand.
 */
import { useStore } from './store'
import {
  addLibraryFixtures,
  addStructure,
  deleteStructures,
  distributeFixtures,
  mountFixtures,
  updateFixtures,
  updateRoom,
  updateStructures
} from './commands'
import { fixtureTypeFromOfl, type LibraryEntry, type OflLibrary } from '../model/oflImport'
import { FT, footprint, mountPoints, paramsOf, STRUCTURE_KINDS, type Cover, type Structure, type StructureKind, type StructureParams } from '../model/structures'
import { getFixtureType } from '../model/fixtureTypes'
import { roomOf, type Vec3 } from '../model/project'
import type { Shape, Where } from '../model/layout'

export interface LibraryAccess {
  library: OflLibrary
  entries: LibraryEntry[]
}

const ft = (m: number) => Math.round((m / FT) * 10) / 10
const m = (feet: number) => feet * FT
const structures = () => useStore.getState().project.structures ?? []
const fixtures = () => useStore.getState().project.fixtures

// ---------------------------------------------------------------------------
// Library search, ranked
// ---------------------------------------------------------------------------

const KIND_WORDS: Array<[RegExp, string[]]> = [
  [/\b(moving ?heads?|movers?|mh)\b/, ['moving head']],
  [/\bspots?\b/, ['spot']],
  [/\bbeams?\b/, ['beam']],
  [/\bwash(es)?\b/, ['wash']],
  [/\b(uplights?|pars?|cans?)\b/, ['uplight', 'par', 'color changer']],
  [/\b(pixel )?bars?\b/, ['bar']],
  [/\btubes?\b/, ['tube']],
  [/\bstrobes?\b/, ['strobe']],
  [/\blasers?\b/, ['laser']]
]

/** Library fixtures for a description, best match first. */
export function findFixtures(lib: LibraryAccess, query: string, limit = 8): LibraryEntry[] {
  const q = query.toLowerCase().replace(/(\d+)\s*-?\s*(w|watts?)\b/g, '$1w')
  const words = q.split(/[^a-z0-9.+-]+/).filter((w) => w && !['the', 'a', 'an', 'of', 'with', 'and', 'lighting', 'light', 'lights', 'fixture', 'fixtures'].includes(w))
  const brand = /\bboth\b/.test(q) ? 'both lighting' : null
  const kinds = KIND_WORDS.filter(([re]) => re.test(q)).flatMap(([, k]) => k)
  const watts = [...q.matchAll(/(\d+)w\b/g)].map((x) => Number(x[1]))
  const scored = lib.entries.map((e) => {
    const name = e.name.toLowerCase()
    const text = `${e.manufacturer} ${e.name} ${e.categories.join(' ')} ${e.bulb ?? ''}`.toLowerCase()
    let score = 0
    if (brand && e.manufacturer.toLowerCase() !== brand) return { e, score: -1 }
    for (const w of words) {
      if (w === 'both') continue
      if (name.includes(w)) score += 3
      else if (text.includes(w)) score += 1
    }
    for (const k of kinds) if (text.includes(k)) score += 4
    for (const w of watts) {
      const re = new RegExp(`\\b${w}\\s*w|\\b${w}\\b`)
      if (re.test(name)) score += 5
      else if (e.bulb && re.test(e.bulb.toLowerCase())) score += 4
      else if (e.power && Math.abs(e.power - w) < 0.15 * w) score += 1
    }
    if (brand) score += 2
    return { e, score }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((s) => s.e)
}

/** A mode by name, short name or channel count; by default the fullest mode that isn't a pixel mode. */
function pickMode(entry: LibraryEntry, mode?: string | number): number {
  if (mode !== undefined && mode !== '') {
    const n = typeof mode === 'number' ? mode : Number(String(mode).replace(/ch(annels?)?$/i, '').trim())
    const byCount = entry.modes.findIndex((x) => x.channels === n)
    if (byCount >= 0) return byCount
    const byName = entry.modes.findIndex((x) => x.name.toLowerCase().includes(String(mode).toLowerCase()))
    if (byName >= 0) return byName
  }
  const plain = entry.modes.map((x, i) => ({ x, i })).filter(({ x }) => !/pixel|zone/i.test(x.name))
  const pool = plain.length ? plain : entry.modes.map((x, i) => ({ x, i }))
  return pool.reduce((best, cur) => (cur.x.channels > best.x.channels ? cur : best)).i
}

// ---------------------------------------------------------------------------
// The scene, as the builder sees it
// ---------------------------------------------------------------------------

function describeStructure(s: Structure) {
  const [w, d] = footprint(s)
  const p = paramsOf(s)
  return {
    id: s.id,
    kind: s.kind,
    name: s.name,
    x_ft: ft(s.position[0]),
    z_ft: ft(s.position[2]),
    stands_on_ft: ft(s.position[1]),
    rotation: s.rotation,
    width_ft: ft(w),
    depth_ft: ft(d),
    height_ft: ft(p.height),
    mount_points: mountPoints(s).map((mp) => ({ id: mp.id, kind: mp.kind, label: mp.label }))
  }
}

export function sceneSummary() {
  const p = useStore.getState().project
  const room = roomOf(p)
  return {
    units: 'feet. x: left (-) / right (+) as the audience sees it. z: back wall (-) / audience (+). Floor is 0.',
    room: { ceiling: room.ceiling, ceiling_height_ft: ft(room.ceilingHeight), room_light: room.ambient },
    structures: (p.structures ?? []).map(describeStructure),
    fixtures: p.fixtures.map((f) => {
      const t = getFixtureType(f.typeId)
      return {
        id: f.id,
        name: f.name,
        type: `${t.manufacturer} ${t.name}`,
        channels: t.channels.length,
        universe: f.universe + 1,
        address: f.address,
        x_ft: ft(f.position[0]),
        height_ft: ft(f.position[1]),
        z_ft: ft(f.position[2]),
        hanging: f.mounting === 'hanging',
        on: f.mount ? `${f.mount.structure}/${f.mount.point}` : null,
        invert_pan: !!f.invertPan,
        invert_tilt: !!f.invertTilt,
        group: f.group ?? 0
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Tools (the same ones Claude gets)
// ---------------------------------------------------------------------------

const KINDS = Object.keys(STRUCTURE_KINDS) as StructureKind[]

export const BUILDER_TOOLS = [
  {
    name: 'get_scene',
    description: 'The current objects (stages, totems, truss…, with their mount points) and fixtures (with patch, position, what they are attached to). Positions in feet.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'search_library',
    description: 'Search the fixture library (Open Fixture Library plus Both Lighting fixtures from their manuals). Use words from the request: brand, model, wattage, kind ("Both Lighting 100W moving head"). Returns keys and DMX modes.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
  },
  {
    name: 'add_structure',
    description:
      'Add an object. Kinds: ' +
      KINDS.map((k) => `${k} (${STRUCTURE_KINDS[k].label})`).join(', ') +
      '. Sizes in feet; leave out for the standard size. Place it with x_ft/z_ft, or beside/on another piece (e.g. a totem to the left of the stage, a DJ booth on the stage). It always stands on the floor or on the stage/table below it.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: KINDS },
        name: { type: 'string' },
        width_ft: { type: 'number' },
        depth_ft: { type: 'number' },
        height_ft: { type: 'number' },
        cover: { type: 'string', enum: ['none', 'white', 'black'], description: 'Scrim, skirt, facade or drape colour' },
        stairs: { type: 'boolean' },
        spans: { type: 'number', description: 'Pipe & drape spans' },
        x_ft: { type: 'number' },
        z_ft: { type: 'number' },
        rotation: { type: 'number', description: 'Degrees around the vertical axis' },
        beside: {
          type: 'object',
          description: 'Place it relative to another piece',
          properties: {
            structure_id: { type: 'string' },
            side: { type: 'string', enum: ['left', 'right', 'front', 'back', 'on'] },
            gap_ft: { type: 'number' },
            align: { type: 'string', enum: ['front', 'center', 'back'], description: 'For left/right: line up with its front edge, centre or back edge' }
          },
          required: ['structure_id', 'side']
        }
      },
      required: ['kind']
    }
  },
  {
    name: 'add_fixtures',
    description:
      'Add fixtures from the library, patched into free DMX addresses. Put them on an object with `on` (a totem or FLEXstand top, under a truss, a totem front clamp, a booth facade; several on one bar are spaced along it; a top plate takes one fixture, so add one per totem), or at a position.',
    input_schema: {
      type: 'object',
      properties: {
        library_key: { type: 'string', description: 'From search_library' },
        mode: { type: 'string', description: 'Mode name or channel count; default: the fullest non-pixel mode' },
        count: { type: 'number' },
        on: { type: 'object', properties: { structure_id: { type: 'string' }, point: { type: 'string', description: "Mount point id or kind: 'top', 'under', 'clamp', 'face'" } }, required: ['structure_id'] },
        x_ft: { type: 'number' },
        z_ft: { type: 'number' },
        group: { type: 'number', description: 'SoundSwitch group 1-8' }
      },
      required: ['library_key']
    }
  },
  {
    name: 'mount_fixtures',
    description: 'Attach existing fixtures to an object.',
    input_schema: { type: 'object', properties: { fixture_ids: { type: 'array', items: { type: 'string' } }, structure_id: { type: 'string' }, point: { type: 'string' } }, required: ['fixture_ids', 'structure_id'] }
  },
  {
    name: 'set_fixtures',
    description: 'Change fixtures: invert pan or tilt (for mirrored pairs), SoundSwitch group, name, turn, fixed aim for non-moving fixtures.',
    input_schema: {
      type: 'object',
      properties: {
        fixture_ids: { type: 'array', items: { type: 'string' } },
        invert_pan: { type: 'boolean' },
        invert_tilt: { type: 'boolean' },
        group: { type: 'number' },
        name: { type: 'string' },
        rotation: { type: 'number' },
        aim_tilt: { type: 'number' }
      },
      required: ['fixture_ids']
    }
  },
  {
    name: 'move',
    description: 'Move fixtures or objects to a position (feet). Moving a fixture by hand takes it off what it was attached to.',
    input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, x_ft: { type: 'number' }, z_ft: { type: 'number' }, height_ft: { type: 'number' } }, required: ['ids'] }
  },
  {
    name: 'arrange',
    description: 'Spread fixtures evenly: a line, arc, circle or grid, on the main truss, the front or back of the floor, or where they are.',
    input_schema: {
      type: 'object',
      properties: { fixture_ids: { type: 'array', items: { type: 'string' } }, shape: { type: 'string', enum: ['line', 'arc', 'circle', 'grid'] }, where: { type: 'string', enum: ['keep', 'truss', 'floorFront', 'floorBack'] }, width_ft: { type: 'number' } },
      required: ['fixture_ids', 'shape']
    }
  },
  {
    name: 'delete',
    description: 'Delete fixtures or objects by id. Use clear to start from an empty room.',
    input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] }
  },
  {
    name: 'clear',
    description: 'Remove all fixtures, all objects, or everything.',
    input_schema: { type: 'object', properties: { what: { type: 'string', enum: ['fixtures', 'structures', 'everything'] } }, required: ['what'] }
  },
  {
    name: 'set_room',
    description: 'Room light (0 dark club to 1 house lights) and ceiling.',
    input_schema: { type: 'object', properties: { room_light: { type: 'number' }, ceiling: { type: 'boolean' }, ceiling_height_ft: { type: 'number' } } }
  }
] as const

export type ToolName = (typeof BUILDER_TOOLS)[number]['name']
export interface ToolCall {
  name: ToolName
  input: Record<string, unknown>
}

type Input = Record<string, unknown>

/**
 * Remove fixtures without telling SoundSwitch sync to leave them out from now on
 * (deleting by hand does that): a rebuilt show shouldn't lose the venue's fixtures for good.
 */
function removeFixtures(list: string[]): void {
  const set = new Set(list)
  useStore.getState().apply('Remove fixtures', (p) => ({ ...p, fixtures: p.fixtures.filter((f) => !set.has(f.id)) }))
}
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined)
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : [])

function placeBeside(input: Input, kind: StructureKind, params: StructureParams): Vec3 | undefined {
  const b = input.beside as Input | undefined
  if (!b) {
    const x = num(input.x_ft)
    const z = num(input.z_ft)
    return x === undefined && z === undefined ? undefined : [m(x ?? 0), 0, m(z ?? 0)]
  }
  const target = structures().find((s) => s.id === b.structure_id)
  if (!target) throw new Error(`No object "${String(b.structure_id)}"`)
  const [tw, td] = footprint(target)
  const [w, d] = footprint({ id: '?', kind, name: '', position: [0, 0, 0], rotation: 0, params })
  const gap = m(num(b.gap_ft) ?? 1)
  const [tx, , tz] = target.position
  const align = (b.align as string) ?? 'front'
  const along = align === 'center' ? tz : align === 'back' ? tz - td / 2 + d / 2 : tz + td / 2 - d / 2
  switch (b.side) {
    case 'left': return [tx - tw / 2 - gap - w / 2, 0, along]
    case 'right': return [tx + tw / 2 + gap + w / 2, 0, along]
    case 'front': return [tx, 0, tz + td / 2 + gap + d / 2]
    case 'back': return [tx, 0, tz - td / 2 - gap - d / 2]
    default: return [tx + m(num(b.offset_x_ft) ?? 0), 0, tz + m(num(b.offset_z_ft) ?? 0)] // on it
  }
}

/** Run one tool. Throws with a readable message when the input doesn't make sense. */
export function runTool(lib: LibraryAccess | null, call: ToolCall): unknown {
  const input = call.input ?? {}
  switch (call.name) {
    case 'get_scene':
      return sceneSummary()
    case 'search_library': {
      if (!lib) throw new Error('The fixture library is still loading')
      return findFixtures(lib, String(input.query ?? '')).map((e) => ({
        library_key: e.key,
        name: `${e.manufacturer} ${e.name}`,
        categories: e.categories,
        light: e.bulb,
        power_w: e.power,
        modes: e.modes.map((x) => `${x.name} (${x.channels} ch)`)
      }))
    }
    case 'add_structure': {
      const kind = input.kind as StructureKind
      if (!STRUCTURE_KINDS[kind]) throw new Error(`Unknown kind "${String(kind)}". Use one of: ${KINDS.join(', ')}`)
      const params: StructureParams = {}
      const w = num(input.width_ft)
      const d = num(input.depth_ft)
      const h = num(input.height_ft)
      if (w !== undefined) params.width = m(w)
      if (d !== undefined) params.depth = m(d)
      if (h !== undefined) params.height = m(h)
      if (input.cover) params.cover = input.cover as Cover
      if (typeof input.stairs === 'boolean') params.stairs = input.stairs
      const spans = num(input.spans)
      if (spans !== undefined) params.spans = Math.max(1, Math.round(spans))
      // Keep sizes inside what the kind allows.
      for (const f of STRUCTURE_KINDS[kind].fields) {
        const v = params[f.key]
        if (typeof v === 'number' && f.kind === 'length') params[f.key] = Math.max(f.min ?? 0, Math.min(f.max ?? 100, v)) as never
      }
      const at = placeBeside(input, kind, params)
      const id = addStructure(kind, params, { at, name: input.name ? String(input.name) : undefined, rotation: num(input.rotation) ?? 0, select: false })
      return describeStructure(structures().find((s) => s.id === id)!)
    }
    case 'add_fixtures': {
      if (!lib) throw new Error('The fixture library is still loading')
      const key = String(input.library_key ?? '')
      const entry = lib.entries.find((e) => e.key === key) ?? findFixtures(lib, key, 1)[0]
      const raw = entry && lib.library.fixtures[entry.key]
      if (!entry || !raw) throw new Error(`No library fixture "${key}". Use search_library first.`)
      const modeIndex = pickMode(entry, input.mode as string | number | undefined)
      const type = fixtureTypeFromOfl(entry.key, entry.manufacturer, raw, modeIndex)
      const count = Math.max(1, Math.min(64, Math.round(num(input.count) ?? 1)))
      const on = input.on as Input | undefined
      let mount: { structure: string; point: string } | undefined
      if (on) {
        const s = structures().find((x) => x.id === on.structure_id)
        if (!s) throw new Error(`No object "${String(on.structure_id)}"`)
        const points = mountPoints(s)
        // Inside a totem only when asked for by id.
        const outside = points.filter((p) => !p.inside)
        const wanted = on.point ? String(on.point) : outside.some((p) => p.kind === 'top') && type.body === 'movingHead' ? 'top' : outside.some((p) => p.kind === 'under') ? 'under' : outside[0]?.id
        const mp = points.find((p) => p.id === wanted) ?? outside.find((p) => p.kind === wanted) ?? points.find((p) => p.kind === wanted)
        if (!mp) throw new Error(`${s.name} has no "${wanted}" point. It has: ${points.map((p) => p.id).join(', ') || 'none'}`)
        mount = { structure: s.id, point: mp.id }
      }
      const x = num(input.x_ft)
      const z = num(input.z_ft)
      const at: Vec3 | undefined = x !== undefined || z !== undefined ? [m(x ?? 0), type.spec?.mount === 'hanging' ? 6.3 : 0.1, m(z ?? 0)] : undefined
      const added = addLibraryFixtures(type, count, { at, mount, select: false })
      if (!added.length) throw new Error('No free DMX addresses left')
      const group = num(input.group)
      if (group) updateFixtures(added, 'Set group', (f) => ({ ...f, group }))
      const list = fixtures().filter((f) => added.includes(f.id))
      const notMounted = mount ? list.filter((f) => f.mount?.structure !== mount!.structure).length : 0
      return {
        added: list.map((f) => ({ id: f.id, name: f.name, universe: f.universe + 1, address: f.address, channels: type.channels.length, on: f.mount ? `${f.mount.structure}/${f.mount.point}` : null })),
        mode: entry.modes[modeIndex].name,
        ...(notMounted ? { note: `${notMounted} could not go on the same point (a top plate holds one fixture): add an object for each.` } : {})
      }
    }
    case 'mount_fixtures': {
      const list = ids(input.fixture_ids)
      if (!mountFixtures(list, String(input.structure_id), String(input.point ?? 'top'))) {
        // Fall back to the first point of a sensible kind.
        const s = structures().find((x) => x.id === input.structure_id)
        const first = s && mountPoints(s)[0]
        if (!first || !mountFixtures(list, s.id, first.id)) throw new Error('Could not attach: check the structure id and point')
      }
      return { attached: fixtures().filter((f) => list.includes(f.id)).map((f) => ({ id: f.id, on: f.mount ? `${f.mount.structure}/${f.mount.point}` : null })) }
    }
    case 'set_fixtures': {
      const list = ids(input.fixture_ids)
      updateFixtures(list, 'Change fixtures', (f) => ({
        ...f,
        ...(typeof input.invert_pan === 'boolean' ? { invertPan: input.invert_pan } : {}),
        ...(typeof input.invert_tilt === 'boolean' ? { invertTilt: input.invert_tilt } : {}),
        ...(num(input.group) !== undefined ? { group: num(input.group) || undefined } : {}),
        ...(input.name ? { name: String(input.name) } : {}),
        ...(num(input.rotation) !== undefined ? { rotation: num(input.rotation) } : {}),
        ...(num(input.aim_tilt) !== undefined ? { aimTilt: num(input.aim_tilt)! } : {})
      }))
      return { changed: list.length }
    }
    case 'move': {
      const list = ids(input.ids)
      const x = num(input.x_ft)
      const z = num(input.z_ft)
      const h = num(input.height_ft)
      const pos = (p: Vec3): Vec3 => [x !== undefined ? m(x) : p[0], h !== undefined ? m(h) : p[1], z !== undefined ? m(z) : p[2]]
      const fx = fixtures().filter((f) => list.includes(f.id)).map((f) => f.id)
      if (fx.length) updateFixtures(fx, 'Move fixtures', (f) => ({ ...f, position: pos(f.position) }))
      const st = structures().filter((s) => list.includes(s.id)).map((s) => s.id)
      if (st.length) updateStructures(st, 'Move objects', (s) => ({ ...s, position: pos(s.position) }))
      return { moved: fx.length + st.length }
    }
    case 'arrange': {
      const list = ids(input.fixture_ids)
      const w = num(input.width_ft)
      distributeFixtures(list, (input.shape as Shape) ?? 'line', (input.where as Where) ?? 'keep', w !== undefined ? m(w) : undefined)
      return { arranged: list.length }
    }
    case 'delete': {
      const list = ids(input.ids)
      const fx = fixtures().filter((f) => list.includes(f.id)).map((f) => f.id)
      const st = structures().filter((s) => list.includes(s.id)).map((s) => s.id)
      if (fx.length) removeFixtures(fx)
      if (st.length) deleteStructures(st)
      return { deleted: fx.length + st.length }
    }
    case 'clear': {
      const what = String(input.what)
      if (what === 'fixtures' || what === 'everything') removeFixtures(fixtures().map((f) => f.id))
      if (what === 'structures' || what === 'everything') deleteStructures(structures().map((s) => s.id))
      return sceneSummary()
    }
    case 'set_room': {
      const change: Parameters<typeof updateRoom>[0] = {}
      const light = num(input.room_light)
      if (light !== undefined) change.ambient = Math.max(0, Math.min(1, light))
      if (typeof input.ceiling === 'boolean') change.ceiling = input.ceiling
      const h = num(input.ceiling_height_ft)
      if (h !== undefined) change.ceilingHeight = Math.max(3, Math.min(25, m(h)))
      updateRoom(change, 'Change room')
      return { room: roomOf(useStore.getState().project) }
    }
  }
  throw new Error(`Unknown tool ${String(call.name)}`)
}

// ---------------------------------------------------------------------------
// The built-in reader (no API key needed)
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, single: 1, two: 2, pair: 2, couple: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }

export interface QuickPlan {
  /** What it understood, in plain words. */
  understood: string[]
  /** Runs the plan; returns what was added. */
  run(lib: LibraryAccess): string[]
}

/**
 * Understands requests like the one in the header. Returns null when the
 * request needs Claude (anything it can't read with confidence).
 */
export function quickPlan(prompt: string, lib: LibraryAccess): QuickPlan | null {
  const text = prompt.toLowerCase().replace(/[’']/g, "'").replace(/(\d+)\s*-\s*(foot|feet|ft)/g, '$1 ft')
  const kindMatch = KIND_WORDS.find(([re]) => re.test(text))
  if (!kindMatch) return null
  // How many: the last count before the fixture words ("two Both Lighting moving heads"; "100 watt" isn't a count).
  const kindAt = text.search(kindMatch[0])
  const before = text.slice(0, kindAt)
  let count = 1
  let countAt = 0
  // Number words first ("four Both Lighting 360 tubes": 360 is the model), then a plain small number.
  const tokens = [...before.matchAll(/\b(\d+)(\s*-?\s*(?:w|watts?)\b)?|\b([a-z]+)\b/g)].reverse()
  const word = tokens.find((t) => t[3] && NUMBER_WORDS[t[3]] !== undefined)
  const digits = tokens.find((t) => t[1] && !t[2] && Number(t[1]) <= 48)
  const chosen = word ?? digits
  if (chosen) {
    count = word ? NUMBER_WORDS[word[3]] : Number(digits![1])
    countAt = chosen.index
  }
  count = Math.max(1, Math.min(24, count))
  // The fixture: from the count up to where the request moves on to placement.
  const rest = text.slice(kindAt).search(/\b(on|each|that|which|placed|sitting|mounted|hung|hanging|one)\b|[.;]/)
  const phrase = text.slice(countAt, rest >= 0 ? kindAt + rest : undefined)
  const match = findFixtures(lib, phrase, 1)[0]
  if (!match) return null

  // What they stand on.
  const height = /(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\b/.exec(text)
  const holder: StructureKind | null = /\b(tube|mic(rophone)?|pixel tube) stands?\b/.test(text) ? 'tubeStand' : /\btotems?\b/.test(text) ? 'totem' : /\bflex ?stands?\b/.test(text) ? 'flexstand' : /\bt-?bars?\b|\btripod/.test(text) ? 'tbar' : /\btruss\b/.test(text) ? 'goalpost' : null
  const eachSide = /\b(each|either|both|opposite|other) sides?\b|\bone on (one|the left|the right|each) side\b|\bleft and (the )?right\b|\bstage left and stage right\b/.test(text)
  const nearStage = /\bstage\b/.test(text)
  const invert = /\b(invers|invert|mirror|opposite (direction|pan)|reverse)/.test(text)
  const invertTilt = /\binvert(ed)? tilt|tilt invert/.test(text)
  const understood: string[] = [`${count} × ${match.manufacturer} ${match.name}`]
  if (holder) understood.push(`each on a ${STRUCTURE_KINDS[holder].label.toLowerCase()}${height ? `, ${height[1]} ft` : ''}`)
  if (eachSide) understood.push(nearStage ? 'split either side of the stage' : 'split left and right')
  if (invert) understood.push(`pan inverted on one side${invertTilt ? ' (tilt too)' : ''}`)

  return {
    understood,
    run(l) {
      const added: string[] = []
      let stage = structures().filter((s) => s.kind === 'stage').sort((a, b) => footprint(b)[0] * footprint(b)[1] - footprint(a)[0] * footprint(a)[1])[0]
      if (nearStage && !stage) {
        const r = runTool(l, { name: 'add_structure', input: { kind: 'stage', width_ft: 12, depth_ft: 8, height_ft: 2 } }) as { id: string }
        stage = structures().find((s) => s.id === r.id)!
      }
      const sides = eachSide || (holder && count > 1) ? Array.from({ length: count }, (_, i) => (i % 2 ? 'right' : 'left')) : []
      const rowOf = (i: number) => Math.floor(i / 2)
      for (let i = 0; i < count; i++) {
        let on: { structure_id: string; point?: string } | undefined
        if (holder === 'goalpost') {
          // One truss for all of them.
          let truss = structures().find((s) => s.kind === 'goalpost' || s.kind === 'trussBox')
          if (!truss) {
            const r = runTool(l, { name: 'add_structure', input: { kind: 'goalpost', ...(height ? { height_ft: Number(height[1]) } : {}), ...(stage ? { beside: { structure_id: stage.id, side: 'on' } } : {}) } }) as { id: string }
            truss = structures().find((s) => s.id === r.id)
          }
          on = { structure_id: truss!.id, point: 'under' }
        } else if (holder) {
          const side = sides[i] ?? 'right'
          const input: Input = { kind: holder, ...(height ? { height_ft: Number(height[1]) } : {}) }
          if (stage && sides.length) input.beside = { structure_id: stage.id, side, gap_ft: 1 + rowOf(i) * 3, align: 'front' }
          else if (sides.length) Object.assign(input, { x_ft: (side === 'left' ? -1 : 1) * (6 + rowOf(i) * 3), z_ft: 4 })
          const r = runTool(l, { name: 'add_structure', input }) as { id: string }
          on = { structure_id: r.id, point: 'top' }
        }
        const result = runTool(l, {
          name: 'add_fixtures',
          input: { library_key: match.key, count: 1, ...(on ? { on } : {}), ...(!on && sides.length ? { x_ft: (sides[i] === 'left' ? -1 : 1) * (6 + rowOf(i) * 3), z_ft: 4 } : {}) }
        }) as { added: Array<{ id: string }> }
        const id = result.added[0]?.id
        if (!id) continue
        added.push(id)
        // Mirror pairs: the right-hand one pans (and tilts) the other way.
        if (invert && sides[i] === 'right') runTool(l, { name: 'set_fixtures', input: { fixture_ids: [id], invert_pan: true, ...(invertTilt ? { invert_tilt: true } : {}) } })
      }
      if (holder === 'goalpost' && added.length > 1) runTool(l, { name: 'mount_fixtures', input: { fixture_ids: added, structure_id: fixtures().find((f) => f.id === added[0])!.mount!.structure, point: 'under' } })
      return added
    }
  }
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You build lighting shows in a SoundSwitch lighting visualizer for DJs and production companies.
The user describes a rig in plain words; you build it with the tools, then reply with one or two short sentences saying what you set up.

How the scene works:
- Units are feet. x: left (negative) / right (positive) as the audience sees it; z: towards the back wall (negative) / towards the audience (positive); the floor is 0.
- Objects (stages, totems, FLEXstands, truss, tables, DJ booths, pipe & drape, speakers) obey physics: they stand on the floor or on the stage/table under them. Fixtures attach to their mount points: a totem or FLEXstand top plate holds one fixture, truss bars hold several (spaced automatically), totems have a front clamp for washes, booths have a facade edge for bars.
- "One on each side of the stage": add one holder with beside {side: 'left'} and one with {side: 'right'} of the stage, then one fixture on each.
- Pixel tubes (like Both Lighting 360 Tubes) go upright on tube stands (kind tubeStand, 2-8 ft), one tube per stand.
- A moving head can stand upright (on a totem, FLEXstand, truss top or the floor) or hang under a truss.
- A mirrored pair: the right-hand fixture gets invert_pan true (and invert_tilt if they asked).
- Fixtures are patched automatically into free DMX addresses. Mention the patch (universe/address) in your reply.
- Use the existing stage if there is one (get_scene); otherwise add one if the request mentions a stage.
- Find fixtures with search_library using the brand, model, wattage and kind the user gave; pick the closest match and say which one you used. "100 watt moving head" from Both Lighting is a 100 W model.
- Don't ask questions: make sensible choices and say what you chose.`

export interface ClaudeTransport {
  (body: unknown): Promise<{ content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>; stop_reason: string }>
}

export const CLAUDE_MODEL = 'claude-sonnet-5-5'

/**
 * Let Claude build the show with the tools. Everything it changes is one undo step.
 * `onStep` reports progress ("Adding 2 × BPM-Spots…").
 */
export async function buildWithClaude(prompt: string, lib: LibraryAccess | null, send: ClaudeTransport, onStep: (text: string) => void, maxTurns = 16): Promise<string> {
  const store = useStore.getState()
  const mark = store.beginBatch()
  const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
    { role: 'user', content: `Current scene:\n${JSON.stringify(sceneSummary())}\n\nRequest: ${prompt}` }
  ]
  let reply = ''
  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await send({ model: CLAUDE_MODEL, max_tokens: 4096, system: SYSTEM_PROMPT, tools: BUILDER_TOOLS, messages })
      messages.push({ role: 'assistant', content: response.content })
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
      if (text) reply = text
      const calls = response.content.filter((b) => b.type === 'tool_use')
      if (response.stop_reason !== 'tool_use' || !calls.length) break
      const results = calls.map((c) => {
        onStep(stepLabel(c.name as ToolName, (c.input ?? {}) as Input))
        try {
          return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(runTool(lib, { name: c.name as ToolName, input: (c.input ?? {}) as Input })) }
        } catch (error) {
          return { type: 'tool_result', tool_use_id: c.id, content: (error as Error).message, is_error: true }
        }
      })
      messages.push({ role: 'user', content: results })
    }
  } finally {
    useStore.getState().endBatch(mark, `Build: ${prompt.slice(0, 40)}${prompt.length > 40 ? '…' : ''}`)
  }
  return reply || 'Done.'
}

function stepLabel(name: ToolName, input: Input): string {
  switch (name) {
    case 'search_library': return `Looking for “${String(input.query)}”`
    case 'add_structure': return `Adding a ${STRUCTURE_KINDS[input.kind as StructureKind]?.label.toLowerCase() ?? 'object'}`
    case 'add_fixtures': return `Adding ${num(input.count) ?? 1} fixture${(num(input.count) ?? 1) > 1 ? 's' : ''}`
    case 'mount_fixtures': return 'Attaching fixtures'
    case 'set_fixtures': return 'Setting up fixtures'
    case 'arrange': return 'Arranging'
    case 'get_scene': return 'Looking at the scene'
    default: return name.replace('_', ' ')
  }
}

/** Run the built-in reader's plan as one undo step. */
export function runQuickPlan(plan: QuickPlan, lib: LibraryAccess, label: string): string[] {
  const mark = useStore.getState().beginBatch()
  try {
    return plan.run(lib)
  } finally {
    useStore.getState().endBatch(mark, label)
  }
}
