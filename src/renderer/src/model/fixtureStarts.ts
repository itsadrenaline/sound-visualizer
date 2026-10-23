/**
 * Starting points for a new fixture: for each kind of light, the channel layouts
 * lights of that kind usually come with (a 3-channel RGB PAR, a 16-channel spot,
 * an 8-cell 24-channel bar…), plus any channel count you type.
 *
 * Which counts are offered, and which are marked common, comes from how often
 * each mode size turns up for that kind of light across SoundSwitch's fixture
 * library (counted per kind; only the totals were used). The channel orders are
 * the usual ones for each size, written here; a starting point is a draft to
 * check against the manual, so every channel starts as "guessed".
 */
import type { CellLayout } from './catalog'
import type { HeadRole } from './heads'
import { FN, KINDS, blankDef, makeChannel, newKey, type ChannelDef, type ChannelFn, type FixtureDef, type FixtureKind, type PartDef } from './fixtureDef'

// ---------------------------------------------------------------------------
// Colours per cell
// ---------------------------------------------------------------------------

export type CellColours = 'RGB' | 'RGBW' | 'RGBA' | 'RGBWA' | 'RGBWAUV' | 'W' | 'WW' | 'WWCW'

export const CELL_COLOURS: Record<CellColours, { label: string; fns: ChannelFn[] }> = {
  RGB: { label: 'RGB', fns: ['red', 'green', 'blue'] },
  RGBW: { label: 'RGBW', fns: ['red', 'green', 'blue', 'white'] },
  RGBA: { label: 'RGBA', fns: ['red', 'green', 'blue', 'amber'] },
  RGBWA: { label: 'RGBWA', fns: ['red', 'green', 'blue', 'white', 'amber'] },
  RGBWAUV: { label: 'RGBWA+UV', fns: ['red', 'green', 'blue', 'white', 'amber', 'uv'] },
  W: { label: 'White', fns: ['white'] },
  WW: { label: 'Warm white', fns: ['warmWhite'] },
  WWCW: { label: 'Warm + cool white', fns: ['warmWhite', 'coolWhite'] }
}

/** Kinds made of cells that repeat the same channels. */
export const CELL_KINDS: FixtureKind[] = ['bar', 'tube', 'panel', 'cluster', 'strip', 'string']
/** Kinds that often have an LED ring around the lens. */
export const RING_KINDS: FixtureKind[] = ['wash', 'spot', 'beam', 'par']

// ---------------------------------------------------------------------------
// The layouts
// ---------------------------------------------------------------------------

interface CellSpec {
  n: number
  per: ChannelFn[]
  shared?: ChannelFn[]
  after?: ChannelFn[]
  layout?: CellLayout
  /** Each cell is a warm white centre with an RGB ring around it (retro hex lights). */
  ringed?: boolean
}

interface PartSpec {
  name: string
  role: HeadRole
  fns: ChannelFn[]
}

interface Spec {
  label: string
  fns?: ChannelFn[]
  /** Channels to name and fill in from the manual (marked missing). */
  blank?: number
  cells?: CellSpec
  parts?: { shared?: ChannelFn[]; list: PartSpec[] }
  common?: boolean
}

const D: ChannelFn = 'dimmer'
const S: ChannelFn = 'shutter'
const RGB: ChannelFn[] = ['red', 'green', 'blue']
const RGBW: ChannelFn[] = [...RGB, 'white']
const RGBWAUV: ChannelFn[] = [...RGBW, 'amber', 'uv']
const PT: ChannelFn[] = ['pan', 'tilt']
const PT16: ChannelFn[] = ['pan', 'pan', 'tilt', 'tilt', 'panTiltSpeed']

