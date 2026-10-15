/**
 * What the fixture looks like: its kind, shape, size, cells and their layout,
 * housing colour, beam and movement range. Every change shows on the twin at
 * once. When a manual doesn't give the size or shape, borrow them from a similar
 * Library fixture, or add a photo of the real light to compare against.
 */
import { useMemo, useState } from 'react'
import { KINDS, KIND_ORDER, type FixtureDef, type FixtureKind, type LookDef } from '../../model/fixtureDef'
import { LOOK_DEFAULTS, type CellLayout, type LookKind } from '../../model/catalog'
import { searchLibrary, useLibrary } from '../../state/library'
import { setCellCount, useStudio } from '../../state/studio'
import { notify } from '../../state/notices'

const SHAPES: Array<[LookKind, string]> = [
  ['par', 'Round can (PAR)'], ['flood', 'Box flood'], ['uplight', 'Small uplight'], ['spider', 'Box of lenses'], ['cluster', 'Round cells on a frame'],
  ['panel', 'Panel of square cells'], ['bar', 'Bar of cells'], ['tube', 'Tube / stick'], ['strip', 'Thin strip'], ['mover', 'Moving head (spot/beam)'],
  ['moverWash', 'Moving head (wash)'], ['gigbar', 'GigBar on a stand'], ['strobe', 'Strobe panel'], ['laser', 'Laser box'], ['derby', 'Derby / effect box']
]

const LAYOUTS: Array<[CellLayout['kind'], string]> = [['row', 'In a row'], ['column', 'In a column'], ['grid', 'In a grid'], ['ring', 'In a ring'], ['ringCentre', 'A ring and a centre one'], ['hex', 'Packed (honeycomb)']]

