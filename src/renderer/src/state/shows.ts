/**
 * Shows in and out (File menu): bring another show into this one, open or
 * export MVR for other lighting software, export a CSV patch list,
 * and start from a ready-made show.
 */
import { useStore } from './store'
import { useLibrary } from './library'
import { notify } from './notices'
import { loadDocument, useDocument } from './document'
import { registerFixtureTypes } from '../model/fixtureTypes'
import { mergeShow, patchCsv, readMvr, showFromMvr, toMvr } from '../model/exchange'
import type { Project } from '../model/project'
import { structureGlb } from '../three/structures'
import { runTool, type LibraryAccess, type ToolCall } from './showBuilder'
import { view } from './viewBus'

const SHOW_FILTERS = [
  { name: 'Shows (.ssvis, .mvr)', extensions: ['ssvis', 'mvr'] },
  { name: 'Sound Visualizer project', extensions: ['ssvis'] },
  { name: 'MVR (My Virtual Rig)', extensions: ['mvr'] }
]

async function libraryAccess(): Promise<LibraryAccess | null> {
  await useLibrary.getState().load()
  const { library, entries } = useLibrary.getState()
  return library ? { library, entries } : null
}

/** A show from a file's bytes: our .ssvis, or an MVR from anywhere. */
async function readShow(name: string, bytes: Uint8Array): Promise<{ project: Project; unknown: string[] }> {
  if (/\.mvr$/i.test(name)) {
    const lib = await libraryAccess()
    const scene = readMvr(bytes)
    const typeFor = (key: string, mode: string) => {
      const entry = lib?.entries.find((e) => e.key === key)
      if (!entry) return null
      const byName = entry.modes.findIndex((m) => m.name === mode || mode.includes(`${m.channels}`))
      return useLibrary.getState().typeFor(key, Math.max(0, byName))
    }
    return showFromMvr(scene, name.replace(/\.mvr$/i, ''), lib?.entries ?? [], typeFor)
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes))
  if (!parsed?.project?.fixtures) throw new Error(`${name} isn't a show file.`)
  return { project: parsed.project as Project, unknown: [] }
}

/** File ▸ Import Show into This One: adds its objects and fixtures (one undo step). */
export async function importShowInto(): Promise<void> {
  if (!window.api) return
  const file = await window.api.openFile(SHOW_FILTERS)
  if (!file) return
  try {
    const { project: incoming, unknown } = await readShow(file.name, file.bytes)
    registerFixtureTypes(incoming.fixtureTypes)
    let summary = ''
    useStore.getState().apply(`Import ${file.name}`, (p) => {
      const r = mergeShow(p, incoming)
      summary = `Added ${r.fixtures} fixtures and ${r.structures} objects from ${file.name}${r.repatched ? `; ${r.repatched} re-patched to free addresses` : ''}.`
      return r.project
    })
    notify('info', summary + (unknown.length ? ` Not in the library: ${unknown.join(', ')}.` : ''))
    view.home()
  } catch (error) {
    notify('error', `Couldn't import ${file.name}: ${(error as Error).message}`)
  }
}

/** File ▸ Open MVR: replaces the show (undoable). Saving makes it a .ssvis. */
export async function openMvr(): Promise<void> {
  if (!window.api) return
  const file = await window.api.openFile([{ name: 'MVR (My Virtual Rig)', extensions: ['mvr'] }])
  if (!file) return
  try {
    const { project, unknown } = await readShow(file.name, file.bytes)
    loadDocument(file.name, project)
    useDocument.getState().setSaved(null, null)
    notify('info', `Opened ${file.name}: ${project.fixtures.length} fixtures.${unknown.length ? ` Not in the library (shown as dimmers): ${unknown.join(', ')}.` : ''}`)
    view.home()
  } catch (error) {
    notify('error', `Couldn't open ${file.name}: ${(error as Error).message}`)
  }
}

export async function exportMvr(): Promise<void> {
  if (!window.api) return
  const project = useStore.getState().project
  try {
    const bytes = await toMvr(project, { model: structureGlb })
    const path = await window.api.saveFile(`${project.name || 'Show'}.mvr`, [{ name: 'MVR (My Virtual Rig)', extensions: ['mvr'] }], bytes)
    if (path) notify('info', `Exported ${path.split('/').pop()}: open it in any lighting software that imports MVR.`)
  } catch (error) {
    notify('error', `Couldn't export MVR: ${(error as Error).message}`)
  }
}

