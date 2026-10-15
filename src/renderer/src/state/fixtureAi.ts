/**
 * Fixture Studio's help from Claude (when it's connected): reading a manual's
 * DMX chart from photos or a PDF, and searching the web for a fixture's manual,
 * DMX chart and size. Claude answers by filling in one structured form (the
 * make_fixture tool), which becomes a draft definition with every row marked as
 * read from the manual or guessed, for the person to check on the twin.
 *
 * Without Claude, typed or pasted charts are read locally (manualParser.ts) and
 * "Search the web" opens the browser with a search for the manual.
 */
import { CLAUDE_MODEL } from './showBuilder'
import { FN, KINDS, KIND_ORDER, blankDef, newKey, type ChannelDef, type ChannelFn, type FixtureDef, type FixtureKind, type PartDef } from '../model/fixtureDef'
import { rangeFromRow } from '../model/manualParser'
import type { CellLayout } from '../model/catalog'

export type AiInput = { kind: 'text'; text: string } | { kind: 'image'; mediaType: string; base64: string } | { kind: 'pdf'; base64: string }

export interface AiResult {
  def: FixtureDef
  notes: string[]
  sources: string[]
}

const FUNCTIONS = Object.keys(FN) as ChannelFn[]

const MAKE_FIXTURE = {
  name: 'make_fixture',
  description: 'Report the fixture: its name, kind, size and every DMX mode with every channel, exactly as the manual gives them.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Model name, e.g. "Freedom Stick".' },
      manufacturer: { type: 'string' },
      kind: { type: 'string', enum: KIND_ORDER, description: 'par, wash (moving head wash), spot, beam, bar, tube (pixel stick), cluster (round cells on a frame, e.g. retro lights), panel, gigbar (several effects on a bar), strobe, laser, effect (derby/moonflower), uplight, strip.' },
      size_mm: { type: 'array', items: { type: 'number' }, description: 'Width, height, depth in millimetres, if given.' },
      beam_degrees: { type: 'array', items: { type: 'number' }, description: 'Beam angle, or [narrowest, widest] for zoom.' },
      cells: { type: 'number', description: 'How many separately controllable cells or heads the light has.' },
      cell_layout: { type: 'string', enum: ['row', 'column', 'grid', 'ring', 'ringCentre', 'hex'], description: 'How the cells sit on the face.' },
      manual_url: { type: 'string', description: 'Where the manual was found (web search only).' },
      modes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'e.g. "37-channel".' },
            channels: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  number: { type: 'number', description: 'DMX channel number in this mode, from 1.' },
                  name: { type: 'string', description: 'The name the manual uses, e.g. "R1" or "Warm white COB effect".' },
                  function: { type: 'string', enum: FUNCTIONS },
                  cell: { type: 'number', description: 'Cell number (1 = first) if this channel controls one cell; omit for the whole fixture.' },
                  part: { type: 'string', description: 'If a cell has two parts (e.g. a white COB and an RGB ring), which one: "white" or "ring". Or a named part on multi-effect bars: "Derby 1", "Laser".' },
                  fine: { type: 'boolean', description: 'True for the fine (low byte) channel of a 16-bit pair.' },
                  ranges: { type: 'array', items: { type: 'object', properties: { from: { type: 'number' }, to: { type: 'number' }, label: { type: 'string' } }, required: ['from', 'to', 'label'] } },
                  guessed: { type: 'boolean', description: 'True if this row was not printed and you filled it in (e.g. the manual skipped rows with "..." or "data increases by").' }
                },
                required: ['number', 'name', 'function']
              }
            }
          },
          required: ['name', 'channels']
        }
      },
      notes: { type: 'array', items: { type: 'string' }, description: 'Short notes: rows you filled in, mistakes in the manual and how you resolved them, pages that seem missing.' }
    },
    required: ['name', 'manufacturer', 'kind', 'modes']
  }
}

