/**
 * Arranging the selection: Align, Spread Even, Mirror and
 * Duplicate dialogs, but kept in the inspector so nothing pops up.
 */
import { useState } from 'react'
import { alignFixtures, autoPlaceFixtures, distributeFixtures, duplicateArray, mirrorFixtures, selectSameType, spreadEven, type Axis } from '../state/commands'
import type { Shape, Where } from '../model/layout'
import type { Vec3 } from '../model/project'
import { Section } from './Section'

const AXES: Array<{ axis: Axis; name: string; ends: [string, string, string] }> = [
  { axis: 0, name: 'Left–right', ends: ['Left', 'Centre', 'Right'] },
  { axis: 1, name: 'Height', ends: ['Bottom', 'Middle', 'Top'] },
  { axis: 2, name: 'Front–back', ends: ['Back', 'Middle', 'Front'] }
]

export function ArrangePanel({ ids }: { ids: string[] }) {
  const [count, setCount] = useState(1)
  const [offset, setOffset] = useState<Vec3>([1, 0, 0])
  const [ownPatch, setOwnPatch] = useState(false)
  const [shape, setShape] = useState<Shape>('line')
  const [where, setWhere] = useState<Where>('keep')
  const [width, setWidth] = useState('')
  const several = ids.length > 1

  return (
    <Section id="fixture:arrange" title="More arranging" className="arrange" hint="Align, spread, mirror, distribute in shapes and duplicate in a row">
      {AXES.map(({ axis, name, ends }) => (
        <div key={axis} className="arrange-row">
          <span className="label">{name}</span>
          <div className="seg small">
            {ends.map((label, i) => (
              <button key={label} disabled={!several} onClick={() => alignFixtures(ids, axis, i === 0 ? 'min' : i === 1 ? 'center' : 'max')} title={`Align to the ${label.toLowerCase()} one`}>
                {label}
              </button>
            ))}
            <button disabled={ids.length < 3} onClick={() => spreadEven(ids, axis)} title="Space evenly between the two outermost">
              Spread
            </button>
          </div>
        </div>
      ))}
      <div className="arrange-row">
        <button onClick={() => mirrorFixtures(ids)} title="A copy on the other side of the stage, panning the opposite way, on the same patch">
          Mirror copy
        </button>
        <button onClick={() => selectSameType(ids)} title="Select every fixture of the same type">
          Select same type
        </button>
      </div>
      <div className="distribute">
        <span className="label">Distribute evenly</span>
        <div className="seg small">
          {(['line', 'arc', 'circle', 'grid'] as Shape[]).map((sh) => (
            <button key={sh} className={shape === sh ? 'on' : ''} onClick={() => setShape(sh)} title={{ line: 'A straight row', arc: 'A gentle curve, facing the middle', circle: 'A ring', grid: 'Rows and columns' }[sh]}>
              {sh[0].toUpperCase() + sh.slice(1)}
            </button>
          ))}
        </div>
        <div className="distribute-row">
          <select value={where} onChange={(e) => setWhere(e.target.value as Where)} title="Where the row goes">
            <option value="keep">Where they are</option>
            <option value="truss">On the truss</option>
            <option value="floorFront">On the floor, front</option>
            <option value="floorBack">On the floor, back</option>
          </select>
          <input placeholder="auto" value={width} onChange={(e) => setWidth(e.target.value)} title={shape === 'circle' ? 'Diameter, metres (blank = automatic)' : 'Total width, metres (blank = automatic spacing)'} />
          <span className="hint">m</span>
        </div>
        <div className="arrange-row">
          <button className="primary" disabled={!several} onClick={() => distributeFixtures(ids, shape, where, Number(width) > 0 ? Number(width) : undefined)} title="Keeps their left-to-right order">
            Distribute {ids.length}
          </button>
          <button onClick={() => autoPlaceFixtures(ids)} title="Movers on the truss, tubes at the back, bars on the booth, GigBars on stands, floor units at the front">
            Auto-place by type
          </button>
        </div>
      </div>
      <div className="arrange-dup">
        <span className="label">Duplicate</span>
        <input type="number" min={1} max={32} value={count} onChange={(e) => setCount(Math.max(1, Math.min(32, Number(e.target.value) || 1)))} title="How many copies" />
        <span className="hint">copies, each moved by (m)</span>
      </div>
      <div className="arrange-offsets">
        {offset.map((v, i) => (
          <label key={i}>
            <span className="hint">{['X', 'Y', 'Z'][i]}</span>
            <input
              type="number"
              step={0.1}
              value={v}
              title={['Left–right', 'Height', 'Front–back'][i] + ' offset (m)'}
              onChange={(e) => {
                const next = [...offset] as Vec3
                next[i] = Number(e.target.value) || 0
                setOffset(next)
              }}
            />
          </label>
        ))}
      </div>
      <div className="arrange-row">
        <label className="check" title="Off: copies share the original's patch and mirror it. On: each gets free addresses.">
          <input type="checkbox" checked={ownPatch} onChange={(e) => setOwnPatch(e.target.checked)} /> Own patch
        </label>
        <button onClick={() => duplicateArray(ids, count, offset, ownPatch)} title="Make the copies, each moved by the offset from the one before">Duplicate</button>
      </div>
    </Section>
  )
}
