/**
 * Reads a DMX chart typed or pasted from a manual, the way they're usually
 * printed:
 *
 *   13  Warm White COB effect   0-4  no function
 *                               5-11 warm white COB effect 1
 *   ****  Data increases by 6
 *   17  R1  0-255  The first light is red (Auxiliary light)
 *   ......
 *   35  R6  0-255  The seventh light is red
 *
 * It finds the channels, what each does, which cell it belongs to and its value
 * ranges; fills in the rows manuals skip ("data increases by 6", "......"), and
 * says what it filled in or couldn't read, so the Studio can mark those rows.
 * No AI needed; with Claude connected, photos and PDFs are read too (fixtureAi.ts).
 */
import { FN, newKey, type ChannelDef, type ChannelFn, type FixtureDef, type FixtureKind, type PartDef, type RangeDef, blankDef } from './fixtureDef'
import type { ProgramPattern } from './heads'

export interface ParsedChart {
  def: FixtureDef
  /** Plain notes on what was filled in, guessed or couldn't be read. */
  notes: string[]
}

interface RawChannel {
  number: number
  name: string
  text: string[]
  ranges: Array<{ lo: number; hi: number; label: string }>
  filled?: string
  /** "...ranges after this one were filled in" markers. */
  gapAfter?: number[]
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth']

const RANGE_RE = /^(\d{1,3})\s*(?:-|–|—|~|to)\s*(\d{1,3})\b\s*[:.=]?\s*(.*)$/i
const CHANNEL_RE = /^(?:ch(?:annel)?\.?\s*|#)?(\d{1,3})\s*[:.)\]-]?\s+(.+)$/i
const ELISION_RE = /^[\s.…·*]+$|data increases|increase[sd]? by|and so on|etc\.?$|^\.{3,}|^…/i

/** "Warm White COB effect" → program, "R1" → red, "Speed adjustment" → speed... */
export function fnFromText(text: string, context: { afterProgram?: boolean } = {}): ChannelFn | null {
  const t = text.toLowerCase().replace(/[()]/g, ' ')
  const rules: Array<[RegExp, ChannelFn]> = [
    [/no function|reserved|^null\b|^none\b|not used|unused/, 'none'],
    [/pan.*fine|pan.*16.?bit|pan\s*\(?lsb/, 'pan'],
    [/tilt.*fine|tilt.*16.?bit|tilt\s*\(?lsb/, 'tilt'],
    [/(pan|tilt|p\/t|x\/y|xy|motor|vector).*speed|speed.*(pan|tilt|p\/t|motor)/, 'panTiltSpeed'],
    [/(pan|tilt|p\/t|movement|position).*(macro|effect|program|pattern|shape)|auto.?move/, 'positionFx'],
    [/(endless|continuous|infinite|360).*pan|pan.*(endless|continuous|infinite|rotation)/, 'panRotation'],
    [/(endless|continuous|infinite|360).*tilt|tilt.*(endless|continuous|infinite|rotation)/, 'tiltRotation'],
    [/\bpan\b|horizontal|^x\b|x-?axis/, 'pan'],
    [/\btilt\b|vertical|^y\b|y-?axis/, 'tilt'],
    [/gobo.*(rot|spin|turn)/, 'goboRotation'],
    [/gobo/, 'gobo'],
    [/prism.*(rot|spin|turn)/, 'prismRotation'],
    [/prism/, 'prism'],
    [/zoom/, 'zoom'],
    [/focus/, 'focus'],
    [/iris/, 'iris'],
    [/frost/, 'frost'],
    [/blade|framing|beam shaper|\bshaper\b/, 'beamShaper'],
    [/animation/, 'animation'],
    [/bubble|snow|spark|co2|confetti|flame|pyro/, 'specialFx'],
    [/dimm\w*\s*(curve|mode|speed|response)/, 'dimmerMode'],
    [/\bhue\b/, 'hue'],
    [/saturation/, 'saturation'],
    [/indigo/, 'indigo'],
    [/colou?r\s*(chase|fade|effects?)/, 'colorFx'],
    [/laser/, 'laser'],
    [/sound|sensitiv|\bmic\b|audio/, 'sound'],
    [/strob|shutter|flash/, 'shutter'],
    [/colou?r\s*temp|cct|kelvin/, 'colorTemp'],
    [/colou?r\s*wheel/, 'colorWheel'],
    [/colou?r\s*(macro|preset|mix(ing)?\s*mode|select|choice|chang|jump|effect)|^colou?rs?$|^colou?r\b/, 'colorMacro'],
    [/\beffects?\b|program|\bauto\b|\bshow\b|pattern|chase|built.?in/, 'program'],
    [/warm\s*white|\bww\b|amber\s*white/, 'warmWhite'],
    [/cool\s*white|cold\s*white|\bcw\b/, 'coolWhite'],
    [/\bred\b|^r\d*$|^r\s*\d+\b/, 'red'],
    [/\bgreen\b|^g\d*$|^g\s*\d+\b/, 'green'],
    [/\bblue\b|^b\d*$|^b\s*\d+\b/, 'blue'],
    [/\bwhite\b|^w\d*$|^w\s*\d+\b/, 'white'],
    [/\bamber\b|^a\d*$/, 'amber'],
    [/\buv\b|ultra.?violet|purple light/, 'uv'],
    [/\blime\b/, 'lime'],
    [/\bcyan\b/, 'cyan'],
    [/\bmagenta\b/, 'magenta'],
    [/\byellow\b/, 'yellow'],
    [/rotat|spin|turn/, 'rotation'],
    [/fog|smoke|haze/, 'fog'],
    [/\bfan\b/, 'fan'],
    [/reset|control|function select|mode select|display|dimmer curve|lamp/, 'control'],
    [/master|dimm|intensity|brightness|total dim/, 'dimmer'],
    [/speed/, context.afterProgram ? 'programSpeed' : 'programSpeed'],
    [/effect|program|auto|macro|show|pattern|chase|jump|fade|gradual|built.?in|function/, 'program']
  ]
  for (const [re, fn] of rules) if (re.test(t)) return fn
  return null
}

/** The cell a channel belongs to: "R1" → 1, "red 3", "cell 2", "the seventh light" → 7. */
export function cellFromText(name: string, text: string): { cell: number; from: 'name' | 'text' } | null {
  const byText = new RegExp(`\\b(${ORDINALS.join('|')})\\b\\s*(light|cell|section|segment|head|lamp|led|pixel|zone|cob)?`, 'i').exec(text)
  const fromText = byText ? ORDINALS.indexOf(byText[1].toLowerCase()) + 1 : 0
  const m = /^(?:[rgbwa]|red|green|blue|white|amber|uv|ww|cw)\s*(\d{1,3})$/i.exec(name.trim()) ?? /(?:cell|section|segment|pixel|zone|head|lamp|led|light|cob|part|group)\s*#?\s*(\d{1,3})/i.exec(name) ?? /(?:cell|section|segment|pixel|zone|head|light)\s*#?\s*(\d{1,3})/i.exec(text)
  const fromName = m ? Number(m[1]) : 0
  if (fromText && fromName && fromText !== fromName) return { cell: fromText, from: 'text' }
  if (fromName) return { cell: fromName, from: 'name' }
  if (fromText) return { cell: fromText, from: 'text' }
  return null
}

const COLOR_WORDS: Array<[RegExp, string]> = [
  [/white|open|no colou?r/i, '#ffffff'], [/red/i, '#ff0000'], [/orange/i, '#ff8000'], [/yellow/i, '#ffff00'], [/green/i, '#00ff00'],
  [/cyan|light blue|turquoise/i, '#00c0ff'], [/blue/i, '#0000ff'], [/purple|violet|uv/i, '#8000ff'], [/magenta|pink/i, '#ff00ff'], [/amber/i, '#ffb000']
]

function colourOf(label: string): string | undefined {
  // "red + green" → mix
  const parts = label.split(/\+|&|\band\b|\//i).map((p) => COLOR_WORDS.find(([re]) => re.test(p))?.[1]).filter((x): x is string => !!x)
  if (!parts.length) return undefined
  if (parts.length === 1) return parts[0]
  const rgb = parts.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)])
  const sum = rgb.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0])
  const peak = Math.max(...sum, 1)
  return '#' + sum.map((v) => Math.round((v / peak) * 255).toString(16).padStart(2, '0')).join('')
}

