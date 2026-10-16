import { MenuItem, MenuShell } from './Menu'
import { LearnMenu } from './Tour'
import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useViewSettings } from '../state/viewSettings'
import { dmxBus } from '../state/dmxBus'
import { runCommand } from '../state/menuCommands'
import { useWizards } from '../state/wizards'
import { followSoundSwitch } from '../state/commands'
import { TEMPLATES } from '../state/shows'
import { saveDocument, useDocument } from '../state/document'
import type { ArtNetStatus } from '../../../shared/ipc'
import { useSoundSwitch } from '../state/soundswitchLink'

export function Toolbar({ artNet }: { artNet: ArtNetStatus | null }) {
  const past = useStore((s) => s.past)
  const future = useStore((s) => s.future)
  const selection = useStore((s) => s.selection)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const haze = useViewSettings((s) => s.haze)
  const setHaze = useViewSettings((s) => s.setHaze)
  const leftTab = useViewSettings((s) => s.leftTab)
  const setLeftTab = useViewSettings((s) => s.setLeftTab)
  const builder = useViewSettings((s) => s.builder)

  return (
    <header className="toolbar">
      <div className="brand">Sound Visualizer</div>
      <div className="group">
        <button
          data-tour="add-fixtures"
          className={leftTab === 'library' ? 'primary' : ''}
          onClick={() => setLeftTab(leftTab === 'library' ? 'fixtures' : 'library')}
          title="Add fixtures: browse the library of real lights and add them to the show (⌘L)"
        >
          <span className="ic">＋</span>
          <span className="lbl"> Add fixtures</span>
        </button>
        <button disabled={selection.length === 0} onClick={() => runCommand('duplicate')} title="Duplicate the selection. Copies share the original's DMX patch, so they mirror it (⌘D)">
          <span className="ic">⧉</span>
          <span className="lbl"> Duplicate</span>
        </button>
        <button disabled={selection.length === 0} onClick={() => runCommand('delete')} title="Delete the selection (⌫). Undo brings it back">
          <span className="ic">⌫</span>
          <span className="lbl"> Delete</span>
        </button>
      </div>
      <div className="group">
        <button data-tour="build" className={builder ? 'primary' : ''} onClick={() => runCommand('builder')} title="Build show: describe a show in your own words and have it built and patched for you (⌘K)">
          <span className="ic">✦</span>
          <span className="lbl"> Build show</span>
        </button>
        <ShowsMenu />
      </div>
      <div className="group" data-tour="undo">
        <button disabled={!past.length} onClick={undo} title={past.at(-1) ? `Undo: ${past.at(-1)!.label} (⌘Z)` : 'Nothing to undo'}>
          <span className="ic">↶</span>
          <span className="lbl"> Undo</span>
        </button>
        <button disabled={!future.length} onClick={redo} title={future[0] ? `Redo: ${future[0].label} (⇧⌘Z)` : 'Nothing to redo'}>
          <span className="ic">↷</span>
          <span className="lbl"> Redo</span>
        </button>
      </div>
      <label className="group haze" data-tour="haze" title="Haze: how much the beams show in the air">
        <span className="lbl">Haze</span>
        <input type="range" min={0} max={1} step={0.01} value={haze} onChange={(e) => setHaze(Number(e.target.value))} aria-label="Haze" />
      </label>
      <div className="spacer" />
      <SoundSwitchIndicator />
      <ArtNetIndicator status={artNet} />
      <LearnMenu />
      <SaveButton />
    </header>
  )
}

