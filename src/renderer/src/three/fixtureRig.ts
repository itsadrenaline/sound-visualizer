/**
 * The 3D model of one fixture, built to the manufacturer's dimensions, plus
 * its mechanics.
 *
 * A fixture is made of heads (see model/heads.ts). Each head gets an emitter:
 * a beam (lens, haze cone and a real spotlight), glowing pixels, a derby's fan
 * of beams, a strobe panel, a laser fan or a halo ring. Moving heads travel at
 * the fixture's top speed instead of jumping.
 */
import { hasOwnStand } from '../model/catalog'
import * as THREE from 'three'
import type { Fixture } from '../model/project'
import type { FixtureType } from '../model/fixtureTypes'
import { headsOf, type HeadDef, type HeadState } from '../model/heads'
import { cellPositions, ledsFromName, specFor, type FixtureSpec } from '../model/catalog'
import { createBeamMaterial } from './beamMaterial'
import { projectors } from './projectors'
import { goboCell } from './gobos'
import { PANEL_BORDERS } from '../model/project'
import { spotRays } from './discoBalls'

const BEAM_LENGTH = 16
const DEG = Math.PI / 180
const BLACK: [number, number, number] = [0, 0, 0]

/** Budget of real spotlights in the scene; beyond it, beams still draw but don't light surfaces. */
let spotlightsInUse = 0
const SPOTLIGHT_LIMIT = 28

// ---------------------------------------------------------------------------
// Emitters: what a head looks like when lit.
// ---------------------------------------------------------------------------

interface Emitter {
  update(state: HeadState, haze: number, time: number): void
  dispose(): void
}

function glowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false })
}

function setGlow(m: THREE.MeshBasicMaterial, c: [number, number, number], k: number): void {
  // Boost brightness but never past full on the brightest channel, so the hue is
  // kept (clipping each channel separately would turn red into orange, mixes into white).
  const peak = Math.max(c[0], c[1], c[2]) * k
  const s = peak > 1 ? k / peak : k
  m.color.setRGB(c[0] * s, c[1] * s, c[2] * s)
}

/** A lens with a haze cone and (budget allowing) a spotlight. Points along the parent's +Y. */
class BeamEmitter implements Emitter {
  private lens = glowMaterial()
  private beams: THREE.Mesh[] = []
  private materials: THREE.ShaderMaterial[] = []
  private light: THREE.SpotLight | null = null
  private group = new THREE.Group()
  private lensPos = new THREE.Vector3()
  private dir = new THREE.Vector3()
  private right = new THREE.Vector3()
  private goboTurn = 0
  private prismTurn = 0
  private lastTime = 0
  /** How far the beam goes before something stops it (inside a totem: the far plate). */
  reach = BEAM_LENGTH

  constructor(parent: THREE.Object3D, private root: THREE.Object3D, lensRadius: number, offset: number, private candela: number, prismCopies = 0) {
    this.group.position.y = offset
    parent.add(this.group)
    const lens = new THREE.Mesh(new THREE.CircleGeometry(lensRadius, 24), this.lens)
    lens.rotation.x = -Math.PI / 2
    lens.position.y = 0.001
    this.group.add(lens)
    for (let i = 0; i <= prismCopies; i++) {
      const cone = new THREE.ConeGeometry(1, 1, 40, 1, true)
      cone.rotateX(Math.PI)
      cone.translate(0, 0.5, 0)
      const material = createBeamMaterial()
      const mesh = new THREE.Mesh(cone, material)
      mesh.renderOrder = 10
      this.group.add(mesh)
      this.beams.push(mesh)
      this.materials.push(material)
    }
    if (spotlightsInUse < SPOTLIGHT_LIMIT) {
      spotlightsInUse++
      this.light = new THREE.SpotLight(0xffffff, 0, 0, 0.3, 0.4, 2)
      root.add(this.light)
      root.add(this.light.target)
    }
  }

  update(s: HeadState, haze: number, time: number): void {
    const on = s.intensity
    setGlow(this.lens, s.color, on * 3)
    // Gobo rotation follows the fixture's rotation channel (turns per second).
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime))
    this.lastTime = time
    this.goboTurn = (this.goboTurn + dt * s.goboSpin * Math.PI * 2) % (Math.PI * 2)
    // A prism only turns when its rotation channel says so; otherwise the facets stay put.
    this.prismTurn = (this.prismTurn + dt * s.prismSpin * Math.PI * 2) % (Math.PI * 2)
    const length = Math.max(0.05, Math.min(BEAM_LENGTH, this.reach))
    const radius = length * Math.tan((Math.max(1, s.beamAngle) / 2) * DEG)
    const prism = s.prism && this.beams.length > 1
    this.beams.forEach((beam, i) => {
      const material = this.materials[i]
      const visible = on > 0.002 && haze > 0.001 && (i === 0 || prism)
      beam.visible = visible
      if (!visible) return
      material.uniforms.color.value.setRGB(...s.color)
      material.uniforms.intensity.value = prism ? on * 0.6 : on
      material.uniforms.haze.value = haze
      material.uniforms.gobo.value = s.gobo
      material.uniforms.goboTurn.value = this.goboTurn
      beam.scale.set(radius, length, radius)
      // Prism copies spread out around the main beam and turn slowly.
      if (i > 0) {
        const a = (i / (this.beams.length - 1)) * Math.PI * 2 + this.prismTurn
        beam.rotation.set(Math.cos(a) * s.beamAngle * 1.2 * DEG, 0, Math.sin(a) * s.beamAngle * 1.2 * DEG)
      }
    })
    if (on > 0.002) {
      // Tell the room where this beam lands, so floor, walls and ceiling show its pool and gobo.
      this.root.updateMatrixWorld(true)
      this.group.getWorldPosition(this.lensPos)
      this.dir.set(0, 1, 0).transformDirection(this.group.matrixWorld)
      this.right.set(1, 0, 0).transformDirection(this.group.matrixWorld)
      const half = (Math.max(1, s.beamAngle) / 2) * DEG
      projectors.add({
        position: this.lensPos.clone(),
        direction: this.dir.clone(),
        right: this.right.clone(),
        tanHalf: Math.tan(half),
        color: [s.color[0] * on * (this.candela / 1200), s.color[1] * on * (this.candela / 1200), s.color[2] * on * (this.candela / 1200)],
        goboCell: goboCell(s.gobo),
        goboTurn: this.goboTurn,
        prismSpread: prism ? Math.tan(Math.min(80, s.beamAngle * 1.2) * DEG) / Math.tan(half) : 0,
        prismTurn: this.prismTurn,
        reach: this.reach < BEAM_LENGTH ? this.reach : undefined
      })
    }
    if (this.light) {
      this.root.updateMatrixWorld(true)
      this.group.getWorldPosition(this.lensPos)
      this.dir.set(0, 1, 0).transformDirection(this.group.matrixWorld)
      this.root.worldToLocal(this.light.position.copy(this.lensPos))
      this.root.worldToLocal(this.light.target.position.copy(this.lensPos).addScaledVector(this.dir, 10))
      this.light.color.setRGB(...s.color)
      this.light.intensity = this.candela * on * 4
      this.light.distance = this.reach < BEAM_LENGTH ? this.reach + 0.3 : 0
      this.light.angle = Math.min(Math.PI / 2.3, (Math.max(2, s.beamAngle) / 2) * DEG * (prism ? 2.2 : 1))
    }
  }

  dispose(): void {
    if (this.light) {
      spotlightsInUse--
      this.light.dispose()
    }
    this.lens.dispose()
    for (const m of this.materials) m.dispose()
    for (const b of this.beams) b.geometry.dispose()
  }
}

/** Meshes that glow in the head's colour: pixel cells, LED dots, strip segments. */
/**
 * How an edge-lit acrylic panel glows: brightest along its four edges, where the LED strip
 * shines in, softer towards the middle. (Null outside a browser.)
 */
function edgeGlowTexture(w: number, h: number): THREE.Texture | null {
  if (typeof document === 'undefined') return null
  const scale = 96 / Math.max(w, h)
  const cw = Math.max(8, Math.round(w * scale))
  const ch = Math.max(8, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const g = canvas.getContext('2d')
  if (!g) return null
  const image = g.createImageData(cw, ch)
  const falloff = Math.min(w, h) * 0.18
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const dx = Math.min(x + 0.5, cw - x - 0.5) / scale
      const dy = Math.min(y + 0.5, ch - y - 0.5) / scale
      const v = 0.3 + 0.7 * Math.max(Math.exp(-dx / falloff), Math.exp(-dy / falloff))
      const i = (y * cw + x) * 4
      image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.round(v * 255)
      image.data[i + 3] = 255
    }
  }
  g.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

