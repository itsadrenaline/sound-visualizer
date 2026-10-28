/**
 * Moving and arranging a mixed selection of objects and fixtures, so a stand
 * and the light on it, or a stage and everything on it, always move as one.
 *
 * What moves together:
 *  - an object brings what is attached to it (physics keeps those on it), and
 *    what stands on it: loose fixtures, and other objects on its top (a speaker
 *    on a sub, decks on a booth, chairs on a dance floor), all the way up;
 *  - a fixture on a carrier (a totem, a tube stand, a FLEXstand, a T-bar)
 *    stands for its carrier: grabbing the tube moves the stand;
 *  - any other fixture moves on its own.
 *
 * The arranging operations work on "units": each thing that moves on its own
 * (an object with its riders, or a loose fixture). They return how far each
 * unit moves; commands.ts applies that as one undo step.
 */
import type { Fixture, Project, Vec3 } from './project'
import { getFixtureType } from './fixtureTypes'
import { covers, footprint, STRUCTURE_KINDS, surfaceHeight, toWorld, type Structure } from './structures'

export interface Unit {
  id: string
  kind: 'structure' | 'fixture'
  /** World-space footprint box. */
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface Area {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** What the area is, for messages: "the stage", "the room". */
  name: string
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.02

/** The object a fixture stands for when moving: its carrier, if it's on one. */
function carrierOf(p: Project, f: Fixture): Structure | undefined {
  if (!f.mount) return undefined
  const s = (p.structures ?? []).find((x) => x.id === f.mount!.structure)
  return s && STRUCTURE_KINDS[s.kind].carrier ? s : undefined
}

/** The ids that actually move for a selection: objects (not their riders) and loose fixtures. */
export function movingRoots(p: Project, ids: string[]): { structures: Set<string>; fixtures: Set<string> } {
  const structures = new Set<string>()
  const fixtures = new Set<string>()
  const pick = new Set(ids)
  // Locked things stay put (and so does a stand with a locked fixture on top, or a locked stand).
  for (const s of p.structures ?? []) if (pick.has(s.id) && !s.locked) structures.add(s.id)
  for (const f of p.fixtures) {
    if (!pick.has(f.id) || f.locked) continue
    const carrier = carrierOf(p, f)
    if (carrier) {
      if (!carrier.locked) structures.add(carrier.id)
    }
    // On a moving object already (a truss that's also selected): it comes along anyway.
    else if (!(f.mount && structures.has(f.mount.structure))) fixtures.add(f.id)
  }
  // A fixture on a bar of an object that is also moving stays on it.
  for (const id of [...fixtures]) {
    const f = p.fixtures.find((x) => x.id === id)!
    if (f.mount && structures.has(f.mount.structure)) fixtures.delete(id)
  }
  return { structures, fixtures }
}

/** Objects and loose fixtures standing on top of `s` (directly). */
function ridersOf(p: Project, s: Structure): { structures: Structure[]; fixtures: Fixture[] } {
  const top = surfaceHeight(s)
  if (top === null) return { structures: [], fixtures: [] }
  const y = s.position[1] + top
  const [sw, sd] = footprint(s)
  return {
    structures: (p.structures ?? []).filter((t) => {
      if (t.id === s.id || !near(t.position[1], y) || !covers(s, t.position[0], t.position[2])) return false
      // A bigger surface under a smaller one is the base, not the rider.
      const [tw, td] = footprint(t)
      return !(STRUCTURE_KINDS[t.kind].surface && tw * td > sw * sd * 1.2)
    }),
    fixtures: p.fixtures.filter((f) => !f.mount && f.mounting !== 'hanging' && near(f.position[1], y) && covers(s, f.position[0], f.position[2]))
  }
}

/** Everything that moves when these roots move: riders, riders of riders. */
export function withRiders(p: Project, roots: { structures: Set<string>; fixtures: Set<string> }): { structures: Set<string>; fixtures: Set<string> } {
  const structures = new Set(roots.structures)
  const fixtures = new Set(roots.fixtures)
  const queue = [...structures]
  while (queue.length) {
    const id = queue.shift()
    const s = (p.structures ?? []).find((x) => x.id === id)
    if (!s) continue
    const r = ridersOf(p, s)
    for (const t of r.structures) if (!structures.has(t.id)) (structures.add(t.id), queue.push(t.id))
    for (const f of r.fixtures) fixtures.add(f.id)
  }
  return { structures, fixtures }
}

/** Each thing that moves on its own, with its footprint. */
export function unitsOf(p: Project, ids: string[]): Unit[] {
  const roots = movingRoots(p, ids)
  const units: Unit[] = []
  for (const s of p.structures ?? []) {
    if (!roots.structures.has(s.id)) continue
    const [w, d] = footprint(s)
    const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].map(([x, z]) => toWorld(s, [x, 0, z]))
    units.push({ id: s.id, kind: 'structure', minX: Math.min(...corners.map((c) => c[0])), maxX: Math.max(...corners.map((c) => c[0])), minZ: Math.min(...corners.map((c) => c[2])), maxZ: Math.max(...corners.map((c) => c[2])) })
  }
  for (const f of p.fixtures) {
    if (!roots.fixtures.has(f.id)) continue
    const size = getFixtureType(f.typeId).spec?.size ?? [0.3, 0.3, 0.3]
    units.push({ id: f.id, kind: 'fixture', minX: f.position[0] - size[0] / 2, maxX: f.position[0] + size[0] / 2, minZ: f.position[2] - size[2] / 2, maxZ: f.position[2] + size[2] / 2 })
  }
  return units
}

/**
 * Where "the stage" is: the biggest stage deck (not counting what's being moved),
 * or failing that the area under the main truss, or a sensible patch of the room.
 */
export function stageArea(p: Project, exclude: Set<string> = new Set()): Area {
  const box = (s: Structure, name: string): Area => {
    const [w, d] = footprint(s)
    const c = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].map(([x, z]) => toWorld(s, [x, 0, z]))
    return { minX: Math.min(...c.map((q) => q[0])), maxX: Math.max(...c.map((q) => q[0])), minZ: Math.min(...c.map((q) => q[2])), maxZ: Math.max(...c.map((q) => q[2])), name }
  }
  const list = (p.structures ?? []).filter((s) => !exclude.has(s.id))
  const size = (s: Structure) => footprint(s)[0] * footprint(s)[1]
  const stage = list.filter((s) => s.kind === 'stage').sort((a, b) => size(b) - size(a))[0]
  if (stage) return box(stage, 'the stage')
  const truss = list.filter((s) => s.kind === 'goalpost' || s.kind === 'trussBox').sort((a, b) => size(b) - size(a))[0]
  if (truss) {
    const b = box(truss, 'the truss')
    return { ...b, minZ: Math.min(b.minZ, (b.minZ + b.maxZ) / 2 - 2), maxZ: Math.max(b.maxZ, (b.minZ + b.maxZ) / 2 + 2), name: 'the stage area' }
  }
  return { minX: -6, maxX: 6, minZ: -4.5, maxZ: 1.5, name: 'the stage area' }
}

