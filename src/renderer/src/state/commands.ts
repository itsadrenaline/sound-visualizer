/**
 * Every way to change the project, as named commands.
 * Each one is a single undoable step; the label is what Undo would show.
 */
import { useStore } from './store'
import { useMix } from './mix'
import { getFixtureType, plainName, type FixtureType } from '../model/fixtureTypes'
import { defaultProject, footprint, newId, nextFreeAddress, planPatch, roomOf, type Fixture, type Project, type RoomSettings, type Vec3 } from '../model/project'
import { defaultName, footprint as structureFootprint, mountPoints, STRUCTURE_KINDS, type Structure, type StructureKind, type StructureParams } from '../model/structures'
import { projectFromSoundSwitch, soundswitchKeyOf, syncKey, typeIdFor } from '../model/soundswitchImport'
import { autoLayout, distribute, type Shape, type Where } from '../model/layout'
import { nearestMount } from '../model/physics'
import { fixFor, patchProblems, type PatchProblem } from '../model/patchCheck'
import { alignUnits, applyDeltas, lineUp, movingRoots, placeGroup, spaceEvenly, stageArea, unitsOf, withRiders, type Area, type Delta, type Edge, type Place, type Unit } from '../model/arrange'
import type { SoundSwitchFixture } from '../../../shared/soundswitch'

const store = () => useStore.getState()

/** A fixture type's name short enough for a fixture: cut at a word, about 28 characters. */
function shortName(name: string): string {
  const plain = plainName(name)
  if (plain.length <= 28) return plain
  const cut = plain.slice(0, 29)
  return cut.slice(0, cut.lastIndexOf(' ') > 12 ? cut.lastIndexOf(' ') : 28)
}

/**
 * The next free numbered name: "Spot 3" → "Spot 4" (or the first number not
 * taken). Old-style "… copy copy" names are tidied to the base name first.
 */
