/**
 * A fixture's DMX modes: every mode its Library entry or its SoundSwitch definition
 * has, not just the one in the show. The inspector switches between them and Fixture
 * Studio opens them all.
 */
import { useStore } from './store'
import { useLibrary } from './library'
import { originalFixtureType, type FixtureFamily, type FixtureType } from '../model/fixtureTypes'
import { oflTypeId } from '../model/oflImport'
import { soundswitchModeType } from '../model/soundswitchImport'

export interface ModeChoice {
  name: string
  channels: number
}

/**
 * Where a type's other modes are. Types from the Library saved before types knew
 * this are found from their id ("ofl-<library key>-<mode>").
 */
export function familyOf(type: FixtureType): FixtureFamily | undefined {
  if (type.family) return type.family
  if (!type.id.startsWith('ofl-')) return undefined
  const lib = useLibrary.getState().library
  if (!lib) return undefined
  const key = Object.keys(lib.fixtures)
    .filter((k) => type.id.startsWith(`ofl-${k}-`.replace(/\s+/g, '_')))
    .sort((a, b) => b.length - a.length)[0]
  if (!key) return undefined
  const mode = lib.fixtures[key].modes.findIndex((m) => oflTypeId(key, m) === type.id)
  return mode >= 0 ? { library: key, mode } : undefined
}

/** The modes a fixture type comes in, and which one it is (null when it has no others we know of). */
export function modeChoices(type: FixtureType): { modes: ModeChoice[]; current: number } | null {
  const family = familyOf(type)
  if (!family) return null
  if (family.soundswitch) return { modes: family.soundswitch.modes.map((m) => ({ name: m.name, channels: m.channels })), current: family.mode }
  if (family.library) {
    const entry = useLibrary.getState().entries.find((e) => e.key === family.library)
    if (entry) return { modes: entry.modes, current: family.mode }
  }
  return null
}

/** The fixture type for another of a type's modes. */
export async function typeInMode(type: FixtureType, mode: number): Promise<FixtureType | null> {
  if (type.family?.soundswitch) return soundswitchModeType(type.family.soundswitch, mode)
  await useLibrary.getState().load()
  const family = familyOf(type)
  if (!family?.library) return null
  if (family.library.startsWith('qlc/')) await useLibrary.getState().loadDef(family.library)
  return useLibrary.getState().typeFor(family.library, mode)
}

/**
 * Switch fixtures to another of their modes. They keep their start address; a mode
 * with more channels may now overlap the next fixture (the patch check says so).
 */
export async function setFixtureMode(ids: string[], mode: number): Promise<FixtureType | null> {
  const fixtures = useStore.getState().project.fixtures.filter((f) => ids.includes(f.id))
  if (!fixtures.length) return null
  const type = originalFixtureType(fixtures[0].typeId)
  const next = await typeInMode(type, mode)
  if (!next || next.id === type.id) return next
  useStore.getState().apply(`Change mode to ${modeChoices(next)?.modes[mode]?.name ?? next.name}`, (p) => ({
    ...p,
    fixtures: p.fixtures.map((f) => (ids.includes(f.id) ? { ...f, typeId: next.id } : f)),
    fixtureTypes: [...(p.fixtureTypes ?? []).filter((t) => t.id !== next.id), next]
  }))
  return next
}
