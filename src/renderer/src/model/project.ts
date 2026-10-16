/**
 * The project document: plain data only, no three.js and no React.
 *
 * Keeping the document as plain, immutable objects is what makes undo, saving
 * and testing easy.
 */
import { getFixtureType, type FixtureType } from './fixtureTypes'
import type { Structure } from './structures'
import { defaultStructures } from './physics'

export type Vec3 = [number, number, number]

export interface Fixture {
  id: string
  name: string
  typeId: string
  /** Art-Net universe (Port-Address), 0-based as Art-Net counts it. */
  universe: number
  /** DMX start address, 1..512. */
  address: number
  /** Position in metres: x = stage left/right, y = height, z = downstage. */
  position: Vec3
  /** Hanging fixtures are mounted upside down on a truss. */
  mounting: 'hanging' | 'floor'
  /** Fixed aim for fixtures that can't move, degrees from straight down (hanging) or up (floor). */
  aimTilt: number
  /** Turn the whole fixture around its vertical axis, degrees. */
  rotation?: number
  /** Mirror the movement: same DMX, opposite direction (for symmetrical pairs). */
  invertPan?: boolean
  invertTilt?: boolean
  /**
   * What it's attached to: a structure and one of its mount points (a totem's
   * top plate, a truss bar; `t` is how far along a bar, 0..1). Its position then
   * follows the structure.
   */
  mount?: { structure: string; point: string; t?: number }
  /** Fixture group, as in SoundSwitch (1 = Group 1). Missing or 0 = no group. */
  group?: number
  /** For fixtures imported from SoundSwitch: how to recognise it there, e.g. "U2.160 Modern Consoles DJ Booth LED Strip". */
  soundswitchKey?: string
  /**
   * A copy of a SoundSwitch fixture on the same patch (a mirror): the soundswitchKey
   * of the one it copies. Syncs keep its patch in step with the original.
   */
  copyOf?: string
}

/**
 * How a show follows SoundSwitch. A new show picks a SoundSwitch project
 * ("profile") and which of its fixtures to use; syncs then only bring those in.
 * Shows saved before this existed have no setting and take every fixture.
 */
export interface SoundSwitchLinkSettings {
  /** false: this show doesn't follow SoundSwitch at all (built from scratch, a demo). */
  link: boolean
  /** The SoundSwitch project's name, e.g. "My Club Rig". Syncs from another project are ignored. */
  profile?: string
  /** soundswitchKeys of the fixtures to bring in. Missing: all of them. */
  include?: string[]
  /**
   * Fixtures (ids) you chose to leave in the show although the SoundSwitch project
   * doesn't patch them: they aren't flagged as "not in project" any more.
   */
  keepOutside?: string[]
}

export interface Project {
  name: string
  /** Following SoundSwitch (see SoundSwitchLinkSettings). */
  soundswitch?: SoundSwitchLinkSettings
  fixtures: Fixture[]
  /** Fixture types that aren't built in, e.g. imported from SoundSwitch. */
  fixtureTypes?: FixtureType[]
  /** Fixture types edited in Fixture Studio, standing in for the original type with that id. */
  typeOverrides?: Record<string, FixtureType>
  /** Which version of the automatic SoundSwitch layout placed the fixtures. */
  layoutVersion?: number
  /** Stored camera positions. */
  cameras?: CameraPosition[]
  /** The room: ceiling and how bright the room's own light is. */
  room?: RoomSettings
  /** Your own names for groups ("Uplights"); SoundSwitch only numbers them. */
  groupNames?: Record<number, string>
  /** Patch clashes you chose to keep (model/patchCheck.ts). */
  ignoredClashes?: string[]
  /** Objects: stage decks, truss, totems, tables... (model/structures.ts). */
  structures?: Structure[]
}

export interface RoomSettings {
  /** Show a ceiling (gobos and beams land on it). */
  ceiling: boolean
  /** Ceiling height above the floor, metres. */
  ceilingHeight: number
  /** The room's own light: 0 = pitch black club, 1 = house lights up. */
  ambient: number
  /** Colour of the room's light, e.g. "#ffd9a8" for warm tungsten. */
  ambientColor: string
}

export const DEFAULT_ROOM: RoomSettings = { ceiling: true, ceilingHeight: 7.5, ambient: 0.18, ambientColor: '#b8c4d6' }

export function roomOf(project: Project): RoomSettings {
  return { ...DEFAULT_ROOM, ...project.room }
}

export interface CameraPosition {
  name: string
  position: Vec3
  target: Vec3
}

