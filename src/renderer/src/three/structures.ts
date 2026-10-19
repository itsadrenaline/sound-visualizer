/**
 * Draws the objects in model/structures.ts: truss, totems, stands, stage
 * decks, speakers, DJ and band gear, furniture, walls, screens and people.
 *
 * Anything light lands on (stage tops, tables, scrims, skirts, drapes, the
 * booth facade) uses the room material, so beams and gobos show on it. Metal
 * and speaker cabinets use standard materials lit by the room's ambient light.
 * Truss is built as real box truss: four chords with diagonal lacing, merged
 * into one mesh per structure so a big rig stays cheap to draw.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ARRAY_BOX, ARRAY_SUB, BALLOON_PALETTES, cabinetOf, discoRadius, FT, IN, mountPoints, NEON_COLOURS, paramsOf, pointAt, SCREEN_KINDS, SUB_18, tvSize, type Cover, type Structure } from '../model/structures'
import { ScreenSurface } from './screenContent'
import { createRoomMaterial } from './roomMaterial'

const metal = new THREE.MeshStandardMaterial({ color: 0xa4a7ad, roughness: 0.35, metalness: 0.6 })
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, roughness: 0.5, metalness: 0.5 })
const cabinet = new THREE.MeshStandardMaterial({ color: 0x25262b, roughness: 0.8 })
const grille = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.95 })
const seamLine = new THREE.LineBasicMaterial({ color: 0x111215, transparent: true, opacity: 0.7 })
const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.18, metalness: 0.9 })
const wood = new THREE.MeshStandardMaterial({ color: 0x6b4f36, roughness: 0.7 })
const leaf = new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 0.9 })
const potMat = new THREE.MeshStandardMaterial({ color: 0x3b3b40, roughness: 0.8 })
const velvet = new THREE.MeshStandardMaterial({ color: 0x7a1020, roughness: 0.9 })
const ledPanel = new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.35, metalness: 0.2, emissive: 0x0a1020, emissiveIntensity: 0.6 })
const drumShell = new THREE.MeshStandardMaterial({ color: 0x6e1a1a, roughness: 0.45, metalness: 0.2 })
const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.8 })
const keysWhite = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.6 })

const COVER_HEX: Record<Exclude<Cover, 'none'>, number> = { white: 0xe9e9ec, black: 0x161619 }

// Room materials are cheap to share: one per colour (and sidedness).
const roomMats = new Map<string, THREE.ShaderMaterial>()
function surface(hex: number, doubleSided = false, translucent = 0, metallic = 0): THREE.ShaderMaterial {
  const key = `${hex}:${doubleSided}:${translucent}:${metallic}`
  let m = roomMats.get(key)
  if (!m) {
    m = createRoomMaterial(hex, { doubleSided, translucent, metallic })
    roomMats.set(key, m)
  }
  return m
}
/** Scrims and drapes: white spandex lets a light inside glow through it; black hides it. */
const cloth = (cover: Cover) => surface(COVER_HEX[cover === 'none' ? 'black' : cover], true, cover === 'white' ? 0.75 : 0.04)
/** Bare aluminium truss: lit by the beams like any surface, with a glint where they reflect towards you. */
const trussMetal = () => surface(0x9a9ea6, false, 0, 1)

/** Geometry pieces for one structure, grouped by material, merged at the end. */
class Parts {
  private byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  add(material: THREE.Material, geometry: THREE.BufferGeometry): void {
    const list = this.byMaterial.get(material) ?? []
    // Merging needs the same attributes on every piece.
    const g = geometry.index ? geometry.toNonIndexed() : geometry
    if (g !== geometry) geometry.dispose()
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2))
    list.push(g)
    this.byMaterial.set(material, list)
  }
  box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): void {
    this.add(material, new THREE.BoxGeometry(w, h, d).translate(x, y, z))
  }
  /** A tube between two points. */
  tube(material: THREE.Material, radius: number, a: THREE.Vector3, b: THREE.Vector3, sides = 8): void {
    const dir = b.clone().sub(a)
    const length = dir.length()
    if (length < 1e-4) return
    const g = new THREE.CylinderGeometry(radius, radius, length, sides, 1, false)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()))
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    this.add(material, g)
  }
  build(group: THREE.Group): void {
    for (const [material, list] of this.byMaterial) {
      const merged = mergeGeometries(list, false)
      for (const g of list) g.dispose()
      if (!merged) continue
      group.add(new THREE.Mesh(merged, material))
    }
  }
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Square box truss from a to b: four chords, diagonal lacing on each face, end frames. */
function truss(parts: Parts, a: THREE.Vector3, b: THREE.Vector3, size: number): void {
  const dir = b.clone().sub(a)
  const length = dir.length()
  if (length < 1e-3) return
  dir.normalize()
  const ref = Math.abs(dir.y) > 0.9 ? v(1, 0, 0) : v(0, 1, 0)
  const u = ref.clone().sub(dir.clone().multiplyScalar(ref.dot(dir))).normalize()
  const w = dir.clone().cross(u).normalize()
  const chordR = Math.max(0.012, size * 0.085)
  const laceR = chordR * 0.45
  const half = size / 2 - chordR
  const corner = (i: number, along: number) => {
    const su = i === 0 || i === 3 ? -1 : 1
    const sw = i < 2 ? -1 : 1
    return a.clone().addScaledVector(dir, along).addScaledVector(u, su * half).addScaledVector(w, sw * half)
  }
  const metal = trussMetal()
  for (let i = 0; i < 4; i++) parts.tube(metal, chordR, corner(i, 0), corner(i, length), 6)
  const bays = Math.max(1, Math.round(length / size))
  const bay = length / bays
  // Faces: corners (0,1), (1,2), (2,3), (3,0).
  for (let f = 0; f < 4; f++) {
    const c0 = f
    const c1 = (f + 1) % 4
    for (let k = 0; k < bays; k++) {
      const s = k * bay
      const e = (k + 1) * bay
      const [p, q] = k % 2 === 0 ? [corner(c0, s), corner(c1, e)] : [corner(c1, s), corner(c0, e)]
      parts.tube(metal, laceR, p, q, 4)
    }
    parts.tube(metal, laceR, corner(c0, 0), corner(c1, 0), 4)
    parts.tube(metal, laceR, corner(c0, length), corner(c1, length), 4)
  }
}

/** A drape with soft folds, `width` wide, hanging from `top` down to `bottom`, facing +z. */
function drape(width: number, bottom: number, top: number, depth = 0.035): THREE.BufferGeometry {
  const seg = Math.max(2, Math.ceil(width / 0.06))
  const g = new THREE.PlaneGeometry(width, top - bottom, seg, 1)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 0.14) * Math.PI) * depth)
  g.computeVertexNormals()
  g.translate(0, (top + bottom) / 2, 0)
  return g
}

/** A skirt or drape around a w × d rectangle, from the floor up to `top`. */
function skirt(parts: Parts, material: THREE.Material, w: number, d: number, top: number, sides: Array<'front' | 'back' | 'left' | 'right'> = ['front', 'back', 'left', 'right']): void {
  const o = 0.015
  for (const side of sides) {
    const along = side === 'front' || side === 'back' ? w : d
    const g = drape(along, 0.005, top, 0.012)
    if (side === 'front') g.translate(0, 0, d / 2 + o)
    if (side === 'back') g.rotateY(Math.PI).translate(0, 0, -d / 2 - o)
    if (side === 'left') g.rotateY(-Math.PI / 2).translate(-w / 2 - o, 0, 0)
    if (side === 'right') g.rotateY(Math.PI / 2).translate(w / 2 + o, 0, 0)
    parts.add(material, g)
  }
}