class GlowEmitter implements Emitter {
  private material = glowMaterial()
  constructor(meshes: THREE.Mesh[], private gain = 2.5, private tint: [number, number, number] = [1, 1, 1]) {
    for (const m of meshes) m.material = this.material
  }
  update(s: HeadState): void {
    setGlow(this.material, [s.color[0] * this.tint[0], s.color[1] * this.tint[1], s.color[2] * this.tint[2]], s.intensity * this.gain)
  }
  dispose(): void {
    this.material.dispose()
  }
}

/**
 * A fog or haze machine's output: soft puffs drifting out of the nozzle, more and
 * thicker the higher the fog channel. Lit by the machine's own LEDs if it has them.
 */
class FogEmitter implements Emitter {
  private group = new THREE.Group()
  private puffs: Array<{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; phase: number }> = []
  private level = 0
  constructor(parent: THREE.Object3D, private reach: number) {
    parent.add(this.group)
    for (let i = 0; i < 9; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0, depthWrite: false })
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), material)
      this.group.add(mesh)
      this.puffs.push({ mesh, material, phase: i / 9 })
    }
  }
  update(s: HeadState, _haze: number, time: number): void {
    // The output builds up and fades away rather than switching instantly.
    this.level += (s.fog - this.level) * 0.08
    const lit = s.intensity > 0.02
    for (const p of this.puffs) {
      const t = (time * 0.35 + p.phase) % 1
      const size = (0.04 + t * 0.22) * this.reach * (0.5 + this.level * 0.5)
      p.mesh.position.set(Math.sin(p.phase * 9) * t * 0.12 * this.reach, t * 0.1 * this.reach, t * this.reach)
      p.mesh.scale.setScalar(Math.max(0.001, size))
      p.material.opacity = this.level * 0.22 * (1 - t) * Math.min(1, t * 6)
      if (lit) p.material.color.setRGB(0.55 + s.color[0] * 0.45 * s.intensity, 0.55 + s.color[1] * 0.45 * s.intensity, 0.55 + s.color[2] * 0.45 * s.intensity)
      else p.material.color.setRGB(0.85, 0.88, 0.92)
    }
    this.group.visible = this.level > 0.01
  }
  dispose(): void {
    for (const p of this.puffs) p.material.dispose()
  }
}

/** A derby: several narrow coloured beams fanned out, turning with the rotation channel. */
class DerbyEmitter implements Emitter {
  private group = new THREE.Group()
  private materials: THREE.ShaderMaterial[] = []
  private turn = 0
  constructor(parent: THREE.Object3D, count = 6) {
    parent.add(this.group)
    for (let i = 0; i < count; i++) {
      const cone = new THREE.ConeGeometry(1, 1, 16, 1, true)
      cone.rotateX(Math.PI)
      cone.translate(0, 0.5, 0)
      const material = createBeamMaterial()
      const beam = new THREE.Mesh(cone, material)
      const r = BEAM_LENGTH * 0.7 * Math.tan(2 * DEG)
      beam.scale.set(r, BEAM_LENGTH * 0.7, r)
      const a = (i / count) * Math.PI * 2
      beam.rotation.set(Math.cos(a) * 50 * DEG, 0, Math.sin(a) * 50 * DEG)
      this.group.add(beam)
      this.materials.push(material)
    }
  }
  update(s: HeadState, haze: number): void {
    // Turns only when its motor channel says so (or, without one, while it's lit): an
    // unlit derby with nothing sent used to keep turning slowly.
    this.turn += s.rotation * 0.05 + (s.intensity > 0.02 ? 0.002 : 0)
    this.group.rotation.y = this.turn
    this.group.visible = s.intensity > 0.002
    for (const m of this.materials) {
      m.uniforms.color.value.setRGB(...s.color)
      m.uniforms.intensity.value = s.intensity * 0.8
      m.uniforms.haze.value = haze
    }
  }
  dispose(): void {
    for (const m of this.materials) m.dispose()
  }
}

/**
 * A ball of lenses (ADJ Starburst): thin beams out through the lenses in every
 * direction, the lenses glowing, all turning with the motor channel.
 */
class BurstEmitter implements Emitter {
  private materials: THREE.ShaderMaterial[] = []
  private beams: THREE.Mesh[] = []
  private turn = 0
  private shown = ''
  constructor(private ball: THREE.Object3D, directions: THREE.Vector3[], radius: number, private lenses: GlowEmitter) {
    // A few materials, so a multi-colour setting can give neighbouring beams different colours.
    for (let k = 0; k < 7; k++) this.materials.push(createBeamMaterial())
    const length = BEAM_LENGTH * 0.6
    const r = length * Math.tan(1.2 * DEG)
    directions.forEach((dir, i) => {
      const cone = new THREE.ConeGeometry(1, 1, 8, 1, true)
      cone.rotateX(Math.PI)
      cone.translate(0, 0.5, 0)
      const beam = new THREE.Mesh(cone, this.materials[i % this.materials.length])
      beam.scale.set(r, length, r)
      beam.position.copy(dir).multiplyScalar(radius)
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      beam.renderOrder = 10
      ball.add(beam)
      this.beams.push(beam)
    })
  }
  private last = 0
  update(s: HeadState, haze: number, time: number): void {
    // Turns per second from the motor channel (minus = anticlockwise).
    const dt = this.last ? Math.min(0.1, Math.max(0, time - this.last)) : 0
    this.last = time
    this.turn += s.rotation * Math.PI * 2 * dt * 0.5
    this.ball.rotation.y = this.turn
    const list = s.colours
    const key = list ? list.map((c) => c.join()).join('|') : s.color.join()
    this.materials.forEach((m, k) => {
      const c = list ? list[k % list.length] : s.color
      if (key !== this.shown) m.uniforms.color.value.setRGB(...c)
      m.uniforms.intensity.value = s.intensity * 0.9
      m.uniforms.haze.value = haze
    })
    this.shown = key
    this.lenses.update(s)
    // Each beam lands as a spot on the floor, walls or ceiling, sweeping round as the ball turns.
    if (s.intensity > 0.01) {
      this.ball.updateWorldMatrix(true, true)
      this.beams.forEach((beam, i) => {
        const c = list ? list[i % this.materials.length % list.length] : s.color
        const k = s.intensity * 1.3
        spotRays.push({
          origin: new THREE.Vector3().setFromMatrixPosition(beam.matrixWorld),
          direction: new THREE.Vector3(0, 1, 0).transformDirection(beam.matrixWorld),
          color: [c[0] * k, c[1] * k, c[2] * k],
          tanHalf: Math.tan(1.2 * DEG)
        })
      })
    }
  }
  dispose(): void {
    for (const m of this.materials) m.dispose()
    this.lenses.dispose()
  }
}

/** `n` directions spread evenly over a sphere (a Fibonacci spiral), skipping the bottom where it sits on its base. */
function sphereDirections(n: number, skipBelow = -0.6): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  const total = Math.round(n / ((1 - skipBelow) / 2))
  for (let i = 0; i < total; i++) {
    const y = 1 - (2 * (i + 0.5)) / total
    if (y < skipBelow) continue
    const r = Math.sqrt(1 - y * y)
    const a = i * Math.PI * (3 - Math.sqrt(5))
    out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
  }
  return out
}

/**
 * A laser: fans of very thin lines, one fan per aperture (the Laserworld EL-900RGB has
 * four, each on its own pair of motors, so each fan sweeps on its own).
 *
 * Colour: the head's colour (a colour channel or RGB), or several at once ("red + green",
 * "multicolour": each line one of them, the rainbow ones changing over time). A laser
 * with no colour channel draws red and green lines, like a typical RG laser.
 */
class LaserEmitter implements Emitter {
  private fans: Array<{ lines: THREE.LineSegments; material: THREE.LineBasicMaterial; colors: THREE.BufferAttribute; phase: number }> = []
  private shown = ''
  private static readonly LINES = 24
  private spread = 40
  private pattern = 0

