/**
 * Turns a parsed SoundSwitch venue into fixtures and fixture types for our project.
 *
 * Each SoundSwitch head (a pixel cell, a GigBar mover, a "Master" section) becomes
 * one of our heads, with its channels, colour-wheel slots and shutter ranges, so
 * the visualizer reacts to DMX the way the real fixture does. Looks and movement
 * ranges come from the manufacturers' specs (catalog.ts).
 */
import type { SoundSwitchAttribute, SoundSwitchFixture, SoundSwitchHead } from '../../../shared/soundswitch'
import { plainName, type FixtureType } from './fixtureTypes'
import { channelListFromHeads, shareWithMovers, slotFrom, type SpinRange, type GoboSlot, type HeadDef, type HeadFunction, type HeadRole, type ShutterRange, type WheelSlot } from './heads'
import type { Fixture, Project } from './project'
import { catalogSpec, ledsFromName, LOOK_DEFAULTS, specFor, type FixtureSpec, type LookKind } from './catalog'
import { autoLayout } from './layout'

/** SoundSwitch attribute codes, worked out from the names SoundSwitch shows for them. */
const CODE_TO_FUNCTION: Record<number, HeadFunction> = {
  1: 'dimmer',
  2: 'colorWheel',
  3: 'pan',
  4: 'tilt',
  7: 'prism',
  8: 'gobo',
  9: 'gobo',
  14: 'red',
  15: 'green',
  16: 'blue',
  26: 'gobo',
  28: 'prism',
  41: 'shutter',
  53: 'zoom',
  87: 'white',
  99: 'prism',
  105: 'amber',
  106: 'uv'
}

export type ImportedFixture = SoundSwitchFixture

export function typeIdFor(f: SoundSwitchFixture): string {
  return `ss-${f.definitionId}-${f.definition}-${f.mode.name}`.replace(/\s+/g, '_')
}

function functionOf(a: SoundSwitchAttribute, wheels: ImportedFixture['wheels']): HeadFunction | null {
  if (/laser/i.test(a.name)) return 'laser'
  // Names first: SoundSwitch reuses codes (85 is "Gobo Rotation" on one fixture, "Prism Rotate" on another).
  if (/pan\s*\/?\s*tilt\s*speed|p\/t\s*speed|movement\s*speed|head\s*\d*\s*speed|^speed\s*(pan|p\/t|movement)/i.test(a.name)) return 'moveSpeed'
  if (/prism/i.test(a.name) && /rot|spin/i.test(a.name)) return 'prismRotation'
  // "Rotating Gobo Wheel" picks a gobo; "Gobo Rotation" spins it.
  if (/gobo/i.test(a.name) && /rot|spin/i.test(a.name) && !/wheel/i.test(a.name)) return 'goboRotation'
  if (/rotation/i.test(a.name) && a.code === 82) return 'rotation'
  // A cold spark machine's height (or "spark", "fire", "fountain") drives its fountain.
  if (/spark\s*(height|level|output)?|fountain|^height$|^fire$/i.test(a.name)) return 'fog'
  // A wheel with coloured slots is a colour wheel, whatever its code says.
  if (a.wheel && wheels?.[a.wheel]?.some((s) => s.rgb)) return 'colorWheel'
  return CODE_TO_FUNCTION[a.code] ?? functionByName(a.name)
}

/**
 * When SoundSwitch's code isn't one we know, the attribute's name says what it does
 * (a Starburst's "UV" or "Purple", "Yellow", its ball "Rotation").
 */
