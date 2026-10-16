/**
 * Keeps the scene physically sensible. Every change to the project passes
 * through settle() (see state/store.ts), so these always hold:
 *
 *  - Structures stand on the floor, or on top of a stage deck, table or sub
 *    that is under them. Nothing is sunk into the floor or left floating.
 *  - A fixture attached to a structure follows it (top plate, truss bar, clamp).
 *  - A standing fixture rests on whatever is under it: the floor, a stage, a table.
 *  - A hanging fixture needs something to hang from: it attaches to the nearest
 *    truss or bar within reach, or falls and stands on the floor.
 *
 * It also works out how big the room needs to be to hold everything.
 */
import type { Fixture, Project, Vec3 } from './project'
import { getFixtureType } from './fixtureTypes'
import { covers, footprint, heightOf, mountPoints, nearestOn, pointAt, STRUCTURE_KINDS, surfaceHeight, toLocal, toWorld, type MountPoint, type Structure } from './structures'

/** How far a hanging fixture can be from a bar and still be clamped to it, metres. */
const HANG_REACH = 1.2
/** A standing fixture this far above what's under it looks for something to attach to. */
const ATTACH_REACH = 0.45
/** GigBars and similar carry their own stand. */
const OWN_STAND = 2.2

/** The stage, truss and DJ booth the default room used to have built in. */
export function defaultStructures(): Structure[] {
  return [
    { id: 'st-stage', kind: 'stage', name: 'Stage riser', position: [0, 0, -0.5], rotation: 0, params: { width: 14, depth: 9, height: 0.1, cover: 'none', stairs: false } },
    { id: 'st-truss', kind: 'goalpost', name: 'Main truss', position: [0, 0.1, -1], rotation: 0, params: { width: 14, height: 6.5, truss: 0.29 } },
    { id: 'st-booth', kind: 'djBooth', name: 'DJ booth', position: [0, 0.1, 3], rotation: 0, params: { width: 3.2, depth: 0.8, height: 1.0, cover: 'white' } }
  ]
}

const same = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4 && Math.abs(a[2] - b[2]) < 1e-4
const round = (v: number) => Math.round(v * 1000) / 1000
/** Where along a bar: fine enough that the position it gives doesn't drift when rounded to the millimetre. */
const roundT = (t: number) => Math.round(t * 1e6) / 1e6

/** Each structure's base height: the floor, or the top of the surface it stands on. */
function settleStructures(list: Structure[]): Structure[] {
  const base = new Map<string, number>()
  const visiting = new Set<string>()
  const byId = new Map(list.map((s) => [s.id, s]))
  const baseOf = (s: Structure): number => {
    const known = base.get(s.id)
    if (known !== undefined) return known
    if (visiting.has(s.id)) return 0 // two decks under each other: break the loop
    visiting.add(s.id)
    let y = 0
    // Flown things (a line array) hang from the ceiling, whatever is under them.
    if (STRUCTURE_KINDS[s.kind].flown) {
      visiting.delete(s.id)
      base.set(s.id, 0)
      return 0
    }
    for (const t of list) {
      if (t.id === s.id || !STRUCTURE_KINDS[t.kind].surface) continue
      if (!covers(t, s.position[0], s.position[2])) continue
      // Only stand on things smaller in footprint, or a deck on a deck: never a stage on a table.
      const [tw, td] = footprint(t)
      const [sw, sd] = footprint(s)
      if (STRUCTURE_KINDS[s.kind].surface && tw * td < sw * sd * 0.8) continue
      y = Math.max(y, baseOf(t) + (surfaceHeight(t) ?? 0))
    }
    visiting.delete(s.id)
    base.set(s.id, round(y))
    return round(y)
  }
  let changed = false
  const out = list.map((s) => {
    const y = baseOf(byId.get(s.id)!)
    if (Math.abs(s.position[1] - y) < 1e-4) return s
    changed = true
    return { ...s, position: [s.position[0], y, s.position[2]] as Vec3 }
  })
  return changed ? out : list
}

/** Height of whatever a standing thing at (x, z) rests on. */
export function surfaceAt(structures: Structure[], x: number, z: number): number {
  let y = 0
  for (const s of structures) {
    const h = surfaceHeight(s)
    if (h === null || !covers(s, x, z)) continue
    y = Math.max(y, s.position[1] + h)
  }
  return round(y)
}

export interface Attachment {
  structure: Structure
  point: MountPoint
  t: number
  position: Vec3
  distance: number
}

/** The closest mount point to a world position, of the given kinds, within `reach` (inside a totem only if asked). */
export function nearestMount(structures: Structure[], world: Vec3, kinds: MountPoint['kind'][], reach: number, inside = false): Attachment | null {
  let best: Attachment | null = null
  for (const s of structures) {
    const local = toLocal(s, world)
    for (const m of mountPoints(s)) {
      if (!kinds.includes(m.kind)) continue
      // Inside a totem is a place you choose, never one a fixture falls into.
      if (m.inside && !inside) continue
      const { t, distance } = nearestOn(m, local)
      if (distance > reach || (best && distance >= best.distance)) continue
      best = { structure: s, point: m, t, distance, position: toWorld(s, pointAt(m, t)) }
    }
  }
  return best
}

