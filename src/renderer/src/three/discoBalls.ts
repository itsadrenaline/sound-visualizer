/**
 * Disco ball reflections: every beam that hits a mirror ball is reflected by each
 * mirror tile it lights, the way a real one does. A tile turned towards the light
 * throws a small spot of the beam's colour where its reflection lands (floor,
 * ceiling, back wall), and a thin ray through the haze on the way. As the ball
 * turns, the tiles turn, and the spots sweep round the room.
 *
 * Only the tiles inside the beam reflect it: a pin spot on part of a big ball
 * lights part of it; a wash covering the whole ball lights the whole lit side.
 */
import * as THREE from 'three'
import type { Projector } from './projectors'

const MAX_DOTS = 2400
const MAX_RAYS = 900
const REACH = 40

/**
 * The ball's mirror tiles a beam can reach: real tiles in rows of latitude (the way
 * they're glued on), only those within the patch the beam lights, in the ball's own
 * frame, so they move with it as it turns. `centre` is that patch's middle (ball
 * frame), `reach` its angular radius. At most about `budget` tiles: beyond that,
 * every other one (a wash on a big ball still shows the pattern).
 */
function tilesIn(centre: THREE.Vector3, reach: number, step: number, budget: number, out: THREE.Vector3[]): number {
  const latC = Math.asin(Math.max(-1, Math.min(1, centre.y)))
  const lonC = Math.atan2(centre.z, centre.x)
  const rows = Math.round(Math.PI / step)
  const cosReach = Math.cos(reach)
  // Estimate how many there are, to thin them evenly when there are too many.
  const area = 2 * Math.PI * (1 - cosReach)
  const stride = Math.max(1, Math.ceil(Math.sqrt(area / (step * step) / budget)))
  let n = 0
  for (let i = 0; i <= rows; i += stride) {
    const lat = -Math.PI / 2 + (i / rows) * Math.PI
    if (Math.abs(lat - latC) > reach + step) continue
    const cols = Math.max(1, Math.round((2 * Math.PI * Math.cos(lat)) / step))
    const cl = Math.cos(lat)
    const sl = Math.sin(lat)
    for (let j = 0; j < cols; j += stride) {
      const lon = (j / cols) * Math.PI * 2 + (i % 2) * (Math.PI / cols)
      let dl = Math.abs(lon - lonC) % (Math.PI * 2)
      if (dl > Math.PI) dl = Math.PI * 2 - dl
      if (cl * dl > reach + step * 2 && Math.abs(lat) < 1.4) continue
      const x = cl * Math.cos(lon)
      const z = cl * Math.sin(lon)
      if (x * centre.x + sl * centre.y + z * centre.z < cosReach) continue
      if (n >= out.length) out.push(new THREE.Vector3())
      out[n++].set(x, sl, z)
    }
  }
  return n
}

/**
 * Single beams that land as spots, listed each frame by the fixtures that throw them
 * (a Starburst's lens beams): drawn with the disco ball spots, so they sweep round the
 * room the same way as the ball turns.
 */
export interface SpotRay {
  origin: THREE.Vector3
  direction: THREE.Vector3
  color: [number, number, number]
  /** tan(half the beam angle): how big the spot gets with distance. */
  tanHalf: number
}
export const spotRays: SpotRay[] = []

export interface Ball {
  /** The turning part: its world matrix turns the tiles. */
  ball: THREE.Object3D
  radius: number
  /** The mirror mesh: it glints in the colour of what hits it. */
  mirror: THREE.Mesh
}

export interface RoomBounds {
  /** Ceiling height, or null for none. */
  ceiling: number | null
  /** The back wall's z. */
  wallZ: number
}

export class DiscoReflections {
  readonly group = new THREE.Group()
  private dots: THREE.InstancedMesh
  private rays: THREE.LineSegments
  private rayPos = new Float32Array(MAX_RAYS * 6)
  private rayCol = new Float32Array(MAX_RAYS * 6)
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private z = new THREE.Vector3(0, 0, 1)
  private c = new THREE.Color()
  private tiles: THREE.Vector3[] = []

