/**
 * Menu items and keyboard shortcuts both end up here, so every command has one
 * implementation however you trigger it.
 */
import { useStore } from './store'
import { useViewSettings } from './viewSettings'
import { deleteChannels, useStudio } from './studio'
import { readFixtureFile } from '../model/fixtureFiles'
import { useLibrary } from './library'
import { notify } from './notices'
import { deleteFixtures, deleteStructures, duplicateFixtures, duplicateStructures, toggleLocked } from './commands'
import { usePrefs } from './prefs'
import { openDocument, saveDocument } from './document'
import { view } from './viewBus'
import { useWizards } from './wizards'
import { useTour } from './tours'
import { saveViewImage } from '../ui/ViewToolbar'
import { exportCsv, exportMvr, importShowInto, openMvr, startFromTemplate } from './shows'

export function runCommand(command: string): void {
  // While Fixture Studio is open, undo, redo, save and delete work on the fixture.
  const studio = useStudio.getState()
  if (studio.open && studio.screen === 'edit') {
    if (command === 'undo') return studio.undo()
    if (command === 'redo') return studio.redo()
    if (command === 'save' || command === 'saveAs') return void studio.save()
    if (command === 'delete') return deleteChannels(studio.selected)
    if (command === 'selectAll') return studio.select(studio.def?.modes[studio.modeIndex]?.channels.map((c) => c.id) ?? [])
  }
  if (command === 'newFixture') return studio.start()
  const { undo, redo, select, selection, project } = useStore.getState()
  const settings = useViewSettings.getState()
  if (command.startsWith('template:')) return void startFromTemplate(command.slice('template:'.length))
  if (command.startsWith('tour:')) return useTour.getState().start(command.slice('tour:'.length))
  const prefs = usePrefs.getState()
  const plan = prefs.view === 'plan'
  switch (command) {
    case 'toggleLock':
      return toggleLocked(selection)
    case 'togglePlan':
      return prefs.setView(plan ? '3d' : 'plan')
    case 'view3d':
      return prefs.setView('3d')
    case 'viewPlan':
      return prefs.setView('plan')
    case 'toggleGrid':
      return prefs.setGrid(!prefs.grid)
    case 'toggleSnap':
      return prefs.setSnap(!prefs.snap)
    case 'unitsMetric':
      return prefs.setUnits('metric')
    case 'unitsImperial':
      return prefs.setUnits('imperial')
    case 'builder':
      settings.setFullView(false)
      return settings.setBuilder(!settings.builder)
    case 'importShow':
      return void importShowInto()
    case 'openMvr':
      return void openMvr()
    case 'exportMvr':
      return void exportMvr()
    case 'exportCsv':
      return void exportCsv()
    case 'new':
      return useWizards.getState().openNewShow()
    case 'welcome':
      return useWizards.getState().openWelcome()
    case 'tours':
      return useWizards.getState().setToursList(true)
    case 'freshStart':
      return useWizards.getState().askFreshStart()
    case 'about':
      return useWizards.getState().setAbout(true)
    case 'open':
      return void openDocument()
    case 'save':
      return void saveDocument(false)
    case 'saveAs':
      return void saveDocument(true)
    case 'importFixtures':
      return void importFixtureFile()
    case 'saveImage':
      return void saveViewImage()
    case 'undo':
      return undo()
    case 'redo':
      return redo()
    case 'selectAll':
      return select(project.fixtures.map((f) => f.id))
    case 'duplicate': {
      const pieces = (useStore.getState().project.structures ?? []).filter((s) => selection.includes(s.id)).map((s) => s.id)
      if (pieces.length) duplicateStructures(pieces)
      else duplicateFixtures(selection)
      return
    }
    case 'delete': {
      const pieces = (useStore.getState().project.structures ?? []).filter((s) => selection.includes(s.id)).map((s) => s.id)
      const fixtures = selection.filter((id) => !pieces.includes(id))
      if (fixtures.length) deleteFixtures(fixtures)
      if (pieces.length) deleteStructures(pieces)
      return
    }
    // In the Plan, the view keys pick its side; Perspective goes back to 3D.
    case 'viewPerspective':
      if (plan) prefs.setView('3d')
      return view.preset('perspective')
    case 'viewTop':
      return plan ? prefs.setPlanSide('top') : view.preset('top')
    case 'viewFront':
      return plan ? prefs.setPlanSide('front') : view.preset('front')
    case 'viewLeft':
      return plan ? prefs.setPlanSide('side') : view.preset('left')
    case 'viewRight':
      return plan ? prefs.setPlanSide('side') : view.preset('right')
    case 'viewUp':
      return view.preset('up')
    case 'toolSelect':
      return settings.setTool('select')
    case 'toolMove':
      return settings.setTool('move')
    case 'toolOrbit':
      return settings.setTool('orbit')
    case 'focusSelection':
      if (plan) return void window.dispatchEvent(new CustomEvent('plan:focus', { detail: selection.length ? selection : 'all' }))
      return view.focus(selection.length ? selection : 'all')
    case 'focusAll':
      if (plan) return void window.dispatchEvent(new CustomEvent('plan:focus', { detail: 'all' }))
      return view.focus('all')
    case 'toggleFullView':
      return settings.setFullView(!settings.fullView)
    case 'showLibrary':
      settings.setFullView(false)
      return settings.setLeftTab('library')
    case 'showFixtures':
      settings.setFullView(false)
      return settings.setLeftTab('fixtures')
  }
}

