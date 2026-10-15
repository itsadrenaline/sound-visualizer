/**
 * The 3D model of one fixture, built to the manufacturer's dimensions, plus
 * its mechanics.
 *
 * A fixture is made of heads (see model/heads.ts). Each head gets an emitter:
 * a beam (lens, haze cone and a real spotlight), glowing pixels, a derby's fan
 * of beams, a strobe panel, a laser fan or a halo ring. Moving heads travel at
 * the fixture's top speed instead of jumping (like Capture's Mechanical model).
 */
import * as THREE from 'three'
import type { Fixture } from '../model/project'
import type { FixtureType } from '../model/fixtureTypes'
import { headsOf, type HeadDef, type HeadState } from '../model/heads'
import { cellPositions, specFor, type FixtureSpec } from '../model/catalog'
import { createBeamMaterial } from './beamMaterial'
import { projectors } from './projectors'
import { goboCell } from './gobos'

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
    const radius = BEAM_LENGTH * Math.tan((Math.max(1, s.beamAngle) / 2) * DEG)
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
      beam.scale.set(radius, BEAM_LENGTH, radius)
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
        prismTurn: this.prismTurn
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
    this.turn += (0.002 + s.rotation * 0.05)
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

/** A laser: a fan of very thin red and green lines, moving with the pattern channel. */
class LaserEmitter implements Emitter {
  private lines: THREE.LineSegments
  private material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false })
  /**
   * `byChannel`: SoundSwitch's laser channel switches it on and picks the pattern.
   * Otherwise (library fixtures) it follows the head's intensity and colour.
   */
  constructor(parent: THREE.Object3D, private byChannel = true) {
    const n = 40
    const positions = new Float32Array(n * 6)
    const colors = new Float32Array(n * 6)
    for (let i = 0; i < n; i++) {
      const a = ((i / (n - 1)) - 0.5) * 93 * DEG
      positions.set([0, 0, 0, Math.sin(a) * 12, 12 * Math.cos(a) * 0.5, -Math.cos(a) * 12], i * 6)
      const c = i % 2 ? [0.1, 1, 0.1] : [1, 0.1, 0.05]
      colors.set([...c, ...c], i * 6)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.lines = new THREE.LineSegments(geometry, this.material)
    parent.add(this.lines)
  }
  update(s: HeadState, _haze: number, time: number): void {
    const on = this.byChannel ? s.rotation > 0.02 : s.intensity > 0.02 && Math.max(...s.color) > 0.02
    this.lines.visible = on
    this.material.opacity = 0.7
    if (!this.byChannel) this.material.color.setRGB(...s.color)
    this.lines.rotation.y = Math.sin(time * (0.5 + s.rotation * 3)) * 0.6
    this.lines.rotation.x = Math.sin(time * 0.7) * 0.15
  }
  dispose(): void {
    this.lines.geometry.dispose()
    this.material.dispose()
  }
}

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

interface Mover {
  head: number
  yoke: THREE.Group
  tilt: THREE.Group
  pan: number
  tiltAngle: number
}

export class FixtureRig {
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

  constructor(fixture: Fixture, private type: FixtureType) {
    this.typeVersion = type
    this.fixtureId = fixture.id
    this.typeId = fixture.typeId
    this.mounting = fixture.mounting
    this.heads = headsOf(type)
    this.spec = type.spec ?? specFor(type.name, type.body === 'movingHead')
    if (!type.spec && type.body === 'bar') this.spec = specFor('pixel tube', false)
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

  private build(): void {
    const s = this.spec
    const [w, h, d] = s.size
    const beamHeads = this.headIndex((x) => x.role === 'beam')
    const candela = this.type.candela

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
          const count = s.leds ?? 19
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
        const pole = cylinder(0.02, 2.2, this.body, 10)
        pole.position.y = -1.1
        this.mount.add(pole)
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
          this.emitters[laser] = new LaserEmitter(holder, !!this.heads[laser].ch.laser)
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
          this.emitters[i] = this.heads[i].role === 'laser' ? new LaserEmitter(holder, !!this.heads[i].ch.laser) : new DerbyEmitter(holder)
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
            this.emitters[i] = asLaser ? new LaserEmitter(holder, !!this.heads[i].ch.laser) : new DerbyEmitter(holder)
          }
        })
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
          this.emitters[i] = this.heads[i].role === 'laser' ? new LaserEmitter(holder, !!this.heads[i].ch.laser) : new DerbyEmitter(holder)
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
          const leds = s.leds ?? 7
          const cols = s.look === 'uplight' ? 2 : Math.ceil(Math.sqrt(leds * (w / h)))
          const rows = Math.ceil(leds / cols)
          const dots: THREE.Mesh[] = []
          for (let k = 0; k < leds; k++) {
            const m = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w / cols, h / rows) * 0.32, 12))
            m.rotation.x = -Math.PI / 2
            m.position.set(((k % cols) - (cols - 1) / 2) * (w / cols) * 0.9, faceY, (Math.floor(k / cols) - (rows - 1) / 2) * (h / rows) * 0.9)
            aim.add(m)
            dots.push(m)
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
        }
        break
      }
    }
  }

  // For box fixtures: the group that aimTilt rotates, and helpers for dots/zones.
  private aimGroup: THREE.Group | null = null
  private dotsFollow: GlowEmitter | null = null
  private dotsHead = -1
  private extraBeam: { emitter: BeamEmitter; heads: number[] } | null = null

  /** Move or re-aim the fixture after its document properties change. */
  place(fixture: Fixture): void {
    this.root.position.set(...fixture.position)
    this.root.rotation.set(0, (fixture.rotation ?? 0) * DEG, 0)
    // Hanging fixtures are mounted upside down.
    this.mount.rotation.set(0, 0, fixture.mounting === 'hanging' ? Math.PI : 0)
    if (this.aimGroup) this.aimGroup.rotation.x = -fixture.aimTilt * DEG
    this.invertPan = !!fixture.invertPan
    this.invertTilt = !!fixture.invertTilt
  }

  /** The middle of the fixture's body in the world (for picking and box-select), not its mounting point. */
  center(out = new THREE.Vector3()): THREE.Vector3 {
    const h = this.spec.size[1]
    const look = this.spec.look
    // Gigbars sit on their stand; everything else stands up from (or hangs down from) its position.
    const up = look === 'gigbar' ? 0.08 : look === 'tube' ? h / 2 : h * 0.45
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
    this.emitters.forEach((e, i) => e?.update(states[i] ?? DARK, haze, time))
    if (this.dotsFollow) this.dotsFollow.update(states[this.dotsHead] ?? DARK)
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
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose()
    })
    this.body.dispose()
    for (const e of this.emitters) e?.dispose()
    this.dotsFollow?.dispose()
    this.extraBeam?.emitter.dispose()
  }
}

const DARK: HeadState = { intensity: 0, color: BLACK, pan: 0, tilt: 0, beamAngle: 10, gobo: 0, goboSpin: 0, prismSpin: 0, moveSpeed: 1, prism: false, rotation: 0 }
