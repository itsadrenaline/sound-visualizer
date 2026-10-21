/**
 * Equinox (Prolight) fixtures written from the manufacturer's manual, in the app's own
 * compact Fixture Studio form (they replace the QLC+ library's versions).
 *
 * Fusion Orbit MKII (EQLED018): a moving head with one 60 W RGBW beam LED and a ring of
 * 12 RGB LEDs round the lens (in 6 segments in the 37-channel mode). 540° pan, 210° tilt,
 * 4° beam, 238 × 172 × 146 mm, 2.5 kg. Modes: 2, 7, 16 and 37 channels.
 */
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

// The colour macros, as printed (the beam's use RGBW; the ring's the same colours in RGB).
const MACROS = [
  [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [135, 206, 235], [178, 34, 34], [255, 255, 0], [160, 32, 240], [255, 97, 0], [124, 252, 0],
  [250, 128, 114], [128, 42, 42], [255, 215, 0], [156, 102, 31], [138, 43, 226], [160, 102, 211], [100, 100, 255], [255, 100, 100], [100, 255, 100], [255, 50, 50]
]
const macroRanges = () => [
  { lo: 0, hi: 9, label: 'No function', kind: 'off' },
  ...MACROS.map(([r, g, b], i) => ({ lo: 10 + i * 12, hi: i === MACROS.length - 1 ? 255 : 21 + i * 12, label: `Colour ${i + 1}`, kind: 'slot', color: hex(r, g, b) }))
]
const SHOWS = [
  { lo: 0, hi: 15, label: 'No function', kind: 'off' },
  { lo: 16, hi: 64, label: 'Show 1', kind: 'program', pattern: 'fade' },
  { lo: 65, hi: 114, label: 'Show 2', kind: 'program', pattern: 'chase' },
  { lo: 115, hi: 164, label: 'Show 3', kind: 'program', pattern: 'jump' },
  { lo: 165, hi: 214, label: 'Show 4 (forward-facing)', kind: 'program', pattern: 'rainbow' },
  { lo: 215, hi: 255, label: 'Show 5 (no strobe)', kind: 'program', pattern: 'fade' }
]
const PT_PROGRAMS = [
  { lo: 0, hi: 15, label: 'No function', kind: 'off' },
  ...[0, 1, 2, 3].map((i) => ({ lo: 16 + i * 60, hi: i === 3 ? 255 : 75 + i * 60, label: `Pan/tilt program ${i + 1}`, kind: 'program' }))
]
// Pan/tilt speed goes slow to fast (0 is slowest), the opposite of most movers.
const SPEED = [{ lo: 0, hi: 255, label: 'Slow to fast', from: 0.05, to: 1 }]
const beamStrobe = [{ lo: 0, hi: 9, label: 'No strobe', kind: 'open' }, { lo: 10, hi: 255, label: 'Strobe, slow to fast', kind: 'strobe' }]
const ringStrobe = [{ lo: 0, hi: 9, label: 'No strobe', kind: 'open' }, { lo: 10, hi: 250, label: 'Strobe, slow to fast', kind: 'strobe' }, { lo: 251, hi: 255, label: 'No strobe', kind: 'open' }]
const ringPrograms = [{ lo: 0, hi: 0, label: 'No function', kind: 'off' }, { lo: 1, hi: 255, label: 'Ring macro programs', kind: 'program', pattern: 'chase' }]

// Parts: 0 = the ring as a whole, 1-6 = its segments. Part -1 is the head itself (the beam).
const MAIN = -1
const RING = 0
const ch = (name, fn, part = MAIN, ranges, fine) => (ranges || fine ? [name, fn, part, fine ? 1 : 0, ...(ranges ? [ranges] : [])] : [name, fn, part])
const show = () => [ch('Show', 'program', MAIN, SHOWS), ch('Sound sensitivity', 'sound')]
const segments = () => [1, 2, 3, 4, 5, 6].flatMap((s) => [ch(`Ring ${s} red`, 'red', s), ch(`Ring ${s} green`, 'green', s), ch(`Ring ${s} blue`, 'blue', s)])

export const fusionOrbitMk2 = {
  n: 'Fusion Orbit MKII',
  m: 'Equinox',
  k: 'beam',
  l: { shape: 'mover', size: [0.172, 0.238, 0.146], beam: [4, 4], pan: 540, tilt: 210, output: 0.75, mount: 'hanging' },
  p: [['Ring', -1, 'halo'], ...[1, 2, 3, 4, 5, 6].map((s) => [`Ring ${s}`, -1, 'halo'])],
  o: [
    ['2 Channel', show()],
    ['7 Channel', [
      ch('Pan/tilt programs', 'positionFx', MAIN, PT_PROGRAMS),
      ch('Beam dimmer', 'dimmer'),
      ch('Beam colour macros', 'colorMacro', MAIN, macroRanges()),
      ch('Ring dimmer', 'dimmer', RING),
      ch('Ring colour macros', 'colorMacro', RING, macroRanges()),
      ch('Ring macro programs', 'program', RING, ringPrograms),
      ch('Ring macro speed', 'programSpeed', RING)
    ]],
    ['16 Channel', [
      ch('Pan', 'pan'), ch('Tilt', 'tilt'), ch('Pan/tilt speed', 'panTiltSpeed', MAIN, SPEED),
      ch('Beam dimmer', 'dimmer'), ch('Beam strobe', 'shutter', MAIN, beamStrobe),
      ch('Beam red', 'red'), ch('Beam green', 'green'), ch('Beam blue', 'blue'), ch('Beam white', 'white'),
      ch('Ring dimmer', 'dimmer', RING), ch('Ring strobe', 'shutter', RING, ringStrobe),
      ch('Ring red', 'red', RING), ch('Ring green', 'green', RING), ch('Ring blue', 'blue', RING),
      ...show()
    ]],
    ['37 Channel', [
      ch('Pan', 'pan'), ch('Pan fine', 'pan', MAIN, undefined, true), ch('Tilt', 'tilt'), ch('Tilt fine', 'tilt', MAIN, undefined, true), ch('Pan/tilt speed', 'panTiltSpeed', MAIN, SPEED),
      ch('Beam dimmer', 'dimmer'), ch('Beam strobe', 'shutter', MAIN, beamStrobe), ch('Beam colour macros', 'colorMacro', MAIN, macroRanges()),
      ch('Beam red', 'red'), ch('Beam green', 'green'), ch('Beam blue', 'blue'), ch('Beam white', 'white'),
      ch('Ring dimmer', 'dimmer', RING), ch('Ring strobe', 'shutter', RING, ringStrobe), ch('Ring colour macros', 'colorMacro', RING, macroRanges()),
      ch('Ring macro programs', 'program', RING, ringPrograms), ch('Ring macro speed', 'programSpeed', RING),
      ...segments(),
      ...show()
    ]]
  ]
}

/** QLC+ library keys these replace. */
export const equinoxReplacements = { 'qlc/Equinox/Equinox-Fusion-Orbit-MKII': fusionOrbitMk2 }
