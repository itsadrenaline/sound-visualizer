import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseChart } from '../src/renderer/src/model/manualParser'
import { defFromQxf } from '../src/renderer/src/model/qxf'
import { KIND_ORDER, blankDef, defFromTypes, typeFromDef, type FixtureDef } from '../src/renderer/src/model/fixtureDef'
import { defToOfl, readFixtureFile, writeStudioFile } from '../src/renderer/src/model/fixtureFiles'
import { fixtureTypeFromOfl } from '../src/renderer/src/model/oflImport'
import { checkDef, tidyRanges } from '../src/renderer/src/model/fixtureChecks'
import { fixesFor, reverseCells, sceneAt, scenesFor } from '../src/renderer/src/model/fixtureTests'
import { decodeHeads } from '../src/renderer/src/model/heads'
import { fixtureTypeFromMode } from '../src/renderer/src/model/soundswitchImport'
import { getFixtureType, registerFixtureTypes } from '../src/renderer/src/model/fixtureTypes'
import type { SoundSwitchFixture } from '../src/shared/soundswitch'

const manual = readFileSync('tests/fixtures/hex-retro-manual.txt', 'utf8')

function levelsFor(def: FixtureDef, mode: number, set: Record<number, number>): Uint8Array {
  const u = new Uint8Array(512)
  for (const [k, v] of Object.entries(set)) u[Number(k)] = v
  void def
  void mode
  return u
}

describe('Reading a DMX chart typed from a manual', () => {
  const { def, notes } = parseChart(manual, undefined, 'Hex Retro 7', 'Generic')
  const mode = def.modes[0]

  it('finds every channel, including the ones the manual skips', () => {
    expect(mode.channels).toHaveLength(37)
    expect(mode.name).toBe('37-channel')
    expect(notes.some((n) => /Filled in channels 20.34/.test(n))).toBe(true)
  })

  it('marks the channels it has no page for as missing', () => {
    expect(mode.channels.slice(0, 12).every((c) => c.confidence === 'missing')).toBe(true)
    expect(notes.some((n) => /1.12 are not in the text/.test(n))).toBe(true)
  })

  it('reads effect channels as programs and fills in "data increases by 6"', () => {
    const ch13 = mode.channels[12]
    expect(ch13.fn).toBe('program')
    expect(ch13.ranges.find((r) => /effect 4$/.test(r.label))).toMatchObject({ lo: 26, hi: 32 })
    expect(ch13.ranges.find((r) => /effect 27$/.test(r.label))).toMatchObject({ lo: 187, hi: 193 })
    expect(ch13.ranges[0].pattern).toBe('none')
    expect(mode.channels[13].fn).toBe('programSpeed')
  })

  it('gives each RGB triple its own cell, and trusts "the seventh light" over the R6 label', () => {
    const cells = def.parts.map((p) => p.cell)
    expect(cells).toEqual([0, 1, 2, 3, 4, 5, 6])
    const ch35 = mode.channels[34]
    expect(ch35.fn).toBe('red')
    expect(def.parts.find((p) => p.id === ch35.part)?.cell).toBe(6)
    expect(notes.some((n) => /labelled .R6. but described as light 7/.test(n))).toBe(true)
  })

  it('recognises a retro multi-cell light', () => {
    expect(def.kind).toBe('cluster')
    expect(def.look.layout?.kind).toBe('ringCentre')
  })
})

describe('QLC+ fixtures', () => {
  it('reads the Chauvet Freedom Stick with its 16 cells', () => {
    const { def } = defFromQxf(readFileSync('tests/fixtures/Chauvet-Freedom-Stick.qxf', 'utf8'))
    expect(def.kind).toBe('tube')
    expect(def.parts).toHaveLength(16)
    const big = def.modes.find((m) => m.channels.length === 50)!
    expect(big.channels.filter((c) => c.fn === 'red')).toHaveLength(16)
  })

  it('reads the Equinox SpectraPix Batten as a bar', () => {
    const { def } = defFromQxf(readFileSync('tests/fixtures/Equinox-SpectraPix-Batten.qxf', 'utf8'))
    expect(def.kind).toBe('bar')
    expect(def.look.size[0]).toBeGreaterThan(def.look.size[1])
  })

  it('treats "no function" on a strobe channel as open, so the light still shows', () => {
    const { def } = defFromQxf(readFileSync('tests/fixtures/Chauvet-Freedom-Stick.qxf', 'utf8'))
    const big = def.modes.findIndex((m) => m.channels.length === 50)
    const type = typeFromDef(def, big)
    const mode = def.modes[big]
    const set: Record<number, number> = {}
    mode.channels.forEach((c, i) => {
      if (c.fn === 'dimmer') set[i] = 255
      if (c.fn === 'red' && def.parts.find((p) => p.id === c.part)?.cell === 3) set[i] = 255
    })
    const heads = decodeHeads(type, levelsFor(def, big, set), 1, 0)
    const lit = heads.filter((h) => h.intensity > 0.5)
    expect(lit).toHaveLength(1)
  })
})

