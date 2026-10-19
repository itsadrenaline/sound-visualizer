/**
 * Reads QLC+ fixture definitions (.qxf, https://www.qlcplus.org, Apache 2.0) into
 * Fixture Studio definitions. Used for importing a .qxf file and, at build time,
 * for adding the QLC+ fixture library to ours (scripts/build-qlcplus.mjs).
 *
 * A .qxf lists channels (each with a group or preset saying what it does, and
 * capabilities: value ranges with names, colours or gobo pictures), modes (the
 * channel order) and, per mode, heads (the cells of a bar or the heads of a
 * multi-head fixture). It's parsed with a tiny XML reader so this file works the
 * same in the app and in Node.
 */
import { FN, KINDS, newKey, type ChannelDef, type ChannelFn, type FixtureDef, type FixtureKind, type PartDef, type RangeDef } from './fixtureDef'
import { LOOK_DEFAULTS, type LookKind } from './catalog'
import type { ProgramPattern } from './heads'

// ---------------------------------------------------------------------------
// A small XML reader: enough for well-formed fixture files
// ---------------------------------------------------------------------------

export interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1]
    if (m[1] !== undefined) top.text += m[1]
    else if (m[2]) {
      if (stack.length > 1) stack.pop()
    } else if (m[3]) {
      const attrs: Record<string, string> = {}
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unescapeXml(a[2] ?? a[3] ?? '')
      const node: XmlNode = { name: m[3], attrs, children: [], text: '' }
      top.children.push(node)
      if (!m[5]) stack.push(node)
    } else if (m[6] !== undefined) top.text += unescapeXml(m[6])
  }
  return root
}

const kids = (n: XmlNode | undefined, name: string) => (n ? n.children.filter((c) => c.name === name) : [])
const kid = (n: XmlNode | undefined, name: string) => n?.children.find((c) => c.name === name)
const textOf = (n: XmlNode | undefined) => (n?.text ?? '').trim()

// ---------------------------------------------------------------------------
// What a QLC+ channel does
// ---------------------------------------------------------------------------

const PRESET_FN: Array<[RegExp, ChannelFn, boolean?]> = [
  [/^IntensityMasterDimmer|^IntensityDimmer$/, 'dimmer'],
  [/^IntensityDimmerFine|^IntensityMasterDimmerFine/, 'dimmer', true],
  [/^IntensityRed$/, 'red'], [/^IntensityRedFine/, 'red', true],
  [/^IntensityGreen$/, 'green'], [/^IntensityGreenFine/, 'green', true],
  [/^IntensityBlue$/, 'blue'], [/^IntensityBlueFine/, 'blue', true],
  [/^IntensityWhite$/, 'white'], [/^IntensityWhiteFine/, 'white', true],
  [/^IntensityAmber$/, 'amber'], [/^IntensityAmberFine/, 'amber', true],
  [/^IntensityUV$/, 'uv'], [/^IntensityUVFine/, 'uv', true],
  [/^IntensityLime/, 'lime'], [/^IntensityIndigo/, 'blue'],
  [/^IntensityCyan$/, 'cyan'], [/^IntensityMagenta$/, 'magenta'], [/^IntensityYellow$/, 'yellow'],
  [/^PositionPan$|^PositionXAxis/, 'pan'], [/^PositionPanFine/, 'pan', true],
  [/^PositionTilt$|^PositionYAxis/, 'tilt'], [/^PositionTiltFine/, 'tilt', true],
  [/^Speed(Pan|Tilt|PanTilt)/, 'panTiltSpeed'],
  [/^ColorWheel/, 'colorWheel'], [/^ColorMacro/, 'colorMacro'],
  [/^ColorCT/, 'colorTemp'],
  [/^GoboWheel|^GoboIndex$/, 'gobo'], [/^GoboIndexFine/, 'gobo', true],
  [/^ShutterStrobe/, 'shutter'], [/^ShutterIris/, 'iris'],
  [/^BeamFocus/, 'focus'], [/^BeamZoom/, 'zoom'],
  [/^PrismRotation/, 'prismRotation'],
  [/^NoFunction/, 'none']
]

