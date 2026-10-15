/**
 * Small builders for Open Fixture Library capabilities, shared by the fixtures
 * written from manufacturers' manuals (both-lighting.mjs, betopper.mjs, rockville.mjs).
 */

// --- Small builders for OFL capabilities --------------------------------------------------

export const cap = (lo, hi, c) => ({ dmxRange: [lo, hi], ...c })

/** Fill the gaps between ranges with "no function", so every value 0-255 means something. */
export function fill(caps) {
  const sorted = [...caps].sort((a, b) => a.dmxRange[0] - b.dmxRange[0])
  const out = []
  let next = 0
  for (const c of sorted) {
    if (c.dmxRange[0] > next) out.push(cap(next, c.dmxRange[0] - 1, { type: 'NoFunction' }))
    const lo = Math.max(next, c.dmxRange[0])
    if (lo <= c.dmxRange[1]) out.push({ ...c, dmxRange: [lo, c.dmxRange[1]] })
    next = Math.max(next, c.dmxRange[1] + 1)
  }
  if (next <= 255) out.push(cap(next, 255, { type: 'NoFunction' }))
  return out
}

export const intensity = () => ({ capability: { type: 'Intensity' } })
export const color = (c) => ({ capability: { type: 'ColorIntensity', color: c } })
export const pan = (deg, fine = true) => ({ ...(fine ? { fineChannelAliases: ['Pan fine'] } : {}), capability: { type: 'Pan', angleStart: '0deg', angleEnd: `${deg}deg` } })
export const tilt = (deg, fine = true) => ({ ...(fine ? { fineChannelAliases: ['Tilt fine'] } : {}), capability: { type: 'Tilt', angleStart: '0deg', angleEnd: `${deg}deg` } })
export const ptSpeed = () => ({ capability: { type: 'PanTiltSpeed', speedStart: 'fast', speedEnd: 'slow' } })
export const zoom = (a, b) => ({ capability: { type: 'Zoom', angleStart: `${a}deg`, angleEnd: `${b}deg` } })
export const focus = () => ({ capability: { type: 'Focus', distanceStart: 'near', distanceEnd: 'far' } })
export const generic = (name) => ({ capability: { type: 'Generic', comment: name } })
export const effect = (name) => ({ capability: { type: 'Effect', effectName: name } })
export const maintenance = (name) => ({ capability: { type: 'Maintenance', comment: name } })
export const caps = (...list) => ({ capabilities: fill(list) })

/** Strobe channel from [lo, hi, 'Open' | 'Closed' | 'Strobe' | 'Pulse' | 'RandomStrobe'] triples. */
export function strobe(...ranges) {
  return caps(...ranges.map(([lo, hi, kind]) => cap(lo, hi, { type: 'ShutterStrobe', shutterEffect: kind, ...(kind === 'RandomStrobe' ? { shutterEffect: 'Strobe', randomTiming: true } : {}) })))
}

/** Wheel slot ranges: [lo, hi, slotNumber]. Extra caps (rotation, shake) can follow. */
export function wheel(name, slots, ...more) {
  return caps(...slots.map(([lo, hi, slot]) => cap(lo, hi, { type: 'WheelSlot', wheel: name, slotNumber: slot })), ...more)
}
export const spin = (lo, hi, start, end, wheelName) => cap(lo, hi, { type: 'WheelRotation', ...(wheelName ? { wheel: wheelName } : {}), speedStart: start, speedEnd: end })
export const shake = (lo, hi, slot, wheelName) => cap(lo, hi, { type: 'WheelShake', wheel: wheelName, slotNumber: slot, shakeSpeedStart: 'slow', shakeSpeedEnd: 'fast' })
export const goboSpin = (lo, hi, start, end, wheelName) => cap(lo, hi, { type: 'WheelSlotRotation', wheel: wheelName, speedStart: start, speedEnd: end })

/** Even slot ranges: `count` slots of `step` values starting at `from`. */
export function slots(from, step, count, first = 1) {
  return Array.from({ length: count }, (_, i) => [from + i * step, from + (i + 1) * step - 1, first + i])
}

export const colorSlots = (hexes) => [{ type: 'Open' }, ...hexes.map(([name, hex]) => ({ type: 'Color', name, colors: [hex] }))]
export const goboSlots = (n) => [{ type: 'Open' }, ...Array.from({ length: n }, () => ({ type: 'Gobo' }))]

