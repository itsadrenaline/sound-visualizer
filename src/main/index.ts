/**
 * Electron main process: owns the window and the network.
 *
 * Browsers can't open UDP sockets, so Art-Net is received here and forwarded
 * to the page over IPC. This is the "Provider" layer from the blueprint.
 */
import { app, BrowserWindow, shell } from 'electron'
import { cpSync, existsSync } from 'node:fs'
import { handle, hardenApp, listen, setRendererOrigin } from './security'
import { basename } from 'node:path'
import { catchCrashes, log, logFolder } from './log'
import { deleteMyFixture, importFixtureFiles, listMyFixtures, loadLibrary, qlcDefinition, qlcEntries, saveMyFixture } from './library'
import { openProject, readProject, saveImage, saveProject } from './files'
import { buildMenu } from './menu'
import { claudeRequest, claudeStatus, clearClaudeKey, setClaudeKey } from './claude'
import { checkInstall, freshStart } from './install'
import { openFile, saveFile } from './files'
import { browseProfile, excludeFixtures, listProfiles, readProfile, refreshSoundSwitch, startSoundSwitch, useProfile } from './soundswitch'
import { createSocket, type Socket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARTNET_PORT, buildArtPollReply, isArtPoll, parseArtDmx } from '../shared/artnet'
import type { ArtNetStatus, DmxMessage } from '../shared/ipc'

// The app used to be called "SoundSwitch Visualizer": bring its settings, shows and
// imported fixtures over the first time the renamed app starts.
{
  const old = join(app.getPath('appData'), 'SoundSwitch Visualizer')
  const now = app.getPath('userData')
  if (!existsSync(now) && existsSync(old)) {
    try {
      cpSync(old, now, { recursive: true })
    } catch {
      // Starting fresh is fine.
    }
  }
}

const here = dirname(fileURLToPath(import.meta.url))
let window: BrowserWindow | null = null
let socket: Socket | null = null
const sockets: Socket[] = []
let status: ArtNetStatus = { listening: false, address: '' }

function createWindow(): void {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0d0f12',
    title: 'Sound Visualizer',
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  })

  // In development electron-vite serves the page with hot reload; in a build we load the file.
  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged) {
    setRendererOrigin(process.env.ELECTRON_RENDERER_URL)
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const page = join(here, '../renderer/index.html')
    setRendererOrigin(page)
    window.loadFile(page)
  }

  // Re-send the Art-Net status and the SoundSwitch rig whenever the page (re)loads.
  window.webContents.on('did-finish-load', () => {
    window?.webContents.send('artnet-status', status)
    refreshSoundSwitch()
  })
  startSoundSwitch(window)
  window.on('closed', () => (window = null))
  // Links (e.g. to a fixture's product page) open in the browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('render-process-gone', (_e, details) => log('error', 'The page crashed', details))
  // A project double-clicked in Finder before the window was ready.
  window.webContents.once('did-finish-load', () => {
    if (pendingOpen) sendOpen(pendingOpen)
    pendingOpen = null
  })
}

// --- Project files ---------------------------------------------------------------
let pendingOpen: string | null = null
function sendOpen(path: string): void {
  try {
    window?.webContents.send('project-opened', readProject(path))
  } catch (error) {
    log('warn', `Couldn't open ${path}`, error)
    window?.webContents.send('notice', { kind: 'error', text: (error as Error).message })
  }
}
// macOS: double-clicking a .ssvis file, or dropping it on the Dock icon.
app.on('open-file', (event, path) => {
  event.preventDefault()
  if (window && !window.webContents.isLoading()) sendOpen(path)
  else pendingOpen = path
})

handle('project-save', (_e, json: string, path: string | null, saveAs: boolean, name: string) => saveProject(window, json, path, saveAs, name))
handle('project-open', async () => {
  try {
    return await openProject(window)
  } catch (error) {
    log('warn', 'Open failed', error)
    return { error: (error as Error).message }
  }
})
handle('image-save', (_e, dataUrl: string, name: string) => saveImage(window, dataUrl, name))
listen('set-title', (_e, name: string, path: string | null, edited: boolean) => {
  if (!window) return
  window.setTitle(`${path ? basename(path) : name} — Sound Visualizer`)
  if (process.platform === 'darwin') {
    window.setRepresentedFilename(path ?? '')
    window.setDocumentEdited(edited)
  }
})

// --- Fixture library -------------------------------------------------------------
handle('library-load', () => loadLibrary())
handle('library-import', () => importFixtureFiles(window))
handle('library-qlc', () => qlcEntries())
handle('library-qlc-def', (_e, key: string) => qlcDefinition(String(key)))
handle('my-fixtures', () => listMyFixtures())
handle('my-fixture-save', (_e, def: { id?: string; format?: string }) => saveMyFixture(def))
handle('my-fixture-delete', (_e, id: string) => deleteMyFixture(String(id)))

// --- First launch, reinstalls and starting fresh ---------------------------------------
handle('install-info', () => checkInstall())
handle('fresh-start', (_e, options: { claudeKey?: boolean; importedFixtures?: boolean }) => {
  freshStart(options ?? {})
  refreshSoundSwitch()
})

