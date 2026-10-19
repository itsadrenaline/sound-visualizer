/**
 * DMX patch problems worth knowing about, each with a way to fix it.
 *
 * Fixtures of the same type at the same address are copies that mirror each
 * other (what Duplicate makes): that's deliberate, so they count as one patch
 * "slot" and are never a problem. A problem is:
 *  - a clash: two different slots that use some of the same channels, so each
 *    gets the other's levels;
 *  - an overflow: a fixture whose channels run past 512.
 * A clash you mean to keep can be ignored; that's saved with the show.
 *
 * Fixtures that come from SoundSwitch are patched in SoundSwitch: when two of them
 * share channels, that's how the SoundSwitch project is set up (often on purpose: a
 * second light set to the same address follows the first). Moving one here would be
 * undone by the next sync, so it isn't a problem: sharedInSoundSwitch() lists them
 * for a quiet note instead.
 */
import { footprint, nextFreeAddress, type Fixture, type Project } from './project'
import { getFixtureType, plainName } from './fixtureTypes'

export interface Slot {
  key: string
  universe: number
  address: number
  /** Last channel used. */
  end: number
  fixtures: Fixture[]
}

export interface PatchProblem {
  /** Stable id, also what's stored when it's ignored. */
  key: string
  kind: 'clash' | 'overflow'
  /** The slot the fix moves, and (for a clash) the one it clashes with. */
  move: Slot
  other?: Slot
  /** Channels both use (clash), or the ones past 512 (overflow). */
  from: number
  to: number
}

export function slotsOf(fixtures: Fixture[]): Slot[] {
  const map = new Map<string, Slot>()
  for (const f of fixtures) {
    const key = `${f.universe}.${f.address}.${f.typeId}`
    const slot = map.get(key)
    if (slot) slot.fixtures.push(f)
    else map.set(key, { key, universe: f.universe, address: f.address, end: f.address + footprint(f) - 1, fixtures: [f] })
  }
  return [...map.values()]
}

/** "PAR 2", or "PAR 2 and 2 copies". */
export function slotName(s: Slot): string {
  const n = s.fixtures.length - 1
  return n ? `${s.fixtures[0].name} and ${n} cop${n === 1 ? 'y' : 'ies'}` : s.fixtures[0].name
}

/** "U1 97–104" the SoundSwitch way (universes from 1). */
export function range(universe: number, from: number, to: number): string {
  return `U${universe + 1} ${from}${to > from ? `–${to}` : ''}`
}

/** Patched in SoundSwitch (every fixture in the slot came from the linked project). */
const fromSoundSwitch = (s: Slot) => s.fixtures.every((f) => !!f.soundswitchKey)

/** Two slots that share channels because SoundSwitch's patch has them that way. */
export function sharedInSoundSwitch(p: Project): Array<[Slot, Slot]> {
  const slots = slotsOf(p.fixtures)
  const out: Array<[Slot, Slot]> = []
  for (let i = 0; i < slots.length; i++)
    for (let j = i + 1; j < slots.length; j++) {
      const [a, b] = [slots[i], slots[j]]
      if (a.universe === b.universe && a.address <= b.end && b.address <= a.end && fromSoundSwitch(a) && fromSoundSwitch(b)) out.push([a, b])
    }
  return out
}

export function patchProblems(p: Project): PatchProblem[] {
  const ignored = new Set(p.ignoredClashes ?? [])
  const slots = slotsOf(p.fixtures)
  const problems: PatchProblem[] = []
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]
      const b = slots[j]
      if (a.universe !== b.universe || a.address > b.end || b.address > a.end) continue
      // SoundSwitch's own patch: set up there, and the next sync would undo a move.
      if (fromSoundSwitch(a) && fromSoundSwitch(b)) continue
      const key = [a.key, b.key].sort().join('|')
      if (ignored.has(key)) continue
      // Move whichever starts later (on a tie, the one added later).
      const [stay, move] = b.address > a.address || (b.address === a.address && j > i) ? [a, b] : [b, a]
      problems.push({ key, kind: 'clash', move, other: stay, from: Math.max(a.address, b.address), to: Math.min(a.end, b.end) })
    }
  }
  for (const s of slots) {
    if (s.address >= 1 && s.end <= 512) continue
    if (fromSoundSwitch(s)) continue
    problems.push({ key: `over:${s.key}`, kind: 'overflow', move: s, from: Math.max(513, s.address), to: s.end })
  }
  return problems
}

/** Short and plain: what's wrong. */
export function describe(problem: PatchProblem): string {
  if (problem.kind === 'overflow') return `${slotName(problem.move)} runs past channel 512 (${range(problem.move.universe, problem.move.address, problem.move.end)}).`
  const o = problem.other!
  return `${slotName(problem.move)} and ${slotName(o)} use the same channels (${range(o.universe, problem.from, problem.to)}), so each gets the other's levels.`
}

/** Where the fix would move the slot: the first free run of channels, this universe first. */
export function fixFor(p: Project, problem: PatchProblem): { universe: number; address: number } | null {
  const moving = new Set(problem.move.fixtures.map((f) => f.id))
  const rest = p.fixtures.filter((f) => !moving.has(f.id))
  const channels = footprint(problem.move.fixtures[0])
  for (let u = problem.move.universe; u < problem.move.universe + 32; u++) {
    const at = nextFreeAddress(rest, u, channels)
    if (at !== null) return { universe: u, address: at }
  }
  return null
}

/** The fix as words: "Move PAR 2 to U1 129". */
export function fixLabel(p: Project, problem: PatchProblem): string | null {
  const to = fixFor(p, problem)
  if (!to) return null
  const who = problem.move.fixtures.length > 1 ? `${problem.move.fixtures[0].name} and its copies` : problem.move.fixtures[0].name
  return `Move ${who} to ${range(to.universe, to.address, to.address)}`
}

/** Other fixtures this one mirrors (same type, same patch), for a note in the inspector. */
export function mirrorsOf(fixtures: Fixture[], f: Fixture): Fixture[] {
  return fixtures.filter((x) => x.id !== f.id && x.universe === f.universe && x.address === f.address && x.typeId === f.typeId)
}

export function typeLabel(f: Fixture): string {
  return plainName(getFixtureType(f.typeId).name)
}