export async function exportCsv(): Promise<void> {
  if (!window.api) return
  const project = useStore.getState().project
  const path = await window.api.saveFile(`${project.name || 'Show'} patch.csv`, [{ name: 'CSV spreadsheet', extensions: ['csv'] }], patchCsv(project))
  if (path) notify('info', `Saved the patch list: ${path.split('/').pop()}`)
}

// ---------------------------------------------------------------------------
// Ready-made shows: built with the same tools as "Describe your show"
// ---------------------------------------------------------------------------

export interface Template {
  id: string
  name: string
  description: string
  /** Tool calls; "$name" in an input is replaced by the id a previous call returned under `as`. */
  steps: Array<ToolCall & { as?: string }>
}

const both = (slug: string) => `both-lighting/${slug}`

export const TEMPLATES: Template[] = [
  {
    id: 'mobile',
    name: 'Mobile DJ',
    description: 'A DJ booth with a white facade, two BPM-Spots on 6 ft totems either side (mirrored), four SQ-9 uplights and an FX Pix Bar on the booth.',
    steps: [
      { name: 'clear', input: { what: 'everything' } },
      { name: 'add_structure', input: { kind: 'djBooth', width_ft: 7.5, cover: 'white', x_ft: 0, z_ft: 2 }, as: 'booth' },
      { name: 'add_structure', input: { kind: 'totem', height_ft: 6, cover: 'white', beside: { structure_id: '$booth', side: 'left', gap_ft: 3, align: 'center' } }, as: 'left' },
      { name: 'add_structure', input: { kind: 'totem', height_ft: 6, cover: 'white', beside: { structure_id: '$booth', side: 'right', gap_ft: 3, align: 'center' } }, as: 'right' },
      { name: 'add_fixtures', input: { library_key: both('bpm-spots'), on: { structure_id: '$left', point: 'top' }, group: 1 } },
      { name: 'add_fixtures', input: { library_key: both('bpm-spots'), on: { structure_id: '$right', point: 'top' }, group: 1 }, as: 'rightMover' },
      { name: 'set_fixtures', input: { fixture_ids: ['$rightMover'], invert_pan: true } },
      { name: 'add_fixtures', input: { library_key: both('fx-pix-bar-1000'), mode: 14, on: { structure_id: '$booth', point: 'ftop' }, group: 2 } },
      { name: 'add_fixtures', input: { library_key: both('sq-9'), mode: 10, count: 4, x_ft: 0, z_ft: -6, group: 3 }, as: 'ups' },
      { name: 'arrange', input: { fixture_ids: ['$ups'], shape: 'line', where: 'floorBack', width_ft: 24 } },
      { name: 'set_room', input: { room_light: 0.15 } }
    ]
  },
  {
    id: 'club',
    name: 'Club stage',
    description: 'A 16 × 12 ft stage, 2 ft high with a black skirt, a 20 ft goalpost truss with four MH-150s and four Splash Pro washes, a booth on the stage and 360 Tubes behind.',
    steps: [
      { name: 'clear', input: { what: 'everything' } },
      { name: 'add_structure', input: { kind: 'stage', width_ft: 16, depth_ft: 12, height_ft: 2, cover: 'black', stairs: true, x_ft: 0, z_ft: -4 }, as: 'stage' },
      { name: 'add_structure', input: { kind: 'goalpost', width_ft: 20, height_ft: 14, x_ft: 0, z_ft: -7 }, as: 'truss' },
      { name: 'add_structure', input: { kind: 'djBooth', width_ft: 7.5, cover: 'black', beside: { structure_id: '$stage', side: 'on' } }, as: 'booth' },
      { name: 'add_fixtures', input: { library_key: both('mh-150'), mode: 16, count: 4, on: { structure_id: '$truss', point: 'under' }, group: 1 }, as: 'beams' },
      { name: 'add_fixtures', input: { library_key: both('splash-pro'), mode: 23, count: 4, on: { structure_id: '$truss', point: 'top' }, group: 2 } },
      { name: 'add_fixtures', input: { library_key: both('360-tubes'), mode: 7, count: 6, x_ft: 0, z_ft: -9, group: 3 }, as: 'tubes' },
      { name: 'arrange', input: { fixture_ids: ['$tubes'], shape: 'line', where: 'keep', width_ft: 14 } },
      { name: 'add_fixtures', input: { library_key: both('fx-pix-bar-1000'), mode: 14, on: { structure_id: '$booth', point: 'ftop' }, group: 4 } },
      { name: 'set_room', input: { room_light: 0.14 } }
    ]
  },
  {
    id: 'wedding',
    name: 'Wedding / event',
    description: 'Pipe and drape with eight S6 uplights washing it, two Spider Washes on FLEXstands and a DJ table with a black skirt.',
    steps: [
      { name: 'clear', input: { what: 'everything' } },
      { name: 'add_structure', input: { kind: 'pipeDrape', spans: 3, width_ft: 10, height_ft: 10, cover: 'white', x_ft: 0, z_ft: -10 } },
      { name: 'add_structure', input: { kind: 'table', width_ft: 8, cover: 'black', x_ft: 0, z_ft: -4 }, as: 'table' },
      { name: 'add_structure', input: { kind: 'flexstand', height_ft: 7, beside: { structure_id: '$table', side: 'left', gap_ft: 4, align: 'center' } }, as: 'fl' },
      { name: 'add_structure', input: { kind: 'flexstand', height_ft: 7, beside: { structure_id: '$table', side: 'right', gap_ft: 4, align: 'center' } }, as: 'fr' },
      { name: 'add_fixtures', input: { library_key: both('spider-wash'), mode: 10, on: { structure_id: '$fl', point: 'top' }, group: 1 } },
      { name: 'add_fixtures', input: { library_key: both('spider-wash'), mode: 10, on: { structure_id: '$fr', point: 'top' }, group: 1 } },
      { name: 'add_fixtures', input: { library_key: both('s6'), mode: 10, count: 8, x_ft: 0, z_ft: -9, group: 2 }, as: 'ups' },
      { name: 'arrange', input: { fixture_ids: ['$ups'], shape: 'line', where: 'keep', width_ft: 28 } },
      { name: 'set_room', input: { room_light: 0.3 } }
    ]
  },
  {
    id: 'empty',
    name: 'Empty room',
    description: 'No stage, truss or fixtures: build from scratch.',
    steps: [{ name: 'clear', input: { what: 'everything' } }]
  }
]

