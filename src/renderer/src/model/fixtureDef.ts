/**
 * A fixture as Fixture Studio edits it: parts (the cells, heads and effects on
 * the light), modes, and per mode the DMX channels in order, each with what it
 * does, which part it drives, its value ranges and how sure we are of it.
 *
 * Every way in (the Library, SoundSwitch, a GDTF / OFL / QLC+ file, a manual,
 * a template) becomes one of these; `typeFromDef` turns it into the fixture type
 * the 3D view draws and the DMX decoder reads, so the Studio's twin and the show
 * use exactly the same code. `defToOfl` (fixtureFiles.ts) writes it out as an
 * Open Fixture Library file for sharing.
 */
import type { FixtureType } from './fixtureTypes'
import { channelListFromHeads, type ChannelRef, type HeadDef, type HeadFunction, type HeadRole, type ProgramPattern } from './heads'
import { LOOK_DEFAULTS, type CellLayout, type FixtureSpec, type LookKind } from './catalog'

// ---------------------------------------------------------------------------
// What a channel can do
// ---------------------------------------------------------------------------

export type ChannelFn =
  | 'dimmer' | 'red' | 'green' | 'blue' | 'white' | 'warmWhite' | 'coolWhite' | 'amber' | 'uv' | 'lime'
  | 'cyan' | 'magenta' | 'yellow' | 'colorWheel' | 'colorMacro' | 'colorTemp'
  | 'shutter' | 'pan' | 'tilt' | 'panTiltSpeed' | 'zoom' | 'focus' | 'iris' | 'frost'
  | 'gobo' | 'goboRotation' | 'prism' | 'prismRotation' | 'rotation' | 'laser'
  | 'program' | 'programSpeed' | 'sound' | 'fog' | 'fan' | 'control' | 'other' | 'none'

export type FnGroup = 'Intensity' | 'Colour' | 'Position' | 'Beam' | 'Gobo and prism' | 'Effects' | 'Control'

/** How a channel's 0-255 is shown on its value bar. */
export type RangeStyle = 'level' | 'slots' | 'shutter' | 'spin' | 'program' | 'plain'

export interface FnInfo {
  label: string
  group: FnGroup
  /** A colour for the channel in lists and the DMX strip. */
  swatch: string
  /** What the 3D view uses it as (none: kept, but the twin doesn't show it). */
  head?: HeadFunction
  style: RangeStyle
  /** One plain sentence: what moving this channel does. */
  explain: string
}

export const FN: Record<ChannelFn, FnInfo> = {
  dimmer: { label: 'Dimmer', group: 'Intensity', swatch: '#e8e8e8', head: 'dimmer', style: 'level', explain: 'How bright it is, from off to full.' },
  shutter: { label: 'Strobe / shutter', group: 'Intensity', swatch: '#fff27a', head: 'shutter', style: 'shutter', explain: 'Closed (dark), open, or flashing from slow to fast.' },
  red: { label: 'Red', group: 'Colour', swatch: '#ff3b30', head: 'red', style: 'level', explain: 'How much red light, from none to full.' },
  green: { label: 'Green', group: 'Colour', swatch: '#34c759', head: 'green', style: 'level', explain: 'How much green light.' },
  blue: { label: 'Blue', group: 'Colour', swatch: '#0a84ff', head: 'blue', style: 'level', explain: 'How much blue light.' },
  white: { label: 'White', group: 'Colour', swatch: '#f5f5f5', head: 'white', style: 'level', explain: 'How much white light.' },
  warmWhite: { label: 'Warm white', group: 'Colour', swatch: '#ffc46b', head: 'white', style: 'level', explain: 'How much warm (orange-ish, tungsten-like) white.' },
  coolWhite: { label: 'Cool white', group: 'Colour', swatch: '#d8e8ff', head: 'white', style: 'level', explain: 'How much cool (bluish) white.' },
  amber: { label: 'Amber', group: 'Colour', swatch: '#ffb000', head: 'amber', style: 'level', explain: 'How much amber light.' },
  uv: { label: 'UV', group: 'Colour', swatch: '#8e5cff', head: 'uv', style: 'level', explain: 'How much ultraviolet light.' },
  lime: { label: 'Lime', group: 'Colour', swatch: '#b5ff3b', head: 'green', style: 'level', explain: 'How much lime (yellow-green) light.' },
  cyan: { label: 'Cyan', group: 'Colour', swatch: '#3fe0ff', head: 'cyan', style: 'level', explain: 'Colour mixing on a white lamp: more cyan takes red out.' },
  magenta: { label: 'Magenta', group: 'Colour', swatch: '#ff4fd8', head: 'magenta', style: 'level', explain: 'Colour mixing on a white lamp: more magenta takes green out.' },
  yellow: { label: 'Yellow', group: 'Colour', swatch: '#ffe94f', head: 'yellow', style: 'level', explain: 'Colour mixing on a white lamp: more yellow takes blue out.' },
  colorWheel: { label: 'Colour wheel', group: 'Colour', swatch: '#ff8a00', head: 'colorWheel', style: 'slots', explain: 'Turns a wheel of colour filters: each range is one colour.' },
  colorMacro: { label: 'Colour presets', group: 'Colour', swatch: '#ff6ec7', head: 'colorWheel', style: 'slots', explain: 'Ready-made colours: each range picks one, replacing the mixed colour.' },
  colorTemp: { label: 'Colour temperature', group: 'Colour', swatch: '#ffd9a0', style: 'level', explain: 'Warm to cool white. Kept, but not shown on the twin yet.' },
  pan: { label: 'Pan', group: 'Position', swatch: '#5ac8fa', head: 'pan', style: 'level', explain: 'Turns the head left and right, across its whole pan range.' },
  tilt: { label: 'Tilt', group: 'Position', swatch: '#64d2ff', head: 'tilt', style: 'level', explain: 'Tips the head up and down, across its tilt range.' },
  panTiltSpeed: { label: 'Pan/tilt speed', group: 'Position', swatch: '#7fb8d8', head: 'moveSpeed', style: 'level', explain: 'How fast the head moves. Usually 0 is fastest.' },
  zoom: { label: 'Zoom', group: 'Beam', swatch: '#c7c7cc', head: 'zoom', style: 'level', explain: 'Makes the beam narrow or wide.' },
  focus: { label: 'Focus', group: 'Beam', swatch: '#aeaeb2', style: 'level', explain: 'Sharpens the gobo edge. Kept, but not shown on the twin yet.' },
  iris: { label: 'Iris', group: 'Beam', swatch: '#8e8e93', style: 'level', explain: 'Closes the beam down to a pencil. Kept, but not shown yet.' },
  frost: { label: 'Frost', group: 'Beam', swatch: '#d1d1d6', style: 'level', explain: 'Softens the beam. Kept, but not shown yet.' },
  gobo: { label: 'Gobo wheel', group: 'Gobo and prism', swatch: '#bf5af2', head: 'gobo', style: 'slots', explain: 'Picks a pattern (gobo) the beam projects: each range is one gobo.' },
  goboRotation: { label: 'Gobo rotation', group: 'Gobo and prism', swatch: '#da8fff', head: 'goboRotation', style: 'spin', explain: 'Spins the gobo one way or the other, slow to fast.' },
  prism: { label: 'Prism', group: 'Gobo and prism', swatch: '#ff9f0a', head: 'prism', style: 'plain', explain: 'Splits the beam into several copies.' },
  prismRotation: { label: 'Prism rotation', group: 'Gobo and prism', swatch: '#ffb340', head: 'prismRotation', style: 'spin', explain: 'Turns the split beams around.' },
  rotation: { label: 'Rotation', group: 'Effects', swatch: '#30d158', head: 'rotation', style: 'spin', explain: 'Turns an effect (derby, moonflower) one way or the other.' },
  laser: { label: 'Laser', group: 'Effects', swatch: '#ff2d55', head: 'laser', style: 'plain', explain: 'Switches the laser on and picks its pattern.' },
  program: { label: 'Built-in program', group: 'Effects', swatch: '#ffd60a', style: 'program', explain: 'Runs the light’s own effects (auto, chase, sound mode). The twin shows the nearest pattern.' },
  programSpeed: { label: 'Program speed', group: 'Effects', swatch: '#ffe066', style: 'level', explain: 'How fast the built-in program runs.' },
  sound: { label: 'Sound sensitivity', group: 'Effects', swatch: '#ffcc00', style: 'level', explain: 'How strongly sound-active programs react to music.' },
  fog: { label: 'Fog output', group: 'Effects', swatch: '#9aa0a6', style: 'level', explain: 'How much fog or haze it makes.' },
  fan: { label: 'Fan', group: 'Control', swatch: '#8e8e93', style: 'plain', explain: 'Fan speed or mode. Kept, not shown.' },
  control: { label: 'Control / reset', group: 'Control', swatch: '#636366', style: 'plain', explain: 'Reset, display or other settings. Kept, not shown.' },
  other: { label: 'Other', group: 'Control', swatch: '#48484a', style: 'plain', explain: 'Something the twin doesn’t show. Kept in the file.' },
  none: { label: 'No function', group: 'Control', swatch: '#2c2c2e', style: 'plain', explain: 'Does nothing (reserved by the maker).' }
}

