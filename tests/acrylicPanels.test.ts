/** LED acrylic panels: a frosted panel lit from its edges by an RGBW strip, any size, white, black or silver frame. */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { useStore } from '../src/renderer/src/state/store'
import { addLibraryFixtures, joinPanels, panelSize, setPanel, isAcrylicPanel, updateFixtures } from '../src/renderer/src/state/commands'
import { defaultProject } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import { fixtureTypeFromOfl, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { decodeHeads } from '../src/renderer/src/model/heads'
import { catalogSpec } from '../src/renderer/src/model/catalog'
import { registerFixtureTypes } from '../src/renderer/src/model/fixtureTypes'
import { blankDef, typeFromDef } from '../src/renderer/src/model/fixtureDef'

const lib: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const panel = (mode = 0) => fixtureTypeFromOfl('generic/led-acrylic-panel-rgbw', 'Generic', lib.fixtures['generic/led-acrylic-panel-rgbw'], mode)
const state = () => useStore.getState().project
const fixture = (id: string) => state().fixtures.find((f) => f.id === id)!

beforeEach(() => useStore.setState({ project: settle(defaultProject()), past: [], future: [], selection: [] }))

describe('LED acrylic panel', () => {
  it('is in the Library with three modes and its own look', () => {
    expect(lib.fixtures['generic/led-acrylic-panel-rgbw'].modes.map((m) => m.channels.length)).toEqual([4, 5, 6])
    const type = panel(1)
    expect(type.spec!.look).toBe('acrylic')
    expect(type.spec!.size).toEqual([0.5, 1.2, 0.04])
    expect(catalogSpec('Acrylic LED panel RGBW')?.look).toBe('acrylic')
  })

  it('mixes red, green, blue and white', () => {
    const type = panel(1)
    const u = new Uint8Array(512)
    u.set([255, 255, 0, 0, 255], 0)
    const [head] = decodeHeads(type, u, 1, 0)
    expect(head.intensity).toBeCloseTo(1)
    expect(head.mix).toEqual([1, 0, 0, 1])
  })

  it('can be made in Fixture Studio', () => {
    const type = typeFromDef(blankDef('acrylic'), 0)
    expect(type.spec!.look).toBe('acrylic')
    expect(type.channels).toHaveLength(4)
  })

  it('has its own size and frame colour', () => {
    const type = panel(0)
    registerFixtureTypes([type])
    const [a] = addLibraryFixtures(type, 1, { at: [0, 0, 0] })
    expect(isAcrylicPanel(fixture(a))).toBe(true)
    expect(panelSize(fixture(a))).toEqual([0.5, 1.2])
    setPanel([a], { width: 0.6, border: 'black' })
    expect(panelSize(fixture(a))).toEqual([0.6, 1.2])
    expect(fixture(a).panel!.border).toBe('black')
  })

  it('joins side by side, edge to edge, from the leftmost', () => {
    const type = panel(0)
    registerFixtureTypes([type])
    const ids = addLibraryFixtures(type, 4, { at: [0, 0, 0] })
    ids.forEach((id, i) => updateFixtures([id], 'scatter', (f) => ({ ...f, position: [[3, 0, 1], [-1, 0, 2], [5, 0, -1], [1, 0, 0]][i] as [number, number, number] })))
    setPanel([ids[2]], { width: 0.8 })
    expect(joinPanels(ids)).toBe(true)
    const xs = ids.map((id) => fixture(id).position[0])
    // Left to right: -1, then the one at 1, at 3, then the wide one.
    expect(xs[1]).toBeCloseTo(-1)
    expect(xs[3]).toBeCloseTo(-0.5)
    expect(xs[0]).toBeCloseTo(0)
    expect(xs[2]).toBeCloseTo(0.65)
    expect(ids.every((id) => Math.abs(fixture(id).position[2] - 2) < 1e-6)).toBe(true)
  })
})
