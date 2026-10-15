/**
 * The schematic: the fixture drawn flat, as it looks from the front, with each
 * part lit in the colour the twin is showing right now; and below it the DMX
 * strip, one box per channel coloured by what it does, filling up with its live
 * value. Click a cell to see its channels; click a box to pick that channel.
 */
import { useEffect, useMemo, useState } from 'react'
import { cellPositions } from '../../model/catalog'
import { CONFIDENCE, FN, headsFromDef, type FixtureDef } from '../../model/fixtureDef'
import type { HeadState } from '../../model/heads'
import { useStudio } from '../../state/studio'
import { twinNow } from './TwinView'

/** Re-render at about 15 frames a second while mounted, to follow the twin. */
export function useLive(): number {
  const [n, set] = useState(0)
  useEffect(() => {
    let id = 0
    let last = 0
    const loop = (t: number) => {
      id = requestAnimationFrame(loop)
      if (t - last > 66) {
        last = t
        set((x) => (x + 1) % 1e6)
      }
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])
  return n
}

function glow(h: HeadState | undefined): string {
  if (!h || h.intensity < 0.01) return '#1c1f24'
  const k = Math.min(1, h.intensity)
  const c = h.color.map((v) => Math.round(Math.min(1, v) * 255 * (0.25 + 0.75 * k)))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export function Schematic({ def }: { def: FixtureDef }) {
  useLive()
  const modeIndex = useStudio((s) => s.modeIndex)
  const selected = useStudio((s) => s.selected)
  const selectedPart = useStudio((s) => s.selectedPart)
  const mode = def.modes[modeIndex]
  const { heads, partHead } = useMemo(() => (mode ? headsFromDef(def, mode) : { heads: [], partHead: new Map() }), [def, mode])
  if (!mode) return null
  const live = twinNow.heads
  const look = def.look
  // LED rings around the lens (no cell of their own) are drawn around the light, not as cells.
  const rings = def.parts.filter((p) => partHead.has(p.id) && p.role === 'halo' && p.cell === undefined)
  const lightParts = def.parts.filter((p) => partHead.has(p.id) && p.role !== 'master' && !rings.includes(p))
  const cells = [...new Set(lightParts.map((p, k) => p.cell ?? k))].sort((a, b) => a - b)
  const aspect = look.size[0] / Math.max(0.01, look.size[1])
  const pos = cellPositions(cells.length, look.layout, look.shape === 'tube' ? 0.1 : aspect)
  const W = 220
  const H = look.shape === 'tube' ? 220 : Math.max(70, Math.min(160, W / Math.max(0.6, aspect)))
  const round = look.shape === 'cluster' || look.shape === 'par' || look.shape === 'mover' || look.shape === 'moverWash'
  const mainHead = partHead.get(null)
  const main = mainHead !== undefined ? heads[mainHead] : undefined
  const mainLive = mainHead !== undefined ? live[mainHead] : undefined
  const selectPart = (id: string | null) => {
    const ids = mode.channels.filter((c) => c.part === id).map((c) => c.id)
    useStudio.getState().select(ids, id)
  }
  const moving = heads.some((h) => h.ch.pan || h.ch.tilt)
  // Cells as big as they can be without overlapping their nearest neighbour.
  const pts = pos.map(([px, py]) => [(px * W) / 2 * 0.86, (py * H) / 2 * 0.86])
  let nearest = Infinity
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) nearest = Math.min(nearest, Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]))
  const cellR = cells.length <= 1 ? 30 : Math.max(2.5, Math.min(22, nearest * 0.44))
  return (
    <div className="schematic" data-tour="studio-schematic">
      <svg viewBox={`0 0 ${W + 20} ${H + 20}`} className="face" role="img" aria-label="The fixture's face, lit as the twin shows it">
        {round && look.shape === 'cluster' ? (
          <circle cx={W / 2 + 10} cy={H / 2 + 10} r={Math.min(W, H) / 2} className="body" />
        ) : (
          <rect x={10} y={10} width={W} height={H} rx={look.shape === 'tube' ? 18 : 10} className="body" />
        )}
        {rings.map((p, k) => {
          const r0 = !cells.length ? Math.min(W, H) / 2.8 + 9 + k * 9 : 0
          return (
            <g key={p.id} className={`cell ${selectedPart === p.id ? 'on' : ''}`} onClick={() => selectPart(p.id)}>
              {r0 ? (
                <circle className="ring-shape" cx={W / 2 + 10} cy={H / 2 + 10} r={r0} fill="none" style={{ stroke: glow(live[partHead.get(p.id) ?? -1]), strokeWidth: 6 }} />
              ) : (
                <rect className="ring-shape" x={14 + k * 6} y={14 + k * 6} width={W - 8 - k * 12} height={H - 8 - k * 12} rx={8} fill="none" style={{ stroke: glow(live[partHead.get(p.id) ?? -1]), strokeWidth: 4 }} />
              )}
              <title>{p.name}: click to see its channels</title>
            </g>
          )
        })}
        {/* The whole fixture's own light (a PAR, a moving head's beam) */}
        {main && main.role !== 'master' && !cells.length && (
          <circle cx={W / 2 + 10} cy={H / 2 + 10} r={Math.min(W, H) / 2.8} fill={glow(mainLive)} className={`cell ${selectedPart === null && selected.length && mode.channels.filter((c) => selected.includes(c.id)).every((c) => c.part === null) ? 'on' : ''}`} onClick={() => selectPart(null)}>
            <title>Whole fixture: click to see its channels</title>
          </circle>
        )}
        {cells.map((cell, ci) => {
          const [px, py] = pos[ci] ?? [0, 0]
          const cx = 10 + W / 2 + (px * W) / 2 * 0.86
          const cy = 10 + H / 2 - (py * H) / 2 * 0.86
          const parts = lightParts.filter((p, k) => (p.cell ?? k) === cell)
          return (
            <g key={cell}>
              {parts.map((p, k) => {
                const h = live[partHead.get(p.id) ?? -1]
                const on = selectedPart === p.id
                const r = parts.length > 1 ? (k === 0 ? cellR * 0.55 : cellR) : cellR
                const shape = round || look.shape === 'tube' ? (
                  k === 0 || parts.length === 1 ? <circle cx={cx} cy={cy} r={r} fill={glow(h)} /> : <circle className="ring-shape" cx={cx} cy={cy} r={r * 0.85} fill="none" style={{ stroke: glow(h), strokeWidth: r * 0.32 }} />
                ) : (
                  <rect x={cx - r} y={cy - r * 0.8} width={r * 2} height={r * 1.6} rx={3} fill={glow(h)} />
                )
                return (
                  <g key={p.id} className={`cell ${on ? 'on' : ''}`} onClick={() => selectPart(p.id)}>
                    {shape}
                    <title>{p.name}: click to see its channels</title>
                  </g>
                )
              })}
              {cells.length <= 24 && (
                <text x={cx} y={cy + 3.5} className="cell-no">
                  {ci + 1}
                </text>
              )}
            </g>
          )
        })}
        {main?.role === 'master' && (
          <text x={W / 2 + 10} y={H + 17} className="master-note" onClick={() => selectPart(null)}>
            Master: {mainLive ? `${Math.round(Math.min(1, mainLive.intensity || masterLevel(def, modeIndex)) * 100)}%` : ''}
          </text>
        )}
      </svg>
      {moving && <PanTilt head={live.find((_, i) => heads[i]?.ch.pan || heads[i]?.ch.tilt)} pan={def.look.pan ?? 540} tilt={def.look.tilt ?? 270} />}
      <DmxStrip def={def} />
    </div>
  )
}