export const FN_GROUPS: FnGroup[] = ['Intensity', 'Colour', 'Position', 'Beam', 'Gobo and prism', 'Effects', 'Control']

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

export type Confidence = 'sure' | 'manual' | 'guessed' | 'missing' | 'checked'

export const CONFIDENCE: Record<Confidence, { label: string; explain: string }> = {
  sure: { label: 'Sure', explain: 'From the maker, SoundSwitch or a library.' },
  checked: { label: 'Checked', explain: 'You tested it and it looked right.' },
  manual: { label: 'From the manual', explain: 'Read from the manual’s table.' },
  guessed: { label: 'Guessed', explain: 'Filled in or worked out: worth a test.' },
  missing: { label: 'Missing', explain: 'Needed, but we don’t know what it does yet.' }
}

export interface RangeDef {
  lo: number
  hi: number
  label: string
  /** shutter: closed / open / strobe. slots: slot. spin: spin. program: program or off. */
  kind?: 'open' | 'closed' | 'strobe' | 'slot' | 'spin' | 'program' | 'off'
  /** A colour slot's colour, "#rrggbb". */
  color?: string
  /** A gobo slot number (0 = open). */
  gobo?: number
  /** A program's stand-in pattern. */
  pattern?: ProgramPattern
  /** Spin speed (turns/s, minus = the other way) or speed fraction at lo and hi. */
  from?: number
  to?: number
}

export interface ChannelDef {
  id: string
  name: string
  fn: ChannelFn
  /** The part it drives; null = the whole fixture. */
  part: string | null
  /** The low byte of the channel before it with the same job (16-bit). */
  fine?: boolean
  defaultValue?: number
  ranges: RangeDef[]
  confidence: Confidence
  note?: string
  /** For programs: the parts it drives (empty = every part that makes light). */
  targets?: string[]
}

export interface PartDef {
  id: string
  name: string
  role: HeadRole
  /** Which cell of the face it sits in (cluster, panel, bar); parts can share one. */
  cell?: number
  /** The white channel's colour on this part. */
  tint?: 'warm' | 'cool'
}

export interface ModeDef {
  id: string
  name: string
  channels: ChannelDef[]
}

export type FixtureKind = 'par' | 'wash' | 'spot' | 'beam' | 'bar' | 'tube' | 'panel' | 'cluster' | 'gigbar' | 'strip' | 'strobe' | 'laser' | 'effect' | 'uplight'

export interface LookDef {
  shape: LookKind
  /** Width (left-right), height, depth in metres. */
  size: [number, number, number]
  layout?: CellLayout
  bodyColor?: string
  beam: [number, number]
  pan?: number
  tilt?: number
  /** Brightness relative to a 100 W LED spot. */
  output: number
  mount: 'hanging' | 'floor' | 'stand'
  /** A photo of the real light, shown beside the twin (data URL). */
  photo?: string
}

