import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../src/renderer/src/state/store'
import { chooseFromText, createShowFromSoundSwitch, rowsFor, planSummary } from '../src/renderer/src/state/newShow'
import { followSoundSwitch, syncFromSoundSwitch } from '../src/renderer/src/state/commands'
import { useSoundSwitch } from '../src/renderer/src/state/soundswitchLink'
import { defaultProject } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import type { SoundSwitchFixture } from '../src/shared/soundswitch'

const attr = (name: string, coarse: number, code = 1) => ({ code, name, width: 1, coarse, fine: coarse })
function fixture(definition: string, universe: number, address: number, kind: 'mover' | 'wash' | 'tube'): SoundSwitchFixture {
  const attributes =
    kind === 'mover'
      ? [{ code: 3, name: 'Pan', width: 1, coarse: 0, fine: 0 }, { code: 4, name: 'Tilt', width: 1, coarse: 1, fine: 1 }, attr('Dimmer', 2), attr('Red', 3, 14)]
      : kind === 'tube'
        ? Array.from({ length: 8 }, (_, c) => [attr(`Red ${c + 1}`, c * 3, 14), attr(`Green ${c + 1}`, c * 3 + 1, 15), attr(`Blue ${c + 1}`, c * 3 + 2, 16)]).flat()
        : [attr('Red', 0, 14), attr('Green', 1, 15), attr('Blue', 2, 16), attr('Dimmer', 3)]
  const heads = kind === 'tube' ? Array.from({ length: 8 }, (_, c) => ({ name: `Cell ${c + 1}`, attributes: [c * 3, c * 3 + 1, c * 3 + 2] })) : []
  return { definitionId: 1, definition, manufacturer: 'Both Lighting', universe, address, wheels: {}, mode: { name: 'Mode', channels: attributes.length, attributes, heads } }
}
// A SoundSwitch project: two movers, four IR4s at different addresses, and a tube.
const venue = [
  fixture('BPM-Spots', 0, 1, 'mover'),
  fixture('BPM-Spots', 0, 23, 'mover'),
  ...[60, 70, 80, 90].map((a) => fixture('IR4 Uplight', 0, a, 'wash')),
  fixture('360 Tube', 1, 1, 'tube')
]
const project = () => useStore.getState().project

beforeEach(() => useStore.setState({ project: settle(defaultProject()), past: [], future: [], selection: [] }))

describe('choosing fixtures by saying it', () => {
  it('reads counts, copies, places and leaving things out', () => {
    const { rows, understood, standFt } = chooseFromText('two copies of the movers on 6 ft totems, two of the IR4s, skip the tubes', rowsFor(venue))
    const by = (d: string) => rows.filter((r) => r.fixture.definition === d)
    expect(by('BPM-Spots').every((r) => r.include && r.count === 2 && r.where === 'totems')).toBe(true)
    expect(by('IR4 Uplight').filter((r) => r.include).length).toBe(2)
    expect(by('360 Tube')[0].include).toBe(false)
    expect(standFt).toBe(6)
    expect(understood.length).toBe(3)
    expect(planSummary(rows)).toEqual({ patches: 4, fixtures: 6, copies: 2, universes: 1 })
  })

  it('matches model names however they are written', () => {
    const { rows } = chooseFromText('just the ir-4s', rowsFor(venue))
    expect(rows.filter((r) => r.include).map((r) => r.fixture.definition)).toEqual(['IR4 Uplight', 'IR4 Uplight', 'IR4 Uplight', 'IR4 Uplight'])
  })
})

