/**
 * Fixtures drawn and patched like the real ones: a colleague's show with a Double Helix,
 * a SparkleWall, a Laserworld laser and a 12x12 PAR, all patched in SoundSwitch.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fixtureTypeFromOfl, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { decodeHeads } from '../src/renderer/src/model/heads'
import { ledsFromName, catalogSpec } from '../src/renderer/src/model/catalog'
import { roundLayout } from '../src/renderer/src/three/fixtureRig'
import { modeChannels, type SoundSwitchFixture } from '../src/shared/soundswitch'
import { colourFromName, fixtureTypeFromMode } from '../src/renderer/src/model/soundswitchImport'
import { patchProblems, sharedInSoundSwitch } from '../src/renderer/src/model/patchCheck'
import { blankProject, type Fixture } from '../src/renderer/src/model/project'
import { registerFixtureTypes } from '../src/renderer/src/model/fixtureTypes'
import { expandDef } from '../src/renderer/src/model/qxf'
import { typeFromDef } from '../src/renderer/src/model/fixtureDef'

const lib: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const qlc = JSON.parse(readFileSync('resources/library/qlcplus.json', 'utf8'))
const ofl = (key: string, mode: number) => fixtureTypeFromOfl(key, lib.manufacturers[key.split('/')[0]], lib.fixtures[key], mode)
const levels = (address: number, values: number[]) => {
  const u = new Uint8Array(512)
  values.forEach((v, i) => (u[address - 1 + i] = v))
  return u
}

describe('How many LEDs a fixture has', () => {
  it('reads the count from the name', () => {
    expect(ledsFromName('Par RGBWAU 12x12 (6 Channel Mode)')).toBe(12)
    expect(ledsFromName('Double Helix 8x3W RGBW')).toBe(8)
    expect(ledsFromName('Wash 18 x 10W')).toBe(18)
    expect(ledsFromName('SparkleWall LED36 RGBW 2x1m')).toBe(36)
    expect(ledsFromName('Curtain 3 x 2 m')).toBeUndefined()
    expect(ledsFromName('EL-900RGB')).toBeUndefined()
  })

  it('lays a round PAR face out in rings', () => {
    const twelve = roundLayout(12, 0.1)
    expect(twelve.points).toHaveLength(12)
    expect(twelve.points.filter(([x, y]) => Math.hypot(x, y) < 0.06)).toHaveLength(4)
    expect(roundLayout(7, 0.1).points).toHaveLength(7)
    expect(roundLayout(18, 0.1).points).toHaveLength(18)
  })
})

describe('Patch problems and SoundSwitch', () => {
  const par = { ...ofl('event-lighting/par12x12', 2), id: 'par6' }
  const mover = { ...par, id: 'mover', channels: new Array(15).fill('reserved') }
  registerFixtureTypes([par, mover])
  const fx = (id: string, typeId: string, address: number, ss: boolean): Fixture => ({ id, name: id, typeId, universe: 0, address, position: [0, 0, 0], mounting: 'floor', aimTilt: 0, ...(ss ? { soundswitchKey: `U1.${address} ${typeId}` } : {}) })

  it('leaves SoundSwitch’s own patch alone, and says so quietly', () => {
    const p = { ...blankProject(), fixtures: [fx('a', 'mover', 96, true), fx('b', 'par6', 100, true)] }
    expect(patchProblems(p)).toHaveLength(0)
    expect(sharedInSoundSwitch(p)).toHaveLength(1)
  })

  it('still reports a clash with a fixture added here', () => {
    const p = { ...blankProject(), fixtures: [fx('a', 'mover', 96, true), fx('b', 'par6', 100, false)] }
    expect(patchProblems(p)).toHaveLength(1)
  })

  it('takes a mode’s channel count from its name when the stored count disagrees', () => {
    expect(modeChannels('6 Channel Mode', 66, 5)).toBe(6)
    expect(modeChannels('8ch', 0, 7)).toBe(8)
    expect(modeChannels('Pixel Mode', 0, 35)).toBe(36)
    // The name can't be fewer channels than the attributes use.
    expect(modeChannels('6 Channel Mode', 12, 11)).toBe(12)
  })
})

describe('Lasers change colour', () => {
  it('the Laserworld EL-900RGB: off below 50, then the colour channel picks the colour', () => {
    const type = ofl('laserworld/el-900rgb', 0)
    expect(type.spec!.look).toBe('laser')
    expect(type.heads![0].role).toBe('laser')
    const at = (mode: number, colour: number) => decodeHeads(type, levels(1, [mode, 0, 0, colour]), 1, 0)[0]
    expect(at(0, 245).intensity).toBe(0)
    expect(at(120, 245).color).toEqual([0, 0, 1])
    expect(at(120, 170).color).toEqual([1, 0, 0])
    expect(at(120, 50).color).toEqual([1, 1, 0])
  })

  it('reads colours SoundSwitch gives only as named ranges', () => {
    expect(colourFromName('Red + Green')).toEqual([1, 1, 0])
    expect(colourFromName('Cyan color')).toEqual([0, 1, 1])
    const fixture: SoundSwitchFixture = {
      definitionId: 3, definition: 'EL-900RGB', manufacturer: 'Laserworld', universe: 0, address: 1, wheels: {},
      mode: {
        name: '9CH', channels: 9, heads: [],
        attributes: [
          { code: 0, name: 'Mode', width: 1, coarse: 0, fine: 0 },
          { code: 2, name: 'Color', width: 1, coarse: 3, fine: 3, ranges: [{ lo: 0, hi: 39, name: 'White' }, { lo: 160, hi: 199, name: 'Red' }, { lo: 240, hi: 255, name: 'Blue' }] },
          { code: 3, name: 'X', width: 1, coarse: 4, fine: 4 },
          { code: 4, name: 'Y', width: 1, coarse: 5, fine: 5 }
        ]
      }
    }
    const type = fixtureTypeFromMode(fixture)
    expect(type.spec!.look).toBe('laser')
    expect(type.heads![0].role).toBe('laser')
    expect(type.panRange).toBe(0)
    expect(decodeHeads(type, levels(1, [100, 0, 0, 250]), 1, 0)[0].color).toEqual([0, 0, 1])
  })

  it('the QLC+ EL-900RGB is replaced by the one from the manual', () => {
    expect(qlc.fixtures['qlc/Laserworld/Laserworld-EL-900RGB']).toBeUndefined()
  })
})

describe('BeamZ Double Helix (MHL820)', () => {
  it('has two heads that tilt on their own, 135°', () => {
    const type = ofl('beamz/double-helix-mhl820', 3) // 16 channels
    expect(type.channels).toHaveLength(16)
    expect(type.spec!.look).toBe('twinbar')
    expect(type.tiltRange).toBe(135)
    const tilting = type.heads!.filter((h) => h.ch.tilt)
    expect(tilting).toHaveLength(2)
    expect(tilting.every((h) => h.ch.red && h.ch.white)).toBe(true)
  })

  it('lights each LED with its own channel (16 channels: head 2 blue only)', () => {
    const type = ofl('beamz/double-helix-mhl820', 3)
    // tilt1 tilt2, head1 RGBW, head2 RGBW, show, speed, strobe, dimmer, dimmer mode, special
    const states = decodeHeads(type, levels(1, [128, 128, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0]), 1, 0)
    const heads = type.heads!
    const h2 = states[heads.findIndex((h) => h.name === 'Head 2')]
    expect(h2.mix).toEqual([0, 0, 1, 0])
    expect(h2.intensity).toBeCloseTo(1)
  })

  it('9 channels: both heads share one colour', () => {
    const type = ofl('beamz/double-helix-mhl820', 0)
    expect(type.channels).toHaveLength(9)
    expect(type.heads!.filter((h) => h.ch.tilt)).toHaveLength(2)
    expect(type.heads!.filter((h) => h.ch.red)).toHaveLength(1)
  })

  it('SoundSwitch’s Double Helix gets the same look', () => {
    expect(catalogSpec('BeamZ Double Helix MHL820')?.look).toBe('twinbar')
  })
})

describe('BeamZ SparkleWall (151.202)', () => {
  it('is an LED curtain, not a GigBar', () => {
    const type = ofl('beamz/sparklewall-led36', 0)
    expect(type.channels).toHaveLength(8)
    expect(type.spec!.look).toBe('curtain')
    expect(type.spec!.leds).toBe(36)
    expect(type.spec!.size).toEqual([2, 1, 0.02])
    expect(qlc.fixtures['qlc/beamZ/beamZ-SparkleWall'].l.shape).toBe('curtain')
    const def = expandDef(qlc.fixtures['qlc/beamZ/beamZ-SparkleWall'], 'qlc-sparklewall', { kind: 'library', label: 'QLC+', url: '' })
    expect(typeFromDef(def, 0).spec!.look).toBe('curtain')
  })
})

describe('Equinox Fusion Orbit MKII (from the manual)', () => {
  const def = () => expandDef(qlc.fixtures['qlc/Equinox/Equinox-Fusion-Orbit-MKII'], 'qlc-orbit', { kind: 'library', label: 'QLC+', url: '' })
  const at = (mode: number, values: number[], time = 0) => {
    const type = typeFromDef(def(), mode)
    return { type, states: decodeHeads(type, levels(1, values), 1, time) }
  }

  it('has the 2, 7, 16 and 37 channel modes', () => {
    expect(def().modes.map((m) => m.channels.length)).toEqual([2, 7, 16, 37])
    expect(qlc.entries.find((e: { key: string }) => e.key === 'qlc/Equinox/Equinox-Fusion-Orbit-MKII').modes.map((m: { channels: number }) => m.channels)).toEqual([2, 7, 16, 37])
  })

  it('16 channels: pans and tilts, and the beam is the head itself, in RGBW', () => {
    const { type, states } = at(2, [255, 0, 255, 255, 0, 255, 0, 0, 0])
    expect(type.body).toBe('movingHead')
    expect(type.panRange).toBe(540)
    expect(type.tiltRange).toBe(210)
    const beam = states[0]
    expect(beam.pan).toBeCloseTo(270)
    expect(beam.tilt).toBeCloseTo(-105)
    expect(beam.intensity).toBeCloseTo(1)
    expect(beam.color).toEqual([1, 0, 0])
    // The ring is its own part round the lens.
    expect(type.heads![1].role).toBe('halo')
  })

  it('37 channels: fine pan and tilt, and the ring in six segments under one ring dimmer', () => {
    const v = new Array(37).fill(0)
    v[0] = 128; v[2] = 128; v[5] = 255; v[8] = 255 // pan, tilt at centre; beam red
    v[12] = 255 // ring dimmer
    v[17] = 255 // ring segment 1 red (channel 18)
    v[24] = 255 // ring segment 3 green (channel 25)
    const { type, states } = at(3, v)
    const ring = type.heads!.filter((h) => h.role === 'halo')
    expect(ring.map((h) => h.name)).toEqual(['Ring 1', 'Ring 2', 'Ring 3', 'Ring 4', 'Ring 5', 'Ring 6'])
    expect(type.heads![0].ch.pan!.fine).toBe(1)
    const seg = (n: number) => states[type.heads!.findIndex((h) => h.name === `Ring ${n}`)]
    expect(seg(1).color).toEqual([1, 0, 0])
    expect(seg(1).intensity).toBeCloseTo(1)
    expect(seg(3).color).toEqual([0, 1, 0])
    // The ring dimmer at 0 turns every segment off.
    v[12] = 0
    const off = at(3, v)
    expect(off.states.filter((_, i) => off.type.heads![i].role === 'halo').every((s) => s.intensity === 0)).toBe(true)
  })

  it('7 channels: moves on its own in its pan/tilt programs, still with the program off', () => {
    const moving = [at(1, [40, 255, 30], 1).states[0], at(1, [40, 255, 30], 3).states[0]]
    expect(moving[0].pan).not.toBeCloseTo(moving[1].pan)
    const still = at(1, [0, 255, 30], 3).states[0]
    expect(still.pan).toBe(0)
    expect(still.color).toEqual([1, 0, 0]) // colour macro 2: red
  })

  it('2 channels: the shows move the head too (not show 4, which faces forward)', () => {
    expect(at(0, [40, 0], 2).states[0].pan).not.toBe(0)
    expect(at(0, [180, 0], 2).states[0].pan).toBe(0)
  })

  it('SoundSwitch’s Fusion Orbit gets the same look', () => {
    expect(catalogSpec('Equinox Fusion Orbit MKII')).toMatchObject({ look: 'mover', halo: true, pan: 540, tilt: 210 })
  })
})