export function nextName(name: string, taken: Iterable<string>): string {
  const base = name.replace(/(\s+copy)+$/i, '').replace(/\s+\d+$/, '').trim() || name
  const used = new Set(taken)
  let max = 1
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`)
  for (const n of used) {
    const m = re.exec(n)
    if (m) max = Math.max(max, Number(m[1]))
  }
  let n = max + 1
  while (used.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

export function addFixture(typeId: string): void {
  const type = getFixtureType(typeId)
  const { project } = store()
  const universe = 0
  const address = nextFreeAddress(project.fixtures, universe, type.channels.length) ?? 1
  const count = project.fixtures.filter((f) => f.typeId === typeId).length + 1
  const fixture: Fixture = {
    id: newId(),
    name: `${shortName(type.name)} ${count}`,
    typeId,
    universe,
    address,
    position: type.body === 'par' ? [0, 0.15, -3] : [0, 6, 1],
    mounting: type.body === 'par' ? 'floor' : 'hanging',
    aimTilt: type.body === 'par' ? 20 : 0
  }
  store().apply(`Add ${fixture.name}`, (p) => ({ ...p, fixtures: [...p.fixtures, fixture] }))
  store().select([fixture.id])
}

/** Change the same fields on several fixtures at once (multi-select editing). */
export function updateFixtures(ids: string[], label: string, change: (f: Fixture) => Fixture): void {
  const set = new Set(ids)
  store().apply(label, (p) => ({ ...p, fixtures: p.fixtures.map((f) => (set.has(f.id) ? change(f) : f)) }))
}

export function deleteFixtures(ids: string[]): void {
  if (ids.length === 0) return
  const set = new Set(ids)
  // Fixtures from SoundSwitch would come back on the next sync, so remember to leave them out.
  const imported = store().project.fixtures.filter((f) => set.has(f.id) && f.soundswitchKey).map((f) => f.soundswitchKey!)
  if (imported.length && typeof window !== 'undefined' && window.api) window.api.excludeSoundSwitchFixtures(store().project.name, imported)
  const label = ids.length === 1 ? 'Delete fixture' : `Delete ${ids.length} fixtures`
  store().apply(label, (p) => ({ ...p, fixtures: p.fixtures.filter((f) => !set.has(f.id)) }))
  store().select([])
}

/**
 * Copies of the selected fixtures, on the same patch, so they react to exactly the
 * same DMX (a mirror). Set Invert pan on one to make a symmetrical pair.
 * Copies are yours: SoundSwitch syncs keep them.
 */
export function duplicateFixtures(ids: string[]): void {
  const source = store().project.fixtures.filter((f) => ids.includes(f.id))
  if (!source.length) return
  const taken = store().project.fixtures.map((f) => f.name)
  const copies: Fixture[] = source.map((f) => {
    const name = nextName(f.name, taken)
    taken.push(name)
    return { ...f, id: newId(), name, soundswitchKey: undefined, position: [f.position[0] + 0.6, f.position[1], f.position[2]] as Fixture['position'] }
  })
  store().apply(copies.length === 1 ? `Duplicate ${source[0].name}` : `Duplicate ${copies.length} fixtures`, (p) => ({
    ...p,
    fixtures: [...p.fixtures, ...copies]
  }))
  store().select(copies.map((c) => c.id))
}

export function resetProject(): void {
  store().apply('New project', () => defaultProject())
  store().select([])
}

/**
 * Replace the rig with the fixtures from a SoundSwitch venue (one undoable step).
 * Fixtures that were already imported keep their positions and names.
 */
export function syncFromSoundSwitch(fixtures: SoundSwitchFixture[], projectName: string): void {
  store().apply('Sync from SoundSwitch', (p) => {
    // A show that doesn't follow SoundSwitch, or follows a different SoundSwitch project, is left alone.
    const link = p.soundswitch
    if (link && (!link.link || (link.profile && link.profile !== projectName))) return p
    const chosen = link?.include ? fixtures.filter((f) => link.include!.includes(soundswitchKeyOf(f))) : fixtures
    const next = projectFromSoundSwitch(chosen, p, link?.profile ? p.name : projectName)
    // Nothing changed: skip, so automatic syncs don't fill the undo history.
    const same =
      next.fixtures.length === p.fixtures.length &&
      next.fixtures.every((f, i) => p.fixtures[i]?.typeId === f.typeId && p.fixtures[i]?.address === f.address && p.fixtures[i]?.universe === f.universe && p.fixtures[i]?.group === f.group) &&
      next.layoutVersion === p.layoutVersion &&
      // A newer importer may read the same fixture better (e.g. a master dimmer head).
      JSON.stringify(next.fixtureTypes) === JSON.stringify(p.fixtureTypes)
    return same ? p : next
  })
}

// ---------------------------------------------------------------------------
// From the fixture library
// ---------------------------------------------------------------------------

/**
 * Add `count` fixtures of a library type, patched in the next free gaps:
 * from `start` (or the first free address), each in the next free gap, carrying
 * on into the next universe when one is full. They're spaced out from `at`.
 */
export function addLibraryFixtures(
  type: FixtureType,
  count: number,
  options: { start?: { universe: number; address: number }; at?: Vec3; mount?: { structure: string; point: string; t?: number }; select?: boolean } = {}
): string[] {
  const { project } = store()
  const spots = planPatch(project.fixtures, count, type.channels.length, options.start)
  if (!spots.length) return []
  const hanging = type.spec?.mount === 'hanging'
  const width = type.spec?.size[0] ?? 0.3
  const gap = Math.max(0.4, width + 0.25)
  // GigBars and the like sit on a stand at about head height.
  const onStand = type.spec?.mount === 'stand' && type.spec.look === 'gigbar'
  const dropped: Vec3 = options.at ?? [0, hanging ? 6.3 : 0.1, hanging ? -1 : 0.5]
  const at: Vec3 = onStand ? [dropped[0], 2.2, dropped[2]] : dropped
  const base = shortName(type.name)
  const already = project.fixtures.filter((f) => f.typeId === type.id).length
  const fixtures: Fixture[] = spots.map((spot, i) => ({
    id: newId(),
    name: `${base} ${already + i + 1}`,
    typeId: type.id,
    universe: spot.universe,
    address: spot.address,
    position: [round(at[0] + (i - (spots.length - 1) / 2) * gap), hanging ? Math.max(round(at[1]), 6.3) : round(at[1]), round(at[2])],
    mounting: hanging ? 'hanging' : 'floor',
    aimTilt: type.body === 'movingHead' ? 0 : hanging ? 15 : 20
  }))
  const label = fixtures.length === 1 ? `Add ${fixtures[0].name}` : `Add ${fixtures.length} × ${base}`
  // Dropped onto a totem, a stand or a truss: attached to it straight away.
  const plan = options.mount ? planMount(project, fixtures, options.mount.structure, options.mount.point, options.mount.t) : null
  if (plan) fixtures.forEach((f, i) => (fixtures[i] = { ...f, ...plan.get(f.id) }))
  store().apply(label, (p) => ({
    ...p,
    fixtures: [...p.fixtures, ...fixtures],
    // The type travels with the project, so the file opens anywhere.
    fixtureTypes: [...(p.fixtureTypes ?? []).filter((t) => t.id !== type.id), type]
  }))
  if (options.select !== false) store().select(fixtures.map((f) => f.id))
  return fixtures.map((f) => f.id)
}

// ---------------------------------------------------------------------------
// Arranging (Align, Spread Even, Mirror and Duplicate)
// ---------------------------------------------------------------------------

export type Axis = 0 | 1 | 2
const AXIS_NAME = ['left-right', 'height', 'front-back']

function selected(ids: string[]): Fixture[] {
  return store().project.fixtures.filter((f) => ids.includes(f.id))
}

/** Line the fixtures up on one axis: at the lowest, the middle or the highest of them. */
export function alignFixtures(ids: string[], axis: Axis, to: 'min' | 'center' | 'max'): void {
  const list = selected(ids)
  if (list.length < 2) return
  const values = list.map((f) => f.position[axis])
  const target = to === 'min' ? Math.min(...values) : to === 'max' ? Math.max(...values) : (Math.min(...values) + Math.max(...values)) / 2
  updateFixtures(ids, `Align ${AXIS_NAME[axis]}`, (f) => {
    const position = [...f.position] as Vec3
    position[axis] = round(target)
    return { ...f, position }
  })
}

/** Space the fixtures evenly between the two outermost ones, keeping their order. */
export function spreadEven(ids: string[], axis: Axis): void {
  const list = selected(ids).sort((a, b) => a.position[axis] - b.position[axis])
  if (list.length < 3) return
  const first = list[0].position[axis]
  const step = (list.at(-1)!.position[axis] - first) / (list.length - 1)
  const at = new Map(list.map((f, i) => [f.id, round(first + i * step)]))
  updateFixtures(ids, `Spread ${AXIS_NAME[axis]}`, (f) => {
    const position = [...f.position] as Vec3
    position[axis] = at.get(f.id)!
    return { ...f, position }
  })
}

/**
 * Mirror copies across the centre line of the stage: left becomes right, the
 * copies turn the other way and pan the opposite way, on the same patch, so a
 * symmetrical pair follows one DMX signal.
 */
export function mirrorFixtures(ids: string[]): void {
  const list = selected(ids)
  if (!list.length) return
  const copies: Fixture[] = list.map((f) => ({
    ...f,
    id: newId(),
    name: `${f.name} mirror`,
    soundswitchKey: undefined,
    position: [round(-f.position[0]), f.position[1], f.position[2]],
    rotation: -(f.rotation ?? 0),
    invertPan: !f.invertPan
  }))
  store().apply(copies.length === 1 ? `Mirror ${list[0].name}` : `Mirror ${copies.length} fixtures`, (p) => ({ ...p, fixtures: [...p.fixtures, ...copies] }))
  store().select(copies.map((c) => c.id))
}

/**
 * `count` copies of the selection, each moved by `offset` from the last.
 * With `newPatch` each copy gets its own addresses; otherwise it mirrors the original.
 */
export function duplicateArray(ids: string[], count: number, offset: Vec3, newPatch: boolean): void {
  const list = selected(ids)
  if (!list.length || count < 1) return
  const { project } = store()
  const copies: Fixture[] = []
  for (let n = 1; n <= count; n++) {
    for (const f of list) {
      let { universe, address } = f
      if (newPatch) {
        const spot = planPatch([...project.fixtures, ...copies], 1, footprint(f), { universe: f.universe, address: 1 })[0]
        if (spot) ({ universe, address } = spot)
      }
      copies.push({
        ...f,
        id: newId(),
        name: `${f.name.replace(/\s+\d+$/, '')} ${n + 1}`,
        soundswitchKey: undefined,
        universe,
        address,
        position: [round(f.position[0] + offset[0] * n), round(f.position[1] + offset[1] * n), round(f.position[2] + offset[2] * n)]
      })
    }
  }
  store().apply(`Duplicate ${copies.length} fixtures`, (p) => ({ ...p, fixtures: [...p.fixtures, ...copies] }))
  store().select(copies.map((c) => c.id))
}

/** Select every fixture of the same type(s) as the selection. */
export function selectSameType(ids: string[]): void {
  const types = new Set(selected(ids).map((f) => f.typeId))
  store().select(store().project.fixtures.filter((f) => types.has(f.typeId)).map((f) => f.id))
}

/** Move fixtures by a delta (dragging in the 3D view). */
export function moveFixtures(ids: string[], delta: Vec3): void {
  if (!delta.some((d) => Math.abs(d) > 1e-6)) return
  updateFixtures(ids, ids.length === 1 ? 'Move fixture' : `Move ${ids.length} fixtures`, (f) => ({
    ...f,
    position: [round(f.position[0] + delta[0]), round(Math.max(0, f.position[1] + delta[1])), round(f.position[2] + delta[2])]
  }))
}

// ---------------------------------------------------------------------------
// Camera positions and whole documents
// ---------------------------------------------------------------------------

export function storeCamera(name: string, position: Vec3, target: Vec3): void {
  store().apply(`Store camera "${name}"`, (p) => ({
    ...p,
    cameras: [...(p.cameras ?? []).filter((c) => c.name !== name), { name, position: position.map(round) as Vec3, target: target.map(round) as Vec3 }]
  }))
}

export function deleteCamera(name: string): void {
  store().apply(`Delete camera "${name}"`, (p) => ({ ...p, cameras: (p.cameras ?? []).filter((c) => c.name !== name) }))
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}

/** Change the room (ceiling, ambient light). Slider drags merge into one undo step. */
export function updateRoom(change: Partial<RoomSettings>, label = 'Change room'): void {
  store().apply(label, (p) => ({ ...p, room: { ...roomOf(p), ...change } }), { merge: true })
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export function renameGroup(group: number, name: string): void {
  store().apply(`Rename group ${group}`, (p) => {
    const names = { ...(p.groupNames ?? {}) }
    if (name.trim()) names[group] = name.trim()
    else delete names[group]
    return { ...p, groupNames: names }
  })
}

export function setGroup(ids: string[], group: number): void {
  updateFixtures(ids, group ? `Put in group ${group}` : 'Remove from group', (f) => ({ ...f, group: group || undefined }))
}

// ---------------------------------------------------------------------------
// Distributing (no dragging each fixture by hand)
// ---------------------------------------------------------------------------

/** Spread the fixtures evenly: a line, arc, circle or grid, on the truss, the floor or where they are. */
export function distributeFixtures(ids: string[], shape: Shape, where: Where, width?: number): void {
  const list = selected(ids)
  if (!list.length) return
  const spots = distribute(list, (f) => getFixtureType(f.typeId), shape, where, width)
  updateFixtures(ids, `Distribute ${list.length} fixtures`, (f) => ({ ...f, ...spots.get(f.id) }))
}

/** Put fixtures where the automatic layout would: movers on the truss, tubes at the back, and so on. */
export function autoPlaceFixtures(ids: string[]): void {
  const list = selected(ids)
  if (!list.length) return
  const spots = autoLayout(list, (f) => getFixtureType(f.typeId))
  updateFixtures(ids, list.length === 1 ? 'Auto-place fixture' : `Auto-place ${list.length} fixtures`, (f) => ({ ...f, ...spots.get(list.find((x) => x.id === f.id)!) }))
}

// ---------------------------------------------------------------------------
// Objects: totems, stands, truss, stages, tables, drape (model/structures.ts)
// Physics (model/physics.ts) sets their height and keeps attached fixtures on them.
// ---------------------------------------------------------------------------

export function structureId(): string {
  return `st-${newId().slice(3)}`
}

const structuresOf = (p: Project) => p.structures ?? []

/**
 * The free spot closest to `near` for a new piece: it may stand on a bigger
 * stage or table, but not overlap anything else.
 */
function freeSpot(list: Structure[], kind: StructureKind, params: StructureParams, near: Vec3): Vec3 {
  const probe: Structure = { id: '?', kind, name: '', position: near, rotation: 0, params }
  const [w, d] = structureFootprint(probe)
  const blocks = (x: number, z: number) =>
    list.some((s) => {
      const [sw, sd] = structureFootprint(s)
      if (STRUCTURE_KINDS[s.kind].surface && sw * sd > w * d * 1.2) return false // it can stand on it
      return Math.abs(s.position[0] - x) < (sw + w) / 2 + 0.05 && Math.abs(s.position[2] - z) < (sd + d) / 2 + 0.05
    })
  const spots: Array<[number, number]> = []
  for (let i = -24; i <= 24; i++) for (let k = -16; k <= 16; k++) spots.push([near[0] + i * 0.5, near[2] + k * 0.5])
  spots.sort((a, b) => Math.hypot(a[0] - near[0], (a[1] - near[2]) * 1.5) - Math.hypot(b[0] - near[0], (b[1] - near[2]) * 1.5))
  const free = spots.find(([x, z]) => !blocks(x, z))
  return free ? [round(free[0]), 0, round(free[1])] : near
}

/** Where each kind of piece goes first, if you don't say. */
const NEAR: Partial<Record<StructureKind, Vec3>> = {
  stage: [0, 0, -1], goalpost: [0, 0, -1], trussBox: [0, 0, 0], pipeDrape: [0, 0, -4], table: [0, 0, 3], djBooth: [0, 0, 3],
  speakerColumn: [5, 0, 3], speakerOnPole: [5, 0, 3], sub: [5, 0, 3], speakerOnSub: [5, 0, 3], speakerBox: [5, 0, 3], subStack: [6, 0, 3],
  monitor: [1, 0, 1.5], lineArray: [7, 0, 2], groundStack: [7, 0, 3], fohDesk: [0, 0, 12], ampRack: [-6, 0, -2],
  djGear: [0, 0, 3], micStand: [1.5, 0, 1], drumKit: [0, 0, -2], guitarAmp: [-2, 0, -2], keyboard: [2.5, 0, -1],
  roundTable: [-6, 0, 9], highTop: [5, 0, 8], bar: [-9, 0, 8], chairs: [0, 0, 9], sofa: [8, 0, 10],
  wall: [0, 0, -6], danceFloor: [0, 0, 6.5], screen: [0, 0, -4.5], ledWall: [0, 0, -4.5], backdrop: [0, 0, -4], stanchions: [6, 0, 6],
  plant: [-8, 0, 3], pillar: [-9, 0, 6], person: [0, 0, 6], crowd: [0, 0, 8]
}

/** Add an object. Without `at` it goes to the front of the stage, beside anything already there. */
export function addStructure(kind: StructureKind, params: StructureParams = {}, options: { at?: Vec3; name?: string; rotation?: number; select?: boolean } = {}): string {
  const list = structuresOf(store().project)
  const position = options.at ? ([round(options.at[0]), 0, round(options.at[2])] as Vec3) : freeSpot(list, kind, params, NEAR[kind] ?? [0, 0, 1.5])
  const base = options.name ?? defaultName(kind, params)
  const taken = new Set(list.map((x) => x.name))
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`
  const s: Structure = { id: structureId(), kind, name, position, rotation: options.rotation ?? 0, params: { ...params } }
  store().apply(`Add ${s.name}`, (p) => ({ ...p, structures: [...structuresOf(p), s] }))
  if (options.select !== false) store().select([s.id])
  return s.id
}

