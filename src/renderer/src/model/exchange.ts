/**
 * Moving shows in and out:
 *
 *  - mergeShow: bring another show into this one (its objects and fixtures),
 *    re-patching anything that would clash with what's already here.
 *  - MVR (My Virtual Rig, the open GDTF/MVR standard used by lighting design software and consoles such as grandMA3,
 *    Vectorworks, Depence and others): a zip with GeneralSceneDescription.xml.
 *    We write fixtures with their position, patch and GDTF name, objects as
 *    scene objects with 3D models (glTF), and our own show file inside UserData
 *    so a round trip through this app loses nothing. Reading takes fixtures from
 *    any MVR: matched to the library by name, or built from the GDTF file in the
 *    zip when there is one.
 *  - A CSV patch list for the paperwork.
 *
 * MVR's axes: X to the right, Y upstage (away from the audience), Z up, in mm.
 * Ours: x to the right, y up, z towards the audience, in metres.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { getFixtureType, plainName, type ChannelFunction, type FixtureType } from './fixtureTypes'
import { defaultProject, footprint, newId, planPatch, type Fixture, type Project, type Vec3 } from './project'
import { FT, mountPoints, type Structure } from './structures'
import type { LibraryEntry } from './oflImport'

// ---------------------------------------------------------------------------
// Merging one show into another
// ---------------------------------------------------------------------------

const sameStructure = (a: Structure, b: Structure) =>
  a.kind === b.kind && Math.abs(a.position[0] - b.position[0]) < 0.05 && Math.abs(a.position[2] - b.position[2]) < 0.05 && JSON.stringify(a.params) === JSON.stringify(b.params)

/** Fixtures (and the objects they're on) from `incoming`, added to `current`. */
export function mergeShow(current: Project, incoming: Project): { project: Project; fixtures: number; structures: number; repatched: number } {
  const structureIds = new Map<string, string>()
  const newStructures: Structure[] = []
  const existing = current.structures ?? []
  const taken = new Set(existing.map((s) => s.name))
  for (const s of incoming.structures ?? []) {
    const twin = existing.find((e) => sameStructure(e, s))
    if (twin) {
      structureIds.set(s.id, twin.id)
      continue
    }
    const id = `st-${newId().slice(3)}`
    structureIds.set(s.id, id)
    let name = s.name
    for (let n = 2; taken.has(name); n++) name = `${s.name} ${n}`
    taken.add(name)
    newStructures.push({ ...s, id, name })
  }
  const placed: Fixture[] = [...current.fixtures]
  let repatched = 0
  const added: Fixture[] = []
  for (const f of incoming.fixtures) {
    const size = footprint(f)
    const end = f.address + size - 1
    const clash = placed.some((o) => o.universe === f.universe && o.address <= end && f.address <= o.address + footprint(o) - 1)
    let { universe, address } = f
    if (clash || end > 512) {
      const spot = planPatch(placed, 1, size, { universe: f.universe, address: 1 })[0]
      if (spot) ({ universe, address } = spot)
      repatched++
    }
    const copy: Fixture = { ...f, id: newId(), universe, address, soundswitchKey: undefined, mount: f.mount && structureIds.has(f.mount.structure) ? { ...f.mount, structure: structureIds.get(f.mount.structure)! } : undefined }
    placed.push(copy)
    added.push(copy)
  }
  const types = new Map((current.fixtureTypes ?? []).map((t) => [t.id, t]))
  for (const t of incoming.fixtureTypes ?? []) if (!types.has(t.id)) types.set(t.id, t)
  return {
    project: {
      ...current,
      fixtures: [...current.fixtures, ...added],
      structures: [...existing, ...newStructures],
      fixtureTypes: [...types.values()],
      groupNames: { ...(incoming.groupNames ?? {}), ...(current.groupNames ?? {}) }
    },
    fixtures: added.length,
    structures: newStructures.length,
    repatched
  }
}

