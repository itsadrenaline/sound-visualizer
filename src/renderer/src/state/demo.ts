/**
 * Test signals for the faders, so you can see the rig move without a console.
 */
import { dmxBus } from './dmxBus'
import { getFixtureType, type ChannelFunction } from '../model/fixtureTypes'
import { headsOf, type ChannelRef, type ShutterRange } from '../model/heads'
import type { Project, Fixture } from '../model/project'

function channelOf(fixture: Fixture, fn: ChannelFunction): number | null {
  const index = getFixtureType(fixture.typeId).channels.indexOf(fn)
  return index < 0 ? null : fixture.address + index
}

/** Sets every channel with this function (pixel bars have one Red per cell, for example). */
function set(fixture: Fixture, fn: ChannelFunction, level: number | ((cell: number) => number)): void {
  const channels = getFixtureType(fixture.typeId).channels
  let cell = 0
  channels.forEach((f, i) => {
    if (f !== fn) return
    dmxBus.setFader(fixture.universe, fixture.address + i, typeof level === 'function' ? level(cell) : level, false)
    cell++
  })
}

/** Point every moving head straight down (pan and tilt at 50%) without touching other channels. */
export function homeFixtures(project: Project): void {
  for (const f of project.fixtures) {
    if (dmxBus.getFader(f.universe, channelOf(f, 'pan') ?? 0) === 0) set(f, 'pan', 128)
    if (dmxBus.getFader(f.universe, channelOf(f, 'tilt') ?? 0) === 0) set(f, 'tilt', 128)
  }
}

/**
 * The show stopped arriving (SoundSwitch closed, or stopped sending): keep every moving
 * head where the show left it, and let everything else go dark. Before, the rig fell back
 * to the test levels: heads swung back to centre, as if something was still sending.
 */
export function holdPositions(project: Project): void {
  for (const f of project.fixtures) {
    const last = dmxBus.lastShow(f.universe)
    if (!last) continue
    for (const h of headsOf(getFixtureType(f.typeId))) {
      for (const ref of [h.ch.pan, h.ch.tilt]) {
        if (!ref) continue
        dmxBus.setFader(f.universe, f.address + ref.coarse, last[f.address - 1 + ref.coarse] ?? 0, false)
        if (ref.fine !== undefined) dmxBus.setFader(f.universe, f.address + ref.fine, last[f.address - 1 + ref.fine] ?? 0, false)
      }
    }
  }
}

/**
 * A simple looping "show": sweeping heads, colour chases across pixel cells.
 * Works head by head, so it opens each fixture's shutter with a value that
 * really means "open" for that model.
 */
export function runDemo(project: Project, time: number): void {
  project.fixtures.forEach((f, i) => {
    const heads = headsOf(getFixtureType(f.typeId))
    const put = (ref: ChannelRef | undefined, level: number) => {
      if (!ref) return
      const v = Math.max(0, Math.min(1, level))
      if (ref.fine !== undefined) {
        const full = Math.round(v * 65535)
        dmxBus.setFader(f.universe, f.address + ref.coarse, full >> 8, false)
        dmxBus.setFader(f.universe, f.address + ref.fine, full & 255, false)
      } else {
        dmxBus.setFader(f.universe, f.address + ref.coarse, v * 255, false)
      }
    }
    heads.forEach((h, k) => {
      const [r, g, b] = hsvToRgb((time * 0.08 + i * 0.12 + k * 0.05) % 1, 1, 1)
      put(h.ch.dimmer, 1)
      put(h.ch.shutter, openShutter(h.shutter) / 255)
      if (h.ch.red || h.ch.green || h.ch.blue) {
        put(h.ch.red, r)
        put(h.ch.green, g)
        put(h.ch.blue, b)
        put(h.ch.white, 0)
        put(h.ch.amber, 0)
        put(h.ch.uv, 0)
      } else {
        // White, warm-white or UV only: there's no colour to chase, so just light it.
        put(h.ch.white, 1)
        put(h.ch.amber, 1)
        put(h.ch.uv, 1)
      }
      // Step through the real colours (skipping "blackout" and "no macro" slots).
      const slots = h.colorWheel?.filter((x) => Math.max(...x.rgb) > 0.001) ?? []
      if (slots.length) {
        const slot = slots[Math.floor(time / 3 + i) % slots.length]
        put(h.ch.colorWheel, (slot.lo + slot.hi) / 2 / 255)
      }
      // Real sweeps: the head swings out (tilt) and around (pan), so beams travel across the room.
      put(h.ch.pan, 0.5 + Math.sin(time * 0.35 + i * 0.6) * 0.12)
      put(h.ch.tilt, 0.5 + 0.1 + Math.sin(time * 0.5 + i * 0.6) * 0.12)
      put(h.ch.zoom, 0.3 + Math.sin(time * 0.3 + i) * 0.2)
      put(h.ch.rotation, 0.3)
      put(h.ch.gobo, Math.floor(time / 6) % 2 ? 0.3 : 0)
    })
  })
}

/**
 * A shutter value that really means "open" for this fixture: its open range if the
 * fixture file lists one, else a value between the listed ranges (those read as open),
 * else 0 (the usual "no strobe"). Fixtures whose shutter is only closed or strobe
 * get the slowest strobe, the closest they come to being on.
 */
function openShutter(ranges: ShutterRange[] | undefined): number {
  if (!ranges?.length) return 0
  const open = ranges.find((x) => x.kind === 'open')
  if (open) return (open.lo + open.hi) / 2
  const covered = (v: number) => ranges.some((x) => v >= x.lo && v <= x.hi)
  const gap = [...Array(256).keys()].filter((v) => !covered(v))
  if (gap.length) return gap[Math.floor(gap.length / 2)]
  if (ranges.every((x) => x.kind === 'strobe')) return 0
  const strobe = ranges.filter((x) => x.kind === 'strobe').sort((a, b) => a.lo - b.lo)[0]
  return strobe ? strobe.lo : 255
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  return ([[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]] as const)[i % 6] as [number, number, number]
}