/** Keyboard shortcuts for the page. Text fields keep their keys. */
export function commandForKey(e: KeyboardEvent): string | null {
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  if (mod && key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (mod && key === 'y') return 'redo'
  if (mod && key === 'a') return 'selectAll'
  if (mod && key === 'd') return 'duplicate'
  if (mod && key === 's') return e.shiftKey ? 'saveAs' : 'save'
  if (mod && key === 'o') return 'open'
  if (mod && e.shiftKey && key === 'l') return 'toggleLock'
  if (mod && key === 'l') return 'showLibrary'
  if (mod && key === 'k') return 'builder'
  if (mod && key === 'n') return 'new'
  if (mod && e.shiftKey && key === 'f') return 'toggleFullView'
  if (mod) return null
  if (e.key === 'Delete' || e.key === 'Backspace') return 'delete'
  if (key === 'f') return e.shiftKey ? 'focusAll' : 'focusSelection'
  if (key === 'v') return 'toolSelect'
  if (key === 'w') return 'toolMove'
  if (key === 'o') return 'toolOrbit'
  if (key === 'p' && !e.shiftKey) return 'togglePlan'
  if (key === 'g' && !e.shiftKey) return 'toggleSnap'
  // Views are Shift+1 to Shift+6, so typing a number never moves the camera.
  // (e.code, not e.key: with Shift, "1" arrives as "!" on most keyboards.)
  if (!e.shiftKey || e.altKey) return null
  return ({ Digit1: 'viewPerspective', Digit2: 'viewTop', Digit3: 'viewFront', Digit4: 'viewLeft', Digit5: 'viewRight', Digit6: 'viewUp' } as Record<string, string>)[e.code] ?? null
}

/** File ▸ Import Fixture File: any fixture file opens in Fixture Studio, with a report of what was read. */
async function importFixtureFile(): Promise<void> {
  if (!window.api) return
  const file = await window.api.openFile([{ name: 'Fixture files', extensions: ['gdtf', 'json', 'qxf', 'svfixture'] }])
  if (!file) return
  try {
    const { def, report } = readFixtureFile(file.name, file.bytes)
    // A corrected version of a fixture you already saved replaces it (same maker and name),
    // rather than piling up a second copy next to the old one.
    await useLibrary.getState().loadMine()
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
    const old = useLibrary.getState().mine.find((m) => m.id !== def.id && same(m.name, def.name) && same(m.manufacturer, def.manufacturer))
    if (old) {
      def.id = old.id
      def.revision = old.revision
      def.history = old.history
      // Keep the old modes' ids where the modes match (by name, else by channel count), so fixtures already in the show pick up the new version.
      const taken = new Set<string>()
      def.modes = def.modes.map((m) => {
        const match = old.modes.find((o) => !taken.has(o.id) && same(o.name, m.name)) ?? old.modes.find((o) => !taken.has(o.id) && o.channels.length === m.channels.length)
        if (!match) return m
        taken.add(match.id)
        return { ...m, id: match.id }
      })
      report.push(`You already have “${old.manufacturer} ${old.name}” in My Fixtures (version ${old.revision}). Saving replaces it, and updates the copies in your show.`)
    }
    useStudio.getState().openDef(def, report)
  } catch (error) {
    notify('error', `${file.name}: ${(error as Error).message}`)
  }
}
