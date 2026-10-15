/**
 * The right-hand panel for what's picked: one channel (what it does, its part,
 * 16-bit, and its value ranges on a bar you can hover and drag), several
 * channels at once (set their job, part or status together), or a part clicked
 * in the schematic (its name, cell and kind).
 */
import { useState } from 'react'
import { CONFIDENCE, FN, FN_GROUPS, defaultRanges, newKey, type ChannelDef, type ChannelFn, type Confidence, type FixtureDef, type PartDef } from '../../model/fixtureDef'
import type { ProgramPattern } from '../../model/heads'
import { tidyRanges } from '../../model/fixtureChecks'
import { editChannels, setChannelFn, useStudio } from '../../state/studio'
import { ValueBar } from './ValueBar'

const PATTERNS: ProgramPattern[] = ['chase', 'fade', 'jump', 'rainbow', 'strobe', 'pulse', 'static', 'none']

export function FnSelect({ value, onChange }: { value: ChannelFn | ''; onChange: (fn: ChannelFn) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as ChannelFn)}>
      {value === '' && <option value="">Several…</option>}
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
  )
}

function PartSelect({ def, value, onChange }: { def: FixtureDef; value: string | null | '~'; onChange: (id: string | null) => void }) {
  return (
    <select
      value={value === null ? '' : value}
      onChange={(e) => {
        if (e.target.value === '+') {
          // A new part, named for now: rename it when the schematic shows it (click it there).
          const part: PartDef = { id: newKey('p'), name: `Part ${def.parts.length + 1}`, role: 'pixel', cell: def.parts.length }
          useStudio.getState().edit((d) => ({ ...d, parts: [...d.parts, part] }))
          onChange(part.id)
        } else onChange(e.target.value || null)
      }}
    >
      {value === '~' && <option value="~">Several…</option>}
      <option value="">Whole fixture</option>
      {def.parts.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      <option value="+">New part…</option>
    </select>
  )
}

export function ChannelPanel({ def }: { def: FixtureDef }) {
  const modeIndex = useStudio((s) => s.modeIndex)
  const selected = useStudio((s) => s.selected)
  const selectedPart = useStudio((s) => s.selectedPart)
  const mode = def.modes[modeIndex]
  const chosen = mode?.channels.filter((c) => selected.includes(c.id)) ?? []
  const part = def.parts.find((p) => p.id === selectedPart)

  return (
    <div className="ch-panel">
      {part && <PartEditor def={def} part={part} />}
      {chosen.length === 0 && !part && <p className="hint">Pick a channel in the list, a box on the DMX strip, or a cell on the schematic to see and change what it does.</p>}
      {chosen.length === 1 && <OneChannel def={def} ch={chosen[0]} index={mode.channels.indexOf(chosen[0])} />}
      {chosen.length > 1 && <ManyChannels def={def} chosen={chosen} />}
    </div>
  )
}

function OneChannel({ def, ch, index }: { def: FixtureDef; ch: ChannelDef; index: number }) {
  const [picked, setPicked] = useState<number | null>(null)
  const ranges = [...ch.ranges].sort((a, b) => a.lo - b.lo)
  const setRanges = (r: ChannelDef['ranges']) => editChannels([ch.id], (c) => ({ ...c, ranges: r }))
  const style = FN[ch.fn].style
  const r = picked !== null ? ranges[picked] : null
  const setRange = (change: Partial<ChannelDef['ranges'][number]>) => {
    if (picked === null) return
    setRanges(ranges.map((x, k) => (k === picked ? { ...x, ...change } : x)))
  }
  return (
    <div className="one-ch">
      <div className="panel-title">
        Channel {index + 1}
        <span className={`conf ${ch.confidence}`}>{CONFIDENCE[ch.confidence].label}</span>
      </div>
      {ch.note && <p className="hint">{ch.note}</p>}
      <label className="field">
        <span className="label">Name</span>
        <input value={ch.name} onChange={(e) => editChannels([ch.id], (c) => ({ ...c, name: e.target.value }))} />
      </label>
      <label className="field">
        <span className="label">What it does</span>
        <FnSelect value={ch.fn} onChange={(fn) => setChannelFn([ch.id], fn)} />
      </label>
      <p className="explain">{FN[ch.fn].explain}</p>
      <label className="field">
        <span className="label">Drives</span>
        <PartSelect def={def} value={ch.part} onChange={(part) => editChannels([ch.id], (c) => ({ ...c, part }))} />
      </label>
      <div className="row-2">
        <label className="check" title="The low byte of a 16-bit pair: it follows the channel before it with the same job, for smoother movement">
          <input type="checkbox" checked={!!ch.fine} onChange={(e) => editChannels([ch.id], (c) => ({ ...c, fine: e.target.checked || undefined }))} /> Fine (16-bit)
        </label>
        <label className="field small">
          <span className="label">Status</span>
          <select value={ch.confidence} onChange={(e) => editChannels([ch.id], (c) => ({ ...c, confidence: e.target.value as Confidence }))}>
            {(Object.keys(CONFIDENCE) as Confidence[]).map((k) => (
              <option key={k} value={k}>
                {CONFIDENCE[k].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {ch.fn === 'program' && def.parts.length > 0 && (
        <label className="field">
          <span className="label">Runs on</span>
          <select
            value={ch.targets?.length ? (ch.targets.every((t) => def.parts.find((p) => p.id === t)?.tint === 'warm') ? 'white' : 'some') : ''}
            onChange={(e) => {
              const v = e.target.value
              const targets = v === 'white' ? def.parts.filter((p) => p.tint === 'warm' || /white|cob/i.test(p.name)).map((p) => p.id) : v === 'colour' ? def.parts.filter((p) => !(p.tint === 'warm' || /white|cob/i.test(p.name))).map((p) => p.id) : undefined
              editChannels([ch.id], (c) => ({ ...c, targets }))
            }}
          >
            <option value="">Every part that makes light</option>
            <option value="white">The white parts</option>
            <option value="colour">The colour parts</option>
            {ch.targets?.length ? <option value="some">Chosen parts</option> : null}
          </select>
        </label>
      )}

      {!ch.fine && (
        <>
          <div className="panel-sub">
            Values
            {style !== 'level' && (
              <span className="sub-tools">
                <button className="mini" onClick={() => setRanges(defaultRanges(ch.fn))} title="Replace with the usual ranges for this kind of channel">
                  Usual
                </button>
                <button
                  className="mini"
                  onClick={() => {
                    const last = ranges.at(-1)
                    const lo = last ? Math.min(255, last.hi + 1) : 0
                    setRanges([...ranges, { lo, hi: 255, label: 'New range', kind: style === 'program' ? 'program' : style === 'slots' ? 'slot' : style === 'shutter' ? 'strobe' : style === 'spin' ? 'spin' : undefined, pattern: style === 'program' ? 'chase' : undefined }])
                  }}
                  title="Add a range at the end"
                >
                  + Range
                </button>
              </span>
            )}
          </div>
          <ValueBar ch={ch} index={index} onRanges={setRanges} picked={picked} onPick={setPicked} />
          {r && (
            <div className="range-edit">
              <div className="row-3">
                <label className="field small">
                  <span className="label">From</span>
                  <input type="number" min={0} max={255} value={r.lo} onChange={(e) => setRange({ lo: Number(e.target.value) })} onBlur={() => setRanges(tidyRanges(ranges))} />
                </label>
                <label className="field small">
                  <span className="label">To</span>
                  <input type="number" min={0} max={255} value={r.hi} onChange={(e) => setRange({ hi: Number(e.target.value) })} onBlur={() => setRanges(tidyRanges(ranges))} />
                </label>
                <button className="mini danger" onClick={() => (setRanges(ranges.filter((_, k) => k !== picked)), setPicked(null))} title="Remove this range">
                  Remove
                </button>
              </div>
              <label className="field">
                <span className="label">Label</span>
                <input value={r.label} onChange={(e) => setRange({ label: e.target.value })} />
              </label>
              {style === 'shutter' && (
                <div className="seg-choice">
                  {(['closed', 'open', 'strobe'] as const).map((k) => (
                    <button key={k} className={`mini ${r.kind === k ? 'active' : ''}`} onClick={() => setRange({ kind: k })}>
                      {k === 'closed' ? 'Dark' : k === 'open' ? 'Open' : 'Strobe'}
                    </button>
                  ))}
                </div>
              )}
              {style === 'slots' && ch.fn !== 'gobo' && (
                <label className="field">
                  <span className="label">Colour</span>
                  <input type="color" value={r.color ?? '#ffffff'} onChange={(e) => setRange({ color: e.target.value, kind: 'slot' })} />
                </label>
              )}
              {ch.fn === 'gobo' && (
                <label className="field">
                  <span className="label">Gobo picture</span>
                  <select value={r.gobo ?? 0} onChange={(e) => setRange({ gobo: Number(e.target.value), kind: 'slot' })}>
                    <option value={0}>Open (no gobo)</option>
                    {[1, 2, 3, 4, 5, 6, 7].map((g) => (
                      <option key={g} value={g}>
                        Shape {g} (stand-in)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {style === 'program' && (
                <label className="field">
                  <span className="label">Looks like</span>
                  <select value={r.pattern ?? 'chase'} onChange={(e) => setRange({ pattern: e.target.value as ProgramPattern, kind: e.target.value === 'none' ? 'off' : 'program' })}>
                    {PATTERNS.map((p) => (
                      <option key={p} value={p}>
                        {p === 'none' ? 'Nothing (off)' : p[0].toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {style === 'spin' && (
                <div className="seg-choice">
                  <button className={`mini ${!r.from && !r.to ? 'active' : ''}`} onClick={() => setRange({ from: 0, to: 0, kind: 'spin' })}>
                    Stop
                  </button>
                  <button className={`mini ${(r.to ?? 0) > 0 ? 'active' : ''}`} onClick={() => setRange({ from: 0.1, to: 1.5, kind: 'spin' })}>
                    One way
                  </button>
                  <button className={`mini ${(r.to ?? 0) < 0 ? 'active' : ''}`} onClick={() => setRange({ from: -0.1, to: -1.5, kind: 'spin' })}>
                    Other way
                  </button>
                </div>
              )}
            </div>
          )}
          {style !== 'level' && !r && ranges.length > 0 && <p className="hint">Click a range on the bar to change it.</p>}
        </>
      )}
    </div>
  )
}

function ManyChannels({ def, chosen }: { def: FixtureDef; chosen: ChannelDef[] }) {
  const ids = chosen.map((c) => c.id)
  const fns = new Set(chosen.map((c) => c.fn))
  const parts = new Set(chosen.map((c) => c.part))
  return (
    <div className="many-ch">
      <div className="panel-title">{chosen.length} channels</div>
      <p className="hint">Changes here apply to all of them at once.</p>
      <label className="field">
        <span className="label">What they do</span>
        <FnSelect value={fns.size === 1 ? [...fns][0] : ''} onChange={(fn) => setChannelFn(ids, fn)} />
      </label>
      <label className="field">
        <span className="label">Drive</span>
        <PartSelect def={def} value={parts.size === 1 ? [...parts][0] : '~'} onChange={(part) => editChannels(ids, (c) => ({ ...c, part }))} />
      </label>
      <label className="field">
        <span className="label">Status</span>
        <select value="" onChange={(e) => e.target.value && editChannels(ids, (c) => ({ ...c, confidence: e.target.value as Confidence }))}>
          <option value="">Set all to…</option>
          {(Object.keys(CONFIDENCE) as Confidence[]).map((k) => (
            <option key={k} value={k}>
              {CONFIDENCE[k].label}
            </option>
          ))}
        </select>
      </label>
      <button className="mini" onClick={() => editChannels(ids, (c) => ({ ...c, ranges: chosen[0].ranges.map((r) => ({ ...r })) }))} disabled={fns.size !== 1} title="Give them all the value ranges of the first one">
        Copy the first one's ranges to all
      </button>
    </div>
  )
}

function PartEditor({ def, part }: { def: FixtureDef; part: PartDef }) {
  const set = (change: Partial<PartDef>) => useStudio.getState().edit((d) => ({ ...d, parts: d.parts.map((p) => (p.id === part.id ? { ...p, ...change } : p)) }))
  const cells = [...new Set(def.parts.map((p) => p.cell ?? 0))].length
  return (
    <div className="part-edit">
      <div className="panel-title">Part: {part.name}</div>
      <label className="field">
        <span className="label">Name</span>
        <input value={part.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="row-2">
        <label className="field small">
          <span className="label">Kind</span>
          <select value={part.role} onChange={(e) => set({ role: e.target.value as PartDef['role'] })}>
            <option value="pixel">Cell / pixel</option>
            <option value="beam">Light with a beam</option>
            <option value="derby">Derby / effect</option>
            <option value="strobe">Strobe</option>
            <option value="laser">Laser</option>
            <option value="halo">Ring around a lens</option>
            <option value="master">Master (dims the others)</option>
          </select>
        </label>
        <label className="field small" title="Where it sits on the face. Parts with the same number share a cell (a COB inside a ring).">
          <span className="label">Position</span>
          <input type="number" min={1} max={Math.max(cells + 1, 2)} value={(part.cell ?? 0) + 1} onChange={(e) => set({ cell: Math.max(0, Number(e.target.value) - 1) })} />
        </label>
      </div>
      <label className="field">
        <span className="label">White channels are</span>
        <select value={part.tint ?? ''} onChange={(e) => set({ tint: (e.target.value || undefined) as PartDef['tint'] })}>
          <option value="">Plain white</option>
          <option value="warm">Warm white</option>
          <option value="cool">Cool white</option>
        </select>
      </label>
    </div>
  )
}
