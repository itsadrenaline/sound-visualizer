/**
 * Rockville fixtures, written from Rockville's own owner's manuals
 * (support.rockvilleaudio.com ▸ each product ▸ Owner's Manual) in Open Fixture
 * Library format. Models already in the Open Fixture Library or QLC+ libraries
 * (RockPAR50, Rockstrip 252, Motionstrip, Battery Strip 24, Best Strip 60,
 * RockWedge LED) are left to those.
 */
import { cap, intensity, color, pan, tilt, ptSpeed, generic, effect, maintenance, caps, strobe } from './ofl-helpers.mjs'
import { spider } from './betopper.mjs'

const SUPPORT = 'https://support.rockvilleaudio.com'
const fixtures = {}

const program = (...ranges) => caps(...ranges.map(([lo, hi, name]) => cap(lo, hi, { type: 'Effect', effectName: name })))
const speed = (what) => generic(what)
const strobeFrom = (lo) => strobe([0, lo - 1, 'Open'], [lo, 255, 'Strobe'])
const mode = (name, channels) => ({ name, shortName: `${name.replace(/\D.*/, '')}ch`, channels })
const cellKeys = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const perCell = (keys, order) => ({ insert: 'matrixChannels', repeatFor: keys, channelOrder: 'perPixel', templateChannels: order })

// --- Six-colour battery and wash PARs (RGBWA+UV) ------------------------------------------
// Rockville prints amber as "yellow" and UV as "purple" on several of these.
const SIX = ['Red', 'Green', 'Blue', 'White', 'Amber', 'UV']
const sixChannels = () => Object.fromEntries(SIX.map((c) => [c, color(c)]))

/** The usual battery PAR chart: 6 colours, or dimmer + colours + strobe + function + speed. */
function sixColourPar(slug, name, functions, { strobeLo = 11, comment = '', physical = {} } = {}) {
  fixtures[slug] = {
    name,
    categories: ['Color Changer'],
    comment: `From the ${name.split(' ').slice(0, 3).join(' ')} owner's manual (6 and 10 channels). Size not printed: estimated (a typical battery PAR).${comment ? ' ' + comment : ''}`,
    links: { manual: [SUPPORT] },
    physical: { dimensions: [160, 200, 160], weight: 1.6, power: 50, bulb: { type: '6 × RGBWA+UV 6-in-1 LEDs (estimated)' }, lens: { degreesMinMax: [25, 25] }, ...physical },
    availableChannels: {
      Dimmer: intensity(), ...sixChannels(), Strobe: strobeFrom(strobeLo),
      Function: program(...functions), 'Function Speed': speed('Function speed / single colour')
    },
    modes: [mode('6-channel', SIX), mode('10-channel', ['Dimmer', ...SIX, 'Strobe', 'Function', 'Function Speed'])]
  }
}

sixColourPar('battery-par-61', 'Battery Par 61 RGBWA+UV Rechargeable Wash', [[10, 50, 'Static colours (Function Speed picks)'], [51, 100, 'Colour change'], [101, 150, 'Colour fade'], [151, 200, 'Colour pulse'], [201, 220, 'Sound: fade'], [221, 240, 'Sound: strobe'], [241, 255, 'Sound: pulse']])
sixColourPar('battery-par-6rf', 'Battery Par 6RF RGBWA+UV Rechargeable Wash', [[10, 50, 'Select colour'], [51, 100, 'Colour change'], [101, 150, 'Colour fade'], [151, 200, 'Colour pulse'], [201, 220, 'Sound: colour change'], [221, 255, 'Sound: colour strobe']])
sixColourPar('best-par-h2o', 'Best Par H2O RGBWA+UV Waterproof Rechargeable Wash', [[10, 50, 'Select colour'], [51, 100, 'Colour change'], [101, 150, 'Colour fade'], [151, 200, 'Colour pulse'], [201, 220, 'Sound: colour change'], [221, 240, 'Sound: colour strobe'], [241, 255, 'Sound: colour pulse']], { comment: 'Outdoor (waterproof).' })
const AUTO_SOUND = [[40, 79, 'Colour cycle'], [80, 119, 'Colour fade'], [120, 159, 'Colour pulse'], [160, 189, 'Sound: colour cycle'], [190, 219, 'Sound: colour pulse'], [220, 249, 'Sound: colour strobe'], [250, 255, 'Sound: all three']]
sixColourPar('flip-par', 'Flip Par RGBWA+UV Rechargeable Wash', AUTO_SOUND, { strobeLo: 10, comment: 'The head flips up from its battery base.' })
sixColourPar('wet-par-wc', 'Wet Par WC RGBWA+UV Waterproof Rechargeable Wash', AUTO_SOUND, { strobeLo: 10, comment: 'Outdoor (waterproof), powered at 13.2V DC.' })

