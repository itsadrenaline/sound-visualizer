/**
 * Reads a SoundSwitch venue file (SoundSwitchVenues.bin inside a .ssproj folder).
 *
 * SoundSwitch doesn't publish this format. Everything below was worked out by
 * comparing the file with what SoundSwitch shows on screen, for interoperability
 * with your own project. It's a best-effort reader: if a future SoundSwitch
 * version changes the format, parsing may find fewer fixtures, and the app
 * says so instead of guessing.
 *
 * What the file holds, in order:
 *  1. A fixture library: one definition per fixture type (name, manufacturer,
 *     modes). Each mode lists attributes (Pan, Red, Strobe...) with a type code,
 *     byte width and channel position, then the fixture's head names (often
 *     "SSON", "Main" or "Cell 1"), then [channel count][1][mode name]. A definition ends with a footer:
 *     [2][library ID][offset where this definition started].
 *  2. The patch: one record per fixture with [mode index][absolute channel]
 *     [library ID]. Absolute channel = universe * 512 + (address - 1).
 *  3. Groups, looks and other show data, which we don't need.
 *
 * All numbers are little-endian; text is UTF-16 with a 32-bit length that
 * counts the closing zero.
 */

/** A DMX value range with a meaning: a colour-wheel slot, or a shutter state. */
export interface SoundSwitchRange {
  lo: number
  hi: number
  name: string
  /** For wheel slots: the slot's colour as SoundSwitch shows it, 0..255. */
  rgb?: [number, number, number]
  /** For shutter/strobe channels: what this range does. */
  shutter?: 'open' | 'closed' | 'strobe'
}

export interface SoundSwitchAttribute {
  /** SoundSwitch's attribute type code, e.g. 3 = pan, 14 = red. */
  code: number
  name: string
  /** 1 for 8-bit, 2 for 16-bit (coarse + fine). */
  width: number
  /** 0-based channel within the mode. */
  coarse: number
  fine: number
  /** Meaningful value ranges, e.g. a shutter's open/closed/strobe ranges. */
  ranges?: SoundSwitchRange[]
  /** Name of the wheel this attribute drives (see SoundSwitchDefinition.wheels). */
  wheel?: string
}

/** A part of a fixture with its own attributes: a pixel cell, a GigBar mover, a "Master" section. */
export interface SoundSwitchHead {
  name: string
  /** Indexes into the mode's attributes. */
  attributes: number[]
}

export interface SoundSwitchMode {
  name: string
  channels: number
  attributes: SoundSwitchAttribute[]
  heads: SoundSwitchHead[]
}

export interface SoundSwitchDefinition {
  id: number
  name: string
  manufacturer: string
  modes: SoundSwitchMode[]
  /** Colour and gobo wheels: name -> slots. */
  wheels: Record<string, SoundSwitchRange[]>
}

export interface SoundSwitchFixture {
  definitionId: number
  definition: string
  manufacturer: string
  mode: SoundSwitchMode
  /** Every mode its definition has (the patch uses `mode`). */
  modes?: SoundSwitchMode[]
  /** 0-based universe as SoundSwitch counts them (0 = "Universe One"). */
  universe: number
  /** 1-based DMX start address. */
  address: number
  /** The definition's colour and gobo wheels (name -> slots). */
  wheels: Record<string, SoundSwitchRange[]>
  /** SoundSwitch fixture group (1 = Group 1 ...), 0 when it isn't in one. */
  group?: number
}

export interface SoundSwitchVenue {
  definitions: SoundSwitchDefinition[]
  fixtures: SoundSwitchFixture[]
  /** Patch records whose type or mode we couldn't resolve. */
  skipped: number
}

class Reader {
  private view: DataView
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }
  get length(): number {
    return this.bytes.length
  }
  u16(offset: number): number {
    if (offset < 0 || offset + 2 > this.bytes.length) return -1
    return this.view.getUint16(offset, true)
  }
  u32(offset: number): number {
    if (offset < 0 || offset + 4 > this.bytes.length) return -1
    return this.view.getUint32(offset, true)
  }
  /** A length-prefixed UTF-16 string at `offset`, or null if there isn't a plausible one. */
  text(offset: number): { value: string; end: number } | null {
    const n = this.u32(offset)
    if (n < 1 || n > 400) return null
    const end = offset + 4 + n * 2
    if (end > this.bytes.length) return null
    let value = ''
    for (let i = 0; i < n; i++) {
      const code = this.view.getUint16(offset + 4 + i * 2, true)
      if (i === n - 1) {
        if (code !== 0) return null
      } else {
        if (code < 32 || code === 0xffff) return null
        value += String.fromCharCode(code)
      }
    }
    return { value, end }
  }
}