export function updateStructures(ids: string[], label: string, change: (s: Structure) => Structure, merge = false): void {
  const set = new Set(ids)
  store().apply(label, (p) => ({ ...p, structures: structuresOf(p).map((s) => (set.has(s.id) ? change(s) : s)) }), { merge })
}

/** Change size or options; the name follows if it was the automatic one. */
export function setStructureParams(ids: string[], change: StructureParams): void {
  updateStructures(ids, 'Change object', (s) => {
    const params = { ...s.params, ...change }
    const auto = s.name === defaultName(s.kind, s.params)
    return { ...s, params, name: auto ? defaultName(s.kind, params) : s.name }
  }, true)
}

/** Move objects; whatever is attached to them or standing on them comes along. */
export function moveStructures(ids: string[], delta: Vec3): void {
  moveSelection(ids, delta)
}

export function rotateStructures(ids: string[], degrees: number): void {
  updateStructures(ids, 'Turn object', (s) => ({ ...s, rotation: (((s.rotation + degrees) % 360) + 540) % 360 - 180 }))
}

/**
 * Move a mixed selection: objects (with what's attached to them and standing on
 * them) and loose fixtures. A fixture on a stand or totem moves its stand.
 * Only loose fixtures go up and down (the gizmo's vertical arrow).
 */