  constructor() {
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    this.dots = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10), dotMaterial, MAX_DOTS)
    this.dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOTS * 3), 3)
    this.dots.count = 0
    this.dots.frustumCulled = false
    this.dots.raycast = () => {}
    this.dots.renderOrder = 5
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.rayPos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(this.rayCol, 3))
    g.setDrawRange(0, 0)
    this.rays = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    this.rays.frustumCulled = false
    this.rays.raycast = () => {}
    this.group.add(this.dots, this.rays)
  }

  /** Where a ray from p along r lands: distance and surface normal (normal zero if it lands nowhere). */
  private land(p: THREE.Vector3, r: THREE.Vector3, room: RoomBounds, normal: THREE.Vector3): number {
    let s = REACH
    normal.set(0, 0, 0)
    if (r.y < -1e-4) {
      const k = -p.y / r.y
      if (k < s) (s = k), normal.set(0, 1, 0)
    }
    if (room.ceiling !== null && r.y > 1e-4) {
      const k = (room.ceiling - p.y) / r.y
      if (k < s) (s = k), normal.set(0, -1, 0)
    }
    if (r.z < -1e-4) {
      const k = (room.wallZ - p.z) / r.z
      if (k > 0 && k < s) (s = k), normal.set(0, 0, 1)
    }
    return s
  }

  update(balls: Ball[], beams: readonly Projector[], room: RoomBounds, haze: number, singles: readonly SpotRay[] = []): void {
    let dots = 0
    let rays = 0
    // Single beams (a Starburst's): a spot where each lands.
    {
      const normal = new THREE.Vector3()
      const hit = new THREE.Vector3()
      for (const ray of singles) {
        if (dots >= MAX_DOTS) break
        const strength = Math.max(...ray.color)
        if (strength < 0.01) continue
        const s = this.land(ray.origin, ray.direction, room, normal)
        if (normal.lengthSq() === 0) continue
        hit.copy(ray.origin).addScaledVector(ray.direction, s).addScaledVector(normal, 0.012)
        const size = Math.min(0.6, 0.02 + s * ray.tanHalf)
        this.q.setFromUnitVectors(this.z, normal)
        this.m.compose(hit, this.q, new THREE.Vector3(size, size, size))
        this.dots.setMatrixAt(dots, this.m)
        this.c.setRGB(...ray.color)
        this.dots.setColorAt(dots, this.c)
        dots++
      }
    }
    const centre = new THREE.Vector3()
    const toBall = new THREE.Vector3()
    const d = new THREE.Vector3()
    const n = new THREE.Vector3()
    const p = new THREE.Vector3()
    const w = new THREE.Vector3()
    const r = new THREE.Vector3()
    const hit = new THREE.Vector3()
    const normal = new THREE.Vector3()
    const inv = new THREE.Matrix4()
    const local = new THREE.Vector3()
    for (const b of balls) {
      b.ball.getWorldPosition(centre)
      const glow: [number, number, number] = [0, 0, 0]
      for (const beam of beams) {
        const strength = Math.max(...beam.color)
        if (strength < 0.01) continue
        toBall.copy(centre).sub(beam.position)
        const along = toBall.dot(beam.direction)
        if (along <= b.radius || (beam.reach !== undefined && along > beam.reach)) continue
        const beamR = Math.max(0.005, along * beam.tanHalf)
        const off = Math.sqrt(Math.max(0, toBall.lengthSq() - along * along))
        if (off > beamR + b.radius) continue
        // How much of the beam lands on the ball, and so how bright each reflection is.
        const share = Math.min(1, (b.radius / beamR) ** 2)
        const bright = Math.min(1.6, strength * (0.35 + 0.65 * share) * 1.4)
        for (let i = 0; i < 3; i++) glow[i] += beam.color[i] * (0.04 + share * 0.12)
        d.copy(toBall).normalize()
        // The lit patch, in the ball's own frame: facing the light, as wide as the beam allows.
        inv.copy(b.ball.matrixWorld).invert()
        local.copy(d).negate().transformDirection(inv)
        const reach = Math.min(Math.PI / 2 - 0.05, Math.asin(Math.min(1, (beamR + 0.02) / b.radius)))
        // Real tiles are about 1-2.5 cm.
        const step = Math.max(0.01, Math.min(0.025, b.radius * 0.06)) / b.radius
        const count = tilesIn(local, reach, step, 260, this.tiles)
        for (let ti = 0; ti < count; ti++) {
          n.copy(this.tiles[ti]).transformDirection(b.ball.matrixWorld)
          const facing = -d.dot(n)
          if (facing <= 0.05) continue
          // Only tiles inside the beam reflect it.
          p.copy(centre).addScaledVector(n, b.radius)
          w.copy(p).sub(beam.position)
          const t = w.dot(beam.direction)
          if (t <= 0 || Math.sqrt(Math.max(0, w.lengthSq() - t * t)) > t * beam.tanHalf) continue
          r.copy(d).addScaledVector(n, -2 * d.dot(n))
          // Where the reflection lands: the floor, the ceiling or the back wall.
          let s = REACH
          normal.set(0, 0, 0)
          if (r.y < -1e-4) {
            const k = -p.y / r.y
            if (k < s) (s = k), normal.set(0, 1, 0)
          }
          if (room.ceiling !== null && r.y > 1e-4) {
            const k = (room.ceiling - p.y) / r.y
            if (k < s) (s = k), normal.set(0, -1, 0)
          }
          if (r.z < -1e-4) {
            const k = (room.wallZ - p.z) / r.z
            if (k > 0 && k < s) (s = k), normal.set(0, 0, 1)
          }
          hit.copy(p).addScaledVector(r, s)
          if (normal.lengthSq() > 0 && dots < MAX_DOTS) {
            // A spot about a tile's size, growing with distance like the real ones.
            const size = Math.min(0.5, 0.012 + s * (0.004 + beam.tanHalf * 0.15) + b.radius * 0.03)
            this.q.setFromUnitVectors(this.z, normal)
            this.m.compose(hit.addScaledVector(normal, 0.012), this.q, new THREE.Vector3(size, size, size))
            this.dots.setMatrixAt(dots, this.m)
            const k = bright * facing
            this.c.setRGB(beam.color[0] / strength * k, beam.color[1] / strength * k, beam.color[2] / strength * k)
            this.dots.setColorAt(dots, this.c)
            dots++
          }
          if (haze > 0.02 && rays < MAX_RAYS && (dots & 1) === 0) {
            const end = normal.lengthSq() > 0 ? hit : hit.copy(p).addScaledVector(r, 12)
            this.rayPos.set([p.x, p.y, p.z, end.x, end.y, end.z], rays * 6)
            const k = Math.min(1, haze * 1.5) * bright * 0.5
            const cr = (beam.color[0] / strength) * k
            const cg = (beam.color[1] / strength) * k
            const cb = (beam.color[2] / strength) * k
            this.rayCol.set([cr, cg, cb, cr * 0.15, cg * 0.15, cb * 0.15], rays * 6)
            rays++
          }
        }
      }
      // The ball glints in the colour of what's on it.
      const mat = b.mirror.material as THREE.MeshStandardMaterial
      mat.emissive.setRGB(Math.min(1, glow[0]), Math.min(1, glow[1]), Math.min(1, glow[2]))
    }
    this.dots.count = dots
    this.dots.instanceMatrix.needsUpdate = true
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true
    const g = this.rays.geometry
    g.setDrawRange(0, rays * 2)
    ;(g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }

  dispose(): void {
    this.dots.geometry.dispose()
    ;(this.dots.material as THREE.Material).dispose()
    this.rays.geometry.dispose()
    ;(this.rays.material as THREE.Material).dispose()
  }
}