export type Place = 'back' | 'centre' | 'front' | 'left' | 'right' | 'audience'
export type Delta = [number, number]

const MARGIN = 0.3

function bounds(units: Unit[]) {
  return { minX: Math.min(...units.map((u) => u.minX)), maxX: Math.max(...units.map((u) => u.maxX)), minZ: Math.min(...units.map((u) => u.minZ)), maxZ: Math.max(...units.map((u) => u.maxZ)) }
}

/**
 * Move the whole group, keeping how it's arranged, to a place on the stage.
 * Left and right are as the audience sees them (looking at the stage).
 */
export function placeGroup(units: Unit[], area: Area, place: Place): Map<string, Delta> {
  if (!units.length) return new Map()
  const b = bounds(units)
  const cx = (b.minX + b.maxX) / 2
  const cz = (b.minZ + b.maxZ) / 2
  const ax = (area.minX + area.maxX) / 2
  const az = (area.minZ + area.maxZ) / 2
  let dx = ax - cx
  let dz = az - cz
  if (place === 'back') dz = area.minZ + MARGIN - b.minZ
  if (place === 'front') dz = area.maxZ - MARGIN - b.maxZ
  if (place === 'audience') dz = area.maxZ + 1.5 - b.minZ
  if (place === 'left') (dx = area.minX + MARGIN - b.minX), (dz = 0)
  if (place === 'right') (dx = area.maxX - MARGIN - b.maxX), (dz = 0)
  return new Map(units.map((u) => [u.id, [round(dx), round(dz)] as Delta]))
}

/**
 * A row, evenly spaced, in left-to-right order: across the back, the front, in
 * front of the stage, or where they are now. Across the stage, the row spans its
 * width; "here" keeps the current span (or opens it up so nothing overlaps).
 */