function placeMounted(f: Fixture, s: Structure, m: MountPoint, t: number): Fixture {
  const position = toWorld(s, pointAt(m, t)).map(round) as Vec3
  const mounting: Fixture['mounting'] = m.kind === 'under' ? 'hanging' : 'floor'
  if (same(position, f.position) && f.mounting === mounting && f.mount?.structure === s.id && f.mount.point === m.id && f.mount.t === (m.to ? roundT(t) : undefined)) return f
  return { ...f, position, mounting, mount: { structure: s.id, point: m.id, ...(m.to ? { t: roundT(t) } : {}) } }
}

function settleFixture(f: Fixture, structures: Structure[], byId: Map<string, Structure>, prev?: Fixture): Fixture {
  // A fixture with no (or a broken) position goes to the middle of the floor rather than breaking the show.
  if (!Array.isArray(f.position) || f.position.length !== 3 || f.position.some((v) => !Number.isFinite(v))) f = { ...f, position: [0, 0.1, 0] }
  // Moved by hand since last time: it comes off what it was attached to, then finds its footing again.
  if (f.mount && prev && !same(prev.position, f.position)) f = { ...f, mount: undefined }
  // Attached: follow the structure.
  if (f.mount) {
    const s = byId.get(f.mount.structure)
    const m = s && mountPoints(s).find((p) => p.id === f.mount!.point)
    if (s && m) return placeMounted(f, s, m, f.mount.t ?? 0.5)
    // Its structure is gone: let it fall (below).
    f = { ...f, mount: undefined }
  }
  const type = getFixtureType(f.typeId)
  if (f.mounting === 'hanging') {
    const hang = nearestMount(structures, f.position, ['under'], HANG_REACH)
    if (hang) return placeMounted(f, hang.structure, hang.point, hang.t)
    // Nothing to hang from: it ends up standing on the floor.
    f = { ...f, mounting: 'floor' }
  }
  const ground = surfaceAt(structures, f.position[0], f.position[2])
  const ownStand = type.spec?.look === 'gigbar' ? OWN_STAND : 0
  const resting = round(ground + ownStand)
  if (!ownStand && f.position[1] - resting > ATTACH_REACH * 0.33) {
    // Held up in the air: if it's next to a clamp or a facade edge, that's what holds it.
    const hold = nearestMount(structures, f.position, ['top', 'clamp', 'face'], ATTACH_REACH)
    if (hold) return placeMounted(f, hold.structure, hold.point, hold.t)
  }
  if (Math.abs(f.position[1] - resting) < 1e-4) return f
  return { ...f, position: [f.position[0], resting, f.position[2]] }
}

/**
 * Apply the rules above. Returns the same project object when nothing had to change.
 * `prev` is the project before this change: a fixture whose position changed was
 * moved by hand, so it's taken off its mount and settles wherever it was put.
 */
export function settle(p: Project, prev?: Project): Project {
  const prevById = prev && prev !== p ? new Map(prev.fixtures.map((f) => [f.id, f])) : undefined
  const before = p.structures
  const structures = settleStructures(before ?? defaultStructures())
  const byId = new Map(structures.map((s) => [s.id, s]))
  let changed = structures !== before
  const fixtures = p.fixtures.map((f) => {
    const next = settleFixture(f, structures, byId, prevById?.get(f.id))
    if (next !== f) changed = true
    return next
  })
  return changed ? { ...p, structures, fixtures } : p
}

export interface Extents {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** The highest point of any structure or fixture. */
  top: number
}

/** The box that holds every structure and fixture, so the room can be made big enough. */
export function sceneExtents(p: Project): Extents {
  const e: Extents = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, top: 0 }
  const grow = (x: number, z: number, y: number) => {
    e.minX = Math.min(e.minX, x)
    e.maxX = Math.max(e.maxX, x)
    e.minZ = Math.min(e.minZ, z)
    e.maxZ = Math.max(e.maxZ, z)
    e.top = Math.max(e.top, y)
  }
  for (const s of p.structures ?? []) {
    const [w, d] = footprint(s)
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
      const [x, , z] = toWorld(s, [lx, 0, lz])
      grow(x, z, s.position[1] + heightOf(s))
    }
  }
  for (const f of p.fixtures) {
    const h = getFixtureType(f.typeId).spec?.size[1] ?? 0.4
    grow(f.position[0], f.position[2], f.position[1] + (f.mounting === 'hanging' ? 0.1 : h))
  }
  return e
}

/** The room's back wall without anything pushing it back. */
export const BACK_WALL_Z = -5

export interface RoomFit {
  /** Where the back wall stands (z). */
  wallZ: number
  /** Half the room's width. */
  halfWidth: number
  /** How far forward the room goes (z). */
  front: number
  /** The ceiling, raised if something wouldn't fit under the one you set. */
  ceiling: number
  /** True when the ceiling had to be raised. */
  raised: boolean
}

/** How big the room has to be to hold the set: it grows, it never cuts anything off. */
export function roomFit(p: Project, ceilingHeight: number): RoomFit {
  const e = sceneExtents(p)
  const wallZ = Math.min(BACK_WALL_Z, Math.floor((e.minZ - 0.6) * 2) / 2)
  const halfWidth = Math.max(12, Math.ceil(Math.max(-e.minX, e.maxX) + 3))
  const front = Math.max(13, Math.ceil(e.maxZ + 6))
  const needed = Math.ceil((e.top + 0.3) * 10) / 10
  return { wallZ, halfWidth, front, ceiling: Math.max(ceilingHeight, needed), raised: needed > ceilingHeight }
}
