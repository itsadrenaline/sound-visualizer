/**
 * Heads: the separately controlled parts of a fixture.
 *
 * A simple PAR has one head. A pixel tube has 16 (one per cell). A GigBar has
 * movers, derbies, pars, strobes, a laser and a "master" section that dims
 * them all. Each head knows which DMX channels drive which of its functions,
 * plus the fixture's own value ranges (which shutter values mean "open", which
 * colour-wheel slot is red), so decoding matches what the real fixture does.
 */
import type { ChannelFunction, FixtureType } from './fixtureTypes'

export type HeadRole = 'beam' | 'pixel' | 'derby' | 'strobe' | 'laser' | 'halo' | 'master'

export interface ChannelRef {
  /** 0-based channel within the fixture's mode. */
  coarse: number
  /** Low byte for 16-bit values. */
  fine?: number
}

export interface WheelSlot {
  lo: number
  hi: number
  /** 0..1 */
  rgb: [number, number, number]
  /**
   * Several colours at once ("Red + Green", "Multicolour"): lasers and derbies show
   * each beam in one of them. `rgb` is their mix.
   */
  colours?: Array<[number, number, number]>
}

type RGB = [number, number, number]
const NAMED: Array<[RegExp, RGB]> = [
  [/white|\bwit\b|weiss|weiß|blanc/i, [1, 1, 1]], [/yellow/i, [1, 1, 0]], [/purple|magenta|pink|violet/i, [1, 0, 1]], [/cyan|turquoise|aqua|light\s*blue/i, [0, 1, 1]],
  [/orange|amber/i, [1, 0.5, 0]], [/\buv\b/i, [0.45, 0, 1]], [/red|\brood\b|\brot\b/i, [1, 0, 0]], [/green|groen|grün|grun/i, [0, 1, 0]], [/blue|blauw|blau/i, [0, 0, 1]]
]
/** Every colour a full-colour (RGB) laser or derby cycles through. */
export const RAINBOW: RGB[] = [[1, 0, 0], [1, 0.5, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1]]

/**
 * The colours a range's name gives: "Red" → one, "Red + Green" or "R/G" → two,
 * "Multicolour", "RGB", "Colour change", "7 colours" → all of them. Empty if it names none.
 */
export function coloursFromName(name: string): RGB[] {
  if (/multi|mix|rainbow|\brgb\b|full\s*colou?r|all\s*colou?rs?|colou?r\s*(change|chase|cycle|jump|fade)|\b7\s*colou?r/i.test(name)) return RAINBOW
  return name
    .split(/\s*(?:\+|&|\/|,|\band\b|\ben\b|\bund\b)\s*/i)
    .map((p) => NAMED.find(([re]) => re.test(p))?.[1])
    .filter((c): c is RGB => !!c)
}

/** One colour for a name: the colours it names, mixed. Null if it names none. */
export function colourFromName(name: string): RGB | null {
  const parts = coloursFromName(name)
  if (!parts.length) return null
  if (parts === RAINBOW) return [1, 1, 1]
  return [0, 1, 2].map((i) => Math.min(1, parts.reduce((sum, c) => sum + c[i], 0))) as RGB
}

/** A wheel slot from its name and (if known) its colour: several colours when the name says so. */
export function slotFrom(lo: number, hi: number, name: string, rgb?: RGB | null): WheelSlot | null {
  const colours = coloursFromName(name)
  const mix = rgb ?? colourFromName(name)
  if (!mix) return null
  return colours.length > 1 ? { lo, hi, rgb: mix, colours } : { lo, hi, rgb: mix }
}

export interface ShutterRange {
  lo: number
  hi: number
  kind: 'open' | 'closed' | 'strobe'
}

export type HeadFunction =
  | 'dimmer' | 'pan' | 'tilt' | 'red' | 'green' | 'blue' | 'white' | 'amber' | 'uv'
  | 'shutter' | 'zoom' | 'colorWheel' | 'gobo' | 'goboRotation' | 'prism' | 'prismRotation' | 'moveSpeed' | 'rotation' | 'laser'
  | 'cyan' | 'magenta' | 'yellow' | 'fog'

/** What a built-in program looks like on the twin: the nearest of a few generic patterns. */
export type ProgramPattern = 'none' | 'chase' | 'fade' | 'jump' | 'rainbow' | 'strobe' | 'pulse' | 'static'