fixtures['wet-par-50'] = {
  name: 'Wet Par 50 RGBWA+UV Waterproof Rechargeable Wash',
  categories: ['Color Changer'],
  comment: "From the WET PAR 50 owner's manual (3, 4, 6 and 10 channels). The manual gives only \"0 = off\" for the strobe: 1-255 taken as slow to fast. Size not printed: estimated.",
  links: { manual: [SUPPORT] },
  physical: { dimensions: [160, 200, 160], weight: 1.6, power: 50, bulb: { type: 'RGBWA+UV 6-in-1 LEDs' }, lens: { degreesMinMax: [25, 25] } },
  availableChannels: {
    Dimmer: intensity(), ...sixChannels(), Strobe: strobeFrom(1),
    Function: program([65, 80, 'Static colour macro'], [81, 150, 'Colour cycle'], [151, 220, 'Colour fade'], [221, 255, 'Sound active']),
    'Function Speed': speed('Function speed / single colour')
  },
  modes: [
    mode('3-channel', ['Red', 'Green', 'Blue']),
    mode('4-channel', ['Red', 'Green', 'Blue', 'White']),
    mode('6-channel', SIX),
    mode('10-channel', ['Dimmer', 'Strobe', ...SIX, 'Function', 'Function Speed'])
  ]
}

fixtures['rockpar-tri'] = {
  name: 'RockPAR TRI RGB Wash',
  categories: ['Color Changer'],
  comment: "From the ROCKPAR TRI owner's manual (7 channels). The chart puts manual dimming at 0-10 on the mode channel. Size not printed: estimated.",
  links: { manual: [SUPPORT] },
  physical: { dimensions: [200, 220, 120], weight: 1.2, power: 40, bulb: { type: 'RGB 3-in-1 LEDs' }, lens: { degreesMinMax: [25, 25] } },
  availableChannels: {
    Mode: program([11, 50, 'Colour selection'], [51, 100, 'Colour cycle'], [101, 150, 'Colour fade'], [151, 200, 'Sound active'], [201, 255, 'Strobe']),
    Colour: generic('Colour for the mode'), Speed: speed('Mode speed'),
    Dimmer: intensity(), Red: color('Red'), Green: color('Green'), Blue: color('Blue')
  },
  modes: [mode('7-channel', ['Mode', 'Colour', 'Speed', 'Dimmer', 'Red', 'Green', 'Blue'])]
}

// --- Moving effects -----------------------------------------------------------------------

{
  const { _front, _back, ...base } = spider({ 23: 'self-propelled', 24: 'sound active' })
  fixtures['spyder-led'] = {
    name: 'SPYDER LED 8×3W RGBW Spider Moving Head',
    ...base,
    comment: "From the SPYDER LED owner's manual (7 and 15 channels). Two rows of four 3W LEDs (two each of red, green, blue and white), each row tilting 0-135° on its own motor (the manual calls them pan and tilt). The manual gives the eight LED dimmers as LED 1-8 without their colours: the usual spider order (R G B W, then W B G R) is assumed.",
    links: { manual: [SUPPORT] },
    physical: { ...base.physical, dimensions: [280, 150, 100], weight: 2 },
    availableChannels: { ...base.availableChannels, Reset: caps(cap(241, 250, maintenance('Reset'))) },
    modes: [
      mode('7-channel', ['Tilt', 'Tilt 2', 'Dimmer', 'Strobe', 'Effect', 'Effect Speed', 'Reset']),
      mode('15-channel', ['Tilt', 'Tilt 2', 'Dimmer', 'Strobe', ..._front, ..._back, 'Effect', 'Effect Speed', 'Reset'])
    ]
  }
}