// --- Show builder: Claude ---------------------------------------------------------
handle('claude-status', () => claudeStatus())
handle('claude-set-key', (_e, key: string) => setClaudeKey(key))
handle('claude-clear-key', () => clearClaudeKey())
handle('claude-request', async (_e, body: unknown) => {
  try {
    return { ok: true, response: await claudeRequest(body) }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
})

// --- Other files: MVR, CSV, shows to merge ---------------------------------------
handle('file-save', (_e, defaultName: string, filters: Array<{ name: string; extensions: string[] }>, data: string | Uint8Array) => saveFile(window, defaultName, filters, data))
handle('file-open', (_e, filters: Array<{ name: string; extensions: string[] }>) => openFile(window, filters))

// --- Logs ------------------------------------------------------------------------
listen('log', (_e, level: 'info' | 'warn' | 'error', message: string, detail?: unknown) => log(level, `[page] ${message}`, detail))
listen('open-logs', () => shell.openPath(logFolder()))

function setStatus(next: ArtNetStatus): void {
  status = next
  window?.webContents.send('artnet-status', status)
}

/**
 * Opens one socket on every local address, plus one on 0.0.0.0.
 *
 * Why several? When SoundSwitch runs on this same Mac it also opens port 6454.
 * Both programs can share the port, but macOS delivers a packet sent straight to
 * an address (like 10.0.0.21 or 127.0.0.1) to only ONE of the sharing sockets,
 * and it may pick SoundSwitch's. A socket bound to that exact address always
 * wins over a "0.0.0.0" one, so binding each address makes sure we get the DMX.
 * The 0.0.0.0 socket still catches broadcasts, such as SoundSwitch's ArtPoll.
 */
function startArtNet(): void {
  const addresses = [
    '0.0.0.0',
    ...Object.values(networkInterfaces())
      .flat()
      .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4')
      .map((i) => i.address)
  ]
  const bound = new Set<string>()
  const failed: string[] = []

  const report = () => {
    const any = bound.size > 0
    setStatus({
      listening: any,
      address: [...bound].join(', ') + `:${ARTNET_PORT}`,
      error: any ? undefined : failed[0]
    })
  }

  for (const address of addresses) {
    const s = createSocket({ type: 'udp4', reuseAddr: true })
    s.on('message', (packet, from) => onPacket(packet, from.address))
    s.on('listening', () => {
      if (address === '0.0.0.0') {
        s.setBroadcast(true)
        socket = s // replies are sent from this one
      }
      bound.add(address)
      report()
    })
    s.on('error', (error) => {
      // Usually another program has the port without sharing it. Keep the other sockets.
      failed.push(`${address}: ${error.message}`)
      s.close()
      report()
    })
    s.bind(ARTNET_PORT, address)
    sockets.push(s)
  }
}

function onPacket(packet: Buffer, from: string): void {
  // A controller (SoundSwitch, a console) is looking for devices: answer so it lists us.
  if (isArtPoll(packet)) {
    answerPoll(from)
    return
  }
  const dmx = parseArtDmx(packet)
  if (!dmx || !window) return
  const message: DmxMessage = { universe: dmx.universe, data: dmx.data, from }
  window.webContents.send('dmx', message)
}

/** Picks the network address on the same subnet as the controller, so it can reach us. */
function localAddressFor(remote: string): { ip: [number, number, number, number]; mac: number[]; broadcast: string; local: boolean } {
  const candidates = Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4')
  const remoteParts = remote.split('.').map(Number)
  const sameSubnet = candidates.find((i) => {
    const ip = i.address.split('.').map(Number)
    const mask = i.netmask.split('.').map(Number)
    return ip.every((part, n) => (part & mask[n]) === (remoteParts[n] & mask[n]))
  })
  const chosen = sameSubnet ?? candidates.find((i) => !i.internal) ?? candidates[0]
  const ip = (chosen?.address ?? '127.0.0.1').split('.').map(Number) as [number, number, number, number]
  const mac = (chosen?.mac ?? '00:00:00:00:00:00').split(':').map((h) => parseInt(h, 16))
  const mask = (chosen?.netmask ?? '255.0.0.0').split('.').map(Number)
  const broadcast = ip.map((part, n) => (part | (~mask[n] & 255)) & 255).join('.')
  const local = candidates.some((i) => i.address === remote)
  return { ip, mac, broadcast, local }
}

function answerPoll(controller: string): void {
  if (!socket) return
  const { ip, mac, broadcast, local } = localAddressFor(controller)
  const reply = buildArtPollReply({ ip, mac, shortName: 'Sound Visualizer', longName: 'Sound Visualizer (3D lighting visualizer)' })
  // Replies go to the poller on the Art-Net port. If the poller is SoundSwitch on this same
  // Mac, a direct reply would land in our own socket (see startArtNet), so broadcast it instead.
  socket.send(reply, ARTNET_PORT, local && broadcast !== controller ? broadcast : controller)
}

// The page asks for the status once it's ready to listen (a message sent earlier would be missed).
listen('artnet-status-request', () => window?.webContents.send('artnet-status', status))
listen('soundswitch-refresh', () => refreshSoundSwitch())
listen('soundswitch-exclude', (_event, project: string, keys: string[]) => excludeFixtures(project, keys))
handle('soundswitch-profiles', () => listProfiles())
handle('soundswitch-profile-read', (_e, path: string) => {
  try {
    return readProfile(path)
  } catch (error) {
    return { error: (error as Error).message }
  }
})
handle('soundswitch-profile-browse', () => browseProfile())
listen('soundswitch-profile-use', (_e, path: string) => useProfile(path))

catchCrashes()
app.whenReady().then(() => {
  log('info', `Starting Sound Visualizer ${app.getVersion()} (${process.arch})`)
  hardenApp()
  app.setAboutPanelOptions({
    applicationName: 'Sound Visualizer',
    applicationVersion: app.getVersion(),
    credits: 'A 3D lighting visualizer that plays your SoundSwitch shows over Art-Net. Fixture data from the Open Fixture Library (MIT) and Both Lighting user manuals. SoundSwitch is a trademark of inMusic; this app is not affiliated with or endorsed by inMusic.',
    copyright: '© 2026 the Sound Visualizer contributors'
  })
  buildMenu(() => window)
  startArtNet()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const s of sockets) s.close()
  if (process.platform !== 'darwin') app.quit()
})
