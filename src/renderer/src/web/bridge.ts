/**
 * Live DMX in the browser.
 *
 * SoundSwitch sends Art-Net as UDP packets, and web pages can't receive UDP. The
 * Art-Net bridge (src/bridge, `npm run bridge`) is a small program that receives
 * them, answers SoundSwitch's ArtPoll so it lists "Sound Visualizer", and passes
 * each universe on to this page over a WebSocket on this computer.
 *
 * Each WebSocket message is one universe:
 *   0      1 (format version)
 *   1..2   Art-Net universe (Port-Address), big-endian
 *   3..6   sender's IPv4 address
 *   7..    512 DMX levels
 */
import type { ArtNetStatus, DmxMessage } from '../../../shared/ipc'

export const BRIDGE_PORT = 6455
const URL_ = `ws://127.0.0.1:${BRIDGE_PORT}`

type DmxListener = (message: DmxMessage) => void
type StatusListener = (status: ArtNetStatus) => void
const dmxListeners = new Set<DmxListener>()
const statusListeners = new Set<StatusListener>()

const WAITING: ArtNetStatus = {
  listening: false,
  address: '',
  note: {
    text: 'Art-Net: start the bridge for live DMX',
    short: 'Art-Net: no bridge',
    help: "Browsers can't receive Art-Net from SoundSwitch by themselves. Run the Sound Visualizer bridge on this computer and the show plays here live (it connects by itself). Everything else works without it."
  }
}
let status: ArtNetStatus = WAITING
let socket: WebSocket | null = null
let started = false

function setStatus(next: ArtNetStatus): void {
  status = next
  statusListeners.forEach((l) => l(status))
}

function connect(): void {
  try {
    socket = new WebSocket(URL_)
  } catch {
    setTimeout(connect, 3000)
    return
  }
  socket.binaryType = 'arraybuffer'
  socket.onopen = () => setStatus({ listening: true, address: `bridge on 127.0.0.1:${BRIDGE_PORT}` })
  socket.onmessage = (event) => {
    if (!(event.data instanceof ArrayBuffer)) return
    const bytes = new Uint8Array(event.data)
    if (bytes.length < 7 || bytes[0] !== 1) return
    const data = new Uint8Array(512)
    data.set(bytes.subarray(7, 7 + 512))
    const message: DmxMessage = { universe: (bytes[1] << 8) | bytes[2], from: `${bytes[3]}.${bytes[4]}.${bytes[5]}.${bytes[6]}`, data }
    dmxListeners.forEach((l) => l(message))
  }
  socket.onclose = () => {
    socket = null
    if (status.listening) setStatus(WAITING)
    setTimeout(connect, 3000)
  }
}

function start(): void {
  if (started) return
  started = true
  connect()
}

export function onDmx(listener: DmxListener): () => void {
  start()
  dmxListeners.add(listener)
  return () => dmxListeners.delete(listener)
}

export function onStatus(listener: StatusListener): () => void {
  start()
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

export function requestStatus(): void {
  statusListeners.forEach((l) => l(status))
}