const SYSTEM = `You read lighting fixture manuals and turn their DMX charts into structured data for a lighting visualizer.
- Report every mode and every channel in order. Use the manual's own channel names.
- Pick the closest function for each channel. Colour channels of a cell get that cell's number. Built-in effects/auto/sound programs are "program"; their speed is "programSpeed".
- Give value ranges exactly as printed (from, to, label). When the manual skips rows ("...", "data increases by 6"), fill them in and mark them guessed.
- If the manual contradicts itself (e.g. a label says R6 but the text says the seventh light), choose what the channel count supports and say so in notes.
- If a page with some channels is missing, say which channels in notes; don't invent them.
- Call make_fixture once with everything.`

async function ask(content: unknown[], withSearch: boolean): Promise<{ input: Record<string, unknown>; sources: string[] }> {
  if (!window.api) throw new Error('Claude is only available in the app.')
  const tools: unknown[] = [MAKE_FIXTURE]
  if (withSearch) tools.unshift({ type: 'web_search_20250305', name: 'web_search', max_uses: 6 })
  const result = await window.api.claudeRequest({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    tools,
    tool_choice: withSearch ? { type: 'auto' } : { type: 'tool', name: 'make_fixture' },
    messages: [{ role: 'user', content }]
  })
  if (!result.ok) throw new Error(result.error)
  const response = result.response as { content?: Array<{ type: string; name?: string; input?: Record<string, unknown>; content?: unknown }> }
  const call = response.content?.find((c) => c.type === 'tool_use' && c.name === 'make_fixture')
  const sources: string[] = []
  for (const block of response.content ?? []) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content as Array<{ url?: string }>) if (r.url) sources.push(r.url)
    }
  }
  if (!call?.input) throw new Error(withSearch ? 'Claude couldn’t find a DMX chart for this fixture online.' : 'Claude couldn’t read a DMX chart from that.')
  return { input: call.input, sources: [...new Set(sources)].slice(0, 8) }
}

/** Claude's form → a draft definition. */
export function defFromAi(input: Record<string, unknown>, sourceLabel: FixtureDef['source']): AiResult {
  const kind = (KIND_ORDER.includes(input.kind as FixtureKind) ? input.kind : 'par') as FixtureKind
  const base = blankDef(kind, String(input.name ?? 'New fixture'), String(input.manufacturer ?? 'Unknown'))
  const parts: PartDef[] = []
  const partKey = new Map<string, PartDef>()
  const partFor = (cell: number | undefined, part: string | undefined, fn: ChannelFn): string | null => {
    if (!cell && !part) return null
    const whiteFamily = fn === 'white' || fn === 'warmWhite' || fn === 'coolWhite'
    const label = part ? part.trim() : ''
    const key = `${cell ?? ''}|${label.toLowerCase()}`
    let p = partKey.get(key)
    if (!p) {
      const name = cell ? `Cell ${cell}${label ? ` ${label}` : ''}` : label
      const role = /laser/i.test(label) ? 'laser' : /derby|moon/i.test(label) ? 'derby' : /strobe/i.test(label) ? 'strobe' : cell ? 'pixel' : 'beam'
      p = { id: newKey('p'), name, role, ...(cell ? { cell: cell - 1 } : {}), ...(fn === 'warmWhite' || (whiteFamily && /warm|cob/i.test(label)) ? { tint: 'warm' as const } : {}) }
      partKey.set(key, p)
      parts.push(p)
    }
    return p.id
  }
  const modes = ((input.modes as Array<Record<string, unknown>>) ?? []).map((m) => {
    const rows = ((m.channels as Array<Record<string, unknown>>) ?? []).slice().sort((a, b) => Number(a.number) - Number(b.number))
    const top = Math.max(0, ...rows.map((r) => Number(r.number) || 0))
    const channels: ChannelDef[] = []
    for (let n = 1; n <= top; n++) {
      const r = rows.find((x) => Number(x.number) === n)
      if (!r) {
        channels.push({ id: newKey('c'), name: `Channel ${n}`, fn: 'other', part: null, ranges: [], confidence: 'missing', note: 'Not in the manual pages given.' })
        continue
      }
      const fn = (FUNCTIONS.includes(r.function as ChannelFn) ? r.function : 'other') as ChannelFn
      const ranges = ((r.ranges as Array<{ from: number; to: number; label: string }>) ?? []).map((x, k) => rangeFromRow(fn, { lo: Math.max(0, Math.min(255, x.from)), hi: Math.max(0, Math.min(255, x.to)), label: x.label }, k))
      const level = FN[fn].style === 'level' && ranges.length === 1 && ranges[0].lo === 0 && ranges[0].hi === 255
      const ch: ChannelDef = { id: newKey('c'), name: String(r.name ?? FN[fn].label), fn, part: partFor(r.cell as number | undefined, r.part as string | undefined, fn), ranges: level ? [] : ranges, confidence: r.guessed ? 'guessed' : 'manual' }
      if (r.fine) ch.fine = true
      if (r.guessed) ch.note = 'Filled in: not printed in the manual.'
      channels.push(ch)
    }
    return { id: newKey('m'), name: String(m.name ?? `${channels.length}-channel`), channels }
  })
  const size = input.size_mm as number[] | undefined
  const beam = input.beam_degrees as number[] | undefined
  const layoutKind = input.cell_layout as CellLayout['kind'] | undefined
  const def: FixtureDef = {
    ...base,
    parts,
    modes,
    manualUrl: typeof input.manual_url === 'string' ? input.manual_url : undefined,
    look: {
      ...base.look,
      size: size && size.length === 3 && size.every((v) => v > 0) ? [size[0] / 1000, size[1] / 1000, size[2] / 1000] : base.look.size,
      beam: beam && beam.length ? [beam[0], beam[beam.length - 1]] : base.look.beam,
      layout: layoutKind ? { kind: layoutKind } : kind === 'cluster' && parts.length ? { kind: new Set(parts.map((p) => p.cell)).size === 7 ? 'ringCentre' : 'hex' } : base.look.layout
    },
    source: sourceLabel
  }
  if (!size) (input.notes as string[] | undefined)?.push?.('No size given: the look uses a typical size for this kind of light.')
  return { def, notes: ((input.notes as string[]) ?? []).map(String), sources: [] }
}