const PATTERNS: ProgramPattern[] = ['chase', 'fade', 'jump', 'rainbow', 'strobe']

function patternOf(label: string, k: number): ProgramPattern {
  const t = label.toLowerCase()
  if (/no function|off|blackout|none|^0$/.test(t)) return 'none'
  if (/sound|music|audio|mic/.test(t)) return 'pulse'
  if (/strob|flash/.test(t)) return 'strobe'
  if (/jump|change/.test(t)) return 'jump'
  if (/fade|gradual|breath|pulse|smooth/.test(t)) return 'fade'
  if (/rainbow|flow|run|water/.test(t)) return 'rainbow'
  if (/chase|marquee|run/.test(t)) return 'chase'
  if (/static|fixed|on\b/.test(t)) return 'static'
  return PATTERNS[k % PATTERNS.length]
}

/** Turn a raw range row into a range for this kind of channel. */
export function rangeFromRow(fn: ChannelFn, r: { lo: number; hi: number; label: string }, k: number): RangeDef {
  const label = r.label.trim() || `${r.lo}–${r.hi}`
  const t = label.toLowerCase()
  const off = /no function|^off|blackout|closed|none|no effect/.test(t)
  switch (fn) {
    case 'shutter':
      // "No function" / "no strobe" on a strobe channel means the light is simply on.
      return { lo: r.lo, hi: r.hi, label, kind: /closed|blackout|shutter close/.test(t) ? 'closed' : /no function|no strobe|^off|none|open|on\b|light on/.test(t) ? 'open' : 'strobe' }
    case 'colorWheel':
    case 'colorMacro':
      return off ? { lo: r.lo, hi: r.hi, label, kind: 'off' } : { lo: r.lo, hi: r.hi, label, kind: 'slot', color: colourOf(label) }
    case 'gobo':
      return { lo: r.lo, hi: r.hi, label, kind: 'slot', gobo: /open|no gobo|white/.test(t) ? 0 : k }
    case 'goboRotation':
    case 'prismRotation':
    case 'rotation': {
      if (/stop|no rot|static|index|fixed/.test(t) || off) return { lo: r.lo, hi: r.hi, label, kind: 'spin', from: 0, to: 0 }
      const way = /anti|counter|ccw|reverse|negative|left/.test(t) ? -1 : 1
      const fastFirst = /fast\s*(to|-|→)\s*slow/.test(t)
      return { lo: r.lo, hi: r.hi, label, kind: 'spin', from: way * (fastFirst ? 1.5 : 0.1), to: way * (fastFirst ? 0.1 : 1.5) }
    }
    case 'program':
    case 'laser':
      return off ? { lo: r.lo, hi: r.hi, label, kind: 'off', pattern: 'none' } : { lo: r.lo, hi: r.hi, label, kind: 'program', pattern: patternOf(label, k) }
    case 'prism':
      return { lo: r.lo, hi: r.hi, label, kind: off ? 'off' : 'slot' }
    default:
      return { lo: r.lo, hi: r.hi, label }
  }
}