function functionByName(name: string): HeadFunction | null {
  // Whole names only ("UV", "Purple 2", "LED White"): "Red pulse" is a program, not a colour.
  // Manual-style names too: "Dimmer Red 0-100%", "Red dimmer", "Master dimmer 0-100%".
  const n = name
    .trim()
    .replace(/\s*\d+\s*[-–]\s*\d+\s*%?\s*$/, '')
    .replace(/\s+channel$/i, '')
    .replace(/^(led|colou?r)\s+/i, '')
    .replace(/\s*\d+$/, '')
    .replace(/^dimmer\s+(?=\S)(?!.*dimmer)/i, '')
    .replace(/\s+dimmer$/i, (m, _offset, whole) => (/^(master|main)?\s*dimmer$/i.test(whole) ? m : ''))
  if (/^(uv|u\.v\.|ultra\s*violet|purple|violet)$/i.test(n)) return 'uv'
  if (/^(amber|yellow)$/i.test(n)) return 'amber'
  if (/^(white|warm\s*white|cool\s*white|cold\s*white)$/i.test(n)) return 'white'
  if (/^red$/i.test(n)) return 'red'
  if (/^green$/i.test(n)) return 'green'
  if (/^blue$/i.test(n)) return 'blue'
  if (/^(master\s*)?(dimmer|intensity)$/i.test(n)) return 'dimmer'
  if (/^(strobe|shutter|strobe\s*\/\s*shutter|shutter\s*\/\s*strobe)$/i.test(n)) return 'shutter'
  if (/^(ball\s*|motor\s*)?(rotation|rotate|spin)(\s*speed)?$/i.test(n)) return 'rotation'
  return null
}

/** A speed channel that goes slow (0) to fast (255). */
const RISING_SPEED: SpinRange[] = [{ lo: 0, hi: 255, from: 0.05, to: 1 }]

/**
 * A pan/tilt speed channel's direction from its ranges' names ("Slow - Fast",
 * "Fast to slow", "Max speed"), or undefined when they don't say.
 */
function speedRanges(a: SoundSwitchAttribute): SpinRange[] | undefined {
  const out: SpinRange[] = []
  for (const r of a.ranges ?? []) {
    const n = r.name.toLowerCase()
    const slow = n.indexOf('slow')
    const fast = Math.max(n.indexOf('fast'), n.indexOf('max'))
    if (slow >= 0 && fast >= 0) out.push({ lo: r.lo, hi: r.hi, from: slow < fast ? 0.05 : 1, to: slow < fast ? 1 : 0.05 })
    else if (fast >= 0) out.push({ lo: r.lo, hi: r.hi, from: 1, to: 1 })
    else if (slow >= 0) out.push({ lo: r.lo, hi: r.hi, from: 0.05, to: 0.05 })
  }
  return out.length ? out : undefined
}

/** The ADJ Starburst's rotation channel (from its manual): clockwise fast to slow, stop, anticlockwise slow to fast. */
const STARBURST_SPIN: SpinRange[] = [{ lo: 0, hi: 30, from: 0, to: 0 }, { lo: 31, hi: 140, from: 1.2, to: 0.1 }, { lo: 141, hi: 145, from: 0, to: 0 }, { lo: 146, hi: 255, from: -0.1, to: -1.2 }]

export { colourFromName } from './heads'

/** Lasers by name: "EL-900RGB", "Laserworld …", anything with "laser" in it. */
const LASER_NAME = /laser|\bEL-?\d{3,4}\s*RG/i

function roleOf(head: SoundSwitchHead, attrs: SoundSwitchAttribute[], fns: Set<HeadFunction>, fixtureHasMover: boolean, laserFixture = false): HeadRole {
  const name = head.name
  const hasColor = ['red', 'green', 'blue', 'amber', 'uv'].some((f) => fns.has(f as HeadFunction))
  if (fns.has('laser') || attrs.some((a) => /laser/i.test(a.name))) return 'laser'
  // A laser projector (its pan/tilt are the X/Y of the drawing, not a moving head).
  if (laserFixture && !/strobe|derby|master/i.test(name)) return 'laser'
  if (/master/i.test(name) && fns.has('dimmer')) return 'master'
  if (/derby/i.test(name)) return 'derby'
  if (/strobe|white light/i.test(name) || (!hasColor && !fns.has('pan') && fns.has('shutter') && !fns.has('dimmer'))) return 'strobe'
  if (fns.has('pan') || fns.has('tilt')) return 'beam'
  if (fixtureHasMover && hasColor) return 'halo'
  if (/cell|section|pixel|warm white/i.test(name)) return 'pixel'
  return 'beam'
}

/** Bump when the default positions change, so existing projects get the new layout once. */
export const LAYOUT_VERSION = 2

