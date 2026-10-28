/**
 * Making a new show (File ▸ New Show… and the first-run welcome):
 *
 *  - from a SoundSwitch project: pick the project ("profile"), tick the
 *    fixtures this show uses, say how many of each (copies share the original's
 *    DMX patch, like mirrors), and where they go (truss, totems, stands, floor,
 *    booth). The show then follows that project, with only those fixtures.
 *  - from scratch: an empty room or a basic stage, and you add everything.
 *  - the demo: a ready-made club rig with a test show playing.
 *
 * The choices can also be typed ("two copies of the movers on 6 ft totems,
 * skip the tubes"): chooseFromText fills in the list, which you can still change.
 * Everything a new show does is one undo step.
 */
import { feetInText } from '../model/units'
import { useStore } from './store'
import { addStructure, distributeFixtures, mountFixtures, syncFromSoundSwitch, updateFixtures } from './commands'
import { fixtureTypeFromMode, soundswitchKeyOf } from '../model/soundswitchImport'
import { defaultProject, newId, type Fixture, type Project } from '../model/project'
import { FT, footprint, type Structure, type StructureKind } from '../model/structures'
import type { SoundSwitchFixture } from '../../../shared/soundswitch'

export type Where = 'auto' | 'truss' | 'trussTop' | 'totems' | 'flexstands' | 'tubeStands' | 'floorFront' | 'floorBack' | 'booth'

export const WHERE_LABELS: Record<Where, string> = {
  auto: 'Where it usually goes',
  truss: 'Hanging on the truss',
  trussTop: 'On top of the truss',
  totems: 'On totems, either side',
  flexstands: 'On FLEXstands, either side',
  tubeStands: 'On tube stands',
  floorFront: 'On the floor, front',
  floorBack: 'On the floor, back',
  booth: 'On the DJ booth'
}

export interface PickRow {
  key: string
  fixture: SoundSwitchFixture
  include: boolean
  /** How many of this fixture: 1 is just the original; more are copies on the same patch. */
  count: number
  where: Where
}

export type Room = 'basic' | 'empty'

export interface NewShowPlan {
  name: string
  room: Room
  profile?: { name: string; path: string }
  rows: PickRow[]
  /** Pairs of movers: the right-hand one pans the other way. */
  mirrorPairs: boolean
  /** Totem / stand height. */
  standFt: number
}

const lookOf = (f: SoundSwitchFixture) => {
  const t = fixtureTypeFromMode(f)
  return t.spec?.look ?? (t.body === 'movingHead' ? 'mover' : t.body === 'bar' ? 'bar' : 'par')
}
const isMover = (f: SoundSwitchFixture) => ['mover', 'moverWash'].includes(lookOf(f))

/** Where a fixture of this kind usually goes. */
export function usualPlace(f: SoundSwitchFixture): Where {
  switch (lookOf(f)) {
    case 'mover':
    case 'moverWash':
      return 'truss'
    case 'tube':
      return 'tubeStands'
    case 'bar':
    case 'strip':
      return 'booth'
    case 'string':
      return 'truss'
    case 'uplight':
    case 'par':
    case 'flood':
    case 'spider':
      return 'floorFront'
    default:
      return 'auto'
  }
}

export function rowsFor(fixtures: SoundSwitchFixture[]): PickRow[] {
  return [...fixtures]
    .sort((a, b) => a.definition.localeCompare(b.definition) || a.universe - b.universe || a.address - b.address)
    .map((f) => ({ key: soundswitchKeyOf(f), fixture: f, include: true, count: 1, where: usualPlace(f) }))
}

/** Rows grouped by fixture type (a type can be patched several times, at different addresses). */
export function groupRows(rows: PickRow[]): Array<{ type: string; manufacturer: string; rows: PickRow[] }> {
  const groups = new Map<string, PickRow[]>()
  for (const r of rows) groups.set(r.fixture.definition, [...(groups.get(r.fixture.definition) ?? []), r])
  return [...groups].map(([type, list]) => ({ type, manufacturer: list[0].fixture.manufacturer, rows: list }))
}

