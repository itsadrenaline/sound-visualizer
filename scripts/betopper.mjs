/**
 * Betopper fixtures, written from Betopper's own user manuals (betopperdj.com,
 * each product page ▸ User Manual) in Open Fixture Library format, so they go
 * through the same converter as every other library fixture. Models already in
 * the Open Fixture Library or QLC+ libraries (LM70S, LB150, LB230, L1015, LM108,
 * LPC004/006/007/017/120/1218) are left to those.
 *
 * Where a manual leaves something out, it says so in `comment`:
 *  - strobe channels printed only as "slow to fast": 0-9 is taken as no strobe.
 *  - sizes not printed: typical sizes for the kind of light, marked "estimated".
 *
 * build-library.mjs adds these to resources/library/ofl.json under "Betopper".
 */
import { cap, intensity, color, pan, tilt, ptSpeed, zoom, focus, generic, effect, maintenance, caps, strobe, wheel, spin, shake, goboSpin, slots, colorSlots, goboSlots } from './ofl-helpers.mjs'

const STORE = 'https://betopperdj.com/collections/stage-lighting'
const fixtures = {}

// --- Small helpers for Betopper's usual charts --------------------------------------------

/** "Strobe, slow to fast" with the no-strobe range at the bottom. */
const strobeFrom = (lo = 10) => strobe([0, lo - 1, 'Open'], [lo, 255, 'Strobe'])
/** Program / function channels: [lo, hi, name]; a name of null means "no function" (manual control). */
const program = (...ranges) => caps(...ranges.filter(([, , n]) => n).map(([lo, hi, name]) => cap(lo, hi, { type: 'Effect', effectName: name })))
const speed = (what = 'Effect speed') => generic(what)
const ctoChannel = () => caps(cap(16, 255, { type: 'ColorTemperature', colorTemperatureStart: '2800K', colorTemperatureEnd: '8000K', comment: 'Colour temperature presets' }))
const mode = (name, channels) => ({ name, shortName: `${typeof channels[0] === 'string' ? channels.length : name.replace(/\D.*/, '')}ch`, channels })
/** Cells along a bar or round a light: "Cell 1".."Cell n". */
const cellKeys = (n, prefix = 'Cell ') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const perCell = (keys, order) => ({ insert: 'matrixChannels', repeatFor: keys, channelOrder: 'perPixel', templateChannels: order })

// --- PARs, COB lights and washes -----------------------------------------------------------

fixtures['lpc018'] = {
  name: 'LPC018 54×1.5W RGB PAR',
  categories: ['Color Changer'],
  comment: 'From the LPC018 user manual (7 channels). Size not printed: estimated.',
  links: { manual: [STORE] },
  physical: { dimensions: [180, 190, 100], weight: 0.6, power: 50, bulb: { type: '54 × 1.5W RGB LEDs' }, lens: { degreesMinMax: [25, 25] } },
  availableChannels: {
    Dimmer: intensity(), Red: color('Red'), Green: color('Green'), Blue: color('Blue'),
    Strobe: strobe([0, 0, 'Open'], [1, 9, 'Closed'], [10, 255, 'Strobe']),
    Macro: program([51, 100, 'Colour jump'], [101, 150, 'Colour fade'], [151, 200, 'Colour pulse'], [201, 255, 'Sound active']),
    'Macro Speed': speed('Macro speed')
  },
  modes: [mode('7-channel', ['Dimmer', 'Red', 'Green', 'Blue', 'Strobe', 'Macro', 'Macro Speed'])]
}

fixtures['lpc1818'] = {
  name: 'LPC1818 18×18W RGBALUV PAR',
  categories: ['Color Changer'],
  comment: 'From the LPC1818 user manual. The manual calls the UV channel "purple" (P). Strobe ranges not printed: 0-9 taken as no strobe. Size not printed: estimated.',
  links: { manual: [STORE] },
  physical: { dimensions: [250, 280, 160], weight: 2.6, power: 200, bulb: { type: '18 × 18W RGB+Lime+Amber+UV 6-in-1 LEDs' }, lens: { degreesMinMax: [25, 25] } },
  availableChannels: {
    Dimmer: intensity(), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), Lime: color('Lime'), Amber: color('Amber'), UV: color('UV'),
    Strobe: strobeFrom(10),
    Function: program([51, 100, 'Colour output (8 colours, picked by Function Speed)'], [101, 150, 'Jump'], [151, 200, 'Fade'], [201, 250, 'Pulse'], [251, 255, 'Sound active']),
    'Function Speed': speed('Function speed / colour'),
    CTO: ctoChannel()
  },
  modes: [
    mode('7-channel', ['Red', 'Green', 'Blue', 'Lime', 'Amber', 'UV', 'CTO']),
    mode('11-channel', ['Dimmer', 'Red', 'Green', 'Blue', 'Lime', 'Amber', 'UV', 'Strobe', 'Function', 'Function Speed', 'CTO'])
  ]
}

for (const [slug, model, weight] of [['lpc010n', 'LPC010N', 1.5], ['lpc010', 'LPC010 / LPC010-H / LPC010-B', 2]]) {
  fixtures[slug] = {
    name: `${model} 54×4W RGBW High CRI PAR`,
    categories: ['Color Changer'],
    comment: `From the ${model.split(' ')[0]} user manual (4 and 8 channels). Size not printed: estimated.`,
    links: { manual: [STORE] },
    physical: { dimensions: [250, 280, 170], weight, power: 220, bulb: { type: '54 × 4W RGBW 4-in-1 LEDs, high CRI' }, lens: { degreesMinMax: [25, 25] } },
    availableChannels: {
      Dimmer: intensity(), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('White'),
      Strobe: strobeFrom(10),
      Effect: program([11, 50, 'High CRI colour temperatures (2800K-8000K)'], [51, 100, 'Colour output'], [101, 150, 'Jump'], [151, 200, 'Fade'], [201, 250, 'Pulse'], [251, 255, 'Sound active']),
      Control: caps(cap(11, 20, maintenance('Dimmer curve: linear')), cap(21, 30, maintenance('Dimmer curve: square law')), cap(31, 40, maintenance('Dimmer curve: inverse square law')), cap(41, 50, maintenance('Dimmer curve: S-curve')), cap(51, 60, maintenance('Fan: auto')), cap(61, 70, maintenance('Fan: studio')), cap(81, 255, { type: 'EffectSpeed', speedStart: 'slow', speedEnd: 'fast', comment: 'Effect speed' }))
    },
    modes: [mode('4-channel', ['Red', 'Green', 'Blue', 'White']), mode('8-channel', ['Dimmer', 'Red', 'Green', 'Blue', 'White', 'Strobe', 'Effect', 'Control'])]
  }
}

fixtures['lc005-b'] = {
  name: 'LC005-B 4×50W WW/CW COB PAR with Barn Doors',
  categories: ['Color Changer'],
  comment: 'From the LC005-B user manual (4 and 8 channels). Size not printed: estimated.',
  links: { manual: [STORE] },
  physical: { dimensions: [300, 330, 220], weight: 3.5, power: 200, bulb: { type: '2 × 50W warm white + 2 × 50W cool white COB' }, lens: { degreesMinMax: [40, 40] } },
  availableChannels: {
    Dimmer: intensity(), 'Warm White 1': color('Warm White'), 'Warm White 2': color('Warm White'), 'Cool White 1': color('Cold White'), 'Cool White 2': color('Cold White'),
    Strobe: strobeFrom(10),
    Function: program([1, 62, 'Colour selection (by Mode Value)'], [63, 124, 'Jump'], [125, 186, 'Fade'], [187, 249, 'Pulse'], [250, 255, 'Sound active']),
    'Mode Value': generic('Colour temperature 3000-6500K, colour, effect speed or sound mode')
  },
  modes: [
    mode('4-channel', ['Warm White 1', 'Warm White 2', 'Cool White 1', 'Cool White 2']),
    mode('8-channel', ['Dimmer', 'Warm White 1', 'Warm White 2', 'Cool White 1', 'Cool White 2', 'Strobe', 'Function', 'Mode Value'])
  ]
}

{
  const lamps = ['Cold White 1', 'Amber 1', 'Cold White 2', 'Amber 2', 'Cold White 3', 'Amber 3', 'Cold White 4', 'Amber 4']
  const lampChannels = Object.fromEntries(lamps.map((n) => [n, color(n.startsWith('Amber') ? 'Amber' : 'Cold White')]))
  fixtures['lc500'] = {
    name: 'LC500 4×100W Amber/CW COB Blinder',
    categories: ['Blinder', 'Color Changer'],
    comment: 'From the LC500 user manual: two 12-channel modes (A001 and d001) with the same channels in a different order. Strobe ranges not printed: 0-9 taken as no strobe. Size not printed: estimated.',
    links: { manual: [STORE] },
    physical: { dimensions: [470, 470, 150], weight: 8, power: 500, bulb: { type: '4 × 100W cold white + amber COB' }, lens: { degreesMinMax: [60, 60] } },
    matrix: { pixelKeys: [[['Cell 1', 'Cell 2'], ['Cell 3', 'Cell 4']]] },
    availableChannels: {
      Dimmer: intensity(), ...lampChannels, Strobe: strobeFrom(10),
      Function: program([51, 100, 'Colour selection'], [101, 150, 'Jump'], [151, 200, 'Fade'], [201, 249, 'Pulse'], [250, 255, 'Sound active']),
      'Function Speed': speed('Function speed')
    },
    modes: [
      mode('12-channel (A001)', ['Dimmer', ...lamps, 'Strobe', 'Function', 'Function Speed']),
      mode('12-channel (d001)', ['Dimmer', 'Strobe', 'Function', 'Function Speed', ...lamps])
    ]
  }
}

