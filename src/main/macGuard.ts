/**
 * Keeping the app starting on Macs that block parts of it.
 *
 * The app is made of several programs: the main one, and helpers for the page and
 * for the graphics (Sound Visualizer Helper (GPU) and so on). A download that isn't
 * notarized by Apple is "quarantined". On recent macOS (Tahoe), allowing the app
 * with Open Anyway lets the main program run, but the helpers can still be blocked.
 * The graphics helper then fails to start again and again, and the app quits with
 * "GPU process isn't usable" (a crash report saying EXC_BREAKPOINT on CrBrowserMain).
 *
 * So, before anything else starts:
 *  - If the app is still quarantined, ask once to unblock it (the same as running
 *    `xattr -cr` on it in Terminal) and start again.
 *  - Draw in the main program (no graphics helper) if that's still blocked, or if
 *    the graphics helper failed to start last time.
 */
import { app, dialog } from 'electron'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { log } from './log'

/** The .app bundle this copy runs from (null in development). */
function bundlePath(): string | null {
  if (process.platform !== 'darwin' || !app.isPackaged) return null
  const bundle = dirname(dirname(dirname(app.getPath('exe'))))
  return bundle.endsWith('.app') ? bundle : null
}

function quarantined(path: string): boolean {
  return spawnSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', path], { encoding: 'utf8' }).status === 0
}

const gpuFile = () => join(app.getPath('userData'), 'gpu-fallback.json')

/** Call before app.whenReady(): switches can only be set before Chromium starts. */
export function guardStartup(): void {
  const bundle = bundlePath()
  if (!bundle) return
  const helper = join(bundle, 'Contents', 'Frameworks', 'Sound Visualizer Helper (GPU).app')
  const blocked = quarantined(bundle) || (existsSync(helper) && quarantined(helper))
  let fallback = false
  try {
    fallback = existsSync(gpuFile()) && JSON.parse(readFileSync(gpuFile(), 'utf8')).version === app.getVersion()
  } catch {
    fallback = false
  }
  // The last start never got as far as the graphics running (it quit first): don't rely on the helper this time.
  const pending = join(app.getPath('userData'), 'gpu-starting')
  const quitBeforeGpu = existsSync(pending)
  if (quitBeforeGpu) {
    log('warn', 'Last time the app quit before its graphics started')
    rmSync(pending, { force: true })
    noteGpuLaunchFailure()
  }
  if (blocked || fallback || quitBeforeGpu) {
    // Graphics run inside the main program: no helper to block.
    app.commandLine.appendSwitch('in-process-gpu')
    log('warn', blocked ? 'The app is quarantined by macOS: drawing in the main program' : 'The graphics helper failed last time: drawing in the main program')
  } else {
    // Noted now, cleared once the graphics helper is running.
    try {
      writeFileSync(pending, new Date().toISOString())
    } catch {
      // Best effort.
    }
    const clear = () => rmSync(pending, { force: true })
    app.once('gpu-info-update', clear)
    // Still running half a minute in: the graphics are fine.
    setTimeout(clear, 30_000).unref?.()
  }
  if (!blocked) return
  app.whenReady().then(() => {
    // Opened from a disk image or Downloads: macOS runs it from a hidden copy, which can't be fixed.
    if (/AppTranslocation/.test(bundle)) {
      dialog.showMessageBoxSync({
        type: 'warning',
        message: 'Move Sound Visualizer to Applications first',
        detail: 'macOS is running Sound Visualizer from a temporary copy, so it can block parts of it. Quit, drag Sound Visualizer into your Applications folder, and open it from there.'
      })
      return
    }
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Unblock and restart', 'Not now'],
      defaultId: 0,
      cancelId: 1,
      message: 'macOS is blocking parts of Sound Visualizer',
      detail:
        'This copy isn’t notarized by Apple, so macOS keeps parts of it (its graphics helper) from starting, and the app can quit by itself. ' +
        'Unblocking does the same as running this in Terminal:\n\nxattr -cr "' + bundle + '"\n\nOnly do this if you downloaded Sound Visualizer from its GitHub page.'
    })
    if (choice !== 0) return
    const r = spawnSync('/usr/bin/xattr', ['-cr', bundle], { encoding: 'utf8' })
    if (r.status !== 0 || quarantined(bundle)) {
      log('error', 'Could not unblock the app', r.stderr)
      dialog.showMessageBoxSync({ type: 'error', message: 'Couldn’t unblock Sound Visualizer', detail: `Open Terminal and run:\n\nxattr -cr "${bundle}"\n\nthen open Sound Visualizer again.\n\n${r.stderr ?? ''}` })
      return
    }
    log('info', 'Unblocked the app (removed the quarantine); restarting')
    app.relaunch()
    app.exit(0)
  })
}

/** The graphics helper couldn't start: next time, draw in the main program. */
export function noteGpuLaunchFailure(): void {
  try {
    writeFileSync(gpuFile(), JSON.stringify({ version: app.getVersion(), at: new Date().toISOString() }))
  } catch {
    // Best effort.
  }
}

/** The graphics helper works again (e.g. after unblocking): stop drawing in the main program. */
export function clearGpuFallback(): void {
  try {
    rmSync(gpuFile(), { force: true })
  } catch {
    // Best effort.
  }
}
