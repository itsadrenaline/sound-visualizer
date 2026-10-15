/**
 * A channel's 0-255 drawn as what each value does: coloured ranges (closed,
 * strobe slow to fast, open; each colour-wheel slot in its colour; each gobo;
 * programs), or a ramp for plain levels. Hover anywhere and the twin shows that
 * value; drag the line between two ranges to move it; double-click to split a
 * range; click a range to edit it below.
 */
import { useRef, useState } from 'react'
import { FN, type ChannelDef } from '../../model/fixtureDef'
import { rangeColour } from '../../model/fixtureTests'
import { useStudio } from '../../state/studio'

export function ValueBar({ ch, index, onRanges, picked, onPick }: { ch: ChannelDef; index: number; onRanges: (r: ChannelDef['ranges']) => void; picked: number | null; onPick: (i: number | null) => void }) {
  const bar = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const drag = useRef<{ edge: number } | null>(null)
  const ranges = [...ch.ranges].sort((a, b) => a.lo - b.lo)
  const valueAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect()
    return Math.max(0, Math.min(255, Math.round(((clientX - r.left) / r.width) * 255)))
  }
  const st = useStudio.getState
  const level = FN[ch.fn].style === 'level' || !ranges.length

  return (
    <div className="valuebar-wrap">
      <div
        ref={bar}
        className="valuebar"
        onPointerMove={(e) => {
          const v = valueAt(e.clientX)
          setHover(v)
          if (drag.current) {
            const k = drag.current.edge
            const next = ranges.map((r) => ({ ...r }))
            // The edge between range k and k+1 moves to v.
            const lo = next[k].lo + 1
            const hi = next[k + 1].hi
            const at = Math.max(lo, Math.min(hi, v))
            next[k].hi = at - 1
            next[k + 1].lo = at
            onRanges(next)
          }
          st().setPreview({ channel: index, value: v })
        }}
        onPointerLeave={() => {
          setHover(null)
          if (!drag.current) st().setPreview(null)
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={(e) => {
          if (level) return
          const v = valueAt(e.clientX)
          const k = ranges.findIndex((r) => v > r.lo && v <= r.hi)
          if (k < 0) return
          const next = ranges.map((r) => ({ ...r }))
          next.splice(k + 1, 0, { ...next[k], lo: v, label: `${next[k].label} (2)` })
          next[k].hi = v - 1
          onRanges(next)
          onPick(k + 1)
        }}
        title="Hover to try a value on the twin. Drag a line between ranges to move it; double-click to split a range."
      >
        {level ? (
          <div className="vb-ramp" style={{ background: `linear-gradient(90deg, #000, ${FN[ch.fn].swatch})` }} />
        ) : (
          ranges.map((r, k) => (
            <div
              key={k}
              className={`vb-seg ${picked === k ? 'on' : ''}`}
              style={{ left: `${(r.lo / 256) * 100}%`, width: `${((r.hi - r.lo + 1) / 256) * 100}%`, background: rangeColour(ch, r) }}
              onClick={() => onPick(picked === k ? null : k)}
              title={`${r.lo}–${r.hi}: ${r.label}`}
            >
              {r.kind === 'strobe' && <span className="vb-strobe" />}
              {r.kind === 'program' && (r.hi - r.lo) / 255 > 0.07 && <span className="vb-prog">{r.pattern}</span>}
            </div>
          ))
        )}
        {!level &&
          ranges.slice(0, -1).map((r, k) =>
            ranges[k + 1].lo === r.hi + 1 ? (
              <div
                key={`e${k}`}
                className="vb-edge"
                style={{ left: `${((r.hi + 1) / 256) * 100}%` }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                  drag.current = { edge: k }
                }}
              />
            ) : null
          )}
        {hover !== null && <div className="vb-hover" style={{ left: `${(hover / 255) * 100}%` }} />}
      </div>
      <div className="vb-scale">
        <span>0</span>
        <span>{hover !== null ? `${hover}${!level ? ` · ${ranges.find((r) => hover >= r.lo && hover <= r.hi)?.label ?? 'nothing listed'}` : ''}` : 'hover to try'}</span>
        <span>255</span>
      </div>
    </div>
  )
}
