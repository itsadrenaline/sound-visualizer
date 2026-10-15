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