export function moveSelection(ids: string[], delta: Vec3): void {
  if (!delta.some((d) => Math.abs(d) > 1e-6)) return
  const p = store().project
  const roots = movingRoots(p, ids)
  const moved = withRiders(p, roots)
  if (!moved.structures.size && !moved.fixtures.size) return
  const n = roots.structures.size + roots.fixtures.size
  const label = n === 1 ? (roots.structures.size ? 'Move object' : 'Move fixture') : `Move ${n} items`
  store().apply(label, (q) => ({
    ...q,
    structures: structuresOf(q).map((s) => (moved.structures.has(s.id) ? { ...s, position: [round(s.position[0] + delta[0]), s.position[1], round(s.position[2] + delta[2])] as Vec3 } : s)),
    fixtures: q.fixtures.map((f) => {
      if (!moved.fixtures.has(f.id)) return f
      const dy = roots.fixtures.has(f.id) ? delta[1] : 0
      return { ...f, position: [round(f.position[0] + delta[0]), round(Math.max(0, f.position[1] + dy)), round(f.position[2] + delta[2])] as Vec3 }
    })
  }))
}

// ---------------------------------------------------------------------------
// Arranging objects and fixtures together (model/arrange.ts)
// ---------------------------------------------------------------------------

function arrange(ids: string[], label: string, plan: (units: Unit[], area: Area) => Map<string, Delta>): boolean {
  const p = store().project
  const units = unitsOf(p, ids)
  if (!units.length) return false
  // The stage itself can be in the selection: measure against what's left.
  const area = stageArea(p, new Set(units.map((u) => u.id)))
  const deltas = plan(units, area)
  if (![...deltas.values()].some((d) => Math.abs(d[0]) > 1e-6 || Math.abs(d[1]) > 1e-6)) return false
  store().apply(label, (q) => applyDeltas(q, deltas))
  return true
}

