/**
 * The fixture list: select, mute, solo, hide, rename and re-patch in place.
 *
 * - Click selects; Shift-click selects a range; Cmd-click adds or removes one.
 * - M / S / eye buttons mute, solo or hide. With several fixtures selected,
 *   pressing one on a selected row applies it to the whole selection.
 * - Double-click a name or patch to edit it. With several selected, a new name
 *   numbers them ("Spot 1", "Spot 2"...) and a new address patches them in a row.
 */
import { LockedBadge } from './LockIcon'
import { useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useMix } from '../state/mix'
import { useFixtureMenu } from '../state/fixtureMenu'
import { renameGroup, restoreSoundSwitchFixtures, updateFixtures } from '../state/commands'
import { footprint, type Fixture } from '../model/project'
import { ProblemsBanner, useProblemIndex } from './PatchProblems'
import { getFixtureType, plainName } from '../model/fixtureTypes'

type GroupBy = 'type' | 'group' | 'patch' | 'none'
const GROUP_BY: Array<[GroupBy, string, string]> = [
  ['type', 'Type', 'One group per kind of fixture: copies land together'],
  ['group', 'SoundSwitch group', "SoundSwitch's fixture groups (double-click a group's name to rename it)"],
  ['patch', 'Patch', 'Fixtures sharing a DMX address together: copies that mirror each other'],
  ['none', 'No groups', 'One plain list']
]
const VIEW_KEY = 'sound-visualizer:fixture-list'

interface ListView {
  groupBy: GroupBy
  /** Folded groups, as "<groupBy>:<key>". */
  folded: string[]
  problemsOpen: boolean
}

