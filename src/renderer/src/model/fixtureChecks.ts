/**
 * Problems in a fixture definition, each with a plain explanation and, where
 * there's an obvious one, a fix the Studio can apply in one click (like patch
 * problems in the show). Checks run on every change, so the count in the top bar
 * is always current.
 */
import { FN, defaultRanges, type ChannelDef, type FixtureDef, type ModeDef } from './fixtureDef'

export interface Problem {
  id: string
  level: 'error' | 'warning' | 'info'
  text: string
  /** Channels it's about, to select them. */
  channels?: string[]
  fix?: { label: string; apply: (def: FixtureDef) => FixtureDef }
}

const LIGHT = new Set(['dimmer', 'red', 'green', 'blue', 'white', 'warmWhite', 'coolWhite', 'amber', 'uv', 'lime', 'cyan', 'magenta', 'yellow', 'colorWheel', 'colorMacro', 'laser', 'program'])

/** Change one channel of one mode. */
export function updateChannel(def: FixtureDef, modeId: string, channelId: string, change: (c: ChannelDef) => ChannelDef): FixtureDef {
  return { ...def, modes: def.modes.map((m) => (m.id !== modeId ? m : { ...m, channels: m.channels.map((c) => (c.id === channelId ? change(c) : c)) })) }
}

export function updateMode(def: FixtureDef, modeId: string, change: (m: ModeDef) => ModeDef): FixtureDef {
  return { ...def, modes: def.modes.map((m) => (m.id === modeId ? change(m) : m)) }
}

/** Ranges sorted, inside 0-255 and not overlapping: each one ends where the next starts. */
export function tidyRanges(ranges: ChannelDef['ranges']): ChannelDef['ranges'] {
  const sorted = ranges.map((r) => ({ ...r, lo: Math.max(0, Math.min(255, Math.min(r.lo, r.hi))), hi: Math.max(0, Math.min(255, Math.max(r.lo, r.hi))) })).sort((a, b) => a.lo - b.lo)
  for (let i = 0; i < sorted.length - 1; i++) if (sorted[i].hi >= sorted[i + 1].lo) sorted[i].hi = Math.max(sorted[i].lo, sorted[i + 1].lo - 1)
  return sorted
}

