import { it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseSoundSwitchVenue } from '../../src/shared/soundswitch'
it('dump', () => {
  for (const [name, p] of [['2025 Adrenaline Lighting', '/mnt/user-data/uploads/Downloads/2025 Adrenaline Lighting.ssproj'], ['default', '/mnt/user-data/uploads/SoundSwitch/default.ssproj']]) {
    const v = parseSoundSwitchVenue(new Uint8Array(readFileSync(p + '/SoundSwitchVenues.bin')))
    writeFileSync(`/tmp/claude-0/-home-claude/26adf877-63df-5b1c-92b6-6bff05d81811/scratchpad/promo/data/${name}.json`, JSON.stringify({ name, fixtures: v.fixtures }))
    const c: Record<string, number> = {}
    for (const f of v.fixtures) c[f.manufacturer + ' / ' + f.definition] = (c[f.manufacturer + ' / ' + f.definition] ?? 0) + 1
    console.log(name, v.fixtures.length, JSON.stringify(c))
  }
})
