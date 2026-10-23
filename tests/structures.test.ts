import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { useStore } from '../src/renderer/src/state/store'
import { addLibraryFixtures, addStructure, orientFixtures, deleteStructures, detachFixtures, duplicateStructures, mountFixtures, moveFixtures, moveStructures, setStructureParams } from '../src/renderer/src/state/commands'
import { defaultProject, findOverlaps } from '../src/renderer/src/model/project'
import { roomFit, settle } from '../src/renderer/src/model/physics'
import { FT } from '../src/renderer/src/model/structures'
import { fixtureTypeFromOfl, type OflLibrary } from '../src/renderer/src/model/oflImport'

const state = () => useStore.getState().project
const fixture = (id: string) => state().fixtures.find((f) => f.id === id)!
const piece = (id: string) => state().structures!.find((s) => s.id === id)!
const lib: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const mh150 = () => fixtureTypeFromOfl('both-lighting/mh-150', 'Both Lighting', lib.fixtures['both-lighting/mh-150'], lib.fixtures['both-lighting/mh-150'].modes.length - 1)

beforeEach(() => useStore.setState({ project: settle(defaultProject()), past: [], future: [], selection: [] }))

describe('physics', () => {
  it('settles the default room and leaves it alone after that', () => {
    const p = state()
    expect(settle(p)).toBe(p)
    // The movers hang under the main truss.
    expect(fixture('spot-1').mount?.structure).toBe('st-truss')
  })

  it('stands set pieces on the floor or on the stage under them, never in it or above it', () => {
    const deck = addStructure('stage', { width: 16 * FT, depth: 12 * FT, height: 4 * FT }, { at: [12, 0, 0] })
    const onDeck = addStructure('totem', { height: 6 * FT }, { at: [12, 0, 0] })
    const onFloor = addStructure('totem', { height: 6 * FT }, { at: [20, 0, 0] })
    expect(piece(deck).position[1]).toBe(0)
    expect(piece(onDeck).position[1]).toBeCloseTo(4 * FT, 3)
    expect(piece(onFloor).position[1]).toBe(0)
    // Raise the deck: the totem goes up with it.
    setStructureParams([deck], { height: 6 * FT })
    expect(piece(onDeck).position[1]).toBeCloseTo(6 * FT, 3)
  })

  it('puts a moving head on top of a totem, and it goes where the totem goes', () => {
    const totem = addStructure('totem', { height: 6 * FT }, { at: [10, 0, 2] })
    const [mover] = addLibraryFixtures(mh150(), 1, { at: [9, 0.1, 2] })
    expect(mountFixtures([mover], totem, 'top')).toBe(true)
    expect(fixture(mover).position).toEqual([10, 6 * FT + 0.012, 2].map((v) => Math.round(v * 1000) / 1000))
    expect(fixture(mover).mounting).toBe('floor')
    moveStructures([totem], [1, 0, -1])
    expect(fixture(mover).position[0]).toBeCloseTo(11)
    expect(fixture(mover).position[2]).toBeCloseTo(1)
    // Taller totem: the head stays on top.
    setStructureParams([totem], { height: 8 * FT })
    expect(fixture(mover).position[1]).toBeCloseTo(8 * FT + 0.012, 3)
  })

  it('lets a fixture fall when what held it is gone', () => {
    const totem = addStructure('totem', { height: 6 * FT }, { at: [10, 0, 2] })
    const [mover] = addLibraryFixtures(mh150(), 1, { mount: { structure: totem, point: 'top' } })
    expect(fixture(mover).position[1]).toBeGreaterThan(1.8)
    deleteStructures([totem])
    expect(fixture(mover).mount).toBeUndefined()
    expect(fixture(mover).position[1]).toBe(0)
  })

  it('takes a fixture off when you move it away by hand', () => {
    const totem = addStructure('totem', { height: 6 * FT }, { at: [10, 0, 2] })
    const [mover] = addLibraryFixtures(mh150(), 1, { mount: { structure: totem, point: 'top' } })
    moveFixtures([mover], [3, 0, 0])
    expect(fixture(mover).mount).toBeUndefined()
    expect(fixture(mover).position[1]).toBe(0)
  })

  it('a hanging fixture with nothing to hang from ends up on the floor', () => {
    moveFixtures(['spot-1'], [0, 0, 6])
    expect(fixture('spot-1').mounting).toBe('floor')
    expect(fixture('spot-1').position[1]).toBe(0)
  })

  it('clamps washes to a totem, facing the way the totem faces', () => {
    const totem = addStructure('totem', { height: 6 * FT }, { at: [-10, 0, 2], rotation: 30 })
    mountFixtures(['par-1'], totem, 'front', 0.6)
    expect(fixture('par-1').mount).toMatchObject({ structure: totem, point: 'front' })
    expect(fixture('par-1').rotation).toBe(30)
  })

  it('spaces several fixtures along a truss bar', () => {
    const truss = addStructure('goalpost', { width: 10 * FT, height: 10 * FT }, { at: [0, 0, -12] })
    mountFixtures(['par-1', 'par-2', 'par-3'], truss, 'under')
    const xs = ['par-1', 'par-2', 'par-3'].map((id) => fixture(id).position[0]).sort((a, b) => a - b)
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1])
    expect(xs[1] - xs[0]).toBeGreaterThan(0.3)
    for (const id of ['par-1', 'par-2', 'par-3']) expect(fixture(id).mounting).toBe('hanging')
    detachFixtures(['par-1'])
    expect(fixture('par-1').mount).toBeUndefined()
    expect(fixture('par-1').position[1]).toBeLessThan(0.5)
  })

  it('duplicates a totem with its fixture, on a patch of its own', () => {
    const totem = addStructure('totem', { height: 6 * FT }, { at: [10, 0, 2] })
    addLibraryFixtures(mh150(), 1, { mount: { structure: totem, point: 'top' } })
    duplicateStructures([totem])
    const copy = state().structures!.at(-1)!
    expect(copy.name).toBe('Totem 6 ft 2')
    const onCopy = state().fixtures.filter((f) => f.mount?.structure === copy.id)
    expect(onCopy.length).toBe(1)
    expect(findOverlaps(state().fixtures)).toEqual([])
  })

  it('grows the room to fit the set', () => {
    const before = roomFit(state(), 7)
    addStructure('stage', { width: 24 * FT, depth: 16 * FT, height: 4 * FT }, { at: [0, 0, -9] })
    addStructure('goalpost', { width: 30 * FT, height: 20 * FT }, { at: [0, 0, -9] })
    const after = roomFit(state(), 7)
    expect(after.wallZ).toBeLessThan(before.wallZ)
    expect(after.ceiling).toBeGreaterThan(20 * FT)
    expect(after.raised).toBe(true)
  })

  it('puts a 360 Tube upright on a tube stand, and resizing the stand lifts it', () => {
    const tubes = fixtureTypeFromOfl('both-lighting/360-tubes', 'Both Lighting', lib.fixtures['both-lighting/360-tubes'], 1)
    const stand = addStructure('tubeStand', { height: 4 * FT }, { at: [12, 0, 4] })
    const [tube] = addLibraryFixtures(tubes, 1, { mount: { structure: stand, point: 'top' } })
    expect(fixture(tube).mounting).toBe('floor')
    expect(fixture(tube).position[1]).toBeCloseTo(4 * FT + 0.01, 3)
    setStructureParams([stand], { height: 6 * FT })
    expect(fixture(tube).position[1]).toBeCloseTo(6 * FT + 0.01, 3)
  })

  it('switches a moving head between truss mode (hanging) and totem mode (upright)', () => {
    // spot-1 hangs under the main truss; upright puts it on top of the same bar, same spot.
    const x = fixture('spot-1').position[0]
    orientFixtures(['spot-1'], 'floor')
    expect(fixture('spot-1').mounting).toBe('floor')
    expect(fixture('spot-1').mount).toMatchObject({ structure: 'st-truss', point: 'top' })
    expect(fixture('spot-1').position[0]).toBeCloseTo(x)
    orientFixtures(['spot-1'], 'hanging')
    expect(fixture('spot-1').mount).toMatchObject({ structure: 'st-truss', point: 'under' })
    // On a totem it has nothing to hang from there: it goes under the nearest truss.
    const totem = addStructure('totem', { height: 6 * FT }, { at: [10, 0, 2] })
    const [mover] = addLibraryFixtures(mh150(), 1, { mount: { structure: totem, point: 'top' } })
    orientFixtures([mover], 'hanging')
    expect(fixture(mover).mount?.structure).toBe('st-truss')
    // With no truss at all, it hangs from the ceiling, right above where it was.
    deleteStructures(['st-truss'])
    expect(fixture(mover).mounting).toBe('floor')
    expect(orientFixtures([mover], 'hanging').length).toBe(0)
    expect(fixture(mover).onCeiling).toBe(true)
    expect(fixture(mover).position[1]).toBe(7.5)
    // And with no ceiling either, it says so instead of floating.
    orientFixtures([mover], 'floor')
    useStore.getState().apply('No ceiling', (p) => ({ ...p, room: { ...p.room!, ceiling: false } }))
    expect(orientFixtures([mover], 'hanging').length).toBe(1)
  })
})

describe('party lights', () => {
  it('sizes marquee letters by the word and lays a monogram on the floor or a wall', async () => {
    const { buildStructure } = await import('../src/renderer/src/three/structures')
    const love = addStructure('marqueeLetters', { text: 'LOVE' }, { at: [0, 0, -3] })
    const mr = addStructure('marqueeLetters', { text: 'MR' }, { at: [3, 0, -3] })
    const { footprint, heightOf } = await import('../src/renderer/src/model/structures')
    expect(footprint(piece(love))[0]).toBeGreaterThan(footprint(piece(mr))[0])
    expect(heightOf(piece(love))).toBeCloseTo(4 * FT)
    const floor = addStructure('monogram', { text: 'A & J' }, { at: [0, 0, 2] })
    expect(heightOf(piece(floor))).toBeLessThan(0.05)
    setStructureParams([floor], { onWall: true })
    expect(heightOf(piece(floor))).toBeGreaterThan(1)
    // Both build without a page (no canvas): the letters fall back to a plain block.
    for (const id of [love, floor]) expect(buildStructure(piece(id)).children.length).toBeGreaterThan(0)
  })
})
