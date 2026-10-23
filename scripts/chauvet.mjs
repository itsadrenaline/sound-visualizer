/**
 * Chauvet fixtures written from Chauvet's own manuals and DMX charts, in Open Fixture
 * Library format: popular ones the libraries don't have yet.
 */
import { cap, caps, color, effect, generic, intensity, strobe } from './ofl-helpers.mjs'

const mode = (name, channels) => ({ name, shortName: name.replace(/\s+/g, ''), channels })

// --- Freedom Par Q9 (Freedom Par Q9 and Q9X4 user manual, rev. 5) -----------------------
const freedomQ9 = {
  name: 'Freedom Par Q9',
  categories: ['Color Changer'],
  comment: 'Battery-powered wireless uplight: 9 × 6 W RGBA LEDs, 14° beam (field 35°). From the Freedom Par Q9 / Q9X4 user manual (rev. 5).',
  links: { manual: ['https://www.chauvetdj.com/wp-content/uploads/2023/04/Freedom-Par-Q9_and-Q9X4_UM_Rev5.pdf'] },
  physical: { dimensions: [120, 126, 120], weight: 2.1, bulb: { type: '9 × 6 W RGBA LED, battery' }, lens: { degreesMinMax: [14, 14] } },
  availableChannels: {
    Dimmer: intensity(),
    Red: color('Red'),
    Green: color('Green'),
    Blue: color('Blue'),
    Amber: color('Amber'),
    Strobe: strobe([0, 15, 'Open'], [16, 255, 'Strobe']),
    'Color Macro': caps(
      cap(0, 10, { type: 'NoFunction' }),
      cap(11, 200, { type: 'ColorPreset', comment: 'Colour mixing' }),
      ...['#ff0000', '#00ff00', '#0000ff', '#ffbf00', '#ffff00', '#ff00ff', '#ff8000', '#00ffff', '#80ff00', '#ffffff', '#ff4080'].map((hex, i) => cap(201 + i * 5, i === 10 ? 255 : 205 + i * 5, { type: 'ColorPreset', comment: `Colour ${i + 1}`, colors: [hex] }))
    ),
    'Auto Programs': caps(
      cap(0, 21, { type: 'NoFunction' }),
      ...Array.from({ length: 9 }, (_, i) => cap(22 + i * 22, 43 + i * 22, { type: 'Effect', effectName: `Auto program ${i + 1}` })),
      cap(220, 241, { type: 'Effect', effectName: 'Auto programs 1-9' }),
      cap(242, 255, { type: 'Effect', effectName: 'Sound show', soundControlled: true })
    ),
    'Foreground Dimmer': intensity(),
    'Foreground Color': generic('Foreground colour (auto programs 5-9)'),
    'Background Dimmer': intensity(),
    'Background Color': generic('Background colour (auto programs 5-9)'),
    'Auto Speed': effect('Auto speed / sound sensitivity'),
    'Dimmer Speed': generic('Dimmer speed mode')
  },
  modes: [
    mode('4CH', ['Red', 'Green', 'Blue', 'Amber']),
    mode('6CH', ['Dimmer', 'Red', 'Green', 'Blue', 'Amber', 'Strobe']),
    mode('14CH', ['Dimmer', 'Red', 'Green', 'Blue', 'Amber', 'Strobe', 'Color Macro', 'Auto Programs', 'Foreground Dimmer', 'Foreground Color', 'Background Dimmer', 'Background Color', 'Auto Speed', 'Dimmer Speed'])
  ]
}

// --- STRIKE 1 (Chauvet Professional STRIKE 1 DMX chart, rev. 4) -------------------------
const strike1 = {
  name: 'STRIKE 1',
  categories: ['Blinder'],
  comment: 'Single-cell warm white blinder with a red-shift (tungsten-like) dimmer. From the STRIKE 1 DMX chart (rev. 4).',
  links: { manual: ['https://www.chauvetprofessional.com/wp-content/uploads/2018/10/Strike_1_DMX_Chart_Rev4.pdf'] },
  physical: { bulb: { type: 'Warm white COB LED' } },
  availableChannels: {
    Dimmer: { fineChannelAliases: ['Dimmer fine'], capability: { type: 'Intensity' } },
    White: { fineChannelAliases: ['White fine'], capability: { type: 'ColorIntensity', color: 'Warm White' } },
    Amber: { fineChannelAliases: ['Amber fine'], capability: { type: 'ColorIntensity', color: 'Amber' } },
    'Red Shift': caps(cap(0, 0, { type: 'Effect', effectName: 'Red shift on' }), cap(1, 255, { type: 'NoFunction' })),
    Strobe: strobe([0, 10, 'Open'], [11, 255, 'Strobe']),
    'Auto Program': caps(cap(0, 10, { type: 'NoFunction' }), cap(11, 80, { type: 'Effect', effectName: 'Auto 1' }), cap(81, 160, { type: 'Effect', effectName: 'Auto 2' }), cap(161, 240, { type: 'Effect', effectName: 'Auto 3' }), cap(241, 255, { type: 'NoFunction' })),
    'Dimmer Speed': generic('Dimmer speed mode')
  },
  modes: [
    mode('1CH', ['Dimmer']),
    mode('3CH', ['Dimmer', 'Red Shift', 'Dimmer Speed']),
    mode('4CH', ['Dimmer', 'Dimmer fine', 'Red Shift', 'Dimmer Speed']),
    mode('5CH', ['Dimmer', 'Red Shift', 'Strobe', 'Auto Program', 'Dimmer Speed']),
    mode('6CH', ['Dimmer', 'Dimmer fine', 'Red Shift', 'Strobe', 'Auto Program', 'Dimmer Speed']),
    mode('7CH', ['White', 'White fine', 'Amber', 'Amber fine', 'Strobe', 'Auto Program', 'Dimmer Speed'])
  ]
}

export function chauvetDjFixtures() {
  return { 'freedom-par-q9': freedomQ9 }
}

export function chauvetProFixtures() {
  return { 'strike-1': strike1 }
}
