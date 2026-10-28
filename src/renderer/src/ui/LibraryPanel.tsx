/**
 * The fixture library: search, browse by
 * manufacturer or kind of fixture, see a fixture's size and modes, then add it
 * (with a quantity and a patch) or drag it into the 3D view.
 */
import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, searchLibrary, useLibrary } from '../state/library'
import { useStore } from '../state/store'
import { addLibraryFixtures } from '../state/commands'
import type { LibraryEntry } from '../model/oflImport'
import { plainName, type FixtureType } from '../model/fixtureTypes'
import { planPatch } from '../model/project'
import { useStudio } from '../state/studio'
import { runCommand } from '../state/menuCommands'
import { MenuItem, MenuShell } from './Menu'
import { useUnits } from '../state/prefs'
import { lengthNumber, unitLabel } from '../model/units'

export const DRAG_TYPE = 'application/x-ssvis-fixture'

/** What a drag from the library carries. `rig` = a type already in the project. */
export type DragPayload = { library: string; mode: number } | { rig: string }

export function LibraryPanel() {
  const { status, error, entries, recent, load, library, qlcCredit } = useLibrary()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; key?: string; inRecent?: boolean } | null>(null)
  const rowMenu = (inRecent: boolean) => (e: React.MouseEvent, key: string) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, key, inRecent })
  }

  useEffect(() => {
    void load()
  }, [load])

  const results = useMemo(() => searchLibrary(entries, query, category), [entries, query, category])
  const byMaker = useMemo(() => {
    const groups = new Map<string, LibraryEntry[]>()
    for (const e of results) groups.set(e.manufacturer, [...(groups.get(e.manufacturer) ?? []), e])
    return [...groups]
  }, [results])
  const searching = query.trim().length > 0
  const recentEntries = recent.map((k) => entries.find((e) => e.key === k)).filter((e): e is LibraryEntry => !!e)
  const mine = entries.filter((e) => e.source === 'mine')
  const pick = (key: string) => {
    setPicked(key)
    void useLibrary.getState().loadDef(key)
  }
  const pickedEntry = entries.find((e) => e.key === picked) ?? null

  const toggle = (maker: string) => {
    const next = new Set(open)
    if (next.has(maker)) next.delete(maker)
    else next.add(maker)
    setOpen(next)
  }

  return (
    <div className="library">
      <div className="list-head">
        <h2>
          Library <span className="count">{entries.length}</span>
        </h2>
        <div className="list-tools">
          <button className="mini" onClick={() => useStudio.getState().start()} title="Make a fixture that isn't here: from its manual, a file, the web or a type (⇧⌘N)" data-tour="new-fixture">
            New fixture…
          </button>
          <button className="mini" onClick={() => runCommand('importFixtures')} title="Open a fixture file (GDTF, Open Fixture Library, QLC+ or Sound Visualizer) in Fixture Studio">
            Import…
          </button>
        </div>
      </div>
      <input data-tour="library-search" className="filter" placeholder="Search maker, model or type…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <div className="chips">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)} title={`Show only ${c.label.toLowerCase()}`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="library-list" data-tour="library-list">
        {status === 'loading' && <p className="hint">Loading the library…</p>}
        {status === 'error' && <p className="problem">{error}</p>}
        {status === 'ready' && (
          <>
            {!searching && category === 'all' && mine.length > 0 && (
              <Group title="My Fixtures" count={mine.length} open onToggle={() => {}}>
                {mine.map((e) => (
                  <Row key={e.key} entry={e} picked={picked === e.key} onPick={pick} showMaker onMenu={rowMenu(false)} />
                ))}
              </Group>
            )}
            {!searching && category === 'all' && <RigTypes />}
            {!searching && category === 'all' && recentEntries.length > 0 && (
              <Group title="Recent" count={recentEntries.length} open onToggle={() => {}} onMenu={(e) => (e.preventDefault(), setMenu({ x: e.clientX, y: e.clientY, inRecent: true }))}>
                {recentEntries.map((e) => (
                  <Row key={e.key} entry={e} picked={picked === e.key} onPick={pick} onMenu={rowMenu(true)} />
                ))}
              </Group>
            )}
            {searching
              ? results.slice(0, 300).map((e) => <Row key={e.key} entry={e} picked={picked === e.key} onPick={pick} showMaker onMenu={rowMenu(false)} />)
              : byMaker.map(([maker, list]) => (
                  <Group key={maker} title={maker} count={list.length} open={open.has(maker)} onToggle={() => toggle(maker)}>
                    {list.map((e) => (
                      <Row key={e.key} entry={e} picked={picked === e.key} onPick={pick} onMenu={rowMenu(false)} />
                    ))}
                  </Group>
                ))}
            {results.length === 0 && (
              <div className="hint">
                Not in the Library?{' '}
                <button className="link" onClick={() => useStudio.getState().start()}>
                  Make it in Fixture Studio
                </button>{' '}
                from its manual, a file or the web.
              </div>
            )}
            {searching && results.length > 300 && <p className="hint">Showing the first 300. Type more to narrow it down.</p>}
          </>
        )}
      </div>

      {pickedEntry && <Details key={pickedEntry.key} entry={pickedEntry} />}
      {menu && <LibraryMenu menu={menu} onClose={() => setMenu(null)} onDeleted={(key) => picked === key && setPicked(null)} />}
      {library && (
        <p className="credit">
          Fixtures from the{' '}
          <a href="https://open-fixture-library.org" target="_blank" rel="noreferrer">
            Open Fixture Library
          </a>{' '}
          (MIT){library.built ? `, ${library.built}` : ''}
          {qlcCredit !== null && (
            <>
              {' '}and the{' '}
              <a href="https://www.qlcplus.org" target="_blank" rel="noreferrer">
                QLC+
              </a>{' '}
              fixture library (Apache 2.0)
            </>
          )}
          .
        </p>
      )}
    </div>
  )
}