/** A range of a program channel ("warm white effect 12", "sound mode 2"). */
export interface ProgramRange {
  lo: number
  hi: number
  pattern: ProgramPattern
  /** Which program in the list (varies the pattern so effect 3 and effect 4 differ). */
  index: number
}

/** A built-in program channel that drives this head (and its sibling cells). */
export interface ProgramDef {
  ref: ChannelRef
  ranges: ProgramRange[]
  /** The program's speed channel, if it has one. */
  speed?: ChannelRef
  /** Heads sharing a program form a group: the chase steps through them in order. */
  group: string
}

/** A gobo wheel range: which slot it shows (0 = open). */
export interface GoboSlot {
  lo: number
  hi: number
  slot: number
}

/** A gobo rotation range: spin speed going from `from` to `to`, turns per second (minus = anticlockwise). */
export interface SpinRange {
  lo: number
  hi: number
  from: number
  to: number
}

export interface HeadDef {
  name: string
  role: HeadRole
  ch: Partial<Record<HeadFunction, ChannelRef>>
  colorWheel?: WheelSlot[]
  shutter?: ShutterRange[]
  goboSlots?: GoboSlot[]
  goboSpin?: SpinRange[]
  prismSpin?: SpinRange[]
  /** The rotation channel's ranges (a derby or Starburst motor): turns per second, minus = anticlockwise. */
  rotationSpin?: SpinRange[]
  /** Pan/tilt speed channel: `from`/`to` are fractions of full speed (1 = fastest). */
  moveSpeed?: SpinRange[]
  /** The colour of this head's white channel: warm white is orange-ish, cool white bluish. */
  whiteTint?: [number, number, number]
  /** A built-in program channel that takes over this head while it runs. */
  program?: ProgramDef
  /** Which cell of the fixture's face this part sits in (cluster and panel looks); parts can share a cell. */
  cell?: number
}

export interface HeadState {
  /** 0..1 after dimmer, master and shutter. */
  intensity: number
  /** Linear 0..1. */
  color: [number, number, number]
  /** Degrees from the centre of the range. */
  pan: number
  tilt: number
  beamAngle: number
  /** 0 = open, otherwise the gobo slot number. */
  gobo: number
  /** Gobo rotation, turns per second (minus = anticlockwise). */
  goboSpin: number
  /** Prism rotation, turns per second. 0 = the prism stays still. */
  prismSpin: number
  /** Fraction of the fixture's top pan/tilt speed (the pan/tilt speed channel). */
  moveSpeed: number
  /** Prism in (multiplies the beam). */
  prism: boolean
  /** 0..1, e.g. derby rotation speed or laser pattern. */
  rotation: number
  /** 0..1 fog or haze output (fog machines). */
  fog: number
  /**
   * The red, green, blue and white levels on their own (0..1, before the dimmer), for
   * fixtures whose LEDs are single colours side by side (a Double Helix's heads): each
   * LED lights with its own channel. Missing while a built-in program runs.
   */
  mix?: [number, number, number, number]
  /** A colour slot with several colours ("Red + Green", "Multicolour"): one per beam. */
  colours?: Array<[number, number, number]>
}

const ROLE_FUNCTIONS: ChannelFunction[] = ['red', 'green', 'blue', 'white', 'amber', 'uv']

/** Built-in types only list channels; turn them into heads (one per colour cell). */
export function headsFromChannels(type: FixtureType): HeadDef[] {
  const cells = Math.max(1, type.cells ?? 1)
  const seen = new Map<ChannelFunction, number>()
  const heads: HeadDef[] = Array.from({ length: cells }, (_, i) => ({
    name: cells > 1 ? `Cell ${i + 1}` : 'Main',
    role: cells > 1 ? 'pixel' : 'beam',
    ch: {}
  }))
  const shared: HeadDef['ch'] = {}
  type.channels.forEach((fn, index) => {
    const n = seen.get(fn) ?? 0
    seen.set(fn, n + 1)
    const target = ROLE_FUNCTIONS.includes(fn) ? heads[Math.min(n, cells - 1)].ch : shared
    if (fn === 'panFine') shared.pan = { ...(shared.pan ?? { coarse: index }), fine: index }
    else if (fn === 'tiltFine') shared.tilt = { ...(shared.tilt ?? { coarse: index }), fine: index }
    else if (fn !== 'reserved' && fn !== 'speed' && !(fn in target)) (target as Record<string, ChannelRef>)[fn] = { coarse: index }
  })
  // Movement, dimmer and shutter apply to every cell.
  for (const head of heads) head.ch = { ...shared, ...head.ch }
  return heads
}