// ---------------------------------------------------------------------------
// MVR
// ---------------------------------------------------------------------------

const PROVIDER = 'SoundSwitchVisualizer'

function uuid(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toUpperCase()
}

function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(out)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString()

/** The MVR matrix for something at `p` (ours), turned `yaw` degrees, upside down if hanging. */
function mvrMatrix(p: Vec3, yaw: number, hanging: boolean): string {
  const a = (yaw * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  // Rotation about MVR's Z (up); hanging adds a half turn about X.
  const u = [c, s, 0]
  const v = hanging ? [s, -c, 0] : [-s, c, 0]
  const w = hanging ? [0, 0, -1] : [0, 0, 1]
  const o = [p[0] * 1000, -p[2] * 1000, p[1] * 1000]
  return [u, v, w, o].map((r) => `{${r.map(n3).join(',')}}`).join('')
}

/** Our position, yaw and whether it's upside down, from an MVR matrix. */
function fromMvrMatrix(text: string | undefined): { position: Vec3; yaw: number; hanging: boolean } {
  const rows = [...(text ?? '').matchAll(/\{([^}]*)\}/g)].map((m) => m[1].split(',').map(Number))
  if (rows.length < 4) return { position: [0, 0, 0], yaw: 0, hanging: false }
  const [u, , w, o] = rows
  return { position: [o[0] / 1000, Math.max(0, o[2] / 1000), -o[1] / 1000], yaw: Math.round((Math.atan2(u[1], u[0]) * 180) / Math.PI), hanging: (w[2] ?? 1) < 0 }
}

/** The GDTF file name a fixture type goes by: "Manufacturer@Model" (the GDTF Share convention). */
export function gdtfName(t: FixtureType): string {
  const clean = (s: string) => s.replace(/[^\w.+-]+/g, '_').replace(/^_|_$/g, '')
  return `${clean(t.manufacturer || 'Generic')}@${clean(plainName(t.name))}.gdtf`
}

export interface MvrExportOptions {
  /** A glTF (.glb) model of an object, so it shows in other programs too. */
  model?: (s: Structure) => Promise<Uint8Array | null>
}

/** The show as an MVR file. */
export async function toMvr(project: Project, options: MvrExportOptions = {}): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  const fixtures = project.fixtures.map((f, i) => {
    const t = getFixtureType(f.typeId)
    const yaw = f.rotation ?? 0
    return `        <Fixture name="${esc(f.name)}" uuid="${uuid()}">
          <Matrix>${mvrMatrix(f.position, yaw, f.mounting === 'hanging')}</Matrix>
          <GDTFSpec>${esc(gdtfName(t))}</GDTFSpec>
          <GDTFMode>${esc(`${t.channels.length}ch`)}</GDTFMode>
          <Addresses>
            <Address break="0">${f.universe * 512 + f.address}</Address>
          </Addresses>
          <FixtureID>${i + 1}</FixtureID>
          <FixtureIDNumeric>${i + 1}</FixtureIDNumeric>
          <UnitNumber>${i + 1}</UnitNumber>
          <CustomId>${f.group ?? 0}</CustomId>
        </Fixture>`
  })
  const objects: string[] = []
  for (const s of project.structures ?? []) {
    let geometry = ''
    const model = options.model ? await options.model(s) : null
    if (model) {
      const file = `${s.id}.glb`
      files[file] = model
      geometry = `\n          <Geometries>\n            <Geometry3D fileName="${file}"/>\n          </Geometries>`
    }
    objects.push(`        <SceneObject name="${esc(s.name)}" uuid="${uuid()}">
          <Matrix>${mvrMatrix(s.position, s.rotation, false)}</Matrix>${geometry}
        </SceneObject>`)
  }
  const ours = toBase64(strToU8(JSON.stringify(project)))
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<GeneralSceneDescription verMajor="1" verMinor="6" provider="${PROVIDER}" providerVersion="1">
  <UserData>
    <Data provider="${PROVIDER}" ver="1">${ours}</Data>
  </UserData>
  <Scene>
    <Layers>
      <Layer name="Lighting" uuid="${uuid()}">
        <ChildList>
