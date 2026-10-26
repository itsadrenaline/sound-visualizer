/**
 * ADJ (American DJ) fixtures, written from ADJ's own user manuals in Open Fixture
 * Library format. They replace the Open Fixture Library's entry for the same light.
 */
import { cap, caps, intensity, color, effect, generic, maintenance, strobe, pan, tilt, ptSpeed, zoom, wheel, spin, shake, slots, colorSlots, goboSlots } from './ofl-helpers.mjs'

const SITE = 'https://www.adj.com'
const fixtures = {}
const mode = (name, channels) => ({ name, shortName: `${name.replace(/\D.*/, '')}ch`, channels })
const program = (...ranges) => caps(...ranges.map(([lo, hi, name]) => cap(lo, hi, effect(name))))
const turn = (lo, hi, speedStart, speedEnd) => cap(lo, hi, { type: 'Rotation', speedStart, speedEnd })

// --- Starburst ------------------------------------------------------------------------
// A ball covered in lenses on a base: five 15 W six-colour LEDs inside throw dozens of
// 1° beams out through the lenses, and a motor turns the ball.
fixtures['starburst'] = {
  name: 'Starburst',
  categories: ['Effect', 'Color Changer'],
  comment: 'From the ADJ Starburst user manual (12 channels). A ball of lenses on a base: 5 × 15 W 6-in-1 LEDs (red, green, blue, white, yellow, purple) throw many 1° beams, and a motor turns the ball (channel 9). Channel 10 picks colour macros (no list printed); channel 11 runs built-in shows.',
  links: { manual: [SITE] },
  physical: { dimensions: [318, 412.5, 318], weight: 3.65, power: 55, bulb: { type: '5 × 15W 6-in-1 RGBWYP LEDs' }, lens: { degreesMinMax: [1, 1] } },
  availableChannels: {
    Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('White'), Yellow: color('Yellow'), Purple: color('Purple'),
    Strobe: strobe([0, 7, 'Closed'], [8, 15, 'Open'], [16, 131, 'Strobe'], [132, 139, 'Open'], [140, 181, 'Pulse'], [182, 189, 'Open'], [190, 231, 'Pulse'], [232, 239, 'Open'], [240, 247, 'RandomStrobe'], [248, 255, 'Open']),
    Dimmer: intensity(),
    Rotation: caps(turn(31, 140, 'fast CW', 'slow CW'), turn(141, 145, 'stop', 'stop'), turn(146, 255, 'slow CCW', 'fast CCW')),
    'Colour Macros': program([26, 205, 'Colour macros'], [206, 255, 'Colour change, fast to slow']),
    Shows: program([56, 75, 'Sound active'], [76, 105, 'Red, turning clockwise'], [106, 135, 'Blue, turning anticlockwise'], [136, 165, '7-colour change, clockwise'], [166, 195, '7-colour change, anticlockwise'], [196, 225, '7-colour change with strobe, clockwise'], [226, 255, '7-colour change with strobe, anticlockwise']),
    Reset: caps(cap(70, 85, maintenance('Reset')))
  },
  modes: [mode('12-channel', ['Red', 'Green', 'Blue', 'White', 'Yellow', 'Purple', 'Strobe', 'Dimmer', 'Rotation', 'Colour Macros', 'Shows', 'Reset'])]
}