/** A flat channel list (for the faders and universe view) from a fixture's heads. */
export function channelListFromHeads(count: number, heads: HeadDef[]): ChannelFunction[] {
  const channels: ChannelFunction[] = new Array(count).fill('reserved')
  const label: Partial<Record<HeadFunction, ChannelFunction>> = {
    dimmer: 'dimmer', pan: 'pan', tilt: 'tilt', red: 'red', green: 'green', blue: 'blue', white: 'white',
    amber: 'amber', uv: 'uv', shutter: 'shutter', zoom: 'zoom', colorWheel: 'colorWheel', gobo: 'gobo', prism: 'prism'
  }
  for (const head of heads) {
    for (const [fn, ref] of Object.entries(head.ch) as Array<[HeadFunction, ChannelRef]>) {
      const name = label[fn]
      if (name && ref.coarse < count && channels[ref.coarse] === 'reserved') channels[ref.coarse] = name
      if (ref.fine !== undefined && ref.fine < count) {
        if (fn === 'pan') channels[ref.fine] = 'panFine'
        if (fn === 'tilt') channels[ref.fine] = 'tiltFine'
      }
    }
  }
  return channels
}

export function headsOf(type: FixtureType): HeadDef[] {
  return type.heads ?? headsFromChannels(type)
}

function read(levels: Uint8Array, address: number, ref?: ChannelRef): number | undefined {
  if (!ref) return undefined
  const coarse = levels[address - 1 + ref.coarse] ?? 0
  if (ref.fine === undefined) return coarse / 255
  return (coarse * 256 + (levels[address - 1 + ref.fine] ?? 0)) / 65535
}

/** How open the shutter is right now, using the fixture's own ranges if it has them. */
function shutterFactor(raw: number | undefined, ranges: ShutterRange[] | undefined, time: number): number {
  if (raw === undefined) return 1
  const value = Math.round(raw * 255)
  let kind: ShutterRange['kind'] = 'open'
  let position = 0
  const range = ranges?.find((r) => value >= r.lo && value <= r.hi)
  if (range && range.kind === 'strobe' && value < 10 && ranges!.every((r) => r.kind === 'strobe')) {
    // Only "strobe, slow to fast" is known (the fixture file doesn't say where it's off):
    // like nearly every fixture, the bottom of the range is no strobe.
    kind = 'open'
  } else if (range) {
    kind = range.kind
    position = (value - range.lo) / Math.max(1, range.hi - range.lo)
  } else if (ranges && ranges.length) {
    // Values between the listed ranges: treat as open, like most fixtures do.
    kind = 'open'
  } else if (value >= 10) {
    // No ranges known: the common convention is 0-9 no strobe, then slow to fast.
    kind = 'strobe'
    position = (value - 10) / 245
  }
  if (kind === 'closed') return 0
  if (kind === 'open') return 1
  const hz = 1 + position * 19
  return (time * hz) % 1 < 0.3 ? 1 : 0
}

function wheelSlot(raw: number | undefined, slots: WheelSlot[] | undefined): WheelSlot | null {
  if (raw === undefined || !slots?.length) return null
  const value = Math.round(raw * 255)
  return slots.find((s) => value >= s.lo && value <= s.hi) ?? null
}

/** Gobo rotation speed. Without the fixture's ranges: 0-7 stop, then clockwise slow to fast, then anticlockwise. */
function spinOf(raw: number | undefined, ranges: SpinRange[] | undefined): number {
  if (raw === undefined) return 0
  const v = Math.round(raw * 255)
  if (ranges?.length) {
    const r = ranges.find((x) => v >= x.lo && v <= x.hi)
    if (!r) return 0
    const t = (v - r.lo) / Math.max(1, r.hi - r.lo)
    return r.from + (r.to - r.from) * t
  }
  if (v < 8) return 0
  if (v < 128) return 0.1 + ((v - 8) / 120) * 1.4
  return -(0.1 + ((v - 128) / 127) * 1.4)
}

/** Pan/tilt speed. Without the fixture's ranges, the usual layout: 0 = fastest, 255 = slowest. */
function speedOf(raw: number | undefined, ranges: SpinRange[] | undefined): number {
  if (raw === undefined) return 1
  const v = Math.round(raw * 255)
  if (ranges?.length) {
    const r = ranges.find((x) => v >= x.lo && v <= x.hi)
    if (!r) return 1
    const t = (v - r.lo) / Math.max(1, r.hi - r.lo)
    return Math.max(0.03, r.from + (r.to - r.from) * t)
  }
  return Math.max(0.03, 1 - (v / 255) * 0.97)
}

