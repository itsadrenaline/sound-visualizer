/**
 * The app menu. Each item sends a command name to the page, which runs the same
 * command as the matching button or shortcut (see renderer/src/state/menuCommands.ts).
 *
 * Shortcuts that would get in the way of typing (single keys, Cmd+Z, Cmd+A) are
 * only shown here; the page handles them itself and ignores them in text fields.
 */
import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { logFolder } from './log'

export type MenuCommand =
  | 'new' | 'newFixture' | 'open' | 'save' | 'saveAs' | 'importFixtures' | 'saveImage'
  | 'undo' | 'redo' | 'selectAll' | 'duplicate' | 'delete'
  | 'viewPerspective' | 'viewTop' | 'viewFront' | 'viewLeft' | 'viewRight' | 'viewUp' | 'focusSelection' | 'focusAll' | 'toggleFullView'
  | 'showLibrary' | 'showFixtures' | 'toolSelect' | 'toolMove' | 'toolOrbit'
  | 'welcome' | 'builder' | 'importShow' | 'openMvr' | 'exportMvr' | 'exportCsv' | `template:${string}`
  | 'freshStart' | 'tours' | `tour:${string}` | 'about'
  | 'recordVideo' | 'toggleLock' | 'view3d' | 'togglePlan' | 'toggleGrid' | 'toggleSnap' | 'unitsMetric' | 'unitsImperial'

export function buildMenu(getWindow: () => BrowserWindow | null): void {
  const send = (command: MenuCommand) => () => getWindow()?.webContents.send('menu', command)
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    // The app menu, with About opening the app's own About box (version, build, system: what support needs).
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: `About ${app.name}`, click: send('about') },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Show…', accelerator: 'CmdOrCtrl+N', click: send('new') },
        {
          label: 'New from Template',
          submenu: [
            { label: 'Mobile DJ', click: send('template:mobile') },
            { label: 'Club Stage', click: send('template:club') },
            { label: 'Wedding / Event', click: send('template:wedding') },
            { label: 'Empty Room', click: send('template:empty') }
          ]
        },
        { label: 'Describe a Show…', accelerator: 'CmdOrCtrl+K', click: send('builder') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        ...(isMac ? [{ role: 'recentDocuments' as const, submenu: [{ role: 'clearRecentDocuments' as const }] }] : []),
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: 'Save As…', accelerator: 'Shift+CmdOrCtrl+S', click: send('saveAs') },
        { type: 'separator' },
        { label: 'Import Show into This One…', click: send('importShow') },
        { label: 'Open MVR…', click: send('openMvr') },
        {
          label: 'Export',
          submenu: [
            { label: 'MVR (for other lighting software)…', click: send('exportMvr') },
            { label: 'Patch List (CSV)…', click: send('exportCsv') }
          ]
        },
        { type: 'separator' },
        { label: 'New Fixture…', accelerator: 'Shift+CmdOrCtrl+N', click: send('newFixture') },
        { label: 'Import Fixture File…', click: send('importFixtures') },
        { label: 'Save View as Image…', accelerator: 'Shift+CmdOrCtrl+E', click: send('saveImage') },
        { label: 'Record Video of the Show (again to stop)', accelerator: 'Shift+CmdOrCtrl+R', click: send('recordVideo') },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        // Undo/redo go to the project; text fields still get their own through the shortcuts.
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: send('undo') },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', registerAccelerator: false, click: send('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { label: 'Select All Fixtures', accelerator: 'CmdOrCtrl+A', registerAccelerator: false, click: send('selectAll') },
        { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', registerAccelerator: false, click: send('duplicate') },
        { label: 'Lock / Unlock', accelerator: 'Shift+CmdOrCtrl+L', registerAccelerator: false, click: send('toggleLock') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: '3D View', click: send('view3d') },
        { label: 'Plan View (3D ↔ Plan)', accelerator: 'P', registerAccelerator: false, click: send('togglePlan') },
        { type: 'separator' },
        { label: 'Show Grid', click: send('toggleGrid') },
        { label: 'Snap to Grid', accelerator: 'G', registerAccelerator: false, click: send('toggleSnap') },
        {
          label: 'Units',
          submenu: [
            { label: 'Metric (m, mm)', click: send('unitsMetric') },
            { label: 'Imperial (ft, in)', click: send('unitsImperial') }
          ]
        },
        { type: 'separator' },
        { label: 'Select Tool', accelerator: 'V', registerAccelerator: false, click: send('toolSelect') },
        { label: 'Move Tool', accelerator: 'W', registerAccelerator: false, click: send('toolMove') },
        { label: 'Orbit Tool (or hold Space)', accelerator: 'O', registerAccelerator: false, click: send('toolOrbit') },
        { type: 'separator' },
        { label: 'Perspective', accelerator: 'Shift+1', registerAccelerator: false, click: send('viewPerspective') },
        { label: 'Top', accelerator: 'Shift+2', registerAccelerator: false, click: send('viewTop') },
        { label: 'Front', accelerator: 'Shift+3', registerAccelerator: false, click: send('viewFront') },
        { label: 'Left', accelerator: 'Shift+4', registerAccelerator: false, click: send('viewLeft') },
        { label: 'Right', accelerator: 'Shift+5', registerAccelerator: false, click: send('viewRight') },
        { label: 'Up (ceiling)', accelerator: 'Shift+6', registerAccelerator: false, click: send('viewUp') },
        { type: 'separator' },
        { label: 'Focus Selection', accelerator: 'F', registerAccelerator: false, click: send('focusSelection') },
        { label: 'Show Everything', accelerator: 'Shift+F', registerAccelerator: false, click: send('focusAll') },
        { label: 'Full View (hide panels)', accelerator: 'CmdOrCtrl+Shift+F', click: send('toggleFullView') },
        { type: 'separator' },
        { label: 'Fixture Library', accelerator: 'CmdOrCtrl+L', click: send('showLibrary') },
        { label: 'Fixtures', accelerator: 'CmdOrCtrl+1', click: send('showFixtures') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }])
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Welcome Tour', click: send('welcome') },
        {
          label: 'Guided Tours',
          submenu: [
            { label: 'Getting Around the Screen', click: send('tour:basics') },
            { label: 'Making a Show', click: send('tour:build') },
            { label: 'Adding Lights', click: send('tour:lights') },
            { label: 'Making or Fixing a Fixture', click: send('tour:studio') },
            { label: 'Objects, Moving and Lining Up', click: send('tour:objects') },
            { label: 'SoundSwitch and Live DMX', click: send('tour:soundswitch') },
            { label: 'Looking Good: Cameras, Room and Pictures', click: send('tour:present') },
            { type: 'separator' },
            { label: 'All Tours…', click: send('tours') }
          ]
        },
        { type: 'separator' },
        { label: 'Start Fresh as a New User…', click: send('freshStart') },
        { label: `About ${app.name} (version ${app.getVersion()})`, click: send('about') },
        { type: 'separator' },
        { label: 'Open Fixture Library Website', click: () => shell.openExternal('https://open-fixture-library.org') },
        { label: 'Open Log Folder', click: () => shell.openPath(logFolder()) }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
