import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { useStore } from '../src/renderer/src/state/store'
import { addLibraryFixtures, addStructure, mountFixtures, orientFixtures, moveStructures } from '../src/renderer/src/state/commands'
import { defaultProject } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import { FT, mountPoints, type StructureKind } from '../src/renderer/src/model/structures'
import { fixtureTypeFromOfl, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { typeFromDef } from '../src/renderer/src/model/fixtureDef'
import { startWithCount, startsFor, guessKind } from '../src/renderer/src/model/fixtureStarts'
import { startFromMyKind, useMyKinds } from '../src/renderer/src/state/myKinds'

const state = () => useStore.getState().project
const fixture = (id: string) => state().fixtures.find((f) => f.id === id)!
const lib: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const par = () => fixtureTypeFromOfl('betopper/lpc018', 'Betopper', lib.fixtures['betopper/lpc018'], 0)

beforeEach(() => useStore.setState({ project: settle(defaultProject()), past: [], future: [], selection: [] }))

describe('Lights inside a totem', () => {
  it('has a point at the bottom pointing up and one under the top plate pointing down, with the beam stopped at the far plate', () => {
    const totem = addStructure('totem', { height: 8 * FT, cover: 'white' }, { at: [10, 0, 2] })
    const s = state().structures!.find((x) => x.id === totem)!
    const inside = mountPoints(s).filter((m) => m.inside)
    expect(inside.map((m) => m.id)).toEqual(['inBottom', 'inTop'])
    expect(inside.every((m) => m.aim === 0 && m.reach! > 2.1)).toBe(true)

    const [up, down] = addLibraryFixtures(par(), 2, { at: [12, 0, 2] })
    mountFixtures([up], totem, 'inBottom')
    mountFixtures([down], totem, 'inTop')
    expect(fixture(up)).toMatchObject({ mounting: 'floor', aimTilt: 0 })
    expect(fixture(up).position[1]).toBeLessThan(0.05)
    expect(fixture(down)).toMatchObject({ mounting: 'hanging', aimTilt: 0 })
    expect(fixture(down).position[1]).toBeCloseTo(8 * FT, 2)
    // They go where the totem goes.
    moveStructures([totem], [1, 0, 0])
    expect(fixture(up).position[0]).toBeCloseTo(11, 3)
    expect(fixture(down).position[0]).toBeCloseTo(11, 3)
  })

  it('never puts a fixture inside on its own: hanging from a totem still goes to the truss', () => {
    const totem = addStructure('totem', { height: 6 * FT }, { at: [10, 0, 2] })
    const [p] = addLibraryFixtures(par(), 1, { mount: { structure: totem, point: 'top' } })
    orientFixtures([p], 'hanging')
    expect(fixture(p).mount?.structure).toBe('st-truss')
    // Asking for "under" on the totem by kind finds the inside point only if nothing else fits.
    mountFixtures([p], totem, 'under')
    expect(fixture(p).mount?.point).toBe('inTop')
  })
})

describe('Lights on speakers', () => {
  it('column PAs, tops on poles and subs have a top and (where there is a pole) a bracket', () => {
    const want: Array<[StructureKind, string[]]> = [
      ['speakerColumn', ['top', 'pole']],
      ['speakerOnPole', ['top', 'pole']],
      ['speakerOnSub', ['top', 'pole', 'subTop']],
      ['speakerBox', ['top']],
      ['sub', ['top']],
      ['subStack', ['top']],
      ['groundStack', ['top']]
    ]
    for (const [kind, ids] of want) {
      const id = addStructure(kind, {}, { at: [14, 0, 0] })
      const s = state().structures!.find((x) => x.id === id)!
      expect(mountPoints(s).map((m) => m.id), kind).toEqual(ids)
    }
  })

  it('a light on top of a column PA sits at the top of the column', () => {
    const col = addStructure('speakerColumn', { height: 2.0 }, { at: [14, 0, 0] })
    const [p] = addLibraryFixtures(par(), 1, { mount: { structure: col, point: 'top' } })
    expect(fixture(p).position[1]).toBeCloseTo(2.0, 3)
    const [q] = addLibraryFixtures(par(), 1, { mount: { structure: col, point: 'pole' } })
    expect(fixture(q).position[1]).toBeGreaterThan(0.6)
    expect(fixture(q).position[1]).toBeLessThan(1.2)
  })
})

describe('String lights and your own kinds', () => {
  it('string lights: bulbs with a dimmer each, warm, drawn as a string', () => {
    const def = startsFor('string').find((s) => s.label.startsWith('10 bulbs'))!.build()
    expect(def.parts.map((p) => p.name).slice(0, 2)).toEqual(['Bulb 1', 'Bulb 2'])
    expect(def.parts.every((p) => p.tint === 'warm')).toBe(true)
    expect(typeFromDef(def, 0).spec!.look).toBe('string')
    expect(guessKind(def)).toBe('string')
    expect(startWithCount('string', 24).def.modes[0].channels.length).toBe(24)
  })

  it('saves a fixture as a kind and starts new fixtures from it', () => {
    const def = startWithCount('tube', 12, 'RGB').def
    const id = useMyKinds.getState().save({ ...def, name: 'LED stand' }, 'LED stand', 'A stand with LEDs up the pole')
    const kind = useMyKinds.getState().kinds.find((k) => k.id === id)!
    expect(kind.label).toBe('LED stand')
    const made = startFromMyKind(kind, 'My stand', 'Me')
    expect(made.id).not.toBe(def.id)
    expect(made.name).toBe('My stand')
    expect(made.modes[0].channels.length).toBe(12)
    // Saving the same name again replaces it.
    useMyKinds.getState().save(def, 'led stand', '')
    expect(useMyKinds.getState().kinds.filter((k) => k.label.toLowerCase() === 'led stand')).toHaveLength(1)
    useMyKinds.getState().remove(id)
    expect(useMyKinds.getState().kinds).toHaveLength(0)
  })
})
