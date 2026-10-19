/**
 * Fixture files in and out of Fixture Studio.
 *
 * In: a Studio file (.svfixture), an Open Fixture Library file (.json), a QLC+
 * file (.qxf) or a GDTF file (.gdtf). Each becomes a definition plus a short
 * report of what was read, so nothing is dropped silently.
 *
 * Out: a .svfixture (a zip holding `fixture.json`, the plain Open Fixture
 * Library version any OFL tool can read, and `studio.json`, the full definition
 * with the look and how sure each channel is), or the OFL file on its own.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { FN, KINDS, defFromTypes, hexOf, newKey, type ChannelDef, type ChannelFn, type FixtureDef, type PartDef, type RangeDef } from './fixtureDef'
import { fixtureTypeFromOfl, oflModeChannelNames, type OflFixture } from './oflImport'
import { defFromQxf, parseXml, type XmlNode } from './qxf'
import { LOOK_DEFAULTS } from './catalog'

export interface ReadResult {
  def: FixtureDef
  report: string[]
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function readFixtureFile(name: string, bytes: Uint8Array): ReadResult {
  const lower = name.toLowerCase()
  if (lower.endsWith('.svfixture')) return readStudioFile(bytes)
  if (lower.endsWith('.qxf')) {
    const { def } = defFromQxf(strFromU8(bytes))
    def.source = { kind: 'file', label: `QLC+ file ${name}` }
    return { def, report: [`Read a QLC+ fixture: ${summary(def)}.`] }
  }
  if (lower.endsWith('.gdtf')) return readGdtf(name, bytes)
  if (lower.endsWith('.json')) {
    const json = JSON.parse(strFromU8(bytes))
    if (json?.format === 'sound-visualizer-fixture') return { def: json as FixtureDef, report: [`Read a Fixture Studio definition: ${summary(json)}.`] }
    if (json?.name && Array.isArray(json.modes)) {
      const def = defFromOfl(json as OflFixture, json.manufacturerKey ?? json.meta?.manufacturer ?? manufacturerFromName(name), name)
      return { def, report: [`Read an Open Fixture Library fixture: ${summary(def)}.`] }
    }
    throw new Error('This JSON file isn’t an Open Fixture Library fixture or a Fixture Studio file.')
  }
  throw new Error('Fixture Studio reads .svfixture, .json (Open Fixture Library), .qxf (QLC+) and .gdtf files.')
}

function manufacturerFromName(file: string): string {
  return file.split(/[\\/]/).slice(-2, -1)[0] ?? 'Unknown'
}

export function summary(def: FixtureDef): string {
  const modes = def.modes.length
  const most = Math.max(0, ...def.modes.map((m) => m.channels.length))
  const parts = def.parts.length
  return `${def.manufacturer} ${def.name}, ${modes} mode${modes === 1 ? '' : 's'} (up to ${most} channels)${parts > 1 ? `, ${parts} parts` : ''}`
}

/** An OFL fixture → a definition with all its modes and channel names. */
export function defFromOfl(fx: OflFixture, manufacturer: string, key = fx.name): FixtureDef {
  const types = fx.modes.map((_, i) => fixtureTypeFromOfl(key, manufacturer, fx, i))
  return defFromTypes(types, {
    name: fx.name,
    manufacturer,
    source: { kind: 'library', label: 'Open Fixture Library', url: `https://open-fixture-library.org/${key}` },
    modeNames: fx.modes.map((m) => m.name),
    names: fx.modes.map((_, i) => oflModeChannelNames(fx, i))
  })
}

function readStudioFile(bytes: Uint8Array): ReadResult {
  const files = unzipSync(bytes)
  const studio = files['studio.json']
  if (studio) {
    const def = JSON.parse(strFromU8(studio)) as FixtureDef
    return { def, report: [`Opened ${summary(def)}, version ${def.revision}.`] }
  }
  const ofl = files['fixture.json']
  if (ofl) {
    const def = defFromOfl(JSON.parse(strFromU8(ofl)), 'Unknown')
    return { def, report: [`Opened the fixture inside (no Studio extras): ${summary(def)}.`] }
  }
  throw new Error('This .svfixture file is empty or damaged.')
}

