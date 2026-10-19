/**
 * Lasers in colour, the ADJ Starburst, fixtures facing out on the front of a truss,
 * and the party objects (TVs, screens, dance floor, balloon arch, photo booth, neon sign).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { useStore } from '../src/renderer/src/state/store'
import { addLibraryFixtures, addStructure, mountFixtures, moveFixtures } from '../src/renderer/src/state/commands'
import { defaultProject } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import { FT, footprint, heightOf, mountPoints, STRUCTURE_KINDS, STRUCTURE_PRESETS, type Structure } from '../src/renderer/src/model/structures'
import { fixtureTypeFromOfl, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { coloursFromName, decodeHeads, RAINBOW } from '../src/renderer/src/model/heads'
import { fixtureTypeFromMode } from '../src/renderer/src/model/soundswitchImport'
import type { SoundSwitchFixture } from '../src/shared/soundswitch'

const lib: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const ofl = (key: string, mode = 0) => fixtureTypeFromOfl(key, lib.manufacturers[key.split('/')[0]], lib.fixtures[key], mode)
const levels = (values: number[]) => {
  const u = new Uint8Array(512)
  u.set(values)
  return u
}
const state = () => useStore.getState().project

beforeEach(() => useStore.setState({ project: settle(defaultProject()), past: [], future: [], selection: [] }))

describe('Laser colours', () => {
  it('reads colours from names, several at once, in English and Dutch', () => {
    expect(coloursFromName('Red + Green')).toEqual([[1, 0, 0], [0, 1, 0]])
    expect(coloursFromName('lazer wit')).toEqual([[1, 1, 1]])
    expect(coloursFromName('groen')).toEqual([[0, 1, 0]])
    expect(coloursFromName('Multicolour')).toBe(RAINBOW)
    expect(coloursFromName('Pattern 3')).toEqual([])
  })

  it('a SoundSwitch laser whose colour wheel only names its colours', () => {
    const f = {
      definitionId: 1, definition: 'EL-900RGB', manufacturer: 'Laserworld', universe: 0, address: 1,
      wheels: { 'Wheel 1': [{ lo: 0, hi: 39, name: 'White' }, { lo: 40, hi: 79, name: 'Red/Green' }, { lo: 80, hi: 119, name: 'Multicolour' }] },
      mode: { name: 'Mode 1', channels: 9, heads: [], attributes: [
        { code: 0, name: 'laser uit', width: 1, coarse: 0, fine: 0 },
        { code: 2, name: 'Colour wheel', width: 1, coarse: 3, fine: 3, wheel: 'Wheel 1' }
      ] }
    } as unknown as SoundSwitchFixture
    const type = fixtureTypeFromMode(f)
    expect(type.spec!.look).toBe('laser')
    expect(type.spec!.apertures).toBe(4)
    const at = (colour: number) => decodeHeads(type, levels([200, 0, 0, colour]), 1, 0)[0]
    expect(at(10).colours).toBeUndefined()
    expect(at(50).colours).toEqual([[1, 0, 0], [0, 1, 0]])
    expect(at(100).colours).toBe(RAINBOW)
  })
})

describe('ADJ Starburst', () => {
  it('comes from the manual: 12 channels, six colours, the ball turning both ways', () => {
    const type = ofl('american-dj/starburst')
    expect(lib.fixtures['american-dj/starburst'].name).toBe('Starburst')
    expect(type.channels).toHaveLength(12)
    expect(type.spec!.look).toBe('sphere')
    const head = type.heads!.find((h) => h.ch.red)!
    expect(head.ch.rotation).toBeTruthy()
    const spin = (v: number) => decodeHeads(type, levels([255, 0, 0, 0, 0, 0, 10, 255, v]), 1, 0).find((s) => s.intensity > 0)!.rotation
    expect(spin(0)).toBe(0)
    expect(spin(40)).toBeGreaterThan(0)
    expect(spin(143)).toBe(0)
    expect(spin(250)).toBeLessThan(0)
  })
})

describe('Fixtures facing out on the front of a truss', () => {
  it('a Double Helix on the front of the crossbar faces out, and stays that way', () => {
    const truss = addStructure('goalpost', { width: 16 * FT, height: 10 * FT }, { at: [0, 0, -3] })
    const helix = ofl('beamz/double-helix-mhl820')
    const [a] = addLibraryFixtures(helix, 1)
    expect(mountFixtures([a], truss, 'frontOut')).toBe(true)
    const f = () => state().fixtures.find((x) => x.id === a)!
    expect(f().faceOut).toBe(true)
    expect(f().mounting).toBe('floor')
    // In front of the truss, at the crossbar's height.
    expect(f().position[2]).toBeGreaterThan(-3)
    expect(f().position[1]).toBeGreaterThan(2.5)
    // Moved under the crossbar instead: it hangs, and doesn't face out any more.
    mountFixtures([a], truss, 'under')
    expect(f().faceOut).toBeUndefined()
    expect(f().mounting).toBe('hanging')
  })

  it('every truss offers a facing-out place; dropping a fixture nearby never picks it by itself', () => {
    for (const kind of ['totem', 'goalpost', 'trussBox', 'groundTruss'] as const) {
      const s: Structure = { id: 'x', kind, name: '', position: [0, 0, 0], rotation: 0, params: {} }
      expect(mountPoints(s).some((m) => m.out), kind).toBe(true)
    }
    const totem = addStructure('totem', { height: 6 * FT }, { at: [5, 0, 0] })
    const [b] = addLibraryFixtures(ofl('beamz/double-helix-mhl820'), 1)
    moveFixtures([b], [5, 1.2, 0.2])
    const f = state().fixtures.find((x) => x.id === b)!
    if (f.mount) expect(f.mount.structure === totem && f.faceOut).toBeFalsy()
  })
})

describe('Party objects and screens', () => {
  it('each new object has a size, a height and a preset in the list', () => {
    for (const kind of ['tv', 'balloonArch', 'photoBooth', 'neonSign'] as const) {
      const s: Structure = { id: kind, kind, name: '', position: [0, 0, 0], rotation: 0, params: {} }
      expect(footprint(s).every((v) => v > 0), kind).toBe(true)
      expect(heightOf(s), kind).toBeGreaterThan(0)
      expect(STRUCTURE_PRESETS.some((p) => p.kind === kind), kind).toBe(true)
    }
    expect(STRUCTURE_KINDS.danceFloor.category).toBe('Party')
    expect(STRUCTURE_KINDS.tv.fields.some((f) => f.kind === 'content')).toBe(true)
    expect(STRUCTURE_KINDS.screen.fields.some((f) => f.kind === 'content')).toBe(true)
    expect(STRUCTURE_KINDS.ledWall.fields.some((f) => f.kind === 'content')).toBe(true)
  })

  it('a TV stands on the floor, its screen at the height you set', () => {
    const tv = addStructure('tv', { size: 65, bottom: 3 * FT, content: 'text', text: 'Happy Birthday' }, { at: [9, 0, 6] })
    const s = state().structures!.find((x) => x.id === tv)!
    expect(s.position[1]).toBe(0)
    expect(heightOf(s)).toBeGreaterThan(3 * FT + 0.7)
    expect(s.params.text).toBe('Happy Birthday')
  })
})