{
  const COLOURS = [[8, 24, 'Red'], [25, 41, 'Green'], [42, 57, 'Blue'], [58, 74, 'White'], [75, 90, 'Red + green'], [91, 107, 'Red + blue'], [108, 123, 'Red + white'], [124, 140, 'Green + blue'], [141, 156, 'Green + white'], [157, 173, 'Blue + white'], [174, 189, 'Red + green + blue'], [190, 206, 'Red + green + white'], [207, 222, 'Red + blue + white'], [223, 239, 'Green + blue + white'], [240, 255, 'All four']]
  const colourChannel = () => program(...COLOURS)
  fixtures['party-spinner-led'] = {
    name: 'Party Spinner LED RGBW Moving Effect',
    categories: ['Moving Head', 'Effect'],
    comment: "From the PARTY SPINNER LED owner's manual (6 and 10 channels). The second colour channel has no table in the manual: the first channel's colours are assumed. Size not printed: estimated.",
    links: { manual: [SUPPORT] },
    physical: { dimensions: [260, 300, 200], weight: 3, power: 60, bulb: { type: 'RGBW LEDs' }, lens: { degreesMinMax: [10, 10] } },
    availableChannels: {
      Dimmer: intensity(), Strobe: strobe([0, 1, 'Open'], [2, 255, 'Strobe']), 'Strobe (6ch)': strobeFrom(1),
      Movement: program(...Array.from({ length: 16 }, (_, i) => [8 + i * 15, 22 + i * 15, `Movement ${i + 1}`]), [248, 255, 'Sound active']),
      'Movement Speed': speed('Movement speed'),
      'Colour Chase': program(...[[15, 35], [36, 56], [57, 76], [77, 97], [98, 117], [118, 138], [139, 159], [160, 179], [180, 200], [201, 220], [221, 241], [242, 255]].map(([lo, hi], i) => [lo, hi, `Chase ${i + 1}`])),
      'Chase Speed': speed('Chase speed'),
      Pan: pan(540, false), 'Pan Speed': ptSpeed(),
      Tilt: tilt(360, false),
      'Tilt Rotate': caps(cap(6, 126, { type: 'Rotation', speedStart: 'fast CW', speedEnd: 'slow CW' }), cap(129, 249, { type: 'Rotation', speedStart: 'slow CCW', speedEnd: 'fast CCW' })),
      'Colour 1': colourChannel(), 'Colour 2': colourChannel(), White: color('White'),
      Reset: caps(cap(200, 209, maintenance('Reset')))
    },
    modes: [
      mode('6-channel', ['Dimmer', 'Strobe (6ch)', 'Movement', 'Movement Speed', 'Colour Chase', 'Chase Speed']),
      mode('10-channel', ['Dimmer', 'Strobe', 'Pan', 'Pan Speed', 'Tilt', 'Tilt Rotate', 'Colour 1', 'Colour 2', 'White', 'Reset'])
    ]
  }
}