export function footprint(fixture: Fixture): number {
  return getFixtureType(fixture.typeId).channels.length
}

/** Pairs of fixtures whose channels overlap in the same universe. */
export function findOverlaps(fixtures: Fixture[]): Array<[Fixture, Fixture]> {
  const overlaps: Array<[Fixture, Fixture]> = []
  for (let i = 0; i < fixtures.length; i++) {
    for (let j = i + 1; j < fixtures.length; j++) {
      const a = fixtures[i]
      const b = fixtures[j]
      if (a.universe !== b.universe) continue
      const aEnd = a.address + footprint(a) - 1
      const bEnd = b.address + footprint(b) - 1
      if (a.address <= bEnd && b.address <= aEnd) overlaps.push([a, b])
    }
  }
  return overlaps
}

/** True if the fixture's channels fit inside one 512-channel universe. */
export function fitsInUniverse(fixture: Fixture): boolean {
  return fixture.address >= 1 && fixture.address + footprint(fixture) - 1 <= 512
}

/** The first address in `universe` where `channels` free channels in a row start, or null. */
export function nextFreeAddress(fixtures: Fixture[], universe: number, channels: number): number | null {
  const used = new Uint8Array(513)
  for (const f of fixtures) {
    if (f.universe !== universe) continue
    for (let c = f.address; c < f.address + footprint(f) && c <= 512; c++) used[c] = 1
  }
  let run = 0
  for (let c = 1; c <= 512; c++) {
    run = used[c] ? 0 : run + 1
    if (run === channels) return c - channels + 1
  }
  return null
}

/**
 * Where `count` fixtures of `channels` channels each go: from `start` onward,
 * each in the next free gap, carrying on into the
 * following universes when one is full. Returns fewer spots only if universe
 * `maxUniverse` runs out too.
 */
export function planPatch(
  fixtures: Fixture[],
  count: number,
  channels: number,
  start: { universe: number; address: number } = { universe: 0, address: 1 },
  maxUniverse = start.universe + 63
): Array<{ universe: number; address: number }> {
  const out: Array<{ universe: number; address: number }> = []
  if (channels < 1 || channels > 512) return out
  const placed: Fixture[] = [...fixtures]
  let universe = start.universe
  let from = Math.max(1, start.address)
  while (out.length < count && universe <= maxUniverse) {
    const used = new Uint8Array(514)
    for (const f of placed) {
      if (f.universe !== universe) continue
      const n = f.typeId === '__planned' ? channels : footprint(f)
      for (let c = f.address; c < f.address + n && c <= 512; c++) used[c] = 1
    }
    let found = -1
    let run = 0
    for (let c = from; c <= 512; c++) {
      run = used[c] ? 0 : run + 1
      if (run === channels) {
        found = c - channels + 1
        break
      }
    }
    if (found < 0) {
      universe++
      from = 1
      continue
    }
    out.push({ universe, address: found })
    placed.push({ id: '', name: '', typeId: '__planned', universe, address: found, position: [0, 0, 0], mounting: 'floor', aimTilt: 0 })
    from = found + channels
  }
  return out
}

let counter = 0
export function newId(): string {
  counter++
  return `fx-${Date.now().toString(36)}-${counter}`
}

/**
 * What a new Mac starts with: an empty room and a show that doesn't follow
 * SoundSwitch yet. The New Show wizard (or Build show) fills it in.
 */
export function blankProject(): Project {
  return { ...defaultProject(), name: 'Untitled show', fixtures: [], fixtureTypes: [], structures: [], cameras: [], soundswitch: { link: false } }
}

/** The demo rig: six spots on an overhead truss and four PARs on the floor. */
export function defaultProject(): Project {
  const fixtures: Fixture[] = []
  for (let i = 0; i < 6; i++) {
    fixtures.push({
      id: `spot-${i + 1}`,
      name: `Spot ${i + 1}`,
      typeId: 'generic-spot-16',
      universe: 0,
      address: 1 + i * 16,
      position: [-5 + i * 2, 6, -1],
      mounting: 'hanging',
      aimTilt: 0
    })
  }
  for (let i = 0; i < 4; i++) {
    fixtures.push({
      id: `par-${i + 1}`,
      name: `PAR ${i + 1}`,
      typeId: 'generic-par-8',
      universe: 0,
      address: 97 + i * 8,
      position: [-4.5 + i * 3, 0.15, -4.2],
      mounting: 'floor',
      aimTilt: 20
    })
  }
  return { name: 'Untitled show', fixtures, structures: defaultStructures(), soundswitch: { link: false } }
}
