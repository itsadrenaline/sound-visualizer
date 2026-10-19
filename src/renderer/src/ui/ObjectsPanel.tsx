/**
 * The Objects tab: everything that isn't a light. Stands and totems, truss,
 * staging, speakers and subs, DJ and band gear, furniture, walls and decor,
 * and people for scale. Click one to add it (it goes somewhere sensible,
 * beside anything already there), or drag it into the 3D view to put it
 * exactly where you want. Below: what's in this show; right-click for actions.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { useStore } from '../state/store'
import { addStructure, deleteStructures } from '../state/commands'
import { useFixtureMenu } from '../state/fixtureMenu'
import { FT, STRUCTURE_KINDS, STRUCTURE_PRESETS, type Category, type StructureKind, type StructureParams } from '../model/structures'
import { view } from '../state/viewBus'

export const STRUCTURE_DRAG = 'application/x-ssvis-structure'
export interface StructureDrag {
  kind: StructureKind
  params: StructureParams
}

const ORDER: Category[] = ['Stands & totems', 'Truss', 'Staging', 'Speakers & sound', 'DJ & band', 'Party', 'Screens', 'Furniture', 'Room & decor', 'People']

/** Which categories are folded, remembered on this Mac. */
function loadFolded(): Category[] {
  try {
    return JSON.parse(localStorage.getItem('objects.folded') ?? '[]') as Category[]
  } catch {
    return []
  }
}

