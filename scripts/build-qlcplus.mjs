#!/usr/bin/env node
/**
 * Adds the QLC+ fixture library (https://www.qlcplus.org, Apache License 2.0) to
 * the app's Library: resources/library/qlcplus.json.
 *
 *   node scripts/build-qlcplus.mjs                        # downloads QLC+'s fixtures from GitHub
 *   node scripts/build-qlcplus.mjs /path/to/qlcplus/resources/fixtures
 *
 * Each .qxf file is read with the same reader the app uses for importing QLC+
 * files (src/renderer/src/model/qxf.ts) and stored as a Fixture Studio
 * definition. Fixtures the Open Fixture Library already has are skipped, so the
 * Library doesn't list the same light twice.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources', 'library')

function fetchLatest() {
  const dir = mkdtempSync(join(tmpdir(), 'qlcplus-'))
  console.log('Downloading the QLC+ fixture library from GitHub…')
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'inherit' })
  git('clone', '--depth', '1', '--filter=blob:none', '--sparse', 'https://github.com/mcallegari/qlcplus.git', 'repo')
  execFileSync('git', ['sparse-checkout', 'set', 'resources/fixtures'], { cwd: join(dir, 'repo'), stdio: 'inherit' })
  return join(dir, 'repo', 'resources', 'fixtures')
}

const source = process.argv[2] ?? fetchLatest()
if (!existsSync(source)) {
  console.error(`No folder at ${source}: point this at QLC+'s resources/fixtures folder.`)
  process.exit(1)
}

// The app's own QLC+ reader, bundled for Node.
const bundleDir = mkdtempSync(join(tmpdir(), 'qxf-'))
const bundle = join(bundleDir, 'qxf.mjs')
await build({ entryPoints: [join(root, 'src/renderer/src/model/qxf.ts')], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' })
const { defFromQxf, compactDef } = await import(pathToFileURL(bundle).href)
rmSync(bundleDir, { recursive: true, force: true })

// What the Open Fixture Library already has: "maker|model", loosely.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
const ofl = JSON.parse(readFileSync(join(outDir, 'ofl.json'), 'utf8'))
const known = new Set()
for (const [key, fx] of Object.entries(ofl.fixtures)) {
  const maker = ofl.manufacturers[key.split('/')[0]] ?? key.split('/')[0]
  known.add(`${norm(maker).slice(0, 6)}|${norm(fx.name)}`)
}

const fixtures = {}
const entries = []
let read = 0
let skipped = 0
let failed = 0
for (const maker of readdirSync(source, { withFileTypes: true })) {
  if (!maker.isDirectory()) continue
  for (const file of readdirSync(join(source, maker.name))) {
    if (!file.endsWith('.qxf')) continue
    try {
      const { def, categories, power, weight } = defFromQxf(readFileSync(join(source, maker.name, file), 'utf8'))
      read++
      if (known.has(`${norm(def.manufacturer).slice(0, 6)}|${norm(def.name)}`)) {
        skipped++
        continue
      }
      const key = `qlc/${maker.name}/${file.replace(/\.qxf$/, '')}`
      fixtures[key] = compactDef(def)
      entries.push({ key, manufacturer: def.manufacturer, name: def.name, categories, modes: def.modes.map((m) => ({ name: m.name, channels: m.channels.length })), size: def.look.size, power, weight, source: 'qlc' })
    } catch (error) {
      failed++
      console.warn(`Skipped ${maker.name}/${file}: ${error.message}`)
    }
  }
}

const library = { source: 'QLC+ fixture library (Apache License 2.0)', url: 'https://www.qlcplus.org', built: new Date().toISOString().slice(0, 10), entries, fixtures }
writeFileSync(join(outDir, 'qlcplus.json'), JSON.stringify(library))
writeFileSync(
  join(outDir, 'LICENSE-QLCPLUS.txt'),
  `Fixture definitions from the QLC+ project, https://www.qlcplus.org\nhttps://github.com/mcallegari/qlcplus/tree/master/resources/fixtures\n\nCopyright (c) Massimo Callegari and the QLC+ contributors.\n\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use these files except in compliance with the License. You may obtain a copy of the License at\n\n    http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.\n\nChanges: the definitions were converted from QLC+'s .qxf format into Sound Visualizer's fixture format (channels, modes, cells, ranges and physical size); fixtures also in the Open Fixture Library were left out.\n`
)
console.log(`Read ${read} QLC+ fixtures: added ${entries.length}, skipped ${skipped} already in the Open Fixture Library${failed ? `, ${failed} unreadable` : ''}.`)