// ---------------------------------------------------------------------------
// GDTF
// ---------------------------------------------------------------------------

const GDTF_FN: Array<[RegExp, ChannelFn]> = [
  [/^Dimmer$/i, 'dimmer'], [/^Pan$/i, 'pan'], [/^Tilt$/i, 'tilt'],
  [/^(PanTiltSpeed|PanTiltTime|MSpeed|PositionMSpeed)$/i, 'panTiltSpeed'],
  [/^ColorAdd_R$|^ColorRGB_Red$/i, 'red'], [/^ColorAdd_G$|^ColorRGB_Green$/i, 'green'], [/^ColorAdd_B$|^ColorRGB_Blue$/i, 'blue'],
  [/^ColorAdd_WW$/i, 'warmWhite'], [/^ColorAdd_CW$/i, 'coolWhite'], [/^ColorAdd_W$|^ColorRGB_White$/i, 'white'],
  [/^ColorAdd_(A|RY)$/i, 'amber'], [/^ColorAdd_UV$/i, 'uv'], [/^ColorAdd_(L|GY)$/i, 'lime'],
  [/^ColorSub_C$/i, 'cyan'], [/^ColorSub_M$/i, 'magenta'], [/^ColorSub_Y$/i, 'yellow'],
  [/^Color\d+$/i, 'colorWheel'], [/^ColorMacro\d*$/i, 'colorMacro'], [/^(CTO|CTC|CTB)$/i, 'colorTemp'],
  [/^Gobo\d+(Pos)?(Rotate|Spin)?$/i, 'gobo'], [/^Gobo\d+(Pos)?Rotate$|^Gobo\d+SelectSpin$/i, 'goboRotation'],
  [/^Prism\d+(Pos)?Rotate$/i, 'prismRotation'], [/^Prism\d+$/i, 'prism'],
  [/^Zoom$/i, 'zoom'], [/^Focus\d*$/i, 'focus'], [/^Iris$/i, 'iris'], [/^Frost\d*$/i, 'frost'],
  [/^Shutter\d*(Strobe)?$|^StrobeFrequency$|^StrobeModeShutter$/i, 'shutter'],
  [/^Effects\d*Rate$|^Effects\d*Speed$/i, 'programSpeed'], [/^Effects\d*$|^Effects\d*Adjust\d*$/i, 'program'],
  [/^(Fan|Fans)/i, 'fan'], [/^Fog|^Haze/i, 'fog'], [/^NoFeature$/i, 'none'],
  [/^(Control|Reset|Function|Display|Lamp)/i, 'control']
]

function gdtfFn(attribute: string): ChannelFn {
  // The rotate variants must win over the plain gobo/prism names.
  if (/^Gobo\d+(Pos)?Rotate$|SelectSpin$/i.test(attribute)) return 'goboRotation'
  for (const [re, fn] of GDTF_FN) if (re.test(attribute)) return fn
  return 'other'
}

/** CIE xyY (GDTF colours) → sRGB 0..1. */
function xyYToRgb(x: number, y: number, Y = 1): [number, number, number] {
  if (y <= 0) return [1, 1, 1]
  const X = (x * Y) / y
  const Z = ((1 - x - y) * Y) / y
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z
  let b = 0.0557 * X - 0.204 * Y + 1.057 * Z
  const peak = Math.max(r, g, b, 1e-6)
  ;[r, g, b] = [r / peak, g / peak, b / peak].map((v) => Math.max(0, v))
  const gamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
  return [gamma(r), gamma(g), gamma(b)]
}

function dmxValue(v: string | undefined, bytes: number): number {
  const m = /^(\d+)\/(\d+)$/.exec(v ?? '')
  if (!m) return 0
  const value = Number(m[1])
  const res = Number(m[2])
  // Bring a value written at 2 or 3 bytes down to the coarse byte.
  return Math.min(255, Math.floor(value / Math.pow(256, Math.max(0, res - 1))) * (bytes > 0 ? 1 : 1))
}

