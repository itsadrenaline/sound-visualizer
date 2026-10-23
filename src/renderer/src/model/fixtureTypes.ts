/**
 * Fixture types: what a kind of light can do and which DMX channel controls what.
 *
 * Real projects get these from GDTF files (learning plan, step 8). For now we
 * define two generic types by hand so there's something to patch.
 */

/** What a channel controls. `fine` channels hold the low byte of a 16-bit value. */
import type { HeadDef } from './heads'
import { catalogSpec, type FixtureSpec } from './catalog'
import type { SoundSwitchMode, SoundSwitchRange } from '../../../shared/soundswitch'

export type ChannelFunction =
  | 'pan' | 'panFine'
  | 'tilt' | 'tiltFine'
  | 'dimmer' | 'shutter'
  | 'red' | 'green' | 'blue' | 'white' | 'amber' | 'uv'
  | 'zoom'
  | 'colorWheel' | 'gobo' | 'prism'
  | 'speed' | 'reserved'

export interface FixtureType {
  id: string
  name: string
  manufacturer: string
  /** One entry per DMX channel, in order. Channel 1 is index 0. */
  channels: ChannelFunction[]
  /** Total movement in degrees (0 when the fixture can't move). */
  panRange: number
  tiltRange: number
  /** Beam angle in degrees at zoom 0 and zoom 255. */
  zoomRange: [number, number]
  /** Fastest the head can move, degrees per second. Used by the mechanics simulation. */
  maxSpeed: number
  /** Brightest output, in candela. Used by the renderer. */
  candela: number
  /** movingHead: pan/tilt yoke. par: a fixed can. bar: a strip or tube of pixel cells. */
  body: 'movingHead' | 'par' | 'bar'
  /** Number of separately coloured cells (pixel tubes have 16). Defaults to 1. */
  cells?: number
  /** Where this type came from, for display. */
  source?: string
  /** Separately controlled parts. Built-in types leave this out and get heads from `channels`. */
  heads?: HeadDef[]
  /** Real-world size and look, from the manufacturer's specs. */
  spec?: FixtureSpec
  /** The look was worked out, not known (no spec for this model yet): Fixture Studio can fix it. */
  lookGuessed?: boolean
  /** Made or edited in Fixture Studio: the id of its definition there. */
  studioId?: string
  /**
   * Where the fixture's other DMX modes are: its Library entry, or (from SoundSwitch)
   * every mode of its SoundSwitch definition. `mode` is which one this type is.
   */
  family?: FixtureFamily
}

export interface FixtureFamily {
  mode: number
  /** A Library key ("cameo/hydrabeam-400-rgbw", "qlc/…"). */
  library?: string
  soundswitch?: { definitionId: number; definition: string; manufacturer: string; wheels: Record<string, SoundSwitchRange[]>; modes: SoundSwitchMode[] }
}

export const FIXTURE_TYPES: Record<string, FixtureType> = {
  'generic-spot-16': {
    id: 'generic-spot-16',
    name: 'Moving Head Spot (16ch)',
    manufacturer: 'Generic',
    channels: [
      'pan', 'panFine', 'tilt', 'tiltFine', 'speed', 'dimmer', 'shutter',
      'red', 'green', 'blue', 'white', 'zoom',
      'reserved', 'reserved', 'reserved', 'reserved'
    ],
    panRange: 540,
    tiltRange: 270,
    zoomRange: [6, 36],
    maxSpeed: 240,
    candela: 1200,
    body: 'movingHead'
  },
  'generic-par-8': {
    id: 'generic-par-8',
    name: 'LED PAR Wash (8ch)',
    manufacturer: 'Generic',
    channels: ['dimmer', 'red', 'green', 'blue', 'white', 'zoom', 'shutter', 'reserved'],
    panRange: 0,
    tiltRange: 0,
    zoomRange: [12, 50],
    maxSpeed: 0,
    candela: 500,
    body: 'par'
  }
}

/**
 * Types created at runtime, e.g. imported from SoundSwitch. They're saved inside
 * the project, and registered again when the project loads.
 */
const registered = new Map<string, FixtureType>()

export function registerFixtureTypes(types: FixtureType[] | undefined): void {
  for (const type of types ?? []) registered.set(type.id, withKnownLook(type))
}

/**
 * A show saved before we knew what a SoundSwitch fixture looks like (its look was a
 * guess) gets the researched look now, without waiting for the next sync.
 */
function withKnownLook(type: FixtureType): FixtureType {
  if (type.source !== 'SoundSwitch') return type
  const known = catalogSpec(type.name, type.manufacturer)
  if (!known) return type
  // Speed channels that go slow to fast (a Hydrabeam): saved without their ranges, it crawled.
  const heads = known.speedRising ? type.heads?.map((h) => (h.ch.moveSpeed && !h.moveSpeed ? { ...h, moveSpeed: [{ lo: 0, hi: 255, from: 0.05, to: 1 }] } : h)) : type.heads
  if (!type.lookGuessed) return heads === type.heads ? type : { ...type, heads }
  return { ...type, heads, spec: known, panRange: known.pan ?? type.panRange, tiltRange: known.tilt ?? type.tiltRange, maxSpeed: known.speed ?? type.maxSpeed, lookGuessed: false }
}

/** A plain stand-in, so a fixture whose type went missing still draws instead of crashing. */
const UNKNOWN: FixtureType = {
  id: 'unknown',
  name: 'Unknown fixture',
  manufacturer: '',
  channels: ['dimmer'],
  panRange: 0,
  tiltRange: 0,
  zoomRange: [20, 20],
  maxSpeed: 0,
  candela: 300,
  body: 'par'
}

/**
 * Fixture types edited in Fixture Studio stand in for the original (a SoundSwitch
 * or Library type) in this show: the show keeps the original's id, so SoundSwitch
 * syncs and copies keep working, and "Back to the original" just drops the override.
 */
const overrides = new Map<string, FixtureType>()

// The same stored type always gives the same object, so the 3D view only rebuilds a fixture when its type really changed.
const wrapped = new WeakMap<FixtureType, FixtureType>()

export function setTypeOverrides(map: Record<string, FixtureType> | undefined): void {
  overrides.clear()
  for (const [id, type] of Object.entries(map ?? {})) {
    let w = wrapped.get(type)
    if (!w || w.id !== id) {
      w = { ...type, id }
      wrapped.set(type, w)
    }
    overrides.set(id, w)
  }
}

export function getFixtureType(id: string): FixtureType {
  return overrides.get(id) ?? FIXTURE_TYPES[id] ?? registered.get(id) ?? UNKNOWN
}

/** The type as it was before any Fixture Studio edit. */
export function originalFixtureType(id: string): FixtureType {
  return FIXTURE_TYPES[id] ?? registered.get(id) ?? UNKNOWN
}

export function isOverridden(id: string): boolean {
  return overrides.has(id)
}

/** Every type the app knows right now: built in, plus imported ones. */
export function listFixtureTypes(): FixtureType[] {
  return [...Object.values(FIXTURE_TYPES), ...registered.values()]
}

/** A type's name without its bracketed parts: "Spot 360 (Mode 2 (14ch))" → "Spot 360". Handles nesting. */
export function plainName(name: string): string {
  let out = name
  let before = ''
  while (out !== before) {
    before = out
    out = out.replace(/\([^()]*\)|\[[^[\]]*\]/g, '')
  }
  return out.replace(/[()[\]]/g, '').replace(/\s+/g, ' ').trim()
}