/** Right-click on a Library row (or the Recent heading). */
function LibraryMenu({ menu, onClose, onDeleted }: { menu: { x: number; y: number; key?: string; inRecent?: boolean }; onClose: () => void; onDeleted: (key: string) => void }) {
  const { entries, forgetRecent, recent } = useLibrary()
  const entry = menu.key ? entries.find((e) => e.key === menu.key) : undefined
  const run = (f: () => void) => () => {
    onClose()
    f()
  }
  return (
    <MenuShell at={menu} onClose={onClose}>
      {entry && <MenuItem label="Open in Fixture Studio" onClick={run(() => void openInStudio(entry))} />}
      {entry && menu.inRecent && <MenuItem label="Remove from Recent" onClick={run(() => forgetRecent(entry.key))} />}
      {menu.inRecent && <MenuItem label="Clear Recent" disabled={!recent.length} onClick={run(() => forgetRecent())} />}
      {entry?.source === 'mine' && <MenuItem label="Delete from My Fixtures…" danger onClick={run(() => void deleteMine(entry, onDeleted))} />}
    </MenuShell>
  )
}

async function deleteMine(entry: LibraryEntry, onDeleted: (key: string) => void): Promise<void> {
  if (typeof confirm === 'function' && !confirm(`Delete “${entry.manufacturer} ${entry.name}” from My Fixtures? Fixtures already in your shows keep working.`)) return
  await useLibrary.getState().deleteMine(entry.key)
  onDeleted(entry.key)
}

async function openInStudio(entry: LibraryEntry): Promise<void> {
  const def = await useLibrary.getState().defFor(entry.key)
  if (!def) return
  const report =
    entry.source === 'mine'
      ? []
      : entry.source === 'catalog'
        ? [`${entry.manufacturer} ${entry.name}: its look and modes are filled in. Set what each channel does from the manual${def.manualUrl ? ` (${def.manualUrl})` : ''}, or ask Claude in the Studio to fill them in from it. Then save it and add it to your show.`]
        : [`Opened from the Library: ${entry.manufacturer} ${entry.name}. Test it on the twin; changes make your own copy.`]
  useStudio.getState().openDef(structuredClone(def), report)
}

