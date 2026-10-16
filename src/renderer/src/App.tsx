/**
 * The window layout: toolbar on top, fixtures or the library on the left, the
 * 3D view in the middle, the inspector on the right, universe and faders below.
 * "Full view" hides everything but the 3D view.
 */
import { useEffect, useState } from 'react'
import { Viewport } from './three/Viewport'
import { Toolbar } from './ui/Toolbar'
import { FixtureList } from './ui/FixtureList'
import { LibraryPanel } from './ui/LibraryPanel'
import { ObjectsPanel } from './ui/ObjectsPanel'
import { NewShow } from './ui/NewShow'
import { Welcome } from './ui/Welcome'
import { FreshStartConfirm, useFirstLaunch, WelcomeBack } from './ui/FreshStart'
import { SwitchProjectDialog } from './ui/SwitchProject'
import { AboutDialog } from './ui/About'
import { BridgeHelp } from './ui/BridgeHelp'
import { ConnectCard } from './ui/ConnectCard'
import { ToursDialog, TourOverlay } from './ui/Tour'
import { Tooltips } from './ui/Tooltips'
import { PanelResizer, usePanelWidths } from './ui/PanelResizer'
import { Inspector } from './ui/Inspector'
import { DmxMap } from './ui/DmxMap'
import { Faders } from './ui/Faders'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { FixtureStudio } from './ui/studio/FixtureStudio'
import { useStudio } from './state/studio'
import { useStore } from './state/store'
import { dmxBus } from './state/dmxBus'
import { homeFixtures } from './state/demo'
import { useMix } from './state/mix'
import type { ArtNetStatus } from '../../shared/ipc'
import { useSoundSwitch } from './state/soundswitchLink'
import { useViewSettings } from './state/viewSettings'
import { commandForKey, runCommand } from './state/menuCommands'
import { loadDocument } from './state/document'
import { notify } from './state/notices'
import type { Project } from './model/project'

/** Commands the app menu already owns (with registered shortcuts) when running in Electron. */
const MENU_OWNED = new Set(['new', 'builder', 'save', 'saveAs', 'open', 'showLibrary', 'toggleFullView'])