function findAll(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  for (const c of node.children) {
    if (c.name === name) out.push(c)
    findAll(c, name, out)
  }
  return out
}

function readGdtf(fileName: string, bytes: Uint8Array): ReadResult {
  const files = unzipSync(bytes)
  const desc = files['description.xml']
  if (!desc) throw new Error('This .gdtf file has no description.xml inside.')
  const root = parseXml(strFromU8(desc))
  const ft = findAll(root, 'FixtureType')[0]
  if (!ft) throw new Error('No fixture type in this GDTF file.')
  const name = ft.attrs.LongName || ft.attrs.Name || fileName.replace(/\.gdtf$/i, '')
  const manufacturer = ft.attrs.Manufacturer || 'Unknown'
  const report: string[] = []

  // Wheels: slot colours and gobo images.
  const wheels = new Map<string, Array<{ name: string; rgb?: [number, number, number]; image?: string }>>()
  for (const wheel of findAll(ft, 'Wheel')) {
    wheels.set(
      wheel.attrs.Name ?? '',
      wheel.children.filter((s) => s.name === 'Slot').map((s) => {
        const c = /^([\d.]+),([\d.]+),([\d.]+)$/.exec(s.attrs.Color ?? '')
        return { name: s.attrs.Name ?? '', rgb: c ? xyYToRgb(Number(c[1]), Number(c[2])) : undefined, image: s.attrs.MediaFileName }
      })
    )
  }

  // Size: the biggest model.
  const models = findAll(ft, 'Model').map((m) => [Number(m.attrs.Length ?? 0), Number(m.attrs.Height ?? 0), Number(m.attrs.Width ?? 0)])
  const size: [number, number, number] | undefined = models.length ? [Math.max(...models.map((m) => m[0])), Math.max(...models.map((m) => m[1])), Math.max(...models.map((m) => m[2]))] : undefined

  const parts: PartDef[] = []
  const partByGeometry = new Map<string, PartDef>()
  let notShown = 0
  const modes = findAll(ft, 'DMXMode').map((mode) => {
    const dmxChannels = findAll(mode, 'DMXChannel')
    // Geometries that carry their own colour are parts (cells, rings, heads).
    const colourGeos = new Set(dmxChannels.filter((c) => /^Color(Add|RGB|Sub)/i.test(findAll(c, 'LogicalChannel')[0]?.attrs.Attribute ?? '')).map((c) => c.attrs.Geometry ?? ''))
    const multi = colourGeos.size > 1
    const slots: Array<ChannelDef | null> = []
    for (const c of dmxChannels) {
      const offsets = (c.attrs.Offset ?? '').split(',').map(Number).filter((n) => n > 0)
      if (!offsets.length) continue
      const logical = findAll(c, 'LogicalChannel')[0]
      const attribute = logical?.attrs.Attribute ?? 'NoFeature'
      const fn = gdtfFn(attribute)
      if (!FN[fn].head) notShown++
      const geometry = c.attrs.Geometry ?? ''
      let part: string | null = null
      if (multi && colourGeos.has(geometry)) {
        let p = partByGeometry.get(geometry)
        if (!p) {
          p = { id: newKey('p'), name: geometry, role: 'pixel', cell: partByGeometry.size }
          partByGeometry.set(geometry, p)
          parts.push(p)
        }
        part = p.id
      }
      const functions = findAll(c, 'ChannelFunction')
      const ranges: RangeDef[] = []
      functions.forEach((f, k) => {
        const lo = dmxValue(f.attrs.DMXFrom, offsets.length)
        const nextFrom = functions[k + 1] ? dmxValue(functions[k + 1].attrs.DMXFrom, offsets.length) - 1 : 255
        const hi = Math.max(lo, nextFrom)
        const label = f.attrs.Name || f.attrs.Attribute || `${lo}–${hi}`
        const sets = findAll(f, 'ChannelSet')
        const wheel = wheels.get(f.attrs.Wheel ?? '')
        if (wheel && sets.length) {
          sets.forEach((s, j) => {
            const slot = wheel[Math.max(0, Number(s.attrs.WheelSlotIndex ?? j + 1) - 1)]
            const slo = dmxValue(s.attrs.DMXFrom, offsets.length)
            const shi = sets[j + 1] ? dmxValue(sets[j + 1].attrs.DMXFrom, offsets.length) - 1 : hi
            if (!slot || shi < slo) return
            if (fn === 'gobo') ranges.push({ lo: slo, hi: shi, label: s.attrs.Name || slot.name, kind: 'slot', gobo: /open/i.test(slot.name) ? 0 : Number(s.attrs.WheelSlotIndex ?? j + 1) - 1 })
            else ranges.push({ lo: slo, hi: shi, label: s.attrs.Name || slot.name, kind: 'slot', color: slot.rgb ? hexOf(slot.rgb) : undefined })
          })
          return
        }
        const a = f.attrs.Attribute ?? ''
        if (fn === 'shutter') ranges.push({ lo, hi, label, kind: /strobe|pulse|random/i.test(a + label) ? 'strobe' : /closed/i.test(label) ? 'closed' : 'open' })
        else if (fn === 'program') ranges.push({ lo, hi, label, kind: /nofeature|off/i.test(a + label) ? 'off' : 'program', pattern: /nofeature|off/i.test(a + label) ? 'none' : 'chase' })
        else if (fn === 'goboRotation' || fn === 'prismRotation') ranges.push({ lo, hi, label, kind: 'spin', from: /stop/i.test(label) ? 0 : /ccw|counter/i.test(label) ? -0.1 : 0.1, to: /stop/i.test(label) ? 0 : /ccw|counter/i.test(label) ? -1.5 : 1.5 })
        else if (functions.length > 1) ranges.push({ lo, hi, label })
      })
      const name = attribute.replace(/_/g, ' ')
      offsets.forEach((o, k) => {
        while (slots.length < o) slots.push(null)
        slots[o - 1] = { id: newKey('c'), name: k === 0 ? name : `${name} fine`, fn, part, ranges: k === 0 ? ranges : [], confidence: 'sure', ...(k > 0 ? { fine: true } : {}) }
      })
    }
    const channels: ChannelDef[] = slots.map((c, i) => c ?? { id: newKey('c'), name: `Channel ${i + 1}`, fn: 'none', part: null, ranges: [], confidence: 'guessed' })
    return { id: newKey('m'), name: mode.attrs.Name ?? `${channels.length}-channel`, channels }
  })
  if (!modes.length) throw new Error('No DMX modes in this GDTF file.')
  const fns = new Set(modes.flatMap((m) => m.channels.map((c) => c.fn)))
  const kind = fns.has('pan') || fns.has('tilt') ? (fns.has('gobo') ? 'spot' : 'wash') : parts.length > 1 ? 'bar' : fns.has('laser') ? 'laser' : 'par'
  const shape = KINDS[kind].shape
  const def: FixtureDef = {
    format: 'sound-visualizer-fixture',
    formatVersion: 1,
    id: newKey('fx'),
    name,
    manufacturer,
    kind,
    look: {
      shape,
      size: size && size.every((v) => v > 0) ? size : [...LOOK_DEFAULTS[shape].size],
      beam: [...LOOK_DEFAULTS[shape].beam],
      pan: kind === 'wash' || kind === 'spot' ? 540 : undefined,
      tilt: kind === 'wash' || kind === 'spot' ? 270 : undefined,
      output: 1,
      mount: KINDS[kind].mount
    },
    parts,
    modes,
    revision: 0,
    history: [],
    source: { kind: 'file', label: `GDTF file ${fileName}` }
  }
  report.push(`Read a GDTF fixture: ${summary(def)}.`)
  if (notShown) report.push(`${notShown} channel${notShown === 1 ? ' is' : 's are'} kept but not shown on the twin (fans, focus, control and the like).`)
  return { def, report }
}