/** Templates, importing and exporting shows (also in the File menu). */
function ShowsMenu() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const close = () => setAt(null)
  const run = (command: string) => () => {
    close()
    runCommand(command)
  }
  return (
    <>
      <button
        data-tour="shows"
        className={at ? 'on' : ''}
        onClick={(e) => {
          if (at) return close()
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: r.left, y: r.bottom + 4 })
        }}
        title="Start from a ready-made show, import or export"
      >
        Shows ▾
      </button>
      {at && (
        // Floats over the whole window: the toolbar would cut it off.
        <MenuShell at={at} onClose={close}>
          <MenuItem label="New show… (from SoundSwitch, scratch or the demo)" onClick={run('new')} />
          <MenuItem label="Describe a show… (✦ Build show)" onClick={run('builder')} />
          <hr />
          <div className="menu-title">Start from</div>
          {TEMPLATES.map((t) => (
            <MenuItem key={t.id} label={t.name} title={t.description} onClick={run(`template:${t.id}`)} />
          ))}
          {window.api && (
            <>
              <hr />
              <MenuItem label="Import show into this one…" onClick={run('importShow')} />
              <MenuItem label="Open MVR…" onClick={run('openMvr')} />
              <MenuItem label="Export MVR (for other lighting software)…" onClick={run('exportMvr')} />
              <MenuItem label="Export patch list (CSV)…" onClick={run('exportCsv')} />
            </>
          )}
        </MenuShell>
      )}
    </>
  )
}

/** Save, with a dot while there are unsaved changes. Hover shows the file. */
function SaveButton() {
  const path = useDocument((s) => s.path)
  const saved = useDocument((s) => s.saved)
  const project = useStore((s) => s.project)
  if (!window.api) return null
  const edited = saved !== project
  return (
    <button data-tour="save" onClick={() => void saveDocument(false)} title={path ? `Save (⌘S): ${path}${edited ? '\nUnsaved changes' : '\nAll changes saved'}` : 'Save the show to a file (⌘S): the show, its objects and fixture types in one file'}>
      {edited ? '● ' : ''}Save
    </button>
  )
}

/** Shows whether Art-Net is being received. Polls twice a second instead of re-rendering per packet. */
function ArtNetIndicator({ status }: { status: ArtNetStatus | null }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  let text = 'Art-Net: browser only'
  let short = 'Art-Net'
  let tone = 'off'
  let help = 'Live lighting data (Art-Net) only arrives in the Mac app.'
  if (status?.error) {
    text = `Art-Net error: ${status.error}`
    short = 'Art-Net: error'
    tone = 'bad'
    help = 'Another program may be using port 6454 (another visualizer). Close it and restart this app.'
  } else if (status?.listening) {
    const active = dmxBus.artNetActive()
    const sender = dmxBus.artNetSenders().at(-1)
    const shift = dmxBus.universeOffset()
    text = active && sender
      ? `Art-Net: receiving from ${sender.address}, Art-Net universe ${sender.universes.join(', ')}${shift ? ` (shifted ${shift > 0 ? '-' : '+'}${Math.abs(shift)} to match)` : ''}`
      : `Art-Net: listening on ${status.address}`
    short = active ? 'Art-Net: live' : 'Art-Net: waiting'
    tone = active ? 'good' : 'idle'
    help = active
      ? 'Lighting data is arriving: the rig is following the show.'
      : 'Waiting for lighting data. In SoundSwitch: Preferences ▸ Hardware ▸ DMX & Art-Net, tick Enable Art-Net and Localhost Art-Net Node, and select Sound Visualizer.'
  }
  return (
    <div className={`status ${tone}`} data-tour="artnet" title={`${text}\n${help}`}>
      <span className="full">{text}</span>
      <span className="short">{short}</span>
    </div>
  )
}

/**
 * SoundSwitch in one pill: what it has open and whether this show follows it.
 * Click for the rest (sync automatically, sync now, find, choose, follow, new show),
 * so the toolbar stays tidy at any window size.
 */
