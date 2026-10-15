/**
 * Both Lighting fixtures, written from the manufacturer's user manuals
 * (bothlightingusa.com ▸ Downloads & Manuals) in Open Fixture Library format,
 * so they go through the same converter as every other library fixture.
 *
 * Where a manual leaves something out, it's marked in `comment`:
 *  - colour-wheel colours: the manuals only say "Color 1-7". For the MH-150 and
 *    BPM-Spots the order comes from Both Lighting's own SoundSwitch profiles;
 *    other wheels use the same order and say so.
 *  - pan/tilt range or size not printed: typical values are used and noted.
 *
 * build-library.mjs adds these to resources/library/ofl.json under "Both Lighting".
 */

import { cap, fill, intensity, color, pan, tilt, ptSpeed, zoom, focus, generic, effect, maintenance, caps, strobe, wheel, spin, shake, goboSpin, slots, colorSlots, goboSlots } from './ofl-helpers.mjs'

// Colour orders from Both Lighting's SoundSwitch profiles.
const MH150_COLORS = [['Red', '#fc0107'], ['Yellow', '#ffff0a'], ['Blue', '#0000ff'], ['Green', '#21ff06'], ['Orange', '#fd8008'], ['Magenta', '#fc02ff'], ['Cyan', '#20ffff']]
const BPM_COLORS = [['Red', '#ff2600'], ['Green', '#00f900'], ['Blue', '#0433ff'], ['Yellow', '#fffb00'], ['Pink', '#ff40ff'], ['Orange', '#ff9300'], ['Cyan', '#00fdff']]
const ELEVEN_COLORS = [...BPM_COLORS, ['Lime', '#a6ff00'], ['Purple', '#8a2be2'], ['Light Blue', '#7fb2ff'], ['Amber', '#ffbf00']]

const MANUALS = 'https://bothlightingusa.com/pages/support'

// --- The fixtures ------------------------------------------------------------------------

const fixtures = {}