// ---------------------------------------------------------------------------
// Writing: Open Fixture Library JSON and .svfixture
// ---------------------------------------------------------------------------

const OFL_COLOR: Partial<Record<ChannelFn, string>> = {
  red: 'Red', green: 'Green', blue: 'Blue', indigo: 'Indigo', white: 'White', warmWhite: 'Warm White', coolWhite: 'Cold White', amber: 'Amber', uv: 'UV', lime: 'Lime', cyan: 'Cyan', magenta: 'Magenta', yellow: 'Yellow'
}

const OFL_CATEGORY: Record<FixtureDef['kind'], string[]> = {
  par: ['Color Changer'], uplight: ['Color Changer'], wash: ['Moving Head', 'Color Changer'], spot: ['Moving Head'], beam: ['Moving Head'],
  bar: ['Pixel Bar', 'Color Changer'], tube: ['Pixel Bar'], panel: ['Matrix', 'Color Changer'], cluster: ['Color Changer', 'Blinder'],
  gigbar: ['Effect', 'Color Changer'], strip: ['Color Changer'], strobe: ['Strobe'], laser: ['Laser'], effect: ['Effect'],
  fog: ['Smoke'], sfx: ['Other'], dimmer: ['Dimmer'], string: ['Pixel Bar'], acrylic: ['Color Changer'], other: ['Other']
}