function tripod(parts: Parts, spread: number, joint: number): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    parts.tube(darkMetal, 0.014, v(Math.cos(a) * spread, 0.01, Math.sin(a) * spread), v(0, joint, 0), 6)
  }
}

/** A powered top speaker, centred at (x, y, z), facing +z (or -z with `back`). */
function speakerCab(parts: Parts, size: number | undefined, x: number, y: number, z: number, back = false): void {
  const [w, h, d] = cabinetOf(size)
  parts.box(cabinet, w, h, d, x, y, z)
  parts.box(grille, w - 0.04, h - 0.05, 0.005, x, y, z + (back ? -1 : 1) * (d / 2 + 0.003))
}

/** A sub, standing at height y, facing +z (or backwards). */
function subCab(parts: Parts, dims: [number, number, number], x: number, y: number, z: number, back = false): void {
  const [w, h, d] = dims
  parts.box(cabinet, w, h, d, x, y + h / 2, z)
  parts.box(grille, w - 0.05, h - 0.05, 0.005, x, y + h / 2, z + (back ? -1 : 1) * (d / 2 + 0.003))
}

/** A simple chair, its seat front facing +z (turned by `angle` around the chair's centre). */
function chair(parts: Parts, x: number, z: number, angle = 0): void {
  const g: THREE.BufferGeometry[] = []
  const seat = new THREE.BoxGeometry(0.44, 0.03, 0.42).translate(0, 0.45, 0)
  const back = new THREE.BoxGeometry(0.44, 0.38, 0.03).translate(0, 0.68, -0.2)
  g.push(seat, back)
  for (const sx of [-0.19, 0.19]) for (const sz of [-0.18, 0.18]) g.push(new THREE.CylinderGeometry(0.011, 0.011, 0.45, 5).translate(sx, 0.225, sz))
  for (const piece of g) {
    piece.rotateY(angle).translate(x, 0, z)
    parts.add(darkMetal, piece)
  }
}

/** A low-poly standing person, `h` tall, at (x, z). */
function personAt(parts: Parts, material: THREE.Material, x: number, z: number, h: number, angle = 0): void {
  const k = h / 1.75
  const body = new THREE.CylinderGeometry(0.22 * k, 0.16 * k, 0.72 * k, 8).translate(0, 1.13 * k, 0)
  const legs = new THREE.CylinderGeometry(0.15 * k, 0.1 * k, 0.8 * k, 6).translate(0, 0.4 * k, 0)
  const head = new THREE.SphereGeometry(0.11 * k, 8, 6).translate(0, 1.62 * k, 0)
  for (const g of [body, legs, head]) {
    g.scale(1, 1, 0.7).rotateY(angle).translate(x, 0, z)
    parts.add(material, g)
  }
}

/** A repeatable random number in 0..1 from a seed (crowds look the same every time). */
function seeded(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

/**
 * Light-up dance floor tiles: a canvas, one pixel per tile, redrawn each frame with a
 * slow colour pattern (chases, checkers, a ripple from the middle).
 */
function ledFloor(group: THREE.Group, w: number, d: number, tile: number): ((time: number) => void) | undefined {
  if (typeof document === 'undefined') return undefined
  const cols = Math.max(1, Math.round(w / tile))
  const rows = Math.max(1, Math.round(d / tile))
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.colorSpace = THREE.SRGBColorSpace
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.995, d * 0.995).rotateX(-Math.PI / 2).translate(0, 0.0265, 0), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.9, toneMapped: false }))
  plane.raycast = () => {}
  plane.userData.own = true
  group.add(plane)
  const g = canvas.getContext('2d')!
  return (time: number) => {
    const beat = (time * 124) / 60
    const scene = Math.floor(beat / 16) % 3
    for (let x = 0; x < cols; x++)
      for (let y = 0; y < rows; y++) {
        const h =
          scene === 0 ? (x + y) / (cols + rows) + beat * 0.05 // diagonal rainbow chase
          : scene === 1 ? ((x + y + Math.floor(beat)) % 2) * 0.5 + Math.floor(beat / 4) * 0.13 // flipping checkers
          : Math.hypot(x - (cols - 1) / 2, y - (rows - 1) / 2) * 0.12 - beat * 0.1 // ripple from the middle
        const l = scene === 1 ? 0.5 : 0.45 + 0.1 * Math.sin(beat * Math.PI)
        g.fillStyle = `hsl(${((h % 1) + 1) % 1 * 360}, 100%, ${l * 100}%)`
        g.fillRect(x, y, 1, 1)
      }
    texture.needsUpdate = true
  }
}

/** Balloons along an arch: clusters of four, in the palette's colours, the same each time. */
function balloonArch(group: THREE.Group, w: number, h: number, palette: string[], seed: string): THREE.InstancedMesh[] {
  const rand = seeded(seed)
  const r = 0.14
  // A rounded arch: up the sides, over the top.
  const point = (t: number) => {
    const a = Math.PI * (1 - t)
    return new THREE.Vector3((Math.cos(a) * w) / 2, Math.sin(a) * (h - r) + r * 0.6, 0)
  }
  let length = 0
  for (let i = 0; i < 100; i++) length += point(i / 100).distanceTo(point((i + 1) / 100))
  const steps = Math.max(8, Math.round(length / (r * 1.3)))
  const placed: Array<{ at: THREE.Vector3; colour: number; size: number }> = []
  for (let i = 0; i <= steps; i++) {
    const c = point(i / steps)
    const next = point(Math.min(1, i / steps + 0.01))
    const along = next.clone().sub(c).normalize()
    const side = new THREE.Vector3(0, 0, 1).cross(along).normalize()
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + i * 0.7
      const off = side.clone().multiplyScalar(Math.cos(a) * r * 0.9).add(new THREE.Vector3(0, 0, Math.sin(a) * r * 0.9))
      placed.push({ at: c.clone().add(off), colour: (i + k) % palette.length, size: r * (0.85 + rand() * 0.3) })
    }
  }
  const sphere = new THREE.SphereGeometry(1, 14, 10)
  return palette.map((hex, ci) => {
    const list = placed.filter((b) => b.colour === ci)
    const mesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.25, metalness: hex === '#d4af37' || hex === '#c9ccd2' ? 0.6 : 0.05 }), list.length)
    const m = new THREE.Matrix4()
    list.forEach((b, i) => mesh.setMatrixAt(i, m.compose(b.at, new THREE.Quaternion(), new THREE.Vector3(b.size, b.size * 1.1, b.size))))
    mesh.userData.own = true
    group.add(mesh)
    return mesh
  })
}

