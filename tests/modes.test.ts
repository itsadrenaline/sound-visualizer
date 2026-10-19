/** Every DMX mode a fixture comes in: switch between them, and open them all in Fixture Studio. */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { useStore } from '../src/renderer/src/state/store'
import { useLibrary } from '../src/renderer/src/state/library'
import { useStudio } from '../src/renderer/src/state/studio'
import { addLibraryFixtures } from '../src/renderer/src/state/commands'
import { familyOf, modeChoices, setFixtureMode } from '../src/renderer/src/state/modes'
import { defaultProject } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import { decodeHeads } from '../src/renderer/src/model/heads'
import { fixtureTypeFromOfl, libraryIndex, oflModeChannelNames, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { fixtureTypeFromMode } from '../src/renderer/src/model/soundswitchImport'
import { getFixtureType, registerFixtureTypes } from '../src/renderer/src/model/fixtureTypes'
import { MODE_NAME, type SoundSwitchFixture, type SoundSwitchMode } from '../src/shared/soundswitch'

const lib: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const HYDRA = 'cameo/hydrabeam-400-rgbw'
const hydrabeam = (mode: number) => fixtureTypeFromOfl(HYDRA, 'Cameo', lib.fixtures[HYDRA], mode)
const state = () => useStore.getState().project

beforeEach(() => {
  useStore.setState({ project: settle(defaultProject()), past: [], future: [], selection: [] })
  useLibrary.setState({ library: lib, entries: libraryIndex(lib).map((e) => ({ ...e, source: 'ofl' as const })), status: 'ready' })
})

describe('A fixture’s modes', () => {
  it('the Hydrabeam 400 lists all five modes, up to 56 channels', () => {
    const choices = modeChoices(hydrabeam(3))!
    expect(choices.modes.map((m) => m.channels)).toEqual([6, 10, 19, 32, 56])
    expect(choices.current).toBe(3)
    // 56 channels: four heads, each with its own pan, tilt, dimmer and RGBW.
    const type = hydrabeam(4)
    expect(type.channels).toHaveLength(56)
    expect(type.heads!.filter((h) => h.ch.pan && h.ch.red && h.ch.white)).toHaveLength(4)
  })

  it('switches a fixture from 32 to 56 channels', async () => {
    const [id] = addLibraryFixtures(hydrabeam(3), 1)
    const next = await setFixtureMode([id], 4)
    expect(next!.channels).toHaveLength(56)
    const f = state().fixtures.find((x) => x.id === id)!
    expect(getFixtureType(f.typeId).channels).toHaveLength(56)
    expect(state().fixtureTypes!.some((t) => t.id === f.typeId)).toBe(true)
  })

  it('finds the modes of Library fixtures saved before types knew them', () => {
    const { family: _old, ...saved } = hydrabeam(1)
    void _old
    expect(familyOf(saved)).toEqual({ library: HYDRA, mode: 1 })
  })

  it('opens every mode in Fixture Studio, on the one in the show', async () => {
    const [id] = addLibraryFixtures(hydrabeam(3), 1)
    useStudio.getState().openType(getFixtureType(state().fixtures.find((x) => x.id === id)!.typeId))
    await new Promise((r) => setTimeout(r, 50))
    const { def, modeIndex } = useStudio.getState()
    expect(def!.modes.map((m) => m.channels.length)).toEqual([6, 10, 19, 32, 56])
    expect(modeIndex).toBe(3)
    useStudio.getState().close(true)
  })

  it('a SoundSwitch fixture carries every mode of its definition', () => {
    const mode = (name: string, n: number): SoundSwitchMode => ({ name, channels: n, heads: [], attributes: Array.from({ length: n }, (_, i) => ({ code: 1, name: `Dimmer ${i}`, width: 1, coarse: i, fine: i })) })
    const modes = [mode('8CH', 8), mode('14CH', 14), mode('56CH', 56)]
    const f: SoundSwitchFixture = { definitionId: 7, definition: 'Big Wash', manufacturer: 'Test', universe: 0, address: 1, wheels: {}, mode: modes[1], modes }
    const type = fixtureTypeFromMode(f)
    registerFixtureTypes([type])
    const choices = modeChoices(type)!
    expect(choices.modes.map((m) => m.channels)).toEqual([8, 14, 56])
    expect(choices.current).toBe(1)
    useStudio.getState().openType(type)
    expect(useStudio.getState().def!.modes.map((m) => m.channels.length)).toEqual([8, 14, 56])
    expect(useStudio.getState().modeIndex).toBe(1)
    useStudio.getState().close(true)
  })

  it('reads SoundSwitch mode names like 56CH, DMX 8 and Extended', () => {
    for (const name of ['Mode 1', '19 Channel Mode', '3 Ch', '56CH', '8ch', '12-CH', 'DMX 8', 'Extended', 'Basic', 'Standard 16']) expect(MODE_NAME.test(name), name).toBe(true)
    for (const name of ['Cell 1', 'Head 2', 'Main', 'Pixel 3', 'Ring', 'Laser']) expect(MODE_NAME.test(name), name).toBe(false)
  })
})

describe('Cameo Hydrabeam 400 in every mode', () => {
  // Every channel set by its name in the fixture file.
  const levels = (mode: number, set: Array<[RegExp, number]>) => {
    const u = new Uint8Array(512)
    oflModeChannelNames(lib.fixtures[HYDRA], mode).forEach((name, i) => {
      for (const [re, v] of set) if (re.test(name)) u[i] = v
    })
    return u
  }
  const RED: Array<[RegExp, number]> = [[/^dimmer/i, 255], [/^red/i, 255], [/^light control|^color \d/i, 35]]

  it('is four heads in every mode, lit red by the shared or own colour', () => {
    for (let mode = 0; mode < 5; mode++) {
      const type = hydrabeam(mode)
      expect(type.spec!.movers, `mode ${mode}`).toBe(4)
      const lit = decodeHeads(type, levels(mode, RED), 1, 0).filter((s, i) => type.heads![i].role !== 'master' && s.intensity > 0.5)
      expect(lit.length, `mode ${mode}`).toBeGreaterThan(0)
      for (const s of lit) expect(s.color, `mode ${mode}`).toEqual([1, 0, 0])
    }
  })

  it('the shared dimmer turns every head off', () => {
    for (let mode = 0; mode < 4; mode++) {
      const type = hydrabeam(mode)
      const off = levels(mode, [[/^dimmer \d/i, 255], [/^red/i, 255], [/^light control|^color \d/i, 35]])
      expect(decodeHeads(type, off, 1, 0).every((s) => s.intensity < 0.01), `mode ${mode}`).toBe(true)
    }
  })
})