  /**
   * The lines' far ends for a pattern, like the real laser's figures: 0 a flat fan
   * (a sheet of light through haze), 1 a cone (a tunnel, a ring where it lands),
   * 2 a few separate beams in a V.
   */
  private static shape(positions: Float32Array, pattern: number, spread: number): void {
    const n = positions.length / 6
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0.5
      let x: number, y: number, z: number
      if (pattern === 1) {
        const a = u * Math.PI * 2
        const r = Math.tan(14 * DEG)
        ;[x, y, z] = [Math.cos(a) * r, 0.5 + Math.sin(a) * r, -1]
      } else if (pattern === 2) {
        const a = (Math.round(u * 3) / 3 - 0.5) * spread * 1.2 * DEG
        ;[x, y, z] = [Math.sin(a), Math.cos(a) * 0.5, -Math.cos(a)]
      } else {
        const a = (u - 0.5) * spread * DEG
        ;[x, y, z] = [Math.sin(a), Math.cos(a) * 0.5, -Math.cos(a)]
      }
      const len = 12 / Math.hypot(x, y, z)
      positions.set([0, 0, 0, x * len, y * len, z * len], i * 6)
    }
  }

  /** `byChannel`: a laser channel switches it on and picks the pattern; otherwise it follows the head's intensity. */
  constructor(parent: THREE.Object3D, private byChannel = true, private coloured = false, apertures = 1, width = 0.2) {
    const n = Math.max(1, Math.min(8, apertures))
    const lines = n > 1 ? LaserEmitter.LINES : 40
    this.spread = n > 1 ? 40 : 93
    for (let k = 0; k < n; k++) {
      const positions = new Float32Array(lines * 6)
      LaserEmitter.shape(positions, 0, this.spread)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const colors = new THREE.BufferAttribute(new Float32Array(lines * 6).fill(1), 3)
      geometry.setAttribute('color', colors)
      const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false })
      const fan = new THREE.LineSegments(geometry, material)
      // Several apertures sit along a curved front, each turned a little further out.
      const x = n > 1 ? ((k / (n - 1)) - 0.5) * width * 0.7 : 0
      const holder = new THREE.Group()
      holder.position.x = x
      holder.rotation.y = n > 1 ? -((k / (n - 1)) - 0.5) * 60 * DEG : 0
      holder.add(fan)
      parent.add(holder)
      this.fans.push({ lines: fan, material, colors, phase: k * 1.7 })
    }
  }

  /** Line colours: `list` repeated along the fans (offset per fan), or red/green, or white (tinted by the material). */
  private paint(list: Array<[number, number, number]> | null, offset: number): void {
    this.fans.forEach((fan, k) => {
      const arr = fan.colors.array as Float32Array
      const n = arr.length / 6
      for (let i = 0; i < n; i++) {
        const c = list ? list[(i + k * 2 + offset) % list.length] : [1, 1, 1]
        arr.set([...c, ...c], i * 6)
      }
      fan.colors.needsUpdate = true
    })
  }

  update(s: HeadState, _haze: number, time: number): void {
    const lit = Math.max(...s.color) > 0.02
    const on = this.byChannel ? s.rotation > 0.02 && (!this.coloured || (lit && s.intensity > 0.02)) : s.intensity > 0.02 && lit
    // Which colours to show; repaint only when they change.
    const list = s.colours ?? (this.coloured || !this.byChannel ? null : RED_GREEN)
    const offset = list && list.length > 2 ? Math.floor(time * 1.5) : 0
    const key = list ? `${list.map((c) => c.join()).join('|')}@${offset}` : 'one'
    if (key !== this.shown) {
      this.paint(list, offset)
      this.shown = key
    }
    // A single colour tints the white lines; several colours keep their own.
    const peak = Math.max(...s.color, 0.0001)
    const tint: [number, number, number] = list ? [1, 1, 1] : [s.color[0] / peak, s.color[1] / peak, s.color[2] / peak]
    // The figure: from the pattern channel when there is one, otherwise changing every few seconds, like its shows.
    const pattern = s.gobo > 0 ? s.gobo % 3 : Math.floor(time / 6 + this.fans[0].phase) % 3
    if (pattern !== this.pattern && on) {
      this.pattern = pattern
      for (const fan of this.fans) {
        const pos = fan.lines.geometry.getAttribute('position') as THREE.BufferAttribute
        LaserEmitter.shape(pos.array as Float32Array, pattern, this.spread)
        pos.needsUpdate = true
      }
    }
    for (const fan of this.fans) {
      fan.lines.visible = on
      fan.material.opacity = 0.7
      fan.material.color.setRGB(...tint)
      fan.lines.rotation.y = Math.sin(time * (0.5 + s.rotation * 3) + fan.phase) * (this.fans.length > 1 ? 0.35 : 0.6)
      fan.lines.rotation.x = Math.sin(time * 0.7 + fan.phase * 0.6) * 0.15
    }
  }
  dispose(): void {
    for (const fan of this.fans) {
      fan.lines.geometry.dispose()
      fan.material.dispose()
    }
  }
}

const RED_GREEN: Array<[number, number, number]> = [[1, 0.1, 0.05], [0.1, 1, 0.1]]

/** Does this head choose its own colour (a colour macro or wheel, or RGB)? */
const hasColour = (h: HeadDef) => !!(h.ch.colorWheel || h.ch.red || h.ch.green || h.ch.blue)
/** Does this head have its own red, green, blue or white channels? */
const hasMix = (h: HeadDef) => !!(h.ch.red || h.ch.green || h.ch.blue || h.ch.white)
/** A Double Helix bar's four LEDs, in order. */
const LED_COLOURS: Array<[number, number, number]> = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0.95, 0.88]]

// ---------------------------------------------------------------------------
// Bodies, built to size.
// ---------------------------------------------------------------------------

const bodyMaterial = () => new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.55, metalness: 0.35 })

function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
}

function cylinder(r: number, h: number, m: THREE.Material, segments = 24): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), m)
}

/** Positions of `n` LEDs packed in a hexagon-ish disc of radius r (1, 6, 12...). */
function hexLayout(n: number, r: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[0, 0]]
  let ring = 1
  while (out.length < n) {
    const count = ring * 6
    for (let i = 0; i < count && out.length < n; i++) {
      const a = (i / count) * Math.PI * 2
      out.push([Math.cos(a) * ring, Math.sin(a) * ring])
    }
    ring++
  }
  const scale = r / Math.max(1, ring - 1)
  return out.map(([x, y]) => [x * scale, y * scale])
}

/**
 * `n` LEDs on a round face of radius r, in rings like a real PAR (12 = 4 + 8,
 * 18 = 6 + 12, 7 = 1 + 6). `spacing` is the gap between neighbours, to size the dots.
 */
export function roundLayout(n: number, r: number): { points: Array<[number, number]>; spacing: number } {
  if (n <= 1) return { points: [[0, 0]], spacing: r * 2 }
  if (n <= 7) {
    // One ring, with one in the middle when there are 7.
    const ring = n === 7 ? 6 : n
    const rr = r * 0.62
    const points: Array<[number, number]> = Array.from({ length: ring }, (_, i) => [Math.cos((i / ring) * Math.PI * 2) * rr, Math.sin((i / ring) * Math.PI * 2) * rr])
    if (n === 7) points.push([0, 0])
    return { points, spacing: Math.min(rr, 2 * rr * Math.sin(Math.PI / ring)) }
  }
  const rings = Math.max(2, Math.round(Math.sqrt(n / 3.2)))
  const weights = Array.from({ length: rings }, (_, i) => i + 1)
  const total = weights.reduce((a, b) => a + b, 0)
  const counts = weights.map((w) => Math.max(3, Math.round((n * w) / total)))
  counts[rings - 1] += n - counts.reduce((a, b) => a + b, 0)
  const points: Array<[number, number]> = []
  let spacing = r
  counts.forEach((c, i) => {
    const rr = (r * (i + 1)) / rings
    const turn = i % 2 ? Math.PI / c : 0
    for (let k = 0; k < c; k++) points.push([Math.cos(turn + (k / c) * Math.PI * 2) * rr, Math.sin(turn + (k / c) * Math.PI * 2) * rr])
    spacing = Math.min(spacing, r / rings, 2 * rr * Math.sin(Math.PI / c))
  })
  return { points, spacing }
}

interface Mover {
  head: number
  yoke: THREE.Group
  tilt: THREE.Group
  pan: number
  tiltAngle: number
}