function fnOf(ch: XmlNode): { fn: ChannelFn; fine: boolean } {
  const preset = ch.attrs.Preset ?? ''
  for (const [re, fn, fine] of PRESET_FN) if (re.test(preset)) return { fn, fine: !!fine }
  const name = (ch.attrs.Name ?? '').toLowerCase()
  const groupNode = kid(ch, 'Group')
  const group = textOf(groupNode)
  const fine = groupNode?.attrs.Byte === '1' || /\bfine\b/.test(name)
  const colour = textOf(kid(ch, 'Colour')).toLowerCase()
  switch (group) {
    case 'Intensity': {
      const c = colour || (/\bred\b/.test(name) ? 'red' : /\bgreen\b/.test(name) ? 'green' : /\bblue\b/.test(name) ? 'blue' : /warm/.test(name) ? 'warm' : /\bwhite\b/.test(name) ? 'white' : /amber/.test(name) ? 'amber' : /\buv\b/.test(name) ? 'uv' : '')
      const map: Record<string, ChannelFn> = { red: 'red', green: 'green', blue: 'blue', white: 'white', warm: 'warmWhite', amber: 'amber', uv: 'uv', lime: 'lime', indigo: 'blue', cyan: 'cyan', magenta: 'magenta', yellow: 'yellow' }
      return { fn: map[c] ?? 'dimmer', fine }
    }
    case 'Pan':
      return { fn: 'pan', fine }
    case 'Tilt':
      return { fn: 'tilt', fine }
    case 'Colour':
      return { fn: /wheel/.test(name) ? 'colorWheel' : /temp|cto|ctc/.test(name) ? 'colorTemp' : 'colorMacro', fine }
    case 'Gobo':
      return { fn: /rot|spin|index/.test(name) ? 'goboRotation' : 'gobo', fine }
    case 'Shutter':
      return { fn: /iris/.test(name) ? 'iris' : 'shutter', fine }
    case 'Speed':
      return { fn: /pan|tilt|p\/t|move|motor|xy/.test(name) ? 'panTiltSpeed' : /rot/.test(name) ? 'rotation' : 'programSpeed', fine }
    case 'Prism':
      return { fn: /rot/.test(name) ? 'prismRotation' : 'prism', fine }
    case 'Beam':
      return { fn: /zoom/.test(name) ? 'zoom' : /focus/.test(name) ? 'focus' : /frost/.test(name) ? 'frost' : /iris/.test(name) ? 'iris' : 'other', fine }
    case 'Effect':
      return { fn: /laser/.test(name) ? 'laser' : /rotat/.test(name) ? 'rotation' : /sound|sensitiv/.test(name) ? 'sound' : /fog|smoke|haze/.test(name) ? 'fog' : 'program', fine }
    case 'Maintenance':
      return { fn: /fan/.test(name) ? 'fan' : 'control', fine }
    case 'Nothing':
      return { fn: 'none', fine }
    default:
      return { fn: 'other', fine }
  }
}

function patternOf(label: string, k: number): ProgramPattern {
  const t = label.toLowerCase()
  if (/no function|off|blackout|none/.test(t)) return 'none'
  if (/sound|music/.test(t)) return 'pulse'
  if (/strob/.test(t)) return 'strobe'
  if (/jump|change/.test(t)) return 'jump'
  if (/fade|gradual/.test(t)) return 'fade'
  if (/rainbow|flow/.test(t)) return 'rainbow'
  if (/chase|run/.test(t)) return 'chase'
  return (['chase', 'fade', 'jump', 'rainbow', 'strobe'] as ProgramPattern[])[k % 5]
}