function loadView(): ListView {
  try {
    return { groupBy: 'type', folded: [], problemsOpen: true, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') }
  } catch {
    return { groupBy: 'type', folded: [], problemsOpen: true }
  }
}

interface Section {
  key: string
  title: string
  sub: string
  fixtures: Fixture[]
  /** SoundSwitch group number, so the header can rename it. */
  group?: number
}

export function FixtureList() {
  const fixtures = useStore((s) => s.project.fixtures)
  const names = useStore((s) => s.project.groupNames)
  const deletedFromSoundSwitch = useStore((s) => s.project.soundswitch?.exclude?.length ?? 0)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const mix = useMix()
  const [filter, setFilter] = useState('')
  const [listView, setListView] = useState<ListView>(loadView)
  const [renaming, setRenaming] = useState<number | null>(null)
  const anchor = useRef<string | null>(null)
  const problems = useProblemIndex()

  const update = (change: Partial<ListView>) => {
    const next = { ...listView, ...change }
    setListView(next)
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(next))
    } catch {
      // Not remembered.
    }
  }

  const shown = fixtures.filter((f) => !filter || `${f.name} ${getFixtureType(f.typeId).name}`.toLowerCase().includes(filter.toLowerCase()))
  const groupLabel = (g: number) => (g === 0 ? 'No group' : names?.[g] ?? `Group ${g}`)

  const sections = useMemo((): Section[] => {
    const by = listView.groupBy
    if (by === 'none') return [{ key: 'all', title: '', sub: '', fixtures: shown }]
    const map = new Map<string, Section>()
    for (const f of shown) {
      let key: string
      let title: string
      let sub = ''
      let group: number | undefined
      if (by === 'type') {
        key = f.typeId
        title = shortType(f)
        sub = `${footprint(f)} ch`
      } else if (by === 'group') {
        group = f.group ?? 0
        key = String(group)
        title = groupLabel(group)
      } else {
        key = `${f.universe}.${f.address}.${f.typeId}`
        title = `${f.universe + 1}.${f.address}`
        sub = shortType(f)
      }
      const section = map.get(key) ?? { key, title, sub, fixtures: [], group }
      section.fixtures.push(f)
      map.set(key, section)
    }
    const list = [...map.values()]
    if (by === 'group') list.sort((a, b) => ((a.group || 999) - (b.group || 999)))
    if (by === 'patch') list.sort((a, b) => a.fixtures[0].universe - b.fixtures[0].universe || a.fixtures[0].address - b.fixtures[0].address)
    if (by === 'group') for (const s of list) s.sub = groupSummary(s.fixtures)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((f) => f.id + f.typeId + f.group + f.universe + f.address + f.name).join(), listView.groupBy, names])

  const isFolded = (key: string) => listView.folded.includes(`${listView.groupBy}:${key}`)
  const fold = (key: string) => {
    const k = `${listView.groupBy}:${key}`
    update({ folded: listView.folded.includes(k) ? listView.folded.filter((x) => x !== k) : [...listView.folded, k] })
  }
  const visibleOrder = sections.flatMap((s) => (isFolded(s.key) ? [] : s.fixtures)).map((f) => f.id)

  const onRowClick = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current && visibleOrder.includes(anchor.current)) {
      const [a, b] = [visibleOrder.indexOf(anchor.current), visibleOrder.indexOf(id)].sort((x, y) => x - y)
      select(visibleOrder.slice(a, b + 1))
    } else if (e.metaKey || e.ctrlKey) {
      select(selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id])
      anchor.current = id
    } else {
      select([id])
      anchor.current = id
    }
  }

  /** The fixtures a row's button acts on: the whole selection if the row is part of it. */
  const targets = (id: string) => (selection.includes(id) && selection.length > 1 ? selection : [id])
  const grouped = listView.groupBy !== 'none'

  return (
    <div className="fixture-list">
      <div className="list-head">
        <h2>
          Fixtures <span className="count">{fixtures.length}</span>
        </h2>
        <div className="list-tools">
          <button className="mini" onClick={() => select(shown.map((f) => f.id))} title="Select every fixture in the list (⌘A)">
            All
          </button>
          {mix.solo.length > 0 && (
            <button className="mini on-solo" onClick={() => mix.clear('solo')} title="Stop soloing: every fixture acts again">
              Unsolo
            </button>
          )}
          {mix.muted.length > 0 && (
            <button className="mini on-mute" onClick={() => mix.clear('muted')} title="Unmute every fixture">
              Unmute
            </button>
          )}
          {mix.hidden.length > 0 && (
            <button className="mini" onClick={() => mix.clear('hidden')} title="Show the fixtures you hid">
              Show all
            </button>
          )}
          {deletedFromSoundSwitch > 0 && (
            <button className="mini" onClick={() => restoreSoundSwitchFixtures()} title={`${deletedFromSoundSwitch} fixture${deletedFromSoundSwitch === 1 ? '' : 's'} from SoundSwitch deleted from this show. Bring them back on the next sync.`}>
              Bring back deleted ({deletedFromSoundSwitch})
            </button>
          )}
        </div>
      </div>
      <ProblemsBanner open={listView.problemsOpen} setOpen={(problemsOpen) => update({ problemsOpen })} />
      <div className="list-controls">
        <input data-tour="fixture-filter" className="filter" placeholder="Filter fixtures…" value={filter} onChange={(e) => setFilter(e.target.value)} title="Show only fixtures whose name or type contains this" />
        <select value={listView.groupBy} onChange={(e) => update({ groupBy: e.target.value as GroupBy })} title="How to group the list" aria-label="Group by">
          {GROUP_BY.map(([id, label, tip]) => (
            <option key={id} value={id} title={tip}>
              {id === 'none' ? label : `By ${label.toLowerCase()}`}
            </option>
          ))}
        </select>
        {grouped && sections.length > 1 && (
          <button
            className="mini"
            title={sections.every((s) => isFolded(s.key)) ? 'Open every group' : 'Fold every group'}
            onClick={() =>
              update({
                folded: sections.every((s) => isFolded(s.key))
                  ? listView.folded.filter((k) => !k.startsWith(`${listView.groupBy}:`))
                  : [...new Set([...listView.folded, ...sections.map((s) => `${listView.groupBy}:${s.key}`)])]
              })
            }
          >
            {sections.every((s) => isFolded(s.key)) ? '▸▸' : '▾▾'}
          </button>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th className="toggles" title="M mute · S solo · ● show or hide" />
            <th>Name</th>
            <th title="Universe.address, numbered like SoundSwitch">Patch</th>
          </tr>
        </thead>
        {sections.map((section) => {
          const ids = section.fixtures.map((f) => f.id)
          const folded = grouped && isFolded(section.key)
          const allSelected = ids.every((id) => selection.includes(id))
          const state = (key: 'muted' | 'solo' | 'hidden') => ids.every((id) => mix[key].includes(id))
          const issue = section.fixtures.some((f) => problems.has(f.id))
          return (
            <tbody key={section.key} className={grouped ? 'section' : ''}>
              {grouped && (
                <tr className={`section-head ${allSelected ? 'selected' : ''}`} onContextMenu={(e) => (e.preventDefault(), select(ids), useFixtureMenu.getState().open(e.clientX, e.clientY))}>
                  <td colSpan={3}>
                    <div className="section-row">
                      <button className="fold" onClick={() => fold(section.key)} title={folded ? 'Show the fixtures in this group' : 'Fold this group away'} aria-expanded={!folded}>
                        {folded ? '▸' : '▾'}
                      </button>
                      {renaming !== null && renaming === section.group ? (
                        <input
                          className="chip-input"
                          autoFocus
                          defaultValue={section.title}
                          onBlur={(e) => {
                            renameGroup(section.group!, e.target.value === `Group ${section.group}` ? '' : e.target.value)
                            setRenaming(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            if (e.key === 'Escape') setRenaming(null)
                          }}
                        />
                      ) : (
                        <button
                          className="section-title"
                          title={`Select all ${ids.length} to edit them together${section.group ? '. Double-click to rename the group' : ''}`}
                          onClick={(e) => (e.metaKey || e.ctrlKey ? select([...new Set([...selection, ...ids])]) : select(ids))}
                          onDoubleClick={() => section.group && setRenaming(section.group)}
                        >
                          {issue && <span className="problem-dot" title="A patch problem: see the list above">!</span>}
                          <span className="section-name">{section.title}</span>
                          <span className="count">{ids.length}</span>
                          {section.sub && <span className="section-sub">{section.sub}</span>}
                        </button>
                      )}
                      <span className="section-tools">
                        <button className={`tog ${state('muted') ? 'on-mute' : ''}`} title="Mute the whole group" onClick={() => mix.toggle('muted', ids)}>
                          M
                        </button>
                        <button className={`tog ${state('solo') ? 'on-solo' : ''}`} title="Solo the whole group: only it acts" onClick={() => mix.toggle('solo', ids)}>
                          S
                        </button>
                        <button className={`tog ${state('hidden') ? 'on-hide' : ''}`} title="Hide or show the whole group" onClick={() => mix.toggle('hidden', ids)}>
                          {state('hidden') ? '◌' : '●'}
                        </button>
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              {!folded &&
                section.fixtures.map((f) => {
                  const muted = mix.muted.includes(f.id)
                  const solo = mix.solo.includes(f.id)
                  const hidden = mix.hidden.includes(f.id)
                  const live = mix.isLive(f.id)
                  const issueText = problems.get(f.id)
                  return (
                    <tr
                      key={f.id}
                      className={[selection.includes(f.id) ? 'selected' : '', live ? '' : 'dead', hidden ? 'hidden-row' : '', grouped ? 'in-section' : ''].join(' ')}
                      onClick={(e) => onRowClick(f.id, e)}
                      onContextMenu={(e) => {
                        // The same actions as right-clicking the fixture in the 3D view.
                        e.preventDefault()
                        if (!selection.includes(f.id)) select([f.id])
                        useFixtureMenu.getState().open(e.clientX, e.clientY)
                      }}
                    >
                      <td className="toggles" onClick={(e) => e.stopPropagation()}>
                        <button className={`tog ${muted ? 'on-mute' : ''}`} title="Mute (M): it stops responding" onClick={() => mix.toggle('muted', targets(f.id))}>
                          M
                        </button>
                        <button className={`tog ${solo ? 'on-solo' : ''}`} title="Solo (S): only soloed fixtures respond" onClick={() => mix.toggle('solo', targets(f.id))}>
                          S
                        </button>
                        <button className={`tog ${hidden ? 'on-hide' : ''}`} title="Hide or show it in the 3D view (H)" onClick={() => mix.toggle('hidden', targets(f.id))}>
                          {hidden ? '◌' : '●'}
                        </button>
                      </td>
                      <td>
                        {issueText && (
                          <span className="problem-dot" title={`${issueText}\nSee the patch problems at the top of the list to fix it.`}>
                            !
                          </span>
                        )}
                        {f.locked && <LockedBadge id={f.id} />}
                        <InlineEdit value={f.name} onCommit={(v) => rename(f, v, targets(f.id))} />
                        {listView.groupBy !== 'type' && (
                          <div className="sub">
                            {f.group && listView.groupBy !== 'group' ? <span className="group-tag">G{f.group}</span> : null}
                            {shortType(f)}
                          </div>
                        )}
                      </td>
                      <td className="mono">
                        <InlineEdit value={`${f.universe + 1}.${f.address}`} onCommit={(v) => repatch(f, v, targets(f.id))} />
                        {listView.groupBy !== 'type' && <div className="sub">{footprint(f)} ch</div>}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          )
        })}
      </table>
      {fixtures.length > 0 && shown.length === 0 && <p className="hint">No fixture matches “{filter}”.</p>}
      <p className="hint">
        Click a group's name to select it all and edit it together. Shift-click a range, Cmd-click to add, right-click for actions. Double-click a name or patch to edit it.
      </p>
    </div>
  )
}

function shortType(f: Fixture): string {
  const name = plainName(getFixtureType(f.typeId).name)
  return name.length > 30 ? name.slice(0, 29) + '…' : name
}

/** A text that turns into an input on double-click; Enter or leaving the field commits. */
function InlineEdit({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!editing) {
    return (
      <span
        className="inline-edit"
        onDoubleClick={(e) => {
          e.stopPropagation()
          setDraft(value)
          setEditing(true)
        }}
      >
        {value}
      </span>
    )
  }
  const done = (commit: boolean) => {
    setEditing(false)
    if (commit && draft.trim() && draft !== value) onCommit(draft.trim())
  }
  return (
    <input
      className="inline-input"
      autoFocus
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done(true)
        if (e.key === 'Escape') done(false)
      }}
    />
  )
}

/** One fixture: the new name. Several: "<name> 1", "<name> 2"... in list order. */
function rename(f: Fixture, name: string, ids: string[]): void {
  if (ids.length === 1) {
    updateFixtures([f.id], 'Rename', (x) => ({ ...x, name }))
    return
  }
  const base = name.replace(/\s*\d+$/, '')
  const order = useStore.getState().project.fixtures.filter((x) => ids.includes(x.id)).map((x) => x.id)
  updateFixtures(ids, `Rename ${ids.length} fixtures`, (x) => ({ ...x, name: `${base} ${order.indexOf(x.id) + 1}` }))
}

/** "1.17" or "17". One fixture moves there; several are patched in a row from there. */
function repatch(f: Fixture, text: string, ids: string[]): void {
  const match = /^(?:(\d+)\.)?(\d+)$/.exec(text.trim())
  if (!match) return
  // Universes are typed the SoundSwitch way, from 1.
  const universe = match[1] !== undefined ? Math.max(0, Number(match[1]) - 1) : f.universe
  const start = Math.max(1, Math.min(512, Number(match[2])))
  if (ids.length === 1) {
    updateFixtures([f.id], 'Patch', (x) => ({ ...x, universe, address: start }))
    return
  }
  const order = useStore.getState().project.fixtures.filter((x) => ids.includes(x.id))
  const addresses = new Map<string, number>()
  let next = start
  for (const x of order) {
    addresses.set(x.id, next)
    next += footprint(x)
  }
  updateFixtures(ids, `Patch ${ids.length} fixtures in a row`, (x) => ({ ...x, universe, address: addresses.get(x.id) ?? x.address }))
}

/** "BO-IR4 ×3, Spider" — what's in a group, from its fixtures' types. */
function groupSummary(list: Fixture[]): string {
  const counts = new Map<string, number>()
  for (const f of list) {
    const name = shortType(f).split(' ').slice(0, 2).join(' ')
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([n, c]) => (c > 1 ? `${n} ×${c}` : n))
    .join(', ')
}