export function LookPanel({ def }: { def: FixtureDef }) {
  const look = def.look
  const setLook = (change: Partial<LookDef>) => useStudio.getState().edit((d) => ({ ...d, look: { ...d.look, ...change } }))
  const cells = new Set(def.parts.filter((p) => p.role === 'pixel').map((p) => p.cell ?? 0)).size
  const [cellInput, setCellInput] = useState<string | null>(null)
  const mm = (v: number) => Math.round(v * 1000)
  const setSize = (i: number, v: number) => {
    const size = [...look.size] as [number, number, number]
    size[i] = Math.max(0.005, Math.min(4, v / 1000))
    setLook({ size })
  }
  const moving = look.shape === 'mover' || look.shape === 'moverWash'

  return (
    <div className="look-panel">
      <div className="panel-sub">Kind of light</div>
      <div className="kind-grid">
        {KIND_ORDER.map((k) => (
          <button
            key={k}
            className={`kind ${def.kind === k ? 'active' : ''}`}
            title={KINDS[k].explain}
            onClick={() => useStudio.getState().edit((d) => ({ ...d, kind: k, look: { ...d.look, shape: KINDS[k].shape, size: d.look.shape === KINDS[k].shape ? d.look.size : [...LOOK_DEFAULTS[KINDS[k].shape].size], mount: KINDS[k].mount } }))}
          >
            <KindIcon kind={k} />
            <span>{KINDS[k].label}</span>
          </button>
        ))}
      </div>

      <label className="field">
        <span className="label">Shape</span>
        <select value={look.shape} onChange={(e) => setLook({ shape: e.target.value as LookKind })}>
          {SHAPES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="panel-sub">Size (mm)</div>
      <div className="row-3">
        {(['Width', 'Height', 'Depth'] as const).map((label, i) => (
          <label key={label} className="field small">
            <span className="label">{label}</span>
            <input type="number" min={5} max={4000} value={mm(look.size[i])} onChange={(e) => setSize(i, Number(e.target.value))} />
          </label>
        ))}
      </div>
      <BorrowLook />

      <div className="panel-sub">Cells</div>
      <div className="row-2">
        <label className="field small" title="How many separately controlled cells (pixels, sections, lenses). Changing it adds or removes cells, copying the first cell's channels.">
          <span className="label">How many</span>
          <input
            type="number"
            min={0}
            max={512}
            value={cellInput ?? String(cells)}
            onChange={(e) => setCellInput(e.target.value)}
            onBlur={() => {
              const n = Number(cellInput)
              setCellInput(null)
              if (cellInput !== null && n !== cells && n >= 1) setCellCount(Math.round(n))
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <label className="field small">
          <span className="label">Laid out</span>
          <select value={look.layout?.kind ?? ''} onChange={(e) => setLook({ layout: e.target.value ? { kind: e.target.value as CellLayout['kind'], cols: look.layout?.cols } : undefined })}>
            <option value="">Automatic</option>
            {LAYOUTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      {look.layout?.kind === 'grid' && (
        <label className="field small">
          <span className="label">Across</span>
          <input type="number" min={1} max={64} value={look.layout.cols ?? Math.ceil(Math.sqrt(cells))} onChange={(e) => setLook({ layout: { kind: 'grid', cols: Math.max(1, Number(e.target.value)) } })} />
        </label>
      )}

      <div className="panel-sub">Housing and beam</div>
      <div className="row-2">
        <label className="field small">
          <span className="label">Colour</span>
          <select value={look.bodyColor ?? ''} onChange={(e) => setLook({ bodyColor: e.target.value || undefined })}>
            <option value="">Black</option>
            <option value="#d9d9d6">White</option>
            <option value="#8a8d91">Silver</option>
            <option value="#5a3a22">Wood / retro</option>
          </select>
        </label>
        <label className="field small">
          <span className="label">Brightness</span>
          <input type="range" min={0.1} max={2.5} step={0.05} value={look.output} onChange={(e) => setLook({ output: Number(e.target.value) })} />
        </label>
      </div>
      <div className="row-2">
        <label className="field small" title="The narrowest beam angle (with zoom, its narrow end)">
          <span className="label">Beam from °</span>
          <input type="number" min={1} max={180} value={look.beam[0]} onChange={(e) => setLook({ beam: [Math.max(1, Number(e.target.value)), Math.max(Number(e.target.value), look.beam[1])] })} />
        </label>
        <label className="field small" title="The widest beam angle (with zoom, its wide end)">
          <span className="label">to °</span>
          <input type="number" min={1} max={180} value={look.beam[1]} onChange={(e) => setLook({ beam: [Math.min(look.beam[0], Number(e.target.value)), Math.max(1, Number(e.target.value))] })} />
        </label>
      </div>
      {moving && (
        <div className="row-2">
          <label className="field small">
            <span className="label">Pan range °</span>
            <input type="number" min={90} max={720} value={look.pan ?? 540} onChange={(e) => setLook({ pan: Number(e.target.value) })} />
          </label>
          <label className="field small">
            <span className="label">Tilt range °</span>
            <input type="number" min={45} max={360} value={look.tilt ?? 270} onChange={(e) => setLook({ tilt: Number(e.target.value) })} />
          </label>
        </div>
      )}

      <div className="panel-sub">Photo of the real light</div>
      <Photo def={def} />
    </div>
  )
}

/** Take the size and shape from a similar fixture in the Library. */
function BorrowLook() {
  const [q, setQ] = useState('')
  const entries = useLibrary((s) => s.entries)
  const results = useMemo(() => (q.trim().length > 1 ? searchLibrary(entries, q, 'all').filter((e) => e.size).slice(0, 6) : []), [entries, q])
  return (
    <div className="borrow">
      <input placeholder="Same size as… (search the Library)" value={q} onChange={(e) => setQ(e.target.value)} title="Don't know its size? Borrow it from a similar fixture" />
      {results.map((e) => (
        <button
          key={e.key}
          className="borrow-row"
          onClick={async () => {
            const other = await useLibrary.getState().defFor(e.key)
            useStudio.getState().edit((d) => ({ ...d, look: { ...d.look, size: e.size!, ...(other ? { shape: other.look.shape, beam: other.look.beam, layout: other.look.layout ?? d.look.layout } : {}) } }))
            notify('info', `Using the size${other ? ' and shape' : ''} of the ${e.manufacturer} ${e.name}.`)
            setQ('')
          }}
        >
          {e.manufacturer} {e.name}
          <span className="sub">{e.size!.map((v) => Math.round(v * 1000)).join(' × ')} mm</span>
        </button>
      ))}
    </div>
  )
}

function Photo({ def }: { def: FixtureDef }) {
  const choose = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const photo = canvas.toDataURL('image/jpeg', 0.82)
    useStudio.getState().edit((d) => ({ ...d, look: { ...d.look, photo } }))
  }
  return (
    <div className="photo" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), void choose(e.dataTransfer.files[0]))}>
      {def.look.photo ? (
        <>
          <img src={def.look.photo} alt="The real light" />
          <button className="mini quiet" onClick={() => useStudio.getState().edit((d) => ({ ...d, look: { ...d.look, photo: undefined } }))}>
            Remove photo
          </button>
        </>
      ) : (
        <label className="photo-drop">
          Drop a photo here, or <u>choose one</u>: the manual's cover, the box, or your phone. It sits next to the twin so you can match the shape and cells.
          <input type="file" accept="image/*" hidden onChange={(e) => void choose(e.target.files?.[0])} />
        </label>
      )}
    </div>
  )
}