const PLACE_LABEL: Record<Place, string> = { back: 'Move to the back of the stage', centre: 'Move to the centre of the stage', front: 'Move to the front of the stage', left: 'Move to the left side', right: 'Move to the right side', audience: 'Move in front of the stage' }

/** Move the selection, keeping its arrangement, to a place on the stage. */
export function placeSelection(ids: string[], place: Place): boolean {
  return arrange(ids, PLACE_LABEL[place], (units, area) => placeGroup(units, area, place))
}

/** An evenly spaced row, left to right: across the back or front of the stage, in front of it, or where they are. */
export function lineUpSelection(ids: string[], where: 'back' | 'front' | 'audience' | 'here'): boolean {
  return arrange(ids, 'Line up evenly', (units, area) => lineUp(units, area, where))
}

export function alignSelection(ids: string[], edge: Edge): boolean {
  return arrange(ids, 'Align', (units) => alignUnits(units, edge))
}

export function spaceSelection(ids: string[], axis: 'x' | 'z'): boolean {
  return arrange(ids, axis === 'x' ? 'Space evenly left to right' : 'Space evenly front to back', (units) => spaceEvenly(units, axis))
}

/** How many things would move on their own (for enabling the arrange actions). */
export function unitCount(ids: string[]): number {
  return unitsOf(store().project, ids).length
}

/** Delete objects. What was on them stays, and falls to whatever is below. */
export function deleteStructures(ids: string[]): void {
  const set = new Set(ids)
  const n = structuresOf(store().project).filter((s) => set.has(s.id)).length
  if (!n) return
  store().apply(n === 1 ? 'Delete object' : `Delete ${n} objects`, (p) => ({
    ...p,
    structures: structuresOf(p).filter((s) => !set.has(s.id)),
    fixtures: p.fixtures.map((f) => (f.mount && set.has(f.mount.structure) ? { ...f, mount: undefined } : f))
  }))
  store().select(store().selection.filter((id) => !set.has(id)))
}

