/**
 * Entering a DMX chart from the manual as a table instead of raw text: one row
 * per channel with what it does (picked from the list, or worked out from the
 * name as you type it), its name, which part it drives (the whole light, a
 * cell, an LED ring) and, if the manual lists them, its value ranges.
 *
 * Pasting the chart from a PDF anywhere in the table fills it in; a kind of
 * light and a starting layout can fill it too, to correct row by row.
 */
import { useMemo, useState } from 'react'
import { FN, KINDS, KIND_ORDER, newKey, type ChannelDef, type FixtureDef, type FixtureKind, type PartDef, type RangeDef } from '../../model/fixtureDef'
import { cellFromText, fnFromText, parseChart, rangeFromRow } from '../../model/manualParser'
import { guessKind, withKind } from '../../model/fixtureStarts'
import { FnButton } from './FnPicker'
import { StartPicker } from './StartPicker'

function blankRow(): ChannelDef {
  return { id: newKey('c'), name: '', fn: 'other', part: null, ranges: [], confidence: 'missing' }
}
const isBlank = (c: ChannelDef) => !c.name.trim() && c.fn === 'other' && c.confidence === 'missing'

function emptyDraft(rows = 6): FixtureDef {
  return {
    format: 'sound-visualizer-fixture', formatVersion: 1, id: newKey('fx'), name: 'New fixture', manufacturer: 'Generic', kind: 'par',
    look: { shape: 'par', size: [0.2, 0.2, 0.15], beam: [25, 25], output: 0.8, mount: 'floor' },
    parts: [], modes: [{ id: newKey('m'), name: 'Mode 1', channels: Array.from({ length: rows }, blankRow) }],
    revision: 0, history: [], source: { kind: 'manual', label: 'Typed from the manual' }
  }
}

