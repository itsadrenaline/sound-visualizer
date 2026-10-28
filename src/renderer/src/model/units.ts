/**
 * Lengths shown in one system everywhere: metric (the default) or imperial.
 *
 * Everything is stored in metres; this only changes what you see and type.
 *
 *  - 'length': positions, heights, room and object sizes. Metric: 1.83 m. Imperial: 6′ 0″.
 *  - 'small': fixture and panel sizes. Metric: 457 mm. Imperial: 18″.
 *
 * Typing works in either system whichever is chosen: "6'", "6 ft 2", "74in", "1.8 m",
 * "180cm". A bare number is in the chosen system's main unit (m or ft; mm or in for small).
 */
export type Units = 'metric' | 'imperial'
export type LengthKind = 'length' | 'small'

export const FOOT = 0.3048
export const INCH = 0.0254

let current: Units = 'metric'
const listeners = new Set<(u: Units) => void>()

/** The chosen system (for code outside React; the UI uses useUnits). */
export function units(): Units {
  return current
}

export function setUnitsValue(u: Units): void {
  if (u === current) return
  current = u
  for (const l of listeners) l(u)
}

export function onUnits(l: (u: Units) => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

const round = (v: number, step: number) => Math.round(v / step) * step
const trim = (v: number, digits: number) => String(Number(v.toFixed(digits)))

/** "6′ 2″", "-3′ 6″", "8′" (to the nearest half inch). */
function feetInches(m: number): string {
  const sign = m < 0 ? '-' : ''
  let inches = round(Math.abs(m) / INCH, 0.5)
  let feet = Math.floor(inches / 12 + 1e-9)
  inches = inches - feet * 12
  if (inches >= 11.75) {
    feet += 1
    inches = 0
  }
  if (feet === 0) return `${sign}${trim(inches, 1)}″`
  return inches < 0.25 ? `${sign}${feet}′` : `${sign}${feet}′ ${trim(inches, 1)}″`
}

/** A length as text in the chosen system. */
export function formatLength(m: number, kind: LengthKind = 'length', u: Units = current): string {
  if (!Number.isFinite(m)) return ''
  if (u === 'imperial') return kind === 'small' ? `${trim(m / INCH, 1)}″` : feetInches(m)
  if (kind === 'small') return `${trim(m * 1000, 0)} mm`
  return `${trim(m, 2)} m`
}

/** Just the number, in the chosen system's main unit (for compact lists like "279 × 457 × 182"). */
export function lengthNumber(m: number, kind: LengthKind = 'length', u: Units = current): number {
  if (u === 'imperial') return Number((kind === 'small' ? m / INCH : m / FOOT).toFixed(1))
  return kind === 'small' ? Math.round(m * 1000) : Number(m.toFixed(2))
}

/** The main unit's label: m, ft, mm or in. */
export function unitLabel(kind: LengthKind = 'length', u: Units = current): string {
  if (u === 'imperial') return kind === 'small' ? 'in' : 'ft'
  return kind === 'small' ? 'mm' : 'm'
}

/** A size in feet (how stands and decks are sold) shown in the chosen system: "6′" or "1.83 m". */
export function formatFeet(ft: number, u: Units = current): string {
  return u === 'imperial' ? `${trim(ft, 1)}′` : `${trim(ft * FOOT, 2)} m`
}

/** How far the − and + buttons move: 10 cm / 6 inches (1 cm / 1 inch for small). */
export function lengthStep(kind: LengthKind = 'length', u: Units = current): number {
  if (u === 'imperial') return kind === 'small' ? INCH : FOOT / 2
  return kind === 'small' ? 0.01 : 0.1
}

const UNIT: Array<[RegExp, number]> = [
  [/^(mm|millimet(?:er|re)s?)$/, 0.001],
  [/^(cm|centimet(?:er|re)s?)$/, 0.01],
  [/^(m|met(?:er|re)s?)$/, 1],
  [/^(ft|feet|foot|'|′|’)$/, FOOT],
  [/^(in|inch|inches|"|″|”|'')$/, INCH]
]

/**
 * What someone typed, in metres, or null if it isn't a length. Understands both systems
 * and mixed feet and inches ("6' 2\"", "6ft2", "6 ft 2 in").
 */
export function parseLength(text: string, kind: LengthKind = 'length', u: Units = current): number | null {
  const t = text.trim().toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ')
  if (!t) return null
  const sign = t.startsWith('-') ? -1 : 1
  const body = t.replace(/^[-+]\s*/, '')
  // Feet then inches, with or without the inch mark: 6'2", 6' 2, 6 ft 2 in, 6ft2
  const fi = /^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|'|′|’)\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|"|″|”|'')?$/.exec(body)
  if (fi) return sign * (Number(fi[1]) * FOOT + Number(fi[2]) * INCH)
  const one = /^(\d*\.?\d+)\s*([a-z'"′″’”]+)?$/.exec(body)
  if (!one) return null
  const n = Number(one[1])
  if (!Number.isFinite(n)) return null
  if (!one[2]) {
    const base = u === 'imperial' ? (kind === 'small' ? INCH : FOOT) : kind === 'small' ? 0.001 : 1
    return sign * n * base
  }
  const unit = UNIT.find(([re]) => re.test(one[2]!))
  return unit ? sign * n * unit[1] : null
}

/**
 * Sizes written in feet in a name ("Totem 6 ft", "Stage deck 4 × 8 ft", "FLEXstand (5-8 ft)")
 * in the chosen system: "Totem 1.83 m", "Stage deck 1.22 × 2.44 m". Inch sizes that name a
 * product ("12 in speaker") stay as they are.
 */
export function localiseFeet(text: string, u: Units = current): string {
  if (u === 'imperial') return text
  return text.replace(/(\d+(?:\.\d+)?(?:\s*(?:×|x|-|–)\s*\d+(?:\.\d+)?)*)\s*ft\b/g, (_, nums: string) =>
    `${nums.replace(/\d+(?:\.\d+)?/g, (n) => trim(Number(n) * FOOT, 2))} m`
  )
}

/** A height someone wrote ("6 ft", "6'", "1.8 m", "180 cm") in feet, or null. */
export function feetInText(text: string): number | null {
  const t = text.toLowerCase()
  const ft = /(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')(?![a-z])/.exec(t)
  if (ft) return Number(ft[1])
  const cm = /(\d+(?:\.\d+)?)\s*(?:cm|centimet(?:er|re)s?)\b/.exec(t)
  if (cm) return Math.round((Number(cm[1]) / 100 / FOOT) * 10) / 10
  const m = /(\d+(?:\.\d+)?)\s*(?:m|met(?:er|re)s?)\b/.exec(t)
  if (m) return Math.round((Number(m[1]) / FOOT) * 10) / 10
  return null
}
