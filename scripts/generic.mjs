/**
 * Generic fixtures that aren't from one maker's manual: an LED acrylic panel (a frosted
 * acrylic panel in a frame, lit from its edges by an RGBW LED strip inside). Open Fixture
 * Library format.
 */
import { color, intensity, strobe } from './ofl-helpers.mjs'

const fixtures = {}
const mode = (name, shortName, channels) => ({ name, shortName, channels })

fixtures['led-acrylic-panel-rgbw'] = {
  name: 'LED Acrylic Panel RGBW',
  categories: ['Color Changer'],
  comment: 'A frosted acrylic panel in a white, black or silver frame, lit from its edges by an RGBW LED strip inside. About 50 × 120 cm; each panel can be given its own size and frame colour. Join several side by side for a booth front or a wall.',
  physical: { dimensions: [500, 1200, 40], bulb: { type: 'RGBW LED strip' } },
  availableChannels: {
    Dimmer: intensity(),
    Red: color('Red'),
    Green: color('Green'),
    Blue: color('Blue'),
    White: color('White'),
    Strobe: strobe([0, 9, 'Open'], [10, 255, 'Strobe'])
  },
  modes: [
    mode('4-channel RGBW', '4ch', ['Red', 'Green', 'Blue', 'White']),
    mode('5-channel Dimmer + RGBW', '5ch', ['Dimmer', 'Red', 'Green', 'Blue', 'White']),
    mode('6-channel Dimmer + RGBW + Strobe', '6ch', ['Dimmer', 'Red', 'Green', 'Blue', 'White', 'Strobe'])
  ]
}

export function genericFixtures() {
  return fixtures
}