export function fixtureTypeFromMode(f: ImportedFixture): FixtureType {
  const attrs = f.mode.attributes
  const sourceHeads: SoundSwitchHead[] = f.mode.heads?.length ? f.mode.heads : [{ name: 'Main', attributes: attrs.map((_, i) => i) }]
  // Not a multi-effect light that happens to have a laser in it ("Derby Laser Strobe").
  const laserFixture = (LASER_NAME.test(f.definition) || /laser/i.test(f.manufacturer ?? '')) && !/derby|strobe|\bpar\b|wash|gig|bar\b|combo|moon/i.test(f.definition)
  // A laser's X/Y axes are pan and tilt codes in SoundSwitch, but it isn't a moving head.
  const fixtureHasMover = !laserFixture && attrs.some((a) => a.code === 3 || a.code === 4)

  const heads: HeadDef[] = sourceHeads.map((h) => {
    const ch: HeadDef['ch'] = {}
    let colorWheel: WheelSlot[] | undefined
    let shutter: ShutterRange[] | undefined
    let goboSlots: GoboSlot[] | undefined
    let moveSpeed: SpinRange[] | undefined
    const fns = new Set<HeadFunction>()
    const headAttrs = h.attributes.map((i) => attrs[i]).filter(Boolean)
    for (const a of headAttrs) {
      const fn = functionOf(a, f.wheels)
      if (!fn || ch[fn]) continue
      ch[fn] = a.width === 2 ? { coarse: a.coarse, fine: a.fine } : { coarse: a.coarse }
      fns.add(fn)
      if (fn === 'colorWheel' && a.wheel && f.wheels?.[a.wheel]) {
        // Colours from SoundSwitch, or from the slot's name ("Red", "Multicolour", "R+G").
        colorWheel = f.wheels[a.wheel]
          .map((s) => slotFrom(s.lo, s.hi, s.name ?? '', s.rgb ? (s.rgb.map((v) => v / 255) as [number, number, number]) : null))
          .filter((s): s is WheelSlot => !!s)
      }
      // Colours given only as named ranges ("Red", "Yellow color", "Red + Green"), as on
      // lasers: their names say the colour.
      if (fn === 'colorWheel' && !colorWheel?.length && a.ranges?.length) {
        const named = a.ranges.map((r) => slotFrom(r.lo, r.hi, r.name, r.rgb ? (r.rgb.map((v) => v / 255) as [number, number, number]) : null)).filter((r): r is WheelSlot => !!r)
        if (named.length) colorWheel = named
      }
      if (fn === 'gobo' && a.wheel && f.wheels?.[a.wheel]?.length) {
        // SoundSwitch lists the gobo wheel's slots with their DMX ranges; the first is usually open.
        goboSlots = f.wheels[a.wheel].map((s, i) => ({ lo: s.lo, hi: s.hi, slot: /open|no gobo/i.test(s.name) ? 0 : i }))
      }
      if (fn === 'moveSpeed') moveSpeed = speedRanges(a)
      if (fn === 'shutter' && a.ranges?.length) {
        shutter = a.ranges.filter((r) => r.shutter).map((r) => ({ lo: r.lo, hi: r.hi, kind: r.shutter! }))
      }
    }
    // Rockville's "warm white" blinders are named white but are warm.
    return { name: h.name, role: roleOf(h, headAttrs, fns, fixtureHasMover, laserFixture), ch, colorWheel, shutter, goboSlots, ...(moveSpeed ? { moveSpeed } : {}) }
  })

  // A head with only dimmer/shutter, next to heads that make the light (Rockville's
  // "Main"), is the fixture's master: it dims and strobes the others, it isn't a lamp.
  if (heads.length > 1) {
    const LIGHT: HeadFunction[] = ['red', 'green', 'blue', 'white', 'amber', 'uv', 'colorWheel', 'pan', 'tilt', 'laser']
    for (const head of heads) {
      const fns = Object.keys(head.ch) as HeadFunction[]
      const controlOnly = fns.length > 0 && fns.every((fn) => fn === 'dimmer' || fn === 'shutter')
      if (controlOnly && fns.includes('dimmer') && heads.some((o) => o !== head && LIGHT.some((fn) => o.ch[fn]))) head.role = 'master'
    }
  }

  // Cells that SoundSwitch names something other than "Cell" or "Pixel" ("1", "Stick 1",
  // "Segment A") are still cells: several parts, each with its own colour, on one fixture.
  const COLOUR: HeadFunction[] = ['red', 'green', 'blue', 'white', 'amber', 'uv']
  const coloured = heads.filter((h) => h.role === 'beam' && !h.ch.pan && !h.ch.tilt && COLOUR.some((fn) => h.ch[fn]))
  if (!fixtureHasMover && coloured.length > 1) for (const h of coloured) h.role = 'pixel'

  // Several movers on one bar sharing a colour, dimmer or speed part (a Hydrabeam).
  const lookAhead = catalogSpec(f.definition, f.manufacturer)?.look
  if (fixtureHasMover && (lookAhead ? lookAhead === 'mover' || lookAhead === 'moverWash' : heads.filter((h) => h.ch.pan || h.ch.tilt).length > 1)) {
    heads.splice(0, heads.length, ...shareWithMovers(heads, true))
  }

  // A flat channel list too, for the fader panel and the universe view.
  const channels = channelListFromHeads(f.mode.channels, heads)

  const pixelHeads = heads.filter((h) => h.role === 'pixel').length
  const known = catalogSpec(f.definition, f.manufacturer)
  // Movers whose speed channel goes slow to fast (a Hydrabeam), when SoundSwitch doesn't say.
  if (known?.speedRising) for (const h of heads) if (h.ch.moveSpeed && !h.moveSpeed) h.moveSpeed = RISING_SPEED
  // A Starburst's ball motor: its manual's speeds, when SoundSwitch doesn't give the ranges.
  if (known?.look === 'sphere') for (const h of heads) if (h.ch.rotation && !h.rotationSpin) h.rotationSpin = STARBURST_SPIN
  const spec =
    known ??
    (laserFixture && heads.every((h) => h.role === 'laser' || h.role === 'master')
      ? { look: 'laser' as const, size: LOOK_DEFAULTS.laser.size, beam: LOOK_DEFAULTS.laser.beam, output: 0.5, mount: 'hanging' as const, note: `${f.definition}: a laser. Its real size isn't known: set it in Fixture Studio.` }
      : heads.filter((h) => h.ch.tilt && !h.ch.pan).length === 2 && !heads.some((h) => h.ch.pan)
        ? twinBarSpec(f.definition)
        : pixelHeads > 1
          ? multiCellSpec(f.definition, pixelHeads)
        : specFor(f.definition, fixtureHasMover, f.manufacturer))
  const body: FixtureType['body'] = fixtureHasMover ? 'movingHead' : pixelHeads > 1 ? 'bar' : 'par'
  return {
    id: typeIdFor(f),
    name: `${f.definition} (${f.mode.name})`,
    manufacturer: f.manufacturer,
    channels,
    panRange: spec.pan ?? (fixtureHasMover ? 540 : 0),
    tiltRange: spec.tilt ?? (fixtureHasMover ? 270 : 0),
    zoomRange: spec.beam,
    maxSpeed: spec.speed ?? 0,
    candela: 1200 * spec.output,
    body,
    cells: Math.max(1, pixelHeads),
    source: 'SoundSwitch',
    heads,
    spec,
    lookGuessed: !known,
    ...(f.modes && f.modes.length > 1
      ? { family: { mode: Math.max(0, f.modes.findIndex((m) => m.name === f.mode.name)), soundswitch: { definitionId: f.definitionId, definition: f.definition, manufacturer: f.manufacturer, wheels: f.wheels, modes: f.modes } } }
      : {})
  }
}