/** Splits text into channels with their range rows. */
function readRows(text: string, notes: string[]): { channels: RawChannel[]; modeName?: string; title?: string } {
  const channels: RawChannel[] = []
  let current: RawChannel | null = null
  let modeName: string | undefined
  let title: string | undefined
  let pendingGap = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '  ').replace(/\s+\|\s*|\s*\|\s+/g, '  ').replace(/[|]/g, ' ').trim()
    if (!line) continue
    const modeMatch = /^(?:dmx\s*)?(?:mode\s*\d*\s*[:\-–]?\s*)?(\d{1,3})\s*-?\s*(?:ch|chs|channels?)\b(?:\s*mode)?\s*[:.]?$/i.exec(line)
    if (modeMatch) {
      modeName = `${modeMatch[1]}-channel`
      continue
    }
    if (ELISION_RE.test(line) || /^\*+/.test(line)) {
      // "*** Data increases by 6" between ranges, or "......" between channels.
      const rangeGap = /increase|^\*/i.test(line)
      if (rangeGap && current && current.ranges.length) {
        current.gapAfter = [...(current.gapAfter ?? []), current.ranges.length - 1]
        const by = /by\s*(\d+)/i.exec(line)
        if (by) current.filled = by[1]
      } else pendingGap = true
      continue
    }
    const range = RANGE_RE.exec(line)
    if (range && current && Number(range[1]) <= 255 && Number(range[2]) <= 255) {
      current.ranges.push({ lo: Number(range[1]), hi: Number(range[2]), label: range[3] })
      continue
    }
    const ch = CHANNEL_RE.exec(line)
    if (ch && Number(ch[1]) >= 1 && Number(ch[1]) <= 512) {
      let rest = ch[2].trim()
      const r = /^(.*?)\s+(\d{1,3})\s*(?:-|–|—|~|to)\s*(\d{1,3})\b\s*[:.=]?\s*(.*)$/.exec(rest)
      const raw: RawChannel = { number: Number(ch[1]), name: rest, text: [], ranges: [] }
      if (r && Number(r[2]) <= 255 && Number(r[3]) <= 255) {
        rest = r[1].trim()
        raw.name = rest
        raw.ranges.push({ lo: Number(r[2]), hi: Number(r[3]), label: r[4] })
      }
      if (pendingGap && channels.length) channels[channels.length - 1].gapAfter = [-1]
      pendingGap = false
      channels.push(raw)
      current = raw
      continue
    }
    if (!channels.length && !title && line.length < 60 && /[a-z]/i.test(line)) {
      title = line
      continue
    }
    // A wrapped description line: belongs to the last range or channel.
    if (current) {
      const last = current.ranges[current.ranges.length - 1]
      if (last) last.label = `${last.label} ${line}`.trim()
      else current.name = `${current.name} ${line}`.trim()
    } else notes.push(`Skipped a line that isn't a channel: “${line.slice(0, 60)}”`)
  }
  return { channels, modeName, title }
}