function Group({ title, count, open, onToggle, onMenu, children }: { title: string; count: number; open: boolean; onToggle: () => void; onMenu?: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <div className="lib-group">
      <button className="lib-group-head" onClick={onToggle} onContextMenu={onMenu}>
        <span className="caret">{open ? '▾' : '▸'}</span> {title} <span className="count">{count}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

function kindOf(categories: string[]): string {
  return categories.slice(0, 2).join(' · ') || 'Fixture'
}

function Row({ entry, picked, onPick, showMaker, onMenu }: { entry: LibraryEntry; picked: boolean; onPick: (k: string) => void; showMaker?: boolean; onMenu?: (e: React.MouseEvent, key: string) => void }) {
  return (
    <div
      className={`lib-row ${picked ? 'picked' : ''}`}
      onClick={() => onPick(entry.key)}
      onContextMenu={onMenu ? (e) => onMenu(e, entry.key) : undefined}
      draggable
      onDragStart={(e) => {
        void useLibrary.getState().loadDef(entry.key)
        const payload: DragPayload = { library: entry.key, mode: 0 }
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      title="Click for details, drag into the 3D view, or right-click for more"
    >
      <div className="lib-name">{showMaker ? `${entry.manufacturer} ${entry.name}` : entry.name}</div>
      <div className="sub">
        {kindOf(entry.categories)} · {entry.modes.length} mode{entry.modes.length === 1 ? '' : 's'}
        {entry.source === 'qlc' ? ' · QLC+' : entry.source === 'mine' ? ' · yours' : entry.source === 'catalog' ? ' · set up from the manual' : ''}
      </div>
    </div>
  )
}

/** Types already in the project (your SoundSwitch fixtures): add more of the same. */
function RigTypes() {
  const project = useStore((s) => s.project)
  const [isOpen, setOpen] = useState(false)
  const types = (project.fixtureTypes ?? []).filter((t) => project.fixtures.some((f) => f.typeId === t.id))
  if (!types.length) return null
  return (
    <Group title="In your rig" count={types.length} open={isOpen} onToggle={() => setOpen(!isOpen)}>
      {types.map((t) => (
        <div
          key={t.id}
          className="lib-row"
          draggable
          onDragStart={(e) => {
            const payload: DragPayload = { rig: t.id }
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
          }}
          title="Drag into the 3D view to add another one with its own patch"
        >
          <div className="lib-name">{plainName(t.name)}</div>
          <div className="sub">
            {t.source ?? 'Fixture'} · {t.channels.length} ch
          </div>
          <AddOne type={t} />
        </div>
      ))}
    </Group>
  )
}

function AddOne({ type }: { type: FixtureType }) {
  return (
    <button
      className="mini add-one"
      title="Add another with its own patch"
      onClick={(e) => {
        e.stopPropagation()
        addLibraryFixtures(type, 1)
      }}
    >
      +
    </button>
  )
}


function Details({ entry }: { entry: LibraryEntry }) {
  useUnits()
  const fixtures = useStore((s) => s.project.fixtures)
  const [mode, setMode] = useState(0)
  const [count, setCount] = useState(1)
  const [start, setStart] = useState('')
  const channels = entry.modes[mode]?.channels ?? 1

  // Where they'd be patched, so you can see it before adding.
  const parsed = /^(\d+)\.(\d+)$/.exec(start.trim()) ?? /^()(\d+)$/.exec(start.trim())
  const startAt = parsed ? { universe: parsed[1] ? Math.max(0, Number(parsed[1]) - 1) : 0, address: Number(parsed[2]) } : undefined
  const plan = planPatch(fixtures, count, channels, startAt)
  const first = plan[0]
  const last = plan.at(-1)

  const add = async () => {
    await useLibrary.getState().loadDef(entry.key)
    const type = useLibrary.getState().typeFor(entry.key, mode)
    if (type) addLibraryFixtures(type, count, { start: startAt })
  }
  return (
    <div className="lib-details">
      <div
        className="lib-title"
        draggable
        onDragStart={(e) => {
          const payload: DragPayload = { library: entry.key, mode }
          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
        }}
        title="Drag into the 3D view to place one in this mode"
      >
        <span className="grip">⠿</span> {entry.name}
      </div>
      <div className="sub">
        {entry.manufacturer} · {kindOf(entry.categories)}
      </div>
      <div className="lib-facts">
        {entry.size && (
          <span>
            {lengthNumber(entry.size[0], 'small')} × {lengthNumber(entry.size[1], 'small')} × {lengthNumber(entry.size[2], 'small')} {unitLabel('small')}
          </span>
        )}
        {entry.weight ? <span>{entry.weight} kg</span> : null}
        {entry.power ? <span>{entry.power} W</span> : null}
      </div>
      <label className="field">
        <span className="label">Mode</span>
        <select value={mode} onChange={(e) => setMode(Number(e.target.value))}>
          {entry.modes.map((m, i) => (
            <option key={i} value={i}>
              {m.name} ({m.channels} ch)
            </option>
          ))}
        </select>
      </label>
      <div className="lib-add">
        <label className="field">
          <span className="label">How many</span>
          <input type="number" min={1} max={64} value={count} onChange={(e) => setCount(Math.max(1, Math.min(64, Number(e.target.value) || 1)))} />
        </label>
        <label className="field">
          <span className="label">Patch from</span>
          <input placeholder="next free" value={start} onChange={(e) => setStart(e.target.value)} title='Universe.address, e.g. "1.101", or just an address' />
        </label>
      </div>
      <p className="hint">
        {first && last
          ? plan.length === 1
            ? `Patched at ${first.universe + 1}.${first.address}.`
            : `Patched ${first.universe + 1}.${first.address} to ${last.universe + 1}.${last.address + channels - 1}${last.universe !== first.universe ? ' (continues into the next universe)' : ''}.`
          : 'No room to patch these.'}
      </p>
      {entry.source === 'catalog' && (
        <p className="hint">
          We know how it looks and its modes, but not yet what each channel does. Open it in Fixture Studio, fill in the channels from its manual (or let Claude read the manual), and save: then add it to your show.
        </p>
      )}
      <div className="lib-actions">
        {entry.source !== 'catalog' && <button className="primary" disabled={!plan.length} onClick={() => void add()} title="Add them to the show, patched where the line above says">
          Add {count > 1 ? `${count} fixtures` : 'to rig'}
        </button>}
        <button className={entry.source === 'catalog' ? 'primary' : undefined} onClick={() => void openInStudio(entry)} title="See every channel on a 3D twin and run its tests, before or after adding it">
          {entry.source === 'catalog' ? 'Set it up in Fixture Studio' : 'Open in Fixture Studio'}
        </button>
        {entry.source === 'mine' && (
          <button className="danger" onClick={() => void deleteMine(entry, () => {})} title="Remove it from My Fixtures. Fixtures already in your shows keep working.">
            Delete…
          </button>
        )}
      </div>
      {entry.source === 'ofl' || !entry.source ? (
        <a className="lib-link" href={`https://open-fixture-library.org/${entry.key}`} target="_blank" rel="noreferrer">
          View on open-fixture-library.org
        </a>
      ) : entry.source === 'qlc' ? (
        <span className="lib-link">From the QLC+ fixture library</span>
      ) : entry.source === 'catalog' ? (
        <span className="lib-link">Look and modes from the Show-Designer fixture catalogue</span>
      ) : null}
    </div>
  )
}