/** A SoundSwitch fixture's type in another of its definition's modes. */
export function soundswitchModeType(family: NonNullable<FixtureType['family']>['soundswitch'] & object, mode: number): FixtureType {
  const { modes, ...definition } = family
  return fixtureTypeFromMode({ ...definition, mode: modes[mode], modes, universe: 0, address: 1 })
}

/** Two bars that only tilt, each on its own motor (8-beam spiders): drawn as such. */
function twinBarSpec(name: string): FixtureSpec {
  return { look: 'twinbar', size: LOOK_DEFAULTS.twinbar.size, pan: 0, tilt: 180, beam: LOOK_DEFAULTS.twinbar.beam, speed: 180, output: 0.35, leds: ledsFromName(name) ?? 8, mount: 'floor', note: `${name}: two tilting bars of LEDs. Its size isn't known: set it in Fixture Studio.` }
}

/** A believable look for a multi-cell fixture we have no spec for, from its name and cell count. */
export function multiCellSpec(name: string, cells: number): FixtureSpec {
  const look: LookKind = /stick|tube|pole/i.test(name) ? 'tube' : /retro|cluster|blinder|\bcob\b/i.test(name) ? 'cluster' : /panel|matrix|wall/i.test(name) ? 'panel' : 'bar'
  const size: [number, number, number] = look === 'bar' ? [Math.max(0.5, Math.min(1.2, cells * 0.08)), 0.1, 0.08] : LOOK_DEFAULTS[look].size
  return { look, size, beam: LOOK_DEFAULTS[look].beam, output: 0.6, leds: cells, mount: 'floor', note: `${name}: look worked out from its ${cells} cells. Choose its real look in Fixture Studio.` }
}