function masterLevel(def: FixtureDef, modeIndex: number): number {
  const i = def.modes[modeIndex]?.channels.findIndex((c) => c.fn === 'dimmer' && !c.part) ?? -1
  return i >= 0 ? (twinNow.levels[i] ?? 0) / 255 : 1
}

/** Where a moving head is pointing: pan around, tilt out from the middle. */
function PanTilt({ head, pan, tilt }: { head?: HeadState; pan: number; tilt: number }) {
  const p = head?.pan ?? 0
  const t = head?.tilt ?? 0
  const x = 40 + Math.max(-1, Math.min(1, p / (pan / 2))) * 32
  const y = 40 - Math.max(-1, Math.min(1, t / (tilt / 2))) * 32
  return (
    <svg viewBox="0 0 80 80" className="pantilt" role="img" aria-label="Where the head points">
      <rect x={6} y={6} width={68} height={68} rx={8} className="body" />
      <line x1={40} y1={8} x2={40} y2={72} className="axis" />
      <line x1={8} y1={40} x2={72} y2={40} className="axis" />
      <circle cx={x} cy={y} r={7} fill={glow(head)} stroke="#fff" strokeWidth={1} />
      <text x={40} y={79} className="pt-label">
        pan {Math.round(p)}° · tilt {Math.round(t)}°
      </text>
    </svg>
  )
}

/** One box per DMX channel: colour = what it does, fill = its live value, a dot when it needs checking. */
function DmxStrip({ def }: { def: FixtureDef }) {
  const modeIndex = useStudio((s) => s.modeIndex)
  const selected = useStudio((s) => s.selected)
  const mode = def.modes[modeIndex]
  const n = mode.channels.length
  return (
    <div className="dmx-strip" style={{ gridTemplateColumns: `repeat(${Math.min(n, 32)}, minmax(0, 1fr))` }} title="Every channel of this mode, in order. Colour shows what it does; the fill shows its value right now.">
      {mode.channels.map((c, i) => {
        const v = (twinNow.levels[i] ?? 0) / 255
        const flag = c.confidence === 'missing' ? 'missing' : c.confidence === 'guessed' ? 'guessed' : ''
        return (
          <button
            key={c.id}
            className={`dmx-box ${selected.includes(c.id) ? 'on' : ''} ${flag}`}
            onClick={(e) => useStudio.getState().select(e.shiftKey || e.metaKey ? [...new Set([...selected, c.id])] : [c.id])}
            title={`${i + 1}: ${c.name} (${FN[c.fn].label})${flag ? ` — ${CONFIDENCE[c.confidence].label}` : ''}`}
          >
            <span className="dmx-fill" style={{ height: `${v * 100}%`, background: FN[c.fn].swatch }} />
            <span className="dmx-no">{i + 1}</span>
          </button>
        )
      })}
    </div>
  )
}