export async function readManualWithClaude(inputs: AiInput[], hint: { name?: string; manufacturer?: string; kind?: FixtureKind }): Promise<AiResult> {
  const content: unknown[] = inputs.map((i) =>
    i.kind === 'text'
      ? { type: 'text', text: `Manual text:\n${i.text}` }
      : i.kind === 'image'
        ? { type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.base64 } }
        : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: i.base64 } }
  )
  const known = [hint.manufacturer, hint.name].filter(Boolean).join(' ')
  content.push({ type: 'text', text: `Read the DMX chart${known ? ` of the ${known}` : ''}${hint.kind ? ` (a ${KINDS[hint.kind].label.toLowerCase()})` : ''} and call make_fixture.` })
  const { input } = await ask(content, false)
  return defFromAi(input, { kind: 'manual', label: 'Read from the manual by Claude' })
}

export async function searchWebWithClaude(manufacturer: string, model: string): Promise<AiResult> {
  const { input, sources } = await ask(
    [{ type: 'text', text: `Find the user manual or DMX chart for the ${manufacturer} ${model} lighting fixture on the web (the maker's site, retailers, manual sites), plus its size and beam angle. Then call make_fixture with every DMX mode and channel, and the manual's URL. If you can't find a DMX chart, call make_fixture with what you found and say so in notes.` }],
    true
  )
  const result = defFromAi(input, { kind: 'web', label: 'Found on the web by Claude', url: typeof input.manual_url === 'string' ? input.manual_url : sources[0] })
  return { ...result, sources }
}

/** Without Claude: a web search for the manual in the browser. */
export function openManualSearch(manufacturer: string, model: string): void {
  const q = encodeURIComponent(`${manufacturer} ${model} DMX manual pdf`.trim())
  window.open(`https://www.google.com/search?q=${q}`, '_blank')
}

/** Shrink a photo before sending it: big phone photos are many megabytes. */
export async function photoForClaude(file: Blob): Promise<{ mediaType: string; base64: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/jpeg', 0.85)
  return { mediaType: 'image/jpeg', base64: url.slice(url.indexOf(',') + 1) }
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