function spinText(v: number): string {
  if (!v) return 'stop'
  return `${Math.round(Math.min(100, (Math.abs(v) / 1.5) * 100))}% ${v < 0 ? 'CCW' : 'CW'}`
}

/** The capabilities OFL wants for one channel: covering 0-255 with no gaps. */
function capabilities(def: FixtureDef, c: ChannelDef, wheelName: string): Array<Record<string, unknown>> {
  const single = (cap: Record<string, unknown>) => [cap]
  switch (c.fn) {
    case 'dimmer':
      return single({ type: 'Intensity' })
    case 'pan':
      return single({ type: 'Pan', angleStart: '0deg', angleEnd: `${def.look.pan ?? 540}deg` })
    case 'tilt':
      return single({ type: 'Tilt', angleStart: '0deg', angleEnd: `${def.look.tilt ?? 270}deg` })
    case 'panTiltSpeed':
      return single({ type: 'PanTiltSpeed', speedStart: 'fast', speedEnd: 'slow' })
    case 'zoom':
      return single({ type: 'Zoom', angleStart: `${def.look.beam[0]}deg`, angleEnd: `${def.look.beam[1]}deg` })
    case 'focus':
      return single({ type: 'Focus', distanceStart: 'near', distanceEnd: 'far' })
    case 'iris':
      return single({ type: 'Iris', openPercentStart: 'open', openPercentEnd: 'closed' })
    case 'frost':
      return single({ type: 'Frost', frostIntensityStart: 'off', frostIntensityEnd: 'high' })
    case 'colorTemp':
      return single({ type: 'ColorTemperature', colorTemperatureStart: 'warm', colorTemperatureEnd: 'cold' })
    case 'programSpeed':
      return single({ type: 'EffectSpeed', speedStart: 'slow', speedEnd: 'fast' })
    case 'sound':
      return single({ type: 'SoundSensitivity', soundSensitivityStart: 'low', soundSensitivityEnd: 'high' })
    case 'fog':
      return single({ type: 'FogOutput', fogOutputStart: 'off', fogOutputEnd: 'high' })
    case 'none':
      return single({ type: 'NoFunction' })
    case 'panRotation':
      if (!c.ranges.length) return single({ type: 'PanContinuous', speedStart: 'slow CW', speedEnd: 'fast CW' })
      break
    case 'tiltRotation':
      if (!c.ranges.length) return single({ type: 'TiltContinuous', speedStart: 'slow CW', speedEnd: 'fast CW' })
      break
    case 'dimmerMode':
      return single({ type: 'Maintenance', comment: c.name })
    case 'beamShaper':
      return single({ type: 'Generic', comment: c.name })
    case 'specialFx':
      return single({ type: 'Effect', effectName: c.name })
    case 'hue':
    case 'saturation':
    case 'fan':
    case 'control':
    case 'other':
      return single({ type: 'Generic', comment: c.name })
  }
  const color = OFL_COLOR[c.fn]
  if (color) return single({ type: 'ColorIntensity', color })
  const ranges = [...c.ranges].sort((a, b) => a.lo - b.lo)
  if (!ranges.length) {
    if (c.fn === 'shutter') return single({ type: 'ShutterStrobe', shutterEffect: 'Strobe', speedStart: 'slow', speedEnd: 'fast' })
    if (c.fn === 'prism') return single({ type: 'Prism' })
    if (c.fn === 'colorMacro' || c.fn === 'colorWheel') return single({ type: 'ColorPreset', comment: c.name })
    return single({ type: 'Effect', effectName: c.name })
  }
  const out: Array<Record<string, unknown>> = []
  let at = 0
  const gap = (to: number) => {
    if (to >= at) out.push({ dmxRange: [at, to], type: 'NoFunction' })
  }
  let slot = 0
  for (const r of ranges) {
    if (r.lo > at) gap(r.lo - 1)
    const dmxRange = [Math.max(at, r.lo), r.hi]
    if (dmxRange[1] < dmxRange[0]) continue
    const comment = r.label
    switch (c.fn) {
      case 'shutter':
        out.push({ dmxRange, type: 'ShutterStrobe', shutterEffect: r.kind === 'closed' ? 'Closed' : r.kind === 'open' ? 'Open' : 'Strobe', ...(r.kind === 'strobe' ? { speedStart: 'slow', speedEnd: 'fast' } : {}), comment })
        break
      case 'colorWheel':
      case 'gobo':
        if (r.kind === 'off') out.push({ dmxRange, type: 'NoFunction', comment })
        else out.push({ dmxRange, type: 'WheelSlot', wheel: wheelName, slotNumber: ++slot, comment })
        break
      case 'colorMacro':
        out.push(r.color ? { dmxRange, type: 'ColorPreset', colors: [r.color], comment } : { dmxRange, type: 'NoFunction', comment })
        break
      case 'goboRotation':
        out.push({ dmxRange, type: 'WheelRotation', wheel: wheelName.replace(/ rotation$/i, ''), speedStart: spinText(r.from ?? 0), speedEnd: spinText(r.to ?? 0), comment })
        break
      case 'prismRotation':
        out.push({ dmxRange, type: 'PrismRotation', speedStart: spinText(r.from ?? 0), speedEnd: spinText(r.to ?? 0), comment })
        break
      case 'panRotation':
      case 'tiltRotation':
        out.push({ dmxRange, type: c.fn === 'panRotation' ? 'PanContinuous' : 'TiltContinuous', speedStart: spinText(r.from ?? 0), speedEnd: spinText(r.to ?? 0), comment })
        break
      case 'rotation':
        out.push({ dmxRange, type: 'Rotation', speedStart: spinText(r.from ?? 0), speedEnd: spinText(r.to ?? 0), comment })
        break
      case 'prism':
        out.push(r.kind === 'off' ? { dmxRange, type: 'NoFunction', comment } : { dmxRange, type: 'Prism', comment })
        break
      default:
        out.push(r.kind === 'off' ? { dmxRange, type: 'NoFunction', comment } : { dmxRange, type: 'Effect', effectName: comment })
    }
    at = r.hi + 1
  }
  gap(255)
  return out
}