/** Fill "effect 4 … effect 27" between two listed ranges when the manual says "data increases by N". */
function fillRangeGaps(ch: RawChannel, notes: string[]): void {
  if (!ch.gapAfter?.length) return
  const out: RawChannel['ranges'] = []
  ch.ranges.forEach((r, i) => {
    out.push(r)
    if (!ch.gapAfter!.includes(i)) return
    const next = ch.ranges[i + 1]
    if (!next) return
    const width = r.hi - r.lo + 1
    const numA = /(\d+)\s*$/.exec(r.label.trim())
    const numB = /(\d+)\s*$/.exec(next.label.trim())
    let lo = r.hi + 1
    let n = numA ? Number(numA[1]) + 1 : 0
    let added = 0
    while (lo + width - 1 < next.lo && added < 200) {
      out.push({ lo, hi: lo + width - 1, label: numA ? r.label.trim().replace(/(\d+)\s*$/, String(n)) : `${r.label} (filled in)` })
      lo += width
      n++
      added++
    }
    if (lo < next.lo) out.push({ lo, hi: next.lo - 1, label: numA ? r.label.trim().replace(/(\d+)\s*$/, String(n)) : 'Filled in' })
    if (added) notes.push(`Channel ${ch.number}: filled in ${added} skipped range${added === 1 ? '' : 's'} between ${r.hi} and ${next.lo}${numB ? ` (“${r.label.trim()}” to “${next.label.trim()}”)` : ''}.`)
  })
  ch.ranges = out
}