{
  const LEAF_COLOURS = [[5, 40, 'Red'], [41, 76, 'Green'], [77, 112, 'Blue'], [113, 148, 'Yellow'], [149, 184, 'Purple'], [185, 220, 'Light blue'], [221, 255, 'White']]
  const BEAM_COLOURS = [[5, 36, 'Red'], [37, 68, 'Green'], [69, 100, 'Blue'], [101, 132, 'White'], [133, 164, 'Yellow'], [165, 196, 'Purple'], [197, 228, 'Light blue'], [229, 255, 'White']]
  const ch = {
    Rotation: pan(360, false),
    'Rotation Speed': caps(cap(0, 49, generic('Position, fast to slow').capability), cap(50, 152, { type: 'Rotation', speedStart: 'fast CW', speedEnd: 'slow CW' }), cap(153, 255, { type: 'Rotation', speedStart: 'slow CCW', speedEnd: 'fast CCW' })),
    'Amber Dimmer': intensity(), 'Amber Strobe': strobe([0, 0, 'Open'], [1, 255, 'Strobe']),
    'Amber Effect': program([5, 40, 'Amber 1'], [41, 76, 'Amber 2'], [77, 112, 'Amber 3'], [113, 148, 'Amber 1+2'], [149, 184, 'Amber 2+3'], [185, 220, 'Amber 3+1'], [221, 255, 'All amber']),
    'Leaf Dimmer': intensity(), 'Leaf Strobe': strobeFrom(11),
    'Leaf 1 Colour': program(...LEAF_COLOURS), 'Leaf 2 Colour': program(...LEAF_COLOURS), 'Leaf 3 Colour': program(...LEAF_COLOURS),
    'Beam Colour': program(...BEAM_COLOURS),
    'Amber Macro': program([5, 85, 'Clockwise cycle'], [86, 170, 'Fade in'], [171, 255, 'Sharp pulse']),
    'Leaf Macro': program([5, 47, 'Clockwise cycle'], [48, 89, 'Alternating cycle'], [90, 131, 'Fade in'], [132, 173, 'Slow pulse'], [174, 215, 'Sharp pulse'], [216, 255, 'Colour fade']),
    'Beam Macro': program([5, 85, 'Colour pulse'], [86, 170, 'Colour fade'], [171, 255, 'Colour cycle']),
    Reset: caps(cap(200, 209, maintenance('Reset (hold 5 s)')))
  }
  for (const i of [1, 2, 3]) ch[`Amber ${i}`] = color('Amber')
  for (const part of ['Leaf', 'Leaf 1', 'Leaf 2', 'Leaf 3', 'Beam']) for (const c of ['Red', 'Green', 'Blue']) ch[`${part} ${c}`] = color(c)
  ch['Beam White'] = color('White')
  const head = ['Rotation', 'Rotation Speed', 'Amber Dimmer', 'Amber Strobe']
  fixtures['leaf-spinner'] = {
    name: 'Leaf Spinner Rotating Leaf, Beam and Amber Effect',
    categories: ['Effect', 'Color Changer'],
    comment: "From the LEAF SPINNER owner's manual (15, 20 and 26 channels). A rotating head with three RGB \"leaf\" lights, an RGBW beam and three amber LEDs. Size not printed: estimated.",
    links: { manual: [SUPPORT] },
    physical: { dimensions: [450, 350, 250], weight: 6, power: 150, bulb: { type: '3 RGB leaf lights + RGBW beam + 3 amber LEDs' }, lens: { degreesMinMax: [20, 20] } },
    availableChannels: ch,
    modes: [
      mode('15-channel', [...head, 'Amber Effect', 'Leaf Dimmer', 'Leaf Strobe', 'Leaf 1 Colour', 'Leaf 2 Colour', 'Leaf 3 Colour', 'Beam Colour', 'Amber Macro', 'Leaf Macro', 'Beam Macro', 'Reset']),
      mode('20-channel', [...head, 'Amber 1', 'Amber 2', 'Amber 3', 'Leaf Dimmer', 'Leaf Strobe', 'Leaf Red', 'Leaf Green', 'Leaf Blue', 'Beam Red', 'Beam Green', 'Beam Blue', 'Beam White', 'Amber Macro', 'Leaf Macro', 'Beam Macro', 'Reset']),
      mode('26-channel', [...head, 'Amber 1', 'Amber 2', 'Amber 3', 'Leaf Dimmer', 'Leaf Strobe', 'Leaf 1 Red', 'Leaf 1 Green', 'Leaf 1 Blue', 'Leaf 2 Red', 'Leaf 2 Green', 'Leaf 2 Blue', 'Leaf 3 Red', 'Leaf 3 Green', 'Leaf 3 Blue', 'Beam Red', 'Beam Green', 'Beam Blue', 'Beam White', 'Amber Macro', 'Leaf Macro', 'Beam Macro', 'Reset'])
    ]
  }
}

// --- Panels -------------------------------------------------------------------------------

