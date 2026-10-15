import { describe, expect, it } from 'vitest'
import { FN, KIND_ORDER, normaliseDef, typeFromDef, type ChannelFn, type FixtureDef } from '../src/renderer/src/model/fixtureDef'
import { addRing, cellsStart, guessKind, modeFromStart, startWithCount, startsFor, withKind } from '../src/renderer/src/model/fixtureStarts'
import { defToOfl } from '../src/renderer/src/model/fixtureFiles'
import { checkDef } from '../src/renderer/src/model/fixtureChecks'
import { defFromAi } from '../src/renderer/src/state/fixtureAi'

describe('Starting layouts', () => {
  it('every kind has several layouts, fewest channels first, each building a working fixture', () => {
    for (const kind of KIND_ORDER) {
      const starts = startsFor(kind)
      expect(starts.length, kind).toBeGreaterThanOrEqual(3)
      expect(starts.some((s) => s.common), kind).toBe(true)
      for (let i = 1; i < starts.length; i++) expect(starts[i].count).toBeGreaterThanOrEqual(starts[i - 1].count)
      for (const s of starts) {
        const def = s.build('Test', 'Maker')
        expect(def.kind).toBe(kind)
        expect(def.modes[0].channels.length).toBe(s.count)
        // Blank starting points are meant to be filled in: their channels are "missing" on purpose.
        if (!s.label.startsWith('Blank')) expect(checkDef(def, 0).filter((p) => p.level === 'error'), `${kind} ${s.label}`).toEqual([])
        expect(() => typeFromDef(def, 0)).not.toThrow()
      }
    }
  })

  it('offers bigger sizes like 48- and 50-channel bars and tubes', () => {
    const bar = startsFor('bar').map((s) => s.count)
    expect(bar).toContain(3)
    expect(bar).toContain(24)
    expect(bar).toContain(48)
    expect(startsFor('tube').map((s) => s.count)).toContain(96)
  })

  it('any channel count: a bar splits into cells, a moving head pads to the count', () => {
    const r = startWithCount('bar', 50)
    expect(r.def.modes[0].channels.length).toBe(50)
    expect(new Set(r.def.parts.map((p) => p.cell)).size).toBe(16)
    expect(r.def.modes[0].channels.slice(0, 2).map((c) => c.fn)).toEqual(['dimmer', 'shutter'])
    const w = startWithCount('wash', 75)
    expect(w.def.modes[0].channels.length).toBe(75)
    expect(w.def.modes[0].channels.at(-1)!.confidence).toBe('missing')
  })

  it('other kinds: fog, effects, dimmer packs and something else', () => {
    const fog = startsFor('fog')[0].build()
    const t = typeFromDef(fog, 0)
    expect(t.spec!.look).toBe('fog')
    expect(t.heads!.some((h) => h.ch.fog)).toBe(true)
    const dim = startWithCount('dimmer', 6).def
    expect(dim.modes[0].channels.every((c) => c.fn === 'dimmer')).toBe(true)
    expect(dim.parts.map((p) => p.name)).toEqual(['Light 1', 'Light 2', 'Light 3', 'Light 4', 'Light 5', 'Light 6'])
    expect(guessKind(dim)).toBe('dimmer')
    expect(guessKind(fog)).toBe('fog')
    const other = startWithCount('other', 5).def
    expect(other.modes[0].channels.every((c) => c.confidence === 'missing')).toBe(true)
  })

  it('cells × colours with a master', () => {
    const def = cellsStart('tube', 12, 'RGBW', true)
    expect(def.modes[0].channels.length).toBe(2 + 12 * 4)
    expect(def.look.layout?.kind).toBe('column')
  })
})

describe('LED rings', () => {
  it('adds a ring part with its own colour channels, which the 3D view draws as a halo', () => {
    const wash = startsFor('wash')[0].build()
    const { def, added } = addRing(wash, 0, 'RGB', true)
    expect(added.length).toBe(5)
    const ring = def.parts.find((p) => p.role === 'halo')!
    expect(ring.name).toBe('LED ring')
    const fns = def.modes[0].channels.filter((c) => c.part === ring.id).map((c) => c.fn)
    expect(fns).toEqual(['red', 'green', 'blue'])
    const fx = def.modes[0].channels.find((c) => c.fn === 'colorFx')!
    expect(fx.targets).toEqual([ring.id])
    const t = typeFromDef(def, 0)
    expect(t.heads!.some((h) => h.role === 'halo' && h.ch.red)).toBe(true)
    expect(t.spec!.halo).toBe(true)
    expect(() => defToOfl(def)).not.toThrow()
  })

  it('Claude can describe a ring part', () => {
    const { def } = defFromAi(
      { name: 'X', manufacturer: 'Y', kind: 'wash', modes: [{ name: '5ch', channels: [{ number: 1, name: 'Pan', function: 'pan' }, { number: 2, name: 'Tilt', function: 'tilt' }, { number: 3, name: 'Ring R', function: 'red', part: 'ring' }, { number: 4, name: 'Ring G', function: 'green', part: 'ring' }, { number: 5, name: 'Ring B', function: 'blue', part: 'ring' }] }] },
      { kind: 'scratch', label: 'test' }
    )
    expect(def.parts).toHaveLength(1)
    expect(def.parts[0].role).toBe('halo')
  })
})

describe('Modes from layouts, kinds and safety', () => {
  it('a layout as another mode reuses the same cells', () => {
    const bar = startsFor('bar').find((s) => s.count === 24)!.build()
    const whole = startsFor('bar').find((s) => s.count === 3)!.build()
    const fromCells = startsFor('bar').find((s) => s.label.startsWith('Dimmer, strobe + 8'))!.build()
    expect(modeFromStart(bar, whole).parts).toHaveLength(0)
    const r = modeFromStart(bar, fromCells)
    expect(r.parts).toHaveLength(0)
    expect(r.channels.filter((c) => c.part).every((c) => bar.parts.some((p) => p.id === c.part))).toBe(true)
  })

  it('works out the kind from channels', () => {
    expect(guessKind(startsFor('spot')[1].build())).toBe('spot')
    expect(guessKind(startsFor('wash')[0].build())).toBe('wash')
    expect(guessKind(cellsStart('bar', 8, 'RGB', false))).toBe('bar')
    expect(guessKind(startsFor('par')[0].build())).toBe('par')
    expect(withKind(cellsStart('bar', 8, 'RGB', false), 'tube').look.layout?.kind).toBe('column')
  })

  it('a channel job from a newer version opens as Other, keeping its name', () => {
    const def = startsFor('par')[0].build()
    const raw = JSON.parse(JSON.stringify(def)) as FixtureDef
    ;(raw.modes[0].channels[0] as { fn: string }).fn = 'quantumBeam'
    const fixed = normaliseDef(raw)
    expect(fixed.modes[0].channels[0].fn).toBe('other')
    expect(fixed.modes[0].channels[0].name).toBe(def.modes[0].channels[0].name)
    expect(Object.keys(FN) as ChannelFn[]).toContain('beamShaper')
  })
})