/** Glowing words for a neon sign, on a transparent canvas. */
function neonTexture(text: string, colour: string): THREE.Texture | null {
  // No page (tests in Node): the sign is drawn without its words.
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 410
  const g = canvas.getContext('2d')!
  const lines = (text.trim() || 'Let’s Party').split(/\n|\\n/).slice(0, 3)
  let size = 180
  const font = () => `italic 600 ${size}px "Brush Script MT", "Snell Roundhand", cursive`
  g.font = font()
  while (size > 30 && (Math.max(...lines.map((l) => g.measureText(l).width)) > canvas.width * 0.9 || size * lines.length * 1.1 > canvas.height * 0.85)) {
    size -= 6
    g.font = font()
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // A wide soft glow, then the bright tube on top.
  for (const [blur, style, width] of [[40, colour, 10], [12, colour, 6], [0, '#ffffff', 2.5]] as const) {
    g.shadowColor = colour
    g.shadowBlur = blur
    g.strokeStyle = style
    g.lineWidth = width
    lines.forEach((l, i) => g.strokeText(l, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * size * 1.1))
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** The 3D model of one structure, at the origin (the caller places and turns it). */
export function buildStructure(s: Structure): THREE.Group {
  const group = new THREE.Group()
  const p = paramsOf(s)
  const parts = new Parts()
  const t = p.truss
  const cover = p.cover ?? 'none'
  const lines: number[] = []

  switch (s.kind) {
    case 'totem': {
      parts.box(darkMetal, 24 * 0.0254, 0.012, 24 * 0.0254, 0, 0.006, 0)
      parts.box(darkMetal, 12 * 0.0254, 0.012, 12 * 0.0254, 0, p.height + 0.006, 0)
      if (cover === 'none') truss(parts, v(0, 0.012, 0), v(0, p.height, 0), t)
      else parts.box(cloth(cover), t + 0.05, p.height - 0.02, t + 0.05, 0, 0.012 + (p.height - 0.02) / 2, 0)
      break
    }
    case 'flexstand': {
      parts.box(darkMetal, 0.55, 0.012, 0.55, 0, 0.006, 0)
      const lower = Math.min(p.height - 0.1, 1.45)
      parts.tube(darkMetal, 0.024, v(0, 0.012, 0), v(0, lower, 0))
      parts.tube(darkMetal, 0.018, v(0, lower - 0.1, 0), v(0, p.height, 0))
      parts.add(darkMetal, new THREE.CylinderGeometry(0.06, 0.06, 0.012, 16).translate(0, p.height + 0.006, 0))
      if (cover !== 'none') parts.box(cloth(cover), 0.3, p.height - 0.05, 0.3, 0, 0.02 + (p.height - 0.05) / 2, 0)
      break
    }
    case 'tubeStand': {
      // Round cast-iron base, a pole, and a cup the tube's end sits in.
      parts.add(darkMetal, new THREE.CylinderGeometry(0.15, 0.15, 0.02, 24).translate(0, 0.01, 0))
      parts.tube(darkMetal, 0.012, v(0, 0.02, 0), v(0, p.height - 0.03, 0))
      parts.add(darkMetal, new THREE.CylinderGeometry(0.035, 0.03, 0.05, 16).translate(0, p.height - 0.015, 0))
      break
    }
    case 'tbar': {
      tripod(parts, 0.55, 0.75)
      parts.tube(darkMetal, 0.022, v(0, 0.3, 0), v(0, p.height, 0))
      parts.tube(darkMetal, 0.02, v(-p.width / 2, p.height, 0), v(p.width / 2, p.height, 0))
      break
    }
    case 'goalpost': {
      for (const x of [-p.width / 2, p.width / 2]) {
        parts.box(darkMetal, 0.6, 0.012, 0.6, x, 0.006, 0)
        truss(parts, v(x, 0.012, 0), v(x, p.height, 0), t)
      }
      truss(parts, v(-p.width / 2 + t / 2, p.height - t / 2, 0), v(p.width / 2 - t / 2, p.height - t / 2, 0), t)
      break
    }
    case 'trussBox': {
      const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      for (const [sx, sz] of corners) {
        parts.box(darkMetal, 0.6, 0.012, 0.6, (sx * p.width) / 2, 0.006, (sz * p.depth) / 2)
        truss(parts, v((sx * p.width) / 2, 0.012, (sz * p.depth) / 2), v((sx * p.width) / 2, p.height, (sz * p.depth) / 2), t)
      }
      const y = p.height - t / 2
      for (const z of [-p.depth / 2, p.depth / 2]) truss(parts, v(-p.width / 2 + t / 2, y, z), v(p.width / 2 - t / 2, y, z), t)
      for (const x of [-p.width / 2, p.width / 2]) truss(parts, v(x, y, -p.depth / 2 + t / 2), v(x, y, p.depth / 2 - t / 2), t)
      break
    }
    case 'groundTruss': {
      truss(parts, v(-p.width / 2, t / 2, 0), v(p.width / 2, t / 2, 0), t)
      break
    }
    case 'stage': {
      const h = p.height
      const top = surface(0x2c2d31)
      if (h <= 0.16) {
        parts.box(top, p.width, h, p.depth, 0, h / 2, 0)
      } else {
        parts.box(top, p.width, 0.05, p.depth, 0, h - 0.025, 0)
        // Deck frames, and legs at every deck corner (4 ft grid) when there's no skirt to hide them.
        parts.box(darkMetal, p.width, 0.06, p.depth, 0, h - 0.08, 0)
        if (cover === 'none') {
          const nx = Math.max(1, Math.round(p.width / (4 * FT)))
          const nz = Math.max(1, Math.round(p.depth / (4 * FT)))
          for (let i = 0; i <= nx; i++) {
            for (let k = 0; k <= nz; k++) {
              const x = Math.min(p.width / 2 - 0.04, Math.max(-p.width / 2 + 0.04, -p.width / 2 + (i * p.width) / nx))
              const z = Math.min(p.depth / 2 - 0.04, Math.max(-p.depth / 2 + 0.04, -p.depth / 2 + (k * p.depth) / nz))
              parts.tube(darkMetal, 0.022, v(x, 0, z), v(x, h - 0.1, z), 6)
            }
          }
        } else {
          skirt(parts, cloth(cover), p.width, p.depth, h - 0.05)
        }
        if (p.stairs && h > 0.25) {
          const steps = Math.max(1, Math.round(h / 0.18) - 1)
          const rise = h / (steps + 1)
          const tread = 0.28
          const sw = Math.min(4 * FT, p.width * 0.6)
          for (let i = 0; i < steps; i++) {
            const y = rise * (steps - i)
            parts.box(top, sw, y, tread, 0, y / 2, p.depth / 2 + tread * i + tread / 2)
          }
        }
      }
      // Seams between the 4 × 4 / 4 × 8 ft decks.
      const y = h + 0.002
      const nx = Math.round(p.width / (4 * FT))
      const deck = Math.abs(p.depth / (8 * FT) - Math.round(p.depth / (8 * FT))) < 0.05 ? 8 * FT : 4 * FT
      const nz = Math.round(p.depth / deck)
      for (let i = 1; i < nx; i++) {
        const x = -p.width / 2 + (i * p.width) / nx
        lines.push(x, y, -p.depth / 2, x, y, p.depth / 2)
      }
      for (let k = 1; k < nz; k++) {
        const z = -p.depth / 2 + (k * p.depth) / nz
        lines.push(-p.width / 2, y, z, p.width / 2, y, z)
      }
      break
    }
    case 'table': {
      const topMat = cover === 'none' ? surface(0x7d6e5c) : surface(COVER_HEX[cover])
      parts.box(topMat, p.width, 0.03, p.depth, 0, p.height - 0.015, 0)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.tube(darkMetal, 0.013, v(sx * (p.width / 2 - 0.12), 0, sz * (p.depth / 2 - 0.08)), v(sx * (p.width / 2 - 0.12), p.height - 0.03, sz * (p.depth / 2 - 0.08)), 6)
      if (cover !== 'none') skirt(parts, cloth(cover), p.width, p.depth, p.height - 0.03, ['front', 'left', 'right'])
      break
    }
    case 'djBooth': {
      const h = p.height
      parts.box(surface(0x3a3c42), p.width, 0.04, p.depth, 0, h, 0)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.tube(darkMetal, 0.015, v(sx * (p.width / 2 - 0.05), 0, sz * (p.depth / 2 - 0.05)), v(sx * (p.width / 2 - 0.05), h - 0.02, sz * (p.depth / 2 - 0.05)), 6)
      if (cover !== 'none') {
        const facade = surface(COVER_HEX[cover], true)
        parts.box(facade, p.width, h, 0.02, 0, h / 2, p.depth / 2 + 0.01)
        for (const sx of [-1, 1]) parts.box(facade, 0.02, h, p.depth, (sx * p.width) / 2, h / 2, 0)
        // The facade's 30 in panel frames.
        const panels = Math.max(1, Math.round(p.width / (30 * 0.0254)))
        for (let i = 0; i <= panels; i++) {
          const x = -p.width / 2 + (i * p.width) / panels
          parts.box(darkMetal, 0.018, h, 0.024, x, h / 2, p.depth / 2 + 0.012)
        }
        parts.box(darkMetal, p.width, 0.02, 0.024, 0, h - 0.01, p.depth / 2 + 0.012)
        parts.box(darkMetal, p.width, 0.02, 0.024, 0, 0.01, p.depth / 2 + 0.012)
      }
      break
    }
    case 'pipeDrape': {
      const spans = Math.max(1, p.spans ?? 1)
      const total = spans * p.width
      for (let i = 0; i <= spans; i++) {
        const x = -total / 2 + i * p.width
        parts.box(darkMetal, 0.4, 0.008, 0.4, x, 0.004, 0)
        parts.tube(metal, 0.024, v(x, 0.008, 0), v(x, p.height, 0), 8)
      }
      parts.tube(metal, 0.018, v(-total / 2, p.height - 0.05, 0), v(total / 2, p.height - 0.05, 0), 8)
      if (cover !== 'none') parts.add(cloth(cover), drape(total, 0.02, p.height - 0.06, 0.04))
      break
    }
    case 'speakerColumn': {
      parts.box(cabinet, 0.36, 0.6, 0.46, 0, 0.3, 0)
      parts.box(grille, 0.3, 0.5, 0.005, 0, 0.3, 0.233)
      const columnTop = p.height
      const columnBottom = columnTop - 0.85
      parts.tube(darkMetal, 0.018, v(0, 0.6, 0), v(0, columnBottom, 0))
      parts.box(cabinet, 0.1, columnTop - columnBottom, 0.12, 0, (columnTop + columnBottom) / 2, 0)
      parts.box(grille, 0.08, columnTop - columnBottom - 0.04, 0.005, 0, (columnTop + columnBottom) / 2, 0.061)
      break
    }
    case 'speakerOnPole': {
      const [, ch] = cabinetOf(p.size)
      tripod(parts, 0.5, 0.65)
      parts.tube(darkMetal, 0.018, v(0, 0.3, 0), v(0, p.height - ch / 2, 0))
      speakerCab(parts, p.size, 0, p.height, 0)
      break
    }
    case 'sub': {
      parts.box(cabinet, p.width, p.height, p.depth, 0, p.height / 2, 0)
      parts.box(grille, p.width - 0.06, p.height - 0.06, 0.005, 0, p.height / 2, p.depth / 2 + 0.003)
      break
    }

    // --- Speakers & sound ---
    case 'speakerOnSub': {
      const [, ch] = cabinetOf(p.size)
      subCab(parts, SUB_18, 0, 0, 0)
      parts.tube(darkMetal, 0.018, v(0, SUB_18[1], 0), v(0, p.height - ch / 2, 0))
      speakerCab(parts, p.size, 0, p.height, 0)
      break
    }
    case 'speakerBox': {
      const [, ch] = cabinetOf(p.size)
      speakerCab(parts, p.size, 0, ch / 2, 0)
      break
    }
    case 'monitor': {
      // A wedge: the slanted front faces the performer (-z), about 40° up.
      const [w, h] = cabinetOf(p.size)
      const width = w + 0.12
      const len = h * 0.75
      const tall = w * 0.95
      const shape = new THREE.Shape()
      shape.moveTo(-len / 2, 0)
      shape.lineTo(len / 2, 0)
      shape.lineTo(len / 2, tall * 0.35)
      shape.lineTo(-len / 2 + len * 0.25, tall)
      shape.lineTo(-len / 2, tall * 0.8)
      shape.lineTo(-len / 2, 0)
      const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false })
      g.translate(0, 0, -width / 2).rotateY(Math.PI / 2)
      parts.add(cabinet, g)
      const face = new THREE.PlaneGeometry(width - 0.05, Math.hypot(len * 0.75, tall * 0.65) - 0.05)
      face.rotateX(-Math.atan2(len * 0.75, tall * 0.65) - Math.PI).translate(0, tall * 0.675, -len * 0.125 - 0.004)
      parts.add(grille, face)
      break
    }
    case 'subStack': {
      const n = Math.max(1, p.count ?? 2)
      for (let i = 0; i < n; i++) subCab(parts, SUB_18, 0, i * SUB_18[1], 0, !!p.cardioid && n > 1 && i === Math.floor(n / 2))
      break
    }
    case 'lineArray': {
      const n = Math.max(1, p.count ?? 8)
      const [bw, bh, bd] = ARRAY_BOX
      const top = p.height + n * bh
      // Rigging frame, a short chain up to the motor.
      parts.box(darkMetal, bw + 0.05, 0.06, bd + 0.15, 0, top + 0.05, 0)
      parts.box(darkMetal, 0.2, 0.25, 0.2, 0, top + 1.0, 0)
      parts.tube(darkMetal, 0.008, v(0, top + 0.08, 0), v(0, top + 0.88, 0), 4)
      parts.tube(darkMetal, 0.008, v(0, top + 1.13, 0), v(0, top + 2.5, 0), 4)
      // Boxes curve down and out into a J: each tilts a little more than the one above.
      let y = top
      let z = 0
      let angle = 0
      for (let i = 0; i < n; i++) {
        angle += i < n / 2 ? 1 : 1 + (i - n / 2) * 1.6
        const a = (angle * Math.PI) / 180
        const cy = y - (bh / 2) * Math.cos(a)
        const cz = z + (bh / 2) * Math.sin(a)
        const box = new THREE.BoxGeometry(bw, bh * 0.97, bd).rotateX(a).translate(0, cy, cz)
        parts.add(cabinet, box)
        const face = new THREE.PlaneGeometry(bw - 0.04, bh * 0.85).rotateX(a).translate(0, cy + (bd / 2 + 0.004) * Math.sin(a), cz + (bd / 2 + 0.004) * Math.cos(a))
        parts.add(grille, face)
        y -= bh * Math.cos(a)
        z += bh * Math.sin(a)
      }
      break
    }
    case 'groundStack': {
      const subs = Math.max(0, p.rows ?? 0)
      for (let i = 0; i < subs; i++) subCab(parts, ARRAY_SUB, 0, i * ARRAY_SUB[1], 0)
      const base = subs * ARRAY_SUB[1]
      parts.box(darkMetal, ARRAY_BOX[0], 0.04, ARRAY_BOX[2], 0, base + 0.02, 0)
      for (let i = 0; i < Math.max(1, p.count ?? 4); i++) {
        const y = base + 0.04 + i * ARRAY_BOX[1]
        // Each box above tilts down a touch more towards the audience.
        const a = -((i + 1) * 1.5 * Math.PI) / 180
        parts.add(cabinet, new THREE.BoxGeometry(ARRAY_BOX[0], ARRAY_BOX[1] * 0.97, ARRAY_BOX[2]).rotateX(a).translate(0, y + ARRAY_BOX[1] / 2, 0))
        parts.add(grille, new THREE.PlaneGeometry(ARRAY_BOX[0] - 0.04, ARRAY_BOX[1] * 0.85).rotateX(a).translate(0, y + ARRAY_BOX[1] / 2, ARRAY_BOX[2] / 2 + 0.004))
      }
      break
    }
    case 'fohDesk': {
      const h = 0.76
      parts.box(surface(0x2a2b30), p.width, 0.03, 0.76, 0, h - 0.015, 0)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.tube(darkMetal, 0.013, v(sx * (p.width / 2 - 0.12), 0, sz * 0.3), v(sx * (p.width / 2 - 0.12), h - 0.03, sz * 0.3), 6)
      if (cover !== 'none') skirt(parts, cloth(cover), p.width, 0.76, h - 0.03, ['front', 'left', 'right'])
      // Console, sloped towards the engineer (at the back, -z), and a laptop.
      const desk = new THREE.BoxGeometry(Math.min(1.1, p.width * 0.6), 0.1, 0.6).rotateX(-0.18).translate(0, h + 0.08, 0)
      parts.add(cabinet, desk)
      parts.box(grille, 0.32, 0.015, 0.22, Math.min(0.85, p.width * 0.36), h + 0.01, 0.05)
      parts.add(cabinet, new THREE.BoxGeometry(0.32, 0.21, 0.01).rotateX(0.3).translate(Math.min(0.85, p.width * 0.36), h + 0.11, 0.17))
      break
    }
    case 'ampRack': {
      parts.box(cabinet, 0.6, p.height - 0.1, 0.65, 0, 0.1 + (p.height - 0.1) / 2, 0)
      parts.box(metal, 0.62, 0.02, 0.67, 0, p.height - 0.01, 0)
      parts.box(grille, 0.48, p.height - 0.25, 0.005, 0, 0.1 + (p.height - 0.1) / 2, 0.328)
      for (const sx of [-0.24, 0.24]) for (const sz of [-0.26, 0.26]) parts.add(darkMetal, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10).rotateZ(Math.PI / 2).translate(sx, 0.045, sz))
      break
    }

    // --- DJ & band ---
    case 'djGear': {
      const n = Math.max(2, p.count ?? 2)
      const mixerW = 0.32
      const player = p.vinyl ? 0.45 : 0.32
      const total = n * player + mixerW
      let x = -total / 2
      for (let i = 0; i < n; i++) {
        if (i === Math.ceil(n / 2)) {
          parts.box(cabinet, mixerW, 0.1, 0.4, x + mixerW / 2, 0.05, 0)
          x += mixerW
        }
        parts.box(cabinet, player - 0.02, p.vinyl ? 0.12 : 0.11, p.vinyl ? 0.35 : 0.41, x + player / 2, 0.055, 0)
        if (p.vinyl) parts.add(grille, new THREE.CylinderGeometry(0.15, 0.15, 0.01, 24).translate(x + player / 2 - 0.03, 0.125, 0))
        else parts.add(grille, new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20).translate(x + player / 2, 0.115, 0.05))
        x += player
      }
      if (n === 2 && x < total) parts.box(cabinet, mixerW, 0.1, 0.4, x + mixerW / 2, 0.05, 0)
      break
    }
    case 'micStand': {
      tripod(parts, 0.25, 0.3)
      const top = p.boom ? p.height - 0.15 : p.height
      parts.tube(darkMetal, 0.01, v(0, 0.25, 0), v(0, top, 0), 6)
      const tip = p.boom ? v(0, p.height, 0.55) : v(0, p.height, 0)
      if (p.boom) parts.tube(darkMetal, 0.008, v(0, top, -0.15), tip, 6)
      parts.tube(cabinet, 0.022, tip.clone().add(v(0, -0.02, -0.02)), tip.clone().add(v(0, 0.06, 0.12)), 10)
      break
    }
    case 'drumKit': {
      const drum = (r: number, depth: number, x: number, y: number, z: number, tilt = 0) =>
        parts.add(drumShell, new THREE.CylinderGeometry(r, r, depth, 18).rotateX(tilt).translate(x, y, z))
      drum(0.28, 0.45, 0, 0.28, 0.1, Math.PI / 2) // kick, facing the audience
      drum(0.18, 0.14, -0.38, 0.6, -0.15) // snare
      drum(0.13, 0.2, -0.12, 0.85, 0.12, -0.3) // toms
      drum(0.15, 0.2, 0.16, 0.85, 0.12, -0.3)
      drum(0.21, 0.4, 0.55, 0.45, -0.25) // floor tom
      const cymbal = (r: number, x: number, y: number, z: number) => {
        parts.tube(darkMetal, 0.008, v(x, 0.02, z), v(x, y, z), 5)
        parts.add(brass, new THREE.CylinderGeometry(r, r * 0.95, 0.006, 20).translate(x, y, z))
      }
      cymbal(0.18, -0.65, 0.95, -0.3) // hi-hat
      cymbal(0.22, -0.5, 1.2, 0.35)
      cymbal(0.25, 0.65, 1.15, 0.3)
      cymbal(0.26, 0.8, 1.05, -0.5)
      parts.add(cabinet, new THREE.CylinderGeometry(0.17, 0.17, 0.07, 14).translate(0, 0.55, -0.6)) // stool
      parts.tube(darkMetal, 0.015, v(0, 0, -0.6), v(0, 0.52, -0.6), 5)
      break
    }
    case 'guitarAmp': {
      if (p.stack) {
        parts.box(cabinet, 0.76, 0.76, 0.36, 0, 0.38, 0)
        parts.box(grille, 0.7, 0.7, 0.005, 0, 0.38, 0.183)
        parts.box(cabinet, 0.72, 0.26, 0.28, 0, 0.76 + 0.13, 0)
        parts.box(metal, 0.62, 0.05, 0.005, 0, 0.76 + 0.17, 0.143)
      } else {
        parts.box(cabinet, 0.62, 0.5, 0.27, 0, 0.25, 0)
        parts.box(grille, 0.56, 0.32, 0.005, 0, 0.21, 0.138)
        parts.box(metal, 0.5, 0.04, 0.005, 0, 0.44, 0.138)
      }
      break
    }
    case 'keyboard': {
      for (const sx of [-0.4, 0.4]) {
        parts.tube(darkMetal, 0.013, v(sx - 0.15, 0, -0.2), v(sx + 0.15, 0.88, 0.1), 6)
        parts.tube(darkMetal, 0.013, v(sx + 0.15, 0, -0.2), v(sx - 0.15, 0.88, 0.1), 6)
      }
      parts.box(cabinet, 1.32, 0.12, 0.38, 0, 0.92, 0)
      parts.box(keysWhite, 1.22, 0.02, 0.15, 0, 0.985, 0.1)
      break
    }

    // --- Furniture ---
    case 'roundTable': {
      const r = ((p.size ?? 60) * IN) / 2
      const h = 30 * IN
      const linen = cover === 'none' ? null : surface(COVER_HEX[cover])
      parts.add(linen ?? surface(0x7d6e5c), new THREE.CylinderGeometry(r, r, 0.03, 40).translate(0, h - 0.015, 0))
      if (linen) parts.add(cloth(cover), new THREE.CylinderGeometry(r + 0.02, r + 0.06, h - 0.03, 40, 1, true).translate(0, (h - 0.03) / 2, 0))
      else parts.tube(darkMetal, 0.04, v(0, 0, 0), v(0, h - 0.03, 0), 8)
      const seats = Math.max(0, p.seats ?? 0)
      for (let i = 0; i < seats; i++) {
        const a = (i / seats) * Math.PI * 2
        const d = r + 0.32
        chair(parts, Math.sin(a) * d, Math.cos(a) * d, a + Math.PI)
      }
      break
    }
    case 'highTop': {
      const r = ((p.size ?? 30) * IN) / 2
      const h = 42 * IN
      parts.add(cover === 'none' ? wood : surface(COVER_HEX[cover]), new THREE.CylinderGeometry(r, r, 0.03, 32).translate(0, h - 0.015, 0))
      if (cover === 'none') {
        parts.tube(darkMetal, 0.03, v(0, 0, 0), v(0, h - 0.03, 0), 8)
        parts.add(darkMetal, new THREE.CylinderGeometry(0.25, 0.25, 0.02, 20).translate(0, 0.01, 0))
      } else {
        // Spandex cover: hugs the post, pinched in the middle, flared at the foot.
        const pts = [v(0.3, 0, 0), v(0.12, 0.5, 0), v(0.1, 0.75, 0), v(r * 0.95, h - 0.04, 0)].map((q) => new THREE.Vector2(q.x, q.y))
        parts.add(cloth(cover), new THREE.LatheGeometry(pts, 24))
      }
      break
    }
    case 'bar': {
      const h = p.height
      parts.box(cover === 'none' ? wood : surface(0x2c2d31), p.width + 0.1, 0.05, p.depth + 0.1, 0, h - 0.025, 0)
      parts.box(cover === 'none' ? wood : surface(COVER_HEX[cover]), p.width, h - 0.05, p.depth, 0, (h - 0.05) / 2, 0)
      break
    }
    case 'chairs': {
      const n = Math.max(1, p.count ?? 1)
      const rows = Math.max(1, p.rows ?? 1)
      for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) chair(parts, (i - (n - 1) / 2) * 0.5, (r - (rows - 1) / 2) * 0.85, Math.PI)
      break
    }
    case 'sofa': {
      const mat = cover === 'none' ? surface(0x55575d) : surface(cover === 'white' ? 0xd8d8dc : 0x1d1d21)
      parts.box(mat, p.width, 0.42, 0.85, 0, 0.21, 0)
      parts.box(mat, p.width, 0.42, 0.2, 0, 0.62, -0.32)
      for (const sx of [-1, 1]) parts.box(mat, 0.2, 0.25, 0.85, sx * (p.width / 2 - 0.1), 0.54, 0)
      break
    }

    // --- Room & decor ---
    case 'wall': {
      parts.box(surface(cover === 'none' ? 0x7c7f86 : COVER_HEX[cover]), p.width, p.height, 0.15, 0, p.height / 2, 0)
      break
    }
    case 'danceFloor': {
      const finish = cover === 'none' ? 0x6e5236 : cover === 'white' ? 0xf2f2f4 : 0x0d0d10
      parts.box(surface(finish), p.width, 0.025, p.depth, 0, 0.0125, 0)
      const tile = 3 * FT
      const y = 0.027
      if (p.led) group.userData.tick = ledFloor(group, p.width, p.depth, tile)
      for (let x = -p.width / 2 + tile; x < p.width / 2 - 0.01; x += tile) lines.push(x, y, -p.depth / 2, x, y, p.depth / 2)
      for (let z = -p.depth / 2 + tile; z < p.depth / 2 - 0.01; z += tile) lines.push(-p.width / 2, y, z, p.width / 2, y, z)
      break
    }
    case 'screen': {
      const h = (p.width * 9) / 16
      const b = p.bottom ?? 0
      parts.box(surface(0xf4f4f6, true), p.width, h, 0.01, 0, b + h / 2, 0)
      group.userData.screen = { w: p.width, h, at: [0, b + h / 2, 0.006], brightness: 0.85 }
      // Black border and legs behind.
      for (const [w, hh, x, y] of [[p.width + 0.1, 0.05, 0, b + h + 0.025], [p.width + 0.1, 0.05, 0, b - 0.025], [0.05, h, -p.width / 2 - 0.025, b + h / 2], [0.05, h, p.width / 2 + 0.025, b + h / 2]] as const) parts.box(cabinet, w, hh, 0.02, x, y, -0.01)
      for (const sx of [-1, 1]) {
        parts.tube(darkMetal, 0.016, v((sx * p.width) / 2, 0, -0.02), v((sx * p.width) / 2, b + h + 0.05, -0.02), 6)
        parts.tube(darkMetal, 0.014, v((sx * p.width) / 2, 0, -0.6), v((sx * p.width) / 2, b + h * 0.6, -0.03), 6)
      }
      break
    }
    case 'ledWall': {
      const b = p.bottom ?? 0
      parts.box(ledPanel, p.width, p.height, 0.08, 0, b + p.height / 2, 0)
      group.userData.screen = { w: p.width, h: p.height, at: [0, b + p.height / 2, 0.041], brightness: 1 }
      for (let x = -p.width / 2 + 0.5; x < p.width / 2 - 0.01; x += 0.5) lines.push(x, b, 0.042, x, b + p.height, 0.042)
      for (let y = b + 0.5; y < b + p.height - 0.01; y += 0.5) lines.push(-p.width / 2, y, 0.042, p.width / 2, y, 0.042)
      // Ground support: feet and back braces.
      for (let x = -p.width / 2 + 0.25; x <= p.width / 2; x += Math.max(1, p.width / Math.max(1, Math.round(p.width / 1.5)))) {
        parts.box(darkMetal, 0.08, 0.04, 0.9, x, 0.02, -0.2)
        parts.tube(darkMetal, 0.02, v(x, 0.04, -0.6), v(x, b + p.height * 0.7, -0.05), 6)
        if (b > 0) parts.tube(darkMetal, 0.025, v(x, 0, -0.05), v(x, b, -0.05), 6)
      }
      break
    }
    case 'tv': {
      const [w, h] = tvSize(p.size)
      const b = p.bottom ?? 0
      const y = Math.max(b, 0.06) + h / 2
      parts.box(cabinet, w + 0.02, h + 0.02, 0.045, 0, y, 0)
      parts.box(ledPanel, w, h, 0.002, 0, y, 0.0235)
      group.userData.screen = { w, h, at: [0, y, 0.0255], brightness: 1 }
      if (b > 0.15) {
        // A floor stand: a pole on a wide foot.
        parts.box(darkMetal, 0.7, 0.03, 0.55, 0, 0.015, -0.05)
        parts.tube(darkMetal, 0.03, v(0, 0.03, -0.05), v(0, y + h * 0.2, -0.05), 10)
      } else {
        for (const sx of [-1, 1]) parts.box(darkMetal, 0.04, 0.06, 0.22, sx * w * 0.38, 0.03, 0)
      }
      break
    }
    case 'balloonArch': {
      group.userData.instanced = balloonArch(group, p.width, p.height, BALLOON_PALETTES[p.palette ?? 0]?.[1] ?? BALLOON_PALETTES[0][1], s.id)
      for (const sx of [-1, 1]) parts.box(darkMetal, 0.35, 0.03, 0.35, (sx * p.width) / 2, 0.015, 0)
      break
    }
    case 'photoBooth': {
      const r = ((p.size ?? 39) * IN) / 2
      parts.add(surface(0xf2f2f4), new THREE.CylinderGeometry(r, r, 0.1, 40).translate(0, 0.05, 0))
      // The turning arm: from the middle under the platform out past its edge, a pole up, a phone and a ring light.
      const arm = new THREE.Group()
      const armMat = darkMetal
      const reach = r + 0.35
      const pieces = [
        new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, reach).translate(0, 0.02, reach / 2), armMat),
        new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.45, 8).translate(0, 0.75, reach), armMat),
        new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.01).translate(0, 1.45, reach - 0.02), cabinet),
        new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 8, 32).translate(0, 1.45, reach - 0.03), new THREE.MeshBasicMaterial({ color: 0xfff6ea, toneMapped: false }))
      ]
      pieces[3].userData.own = true
      for (const m of pieces) arm.add(m)
      group.add(arm)
      // It turns slowly, like it does at a party.
      group.userData.tick = (time: number) => (arm.rotation.y = time * 0.9)
      break
    }
    case 'neonSign': {
      const w = p.width
      const h = w * 0.4
      const b = p.bottom ?? 0
      const colour = NEON_COLOURS[p.tint ?? 0]?.[1] ?? NEON_COLOURS[0][1]
      // A clear acrylic panel, the glowing words on it.
      group.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.008).translate(0, b + h / 2, 0), new THREE.MeshStandardMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.12, roughness: 0.1 })))
      const words = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.92).translate(0, b + h / 2, 0.006), new THREE.MeshBasicMaterial({ map: neonTexture(p.text ?? '', colour), transparent: true, toneMapped: false, depthWrite: false }))
      words.userData.own = true
      group.add(words)
      if (b > 0.05) for (const sx of [-1, 1]) {
        parts.tube(metal, 0.012, v(sx * w * 0.35, 0, -0.02), v(sx * w * 0.35, b + h * 0.5, -0.02), 8)
        parts.box(darkMetal, 0.25, 0.02, 0.3, sx * w * 0.35, 0.01, -0.02)
      }
      break
    }
    case 'discoBall': {
      const R = discoRadius(p.size)
      const drop = Math.max(0.03, p.drop ?? 0.5)
      // Hanging: motor at the top, chain down, ball below. Standing: motor on its base, rod up, ball on top.
      const hanging = !!s.hang
      const motorY = hanging ? -0.05 : 0.05
      parts.add(darkMetal, new THREE.CylinderGeometry(0.05, 0.06, 0.1, 16).translate(0, motorY, 0))
      const end = hanging ? -0.1 - drop : 0.1 + drop
      parts.tube(hanging ? chrome : darkMetal, hanging ? 0.004 : 0.012, v(0, hanging ? -0.1 : 0.1, 0), v(0, end, 0), 6)
      if (!hanging) parts.add(darkMetal, new THREE.CylinderGeometry(0.15, 0.17, 0.02, 20).translate(0, 0.01, 0))
      const ball = new THREE.Group()
      ball.position.y = hanging ? end - R : end + R
      // Mirror tiles: flat facets catching the light.
      const mirror = new THREE.Mesh(new THREE.SphereGeometry(R, Math.max(16, Math.round(R * 160)), Math.max(10, Math.round(R * 100))), new THREE.MeshStandardMaterial({ color: 0xd9dce2, metalness: 0.95, roughness: 0.18, flatShading: true, emissive: 0x000000 }))
      mirror.userData.own = true
      ball.add(mirror)
      group.add(ball)
      const rpm = p.rpm ?? 2
      group.userData.tick = (time: number) => (ball.rotation.y = (time * rpm * Math.PI * 2) / 60)
      group.userData.disco = { ball, radius: R, mirror }
      break
    }
    case 'backdrop': {
      parts.add(cloth(cover === 'none' ? 'white' : cover), new THREE.PlaneGeometry(p.width, p.height - 0.05).translate(0, p.height / 2 + 0.02, 0))
      for (const sx of [-1, 1]) {
        parts.tube(metal, 0.015, v((sx * p.width) / 2, 0.02, 0), v((sx * p.width) / 2, p.height, 0), 6)
        parts.box(darkMetal, 0.06, 0.02, 0.6, (sx * p.width) / 2, 0.01, 0)
      }
      parts.tube(metal, 0.012, v(-p.width / 2, p.height, 0), v(p.width / 2, p.height, 0), 6)
      break
    }
    case 'stanchions': {
      const n = Math.max(2, p.count ?? 2)
      const total = (n - 1) * p.width
      for (let i = 0; i < n; i++) {
        const x = -total / 2 + i * p.width
        parts.add(chrome, new THREE.CylinderGeometry(0.16, 0.17, 0.03, 20).translate(x, 0.015, 0))
        parts.tube(chrome, 0.025, v(x, 0.03, 0), v(x, 0.95, 0), 10)
        parts.add(chrome, new THREE.SphereGeometry(0.04, 10, 8).translate(x, 0.97, 0))
        if (i < n - 1) {
          // Rope sags between posts.
          const a = v(x, 0.9, 0)
          const b2 = v(x + p.width, 0.9, 0)
          const mid = v(x + p.width / 2, 0.9 - Math.min(0.25, p.width * 0.12), 0)
          parts.tube(velvet, 0.016, a, mid, 6)
          parts.tube(velvet, 0.016, mid, b2, 6)
        }
      }
      break
    }
    case 'plant': {
      const potH = Math.min(0.5, p.height * 0.25)
      const potR = Math.max(0.15, p.height * 0.12)
      parts.add(potMat, new THREE.CylinderGeometry(potR, potR * 0.8, potH, 16).translate(0, potH / 2, 0))
      parts.tube(wood, 0.02, v(0, potH, 0), v(0, p.height * 0.8, 0), 5)
      const rand = seeded(s.id)
      const crown = Math.max(0.2, p.height * 0.18)
      for (let i = 0; i < 7; i++) {
        const y = potH + (p.height - potH) * (0.45 + rand() * 0.45)
        const a = rand() * Math.PI * 2
        const d = rand() * crown * 0.8
        parts.add(leaf, new THREE.IcosahedronGeometry(crown * (0.6 + rand() * 0.4), 0).translate(Math.cos(a) * d, y, Math.sin(a) * d))
      }
      break
    }
    case 'pillar': {
      parts.box(surface(0x8d9097), p.width, p.height, p.width, 0, p.height / 2, 0)
      break
    }

    // --- People ---
    case 'person': {
      personAt(parts, surface(0x8a8d95), 0, 0, p.height)
      break
    }
    case 'crowd': {
      const rand = seeded(s.id)
      const count = Math.min(600, Math.round(p.width * p.depth * (p.density ?? 1.5)))
      const people = surface(0x7f828a)
      const cols = Math.max(1, Math.round(Math.sqrt((count * p.width) / p.depth)))
      const rows = Math.max(1, Math.ceil(count / cols))
      for (let i = 0; i < count; i++) {
        const cx = ((i % cols) + 0.5) / cols
        const cz = (Math.floor(i / cols) + 0.5) / rows
        const x = (cx - 0.5) * p.width + (rand() - 0.5) * (p.width / cols) * 0.8
        const z = (cz - 0.5) * p.depth + (rand() - 0.5) * (p.depth / rows) * 0.8
        // Mostly facing the stage (-z), heights 1.55-1.9 m.
        personAt(parts, people, x, z, 1.55 + rand() * 0.35, Math.PI + (rand() - 0.5) * 0.9)
      }
      break
    }
  }
  parts.build(group)
  if (lines.length) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
    const seams = new THREE.LineSegments(g, seamLine)
    seams.raycast = () => {}
    group.add(seams)
  }
  group.traverse((o) => (o.userData.structureId = s.id))
  return group
}