/** Run a template's steps as one undo step. Returns what went wrong, if anything. */
export function runTemplate(t: Template, lib: LibraryAccess): string[] {
  const names = new Map<string, string[]>()
  const fill = (v: unknown): unknown => {
    if (typeof v === 'string' && v.startsWith('$')) return names.get(v.slice(1))?.[0] ?? v
    if (Array.isArray(v)) return v.flatMap((x) => (typeof x === 'string' && x.startsWith('$') ? names.get(x.slice(1)) ?? [x] : [fill(x)]))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]))
    return v
  }
  const problems: string[] = []
  const mark = useStore.getState().beginBatch()
  try {
    useStore.getState().apply('Rename', (p) => ({ ...p, name: t.name, soundswitch: { link: false } }))
    for (const step of t.steps) {
      try {
        const result = runTool(lib, { name: step.name, input: fill(step.input) as Record<string, unknown> }) as { id?: string; added?: Array<{ id: string }> }
        if (step.as) names.set(step.as, result.id ? [result.id] : (result.added ?? []).map((a) => a.id))
      } catch (error) {
        problems.push(`${step.name}: ${(error as Error).message}`)
      }
    }
  } finally {
    useStore.getState().endBatch(mark, `Start from "${t.name}"`)
  }
  useStore.getState().select([])
  return problems
}

export async function startFromTemplate(id: string): Promise<void> {
  const t = TEMPLATES.find((x) => x.id === id)
  if (!t) return
  const lib = await libraryAccess()
  if (!lib) return notify('error', 'The fixture library is still loading. Try again in a moment.')
  const problems = runTemplate(t, lib)
  useDocument.getState().setSaved(null, null)
  if (problems.length) notify('error', `Some steps didn't work: ${problems.join('; ')}`)
  else notify('info', `Started from "${t.name}". Undo puts your previous show back.`)
  view.home()
}

