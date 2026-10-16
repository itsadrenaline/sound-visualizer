/**
 * Live DMX levels. Deliberately NOT part of the project or React state:
 * levels change ~44 times a second and must never enter undo or the saved file.
 *
 * Two sources feed it: Art-Net from the network, and the on-screen test faders.
 *
 * While a show is arriving over Art-Net, the show wins: only a fader you move
 * yourself overrides it, on that channel, until you press Release (like a
 * console's "latest takes precedence" for positions). Levels the app sets on
 * its own (pointing heads down at startup) never cover the show. Play demo is
 * the exception: while it runs it covers everything, so pressing it always
 * shows something, even with SoundSwitch connected and sitting idle.
 * Mixing by "highest wins" was wrong for pan and tilt: a heads-down 128 held
 * every lower pan or tilt value from SoundSwitch at the centre, so movers
 * barely moved.
 */

const artnet = new Map<number, Uint8Array>()
const faders = new Map<number, Uint8Array>()
/** Channels a person moved on a fader (1 = override the show). */
const manual = new Map<number, Uint8Array>()
const merged = new Map<number, Uint8Array>()
let lastArtNetPacket = 0
let artNetPackets = 0
const senders = new Map<string, Set<number>>()
const lastSeen = new Map<number, number>()
let offset = 0
/** Play demo is running: the test levels cover the show completely, so the demo is always visible. */
let preview = false

function buffer(map: Map<number, Uint8Array>, universe: number): Uint8Array {
  let data = map.get(universe)
  if (!data) {
    data = new Uint8Array(512)
    map.set(universe, data)
  }
  return data
}

export const dmxBus = {
  /** Called for every Art-Net packet. */
  receiveArtNet(universe: number, data: Uint8Array, from = ''): void {
    buffer(artnet, universe).set(data)
    lastSeen.set(universe, performance.now())
    if (!senders.has(from)) senders.set(from, new Set())
    senders.get(from)!.add(universe)
    lastArtNetPacket = performance.now()
    artNetPackets++
  },

  /**
   * Set one channel from a test fader. `channel` is 1-based. `byHand`: a person
   * moved it, so it overrides the show; the app's own levels (homing, demo) don't.
   */
  setFader(universe: number, channel: number, level: number, byHand = true): void {
    if (channel < 1 || channel > 512) return
    buffer(faders, universe)[channel - 1] = Math.max(0, Math.min(255, Math.round(level)))
    buffer(manual, universe)[channel - 1] = byHand ? 1 : 0
  },

  /** How many channels are held by hand over the show. */
  overrides(): number {
    let n = 0
    for (const m of manual.values()) for (const v of m) n += v
    return n
  },

  /** While the demo plays, its levels win over any Art-Net arriving (SoundSwitch sends even when idle). */
  setPreview(on: boolean): void {
    preview = on
  },

  previewing(): boolean {
    return preview
  },

  getFader(universe: number, channel: number): number {
    return faders.get(universe)?.[channel - 1] ?? 0
  },

  clearFaders(): void {
    faders.clear()
    manual.clear()
  },

  /**
   * Forget the levels the app set on its own (the demo, pointing heads down), keeping
   * faders a person moved. Stopping the demo calls this: before, the demo's last frame
   * stayed in the test levels and showed up as soon as the show stopped arriving
   * (colours and positions nobody sent).
   */
  clearAuto(): void {
    for (const [u, f] of faders) {
      const hand = manual.get(u)
      for (let i = 0; i < 512; i++) if (!hand?.[i]) f[i] = 0
    }
  },

  /** The last levels that arrived over Art-Net for a project universe (null if none). */
  lastShow(projectUniverse: number): Uint8Array | null {
    return artnet.get(projectUniverse + offset) ?? null
  },

  /**
   * Some controllers count universes from 1 instead of 0. If none of the universes
   * arriving match the project's, line them up by their lowest numbers. The project
   * universe `u` then reads Art-Net universe `u + offset`.
   */
  alignUniverses(projectUniverses: number[]): number {
    const now = performance.now()
    const incoming = [...lastSeen].filter(([, t]) => now - t < 2000).map(([u]) => u)
    if (incoming.length === 0 || projectUniverses.length === 0) return offset
    if (incoming.some((u) => projectUniverses.includes(u))) offset = 0
    else {
      // Only the "counts from 1" case: one universe apart. Anything further is another
      // show (another console or computer on the network), not this one: before, it was
      // shifted onto this rig and moved and coloured fixtures SoundSwitch never sent to.
      const shift = Math.min(...incoming) - Math.min(...projectUniverses)
      offset = Math.abs(shift) === 1 ? shift : 0
    }
    return offset
  },

  universeOffset(): number {
    return offset
  },

  /** Merged levels for one project universe. Returns the same buffer each call; don't keep it. */
  levels(projectUniverse: number): Uint8Array {
    const universe = projectUniverse + offset
    const out = buffer(merged, projectUniverse)
    const a = artnet.get(universe)
    const f = faders.get(projectUniverse)
    const live = !preview && a && performance.now() - (lastSeen.get(universe) ?? 0) < 2000
    if (live) {
      // The show drives everything, except channels held by hand.
      const hand = manual.get(projectUniverse)
      for (let i = 0; i < 512; i++) out[i] = hand?.[i] && f ? f[i] : a[i]
      return out
    }
    for (let i = 0; i < 512; i++) out[i] = f?.[i] ?? 0
    return out
  },

  /** True if Art-Net arrived in the last two seconds. */
  artNetActive(): boolean {
    return performance.now() - lastArtNetPacket < 2000
  },

  artNetPacketCount(): number {
    return artNetPackets
  },

  /** Who has sent us Art-Net, and on which universes. */
  artNetSenders(): Array<{ address: string; universes: number[] }> {
    return [...senders].map(([address, set]) => ({ address, universes: [...set].sort((a, b) => a - b) }))
  }
}

// For tests and debugging from the console: window.__fader(universe, address, [levels...])
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fader?: (u: number, a: number, v: number[]) => void }).__fader = (u, a, v) =>
    v.forEach((level, i) => dmxBus.setFader(u, a + i, level))
}
