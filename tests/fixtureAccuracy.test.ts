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
