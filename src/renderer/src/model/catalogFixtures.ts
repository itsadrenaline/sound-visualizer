/**
 * Fixtures the looks catalogue knows but the fixture libraries don't: we know what
 * they look like and how many channels each DMX mode has, not what the channels do.
 * In the Library they open in Fixture Studio, set up with their real look and modes,
 * ready to fill in from the manual (simple ones with their colours guessed already).
 */
import { allLooks, lookBrandName, lookEntry, specOfLook, type LookEntry } from './catalog'
import { blankDef, makeChannel, newKey, type ChannelDef, type ChannelFn, type FixtureDef, type FixtureKind } from './fixtureDef'
import type { LibraryEntry } from './oflImport'

const KIND_OF: Record<string, FixtureKind> = {
  par: 'par', uplight: 'uplight', bar: 'bar', tube: 'tube', panel: 'panel', cluster: 'cluster', strobe: 'strobe',
  moverWash: 'wash', beeEye: 'beeEye', movingBar: 'movingBar', scanner: 'scanner', laser: 'laser', derby: 'effect',
  sphere: 'effect', spider: 'effect', fog: 'fog', spark: 'spark'
}
const CATEGORY: Record<FixtureKind, string[]> = {
  par: ['Color Changer'], uplight: ['Color Changer'], wash: ['Moving Head'], spot: ['Moving Head'], beam: ['Moving Head'], beeEye: ['Moving Head'],
  movingBar: ['Moving Head'], scanner: ['Scanner'], spark: ['Effect'], bar: ['Pixel Bar'], tube: ['Pixel Bar'], panel: ['Matrix'], acrylic: ['Color Changer'],
  cluster: ['Color Changer', 'Blinder'], gigbar: ['Effect'], strip: ['Color Changer'], strobe: ['Strobe'], laser: ['Laser'], effect: ['Effect'],
  fog: ['Smoke'], sfx: ['Other'], dimmer: ['Dimmer'], string: ['Pixel Bar'], other: ['Other']
}

function kindOf(e: LookEntry): FixtureKind {
  if (e.l === 'mover') return e.z === 'mh-beam' ? 'beam' : e.z === 'mh-wash' ? 'wash' : 'spot'
  return KIND_OF[e.l] ?? 'other'
}

/** The colour channels its LEDs have, in the usual order ("RGBWA+UV" → red … uv). */
function colours(f: string | undefined): ChannelFn[] {
  if (!f) return []
  const out: ChannelFn[] = []
  const s = f.toUpperCase()
  for (const [letter, fn] of [['R', 'red'], ['G', 'green'], ['B', 'blue'], ['W', 'white'], ['A', 'amber'], ['L', 'lime']] as const) if (s.replace('UV', '').includes(letter)) out.push(fn)
  if (s.includes('UV')) out.push('uv')
  return out
}

/** A first guess at a simple mode: just colours, or a dimmer and colours (and a strobe). */
function guessChannels(kind: FixtureKind, n: number, cols: ChannelFn[]): ChannelFn[] | null {
  if (!['par', 'uplight', 'bar', 'tube', 'panel', 'cluster', 'strobe'].includes(kind) || !cols.length) return null
  if (n === cols.length) return cols
  if (n === cols.length + 1) return ['dimmer', ...cols]
  if (n === cols.length + 2) return ['dimmer', ...cols, 'shutter']
  return null
}

/** The catalogue fixtures not in the libraries, as Library entries ("cat/<id>"). */
export function catalogEntries(existing: LibraryEntry[]): LibraryEntry[] {
  const known = new Set<string>()
  for (const e of existing) {
    const hit = lookEntry(e.name, e.manufacturer)
    if (hit) known.add(hit.i)
  }
  return allLooks()
    .filter((e) => !known.has(e.i) && e.ch?.length)
    .map((e) => {
      const kind = kindOf(e)
      return {
        key: `cat/${e.i}`,
        manufacturer: lookBrandName(e.b),
        name: e.n,
        categories: CATEGORY[kind],
        modes: (e.ch ?? []).map((n) => ({ name: `${n}-channel`, channels: n })),
        size: e.s,
        weight: e.g,
        bulb: e.f ? `LEDs: ${e.f}` : undefined,
        source: 'catalog' as const
      }
    })
}

/** A Fixture Studio definition of a catalogue fixture: its real look, its modes, channels to fill in. */
export function defFromCatalog(key: string): FixtureDef | null {
  const id = key.replace(/^cat\//, '')
  const e = allLooks().find((x) => x.i === id)
  if (!e) return null
  const kind = kindOf(e)
  const spec = specOfLook(e)
  const base = blankDef(kind, e.n, lookBrandName(e.b))
  const cols = colours(e.f)
  const modes = (e.ch?.length ? e.ch : [base.modes[0]?.channels.length ?? 1]).map((n) => {
    const guess = guessChannels(kind, n, cols)
    const channels: ChannelDef[] = guess
      ? guess.map((fn) => makeChannel(fn, null, { confidence: 'guessed' }))
      : Array.from({ length: n }, (_, k) => ({ id: newKey('c'), name: `Channel ${k + 1}`, fn: 'other' as ChannelFn, part: null, ranges: [], confidence: 'missing' as const, note: 'Set what it does from the manual.' }))
    return { id: newKey('m'), name: `${n}-channel`, channels }
  })
  return {
    ...base,
    parts: [],
    look: { ...base.look, shape: spec.look, size: spec.size, beam: spec.beam, output: spec.output, mount: spec.mount, leds: spec.leds, layout: spec.layout, bodyColor: spec.bodyColor, pan: spec.pan, tilt: spec.tilt },
    modes,
    source: { kind: 'web', label: 'Show-Designer fixture catalogue: look and modes', url: e.q },
    manualUrl: e.q
  }
}