export interface FixtureDef {
  format: 'sound-visualizer-fixture'
  formatVersion: 1
  id: string
  name: string
  manufacturer: string
  kind: FixtureKind
  look: LookDef
  parts: PartDef[]
  modes: ModeDef[]
  /** Goes up by one every save. */
  revision: number
  history: Array<{ revision: number; date: string; note: string }>
  source: { kind: 'library' | 'soundswitch' | 'file' | 'manual' | 'template' | 'web' | 'scratch'; label: string; url?: string }
  /** Fixture types in shows that this one stands in for (an edited SoundSwitch or Library fixture). */
  replaces?: string[]
  manualUrl?: string
  notes?: string
}

// ---------------------------------------------------------------------------
// Kinds of fixture: how each works, its usual look and its starting channels
// ---------------------------------------------------------------------------

export interface KindInfo {
  label: string
  shape: LookKind
  /** How this kind of light works, in two or three sentences. */
  explain: string
  /** The ideas worth knowing, each with the channels it's about. */
  concepts: Array<{ title: string; text: string; fns: ChannelFn[] }>
  mount: LookDef['mount']
}

export const KINDS: Record<FixtureKind, KindInfo> = {
  par: {
    label: 'PAR / wash light', shape: 'par', mount: 'floor',
    explain: 'A fixed light that floods an area with colour. It doesn’t move: you aim it once when you set it up.',
    concepts: [
      { title: 'Brightness', text: 'The dimmer sets how bright it is. Many PARs have no dimmer: the colour channels set the brightness.', fns: ['dimmer'] },
      { title: 'Colour mixing', text: 'Red, green and blue (sometimes white, amber, UV) add up like light does: red + green = yellow, all of them = white.', fns: ['red', 'green', 'blue', 'white', 'amber', 'uv'] },
      { title: 'Strobe', text: 'One channel is usually closed at the bottom, open or strobing slow to fast above that. If the light stays dark, check this channel first.', fns: ['shutter'] },
      { title: 'Built-in programs', text: 'Auto and sound modes run the light by itself. The twin shows the nearest pattern; what it really does is up to the maker.', fns: ['program', 'programSpeed', 'sound'] }
    ]
  },
  wash: {
    label: 'Moving head (wash)', shape: 'moverWash', mount: 'hanging',
    explain: 'A light on a motorised yoke: pan turns it left and right, tilt tips it up and down. A wash has a wide, soft beam, often with zoom.',
    concepts: [
      { title: 'Pan and tilt', text: 'Pan turns the head (often 540°), tilt tips it (often 270°). 128 is the middle of each.', fns: ['pan', 'tilt'] },
      { title: 'Fine channels', text: 'Pan fine and tilt fine add smoothness: together with pan and tilt they make 65,536 steps instead of 256.', fns: ['pan', 'tilt'] },
      { title: 'Movement speed', text: 'Slows the head down for smooth moves. On most lights 0 is the fastest.', fns: ['panTiltSpeed'] },
      { title: 'Colour and zoom', text: 'Colour mixing like a PAR; zoom makes the beam narrow or wide.', fns: ['red', 'green', 'blue', 'white', 'zoom'] },
      { title: 'Dimmer and strobe', text: 'The beam needs the dimmer up and the shutter open to show.', fns: ['dimmer', 'shutter'] }
    ]
  },
  spot: {
    label: 'Moving head (spot)', shape: 'mover', mount: 'hanging',
    explain: 'A moving head with a hard-edged beam that projects patterns (gobos), with a colour wheel, often a prism and focus.',
    concepts: [
      { title: 'Pan and tilt', text: 'Pan turns the head, tilt tips it; fine channels make the moves smooth.', fns: ['pan', 'tilt', 'panTiltSpeed'] },
      { title: 'Colour wheel', text: 'A wheel of coloured glass: each range of values is one colour, sometimes with half-colours in between.', fns: ['colorWheel'] },
      { title: 'Gobos', text: 'A wheel of patterns the beam projects. A second channel spins the gobo.', fns: ['gobo', 'goboRotation'] },
      { title: 'Prism', text: 'Splits the beam into copies; its rotation channel turns them.', fns: ['prism', 'prismRotation'] },
      { title: 'Dimmer and shutter', text: 'Nothing shows unless the dimmer is up and the shutter is open.', fns: ['dimmer', 'shutter'] }
    ]
  },
  beam: {
    label: 'Moving head (beam)', shape: 'mover', mount: 'hanging',
    explain: 'A moving head with a very narrow, bright beam that cuts through haze, usually with a colour wheel, gobos and a prism.',
    concepts: [
      { title: 'Pan and tilt', text: 'Fast, wide moves: pan, tilt and their fine channels.', fns: ['pan', 'tilt'] },
      { title: 'Colour, gobo, prism', text: 'Like a spot, but the beam is tight: gobos look like shapes in the haze.', fns: ['colorWheel', 'gobo', 'prism'] },
      { title: 'Dimmer and shutter', text: 'Up and open, or the beam stays dark.', fns: ['dimmer', 'shutter'] }
    ]
  },
  bar: {
    label: 'LED bar / batten', shape: 'bar', mount: 'floor',
    explain: 'A row of cells, each with its own colour channels, so colours can chase along the bar. Its modes often go from one colour for the whole bar to every cell separate.',
    concepts: [
      { title: 'Cells', text: 'Each cell repeats the same channels (e.g. red, green, blue). Cell 1 is usually at one end: the cell chase test shows which.', fns: ['red', 'green', 'blue', 'white'] },
      { title: 'Master dimmer and strobe', text: 'Shared channels for the whole bar, usually at the start.', fns: ['dimmer', 'shutter'] },
      { title: 'Modes', text: 'A 3-channel mode makes the whole bar one colour; a 24-channel mode gives each of 8 cells its own.', fns: [] }
    ]
  },
  tube: {
    label: 'Pixel tube / stick', shape: 'tube', mount: 'floor',
    explain: 'A tube of cells standing up (or hanging), each cell its own colour, for chases running up and down.',
    concepts: [
      { title: 'Cells', text: 'Cells repeat the same channels from one end to the other. The cell chase test shows which end is cell 1.', fns: ['red', 'green', 'blue', 'white'] },
      { title: 'Master and effects', text: 'A master dimmer, strobe and built-in effects are often at the start.', fns: ['dimmer', 'shutter', 'program'] }
    ]
  },
  panel: {
    label: 'Pixel panel / matrix', shape: 'panel', mount: 'hanging',
    explain: 'A grid of cells you can light one by one, for patterns and pixel effects.',
    concepts: [
      { title: 'Cells in a grid', text: 'Cells usually run along each row, then down to the next. The cell chase test shows the order.', fns: ['red', 'green', 'blue', 'white'] },
      { title: 'Master', text: 'A master dimmer and strobe for the whole panel.', fns: ['dimmer', 'shutter'] }
    ]
  },
  cluster: {
    label: 'Retro / multi-cell light', shape: 'cluster', mount: 'hanging',
    explain: 'A frame of round cells, each with its own lens, often a warm white COB with an RGB ring around it (“retro” hex lights, multi-cell blinders).',
    concepts: [
      { title: 'Cells', text: 'Each cell has its own channels; the cell chase test shows their order around the frame.', fns: ['warmWhite', 'white', 'red', 'green', 'blue'] },
      { title: 'Two parts per cell', text: 'A centre COB and a ring of RGB LEDs are two parts in the same cell: give each its own part, same cell number.', fns: [] },
      { title: 'Built-in effects', text: 'These lights usually have long lists of effects for the white and for the rings. The twin shows the nearest pattern.', fns: ['program', 'programSpeed'] }
    ]
  },
  gigbar: {
    label: 'GigBar / multi-effect bar', shape: 'gigbar', mount: 'stand',
    explain: 'Several lights on one bar: pars, derbies, strobes, a laser and sometimes small moving heads, each with its own channels.',
    concepts: [
      { title: 'Parts', text: 'Each light on the bar is a part: Par 1, Derby 1, Strobe, Laser. Their channels drive only that part.', fns: [] },
      { title: 'Master', text: 'A master channel often dims or blacks out everything.', fns: ['dimmer'] }
    ]
  },
  strip: {
    label: 'LED strip / tape', shape: 'strip', mount: 'stand',
    explain: 'A strip of LEDs driven by a decoder, usually one colour for the whole strip.',
    concepts: [{ title: 'Colour', text: 'Red, green and blue (and sometimes white) set the colour.', fns: ['red', 'green', 'blue', 'white'] }]
  },
  strobe: {
    label: 'Strobe / blinder', shape: 'strobe', mount: 'hanging',
    explain: 'A very bright white (or RGB) panel that flashes, or blinds the audience at full.',
    concepts: [
      { title: 'Intensity', text: 'The dimmer sets the flash brightness.', fns: ['dimmer'] },
      { title: 'Rate', text: 'The strobe channel sets how often it flashes, slow to fast.', fns: ['shutter'] }
    ]
  },
  laser: {
    label: 'Laser', shape: 'laser', mount: 'hanging',
    explain: 'Fans of thin beams in patterns. Lasers mostly run built-in patterns, with channels to pick the pattern, colour and speed.',
    concepts: [
      { title: 'On and pattern', text: 'The laser channel switches it on and picks the pattern. 0 should always mean off.', fns: ['laser'] },
      { title: 'Programs', text: 'Auto and sound modes run patterns by themselves.', fns: ['program', 'programSpeed', 'sound'] }
    ]
  },
  effect: {
    label: 'Derby / effect', shape: 'derby', mount: 'floor',
    explain: 'Many narrow coloured beams that turn (derbies, moonflowers): channels pick the colours, the rotation and strobe.',
    concepts: [
      { title: 'Colours', text: 'Often a list of colour combinations, each a range of values.', fns: ['colorWheel', 'colorMacro', 'red', 'green', 'blue'] },
      { title: 'Rotation', text: 'Turns the beams one way or the other, slow to fast.', fns: ['rotation'] },
      { title: 'Strobe and programs', text: 'Flashing and built-in effects.', fns: ['shutter', 'program'] }
    ]
  },
  uplight: {
    label: 'Uplight / small wash', shape: 'uplight', mount: 'floor',
    explain: 'A small box on a kickstand that washes a wall with colour.',
    concepts: [{ title: 'Colour', text: 'Mix with red, green, blue, white, amber and UV.', fns: ['red', 'green', 'blue', 'white', 'amber', 'uv'] }]
  }
}

