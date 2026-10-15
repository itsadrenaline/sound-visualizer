/**
 * The DMX chart as a list: one row per channel with what it does, its part, a
 * slider to try it and a dot for how sure we are. Hovering a row flashes that
 * channel on the twin. Click to pick, Shift-click for a range, Cmd-click to add
 * one; the buttons above then work on everything picked at once. Repeated cells
 * fold into one row ("Cells 1-16 · Red Green Blue"), so a 100-channel bar stays short.
 */
import { useMemo, useState } from 'react'
import { CONFIDENCE, FN, FN_GROUPS, channelLabel, type ChannelDef, type ChannelFn, type FixtureDef } from '../../model/fixtureDef'
import { restValue } from '../../model/fixtureTests'
import { addChannels, deleteChannels, editChannels, moveChannels, repeatForCells, useStudio } from '../../state/studio'

type Row = { kind: 'channel'; index: number; ch: ChannelDef } | { kind: 'group'; key: string; label: string; indexes: number[] }

/** A value that shows the channel doing something, for the hover flash. */
export function flashValue(c: ChannelDef): number {
  const style = FN[c.fn].style
  if (style === 'slots' || style === 'program' || style === 'spin') {
    const r = c.ranges.find((x) => x.kind !== 'off' && x.kind !== 'closed' && (x.from ?? 1) !== 0) ?? c.ranges[1] ?? c.ranges[0]
    return r ? Math.round((r.lo + r.hi) / 2) : 200
  }
  if (style === 'shutter') {
    const s = c.ranges.find((r) => r.kind === 'strobe')
    return s ? Math.round(s.lo + (s.hi - s.lo) * 0.3) : 80
  }
  if (c.fn === 'pan' || c.fn === 'tilt') return 40
  return 255
}

function buildRows(def: FixtureDef, channels: ChannelDef[], open: Set<string>): Row[] {
  const rows: Row[] = []
  const partCell = new Map(def.parts.map((p) => [p.id, p]))
  let i = 0
  while (i < channels.length) {
    const c = channels[i]
    const part = c.part ? partCell.get(c.part) : undefined
    if (!part || part.role !== 'pixel') {
      rows.push({ kind: 'channel', index: i, ch: c })
      i++
      continue
    }
    // A run of cell channels: find the pattern of the first cell and how far it repeats.
    let j = i
    while (j < channels.length && channels[j].part && partCell.get(channels[j].part!)?.role === 'pixel') j++
    const run = channels.slice(i, j)
    const firstPart = run[0].part
    let unit = run.findIndex((x) => x.part !== firstPart)
    if (unit < 0) unit = run.length
    const pattern = run.slice(0, unit).map((x) => x.fn).join()
    let cells = 0
    for (let k = 0; k + unit <= run.length; k += unit) {
      const slice = run.slice(k, k + unit)
      if (slice.map((x) => x.fn).join() !== pattern || new Set(slice.map((x) => x.part)).size !== 1) break
      cells++
    }
    const covered = cells * unit
    if (cells >= 3 && covered >= 9) {
      const key = `${run[0].id}-${covered}`
      const names = run.slice(0, unit).map((x) => FN[x.fn].label).join(', ')
      const firstName = partCell.get(run[0].part!)?.name ?? 'Cell'
      const lastName = partCell.get(run[covered - 1].part!)?.name ?? ''
      rows.push({ kind: 'group', key, label: `${firstName} – ${lastName.replace(/^Cell /, '')} · ${names}`, indexes: Array.from({ length: covered }, (_, k) => i + k) })
      if (open.has(key)) for (let k = 0; k < covered; k++) rows.push({ kind: 'channel', index: i + k, ch: channels[i + k] })
      i += covered
    } else {
      for (let k = i; k < j; k++) rows.push({ kind: 'channel', index: k, ch: channels[k] })
      i = j
    }
  }
  return rows
}