/** The manufacturer follows the definition name, sometimes after a 4-byte field. */
function manufacturerAfter(r: Reader, offset: number): { value: string; end: number } | null {
  return r.text(offset) ?? r.text(offset + 4)
}

/** Finds definition footers: [2][id][start offset], where a name string sits 12 bytes after start. */
function findDefinitionSpans(r: Reader): Array<{ id: number; start: number; end: number }> {
  const spans: Array<{ id: number; start: number; end: number }> = []
  for (let p = 8; p + 4 <= r.length; p += 1) {
    if (r.u32(p - 8) !== 2) continue
    const start = r.u32(p)
    if (start < 0 || start >= p || p - start > 200_000) continue
    const name = r.text(start + 12)
    if (!name || name.value.length < 2) continue
    const manufacturer = manufacturerAfter(r, name.end)
    if (!manufacturer) continue
    spans.push({ id: r.u32(p - 4), start, end: p + 4 })
  }
  // A start offset can be matched by more than one footer-looking pattern; keep the first footer.
  const seen = new Set<number>()
  return spans.filter((s) => (seen.has(s.start) ? false : (seen.add(s.start), true)))
}

/**
 * Mode names look like "Mode 1", "19 Channel Mode", "3 Ch", "56CH", "DMX 8" or
 * "Extended". Head names ("Cell 1", "Head 2", "Main") don't.
 */
export const MODE_NAME = /mode|channel|\bch\b|\d\s*-?\s*ch(?:s|an)?\b|\bdmx\b|^(?:basic|standard|extended|advanced|simple|compact|full|normal|expert|default)\b/i

/**
 * A mode's channel count. The count stored with it, or (stored as 0) the highest
 * channel its attributes use. When the mode's name says how many ("6 Channel Mode",
 * "8ch") and its attributes fit in that, the name wins: a stored count that disagrees
 * made a 6-channel PAR take 66 channels and "clash" with the fixtures after it.
 */
export function modeChannels(name: string, stored: number, highest: number): number {
  const named = /(\d{1,3})\s*-?\s*(?:ch\b|chan|channel)/i.exec(name)
  const n = named ? Number(named[1]) : 0
  if (n > highest && n <= 512) return n
  return stored || highest + 1
}

/** Unnamed shutter ranges carry a code instead of a name. */
const SHUTTER_CODES: Record<number, SoundSwitchRange['shutter']> = { 43: 'open', 44: 'closed', 46: 'strobe' }

function shutterFromName(name: string): SoundSwitchRange['shutter'] | undefined {
  if (/open/i.test(name)) return 'open'
  if (/closed|blackout/i.test(name)) return 'closed'
  if (/strobe|pulse|random/i.test(name)) return 'strobe'
  return undefined
}

