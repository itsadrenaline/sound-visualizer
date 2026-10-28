/**
 * The Plan: the show drawn flat, like a lighting plot. From the top (the default),
 * the front (as the audience sees it) or either side (from the left or the right, as in 3D).
 *
 * Every view maps the world onto two plan axes:
 *  - top:   u = x (left/right), v = z (back wall at the top, audience at the bottom)
 *  - front: u = x, v = -y (up is up)
 *  - left:  u = z (back wall on the left, audience on the right), v = -y
 *  - right: u = -z (audience on the left, back wall on the right), v = -y
 */
import { getFixtureType } from './fixtureTypes'
import { footprint, heightOf, mountPoints, pointAt, STRUCTURE_KINDS, toWorld, type Category, type MountPoint, type Structure } from './structures'
import type { Project, Vec3 } from './project'
import type { LookKind } from './catalog'

export type PlanSide = 'top' | 'front' | 'left' | 'right'

/** Seen from the left or the right (not the top or the front). */
export function isSideView(side: PlanSide): boolean {
  return side === 'left' || side === 'right'
}

export interface PlanItem {
  id: string
  kind: 'structure' | 'fixture'
  /** Centre on the plan, metres. */
  u: number
  v: number
  /** Size on the plan (before turning), metres. */
  w: number
  h: number
  /** Turn on the plan, degrees (top view only), as SVG's rotate(). */
  turn: number
  label: string
  locked: boolean
  /** Drawing order: lower first. */
  layer: number
  /** Structures: their category, for the colour. Fixtures: their look. */
  category?: Category
  look?: LookKind
  hanging?: boolean
  /** Fixtures: universe.address. */
  patch?: string
  structureKind?: Structure['kind']
}

/** Plan coordinates of a world point. */
export function toPlan(side: PlanSide, p: Vec3): [number, number] {
  if (side === 'top') return [p[0], p[2]]
  if (side === 'front') return [p[0], -p[1]]
  if (side === 'right') return [-p[2], -p[1]]
  return [p[2], -p[1]]
}

/** A move on the plan as a world move (height only changes in the front and side views). */
export function planDelta(side: PlanSide, du: number, dv: number): Vec3 {
  if (side === 'top') return [du, 0, dv]
  if (side === 'front') return [du, -dv, 0]
  if (side === 'right') return [0, -dv, -du]
  return [0, -dv, du]
}

const MIN_FIXTURE = 0.18

/** Everything in the show, as drawn in one view. */
export function planItems(project: Project, side: PlanSide): PlanItem[] {
  const items: PlanItem[] = []
  for (const s of project.structures ?? []) {
    const [w, d] = footprint(s)
    const height = Math.max(0.02, heightOf(s))
    const info = STRUCTURE_KINDS[s.kind]
    const a = (s.rotation * Math.PI) / 180
    // Seen from the front or side, a turned piece is as wide as its footprint's shadow.
    const across = Math.abs(w * Math.cos(a)) + Math.abs(d * Math.sin(a))
    const along = Math.abs(w * Math.sin(a)) + Math.abs(d * Math.cos(a))
    const base = { id: s.id, kind: 'structure' as const, label: s.name, locked: !!s.locked, category: info.category, structureKind: s.kind }
    if (side === 'top') items.push({ ...base, u: s.position[0], v: s.position[2], w, h: d, turn: -s.rotation, layer: info.ground ? 0 : 1 + s.position[1] + height / 100 })
    else {
      const [u] = toPlan(side, s.position)
      items.push({ ...base, u, v: -(s.position[1] + height / 2), w: side === 'front' ? across : along, h: height, turn: 0, layer: info.ground ? 0 : 1 + (side === 'front' ? s.position[2] : side === 'right' ? s.position[0] : -s.position[0]) / 100 })
    }
  }
  for (const f of project.fixtures) {
    const type = getFixtureType(f.typeId)
    const size = f.panel?.width ? [f.panel.width, f.panel.height ?? 0.5, 0.05] : (type.spec?.size ?? [0.3, 0.3, 0.3])
    const [sw, sh, sd] = size.map((v) => Math.max(MIN_FIXTURE, v))
    const base = {
      id: f.id,
      kind: 'fixture' as const,
      label: f.name,
      locked: !!f.locked,
      look: type.spec?.look,
      hanging: f.mounting === 'hanging',
      patch: `${f.universe + 1}.${f.address}`,
      layer: 100 + f.position[1]
    }
    const [u, v] = toPlan(side, f.position)
    if (side === 'top') items.push({ ...base, u, v, w: sw, h: sd, turn: -(f.rotation ?? 0) })
    else items.push({ ...base, u, v: v - (f.mounting === 'hanging' ? -sh / 2 : sh / 2), w: side === 'front' ? sw : sd, h: sh, turn: 0 })
  }
  return items.sort((a, b) => a.layer - b.layer)
}

/** The box around a set of items (plan coordinates), or null. */
export function planBounds(items: PlanItem[]): { minU: number; maxU: number; minV: number; maxV: number } | null {
  if (!items.length) return null
  const b = { minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity }
  for (const it of items) {
    const r = Math.hypot(it.w, it.h) / 2
    b.minU = Math.min(b.minU, it.u - r)
    b.maxU = Math.max(b.maxU, it.u + r)
    b.minV = Math.min(b.minV, it.v - r)
    b.maxV = Math.max(b.maxV, it.v + r)
  }
  return b
}

/** The plan item under a plan point (topmost first), honouring each item's turn. */
export function itemAt(items: PlanItem[], u: number, v: number, slack = 0): PlanItem | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    const a = (-it.turn * Math.PI) / 180
    const du = u - it.u
    const dv = v - it.v
    // Into the item's own axes.
    const lu = du * Math.cos(a) + dv * Math.sin(a)
    const lv = -du * Math.sin(a) + dv * Math.cos(a)
    if (Math.abs(lu) <= it.w / 2 + slack && Math.abs(lv) <= it.h / 2 + slack) return it
  }
  return undefined
}

export interface PlanMount {
  structure: Structure
  point: MountPoint
  t: number
  position: Vec3
  distance: number
}

/**
 * Seen from the top: the mount point nearest (x, z) within `reach`, for dropping a
 * fixture onto a totem, stand or truss. Hanging fixtures look for truss bars, the
 * rest for tops.
 */
export function mountNear(structures: Structure[], x: number, z: number, hanging: boolean, reach: number): PlanMount | null {
  let best: PlanMount | null = null
  for (const s of structures) {
    for (const m of mountPoints(s)) {
      if (m.inside || m.out) continue
      if (hanging ? m.kind !== 'under' : m.kind !== 'top') continue
      const a = toWorld(s, m.at)
      const b = toWorld(s, m.to ?? m.at)
      const abx = b[0] - a[0]
      const abz = b[2] - a[2]
      const len = abx * abx + abz * abz
      const t = len > 1e-9 ? Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[2]) * abz) / len)) : 0.5
      const px = a[0] + abx * t
      const pz = a[2] + abz * t
      const distance = Math.hypot(x - px, z - pz)
      if (distance > reach || (best && distance >= best.distance)) continue
      best = { structure: s, point: m, t, distance, position: toWorld(s, pointAt(m, t)) }
    }
  }
  return best
}

/** Grid lines to draw: the minor spacing (the grid you snap to) and every major line. */
export function majorSpacing(grid: number, imperial: boolean): number {
  if (imperial) return grid <= 0.61 ? 4 * 0.3048 : 8 * 0.3048
  return grid < 1 ? 1 : 5
}