export function planSummary(rows: PickRow[]): { patches: number; fixtures: number; copies: number; universes: number } {
  const on = rows.filter((r) => r.include)
  const fixtures = on.reduce((n, r) => n + r.count, 0)
  return { patches: on.length, fixtures, copies: fixtures - on.length, universes: new Set(on.map((r) => r.fixture.universe)).size }
}

// ---------------------------------------------------------------------------
// Saying it instead of ticking boxes
// ---------------------------------------------------------------------------

const NUMBERS: Record<string, number> = { one: 1, a: 1, an: 1, single: 1, two: 2, pair: 2, couple: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, dozen: 12 }
const KIND_WORDS: Record<string, string> = {
  mover: 'moving head heads mover movers spot spots beam beams',
  moverWash: 'moving head heads mover movers wash washes',
  tube: 'tube tubes pixel pixels',
  bar: 'bar bars pixel strip',
  strip: 'strip strips tape led',
  uplight: 'uplight uplights par pars wash washes up light lights',
  par: 'par pars can cans wash washes uplight uplights',
  flood: 'flood floods wash washes',
  spider: 'spider effect effects',
  gigbar: 'gigbar gig bar bars effect'
}
const PLACES: Array<[RegExp, Where]> = [
  [/\b(on top of|top of) (the )?truss\b/, 'trussTop'],
  [/\btruss|hang|hanging|overhead\b/, 'truss'],
  [/\btotems?\b/, 'totems'],
  [/\bflex ?stands?\b|\bstands?\b(?! tube)/, 'flexstands'],
  [/\btube stands?|mic(rophone)? stands?\b/, 'tubeStands'],
  [/\b(front|downstage)\b/, 'floorFront'],
  [/\b(back|behind|upstage|rear)\b/, 'floorBack'],
  [/\b(booth|facade|table)\b/, 'booth'],
  [/\bfloor\b/, 'floorFront']
]
const STOP = new Set(['the', 'of', 'on', 'in', 'at', 'to', 'and', 'with', 'my', 'all', 'copies', 'copy', 'x', 'want', 'i', 'use', 'put', 'them', 'it', 'each', 'side', 'sides', 'either', 'both', 'ft', 'feet', 'foot', 'only', 'just', 'please', 'also', 'plus', 'want', 'like', 'some', 'show', 'skip', 'no', 'without', 'except', 'not', 'exclude', 'drop', 'remove', 'leave', 'out'])

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Fill in the choices from a sentence. Returns the new rows and what it understood
 * (shown under the box, so you can check it before creating the show).
 */