// MH-150 beam moving head (BO-MH150): manual, 4 modes.
{
  const ch = {
    Pan: pan(540), Tilt: tilt(270), 'X/Y Speed': ptSpeed(), Dimmer: intensity(),
    Strobe: strobe([0, 7, 'Open'], [8, 250, 'Strobe'], [251, 255, 'Open']),
    'Color Wheel': wheel('Color Wheel', slots(0, 16, 8), spin(128, 191, 'slow CW', 'fast CW'), spin(192, 255, 'slow CCW', 'fast CCW')),
    'Static Gobo': wheel('Static Gobo Wheel', [[0, 6, 1], ...slots(7, 7, 7, 2), [56, 63, 9]], ...Array.from({ length: 8 }, (_, i) => shake(64 + i * 7, 70 + i * 7, 9 - i, 'Static Gobo Wheel')), cap(120, 127, { type: 'WheelSlot', wheel: 'Static Gobo Wheel', slotNumber: 1 }), spin(128, 191, 'slow CW', 'fast CW', 'Static Gobo Wheel'), spin(192, 255, 'slow CCW', 'fast CCW', 'Static Gobo Wheel')),
    'Rotating Gobo': wheel('Rotating Gobo Wheel', [[0, 15, 1], ...slots(16, 16, 5, 2), [96, 127, 7]]),
    'Gobo Rotation': caps(cap(16, 95, { type: 'WheelSlotRotation', wheel: 'Rotating Gobo Wheel', angleStart: '0deg', angleEnd: '360deg' }), goboSpin(176, 215, 'slow CW', 'fast CW', 'Rotating Gobo Wheel'), goboSpin(216, 255, 'slow CCW', 'fast CCW', 'Rotating Gobo Wheel')),
    Focus: focus(),
    Prism: caps(cap(64, 255, { type: 'Prism', comment: '3-facet' })),
    'Prism Rotation': caps(cap(16, 135, { type: 'PrismRotation', speedStart: 'slow CW', speedEnd: 'fast CW' }), cap(136, 255, { type: 'PrismRotation', speedStart: 'slow CCW', speedEnd: 'fast CCW' })),
    Program: caps(cap(8, 131, effect('Auto')), cap(132, 255, effect('Sound'))),
    Reset: caps(cap(250, 253, maintenance('Reset')))
  }
  fixtures['mh-150'] = {
    name: 'MH-150 Beam Moving Head (BO-MH150)',
    categories: ['Moving Head'],
    comment: 'From the MH-150 user manual. Colour wheel order from Both Lighting\'s SoundSwitch profile. The manual\'s 12-channel table lists Pan fine at channel 2, which leaves 13 channels; 12 channels only add up without it, so it is left out.',
    links: { manual: [MANUALS] },
    physical: { dimensions: [270, 470, 270], weight: 10.6, power: 200, bulb: { type: '150W cool white LED' }, lens: { degreesMinMax: [1, 6] } },
    wheels: { 'Color Wheel': { slots: colorSlots(MH150_COLORS) }, 'Static Gobo Wheel': { slots: goboSlots(8) }, 'Rotating Gobo Wheel': { slots: goboSlots(6) } },
    availableChannels: ch,
    modes: [
      { name: '10-channel', shortName: '10ch', channels: ['Pan', 'Tilt', 'X/Y Speed', 'Dimmer', 'Strobe', 'Color Wheel', 'Static Gobo', 'Focus', 'Prism', 'Prism Rotation'] },
      { name: '12-channel', shortName: '12ch', channels: ['Pan', 'Tilt', 'X/Y Speed', 'Dimmer', 'Strobe', 'Color Wheel', 'Static Gobo', 'Rotating Gobo', 'Gobo Rotation', 'Focus', 'Prism', 'Prism Rotation'] },
      { name: '14-channel', shortName: '14ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'X/Y Speed', 'Dimmer', 'Strobe', 'Color Wheel', 'Static Gobo', 'Focus', 'Prism', 'Prism Rotation', 'Program', 'Reset'] },
      { name: '16-channel', shortName: '16ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'X/Y Speed', 'Dimmer', 'Strobe', 'Color Wheel', 'Static Gobo', 'Rotating Gobo', 'Gobo Rotation', 'Focus', 'Prism', 'Prism Rotation', 'Program', 'Reset'] }
    ]
  }
}

// Hybrid 300W Mover (BO-BSW300): beam/spot/wash, 20 channels.
fixtures['hybrid-300w-mover'] = {
  name: 'Hybrid 300W Mover (BO-BSW300)',
  categories: ['Moving Head'],
  comment: 'From the Hybrid 300W Mover user manual. Pan/tilt range is not printed; 540°/270° assumed. Colour wheel colours not named in the manual: same order as the MH-150 assumed.',
  links: { manual: [MANUALS] },
  physical: { dimensions: [338, 530, 225], power: 320, bulb: { type: '300W Osram LED, 8000K' }, lens: { degreesMinMax: [6, 35] } },
  wheels: { 'Color Wheel': { slots: colorSlots(MH150_COLORS) }, 'Static Gobo Wheel': { slots: goboSlots(8) }, 'Rotating Gobo Wheel': { slots: goboSlots(7) } },
  availableChannels: {
    Pan: pan(540), Tilt: tilt(270), 'Pan/Tilt Speed': ptSpeed(), Dimmer: { fineChannelAliases: ['Dimmer fine'], capability: { type: 'Intensity' } },
    Strobe: strobe([0, 3, 'Closed'], [4, 103, 'Strobe'], [104, 107, 'Open'], [108, 207, 'Pulse'], [208, 212, 'Open'], [213, 251, 'RandomStrobe'], [252, 255, 'Open']),
    'Color Wheel': wheel('Color Wheel', [[0, 7, 1], [16, 23, 2], [32, 39, 3], [48, 55, 4], [64, 71, 5], [80, 87, 6], [96, 103, 7], [112, 119, 8]], spin(128, 190, 'fast CW', 'slow CW'), spin(193, 255, 'slow CCW', 'fast CCW')),
    'Static Gobo': wheel('Static Gobo Wheel', [[0, 4, 1], ...slots(5, 8, 7, 2), [61, 76, 9]], ...Array.from({ length: 8 }, (_, i) => shake(77 + i * 13, 89 + i * 13, i + 2, 'Static Gobo Wheel'))),
    'Rotating Gobo': wheel('Rotating Gobo Wheel', [[0, 5, 1], ...slots(6, 10, 7, 2)], ...Array.from({ length: 7 }, (_, i) => shake(76 + i * 17, 92 + i * 17 + (i === 6 ? 5 : 0), i + 2, 'Rotating Gobo Wheel'))),
    'Gobo Rotation': caps(cap(0, 127, { type: 'WheelSlotRotation', wheel: 'Rotating Gobo Wheel', angleStart: '0deg', angleEnd: '360deg' }), goboSpin(128, 190, 'fast CW', 'slow CW', 'Rotating Gobo Wheel'), goboSpin(193, 255, 'slow CCW', 'fast CCW', 'Rotating Gobo Wheel')),
    Prism: caps(cap(64, 255, { type: 'Prism', comment: '3-facet' })),
    'Prism Rotation': caps(cap(128, 190, { type: 'PrismRotation', speedStart: 'fast CCW', speedEnd: 'slow CCW' }), cap(193, 255, { type: 'PrismRotation', speedStart: 'slow CW', speedEnd: 'fast CW' })),
    Frost: caps(cap(64, 255, { type: 'Frost' })),
    Zoom: { fineChannelAliases: ['Zoom fine'], capability: { type: 'Zoom', angleStart: '6deg', angleEnd: '35deg' } },
    Focus: { fineChannelAliases: ['Focus fine'], capability: { type: 'Focus', distanceStart: 'near', distanceEnd: 'far' } },
    Reset: caps(cap(200, 229, maintenance('Reset')))
  },
  modes: [{ name: '20-channel', shortName: '20ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Pan/Tilt Speed', 'Dimmer', 'Dimmer fine', 'Strobe', 'Color Wheel', 'Static Gobo', 'Rotating Gobo', 'Gobo Rotation', 'Prism', 'Prism Rotation', 'Frost', 'Zoom', 'Zoom fine', 'Focus', 'Focus fine', 'Reset'] }]
}

// BPM moving heads share the halo ring ("light strip") channels.
const haloChannels = {
  '$pixelKey Strobe': strobe([0, 4, 'Open'], [5, 250, 'Strobe'], [251, 255, 'Open']),
  '$pixelKey Dimmer': intensity(),
  '$pixelKey Red': color('Red'),
  '$pixelKey Green': color('Green'),
  '$pixelKey Blue': color('Blue')
}
const halo = (order) => ({ insert: 'matrixChannels', repeatFor: ['Halo'], channelOrder: 'perPixel', templateChannels: order })

fixtures['bpm-spots'] = {
  name: 'BPM-Spots 100 Battery Spot Moving Head',
  categories: ['Moving Head'],
  comment: 'From the BPM-Spots user manual (22 channels). Colour wheel order from Both Lighting\'s SoundSwitch profile. Runs on battery with wireless DMX.',
  links: { manual: [MANUALS] },
  physical: { dimensions: [300, 430, 280], power: 150, bulb: { type: '100W LED + 21 × 0.6W RGB halo ring' }, lens: { degreesMinMax: [14, 14] } },
  matrix: { pixelKeys: [[['Halo']]] },
  wheels: { 'Color Wheel': { slots: colorSlots(BPM_COLORS) }, 'Gobo Wheel': { slots: goboSlots(7) }, 'Rotating Gobo Wheel': { slots: goboSlots(6) } },
  availableChannels: {
    Pan: pan(540), Tilt: tilt(260), 'XY Speed': ptSpeed(),
    Strobe: strobe([0, 3, 'Open'], [4, 99, 'Strobe'], [100, 149, 'Pulse'], [150, 199, 'Strobe'], [200, 249, 'RandomStrobe'], [250, 255, 'Open']),
    Dimmer: intensity(),
    'Color Wheel': wheel('Color Wheel', slots(0, 8, 8), spin(128, 189, 'fast CCW', 'slow CCW'), spin(194, 255, 'slow CW', 'fast CW')),
    'Gobo Wheel': wheel('Gobo Wheel', [[0, 7, 1], ...slots(8, 13, 7, 2)], ...Array.from({ length: 7 }, (_, i) => shake(99 + i * 13, 111 + i * 13, i + 2, 'Gobo Wheel'))),
    'Rotating Gobo': wheel('Rotating Gobo Wheel', [[0, 9, 1], ...slots(10, 15, 6, 2)], ...Array.from({ length: 6 }, (_, i) => shake(100 + i * 15, 114 + i * 15, i + 2, 'Rotating Gobo Wheel'))),
    'Gobo Rotation': caps(cap(128, 189, { type: 'WheelSlotRotation', wheel: 'Rotating Gobo Wheel', speedStart: 'fast CCW', speedEnd: 'slow CCW' }), cap(194, 255, { type: 'WheelSlotRotation', wheel: 'Rotating Gobo Wheel', speedStart: 'slow CW', speedEnd: 'fast CW' })),
    Prism: caps(cap(21, 63, { type: 'Prism', comment: '5-facet' }), cap(64, 255, { type: 'Prism', comment: '5-facet, rotating' })),
    Focus: focus(),
    'Built-in Colors': effect('Halo colour gradient'),
    'Dynamic Effect': caps(cap(5, 255, effect('Halo effects'))),
    'Effect Speed': generic('Halo effect speed'),
    Reset: caps(cap(220, 255, maintenance('Reset')))
  },
  templateChannels: haloChannels,
  modes: [
    {
      name: '22-channel', shortName: '22ch',
      channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'XY Speed', 'Strobe', 'Dimmer', 'Color Wheel', 'Gobo Wheel', 'Rotating Gobo', 'Gobo Rotation', 'Prism', 'Focus',
        halo(['$pixelKey Strobe', '$pixelKey Dimmer', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Built-in Colors', 'Dynamic Effect', 'Effect Speed', 'Reset']
    }
  ]
}

fixtures['bpm-beams'] = {
  name: 'BPM-Beams Battery Beam Moving Head (BO-100B)',
  categories: ['Moving Head'],
  comment: 'From the BPM-Beam user manual (21 channels). Colours not named in the manual: BPM-Spots order assumed for the first seven, then lime, purple, light blue, amber. Split colours (68-127) show as open white.',
  links: { manual: [MANUALS] },
  physical: { dimensions: [300, 430, 280], weight: 11.2, power: 150, bulb: { type: '100W LED + RGB halo ring' }, lens: { degreesMinMax: [1.5, 1.5] } },
  matrix: { pixelKeys: [[['Halo']]] },
  wheels: { 'Color Wheel': { slots: colorSlots(ELEVEN_COLORS) }, 'Gobo Wheel': { slots: goboSlots(18) } },
  availableChannels: {
    Pan: pan(540), Tilt: tilt(260), 'XY Speed': ptSpeed(),
    'Rainbow / Frost': caps(cap(128, 189, effect('Rainbow')), cap(190, 255, { type: 'Frost' })),
    Strobe: strobe([0, 3, 'Open'], [4, 99, 'Strobe'], [100, 149, 'Pulse'], [150, 199, 'Strobe'], [200, 249, 'RandomStrobe'], [250, 255, 'Open']),
    Dimmer: intensity(),
    'Color Wheel': wheel('Color Wheel', [[0, 12, 1], ...slots(13, 5, 11, 2)], spin(128, 189, 'fast CCW', 'slow CCW'), spin(194, 255, 'slow CW', 'fast CW')),
    'Gobo Wheel': wheel('Gobo Wheel', [[0, 9, 1], ...slots(10, 3, 18, 2)], ...Array.from({ length: 18 }, (_, i) => shake(64 + i * 7, 70 + i * 7, i + 2, 'Gobo Wheel')), spin(190, 221, 'fast CCW', 'slow CCW', 'Gobo Wheel'), spin(224, 255, 'slow CW', 'fast CW', 'Gobo Wheel')),
    Prism: caps(cap(32, 63, { type: 'Prism', comment: '6 + 12 facet' }), cap(64, 255, { type: 'Prism', comment: 'rotating' })),
    Focus: focus(),
    'Built-in Colors': effect('Halo colour gradient'),
    'Dynamic Effect': caps(cap(5, 255, effect('Halo effects'))),
    'Effect Speed': generic('Halo effect speed'),
    Reset: caps(cap(220, 255, maintenance('Reset')))
  },
  templateChannels: haloChannels,
  modes: [
    {
      name: '21-channel', shortName: '21ch',
      channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'XY Speed', 'Rainbow / Frost', 'Strobe', 'Dimmer', 'Color Wheel', 'Gobo Wheel', 'Prism', 'Focus',
        halo(['$pixelKey Strobe', '$pixelKey Dimmer', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Built-in Colors', 'Dynamic Effect', 'Effect Speed', 'Reset']
    }
  ]
}

fixtures['mini-beam-mover'] = {
  name: 'Mini Beam Mover (BO-LED100)',
  categories: ['Moving Head'],
  comment: 'From the Mini Beam Mover user manual (12 channels; the product page also mentions 11/13). Body size not published: estimated from the 8 × 6 × 11 in carton. Colours not named: MH-150 order assumed.',
  links: { manual: [MANUALS] },
  physical: { dimensions: [180, 260, 140], power: 120, bulb: { type: '80W COB LED, 8500K' }, lens: { degreesMinMax: [3, 3] } },
  wheels: { 'Color Wheel': { slots: colorSlots(MH150_COLORS) }, 'Gobo Wheel': { slots: goboSlots(7) } },
  availableChannels: {
    Pan: pan(540), Tilt: tilt(270), 'X/Y Speed': ptSpeed(), Dimmer: intensity(),
    Strobe: strobe([0, 0, 'Open'], [1, 255, 'Strobe']),
    'Color Wheel': wheel('Color Wheel', slots(0, 16, 8), spin(128, 255, 'fast CW', 'slow CW')),
    'Gobo Wheel': wheel('Gobo Wheel', slots(0, 8, 8), ...Array.from({ length: 7 }, (_, i) => shake(64 + i * 9 + (i ? 1 : 0), 73 + i * 9, 8 - i, 'Gobo Wheel')), spin(128, 255, 'fast CW', 'slow CW', 'Gobo Wheel')),
    Prism: caps(cap(8, 127, { type: 'Prism' }), cap(128, 255, { type: 'Prism', comment: 'rotating' })),
    Program: caps(cap(50, 200, effect('Auto')), cap(201, 255, effect('Sound'))),
    Reset: caps(cap(50, 200, maintenance('Reset')))
  },
  modes: [{ name: '12-channel', shortName: '12ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'X/Y Speed', 'Dimmer', 'Strobe', 'Color Wheel', 'Gobo Wheel', 'Prism', 'Program', 'Reset'] }]
}

// Bee-eye washes: 7 × 40W RGBW, rotating front lens.
const beeStrobe = strobe([0, 3, 'Closed'], [4, 103, 'Strobe'], [104, 107, 'Open'], [108, 207, 'Strobe'], [208, 212, 'Open'], [213, 251, 'RandomStrobe'], [252, 255, 'Open'])
const beeChannels = (zoomRange, tiltDeg = 270) => ({
  Pan: pan(540), Tilt: tilt(tiltDeg), 'XY Speed': ptSpeed(),
  Zoom: { capability: { type: 'Zoom', angleStart: `${zoomRange[1]}deg`, angleEnd: `${zoomRange[0]}deg` } },
  'Lens Rotation': caps(cap(0, 127, { type: 'Rotation', angleStart: '0deg', angleEnd: '60deg' }), cap(128, 188, { type: 'Rotation', speedStart: 'fast CCW', speedEnd: 'slow CCW' }), cap(194, 255, { type: 'Rotation', speedStart: 'slow CW', speedEnd: 'fast CW' })),
  Dimmer: { fineChannelAliases: ['Dimmer fine'], capability: { type: 'Intensity' } },
  Strobe: beeStrobe,
  Red: { fineChannelAliases: ['Red fine'], capability: { type: 'ColorIntensity', color: 'Red' } },
  Green: { fineChannelAliases: ['Green fine'], capability: { type: 'ColorIntensity', color: 'Green' } },
  Blue: { fineChannelAliases: ['Blue fine'], capability: { type: 'ColorIntensity', color: 'Blue' } },
  White: { fineChannelAliases: ['White fine'], capability: { type: 'ColorIntensity', color: 'White' } },
  CTC: caps(cap(10, 255, { type: 'ColorTemperature', colorTemperatureStart: '8000K', colorTemperatureEnd: '2000K' })),
  'Color Macro': caps(cap(10, 255, effect('Colour macros'))),
  'Static Effect': caps(cap(30, 255, effect('Static effects'))),
  'Dynamic Effect': caps(cap(8, 255, effect('Built-in effects'))),
  'Effect Speed': generic('Effect speed'),
  'Effect Fade': generic('Effect fade'),
  'Background Red': generic('Effect background red'),
  'Background Green': generic('Effect background green'),
  'Background Blue': generic('Effect background blue'),
  'Background White': generic('Effect background white'),
  Reserved: generic('Reserved'),
  Reset: caps(cap(26, 255, maintenance('Reset')))
})
const pixelLeds = { insert: 'matrixChannels', repeatFor: 'eachPixelABC', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey', 'Green $pixelKey', 'Blue $pixelKey', 'White $pixelKey'] }
const ledTemplates = { 'Red $pixelKey': color('Red'), 'Green $pixelKey': color('Green'), 'Blue $pixelKey': color('Blue'), 'White $pixelKey': color('White') }
const effectBlock = ['Dynamic Effect', 'Effect Speed', 'Effect Fade']

fixtures['splash-pro'] = {
  name: 'Splash Pro Bee Eye Wash Mover (BO-R740L)',
  categories: ['Moving Head', 'Color Changer'],
  comment: 'From the Splash Pro user manual. Pan/tilt not printed: 540°/270° assumed (Splash X manual). The manual\'s 35-channel pattern channels are kept as effect channels.',
  links: { manual: [MANUALS] },
  physical: { dimensions: [338, 450, 256], power: 300, bulb: { type: '7 × 40W RGBW LEDs' }, lens: { degreesMinMax: [4, 60] } },
  matrix: { pixelCount: [7, 1, 1] },
  availableChannels: { ...beeChannels([4, 60]), 'Pattern': effect('Pattern'), 'Pattern Speed': generic('Pattern speed'), 'Pattern Fade': generic('Pattern fade'), 'Pattern Red': generic('Pattern red'), 'Pattern Green': generic('Pattern green'), 'Pattern Blue': generic('Pattern blue'), 'Pattern White': generic('Pattern white'), 'Pattern Dimmer': generic('Pattern dimmer'), 'Background Dimmer': generic('Background dimmer'), 'Pattern Transition': generic('Pattern transition'), 'Pattern Angle': generic('Pattern angle'), 'Foreground Strobe': generic('Foreground strobe'), 'Background Strobe': generic('Background strobe'), 'Background Select': generic('Background select') },
  templateChannels: ledTemplates,
  modes: [
    { name: '23-channel', shortName: '23ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'XY Speed', 'Zoom', 'Lens Rotation', 'Dimmer', 'Strobe', 'Red', 'Green', 'Blue', 'White', 'CTC', 'Color Macro', 'Static Effect', 'Dynamic Effect', 'Effect Speed', 'Background Red', 'Background Green', 'Background Blue', 'Background White', 'Reset'] },
    { name: '35-channel', shortName: '35ch', channels: ['Red', 'Red fine', 'Green', 'Green fine', 'Blue', 'Blue fine', 'White', 'White fine', 'CTC', 'Color Macro', 'Strobe', 'Dimmer', 'Dimmer fine', 'Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Reserved', 'Reset', 'Zoom', 'Lens Rotation', 'Pattern', 'Pattern Speed', 'Pattern Fade', 'Pattern Red', 'Pattern Green', 'Pattern Blue', 'Pattern White', 'Pattern Dimmer', 'Background Dimmer', 'Pattern Transition', 'Pattern Angle', 'Foreground Strobe', 'Background Strobe', 'Background Select'] },
    { name: '51-channel (pixels)', shortName: '51ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'XY Speed', 'Zoom', 'Lens Rotation', 'Dimmer', 'Strobe', 'Red', 'Green', 'Blue', 'White', 'CTC', 'Color Macro', 'Static Effect', 'Dynamic Effect', 'Effect Speed', 'Background Red', 'Background Green', 'Background Blue', 'Background White', 'Reset', pixelLeds] }
  ]
}

// Splash X and BPM-Splash X: 7 × 40W RGBW bee eye with an RGB halo ring.
const splashX = (key, name, physical, comment) => {
  fixtures[key] = {
    name,
    categories: ['Moving Head', 'Color Changer'],
    comment,
    links: { manual: [MANUALS] },
    physical,
    matrix: { pixelKeys: [[['1', '2', '3', '4', '5', '6', '7', 'Halo']]] },
    availableChannels: { ...beeChannels([4, 45]), 'Effect Red': generic('Effect red'), 'Effect Green': generic('Effect green'), 'Effect Blue': generic('Effect blue'), 'Effect White': generic('Effect white'), 'Effect Dimmer': generic('Effect dimmer'), 'Background Dimmer': generic('Background dimmer'), 'Effect Transition': generic('Effect transition'), 'Effect Angle': generic('Effect angle'), 'Foreground Strobe': generic('Foreground strobe'), 'Background Strobe': generic('Background strobe'), 'Background Select': generic('Background select'), 'Halo Effect': caps(cap(52, 255, effect('Halo effects'))), 'Halo Effect Speed': generic('Halo effect speed') },
    templateChannels: { ...ledTemplates, ...haloChannels },
    modes: [
      { name: '30-channel', shortName: '30ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'XY Speed', 'Zoom', 'Lens Rotation', 'Dimmer', 'Strobe', 'Red', 'Green', 'Blue', 'White', 'CTC', 'Color Macro', ...effectBlock, 'Background Red', 'Background Green', 'Background Blue', 'Background White', 'Reset', halo(['$pixelKey Dimmer', '$pixelKey Strobe', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Halo Effect', 'Halo Effect Speed'] },
      { name: '42-channel', shortName: '42ch', channels: ['Red', 'Red fine', 'Green', 'Green fine', 'Blue', 'Blue fine', 'White', 'White fine', 'CTC', 'Color Macro', 'Strobe', 'Dimmer', 'Dimmer fine', 'Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Reserved', 'Reset', 'Zoom', 'Lens Rotation', ...effectBlock, 'Effect Red', 'Effect Green', 'Effect Blue', 'Effect White', 'Effect Dimmer', 'Background Dimmer', 'Effect Transition', 'Effect Angle', 'Foreground Strobe', 'Background Strobe', 'Background Select', halo(['$pixelKey Dimmer', '$pixelKey Strobe', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Halo Effect', 'Halo Effect Speed'] },
      { name: '58-channel (pixels)', shortName: '58ch', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'XY Speed', 'Zoom', 'Lens Rotation', 'Dimmer', 'Strobe', 'Red', 'Green', 'Blue', 'White', 'CTC', 'Color Macro', ...effectBlock, 'Background Red', 'Background Green', 'Background Blue', 'Background White', 'Reset', { ...pixelLeds, repeatFor: ['1', '2', '3', '4', '5', '6', '7'] }, halo(['$pixelKey Dimmer', '$pixelKey Strobe', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue']), 'Halo Effect', 'Halo Effect Speed'] }
    ]
  }
}
splashX('splash-x', 'Splash X Bee Eye Wash Mover with Halo (BO-R740)', { dimensions: [264, 355, 207], power: 280, bulb: { type: '7 × 40W RGBW LEDs + RGB halo ring' }, lens: { degreesMinMax: [4, 45] } }, 'From the Splash X user manual (pan 540°, tilt 270°). Size from the BPM-Splash X, its battery twin.')
splashX('bpm-splash-x', 'BPM-Splash X Battery Bee Eye Wash Mover', { dimensions: [264, 355, 207], weight: 6.2, power: 280, bulb: { type: '7 × 40W RGBW LEDs + RGB light strip' }, lens: { degreesMinMax: [4, 45] } }, 'From the BPM-Splash X user manual ("7 Bees" 30/42/58 channels). Battery-powered with wireless DMX.')

// Aura 1915: 19 × 15W RGBW zoom wash with RGBW backlight.
{
  const auraStrobe = strobe([0, 19, 'Closed'], [20, 24, 'Open'], [25, 64, 'Strobe'], [70, 104, 'Pulse'], [110, 164, 'RandomStrobe'], [170, 204, 'Strobe'], [210, 224, 'Pulse'], [230, 244, 'Strobe'], [245, 255, 'Open'])
  const macro = caps(
    cap(10, 39, { type: 'ColorPreset', colors: ['#ff6ec7'], comment: 'Pink series' }), cap(40, 99, { type: 'ColorPreset', colors: ['#3a6bff'], comment: 'Blue series' }),
    cap(100, 129, { type: 'ColorPreset', colors: ['#2bff4a'], comment: 'Green series' }), cap(130, 169, { type: 'ColorPreset', colors: ['#ffb000'], comment: 'Yellow/amber series' }),
    cap(170, 174, { type: 'ColorPreset', colors: ['#ff2000'], comment: 'Flame red' }), cap(175, 179, { type: 'ColorPreset', colors: ['#ffffff'], comment: 'Open' }),
    cap(180, 229, effect('Colour rotation')), cap(230, 234, { type: 'ColorPreset', colors: ['#ffffff'] }), cap(235, 249, effect('Random colours')), cap(250, 255, { type: 'ColorPreset', colors: ['#ffffff'] })
  )
  fixtures['aura-1915'] = {
    name: 'Aura 1915 Zoom Wash Moving Head (19 × 15W RGBW)',
    categories: ['Moving Head', 'Color Changer'],
    comment: 'From the AURA 1915 user manual (pan 540°, tilt 232°). Colour macro "series" shown as one representative colour each. Size from the product listing.',
    links: { manual: [MANUALS] },
    physical: { dimensions: [320, 380, 210], bulb: { type: '19 × 15W RGBW LEDs + RGBW aura backlight' }, lens: { degreesMinMax: [8, 58] } },
    matrix: { pixelKeys: [[['Aura']]] },
    availableChannels: {
      Strobe: auraStrobe, Dimmer: intensity(), Zoom: zoom(58, 8), Pan: pan(540), Tilt: tilt(232),
      Macro: caps(cap(15, 54, { type: 'PanTiltSpeed', speedStart: 'fast', speedEnd: 'slow' }), cap(10, 14, maintenance('Reset')), cap(250, 255, effect('White only'))),
      'Color Macro': macro, Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('White'),
      CTC: caps(cap(20, 255, { type: 'ColorTemperature', colorTemperatureStart: '10000K', colorTemperatureEnd: '2500K' })),
      'FX1 Select': caps(cap(5, 255, effect('FX1'))), 'FX1 Speed': generic('FX1 speed'), 'FX2 Select': caps(cap(5, 255, effect('FX2'))), 'FX2 Speed': generic('FX2 speed'), 'Operation Mode': generic('Speed sync')
    },
    templateChannels: {
      '$pixelKey Strobe / Dimmer': caps(cap(0, 19, { type: 'ShutterStrobe', shutterEffect: 'Closed' }), cap(20, 244, { type: 'ShutterStrobe', shutterEffect: 'Strobe' }), cap(245, 255, { type: 'Intensity' })),
      '$pixelKey Color': caps(cap(0, 9, { type: 'NoFunction' }), cap(10, 255, effect('Aura colour macros'))),
      '$pixelKey Red': color('Red'), '$pixelKey Green': color('Green'), '$pixelKey Blue': color('Blue'), '$pixelKey White': color('White')
    },
    modes: [
      { name: '14-channel', shortName: '14ch', channels: ['Strobe', 'Dimmer', 'Zoom', 'Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Macro', 'Color Macro', 'Red', 'Green', 'Blue', 'White', 'CTC'] },
      { name: '25-channel', shortName: '25ch', channels: ['Strobe', 'Dimmer', 'Zoom', 'Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Macro', 'Color Macro', 'Red', 'Green', 'Blue', 'White', 'CTC', 'FX1 Select', 'FX1 Speed', 'FX2 Select', 'FX2 Speed', 'Operation Mode', { insert: 'matrixChannels', repeatFor: ['Aura'], channelOrder: 'perPixel', templateChannels: ['$pixelKey Strobe / Dimmer', '$pixelKey Color', '$pixelKey Red', '$pixelKey Green', '$pixelKey Blue', '$pixelKey White'] }] }
    ]
  }
}

// Spider Wash (BO-WASH24): 24 × 12W RGBWA+UV in 6 zones.
{
  const zone = { insert: 'matrixChannels', repeatFor: 'eachPixelABC', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey', 'Green $pixelKey', 'Blue $pixelKey', 'White $pixelKey', 'Amber $pixelKey', 'UV $pixelKey'] }
  const program = caps(cap(10, 178, effect('Jump')), cap(179, 191, effect('Fade')), cap(192, 204, effect('Pulse')), cap(205, 255, effect('Sound')))
  fixtures['spider-wash'] = {
    name: 'Spider Wash (BO-WASH24, 24 × 12W RGBWA+UV)',
    categories: ['Color Changer'],
    comment: 'From the Spider Wash user manual. The 3-channel mode only runs built-in programs, so it is not included.',
    links: { manual: [MANUALS] },
    physical: { dimensions: [285, 220, 190], weight: 3.8, power: 65, bulb: { type: '24 × 12W RGBWA+UV LEDs' }, lens: { degreesMinMax: [20, 20] } },
    matrix: { pixelCount: [6, 1, 1] },
    availableChannels: { Dimmer: intensity(), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('White'), Amber: color('Amber'), UV: color('UV'), Strobe: strobe([0, 0, 'Open'], [1, 255, 'Strobe']), Program: program, Speed: generic('Program speed') },
    templateChannels: { 'Red $pixelKey': color('Red'), 'Green $pixelKey': color('Green'), 'Blue $pixelKey': color('Blue'), 'White $pixelKey': color('White'), 'Amber $pixelKey': color('Amber'), 'UV $pixelKey': color('UV') },
    modes: [
      { name: '6-channel', shortName: '6ch', channels: ['Red', 'Green', 'Blue', 'White', 'Amber', 'UV'] },
      { name: '10-channel', shortName: '10ch', channels: ['Dimmer', 'Red', 'Green', 'Blue', 'White', 'Amber', 'UV', 'Strobe', 'Program', 'Speed'] },
      { name: '40-channel (6 zones)', shortName: '40ch', channels: ['Dimmer', 'Program', 'Speed', 'Strobe', zone] }
    ]
  }
}

// Battery uplights: 6- and 10-channel RGBWA+UV.
const uplight = (key, name, physical, comment, leds) => {
  fixtures[key] = {
    name,
    categories: ['Color Changer'],
    comment,
    links: { manual: [MANUALS] },
    physical: { ...physical, bulb: { type: leds } },
    availableChannels: {
      Dimmer: intensity(), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('White'), Amber: color('Amber'), UV: color('UV'),
      Strobe: strobe([0, 0, 'Open'], [1, 255, 'Strobe']),
      Mode: caps(cap(9, 255, effect('Built-in modes'))),
      'Color & Speed': generic('Colour / speed')
    },
    modes: [
      { name: '6-channel', shortName: '6ch', channels: ['Red', 'Green', 'Blue', 'White', 'Amber', 'UV'] },
      { name: '10-channel', shortName: '10ch', channels: ['Dimmer', 'Red', 'Green', 'Blue', 'White', 'Amber', 'UV', 'Strobe', 'Mode', 'Color & Speed'] }
    ]
  }
}
uplight('ir-4', 'IR-4 Battery Uplight (4 × 12W RGBWA+UV)', { dimensions: [153, 60, 145], weight: 1, lens: { degreesMinMax: [25, 25] } }, 'From the IR-4 user manual. Mode 9-50 is a fixed colour; manual control is at 0-8.', '4 × 12W RGBWA+UV')
uplight('s4', 'S4 Battery Uplight (BO-S603)', { dimensions: [150, 205, 150], weight: 2.2, power: 80, lens: { degreesMinMax: [25, 25] } }, 'From the S-4 user manual. Body size estimated from the 175 × 175 × 235 mm carton.', '4 × 18W RGBWA+UV')
uplight('s6', 'S6 Battery Uplight (BO-S601)', { dimensions: [150, 205, 150], weight: 2.4, power: 110, lens: { degreesMinMax: [25, 25] } }, 'From the S-6 user manual. Body size estimated from the 175 × 175 × 235 mm carton.', '6 × 18W RGBWA+UV')
uplight('chroma-cannon', 'Chroma Cannon Battery Mini Wash (BO-CANS)', { dimensions: [58, 134, 62], weight: 0.4, power: 15, lens: { degreesMinMax: [31, 64] } }, 'From the Chroma Cannon user manual: 15W 6-in-1 with adjustable beam.', '1 × 15W RGBWA+UV')
// The manual's mode channel uses different ranges; 0-39 is manual colour.
fixtures['chroma-cannon'].availableChannels.Mode = caps(cap(40, 255, effect('Built-in modes')))

// SQ series: RGB + warm white + cool white + lime, 10° beam.
const sq = (key, name, physical, leds, extraModes = []) => {
  fixtures[key] = {
    name,
    categories: ['Color Changer'],
    comment: 'From the SQ user manual. Warm white 2700K, cool white 6000K and lime are shown as white and green light.',
    links: { manual: [MANUALS] },
    physical: { ...physical, bulb: { type: leds }, lens: { degreesMinMax: [10, 10] } },
    ...(extraModes.length ? { matrix: { pixelCount: [9, 1, 1] } } : {}),
    availableChannels: {
      Dimmer: intensity(), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), 'Warm White': color('Warm White'), 'Cool White': color('Cold White'), Lime: color('Lime'),
      Strobe: strobe([0, 9, 'Open'], [10, 255, 'Strobe']),
      Mode: caps(cap(40, 255, effect('Jump / fade / pulse / sound'))),
      'Mode Speed': generic('Mode speed')
    },
    ...(extraModes.length ? { templateChannels: { 'Red $pixelKey': color('Red'), 'Green $pixelKey': color('Green'), 'Blue $pixelKey': color('Blue'), 'Warm White $pixelKey': color('Warm White'), 'Cool White $pixelKey': color('Cold White'), 'Lime $pixelKey': color('Lime') } } : {}),
    modes: [
      { name: '6-channel', shortName: '6ch', channels: ['Red', 'Green', 'Blue', 'Warm White', 'Cool White', 'Lime'] },
      { name: '10-channel', shortName: '10ch', channels: ['Dimmer', 'Red', 'Green', 'Blue', 'Warm White', 'Cool White', 'Lime', 'Strobe', 'Mode', 'Mode Speed'] },
      ...extraModes
    ]
  }
}
sq('sq-4-ip', 'SQ-4 IP Battery Uplight (4 × 18W RGB+WW+CW+Lime)', { dimensions: [150, 71, 142], weight: 1.6, power: 20 }, '4 × 18W')
sq('sq-6', 'SQ-6 Battery Uplight (6 × 18W RGB+WW+CW+Lime)', { dimensions: [221, 112, 140], weight: 2.7, power: 20 }, '6 × 18W')
sq('sq-9', 'SQ-9 Battery Uplight (9 × 18W RGB+WW+CW+Lime)', { dimensions: [206, 109, 191], weight: 3.3, power: 65 }, '9 × 18W')
sq('sq-bar9', 'SQ-BAR9 Battery Pixel Bar (9 × 18W RGB+WW+CW+Lime)', { dimensions: [531, 79, 183], weight: 4.5, power: 70 }, '9 × 18W in 9 zones', [
  { name: '58-channel (9 pixels)', shortName: '58ch', channels: ['Dimmer', 'Strobe', 'Mode', 'Mode Speed', { insert: 'matrixChannels', repeatFor: 'eachPixelABC', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey', 'Green $pixelKey', 'Blue $pixelKey', 'Warm White $pixelKey', 'Cool White $pixelKey', 'Lime $pixelKey'] }] }
])
fixtures['sq-bar9'].categories = ['Pixel Bar', 'Color Changer']

// FX Pix Bar 1000 (BO-PB5050): warm blinders, white strobe, 16 RGB pixels.
fixtures['fx-pix-bar-1000'] = {
  name: 'FX Pix Bar 1000 Battery Pixel Bar (BO-PB5050)',
  categories: ['Pixel Bar', 'Strobe', 'Blinder'],
  comment: 'From the FX Pix Bar 1000 user manual. 12 warm (yellow) beams, 13 white strobe groups and 16 RGB pixels.',
  links: { manual: [MANUALS] },
  physical: { dimensions: [1010, 120, 70], weight: 4, power: 90, bulb: { type: '12 × 3W warm white + 156 × 5mm white + 96 × RGB SMD5050' }, lens: { degreesMinMax: [120, 120] } },
  matrix: { pixelKeys: [[['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16']]] },
  availableChannels: {
    Dimmer: intensity(), Strobe: strobe([0, 10, 'Closed'], [11, 255, 'Strobe']),
    'Warm Dimmer': color('Warm White'), 'Warm Strobe': strobe([0, 10, 'Closed'], [11, 255, 'Strobe']), 'Warm Effect': effect('Warm effects'), 'Warm Effect Speed': generic('Warm effect speed'),
    'White Dimmer': color('White'), 'White Strobe': strobe([0, 10, 'Closed'], [11, 255, 'Strobe']), 'White Effect': effect('White effects'), 'White Effect Speed': generic('White effect speed'),
    'RGB Dimmer': intensity(), 'RGB Strobe': strobe([0, 10, 'Closed'], [11, 255, 'Strobe']),
    'RGB Colour': caps(cap(0, 10, { type: 'ColorPreset', colors: ['#000000'] }), cap(11, 45, { type: 'ColorPreset', colors: ['#ff0000'] }), cap(46, 80, { type: 'ColorPreset', colors: ['#00ff00'] }), cap(81, 115, { type: 'ColorPreset', colors: ['#0000ff'] }), cap(116, 150, { type: 'ColorPreset', colors: ['#ffff00'] }), cap(151, 185, { type: 'ColorPreset', colors: ['#ff00ff'] }), cap(186, 220, { type: 'ColorPreset', colors: ['#00ffff'] }), cap(221, 255, { type: 'ColorPreset', colors: ['#ffffff'] })),
    'RGB Effect': effect('RGB effects'), 'RGB Effect Speed': generic('RGB effect speed')
  },
  templateChannels: {
    // Section heads are named so the 3D bar draws them right: "Warm n" blinders, "Strobe n" white strobes.
    '$pixelKey Warm': color('Warm White'), '$pixelKey White': color('White'),
    'Red $pixelKey': color('Red'), 'Green $pixelKey': color('Green'), 'Blue $pixelKey': color('Blue')
  },
  modes: [
    // 14-channel: each section with its own dimmer, strobe and colour. Kept as one fixture head.
    { name: '14-channel', shortName: '14ch', channels: ['Dimmer', 'Warm Dimmer', 'Warm Strobe', 'Warm Effect', 'Warm Effect Speed', 'White Dimmer', 'White Strobe', 'White Effect', 'White Effect Speed', 'RGB Dimmer', 'RGB Strobe', 'RGB Colour', 'RGB Effect', 'RGB Effect Speed'] },
    {
      name: '75-channel (pixels)', shortName: '75ch',
      channels: ['Dimmer', 'Strobe',
        { insert: 'matrixChannels', repeatFor: Array.from({ length: 12 }, (_, i) => `Warm ${i + 1}`), channelOrder: 'perPixel', templateChannels: ['$pixelKey Warm'] },
        { insert: 'matrixChannels', repeatFor: Array.from({ length: 13 }, (_, i) => `Strobe ${i + 1}`), channelOrder: 'perPixel', templateChannels: ['$pixelKey White'] },
        { insert: 'matrixChannels', repeatFor: 'eachPixelABC', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey', 'Green $pixelKey', 'Blue $pixelKey'] }]
    }
  ]
}

// 360 Tubes (BO-TUBE192): 1.44 m tube, RGBWA, 8/16/32 pixel modes.
{
  const tubeModes = [8, 16, 32].map((n) => ({
    name: `${n * 5}-channel (${n} pixels)`, shortName: `${n * 5}ch`,
    channels: [{ insert: 'matrixChannels', repeatFor: Array.from({ length: n }, (_, i) => String(i + 1)), channelOrder: 'perPixel', templateChannels: ['Red $pixelKey', 'Green $pixelKey', 'Blue $pixelKey', 'White $pixelKey', 'Amber $pixelKey'] }]
  }))
  fixtures['360-tubes'] = {
    name: '360 Tube Battery Pixel Tube (BO-TUBE192)',
    categories: ['Pixel Bar'],
    comment: 'From the 360 Tubes user manual: 192 RGBWA LEDs shining all the way round, in 8, 16 or 32 pixel groups.',
    links: { manual: [MANUALS] },
    physical: { dimensions: [53, 1436, 53], weight: 1.7, power: 28, bulb: { type: '192 × 0.2W RGBWA 5050' }, lens: { degreesMinMax: [180, 180] } },
    matrix: { pixelCount: [1, 32, 1] },
    availableChannels: { Dimmer: intensity(), Strobe: strobe([0, 10, 'Open'], [11, 255, 'Strobe']), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('White'), Amber: color('Amber') },
    templateChannels: { 'Red $pixelKey': color('Red'), 'Green $pixelKey': color('Green'), 'Blue $pixelKey': color('Blue'), 'White $pixelKey': color('White'), 'Amber $pixelKey': color('Amber') },
    modes: [
      { name: '5-channel', shortName: '5ch', channels: ['Red', 'Green', 'Blue', 'White', 'Amber'] },
      { name: '7-channel', shortName: '7ch', channels: ['Dimmer', 'Strobe', 'Red', 'Green', 'Blue', 'White', 'Amber'] },
      ...tubeModes
    ]
  }
}

// Retro range: warm COB blinders with RGB pixel backgrounds.
{
  const keys = (n, prefix = '') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
  fixtures['retro-bar-550'] = {
    name: 'Retro Bar 550 (GL-R550, 5 × 60W COB + RGB)',
    categories: ['Pixel Bar', 'Blinder'],
    comment: 'From the Retro 550 user manual. Size not published: a 1 m bar is assumed. The 44-channel mode is only partly documented, so it is not included.',
    links: { manual: [MANUALS] },
    physical: { dimensions: [1000, 100, 110], bulb: { type: '5 × 60W COB + 120 × 5050 RGB' }, lens: { degreesMinMax: [120, 120] } },
    matrix: { pixelKeys: [[[...keys(10), ...keys(5, 'Warm ')]]] },
    availableChannels: { Dimmer: intensity(), 'RGB Strobe': strobe([0, 10, 'Open'], [11, 255, 'Strobe']), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('Warm White'), 'Mode': effect('Effects'), 'Speed': generic('Speed'), 'Background Color': generic('Background colour'), 'Background Tone': generic('Background tone'), 'White Strobe': generic('White strobe'), 'White Mode': effect('White effects'), 'White Speed': generic('White speed') },
    templateChannels: { 'COB $pixelKey': color('Warm White'), 'Red $pixelKey': color('Red'), 'Green $pixelKey': color('Green'), 'Blue $pixelKey': color('Blue') },
    modes: [
      { name: '4-channel', shortName: '4ch', channels: ['Red', 'Green', 'Blue', 'White'] },
      { name: '13-channel', shortName: '13ch', channels: ['Dimmer', 'RGB Strobe', 'Red', 'Green', 'Blue', 'Mode', 'Speed', 'Background Color', 'Background Tone', 'White Strobe', 'White', 'White Mode', 'White Speed'] },
      {
        name: '35-channel (pixels)', shortName: '35ch',
        channels: [{ insert: 'matrixChannels', repeatFor: keys(5, 'Warm '), channelOrder: 'perPixel', templateChannels: ['COB $pixelKey'] }, { insert: 'matrixChannels', repeatFor: keys(10), channelOrder: 'perPixel', templateChannels: ['Red $pixelKey', 'Green $pixelKey', 'Blue $pixelKey'] }]
      }
    ]
  }
  // Hexagon panels: outer and inner RGB rings per segment, a warm COB per segment.
  const hex = (key, name, cells, power, comment, modes) => {
    fixtures[key] = {
      name,
      categories: ['Matrix', 'Blinder'],
      comment,
      links: { manual: [MANUALS] },
      physical: { dimensions: [cells === 7 ? 520 : 600, cells === 7 ? 450 : 520, 110], power, bulb: { type: `${cells} × warm white COB + RGB pixel rings` }, lens: { degreesMinMax: [110, 110] } },
      matrix: { pixelKeys: [[[...keys(cells, 'Outer '), ...keys(cells, 'Inner '), ...keys(cells, 'Warm ')]]] },
      availableChannels: { Dimmer: intensity(), 'Aux Dimmer': generic('Auxiliary dimmer'), Red: color('Red'), Green: color('Green'), Blue: color('Blue'), White: color('Warm White'), 'Outer Red': color('Red'), 'Outer Green': color('Green'), 'Outer Blue': color('Blue'), 'Outer Strobe': generic('Outer strobe'), 'Outer Effect': effect('Outer effects'), 'Outer Speed': generic('Outer effect speed'), 'Inner Red': color('Red'), 'Inner Green': color('Green'), 'Inner Blue': color('Blue'), 'Inner Strobe': generic('Inner strobe'), 'Inner Effect': effect('Inner effects'), 'Inner Speed': generic('Inner effect speed'), 'Background Color': generic('Background colour'), 'Background Dimmer': generic('Background dimmer'), 'White Strobe': generic('White strobe'), 'White Effect': effect('White effects'), 'White Speed': generic('White effect speed'), 'Global Effect': effect('Global effects'), 'Global Speed': generic('Global effect speed') },
      templateChannels: { 'Red $pixelKey': color('Red'), 'Green $pixelKey': color('Green'), 'Blue $pixelKey': color('Blue'), 'COB $pixelKey': color('Warm White') },
      modes
    }
  }
  const rgb = (list) => ({ insert: 'matrixChannels', repeatFor: list, channelOrder: 'perPixel', templateChannels: ['Red $pixelKey', 'Green $pixelKey', 'Blue $pixelKey'] })
  const cob = (n) => ({ insert: 'matrixChannels', repeatFor: keys(n, 'Warm '), channelOrder: 'perPixel', templateChannels: ['COB $pixelKey'] })
  const simple = (name, chs) => ({ name, shortName: `${chs.length}ch`, channels: chs })
  const head22 = ['Dimmer', 'Aux Dimmer', 'Outer Red', 'Outer Green', 'Outer Blue', 'Outer Strobe', 'Outer Effect', 'Outer Speed', 'Inner Red', 'Inner Green', 'Inner Blue', 'Inner Strobe', 'Inner Effect', 'Inner Speed', 'Background Color', 'Background Dimmer']
  hex('retro-7-pro', 'Retro 7 Pro Hexagon Retro Panel (7 × 60W COB + RGB)', 7, 420, 'From the Retro 7 Pro user manual (value ranges not printed: plain 0-255 levels assumed). Size not published: estimated.', [
    simple('4-channel', ['Red', 'Green', 'Blue', 'White']),
    simple('22-channel', [...head22, 'White', 'White Strobe', 'White Effect', 'White Speed', 'Global Effect', 'Global Speed']),
    { name: '49-channel (pixels)', shortName: '49ch', channels: [rgb(keys(7, 'Outer ')), rgb(keys(7, 'Inner ')), cob(7)] }
  ])
  hex('retro-6-pro', 'Retro 6 Pro Hexagon Retro Panel (6 × 50W COB + RGB)', 6, 200, 'From the Retro 6 Pro user manual (200W). Size not published: estimated.', [
    simple('4-channel', ['Red', 'Green', 'Blue', 'White']),
    simple('22-channel', [...head22, 'White', 'White Strobe', 'White Effect', 'White Speed', 'Global Effect', 'Global Speed']),
    { name: '42-channel (pixels)', shortName: '42ch', channels: [rgb(keys(6, 'Outer ')), rgb(keys(6, 'Inner ')), cob(6)] }
  ])
}

// G-Pins: battery pin spot, warm/cool white.
fixtures['g-pins'] = {
  name: 'G-Pins Battery Pin Spot (BO-P10, 10W WW/CW)',
  categories: ['Dimmer'],
  comment: 'From the G-Pin user manual and product page (4 × 4 × 6 in). The 6-channel table is cut off in the manual after the strobe channel.',
  links: { manual: [MANUALS] },
  physical: { dimensions: [102, 152, 102], weight: 1.1, power: 10, bulb: { type: '10W warm + cool white' }, lens: { degreesMinMax: [6, 8] } },
  availableChannels: { Dimmer: intensity(), 'Cool White': color('Cold White'), 'Warm White': color('Warm White'), Strobe: strobe([0, 9, 'Open'], [10, 255, 'Strobe']), Mode: caps(cap(10, 255, effect('Built-in effects'))), 'Effect Speed': generic('Effect speed') },
  modes: [
    { name: '2-channel', shortName: '2ch', channels: ['Cool White', 'Warm White'] },
    { name: '6-channel', shortName: '6ch', channels: ['Dimmer', 'Cool White', 'Warm White', 'Strobe', 'Mode', 'Effect Speed'] }
  ]
}

export function bothLightingFixtures() {
  return fixtures
}