const SPECS: Record<FixtureKind, Spec[]> = {
  par: [
    { label: 'RGB', fns: RGB, common: true },
    { label: 'RGBW', fns: RGBW, common: true },
    { label: 'Dimmer, RGB, strobe', fns: [...RGB, D, S] },
    { label: 'RGBWA+UV', fns: RGBWAUV, common: true },
    { label: 'Dimmer, RGB, presets, strobe, programs', fns: [D, ...RGB, 'colorMacro', S, 'program'] },
    { label: 'Dimmer, RGBW, strobe, programs', fns: [D, ...RGBW, S, 'program', 'programSpeed'] },
    { label: 'Dimmer, RGBWA+UV, strobe, programs', fns: [D, ...RGBWAUV, S, 'program', 'programSpeed'] },
    { label: 'Full: + presets and dimmer curve', fns: [D, ...RGBWAUV, S, 'colorMacro', 'program', 'programSpeed', 'dimmerMode'] }
  ],
  uplight: [
    { label: 'RGB', fns: RGB },
    { label: 'RGBW', fns: RGBW },
    { label: 'RGBWA+UV', fns: RGBWAUV, common: true },
    { label: 'Dimmer, RGBWA+UV, strobe, programs', fns: [D, ...RGBWAUV, S, 'program', 'programSpeed'], common: true }
  ],
  strip: [
    { label: 'RGB', fns: RGB, common: true },
    { label: 'RGBW', fns: RGBW, common: true },
    { label: '4 sections × RGB', cells: { n: 4, per: RGB, layout: { kind: 'row' } } },
    { label: '10 sections × RGB', cells: { n: 10, per: RGB, layout: { kind: 'row' } } }
  ],
  wash: [
    { label: 'Basic: pan, tilt, RGBW', fns: [...PT, D, S, ...RGBW, 'panTiltSpeed'], common: true },
    { label: 'With fine pan/tilt', fns: [...PT16, D, S, ...RGBW], common: true },
    { label: '+ zoom and control', fns: [...PT16, D, S, ...RGBW, 'zoom', 'control'] },
    { label: '+ colour presets', fns: [...PT16, D, S, ...RGBW, 'colorMacro', 'zoom', 'control'], common: true },
    { label: '+ programs', fns: [...PT16, D, S, ...RGBW, 'colorMacro', 'zoom', 'program', 'programSpeed', 'control'], common: true },
    { label: '3 zones × RGBW', cells: { n: 3, per: RGBW, shared: [...PT16, D, S, 'zoom', 'control'], layout: { kind: 'ringCentre' } } },
    { label: '7 LEDs × RGBW', cells: { n: 7, per: RGBW, shared: [...PT16, D, S, 'zoom'], layout: { kind: 'ringCentre' } } }
  ],
  spot: [
    { label: 'Basic', fns: [...PT, 'panTiltSpeed', D, S, 'colorWheel', 'gobo', 'goboRotation', 'control'] },
    { label: 'With fine pan/tilt', fns: [...PT16, D, S, 'colorWheel', 'gobo', 'goboRotation', 'control'], common: true },
    { label: '+ prism and focus', fns: [...PT16, D, S, 'colorWheel', 'gobo', 'goboRotation', 'prism', 'focus', 'control'] },
    { label: '+ prism rotation', fns: [...PT16, D, S, 'colorWheel', 'gobo', 'goboRotation', 'prism', 'prismRotation', 'focus', 'control'], common: true },
    { label: 'Two gobo wheels, zoom', fns: [...PT16, D, S, 'colorWheel', 'gobo', 'gobo', 'goboRotation', 'prism', 'prismRotation', 'focus', 'zoom', 'control'], common: true },
    { label: '+ frost and iris', fns: [...PT16, D, S, 'colorWheel', 'gobo', 'gobo', 'goboRotation', 'prism', 'prismRotation', 'frost', 'iris', 'focus', 'zoom', 'control'] },
    { label: 'CMY colour mixing', fns: [...PT16, D, D, S, 'cyan', 'magenta', 'yellow', 'colorWheel', 'gobo', 'gobo', 'goboRotation', 'prism', 'prismRotation', 'iris', 'frost', 'focus', 'zoom'] }
  ],
  beam: [
    { label: 'Basic', fns: [...PT, D, S, 'colorWheel', 'gobo', 'prism', 'control'] },
    { label: 'With fine pan/tilt', fns: [...PT16, D, S, 'colorWheel', 'gobo', 'prism', 'prismRotation', 'control'], common: true },
    { label: '+ gobo spin, frost, focus', fns: [...PT16, D, S, 'colorWheel', 'gobo', 'goboRotation', 'prism', 'prismRotation', 'frost', 'focus', 'program', 'control'], common: true },
    { label: 'Full', fns: [...PT16, D, S, 'colorWheel', 'colorMacro', 'gobo', 'goboRotation', 'prism', 'prismRotation', 'frost', 'focus', 'iris', 'zoom', 'program', 'programSpeed', 'control'] }
  ],
  bar: [
    { label: 'Whole bar RGB', fns: RGB, common: true },
    { label: 'Whole bar RGBW', fns: RGBW },
    { label: 'Dimmer, RGBWA, strobe', fns: [D, ...RGBW, 'amber', S] },
    { label: '4 cells × RGB', cells: { n: 4, per: RGB, layout: { kind: 'row' } } },
    { label: '8 cells × RGB', cells: { n: 8, per: RGB, layout: { kind: 'row' } }, common: true },
    { label: 'Dimmer, strobe + 8 cells × RGB', cells: { n: 8, per: RGB, shared: [D, S], layout: { kind: 'row' } } },
    { label: '8 cells × RGBW', cells: { n: 8, per: RGBW, layout: { kind: 'row' } } },
    { label: '16 cells × RGB', cells: { n: 16, per: RGB, layout: { kind: 'row' } } },
    { label: 'Dimmer, strobe + 16 cells × RGB', cells: { n: 16, per: RGB, shared: [D, S], layout: { kind: 'row' } } },
    { label: '12 cells × RGBWA+UV', cells: { n: 12, per: RGBWAUV, layout: { kind: 'row' } } }
  ],
  tube: [
    { label: 'Whole tube RGB', fns: RGB, common: true },
    { label: 'Whole tube RGBW', fns: RGBW },
    { label: 'Dimmer, RGB, presets, strobe, programs', fns: [D, ...RGB, 'colorMacro', S, 'program', 'sound'] },
    { label: '8 cells × RGB', cells: { n: 8, per: RGB, layout: { kind: 'column' } } },
    { label: '16 cells × RGB', cells: { n: 16, per: RGB, layout: { kind: 'column' } }, common: true },
    { label: 'Dimmer, strobe + 16 cells × RGB', cells: { n: 16, per: RGB, shared: [D, S], layout: { kind: 'column' } } },
    { label: '16 cells × RGBW', cells: { n: 16, per: RGBW, layout: { kind: 'column' } } },
    { label: '24 cells × RGB', cells: { n: 24, per: RGB, layout: { kind: 'column' } } },
    { label: '32 cells × RGB', cells: { n: 32, per: RGB, layout: { kind: 'column' } } }
  ],
  panel: [
    { label: 'Whole panel RGB', fns: RGB, common: true },
    { label: 'Dimmer, RGB', fns: [D, ...RGB] },
    { label: '2 × 4 cells × RGB', cells: { n: 8, per: RGB, layout: { kind: 'grid', cols: 4 } }, common: true },
    { label: '4 × 4 cells × RGB', cells: { n: 16, per: RGB, layout: { kind: 'grid', cols: 4 } }, common: true },
    { label: '5 × 5 cells × RGB', cells: { n: 25, per: RGB, layout: { kind: 'grid', cols: 5 } } },
    { label: '5 × 5 cells × RGBW', cells: { n: 25, per: RGBW, layout: { kind: 'grid', cols: 5 } } },
    { label: '6 × 6 cells × RGB', cells: { n: 36, per: RGB, layout: { kind: 'grid', cols: 6 } } }
  ],
  beeEye: [
    { label: 'Basic: pan, tilt, RGBW, rotation', fns: [...PT16, D, S, ...RGBW, 'rotation'], common: true },
    { label: '+ zoom', fns: [...PT16, D, S, ...RGBW, 'rotation', 'zoom'], common: true },
    { label: '7 lenses × RGBW', cells: { n: 7, per: RGBW, shared: [...PT16, D, S, 'rotation', 'zoom'], layout: { kind: 'hex' } } },
    { label: '19 lenses × RGBW', cells: { n: 19, per: RGBW, shared: [...PT16, D, S, 'rotation', 'zoom'], layout: { kind: 'hex' } } }
  ],
  movingBar: [
    { label: 'All heads together', fns: ['tilt', 'panTiltSpeed', D, S, ...RGBW], common: true },
    { label: '4 heads: tilt + RGBW each', cells: { n: 4, per: ['tilt', ...RGBW], shared: [D, S, 'panTiltSpeed'], layout: { kind: 'row' } }, common: true },
    { label: '8 heads: tilt + RGBW each', cells: { n: 8, per: ['tilt', ...RGBW], shared: [D, S, 'panTiltSpeed'], layout: { kind: 'row' } } },
    { label: '12 heads: tilt + RGBW each', cells: { n: 12, per: ['tilt', ...RGBW], shared: [D, S, 'panTiltSpeed'], layout: { kind: 'row' } } }
  ],
  scanner: [
    { label: 'Basic', fns: [...PT, D, S, 'colorWheel', 'gobo'], common: true },
    { label: '+ gobo spin, prism', fns: [...PT, 'panTiltSpeed', D, S, 'colorWheel', 'gobo', 'goboRotation', 'prism'], common: true },
    { label: 'Fine pan/tilt, focus', fns: [...PT16, D, S, 'colorWheel', 'gobo', 'goboRotation', 'prism', 'focus'] }
  ],
  spark: [
    { label: 'Height (1 channel)', fns: ['fog'], common: true },
    { label: 'Height, fire', fns: ['fog', 'specialFx'] },
    { label: 'Height, fire, program', fns: ['fog', 'specialFx', 'program'] }
  ],
  acrylic: [
    { label: 'RGBW (4 channels)', fns: RGBW, common: true },
    { label: 'Dimmer, RGBW', fns: [D, ...RGBW], common: true },
    { label: 'Dimmer, RGBW, strobe', fns: [D, ...RGBW, S] },
    { label: 'RGB (3 channels)', fns: RGB }
  ],
  cluster: [
    { label: 'Whole light RGBWA+UV', fns: RGBWAUV, common: true },
    { label: 'Whole light + dimmer, strobe', fns: [...RGBWAUV, D, S], common: true },
    { label: '7 cells × warm white', cells: { n: 7, per: ['warmWhite'], layout: { kind: 'ringCentre' } } },
    { label: 'Dimmer, strobe + 7 warm white', cells: { n: 7, per: ['warmWhite'], shared: [D, S], layout: { kind: 'ringCentre' } } },
    { label: '4 cells × RGB', cells: { n: 4, per: RGB, layout: { kind: 'grid', cols: 2 } }, common: true },
    { label: '3 cells × RGBWA+UV', cells: { n: 3, per: RGBWAUV, layout: { kind: 'row' } } },
    { label: '7 cells: warm white + RGB ring', cells: { n: 7, per: ['warmWhite', ...RGB], shared: [D, S], layout: { kind: 'ringCentre' }, ringed: true } },
    { label: '+ white and ring effects', cells: { n: 7, per: ['warmWhite', ...RGB], shared: [D, S], after: ['program', 'programSpeed', 'colorFx', 'programSpeed'], layout: { kind: 'ringCentre' }, ringed: true } }
  ],
  gigbar: [
    {
      label: '2 pars, 2 derbies, laser',
      parts: {
        list: [
          { name: 'Par 1', role: 'beam', fns: RGB },
          { name: 'Par 2', role: 'beam', fns: RGB },
          { name: 'Derbies', role: 'derby', fns: ['colorMacro', S, 'rotation'] },
          { name: 'Laser', role: 'laser', fns: ['laser'] }
        ]
      },
      common: true
    },
    {
      label: 'Pars, derbies, strobe, laser',
      parts: {
        shared: [D],
        list: [
          { name: 'Par 1', role: 'beam', fns: RGBW },
          { name: 'Par 2', role: 'beam', fns: RGBW },
          { name: 'Derby 1', role: 'derby', fns: ['colorMacro', 'rotation'] },
          { name: 'Derby 2', role: 'derby', fns: ['colorMacro', 'rotation'] },
          { name: 'Strobe', role: 'strobe', fns: [D, S] },
          { name: 'Laser', role: 'laser', fns: ['laser', S] }
        ]
      }
    },
    {
      label: 'Full: + UV and programs',
      parts: {
        shared: [D, 'program', 'programSpeed'],
        list: [
          { name: 'Par 1', role: 'beam', fns: [...RGB, 'uv', D] },
          { name: 'Par 2', role: 'beam', fns: [...RGB, 'uv', D] },
          { name: 'Derby 1', role: 'derby', fns: ['colorMacro', S, 'rotation'] },
          { name: 'Derby 2', role: 'derby', fns: ['colorMacro', S, 'rotation'] },
          { name: 'Laser', role: 'laser', fns: ['laser', S, 'rotation'] },
          { name: 'Strobe', role: 'strobe', fns: [D, S] }
        ]
      }
    }
  ],
  strobe: [
    { label: 'Intensity only', fns: [D] },
    { label: 'Dimmer and rate', fns: [D, S], common: true },
    { label: '+ programs', fns: [D, S, 'program', 'programSpeed'] },
    { label: 'RGB strobe', fns: [D, S, ...RGB], common: true },
    { label: 'RGB + programs', fns: [D, S, ...RGB, 'program', 'programSpeed'] }
  ],
  laser: [
    { label: 'Mode, pattern, speed', fns: ['control', 'laser', 'programSpeed'], common: true },
    { label: '+ colour, rotation, size', fns: ['control', 'laser', 'colorMacro', 'zoom', 'rotation', 'positionFx', 'programSpeed'], common: true },
    { label: 'Full', fns: ['control', 'laser', 'colorMacro', 'zoom', 'rotation', 'rotation', 'rotation', 'positionFx', S, 'program', 'programSpeed', 'sound'] }
  ],
  fog: [
    { label: 'Fog output', fns: ['fog'], common: true },
    { label: 'Output and timer', fns: ['fog', 'control'], common: true },
    { label: 'Hazer: output and fan', fns: ['fog', 'fan'], common: true },
    { label: 'Output, fan, timer, mode', fns: ['fog', 'fan', 'control', 'control'] },
    { label: 'With RGB LEDs: output, dimmer, RGB, strobe, programs', fns: ['fog', D, ...RGB, S, 'program'], common: true },
    { label: 'With RGBA LEDs: output, dimmer, RGBA, strobe, programs, speed', fns: ['fog', D, ...RGB, 'amber', S, 'program', 'programSpeed'] }
  ],
  sfx: [
    { label: 'Output', fns: ['specialFx'], common: true },
    { label: 'Output and fan / motor speed', fns: ['specialFx', 'fan'], common: true },
    { label: 'Flame or spark: safety, output', fns: ['control', 'specialFx'] },
    { label: 'Flame or spark: safety, output, height, mode', fns: ['control', 'specialFx', 'zoom', 'control'] },
    { label: 'Bubbles with RGB LEDs', fns: ['specialFx', 'fan', D, ...RGB, S] }
  ],
  string: [
    { label: 'One dimmer (whole string)', fns: [D] },
    { label: 'RGB (whole string)', fns: RGB },
    { label: 'Dimmer, program, speed', fns: [D, 'program', 'programSpeed'], common: true },
    { label: '10 bulbs, a dimmer each', cells: { n: 10, per: [D], layout: { kind: 'row' } }, common: true },
    { label: '20 bulbs, a dimmer each', cells: { n: 20, per: [D], layout: { kind: 'row' } } },
    { label: '10 RGB bulbs', cells: { n: 10, per: RGB, layout: { kind: 'row' } }, common: true },
    { label: '16 RGB bulbs', cells: { n: 16, per: RGB, layout: { kind: 'row' } } }
  ],
  dimmer: [
    { label: '1 light', cells: { n: 1, per: [D], layout: { kind: 'row' } } },
    { label: '2 lights', cells: { n: 2, per: [D], layout: { kind: 'row' } } },
    { label: '4 lights (PAR can bar, 4-channel pack)', cells: { n: 4, per: [D], layout: { kind: 'row' } }, common: true },
    { label: '6 lights (6-channel pack)', cells: { n: 6, per: [D], layout: { kind: 'row' } }, common: true },
    { label: '8 lights', cells: { n: 8, per: [D], layout: { kind: 'row' } } },
    { label: '12 lights', cells: { n: 12, per: [D], layout: { kind: 'row' } } }
  ],
  other: [
    { label: 'Dimmer (or on/off)', fns: [D], common: true },
    { label: 'Dimmer and strobe', fns: [D, S] },
    { label: 'RGB colour', fns: RGB },
    { label: 'Dimmer and RGB', fns: [D, ...RGB], common: true },
    { label: 'Dimmer, RGB, strobe, program', fns: [D, ...RGB, S, 'program'] },
    { label: 'Blank: name each channel from the manual', blank: 4, common: true },
    { label: 'Blank: name each channel from the manual', blank: 8 },
    { label: 'Blank: name each channel from the manual', blank: 16 }
  ],
  effect: [
    { label: 'RGB', fns: RGB },
    { label: 'RGBW, strobe, rotation', fns: [...RGBW, S, 'rotation'], common: true },
    { label: 'Dimmer, RGB, strobe, rotation, presets', fns: [D, ...RGB, S, 'rotation', 'colorMacro'] },
    { label: 'Dimmer, RGBW, strobe, rotation, programs', fns: [D, ...RGBW, S, 'rotation', 'program'], common: true }
  ]
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** Channels that come as a 16-bit pair when listed twice in a row. */
const FINE_PAIRS = new Set<ChannelFn>(['pan', 'tilt', 'dimmer'])

/** A list of jobs as channels: a repeated pan/tilt/dimmer is the fine channel, a repeated gobo the second wheel. */
export function channelsFor(fns: ChannelFn[], part: string | null = null): ChannelDef[] {
  const seen = new Map<ChannelFn, number>()
  return fns.map((fn, i) => {
    if (i > 0 && fns[i - 1] === fn && FINE_PAIRS.has(fn)) return makeChannel(fn, part, { fine: true })
    const n = (seen.get(fn) ?? 0) + 1
    seen.set(fn, n)
    return makeChannel(fn, part, n > 1 ? { name: `${FN[fn].label} ${n}` } : {})
  })
}

function withMode(def: FixtureDef, channels: ChannelDef[], parts: PartDef[], layout?: CellLayout): FixtureDef {
  return {
    ...def,
    parts,
    look: layout ? { ...def.look, layout } : def.look,
    modes: [{ id: newKey('m'), name: `${channels.length}-channel`, channels }]
  }
}

function buildSpec(kind: FixtureKind, spec: Spec, name: string, maker: string): FixtureDef {
  const base = blankDef(kind, name, maker)
  if (spec.blank) return pad(withMode(base, [], [], base.look.layout), spec.blank)
  if (spec.fns) return withMode(base, channelsFor(spec.fns), [], base.look.layout)
  if (spec.cells) return buildCells(base, spec.cells)
  const parts: PartDef[] = []
  const channels: ChannelDef[] = channelsFor(spec.parts?.shared ?? [])
  for (const p of spec.parts?.list ?? []) {
    const part: PartDef = { id: newKey('p'), name: p.name, role: p.role }
    parts.push(part)
    channels.push(...channelsFor(p.fns, part.id))
  }
  return withMode(base, channels, parts)
}

function buildCells(base: FixtureDef, c: CellSpec): FixtureDef {
  const parts: PartDef[] = []
  const channels: ChannelDef[] = channelsFor(c.shared ?? [])
  const whites = new Set<ChannelFn>(['white', 'warmWhite', 'coolWhite'])
  for (let k = 0; k < c.n; k++) {
    if (c.ringed) {
      const centre: PartDef = { id: newKey('p'), name: `Cell ${k + 1} white`, role: 'pixel', cell: k, tint: 'warm' }
      const ring: PartDef = { id: newKey('p'), name: `Cell ${k + 1} ring`, role: 'pixel', cell: k }
      parts.push(centre, ring)
      for (const fn of c.per) channels.push(makeChannel(fn, whites.has(fn) ? centre.id : ring.id))
    } else {
      const lamp = c.per.length === 1 && c.per[0] === 'dimmer'
      const p: PartDef = { id: newKey('p'), name: `${base.kind === 'string' ? 'Bulb' : lamp ? 'Light' : 'Cell'} ${k + 1}`, role: 'pixel', cell: k, ...((c.per.includes('warmWhite') && !c.per.includes('coolWhite')) || (lamp && base.kind !== 'string') || (base.kind === 'string' && c.per.every((f) => f === 'dimmer')) ? { tint: 'warm' as const } : {}) }
      parts.push(p)
      for (const fn of c.per) channels.push(makeChannel(fn, p.id))
    }
  }
  const after = channelsFor(c.after ?? [])
  if (c.ringed && c.after?.length) {
    // The first program runs the white centres, the colour effects the rings.
    const centres = parts.filter((p) => p.tint === 'warm').map((p) => p.id)
    const rings = parts.filter((p) => p.tint !== 'warm').map((p) => p.id)
    for (const ch of after) {
      if (ch.fn === 'program') {
        ch.targets = centres
        ch.name = 'White effects'
      }
      if (ch.fn === 'colorFx') {
        ch.targets = rings
        ch.name = 'Ring effects'
      }
    }
  }
  channels.push(...after)
  return withMode(base, channels, parts, c.layout)
}

export interface StartPoint {
  id: string
  /** How many DMX channels it has. */
  count: number
  label: string
  common: boolean
  build: (name?: string, maker?: string) => FixtureDef
}

/** The starting points for a kind of light, fewest channels first. */
export function startsFor(kind: FixtureKind): StartPoint[] {
  return SPECS[kind]
    .map((spec, i) => {
      const sample = buildSpec(kind, spec, 'x', 'x')
      return {
        id: `${kind}-${i}`,
        count: sample.modes[0].channels.length,
        label: spec.label,
        common: !!spec.common,
        build: (name = 'New fixture', maker = 'Generic') => buildSpec(kind, spec, name, maker)
      }
    })
    .sort((a, b) => a.count - b.count)
}

/** One-line description of a starting point's channels, e.g. "Pan, Pan fine, Tilt, … Zoom". */
export function describeStart(def: FixtureDef): string {
  const ch = def.modes[0]?.channels ?? []
  const cells = new Set(def.parts.filter((p) => p.role === 'pixel').map((p) => p.cell)).size
  const names = ch.filter((c) => !c.part || def.parts.find((p) => p.id === c.part)?.cell === 0 || def.parts.find((p) => p.id === c.part)?.cell === undefined)
  const text = names.map((c) => (c.fine ? `${c.name} fine` : c.name)).join(', ')
  return cells > 1 ? text.replace(/(Red|Warm white)/, `[cell 1: $1`).replace(/$/, cells > 1 ? `] ×${cells}` : '') : text
}

// ---------------------------------------------------------------------------
// Any channel count
// ---------------------------------------------------------------------------

/** A cell fixture with a chosen number of cells and colours. */
export function cellsStart(kind: FixtureKind, cells: number, colours: CellColours, master: boolean, name = 'New fixture', maker = 'Generic'): FixtureDef {
  const n = Math.max(1, Math.min(170, Math.round(cells)))
  const layout: CellLayout =
    kind === 'tube' ? { kind: 'column' } : kind === 'panel' ? { kind: 'grid', cols: Math.max(1, Math.round(Math.sqrt(n))) } : kind === 'cluster' ? { kind: n === 7 ? 'ringCentre' : n === 19 ? 'hex' : 'grid', cols: Math.ceil(Math.sqrt(n)) } : { kind: 'row' }
  return buildCells(blankDef(kind, name, maker), { n, per: CELL_COLOURS[colours].fns, shared: master ? [D, S] : [], layout })
}

/**
 * A starting point with exactly `count` channels. Cell kinds work out how many
 * cells fit (trying the chosen colours first, with and without a master dimmer
 * and strobe); other kinds take the nearest layout and add or remove channels at
 * the end, marked as still to fill in.
 */
export function startWithCount(kind: FixtureKind, count: number, colours: CellColours = 'RGB', name = 'New fixture', maker = 'Generic'): { def: FixtureDef; note: string } {
  const n = Math.max(1, Math.min(512, Math.round(count)))
  if (kind === 'dimmer') {
    const def = buildCells(blankDef('dimmer', name, maker), { n, per: [D], layout: { kind: 'row' } })
    def.parts.forEach((p) => (p.tint = 'warm'))
    return { def, note: `${n} light${n === 1 ? '' : 's'}, one dimmer channel each.` }
  }
  if (kind === 'other') {
    const def = pad(withMode(blankDef('other', name, maker), [], [], undefined), n)
    return { def, note: `${n} blank channel${n === 1 ? '' : 's'}: name each from the manual and pick what it does.` }
  }
  if (CELL_KINDS.includes(kind)) {
    const order: CellColours[] = [colours, ...(['RGB', 'RGBW', 'RGBWAUV', 'RGBWA', 'RGBA', 'W'] as CellColours[]).filter((c) => c !== colours)]
    for (const c of order) {
      const per = CELL_COLOURS[c].fns.length
      for (const master of [false, true]) {
        const rest = n - (master ? 2 : 0)
        if (rest >= per && rest % per === 0) {
          const cells = rest / per
          const def = cellsStart(kind, cells, c, master, name, maker)
          return { def, note: `${n} channels: ${master ? 'master dimmer and strobe, then ' : ''}${cells} cell${cells === 1 ? '' : 's'} of ${CELL_COLOURS[c].label}. Check the order against the manual.` }
        }
      }
    }
    const per = CELL_COLOURS[colours].fns.length
    const cells = Math.max(1, Math.floor(n / per))
    const def = pad(cellsStart(kind, cells, colours, false, name, maker), n)
    return { def, note: `${n} channels don’t split evenly into ${CELL_COLOURS[colours].label} cells: made ${cells} cells and ${n - cells * per} more channel${n - cells * per === 1 ? '' : 's'} to fill in from the manual.` }
  }
  const starts = startsFor(kind)
  const exact = starts.find((s) => s.count === n)
  if (exact) return { def: exact.build(name, maker), note: `${n} channels: ${exact.label.toLowerCase()}. Check the order against the manual.` }
  const below = [...starts].reverse().find((s) => s.count < n)
  const from = below ?? starts[0]
  const def = pad(from.build(name, maker), n)
  const diff = n - from.count
  return {
    def,
    note: diff > 0 ? `Started from the ${from.count}-channel layout and added ${diff} channel${diff === 1 ? '' : 's'} at the end to fill in from the manual (red rows).` : `Started from the ${from.count}-channel layout and removed the last ${-diff}.`
  }
}

/** Add blank channels (or remove from the end) to reach `n`. */
function pad(def: FixtureDef, n: number): FixtureDef {
  const mode = def.modes[0]
  let channels = mode.channels
  if (channels.length > n) channels = channels.slice(0, n)
  while (channels.length < n) {
    const k = channels.length + 1
    channels = [...channels, { id: newKey('c'), name: `Channel ${k}`, fn: 'other', part: null, ranges: [], confidence: 'missing', note: 'Added to reach the channel count: set what it does from the manual.' }]
  }
  const used = new Set(channels.map((c) => c.part))
  return { ...def, parts: def.parts.filter((p) => used.has(p.id)), modes: [{ ...mode, channels, name: `${channels.length}-channel` }] }
}

// ---------------------------------------------------------------------------
// LED rings
// ---------------------------------------------------------------------------

export type RingColours = 'RGB' | 'RGBW'

/**
 * Adds an LED ring around the lens to a mode: a part of its own with its colour
 * channels (and, if asked, its own effects channel and speed) at the end.
 */
export function addRing(def: FixtureDef, modeIndex: number, colours: RingColours = 'RGB', effects = false): { def: FixtureDef; added: string[] } {
  const existing = def.parts.filter((p) => p.role === 'halo' && p.cell === undefined).length
  const ring: PartDef = { id: newKey('p'), name: existing ? `LED ring ${existing + 1}` : 'LED ring', role: 'halo' }
  const fns: ChannelFn[] = [...CELL_COLOURS[colours].fns]
  const channels = fns.map((fn) => makeChannel(fn, ring.id, { name: `Ring ${FN[fn].label.toLowerCase()}` }))
  if (effects) {
    const fx = makeChannel('colorFx', null, { name: 'Ring effects', targets: [ring.id] })
    channels.push(fx, makeChannel('programSpeed', null, { name: 'Ring effect speed' }))
  }
  const modes = def.modes.map((m, i) => (i === modeIndex ? { ...m, channels: [...m.channels, ...channels], name: m.name.replace(/^\d+(?=-channel)/, String(m.channels.length + channels.length)) } : m))
  return { def: { ...def, parts: [...def.parts, ring], modes }, added: channels.map((c) => c.id) }
}

/**
 * A starting layout as another mode of an existing fixture: its cells and parts
 * are matched to the fixture's own (cell 3 is the same cell 3, the LED ring the
 * same ring), and only parts it doesn't have yet are added.
 */
export function modeFromStart(def: FixtureDef, start: FixtureDef): { channels: ChannelDef[]; parts: PartDef[] } {
  const added: PartDef[] = []
  const map = new Map<string, string>()
  for (const p of start.parts) {
    const same = def.parts.find((q) => q.role === p.role && q.cell === p.cell && (p.cell === undefined ? q.name === p.name || p.role === 'halo' : /ring/i.test(q.name) === /ring/i.test(p.name)))
    if (same) map.set(p.id, same.id)
    else {
      const copy = { ...p, id: newKey('p') }
      added.push(copy)
      map.set(p.id, copy.id)
    }
  }
  const channels = start.modes[0].channels.map((c) => ({ ...c, id: newKey('c'), part: c.part ? map.get(c.part) ?? null : null }))
  return { channels, parts: added }
}

// ---------------------------------------------------------------------------
// Kind from channels, and changing kind
// ---------------------------------------------------------------------------

/** What kind of light a channel list looks like. */
export function guessKind(def: FixtureDef): FixtureKind {
  const chs = def.modes.flatMap((m) => m.channels)
  const fns = new Set(chs.map((c) => c.fn))
  const cells = new Set(def.parts.filter((p) => p.role === 'pixel').map((p) => p.cell)).size
  if (def.look.shape === 'string') return 'string'
  if (def.look.shape === 'acrylic') return 'acrylic'
  if (def.look.shape === 'beeEye') return 'beeEye'
  if (def.look.shape === 'movingBar') return 'movingBar'
  if (def.look.shape === 'scanner') return 'scanner'
  if (def.look.shape === 'spark') return 'spark'
  if (fns.has('fog')) return 'fog'
  if (fns.has('specialFx')) return 'sfx'
  if (cells > 1 && chs.filter((c) => c.part).every((c) => c.fn === 'dimmer')) return 'dimmer'
  if (fns.has('pan') || fns.has('tilt')) return fns.has('gobo') ? (fns.has('goboRotation') || fns.has('focus') || fns.has('zoom') || !fns.has('prism') ? 'spot' : 'beam') : 'wash'
  if (fns.has('laser')) return def.parts.some((p) => p.role === 'derby') ? 'gigbar' : 'laser'
  if (def.parts.some((p) => p.role === 'derby')) return 'gigbar'
  if (cells > 1) return def.parts.some((p) => p.tint === 'warm') ? 'cluster' : 'bar'
  if (fns.has('rotation')) return 'effect'
  if (fns.has('shutter') && fns.size <= 3 && !fns.has('red')) return 'strobe'
  return 'par'
}

/** The same channels as another kind of light: its look (shape, size, mount) changes, the channels don't. */
export function withKind(def: FixtureDef, kind: FixtureKind): FixtureDef {
  const b = blankDef(kind)
  const cells = new Set(def.parts.filter((p) => p.role === 'pixel').map((p) => p.cell)).size
  const layout: CellLayout | undefined = cells > 1 ? (kind === 'tube' ? { kind: 'column' } : kind === 'panel' ? { kind: 'grid', cols: Math.max(1, Math.round(Math.sqrt(cells))) } : kind === 'cluster' ? { kind: cells === 7 ? 'ringCentre' : 'hex' } : { kind: 'row' }) : undefined
  return { ...def, kind, look: { ...b.look, layout, bodyColor: def.look.bodyColor, photo: def.look.photo } }
}

export function kindLabel(kind: FixtureKind): string {
  return KINDS[kind].label
}
