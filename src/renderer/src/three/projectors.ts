/**
 * Every lit beam registers here each frame: where it starts, where it points,
 * how wide it is, its colour and its gobo. The room's surfaces (floor, walls,
 * ceiling) read the list and work out the light pools themselves, gobo pattern
 * included, so a gobo shows wherever the beam lands. See roomMaterial.ts.
 */
import * as THREE from 'three'

export const MAX_PROJECTORS = 32

export interface Projector {
  position: THREE.Vector3
  direction: THREE.Vector3
  /** The beam's local "right", so the gobo turns with the fixture. */
  right: THREE.Vector3
  /** tan(half the beam angle). */
  tanHalf: number
  /** Linear colour × intensity × output. */
  color: [number, number, number]
  /** Atlas cell (0 = open) and its rotation, radians. */
  goboCell: number
  goboTurn: number
  /** 0 = no prism; otherwise how far the facets spread, in beam widths. */
  prismSpread: number
  /** How far the prism has turned, radians. */
  prismTurn: number
  /** Where the beam is stopped (inside a totem: the plate at the other end), metres along it. */
  reach?: number
}

const frame: Projector[] = []

export const projectors = {
  begin(): void {
    frame.length = 0
  },
  add(p: Projector): void {
    frame.push(p)
  },
  /** The brightest ones, up to the shader's limit. */
  brightest(): Projector[] {
    if (frame.length <= MAX_PROJECTORS) return frame
    return [...frame].sort((a, b) => Math.max(...b.color) - Math.max(...a.color)).slice(0, MAX_PROJECTORS)
  },
  count(): number {
    return frame.length
  },
  /** Every beam this frame (a disco ball reflects all of them). */
  all(): readonly Projector[] {
    return frame
  }
}