export function checkDef(def: FixtureDef, modeIndex: number): Problem[] {
  const out: Problem[] = []
  const mode = def.modes[modeIndex]
  if (!def.name.trim()) out.push({ id: 'name', level: 'warning', text: 'The fixture has no name yet.' })
  if (!mode) {
    out.push({ id: 'nomode', level: 'error', text: 'There are no modes yet: add channels to make one.' })
    return out
  }
  if (!mode.channels.length) {
    out.push({ id: 'empty', level: 'error', text: `Mode “${mode.name}” has no channels yet.` })
    return out
  }
  const label = (c: ChannelDef) => `Channel ${mode.channels.indexOf(c) + 1} (${c.name})`

  // Nothing makes light.
  if (!mode.channels.some((c) => LIGHT.has(c.fn))) {
    out.push({ id: 'dark', level: 'error', text: 'Nothing in this mode makes light: give at least one channel a job like Dimmer or Red.' })
  }

  // The mode's name says a different channel count.
  const named = /(\d+)\s*-?\s*(?:ch\b|channel)/i.exec(mode.name)
  if (named && Number(named[1]) !== mode.channels.length) {
    out.push({
      id: 'count', level: 'warning', text: `Mode “${mode.name}” has ${mode.channels.length} channels, but its name says ${named[1]}. A channel may be missing or extra.`,
      fix: { label: `Rename it “${mode.channels.length}-channel”`, apply: (d) => updateMode(d, mode.id, (m) => ({ ...m, name: m.name.replace(named[0], `${m.channels.length}-channel`) })) }
    })
  }

  // Channels we don't know the job of.
  const missing = mode.channels.filter((c) => c.confidence === 'missing')
  if (missing.length) out.push({ id: 'missing', level: 'warning', text: `${missing.length} channel${missing.length === 1 ? '' : 's'} still need${missing.length === 1 ? 's' : ''} a job (the manual page may be missing).`, channels: missing.map((c) => c.id) })

  const guessed = mode.channels.filter((c) => c.confidence === 'guessed')
  if (guessed.length) out.push({ id: 'guessed', level: 'info', text: `${guessed.length} channel${guessed.length === 1 ? ' was' : 's were'} guessed or filled in. Run the tests to check them.`, channels: guessed.map((c) => c.id) })

  mode.channels.forEach((c, i) => {
    // A fine channel needs its coarse channel before it.
    if (c.fine) {
      const coarse = mode.channels.slice(0, i).reverse().find((x) => x.fn === c.fn && x.part === c.part && !x.fine)
      if (!coarse) {
        out.push({
          id: `fine-${c.id}`, level: 'error', text: `${label(c)} is marked as a fine channel, but there's no ${FN[c.fn].label} channel before it.`, channels: [c.id],
          fix: { label: 'Make it a normal channel', apply: (d) => updateChannel(d, mode.id, c.id, (x) => ({ ...x, fine: false })) }
        })
      }
    }
    // Ranges outside 0-255, back to front, or overlapping.
    const bad = c.ranges.some((r) => r.lo < 0 || r.hi > 255 || r.lo > r.hi)
    const sorted = [...c.ranges].sort((a, b) => a.lo - b.lo)
    const overlap = sorted.some((r, k) => k > 0 && r.lo <= sorted[k - 1].hi)
    if (bad || overlap) {
      out.push({
        id: `ranges-${c.id}`, level: 'error', text: `${label(c)}: its value ranges ${overlap ? 'overlap' : 'go outside 0–255'}, so some values mean two things.`, channels: [c.id],
        fix: { label: 'Tidy the ranges', apply: (d) => updateChannel(d, mode.id, c.id, (x) => ({ ...x, ranges: tidyRanges(x.ranges) })) }
      })
    }
    // Channels whose meaning lives in their ranges, with none.
    const style = FN[c.fn].style
    if (!c.fine && c.ranges.length === 0 && (style === 'shutter' || style === 'slots' || style === 'program')) {
      out.push({
        id: `noranges-${c.id}`, level: 'warning', text: `${label(c)} has no value ranges, so the twin can only guess what each value does.`, channels: [c.id],
        fix: { label: 'Use the usual ranges', apply: (d) => updateChannel(d, mode.id, c.id, (x) => ({ ...x, ranges: defaultRanges(x.fn), confidence: x.confidence === 'sure' ? 'guessed' : x.confidence })) }
      })
    }
    if (c.fn === 'colorWheel' && c.ranges.length && !c.ranges.some((r) => r.color)) {
      out.push({
        id: `nocolors-${c.id}`, level: 'warning', text: `${label(c)}: the colour wheel's slots have no colours, so the twin stays white.`, channels: [c.id],
        fix: { label: 'Use the usual colours', apply: (d) => updateChannel(d, mode.id, c.id, (x) => ({ ...x, ranges: defaultRanges('colorWheel') })) }
      })
    }
  })

  // The same job twice on one part: only the first counts.
  const seen = new Map<string, ChannelDef>()
  for (const c of mode.channels) {
    if (c.fine || !FN[c.fn].head) continue
    const key = `${c.part}|${FN[c.fn].head}`
    const first = seen.get(key)
    if (first) {
      out.push({
        id: `dup-${c.id}`, level: 'warning', text: `${label(c)} does the same job as ${label(first)} on the same part, so the twin ignores it. Should it be a fine channel, or drive another part?`, channels: [c.id, first.id],
        fix: { label: 'Make it the fine channel', apply: (d) => updateChannel(d, mode.id, c.id, (x) => ({ ...x, fine: true })) }
      })
    } else seen.set(key, c)
  }

  // A moving head with nothing to move it.
  if ((def.kind === 'wash' || def.kind === 'spot' || def.kind === 'beam') && !mode.channels.some((c) => c.fn === 'pan' || c.fn === 'tilt')) {
    out.push({ id: 'nomove', level: 'warning', text: 'This is set up as a moving head, but this mode has no pan or tilt channel.' })
  }

  // Parts no mode uses.
  const used = new Set(def.modes.flatMap((m) => m.channels.map((c) => c.part)))
  const unused = def.parts.filter((p) => !used.has(p.id))
  if (unused.length) {
    out.push({
      id: 'unusedparts', level: 'info', text: `${unused.length} part${unused.length === 1 ? ' has' : 's have'} no channels in any mode.`,
      fix: { label: 'Remove them', apply: (d) => ({ ...d, parts: d.parts.filter((p) => used.has(p.id)) }) }
    })
  }
  return out
}