// --- Focus Spot 4Z ----------------------------------------------------------------------
// 200 W LED spot with motorised focus and zoom, an 8-colour wheel, a rotating gobo wheel
// and two rotating prisms. Basic 16, Standard 18 and Extended 22 channels.
const FS4Z_COLORS = [['Red', '#ff0000'], ['Orange', '#ff8000'], ['Yellow', '#ffff00'], ['Green', '#00ff00'], ['Blue', '#0000ff'], ['Pink', '#ff6eb4'], ['Cyan', '#00ffff'], ['Magenta', '#ff00ff']]
const prismTurn = () => caps(
  cap(0, 127, { type: 'PrismRotation', angleStart: '0deg', angleEnd: '360deg', comment: 'Indexing' }),
  cap(128, 189, { type: 'PrismRotation', speedStart: 'fast CW', speedEnd: 'slow CW' }),
  cap(190, 193, { type: 'PrismRotation', speed: 'stop' }),
  cap(194, 255, { type: 'PrismRotation', speedStart: 'slow CCW', speedEnd: 'fast CCW' })
)
fixtures['focus-spot-4z'] = {
  name: 'Focus Spot 4Z',
  categories: ['Moving Head'],
  comment: 'From the ADJ Focus Spot 4Z / 4Z Pearl user manual (rev. 2.0, 3 modes: Basic 16, Standard 18, Extended 22 channels). 200 W cool white LED, motorised focus, 11-22° zoom, 8 colours + white, 6 rotating gobos, 6-facet circular and 5-facet linear prisms.',
  links: { manual: ['https://www.adj.com/focus-spot-4z'] },
  physical: { dimensions: [279, 457, 182], weight: 10, power: 250, bulb: { type: '200W cool white LED' }, lens: { degreesMinMax: [11, 22] } },
  wheels: { 'Color Wheel': { slots: colorSlots(FS4Z_COLORS) }, 'Gobo Wheel': { slots: goboSlots(6) } },
  availableChannels: {
    Pan: pan(540),
    Tilt: tilt(270),
    'Color Wheel': wheel('Color Wheel', [[0, 7, 1], ...slots(8, 7, 8, 2)],
      cap(64, 127, { type: 'Effect', effectName: 'Split colours (colour mixing)' }),
      spin(128, 189, 'fast CW', 'slow CW', 'Color Wheel'), spin(190, 193, 'stop', 'stop', 'Color Wheel'), spin(194, 255, 'slow CCW', 'fast CCW', 'Color Wheel')),
    'Gobo Wheel': wheel('Gobo Wheel', [[0, 4, 1], ...slots(5, 15, 6, 2)],
      ...Array.from({ length: 6 }, (_, i) => shake(95 + i * 15, i === 5 ? 189 : 109 + i * 15, i + 2, 'Gobo Wheel')),
      spin(190, 221, 'fast CW', 'slow CW', 'Gobo Wheel'), spin(222, 223, 'stop', 'stop', 'Gobo Wheel'), spin(224, 255, 'slow CCW', 'fast CCW', 'Gobo Wheel')),
    'Gobo Rotation': caps(
      cap(0, 127, { type: 'WheelSlotRotation', wheel: 'Gobo Wheel', angleStart: '0deg', angleEnd: '360deg', comment: 'Indexing' }),
      cap(128, 191, { type: 'WheelSlotRotation', wheel: 'Gobo Wheel', speedStart: 'fast CW', speedEnd: 'slow CW' }),
      cap(192, 255, { type: 'WheelSlotRotation', wheel: 'Gobo Wheel', speedStart: 'slow CCW', speedEnd: 'fast CCW' })
    ),
    Shutter: strobe([0, 31, 'Closed'], [32, 63, 'Open'], [64, 95, 'Strobe'], [96, 127, 'Open'], [128, 159, 'Pulse'], [160, 191, 'Open'], [192, 223, 'RandomStrobe'], [224, 255, 'Open']),
    Dimmer: { fineChannelAliases: ['Dimmer fine'], capability: { type: 'Intensity' } },
    'Prism 1': caps(cap(32, 255, { type: 'Prism', comment: '6-facet circular' })),
    'Prism 1 Rotation': prismTurn(),
    'Prism 1 Indexing fine': generic('Prism 1 indexing, fine'),
    'Prism 2': caps(cap(32, 63, { type: 'Prism', comment: '5-facet linear' })),
    'Prism 2 Rotation': prismTurn(),
    'Prism 2 Indexing fine': generic('Prism 2 indexing, fine'),
    Focus: { capability: { type: 'Focus', distanceStart: 'far', distanceEnd: 'near' } },
    Zoom: { fineChannelAliases: ['Zoom fine'], ...zoom(11, 22) },
    'Dim Curve': caps(
      cap(0, 20, maintenance('Dim curve: standard')), cap(21, 40, maintenance('Dim curve: stage')), cap(41, 60, maintenance('Dim curve: TV')),
      cap(61, 80, maintenance('Dim curve: architectural')), cap(81, 100, maintenance('Dim curve: theatre')), cap(101, 120, maintenance('Dim curve: stage 2')), cap(121, 255, maintenance('Dim curve: unit setting'))
    ),
    'Pan/Tilt Speed': ptSpeed(),
    Function: caps(
      cap(10, 19, maintenance('Blackout while pan/tilt move')), cap(20, 29, maintenance('Blackout while colour wheel moves')), cap(30, 39, maintenance('Blackout while gobo wheel moves')),
      cap(40, 59, maintenance('Colour and gobo reset')), cap(60, 69, maintenance('Prism reset')), cap(70, 79, maintenance('Pan/tilt reset')), cap(80, 89, maintenance('Focus reset')), cap(90, 99, maintenance('Reset all')),
      ...Array.from({ length: 7 }, (_, i) => cap(100 + i * 20, 119 + i * 20, effect(`Internal program ${i + 1}`)))
    )
  },
  modes: [
    { name: '16-channel (Basic)', shortName: '16ch', channels: ['Pan', 'Tilt', 'Color Wheel', 'Gobo Wheel', 'Gobo Rotation', 'Shutter', 'Dimmer', 'Prism 1', 'Prism 1 Rotation', 'Prism 2', 'Prism 2 Rotation', 'Focus', 'Zoom', 'Dim Curve', 'Pan/Tilt Speed', 'Function'] },
    { name: '18-channel (Standard)', shortName: '18ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Color Wheel', 'Gobo Wheel', 'Gobo Rotation', 'Shutter', 'Dimmer', 'Prism 1', 'Prism 1 Rotation', 'Prism 2', 'Prism 2 Rotation', 'Focus', 'Zoom', 'Dim Curve', 'Pan/Tilt Speed', 'Function'] },
    { name: '22-channel (Extended)', shortName: '22ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Color Wheel', 'Gobo Wheel', 'Gobo Rotation', 'Shutter', 'Dimmer', 'Dimmer fine', 'Prism 1', 'Prism 1 Rotation', 'Prism 1 Indexing fine', 'Prism 2', 'Prism 2 Rotation', 'Prism 2 Indexing fine', 'Focus', 'Zoom', 'Zoom fine', 'Dim Curve', 'Pan/Tilt Speed', 'Function'] }
  ]
}

export function adjFixtures() {
  return fixtures
}