/** Decode every head of a fixture from its universe's levels. */
export function decodeHeads(type: FixtureType, levels: Uint8Array, address: number, time: number): HeadState[] {
  const heads = headsOf(type)
  const master = heads.find((h) => h.role === 'master')
  const masterDim = master ? (read(levels, address, master.ch.dimmer) ?? 1) * shutterFactor(read(levels, address, master.ch.shutter), master.shutter, time) : 1
  const [narrow, wide] = type.zoomRange
  // Nothing sent to this fixture at all (every channel 0): it's dark. Without this, parts
  // that light up "by default" (a strobe whose 0 means open, a wheel whose first slot is a
  // colour) glowed with nothing sent.
  const width = Math.max(1, type.channels.length)
  let sent = false
  for (let i = 0; i < width && !sent; i++) sent = (levels[address - 1 + i] ?? 0) > 0

  return heads.map((head, index) => {
    const r = (fn: HeadFunction) => read(levels, address, head.ch[fn])
    const hasColor = head.ch.red || head.ch.green || head.ch.blue || head.ch.white || head.ch.amber || head.ch.uv
    const hasCmy = !hasColor && (head.ch.cyan || head.ch.magenta || head.ch.yellow)
    // A plain lamp (dimmer only) glows in its own white: warm for incandescent and COB parts.
    let color: [number, number, number] = head.whiteTint ? [...head.whiteTint] : [1, 1, 1]
    if (hasColor) {
      const w = r('white') ?? 0
      const a = r('amber') ?? 0
      const u = r('uv') ?? 0
      const t = head.whiteTint ?? [1, 1, 1]
      color = [
        Math.min(1, (r('red') ?? 0) + w * t[0] + a + u * 0.3),
        Math.min(1, (r('green') ?? 0) + w * t[1] + a * 0.55),
        Math.min(1, (r('blue') ?? 0) + w * t[2] + u * 0.9)
      ]
    } else if (hasCmy) {
      // Colour mixing flags on a white lamp: each one takes its opposite colour out.
      color = [1 - (r('cyan') ?? 0) * 0.95, 1 - (r('magenta') ?? 0) * 0.95, 1 - (r('yellow') ?? 0) * 0.95]
    }
    const slot = wheelSlot(r('colorWheel'), head.colorWheel)
    let wheel = slot ? slot.rgb : null
    // On an RGB fixture the macro's "black" slot means "no macro": the mixed colour shows.
    if (wheel && hasColor && Math.max(...wheel) <= 0.001) wheel = null
    // A real colour wheel filters the white lamp. On an RGB fixture the same kind of
    // channel is a colour macro, which replaces the mixed colour while it's active.
    if (wheel) color = hasColor ? [...wheel] : [color[0] * wheel[0], color[1] * wheel[1], color[2] * wheel[2]]

    // No dimmer on this head: colour channels carry the brightness (or it's simply on).
    const dimmer = r('dimmer') ?? (hasColor ? 1 : head.role === 'master' ? 1 : 1)
    const shutter = shutterFactor(r('shutter'), head.shutter, time)
    // A head with nothing that makes light (a fog or fan channel) stays dark.
    const makesLight = hasColor || head.ch.dimmer || head.ch.shutter || head.ch.colorWheel || head.ch.laser || head.role === 'derby' || head.role === 'laser'
    // A colour-wheel-only part (a derby, a laser) is dark when the wheel is in its
    // "blackout" range, i.e. between the slots the fixture lists.
    const wheelOff = !hasColor && !head.ch.dimmer && !!head.ch.colorWheel && !!head.colorWheel?.length && !wheel
    const black = Math.max(color[0], color[1], color[2]) <= 0.001
    let intensity = head.role === 'master' || !makesLight || wheelOff || black ? 0 : dimmer * shutter * masterDim

    // A built-in program running: the head follows the program's pattern instead.
    const program = head.program ? runProgram(head, heads, index, levels, address, time) : null
    if (program && head.role !== 'master') {
      const own = head.ch.dimmer ? dimmer : 1
      intensity = program.level * own * masterDim * shutter
      if (program.color) color = program.color
      else if (!hasColor || black) color = head.whiteTint ?? [1, 1, 1]
    }

    const pan = head.ch.pan ? ((r('pan') ?? 0.5) - 0.5) * type.panRange : 0
    const tilt = head.ch.tilt ? ((r('tilt') ?? 0.5) - 0.5) * type.tiltRange : 0
    const zoom = r('zoom')
    const beamAngle = zoom === undefined ? narrow : narrow + zoom * (wide - narrow)
    const goboRaw = r('gobo') ?? 0
    const goboValue = Math.round(goboRaw * 255)
    // With the fixture's own wheel ranges, the exact slot; otherwise a common layout (0-7 open).
    const goboRange = head.goboSlots?.find((g) => goboValue >= g.lo && goboValue <= g.hi)
    const gobo = head.goboSlots?.length ? (goboRange?.slot ?? 0) : goboValue < 8 ? 0 : 1 + Math.floor(goboRaw * 7)
    const goboSpin = spinOf(r('goboRotation'), head.goboSpin)
    const prismSpin = spinOf(r('prismRotation'), head.prismSpin)
    const moveSpeed = speedOf(r('moveSpeed'), head.moveSpeed)
    const prism = (r('prism') ?? 0) * 255 > 20
    // A motor with known ranges turns at their speed (minus = the other way); otherwise the raw level.
    const rotation = head.rotationSpin?.length ? spinOf(r('rotation'), head.rotationSpin) : r('rotation') ?? r('laser') ?? 0
    const fog = r('fog') ?? 0
    if (!sent) intensity = 0
    const mix: [number, number, number, number] | undefined = hasColor && !program && !wheel ? [r('red') ?? 0, r('green') ?? 0, r('blue') ?? 0, r('white') ?? 0] : undefined
    const colours = wheel && slot?.colours && !program ? slot.colours : undefined
    return { intensity, color, pan, tilt, beamAngle, gobo, goboSpin, prismSpin, moveSpeed, prism, rotation, fog, mix, colours }
  })
}