describe('Open Fixture Library files', () => {
  for (const kind of KIND_ORDER) {
    it(`a ${kind} survives being written as OFL and read back`, () => {
      const def = blankDef(kind)
      const a = typeFromDef(def, 0)
      const b = fixtureTypeFromOfl('x/y', 'X', defToOfl(def) as never, 0)
      expect(b.channels.length).toBe(a.channels.length)
      // Colour, movement and cells come through (effects on GigBars stay as one fixture in OFL).
      for (const fn of ['red', 'green', 'blue', 'pan', 'tilt', 'dimmer'] as const) expect(b.channels.filter((c) => c === fn).length).toBe(a.channels.filter((c) => c === fn).length)
      if (kind !== 'gigbar' && kind !== 'movingBar') expect(b.cells).toBe(a.cells)
    })
  }

  it('a .svfixture file opens again with everything in it', () => {
    const { def } = parseChart(manual)
    const back = readFixtureFile('x.svfixture', writeStudioFile(def)).def
    expect(back).toEqual(def)
  })
})

describe('The twin and its tests', () => {
  it('a cell chase lights one cell at a time, in order', () => {
    const def = blankDef('bar')
    const chase = scenesFor(def, 0).find((s) => s.id === 'chase')!
    expect(chase.steps).toHaveLength(8)
    const type = typeFromDef(def, 0)
    const at = sceneAt(chase, 0.8 * 2 + 0.1) // the third step
    const u = new Uint8Array(512)
    u.set(at.levels)
    const heads = decodeHeads(type, u, 1, 0)
    const pixels = heads.filter((h) => h.intensity > 0.5)
    expect(pixels).toHaveLength(1)
    expect(type.heads![heads.indexOf(pixels[0])].cell).toBe(2)
  })

  it('offers the right fixes, and reversing the cells reverses them', () => {
    const def = blankDef('bar')
    expect(fixesFor('chase', def, 0).map((f) => f.label).join()).toMatch(/reverse/i)
    const rev = reverseCells(def)
    expect(rev.parts.map((p) => p.cell)).toEqual([7, 6, 5, 4, 3, 2, 1, 0])
  })

  it('a moving head gets pan/tilt and gobo tests; a laser gets its own', () => {
    expect(scenesFor(blankDef('spot'), 0).map((s) => s.id)).toEqual(expect.arrayContaining(['move', expect.stringMatching(/^gobo-/)]))
    expect(scenesFor(blankDef('laser'), 0).some((s) => s.id.startsWith('laser-'))).toBe(true)
  })

  it('a built-in program makes the light do something, even with its colour channels at 0', () => {
    const def = blankDef('par')
    const mode = def.modes[0]
    const type = typeFromDef(def, 0)
    const u = new Uint8Array(512)
    u[mode.channels.findIndex((c) => c.fn === 'dimmer')] = 255
    u[mode.channels.findIndex((c) => c.fn === 'program')] = 200
    const lit = [0, 0.1, 0.2, 0.3, 0.4, 0.5].some((t) => decodeHeads(type, u, 1, t)[0].intensity > 0.3)
    expect(lit).toBe(true)
  })
})

