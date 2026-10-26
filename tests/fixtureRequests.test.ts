/**
 * Fixtures and fixes colleagues asked for: the ADJ Focus Spot 4Z and Ayra ERO 706 from
 * their manuals, fixture files written by an AI, and clearing old fixtures out of the Library.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fixtureTypeFromOfl, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { decodeHeads } from '../src/renderer/src/model/heads'
import { fixtureTypeFromMode } from '../src/renderer/src/model/soundswitchImport'
import { readFixtureFile } from '../src/renderer/src/model/fixtureFiles'
import { typeFromDef } from '../src/renderer/src/model/fixtureDef'
import { useLibrary } from '../src/renderer/src/state/library'

const lib: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const qlc = JSON.parse(readFileSync('resources/library/qlcplus.json', 'utf8'))
const ofl = (key: string, mode: number) => fixtureTypeFromOfl(key, lib.manufacturers[key.split('/')[0]], lib.fixtures[key], mode)
const levels = (values: number[]) => {
  const u = new Uint8Array(512)
  values.forEach((v, i) => (u[i] = v))
  return u
}

describe('ADJ Focus Spot 4Z (from the manual)', () => {
  it('has Basic 16, Standard 18 and Extended 22 channels, and replaces the QLC+ version', () => {
    expect(lib.fixtures['american-dj/focus-spot-4z'].modes.map((m) => m.channels.length)).toEqual([16, 18, 22])
    expect(qlc.fixtures['qlc/American_DJ/American-DJ-Focus-Spot-4Z']).toBeUndefined()
    expect(qlc.entries.some((e: { key: string }) => e.key === 'qlc/American_DJ/American-DJ-Focus-Spot-4Z')).toBe(false)
  })

  it('16 channels: pan, tilt, red on the colour wheel, a gobo, open shutter, prism and zoom', () => {
    const type = ofl('american-dj/focus-spot-4z', 0)
    expect(type.body).toBe('movingHead')
    expect([type.panRange, type.tiltRange]).toEqual([540, 270])
    // Pan, Tilt, Colour (red), Gobo 2, Gobo rotation, Shutter open, Dimmer, Prism 1 in.
    const [beam] = decodeHeads(type, levels([255, 0, 10, 25, 0, 40, 255, 100]), 1, 0)
    expect(beam.pan).toBeCloseTo(270)
    expect(beam.intensity).toBeCloseTo(1)
    expect(beam.color).toEqual([1, 0, 0])
    expect(beam.gobo).toBeGreaterThan(0)
    expect(beam.prism).toBe(true)
    // The shutter's first range is closed.
    expect(decodeHeads(type, levels([0, 0, 0, 0, 0, 10, 255]), 1, 0)[0].intensity).toBe(0)
  })

  it('22 channels: 16-bit pan, tilt, dimmer and zoom', () => {
    const type = ofl('american-dj/focus-spot-4z', 2)
    const h = type.heads![0]
    expect(h.ch.pan).toEqual({ coarse: 0, fine: 1 })
    expect(h.ch.dimmer).toEqual({ coarse: 8, fine: 9 })
    expect(h.ch.zoom?.fine).toBe(18)
  })
})

describe('Ayra ERO 706 (from the manual)', () => {
  it('11 channels: a seven-LED wash mover in RGBWA+UV', () => {
    const type = ofl('ayra/ero-706', 0)
    expect(type.spec).toMatchObject({ look: 'moverWash', leds: 7 })
    expect([type.panRange, type.tiltRange]).toEqual([540, 220])
    // Pan, Tilt, Shutter open, Red, Green, Blue, White, Amber, UV, Dimmer.
    const [beam] = decodeHeads(type, levels([128, 128, 255, 0, 0, 255, 0, 0, 0, 255]), 1, 0)
    expect(beam.intensity).toBeCloseTo(1)
    expect(beam.color[2]).toBeGreaterThan(0.9)
    expect(beam.color[0]).toBeLessThan(0.1)
    // Shutter at 0 is closed.
    expect(decodeHeads(type, levels([128, 128, 0, 255, 0, 0, 0, 0, 0, 255]), 1, 0)[0].intensity).toBe(0)
  })

  it('15 channels add fine pan/tilt and speed', () => {
    const h = ofl('ayra/ero-706', 1).heads![0]
    expect(h.ch.pan).toEqual({ coarse: 0, fine: 1 })
    expect(h.ch.moveSpeed).toEqual({ coarse: 4 })
    expect(h.ch.uv).toEqual({ coarse: 12 })
  })

  it('from SoundSwitch, channels named like the manual ("Dimmer Red 0-100%") still drive its colours', () => {
    const names = ['Pan movement', 'Tilt movement', 'Shutter/strobe channel', 'Dimmer Red 0-100%', 'Dimmer green 0-100%', 'Dimmer blue 0-100%', 'Dimmer White 0-100%', 'Dimmer Amber 0-100%', 'Dimmer UV 0-100%', 'Master dimmer 0-100%']
    const attributes = names.map((name, i) => ({ name, code: i < 2 ? 3 + i : 999, coarse: i, width: 1 }))
    const type = fixtureTypeFromMode({ definitionId: 1, definition: 'ERO 706', manufacturer: 'Ayra', universe: 0, address: 1, wheels: {}, mode: { name: '11CH', channels: names.length, attributes, heads: [] } } as never)
    expect(Object.keys(type.heads![0].ch).sort()).toEqual(['amber', 'blue', 'dimmer', 'green', 'pan', 'red', 'shutter', 'tilt', 'uv', 'white'])
    expect(type.spec).toMatchObject({ look: 'moverWash', leds: 7 })
  })
})

describe('Fixture files written by an AI', () => {
  const file = {
    name: 'Focus Spot 4Z',
    manufacturer: 'ADJ',
    categories: ['Moving Head'],
    availableChannels: {
      Pan: { fineChannelAliases: ['Pan Fine'], capability: { type: 'Pan', angleStart: '0deg', angleEnd: '540deg' } },
      Tilt: { capability: { type: 'Tilt', angleStart: '0deg', angleEnd: '270deg' } },
      Dimmer: { capability: { type: 'Intensity' } }
    },
    // Several channels the file never describes: a common slip.
    modes: [{ name: '8-channel', channels: ['Pan', 'Pan Fine', 'Tilt', 'Dimmer', 'Gobo Wheel', 'Prism 1 Rotation', 'Pan/Tilt Speed', 'Dim Curve'] }]
  }
  const read = () => readFixtureFile('focus-spot-4z.json', new TextEncoder().encode(JSON.stringify(file)))

  it('opens in Fixture Studio with its maker, and its undescribed channels guessed from their names', () => {
    const { def, report } = read()
    expect(def.manufacturer).toBe('ADJ')
    expect(def.source.kind).toBe('file')
    const fns = def.modes[0].channels.map((c) => c.fn)
    expect(fns.slice(4, 7)).toEqual(['gobo', 'prismRotation', 'panTiltSpeed'])
    expect(def.modes[0].channels[4].confidence).toBe('guessed')
    expect(def.modes[0].channels[7].confidence).toBe('missing')
    expect(report.join(' ')).toMatch(/guessed from their names/)
    expect(report.join(' ')).toMatch(/Dim Curve/)
    // And it works as a fixture.
    expect(typeFromDef(def, 0).heads![0].ch.gobo).toEqual({ coarse: 4 })
  })
})

describe('Clearing old fixtures out of the Library', () => {
  beforeEach(() => useLibrary.setState({ recent: ['mine/a', 'ofl/b', 'ofl/c'], mine: [{ id: 'a' } as never], entries: [{ key: 'mine/a', source: 'mine' } as never, { key: 'ofl/b' } as never], defs: {} }))

  it('takes one fixture off Recent, or clears it', () => {
    useLibrary.getState().forgetRecent('ofl/b')
    expect(useLibrary.getState().recent).toEqual(['mine/a', 'ofl/c'])
    useLibrary.getState().forgetRecent()
    expect(useLibrary.getState().recent).toEqual([])
  })

  it('deletes one of My Fixtures, from the list and from Recent', async () => {
    await useLibrary.getState().deleteMine('mine/a')
    const s = useLibrary.getState()
    expect(s.mine).toEqual([])
    expect(s.entries.map((e) => e.key)).toEqual(['ofl/b'])
    expect(s.recent).toEqual(['ofl/b', 'ofl/c'])
  })
})

describe('Library search', () => {
  it('finds American DJ fixtures by "ADJ"', async () => {
    const { searchLibrary } = await import('../src/renderer/src/state/library')
    const entries = [{ key: 'american-dj/focus-spot-4z', manufacturer: 'American DJ', name: 'Focus Spot 4Z', categories: ['Moving Head'], modes: [] }] as never
    expect(searchLibrary(entries, 'ADJ Focus Spot 4', 'all')).toHaveLength(1)
  })
})