/** How a SoundSwitch fixture is recognised across syncs and in a show's fixture choice. */
export function soundswitchKeyOf(f: { universe: number; address: number; definition: string }): string {
  return `U${f.universe + 1}.${f.address} ${f.definition}`
}

/** A stable key, so a re-sync recognises the same fixture and keeps its position. */
export function syncKey(f: { universe: number; address: number; typeId: string }): string {
  return `${f.universe}:${f.address}:${f.typeId}`
}

function shortName(definition: string): string {
  const plain = plainName(definition)
  return plain.length > 26 ? plain.slice(0, 25).trim() + '…' : plain
}

export function projectFromSoundSwitch(fixtures: ImportedFixture[], current: Project, name: string): Project {
  const types = new Map<string, FixtureType>()
  for (const f of fixtures) {
    const type = fixtureTypeFromMode(f)
    types.set(type.id, type)
  }

  // Keep the positions and settings of fixtures we already know.
  const previous = new Map(current.fixtures.filter((f) => f.soundswitchKey).map((f) => [syncKey(f), f]))
  const typeOf = (f: SoundSwitchFixture) => types.get(typeIdFor(f))!
  const counts = new Map<string, number>()
  const layout = autoLayout(fixtures, typeOf)
  const place = (f: SoundSwitchFixture) => layout.get(f)!

  const imported: Fixture[] = fixtures.map((f) => {
    const typeId = typeIdFor(f)
    const key = syncKey({ universe: f.universe, address: f.address, typeId })
    const label = shortName(f.definition)
    const n = (counts.get(label) ?? 0) + 1
    counts.set(label, n)
    const old = previous.get(key)
    const base: Fixture = {
      id: `ss-${key}`,
      name: `${label} ${n}`,
      typeId,
      universe: f.universe,
      address: f.address,
      soundswitchKey: soundswitchKeyOf(f),
      group: f.group || undefined,
      ...place(f)
    }
    // Keep everything the user changed (name, position, inversion...), refresh the patch.
    // When the automatic layout itself improved, fixtures move to their new default spots.
    if (!old) return base
    // The patch and the group always come from SoundSwitch.
    const merged = { ...base, ...old, typeId, universe: f.universe, address: f.address, soundswitchKey: base.soundswitchKey, group: base.group }
    if ((current.layoutVersion ?? 1) < LAYOUT_VERSION) Object.assign(merged, place(f))
    return merged
  })

  // Fixtures you added yourself (copies, mirrors) stay. Copies of a SoundSwitch
  // fixture follow its patch while it's there (and keep their last patch if it isn't).
  const byKey = new Map(imported.map((f) => [f.soundswitchKey!, f]))
  const own = current.fixtures
    .filter((f) => !f.soundswitchKey)
    .map((f) => {
      const source = f.copyOf ? byKey.get(f.copyOf) : undefined
      return source ? { ...f, typeId: source.typeId, universe: source.universe, address: source.address, group: source.group } : f
    })
  const ownTypes = (current.fixtureTypes ?? []).filter((t) => own.some((f) => f.typeId === t.id) && !types.has(t.id))
  // Everything else in the project (camera positions...) is kept as it is.
  return { ...current, name, fixtures: [...imported, ...own], fixtureTypes: [...types.values(), ...ownTypes], layoutVersion: LAYOUT_VERSION }
}