/** Copies of objects beside the originals, with copies of the fixtures on them (own patch). */
export function duplicateStructures(ids: string[]): void {
  const p = store().project
  const source = structuresOf(p).filter((s) => ids.includes(s.id))
  if (!source.length) return
  const xs = source.flatMap((s) => [s.position[0] - structureFootprint(s)[0] / 2, s.position[0] + structureFootprint(s)[0] / 2])
  const shift = round(Math.max(...xs) - Math.min(...xs) + 0.5)
  const copies: Structure[] = []
  const newFixtures: Fixture[] = []
  for (const s of source) {
    const copy: Structure = { ...s, id: structureId(), name: nextName(s.name, [...structuresOf(p), ...copies].map((x) => x.name)), position: [round(s.position[0] + shift), s.position[1], s.position[2]] }
    copies.push(copy)
    for (const f of p.fixtures.filter((x) => x.mount?.structure === s.id)) {
      const spot = planPatch([...p.fixtures, ...newFixtures], 1, footprint(f), { universe: f.universe, address: 1 })[0] ?? { universe: f.universe, address: f.address }
      newFixtures.push({ ...f, id: newId(), name: nextName(f.name, [...p.fixtures, ...newFixtures].map((x) => x.name)), soundswitchKey: undefined, ...spot, position: [round(f.position[0] + shift), f.position[1], f.position[2]], mount: { ...f.mount!, structure: copy.id } })
    }
  }
  store().apply(copies.length === 1 ? `Duplicate ${source[0].name}` : `Duplicate ${copies.length} objects`, (q) => ({
    ...q,
    structures: [...structuresOf(q), ...copies],
    fixtures: [...q.fixtures, ...newFixtures]
  }))
  store().select(copies.map((c) => c.id))
}

/**
 * Attach fixtures to an object: on top of a totem or stand, under a truss bar,
 * clamped to a leg or along a booth facade. Several fixtures on a bar are spaced
 * along it around `t`; a single point (a top plate) takes one fixture.
 * `point` can be a mount point id or a kind ('top', 'under', 'clamp', 'face').
 */
export function mountFixtures(ids: string[], structure: string, point: string, t = 0.5): boolean {
  const p = store().project
  const plan = planMount(p, p.fixtures.filter((f) => ids.includes(f.id)), structure, point, t)
  if (!plan) return false
  const s = structuresOf(p).find((x) => x.id === structure)!
  const label = plan.size === 1 ? `Attach ${p.fixtures.find((f) => plan.has(f.id))!.name} to ${s.name}` : `Attach ${plan.size} fixtures to ${s.name}`
  updateFixtures([...plan.keys()], label, (f) => ({ ...f, ...plan.get(f.id) }))
  return true
}

/** Where each fixture goes on a mount (see mountFixtures), without changing anything yet. */
export function planMount(p: Project, list: Fixture[], structure: string, point: string, t = 0.5): Map<string, Partial<Fixture>> | null {
  const s = structuresOf(p).find((x) => x.id === structure)
  if (!s || !list.length) return null
  const points = mountPoints(s)
  const m = points.find((x) => x.id === point) ?? points.find((x) => x.kind === point && !x.inside) ?? points.find((x) => x.kind === point)
  if (!m) return null
  const chosen = m.to ? list : list.slice(0, 1)
  const length = m.to ? Math.hypot(m.to[0] - m.at[0], m.to[1] - m.at[1], m.to[2] - m.at[2]) : 0
  const widest = Math.max(...chosen.map((f) => getFixtureType(f.typeId).spec?.size[0] ?? 0.3))
  const gap = length && chosen.length > 1 ? Math.min(1 / (chosen.length - 1), Math.max(0.35, widest + 0.15) / length) : 0
  const sorted = [...chosen].sort((a, b) => a.position[0] - b.position[0])
  const raw = sorted.map((_, i) => t + (i - (sorted.length - 1) / 2) * gap)
  // Keep the row on the bar: shift it back if it ran off an end.
  const shift = Math.max(...raw) > 1 ? 1 - Math.max(...raw) : Math.min(...raw) < 0 ? -Math.min(...raw) : 0
  const facing = m.kind === 'clamp' || m.kind === 'face' ? s.rotation + (m.facing ?? 0) : undefined
  return new Map(
    sorted.map((f, i) => [
      f.id,
      {
        mounting: m.kind === 'under' ? ('hanging' as const) : ('floor' as const),
        mount: { structure: s.id, point: m.id, ...(m.to ? { t: Math.round(Math.max(0, Math.min(1, raw[i] + shift)) * 1e6) / 1e6 } : {}) },
        ...(facing !== undefined ? { rotation: facing } : {}),
        ...(m.aim !== undefined ? { aimTilt: m.aim } : {})
      }
    ])
  )
}

/** Take fixtures off what they're attached to; they stand on whatever is below. */
export function detachFixtures(ids: string[]): void {
  const list = store().project.fixtures.filter((f) => ids.includes(f.id) && f.mount)
  if (!list.length) return
  updateFixtures(list.map((f) => f.id), list.length === 1 ? `Detach ${list[0].name}` : `Detach ${list.length} fixtures`, (f) => {
    const { mount: _gone, ...rest } = f
    void _gone
    // Off a truss it would just re-hang: put it on the floor below.
    return { ...rest, mounting: 'floor', position: [f.position[0], 0, f.position[2] + (f.mounting === 'hanging' ? 0.8 : 0.6)] }
  })
}

/**
 * Turn fixtures upright (totem mode: on a totem, stand, truss top or the floor)
 * or hang them upside down under a truss. Physics needs something to hang
 * from: a fixture on a truss moves from on top of the bar to under it at the
 * same spot (or back); otherwise it goes under the nearest truss. Returns the
 * names of fixtures that had nothing to hang from.
 */
