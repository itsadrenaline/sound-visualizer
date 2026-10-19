/**
 * Laserworld fixtures, written from Laserworld's own manuals in Open Fixture Library
 * format.
 */
import { cap, caps, generic } from './ofl-helpers.mjs'

const SITE = 'https://www.laserworld.com'
const fixtures = {}
const mode = (name, channels) => ({ name, shortName: `${name.replace(/\D.*/, '')}ch`, channels })

// --- EL-900RGB -------------------------------------------------------------------------
// The mode channel switches the laser off (0-49) or on in one of its modes: written as a
// shutter so the twin is dark when it's off. The colour channel picks one of seven colours.
const shutter = (lo, hi, kind, comment) => cap(lo, hi, { type: 'ShutterStrobe', shutterEffect: kind, comment })
const preset = (lo, hi, name, hex) => cap(lo, hi, { type: 'ColorPreset', comment: name, colors: [hex] })
fixtures['el-900rgb'] = {
  name: 'EL-900RGB',
  categories: ['Laser'],
  comment: 'From the Laserworld EL-900RGB manual (9 channels, DIP-switch address). Channel 1 picks the mode: off, sound, automatic, or DMX patterns (static or moving); channel 4 the colour. Size not printed: estimated.',
  links: { manual: [SITE] },
  physical: { dimensions: [240, 100, 260], bulb: { type: 'RGB laser diodes (class 3B)' } },
  availableChannels: {
    Mode: caps(shutter(0, 49, 'Closed', 'Laser off'), shutter(50, 99, 'Open', 'Sound mode'), shutter(100, 149, 'Open', 'Automatic mode'), shutter(150, 199, 'Open', 'DMX: static patterns'), shutter(200, 255, 'Open', 'DMX: dynamic patterns')),
    Pattern: generic('Pattern selection'),
    Strobe: generic('Strobe effect'),
    Colour: caps(preset(0, 39, 'White', '#ffffff'), preset(40, 79, 'Yellow', '#ffff00'), preset(80, 119, 'Purple', '#ff00ff'), preset(120, 159, 'Cyan', '#00ffff'), preset(160, 199, 'Red', '#ff0000'), preset(200, 239, 'Green', '#00ff00'), preset(240, 255, 'Blue', '#0000ff')),
    'X Position': generic('X axis position'),
    'Y Position': generic('Y axis position'),
    'Scan Speed': generic('Scan speed'),
    'Pattern Speed': generic('Dynamic pattern speed'),
    Zoom: generic('Zoom (pattern size)')
  },
  modes: [mode('9-channel', ['Mode', 'Pattern', 'Strobe', 'Colour', 'X Position', 'Y Position', 'Scan Speed', 'Pattern Speed', 'Zoom'])]
}

export function laserworldFixtures() {
  return fixtures
}
