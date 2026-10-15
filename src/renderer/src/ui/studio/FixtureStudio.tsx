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
import { newKey, type ChannelDef, type FixtureDef, type PartDef } from '../../model/fixtureDef'
import { modeFromStart, startsFor } from '../../model/fixtureStarts'
import { AskClaude } from './ClaudeBox'
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
        <button className="quiet" onClick={() => useStudio.getState().close(true)} title="Close Fixture Studio and go back to your show (Esc)">
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
        <LeaveButton />
        <input className="name-input maker" value={def.manufacturer} onChange={(e) => st().edit((d) => ({ ...d, manufacturer: e.target.value }))} title="Maker (click to change)" placeholder="Maker" />
        <input className="name-input" value={def.name} onChange={(e) => st().edit((d) => ({ ...d, name: e.target.value }))} title="Model name (click to change)" placeholder="Model" />
        <ModePicker def={def} />
        <AskClaude />
        <span className="spacer" />
        <button className={`status-chip ${errors ? 'st-bad' : missing || guessed ? 'st-warn' : 'st-good'}`} onClick={() => st().setRightTab('problems')} title="How ready the fixture is: red = channels missing or broken, amber = guessed channels worth a test. Click for the list.">
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
          <button className="quiet" onClick={() => setExporting(!exporting)} title="Save a file to share: with another copy of this app, or with other lighting software">
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
          <button onClick={() => setAddCount(1)} title="Save it to My Fixtures and put some in your show">
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

/** Leaving the fixture: to the Studio's start (another fixture) or back to the show; asks first if there are unsaved changes. */
function LeaveButton() {
  const dirty = useStudio((s) => s.dirty)
  const [asking, setAsking] = useState<'home' | 'show' | null>(null)
  const ref = useDismiss<HTMLDivElement>(asking !== null, useCallback(() => setAsking(null), []))
  const st = useStudio.getState
  const go = (where: 'home' | 'show') => (where === 'home' ? st().home() : st().close(true))
  const leave = (where: 'home' | 'show') => (dirty ? setAsking(where) : go(where))
  return (
    <div className="menu-anchor leave" ref={ref}>
      <button className="quiet" onClick={() => leave('home')} title="Back to the Fixture Studio start: make or open another fixture">
        ← Fixtures
      </button>
      <button className="quiet" onClick={() => leave('show')} title="Close Fixture Studio and go back to your show (Esc)">
        Back to show
      </button>
      {asking && (
        <div className="dropdown-menu studio-menu leave-menu">
          <div className="menu-note">This fixture has changes that aren't saved.</div>
          <button onClick={() => void st().save().then((ok) => ok && (setAsking(null), go(asking)))}>Save, then leave</button>
          <button className="danger" onClick={() => (setAsking(null), go(asking))}>
            Leave without saving
          </button>
          <button onClick={() => setAsking(null)}>Keep editing</button>
        </div>
      )}
    </div>
  )
}

/**
 * The light's DMX mode. Most lights can be set (on their own menu or display) to
 * use more or fewer channels: 3 channels for one colour, 24 for every cell. Each
 * mode here is its own channel list; pick the one your light is set to.
 */
function ModePicker({ def }: { def: FixtureDef }) {
  const modeIndex = useStudio((s) => s.modeIndex)
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [layouts, setLayouts] = useState(false)
  const menuRef = useDismiss<HTMLDivElement>(menu, useCallback(() => (setMenu(false), setLayouts(false)), []))
  const st = useStudio.getState
  const mode = def.modes[modeIndex]
  const close = () => (setMenu(false), setLayouts(false))
  const addMode = (channels: ChannelDef[], name: string, parts: PartDef[] = []) => {
    st().edit((d) => ({ ...d, parts: [...d.parts, ...parts], modes: [...d.modes, { id: newKey('m'), name, channels }] }))
    st().setMode(def.modes.length)
    close()
  }
  const tip = 'The DMX mode the light is set to (on its own menu or display). Lights often have several: e.g. 3 channels for one colour, 24 for every cell. Each mode has its own channel list.'
  return (
    <div className="menu-anchor mode-picker" ref={menuRef}>
      {renaming && mode ? (
        <input
          className="mode-input"
          autoFocus
          defaultValue={mode.name}
          onBlur={(e) => (st().edit((d) => ({ ...d, modes: d.modes.map((x, k) => (k === modeIndex ? { ...x, name: e.target.value || x.name } : x)) })), setRenaming(false))}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <button className="mode-button" onClick={() => setMenu(!menu)} title={tip}>
          <span className="mode-label">DMX mode</span>
          <span className="mode-name">{mode ? mode.name : 'None'}</span>
          {mode && !/\d+\s*-?\s*ch/i.test(mode.name) && <span className="mode-count">{mode.channels.length} ch</span>}
          {def.modes.length > 1 && <span className="mode-count">{modeIndex + 1} of {def.modes.length}</span>}
          <span className="caret-down">▾</span>
        </button>
      )}
      {menu && (
        <div className="dropdown-menu studio-menu mode-menu">
          <div className="menu-note">{tip}</div>
          {def.modes.map((m, i) => (
            <button key={m.id} className={i === modeIndex ? 'current' : ''} onClick={() => (st().setMode(i), close())}>
              <span className="check-mark">{i === modeIndex ? '✓' : ''}</span>
              {m.name}
              <span className="sub">{m.channels.length} channels</span>
            </button>
          ))}
          <div className="menu-sep" />
          <button onClick={() => (setRenaming(true), close())} disabled={!mode}>
            Rename this mode…
          </button>
          <button onClick={() => mode && addMode(mode.channels.map((c) => ({ ...c, id: newKey('c') })), `${mode.name} copy`)} disabled={!mode} title="A copy of this mode to change: for a mode that's nearly the same">
            Add a copy of this mode
          </button>
          <button onClick={() => setLayouts(!layouts)} title="Another mode of this light, from the usual layouts for its kind (e.g. the 3-channel mode of a bar)">
            Add a mode from a usual layout {layouts ? '▴' : '▸'}
          </button>
          {layouts && (
            <div className="mode-layouts">
              {startsFor(def.kind).map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => {
                    const r = modeFromStart(def, sp.build(def.name, def.manufacturer))
                    addMode(r.channels, `${r.channels.length}-channel`, r.parts)
                  }}
                >
                  <span className="sp-count">{sp.count}</span> {sp.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => addMode([], 'New mode')} title="An empty mode: add its channels with + Add">
            Add an empty mode
          </button>
          <button
            className="danger"
            disabled={def.modes.length < 2}
            onClick={() => {
              const id = def.modes[modeIndex].id
              st().edit((d) => ({ ...d, modes: d.modes.filter((m) => m.id !== id) }))
              st().setMode(Math.max(0, modeIndex - 1))
              close()
            }}
            title={def.modes.length < 2 ? 'A fixture needs at least one mode' : 'Remove this mode (Undo brings it back)'}
          >
            Remove this mode
          </button>
        </div>
      )}
    </div>
  )
}