{
  const ch = {
    Dimmer: intensity(), 'LED 1&2 Dimmer': color('Cold White'), 'LED 3&4 Dimmer': color('Warm White'),
    Fade: generic('Fade'), Strobe: strobeFrom(10),
    'Function Effects': program(...Array.from({ length: 11 }, (_, i) => [21 + i * 20, 40 + i * 20, `Auto ${i + 1}`]), [241, 255, 'Sound active']),
    'Effect Speed': speed('Effect speed'),
    ...Object.fromEntries([1, 2, 3, 4].flatMap((i) => [[`Cool White ${i}`, color('Cold White')], [`Warm White ${i}`, color('Warm White')]]))
  }
  fixtures['lpw0450'] = {
    name: 'LPW0450 4×50W IP65 WW/CW COB PAR',
    categories: ['Color Changer'],
    comment: 'From the LPW0450 user manual (7, 8 and 13 channels). Outdoor (IP65). In 7-channel mode the manual names the two dimmers "LED 1&2" and "LED 3&4". Strobe ranges not printed: 0-9 taken as no strobe. Size not printed: estimated.',
    links: { manual: [STORE] },
    physical: { dimensions: [330, 330, 250], weight: 4.5, power: 220, bulb: { type: '4 × 50W warm + cold white COB' }, lens: { degreesMinMax: [25, 25] } },
    availableChannels: ch,
    modes: [
      mode('7-channel', ['Dimmer', 'LED 1&2 Dimmer', 'LED 3&4 Dimmer', 'Fade', 'Strobe', 'Function Effects', 'Effect Speed']),
      mode('8-channel', ['Cool White 1', 'Cool White 2', 'Cool White 3', 'Cool White 4', 'Warm White 1', 'Warm White 2', 'Warm White 3', 'Warm White 4']),
      mode('13-channel', ['Dimmer', 'Cool White 1', 'Cool White 2', 'Cool White 3', 'Cool White 4', 'Warm White 1', 'Warm White 2', 'Warm White 3', 'Warm White 4', 'Fade', 'Strobe', 'Function Effects', 'Effect Speed'])
    ]
  }
}

{
  const colours = ['Red', 'Green', 'Blue', 'Amber', 'Lime', 'UV']
  fixtures['lpw0918'] = {
    name: 'LPW0918 9×18W IP65 RGBAL+UV PAR',
    categories: ['Color Changer'],
    comment: 'From the LPW0918 user manual (6, 10 and 10A channels). Outdoor (IP65). Strobe ranges not printed: 0-9 taken as no strobe. Size not printed: estimated.',
    links: { manual: [STORE] },
    physical: { dimensions: [300, 300, 220], weight: 4.5, power: 200, bulb: { type: '9 × 18W RGB+Amber+Lime+UV 6-in-1 LEDs' }, lens: { degreesMinMax: [25, 25] } },
    availableChannels: {
      Dimmer: intensity(), ...Object.fromEntries(colours.map((c) => [c, color(c)])), Strobe: strobeFrom(10),
      'Function Effects': program([51, 100, 'Jump'], [101, 150, 'Fade'], [151, 200, 'Pulse'], [201, 255, 'Sound active']),
      'Effect Speed': speed('Effect speed (sound mode: colour)')
    },
    modes: [
      mode('6-channel', colours),
      mode('10-channel', ['Dimmer', ...colours, 'Strobe', 'Function Effects', 'Effect Speed']),
      mode('10-channel (10A)', ['Dimmer', 'Strobe', 'Function Effects', 'Effect Speed', ...colours])
    ]
  }
}

fixtures['lcx200'] = {
  name: 'LCX200 High CRI LED Spotlight',
  categories: ['Dimmer'],
  comment: 'From the LCX200 user manual (2 and 5 channels). Size and beam not printed: estimated.',
  links: { manual: [STORE] },
  physical: { dimensions: [250, 350, 400], power: 200, bulb: { type: '200W white LED, high CRI' }, lens: { degreesMinMax: [20, 20] } },
  availableChannels: {
    Dimmer: intensity(), Strobe: strobeFrom(10),
    Function: program([51, 100, 'Jump'], [101, 150, 'Fade'], [151, 200, 'Pulse'], [201, 230, 'Sound active 1'], [231, 255, 'Sound active 2']),
    'Function Speed': speed('Function speed'), White: color('White')
  },
  modes: [mode('2-channel', ['Dimmer', 'Strobe']), mode('5-channel', ['Dimmer', 'Strobe', 'Function', 'Function Speed', 'White'])]
}

{
  const six = ['Red', 'Green', 'Blue', 'White', 'Amber', 'UV']
  const keys = cellKeys(8, 'Section ')
  fixtures['lw2418'] = {
    name: 'LW2418 24×18W RGBWA+UV Pixel Linear Wash',
    categories: ['Pixel Bar', 'Color Changer'],
    comment: 'From the LW2418 user manual (6, 8, 11, 48 and 50 channels; 8 sections of 3 LEDs). Size not printed: estimated (1 m bar).',
    links: { manual: [STORE] },
    physical: { dimensions: [1000, 120, 120], weight: 2, power: 120, bulb: { type: '24 × 18W RGBWA+UV 6-in-1 LEDs' }, lens: { degreesMinMax: [30, 30] } },
    matrix: { pixelKeys: [[keys]] },
    availableChannels: {
      Dimmer: intensity(), Strobe: strobe([0, 4, 'Open'], [5, 255, 'Strobe']), ...Object.fromEntries(six.map((c) => [c, color(c)])),
      Function: program([10, 19, 'Static colour (Colour)'], [20, 29, 'Breathing'], [30, 39, 'Jump'], [40, 49, 'Fade'], [50, 59, 'Pulse'], ...Array.from({ length: 15 }, (_, i) => [60 + i * 10, 69 + i * 10, `Auto ${i + 1}`]), [210, 239, 'Auto 16 (full colour)'], [240, 244, 'Sound 1'], [245, 249, 'Sound 2'], [250, 255, 'Sound 3']),
      Colour: generic('Static colour / effect speed / sound sensitivity'),
      'Effect Colour': generic('Effect colour')
    },
    templateChannels: Object.fromEntries(six.map((c) => [`$pixelKey ${c}`, color(c)])),
    modes: [
      mode('6-channel', six),
      mode('8-channel', ['Dimmer', 'Strobe', ...six]),
      mode('11-channel', ['Dimmer', 'Strobe', 'Function', 'Colour', 'Effect Colour', ...six]),
      { name: '48-channel', shortName: '48ch', channels: [perCell(keys, six.map((c) => `$pixelKey ${c}`))] },
      { name: '50-channel', shortName: '50ch', channels: ['Dimmer', 'Strobe', perCell(keys, six.map((c) => `$pixelKey ${c}`))] }
    ]
  }
}

// --- Strobe bars and matrix effects --------------------------------------------------------

/** RGB segments (Red/Green/Blue per pixel) plus single-colour white segments, for the pixel modes. */
function segmentTemplates(colours) {
  return Object.fromEntries(colours.map(([name, oflColor]) => [`$pixelKey ${name}`, color(oflColor)]))
}
const rgbTemplates = segmentTemplates([['Red', 'Red'], ['Green', 'Green'], ['Blue', 'Blue']])

{
  const rgb = cellKeys(28, 'RGB ')
  const white = cellKeys(14, 'White ')
  const warm = cellKeys(14, 'Warm ')
  const pairs = cellKeys(14, 'RGB pair ')
  fixtures['lf80'] = {
    name: 'LF80A / LF80S LED Strobe Light Bar',
    categories: ['Strobe', 'Pixel Bar'],
    comment: 'From the LF80A/LF80S user manual (5, 15, 70 and 112 channels): 28 RGB segments, 14 pure white and 14 warm white segments. In 70-channel mode each RGB channel drives two segments (1 and 15, 2 and 16…). Size not printed: estimated (1 m bar).',
    links: { manual: [STORE] },
    physical: { dimensions: [1000, 110, 120], weight: 1.7, power: 120, bulb: { type: '280 × 0.3W RGB + 70 × 1W white/warm white LEDs' }, lens: { degreesMinMax: [120, 120] } },
    matrix: { pixelKeys: [[[...rgb, ...white, ...warm, ...pairs]]], pixelGroups: {} },
    availableChannels: {
      Dimmer: intensity(), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), 'Pure White': color('Cold White'), 'Warm White': color('Warm White'),
      Strobe: strobe([0, 0, 'Open'], [1, 255, 'Strobe']),
      'RGB Effect': program([1, 252, 'RGB effects 1-84'], [253, 254, 'All effects in turn'], [255, 255, 'Sound active']),
      'RGB Speed': speed('RGB effect speed'),
      'White Effect': program([3, 250, 'White effects 1-62'], [251, 254, 'All effects in turn'], [255, 255, 'Sound active']),
      'White Speed': speed('White effect speed'),
      'RGB Effect Colour': caps(cap(11, 40, { type: 'ColorPreset', colors: ['#ff0000'], comment: 'Red' }), cap(41, 70, { type: 'ColorPreset', colors: ['#00ff00'], comment: 'Green' }), cap(71, 100, { type: 'ColorPreset', colors: ['#0000ff'], comment: 'Blue' }), cap(101, 130, { type: 'ColorPreset', colors: ['#ffff00'], comment: 'Red and green' }), cap(131, 160, { type: 'ColorPreset', colors: ['#ff00ff'], comment: 'Red and blue' }), cap(161, 190, { type: 'ColorPreset', colors: ['#00ffff'], comment: 'Green and blue' }), cap(191, 255, { type: 'ColorPreset', colors: ['#ffffff'], comment: 'Red, green and blue' })),
      'White Effect Colour': program([51, 100, 'Pure white'], [101, 150, 'Warm white'], [151, 255, 'Pure and warm white']),
      'Background Colour': generic('RGB background colour'),
      'Background Dimmer': generic('RGB background brightness')
    },
    templateChannels: { ...rgbTemplates, '$pixelKey White': color('Cold White'), '$pixelKey Warm': color('Warm White') },
    modes: [
      mode('5-channel', ['Red', 'Green', 'Blue', 'Pure White', 'Warm White']),
      mode('15-channel', ['Dimmer', 'Red', 'Green', 'Blue', 'Pure White', 'Warm White', 'Strobe', 'RGB Effect', 'RGB Speed', 'White Effect', 'White Speed', 'RGB Effect Colour', 'White Effect Colour', 'Background Colour', 'Background Dimmer']),
      { name: '70-channel', shortName: '70ch', channels: [perCell(pairs, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), perCell(white, ['$pixelKey White']), perCell(warm, ['$pixelKey Warm'])] },
      { name: '112-channel', shortName: '112ch', channels: [perCell(rgb, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), perCell(white, ['$pixelKey White']), perCell(warm, ['$pixelKey Warm'])] }
    ]
  }
  delete fixtures['lf80'].matrix.pixelGroups
}

