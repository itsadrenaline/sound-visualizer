/**
 * Ayra fixtures written from Ayra's own user manuals, in Open Fixture Library format.
 */
import { cap, caps, color, effect, generic, intensity, pan, tilt, ptSpeed, strobe } from './ofl-helpers.mjs'

const fixtures = {}

// --- ERO 706 (ERO 706 user manual v1.0) ----------------------------------------------
// A wash moving head: 7 × 18 W six-in-one LEDs (red, green, blue, white, amber, UV).
// 11 and 15 channels; the 15-channel mode adds fine pan/tilt, speed and colour macros.
const shutter = () => strobe(
  [0, 7, 'Closed'], [8, 15, 'Open'], [16, 131, 'Strobe'], [132, 139, 'Open'], [140, 181, 'Pulse'], [182, 189, 'Open'],
  [190, 231, 'Pulse'], [232, 239, 'Open'], [240, 247, 'Strobe'], [248, 255, 'Open']
)
fixtures['ero-706'] = {
  name: 'ERO 706',
  categories: ['Moving Head', 'Color Changer'],
  comment: 'From the Ayra ERO 706 user manual (v1.0): RGBWA+UV wash moving head, 7 × 18 W 6-in-1 LEDs, 35° beam, 540° pan / 220° tilt, 11 or 15 channels. "LED quick start" values on the shutter channel light the LEDs.',
  links: { manual: ['https://www.ayra.nl'] },
  physical: { dimensions: [260, 310, 150], power: 75, bulb: { type: '7 × 18W RGBWA+UV 6-in-1 LEDs' }, lens: { degreesMinMax: [35, 35] } },
  availableChannels: {
    Pan: pan(540),
    Tilt: tilt(220),
    'Pan/Tilt Speed': ptSpeed(),
    Dimmer: intensity(),
    Shutter: shutter(),
    Red: color('Red'),
    Green: color('Green'),
    Blue: color('Blue'),
    White: color('White'),
    Amber: color('Amber'),
    UV: color('UV'),
    'Color Macro': caps(cap(8, 255, { type: 'Effect', effectName: 'Colour macros' })),
    'Sound Active': caps(cap(240, 255, { type: 'Effect', effectName: 'Sound active', soundControlled: true }))
  },
  modes: [
    { name: '11-channel', shortName: '11ch', channels: ['Pan', 'Tilt', 'Shutter', 'Red', 'Green', 'Blue', 'White', 'Amber', 'UV', 'Dimmer', 'Sound Active'] },
    { name: '15-channel', shortName: '15ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Pan/Tilt Speed', 'Dimmer', 'Shutter', 'Red', 'Green', 'Blue', 'White', 'Amber', 'UV', 'Color Macro', 'Sound Active'] }
  ]
}

export function ayraFixtures() {
  return fixtures
}
