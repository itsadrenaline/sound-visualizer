#!/usr/bin/env node
/**
 * The looks catalogue: how real DJ fixtures look (shape, size, LEDs, beam angle,
 * movement, housing colours), so a fixture from SoundSwitch or the Library is drawn
 * like the real one.
 *
 *   node scripts/build-looks.mjs [path to katalog.json]
 *
 * Source: the fixture catalogue of the Show-Designer for SoundSwitch
 * (soundswitch.hochzeitdj.nrw), used with its author's permission. Its sizes and
 * housing variants come from the manufacturers' specs. Written to
 * src/renderer/src/model/looksDb.json, matched by name in catalog.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = process.argv[2] ?? join(root, 'scripts', 'data', 'hdj-katalog.json')
const catalog = JSON.parse(readFileSync(source, 'utf8'))

// The catalogue's shapes, as our looks.
const LOOK = {
  'par-flach': 'par', 'par-topf': 'par', 'par-eckig': 'par', 'par-cob': 'par', pinspot: 'par',
  'uplight-box': 'uplight', 'uplight-puck': 'uplight', 'uplight-zylinder': 'uplight',
  bar: 'bar', 'bar-pixel': 'bar', tube: 'tube', matrix: 'panel', blinder: 'cluster', strobe: 'strobe',
  'mh-spot': 'mover', 'mh-beam': 'mover', 'mh-hybrid': 'mover', 'mh-wash': 'moverWash', 'mh-matrix': 'moverWash',
  'mh-bienenauge': 'beeEye', 'moving-bar': 'movingBar', scanner: 'scanner', 'scanner-trommel': 'derby',
  laser: 'laser', derby: 'derby', 'effekt-box': 'derby', flower: 'derby', 'effekt-kugel': 'sphere',
  spider: 'spider', 'spider-beweglich': 'spider', nebel: 'fog', funken: 'spark'
}
const LAYOUT = { kreis: undefined, raster: 'grid', reihe: 'row', hex: 'hex', ring: 'ring', cob: undefined }
const COLOUR = { schwarz: ['Black', '#18191c'], weiss: ['White', '#e8e8ea'], silber: ['Silver', '#b9bdc3'], chrom: ['Chrome', '#d6dadf'], transparent: ['Clear', '#cfd8e0'] }
const MOUNT = { mover: 'hanging', moverWash: 'hanging', beeEye: 'hanging', movingBar: 'hanging', scanner: 'hanging', spark: 'floor', fog: 'floor', uplight: 'floor' }

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const r3 = (v) => Math.round(v * 1000) / 1000

const brands = {}
for (const [key, b] of Object.entries(catalog.marken)) brands[key] = [...new Set([b.name, ...(b.ss ?? [])].map(norm))]
// Chauvet Professional is its own maker name in some files.
brands.chauvet.push('chauvetprofessional', 'chauvetdj')
brands.adj.push('americandj', 'americandjsupplyinc')

const looks = []
for (const x of catalog.devices) {
  const look = LOOK[x.form]
  if (!look || !x.mm) continue
  let [a, b, c] = x.mm.map((v) => v / 1000)
  // Tubes are listed by length first; ours stand up.
  if (look === 'tube' && a > b) [a, b] = [b, a]
  const beam = Array.isArray(x.winkel) ? x.winkel : x.winkel ? [x.winkel, x.winkel] : undefined
  const leds = x.leds?.n ?? (x.linsen ?? x.raster?.reduce?.((p, q) => p * q, 1))
  const watts = x.leds?.n && x.leds?.w ? x.leds.n * x.leds.w : 0
  const housings = []
  for (const v of x.varianten ?? []) {
    const [label, hex] = COLOUR[v.farbe] ?? [v.name ?? v.id, v.farbe]
    if (!hex?.startsWith('#')) continue
    const name = v.name && !COLOUR[v.farbe] ? v.name : label
    if (!housings.some(([n]) => n === name)) housings.push([name, hex])
  }
  const names = new Set([x.name, ...(x.aliase ?? []), ...(x.ss ?? []), ...(x.varianten ?? []).flatMap((v) => v.ss ?? [])].map(norm).filter((k) => k.length >= 3))
  for (const k of x.keys ?? []) if (k.length >= 4) names.add(norm(k))
  const entry = {
    i: x.id,
    b: x.m,
    n: x.name,
    k: [...names],
    l: look,
    s: [r3(a), r3(b), r3(c)]
  }
  if (beam) entry.w = beam
  if (x.pan) entry.p = x.pan
  if (x.tilt) entry.t = x.tilt
  if (leds && leds > 1) entry.c = leds
  if (LAYOUT[x.anordnung]) entry.y = LAYOUT[x.anordnung]
  if (watts) entry.o = r3(Math.max(0.15, Math.min(3, watts / 100)))
  if (housings.length) entry.h = housings
  // Heads or segments on one fixture (moving bars, multi-head movers).
  const heads = x.koepfe ?? (look === 'movingBar' ? x.segmente : undefined)
  if (heads && heads > 1) entry.m = heads
  if (x.ring) entry.r = 1
  if (x.akku) entry.a = 1
  if (MOUNT[look]) entry.u = MOUNT[look]
  // For setting it up in Fixture Studio: its DMX modes (channel counts), LED colours,
  // kind, and where its manual is.
  if (x.kanaele?.length) entry.ch = x.kanaele
  if (x.leds?.f) entry.f = x.leds.f
  entry.z = x.art
  if (x.quelle) entry.q = x.quelle
  if (x.kg) entry.g = x.kg
  looks.push(entry)
}

const out = { source: 'Show-Designer for SoundSwitch fixture catalogue (soundswitch.hochzeitdj.nrw), used with permission', built: catalog.built, brands, looks }
const file = join(root, 'src', 'renderer', 'src', 'model', 'looksDb.json')
writeFileSync(file, JSON.stringify(out))
console.log(`${looks.length} looks written to ${file} (${Math.round(JSON.stringify(out).length / 1024)} KB)`)