describe('Checks', () => {
  it('finds overlapping ranges and tidies them', () => {
    const def = blankDef('par')
    const mode = def.modes[0]
    const sh = mode.channels.find((c) => c.fn === 'shutter')!
    sh.ranges = [{ lo: 0, hi: 20, label: 'Open', kind: 'open' }, { lo: 10, hi: 255, label: 'Strobe', kind: 'strobe' }]
    const problem = checkDef(def, 0).find((p) => p.id === `ranges-${sh.id}`)!
    expect(problem.level).toBe('error')
    const fixed = problem.fix!.apply(def)
    expect(checkDef(fixed, 0).some((p) => p.id === `ranges-${sh.id}`)).toBe(false)
    expect(tidyRanges(sh.ranges)[0].hi).toBe(9)
  })

  it('says when the mode name and the channel count disagree', () => {
    const def = blankDef('par')
    def.modes[0].name = '9-channel'
    expect(checkDef(def, 0).find((p) => p.id === 'count')?.fix).toBeTruthy()
  })
})

describe('SoundSwitch fixtures with cells not named "Cell"', () => {
  const attributes = [0, 1, 2, 3].flatMap((c) => [
    { code: 14, name: `Red ${c + 1}`, width: 1, coarse: c * 3, fine: c * 3 },
    { code: 15, name: `Green ${c + 1}`, width: 1, coarse: c * 3 + 1, fine: c * 3 + 1 },
    { code: 16, name: `Blue ${c + 1}`, width: 1, coarse: c * 3 + 2, fine: c * 3 + 2 }
  ])
  const heads = [0, 1, 2, 3].map((c) => ({ name: `Stick ${c + 1}`, attributes: [c * 3, c * 3 + 1, c * 3 + 2] }))
  const fixture: SoundSwitchFixture = { definitionId: 9, definition: 'Freedom Stick X4', manufacturer: 'Chauvet DJ', universe: 0, address: 1, wheels: {}, mode: { name: '12CH', channels: 12, attributes, heads } }

  it('still treats each part as a cell, and draws it as cells, not a single PAR', () => {
    const type = fixtureTypeFromMode(fixture)
    expect(type.heads!.filter((h) => h.role === 'pixel')).toHaveLength(4)
    expect(type.cells).toBe(4)
    expect(type.spec!.look).toBe('tube')
    expect(type.lookGuessed).toBe(true)
  })

  it('opens in Fixture Studio with its four cells', () => {
    const type = fixtureTypeFromMode(fixture)
    const def = defFromTypes([type], { name: 'Freedom Stick X4', manufacturer: 'Chauvet DJ', source: { kind: 'soundswitch', label: 'SoundSwitch' } })
    expect(def.parts).toHaveLength(4)
    expect(def.modes[0].channels.filter((c) => c.part)).toHaveLength(12)
    expect(typeFromDef(def, 0).cells).toBe(4)
  })
})

describe('Saving a fixture into the show', () => {
  it('stands in for the original type, and Back to the original removes it', async () => {
    const { useStore } = await import('../src/renderer/src/state/store')
    const { useStudio } = await import('../src/renderer/src/state/studio')
    const ss = fixtureTypeFromMode({ definitionId: 7, definition: 'Odd Bar', manufacturer: 'X', universe: 0, address: 1, wheels: {}, mode: { name: '3CH', channels: 3, attributes: [{ code: 14, name: 'Red', width: 1, coarse: 0, fine: 0 }, { code: 15, name: 'Green', width: 1, coarse: 1, fine: 1 }, { code: 16, name: 'Blue', width: 1, coarse: 2, fine: 2 }], heads: [] } })
    registerFixtureTypes([ss])
    useStore.getState().apply('test', (p) => ({ ...p, fixtureTypes: [ss], fixtures: [{ id: 'f1', name: 'Odd 1', typeId: ss.id, universe: 0, address: 1, position: [0, 0, 0], mounting: 'floor', aimTilt: 0 }] }))
    useStudio.getState().openType(ss)
    useStudio.getState().edit((d) => ({ ...d, look: { ...d.look, shape: 'bar', size: [1, 0.1, 0.1] } }))
    await useStudio.getState().save()
    expect(useStore.getState().project.typeOverrides?.[ss.id]).toBeTruthy()
    expect(getFixtureType(ss.id).spec?.look).toBe('bar')
    useStudio.getState().backToOriginal()
    expect(getFixtureType(ss.id).spec?.look).toBe(ss.spec?.look)
  })
})
