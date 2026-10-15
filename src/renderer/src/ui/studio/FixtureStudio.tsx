/**
 * Fixture Studio: make a fixture, or change one, while watching its digital twin.
 *
 *   ┌ Back to show · name · modes ·················· status · Undo · Export · Save ┐
 *   │ Schematic (the face, lit live)  │                     │ Channel · Look ·    │
 *   │ DMX strip                       │   3D twin           │ Tests · Problems ·  │
 *   │ Channel list (sliders, batch)   │                     │ How it works        │
 *   └─────────────────────────────────┴─────────────────────┴─────────────────────┘
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDismiss } from '../useDismiss'
import { checkDef } from '../../model/fixtureChecks'
import { newKey, type FixtureDef } from '../../model/fixtureDef'
import { defToOfl, fileNameFor, writeStudioFile } from '../../model/fixtureFiles'
import { useStudio, type RightTab } from '../../state/studio'
import { notify } from '../../state/notices'
import { ErrorBoundary } from '../ErrorBoundary'
import { Notices } from '../Notices'
import { StudioStart } from './StudioStart'
import { TwinView } from './TwinView'
import { Schematic } from './Schematic'
import { ChannelList } from './ChannelList'
import { ChannelPanel } from './ChannelPanel'
import { LookPanel } from './LookPanel'
import { LearnPanel, ProblemsPanel, TestsPanel } from './StudioPanels'
import './studio.css'

export function FixtureStudio() {
  const open = useStudio((s) => s.open)
  const screen = useStudio((s) => s.screen)
  const def = useStudio((s) => s.def)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      if (e.key === 'Escape') {
        if (useStudio.getState().driving.scene) useStudio.getState().runScene(null)
        else if (useStudio.getState().selected.length) useStudio.getState().select([])
        else useStudio.getState().close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  return (
    <div className="studio" role="dialog" aria-label="Fixture Studio">
      <ErrorBoundary name="Fixture Studio">{screen === 'start' || !def ? <StartFrame /> : <Editor def={def} />}</ErrorBoundary>
      <div className="studio-notices">
        <Notices />
      </div>
    </div>
  )
}

function StartFrame() {
  return (
    <>
      <div className="studio-top">
        <button className="quiet" onClick={() => useStudio.getState().close(true)} title="Back to your show (Esc)">
          ← Back to show
        </button>
        <span className="studio-brand">Fixture Studio</span>
      </div>
      <StudioStart />
    </>
  )
}

function Editor({ def }: { def: FixtureDef }) {
  const modeIndex = useStudio((s) => s.modeIndex)
  const rightTab = useStudio((s) => s.rightTab)
  const dirty = useStudio((s) => s.dirty)
  const past = useStudio((s) => s.past)
  const future = useStudio((s) => s.future)
  const origin = useStudio((s) => s.origin)
  const problems = useMemo(() => checkDef(def, modeIndex), [def, modeIndex])
  const st = useStudio.getState
  const missing = def.modes[modeIndex]?.channels.filter((c) => c.confidence === 'missing').length ?? 0
  const guessed = def.modes[modeIndex]?.channels.filter((c) => c.confidence === 'guessed').length ?? 0
  const errors = problems.filter((p) => p.level === 'error').length
  const [exporting, setExporting] = useState(false)
  const exportRef = useDismiss<HTMLDivElement>(exporting, useCallback(() => setExporting(false), []))
  const [addCount, setAddCount] = useState<number | null>(null)

  const tabs: Array<[RightTab, string, string]> = [
    ['channel', 'Channel', 'What the picked channel does, its part and its value ranges'],
    ['look', 'Look', 'Kind, shape, size, cells, beam and a photo'],
    ['tests', 'Tests', 'Ready-made tests for this kind of light'],
    ['problems', `Problems${problems.length ? ` (${problems.length})` : ''}`, 'What was read and what still needs fixing'],
    ['learn', 'How it works', 'How this kind of light works, with its channels']
  ]

  const exportAs = async (kind: 'studio' | 'ofl') => {
    setExporting(false)
    if (!window.api) return
    const path =
      kind === 'studio'
        ? await window.api.saveFile(fileNameFor(def, '.svfixture'), [{ name: 'Sound Visualizer fixture', extensions: ['svfixture'] }], writeStudioFile(def))
        : await window.api.saveFile(fileNameFor(def, '.json'), [{ name: 'Open Fixture Library fixture', extensions: ['json'] }], JSON.stringify(defToOfl(def), null, 2))
    if (path) notify('info', kind === 'studio' ? 'Saved. Send this file to anyone with the app: they open it with File ▸ Import Fixture File or by dropping it on Fixture Studio.' : 'Saved as an Open Fixture Library file: QLC+ and other apps can use it, and it can be shared at open-fixture-library.org/import.')
  }

  return (
    <>
      <div className="studio-top">
        <button className="quiet" onClick={() => st().close()} title="Back to your show (Esc)">
          ← Back to show
        </button>
        <input className="name-input maker" value={def.manufacturer} onChange={(e) => st().edit((d) => ({ ...d, manufacturer: e.target.value }))} title="Maker" />
        <input className="name-input" value={def.name} onChange={(e) => st().edit((d) => ({ ...d, name: e.target.value }))} title="Model" />
        <Modes def={def} />
        <span className="spacer" />
        <button className={`status-chip ${errors ? 'st-bad' : missing || guessed ? 'st-warn' : 'st-good'}`} onClick={() => st().setRightTab('problems')} title="What still needs checking">
          {errors ? `${errors} to fix` : missing ? `${missing} missing` : guessed ? `${guessed} to check` : 'All good'}
        </button>
        <button className="quiet" disabled={!past.length} onClick={() => st().undo()} title="Undo (⌘Z)">
          Undo
        </button>
        <button className="quiet" disabled={!future.length} onClick={() => st().redo()} title="Redo (⇧⌘Z)">
          Redo
        </button>
        {origin && origin.typeIds.length > 0 && (
          <button className="quiet" onClick={() => st().backToOriginal()} title="Use the fixture as it was before (your edit stays in My Fixtures)">
            Back to the original
          </button>
        )}
        <div className="menu-anchor" ref={exportRef}>
          <button className="quiet" onClick={() => setExporting(!exporting)}>
            Export ▾
          </button>
          {exporting && (
            <div className="dropdown-menu studio-menu">
              <button onClick={() => void exportAs('studio')}>Sound Visualizer fixture (.svfixture)…</button>
              <button onClick={() => void exportAs('ofl')}>Open Fixture Library (.json)…</button>
              <button onClick={() => (window.open('https://open-fixture-library.org/import', '_blank'), setExporting(false))}>Share with the Open Fixture Library ↗</button>
            </div>
          )}
        </div>
        {addCount === null ? (
          <button onClick={() => setAddCount(1)} title="Save it and add it to the show">
            Save & add to show
          </button>
        ) : (
          <span className="inline-ask">
            Add
            <input type="number" min={1} max={64} value={addCount} autoFocus onChange={(e) => setAddCount(Math.max(1, Math.min(64, Number(e.target.value))))} />
            <button className="primary" onClick={() => void st().save({ addToShow: addCount }).then((ok) => ok && (setAddCount(null), st().close(true)))}>
              Save & add
            </button>
            <button className="quiet" onClick={() => setAddCount(null)}>
              Cancel
            </button>
          </span>
        )}
        <button className="primary" onClick={() => void st().save()} title="Save to My Fixtures (and update the show if it uses this fixture)">
          {dirty ? 'Save' : 'Saved'}
        </button>
      </div>
      <div className="studio-body">
        <aside className="studio-left">
          <Schematic def={def} />
          <ChannelList def={def} />
        </aside>
        <main className="studio-center">
          <TwinView />
          {def.look.photo && <img className="twin-photo" src={def.look.photo} alt="The real light" title="Your photo of the real light, to compare" />}
        </main>
        <aside className="studio-right">
          <div className="tabs studio-tabs">
            {tabs.map(([id, label, title]) => (
              <button key={id} className={`tab ${rightTab === id ? 'active' : ''}`} onClick={() => st().setRightTab(id)} title={title}>
                {label}
              </button>
            ))}
          </div>
          <div className="studio-right-body">
            {rightTab === 'channel' && <ChannelPanel def={def} />}
            {rightTab === 'look' && <LookPanel def={def} />}
            {rightTab === 'tests' && <TestsPanel def={def} />}
            {rightTab === 'problems' && <ProblemsPanel def={def} />}
            {rightTab === 'learn' && <LearnPanel def={def} />}
          </div>
        </aside>
      </div>
    </>
  )
}

function Modes({ def }: { def: FixtureDef }) {
  const modeIndex = useStudio((s) => s.modeIndex)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [menu, setMenu] = useState(false)
  const menuRef = useDismiss<HTMLDivElement>(menu, useCallback(() => setMenu(false), []))
  const st = useStudio.getState
  return (
    <div className="modes" title="The light's DMX modes: pick the one the light is set to">
      {def.modes.map((m, i) =>
        renaming === i ? (
          <input
            key={m.id}
            className="mode-input"
            autoFocus
            defaultValue={m.name}
            onBlur={(e) => (st().edit((d) => ({ ...d, modes: d.modes.map((x, k) => (k === i ? { ...x, name: e.target.value || x.name } : x)) })), setRenaming(null))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button key={m.id} className={`mode ${i === modeIndex ? 'active' : ''}`} onClick={() => st().setMode(i)} onDoubleClick={() => setRenaming(i)} title={`${m.channels.length} channels. Double-click to rename.`}>
            {m.name}
          </button>
        )
      )}
      <div className="menu-anchor" ref={menuRef}>
        <button className="mode add" onClick={() => setMenu(!menu)} title="Add or remove a mode">
          +
        </button>
        {menu && (
          <div className="dropdown-menu studio-menu">
            <button
              onClick={() => {
                const src = def.modes[modeIndex]
                st().edit((d) => ({ ...d, modes: [...d.modes, { id: newKey('m'), name: `${src?.name ?? 'Mode'} copy`, channels: (src?.channels ?? []).map((c) => ({ ...c, id: newKey('c') })) }] }))
                st().setMode(def.modes.length)
                setMenu(false)
              }}
            >
              Copy this mode
            </button>
            <button
              onClick={() => {
                st().edit((d) => ({ ...d, modes: [...d.modes, { id: newKey('m'), name: 'New mode', channels: [] }] }))
                st().setMode(def.modes.length)
                setMenu(false)
              }}
            >
              Empty mode
            </button>
            <button
              disabled={def.modes.length < 2}
              onClick={() => {
                const id = def.modes[modeIndex].id
                st().edit((d) => ({ ...d, modes: d.modes.filter((m) => m.id !== id) }))
                st().setMode(Math.max(0, modeIndex - 1))
                setMenu(false)
              }}
            >
              Remove this mode
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