export function ChannelList({ def }: { def: FixtureDef }) {
  const modeIndex = useStudio((s) => s.modeIndex)
  const selected = useStudio((s) => s.selected)
  const levels = useStudio((s) => s.levels)
  const driving = useStudio((s) => s.driving)
  const mode = def.modes[modeIndex]
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const channels = mode?.channels ?? []
  const rows = useMemo(() => buildRows(def, channels, open), [def, channels, open])
  const st = useStudio.getState

  const pick = (e: React.MouseEvent, index: number, ids: string[]) => {
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, index), Math.max(anchor, index)]
      st().select(channels.slice(a, b + 1).map((c) => c.id))
      return
    }
    if (e.metaKey || e.ctrlKey) {
      const all = ids.every((id) => selected.includes(id)) ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]
      st().select(all)
    } else st().select(ids)
    setAnchor(index)
  }

  const sel = channels.filter((c) => selected.includes(c.id))
  const [adding, setAdding] = useState(false)
  const [repeat, setRepeat] = useState<number | null>(null)
  return (
    <div className="ch-list" data-tour="studio-channels">
      <div className="ch-tools">
        <div className="ch-add">
          <button className="mini" onClick={() => setAdding(!adding)} title="Add a channel after the selected one (or at the end)">
            + Channel
          </button>
          {adding && (
            <select
              autoFocus
              size={10}
              className="fn-pick"
              onChange={(e) => {
                addChannels([e.target.value as ChannelFn], sel[0]?.part ?? null, sel.at(-1)?.id)
                setAdding(false)
              }}
              onBlur={() => setAdding(false)}
            >
              {FN_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {(Object.keys(FN) as ChannelFn[]).filter((f) => FN[f].group === g).map((f) => (
                    <option key={f} value={f}>
                      {FN[f].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
        <button className="mini" disabled={!sel.length} onClick={() => moveChannels(selected, -1)} title="Move the selected channels up one">
          ↑
        </button>
        <button className="mini" disabled={!sel.length} onClick={() => moveChannels(selected, 1)} title="Move the selected channels down one">
          ↓
        </button>
        {repeat === null ? (
          <button className="mini" disabled={!sel.length} onClick={() => setRepeat(8)} title="Make the selected channels cell 1, and repeat them for the other cells (e.g. Red, Green, Blue × 8)">
            Repeat for cells…
          </button>
        ) : (
          <span className="inline-ask">
            ×
            <input type="number" min={2} max={128} value={repeat} autoFocus onChange={(e) => setRepeat(Number(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && (repeatForCells(selected, Math.max(2, Math.min(128, repeat))), setRepeat(null))} />
            cells
            <button className="mini" onClick={() => (repeatForCells(selected, Math.max(2, Math.min(128, repeat))), setRepeat(null))}>
              OK
            </button>
            <button className="mini quiet" onClick={() => setRepeat(null)}>
              Cancel
            </button>
          </span>
        )}
        <button className="mini" disabled={!sel.some((c) => c.confidence === 'guessed' || c.confidence === 'manual')} onClick={() => editChannels(selected, (c) => (c.confidence === 'missing' ? c : { ...c, confidence: 'checked' }))} title="You've checked these against the light or the manual">
          ✓ Checked
        </button>
        <button className="mini danger" disabled={!sel.length} onClick={() => deleteChannels(selected)} title="Remove the selected channels from this mode">
          Delete
        </button>
      </div>
      <div className="ch-rows" onMouseLeave={() => st().setPreview(null)}>
        {!channels.length && <p className="hint">No channels yet. Add them with + Channel, paste the manual's chart from the start screen, or pick a type.</p>}
        {rows.map((r) => {
          if (r.kind === 'group') {
            const ids = r.indexes.map((k) => channels[k].id)
            const isOpen = open.has(r.key)
            const on = ids.every((id) => selected.includes(id))
            return (
              <div key={r.key} className={`ch-row group ${on ? 'on' : ''}`} onClick={(e) => pick(e, r.indexes[0], ids)}>
                <button
                  className="caret"
                  onClick={(e) => {
                    e.stopPropagation()
                    const next = new Set(open)
                    if (isOpen) next.delete(r.key)
                    else next.add(r.key)
                    setOpen(next)
                  }}
                  title={isOpen ? 'Fold these cells' : 'Show every channel of these cells'}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
                <span className="ch-no">
                  {r.indexes[0] + 1}–{r.indexes.at(-1)! + 1}
                </span>
                <span className="ch-name">{r.label}</span>
                <span className="ch-meta">{r.indexes.length} ch</span>
              </div>
            )
          }
          const c = r.ch
          const i = r.index
          const on = selected.includes(c.id)
          const value = levels[i] ?? restValue(c)
          return (
            <div
              key={c.id}
              className={`ch-row ${on ? 'on' : ''} ${c.confidence}`}
              onClick={(e) => pick(e, i, [c.id])}
              onMouseEnter={() => !driving.scene && st().setPreview({ channel: i, value: flashValue(c) })}
            >
              <span className="ch-dot" title={CONFIDENCE[c.confidence].label + ': ' + CONFIDENCE[c.confidence].explain} />
              <span className="ch-no">{i + 1}</span>
              <span className="ch-swatch" style={{ background: FN[c.fn].swatch }} title={FN[c.fn].label} />
              <span className="ch-name" title={c.note ?? FN[c.fn].explain}>
                {channelLabel(def, c)}
              </span>
              <span className="ch-meta">{c.fine ? 'fine' : FN[c.fn].label === c.name ? '' : FN[c.fn].label}</span>
              <input
                type="range"
                min={0}
                max={255}
                value={value}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => st().setPreview(null)}
                onChange={(e) => st().setLevel(i, Number(e.target.value))}
                title={`Try it: ${value}`}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