{
  const sections = cellKeys(8, 'Section ')
  fixtures['stage-panel-336'] = {
    name: 'Stage Panel 336 RGB Wash Panel with Strobe Bar',
    categories: ['Matrix', 'Strobe', 'Color Changer'],
    comment: "From the Stage Panel 336 owner's manual (4, 6, 12, 24 and 30 channels): eight RGB sections around a white strobe bar of four bulbs. Size not printed: estimated.",
    links: { manual: [SUPPORT] },
    physical: { dimensions: [500, 300, 100], weight: 4, power: 100, bulb: { type: '336 RGB LEDs + white strobe bar' }, lens: { degreesMinMax: [120, 120] } },
    matrix: { pixelKeys: [[sections]] },
    availableChannels: {
      Dimmer: intensity(), Strobe: strobe([0, 0, 'Open'], [1, 255, 'Strobe']),
      Red: color('Red'), Green: color('Green'), Blue: color('Blue'), 'Strobe Bar': color('White'),
      'RGB Mode': program([6, 10, 'Static colour'], [11, 15, 'Pulse'], [16, 20, 'Colour cycle'], [21, 25, 'Colour fade'], [26, 30, 'Sharp pulse'], [31, 40, 'All modes'], ...Array.from({ length: 18 }, (_, i) => [41 + i * 10, 50 + i * 10, `Effect ${i + 1}`]), [221, 225, 'Effect 19'], [226, 255, 'Sound active']),
      'RGB Speed': speed('Effect speed / static colour / sound sensitivity'),
      'RGB Colour': generic('Colour for the effect'),
      'Bar Strobe': generic('Strobe bar strobe speed'),
      'Bar Mode': program(...Array.from({ length: 44 }, (_, i) => [6 + i * 5, 10 + i * 5, `Bar effect ${i + 1}`]), [226, 255, 'Bar effect 45']),
      'Bar Speed': speed('Strobe bar effect speed'),
      'Background Red': color('Red'), 'Background Green': color('Green'), 'Background Blue': color('Blue'),
      ...Object.fromEntries([1, 2, 3, 4].map((i) => [`Bulb ${i}`, color('White')]))
    },
    templateChannels: { '$pixelKey Red': color('Red'), '$pixelKey Green': color('Green'), '$pixelKey Blue': color('Blue') },
    modes: [
      mode('4-channel', ['Red', 'Green', 'Blue', 'Strobe Bar']),
      mode('6-channel', ['Dimmer', 'Strobe', 'Red', 'Green', 'Blue', 'Strobe Bar']),
      mode('12-channel', ['Dimmer', 'Strobe', 'RGB Mode', 'RGB Speed', 'RGB Colour', 'Bar Strobe', 'Bar Mode', 'Bar Speed', 'Background Red', 'Background Green', 'Background Blue', 'Strobe Bar']),
      { name: '24-channel', shortName: '24ch', channels: [perCell(sections, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue'])] },
      { name: '30-channel', shortName: '30ch', channels: ['Dimmer', 'Strobe', perCell(sections, ['$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Bulb 1', 'Bulb 2', 'Bulb 3', 'Bulb 4'] }
    ]
  }
}

// --- Haze ---------------------------------------------------------------------------------

for (const [slug, model, dims, weight, power] of [['rockhaze-700-v2', 'ROCKHAZE 700 V2', [280, 220, 245], 4.6, 400], ['rockhaze-1000-v2', 'ROCKHAZE 1000 V2', [312, 220, 270], 5, 800]]) {
  fixtures[slug] = {
    name: `${model} Haze Machine`,
    categories: ['Smoke', 'Hazer'],
    comment: `From the ${model} owner's manual (2 channels). The manual gives no value ranges: 0 taken as off and higher values as more.`,
    links: { manual: [SUPPORT] },
    physical: { dimensions: dims, weight, power },
    availableChannels: {
      Haze: caps(cap(0, 0, { type: 'NoFunction' }), cap(1, 255, { type: 'FogOutput', fogOutputStart: 'weak', fogOutputEnd: 'strong' })),
      Fan: caps(cap(0, 255, { type: 'Generic', comment: 'Fan speed (how far the haze is thrown)' }))
    },
    modes: [mode('2-channel', ['Haze', 'Fan'])]
  }
}

export function rockvilleFixtures() {
  return fixtures
}
