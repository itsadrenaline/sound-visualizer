/** Deleting a fixture that came from SoundSwitch: it stays deleted, in this show. */
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../src/renderer/src/state/store'
import { deleteFixtures, restoreSoundSwitchFixtures, syncFromSoundSwitch } from '../src/renderer/src/state/commands'
import { blankProject } from '../src/renderer/src/model/project'
import type { SoundSwitchFixture } from '../src/shared/soundswitch'

const fixture = (address: number, definition: string): SoundSwitchFixture => ({
  definitionId: address, definition, manufacturer: 'Test', universe: 0, address, wheels: {},
  mode: { name: 'Mode 1', channels: 4, heads: [], attributes: [{ code: 1, name: 'Dimmer', width: 1, coarse: 0, fine: 0 }, { code: 14, name: 'Red', width: 1, coarse: 1, fine: 1 }] }
})
const venue = [fixture(1, 'Entour Faze'), fixture(10, 'EL-900RGB'), fixture(20, 'HYDRABEAM 400')]
const names = () => useStore.getState().project.fixtures.map((f) => f.name.replace(/ \d+$/, ''))

beforeEach(() => {
  // A show saved under its own name, following the SoundSwitch project "Alle lampen".
  useStore.setState({ project: { ...blankProject(), name: 'IMPORTED show', soundswitch: { link: true, profile: 'Alle lampen' } }, past: [], future: [], selection: [] })
  syncFromSoundSwitch(venue, 'Alle lampen')
})

describe('Deleting SoundSwitch fixtures', () => {
  it('stays deleted when SoundSwitch syncs again, whatever the show is called', () => {
    expect(names()).toHaveLength(3)
    const el = useStore.getState().project.fixtures.find((f) => f.name.startsWith('EL-900'))!
    deleteFixtures([el.id])
    syncFromSoundSwitch(venue, 'Alle lampen')
    syncFromSoundSwitch(venue, 'Alle lampen')
    expect(names()).toEqual(['Entour Faze', 'HYDRABEAM 400'])
    expect(useStore.getState().project.soundswitch!.exclude).toEqual(['U1.10 EL-900RGB'])
  })

  it('Undo brings it back, and so does "Bring back deleted"', () => {
    const el = useStore.getState().project.fixtures.find((f) => f.name.startsWith('EL-900'))!
    deleteFixtures([el.id])
    useStore.getState().undo()
    syncFromSoundSwitch(venue, 'Alle lampen')
    expect(names()).toHaveLength(3)
    deleteFixtures([useStore.getState().project.fixtures.find((f) => f.name.startsWith('EL-900'))!.id])
    restoreSoundSwitchFixtures()
    syncFromSoundSwitch(venue, 'Alle lampen')
    expect(names()).toHaveLength(3)
  })
})
