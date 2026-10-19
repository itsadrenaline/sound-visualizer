/**
 * Adds (or refreshes) the fixtures written from manufacturers' manuals in the
 * bundled library, without downloading the Open Fixture Library again:
 *
 *   node scripts/add-brands.mjs
 *
 * build-library.mjs does the same when it rebuilds everything.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manualFixtures } from './manual-fixtures.mjs'

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'library', 'ofl.json')
const library = JSON.parse(readFileSync(file, 'utf8'))
let added = 0
for (const { maker, slug: makerSlug, fixtures } of manualFixtures()) {
  // Our own entries for this maker are replaced; Open Fixture Library ones are kept.
  for (const key of Object.keys(library.fixtures)) if (key.startsWith(`${makerSlug}/`) && library.fixtures[key].fromManual) delete library.fixtures[key]
  for (const [slug, fixture] of Object.entries(fixtures)) {
    library.fixtures[`${makerSlug}/${slug}`] = { ...fixture, fromManual: true }
    added++
  }
  library.manufacturers[makerSlug] = maker
}
writeFileSync(file, JSON.stringify(library))
console.log(`Added ${added} fixtures written from manufacturers' manuals.`)

// --- The QLC+ library: fixtures written from the manuals replace theirs, and a few
// looks the QLC+ reader got wrong (every multi-head "Effect" was drawn as a GigBar).
const qlcFile = join(dirname(file), 'qlcplus.json')
const qlc = JSON.parse(readFileSync(qlcFile, 'utf8'))
const REPLACED = ['qlc/Laserworld/Laserworld-EL-900RGB']
const LOOKS = {
  'qlc/American_DJ/American-DJ-Asteroid-1200': ['effect', 'derby', 'floor'],
  'qlc/American_DJ/American-DJ-Hyper-Gem-LED': ['effect', 'derby', 'floor'],
  'qlc/American_DJ/American-DJ-Revo-4-256': ['effect', 'derby', 'floor'],
  'qlc/Chauvet/Chauvet-Hive': ['effect', 'derby', 'floor'],
  'qlc/Chauvet/Chauvet-Wash-FX-Hex': ['par', 'flood', 'floor'],
  'qlc/Chauvet/Chauvet-Wash-FX2': ['par', 'flood', 'floor'],
  'qlc/beamZ/beamZ-SparkleWall': ['panel', 'curtain', 'hanging']
}
let fixed = 0
for (const key of REPLACED) {
  if (qlc.fixtures[key]) fixed++
  delete qlc.fixtures[key]
  qlc.entries = qlc.entries.filter((e) => e.key !== key)
}
for (const [key, [kind, shape, mount]] of Object.entries(LOOKS)) {
  const fx = qlc.fixtures[key]
  if (!fx || (fx.k === kind && fx.l.shape === shape)) continue
  fx.k = kind
  fx.l = { ...fx.l, shape, mount, ...(shape === 'flood' || shape === 'derby' ? { beam: fx.l.beam[0] === 11 && fx.l.beam[1] === 19 ? [30, 30] : fx.l.beam } : {}) }
  fixed++
}
writeFileSync(qlcFile, JSON.stringify(qlc))
console.log(`Corrected ${fixed} QLC+ library fixtures.`)