export function chooseFromText(text: string, rows: PickRow[]): { rows: PickRow[]; understood: string[]; standFt?: number } {
  const out = rows.map((r) => ({ ...r }))
  const understood: string[] = []
  const mentioned = new Set<string>()
  let positive = 0
  let standFt: number | undefined
  const height = feetInText(text)
  if (height !== null) standFt = height
  const everything = /\b(everything|all (of )?(my |the )?fixtures|all of them)\b/i.test(text)

  for (const clause of text.toLowerCase().split(/[,;.\n]|\band\b|\bthen\b|\bplus\b/)) {
    const c = clause.trim()
    if (!c) continue
    const negative = /\b(no|skip|without|except|not|exclude|drop|remove|leave out)\b/.test(c)
    const where = PLACES.find(([re]) => re.test(c))?.[1]
    const copies = /\bcop(y|ies)\b|\bx\s*\d+\b|\b\d+\s*x\b/.test(c)
    const numWord = c.split(/\s+/).map((w) => NUMBERS[w]).find((n) => n !== undefined)
    const digits = [...c.matchAll(/\b(\d+)\b(?!\s*(?:ft|feet|foot|'|w\b|watt|m\b|cm\b|\.\d))/g)].map((m) => Number(m[1])).find((n) => n > 0 && n <= 48)
    const n = /\bx\s*(\d+)\b/.exec(c)?.[1] ? Number(/\bx\s*(\d+)\b/.exec(c)![1]) : (numWord ?? digits)
    // Which rows does it mean? Model names ("IR4", "MH-150") and kinds ("movers", "tubes").
    const tokens = norm(c).split(' ').filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w) && !Object.keys(NUMBERS).includes(w))
    const scored = out.map((r) => {
      const def = r.fixture.definition
      const hay = `${norm(def)} ${norm(r.fixture.manufacturer)} ${KIND_WORDS[lookOf(r.fixture)] ?? ''}`
      const model = squash(def)
      let score = 0
      // Each word, its singular, and a word joined to the next ("ir 4s" -> "ir4").
      const variants = tokens.map((t, i) => [t, t.replace(/s$/, ''), `${t}${tokens[i + 1] ?? ''}`, `${t}${tokens[i + 1] ?? ''}`.replace(/s$/, '')])
      for (const v of variants) {
        if (v.some((x) => squash(x).length >= 2 && model.includes(squash(x)))) score += 3
        else if (v.some((x) => hay.split(' ').includes(x))) score += 1
      }
      return { r, score }
    })
    const best = Math.max(0, ...scored.map((s) => s.score))
    if (!best) continue
    const hits = scored.filter((s) => s.score === best).map((s) => s.r)
    const label = hits.length === 1 ? hits[0].fixture.definition : `${hits.length} × ${[...new Set(hits.map((h) => h.fixture.definition))].join(', ')}`
    if (negative) {
      for (const h of hits) h.include = false
      understood.push(`Leave out ${label}`)
      continue
    }
    positive++
    let chosen = hits
    if (n !== undefined && !copies && n < hits.length) chosen = hits.slice(0, n)
    for (const h of chosen) {
      h.include = true
      mentioned.add(h.key)
      if (n !== undefined) h.count = copies ? n : Math.max(1, Math.round(n / chosen.length))
      if (where) h.where = where
    }
    const each = chosen.map((h) => h.count).every((x) => x === chosen[0].count) ? chosen[0].count : null
    understood.push(`${chosen.length > 1 ? `${chosen.length} patches of ` : ''}${chosen.length === 1 ? chosen[0].fixture.definition : [...new Set(chosen.map((h) => h.fixture.definition))].join(', ')}${each && each > 1 ? `, ${each} of each (copies on the same patch)` : ''}${where ? `, ${WHERE_LABELS[where].toLowerCase()}` : ''}`)
  }
  // Naming fixtures means "just these", unless they said everything.
  if (positive && !everything && !/\b(also|as well|too|keep the rest|everything else)\b/i.test(text)) for (const r of out) if (!mentioned.has(r.key)) r.include = false
  if (everything) for (const r of out) if (!understood.some((u) => u.startsWith('Leave out') && u.includes(r.fixture.definition))) r.include = true
  return { rows: out, understood, standFt }
}

// ---------------------------------------------------------------------------
// Building it
// ---------------------------------------------------------------------------

function emptyProject(name: string, room: Room): Project {
  const base = defaultProject()
  return { ...base, name, fixtures: [], fixtureTypes: [], structures: room === 'basic' ? base.structures : [], cameras: [], soundswitch: { link: false } }
}

/** An empty show: a basic stage, truss and booth, or an empty room. */
export function createEmptyShow(name: string, room: Room): void {
  const mark = useStore.getState().beginBatch()
  useStore.getState().apply('New show', () => emptyProject(name, room))
  useStore.getState().endBatch(mark, `New show "${name}"`)
  useStore.getState().select([])
}

const structures = () => useStore.getState().project.structures ?? []
const fixtures = () => useStore.getState().project.fixtures

function biggest(kind: StructureKind[]): Structure | undefined {
  return structures().filter((s) => kind.includes(s.kind)).sort((a, b) => footprint(b)[0] * footprint(b)[1] - footprint(a)[0] * footprint(a)[1])[0]
}

/** One stand per fixture, alternating left and right of the stage (or the booth), further out each pair. */
function onStands(ids: string[], kind: StructureKind, heightFt: number, mirror: boolean): void {
  const anchor = biggest(['stage', 'djBooth', 'table'])
  const [aw, ad] = anchor ? footprint(anchor) : [6, 2]
  const [ax, , az] = anchor ? anchor.position : [0, 0, 1]
  ids.forEach((id, i) => {
    const side = i % 2 ? 1 : -1
    const row = Math.floor(i / 2)
    const x = ax + side * (aw / 2 + 0.6 + row * 0.9)
    const z = az + ad / 2 - 0.4
    const sid = addStructure(kind, { height: heightFt * FT }, { at: [x, 0, z], select: false })
    mountFixtures([id], sid, 'top')
    if (mirror && side > 0) updateFixtures([id], 'Mirror pan', (f) => ({ ...f, invertPan: true }))
  })
}

function ensure(kind: StructureKind, make: () => string): string {
  return structures().find((s) => s.kind === kind)?.id ?? make()
}

/**
 * Make the show from the plan, as one undo step. Returns the new fixtures' ids.
 * The show then follows the SoundSwitch project, with just the chosen fixtures.
 */
export function createShowFromSoundSwitch(plan: NewShowPlan): string[] {
  const store = useStore.getState()
  const mark = store.beginBatch()
  const chosen = plan.rows.filter((r) => r.include)
  try {
    store.apply('New show', () => ({
      ...emptyProject(plan.name, plan.room),
      soundswitch: { link: true, profile: plan.profile?.name, include: chosen.map((r) => r.key) }
    }))
    syncFromSoundSwitch(chosen.map((r) => r.fixture), plan.profile?.name ?? plan.name)

    // Copies: same patch as the original, so they do exactly what it does.
    const copies: Fixture[] = []
    for (const r of chosen) {
      const original = fixtures().find((f) => f.soundswitchKey === r.key)
      if (!original) continue
      for (let n = 2; n <= r.count; n++) copies.push({ ...original, id: newId(), name: `${original.name} copy${r.count > 2 ? ` ${n - 1}` : ''}`, soundswitchKey: undefined, copyOf: r.key, mount: undefined })
    }
    if (copies.length) useStore.getState().apply('Copies', (p) => ({ ...p, fixtures: [...p.fixtures, ...copies] }))

    // Where they go: all the fixtures of one placement together, so stands alternate sides.
    const idsOf = (r: PickRow) => fixtures().filter((f) => f.soundswitchKey === r.key || f.copyOf === r.key).map((f) => f.id)
    const byWhere = new Map<Where, Array<{ row: PickRow; ids: string[] }>>()
    for (const r of chosen) byWhere.set(r.where, [...(byWhere.get(r.where) ?? []), { row: r, ids: idsOf(r) }])
    for (const [where, list] of byWhere) {
      // Pairs: an original and its copy end up either side of each other.
      const ids = list.flatMap((x) => x.ids)
      const movers = new Set(list.filter((x) => isMover(x.row.fixture)).flatMap((x) => x.ids))
      switch (where) {
        case 'truss':
        case 'trussTop': {
          const truss = ensure('goalpost', () => addStructure('goalpost', { width: Math.max(10 * FT, Math.min(40 * FT, ids.length * 0.9 + 1)), height: 12 * FT }, { at: [0, 0, -1], select: false }))
          mountFixtures(ids, truss, where === 'truss' ? 'under' : 'top')
          if (plan.mirrorPairs) {
            const right = fixtures().filter((f) => ids.includes(f.id) && movers.has(f.id) && f.copyOf && f.position[0] > 0).map((f) => f.id)
            if (right.length) updateFixtures(right, 'Mirror pan', (f) => ({ ...f, invertPan: true }))
          }
          break
        }
        case 'totems':
          onStands(ids, 'totem', plan.standFt, plan.mirrorPairs)
          break
        case 'flexstands':
          onStands(ids, 'flexstand', Math.min(8, Math.max(5, plan.standFt)), plan.mirrorPairs)
          break
        case 'tubeStands':
          onStands(ids, 'tubeStand', Math.min(8, plan.standFt), false)
          break
        case 'floorFront':
        case 'floorBack':
          distributeFixtures(ids, ids.length > 6 ? 'arc' : 'line', where)
          break
        case 'booth': {
          const booth = ensure('djBooth', () => addStructure('djBooth', {}, { at: [0, 0, 3], select: false }))
          mountFixtures(ids, booth, 'ftop')
          break
        }
        default:
          break // the automatic layout already put them where they usually go
      }
    }
  } finally {
    useStore.getState().endBatch(mark, `New show "${plan.name}"`)
  }
  const ids = fixtures().map((f) => f.id)
  useStore.getState().select([])
  return ids
}