/** A small drawing for each kind of light, for the kind buttons and the start screen. */
export function KindIcon({ kind }: { kind: FixtureKind }) {
  const c = 'currentColor'
  const common = { fill: 'none', stroke: c, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'par':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="9" y="7" width="14" height="16" rx="3" {...common} /><path d="M12 23l-2 4M20 23l2 4M7 15h2M23 15h2" {...common} /><circle cx="16" cy="12" r="1.6" fill={c} /><circle cx="13" cy="17" r="1.6" fill={c} /><circle cx="19" cy="17" r="1.6" fill={c} /></svg>
    case 'uplight':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="7" y="12" width="18" height="9" rx="2" {...common} /><path d="M9 21l-2 5M23 21l2 5" {...common} /><path d="M11 9l-2-4M16 9V4M21 9l2-4" {...common} /></svg>
    case 'strip':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="3" y="14" width="26" height="4" rx="2" {...common} /></svg>
    case 'wash':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="10" y="24" width="12" height="4" rx="1" {...common} /><path d="M9 24V12M23 24V12" {...common} /><rect x="11" y="9" width="10" height="10" rx="5" {...common} /><path d="M13 12h6" {...common} /></svg>
    case 'spot':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="10" y="24" width="12" height="4" rx="1" {...common} /><path d="M9 24V12M23 24V12" {...common} /><rect x="12" y="5" width="8" height="14" rx="3" {...common} /><circle cx="16" cy="9" r="2" {...common} /></svg>
    case 'beam':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="10" y="24" width="12" height="4" rx="1" {...common} /><path d="M9 24V12M23 24V12" {...common} /><rect x="12" y="7" width="8" height="12" rx="3" {...common} /><path d="M16 7V1" {...common} /></svg>
    case 'bar':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="3" y="12" width="26" height="8" rx="2" {...common} />{[7, 12, 17, 22, 26].map((x) => <circle key={x} cx={x} cy="16" r="1.5" fill={c} />)}</svg>
    case 'tube':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="13" y="2" width="6" height="26" rx="3" {...common} /><path d="M11 29h10" {...common} />{[7, 12, 17, 22].map((y) => <path key={y} d={`M14 ${y}h4`} {...common} />)}</svg>
    case 'panel':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="5" y="5" width="22" height="22" rx="2" {...common} />{[10, 16, 22].flatMap((x) => [10, 16, 22].map((y) => <rect key={`${x}${y}`} x={x - 2} y={y - 2} width="4" height="4" fill={c} />))}</svg>
    case 'cluster':
      return <svg viewBox="0 0 32 32" className="kind-icon"><circle cx="16" cy="16" r="13" {...common} />{[[16, 16], [16, 8], [16, 24], [9, 12], [23, 12], [9, 20], [23, 20]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="3" {...common} />)}</svg>
    case 'gigbar':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="3" y="10" width="26" height="4" rx="1" {...common} /><path d="M16 14v14M11 29h10" {...common} /><circle cx="7" cy="7" r="2.5" {...common} /><circle cx="25" cy="7" r="2.5" {...common} /><path d="M14 8h4" {...common} /></svg>
    case 'strobe':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="4" y="10" width="24" height="12" rx="2" {...common} /><path d="M15 12l-3 5h4l-2 4" {...common} /></svg>
    case 'laser':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="8" y="20" width="16" height="8" rx="2" {...common} /><path d="M16 20L6 4M16 20L12 3M16 20l4-17M16 20L26 4" {...common} /></svg>
    case 'effect':
      return <svg viewBox="0 0 32 32" className="kind-icon"><rect x="8" y="20" width="16" height="8" rx="2" {...common} /><path d="M11 20a5 5 0 0110 0" {...common} /><path d="M12 16L5 8M16 15V4M20 16l7-8" {...common} /></svg>
  }
}