export function parseChart(text: string, kindHint?: FixtureKind, name?: string, manufacturer?: string): ParsedChart {
  const notes: string[] = []
  const { channels: rows, modeName, title } = readRows(text, notes)
  rows.sort((a, b) => a.number - b.number)
  for (const r of rows) fillRangeGaps(r, notes)

  // What each listed channel does, and its cell.
  type Info = { raw: RawChannel; fn: ChannelFn; cell: number | null; guessedFn: boolean; fine: boolean; conflict?: string }
  const infos: Info[] = []
  let lastFn: ChannelFn | null = null
  for (const raw of rows) {
    const all = `${raw.name} ${raw.ranges.map((r) => r.label).join(' ')}`
    let fn: ChannelFn | null = fnFromText(raw.name, { afterProgram: lastFn === "program" }) ?? fnFromText(all, { afterProgram: lastFn === "program" })
    const guessedFn = !fn
    if (!fn) fn = 'other'
    // "Speed adjustment" right after an effect channel is that effect's speed.
    if (fn === 'programSpeed' && lastFn !== 'program' && /pan|tilt|move/i.test(all)) fn = 'panTiltSpeed'
    const fine = /fine|16.?bit|lsb/i.test(raw.name) && (fn === 'pan' || fn === 'tilt')
    const cellInfo = cellFromText(raw.name, raw.ranges.map((r) => r.label).join(' '))
    const info: Info = { raw, fn, cell: cellInfo?.cell ?? null, guessedFn, fine }
    if (cellInfo?.from === 'text') {
      const fromName = /(\d{1,3})$/.exec(raw.name.trim())
      if (fromName && Number(fromName[1]) !== cellInfo.cell) info.conflict = `Channel ${raw.number} is labelled “${raw.name}” but described as light ${cellInfo.cell}: used light ${cellInfo.cell}.`
    }
    infos.push(info)
    lastFn = fn
  }

  // Fill skipped channels ("......") by repeating the pattern before the gap, cell by cell.
  const byNumber = new Map(infos.map((i) => [i.raw.number, i]))
  const filled: Info[] = []
  for (let k = 0; k < infos.length - 1; k++) {
    const a = infos[k]
    const b = infos[k + 1]
    const gap = b.raw.number - a.raw.number - 1
    if (gap <= 0 || a.cell === null) continue
    // The repeating unit: the channels just before the gap with a's cell.
    const unit = infos.filter((x) => x.cell === a.cell && x.raw.number <= a.raw.number && a.raw.number - x.raw.number < 16).sort((x, y) => x.raw.number - y.raw.number)
    if (!unit.length || gap % unit.length !== 0) continue
    const cellsToAdd = gap / unit.length
    for (let c = 1; c <= cellsToAdd; c++) {
      unit.forEach((u, j) => {
        const number = a.raw.number + (c - 1) * unit.length + j + 1
        if (byNumber.has(number)) return
        const name = u.raw.name.replace(/\d+\s*$/, String((a.cell ?? 0) + c))
        const info: Info = { raw: { number, name, text: [], ranges: u.raw.ranges.map((r) => ({ ...r })) }, fn: u.fn, cell: (a.cell ?? 0) + c, guessedFn: false, fine: u.fine }
        filled.push(info)
        byNumber.set(number, info)
      })
    }
    notes.push(`Filled in channels ${a.raw.number + 1}–${b.raw.number - 1} (cells ${(a.cell ?? 0) + 1}–${(a.cell ?? 0) + cellsToAdd}), which the manual skips, by repeating the pattern before them.`)
  }
  const all = [...infos, ...filled].sort((x, y) => x.raw.number - y.raw.number)
  for (const i of all) if (i.conflict) notes.push(i.conflict)

  // Channels before the first one listed, or in gaps we couldn't fill: still needed.
  const top = Math.max(0, ...all.map((i) => i.raw.number))
  const present = new Set(all.map((i) => i.raw.number))
  const missingNumbers: number[] = []
  for (let n = 1; n <= top; n++) if (!present.has(n)) missingNumbers.push(n)
  if (missingNumbers.length) notes.push(`Channel${missingNumbers.length === 1 ? '' : 's'} ${compactList(missingNumbers)} ${missingNumbers.length === 1 ? 'is' : 'are'} not in the text: add the manual page that lists ${missingNumbers.length === 1 ? 'it' : 'them'}, or set what ${missingNumbers.length === 1 ? 'it does' : 'they do'} by hand.`)

  // Parts: one per cell, split into two when a cell has both a white part and a colour part.
  const whites: ChannelFn[] = ['warmWhite', 'coolWhite', 'white']
  const cellIds = [...new Set(all.filter((i) => i.cell !== null).map((i) => i.cell!))].sort((a, b) => a - b)
  const parts: PartDef[] = []
  const partFor = new Map<string, string>()
  const aux = /auxiliary|aux\b|ring|halo|backlight/i
  for (const c of cellIds) {
    const inCell = all.filter((i) => i.cell === c)
    const hasWhite = inCell.some((i) => whites.includes(i.fn))
    const hasRgb = inCell.some((i) => i.fn === 'red' || i.fn === 'green' || i.fn === 'blue')
    if (hasWhite && hasRgb) {
      const w: PartDef = { id: newKey('p'), name: `Cell ${c} white`, role: 'pixel', cell: c - 1, tint: inCell.some((i) => i.fn === 'warmWhite') ? 'warm' : undefined }
      const isAux = inCell.some((i) => aux.test(i.raw.ranges.map((r) => r.label).join(' ') + i.raw.name))
      const r: PartDef = { id: newKey('p'), name: `Cell ${c} ${isAux ? 'ring' : 'colour'}`, role: 'pixel', cell: c - 1 }
      parts.push(w, r)
      partFor.set(`${c}|w`, w.id)
      partFor.set(`${c}|c`, r.id)
    } else {
      const p: PartDef = { id: newKey('p'), name: `Cell ${c}`, role: 'pixel', cell: c - 1, tint: inCell.some((i) => i.fn === 'warmWhite') ? 'warm' : undefined }
      parts.push(p)
      partFor.set(`${c}|w`, p.id)
      partFor.set(`${c}|c`, p.id)
    }
  }
  // An LED ring around the lens (moving heads, PARs): channels named "ring red", "aura effect"…
  const ringNamed = /\bring\b|halo|aura|backlight/i
  const ringPart: PartDef | null = all.some((i) => i.cell === null && ringNamed.test(i.raw.name)) ? { id: newKey('p'), name: 'LED ring', role: 'halo' } : null
  if (ringPart) {
    parts.push(ringPart)
    notes.push('Found channels for an LED ring around the lens: they drive the ring part.')
  }

  const channelDefs: ChannelDef[] = []
  for (let n = 1; n <= top; n++) {
    const i = byNumber.get(n)
    if (!i) {
      channelDefs.push({ id: newKey('c'), name: `Channel ${n}`, fn: 'other', part: null, ranges: [], confidence: 'missing', note: 'Not in the manual text given.' })
      continue
    }
    const part = i.cell !== null ? partFor.get(`${i.cell}|${whites.includes(i.fn) ? 'w' : 'c'}`) ?? null : ringPart && ringNamed.test(i.raw.name) ? ringPart.id : null
    const ranges = i.raw.ranges.length === 1 && i.raw.ranges[0].lo === 0 && i.raw.ranges[0].hi === 255 && FN[i.fn].style === 'level' ? [] : i.raw.ranges.map((r, k) => rangeFromRow(i.fn, r, k))
    const isFilled = filled.includes(i)
    const label = i.raw.name.replace(/\s{2,}/g, ' ').trim()
    channelDefs.push({
      id: newKey('c'),
      name: label.length > 40 ? label.slice(0, 38) + '…' : label || FN[i.fn].label,
      fn: i.fn,
      part,
      fine: i.fine || undefined,
      ranges,
      confidence: i.guessedFn || isFilled || i.conflict || i.raw.gapAfter?.some((g) => g >= 0) ? 'guessed' : 'manual',
      note: isFilled ? 'Filled in: the manual skips this channel.' : i.conflict ?? (i.guessedFn ? 'Couldn’t tell what this does from its name.' : i.raw.filled ? `Some ranges filled in (“data increases by ${i.raw.filled}”).` : undefined)
    })
  }

  // Programs that name the white or the colour parts drive just those parts.
  const whiteParts = parts.filter((p) => p.name.endsWith('white')).map((p) => p.id)
  const colourParts = parts.filter((p) => /ring|colour/.test(p.name)).map((p) => p.id)
  for (const c of channelDefs) {
    if (c.fn !== 'program') continue
    if (whiteParts.length && /white|cob/i.test(c.name)) c.targets = whiteParts
    else if (colourParts.length && /aux|ring|rgb|colou?r/i.test(c.name)) c.targets = colourParts
  }

  // What kind of fixture it looks like.
  const fns = new Set(channelDefs.map((c) => c.fn))
  const kind: FixtureKind = kindHint ?? (fns.has('pan') || fns.has('tilt') ? (fns.has('gobo') ? 'spot' : 'wash') : fns.has('laser') ? 'laser' : cellIds.length > 1 ? (parts.some((p) => p.tint === 'warm') || /\bcob\b|auxiliary|retro/i.test(text) ? 'cluster' : 'bar') : fns.has('rotation') ? 'effect' : 'par')
  const base = blankDef(kind, name ?? title ?? 'Fixture from a manual', manufacturer ?? 'Unknown')
  const layout = kind === 'cluster' ? { kind: cellIds.length === 7 ? 'ringCentre' as const : 'hex' as const } : base.look.layout
  const def: FixtureDef = {
    ...base,
    look: { ...base.look, layout },
    parts,
    modes: [{ id: newKey('m'), name: modeName ?? `${channelDefs.length}-channel`, channels: channelDefs }],
    source: { kind: 'manual', label: 'Typed or pasted from the manual' }
  }
  if (!rows.length) notes.unshift('No channels found. Each line should start with the channel number, e.g. “1  Dimmer  0-255”.')
  return { def, notes }
}

function compactList(ns: number[]): string {
  const out: string[] = []
  let start = ns[0]
  let prev = ns[0]
  for (const n of [...ns.slice(1), Infinity]) {
    if (n === prev + 1) {
      prev = n
      continue
    }
    out.push(start === prev ? String(start) : `${start}–${prev}`)
    start = prev = n
  }
  return out.join(', ')
}