export function lineUp(units: Unit[], area: Area, where: 'back' | 'front' | 'audience' | 'here'): Map<string, Delta> {
  if (!units.length) return new Map()
  const sorted = [...units].sort((a, b) => a.minX + a.maxX - (b.minX + b.maxX))
  const widths = sorted.map((u) => u.maxX - u.minX)
  const total = widths.reduce((a, b) => a + b, 0)
  const b = bounds(units)
  const span = where === 'here' ? Math.max(b.maxX - b.minX, total + 0.3 * (units.length - 1)) : Math.max(total + 0.2 * (units.length - 1), area.maxX - area.minX - 2 * MARGIN)
  const centre = where === 'here' ? (b.minX + b.maxX) / 2 : (area.minX + area.maxX) / 2
  const gap = units.length > 1 ? (span - total) / (units.length - 1) : 0
  const deepest = Math.max(...units.map((u) => u.maxZ - u.minZ))
  // Row centre line (z) each unit is centred on.
  const z =
    where === 'back' ? area.minZ + MARGIN + deepest / 2 : where === 'front' ? area.maxZ - MARGIN - deepest / 2 : where === 'audience' ? area.maxZ + 1.5 + deepest / 2 : (b.minZ + b.maxZ) / 2
  const out = new Map<string, Delta>()
  let x = units.length > 1 ? centre - span / 2 : centre - total / 2
  sorted.forEach((u, i) => {
    const w = widths[i]
    out.set(u.id, [round(x + w / 2 - (u.minX + u.maxX) / 2), round(z - (u.minZ + u.maxZ) / 2)])
    x += w + gap
  })
  return out
}

export type Edge = 'left' | 'centreX' | 'right' | 'back' | 'centreZ' | 'front'

/** Line them up on an edge or centre line of the group, like a drawing program. */
export function alignUnits(units: Unit[], edge: Edge): Map<string, Delta> {
  if (units.length < 2) return new Map()
  const b = bounds(units)
  return new Map(
    units.map((u) => {
      switch (edge) {
        case 'left': return [u.id, [round(b.minX - u.minX), 0]]
        case 'right': return [u.id, [round(b.maxX - u.maxX), 0]]
        case 'centreX': return [u.id, [round((b.minX + b.maxX) / 2 - (u.minX + u.maxX) / 2), 0]]
        case 'back': return [u.id, [0, round(b.minZ - u.minZ)]]
        case 'front': return [u.id, [0, round(b.maxZ - u.maxZ)]]
        case 'centreZ': return [u.id, [0, round((b.minZ + b.maxZ) / 2 - (u.minZ + u.maxZ) / 2)]]
      }
    })
  )
}

/** Equal gaps between them, keeping the two outermost where they are. */
export function spaceEvenly(units: Unit[], axis: 'x' | 'z'): Map<string, Delta> {
  if (units.length < 3) return new Map()
  const lo = (u: Unit) => (axis === 'x' ? u.minX : u.minZ)
  const hi = (u: Unit) => (axis === 'x' ? u.maxX : u.maxZ)
  const sorted = [...units].sort((a, b) => lo(a) + hi(a) - (lo(b) + hi(b)))
  const start = lo(sorted[0])
  const end = hi(sorted.at(-1)!)
  const total = sorted.reduce((a, u) => a + hi(u) - lo(u), 0)
  const gap = (end - start - total) / (sorted.length - 1)
  const out = new Map<string, Delta>()
  let at = start
  for (const u of sorted) {
    const d = round(at - lo(u))
    out.set(u.id, axis === 'x' ? [d, 0] : [0, d])
    at += hi(u) - lo(u) + gap
  }
  return out
}

/** Apply per-unit moves to a project: objects with their riders, loose fixtures. */
export function applyDeltas(p: Project, deltas: Map<string, Delta>): Project {
  const sDelta = new Map<string, Delta>()
  const fDelta = new Map<string, Delta>()
  for (const [id, d] of deltas) {
    if (Math.abs(d[0]) < 1e-6 && Math.abs(d[1]) < 1e-6) continue
    const isStructure = (p.structures ?? []).some((s) => s.id === id)
    const moved = withRiders(p, { structures: new Set(isStructure ? [id] : []), fixtures: new Set(isStructure ? [] : [id]) })
    for (const s of moved.structures) if (!sDelta.has(s)) sDelta.set(s, d)
    for (const f of moved.fixtures) if (!fDelta.has(f)) fDelta.set(f, d)
  }
  if (!sDelta.size && !fDelta.size) return p
  return {
    ...p,
    structures: (p.structures ?? []).map((s) => {
      const d = sDelta.get(s.id)
      return d ? { ...s, position: [round(s.position[0] + d[0]), s.position[1], round(s.position[2] + d[1])] as Vec3 } : s
    }),
    fixtures: p.fixtures.map((f) => {
      const d = fDelta.get(f.id)
      return d ? { ...f, position: [round(f.position[0] + d[0]), f.position[1], round(f.position[2] + d[1])] as Vec3 } : f
    })
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
