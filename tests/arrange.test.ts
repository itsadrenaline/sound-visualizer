import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { useStore } from '../src/renderer/src/state/store'
import { addLibraryFixtures, alignFixtures, duplicateArray, mirrorFixtures, moveFixtures, selectSameType, spreadEven, storeCamera } from '../src/renderer/src/state/commands'
import { defaultProject, findOverlaps, planPatch, type Fixture } from '../src/renderer/src/model/project'
import { fixtureTypeFromOfl, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { projectFromSoundSwitch } from '../src/renderer/src/model/soundswitchImport'

const fixtures = () => useStore.getState().project.fixtures
const byId = (id: string) => fixtures().find((f) => f.id === id)!

beforeEach(() => useStore.setState({ project: defaultProject(), past: [], future: [], selection: [] }))

describe('patching into free gaps', () => {
  it('fills the free gaps and carries on into the next universe', () => {
    // The default rig uses 1-128 of universe 0.
    const plan = planPatch(defaultProject().fixtures, 4, 120, { universe: 0, address: 1 })
    expect(plan).toEqual([
      { universe: 0, address: 129 },
      { universe: 0, address: 249 },
      { universe: 0, address: 369 },
      { universe: 1, address: 1 } // 489 + 120 would pass 512
    ])
  })

  it('never overlaps what is already patched', () => {
    const lib: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
    const type = fixtureTypeFromOfl('chauvet-dj/intimidator-spot-260', 'Chauvet DJ', lib.fixtures['chauvet-dj/intimidator-spot-260'], 0)
    const ids = addLibraryFixtures(type, 40)
    expect(ids.length).toBe(40)
    expect(findOverlaps(fixtures())).toEqual([])
    // The type is saved in the project, so the file opens on another computer.
    expect(useStore.getState().project.fixtureTypes?.some((t) => t.id === type.id)).toBe(true)
    // One undo removes the whole batch.
    useStore.getState().undo()
    expect(fixtures().length).toBe(defaultProject().fixtures.length)
  })
})

describe('arranging', () => {
  const spots = ['spot-1', 'spot-2', 'spot-3']

  it('aligns and spreads evenly', () => {
    moveFixtures(['spot-2'], [0.3, 0.5, 0])
    alignFixtures(spots, 1, 'max')
    // They hang from the truss, so they all end up under the bar.
    expect(new Set(spots.map((id) => byId(id).position[1])).size).toBe(1)
    spreadEven(spots, 0)
    const xs = spots.map((id) => byId(id).position[0])
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1])
  })

  it('mirrors across the stage with the pan inverted, on the same patch', () => {
    mirrorFixtures(['spot-1'])
    const copy = fixtures().at(-1)!
    const original = byId('spot-1')
    expect(copy.position[0]).toBe(-original.position[0])
    expect(copy.invertPan).toBe(true)
    expect(copy.address).toBe(original.address)
  })

  it('duplicates in a row, with or without their own patch', () => {
    duplicateArray(['par-1'], 2, [1, 0, 0], true)
    const [a, b] = fixtures().slice(-2)
    expect(a.position[0]).toBe(byId('par-1').position[0] + 1)
    expect(b.position[0]).toBe(byId('par-1').position[0] + 2)
    expect(findOverlaps(fixtures())).toEqual([])
    duplicateArray(['par-1'], 1, [0, 0, 1], false)
    expect(fixtures().at(-1)!.address).toBe(byId('par-1').address)
  })

  it('selects every fixture of the same type', () => {
    selectSameType(['par-2'])
    expect(useStore.getState().selection).toEqual(['par-1', 'par-2', 'par-3', 'par-4'])
  })

  it('keeps camera positions through a SoundSwitch sync', () => {
    storeCamera('Booth', [1, 2, 3], [0, 0, 0])
    const synced = projectFromSoundSwitch([], useStore.getState().project, 'Show')
    expect(synced.cameras).toEqual([{ name: 'Booth', position: [1, 2, 3], target: [0, 0, 0] }])
  })
})

void (null as unknown as Fixture)

import { updateRoom } from '../src/renderer/src/state/commands'
import { roomOf } from '../src/renderer/src/model/project'

describe('room settings', () => {
  it('folds a slider drag into one undo step', () => {
    const steps = useStore.getState().past.length
    for (const v of [0.2, 0.3, 0.4, 0.5]) updateRoom({ ambient: v }, 'Room light')
    expect(roomOf(useStore.getState().project).ambient).toBe(0.5)
    expect(useStore.getState().past.length).toBe(steps + 1)
    useStore.getState().undo()
    expect(useStore.getState().project.room).toBeUndefined()
  })
})

import { autoPlaceFixtures, distributeFixtures } from '../src/renderer/src/state/commands'
import { TRUSS } from '../src/renderer/src/model/layout'

describe('distributing', () => {
  const pars = ['par-1', 'par-2', 'par-3', 'par-4']

  it('spreads fixtures evenly in a line, keeping their left-to-right order', () => {
    moveFixtures(['par-3'], [0.4, 0, 0.7]) // a bit messy first
    distributeFixtures(pars, 'line', 'keep', 6)
    const xs = pars.map((id) => byId(id).position[0])
    expect(xs[3] - xs[0]).toBeCloseTo(6)
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1])
    expect(new Set(pars.map((id) => byId(id).position[2])).size).toBe(1) // one straight row
  })

  it('hangs them along the truss', () => {
    distributeFixtures(pars, 'line', 'truss')
    for (const id of pars) {
      expect(byId(id).mounting).toBe('hanging')
      expect(byId(id).position[1]).toBeCloseTo(TRUSS.y)
      expect(byId(id).position[2]).toBe(TRUSS.z)
    }
  })

  it('makes a circle with every fixture the same distance from the centre', () => {
    distributeFixtures(pars, 'circle', 'floorFront', 4)
    const ps = pars.map((id) => byId(id).position)
    const cx = ps.reduce((s, p) => s + p[0], 0) / 4
    const cz = ps.reduce((s, p) => s + p[2], 0) / 4
    for (const p of ps) expect(Math.hypot(p[0] - cx, p[2] - cz)).toBeCloseTo(2, 1)
  })

  it('auto-places by type: moving heads on the truss, pars on the floor', () => {
    moveFixtures(['spot-1', 'par-1'], [3, 0, 3])
    autoPlaceFixtures(['spot-1', 'spot-2', 'par-1', 'par-2'])
    expect(byId('spot-1').position[1]).toBeCloseTo(TRUSS.y)
    expect(byId('par-1').position[1]).toBeLessThan(0.5)
    // ...as one undo step
    useStore.getState().undo()
    expect(byId('spot-1').position[0]).toBeCloseTo(-5 + 3)
  })
})
