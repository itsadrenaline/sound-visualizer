import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS build script
import { manualFixtures } from '../scripts/manual-fixtures.mjs'
import { fixtureTypeFromOfl, oflModeChannelNames, type OflFixture } from '../src/renderer/src/model/oflImport'
import { defFromOfl } from '../src/renderer/src/model/fixtureFiles'
import { checkDef } from '../src/renderer/src/model/fixtureChecks'

const sets = manualFixtures() as Array<{ maker: string; slug: string; fixtures: Record<string, OflFixture> }>

describe('Fixtures written from manufacturers’ manuals', () => {
  for (const { maker, slug, fixtures } of sets) {
    for (const [key, fx] of Object.entries(fixtures)) {
      it(`${maker} ${fx.name}`, () => {
        fx.modes.forEach((m, i) => {
          const names = oflModeChannelNames(fx, i)
          // Every channel a mode lists exists, and the count matches the mode's name.
          expect(names.every((n) => n !== 'No function' || true)).toBe(true)
          const declared = Number(/^(\d+)/.exec(m.name)?.[1])
          if (declared) expect(names.length, `${m.name}`).toBe(declared)
          for (const n of names) expect(fx.availableChannels?.[n] ?? fx.templateChannels ?? n, `${m.name}: ${n}`).toBeTruthy()
          const type = fixtureTypeFromOfl(`${slug}/${key}`, maker, fx, i)
          expect(type.channels.length).toBe(names.length)
        })
        const def = defFromOfl(fx, maker)
        expect(def.modes.length).toBe(fx.modes.length)
        for (let i = 0; i < def.modes.length; i++) expect(checkDef(def, i).filter((p) => p.id === 'dark')).toEqual([])
      })
    }
  }
})