function parseDefinition(r: Reader, span: { id: number; start: number; end: number }): SoundSwitchDefinition {
  const name = r.text(span.start + 12)!
  const manufacturer = manufacturerAfter(r, name.end)!
  const modes: SoundSwitchMode[] = []
  const wheels: Record<string, SoundSwitchRange[]> = {}
  let pending: SoundSwitchAttribute[] = []
  let heads: SoundSwitchHead[] = []
  let headStart = 0
  // Where value ranges go: a wheel being defined, or the last attribute's "...Values" list.
  let rangeTarget: SoundSwitchRange[] | null = null

  let o = manufacturer.end
  while (o < span.end) {
    const t = r.text(o)
    if (!t) {
      o++
      continue
    }

    // A value range: [4][lo u16][hi u16][1][name], then a colour (named slots) or a code.
    if (r.u32(o - 12) === 4 && r.u32(o - 4) === 1) {
      const lo = r.u16(o - 8)
      const hi = r.u16(o - 6)
      if (lo >= 0 && lo <= hi && hi <= 255) {
        const range: SoundSwitchRange = { lo, hi, name: t.value }
        if (t.value) {
          const b = r.bytes[t.end + 4]
          const g = r.bytes[t.end + 5]
          const red = r.bytes[t.end + 6]
          if (r.u32(t.end + 8) === 89) range.rgb = [red, g, b]
          range.shutter = shutterFromName(t.value)
        } else {
          range.shutter = SHUTTER_CODES[r.bytes[t.end + 4]]
        }
        rangeTarget?.push(range)
        o = t.end
        continue
      }
    }

    if (wheels[t.value] && pending.length) {
      // A reference to a wheel (e.g. "Wheel 1"), belonging to the attribute just before it.
      pending[pending.length - 1].wheel = t.value
      rangeTarget = null
      o = t.end
      continue
    }

    const isAttribute = r.u32(o - 4) === 1 && r.u32(o - 12) === 2
    const count = r.u32(o - 8)
    const highest = pending.reduce((m, a) => Math.max(m, a.coarse, a.width === 2 ? a.fine : 0), -1)
    const countOk = count === 0 || (count <= 512 && count > highest)
    if (!isAttribute && MODE_NAME.test(t.value) && r.u32(o - 4) === 1 && countOk && pending.length > 0) {
      // A mode: [channel count][1][name], after the attributes that belong to it.
      // Some modes store 0 as the count; then the highest channel used tells us.
      if (headStart < pending.length) heads.push({ name: 'Main', attributes: range(headStart, pending.length) })
      modes.push({ name: t.value, channels: modeChannels(t.value, count, highest), attributes: pending, heads })
      pending = []
      heads = []
      headStart = 0
      rangeTarget = null
      o = t.end
      continue
    }
    if (isAttribute) {
      // An attribute: [2][type code][1][name] then [1][1][0] [width] [coarse] [fine] (each in bits 8-15).
      const code = r.u32(o - 8)
      const width = (r.u32(t.end + 9) >> 8) & 0xff
      const coarse = (r.u32(t.end + 13) >> 8) & 0xffff
      const fine = (r.u32(t.end + 17) >> 8) & 0xffff
      if (code < 1000 && r.u32(t.end) === 1 && (width === 1 || width === 2)) {
        pending.push({ code, name: t.value, width, coarse, fine })
      }
      rangeTarget = null
      o = t.end
      continue
    }

    if (/Values$/.test(t.value) && pending.length) {
      // e.g. "StrobeValues": the ranges that follow belong to the last attribute.
      const last = pending[pending.length - 1]
      last.ranges = last.ranges ?? []
      rangeTarget = last.ranges
    } else if (r.u32(o - 4) === 1 && count >= 100 && count <= 255 && t.value.trim().length >= 2 && !wheels[t.value] && pending.length > headStart) {
      // A head: the attributes since the previous head belong to it.
      heads.push({ name: t.value, attributes: range(headStart, pending.length) })
      headStart = pending.length
      rangeTarget = null
    } else if (pending.length === 0 && /wheel|gobo|colou?r/i.test(t.value)) {
      // A wheel definition near the top of the definition, followed by its slots.
      wheels[t.value] = []
      rangeTarget = wheels[t.value]
    }
    o = t.end
  }
  return { id: span.id, name: name.value, manufacturer: manufacturer.value, modes, wheels }
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i)
}

export function parseSoundSwitchVenue(bytes: Uint8Array): SoundSwitchVenue {
  const r = new Reader(bytes)
  const spans = findDefinitionSpans(r)
  const definitions = spans.map((s) => parseDefinition(r, s)).filter((d) => d.modes.length > 0)
  const byId = new Map(definitions.map((d) => [d.id, d]))
  const libraryEnd = spans.reduce((max, s) => Math.max(max, s.end), 0)

  // Patch records: [flag 0/1][mode index][absolute channel][library id][small][group][back-reference].
  // The group is SoundSwitch's fixture group (1-4 in the app, 0 = none): checked against a real
  // venue where uplights were 1, tubes 2, movers 3 and washes 4.
  const fixtures: SoundSwitchFixture[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (let o = libraryEnd; o + 16 <= r.length; o++) {
    const id = r.u32(o)
    const definition = byId.get(id)
    if (!definition) continue
    const abs = r.u32(o - 4)
    const modeIndex = r.u32(o - 8)
    const flag = bytes[o - 9]
    const p = r.u32(o + 4)
    const q = r.u32(o + 8)
    const back = r.u32(o + 12)
    if (abs < 0 || abs >= 512 * 64 || modeIndex > 32 || flag > 1 || p > 64 || q > 64) continue
    if (back < libraryEnd - 10_000 || back >= o) continue
    // Each record starts [back-reference][0][0][count][16-byte ID][flag]: check the two zeros.
    if (r.u32(o - 33) !== 0 || r.u32(o - 37) !== 0) continue
    // The 16-byte ID is random-looking; filler bytes are not.
    if (new Set(bytes.subarray(o - 25, o - 9)).size < 8) continue
    const key = `${abs}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    const mode = definition.modes[modeIndex]
    if (!mode) {
      skipped++
      continue
    }
    fixtures.push({
      definitionId: id,
      definition: definition.name.trim(),
      manufacturer: definition.manufacturer,
      mode,
      modes: definition.modes,
      universe: Math.floor(abs / 512),
      address: (abs % 512) + 1,
      wheels: definition.wheels,
      group: q <= 16 ? q : 0
    })
  }
  fixtures.sort((a, b) => a.universe - b.universe || a.address - b.address)
  return { definitions, fixtures, skipped }
}