export function orientFixtures(ids: string[], to: 'hanging' | 'floor'): string[] {
  const p = store().project
  const list = p.fixtures.filter((f) => ids.includes(f.id) && f.mounting !== to)
  const changes = new Map<string, Partial<Fixture>>()
  const stuck: string[] = []
  const pieces = structuresOf(p)
  for (const f of list) {
    const on = f.mount && pieces.find((s) => s.id === f.mount!.structure)
    const wanted = to === 'hanging' ? 'under' : 'top'
    // Same structure, other side of the bar.
    const twin = on && mountPoints(on).find((m) => m.kind === wanted && !m.inside && (!!m.to === !!mountPoints(on).find((x) => x.id === f.mount!.point)?.to))
    if (on && twin) {
      const plan = planMount(p, [f], on.id, twin.id, f.mount!.t ?? 0.5)
      if (plan) changes.set(f.id, plan.get(f.id)!)
      continue
    }
    if (to === 'hanging') {
      const hang = nearestMount(pieces, f.position, ['under'], 1e4)
      if (!hang) {
        stuck.push(f.name)
        continue
      }
      const plan = planMount(p, [f], hang.structure.id, hang.point.id, hang.t)
      if (plan) changes.set(f.id, plan.get(f.id)!)
    } else {
      // Off the truss and standing on whatever is below.
      changes.set(f.id, { mounting: 'floor', mount: undefined, position: [f.position[0], 0, f.position[2] + (f.mount ? 0.8 : 0)] })
    }
  }
  if (changes.size) {
    const label = to === 'hanging' ? 'Hang from the truss' : 'Stand upright'
    updateFixtures([...changes.keys()], label, (f) => ({ ...f, ...changes.get(f.id) }))
  }
  return stuck
}

/** Make this show follow a SoundSwitch project (all its fixtures), and bring them in now. */
/** Follow a SoundSwitch project (a show that didn't follow one yet): its fixtures come in with the sync. */
export function followSoundSwitch(profile: string, fixtures?: SoundSwitchFixture[]): void {
  const mark = store().beginBatch()
  store().apply('Follow SoundSwitch', (p) => ({ ...p, soundswitch: { link: true, profile } }))
  if (fixtures) syncFromSoundSwitch(fixtures, profile)
  store().endBatch(mark, 'Follow SoundSwitch')
  if (!fixtures) void import('./soundswitchLink').then(({ useSoundSwitch }) => useSoundSwitch.getState().syncNow())
}

/**
 * Moving a show to another SoundSwitch project. Fixtures are matched by patch
 * (universe, address and fixture type), so a project mapped the same way keeps
 * every fixture where you put it.
 *  - match: the show's SoundSwitch fixtures become the new project's. Matching ones keep
 *    their place and settings, ones it doesn't have go, new ones come in.
 *  - add: everything stays; the new project's other fixtures are added.
 *  - keep: the show stays exactly as it is; it just follows the new project.
 * Trusses, stands, cameras and fixtures you added yourself always stay. One undo step.
 */
export type SwitchHow = 'match' | 'add' | 'keep'

const keyOfNew = (f: SoundSwitchFixture) => syncKey({ universe: f.universe, address: f.address, typeId: typeIdFor(f) })

export interface SwitchPlan {
  /** SoundSwitch fixtures in the show that are on the same patch in the new project. */
  same: number
  /** SoundSwitch fixtures in the show the new project doesn't have. */
  onlyHere: number
  /** Fixtures in the new project the show doesn't have. */
  onlyThere: number
  /** Fixtures you added yourself (copies, library fixtures). */
  own: number
}

export function switchPlan(p: Project, fixtures: SoundSwitchFixture[]): SwitchPlan {
  const there = new Set(fixtures.map(keyOfNew))
  const ss = p.fixtures.filter((f) => f.soundswitchKey)
  const here = new Set(ss.map((f) => syncKey(f)))
  const same = ss.filter((f) => there.has(syncKey(f))).length
  return { same, onlyHere: ss.length - same, onlyThere: fixtures.filter((f) => !here.has(keyOfNew(f))).length, own: p.fixtures.length - ss.length }
}

/**
 * Fixtures in the show that the SoundSwitch project doesn't patch: none of their
 * channels are used by any fixture in it. SoundSwitch sends them nothing, so when
 * the show plays they stay dark (unless something else drives their channels).
 */
export function fixturesNotInProject(p: Project, fixtures: SoundSwitchFixture[]): Fixture[] {
  const types = new Map((p.fixtureTypes ?? []).map((t) => [t.id, t]))
  const width = (f: Fixture) => Math.max(1, (types.get(f.typeId) ?? getFixtureType(f.typeId)).channels.length)
  return p.fixtures.filter((f) => {
    const lo = f.address
    const hi = f.address + width(f) - 1
    return !fixtures.some((s) => s.universe === f.universe && s.address <= hi && s.address + Math.max(1, s.mode.channels) - 1 >= lo)
  })
}

/** What to do with fixtures the SoundSwitch project doesn't patch. */
export type OutsideAction = 'leave' | 'mute' | 'hide' | 'remove'