/** What a structure's model depends on: rebuild only when this changes (a screen's picture isn't part of its shape). */
export function shapeKey(s: Structure): string {
  const { content: _c, media: _m, mediaName: _n, ...shape } = paramsOf(s)
  void _c, void _m, void _n
  if (SCREEN_KINDS.includes(s.kind)) {
    delete shape.text
    delete shape.tint
  }
  return `${s.kind}:${s.hang ?? ''}:${JSON.stringify(shape)}`
}

/** One structure in the scene: its model, placed and turned, and a selection outline. */
export class StructureRig {
  readonly root = new THREE.Group()
  readonly structureId: string
  key = ''
  private model: THREE.Group | null = null
  private outline: THREE.Box3Helper | null = null

  constructor(s: Structure) {
    this.structureId = s.id
    this.update(s)
  }

  /** What a screen shows, laid over its face. */
  private screen: ScreenSurface | null = null

  update(s: Structure): void {
    const key = shapeKey(s)
    if (key !== this.key) {
      if (this.model) {
        this.root.remove(this.model)
        disposeGroup(this.model)
      }
      this.screen?.dispose()
      this.screen = null
      this.model = buildStructure(s)
      this.root.add(this.model)
      const face = this.model.userData.screen as { w: number; h: number; at: [number, number, number]; brightness: number } | undefined
      if (face) {
        this.screen = new ScreenSurface(face.w, face.h, face.brightness)
        this.screen.mesh.position.set(...face.at)
        this.model.add(this.screen.mesh)
      }
      this.key = key
      if (this.outline) {
        this.setSelected(false)
        this.setSelected(true)
      }
    }
    this.screen?.set(paramsOf(s))
    this.root.position.set(...s.position)
    this.root.rotation.y = (s.rotation * Math.PI) / 180
  }