{
  const rgb = cellKeys(12, 'Cell ')
  fixtures['lf80r'] = {
    name: 'LF80R 36×3W RGB Beam Bar',
    categories: ['Pixel Bar', 'Effect'],
    comment: 'From the LF80R user manual (3, 10 and 36 channels; 12 RGB cells, 4° beams). Size not printed: estimated (1 m bar).',
    links: { manual: [STORE] },
    physical: { dimensions: [1000, 110, 120], weight: 1.7, power: 120, bulb: { type: '36 × 3W RGB 3-in-1 LEDs' }, lens: { degreesMinMax: [4, 4] } },
    matrix: { pixelKeys: [[rgb]] },
    availableChannels: {
      Dimmer: intensity(), Red: color('Red'), Green: color('Green'), Blue: color('Blue'),
      Strobe: strobeFrom(10),
      Function: program([1, 246, 'Effects 1-82'], [247, 250, 'All effects in turn'], [251, 255, 'Sound active']),
      'Function Speed': speed('Function speed'),
      'Background Colour': generic('Background colour'), 'Background Dimmer': generic('Background brightness'),
      'Effect Colour': caps(cap(11, 40, { type: 'ColorPreset', colors: ['#ff0000'] }), cap(41, 70, { type: 'ColorPreset', colors: ['#00ff00'] }), cap(71, 100, { type: 'ColorPreset', colors: ['#0000ff'] }), cap(101, 130, { type: 'ColorPreset', colors: ['#ffff00'] }), cap(131, 160, { type: 'ColorPreset', colors: ['#ff00ff'] }), cap(161, 190, { type: 'ColorPreset', colors: ['#00ffff'] }), cap(191, 255, { type: 'ColorPreset', colors: ['#ffffff'] }))
    },
    templateChannels: rgbTemplates,
    modes: [
      mode('3-channel', ['Red', 'Green', 'Blue']),
      mode('10-channel', ['Dimmer', 'Red', 'Green', 'Blue', 'Strobe', 'Function', 'Function Speed', 'Background Colour', 'Background Dimmer', 'Effect Colour']),
      { name: '36-channel', shortName: '36ch', channels: [perCell(rgb, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue'])] }
    ]
  }
}

{
  const rgb = cellKeys(14, 'RGB ')
  const white = cellKeys(21, 'White ')
  fixtures['lf1421'] = {
    name: 'LF1421 Matrix Beam Strobe Bar',
    categories: ['Strobe', 'Pixel Bar'],
    comment: 'From the LF1421 user manual (4, 16 and 63 channels): 14 RGB segments and 21 white segments. Value ranges of the effect channels not printed.',
    links: { manual: [STORE] },
    physical: { dimensions: [549, 94, 154], weight: 3.1, bulb: { type: '42 × 3W RGB 3-in-1 + white LEDs' }, lens: { degreesMinMax: [4, 4] } },
    matrix: { pixelKeys: [[[...rgb, ...white]]] },
    availableChannels: {
      Dimmer: intensity(), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('Cold White'),
      'RGB Strobe': strobeFrom(10), 'RGB Mode': effect('RGB effects (85)'), 'RGB Speed': speed('RGB effect speed'),
      'White Strobe': generic('White strobe'), 'White Mode': effect('White effects (63)'), 'White Speed': speed('White effect speed'),
      'RGBW Strobe': generic('RGBW strobe'), 'RGBW Mode': effect('RGB and white effects combined'), 'RGBW Speed': speed('RGBW effect speed'),
      'Background Colour': generic('Background colour'), 'Background Dimmer': generic('Background brightness')
    },
    templateChannels: { ...rgbTemplates, '$pixelKey White': color('Cold White') },
    modes: [
      mode('4-channel', ['Red', 'Green', 'Blue', 'White']),
      mode('16-channel', ['Dimmer', 'RGB Strobe', 'Red', 'Green', 'Blue', 'RGB Mode', 'RGB Speed', 'White Strobe', 'White', 'White Mode', 'White Speed', 'RGBW Strobe', 'RGBW Mode', 'RGBW Speed', 'Background Colour', 'Background Dimmer']),
      { name: '63-channel', shortName: '63ch', channels: [perCell(rgb, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), perCell(white, ['$pixelKey White'])] }
    ]
  }
}

{
  const rgb = cellKeys(24, 'RGB ')
  const w35 = cellKeys(24, '3535 White ')
  const w57 = cellKeys(16, '5730 White ')
  fixtures['lf2405'] = {
    name: 'LF2405 300W Matrix Beam Strobe Light',
    categories: ['Strobe', 'Matrix'],
    comment: 'From the LF2405 user manual (5, 11 and 112 channels): 24 RGB segments, 24 "3535" white and 16 "5730" white segments. Size not printed: estimated.',
    links: { manual: [STORE] },
    physical: { dimensions: [500, 200, 120], power: 300, bulb: { type: '384 × 0.3W RGB + white LEDs' }, lens: { degreesMinMax: [120, 120] } },
    matrix: { pixelKeys: [[[...rgb, ...w35, ...w57]]] },
    availableChannels: {
      Dimmer: intensity(), Strobe: strobe([0, 0, 'Open'], [1, 255, 'Strobe']), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), '3535 White': color('Cold White'), '5730 White': color('Cold White'),
      'Colour Selection': generic('Auto effect colour (0-31 changing)'),
      Auto: program([10, 230, 'Auto effects 1-44'], [231, 255, 'Sound effects 1-5']),
      'Auto Speed': speed('Auto speed'),
      'White Choice': program([0, 39, 'RGB only'], [40, 79, '3535 white only'], [80, 119, '5730 white only'], [120, 159, 'RGB + 5730 white'], [160, 199, 'RGB + 3535 white'], [200, 239, '5730 + 3535 white'], [240, 255, 'Everything'])
    },
    templateChannels: { ...rgbTemplates, '$pixelKey W': color('Cold White') },
    modes: [
      mode('5-channel', ['Red', 'Green', 'Blue', '3535 White', '5730 White']),
      mode('11-channel', ['Dimmer', 'Strobe', 'Red', 'Green', 'Blue', '3535 White', '5730 White', 'Colour Selection', 'Auto', 'Auto Speed', 'White Choice']),
      { name: '112-channel', shortName: '112ch', channels: [perCell(rgb, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), perCell(w35, ['$pixelKey W']), perCell(w57, ['$pixelKey W'])] }
    ]
  }
}

{
  const rgb = cellKeys(48, 'Section ')
  const white = cellKeys(8, 'White ')
  fixtures['lf4808'] = {
    name: 'LF4808 260W Matrix Strobe Light',
    categories: ['Strobe', 'Matrix'],
    comment: 'From the LF4808 user manual (4, 15 and 152 channels): 48 RGB sections and 8 white sections. The manual\'s translation names channel 1 "Aiming" (dimmer) and channel 6 "Pigment" (colour). Size not printed: estimated.',
    links: { manual: [STORE] },
    physical: { dimensions: [500, 200, 120], power: 260, bulb: { type: '768 × 0.2W RGB + white LEDs' }, lens: { degreesMinMax: [120, 120] } },
    matrix: { pixelKeys: [[[...rgb, ...white]]] },
    availableChannels: {
      Dimmer: intensity(), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('Cold White'),
      Colour: generic('Colour'), 'RGB Pattern': effect('RGB patterns'), 'RGB Speed': speed('RGB pattern speed'),
      'W Pattern': effect('White patterns'), 'W Speed': speed('White pattern speed'),
      'RGBW Strobe': strobeFrom(10), 'RGBW Pattern': effect('RGBW patterns'), 'RGBW Speed': speed('RGBW pattern speed'),
      'Background Colour': generic('Background colour'), 'Background Dimmer': generic('Background brightness')
    },
    templateChannels: { ...rgbTemplates, '$pixelKey White': color('Cold White') },
    modes: [
      mode('4-channel', ['Red', 'Green', 'Blue', 'White']),
      mode('15-channel', ['Dimmer', 'Red', 'Green', 'Blue', 'White', 'Colour', 'RGB Pattern', 'RGB Speed', 'W Pattern', 'W Speed', 'RGBW Strobe', 'RGBW Pattern', 'RGBW Speed', 'Background Colour', 'Background Dimmer']),
      { name: '152-channel', shortName: '152ch', channels: [perCell(rgb, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), perCell(white, ['$pixelKey White'])] }
    ]
  }
}

fixtures['lf105'] = {
  name: 'LF105 150W Matrix Strobe Effect Light',
  categories: ['Strobe', 'Matrix', 'Effect'],
  comment: 'From the LF105 user manual (8, 9 and 15 channels). Its 945 RGB pixels show built-in letters ("single word" and "double word" modes) and effects, not individual pixels. Size not printed: estimated.',
  links: { manual: [STORE] },
  physical: { dimensions: [500, 200, 110], power: 150, bulb: { type: '945 × 0.2W RGB LEDs' }, lens: { degreesMinMax: [120, 120] } },
  availableChannels: {
    Dimmer: intensity(), Strobe: strobe([0, 0, 'Open'], [1, 255, 'Strobe']), Red: color('Red'), Green: color('Green'), Blue: color('Blue'),
    Mode: program([1, 84, 'Colour selection'], [85, 169, 'Auto'], [170, 255, 'Sound active']),
    'Mode 15': program([6, 55, 'Auto'], [56, 155, 'Single word'], [156, 255, 'Double word']),
    'Auto Mode': program([0, 84, 'Colour selection'], [85, 169, 'Auto'], [170, 255, 'Sound active']),
    'Word Mode': program([1, 127, 'Single word'], [128, 255, 'Double word']),
    'Effect Selection': generic('Colour / static effect / auto effect / sound'),
    'Auto Speed': speed('Auto speed'),
    'Word Effect': effect('Static letters (left)'), 'Word Colour': generic('Letter colour (left, 238-255 auto)'), 'Word Speed': speed('Letter colour speed (left)'),
    'Right Word Effect': effect('Static letters (right)'), 'Right Word Colour': generic('Letter colour (right, 238-255 auto)'), 'Right Word Speed': speed('Letter colour speed (right)'),
    'Auto Colour': generic('Auto effect colour')
  },
  modes: [
    mode('8-channel', ['Dimmer', 'Red', 'Green', 'Blue', 'Strobe', 'Mode', 'Effect Selection', 'Auto Speed']),
    mode('9-channel', ['Dimmer', 'Strobe', 'Word Mode', 'Word Effect', 'Word Colour', 'Word Speed', 'Right Word Effect', 'Right Word Colour', 'Right Word Speed']),
    mode('15-channel', ['Dimmer', 'Strobe', 'Red', 'Green', 'Blue', 'Mode 15', 'Auto Mode', 'Effect Selection', 'Word Effect', 'Word Colour', 'Word Speed', 'Right Word Effect', 'Right Word Colour', 'Right Word Speed', 'Auto Colour'])
  ]
}

// --- Moving heads ---------------------------------------------------------------------------

/** A colour wheel whose manual only numbers the colours: the usual order, said so in the comment. */
const USUAL_COLORS = [['Red', '#ff0000'], ['Orange', '#ff8000'], ['Yellow', '#ffff00'], ['Green', '#00ff00'], ['Light Blue', '#3fb5ff'], ['Blue', '#0000ff'], ['Magenta', '#ff00ff'], ['Pink', '#ff69b4'], ['Cyan', '#00ffff'], ['Lime', '#a6ff00'], ['CTO', '#ffbf6b'], ['Purple', '#8a2be2'], ['Light Green', '#90ee90'], ['Amber', '#ffbf00'], ['Deep Blue', '#1a00b0'], ['Rose', '#ff5070']]
const usualColors = (n) => colorSlots(USUAL_COLORS.slice(0, n))

fixtures['clb260'] = {
  name: 'CLB260 / CLB260-O 9R 260W Beam Moving Head',
  categories: ['Moving Head'],
  comment: 'From the CLB260 user manual (12 channels). The manual numbers the 11 colours without naming them: the usual order is assumed. Beam 2.8° (28° in the spec table is taken to be 2.8°, as the photometric chart shows).',
  links: { manual: [STORE] },
  physical: { dimensions: [275, 428, 199], weight: 6.3, power: 320, bulb: { type: 'Osram Sirius HRI 251W (CLB260-O) or 230W lamp' }, lens: { degreesMinMax: [2.8, 2.8] } },
  wheels: { 'Color Wheel': { slots: usualColors(11) }, 'Gobo Wheel': { slots: goboSlots(13) } },
  availableChannels: {
    Pan: pan(540), Tilt: tilt(270), 'PT Speed': ptSpeed(), Dimmer: intensity(),
    Strobe: strobe([0, 10, 'Closed'], [11, 207, 'Strobe'], [208, 212, 'Open'], [213, 251, 'RandomStrobe'], [252, 255, 'Open']),
    'Color Wheel': wheel('Color Wheel', [[0, 10, 1], ...slots(11, 5, 11, 2)], cap(66, 70, { type: 'WheelSlot', wheel: 'Color Wheel', slotNumber: 1 }), cap(71, 191, { type: 'WheelSlot', wheel: 'Color Wheel', slotNumberStart: 1, slotNumberEnd: 12, comment: 'Index' }), spin(192, 222, 'fast CW', 'slow CW', 'Color Wheel'), spin(225, 255, 'slow CCW', 'fast CCW', 'Color Wheel')),
    Gobo: wheel('Gobo Wheel', [[0, 10, 1], ...slots(11, 5, 13, 2), [76, 80, 1]], ...Array.from({ length: 13 }, (_, i) => shake(81 + i * 7, 87 + i * 7, i + 2, 'Gobo Wheel')), cap(172, 180, { type: 'WheelSlot', wheel: 'Gobo Wheel', slotNumber: 1 }), spin(181, 215, 'fast CW', 'slow CW', 'Gobo Wheel'), spin(221, 255, 'slow CCW', 'fast CCW', 'Gobo Wheel')),
    Prism: caps(cap(11, 127, { type: 'Prism' }), cap(128, 255, { type: 'PrismRotation', speedStart: 'slow CW', speedEnd: 'fast CW' })),
    Frost: caps(cap(128, 255, { type: 'Frost' })),
    Control: caps(cap(41, 70, maintenance('Lamp off')), cap(71, 100, maintenance('Lamp on')), cap(121, 130, maintenance('Pan/tilt reset')), cap(131, 140, maintenance('Effect reset')), cap(141, 150, maintenance('Reset all')))
  },
  modes: [mode('12-channel', ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'PT Speed', 'Dimmer', 'Strobe', 'Color Wheel', 'Gobo', 'Prism', 'Frost', 'Control'])]
}

fixtures['ls35'] = {
  name: 'LS35 30W Mini Moving Head Spot with Ring Effect',
  categories: ['Moving Head'],
  comment: 'From the LS35 user manual (10 and 12 channels). The manual gives the colour and gobo wheels as ranges only (0-139 choose colour, 0-63 fixed gobo): 8 slots each assumed, in the usual colour order. Size not printed: estimated.',
  links: { manual: [STORE] },
  physical: { dimensions: [190, 280, 160], power: 90, bulb: { type: '30W white LED + 12 × 0.2W RGB ring' }, lens: { degreesMinMax: [12, 12] } },
  wheels: { 'Color Wheel': { slots: usualColors(7) }, 'Gobo Wheel': { slots: goboSlots(7) } },
  availableChannels: {
    Pan: pan(540), Tilt: tilt(270),
    Color: wheel('Color Wheel', slots(0, 18, 8).map(([lo, hi, n]) => [lo, Math.min(hi, 139), n]), spin(140, 255, 'slow CW', 'fast CW', 'Color Wheel')),
    Gobo: wheel('Gobo Wheel', slots(0, 8, 8), ...Array.from({ length: 7 }, (_, i) => shake(64 + i * 9, 72 + i * 9, i + 2, 'Gobo Wheel')), spin(128, 255, 'slow CW', 'fast CW', 'Gobo Wheel')),
    Strobe: strobeFrom(10), Dimmer: intensity(),
    'Motor Speed': ptSpeed(),
    'Auto Mode': program([60, 84, 'Auto 3'], [85, 109, 'Auto 2'], [110, 134, 'Auto 1'], [135, 159, 'Auto 0'], [160, 184, 'Sound 3'], [185, 209, 'Sound 2'], [210, 234, 'Sound 1'], [235, 255, 'Sound 0']),
    Reset: caps(cap(250, 255, maintenance('Reset (hold 5 s)'))),
    'LED Ring': program([5, 109, 'Ring colour'], [110, 255, 'Ring auto'])
  },
  modes: [
    mode('10-channel', ['Pan', 'Tilt', 'Color', 'Gobo', 'Strobe', 'Dimmer', 'Motor Speed', 'Auto Mode', 'Reset', 'LED Ring']),
    mode('12-channel', ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Color', 'Gobo', 'Strobe', 'Dimmer', 'Motor Speed', 'Auto Mode', 'Reset', 'LED Ring'])
  ]
}

/** The spider's 25 effect ranges: ten values each, with effect 13 one short (128-136). */
export function spiderEffectRanges() {
  const out = []
  for (let i = 0; i < 12; i++) out.push([8 + i * 10, 17 + i * 10])
  out.push([128, 136])
  for (let i = 0; i < 12; i++) out.push([137 + i * 10, i === 11 ? 255 : 146 + i * 10])
  return out
}

/** The 8-beam "spider": two rows of four LEDs, each row tilting on its own motor. */
export function spider(effects) {
  const front = ['Red 1', 'Green 1', 'Blue 1', 'White 1']
  const back = ['White 2', 'Blue 2', 'Green 2', 'Red 2']
  return {
    categories: ['Moving Head', 'Effect'],
    physical: { dimensions: [280, 150, 100], weight: 2.6, power: 45, bulb: { type: '8 × 3W LEDs (2 each red, green, blue, white)' }, lens: { degreesMinMax: [6, 6] } },
    matrix: { pixelKeys: [[['Front 1', 'Front 2', 'Front 3', 'Front 4'], ['Back 1', 'Back 2', 'Back 3', 'Back 4']]] },
    availableChannels: {
      Tilt: tilt(135, false), 'Tilt 2': generic('Second row tilt, 0-135°'), Dimmer: intensity(), Strobe: strobeFrom(10),
      Effect: program(...spiderEffectRanges().map(([lo, hi], i) => [lo, hi, `Effect ${i + 1}${effects[i] ? ` (${effects[i]})` : ''}`])),
      'Effect Speed': speed('Effect speed'),
      ...Object.fromEntries([...front, ...back].map((n) => [n, color(n.replace(/ \d/, ''))]))
    },
    _front: front,
    _back: back
  }
}

{
  const sp = spider({})
  const { _front, _back, ...base } = sp
  fixtures['lm30a'] = {
    name: 'LM30A 8×3W Mini Spider Moving Head',
    ...base,
    comment: 'From the LM30A user manual (7 and 13 channels). Two rows of four LEDs, each row tilting 0-135° on its own motor (channel 1 and 2). In 13-channel mode the colours run R G B W on the first row and W B G R on the second.',
    links: { manual: [STORE] },
    availableChannels: { ...base.availableChannels, Control: caps(cap(200, 249, maintenance('Reset (hold 3 s)')), cap(250, 255, effect('Sound active, single unit'))), Reset: caps(cap(200, 249, maintenance('Reset (hold 3 s)'))) },
    modes: [
      mode('7-channel', ['Tilt', 'Tilt 2', 'Dimmer', 'Strobe', 'Effect', 'Effect Speed', 'Control']),
      mode('13-channel', ['Tilt', 'Tilt 2', 'Dimmer', 'Strobe', ..._front, ..._back, 'Reset'])
    ]
  }
}

/** Betopper's usual shutter: closed, strobe, open, pulse, open, random strobe, open. */
const pulseStrobe = () => strobe([0, 3, 'Closed'], [4, 103, 'Strobe'], [104, 107, 'Open'], [108, 207, 'Pulse'], [208, 212, 'Open'], [213, 251, 'RandomStrobe'], [252, 255, 'Open'])
/** A ring of LEDs round the lens ("light strip", "halo") as its own part, for the converter. */
const HALO = { pixelKeys: [[['Halo']]] }
const halo = (order) => ({ insert: 'matrixChannels', repeatFor: ['Halo'], channelOrder: 'perPixel', templateChannels: order })

fixtures['lm120'] = {
  name: 'LM120 Demon\'s Eye 120W RGBW Moving Head',
  categories: ['Moving Head'],
  comment: 'From the LM120 user manual (23 channels). A 120W RGBW COB with a ring of 26 RGB LEDs ("strip") that has its own dimmer, strobe, colour and effects. Size not printed: estimated.',
  links: { manual: [STORE] },
  physical: { dimensions: [220, 330, 180], weight: 2.5, power: 180, bulb: { type: '120W RGBW COB + 26 × 0.2W RGB ring' }, lens: { degreesMinMax: [15, 15] } },
  matrix: HALO,
  availableChannels: {
    Pan: pan(540), Tilt: tilt(270), 'Motor Speed': ptSpeed(), Dimmer: intensity(), Strobe: pulseStrobe(),
    Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('White'),
    'Colour Temperature': caps(cap(1, 255, { type: 'ColorTemperature', colorTemperatureStart: '8500K', colorTemperatureEnd: '2800K' })),
    'Color Macro': caps(cap(10, 255, effect('Colour macros'))),
    Program: program([1, 25, 'Fade'], [26, 51, 'Chase'], [52, 77, 'Rainbow'], ...Array.from({ length: 7 }, (_, i) => [78 + i * 26, i === 6 ? 255 : 103 + i * 26, `Fade ${i + 1}`])),
    'Effect Speed': speed('Program speed'),
    'Strip Effect': program([1, 63, 'Ring effect 1'], [64, 127, 'Ring effect 2'], [128, 191, 'Ring effect 3'], [192, 255, 'Ring effect 4']),
    'Strip Speed': speed('Ring effect speed'),
    Reset: caps(cap(10, 199, effect('Auto')), cap(200, 204, maintenance('Reset (hold 5 s)')))
  },
  templateChannels: { '$pixelKey Dimmer': intensity(), '$pixelKey Strobe': pulseStrobe(), '$pixelKey Red': color('Red'), '$pixelKey Green': color('Green'), '$pixelKey Blue': color('Blue') },
  modes: [{ name: '23-channel', shortName: '23ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Motor Speed', 'Dimmer', 'Strobe', 'Red', 'Green', 'Blue', 'White', 'Colour Temperature', 'Color Macro', 'Program', 'Effect Speed', halo(['$pixelKey Dimmer', '$pixelKey Strobe', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Strip Effect', 'Strip Speed', 'Reset'] }]
}

/** Colour temperature presets in ranges: [lo, hi, kelvin]. */
const cctPresets = (list) => caps(...list.map(([lo, hi, k]) => cap(lo, hi, { type: 'ColorTemperature', colorTemperature: `${k}K` })))
const LM0740_CCT = [[1, 27, 8500], [28, 55, 7500], [56, 83, 6800], [84, 111, 6200], [112, 139, 5600], [140, 167, 5000], [168, 195, 4500], [196, 223, 3600], [224, 251, 3200], [252, 255, 2800]]

fixtures['lm0740'] = {
  name: 'LM0740 7×40W RGBW Wash & Zoom Moving Head',
  categories: ['Moving Head', 'Color Changer'],
  comment: 'From the LM0740 user manual (18-channel STD and 12-channel HSI modes). Zoom range not printed: estimated.',
  links: { manual: [STORE] },
  physical: { dimensions: [273, 340, 172], power: 350, bulb: { type: '7 × 40W RGBW 4-in-1 LEDs' }, lens: { degreesMinMax: [8, 40] } },
  availableChannels: {
    Pan: pan(540), Tilt: tilt(270), 'PT Speed': ptSpeed(), Dimmer: intensity(), Strobe: pulseStrobe(),
    Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('White'),
    Hue: generic('Hue ("chroma")'),
    Saturation: generic('Saturation'),
    CCT: cctPresets(LM0740_CCT),
    Macro: effect('Colour macros'),
    Zoom: zoom(40, 8),
    'Zoom Rotation': caps(cap(0, 127, { type: 'Generic', comment: 'Front lens position' }), cap(128, 190, { type: 'Rotation', speedStart: 'fast CW', speedEnd: 'slow CW' }), cap(191, 192, { type: 'Rotation', speed: 'stop' }), cap(193, 255, { type: 'Rotation', speedStart: 'slow CCW', speedEnd: 'fast CCW' })),
    Effect: program([1, 25, 'Wave'], [26, 51, 'Dream'], [52, 77, 'Colour chase'], [78, 103, 'Red wave'], [104, 129, 'Green wave'], [130, 155, 'Blue wave'], [156, 181, 'Yellow wave'], [182, 207, 'Magenta wave'], [208, 233, 'Cyan wave'], [234, 255, 'White wave']),
    'Effect Speed': speed('Effect speed'),
    Reset: caps(cap(240, 244, maintenance('Reset motors (hold 5 s)')), cap(245, 249, effect('Sound active')), cap(250, 255, effect('Auto')))
  },
  modes: [
    mode('12-channel (HSI)', ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'PT Speed', 'Dimmer', 'Strobe', 'Hue', 'Saturation', 'Zoom', 'Zoom Rotation', 'Reset']),
    mode('18-channel (STD)', ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'PT Speed', 'Dimmer', 'Strobe', 'Red', 'Green', 'Blue', 'White', 'CCT', 'Macro', 'Zoom', 'Zoom Rotation', 'Effect', 'Effect Speed', 'Reset'])
  ]
}

/** Two-colour (half) positions between each pair of colours: [lo, hi, from, to] slots for OFL. */
const halfColours = (start, step, n) => Array.from({ length: n }, (_, i) => cap(start + i * step, start + i * step + step - 1, { type: 'WheelSlot', wheel: 'Color Wheel', slotNumber: i + 1.5 }))

fixtures['bsw200'] = {
  name: 'BSW200 200W Spot Beam Wash Hybrid Moving Head',
  categories: ['Moving Head'],
  comment: 'From the BSW200 user manual (23 channels). The manual numbers the 8 colours without naming them: the usual order is assumed. A ring of 24 RGB LEDs ("LED strip") has its own colour and effect channels. Size not printed: estimated.',
  links: { manual: [STORE] },
  physical: { dimensions: [280, 450, 220], weight: 7, power: 240, bulb: { type: '150W white LED + 24 × 0.2W RGB ring' }, lens: { degreesMinMax: [7, 21] } },
  matrix: HALO,
  wheels: { 'Color Wheel': { slots: usualColors(8).slice(1) }, 'Gobo Wheel': { slots: goboSlots(8).slice(1) }, 'Rotating Gobo Wheel': { slots: goboSlots(7) } },
  availableChannels: {
    Pan: pan(540), Tilt: tilt(270), 'Pan/Tilt Speed': ptSpeed(), Dimmer: intensity(), Strobe: strobe([0, 0, 'Open'], [1, 255, 'Strobe']),
    'Color Wheel': wheel('Color Wheel', slots(0, 8, 8), ...halfColours(64, 8, 8), spin(128, 191, 'fast CW', 'slow CW', 'Color Wheel'), spin(192, 255, 'slow CCW', 'fast CCW', 'Color Wheel')),
    Gobo: wheel('Gobo Wheel', slots(0, 8, 8), ...Array.from({ length: 7 }, (_, i) => shake(64 + i * 8, 71 + i * 8, 8 - i, 'Gobo Wheel')), spin(120, 187, 'fast CW', 'slow CW', 'Gobo Wheel'), spin(188, 255, 'slow CCW', 'fast CCW', 'Gobo Wheel')),
    'Rotating Gobo': wheel('Rotating Gobo Wheel', slots(0, 8, 8), ...Array.from({ length: 7 }, (_, i) => shake(64 + i * 8, 71 + i * 8, 8 - i, 'Rotating Gobo Wheel')), spin(120, 187, 'fast CW', 'slow CW', 'Rotating Gobo Wheel'), spin(188, 255, 'slow CCW', 'fast CCW', 'Rotating Gobo Wheel')),
    'Gobo Rotation': caps(cap(5, 127, { type: 'WheelSlotRotation', wheel: 'Rotating Gobo Wheel', speedStart: 'fast CW', speedEnd: 'slow CW' }), cap(128, 255, { type: 'WheelSlotRotation', wheel: 'Rotating Gobo Wheel', speedStart: 'slow CCW', speedEnd: 'fast CCW' })),
    Prism: caps(cap(128, 255, { type: 'Prism' })),
    'Prism Rotation': caps(cap(5, 127, { type: 'PrismRotation', speedStart: 'fast CW', speedEnd: 'slow CW' }), cap(128, 255, { type: 'PrismRotation', speedStart: 'slow CCW', speedEnd: 'fast CCW' })),
    Frost: caps(cap(128, 255, { type: 'Frost' })),
    'Focus 1': focus(), 'Focus 2': generic('Focus 2'),
    'Auto Mode': program([10, 239, 'Auto'], [240, 255, 'Sound active']),
    Reset: caps(cap(250, 255, maintenance('Reset (hold 5 s)'))),
    'Strip Effect': effect('Ring effects'), 'Strip Speed': speed('Ring effect speed (fast to slow)')
  },
  templateChannels: { '$pixelKey Red': color('Red'), '$pixelKey Green': color('Green'), '$pixelKey Blue': color('Blue') },
  modes: [{ name: '23-channel', shortName: '23ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Pan/Tilt Speed', 'Dimmer', 'Strobe', 'Color Wheel', 'Gobo', 'Rotating Gobo', 'Gobo Rotation', 'Prism', 'Prism Rotation', 'Frost', 'Focus 1', 'Focus 2', 'Auto Mode', 'Reset', halo(['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Strip Effect', 'Strip Speed'] }]
}

{
  const colourWheel = (name) => generic(`${name}: 0-31 open, 32-80 colour 1, 81-127 colour 2, 128-191 spin one way (fast to slow), 192-255 the other (slow to fast)`)
  const prismRot = (n) => caps(cap(0, 127, { type: 'PrismRotation', angleStart: '0deg', angleEnd: '360deg' }), cap(128, 187, { type: 'PrismRotation', speedStart: 'fast CW', speedEnd: 'slow CW' }), cap(188, 195, { type: 'PrismRotation', speed: 'stop' }), cap(196, 255, { type: 'PrismRotation', speedStart: 'slow CCW', speedEnd: 'fast CCW' }))
  fixtures['bsw500'] = {
    name: 'BSW500 500W CMY + CTO Spot Beam Wash Hybrid Moving Head',
    categories: ['Moving Head'],
    comment: 'From the BSW500 user manual (29-channel LIST-1 and 27-channel LIST-2). The manual says its table is "for reference only". Its three colour wheels are given as "colour 1/colour 2" without names, so they are kept as plain channels; CMY does the colour on the twin. Size not printed: estimated.',
    links: { manual: [STORE] },
    physical: { dimensions: [400, 680, 300], power: 650, bulb: { type: '500W white LED' }, lens: { degreesMinMax: [2, 40] } },
    wheels: { 'Gobo Wheel': { slots: goboSlots(7) }, 'Rotating Gobo Wheel': { slots: goboSlots(7) } },
    availableChannels: {
      Pan: pan(540), Tilt: tilt(270), 'PT Speed': ptSpeed(),
      Reset: caps(cap(210, 215, maintenance('Reset pan/tilt (hold 3 s)')), cap(220, 235, maintenance('Reset effects (hold 3 s)')), cap(240, 255, maintenance('Reset all (hold 3 s)'))),
      Strobe: strobe([0, 3, 'Closed'], [4, 103, 'Pulse'], [104, 107, 'Open'], [108, 155, 'Strobe'], [156, 207, 'RandomStrobe'], [208, 212, 'Open'], [213, 251, 'RandomStrobe'], [252, 255, 'Open']),
      Dimmer: intensity(),
      Cyan: color('Cyan'), Magenta: color('Magenta'), Yellow: color('Yellow'),
      CTO: caps(cap(0, 255, { type: 'ColorTemperature', colorTemperatureStart: 'default', colorTemperatureEnd: 'warm' })),
      Colour: colourWheel('Colour wheel 1'), Color1: colourWheel('Colour wheel 2'), Color2: colourWheel('Colour wheel 3'), Color3: generic('Colour wheel 4 (ranges not described)'),
      Gobo: wheel('Gobo Wheel', [[0, 9, 1], ...slots(10, 10, 7, 2), [80, 84, 1]], ...[1, 3, 4, 5, 6, 7, 8].map((g, i) => shake(85 + i * 5, 89 + i * 5, g, 'Gobo Wheel')), spin(120, 187, 'fast CW', 'slow CW', 'Gobo Wheel'), spin(188, 255, 'slow CCW', 'fast CCW', 'Gobo Wheel')),
      'Eft Gobo': caps(cap(10, 255, { type: 'Rotation', speedStart: 'slow', speedEnd: 'fast', comment: 'Effect wheel' })),
      'Rot Gobo': wheel('Rotating Gobo Wheel', [[0, 7, 1], ...slots(8, 8, 7, 2)], ...Array.from({ length: 7 }, (_, i) => shake(64 + i * 8, 71 + i * 8, i + 2, 'Rotating Gobo Wheel')), spin(120, 185, 'fast CW', 'slow CW', 'Rotating Gobo Wheel'), cap(186, 189, { type: 'WheelRotation', wheel: 'Rotating Gobo Wheel', speed: 'stop' }), spin(190, 255, 'slow CCW', 'fast CCW', 'Rotating Gobo Wheel')),
      'Gobo Rotation': { fineChannelAliases: ['Gobo Rotation fine'], ...caps(cap(0, 127, { type: 'WheelSlotRotation', wheel: 'Rotating Gobo Wheel', angleStart: '0deg', angleEnd: '360deg' }), cap(128, 190, { type: 'WheelSlotRotation', wheel: 'Rotating Gobo Wheel', speedStart: 'fast CCW', speedEnd: 'slow CCW' }), cap(191, 192, { type: 'WheelSlotRotation', wheel: 'Rotating Gobo Wheel', speed: 'stop' }), cap(193, 255, { type: 'WheelSlotRotation', wheel: 'Rotating Gobo Wheel', speedStart: 'slow CW', speedEnd: 'fast CW' })) },
      Prism1: caps(cap(128, 255, { type: 'Prism', comment: 'Prism 1' })), 'Prism1 Rotation': prismRot(1),
      Prism2: caps(cap(128, 255, { type: 'Prism', comment: 'Prism 2' })), 'Prism2 Rotation': prismRot(2),
      Frost: caps(cap(128, 255, { type: 'Frost' })),
      Zoom: zoom(40, 2),
      Focus: { fineChannelAliases: ['Focus fine'], capability: { type: 'Focus', distanceStart: 'far', distanceEnd: 'near' } }
    },
    modes: [
      mode('27-channel (LIST-2)', ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'PT Speed', 'Reset', 'Strobe', 'Dimmer', 'Cyan', 'Magenta', 'Yellow', 'CTO', 'Colour', 'Color1', 'Color2', 'Color3', 'Gobo', 'Eft Gobo', 'Rot Gobo', 'Gobo Rotation', 'Prism1', 'Prism1 Rotation', 'Prism2', 'Prism2 Rotation', 'Frost', 'Zoom', 'Focus']),
      mode('29-channel (LIST-1)', ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'PT Speed', 'Reset', 'Strobe', 'Dimmer', 'Cyan', 'Magenta', 'Yellow', 'CTO', 'Colour', 'Color1', 'Color2', 'Color3', 'Gobo', 'Eft Gobo', 'Rot Gobo', 'Gobo Rotation', 'Gobo Rotation fine', 'Prism1', 'Prism1 Rotation', 'Prism2', 'Prism2 Rotation', 'Frost', 'Zoom', 'Focus', 'Focus fine'])
    ]
  }
}

/** Colours with half positions between them: open at 0-4, colour k at 10k…10k+4, halves in between. */
function halfStepColourWheel(n, rotateFrom, fwdEnd = 202, revStart = 203) {
  const out = [cap(0, 4, { type: 'WheelSlot', wheel: 'Color Wheel', slotNumber: 1 })]
  for (let k = 0; k <= n; k++) {
    out.push(cap(5 + k * 10, 9 + k * 10, { type: 'WheelSlot', wheel: 'Color Wheel', slotNumber: k + 1.5 }))
    if (k < n) out.push(cap(10 + k * 10, 14 + k * 10, { type: 'WheelSlot', wheel: 'Color Wheel', slotNumber: k + 2 }))
  }
  const stop = revStart > fwdEnd + 1 ? [cap(fwdEnd + 1, revStart - 1, { type: 'WheelRotation', wheel: 'Color Wheel', speed: 'stop' })] : []
  return caps(...out.filter((c) => c.dmxRange[1] < rotateFrom), spin(rotateFrom, fwdEnd, 'fast CW', 'slow CW', 'Color Wheel'), ...stop, spin(revStart, 255, 'slow CCW', 'fast CCW', 'Color Wheel'))
}
const prismIndex = () => caps(cap(0, 127, { type: 'PrismRotation', angleStart: '0deg', angleEnd: '360deg' }), cap(128, 190, { type: 'PrismRotation', speedStart: 'fast CW', speedEnd: 'slow CW' }), cap(191, 192, { type: 'PrismRotation', speed: 'stop' }), cap(193, 255, { type: 'PrismRotation', speedStart: 'slow CCW', speedEnd: 'fast CCW' }))

fixtures['lb300'] = {
  name: 'LB300 300W Beam Moving Head',
  categories: ['Moving Head'],
  comment: 'From the LB300 user manual (18 channels). The manual numbers the 15 colours without naming them: the usual order is assumed. Size not printed: estimated.',
  links: { manual: [STORE] },
  physical: { dimensions: [330, 520, 250], power: 500, bulb: { type: '300W lamp' }, lens: { degreesMinMax: [2, 2] } },
  wheels: { 'Color Wheel': { slots: usualColors(15) }, 'Gobo Wheel': { slots: goboSlots(13) } },
  availableChannels: {
    Pan: pan(540), Tilt: tilt(270), 'PT Speed': ptSpeed(),
    Frost: caps(cap(128, 191, { type: 'Effect', effectName: 'Colourful filter' }), cap(192, 255, { type: 'Frost' })),
    Strobe: strobe([0, 3, 'Closed'], [4, 103, 'Pulse'], [104, 107, 'Open'], [108, 207, 'Strobe'], [208, 212, 'Open'], [213, 251, 'RandomStrobe'], [252, 255, 'Open']),
    Dimmer: intensity(),
    Colour: halfStepColourWheel(15, 150),
    Gobo: wheel('Gobo Wheel', [[0, 4, 1], ...slots(5, 5, 13, 2)], spin(70, 128, 'fast CCW', 'slow CCW', 'Gobo Wheel'), cap(129, 131, { type: 'WheelRotation', wheel: 'Gobo Wheel', speed: 'stop' }), spin(132, 190, 'slow CW', 'fast CW', 'Gobo Wheel'), ...Array.from({ length: 13 }, (_, i) => shake(191 + i * 5, 195 + i * 5, i + 2, 'Gobo Wheel'))),
    Prism1: caps(cap(128, 255, { type: 'Prism', comment: 'Prism 1' })), 'Prism1 Rotation': prismIndex(),
    Prism2: caps(cap(128, 255, { type: 'Prism', comment: 'Prism 2' })), 'Prism2 Rotation': prismIndex(),
    Focus: { capability: { type: 'Focus', distanceStart: 'far', distanceEnd: 'near' } },
    Reset: caps(cap(26, 76, maintenance('Reset effects (hold 4 s)')), cap(77, 127, maintenance('Reset pan/tilt (hold 4 s)')), cap(128, 255, maintenance('Reset all (hold 4 s)'))),
    Effect: effect('Built-in effects'), 'Effect Speed': speed('Effect speed')
  },
  modes: [mode('18-channel', ['Pan', 'Tilt', 'Pan fine', 'Tilt fine', 'PT Speed', 'Frost', 'Strobe', 'Dimmer', 'Colour', 'Gobo', 'Prism1', 'Prism1 Rotation', 'Prism2', 'Prism2 Rotation', 'Focus', 'Reset', 'Effect', 'Effect Speed'])]
}

fixtures['lb295'] = {
  name: 'LB295 295W Beam Moving Head',
  categories: ['Moving Head'],
  comment: 'From the LB295 user manual (16 channels). The manual says its table is "for reference only" and numbers the 15 colours without naming them: the usual order is assumed. Size not printed: estimated.',
  links: { manual: [STORE] },
  physical: { dimensions: [330, 520, 250], weight: 12.5, power: 450, bulb: { type: '295W lamp' }, lens: { degreesMinMax: [2.2, 2.2] } },
  wheels: { 'Color Wheel': { slots: usualColors(15) }, 'Gobo Wheel': { slots: goboSlots(13) } },
  availableChannels: {
    ...fixtures['lb300'].availableChannels,
    '7 Color': caps(cap(128, 255, { type: 'Effect', effectName: 'Colourful filter' })),
    Colour: halfStepColourWheel(15, 150, 201, 204),
    Frost: caps(cap(128, 255, { type: 'Frost' })),
    Reset: caps(cap(100, 105, maintenance('Lamp off (hold 3 s)')), cap(200, 205, maintenance('Lamp on (hold 3 s)')), cap(210, 215, maintenance('Reset pan/tilt (hold 3 s)')), cap(220, 235, maintenance('Reset effects (hold 3 s)')), cap(240, 255, maintenance('Reset all (hold 3 s)')))
  },
  modes: [mode('16-channel', ['Pan', 'Tilt', 'Pan fine', 'Tilt fine', 'PT Speed', '7 Color', 'Strobe', 'Dimmer', 'Colour', 'Gobo', 'Prism1', 'Prism2', 'Prism1 Rotation', 'Frost', 'Focus', 'Reset'])]
}

{
  const zones = ['Zone 1', 'Zone 2', 'Zone 3']
  fixtures['lm1915r'] = {
    name: 'LM1915R 19×15W RGBW Wash Moving Head with Halo Ring',
    categories: ['Moving Head', 'Color Changer'],
    comment: 'From the LM1915R user manual (15, 24 and 32 channels). The 19 LEDs are in three zones in 32-channel mode; the "auxiliary light" is the RGB halo ring. The manual gives no value ranges for the mode, speed and strobe channels: strobe 0-9 taken as no strobe.',
    links: { manual: [STORE] },
    physical: { dimensions: [325, 430, 210], weight: 6.4, power: 300, bulb: { type: '19 × 15W RGBW 4-in-1 LEDs + RGB halo ring' }, lens: { degreesMinMax: [20, 40] } },
    matrix: { pixelKeys: [[[...zones, 'Halo']]] },
    availableChannels: {
      Pan: pan(540), Tilt: tilt(270), 'Pan/Tilt Speed': ptSpeed(), Zoom: zoom(20, 40), Dimmer: intensity(),
      Strobe: strobeFrom(10), 'Main Strobe': strobeFrom(10),
      Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('White'),
      Mode: effect('Built-in programs'), Speed: speed('Program speed'),
      'Halo Mode': effect('Halo programs'), 'Halo Speed': speed('Halo program speed'),
      'Background Colour': generic('Halo background colour'), 'Background Dimmer': generic('Halo background colour adjustment'),
      Reset: caps(cap(250, 255, maintenance('Reset (lower below 10 first)')))
    },
    templateChannels: { '$pixelKey Red': color('Red'), '$pixelKey Green': color('Green'), '$pixelKey Blue': color('Blue'), '$pixelKey White': color('White'), '$pixelKey Strobe': strobeFrom(10) },
    modes: [
      mode('15-channel', ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Pan/Tilt Speed', 'Zoom', 'Dimmer', 'Strobe', 'Red', 'Green', 'Blue', 'White', 'Mode', 'Speed', 'Reset']),
      { name: '24-channel', shortName: '24ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Pan/Tilt Speed', 'Zoom', 'Dimmer', 'Strobe', 'Main Strobe', 'Red', 'Green', 'Blue', 'White', 'Mode', 'Speed', halo(['$pixelKey Strobe', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Halo Mode', 'Halo Speed', 'Background Colour', 'Background Dimmer', 'Reset'] },
      { name: '32-channel', shortName: '32ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Pan/Tilt Speed', 'Zoom', 'Dimmer', 'Strobe', 'Main Strobe', perCell(zones, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue', '$pixelKey White']), 'Mode', 'Speed', halo(['$pixelKey Strobe', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Halo Mode', 'Halo Speed', 'Background Colour', 'Background Dimmer', 'Reset'] }
    ]
  }
}

{
  const zones = ['Zone 1', 'Zone 2', 'Zone 3']
  // The 6 small RGB LEDs round each of the 19 lenses ("aux"): all together, or one ring per lens.
  const rings = cellKeys(19, 'Lens Ring ')
  const ringGroup = (order) => ({ insert: 'matrixChannels', repeatFor: ['Lens Ring'], channelOrder: 'perPixel', templateChannels: order })
  const head = ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Pan/Tilt Speed', 'Zoom', 'Dimmer', 'Strobe']
  const auxBlock = [ringGroup(['$pixelKey Dimmer', '$pixelKey Strobe', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Aux Effect', 'Aux Characters']
  const stripBlock = [halo(['$pixelKey Dimmer', '$pixelKey Strobe', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Strip Effect', 'Strip Speed', 'Control']
  fixtures['lm1915p'] = {
    name: 'LM1915P 19×15W RGBW Pixel Wash Moving Head with Halo Ring',
    categories: ['Moving Head', 'Color Changer'],
    comment: 'From the LM1915P user manual (30, 38 and 99 channels). Each of the 19 LEDs has a ring of 6 small RGB LEDs ("aux", 114 in all, which can also show letters): these are the "Lens Ring" parts. A halo strip ("strip") runs round the head. In 99-channel mode the three LED zones and the 19 lens rings are controlled one by one; the aux master dimmer, strobe and colour still apply.',
    links: { manual: [STORE] },
    physical: { dimensions: [325, 430, 210], weight: 6.5, power: 300, bulb: { type: '19 × 15W RGBW 4-in-1 LEDs + 114 × 0.2W RGB lens rings + halo strip' }, lens: { degreesMinMax: [15, 40] } },
    matrix: { pixelKeys: [[[...zones, 'Lens Ring', ...rings, 'Halo']]] },
    availableChannels: {
      Pan: pan(540), Tilt: tilt(270), 'Pan/Tilt Speed': ptSpeed(), Zoom: zoom(15, 40), Dimmer: intensity(), Strobe: strobeFrom(10),
      Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('White'),
      CTO: caps(cap(0, 255, { type: 'ColorTemperature', colorTemperatureStart: 'warm', colorTemperatureEnd: 'cold' })),
      'RGBW Effect': program(...Array.from({ length: 15 }, (_, i) => [16 + i * 16, 31 + i * 16, `Auto ${i + 1}`])),
      'RGBW Speed': speed('RGBW effect speed'),
      'Aux Effect': program([8, 15, 'Letters (Aux Characters)'], [16, 253, 'Aux auto 1-119'], [254, 255, 'Aux auto, all']),
      'Aux Characters': generic('Aux letter / effect selection and speed'),
      'Strip Effect': program(...Array.from({ length: 31 }, (_, i) => [8 + i * 8, 15 + i * 8, `Strip auto ${i + 1}`])),
      'Strip Speed': speed('Strip effect speed'),
      Control: caps(cap(100, 119, effect('Auto')), cap(120, 139, effect('Random auto')), cap(200, 239, effect('Sound active')), cap(240, 255, maintenance('Reset'))),
    },
    templateChannels: { '$pixelKey Dimmer': intensity(), '$pixelKey Strobe': strobeFrom(10), '$pixelKey Red': color('Red'), '$pixelKey Green': color('Green'), '$pixelKey Blue': color('Blue'), '$pixelKey White': color('White') },
    modes: [
      { name: '30-channel', shortName: '30ch', channels: [...head, 'Red', 'Green', 'Blue', 'White', 'CTO', 'RGBW Effect', 'RGBW Speed', ...auxBlock, ...stripBlock] },
      { name: '38-channel', shortName: '38ch', channels: [...head, ...[perCell(zones, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue', '$pixelKey White'])], 'CTO', 'RGBW Effect', 'RGBW Speed', ...auxBlock, ...stripBlock] },
      { name: '99-channel', shortName: '99ch', channels: [...head, 'Red', 'Green', 'Blue', 'White', 'CTO', 'RGBW Effect', 'RGBW Speed', ...auxBlock, ...stripBlock, ...[perCell(zones, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue', '$pixelKey White'])], perCell(rings, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue'])] }
    ]
  }
}

// --- LM1925 / LM1925R / LM1940: 19-LED bee-eye zoom washes ---------------------------------
// One channel chart family: 16-bit RGBW, a front lens that turns ("zoom rotation"), shapes
// drawn across the 19 LEDs over a background colour, and per-LED modes.
{
  const leds = cellKeys(19, 'LED ')
  const zoomRotation = () => caps(cap(0, 127, { type: 'Generic', comment: 'Front lens position, 0-60°' }), cap(128, 190, { type: 'Rotation', speedStart: 'fast CW', speedEnd: 'slow CW' }), cap(191, 192, { type: 'Rotation', speed: 'stop' }), cap(193, 255, { type: 'Rotation', speedStart: 'slow CCW', speedEnd: 'fast CCW' }))
  const rgbw = () => ({ Red: { ...color('Red'), fineChannelAliases: ['Red fine'] }, Green: { ...color('Green'), fineChannelAliases: ['Green fine'] }, Blue: { ...color('Blue'), fineChannelAliases: ['Blue fine'] }, White: { ...color('White'), fineChannelAliases: ['White fine'] } })
  const shared = (lo, hi) => ({
    Pan: pan(540), Tilt: tilt(270), 'Pan/Tilt Speed': ptSpeed(), Zoom: zoom(lo, hi), 'Zoom Rotation': zoomRotation(),
    Dimmer: { ...intensity(), fineChannelAliases: ['Dimmer fine'] }, Strobe: pulseStrobe(),
    'Simple Strobe': strobe([0, 3, 'Open'], [4, 200, 'Strobe'], [201, 255, 'RandomStrobe']),
    ...rgbw(),
    CTO: caps(cap(0, 255, { type: 'ColorTemperature', colorTemperatureStart: 'cold', colorTemperatureEnd: 'warm' })),
    'Macro Colour': caps(cap(1, 255, effect('Colour macros'))),
    'Static Effect': program([10, 90, 'Background colour (Background R/G/B/W)'], [91, 255, 'Static shapes']),
    'Dynamic Effect': program([10, 90, 'Background colour (Background R/G/B/W)'], [91, 255, 'Moving shapes']),
    'Effect Speed': speed('Shape effect speed'),
    'Background R': generic('Background red'), 'Background G': generic('Background green'), 'Background B': generic('Background blue'), 'Background W': generic('Background white'),
    Function: generic('Function'),
    Reset: caps(cap(251, 255, maintenance('Reset (hold 5 s)'))),
    'Shape Selection': program([0, 255, 'Shape']), 'Shape Speed': speed('Shape speed'), 'Shape Fade': generic('Shape fade'),
    'Shape R': generic('Shape red'), 'Shape G': generic('Shape green'), 'Shape B': generic('Shape blue'), 'Shape W': generic('Shape white'),
    'Shape Dimmer': generic('Shape dimmer'), 'Background Dimmer': generic('Background dimmer'), 'Shape Transition': generic('Shape transition'),
    'Shape Offset': generic('Shape angle'), 'Foreground Strobe': generic('Shape strobe'), 'Background Strobe': generic('Background strobe'), 'Background Select': generic('Background selection')
  })
  const fine = ['Red', 'Red fine', 'Green', 'Green fine', 'Blue', 'Blue fine', 'White', 'White fine', 'CTO', 'Macro Colour', 'Strobe', 'Dimmer', 'Dimmer fine', 'Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Function', 'Reset', 'Zoom', 'Zoom Rotation']
  const shapes = ['Shape Selection', 'Shape Speed', 'Shape Fade', 'Shape R', 'Shape G', 'Shape B', 'Shape W', 'Shape Dimmer', 'Background Dimmer', 'Shape Transition', 'Shape Offset', 'Foreground Strobe', 'Background Strobe', 'Background Select']
  const basic = (strobeName) => ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Pan/Tilt Speed', 'Zoom', 'Zoom Rotation', 'Dimmer', strobeName, 'Red', 'Green', 'Blue', 'White', 'CTO', 'Macro Colour', 'Static Effect', 'Dynamic Effect', 'Effect Speed', 'Background R', 'Background G', 'Background B', 'Background W', 'Reset']
  const ledTemplates = { '$pixelKey Red': color('Red'), '$pixelKey Green': color('Green'), '$pixelKey Blue': color('Blue'), '$pixelKey White': color('White') }
  const perLed = (order) => perCell(leds, order)
  const RGB = ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']
  const RGBW = [...RGB, '$pixelKey White']

  fixtures['lm1925'] = {
    name: 'LM1925 19×25W RGBW Bee-Eye Zoom Wash Moving Head',
    categories: ['Moving Head', 'Color Changer'],
    comment: 'From the LM1925 user manual (23, 21, 35, 78 and 111 channels). In 78- and 111-channel modes each of the 19 LEDs is controlled on its own. Size not printed: estimated.',
    links: { manual: [STORE] },
    physical: { dimensions: [380, 470, 260], power: 580, bulb: { type: '19 × 30W RGBW 4-in-1 LEDs' }, lens: { degreesMinMax: [6, 60] } },
    matrix: { pixelKeys: [[leds]] },
    availableChannels: shared(6, 60),
    templateChannels: ledTemplates,
    modes: [
      mode('21-channel', fine),
      mode('23-channel', basic('Strobe')),
      mode('35-channel', [...fine, ...shapes]),
      { name: '78-channel', shortName: '78ch', channels: [...fine, perLed(RGB)] },
      { name: '111-channel', shortName: '111ch', channels: [...fine, ...shapes, perLed(RGBW)] }
    ]
  }

  fixtures['lm1940'] = {
    name: 'LM1940 19×40W RGBW Bee-Eye Zoom Wash Moving Head',
    categories: ['Moving Head', 'Color Changer'],
    comment: 'From the LM1940 user manual (21, 23, 35, 78, 92, 97 and 99 channels). The 23- and 99-channel modes have a simpler strobe (strobe, then random strobe).',
    links: { manual: [STORE] },
    physical: { dimensions: [405, 485, 267], weight: 17.2, power: 800, bulb: { type: '19 × 40W RGBW 4-in-1 LEDs' }, lens: { degreesMinMax: [4, 60] } },
    matrix: { pixelKeys: [[leds]] },
    availableChannels: shared(4, 60),
    templateChannels: ledTemplates,
    modes: [
      mode('21-channel', fine),
      mode('23-channel', basic('Simple Strobe')),
      mode('35-channel', [...fine, ...shapes]),
      { name: '78-channel', shortName: '78ch', channels: [...fine, perLed(RGB)] },
      { name: '92-channel', shortName: '92ch', channels: [...fine, ...shapes, perLed(RGB)] },
      { name: '97-channel', shortName: '97ch', channels: [...fine, perLed(RGBW)] },
      { name: '99-channel', shortName: '99ch', channels: [...basic('Simple Strobe'), perLed(RGBW)] }
    ]
  }

  // LM1925R adds a 60-LED RGB strip round the front ("strip", the halo), with sections ("auxiliary").
  const ch = shared(9, 40)
  const strip = [halo(['$pixelKey Dimmer', '$pixelKey Strobe', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Strip Effect', 'Strip Speed']
  const aux = (n) => Array.from({ length: n }, (_, i) => [`Strip ${i + 1} Red`, `Strip ${i + 1} Green`, `Strip ${i + 1} Blue`]).flat()
  for (const n of aux(20)) ch[n] = generic(`Strip section ${n.replace('Strip ', '')}`)
  ch['Strip Effect'] = program(...Array.from({ length: 85 }, (_, i) => [i * 3, i * 3 + 2, `Strip effect ${i + 1}`]))
  ch['Strip Speed'] = speed('Strip effect speed')
  ch['Shape Speed (30ch)'] = speed('Shape speed')
  fixtures['lm1925r'] = {
    name: 'LM1925R 19×25W RGBW Bee-Eye Zoom Wash with LED Strip',
    categories: ['Moving Head', 'Color Changer'],
    comment: 'From the LM1925R user manual (28, 30, 54, 97 and 178 channels). The 60 RGB LEDs round the front are the "strip" (drawn as a halo); its sections ("auxiliary" red/green/blue) are kept as plain channels.',
    links: { manual: [STORE] },
    physical: { dimensions: [380, 470, 260], weight: 12, power: 400, bulb: { type: '19 × 25W RGBW 4-in-1 LEDs + 60 × 0.2W RGB strip' }, lens: { degreesMinMax: [9, 40] } },
    matrix: { pixelKeys: [[[...leds, 'Halo']]] },
    availableChannels: ch,
    templateChannels: { ...ledTemplates, '$pixelKey Dimmer': intensity(), '$pixelKey Strobe': strobeFrom(10) },
    modes: [
      { name: '28-channel', shortName: '28ch', channels: [...fine, ...strip] },
      { name: '30-channel', shortName: '30ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Pan/Tilt Speed', 'Zoom', 'Zoom Rotation', 'Dimmer', 'Strobe', 'Red', 'Green', 'Blue', 'White', 'CTO', 'Macro Colour', 'Static Effect', 'Dynamic Effect', 'Shape Speed (30ch)', 'Shape R', 'Shape G', 'Shape B', 'Shape W', 'Reset', ...strip] },
      { name: '54-channel', shortName: '54ch', channels: [...fine, ...shapes, ...strip, ...aux(4)] },
      { name: '97-channel', shortName: '97ch', channels: [...fine, ...strip, perLed(RGB), ...aux(4)] },
      { name: '178-channel', shortName: '178ch', channels: [...fine, ...shapes, ...strip, perLed(RGBW), ...aux(20)] }
    ]
  }
}

export function betopperFixtures() {
  return fixtures
}