${fixtures.join('\n')}
        </ChildList>
      </Layer>
      <Layer name="Set" uuid="${uuid()}">
        <ChildList>
${objects.join('\n')}
        </ChildList>
      </Layer>
    </Layers>
  </Scene>
</GeneralSceneDescription>
`
  files['GeneralSceneDescription.xml'] = strToU8(xml)
  return zipSync(files, { level: 6 })
}

/** Text of the first <tag>…</tag> in `xml`. */
const tag = (xml: string, name: string) => new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1]?.trim()
const attr = (open: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(open)?.[1]
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

export interface MvrFixture {
  name: string
  gdtf: string
  mode: string
  universe: number
  address: number
  position: Vec3
  yaw: number
  hanging: boolean
  group?: number
}

export interface MvrScene {
  /** Our own show, when the file was written by this app. */
  show?: Project
  fixtures: MvrFixture[]
  /** GDTF files inside the zip, by file name. */
  gdtf: Record<string, Uint8Array>
}

export function readMvr(bytes: Uint8Array): MvrScene {
  const files = unzipSync(bytes)
  const name = Object.keys(files).find((f) => /GeneralSceneDescription\.xml$/i.test(f))
  if (!name) throw new Error("This isn't an MVR file: there's no GeneralSceneDescription.xml inside.")
  const xml = strFromU8(files[name])
  const gdtf: Record<string, Uint8Array> = {}
  for (const [f, data] of Object.entries(files)) if (/\.gdtf$/i.test(f)) gdtf[f.split('/').pop()!] = data
  const fixtures: MvrFixture[] = []
  for (const m of xml.matchAll(/<Fixture\b([^>]*)>([\s\S]*?)<\/Fixture>/g)) {
    const [, open, body] = m
    const absolute = Number(tag(body, 'Address') ?? '1')
    const dotted = /^(\d+)\.(\d+)$/.exec(tag(body, 'Address') ?? '')
    const universe = dotted ? Number(dotted[1]) - 1 : Math.floor((absolute - 1) / 512)
    const address = dotted ? Number(dotted[2]) : ((absolute - 1) % 512) + 1
    const placed = fromMvrMatrix(tag(body, 'Matrix'))
    fixtures.push({
      name: unesc(attr(open, 'name') ?? 'Fixture'),
      gdtf: unesc(tag(body, 'GDTFSpec') ?? ''),
      mode: unesc(tag(body, 'GDTFMode') ?? ''),
      universe: Math.max(0, universe),
      address: Math.max(1, Math.min(512, address)),
      ...placed,
      group: Number(tag(body, 'CustomId') ?? 0) || undefined
    })
  }
  const data = /<Data\b[^>]*provider="SoundSwitchVisualizer"[^>]*>([\s\S]*?)<\/Data>/.exec(xml)?.[1]?.trim()
  let show: Project | undefined
  if (data) {
    try {
      show = JSON.parse(strFromU8(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)))) as Project
    } catch {
      show = undefined
    }
  }
  return { show, fixtures, gdtf }
}

// --- GDTF: just enough to drive a fixture (its DMX mode's channels) ---------------------

const GDTF_ATTRIBUTES: Array<[RegExp, ChannelFunction]> = [
  [/^Pan$/i, 'pan'], [/^Tilt$/i, 'tilt'], [/^Dimmer$/i, 'dimmer'],
  [/^(Shutter\d*|StrobeFrequency|Strobe.*)$/i, 'shutter'],
  [/^(ColorAdd_R|ColorRGB_Red)$/i, 'red'], [/^(ColorAdd_G|ColorRGB_Green)$/i, 'green'], [/^(ColorAdd_B|ColorRGB_Blue)$/i, 'blue'],
  [/^(ColorAdd_W|ColorAdd_WW|ColorAdd_CW|ColorRGB_White)$/i, 'white'], [/^(ColorAdd_A|ColorAdd_RY)$/i, 'amber'], [/^ColorAdd_UV$/i, 'uv'],
  [/^Zoom$/i, 'zoom'], [/^Color\d$/i, 'colorWheel'], [/^Gobo\d$/i, 'gobo'], [/^Prism\d?$/i, 'prism'],
  [/^(PanTiltSpeed|PanTiltTime|MSpeed|EffectsRate)$/i, 'speed']
]

/** A fixture type from a GDTF file's description.xml, for the named DMX mode (or the first). */
export function fixtureTypeFromGdtf(gdtf: Uint8Array, modeName: string): FixtureType | null {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(gdtf)
  } catch {
    return null
  }
  const desc = files['description.xml']
  if (!desc) return null
  const xml = strFromU8(desc)
  const ft = /<FixtureType\b([^>]*)>/.exec(xml)?.[1] ?? ''
  const name = unesc(attr(ft, 'LongName') || attr(ft, 'Name') || 'GDTF fixture')
  const manufacturer = unesc(attr(ft, 'Manufacturer') ?? '')
  const modes = [...xml.matchAll(/<DMXMode\b([^>]*)>([\s\S]*?)<\/DMXMode>/g)]
  const mode = modes.find((m) => attr(m[1], 'Name') === modeName) ?? modes.find((m) => (attr(m[1], 'Name') ?? '').toLowerCase().includes(modeName.toLowerCase())) ?? modes[0]
  if (!mode) return null
  const channels: ChannelFunction[] = []
  for (const c of mode[2].matchAll(/<DMXChannel\b([^>]*)>([\s\S]*?)<\/DMXChannel>/g)) {
    const offsets = (attr(c[1], 'Offset') ?? '').split(',').map(Number).filter((x) => x > 0)
    if (!offsets.length) continue
    const attribute = attr(/<LogicalChannel\b([^>]*)/.exec(c[2])?.[1] ?? '', 'Attribute') ?? ''
    const fn = GDTF_ATTRIBUTES.find(([re]) => re.test(attribute))?.[1] ?? 'reserved'
    offsets.forEach((o, i) => {
      while (channels.length < o) channels.push('reserved')
      channels[o - 1] = i === 0 ? fn : fn === 'pan' ? 'panFine' : fn === 'tilt' ? 'tiltFine' : 'reserved'
    })
  }
  if (!channels.length) return null
  const moving = channels.includes('pan') || channels.includes('tilt')
  return {
    id: `gdtf-${manufacturer}-${name}-${attr(mode[1], 'Name') ?? ''}`.replace(/\s+/g, '_'),
    name: `${name} (${attr(mode[1], 'Name') ?? `${channels.length}ch`})`,
    manufacturer,
    channels,
    panRange: moving ? 540 : 0,
    tiltRange: moving ? 270 : 0,
    zoomRange: moving ? [8, 30] : [15, 40],
    maxSpeed: moving ? 240 : 0,
    candela: moving ? 1500 : 600,
    body: moving ? 'movingHead' : 'par',
    source: 'GDTF (from the MVR file)'
  }
}

/** Library fixtures for an MVR's "Manufacturer@Model" name, best first. */
export function matchGdtfName(entries: LibraryEntry[], gdtf: string): LibraryEntry | undefined {
  const [maker = '', model = gdtf] = gdtf.replace(/\.gdtf$/i, '').split('@')
  const words = (s: string) => s.toLowerCase().replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean)
  const m = words(model)
  const k = words(maker)
  let best: { e: LibraryEntry; score: number } | undefined
  for (const e of entries) {
    const name = e.name.toLowerCase()
    const man = e.manufacturer.toLowerCase()
    const hits = m.filter((w) => name.includes(w)).length
    if (!hits) continue
    const score = hits / Math.max(m.length, words(e.name).length) + (k.some((w) => man.includes(w)) ? 0.5 : 0)
    if (!best || score > best.score) best = { e, score }
  }
  return best && best.score > 0.6 ? best.e : undefined
}

export interface MvrImport {
  project: Project
  /** Fixtures whose type couldn't be found: they come in as plain dimmers to fix by hand. */
  unknown: string[]
}

/**
 * A show from an MVR. `typeFor` turns a library match into one of our types
 * (the app's library loader). Our own MVRs come back exactly as they were saved.
 */
export function showFromMvr(scene: MvrScene, name: string, entries: LibraryEntry[], typeFor: (key: string, mode: string) => FixtureType | null): MvrImport {
  if (scene.show) return { project: { ...scene.show, name: scene.show.name || name }, unknown: [] }
  const base = defaultProject()
  const types = new Map<string, FixtureType>()
  const unknown: string[] = []
  const fixtures: Fixture[] = scene.fixtures.map((f) => {
    const key = `${f.gdtf}|${f.mode}`
    let type = types.get(key)
    if (!type) {
      const fromFile = scene.gdtf[f.gdtf] ? fixtureTypeFromGdtf(scene.gdtf[f.gdtf], f.mode) : null
      const entry = matchGdtfName(entries, f.gdtf)
      type = (entry && typeFor(entry.key, f.mode)) || fromFile || undefined
      if (!type) {
        unknown.push(f.gdtf || f.name)
        type = { id: `mvr-unknown-${f.gdtf}`, name: f.gdtf.replace(/\.gdtf$/i, '').replace('@', ' ') || 'Unknown fixture', manufacturer: '', channels: ['dimmer'], panRange: 0, tiltRange: 0, zoomRange: [20, 20], maxSpeed: 0, candela: 400, body: 'par', source: 'MVR (type not found)' }
      }
      types.set(key, type)
    }
    return {
      id: newId(),
      name: f.name,
      typeId: type.id,
      universe: f.universe,
      address: f.address,
      position: f.position,
      mounting: f.hanging ? 'hanging' : 'floor',
      aimTilt: 0,
      rotation: f.yaw || undefined,
      group: f.group
    }
  })
  return { project: { ...base, name, fixtures, fixtureTypes: [...types.values()] }, unknown: [...new Set(unknown)] }
}

// ---------------------------------------------------------------------------
// CSV patch list
// ---------------------------------------------------------------------------

export function patchCsv(project: Project): string {
  const ft = (m: number) => (Math.round((m / FT) * 10) / 10).toString()
  const q = (s: string | number) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s))
  const rows = [['Name', 'Manufacturer', 'Fixture', 'Channels', 'Universe', 'Address', 'Last channel', 'Group', 'Attached to', 'X (ft)', 'Height (ft)', 'Z (ft)', 'Hanging', 'Invert pan', 'Invert tilt']]
  const byId = new Map((project.structures ?? []).map((s) => [s.id, s]))
  const sorted = [...project.fixtures].sort((a, b) => a.universe - b.universe || a.address - b.address)
  for (const f of sorted) {
    const t = getFixtureType(f.typeId)
    const on = f.mount && byId.get(f.mount.structure)
    const point = on && mountPoints(on).find((p) => p.id === f.mount!.point)
    rows.push([
      f.name, t.manufacturer, t.name, String(t.channels.length), String(f.universe + 1), String(f.address), String(f.address + t.channels.length - 1), String(f.group ?? ''),
      on ? `${on.name}${point ? ` (${point.label})` : ''}` : '', ft(f.position[0]), ft(f.position[1]), ft(f.position[2]),
      f.mounting === 'hanging' ? 'yes' : '', f.invertPan ? 'yes' : '', f.invertTilt ? 'yes' : ''
    ])
  }
  return rows.map((r) => r.map(q).join(',')).join('\n') + '\n'
}
