#!/usr/bin/env node
/**
 * Packs the Open Fixture Library (https://open-fixture-library.org, MIT licence)
 * into one file the app ships with: resources/library/ofl.json.
 *
 *   npm run library                       # downloads the latest library from GitHub, then packs it
 *   npm run library -- /path/to/fixtures  # packs a local copy of OFL's fixtures/ folder
 *
 * Only what the visualizer needs is kept (name, categories, size, lens, wheels,
 * channels, matrix, modes), which makes the file about a third of the original.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manualFixtures } from './manual-fixtures.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources', 'library')

function fetchLatest() {
  const dir = mkdtempSync(join(tmpdir(), 'ofl-'))
  console.log('Downloading the Open Fixture Library from GitHub…')
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'inherit' })
  git('clone', '--depth', '1', '--filter=blob:none', '--sparse', 'https://github.com/OpenLightingProject/open-fixture-library.git', 'repo')
  execFileSync('git', ['sparse-checkout', 'set', 'fixtures'], { cwd: join(dir, 'repo'), stdio: 'inherit' })
  return join(dir, 'repo', 'fixtures')
}

const source = process.argv[2] ?? fetchLatest()
if (!existsSync(join(source, 'manufacturers.json'))) {
  console.error(`No manufacturers.json in ${source}: point this at OFL's fixtures/ folder.`)
  process.exit(1)
}

const KEEP = ['name', 'shortName', 'categories', 'comment', 'links', 'physical', 'wheels', 'availableChannels', 'templateChannels', 'matrix', 'modes']
const manufacturersRaw = JSON.parse(readFileSync(join(source, 'manufacturers.json'), 'utf8'))
const manufacturers = {}
const fixtures = {}
let count = 0

for (const man of readdirSync(source, { withFileTypes: true })) {
  if (!man.isDirectory()) continue
  for (const file of readdirSync(join(source, man.name))) {
    if (!file.endsWith('.json')) continue
    const raw = JSON.parse(readFileSync(join(source, man.name, file), 'utf8'))
    if (raw.redirectTo || !raw.modes?.length) continue // renamed fixtures point elsewhere
    const kept = {}
    for (const k of KEEP) if (raw[k] !== undefined) kept[k] = raw[k]
    // Drop the parts of `physical` we never use.
    if (kept.physical) {
      const { dimensions, weight, power, bulb, lens } = kept.physical
      kept.physical = { dimensions, weight, power, bulb: bulb?.type ? { type: bulb.type } : undefined, lens: lens?.degreesMinMax ? { degreesMinMax: lens.degreesMinMax } : undefined }
    }
    fixtures[`${man.name}/${file.replace(/\.json$/, '')}`] = kept
    manufacturers[man.name] = manufacturersRaw[man.name]?.name ?? man.name
    count++
  }
}

// Fixtures written from manufacturers' manuals (scripts/both-lighting.mjs, betopper.mjs, rockville.mjs).
for (const { maker, slug: makerSlug, fixtures: list } of manualFixtures()) {
  for (const [slug, fixture] of Object.entries(list)) {
    fixtures[`${makerSlug}/${slug}`] = { ...fixture, fromManual: true }
    manufacturers[makerSlug] = maker
    count++
  }
}

mkdirSync(outDir, { recursive: true })
const library = { source: 'Open Fixture Library (MIT)', url: 'https://open-fixture-library.org', built: new Date().toISOString().slice(0, 10), manufacturers, fixtures }
writeFileSync(join(outDir, 'ofl.json'), JSON.stringify(library))
writeFileSync(
  join(outDir, 'LICENSE-OFL.txt'),
  `Fixture data from the Open Fixture Library, https://open-fixture-library.org\n\nMIT License\n\nCopyright (c) 2017 Florian & Felix Edelmann\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`
)
console.log(`Packed ${count} fixtures from ${Object.keys(manufacturers).length} manufacturers into resources/library/ofl.json`)
