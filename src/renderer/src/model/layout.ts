/**
 * Where fixtures go, without you dragging each one.
 *
 *  - autoLayout: a sensible starting rig by kind of fixture: movers spread along
 *    the truss, tubes across the back, bars on the DJ booth, GigBars on stands
 *    either side, floor units across the front. (What a new SoundSwitch import gets.)
 *  - distribute: spread a set of fixtures evenly as a line, an arc, a circle or
 *    a grid, on the truss, on the floor or where they already are.
 */
import type { FixtureType } from './fixtureTypes'
import type { Fixture, Vec3 } from './project'

export type Placement = Pick<Fixture, 'position' | 'mounting' | 'aimTilt'>

/** The truss and stage the default room is built with (three/stage.ts). */
/** Under the default goalpost's crossbar (see physics.defaultStructures). */
export const TRUSS = { y: 6.31, z: -1, width: 12.5 }
export const FLOOR_FRONT_Z = 2
export const FLOOR_BACK_Z = -3.6

/** Spreads `count` items evenly across `width` metres, centred on `centre`. */
export function spread(i: number, count: number, width: number, centre = 0): number {
  return count <= 1 ? centre : centre - width / 2 + (i * width) / (count - 1)
}

export function autoLayout<T>(items: T[], typeOf: (item: T) => FixtureType): Map<T, Placement> {
  const lookOf = (item: T) => typeOf(item).spec?.look ?? (typeOf(item).body === 'movingHead' ? 'mover' : 'par')
  const kind = (looks: string[]) => items.filter((f) => looks.includes(lookOf(f)))
  const hangingMovers = kind(['mover', 'moverWash']).filter((f) => typeOf(f).spec?.mount !== 'floor')
  const floorMovers = kind(['mover', 'moverWash']).filter((f) => typeOf(f).spec?.mount === 'floor')
  const tubes = kind(['tube'])
  const bars = kind(['bar'])
  const strips = kind(['strip'])
  const stands = kind(['gigbar'])
  const floor = kind(['uplight', 'flood', 'spider', 'par'])
  const out = new Map<T, Placement>()

  hangingMovers.forEach((f, i) => out.set(f, { position: [spread(i, hangingMovers.length, TRUSS.width), TRUSS.y, TRUSS.z], mounting: 'hanging', aimTilt: 0 }))
  floorMovers.forEach((f, i) => out.set(f, { position: [spread(i, floorMovers.length, TRUSS.width), 0.1, 1.5], mounting: 'floor', aimTilt: 0 }))
  tubes.forEach((f, i) => out.set(f, { position: [spread(i, tubes.length, 10), 0.1, FLOOR_BACK_Z], mounting: 'floor', aimTilt: 0 }))
  // Pixel bars stand on the booth's front edge facing the crowd; LED tape runs along its front face.
  bars.forEach((f, i) => out.set(f, { position: [spread(i, bars.length, 2.2), 1.04, 3.25], mounting: 'floor', aimTilt: 0 }))
  const perRow = Math.ceil(strips.length / 2)
  strips.forEach((f, i) => out.set(f, { position: [spread(Math.floor(i / 2), perRow, 2.0), i % 2 ? 0.08 : 0.94, 3.42], mounting: 'floor', aimTilt: 0 }))
  // GigBars on stands either side of the stage, further out if there are more.
  stands.forEach((f, i) => out.set(f, { position: [(i % 2 ? 1 : -1) * (5.5 + Math.floor(i / 2) * 1.4), 2.2, 2.0], mounting: 'floor', aimTilt: 0 }))
  floor.forEach((f, i) => out.set(f, { position: [spread(i, floor.length, 12), 0.1, FLOOR_FRONT_Z], mounting: 'floor', aimTilt: 30 }))
  // Every other kind (lasers, derbies, strobes, panels, retro cells, string lights, and any kind
  // added later) still gets a place: effects hang from the truss in front of the movers,
  // fog machines sit at the back. Nothing may be left without a position.
  const fog = items.filter((f) => !out.has(f) && lookOf(f) === 'fog')
  fog.forEach((f, i) => out.set(f, { position: [spread(i, fog.length, 6), 0.1, FLOOR_BACK_Z + 0.6], mounting: 'floor', aimTilt: 0 }))
  const rest = items.filter((f) => !out.has(f))
  rest.forEach((f, i) => out.set(f, { position: [spread(i, rest.length, TRUSS.width - 1), TRUSS.y, TRUSS.z + 0.35], mounting: 'hanging', aimTilt: 20 }))
  return out
}