/**
 * The definition as an Open Fixture Library fixture. Cells become an OFL matrix
 * (one pixel per part, channels as templates), so other OFL tools keep the cells.
 */
export function defToOfl(def: FixtureDef): Record<string, unknown> {
  const available: Record<string, Record<string, unknown>> = {}
  const templates: Record<string, Record<string, unknown>> = {}
  const wheels: Record<string, { slots: Array<Record<string, unknown>> }> = {}
  const pixels = def.parts
  const pixelIds = new Set(pixels.map((p) => p.id))
  const keyFor = new Map<string, string>()
  const used = new Set<string>()
  const unique = (base: string) => {
    let k = base
    let n = 2
    while (used.has(k)) k = `${base} ${n++}`
    used.add(k)
    return k
  }
  for (const mode of def.modes) {
    mode.channels.forEach((c, i) => {
      if (c.fine) {
        // Fine channels are aliases of the coarse channel before them.
        const coarse = mode.channels.slice(0, i).reverse().find((x) => x.fn === c.fn && x.part === c.part && !x.fine)
        const ck = coarse && keyFor.get(coarse.id)
        if (ck) {
          const k = `${ck} fine`
          const target = pixelIds.has(c.part ?? '') ? templates[ck.replace(/ [^ ]+$/, ' $pixelKey')] ?? available[ck] : available[ck]
          if (target) target.fineChannelAliases = [...new Set([...((target.fineChannelAliases as string[]) ?? []), pixelIds.has(c.part ?? '') ? `${ck.replace(/ [^ ]+$/, ' $pixelKey')} fine` : k])]
          keyFor.set(c.id, k)
          return
        }
      }
      const part = def.parts.find((p) => p.id === c.part)
      if (part && pixelIds.has(part.id)) {
        // Template channel shared by all pixels: "Red $pixelKey" → "Red Cell 1".
        const pixelKey = part.name
        const tpl = `${c.name} $pixelKey`
        if (!templates[tpl]) templates[tpl] = { capabilities: capabilities(def, c, `${c.name}`) }
        keyFor.set(c.id, `${c.name} ${pixelKey}`)
        return
      }
      const base = part ? `${part.name} ${c.name}` : c.name
      const existing = [...keyFor.entries()].find(([id]) => {
        const other = def.modes.flatMap((m) => m.channels).find((x) => x.id === id)
        return other && other.fn === c.fn && other.part === c.part && other.name === c.name && JSON.stringify(other.ranges) === JSON.stringify(c.ranges)
      })
      if (existing) {
        keyFor.set(c.id, existing[1])
        return
      }
      const key = unique(base)
      keyFor.set(c.id, key)
      if (c.fn === 'colorWheel' || c.fn === 'gobo') {
        wheels[key] = {
          slots: c.ranges.filter((r) => r.kind !== 'off').map((r) =>
            c.fn === 'colorWheel'
              ? r.color && r.color.toLowerCase() !== '#ffffff' ? { type: 'Color', name: r.label, colors: [r.color] } : { type: 'Open' }
              : (r.gobo ?? 1) === 0 ? { type: 'Open' } : { type: 'Gobo', name: r.label }
          )
        }
      }
      const caps = capabilities(def, c, key)
      available[key] = caps.length === 1 && !caps[0].dmxRange ? { capability: caps[0] } : { capabilities: caps }
    })
  }
  // Single-capability templates are written as `capability`.
  for (const t of Object.values(templates)) {
    const caps = t.capabilities as Array<Record<string, unknown>>
    if (caps.length === 1 && !caps[0].dmxRange) {
      delete t.capabilities
      t.capability = caps[0]
    }
  }
  const now = new Date().toISOString().slice(0, 10)
  const ofl: Record<string, unknown> = {
    $schema: 'https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/master/schemas/fixture.json',
    name: def.name,
    categories: OFL_CATEGORY[def.kind],
    meta: { authors: ['Sound Visualizer Fixture Studio'], createDate: now, lastModifyDate: now },
    comment: def.notes,
    links: def.manualUrl ? { manual: [def.manualUrl] } : undefined,
    physical: {
      dimensions: def.look.size.map((v) => Math.round(v * 1000)),
      lens: { degreesMinMax: def.look.beam }
    }
  }
  if (Object.keys(wheels).length) ofl.wheels = wheels
  if (pixels.length) ofl.matrix = { pixelKeys: [[pixels.map((p) => p.name)]] }
  ofl.availableChannels = available
  if (Object.keys(templates).length) ofl.templateChannels = templates
  ofl.modes = def.modes.map((m) => ({ name: m.name, channels: m.channels.map((c) => keyFor.get(c.id) ?? null) }))
  return JSON.parse(JSON.stringify(ofl))
}

export function writeStudioFile(def: FixtureDef): Uint8Array {
  return zipSync({
    'fixture.json': strToU8(JSON.stringify(defToOfl(def), null, 2)),
    'studio.json': strToU8(JSON.stringify(def, null, 2))
  })
}

export function fileNameFor(def: FixtureDef, ext: string): string {
  return `${def.manufacturer} ${def.name}`.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + ext
}