export class FixtureRig {
  /** The stand drawn under it, if its kind has one (a GigBar's pole). */
  private stand: THREE.Object3D | null = null
  readonly root = new THREE.Group()
  readonly fixtureId: string
  readonly typeId: string
  readonly mounting: Fixture['mounting']
  private body = bodyMaterial()
  private mount = new THREE.Group() // turns the whole fixture (hanging, aim)
  private emitters: Array<Emitter | null> = []
  private movers: Mover[] = []
  private heads: HeadDef[]
  private spec: FixtureSpec
  private invertPan = false
  private invertTilt = false

  /** The type object it was built from; a re-import replaces it, so the rig is rebuilt. */
  readonly typeVersion: FixtureType
  /** The fixture's own look settings it was built with (an acrylic panel's size and frame): rebuilt when they change. */
  readonly lookKey: string

  constructor(fixture: Fixture, private type: FixtureType) {
    this.typeVersion = type
    this.fixtureId = fixture.id
    this.typeId = fixture.typeId
    this.mounting = fixture.mounting
    this.heads = headsOf(type)
    this.spec = type.spec ?? specFor(type.name, type.body === 'movingHead')
    if (!type.spec && type.body === 'bar') this.spec = specFor('pixel tube', false)
    // An LED acrylic panel can have its own size and frame colour.
    this.lookKey = JSON.stringify(fixture.panel ?? null)
    if (this.spec.look === 'acrylic' && fixture.panel) {
      const [w, h, d] = this.spec.size
      this.spec = { ...this.spec, size: [fixture.panel.width ?? w, fixture.panel.height ?? h, d], bodyColor: fixture.panel.border ? PANEL_BORDERS[fixture.panel.border] : this.spec.bodyColor }
    }
    if (this.spec.look === 'acrylic' && this.spec.bodyColor === PANEL_BORDERS.silver) Object.assign(this.body, { metalness: 0.45, roughness: 0.35 })
    // A white frame reads white even in a dark room.
    if (this.spec.look === 'acrylic' && this.spec.bodyColor === PANEL_BORDERS.white && 'emissive' in this.body) (this.body as THREE.MeshStandardMaterial).emissive.set(0x3a3a3c)
    if (this.spec.bodyColor) this.body.color.set(this.spec.bodyColor)
    this.emitters = this.heads.map(() => null)
    this.root.add(this.mount)
    this.build()
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.userData.fixtureId = fixture.id
      // Beams of light (haze cones, laser fans) aren't part of the fixture: clicks go
      // through them to whatever is behind, so you pick the fixture, not its beam.
      if ((o instanceof THREE.Mesh && o.material instanceof THREE.ShaderMaterial) || o instanceof THREE.LineSegments) o.raycast = () => {}
    })
    this.place(fixture)
  }

  private headIndex(test: (h: HeadDef) => boolean): number[] {
    return this.heads.map((h, i) => (test(h) ? i : -1)).filter((i) => i >= 0)
  }

  /** A yoke + head mover, built to the spec's size. Returns the tilting group, lens pointing +Y. */
  private buildMover(parent: THREE.Object3D, headIndex: number, size: [number, number, number], x = 0, wash = false): THREE.Group {
    const [w, h, d] = size
    const baseH = h * 0.22
    const base = box(w, baseH, d, this.body)
    base.position.set(x, baseH / 2, 0)
    parent.add(base)
    const yoke = new THREE.Group()
    yoke.position.set(x, baseH, 0)
    parent.add(yoke)
    const armH = h * 0.62
    const headR = wash ? Math.min(w, d) * 0.52 : Math.min(w, d) * 0.36
    for (const side of [-1, 1]) {
      const arm = box(w * 0.08, armH, d * 0.45, this.body)
      arm.position.set(side * (headR + w * 0.06), armH / 2, 0)
      yoke.add(arm)
    }
    const tilt = new THREE.Group()
    tilt.position.y = armH * 0.62
    yoke.add(tilt)
    const headLen = wash ? h * 0.32 : h * 0.55
    const can = new THREE.Mesh(new THREE.CylinderGeometry(headR * (wash ? 1 : 0.92), headR, headLen, 28), this.body)
    tilt.add(can)
    this.movers.push({ head: headIndex, yoke, tilt, pan: 0, tiltAngle: 0 })
    return tilt
  }

  /**
   * Lasers whose own part has no colour channel take the colour of the part that has
   * one (a SoundSwitch definition can put the colour wheel in another part).
   */
  private colourFrom = new Map<number, number>()
  private laserAt(holder: THREE.Object3D, i: number): LaserEmitter {
    const own = hasColour(this.heads[i])
    const other = own ? -1 : this.headIndex((x) => hasColour(x) && x.role !== 'derby')[0] ?? -1
    if (other >= 0) this.colourFrom.set(i, other)
    return new LaserEmitter(holder, !!this.heads[i].ch.laser, own || other >= 0, this.spec.look === 'laser' ? this.spec.apertures ?? 1 : 1, this.spec.size[0])
  }

  private build(): void {
    const s = this.spec
    const [w, h, d] = s.size
    const beamHeads = this.headIndex((x) => x.role === 'beam')
    const candela = this.type.candela

    // Several moving heads on one fixture (Hydrabeam, Crazy Pocket, Duo Q-Beam): one small
    // mover for each, side by side, each following its own pan and tilt.
    const moverHeads = this.headIndex((x) => !!(x.ch.pan || x.ch.tilt))
    if ((s.look === 'mover' || s.look === 'moverWash') && moverHeads.length > 1) {
      const n = moverHeads.length
      const step = w / n
      const each: [number, number, number] = [step * 0.95, h, Math.min(d, step * 1.1)]
      moverHeads.forEach((i, k) => {
        const x = -w / 2 + step * (k + 0.5)
        const tilt = this.buildMover(this.mount, i, each, x, s.look === 'moverWash')
        const headLen = s.look === 'moverWash' ? h * 0.32 : h * 0.55
        this.emitters[i] = new BeamEmitter(tilt, this.root, Math.min(each[0], each[2]) * 0.24, headLen / 2 + 0.002, candela / n, 0)
      })
      return
    }

    switch (s.look) {
      case 'mover':
      case 'moverWash': {
        const main = beamHeads[0] ?? 0
        const tilt = this.buildMover(this.mount, main, s.size, 0, s.look === 'moverWash')
        const headLen = s.look === 'moverWash' ? h * 0.32 : h * 0.55
        const lensR = Math.min(w, d) * (s.look === 'moverWash' ? 0.42 : 0.24)
        this.emitters[main] = new BeamEmitter(tilt, this.root, lensR, headLen / 2 + 0.002, candela, s.look === 'mover' ? 3 : 0)
        if (s.look === 'moverWash') {
          // The 19 LED lenses, glowing in the beam colour.
          const count = s.leds ?? ledsFromName(this.type.name) ?? 19
          const dots = hexLayout(count, lensR * 0.8).map(([x, z]) => {
            const m = new THREE.Mesh(new THREE.CircleGeometry(lensR * (count <= 7 ? 0.24 : 0.13), 16))
            m.rotation.x = -Math.PI / 2
            m.position.set(x, headLen / 2 + 0.004, z)
            tilt.add(m)
            return m
          })
          // Pixel modes light each LED from its own channels; otherwise they glow with the beam.
          const pixels = this.headIndex((x) => x.role === 'pixel')
          if (pixels.length) {
            pixels.forEach((i, k) => {
              this.emitters[i] = new GlowEmitter(dots.filter((_, d) => d % pixels.length === k), 3)
            })
          } else {
            this.dotsFollow = new GlowEmitter(dots, 3)
            this.dotsHead = main
          }
        }
        // A halo ring around the lens: its own head if the fixture has one, else follows the beam.
        if (s.halo) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(lensR * 1.15, lensR * 0.08, 8, 40))
          ring.rotation.x = Math.PI / 2
          ring.position.y = headLen / 2 + 0.003
          tilt.add(ring)
          const halo = this.headIndex((x) => x.role === 'halo')[0]
          if (halo !== undefined) this.emitters[halo] = new GlowEmitter([ring], 2)
          else ring.material = this.body
        }
        break
      }

      case 'gigbar': {
        // A T-bar on a stand: the bar sits at the fixture's position.
        const bar = box(w, 0.06, d * 0.8, this.body)
        bar.position.y = 0.03
        this.mount.add(bar)
        // Its own stand, unless it has none (Fixture Studio) or this one is left off it (hideStand).
        if (hasOwnStand(this.spec)) {
          const pole = cylinder(0.02, 2.2, this.body, 10)
          pole.position.y = -1.1
          this.mount.add(pole)
          this.stand = pole
        }
        // Like the real bar: movers at the ends, then derbies, then pars, strobes and laser
        // in the middle. Works from the heads' roles, so any GigBar layout fits.
        const leftFirst = (list: number[]) =>
          [...list].sort((a, b) => Number(/right/i.test(this.heads[a].name)) - Number(/right/i.test(this.heads[b].name)) || a - b)
        const moverHeads = leftFirst(this.headIndex((x) => !!(x.ch.pan || x.ch.tilt)))
        const derbyHeads = leftFirst(this.headIndex((x) => x.role === 'derby'))
        const parHeads = leftFirst(this.headIndex((x) => (x.role === 'beam' || x.role === 'pixel' || x.role === 'halo') && !x.ch.pan && !x.ch.tilt))
        const slots: Array<[number, number]> = []
        const pairUp = (list: number[], outer: number) => {
          list.forEach((i, k) => {
            const n = list.length
            const x = n === 1 ? -outer : n === 2 ? (k === 0 ? -outer : outer) : -outer + (2 * outer * k) / (n - 1)
            slots.push([i, x])
          })
        }
        pairUp(moverHeads, 0.47)
        pairUp(derbyHeads, 0.3)
        pairUp(parHeads, 0.14)
        for (const [i, x] of slots) {
          const head = this.heads[i]
          if (head.ch.pan || head.ch.tilt) {
            const tilt = this.buildMover(this.mount, i, [0.13, 0.2, 0.11], x * w)
            this.mount.children.at(-2)!.position.y += 0.06 // sit the mini mover on the bar
            this.mount.children.at(-1)!.position.y += 0.06
            this.emitters[i] = new BeamEmitter(tilt, this.root, 0.03, 0.06, candela * 0.6)
          } else if (head.role === 'derby') {
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.body)
            dome.position.set(x * w, 0.06, 0)
            this.mount.add(dome)
            const holder = new THREE.Group()
            holder.position.set(x * w, 0.1, 0)
            this.mount.add(holder)
            this.emitters[i] = new DerbyEmitter(holder)
          } else {
            const can = cylinder(0.055, 0.08, this.body)
            can.position.set(x * w, 0.1, 0)
            this.mount.add(can)
            const aim = new THREE.Group()
            aim.position.set(x * w, 0.14, 0)
            aim.rotation.x = -0.35
            this.mount.add(aim)
            this.emitters[i] = new BeamEmitter(aim, this.root, 0.045, 0, candela * 0.5)
          }
        }
        // Strobes: small panels in the middle of the bar, facing the audience.
        const strobes = this.headIndex((x) => x.role === 'strobe')
        strobes.forEach((i, n) => {
          const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.035))
          panel.position.set((n - (strobes.length - 1) / 2) * 0.045, 0.03, d * 0.41)
          this.mount.add(panel)
          this.emitters[i] = new GlowEmitter([panel], 4)
        })
        const laser = this.headIndex((x) => x.role === 'laser')[0]
        if (laser !== undefined) {
          const holder = new THREE.Group()
          holder.position.set(0, 0.08, 0.04)
          this.mount.add(holder)
          this.emitters[laser] = this.laserAt(holder, laser)
        }
        break
      }

      case 'tube': {
        const pixels = this.headIndex((x) => x.role === 'pixel' || x.role === 'beam')
        const n = Math.max(1, pixels.length)
        const r = w / 2
        const base = cylinder(0.09, 0.03, this.body, 20)
        base.position.y = 0.015
        this.mount.add(base)
        const cap = (y: number) => {
          const c = cylinder(r * 1.05, 0.02, this.body)
          c.position.y = y
          this.mount.add(c)
        }
        cap(0.04)
        cap(h + 0.02)
        const segH = (h - 0.04) / n
        pixels.forEach((i, k) => {
          const seg = cylinder(r, segH * 0.96, glowMaterial(), 16)
          seg.position.y = 0.05 + segH * (k + 0.5)
          this.mount.add(seg)
          this.emitters[i] = new GlowEmitter([seg], 2.2)
        })
        break
      }

      case 'bar': {
        const housing = box(w, h, d, this.body)
        housing.position.y = h / 2
        this.mount.add(housing)
        const sections = this.headIndex((x) => x.role === 'pixel' && !/warm/i.test(x.name))
        const warm = this.headIndex((x) => /warm/i.test(x.name))
        const white = this.headIndex((x) => x.role === 'strobe')
        const row = (list: number[], y: number, height: number, tint?: [number, number, number], gain = 2.4) => {
          const step = (w * 0.94) / Math.max(1, list.length)
          list.forEach((i, k) => {
            const cell = new THREE.Mesh(new THREE.PlaneGeometry(step * 0.85, height))
            cell.position.set(-w * 0.47 + step * (k + 0.5), y, d / 2 + 0.001)
            this.mount.add(cell)
            this.emitters[i] = new GlowEmitter([cell], gain, tint)
          })
        }
        row(sections, h * 0.72, h * 0.28)
        row(warm, h * 0.42, h * 0.16, [1, 0.75, 0.45])
        row(white, h * 0.2, h * 0.1, undefined, 4)
        // Anything else that makes light (a single-zone mode) lights the whole face.
        const rest = this.headIndex((x) => x.role === 'pixel' || x.role === 'beam').filter((i) => !this.emitters[i])
        if (rest.length) row(rest, h * 0.5, h * 0.8)
        break
      }

      case 'string': {
        // Bulbs along a cable that sags between its two ends. Built the right way up
        // whether it hangs (from a truss) or stands (between two posts at its height).
        const holder = new THREE.Group()
        if (this.mounting === 'hanging') holder.rotation.z = Math.PI
        this.mount.add(holder)
        const top = this.mounting === 'hanging' ? 0 : h
        const sag = Math.max(0.05, h * 0.6)
        const at = (u: number) => new THREE.Vector3(-w / 2 + w * u, top - sag * 4 * u * (1 - u), 0)
        const curve = new THREE.CatmullRomCurve3(Array.from({ length: 17 }, (_, k) => at(k / 16)))
        holder.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.004, 5, false), this.body))
        // One part per bulb when the bulbs have their own channels; otherwise the whole string is one light.
        const each = this.headIndex((x) => x.role === 'pixel' || x.role === 'beam')
        const bulbsOf = each.length > 1 ? each : []
        const count = bulbsOf.length || Math.max(6, Math.round(w / 0.35))
        const r = Math.max(0.015, Math.min(0.04, d * 0.5))
        const meshes: THREE.Mesh[] = []
        for (let k = 0; k < count; k++) {
          const p = at((k + 0.5) / count)
          const socket = cylinder(r * 0.45, r * 1.2, this.body, 10)
          socket.position.set(p.x, p.y - r * 0.6, 0)
          holder.add(socket)
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), glowMaterial())
          bulb.position.set(p.x, p.y - r * 1.9, 0)
          holder.add(bulb)
          meshes.push(bulb)
        }
        if (bulbsOf.length) bulbsOf.forEach((i, k) => (this.emitters[i] = new GlowEmitter([meshes[k]], 2.6)))
        else {
          const main = this.headIndex((x) => x.role !== 'master')[0] ?? 0
          this.emitters[main] = new GlowEmitter(meshes, 2.6)
        }
        break
      }

      case 'strip': {
        const strip = box(w, h, d, glowMaterial())
        strip.position.y = h / 2
        this.mount.add(strip)
        const i = this.headIndex((x) => x.role !== 'master')[0] ?? 0
        this.emitters[i] = new GlowEmitter([strip], 2.5)
        break
      }

      case 'cluster':
      case 'panel': {
        // A face of cells: round lenses on a frame (cluster) or square cells (panel).
        // Each cell glows in its part's colour; parts sharing a cell are drawn as a
        // centre lens and a ring around it (a warm white COB inside an RGB ring).
        const aim = new THREE.Group()
        this.mount.add(aim)
        aim.position.y = d * 0.5
        this.aimGroup = aim
        const round = s.look === 'cluster'
        const housing = round ? cylinder(Math.max(w, h) / 2, d * 0.7, this.body, 40) : box(w, d * 0.7, h, this.body)
        aim.add(housing)
        const faceY = d * 0.35 + 0.002
        const lights = this.headIndex((x) => x.role !== 'master' && x.role !== 'laser' && x.role !== 'derby')
        const cellOf = (i: number, k: number) => this.heads[i].cell ?? k
        const cellIds = [...new Set(lights.map((i, k) => cellOf(i, k)))].sort((a, b) => a - b)
        const n = Math.max(1, cellIds.length)
        const pos = cellPositions(n, s.layout, w / Math.max(0.01, h))
        // Each cell as big as it can be without touching its nearest neighbour.
        const pts = pos.map(([px, py]) => [(px * w) / 2, (py * h) / 2])
        let nearest = Infinity
        for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) nearest = Math.min(nearest, Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]))
        const pitch = n <= 1 ? Math.min(w, h) * 0.38 : nearest * 0.42
        const bezel = new THREE.MeshStandardMaterial({ color: 0x3c3f45, roughness: 0.4, metalness: 0.5 })
        cellIds.forEach((cell, c) => {
          const [px, py] = pos[c] ?? [0, 0]
          const x = (px * w) / 2
          const z = (-py * h) / 2
          const parts = lights.filter((i, k) => cellOf(i, k) === cell)
          // A metal bezel around each cell, so the layout shows even when it's dark.
          const rim = new THREE.Mesh(round ? new THREE.RingGeometry(pitch * 1.0, pitch * 1.16, 32) : new THREE.RingGeometry(pitch * 1.45, pitch * 1.6, 4, 1, Math.PI / 4), bezel)
          rim.rotation.x = -Math.PI / 2
          rim.position.set(x, faceY - 0.0005, z)
          aim.add(rim)
          parts.forEach((i, k) => {
            const inner = k === 0
            const geo = round
              ? inner ? new THREE.CircleGeometry(parts.length > 1 ? pitch * 0.62 : pitch, 28) : new THREE.RingGeometry(pitch * 0.72, pitch, 32)
              : inner ? new THREE.PlaneGeometry(pitch * 1.9, pitch * 1.9) : new THREE.RingGeometry(pitch * 1.1, pitch * 1.35, 4, 1, Math.PI / 4)
            const m = new THREE.Mesh(geo)
            m.rotation.x = -Math.PI / 2
            m.position.set(x, faceY + 0.001 * k, z)
            aim.add(m)
            this.emitters[i] = new GlowEmitter([m], 2.6)
          })
        })
        // One soft beam for the whole face: the mix of its cells.
        const beamHolder = new THREE.Group()
        beamHolder.position.y = faceY
        aim.add(beamHolder)
        if (lights.length) this.extraBeam = { emitter: new BeamEmitter(beamHolder, this.root, 0.001, 0, candela, 0), heads: lights }
        for (const i of this.headIndex((x) => x.role === 'laser' || x.role === 'derby')) {
          const holder = new THREE.Group()
          holder.position.y = faceY
          aim.add(holder)
          this.emitters[i] = this.heads[i].role === 'laser' ? this.laserAt(holder, i) : new DerbyEmitter(holder)
        }
        break
      }

      case 'laser':
      case 'derby':
      case 'strobe': {
        // A small box. Lasers and derbies throw their beams up and out from the top;
        // a strobe's whole top face flashes.
        const aim = new THREE.Group()
        this.mount.add(aim)
        aim.position.y = h * 0.5
        this.aimGroup = aim
        aim.add(box(w, h, d, this.body))
        const top = h / 2 + 0.002
        if (s.look === 'strobe') {
          const panel = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, d * 0.8))
          panel.rotation.x = -Math.PI / 2
          panel.position.y = top
          aim.add(panel)
          const lights = this.headIndex((x) => x.role !== 'master')
          const main = lights[0] ?? 0
          this.emitters[main] = new GlowEmitter([panel], 4)
          const holder = new THREE.Group()
          holder.position.y = top
          aim.add(holder)
          this.extraBeam = { emitter: new BeamEmitter(holder, this.root, 0.001, 0, candela, 0), heads: lights.length ? lights : [main] }
          break
        }
        const dome = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, d) * 0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.body)
        dome.position.y = top
        aim.add(dome)
        const holder = new THREE.Group()
        holder.position.y = top + 0.02
        aim.add(holder)
        const effectHeads = this.headIndex((x) => x.role !== 'master')
        effectHeads.forEach((i, k) => {
          if (k === 0 || this.heads[i].role === 'laser' || this.heads[i].role === 'derby') {
            const asLaser = this.heads[i].role === 'laser' || (s.look === 'laser' && this.heads[i].role !== 'derby')
            this.emitters[i] = asLaser ? this.laserAt(holder, i) : new DerbyEmitter(holder)
          }
        })
        break
      }
      case 'fog': {
        // A box on the floor with a nozzle at the front; the fog drifts out of it.
        const aim = new THREE.Group()
        this.mount.add(aim)
        aim.position.y = h * 0.5
        aim.add(box(w, h, d, this.body))
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, h) * 0.12, Math.min(w, h) * 0.14, d * 0.12, 16), this.body)
        nozzle.rotation.x = Math.PI / 2
        nozzle.position.z = d / 2 + d * 0.06
        aim.add(nozzle)
        const out = new THREE.Group()
        out.position.z = d / 2 + d * 0.12
        aim.add(out)
        const fogHead = this.headIndex((x) => !!x.ch.fog)[0] ?? 0
        this.emitters[fogHead] = new FogEmitter(out, Math.max(0.9, d * 3))
        // LEDs on the front (some machines light their fog): a glowing ring round the nozzle.
        const leds = this.headIndex((x) => !!(x.ch.red || x.ch.white) && !x.ch.fog)
        const ledHead = leds[0] ?? (this.heads[fogHead]?.ch.red ? fogHead : -1)
        if (ledHead >= 0) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, h) * 0.22, Math.min(w, h) * 0.04, 8, 24))
          ring.position.z = d / 2 + 0.002
          aim.add(ring)
          if (ledHead === fogHead) {
            const glow = new GlowEmitter([ring], 2.5)
            const fog = this.emitters[fogHead]!
            this.emitters[fogHead] = { update: (st, hz, t) => (fog.update(st, hz, t), glow.update(st)), dispose: () => (fog.dispose(), glow.dispose()) }
          } else this.emitters[ledHead] = new GlowEmitter([ring], 2.5)
        }
        break
      }
      case 'sphere': {
        // A base, a short neck and the ball of lenses on it.
        const baseH = h * 0.22
        const base = box(w, baseH, d * 0.72, this.body)
        base.position.y = baseH / 2
        this.mount.add(base)
        const R = Math.min(w, d) * 0.46
        const neck = cylinder(R * 0.28, 0.04, this.body, 16)
        neck.position.y = baseH + 0.02
        this.mount.add(neck)
        const ball = new THREE.Group()
        ball.position.y = baseH + 0.04 + R
        this.mount.add(ball)
        ball.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.97, 24, 16), this.body))
        // Lenses all over it, each a small glowing disc facing out.
        const dirs = sphereDirections(s.leds ?? 56)
        const up = new THREE.Vector3(0, 0, 1)
        const discs = dirs.map((dir) => {
          const m = new THREE.Mesh(new THREE.CircleGeometry(R * 0.13, 12))
          m.position.copy(dir).multiplyScalar(R * 0.99)
          m.quaternion.setFromUnitVectors(up, dir)
          ball.add(m)
          return m
        })
        const light = this.headIndex((x) => hasMix(x) || !!x.ch.dimmer)[0] ?? 0
        // Every other lens throws a beam (a beam from all of them is a lot to draw).
        this.emitters[light] = new BurstEmitter(ball, dirs.filter((_, i) => i % 2 === 0), R, new GlowEmitter(discs, 3))
        break
      }
      case 'acrylic': {
        // A frame round a frosted acrylic panel, standing up and facing the audience (+z).
        // The LED strip inside the frame lights the panel from its edges: brightest at the
        // edges, softer in the middle.
        const f = Math.max(0.012, Math.min(0.035, Math.min(w, h) * 0.06))
        const bar = (bw: number, bh: number, x: number, y: number) => {
          const m = box(bw, bh, d, this.body)
          m.position.set(x, y, 0)
          this.mount.add(m)
        }
        bar(w, f, 0, f / 2)
        bar(w, f, 0, h - f / 2)
        bar(f, h - 2 * f, -w / 2 + f / 2, h / 2)
        bar(f, h - 2 * f, w / 2 - f / 2, h / 2)
        const iw = w - 2 * f
        const ih = h - 2 * f
        const face = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih))
        face.position.set(0, h / 2, 0)
        const rimWidth = Math.min(iw, ih) * 0.035
        const outline = new THREE.Shape([new THREE.Vector2(-iw / 2, -ih / 2), new THREE.Vector2(iw / 2, -ih / 2), new THREE.Vector2(iw / 2, ih / 2), new THREE.Vector2(-iw / 2, ih / 2)])
        outline.holes.push(new THREE.Path([new THREE.Vector2(-iw / 2 + rimWidth, -ih / 2 + rimWidth), new THREE.Vector2(-iw / 2 + rimWidth, ih / 2 - rimWidth), new THREE.Vector2(iw / 2 - rimWidth, ih / 2 - rimWidth), new THREE.Vector2(iw / 2 - rimWidth, -ih / 2 + rimWidth)]))
        const rims = [1, -1].map((side) => {
          const rim = new THREE.Mesh(new THREE.ShapeGeometry(outline))
          rim.position.set(0, h / 2, side * 0.002)
          if (side < 0) rim.rotation.y = Math.PI
          return rim
        })
        this.mount.add(face, ...rims)
        const light = this.headIndex((x) => hasMix(x) || !!x.ch.dimmer)[0] ?? 0
        const panel = new GlowEmitter([face], 2.4)
        const edges = new GlowEmitter(rims, 3.2)
        const faceMaterial = face.material as THREE.MeshBasicMaterial
        faceMaterial.side = THREE.DoubleSide
        // Frosted acrylic: bright along the edges where the strip is, fading to a soft glow in the middle.
        const glowMap = edgeGlowTexture(iw, ih)
        if (glowMap) {
          faceMaterial.map = glowMap
          faceMaterial.needsUpdate = true
        }
        const root = this.root
        const output = this.spec.output
        this.emitters[light] = {
          update: (st) => {
            edges.update(st)
            panel.update(st)
            // It washes the floor and whatever is in front of it with its colour.
            if (st.intensity > 0.02) {
              root.updateMatrixWorld(true)
              const position = new THREE.Vector3(0, h / 2, 0.05).applyMatrix4(face.parent!.matrixWorld)
              const direction = new THREE.Vector3(0, -0.35, 1).normalize().transformDirection(face.parent!.matrixWorld)
              const k = st.intensity * output
              projectors.add({ position, direction, right: new THREE.Vector3(1, 0, 0).transformDirection(face.parent!.matrixWorld), tanHalf: 2.2, color: [st.color[0] * k, st.color[1] * k, st.color[2] * k], goboCell: 0, goboTurn: 0, prismSpread: 0, prismTurn: 0 })
            }
          },
          dispose: () => (glowMap?.dispose(), panel.dispose(), edges.dispose())
        }
        break
      }
      case 'twinbar': {
        // Two bars side by side on a low base, each turning about its long axis on its own
        // motor, each with four single-colour LEDs (red, green, blue, white) in a row.
        const baseH = h * 0.32
        const base = box(w, baseH, d, this.body)
        base.position.y = baseH / 2
        this.mount.add(base)
        const tiltHeads = this.headIndex((x) => !!x.ch.tilt)
        const coloured = this.headIndex(hasMix)
        const barR = Math.min(d * 0.2, h * 0.3)
        this.twinBars = [0, 1].map((k) => {
          const own = tiltHeads[k]
          const yoke = new THREE.Group()
          yoke.position.set(0, baseH + barR * 1.1, (k - 0.5) * d * 0.48)
          this.mount.add(yoke)
          const tilt = new THREE.Group()
          yoke.add(tilt)
          tilt.add(box(w * 0.94, barR * 2, barR * 1.7, this.body))
          // Without a tilt channel per bar (a one-motor model), both follow the first.
          const mover = own ?? tiltHeads[0]
          if (mover !== undefined) this.movers.push({ head: mover, yoke, tilt, pan: 0, tiltAngle: 0 })
          const beams = [0, 1, 2, 3].map((j) => {
            const holder = new THREE.Group()
            holder.position.x = (j - 1.5) * w * 0.215
            tilt.add(holder)
            return new BeamEmitter(holder, this.root, barR * 0.55, barR + 0.002, candela / 4, 0)
          })
          // Its colour: the bar's own channels, or the colour both bars share.
          const head = own !== undefined && hasMix(this.heads[own]) ? own : (coloured[k] !== undefined && !this.heads[coloured[k]].ch.tilt ? coloured[k] : coloured[0] ?? -1)
          // One part per LED (eight single-colour parts): each beam follows its own part.
          const leds = coloured.length >= 8 && coloured.every((i) => !this.heads[i].ch.tilt) ? coloured.slice(k * 4, k * 4 + 4) : undefined
          return { beams, head, leds }
        })
        break
      }
      case 'curtain': {
        // A dark cloth hanging from its top bar (the fixture's position), LEDs scattered over
        // it. Hung (the usual way) it drapes down; on the floor it stands up from there.
        const rail = box(w, 0.03, 0.03, this.body)
        this.mount.add(rail)
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.body)
        cloth.position.y = h / 2
        this.mount.add(cloth)
        const leds = s.leds ?? ledsFromName(this.type.name) ?? 36
        const lights = this.headIndex((x) => x.role === 'pixel' || x.role === 'beam' || x.role === 'strobe')
        const dotR = Math.max(0.008, Math.min(w, h) * 0.012)
        // Evenly spread but not in a grid, like a starcloth: the same pattern every time.
        const cols = Math.max(1, Math.round(Math.sqrt(leds * (w / h))))
        const rows = Math.ceil(leds / cols)
        let seed = 7
        const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
        const dots: THREE.Mesh[][] = lights.map(() => [])
        for (let k = 0; k < leds; k++) {
          const c = k % cols
          const r = Math.floor(k / cols)
          const x = -w / 2 + (w * (c + 0.2 + rand() * 0.6)) / cols
          const y = (h * (r + 0.2 + rand() * 0.6)) / rows
          const m = new THREE.Mesh(new THREE.CircleGeometry(dotR, 10))
          m.position.set(x, y, 0.004)
          this.mount.add(m)
          // Several sections (some modes split the curtain): each lights its part, left to right.
          dots[Math.min(lights.length - 1, Math.floor(((x + w / 2) / w) * lights.length))]?.push(m)
        }
        lights.forEach((i, z) => (this.emitters[i] = new GlowEmitter(dots[z], 3)))
        break
      }
      case 'uplight':
      case 'flood':
      case 'spider':
      case 'par': {
        // A box (or can) on a bracket, its face pointing up and tilted by `aimTilt`.
        const aim = new THREE.Group()
        this.mount.add(aim)
        aim.position.y = h * 0.5
        this.aimGroup = aim
        if (s.look === 'par') {
          const can = cylinder(w / 2, h * 0.8, this.body)
          aim.add(can)
        } else {
          const housing = box(w, d, h, this.body) // lying on its back: the face points up
          aim.add(housing)
        }
        const faceY = (s.look === 'par' ? h * 0.4 : d / 2) + 0.002
        const lights = this.headIndex((x) => x.role === 'beam' || x.role === 'pixel' || x.role === 'strobe')
        // Effect parts of a box fixture (laser, derby) sit on its face.
        for (const i of this.headIndex((x) => x.role === 'laser' || x.role === 'derby')) {
          const holder = new THREE.Group()
          holder.position.y = faceY
          aim.add(holder)
          this.emitters[i] = this.heads[i].role === 'laser' ? this.laserAt(holder, i) : new DerbyEmitter(holder)
        }
        if (s.look === 'spider') {
          // Separately coloured lens groups, fanned out like the real fixture's arms.
          lights.forEach((i, k) => {
            const col = k % 3
            const rowN = Math.floor(k / 3)
            const holder = new THREE.Group()
            holder.position.set((col - 1) * w * 0.3, faceY, (rowN - 0.5) * h * 0.45)
            holder.rotation.z = (col - 1) * 0.35
            holder.rotation.x = (rowN - 0.5) * 0.4
            aim.add(holder)
            this.emitters[i] = new BeamEmitter(holder, this.root, Math.min(w, h) * 0.09, 0, candela / Math.max(1, lights.length) * 2, 0)
          })
        } else {
          // LED dots on the face, glowing in the head colour, and one beam for the fixture.
          const main = lights[0] ?? 0
          // As many LEDs as it really has: the spec, else its name ("12x12" is 12 LEDs).
          const leds = s.leds ?? ledsFromName(this.type.name) ?? 7
          const dots: THREE.Mesh[] = []
          if (s.look === 'par') {
            // A round can: LEDs in rings, like the real face.
            const r = w * 0.4
            const spots = roundLayout(leds, r)
            const dotR = Math.min(r * 0.3, spots.spacing * 0.4)
            for (const [x, z] of spots.points) {
              const m = new THREE.Mesh(new THREE.CircleGeometry(dotR, 14))
              m.rotation.x = -Math.PI / 2
              m.position.set(x, faceY, z)
              aim.add(m)
              dots.push(m)
            }
          } else {
            const cols = s.look === 'uplight' ? 2 : Math.ceil(Math.sqrt(leds * (w / h)))
            const rows = Math.ceil(leds / cols)
            for (let k = 0; k < leds; k++) {
              const m = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w / cols, h / rows) * 0.32, 12))
              m.rotation.x = -Math.PI / 2
              m.position.set(((k % cols) - (cols - 1) / 2) * (w / cols) * 0.9, faceY, (Math.floor(k / cols) - (rows - 1) / 2) * (h / rows) * 0.9)
              aim.add(m)
              dots.push(m)
            }
          }
          // With several zones (Wash FX), each zone lights its share of the dots.
          if (lights.length > 1) {
            lights.forEach((i, z) => {
              const share = dots.filter((_, k) => k % lights.length === z)
              this.emitters[i] = new GlowEmitter(share, 3)
            })
            const beamHolder = new THREE.Group()
            beamHolder.position.y = faceY
            aim.add(beamHolder)
            this.extraBeam = { emitter: new BeamEmitter(beamHolder, this.root, 0.001, 0, candela, 0), heads: lights }
          } else {
            this.emitters[main] = new BeamEmitter(aim, this.root, 0.001, faceY, candela, 0)
            this.dotsFollow = new GlowEmitter(dots, 3)
            this.dotsHead = main
          }
          // An LED ring around the face, lit by its own channels.
          const halo = this.headIndex((x) => x.role === 'halo')[0]
          if (halo !== undefined) {
            const r = s.look === 'par' ? w * 0.47 : Math.min(w, h) * 0.46
            const ring = new THREE.Mesh(new THREE.TorusGeometry(r, Math.max(0.004, r * 0.06), 8, 48))
            ring.rotation.x = Math.PI / 2
            ring.position.y = faceY + 0.002
            aim.add(ring)
            this.emitters[halo] = new GlowEmitter([ring], 2)
          }
        }
        break
      }
    }
  }

  // For box fixtures: the group that aimTilt rotates, and helpers for dots/zones.
  private aimGroup: THREE.Group | null = null
  private faceOut = false
  private dotsFollow: GlowEmitter | null = null
  private dotsHead = -1
  private extraBeam: { emitter: BeamEmitter; heads: number[] } | null = null
  /** Twin-bar fixtures: each bar's four LED beams and the head that colours them. */
  private twinBars: Array<{ beams: BeamEmitter[]; head: number; leds?: number[] }> = []

  /** Move or re-aim the fixture after its document properties change. */
  place(fixture: Fixture): void {
    if (this.stand) this.stand.visible = !fixture.hideStand
    this.root.position.set(...fixture.position)
    this.root.rotation.set(0, (fixture.rotation ?? 0) * DEG, 0)
    // Hanging fixtures are mounted upside down; facing out, on their backs (top towards the audience).
    this.faceOut = !!fixture.faceOut && fixture.mounting !== 'hanging'
    this.mount.rotation.set(this.faceOut ? Math.PI / 2 : 0, 0, fixture.mounting === 'hanging' ? Math.PI : 0)
    if (this.aimGroup) this.aimGroup.rotation.x = -fixture.aimTilt * DEG
    this.invertPan = !!fixture.invertPan
    this.invertTilt = !!fixture.invertTilt
  }

  /** Stop every beam this far out (a light inside a totem), or let them run (undefined). */
  setReach(reach: number | undefined): void {
    const r = reach ?? BEAM_LENGTH
    const all = [...this.emitters, this.extraBeam?.emitter, ...this.twinBars.flatMap((b) => b.beams)]
    for (const e of all) if (e instanceof BeamEmitter) e.reach = r
  }

  /** The middle of the fixture's body in the world (for picking and box-select), not its mounting point. */
  center(out = new THREE.Vector3()): THREE.Vector3 {
    const h = this.spec.size[1]
    const look = this.spec.look
    // Gigbars sit on their stand; everything else stands up from (or hangs down from) its position.
    const up = look === 'gigbar' && this.stand?.visible ? 0.08 : look === 'tube' ? h / 2 : h * 0.45
    if (this.faceOut) return out.copy(this.root.position).add(new THREE.Vector3(0, 0, up).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y))
    return out.copy(this.root.position).add(new THREE.Vector3(0, this.mounting === 'hanging' ? -up : up, 0))
  }

  setSelected(selected: boolean): void {
    this.body.emissive.set(selected ? 0x2f6fd6 : 0x000000)
    this.body.emissiveIntensity = selected ? 0.7 : 0
  }

  /** Called every frame with the decoded state of each head. */
  update(states: HeadState[], dt: number, haze: number, time: number): void {
    for (const m of this.movers) {
      const s = states[m.head]
      if (!s) continue
      // The pan/tilt speed channel slows the head down, like on the real fixture.
      const step = this.spec.speed ? this.spec.speed * s.moveSpeed * dt : 1e9
      const approach = (from: number, to: number) => from + Math.max(-step, Math.min(step, to - from))
      m.pan = approach(m.pan, (this.invertPan ? -1 : 1) * s.pan)
      m.tiltAngle = approach(m.tiltAngle, (this.invertTilt ? -1 : 1) * s.tilt)
      m.yoke.rotation.y = m.pan * DEG
      m.tilt.rotation.x = m.tiltAngle * DEG
    }
    this.emitters.forEach((e, i) => {
      const own = states[i] ?? DARK
      const from = this.colourFrom.get(i)
      const c = from !== undefined ? states[from] : undefined
      e?.update(c ? { ...own, color: c.color, colours: c.colours } : own, haze, time)
    })
    if (this.dotsFollow) this.dotsFollow.update(states[this.dotsHead] ?? DARK)
    for (const bar of this.twinBars) {
      const st = states[bar.head] ?? DARK
      // Each LED is one colour: it lights with its own channel. While a program runs (no
      // levels per colour), all four show the program's colour.
      bar.beams.forEach((beam, j) => {
        if (bar.leds) return beam.update(states[bar.leds[j]] ?? DARK, haze, time)
        beam.update(st.mix ? { ...st, color: LED_COLOURS[j], intensity: st.intensity * st.mix[j] } : st, haze, time)
      })
    }
    if (this.extraBeam) {
      // One beam for a multi-zone wash: the average of its zones.
      const zs = this.extraBeam.heads.map((i) => states[i]).filter(Boolean)
      const avg = zs.reduce<[number, number, number]>((a, z) => [a[0] + z.color[0] * z.intensity, a[1] + z.color[1] * z.intensity, a[2] + z.color[2] * z.intensity], [0, 0, 0])
      const peak = Math.max(...avg, 0.0001)
      const base = zs[0] ?? DARK
      this.extraBeam.emitter.update({ ...base, color: avg.map((v) => v / peak) as [number, number, number], intensity: peak / Math.max(1, zs.length) }, haze, time)
    }
  }

  /** Muted or not soloed: no light, no movement. */
  blackout(haze: number, time: number): void {
    this.emitters.forEach((e) => e?.update(DARK, haze, time))
    this.dotsFollow?.update(DARK)
    this.extraBeam?.emitter.update(DARK, haze, time)
    for (const bar of this.twinBars) for (const beam of bar.beams) beam.update(DARK, haze, time)
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose()
    })
    this.body.dispose()
    for (const e of this.emitters) e?.dispose()
    this.dotsFollow?.dispose()
    this.extraBeam?.emitter.dispose()
    for (const bar of this.twinBars) for (const beam of bar.beams) beam.dispose()
  }
}

const DARK: HeadState = { intensity: 0, color: BLACK, pan: 0, tilt: 0, beamAngle: 10, gobo: 0, goboSpin: 0, prismSpin: 0, moveSpeed: 1, prism: false, rotation: 0, fog: 0 }
