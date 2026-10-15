/**
 * After picking a kind of light: which channel layout to start from. The usual
 * modes for that kind are listed by channel count (the common ones marked, as
 * counted across SoundSwitch's fixture library), plus any count you type, any
 * number of cells, and an LED ring around the lens for lights that have one.
 */
import { useMemo, useRef, useState } from 'react'
import { KINDS, type FixtureDef, type FixtureKind } from '../../model/fixtureDef'
import { CELL_COLOURS, CELL_KINDS, RING_KINDS, addRing, cellsStart, describeStart, startWithCount, startsFor, type CellColours } from '../../model/fixtureStarts'
import { KindIcon } from './LookPanel'

export function StartPicker({ kind, onPick, onClose, name, maker, action = 'Start' }: { kind: FixtureKind; onPick: (def: FixtureDef, note: string) => void; onClose?: () => void; name?: string; maker?: string; action?: string }) {
  const starts = useMemo(() => startsFor(kind), [kind])
  const [count, setCount] = useState('')
  const [cells, setCells] = useState('8')
  const [colours, setColours] = useState<CellColours>('RGB')
  const [master, setMaster] = useState(false)
  const [ring, setRing] = useState(false)
  const isCells = CELL_KINDS.includes(kind)
  const canRing = RING_KINDS.includes(kind)
  const finish = (def: FixtureDef, note: string) => {
    if (ring) {
      const r = addRing(def, 0, 'RGB', false)
      onPick(r.def, `${note} Added an LED ring (red, green, blue) at the end: move its channels if the manual has them elsewhere.`)
    } else onPick(def, note)
  }
  const n = Number(count)
  const box = useRef<HTMLDivElement>(null)
  return (
    <div className="start-picker" ref={box}>
      <div className="sp-head">
        <KindIcon kind={kind} />
        <div>
          <div className="sp-title">{KINDS[kind].label}: how many channels?</div>
          <div className="sp-sub">Pick the mode your manual lists (its channel count, e.g. “7CH”). The most common ones are highlighted. You can change any channel afterwards.</div>
        </div>
        {onClose && (
          <button className="mini sp-close" onClick={onClose} title="Back to all the kinds of light">
            All kinds
          </button>
        )}
      </div>
      <div className="sp-list">
        {starts.map((s) => {
          const sample = s.build(name, maker)
          return (
            <button key={s.id} className={`sp-row ${s.common ? 'common' : ''}`} onClick={() => finish(sample, `Started from the ${s.count}-channel ${KINDS[kind].label.toLowerCase()} layout (${s.label}).`)} title={describeStart(sample)}>
              <span className="sp-num">
                <span className="sp-count">{s.count}</span>
                <span className="sp-ch">ch</span>
              </span>
              <span className="sp-text">
                <span className="sp-label">{s.label}</span>
                <span className="sp-desc">{describeStart(sample)}</span>
              </span>
              {s.common && <span className="sp-badge" title="One of the most common sizes for this kind of light">Common</span>}
            </button>
          )
        })}
      </div>
      <div className="sp-more">Not listed?</div>
      <div className="sp-custom">
        <label title="Any number of channels: the nearest layout is used and the rest left for you to fill in from the manual">
          Another count
          <input type="number" min={1} max={512} placeholder="e.g. 37" value={count} onChange={(e) => setCount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && n > 0 && (() => { const r = startWithCount(kind, n, colours, name, maker); finish(r.def, r.note) })()} />
          channels
        </label>
        <button
          className="mini"
          disabled={!(n > 0)}
          onClick={() => {
            const r = startWithCount(kind, n, colours, name, maker)
            finish(r.def, r.note)
          }}
        >
          {action}
        </button>
      </div>
      {isCells && (
        <div className="sp-custom">
          <label title="How many separately controlled cells (pixels) the light has">
            <input type="number" min={1} max={170} value={cells} onChange={(e) => setCells(e.target.value)} />
            cells of
          </label>
          <select value={colours} onChange={(e) => setColours(e.target.value as CellColours)} title="The colour channels each cell has">
            {(Object.keys(CELL_COLOURS) as CellColours[]).map((c) => (
              <option key={c} value={c}>
                {CELL_COLOURS[c].label}
              </option>
            ))}
          </select>
          <label className="check" title="A dimmer and strobe for the whole light before the cells">
            <input type="checkbox" checked={master} onChange={(e) => setMaster(e.target.checked)} /> master dimmer and strobe first
          </label>
          <button
            className="mini"
            disabled={!(Number(cells) > 0)}
            onClick={() => {
              const def = cellsStart(kind, Number(cells), colours, master, name, maker)
              finish(def, `${cells} cells of ${CELL_COLOURS[colours].label}${master ? ' after a master dimmer and strobe' : ''}: ${def.modes[0].channels.length} channels.`)
            }}
          >
            {action}
          </button>
        </div>
      )}
      {canRing && (
        <label className="check sp-ring" title="Some moving heads and PARs have a ring of LEDs around the lens with its own colour channels">
          <input type="checkbox" checked={ring} onChange={(e) => setRing(e.target.checked)} /> It has an LED ring around the lens (adds ring red, green, blue)
        </label>
      )}
    </div>
  )
}
