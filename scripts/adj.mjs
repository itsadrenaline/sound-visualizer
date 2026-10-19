/**
 * ADJ (American DJ) fixtures, written from ADJ's own user manuals in Open Fixture
 * Library format. They replace the Open Fixture Library's entry for the same light.
 */
import { cap, caps, intensity, color, effect, maintenance, strobe } from './ofl-helpers.mjs'

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

export function adjFixtures() {
  return fixtures
}
