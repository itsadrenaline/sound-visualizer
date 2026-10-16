import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../src/renderer/src/state/store'
import { createShowFromSoundSwitch, rowsFor } from '../src/renderer/src/state/newShow'
import { defaultProject } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import type { SoundSwitchFixture, SoundSwitchAttribute } from '../src/shared/soundswitch'

const attr = (name: string, code: number, coarse: number): SoundSwitchAttribute => ({ code, name, width: 1, coarse, fine: coarse })
const fx = (definition: string, address: number, attributes: SoundSwitchAttribute[], heads: SoundSwitchFixture['mode']['heads'] = [], universe = 0): SoundSwitchFixture => ({
  definitionId: address, definition, manufacturer: 'X', universe, address, wheels: {}, mode: { name: `${attributes.length}ch`, channels: attributes.length, attributes, heads }
})

beforeEach(() => useStore.setState({ project: settle(defaultProject()), past: [], future: [], selection: [] }))

describe('a new show from SoundSwitch with every kind of fixture', () => {
  // 1.4.0 and 1.4.1 left lasers, derbies, strobes and matrix panels without a place, and making
  // the show failed: an empty show, and a Create show button that did nothing.
  it('places lasers, derbies, strobes, matrices and the rest', () => {
    const cells = Array.from({ length: 16 }, (_, c) => ({ name: `Cell ${c + 1}`, attributes: [c * 3, c * 3 + 1, c * 3 + 2] }))
    const venue = [
      fx('EL-900RGB', 190, [attr('Laser Mode', 0, 0), attr('Laser Pattern', 0, 1), attr('Red', 14, 2)]),
      fx('Derby', 300, [attr('Rotation', 82, 0), attr('Red', 14, 1)], [{ name: 'Derby', attributes: [0, 1] }]),
      fx('Strobe', 320, [attr('Shutter', 41, 0)], [{ name: 'Strobe', attributes: [0] }]),
      fx('Dotz Matrix', 237, cells.flatMap((_, c) => [attr(`Red ${c}`, 14, c * 3), attr(`Green ${c}`, 15, c * 3 + 1), attr(`Blue ${c}`, 16, c * 3 + 2)]), cells),
      fx('Mover', 1, [attr('Pan', 3, 0), attr('Tilt', 4, 1), attr('Dimmer', 1, 2)], [], 1)
    ]
    const rows = rowsFor(venue)
    expect(() => createShowFromSoundSwitch({ name: 'Club', room: 'basic', profile: { name: 'Club', path: '/x' }, rows, mirrorPairs: true, standFt: 6 })).not.toThrow()
    const p = useStore.getState().project
    expect(p.fixtures.length).toBe(venue.length)
    expect(p.fixtures.every((f) => f.position.every(Number.isFinite))).toBe(true)
  })
})
