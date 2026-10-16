import { beforeEach, describe, expect, it } from 'vitest'
import { dmxBus } from '../src/renderer/src/state/dmxBus'
import { useStore } from '../src/renderer/src/state/store'
import { useViewSettings } from '../src/renderer/src/state/viewSettings'
import { addLibraryFixtures, updateFixtures } from '../src/renderer/src/state/commands'
import { holdPositions, runDemo } from '../src/renderer/src/state/demo'
import { defaultProject } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import { decodeHeads, headsOf } from '../src/renderer/src/model/heads'
import { getFixtureType } from '../src/renderer/src/model/fixtureTypes'
import { typeFromDef } from '../src/renderer/src/model/fixtureDef'
import { startsFor } from '../src/renderer/src/model/fixtureStarts'

const project = () => useStore.getState().project
beforeEach(() => {
  useStore.setState({ project: settle(defaultProject()), past: [], future: [], selection: [] })
  useViewSettings.getState().setDemo(false)
  dmxBus.clearFaders()
})

describe('nothing sent, nothing happens', () => {
  it('stopping the demo takes its colours and positions away (hand-moved faders stay)', () => {
    const p = project()
    useViewSettings.getState().setDemo(true)
    runDemo(p, 3.2)
    dmxBus.setFader(9, 1, 200) // a fader moved by hand
    useViewSettings.getState().setDemo(false)
    for (const f of p.fixtures) {
      const lit = decodeHeads(getFixtureType(f.typeId), dmxBus.levels(f.universe), f.address, 4).some((h) => h.intensity > 0.01)
      expect(lit, f.name).toBe(false)
    }
    expect(dmxBus.levels(9)[0]).toBe(200)
  })

  it('a fixture with every channel at 0 is dark, even parts that are "on" at 0', () => {
    for (const kind of ['strobe', 'effect', 'laser', 'cluster', 'par', 'wash', 'gigbar', 'bar', 'tube', 'panel'] as const) {
      for (const s of startsFor(kind).filter((x) => !x.label.startsWith('Blank'))) {
        const t = typeFromDef(s.build(), 0)
        const heads = decodeHeads(t, new Uint8Array(512), 1, 2.5)
        expect(heads.every((h) => h.intensity === 0), `${kind} ${s.label}`).toBe(true)
      }
    }
  })

  it('a built-in program at 0 runs nothing', () => {
    const def = startsFor('bar').find((s) => s.label.toLowerCase().includes('program'))?.build() ?? startsFor('par').find((s) => s.build().modes[0].channels.some((c) => c.fn === 'program'))!.build()
    const prog = def.modes[0].channels.findIndex((c) => c.fn === 'program')
    expect(prog).toBeGreaterThanOrEqual(0)
    // Make the first program range start at 0, as some fixture files do.
    def.modes[0].channels[prog].ranges = [{ lo: 0, hi: 255, label: 'Auto', kind: 'program', pattern: 'rainbow' }]
    const t = typeFromDef(def, 0)
    const levels = new Uint8Array(512)
    // Something else on the fixture is sent (so it isn't simply "nothing sent").
    const other = def.modes[0].channels.findIndex((c, i) => i !== prog && c.fn !== 'dimmer' && c.fn !== 'red' && c.fn !== 'green' && c.fn !== 'blue')
    if (other >= 0) levels[other] = 1
    const heads = decodeHeads(t, levels, 1, 2.5)
    expect(heads.every((h) => h.intensity === 0)).toBe(true)
  })

  it('when the show stops arriving, heads stay where it left them', () => {
    const f = project().fixtures.find((x) => headsOf(getFixtureType(x.typeId)).some((h) => h.ch.pan))!
    const pan = headsOf(getFixtureType(f.typeId)).find((h) => h.ch.pan)!.ch.pan!
    const show = new Uint8Array(512)
    show[f.address - 1 + pan.coarse] = 37
    dmxBus.receiveArtNet(f.universe, show)
    holdPositions(project())
    expect(dmxBus.getFader(f.universe, f.address + pan.coarse)).toBe(37)
  })

  it("another show's universes aren't shifted onto this rig", () => {
    dmxBus.receiveArtNet(5, new Uint8Array(512).fill(255))
    expect(dmxBus.alignUniverses([0])).toBe(0)
    dmxBus.receiveArtNet(1, new Uint8Array(512))
    // (one apart is the "counts from 1" case and still lines up)
    expect([0, 1, 4]).toContain(dmxBus.alignUniverses([0]))
  })
})

describe('built-in stands', () => {
  it('Fixture Studio GigBars have no stand unless ticked; a fixture can leave its stand off', () => {
    const def = startsFor('gigbar')[0].build()
    expect(typeFromDef(def, 0).spec!.stand).toBe(false)
    const withStand = typeFromDef({ ...def, look: { ...def.look, stand: true } }, 0)
    const [id] = addLibraryFixtures(withStand, 1, { at: [3, 0.1, 1] })
    const on = project().fixtures.find((f) => f.id === id)!
    expect(on.position[1]).toBeGreaterThan(2)
    updateFixtures([id], 'off', (f) => ({ ...f, hideStand: true }))
    expect(project().fixtures.find((f) => f.id === id)!.position[1]).toBeLessThan(1)
  })
})
