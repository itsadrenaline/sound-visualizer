/**
 * BeamZ fixtures, written from BeamZ's (Tronios's) own instruction manuals in Open
 * Fixture Library format. Each comment says which manual and what had to be assumed.
 */
import { cap, caps, intensity, color, generic, maintenance, effect, strobe } from './ofl-helpers.mjs'

const SITE = 'https://www.tronios.com'
const fixtures = {}
const mode = (name, channels) => ({ name, shortName: `${name.replace(/\D.*/, '')}ch`, channels })
const program = (...ranges) => caps(...ranges.map(([lo, hi, name]) => cap(lo, hi, effect(name))))

// --- Double Helix 8x3W RGBW (MHL820, ref 150.303) -------------------------------------------
// Two heads side by side, each a bar of four 3 W LEDs (one red, one green, one blue, one
// white) tilting on its own motor through 135°.
{
  const RGBW = ['Red', 'Green', 'Blue', 'White']
  const head = (n) => RGBW.map((c) => `${c} Head ${n}`)
  // The chart's 16 macro shows (Show channel), as printed.
  const SHOWS = [[8, 22], [23, 37], [38, 52], [53, 67], [68, 82], [83, 97], [98, 112], [113, 127], [128, 142], [143, 157], [158, 173], [174, 187], [188, 202], [203, 217], [218, 232], [233, 247]]

  const tail = ['Show', 'Show Speed', 'Strobe', 'Dimmer']
  fixtures['double-helix-mhl820'] = {
    name: 'Double Helix 8x3W RGBW (MHL820)',
    categories: ['Moving Head', 'Effect'],
    comment:
      "From the BeamZ MHL820 Double Helix instruction manual (ref 150.303; 9, 11, 12, 16 and 18 channels; the 2-channel mode only runs the built-in shows and is left out). Two heads, each a bar of four 3 W LEDs (red, green, blue, white) tilting 135° on its own motor. In 9, 11 and 12 channels the colour is the same on both heads; in 16 and 18 each head has its own. Show speed is sound sensitivity while the random sound show (248-255) runs. Beam angle not printed.",
    links: { manual: [SITE] },
    physical: { dimensions: [280, 160, 150], weight: 2.5, power: 40, bulb: { type: '8 × 3W Cree LEDs: one red, green, blue and white per head' } },
    matrix: { pixelKeys: [[['Head 1', 'Head 2']]] },
    // Each head's own channels ("Tilt Head 1", "Red Head 2").
    templateChannels: {
      'Tilt $pixelKey': { fineChannelAliases: ['Tilt $pixelKey fine'], capability: { type: 'Tilt', angleStart: '0deg', angleEnd: '135deg' } },
      ...Object.fromEntries(RGBW.map((c) => [`${c} $pixelKey`, color(c)]))
    },
    availableChannels: {
      ...Object.fromEntries(RGBW.map((c) => [c, color(c)])),
      Show: program(...SHOWS.map(([lo, hi], i) => [lo, hi, `Macro show ${i + 1}`]), [248, 255, 'Random sound show']),
      'Show Speed': generic('Show speed, slow to fast (sound sensitivity in the sound show)'),
      Strobe: strobe([0, 15, 'Open'], [16, 131, 'Strobe'], [132, 139, 'Open'], [140, 181, 'Pulse'], [182, 189, 'Open'], [190, 231, 'Pulse'], [232, 239, 'Open'], [240, 247, 'RandomStrobe'], [248, 255, 'Open']),
      Dimmer: intensity(),
      'Dimmer Mode': caps(cap(0, 20, maintenance('Dimmer curve: standard')), cap(21, 40, maintenance('Dimmer curve: stage')), cap(41, 60, maintenance('Dimmer curve: TV')), cap(61, 80, maintenance('Dimmer curve: architectural')), cap(81, 100, maintenance('Dimmer curve: theatre')), cap(101, 255, maintenance('Dimmer curve: as set on the unit'))),
      Special: caps(cap(70, 79, maintenance('Blackout while tilting')), cap(90, 99, maintenance('Blackout while the colour changes')), cap(200, 209, maintenance('Reset')))
    },
    modes: [
      mode('9-channel', ['Tilt Head 1', 'Tilt Head 2', ...RGBW, 'Strobe', 'Dimmer', 'Special']),
      mode('11-channel', ['Tilt Head 1', 'Tilt Head 2', ...RGBW, ...tail, 'Special']),
      mode('12-channel', ['Tilt Head 1', 'Tilt Head 2', ...RGBW, ...tail, 'Dimmer Mode', 'Special']),
      mode('16-channel', ['Tilt Head 1', 'Tilt Head 2', ...head(1), ...head(2), ...tail, 'Dimmer Mode', 'Special']),
      mode('18-channel', ['Tilt Head 1', 'Tilt Head 1 fine', 'Tilt Head 2', 'Tilt Head 2 fine', ...head(1), ...head(2), ...tail, 'Dimmer Mode', 'Special'])
    ]
  }
}

// --- SparkleWall LED curtains (refs 151.200 and 151.202) -----------------------------------
// A black curtain with RGBW LEDs over it, hung from a truss; the controller colours the
// whole curtain at once.
{
  const sparkle = (slug, name, ref, size, leds, power) => {
    fixtures[slug] = {
      name,
      categories: ['Color Changer'],
      comment: `From the BeamZ SparkleWall instruction manual (ref ${ref}; 8 channels). An LED curtain (starcloth) hung from a truss: ${leds} RGBW LEDs over ${size[0] / 1000} × ${size[1] / 1000} m of black fire-retardant cloth, all the same colour. The chart calls channel 1 "Display select" without values: taken as the master level, as on similar curtains. Strobe and program ranges aren't printed: 0 is taken as off, the 20 programs spread over 13-255.`,
      links: { manual: [SITE] },
      physical: { dimensions: [size[0], size[1], 10], power, bulb: { type: `${leds} RGBW LEDs` } },
      availableChannels: {
        'Display Select': intensity(),
        Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('White'),
        Strobe: strobe([0, 9, 'Open'], [10, 255, 'Strobe']),
        Program: program(...Array.from({ length: 20 }, (_, i) => [13 + Math.floor((i * 243) / 20), 12 + Math.floor(((i + 1) * 243) / 20), `Program ${i + 1}`])),
        Speed: generic('Program speed, slow to fast')
      },
      modes: [mode('8-channel', ['Display Select', 'Red', 'Green', 'Blue', 'White', 'Strobe', 'Program', 'Speed'])]
    }
  }
  sparkle('sparklewall-led36', 'SparkleWall LED36 RGBW 2x1m (151.202)', '151.202', [2000, 1000], 36, 30)
  sparkle('sparklewall-led96', 'SparkleWall LED96 RGBW 3x2m (151.200)', '151.200', [3000, 2000], 96, 30)
}

export function beamzFixtures() {
  return fixtures
}