export function ChartTable({ name, maker, onMake, claude, onClaude }: { name?: string; maker?: string; onMake: (def: FixtureDef, notes: string[]) => void; claude: boolean; onClaude: (text: string) => void }) {
  const [draft, setDraft] = useState<FixtureDef>(() => emptyDraft())
  const [kind, setKind] = useState<FixtureKind | ''>('')
  const [notes, setNotes] = useState<string[]>([])
  const [prev, setPrev] = useState<FixtureDef | null>(null)
  const [openRanges, setOpenRanges] = useState<string | null>(null)
  const [template, setTemplate] = useState(false)
  const [rawText, setRawText] = useState<string | null>(null)
  const channels = draft.modes[0].channels
  const filled = channels.filter((c) => !isBlank(c)).length

  const update = (change: (d: FixtureDef) => FixtureDef) => setDraft((d) => change(d))
  const setChannels = (f: (cs: ChannelDef[]) => ChannelDef[]) => update((d) => ({ ...d, modes: [{ ...d.modes[0], channels: f(d.modes[0].channels) }] }))
  const editRow = (id: string, change: Partial<ChannelDef>) => setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, ...change } : c)))

  const replaceWith = (def: FixtureDef, why: string[]) => {
    setPrev(draft)
    setDraft({ ...def, modes: [def.modes[def.modes.length > 1 ? def.modes.reduce((b, m, i) => (m.channels.length > def.modes[b].channels.length ? i : b), 0) : 0]] })
    setKind(def.kind)
    setNotes(why)
    setTemplate(false)
  }

  const takeText = (text: string): boolean => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2 || !lines.some((l) => /^\s*(ch(annel)?\.?\s*)?\d{1,3}\b/i.test(l))) return false
    const { def, notes: n } = parseChart(text, kind || undefined, name, maker)
    if (!def.modes[0]?.channels.length) return false
    replaceWith(def, [`Read ${def.modes[0].channels.length} channels from the pasted text: check each row.`, ...n])
    return true
  }

  /** Name typed: work out the job and the cell from it, unless one was picked. */
  const typedName = (c: ChannelDef, value: string) => {
    const change: Partial<ChannelDef> = { name: value, confidence: 'manual' }
    if (c.fn === 'other' || c.confidence === 'missing' || (c.confidence === 'manual' && c.ranges.length === 0 && fnFromText(c.name) === c.fn)) {
      const fn = fnFromText(value)
      if (fn) change.fn = fn
    }
    const cell = cellFromText(value, '')
    if (cell && !c.part) change.part = cellPart(cell.cell - 1)
    editRow(c.id, change)
  }

  const cellPart = (k: number): string => {
    const found = draft.parts.find((p) => p.role === 'pixel' && p.cell === k && !/ring/i.test(p.name))
    if (found) return found.id
    const p: PartDef = { id: newKey('p'), name: `Cell ${k + 1}`, role: 'pixel', cell: k }
    update((d) => ({ ...d, parts: [...d.parts, p] }))
    return p.id
  }

  const setPart = (c: ChannelDef, v: string) => {
    if (v === '') return editRow(c.id, { part: null })
    if (v === '+cell') {
      const next = Math.max(-1, ...draft.parts.filter((p) => p.role === 'pixel').map((p) => p.cell ?? 0)) + 1
      return editRow(c.id, { part: cellPart(next) })
    }
    if (v === '+ring') {
      let ring = draft.parts.find((p) => p.role === 'halo' && p.cell === undefined)
      if (!ring) {
        ring = { id: newKey('p'), name: 'LED ring', role: 'halo' }
        const r = ring
        update((d) => ({ ...d, parts: [...d.parts, r] }))
      }
      return editRow(c.id, { part: ring.id })
    }
    editRow(c.id, { part: v })
  }

  const setCount = (n: number) => {
    const k = Math.max(1, Math.min(512, Math.round(n)))
    setChannels((cs) => (k <= cs.length ? cs.slice(0, k) : [...cs, ...Array.from({ length: k - cs.length }, blankRow)]))
  }

  const make = () => {
    let cs = channels.slice()
    while (cs.length && isBlank(cs[cs.length - 1])) cs.pop()
    if (!cs.length) return
    cs = cs.map((c, i) => (isBlank(c) ? { ...c, name: `Channel ${i + 1}`, note: 'Left blank in the table: set what it does from the manual.' } : c))
    const used = new Set(cs.map((c) => c.part))
    let def: FixtureDef = { ...draft, name: name || draft.name, manufacturer: maker || draft.manufacturer, parts: draft.parts.filter((p) => used.has(p.id)), modes: [{ ...draft.modes[0], name: /^Mode 1$/.test(draft.modes[0].name) ? `${cs.length}-channel` : draft.modes[0].name, channels: cs }] }
    const k = kind || guessKind(def)
    def = withKind(def, k)
    const blanks = cs.filter((c) => c.confidence === 'missing').length
    onMake(def, [...notes, ...(blanks ? [`${blanks} channel${blanks === 1 ? '' : 's'} still blank (red rows): pick what ${blanks === 1 ? 'it does' : 'they do'} from the manual.`] : [])])
  }

  const partOptions = useMemo(() => [...draft.parts].sort((a, b) => (a.cell ?? 999) - (b.cell ?? 999)), [draft.parts])

  return (
    <div
      className="chart-table"
      onPaste={(e) => {
        const text = e.clipboardData.getData('text')
        if (/\n/.test(text) && takeText(text)) e.preventDefault()
      }}
    >
      <div className="ct-tools">
        <label className="ct-field" title="The kind of light: sets its look on the twin and its tests. Leave it and it's worked out from the channels.">
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as FixtureKind | '')}>
            <option value="">Work it out</option>
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KINDS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="ct-field" title="How many channels this mode has (the number in the manual, e.g. “13CH mode”). Rows are added or removed at the end.">
          Channels
          <input type="number" min={1} max={512} value={channels.length} onChange={(e) => setCount(Number(e.target.value) || 1)} />
        </label>
        <span className="spacer" />
        <button className="mini" onClick={() => setTemplate(!template)} title="Fill the table from a usual layout for this kind of light, then correct it row by row">
          Fill from a template…
        </button>
        <button
          className="mini"
          onClick={async () => {
            const text = await navigator.clipboard?.readText?.().catch(() => '')
            if (!text || !takeText(text)) setRawText(text ?? '')
          }}
          title="Copy the DMX chart from the manual's PDF, then press this (or just paste anywhere in the table)"
        >
          Paste the chart
        </button>
        {prev && (
          <button className="mini quiet" onClick={() => (setDraft(prev), setPrev(null), setNotes([]))} title="Put the table back as it was before the paste or template">
            Undo fill
          </button>
        )}
      </div>

      {template && (
        <div className="ct-template">
          {kind ? (
            <StartPicker kind={kind} name={name} maker={maker} action="Fill" onClose={() => setKind('')} onPick={(def, note) => replaceWith(def, [note])} />
          ) : (
            <>
              <p className="hint">What kind of light is it?</p>
              <div className="kind-chips">
                {KIND_ORDER.map((k) => (
                  <button key={k} className="mini" onClick={() => setKind(k)}>
                    {KINDS[k].label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {rawText !== null && (
        <div className="ct-raw">
          <p className="hint">Paste the chart here as text (from the PDF, a web page or an email): it's read into the table.</p>
          <textarea autoFocus value={rawText} onChange={(e) => setRawText(e.target.value)} spellCheck={false} placeholder={'1  Dimmer  0-255\n2  Red\n3  Green\n4  Blue\n5  Strobe  0-9 off, 10-255 slow to fast'} />
          <div className="tile-actions">
            <button className="primary mini" disabled={!rawText.trim()} onClick={() => (takeText(rawText) ? setRawText(null) : setNotes(['Couldn’t find channel rows in that text: each channel should start with its number.']))}>
              Read into the table
            </button>
            {claude && (
              <button className="mini" disabled={!rawText.trim()} onClick={() => onClaude(rawText)} title="For messy text: Claude reads it instead">
                ✦ Read with Claude
              </button>
            )}
            <button className="mini quiet" onClick={() => setRawText(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="ct-notes">
          {notes.slice(0, 6).map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      <div className="ct-grid" role="table">
        <div className="ct-row ct-headrow" role="row">
          <span>#</span>
          <span>Name in the manual</span>
          <span>What it does</span>
          <span title="What part of the light it drives: the whole light, one cell (pixel), or an LED ring">Part</span>
          <span title="Value ranges, if the manual lists them (e.g. 0–9 off, 10–255 strobe slow to fast)">Values</span>
          <span />
        </div>
        {channels.map((c, i) => (
          <div key={c.id} className="ct-block">
            <div className={`ct-row ${c.confidence === 'missing' && !isBlank(c) ? 'missing' : ''}`} role="row">
              <span className="ct-no">{i + 1}</span>
              <input
                value={c.name}
                placeholder={i === 0 ? 'e.g. Dimmer' : i === 1 ? 'e.g. Red 1' : ''}
                onChange={(e) => typedName(c, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.shiftKey)) {
                    e.preventDefault()
                    if (i === channels.length - 1) setChannels((cs) => [...cs, blankRow()])
                    setTimeout(() => (document.querySelectorAll<HTMLInputElement>('.ct-row:not(.ct-headrow) > input')[i + 1])?.focus(), 0)
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    document.querySelectorAll<HTMLInputElement>('.ct-row:not(.ct-headrow) > input')[i - 1]?.focus()
                  }
                }}
              />
              {isBlank(c) ? (
                <span className="ct-fn-blank">
                  <FnButton value="other" several onPick={(fn) => editRow(c.id, { fn, name: c.name || FN[fn].label, confidence: 'manual', ranges: [] })} />
                </span>
              ) : (
                <FnButton value={c.fn} onPick={(fn) => editRow(c.id, { fn, confidence: c.confidence === 'missing' ? 'manual' : c.confidence, ranges: c.ranges.map((r, k) => rangeFromRow(fn, r, k)) })} />
              )}
              <select value={c.part ?? ''} onChange={(e) => setPart(c, e.target.value)}>
                <option value="">Whole light</option>
                {partOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="+cell">New cell</option>
                {!draft.parts.some((p) => p.role === 'halo') && <option value="+ring">LED ring</option>}
              </select>
              <button className={`mini ct-ranges ${c.ranges.length ? 'has' : ''}`} onClick={() => setOpenRanges(openRanges === c.id ? null : c.id)} title="Add the value ranges the manual lists for this channel">
                {c.ranges.length ? `${c.ranges.length} range${c.ranges.length === 1 ? '' : 's'}` : '0–255'} {openRanges === c.id ? '▴' : '▾'}
              </button>
              <button className="mini quiet ct-del" onClick={() => setChannels((cs) => (cs.length > 1 ? cs.filter((x) => x.id !== c.id) : cs))} title="Remove this row">
                ✕
              </button>
            </div>
            {openRanges === c.id && <RangeRows ch={c} onChange={(ranges) => editRow(c.id, { ranges })} />}
          </div>
        ))}
      </div>
      <div className="tile-actions">
        <button className="mini" onClick={() => setChannels((cs) => [...cs, blankRow()])}>
          + Row
        </button>
        <span className="hint">Enter goes to the next row · paste a whole chart anywhere to fill the table</span>
        <span className="spacer" />
        <button className="primary" disabled={!filled} onClick={make} title="Open it in the Studio as a 3D twin to test and adjust">
          Make the fixture ({filled} channel{filled === 1 ? '' : 's'})
        </button>
      </div>
    </div>
  )
}

function RangeRows({ ch, onChange }: { ch: ChannelDef; onChange: (r: RangeDef[]) => void }) {
  const rows = ch.ranges
  const set = (k: number, change: Partial<{ lo: number; hi: number; label: string }>) => {
    const next = rows.map((r, j) => (j === k ? rangeFromRow(ch.fn, { lo: change.lo ?? r.lo, hi: change.hi ?? r.hi, label: change.label ?? r.label }, j) : r))
    onChange(next)
  }
  const add = () => {
    const last = rows[rows.length - 1]
    const lo = last ? Math.min(255, last.hi + 1) : 0
    onChange([...rows, rangeFromRow(ch.fn, { lo, hi: 255, label: '' }, rows.length)])
  }
  return (
    <div className="ct-ranges-box">
      {rows.map((r, k) => (
        <div key={k} className="ct-range">
          <input type="number" min={0} max={255} value={r.lo} onChange={(e) => set(k, { lo: Math.max(0, Math.min(255, Number(e.target.value))) })} title="From" />
          <span>–</span>
          <input type="number" min={0} max={255} value={r.hi} onChange={(e) => set(k, { hi: Math.max(0, Math.min(255, Number(e.target.value))) })} title="To" />
          <input className="ct-range-label" value={r.label} placeholder="What it does, e.g. Strobe slow to fast" onChange={(e) => set(k, { label: e.target.value })} />
          {r.color && <span className="ct-colour" style={{ background: r.color }} title="Colour worked out from the words" />}
          <button className="mini quiet" onClick={() => onChange(rows.filter((_, j) => j !== k))} title="Remove this range">
            ✕
          </button>
        </div>
      ))}
      <button className="mini" onClick={add}>
        + Range
      </button>
      {!rows.length && <span className="hint"> A plain 0–255 level needs none.</span>}
    </div>
  )
}