export type Shape = 'line' | 'arc' | 'circle' | 'grid'
export type Where = 'keep' | 'truss' | 'floorFront' | 'floorBack'

/**
 * Even positions for `fixtures`, in their current left-to-right order.
 * `width` is the line's length (or the circle's diameter); leave it out for a
 * comfortable gap between fixtures of this size.
 */
export function distribute(fixtures: Fixture[], typeOf: (f: Fixture) => FixtureType, shape: Shape, where: Where, width?: number): Map<string, Placement> {
  const out = new Map<string, Placement>()
  const n = fixtures.length
  if (!n) return out
  const order = [...fixtures].sort((a, b) => a.position[0] - b.position[0] || a.position[2] - b.position[2] || a.name.localeCompare(b.name))
  const biggest = Math.max(...fixtures.map((f) => typeOf(f).spec?.size[0] ?? 0.3))
  const gap = Math.max(0.6, biggest + 0.35)
  const centre: Vec3 = [
    order.reduce((s, f) => s + f.position[0], 0) / n,
    order.reduce((s, f) => s + f.position[1], 0) / n,
    order.reduce((s, f) => s + f.position[2], 0) / n
  ]
  // Where the row sits: keep their own height and depth, or snap to the truss or floor.
  const base: { y: number; z: number; x: number; mounting?: Fixture['mounting']; aimTilt?: number } =
    where === 'truss'
      ? { x: 0, y: TRUSS.y, z: TRUSS.z, mounting: 'hanging', aimTilt: 0 }
      : where === 'floorFront'
        ? { x: 0, y: 0.1, z: FLOOR_FRONT_Z, mounting: 'floor' }
        : where === 'floorBack'
          ? { x: 0, y: 0.1, z: FLOOR_BACK_Z, mounting: 'floor' }
          : { x: centre[0], y: centre[1], z: centre[2] }
  const maxWidth = where === 'truss' ? TRUSS.width : 18
  const span = Math.min(maxWidth, width ?? gap * (n - 1))
  // "Where they are" keeps each fixture's own height: floor units stay on the floor, hung ones on the truss.
  const put = (f: Fixture, x: number, z: number) =>
    out.set(f.id, {
      position: [round(x), round(where === 'keep' ? f.position[1] : base.y), round(z)],
      mounting: base.mounting ?? f.mounting,
      aimTilt: base.aimTilt ?? (base.mounting === 'floor' && typeOf(f).body !== 'movingHead' ? Math.max(f.aimTilt, 15) : f.aimTilt)
    })

  order.forEach((f, i) => {
    if (shape === 'line') {
      put(f, spread(i, n, span, base.x), base.z)
    } else if (shape === 'arc') {
      // A shallow arc, the ends curving towards the audience (like a smile seen from above).
      const t = n <= 1 ? 0 : i / (n - 1) - 0.5
      const angle = t * (Math.PI * 2) / 3 // ±60°
      const radius = Math.max(span / Math.sqrt(3), 0.5)
      put(f, base.x + Math.sin(angle) * radius, base.z + (1 - Math.cos(angle)) * radius * 0.6)
    } else if (shape === 'circle') {
      const radius = Math.max((width ?? Math.max(1.2, (gap * n) / Math.PI)) / 2, 0.4)
      const a = (i / n) * Math.PI * 2
      put(f, base.x + Math.sin(a) * radius, base.z + Math.cos(a) * radius)
    } else {
      const cols = Math.ceil(Math.sqrt(n))
      const rows = Math.ceil(n / cols)
      const col = i % cols
      const row = Math.floor(i / cols)
      const cw = Math.min(maxWidth, width ?? gap * (cols - 1))
      put(f, spread(col, cols, cw, base.x), base.z + (row - (rows - 1) / 2) * gap)
    }
  })
  return out
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
