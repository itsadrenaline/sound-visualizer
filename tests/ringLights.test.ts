import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fixtureTypeFromOfl } from '../src/renderer/src/model/oflImport'

const lib = JSON.parse(readFileSync(new URL('../resources/library/ofl.json', import.meta.url), 'utf8'))
const type = (key: string, mode: number) => fixtureTypeFromOfl(key, 'Betopper', lib.fixtures[key], mode)
const heads = (key: string, mode: number) => type(key, mode).heads ?? []

describe('LED rings round moving-head lenses', () => {
  it('LM1915P 30ch: the lens rings are their own part, not the beam colour', () => {
    const h = heads('betopper/lm1915p', 0)
    const main = h.find((x) => x.name === 'Main')!
    const rings = h.find((x) => x.name === 'Lens Ring')!
    expect(rings.role).toBe('halo')
    expect(Object.keys(rings.ch).sort()).toEqual(['blue', 'dimmer', 'green', 'red', 'shutter'])
    // Main colour is channels 9-11, the ring colour 18-20 (0-based 8-10 and 17-19).
    expect(main.ch.red?.coarse).toBe(8)
    expect(rings.ch.red?.coarse).toBe(17)
    expect(h.find((x) => x.name === 'Halo')?.role).toBe('halo')
  })

  it('LM1915P 38ch: zones light the beam, the rings stay separate', () => {
    const h = heads('betopper/lm1915p', 1)
    expect(h.find((x) => x.name === 'Main')!.ch.red).toBeUndefined()
    expect(h.filter((x) => x.role === 'pixel').map((x) => x.name)).toEqual(['Zone 1', 'Zone 2', 'Zone 3'])
    expect(h.find((x) => x.name === 'Lens Ring')!.ch.red?.coarse).toBe(25)
  })

  it('LM1915P 99ch: 19 lens rings, each dimmed and strobed by the aux master, and all 19 LEDs drawn', () => {
    const t = type('betopper/lm1915p', 2)
    const h = t.heads ?? []
    const each = h.filter((x) => /^Lens Ring \d+$/.test(x.name))
    expect(each).toHaveLength(19)
    expect(each.every((x) => x.role === 'halo' && x.ch.dimmer?.coarse === 15 && x.ch.shutter?.coarse === 16)).toBe(true)
    expect(each[0].ch.red?.coarse).toBe(42)
    expect(each[18].ch.blue?.coarse).toBe(98)
    expect(h.filter((x) => x.role === 'pixel')).toHaveLength(3)
    expect(t.spec?.leds).toBe(19)
  })

  it('LM1915R: the halo ring is controlled in 24 and 32 channels, and drawn (unlit) in 15', () => {
    expect(heads('betopper/lm1915r', 0).some((x) => x.role === 'halo')).toBe(false)
    expect(type('betopper/lm1915r', 0).spec?.halo).toBe(true)
    for (const m of [1, 2]) expect(heads('betopper/lm1915r', m).find((x) => x.name === 'Halo')?.ch.red).toBeDefined()
    expect(type('betopper/lm1915r', 2).spec?.leds).toBe(19)
  })
})
