/**
 * The Art-Net bridge: live DMX for the browser version.
 *
 * Web pages can't receive UDP, and Art-Net is UDP. This small program does what the
 * Mac app's main process does with Art-Net (src/main/index.ts), then hands each
 * universe to the page over a WebSocket that only this computer can reach:
 *
 *   SoundSwitch --Art-Net (UDP 6454)--> bridge --WebSocket 127.0.0.1:6455--> browser
 *
 * It answers SoundSwitch's ArtPoll, so SoundSwitch lists "Sound Visualizer" as a
 * node, exactly like the app. No dependencies: the WebSocket server is the few
 * lines below (RFC 6455, server-to-client binary frames only).
 *
 *   npm run bridge
 */
import { createSocket, type Socket } from 'node:dgram'
import { createServer, type IncomingMessage } from 'node:http'
import { createHash } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import type { Duplex } from 'node:stream'
import { ARTNET_PORT, buildArtPollReply, isArtPoll, parseArtDmx } from '../shared/artnet'

const WS_PORT = 6455
const clients = new Set<Duplex>()
let packets = 0

// --- WebSocket server (localhost only) ---------------------------------------------------
function frame(payload: Uint8Array): Buffer {
  const head = payload.length < 126 ? Buffer.from([0x82, payload.length]) : Buffer.from([0x82, 126, payload.length >> 8, payload.length & 255])
  return Buffer.concat([head, payload])
}

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end(`Sound Visualizer Art-Net bridge: ${clients.size} page(s) connected, ${packets} DMX packets passed on.\n`)
})

server.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
  const key = req.headers['sec-websocket-key']
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') return socket.destroy()
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  clients.add(socket)
  log(`Page connected (${req.headers.origin ?? 'unknown page'}).`)
  // The page never sends anything we need; a close frame (opcode 8) or an error ends it.
  socket.on('data', (data: Buffer) => {
    if ((data[0] & 0x0f) === 8) socket.end()
  })
  const drop = () => {
    if (clients.delete(socket)) log('Page disconnected.')
  }
  socket.on('close', drop)
  socket.on('error', drop)
})

server.listen(WS_PORT, '127.0.0.1', () => log(`Pages connect to ws://127.0.0.1:${WS_PORT}`))
server.on('error', (error) => {
  log(`Can't open port ${WS_PORT}: ${(error as Error).message}. Is the bridge already running?`)
  process.exit(1)
})

function forward(universe: number, from: string, data: Uint8Array): void {
  if (!clients.size) return
  const message = new Uint8Array(7 + 512)
  message[0] = 1
  message[1] = universe >> 8
  message[2] = universe & 255
  from.split('.').forEach((part, i) => (message[3 + i] = Number(part) & 255))
  message.set(data.subarray(0, 512), 7)
  const bytes = frame(message)
  for (const c of clients) c.write(bytes)
}

// --- Art-Net (the same approach as the Mac app) --------------------------------------------
const ipv4 = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4')

let replySocket: Socket | null = null

function localAddressFor(remote: string) {
  const candidates = ipv4()
  const r = remote.split('.').map(Number)
  const same = candidates.find((i) => {
    const ip = i.address.split('.').map(Number)
    const mask = i.netmask.split('.').map(Number)
    return ip.every((p, n) => (p & mask[n]) === (r[n] & mask[n]))
  })
  const chosen = same ?? candidates.find((i) => !i.internal) ?? candidates[0]
  const ip = (chosen?.address ?? '127.0.0.1').split('.').map(Number) as [number, number, number, number]
  const mac = (chosen?.mac ?? '00:00:00:00:00:00').split(':').map((h) => parseInt(h, 16))
  const mask = (chosen?.netmask ?? '255.0.0.0').split('.').map(Number)
  const broadcast = ip.map((p, n) => (p | (~mask[n] & 255)) & 255).join('.')
  return { ip, mac, broadcast, local: candidates.some((i) => i.address === remote) }
}

function onPacket(packet: Buffer, from: string): void {
  if (isArtPoll(packet)) {
    if (!replySocket) return
    const { ip, mac, broadcast, local } = localAddressFor(from)
    const reply = buildArtPollReply({ ip, mac, shortName: 'Sound Visualizer', longName: 'Sound Visualizer (browser, via bridge)' })
    replySocket.send(reply, ARTNET_PORT, local && broadcast !== from ? broadcast : from)
    return
  }
  const dmx = parseArtDmx(packet)
  if (!dmx) return
  if (packets++ === 0) log(`Receiving Art-Net from ${from}.`)
  forward(dmx.universe, from, dmx.data)
}

// One socket per local address plus 0.0.0.0, so a SoundSwitch on this same computer
// (which also opens port 6454) can't take the packets meant for us. See src/main/index.ts.
for (const address of ['0.0.0.0', ...ipv4().map((i) => i.address)]) {
  const s = createSocket({ type: 'udp4', reuseAddr: true })
  s.on('message', (packet, info) => onPacket(packet, info.address))
  s.on('listening', () => {
    if (address === '0.0.0.0') {
      s.setBroadcast(true)
      replySocket = s
      log(`Listening for Art-Net on port ${ARTNET_PORT}.`)
    }
  })
  s.on('error', (error) => {
    log(`Art-Net on ${address}: ${error.message}`)
    s.close()
  })
  s.bind(ARTNET_PORT, address)
}

function log(message: string): void {
  console.log(`[bridge ${new Date().toLocaleTimeString()}] ${message}`)
}

log('Sound Visualizer Art-Net bridge. In SoundSwitch: Preferences ▸ Hardware ▸ DMX & Art-Net, enable Art-Net and pick Sound Visualizer. Press Ctrl+C to stop.')