export function App() {
  const [bottomTab, setBottomTab] = useState<'faders' | 'universe'>('faders')
  const [artNet, setArtNet] = useState<ArtNetStatus | null>(null)
  const fullView = useViewSettings((s) => s.fullView)
  const leftTab = useViewSettings((s) => s.leftTab)
  const [widths, setWidth, resetWidth] = usePanelWidths()
  const setLeftTab = useViewSettings((s) => s.setLeftTab)

  // Art-Net, SoundSwitch, menus and files arrive from the Electron main process.
  useEffect(() => {
    if (!window.api) return
    const offDmx = window.api.onDmx(({ universe, data, from }) => {
      // When a show starts arriving, drop the test faders so it starts from a clean slate.
      // A demo you started keeps playing: SoundSwitch sends Art-Net even when idle,
      // and stopping the demo on every packet made Play demo look broken.
      if (!dmxBus.artNetActive() && !useViewSettings.getState().demo) dmxBus.clearFaders()
      dmxBus.receiveArtNet(universe, data, from)
    })
    const offStatus = window.api.onArtNetStatus(setArtNet)
    const offSoundSwitch = window.api.onSoundSwitch((status) => useSoundSwitch.getState().receive(status))
    const offMenu = window.api.onMenu(runCommand)
    const offOpened = window.api.onProjectOpened(({ path, project }) => loadDocument(path, project as Project))
    const offNotice = window.api.onNotice((n) => notify(n.kind, n.text))
    window.api.requestArtNetStatus()
    window.api.refreshSoundSwitch()
    // Errors in the page end up in the log file too.
    const onError = (e: ErrorEvent) => window.api?.log('error', e.message, `${e.filename}:${e.lineno}`)
    window.addEventListener('error', onError)
    return () => {
      offDmx()
      offStatus()
      offSoundSwitch()
      offMenu()
      offOpened()
      offNotice()
      window.removeEventListener('error', onError)
    }
  }, [])

  // The first time the app opens: the welcome, then making a first show, then a tour.
  // After a reinstall or update: carry on, or start fresh as a new user.
  useFirstLaunch()

  // Point the moving heads down when fixtures appear, so nothing starts aimed at the ceiling.
  const project = useStore((s) => s.project)
  useEffect(() => homeFixtures(project), [project])

  // Keyboard shortcuts run the same commands as the menu and buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return
      // Fixture Studio has its own keys; only undo, redo and save reach it from here.
      if (useStudio.getState().open) {
        const command = commandForKey(e)
        if (command && (command === 'undo' || command === 'redo' || command === 'save') && !(window.api?.platform === 'desktop' && MENU_OWNED.has(command))) {
          e.preventDefault()
          runCommand(command)
        }
        return
      }
      const { selection, select } = useStore.getState()
      const key = e.key.toLowerCase()
      if (!e.metaKey && !e.ctrlKey && !e.altKey && selection.length && (key === 'm' || key === 's' || key === 'h')) {
        useMix.getState().toggle(key === 'm' ? 'muted' : key === 's' ? 'solo' : 'hidden', selection)
        return
      }
      if (key === 'escape') return select([])
      const command = commandForKey(e)
      if (!command || (window.api?.platform === 'desktop' && MENU_OWNED.has(command))) return
      e.preventDefault()
      runCommand(command)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app ${fullView ? 'full' : ''}`} style={{ '--left-w': `${widths.left}px`, '--right-w': `${widths.right}px` } as React.CSSProperties}>
      {!fullView && (
        <>
          <PanelResizer side="left" width={widths.left} onChange={(w) => setWidth('left', w)} onReset={() => resetWidth('left')} />
          <PanelResizer side="right" width={widths.right} onChange={(w) => setWidth('right', w)} onReset={() => resetWidth('right')} />
        </>
      )}
      <NewShow />
      <Welcome />
      <WelcomeBack />
      <FreshStartConfirm />
      <SwitchProjectDialog />
      <AboutDialog />
      {window.api?.platform === 'web' && <BridgeHelp />}
      {window.api?.platform === 'web' && !fullView && <ConnectCard />}
      <ToursDialog />
      <TourOverlay />
      <Tooltips />
      <FixtureStudio />
      <Toolbar artNet={artNet} />
      {!fullView && (
        <aside className="panel left">
          <div className="tabs" data-tour="left-tabs">
            <button data-tour="tab-fixtures" className={leftTab === 'fixtures' ? 'tab active' : 'tab'} onClick={() => setLeftTab('fixtures')} title="The lights in this show, with their DMX patch (⌘1)">
              Fixtures
            </button>
            <button data-tour="tab-library" className={leftTab === 'library' ? 'tab active' : 'tab'} onClick={() => setLeftTab('library')} title="Browse and add fixtures (Cmd+L)">
              Library
            </button>
            <button data-tour="tab-objects" className={leftTab === 'set' ? 'tab active' : 'tab'} onClick={() => setLeftTab('set')} title="Stands, truss, staging, speakers, furniture, walls and people">
              Objects
            </button>
          </div>
          <ErrorBoundary name={leftTab}>{leftTab === 'library' ? <LibraryPanel /> : leftTab === 'set' ? <ObjectsPanel /> : <FixtureList />}</ErrorBoundary>
        </aside>
      )}
      <main className="center" data-tour="viewport">
        <ErrorBoundary name="3D view">
          <Viewport />
        </ErrorBoundary>
      </main>
      {!fullView && (
        <aside className="panel right" data-tour="inspector">
          <ErrorBoundary name="inspector">
            <Inspector />
          </ErrorBoundary>
        </aside>
      )}
      {!fullView && (
        <section className="panel bottom" data-tour="bottom">
          <div className="tabs">
            <button data-tour="tab-faders" className={bottomTab === 'faders' ? 'tab active' : 'tab'} onClick={() => setBottomTab('faders')} title="Test faders for the selected fixture, and the demo">
              Faders
            </button>
            <button data-tour="tab-dmx" className={bottomTab === 'universe' ? 'tab active' : 'tab'} onClick={() => setBottomTab('universe')} title="Where every fixture sits across the DMX channels, like SoundSwitch's DMX map">
              DMX Map
            </button>
          </div>
          <ErrorBoundary name="bottom panel">{bottomTab === 'faders' ? <Faders /> : <DmxMap />}</ErrorBoundary>
        </section>
      )}
    </div>
  )
}