function SoundSwitchIndicator() {
  const status = useSoundSwitch((s) => s.status)
  const autoSync = useSoundSwitch((s) => s.autoSync)
  const setAutoSync = useSoundSwitch((s) => s.setAutoSync)
  const syncNow = useSoundSwitch((s) => s.syncNow)
  const link = useStore((s) => s.project.soundswitch)
  const inShow = useStore((s) => s.project.fixtures.filter((f) => f.soundswitchKey).length)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  if (!window.api) return null
  const close = () => setAt(null)
  const linked = status?.state === 'linked'
  // This show doesn't follow SoundSwitch, or follows a different project.
  const notUsed = linked && link && !link.link
  const other = linked && link?.link && link.profile && link.profile !== status.name ? link.profile : null

  let text = 'SoundSwitch: looking…'
  let short = 'SoundSwitch…'
  let tone = 'off'
  let about = 'Looking for the project SoundSwitch has open.'
  if (linked && other) {
    text = `Show follows “${other}” · SoundSwitch has “${status.name}”`
    short = 'SoundSwitch: other project'
    about = `This show follows the SoundSwitch project “${other}”. SoundSwitch has “${status.name}” open, so nothing is synced. Switch this show to “${status.name}”, or make a new show from it.`
  } else if (linked && notUsed) {
    text = `SoundSwitch: ${status.name} · not used by this show`
    short = 'SoundSwitch: not used'
    about = 'This show was made without SoundSwitch, so SoundSwitch patch changes are not brought in.'
  } else if (linked) {
    text = link?.include ? `SoundSwitch: ${status.name} · ${inShow} of ${status.fixtures.length} fixtures` : `SoundSwitch: ${status.name} · ${status.fixtures.length} fixtures`
    short = `SoundSwitch: ${status.fixtures.length}`
    tone = 'good'
    about = `${status.project}\nFound because it is ${status.how}.${status.hidden ? `\n${status.hidden} fixture(s) left out of the show.` : ''}`
  } else if (status?.state === 'not found') {
    text = 'SoundSwitch: no project found'
    short = 'SoundSwitch: none'
    about = 'Open a project in SoundSwitch, or choose one.'
  } else if (status?.state === 'error') {
    text = `SoundSwitch: ${status.error}`
    short = 'SoundSwitch: error'
    tone = 'bad'
    about = status.error ?? "Something went wrong reading the SoundSwitch project."
  }
  const run = (action: () => void) => () => (close(), action())
  return (
    <>
      <button
        data-tour="soundswitch"
        className={`status pill ${tone} ${at ? 'on' : ''}`}
        title={`${text}\n${about}\nClick for SoundSwitch options.`}
        onClick={(e) => {
          if (at) return close()
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: r.left, y: r.bottom + 4 })
        }}
      >
        <span className="full">{text}</span>
        <span className="short">{short}</span>
        <span className="caret"> ▾</span>
      </button>
      {at && (
        <MenuShell at={at} onClose={close}>
          <div className="menu-title wrap">{about}</div>
          {linked && !notUsed && !other && (
            <MenuItem
              label="Sync automatically"
              check={autoSync ? '✓' : ''}
              title="Keep this show's patch in step with SoundSwitch whenever it changes there"
              onClick={() => setAutoSync(!autoSync)}
            />
          )}
          {linked && !notUsed && !other && !autoSync && <MenuItem label="Sync now" title="Bring in SoundSwitch's patch changes once" onClick={run(syncNow)} />}
          {linked && other && (
            <MenuItem
              label={`Switch this show to “${status.name}”`}
              title={`This show follows “${status.name}” from now on: its fixtures replace the ones from “${other}”. Your trusses, stands and fixtures you added stay. Undo puts it back.`}
              onClick={run(() => followSoundSwitch(status.name, status.fixtures))}
            />
          )}
          {linked && other && (
            <MenuItem label={`New show from “${status.name}”…`} title={`Make a separate show from “${status.name}”, choosing its fixtures (save this one first if you want to keep it)`} onClick={run(() => useWizards.getState().openNewShow({ path: status.project, name: status.name }))} />
          )}
          {linked && notUsed && (
            <MenuItem label={`Follow “${status.name}”`} title="Bring this SoundSwitch project's fixtures into this show and follow its patch" onClick={run(() => followSoundSwitch(status.name, status.fixtures))} />
          )}
          <MenuItem label="New show from SoundSwitch…" title="Make a show from a SoundSwitch project, choosing its fixtures" onClick={run(() => useWizards.getState().openNewShow())} />
          <hr />
          <MenuItem label="Find the open project again" title="Look again for the project SoundSwitch has open" onClick={run(() => window.api?.refreshSoundSwitch())} />
          <MenuItem
            label="Open another SoundSwitch project…"
            title="Pick any SoundSwitch project (.ssproj folder) and make a show from it, choosing its fixtures"
            onClick={run(async () => {
              const path = await window.api?.browseSoundSwitchProfile()
              if (path) useWizards.getState().openNewShow({ path, name: path.split('/').pop()!.replace(/\.ssproj$/, '') })
            })}
          />
        </MenuShell>
      )}
    </>
  )
}