export const KIND_ORDER: FixtureKind[] = ['par', 'wash', 'spot', 'beam', 'bar', 'tube', 'cluster', 'panel', 'gigbar', 'strobe', 'laser', 'effect', 'uplight', 'strip']

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

let counter = 0
export function newKey(prefix = 'k'): string {
  counter = (counter + 1) % 1e6
  return `${prefix}${Date.now().toString(36).slice(-5)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}

export function hexOf(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')
}

export function rgbOf(hex: string | undefined): [number, number, number] | null {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return null
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** The usual ranges for a new channel of this kind. */
export function defaultRanges(fn: ChannelFn): RangeDef[] {
  switch (fn) {
    case 'shutter':
      return [
        { lo: 0, hi: 9, label: 'Open', kind: 'open' },
        { lo: 10, hi: 255, label: 'Strobe, slow to fast', kind: 'strobe' }
      ]
    case 'colorWheel':
      return ['#ffffff', '#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00c0ff', '#0000ff', '#ff00ff'].map((color, i) => ({
        lo: i * 16, hi: i * 16 + 15, label: ['Open (white)', 'Red', 'Orange', 'Yellow', 'Green', 'Light blue', 'Blue', 'Magenta'][i], kind: 'slot' as const, color
      }))
    case 'colorMacro':
      return [{ lo: 0, hi: 7, label: 'Off', kind: 'off' }, ...['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff'].map((color, i) => ({ lo: 8 + i * 35, hi: Math.min(255, 8 + i * 35 + 34), label: ['Red', 'Green', 'Blue', 'Yellow', 'Magenta', 'Cyan', 'White'][i], kind: 'slot' as const, color }))]
    case 'gobo':
      return Array.from({ length: 8 }, (_, i) => ({ lo: i * 16, hi: i * 16 + 15, label: i === 0 ? 'Open' : `Gobo ${i}`, kind: 'slot' as const, gobo: i }))
    case 'goboRotation':
    case 'prismRotation':
    case 'rotation':
      return [
        { lo: 0, hi: 9, label: 'Stop', kind: 'spin', from: 0, to: 0 },
        { lo: 10, hi: 127, label: 'One way, slow to fast', kind: 'spin', from: 0.1, to: 1.5 },
        { lo: 128, hi: 255, label: 'Other way, slow to fast', kind: 'spin', from: -0.1, to: -1.5 }
      ]
    case 'program':
      return [
        { lo: 0, hi: 9, label: 'No program', kind: 'off', pattern: 'none' },
        { lo: 10, hi: 255, label: 'Programs', kind: 'program', pattern: 'chase' }
      ]
    case 'laser':
      return [
        { lo: 0, hi: 9, label: 'Off', kind: 'off' },
        { lo: 10, hi: 255, label: 'On, patterns', kind: 'program' }
      ]
    case 'prism':
      return [
        { lo: 0, hi: 9, label: 'Out', kind: 'off' },
        { lo: 10, hi: 255, label: 'In', kind: 'slot' }
      ]
    default:
      return []
  }
}

export function makeChannel(fn: ChannelFn, part: string | null = null, extra: Partial<ChannelDef> = {}): ChannelDef {
  return { id: newKey('c'), name: FN[fn].label, fn, part, ranges: defaultRanges(fn), confidence: 'guessed', ...extra }
}

export function partName(def: FixtureDef, id: string | null): string {
  if (id === null) return 'Whole fixture'
  return def.parts.find((p) => p.id === id)?.name ?? 'Unknown part'
}

/** The channel's display name, with its part when the fixture has several. */
export function channelLabel(def: FixtureDef, ch: ChannelDef): string {
  if (!ch.part || def.parts.length <= 1) return ch.name + (ch.fine ? ' fine' : '')
  const part = partName(def, ch.part)
  return `${part} · ${ch.name}${ch.fine ? ' fine' : ''}`
}

// ---------------------------------------------------------------------------
// Templates: a starting fixture for each kind
// ---------------------------------------------------------------------------

/** N cells, each with the same channels, plus shared channels first. */
export function cellsDef(def: FixtureDef, cells: number, perCell: ChannelFn[], shared: ChannelFn[], partPrefix = 'Cell', role: HeadRole = 'pixel'): FixtureDef {
  const parts: PartDef[] = Array.from({ length: cells }, (_, i) => ({ id: newKey('p'), name: `${partPrefix} ${i + 1}`, role, cell: i }))
  const channels: ChannelDef[] = [
    ...shared.map((fn) => makeChannel(fn)),
    ...parts.flatMap((p) => perCell.map((fn) => makeChannel(fn, p.id)))
  ]
  return { ...def, parts, modes: [{ id: newKey('m'), name: `${channels.length}-channel`, channels }] }
}

export function blankDef(kind: FixtureKind, name = 'New fixture', manufacturer = 'Generic'): FixtureDef {
  const info = KINDS[kind]
  const defaults = LOOK_DEFAULTS[info.shape]
  const moving = kind === 'wash' || kind === 'spot' || kind === 'beam'
  const base: FixtureDef = {
    format: 'sound-visualizer-fixture',
    formatVersion: 1,
    id: newKey('fx'),
    name,
    manufacturer,
    kind,
    look: { shape: info.shape, size: [...defaults.size], beam: [...defaults.beam], output: kind === 'strobe' ? 1.5 : 0.8, mount: info.mount, pan: moving ? 540 : undefined, tilt: moving ? 270 : undefined },
    parts: [],
    modes: [],
    revision: 0,
    history: [],
    source: { kind: 'template', label: `${info.label} template` }
  }
  const single = (fns: ChannelFn[]): FixtureDef => {
    const channels = fns.map((fn, i) => makeChannel(fn, null, fns[i - 1] === fn ? { fine: true, name: `${FN[fn].label}` } : {}))
    return { ...base, modes: [{ id: newKey('m'), name: `${channels.length}-channel`, channels }] }
  }
  switch (kind) {
    case 'par':
      return single(['dimmer', 'red', 'green', 'blue', 'white', 'shutter', 'program'])
    case 'uplight':
      return single(['dimmer', 'red', 'green', 'blue', 'white', 'amber', 'uv', 'shutter'])
    case 'strip':
      return single(['red', 'green', 'blue'])
    case 'wash':
      return single(['pan', 'pan', 'tilt', 'tilt', 'panTiltSpeed', 'dimmer', 'shutter', 'red', 'green', 'blue', 'white', 'zoom'])
    case 'spot':
      return single(['pan', 'pan', 'tilt', 'tilt', 'panTiltSpeed', 'dimmer', 'shutter', 'colorWheel', 'gobo', 'goboRotation', 'prism', 'focus'])
    case 'beam':
      return single(['pan', 'pan', 'tilt', 'tilt', 'panTiltSpeed', 'dimmer', 'shutter', 'colorWheel', 'gobo', 'prism', 'prismRotation'])
    case 'strobe':
      return single(['dimmer', 'shutter'])
    case 'laser':
      return single(['laser', 'program', 'programSpeed'])
    case 'effect':
      return single(['colorMacro', 'shutter', 'rotation', 'program'])
    case 'bar':
      return withLayout(cellsDef(base, 8, ['red', 'green', 'blue'], ['dimmer', 'shutter']), { kind: 'row' })
    case 'tube':
      return withLayout(cellsDef(base, 16, ['red', 'green', 'blue'], ['dimmer', 'shutter']), { kind: 'column' })
    case 'panel':
      return withLayout(cellsDef(base, 16, ['red', 'green', 'blue'], ['dimmer', 'shutter']), { kind: 'grid', cols: 4 })
    case 'cluster': {
      const d = withLayout(cellsDef(base, 7, ['warmWhite'], ['dimmer', 'shutter']), { kind: 'ringCentre' })
      d.parts.forEach((p) => (p.tint = 'warm'))
      return d
    }
    case 'gigbar': {
      const parts: PartDef[] = [
        { id: newKey('p'), name: 'Par 1', role: 'beam' },
        { id: newKey('p'), name: 'Par 2', role: 'beam' },
        { id: newKey('p'), name: 'Derby 1', role: 'derby' },
        { id: newKey('p'), name: 'Derby 2', role: 'derby' },
        { id: newKey('p'), name: 'Strobe', role: 'strobe' },
        { id: newKey('p'), name: 'Laser', role: 'laser' }
      ]
      const [p1, p2, d1, d2, st, la] = parts
      const channels = [
        makeChannel('dimmer'),
        ...[p1, p2].flatMap((p) => (['red', 'green', 'blue'] as ChannelFn[]).map((fn) => makeChannel(fn, p.id))),
        ...[d1, d2].flatMap((p) => [makeChannel('colorMacro', p.id), makeChannel('rotation', p.id)]),
        makeChannel('dimmer', st.id),
        makeChannel('laser', la.id)
      ]
      return { ...base, parts, modes: [{ id: newKey('m'), name: `${channels.length}-channel`, channels }] }
    }
  }
}

function withLayout(def: FixtureDef, layout: CellLayout): FixtureDef {
  return { ...def, look: { ...def.look, layout } }
}

// ---------------------------------------------------------------------------
// Definition → the fixture type the 3D view and the decoder use
// ---------------------------------------------------------------------------

const WARM: [number, number, number] = [1, 0.72, 0.4]
const COOL: [number, number, number] = [0.85, 0.92, 1]

export function studioTypeId(def: FixtureDef, mode: ModeDef): string {
  return `studio-${def.id}-${mode.id}`
}

/** Which head each channel feeds, and with what: the core of typeFromDef, shared with the Studio's schematic. */
export function headsFromDef(def: FixtureDef, mode: ModeDef): { heads: HeadDef[]; partHead: Map<string | null, number> } {
  const used = new Set(mode.channels.map((c) => c.part))
  const parts = def.parts.filter((p) => used.has(p.id))
  const heads: HeadDef[] = []
  const partHead = new Map<string | null, number>()
  const lightFns = new Set<ChannelFn>(['red', 'green', 'blue', 'white', 'warmWhite', 'coolWhite', 'amber', 'uv', 'lime', 'cyan', 'magenta', 'yellow', 'colorWheel', 'colorMacro', 'laser'])
  const wholeChannels = mode.channels.filter((c) => c.part === null)
  const wholeMakesLight = wholeChannels.some((c) => lightFns.has(c.fn))
  // The whole-fixture channels form the main head; with parts that make the light, it's their master.
  if (wholeChannels.length || !parts.length) {
    const role: HeadRole = parts.length && !wholeMakesLight && !wholeChannels.some((c) => c.fn === 'pan' || c.fn === 'tilt') ? 'master' : roleForKind(def.kind)
    partHead.set(null, heads.length)
    heads.push({ name: 'Main', role, ch: {} })
  }
  for (const p of parts) {
    partHead.set(p.id, heads.length)
    heads.push({ name: p.name, role: p.role, ch: {}, cell: p.cell, whiteTint: p.tint === 'warm' ? WARM : p.tint === 'cool' ? COOL : undefined })
  }
  // A moving fixture's pan and tilt on the main head move its parts too.
  const index = new Map(mode.channels.map((c, i) => [c.id, i]))
  mode.channels.forEach((ch, i) => {
    const h = heads[partHead.get(ch.part) ?? 0]
    if (!h) return
    const info = FN[ch.fn]
    const hf = info.head
    if (!hf) return
    if (ch.fine) {
      // The coarse byte is the nearest earlier channel with the same job on the same part.
      const ref = h.ch[hf]
      if (ref && ref.fine === undefined) ref.fine = i
      return
    }
    if (h.ch[hf]) return // the first channel for a job wins
    h.ch[hf] = { coarse: i }
    if (ch.fn === 'warmWhite') h.whiteTint ??= WARM
    if (ch.fn === 'coolWhite') h.whiteTint ??= COOL
    applyRanges(h, ch)
  })
  // Programs: each one drives its target parts (or every part that makes light).
  const programs = mode.channels.filter((c) => c.fn === 'program')
  programs.forEach((pc, n) => {
    const ref: ChannelRef = { coarse: index.get(pc.id)! }
    const speedCh = mode.channels.find((c) => c.fn === 'programSpeed' && (c.part === pc.part || !c.part)) ?? undefined
    const ranges = pc.ranges
      .filter((r) => r.kind === 'program' || r.pattern)
      .map((r, k) => ({ lo: r.lo, hi: r.hi, pattern: r.pattern ?? 'chase', index: k + n * 7 }))
    const targetIds = pc.targets?.length ? pc.targets : null
    heads.forEach((h, hi) => {
      const partId = [...partHead].find(([, v]) => v === hi)?.[0] ?? null
      const makesLight = Object.keys(h.ch).some((k) => ['red', 'green', 'blue', 'white', 'amber', 'uv', 'cyan', 'magenta', 'yellow', 'colorWheel'].includes(k)) || h.role === 'pixel' || h.role === 'beam'
      const target = targetIds ? partId !== null && targetIds.includes(partId) : makesLight && h.role !== 'master' && (pc.part === null || pc.part === partId)
      if (!target || h.program) return
      h.program = { ref, ranges, speed: speedCh ? { coarse: index.get(speedCh.id)! } : undefined, group: pc.id }
    })
  })
  return { heads, partHead }
}

function roleForKind(kind: FixtureKind): HeadRole {
  if (kind === 'laser') return 'laser'
  if (kind === 'effect') return 'derby'
  if (kind === 'strobe') return 'strobe'
  return 'beam'
}

function applyRanges(h: HeadDef, ch: ChannelDef): void {
  const r = ch.ranges
  if (!r.length) return
  switch (ch.fn) {
    case 'shutter': {
      const s = r.filter((x) => x.kind === 'open' || x.kind === 'closed' || x.kind === 'strobe')
      if (s.length) h.shutter = s.map((x) => ({ lo: x.lo, hi: x.hi, kind: x.kind as 'open' | 'closed' | 'strobe' }))
      break
    }
    case 'colorWheel':
    case 'colorMacro': {
      const slots = r.filter((x) => x.color).map((x) => ({ lo: x.lo, hi: x.hi, rgb: rgbOf(x.color)! }))
      // Colour presets: "off" ranges show black so the mixed colour shows through.
      if (ch.fn === 'colorMacro') for (const x of r) if (x.kind === 'off') slots.push({ lo: x.lo, hi: x.hi, rgb: [0, 0, 0] })
      if (slots.length) h.colorWheel = slots
      break
    }
    case 'gobo': {
      const slots = r.filter((x) => x.kind === 'slot' || x.gobo !== undefined).map((x) => ({ lo: x.lo, hi: x.hi, slot: x.gobo ?? 0 }))
      if (slots.length) h.goboSlots = slots
      break
    }
    case 'goboRotation':
    case 'prismRotation': {
      const spins = r.filter((x) => x.kind === 'spin').map((x) => ({ lo: x.lo, hi: x.hi, from: x.from ?? 0, to: x.to ?? 0 }))
      if (spins.length) {
        if (ch.fn === 'goboRotation') h.goboSpin = spins
        else h.prismSpin = spins
      }
      break
    }
    case 'panTiltSpeed': {
      const sp = r.filter((x) => x.from !== undefined).map((x) => ({ lo: x.lo, hi: x.hi, from: x.from!, to: x.to ?? x.from! }))
      if (sp.length) h.moveSpeed = sp
      break
    }
  }
}

export function typeFromDef(def: FixtureDef, modeIndex = 0): FixtureType {
  const mode = def.modes[Math.max(0, Math.min(def.modes.length - 1, modeIndex))] ?? { id: 'empty', name: 'Empty', channels: [] }
  const { heads } = headsFromDef(def, mode)
  const moving = heads.some((h) => h.ch.pan || h.ch.tilt)
  const pixels = heads.filter((h) => h.role === 'pixel').length
  const zoom = mode.channels.some((c) => c.fn === 'zoom')
  const look = def.look
  const spec: FixtureSpec = {
    look: look.shape,
    size: look.size,
    layout: look.layout,
    bodyColor: look.bodyColor,
    pan: moving ? look.pan ?? 540 : undefined,
    tilt: moving ? look.tilt ?? 270 : undefined,
    beam: look.beam,
    speed: moving ? 220 : undefined,
    output: look.output,
    leds: pixels > 1 ? pixels : undefined,
    mount: look.mount,
    note: `${def.manufacturer} ${def.name}, from Fixture Studio.`
  }
  return {
    id: studioTypeId(def, mode),
    name: `${def.name} (${mode.name})`,
    manufacturer: def.manufacturer,
    channels: channelListFromHeads(mode.channels.length, heads),
    panRange: spec.pan ?? 0,
    tiltRange: spec.tilt ?? 0,
    zoomRange: zoom ? look.beam : [look.beam[0], look.beam[0]],
    maxSpeed: spec.speed ?? 0,
    candela: 1200 * look.output,
    body: moving ? 'movingHead' : pixels > 1 ? 'bar' : 'par',
    cells: Math.max(1, pixels),
    source: 'Fixture Studio',
    heads,
    spec,
    studioId: def.id
  }
}

// ---------------------------------------------------------------------------
// Any fixture type → a definition (to open Library, SoundSwitch and built-in fixtures)
// ---------------------------------------------------------------------------

const HEAD_TO_FN: Partial<Record<HeadFunction, ChannelFn>> = {
  dimmer: 'dimmer', red: 'red', green: 'green', blue: 'blue', white: 'white', amber: 'amber', uv: 'uv', cyan: 'cyan', magenta: 'magenta', yellow: 'yellow',
  shutter: 'shutter', pan: 'pan', tilt: 'tilt', zoom: 'zoom', colorWheel: 'colorWheel', gobo: 'gobo', goboRotation: 'goboRotation',
  prism: 'prism', prismRotation: 'prismRotation', moveSpeed: 'panTiltSpeed', rotation: 'rotation', laser: 'laser'
}

function kindFromType(t: FixtureType): FixtureKind {
  const look = t.spec?.look
  const heads = t.heads ?? []
  if (look === 'gigbar') return 'gigbar'
  if (look === 'moverWash') return 'wash'
  if (look === 'mover' || t.body === 'movingHead') return heads.some((h) => h.ch.gobo) ? 'spot' : 'wash'
  if (look === 'tube') return 'tube'
  if (look === 'bar') return 'bar'
  if (look === 'strip') return 'strip'
  if (look === 'cluster') return 'cluster'
  if (look === 'panel') return 'panel'
  if (look === 'laser') return 'laser'
  if (look === 'derby') return 'effect'
  if (look === 'strobe') return 'strobe'
  if (look === 'uplight') return 'uplight'
  if (t.body === 'bar') return 'bar'
  return 'par'
}

/**
 * Builds a definition from one or more fixture types (one per mode) of the same light.
 * `names`: the channel names per mode, when the source has them (OFL, QLC+).
 */
export function defFromTypes(types: FixtureType[], meta: { name: string; manufacturer: string; source: FixtureDef['source']; modeNames?: string[]; names?: string[][]; confidence?: Confidence }): FixtureDef {
  const first = types[0]
  const kind = kindFromType(first)
  const spec = first.spec
  const defaults = LOOK_DEFAULTS[spec?.look ?? KINDS[kind].shape]
  const parts: PartDef[] = []
  const partByName = new Map<string, PartDef>()
  const modes: ModeDef[] = types.map((t, mi) => {
    const heads = t.heads ?? []
    const multi = heads.filter((h) => h.role !== 'master').length > 1
    const headPart = heads.map((h) => {
      if (!multi && h.role !== 'master' && heads.length <= 2 && h.name === 'Main') return null
      if (h.role === 'master' || h.name === 'Main') return null
      let p = partByName.get(h.name)
      if (!p) {
        p = { id: newKey('p'), name: h.name, role: h.role, cell: h.cell, tint: h.whiteTint ? (h.whiteTint[2] < h.whiteTint[0] ? 'warm' : 'cool') : undefined }
        partByName.set(h.name, p)
        parts.push(p)
      }
      return p.id
    })
    const channels: ChannelDef[] = t.channels.map((fn, i) => {
      // Find the head and job this channel feeds.
      for (let hi = 0; hi < heads.length; hi++) {
        const h = heads[hi]
        for (const [hf, ref] of Object.entries(h.ch) as Array<[HeadFunction, ChannelRef]>) {
          const cfn = HEAD_TO_FN[hf]
          if (!cfn) continue
          if (ref.coarse === i || ref.fine === i) {
            const isFine = ref.fine === i
            const name = meta.names?.[mi]?.[i] ?? FN[cfn].label
            const out: ChannelDef = { id: newKey('c'), name: isFine ? name.replace(/\s*fine$/i, '') : name, fn: cfn, part: headPart[hi], ranges: isFine ? [] : rangesFromHead(h, hf), confidence: meta.confidence ?? 'sure' }
            if (isFine) out.fine = true
            if (cfn === 'white' && h.whiteTint) out.fn = h.whiteTint[2] < h.whiteTint[0] ? 'warmWhite' : 'coolWhite'
            return out
          }
        }
        if (h.program && h.program.ref.coarse === i) {
          return { id: newKey('c'), name: meta.names?.[mi]?.[i] ?? 'Program', fn: 'program', part: null, ranges: h.program.ranges.map((r) => ({ lo: r.lo, hi: r.hi, label: `Program ${r.index + 1}`, kind: 'program' as const, pattern: r.pattern })), confidence: meta.confidence ?? 'sure' }
        }
      }
      const name = meta.names?.[mi]?.[i]
      const guess: ChannelFn = fn === 'speed' ? 'programSpeed' : fn === 'reserved' ? (name && /no function|reserved|unused/i.test(name) ? 'none' : 'other') : (HEAD_TO_FN[fn as HeadFunction] ?? 'other')
      return { id: newKey('c'), name: name ?? FN[guess].label, fn: guess, part: null, ranges: [], confidence: meta.confidence ?? 'sure' }
    })
    return { id: newKey('m'), name: meta.modeNames?.[mi] ?? t.name.match(/\(([^()]*(?:\([^()]*\))?[^()]*)\)\s*$/)?.[1] ?? `${t.channels.length}-channel`, channels }
  })
  return {
    format: 'sound-visualizer-fixture',
    formatVersion: 1,
    id: newKey('fx'),
    name: meta.name,
    manufacturer: meta.manufacturer,
    kind,
    look: {
      shape: spec?.look ?? KINDS[kind].shape,
      size: spec?.size ?? [...defaults.size],
      layout: spec?.layout,
      bodyColor: spec?.bodyColor,
      beam: spec?.beam ?? first.zoomRange ?? defaults.beam,
      pan: first.panRange || undefined,
      tilt: first.tiltRange || undefined,
      output: spec?.output ?? Math.max(0.2, first.candela / 1200),
      mount: spec?.mount ?? KINDS[kind].mount
    },
    parts,
    modes,
    revision: 0,
    history: [],
    source: meta.source,
    replaces: types.map((t) => t.id)
  }
}

function rangesFromHead(h: HeadDef, hf: HeadFunction): RangeDef[] {
  switch (hf) {
    case 'shutter':
      return (h.shutter ?? []).map((r) => ({ lo: r.lo, hi: r.hi, kind: r.kind, label: r.kind === 'open' ? 'Open' : r.kind === 'closed' ? 'Closed' : 'Strobe, slow to fast' }))
    case 'colorWheel':
      return (h.colorWheel ?? []).map((r) => ({ lo: r.lo, hi: r.hi, kind: 'slot' as const, color: hexOf(r.rgb), label: colorName(r.rgb) }))
    case 'gobo':
      return (h.goboSlots ?? []).map((r) => ({ lo: r.lo, hi: r.hi, kind: 'slot' as const, gobo: r.slot, label: r.slot === 0 ? 'Open' : `Gobo ${r.slot}` }))
    case 'goboRotation':
      return (h.goboSpin ?? []).map((r) => ({ lo: r.lo, hi: r.hi, kind: 'spin' as const, from: r.from, to: r.to, label: spinLabel(r.from, r.to) }))
    case 'prismRotation':
      return (h.prismSpin ?? []).map((r) => ({ lo: r.lo, hi: r.hi, kind: 'spin' as const, from: r.from, to: r.to, label: spinLabel(r.from, r.to) }))
    case 'moveSpeed':
      return (h.moveSpeed ?? []).map((r) => ({ lo: r.lo, hi: r.hi, from: r.from, to: r.to, label: r.from > r.to ? 'Fast to slow' : 'Slow to fast' }))
    default:
      return []
  }
}

function spinLabel(from: number, to: number): string {
  if (!from && !to) return 'Stop'
  const way = (from || to) < 0 ? 'Anticlockwise' : 'Clockwise'
  return `${way}, ${Math.abs(from) < Math.abs(to) ? 'slow to fast' : 'fast to slow'}`
}

const NAMED: Array<[string, [number, number, number]]> = [
  ['White', [1, 1, 1]], ['Red', [1, 0, 0]], ['Orange', [1, 0.5, 0]], ['Yellow', [1, 1, 0]], ['Green', [0, 1, 0]], ['Cyan', [0, 1, 1]],
  ['Light blue', [0.3, 0.7, 1]], ['Blue', [0, 0, 1]], ['Purple', [0.5, 0, 1]], ['Magenta', [1, 0, 1]], ['Pink', [1, 0.5, 0.7]], ['Off', [0, 0, 0]]
]

export function colorName(rgb: [number, number, number]): string {
  let best = NAMED[0]
  let bestD = Infinity
  for (const n of NAMED) {
    const d = (n[1][0] - rgb[0]) ** 2 + (n[1][1] - rgb[1]) ** 2 + (n[1][2] - rgb[2]) ** 2
    if (d < bestD) [best, bestD] = [n, d]
  }
  return best[0]
}

/** Every channel of a mode as [first DMX channel (1-based), channel]: fine channels included. */
export function addressed(mode: ModeDef): Array<[number, ChannelDef]> {
  return mode.channels.map((c, i) => [i + 1, c])
}
