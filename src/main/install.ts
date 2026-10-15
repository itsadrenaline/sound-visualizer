/**
 * Fresh installs. Deleting an app on a Mac leaves its settings behind (in
 * ~/Library/Application Support/Sound Visualizer), so a reinstall would quietly
 * pick up where the last one left off. To notice, we remember which copy of the
 * app ran last: when the app on disk is a different one (reinstalled or
 * updated), the page asks whether to carry on or start fresh as a new user.
 *
 * Starting fresh forgets this Mac's SoundSwitch choices here, and on request the
 * Claude key and imported fixture files; the page clears its own storage.
 */
import { app } from 'electron'
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './log'
import { clearClaudeKey } from './claude'

export interface InstallInfo {
  /** This copy of the app hasn't run before, but an earlier one had (reinstall or update). */
  changed: boolean
  /** Nothing has ever run on this Mac for this user. */
  firstEver: boolean
  version: string
  previousVersion: string | null
}

const file = () => join(app.getPath('userData'), 'install.json')

/** Which copy of the app this is: its version and when its files were put on disk. */
function stamp(): string {
  let made = 0
  try {
    made = Math.round(statSync(app.getAppPath()).birthtimeMs)
  } catch {
    // No birth time: the version alone still tells updates apart.
  }
  return `${app.getVersion()}@${made}`
}

let info: InstallInfo | null = null

/** Work this out once, at startup, and remember this copy for next time. */
export function checkInstall(): InstallInfo {
  // Asked once per launch: a reload of the page shouldn't ask "welcome back" again.
  if (info) return { ...info, changed: false }
  const now = stamp()
  let previous: { stamp?: string; version?: string } | null = null
  try {
    if (existsSync(file())) previous = JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    previous = null
  }
  // Settings from before this file existed count as an earlier install.
  const hadData = existsSync(join(app.getPath('userData'), 'Local Storage'))
  info = {
    changed: previous ? previous.stamp !== now : hadData,
    firstEver: !previous && !hadData,
    version: app.getVersion(),
    previousVersion: previous?.version ?? null
  }
  try {
    writeFileSync(file(), JSON.stringify({ stamp: now, version: app.getVersion() }))
  } catch (error) {
    log('warn', 'Could not remember the install', error)
  }
  if (info.changed) log('info', 'Reinstalled or updated', info)
  return info
}

/** Forget what this Mac remembers in the main process. */
export function freshStart(options: { claudeKey?: boolean; importedFixtures?: boolean }): void {
  const data = app.getPath('userData')
  const remove = (...parts: string[]) => {
    try {
      rmSync(join(data, ...parts), { recursive: true, force: true })
    } catch (error) {
      log('warn', `Could not remove ${parts.join('/')}`, error)
    }
  }
  remove('soundswitch.json')
  remove('soundswitch-exclude.json')
  if (options.importedFixtures) {
    remove('library')
    remove('fixtures')
  }
  if (options.claudeKey) clearClaudeKey()
  log('info', 'Started fresh', options)
}