  /** A disco ball's turning ball and its radius, for the reflections (three/discoBalls.ts). */
  disco(): { ball: THREE.Object3D; radius: number; mirror: THREE.Mesh } | null {
    return (this.model?.userData.disco as { ball: THREE.Object3D; radius: number; mirror: THREE.Mesh } | undefined) ?? null
  }

  /** Every frame: moving pictures, light-up floors, a turning photo booth arm. */
  tick(time: number): void {
    this.screen?.tick(time)
    ;(this.model?.userData.tick as ((t: number) => void) | undefined)?.(time)
  }

  setSelected(on: boolean): void {
    if (on && !this.outline && this.model) {
      // The model's pieces are built in its own space, so their bounds are the local box.
      const box = new THREE.Box3()
      this.model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        o.geometry.computeBoundingBox()
        box.union(o.geometry.boundingBox!)
      })
      this.outline = new THREE.Box3Helper(box.expandByScalar(0.03), 0x4da3ff)
      this.outline.raycast = () => {}
      ;(this.outline.material as THREE.LineBasicMaterial).depthTest = false
      this.outline.renderOrder = 10
      this.root.add(this.outline)
    } else if (!on && this.outline) {
      this.root.remove(this.outline)
      this.outline.geometry.dispose()
      ;(this.outline.material as THREE.Material).dispose()
      this.outline = null
    }
  }

  dispose(): void {
    if (this.model) disposeGroup(this.model)
    this.screen?.dispose()
    this.setSelected(false)
  }
}