function rangesOf(ch: XmlNode, fn: ChannelFn): RangeDef[] {
  const caps = kids(ch, 'Capability')
  if (!caps.length) return []
  let gobo = 0
  const out = caps.map((c, k) => {
    const lo = Math.max(0, Math.min(255, Number(c.attrs.Min ?? 0)))
    const hi = Math.max(lo, Math.min(255, Number(c.attrs.Max ?? 255)))
    const label = textOf(c) || `${lo}–${hi}`
    const t = label.toLowerCase()
    const preset = c.attrs.Preset ?? ''
    const color = [c.attrs.Res1, c.attrs.Color, c.attrs.Res].find((x) => x && /^#[0-9a-f]{6}$/i.test(x))
    const off = /no function|^off|blackout|closed|none/.test(t) || preset === 'ShutterClose'
    switch (fn) {
      case 'shutter':
        // "No function" / "no strobe" on a strobe channel means the light is simply on.
        return { lo, hi, label, kind: (preset === 'ShutterOpen' || /open|^on\b|no function|no strobe|^off|none/.test(t) ? 'open' : preset === 'ShutterClose' || /closed|blackout|shutter close/.test(t) ? 'closed' : 'strobe') as RangeDef['kind'] }
      case 'colorWheel':
      case 'colorMacro':
        return off && !color ? { lo, hi, label, kind: 'off' as const } : { lo, hi, label, kind: 'slot' as const, color: color?.toLowerCase() }
      case 'gobo': {
        const open = /open|no gobo|white/.test(t)
        if (!open) gobo++
        return { lo, hi, label, kind: 'slot' as const, gobo: open ? 0 : gobo }
      }
      case 'goboRotation':
      case 'prismRotation':
      case 'rotation': {
        if (/stop|no rot|index|fixed/.test(t) || off) return { lo, hi, label, kind: 'spin' as const, from: 0, to: 0 }
        const way = /counter|anti|ccw|reverse|left/.test(t) || /CounterClockwise/.test(preset) ? -1 : 1
        const fastFirst = /fast.*slow/.test(t) || /FastToSlow/.test(preset)
        return { lo, hi, label, kind: 'spin' as const, from: way * (fastFirst ? 1.5 : 0.1), to: way * (fastFirst ? 0.1 : 1.5) }
      }
      case 'program':
      case 'laser':
        return off ? { lo, hi, label, kind: 'off' as const, pattern: 'none' as const } : { lo, hi, label, kind: 'program' as const, pattern: patternOf(label, k) }
      case 'prism':
        return { lo, hi, label, kind: (off ? 'off' : 'slot') as RangeDef['kind'] }
      default:
        return { lo, hi, label }
    }
  })
  // A single full range on a level channel says nothing the twin needs.
  if (out.length === 1 && out[0].lo === 0 && out[0].hi === 255 && FN[fn].style === 'level') return []
  return out
}

function kindOf(type: string, name: string, heads: number, channels: ChannelFn[], size?: [number, number, number]): FixtureKind {
  const n = name.toLowerCase()
  switch (type) {
    case 'Moving Head':
      return channels.includes('gobo') ? (/beam/.test(n) ? 'beam' : 'spot') : 'wash'
    case 'Scanner':
      return 'spot'
    case 'LED Bar (Pixels)':
    case 'LED Bar (Beams)':
      if (/batten|\bbar\b|strip/.test(n)) return 'bar'
      if (/stick|tube|pole/.test(n) || (size && size[1] > size[0] * 2.5)) return 'tube'
      if (/panel|matrix/.test(n)) return 'panel'
      return 'bar'
    case 'Strobe':
      return 'strobe'
    case 'Smoke':
    case 'Hazer':
      return 'fog'
    case 'Dimmer':
      return heads > 1 ? 'dimmer' : 'par'
    case 'Laser':
      return 'laser'
    case 'Flower':
    case 'Effect':
      // Only bars of several effects are GigBars; other multi-head effects are derbies,
      // moonflowers and the like.
      if (/sparkle\s*wall|curtain|star\s*cloth/.test(n)) return 'panel'
      if (/wash/.test(n)) return 'par'
      return heads > 3 && channels.includes('red') && /bar\b|set\b|gig/.test(n) ? 'gigbar' : 'effect'
    default:
      if (heads > 1 && /retro|cluster|blinder|\bcob\b/.test(n)) return 'cluster'
      if (heads > 1 && /panel|matrix/.test(n)) return 'panel'
      if (heads > 1 && /bar|batten|strip/.test(n)) return 'bar'
      return /uplight|uplighter/.test(n) ? 'uplight' : 'par'
  }
}

export const QLC_CATEGORY: Record<string, string> = {
  'Moving Head': 'Moving Head', Scanner: 'Scanner', 'Color Changer': 'Color Changer', 'LED Bar (Pixels)': 'Pixel Bar', 'LED Bar (Beams)': 'Pixel Bar',
  Strobe: 'Strobe', Laser: 'Laser', Flower: 'Flower', Effect: 'Effect', Dimmer: 'Dimmer', Smoke: 'Smoke', Hazer: 'Hazer', Fan: 'Fan', Hazer2: 'Hazer', Other: 'Other'
}

export interface QxfResult {
  def: FixtureDef
  type: string
  categories: string[]
  power?: number
  weight?: number
}

/** A .qxf file's text → a Fixture Studio definition with all its modes. */
export function defFromQxf(xml: string): QxfResult {
  const root = parseXml(xml)
  const fx = root.children.find((c) => c.name === 'FixtureDefinition')
  if (!fx) throw new Error('Not a QLC+ fixture definition (no <FixtureDefinition>).')
  const manufacturer = textOf(kid(fx, 'Manufacturer')) || 'Unknown'
  const model = textOf(kid(fx, 'Model')) || 'Fixture'
  const type = textOf(kid(fx, 'Type')) || 'Other'

  const channelNodes = new Map<string, XmlNode>()
  for (const ch of kids(fx, 'Channel')) channelNodes.set(ch.attrs.Name ?? '', ch)

  // Physical details: the fixture's own, or the first mode's.
  const modesXml = kids(fx, 'Mode')
  const physical = kid(fx, 'Physical') ?? modesXml.map((m) => kid(m, 'Physical')).find(Boolean)
  const dims = kid(physical, 'Dimensions')
  const w = Number(dims?.attrs.Width ?? 0)
  const h = Number(dims?.attrs.Height ?? 0)
  const d = Number(dims?.attrs.Depth ?? 0)
  const size: [number, number, number] | undefined = w > 0 && h > 0 && d > 0 ? [w / 1000, h / 1000, d / 1000] : undefined
  const lens = kid(physical, 'Lens')
  const focus = kid(physical, 'Focus')
  const power = Number(kid(physical, 'Technical')?.attrs.PowerConsumption ?? 0) || undefined
  const weight = Number(dims?.attrs.Weight ?? 0) || undefined

  const parts: PartDef[] = []
  const partByName = new Map<string, PartDef>()
  const partFor = (name: string, cell: number): PartDef => {
    let p = partByName.get(name)
    if (!p) {
      p = { id: newKey('p'), name, role: 'pixel', cell }
      partByName.set(name, p)
      parts.push(p)
    }
    return p
  }

  const allFns: ChannelFn[] = []
  const modes = modesXml.map((m) => {
    const order = kids(m, 'Channel').sort((a, b) => Number(a.attrs.Number ?? 0) - Number(b.attrs.Number ?? 0)).map((c) => textOf(c))
    const heads = kids(m, 'Head').map((hd) => kids(hd, 'Channel').map((c) => Number(textOf(c))))
    const headOf = new Map<number, number>()
    heads.forEach((list, hi) => list.forEach((n) => headOf.set(n, hi)))
    const multi = heads.length > 1
    const channels: ChannelDef[] = order.map((name, i) => {
      const node = channelNodes.get(name)
      const { fn, fine } = node ? fnOf(node) : { fn: 'other' as ChannelFn, fine: false }
      allFns.push(fn)
      const hi = headOf.get(i)
      const part = multi && hi !== undefined ? partFor(`Cell ${hi + 1}`, hi).id : null
      const ch: ChannelDef = { id: newKey('c'), name: name || FN[fn].label, fn, part, ranges: node && !fine ? rangesOf(node, fn) : [], confidence: 'sure' }
      if (fine) ch.fine = true
      return ch
    })
    return { id: newKey('m'), name: m.attrs.Name ?? `${channels.length}-channel`, channels }
  })

  const kind = kindOf(type, model, parts.length, allFns, size)
  // Bars are wider than tall: some files give the length as the height.
  if (size && kind === 'bar' && size[1] > size[0]) size.splice(0, 2, size[1], size[0])
  const shape: LookKind = KINDS[kind].shape
  const lmin = Number(lens?.attrs.DegreesMin ?? 0)
  const lmax = Number(lens?.attrs.DegreesMax ?? 0)
  const panMax = Number(focus?.attrs.PanMax ?? 0)
  const tiltMax = Number(focus?.attrs.TiltMax ?? 0)
  const moving = kind === 'wash' || kind === 'spot' || kind === 'beam'
  const def: FixtureDef = {
    format: 'sound-visualizer-fixture',
    formatVersion: 1,
    id: newKey('fx'),
    name: model,
    manufacturer,
    kind,
    look: {
      shape,
      size: size ?? [...LOOK_DEFAULTS[shape].size],
      layout: kind === 'bar' ? { kind: 'row' } : kind === 'tube' ? { kind: 'column' } : undefined,
      beam: lmax > 0 ? [Math.max(1, lmin || lmax), lmax] : [...LOOK_DEFAULTS[shape].beam],
      pan: moving ? panMax || 540 : undefined,
      tilt: moving ? tiltMax || 270 : undefined,
      output: power ? Math.max(0.2, Math.min(2.5, power / 100)) : 0.6,
      mount: KINDS[kind].mount
    },
    parts,
    modes,
    revision: 0,
    history: [],
    source: { kind: 'library', label: 'QLC+ fixture library (Apache 2.0)', url: 'https://www.qlcplus.org' }
  }
  return { def, type, categories: [QLC_CATEGORY[type] ?? 'Other'], power, weight }
}

// ---------------------------------------------------------------------------
// A compact form for the bundled library: no ids, no defaults, parts by number.
// ---------------------------------------------------------------------------

export function compactDef(def: FixtureDef): unknown {
  const partIndex = new Map(def.parts.map((p, i) => [p.id, i]))
  return {
    n: def.name,
    m: def.manufacturer,
    k: def.kind,
    l: def.look,
    p: def.parts.map((p) => [p.name, p.cell ?? -1, p.role]),
    o: def.modes.map((mode) => [mode.name, mode.channels.map((c) => {
      const row: unknown[] = [c.name, c.fn, c.part === null ? -1 : partIndex.get(c.part) ?? -1]
      if (c.fine || c.ranges.length) row.push(c.fine ? 1 : 0)
      if (c.ranges.length) row.push(c.ranges)
      return row
    })])
  }
}

export function expandDef(compact: unknown, id: string, source: FixtureDef['source']): FixtureDef {
  const c = compact as { n: string; m: string; k: FixtureDef['kind']; l: FixtureDef['look']; p: Array<[string, number, PartDef['role']]>; o: Array<[string, unknown[][]]> }
  const parts: PartDef[] = c.p.map(([name, cell, role]) => ({ id: newKey('p'), name, role, ...(cell >= 0 ? { cell } : {}) }))
  return {
    format: 'sound-visualizer-fixture',
    formatVersion: 1,
    id,
    name: c.n,
    manufacturer: c.m,
    kind: c.k,
    look: c.l,
    parts,
    modes: c.o.map(([name, channels]) => ({
      id: newKey('m'),
      name,
      channels: channels.map((row) => {
        const [cname, fn, part, fine, ranges] = row as [string, ChannelFn, number, number?, RangeDef[]?]
        const ch: ChannelDef = { id: newKey('c'), name: cname, fn, part: part >= 0 ? parts[part]?.id ?? null : null, ranges: ranges ?? [], confidence: 'sure' }
        if (fine) ch.fine = true
        return ch
      })
    })),
    revision: 0,
    history: [],
    source
  }
}