export const OUTSIDE_ACTIONS: Array<{ id: OutsideAction; label: string; text: string }> = [
  { id: 'leave', label: 'Leave them as they are', text: 'They stay in the show and can be lit by the demo, the faders or another console; with SoundSwitch they stay dark.' },
  { id: 'mute', label: 'Mute them', text: 'Still drawn, but never lit or moved, whatever drives their channels. Unmute any time in the fixture list.' },
  { id: 'hide', label: 'Hide them', text: 'Not drawn in the 3D view. They stay in the show; show them again with the ● in the fixture list.' },
  { id: 'remove', label: 'Remove them from the show', text: 'Deleted from this show. Edit ▸ Undo brings them back.' }
]

/**
 * The fixtures not in the project that still need a decision: not muted,
 * not hidden, and not ones you chose to leave as they are.
 */
export function outsideToReview(p: Project, fixtures: SoundSwitchFixture[], mix: { muted: string[]; hidden: string[] }): Fixture[] {
  const settled = new Set([...(p.soundswitch?.keepOutside ?? []), ...mix.muted, ...mix.hidden])
  return fixturesNotInProject(p, fixtures).filter((f) => !settled.has(f.id))
}

export function handleOutside(ids: string[], action: OutsideAction): void {
  if (!ids.length) return
  if (action === 'leave') {
    store().apply(ids.length === 1 ? 'Leave a fixture not in the project' : `Leave ${ids.length} fixtures not in the project`, (p) => ({
      ...p,
      soundswitch: { ...(p.soundswitch ?? { link: true }), keepOutside: [...new Set([...(p.soundswitch?.keepOutside ?? []), ...ids])] }
    }))
  } else if (action === 'mute') useMix.getState().add('muted', ids)
  else if (action === 'hide') useMix.getState().add('hidden', ids)
  else deleteFixtures(ids)
}

/** "BPM-Spots 1, BPM-Spots 2 and 3 more". */
export function someNames(list: Array<{ name: string }>, max = 4): string {
  const names = list.slice(0, max).map((f) => f.name)
  const rest = list.length - names.length
  if (rest > 0) return `${names.join(', ')} and ${rest} more`
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? ''
}

export function switchSoundSwitchProject(profile: string, fixtures: SoundSwitchFixture[], how: SwitchHow): void {
  const there = new Set(fixtures.map(keyOfNew))
  const label = how === 'match' ? `Switch to “${profile}”` : how === 'add' ? `Add “${profile}” to the show` : `Follow “${profile}”, keeping the show`
  const mark = store().beginBatch()
  store().apply(label, (p) => {
    const gone = new Set(p.fixtures.filter((f) => f.soundswitchKey && !there.has(syncKey(f))).map((f) => f.soundswitchKey!))
    let list: Fixture[]
    if (how === 'match') {
      // The old project's fixtures the new one doesn't have go, with their copies.
      list = p.fixtures.filter((f) => !(f.soundswitchKey && gone.has(f.soundswitchKey)) && !(f.copyOf && gone.has(f.copyOf)))
    } else {
      // Kept as your own fixtures: they stay where they are, on the patch they have.
      list = p.fixtures.map((f) => {
        if (f.soundswitchKey && gone.has(f.soundswitchKey)) {
          const { soundswitchKey: _key, ...own } = f
          return own
        }
        if (f.copyOf && gone.has(f.copyOf)) {
          const { copyOf: _copy, ...own } = f
          return own
        }
        return f
      })
    }
    // Keeping the show as it is: only the fixtures it already has follow the new project.
    const include = how === 'keep' ? fixtures.filter((f) => p.fixtures.some((x) => x.soundswitchKey && syncKey(x) === keyOfNew(f))).map(soundswitchKeyOf) : undefined
    return { ...p, fixtures: list, soundswitch: { link: true, profile, ...(include ? { include } : {}) } }
  })
  syncFromSoundSwitch(fixtures, profile)
  store().endBatch(mark, label)
}

// ---------------------------------------------------------------------------
// Patch problems (model/patchCheck.ts)
// ---------------------------------------------------------------------------

/** Move the clashing (or overflowing) fixtures, with their copies, to free channels. */
export function fixPatchProblem(problem: PatchProblem): boolean {
  const p = store().project
  const to = fixFor(p, problem)
  if (!to) return false
  const ids = problem.move.fixtures.map((f) => f.id)
  updateFixtures(ids, `Move ${problem.move.fixtures[0].name} to free channels`, (f) => ({ ...f, universe: to.universe, address: to.address }))
  return true
}

/** Keep a clash on purpose: it stops being reported (saved with the show). */
export function ignorePatchProblem(problem: PatchProblem): void {
  store().apply('Keep the shared channels', (p) => ({ ...p, ignoredClashes: [...new Set([...(p.ignoredClashes ?? []), problem.key])] }))
}

/** Fix every problem that can be fixed, one undo step. */
export function fixAllPatchProblems(): number {
  const mark = store().beginBatch()
  let fixed = 0
  // Fixing one can change the others: recheck each time.
  for (let guard = 0; guard < 200; guard++) {
    const next = patchProblems(store().project).find((x) => fixFor(store().project, x))
    if (!next || !fixPatchProblem(next)) break
    fixed++
  }
  store().endBatch(mark, fixed === 1 ? 'Fix a patch problem' : `Fix ${fixed} patch problems`)
  return fixed
}