function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose()
    // Materials are shared between structures and live as long as the app, except the
    // few made for one object (a neon sign's words, a dance floor's tiles, balloons).
    if (o instanceof THREE.Mesh && o.userData.own) {
      const m = o.material as THREE.MeshBasicMaterial
      m.map?.dispose()
      m.dispose()
    }
  })
}

/**
 * Every mount point in the scene, drawn faintly while you drag a fixture, so you
 * can see where it can go: dots for top plates, lines for bars and legs.
 */
export function mountGuides(structures: Structure[]): THREE.Group {
  const group = new THREE.Group()
  const segs: number[] = []
  const dots: number[] = []
  for (const s of structures) {
    const a = (s.rotation * Math.PI) / 180
    const world = (q: [number, number, number]) => {
      const c = Math.cos(a)
      const sn = Math.sin(a)
      return [s.position[0] + q[0] * c + q[2] * sn, s.position[1] + q[1], s.position[2] - q[0] * sn + q[2] * c]
    }
    for (const m of mountPoints(s)) {
      if (m.to) segs.push(...world(m.at), ...world(m.to))
      else dots.push(...world(pointAt(m)))
    }
  }
  const color = 0x4da3ff
  if (segs.length) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3))
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthTest: false }))
    l.renderOrder = 20
    group.add(l)
  }
  if (dots.length) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3))
    const d = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 9, sizeAttenuation: false, transparent: true, opacity: 0.8, depthTest: false }))
    d.renderOrder = 20
    group.add(d)
  }
  group.traverse((o) => (o.raycast = () => {}))
  return group
}

/**
 * A object as a binary glTF (.glb), for MVR files: other programs
 * (Vectorworks, grandMA3) show the totem or stage too. Our room materials are
 * shaders, so the copy uses plain materials of the same colour.
 */
export async function structureGlb(s: Structure): Promise<Uint8Array | null> {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
  const model = buildStructure(s)
  const plain = new Map<THREE.Material, THREE.Material>()
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const mat = o.material as THREE.Material
    if (!plain.has(mat)) {
      const base = (mat as THREE.ShaderMaterial).uniforms?.base?.value as THREE.Color | undefined
      plain.set(mat, base ? new THREE.MeshStandardMaterial({ color: base, roughness: 0.8, side: (mat as THREE.ShaderMaterial).side }) : mat)
    }
    o.material = plain.get(mat)!
  })
  model.children.filter((c) => c instanceof THREE.LineSegments).forEach((c) => model.remove(c))
  try {
    const result = await new GLTFExporter().parseAsync(model, { binary: true })
    return result instanceof ArrayBuffer ? new Uint8Array(result) : null
  } catch {
    return null
  } finally {
    disposeGroup(model)
    for (const [orig, copy] of plain) if (copy !== orig) copy.dispose()
  }
}