export function ObjectsPanel() {
  const structures = useStore((s) => s.project.structures ?? [])
  const fixtures = useStore((s) => s.project.fixtures)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const openMenu = useFixtureMenu((s) => s.open)
  const [query, setQuery] = useState('')
  const [folded, setFolded] = useState<Category[]>(loadFolded)

  const toggle = (c: Category) => {
    const next = folded.includes(c) ? folded.filter((x) => x !== c) : [...folded, c]
    setFolded(next)
    try {
      localStorage.setItem('objects.folded', JSON.stringify(next))
    } catch {
      // Not remembered; that's fine.
    }
  }

  const byCategory = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const m = new Map<Category, typeof STRUCTURE_PRESETS>()
    for (const p of STRUCTURE_PRESETS) {
      const info = STRUCTURE_KINDS[p.kind]
      const text = `${p.name} ${info.label} ${info.category} ${info.description}`.toLowerCase()
      if (!words.every((w) => text.includes(w))) continue
      m.set(info.category, [...(m.get(info.category) ?? []), p])
    }
    return ORDER.map((c) => [c, m.get(c) ?? []] as const).filter(([, list]) => list.length)
  }, [query])

  return (
    <div className="set-panel">
      <div className="list-head">
        <h2>
          Objects <span className="count">{structures.length}</span>
        </h2>
      </div>
      <input data-tour="objects-search" className="filter" placeholder="Search objects: speaker, chair, truss…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <p className="hint">Click to add, or drag into the view. Drag a fixture onto a stand or truss (Move tool, W) to attach it.</p>
      <div data-tour="objects-presets">
      {byCategory.map(([category, presets]) => {
        const open = query.trim() !== '' || !folded.includes(category)
        return (
          <div key={category} className="set-group">
            <button className="set-cat fold" onClick={() => toggle(category)} aria-expanded={open}>
              <span className="fold-arrow">{open ? '▾' : '▸'}</span> {category} <span className="count">{presets.length}</span>
            </button>
            {open && (
              <div className="set-presets">
                {presets.map((p) => (
                  <button
                    key={p.name}
                    className="set-preset"
                    draggable
                    title={STRUCTURE_KINDS[p.kind].description}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(STRUCTURE_DRAG, JSON.stringify({ kind: p.kind, params: p.params } satisfies StructureDrag))
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => addStructure(p.kind, p.params)}
                  >
                    <Icon kind={p.kind} />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      </div>
      {byCategory.length === 0 && <p className="hint">Nothing matches “{query}”.</p>}
      <div className="set-cat">In this show</div>
      {structures.length === 0 && <p className="hint">Nothing yet: fixtures stand on the floor.</p>}
      <ul className="set-list" data-tour="objects-list">
        {structures.map((s) => {
          const on = fixtures.filter((f) => f.mount?.structure === s.id).length
          return (
            <li
              key={s.id}
              className={selection.includes(s.id) ? 'selected' : ''}
              onClick={(e) => select(e.shiftKey || e.metaKey || e.ctrlKey ? (selection.includes(s.id) ? selection.filter((x) => x !== s.id) : [...selection, s.id]) : [s.id])}
              onDoubleClick={() => view.focus([s.id])}
              onContextMenu={(e) => {
                e.preventDefault()
                if (!selection.includes(s.id)) select([s.id])
                openMenu(e.clientX, e.clientY)
              }}
            >
              <Icon kind={s.kind} />
              <span className="name">{s.name}</span>
              <span className="sub">{on ? `${on} fixture${on > 1 ? 's' : ''}` : ''}</span>
              <button className="mini" title="Delete (what's on it falls to the floor)" onClick={(e) => (e.stopPropagation(), deleteStructures([s.id]))}>
                ✕
              </button>
            </li>
          )
        })}
      </ul>
      <p className="hint">Sizes in feet. 1 ft = {Math.round(FT * 1000) / 1000} m.</p>
    </div>
  )
}

/** A small line drawing of each kind of object. */
export function Icon({ kind }: { kind: StructureKind }) {
  const s = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const paths: Record<StructureKind, ReactElement> = {
    totem: <><rect x="9" y="3" width="6" height="16" {...s} /><path d="M6 21h12M10 6l4 4M14 10l-4 4M10 14l4 4" {...s} /></>,
    flexstand: <><path d="M12 4v15M6 21h12M9 4h6" {...s} /></>,
    tubeStand: <><path d="M12 3v16M8 21h8" {...s} /><rect x="10.5" y="2" width="3" height="6" {...s} /></>,
    tbar: <><path d="M5 5h14M12 5v11M12 16l-5 5M12 16l5 5M12 16v5" {...s} /></>,
    goalpost: <><path d="M4 21V5h16v16M4 8h16" {...s} /></>,
    trussBox: <><path d="M4 21V7l4-3h12v14l-4 3M4 7h12v14M16 7l4-3" {...s} /></>,
    groundTruss: <><path d="M3 15h18M3 19h18M5 15l3 4 3-4 3 4 3-4 3 4" {...s} /></>,
    stage: <><path d="M3 11h18v4H3zM5 15v5M19 15v5M12 11v4" {...s} /></>,
    table: <><path d="M3 10h18M6 10v10M18 10v10" {...s} /></>,
    djBooth: <><rect x="3" y="8" width="18" height="12" {...s} /><path d="M9 8v12M15 8v12M3 8l2-3h14l2 3" {...s} /></>,
    pipeDrape: <><path d="M4 4v17M20 4v17M4 5h16M7 5c0 6 1 11 0 16M11 5c0 6 1 11 0 16M15 5c0 6 1 11 0 16" {...s} /></>,
    speakerColumn: <><rect x="8" y="14" width="8" height="7" {...s} /><rect x="10.5" y="3" width="3" height="9" {...s} /></>,
    speakerOnPole: <><rect x="7" y="3" width="10" height="9" {...s} /><path d="M12 12v5M12 17l-5 4M12 17l5 4" {...s} /></>,
    sub: <><rect x="4" y="7" width="16" height="13" {...s} /><circle cx="12" cy="13.5" r="4" {...s} /></>,
    speakerOnSub: <><rect x="8" y="2" width="8" height="7" {...s} /><path d="M12 9v4" {...s} /><rect x="5" y="13" width="14" height="8" {...s} /><circle cx="12" cy="17" r="2.5" {...s} /></>,
    speakerBox: <><rect x="6" y="3" width="12" height="18" rx="1" {...s} /><circle cx="12" cy="15" r="3.5" {...s} /><circle cx="12" cy="7" r="1.5" {...s} /></>,
    monitor: <><path d="M3 19h18l-3-10H8L3 15z" {...s} /><path d="M7 15l3-4" {...s} /></>,
    subStack: <><rect x="5" y="3" width="14" height="8" {...s} /><rect x="5" y="12" width="14" height="9" {...s} /><circle cx="12" cy="7" r="2" {...s} /><circle cx="12" cy="16.5" r="2.5" {...s} /></>,
    lineArray: <><path d="M12 1v3M7 4h10" {...s} /><path d="M6 5h12v3H6zM6 9h12l-1 3H7zM7 13l10 0-2 3H9zM9 17h6l-3 4z" {...s} /></>,
    groundStack: <><rect x="4" y="14" width="16" height="7" {...s} /><path d="M5 5h14v3H5zM5 9h14v4H5z" {...s} /></>,
    fohDesk: <><path d="M3 13h18M5 13v8M19 13v8M7 13l2-5h6l2 5" {...s} /></>,
    ampRack: <><rect x="5" y="3" width="14" height="16" {...s} /><path d="M7 7h10M7 11h10M7 15h10M7 21h1M16 21h1" {...s} /></>,
    djGear: <><rect x="2" y="9" width="8" height="8" {...s} /><rect x="14" y="9" width="8" height="8" {...s} /><path d="M11 9h2v8h-2z" {...s} /><circle cx="6" cy="13" r="2.5" {...s} /><circle cx="18" cy="13" r="2.5" {...s} /></>,
    micStand: <><path d="M12 21V9M8 21l4-5 4 5M12 9l6-4" {...s} /><rect x="17" y="2" width="3" height="5" rx="1.5" {...s} /></>,
    drumKit: <><ellipse cx="12" cy="15" rx="5" ry="5" {...s} /><path d="M3 7h6M15 6h6M6 7v14M18 6v15" {...s} /></>,
    guitarAmp: <><rect x="4" y="5" width="16" height="15" rx="1" {...s} /><path d="M6 8h12" {...s} /><rect x="7" y="11" width="10" height="7" {...s} /></>,
    keyboard: <><rect x="2" y="7" width="20" height="5" {...s} /><path d="M5 7v3M8 7v3M11 7v3M14 7v3M17 7v3M6 12l12 9M18 12L6 21" {...s} /></>,
    roundTable: <><ellipse cx="12" cy="11" rx="7" ry="3" {...s} /><path d="M5 11v8M19 11v8" {...s} /><circle cx="3" cy="17" r="1.5" {...s} /><circle cx="21" cy="17" r="1.5" {...s} /></>,
    highTop: <><ellipse cx="12" cy="5" rx="6" ry="2" {...s} /><path d="M12 7v12M8 21h8" {...s} /></>,
    bar: <><path d="M2 8h20M3 8v13h18V8M7 4v4M10 3v5" {...s} /></>,
    chairs: <><path d="M7 3v18M7 12h9v9M7 9h0" {...s} /><path d="M16 12v-1" {...s} /></>,
    sofa: <><path d="M3 11v8h18v-8M5 11V7h14v4M3 15h18M5 19v2M19 19v2" {...s} /></>,
    wall: <><rect x="3" y="4" width="18" height="16" {...s} /><path d="M3 9h18M3 14h18M8 4v5M14 9v5M9 14v6M16 14v6" {...s} /></>,
    danceFloor: <><path d="M2 18l4-8h12l4 8z M9 10l-1 8M15 10l1 8M4 14h16" {...s} /></>,
    screen: <><rect x="3" y="3" width="18" height="11" {...s} /><path d="M6 14v7M18 14v7" {...s} /></>,
    ledWall: <><rect x="3" y="3" width="18" height="14" {...s} /><path d="M9 3v14M15 3v14M3 10h18M6 17v4M18 17v4" {...s} /></>,
    backdrop: <><path d="M4 21V3h16v18M4 3h16" {...s} /><path d="M8 8h2M14 8h2M8 13h2M14 13h2" {...s} /></>,
    stanchions: <><path d="M5 6v14M19 6v14M3 21h4M17 21h4M5 8c4 4 10 4 14 0" {...s} /></>,
    plant: <><path d="M8 15h8l-1 6H9zM12 15V9" {...s} /><path d="M12 9c-4 0-6-3-6-6 4 0 6 2 6 6zM12 11c3 0 6-2 6-5-4 0-6 2-6 5z" {...s} /></>,
    pillar: <><path d="M7 3h10M7 21h10M9 3v18M15 3v18" {...s} /></>,
    person: <><circle cx="12" cy="5" r="2.5" {...s} /><path d="M12 8v7M8 11h8M12 15l-3 6M12 15l3 6" {...s} /></>,
    tv: <><rect x="2" y="4" width="20" height="12" rx="1" {...s} /><path d="M12 16v4M8 21h8" {...s} /></>,
    balloonArch: <><path d="M4 21V12a8 8 0 0116 0v9" {...s} /><circle cx="5" cy="13" r="1.8" {...s} /><circle cx="7" cy="8" r="1.8" {...s} /><circle cx="12" cy="5" r="1.8" {...s} /><circle cx="17" cy="8" r="1.8" {...s} /><circle cx="19" cy="13" r="1.8" {...s} /></>,
    photoBooth: <><ellipse cx="12" cy="18" rx="8" ry="2.5" {...s} /><path d="M12 18V9l7-3" {...s} /><circle cx="19" cy="6" r="2" {...s} /></>,
    neonSign: <><rect x="2" y="6" width="20" height="10" rx="2" {...s} /><path d="M6 13V9l3 4V9M12 9v4h2M16 9h2v4h-2" {...s} /><path d="M8 16v5M16 16v5" {...s} /></>,
    discoBall: <><path d="M12 2v5" {...s} /><circle cx="12" cy="14" r="7" {...s} /><path d="M5 14h14M12 7v14M7 9.5c3 1.5 7 1.5 10 0M7 18.5c3-1.5 7-1.5 10 0" {...s} /></>,
    crowd: <><circle cx="7" cy="7" r="2" {...s} /><circle cx="17" cy="7" r="2" {...s} /><circle cx="12" cy="10" r="2" {...s} /><path d="M3 18c0-3 2-6 4-6s4 3 4 6M13 18c0-3 2-6 4-6s4 3 4 6M8 21c0-3 2-6 4-6s4 3 4 6" {...s} /></>
  }
  return (
    <svg className="set-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      {paths[kind]}
    </svg>
  )
}