describe('a new show from SoundSwitch', () => {
  it('brings in only the chosen fixtures, with copies on the same patch, placed and mirrored', () => {
    const { rows } = chooseFromText('two copies of the movers on totems, the ir4s on the floor at the front', rowsFor(venue))
    const pastBefore = useStore.getState().past.length
    createShowFromSoundSwitch({ name: 'Small show', room: 'basic', profile: { name: 'My Rig', path: '/x' }, rows, mirrorPairs: true, standFt: 6 })
    const p = project()
    expect(p.name).toBe('Small show')
    expect(p.soundswitch).toMatchObject({ link: true, profile: 'My Rig' })
    // 2 movers × 2 + 4 IR4s; the tube and the default demo rig aren't there.
    expect(p.fixtures.length).toBe(8)
    const movers = p.fixtures.filter((f) => f.name.startsWith('BPM-Spots'))
    expect(movers.length).toBe(4)
    // Each copy shares its original's patch.
    for (const c of movers.filter((f) => f.copyOf)) {
      const original = movers.find((f) => f.soundswitchKey === c.copyOf)!
      expect([c.universe, c.address]).toEqual([original.universe, original.address])
    }
    // Every mover on its own totem, half of them on each side, the right-hand ones pan inverted.
    const totems = new Set(movers.map((f) => f.mount?.structure))
    expect(totems.size).toBe(4)
    expect(movers.filter((f) => f.position[0] > 0).every((f) => f.invertPan)).toBe(true)
    expect(movers.filter((f) => f.position[0] < 0).every((f) => !f.invertPan)).toBe(true)
    // One undo step.
    expect(useStore.getState().past.length).toBe(pastBefore + 1)
  })

  it('later syncs keep to the chosen fixtures, and copies follow a patch change', () => {
    const { rows } = chooseFromText('two copies of the movers', rowsFor(venue))
    createShowFromSoundSwitch({ name: 'S', room: 'basic', profile: { name: 'My Rig', path: '/x' }, rows, mirrorPairs: false, standFt: 6 })
    expect(project().fixtures.length).toBe(4)
    // SoundSwitch: the first mover moved to address 101, and the whole venue arrives.
    const moved = venue.map((f) => (f.address === 1 && f.definition === 'BPM-Spots' ? { ...f, address: 101 } : f))
    syncFromSoundSwitch(moved, 'My Rig')
    // The moved mover isn't one of the chosen any more (pick it again to bring it back); its copy is kept.
    expect(project().fixtures.length).toBe(3)
    syncFromSoundSwitch(venue, 'My Rig')
    expect(project().fixtures.length).toBe(4)
    // Another SoundSwitch project being opened doesn't touch this show.
    syncFromSoundSwitch([fixture('Other', 0, 1, 'wash')], 'Someone else')
    expect(project().fixtures.length).toBe(4)
  })

  it('a show from scratch ignores SoundSwitch', () => {
    syncFromSoundSwitch(venue, 'My Rig')
    expect(project().fixtures.every((f) => !f.soundswitchKey)).toBe(true)
  })

  it('switching the show to the project SoundSwitch has open replaces the old project\'s fixtures', () => {
    const { rows } = chooseFromText('two copies of the movers', rowsFor(venue))
    createShowFromSoundSwitch({ name: 'S', room: 'basic', profile: { name: 'My Rig', path: '/x' }, rows, mirrorPairs: false, standFt: 6 })
    const other = [fixture('Other wash', 0, 200, 'wash'), fixture('Other wash', 0, 210, 'wash')]
    useSoundSwitch.setState({ status: { state: 'linked', project: '/y/Club.ssproj', name: 'Club', how: 'open in SoundSwitch', fixtures: other, skipped: 0 } })
    // Following "My Rig", the open "Club" project is left alone…
    syncFromSoundSwitch(other, 'Club')
    expect(project().fixtures.length).toBe(4)
    // …until you switch: its fixtures replace My Rig's (copies included), in one undo step.
    const steps = useStore.getState().past.length
    followSoundSwitch('Club', other)
    expect(useStore.getState().past.length).toBe(steps + 1)
    expect(project().soundswitch).toMatchObject({ link: true, profile: 'Club' })
    expect(project().fixtures.map((f) => f.name).sort()).toEqual(['Other wash 1', 'Other wash 2'])
    expect(project().name).toBe('S')
    useStore.getState().undo()
    expect(project().soundswitch).toMatchObject({ profile: 'My Rig' })
    expect(project().fixtures.length).toBe(4)
  })
})