const PALETTE: Array<[number, number, number]> = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]]

function hue(h: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6
    return Math.max(0, Math.min(1, Math.abs(k - 3) - 1))
  }
  return [f(0), f(4), f(2)]
}

/**
 * The generic pattern standing in for a built-in program: no manual says what
 * "effect 12" looks like, so the twin shows the nearest of a few patterns
 * (chase, fade, colour jump, rainbow, strobe, pulse), at the program's speed.
 */
function runProgram(head: HeadDef, heads: HeadDef[], index: number, levels: Uint8Array, address: number, time: number): { level: number; color?: [number, number, number] } | null {
  const p = head.program!
  const v = Math.round((read(levels, address, p.ref) ?? 0) * 255)
  // 0 is "no program" on every light: a fixture file whose first program starts at 0
  // made lights run a chase in colour with nothing sent at all.
  if (v === 0) return null
  const range = p.ranges.find((x) => v >= x.lo && v <= x.hi)
  if (!range || range.pattern === 'none') return null
  const group = heads.map((h, i) => (h.program?.group === p.group ? i : -1)).filter((i) => i >= 0)
  const k = Math.max(0, group.indexOf(index))
  const n = Math.max(1, group.length)
  const speed = p.speed ? 0.25 + (read(levels, address, p.speed) ?? 0.5) * 3 : 1
  // Odd-numbered programs run the other way, so neighbouring programs look different.
  const dir = range.index % 2 ? -1 : 1
  const phase = time * speed
  const rgb = !!(head.ch.red || head.ch.green || head.ch.blue)
  const tint = rgb ? PALETTE[(range.index + k) % PALETTE.length] : undefined
  switch (range.pattern) {
    case 'chase': {
      const step = ((Math.floor(phase * 2) * dir) % n + n) % n
      return { level: step === k ? 1 : 0.04, color: tint }
    }
    case 'fade':
      return { level: 0.5 + 0.5 * Math.sin(Math.PI * (phase + (k / n) * dir)), color: tint }
    case 'jump':
      return { level: 1, color: rgb ? PALETTE[(Math.floor(phase) + k + range.index) % PALETTE.length] : undefined }
    case 'rainbow':
      return { level: 1, color: rgb ? hue((phase * 0.25 + (k / n) * dir) % 1) : undefined }
    case 'strobe':
      return { level: (phase * 6) % 1 < 0.3 ? 1 : 0, color: tint }
    case 'pulse':
      return { level: Math.exp(-((phase * 2) % 1) * 4), color: tint }
    default:
      return { level: 1, color: tint }
  }
}
