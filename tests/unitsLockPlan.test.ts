/**
 * Metric or imperial everywhere, locking things in place, and the Plan.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { feetInText, FOOT, formatFeet, formatLength, INCH, lengthNumber, localiseFeet, parseLength, setUnitsValue } from '../src/renderer/src/model/units'
import { useStore } from '../src/renderer/src/state/store'
import { addLibraryFixtures, addStructure, alignFixtures, moveSelection, rotateStructures, setLocked, setStructureParams, toggleLocked } from '../src/renderer/src/state/commands'
import { blankProject } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import { defaultName, FT } from '../src/renderer/src/model/structures'
import { itemAt, mountNear, planDelta, planItems, toPlan } from '../src/renderer/src/model/plan'
import { listFixtureTypes } from '../src/renderer/src/model/fixtureTypes'

describe('Lengths in metric or imperial', () => {
  afterEach(() => setUnitsValue('metric'))

  it('shows metres by default, feet and inches when imperial is chosen', () => {
    expect(formatLength(1.8288)).toBe('1.83 m')
    expect(formatLength(0.4572, 'small')).toBe('457 mm')
    setUnitsValue('imperial')
    expect(formatLength(6 * FOOT)).toBe('6′')
    expect(formatLength(6 * FOOT + 2 * INCH)).toBe('6′ 2″')
    expect(formatLength(-3.5 * FOOT)).toBe('-3′ 6″')
    expect(formatLength(18 * INCH, 'small')).toBe('18″')
    expect(formatLength(5 * INCH)).toBe('5″')
  })

  it('reads lengths typed either way, whichever is chosen', () => {
    for (const u of ['metric', 'imperial'] as const) {
      expect(parseLength("6'", 'length', u)).toBeCloseTo(6 * FOOT)
      expect(parseLength('6 ft 2 in', 'length', u)).toBeCloseTo(6 * FOOT + 2 * INCH)
      expect(parseLength('6\'2"', 'length', u)).toBeCloseTo(6 * FOOT + 2 * INCH)
      expect(parseLength('74in', 'length', u)).toBeCloseTo(74 * INCH)
      expect(parseLength('1.8 m', 'length', u)).toBeCloseTo(1.8)
      expect(parseLength('180cm', 'length', u)).toBeCloseTo(1.8)
      expect(parseLength('-2 m', 'length', u)).toBeCloseTo(-2)
    }
    // A bare number is in the chosen system's main unit.
    expect(parseLength('2', 'length', 'metric')).toBeCloseTo(2)
    expect(parseLength('2', 'length', 'imperial')).toBeCloseTo(2 * FOOT)
    expect(parseLength('300', 'small', 'metric')).toBeCloseTo(0.3)
    expect(parseLength('12', 'small', 'imperial')).toBeCloseTo(12 * INCH)
    expect(parseLength('2,5', 'length', 'metric')).toBeCloseTo(2.5)
    expect(parseLength('tall', 'length', 'metric')).toBeNull()
  })

  it('names, presets and lists follow the choice', () => {
    expect(defaultName('totem', { height: 6 * FT })).toBe('Totem 1.83 m')
    expect(localiseFeet('Stage deck 4 × 8 ft')).toBe('Stage deck 1.22 × 2.44 m')
    expect(localiseFeet('FLEXstand (5-8 ft)')).toBe('FLEXstand (1.52-2.44 m)')
    expect(localiseFeet('12 in speaker')).toBe('12 in speaker')
    expect(formatFeet(6)).toBe('1.83 m')
    expect(lengthNumber(0.279, 'small')).toBe(279)
    setUnitsValue('imperial')
    expect(defaultName('totem', { height: 6 * FT })).toBe('Totem 6 ft')
    expect(formatFeet(6)).toBe('6′')
    expect(lengthNumber(0.279, 'small')).toBe(11)
  })

  it('understands heights in show descriptions either way', () => {
    expect(feetInText('movers on 6 ft totems')).toBe(6)
    expect(feetInText('movers on 1.8 m totems')).toBeCloseTo(5.9)
    expect(feetInText('on 180 cm stands')).toBeCloseTo(5.9)
    expect(feetInText('two movers')).toBeNull()
  })
})

const state = () => useStore.getState().project
const type = () => listFixtureTypes()[0]

describe('Locking', () => {
  beforeEach(() => useStore.setState({ project: settle(blankProject()), past: [], future: [], selection: [] }))

  it('a locked fixture or object stays put when moved, turned, resized or aligned', () => {
    const totem = addStructure('totem', { height: 6 * FT }, { at: [2, 0, 0] })
    const [a, b] = addLibraryFixtures(type(), 2, { at: [-2, 0.1, 1] })
    setLocked([totem, a], true)
    const before = JSON.stringify([state().structures!.find((s) => s.id === totem), state().fixtures.find((f) => f.id === a)!.position])
    moveSelection([totem, a, b], [1, 0, 1])
    rotateStructures([totem], 90)
    setStructureParams([totem], { height: 4 * FT })
    expect(JSON.stringify([state().structures!.find((s) => s.id === totem), state().fixtures.find((f) => f.id === a)!.position])).toBe(before)
    // The unlocked one did move.
    expect(state().fixtures.find((f) => f.id === b)!.position[0]).not.toBe(-2 + 0.6)
    alignFixtures([a, b], 2, 'max')
    expect(state().fixtures.find((f) => f.id === a)!.position[2]).toBe(JSON.parse(before)[1][2])
  })

  it('toggles: locks the selection, or unlocks it when it is all locked; one undo step each', () => {
    const [a] = addLibraryFixtures(type(), 1, { at: [0, 0.1, 0] })
    toggleLocked([a])
    expect(state().fixtures[0].locked).toBe(true)
    toggleLocked([a])
    expect(state().fixtures[0].locked).toBeUndefined()
    useStore.getState().undo()
    expect(state().fixtures[0].locked).toBe(true)
  })
})

describe('The Plan', () => {
  beforeEach(() => useStore.setState({ project: settle(blankProject()), past: [], future: [], selection: [] }))

  it('draws objects by their footprint and turn, and fixtures on top', () => {
    const stage = addStructure('stage', { width: 4, depth: 3, height: 0.6 }, { at: [0, 0, -1] })
    const totem = addStructure('totem', { height: 6 * FT }, { at: [3, 0, 0], rotation: 90 })
    addLibraryFixtures(type(), 1, { at: [1, 0.1, 2] })
    const top = planItems(state(), 'top')
    expect(top.at(-1)!.kind).toBe('fixture')
    const st = top.find((i) => i.id === stage)!
    expect([st.u, st.v, st.w, st.h]).toEqual([0, -1, 4, 3])
    expect(top.find((i) => i.id === totem)!.turn).toBe(-90)
    // Clicking inside the stage finds it; the fixture is found where it stands.
    expect(itemAt(top, 1.5, -2)?.id).toBe(stage)
    expect(itemAt(top, 1, 2)?.kind).toBe('fixture')
    // From the front: the stage is 0.6 m tall, standing on the floor.
    const front = planItems(state(), 'front').find((i) => i.id === stage)!
    expect(front.h).toBeCloseTo(0.6, 1)
    expect(front.v).toBeCloseTo(-0.3, 1)
  })

  it('turns moves on the plan into moves in the room', () => {
    expect(planDelta('top', 1, 2)).toEqual([1, 0, 2])
    expect(planDelta('front', 1, -2)).toEqual([1, 2, 0])
    expect(planDelta('left', 1, -2)).toEqual([0, 2, 1])
    expect(planDelta('right', 1, -2)).toEqual([0, 2, -1])
    // Each side view sees the room mirrored: the audience on the right from the left, on the left from the right.
    expect(toPlan('left', [0, 1, 3])).toEqual([3, -1])
    expect(toPlan('right', [0, 1, 3])).toEqual([-3, -1])
  })

  it('finds the totem top or truss bar under a dragged fixture', () => {
    const totem = addStructure('totem', { height: 6 * FT }, { at: [2, 0, 0] })
    const truss = addStructure('goalpost', { width: 6 }, { at: [0, 0, -3] })
    const structures = state().structures!
    expect(mountNear(structures, 2.1, 0.05, false, 0.4)?.structure.id).toBe(totem)
    expect(mountNear(structures, 1, -3, true, 0.4)?.structure.id).toBe(truss)
    expect(mountNear(structures, 8, 8, false, 0.4)).toBeNull()
  })
})

describe('Switching units renames automatic names', () => {
  beforeEach(() => useStore.setState({ project: settle(blankProject()), past: [], future: [], selection: [] }))
  afterEach(() => setUnitsValue('metric'))

  it('"Totem 1.83 m" becomes "Totem 6 ft" and back; names you chose stay', async () => {
    const { usePrefs } = await import('../src/renderer/src/state/prefs')
    const a = addStructure('totem', { height: 6 * FT }, { at: [2, 0, 0] })
    const b = addStructure('totem', { height: 6 * FT }, { at: [-2, 0, 0], name: 'Left tower' })
    usePrefs.getState().setUnits('imperial')
    expect(state().structures!.find((s) => s.id === a)!.name).toBe('Totem 6 ft')
    expect(state().structures!.find((s) => s.id === b)!.name).toBe('Left tower')
    usePrefs.getState().setUnits('metric')
    expect(state().structures!.find((s) => s.id === a)!.name).toBe('Totem 1.83 m')
  })
})
