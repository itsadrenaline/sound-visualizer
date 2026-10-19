/**
 * What each real fixture looks like and how it moves, from the manufacturers'
 * spec sheets. The 3D models in three/looks.ts are built from these numbers.
 * Sizes are in metres; "height" is with the fixture standing on its base.
 *
 * Sources (checked October 2026):
 *  - Chauvet DJ product pages and data sheets: Intimidator Hybrid 140SR, Spot 360, Spot 260,
 *    GigBAR Move / Move ILS, Wash FX 2, Wash FX
 *  - Both Lighting product pages: BO-TUBE192, MH-150 (JOE1), Aura 19x15W, BPM-Spots 100,
 *    Spider Wash (WASH24), IR4 mini uplight
 *  - Rockville: Pixel Hybrid Bar
 */

export type LookKind =
  | 'mover' // base + yoke + round head
  | 'moverWash' // mover with a wide, flat LED face (and optional aura ring)
  | 'gigbar' // bar carrying mini movers, derbies, pars, strobes and a laser
  | 'tube' // vertical pixel tube, light all the way round
  | 'bar' // horizontal LED bar with pixel sections
  | 'strip' // thin LED strip
  | 'string' // bulbs along a cable hanging between two points
  | 'uplight' // small box on a kickstand
  | 'flood' // rectangular LED flood on a yoke bracket
  | 'spider' // box with a face of separately coloured lenses
  | 'par' // generic can
  | 'cluster' // round cells on a frame (retro hex lights, multi-cell blinders): each cell its own lens
  | 'panel' // flat panel of square cells in a grid (matrix, pixel panel, blinder)
  | 'laser' // small box with a laser aperture on the front
  | 'derby' // box with a dome of rotating multi-coloured beams (derby, moonflower)
  | 'strobe' // flat bright panel (strobe, blinder)
  | 'fog' // fog or haze machine: a box with a nozzle
  | 'twinbar' // two bars of LEDs side by side, each tilting on its own motor (BeamZ Double Helix, 8-beam "spiders")
  | 'curtain' // LED curtain / starcloth: LEDs scattered over a black drape hung from a truss
  | 'sphere' // a ball covered in lenses on a base, throwing beams all round as it turns (ADJ Starburst)
  | 'acrylic' // LED acrylic panel: a frosted panel in a frame, lit from its edges by an LED strip inside

/** How a fixture's cells sit on its face, for looks that draw cells (cluster, panel). */
export interface CellLayout {
  kind: 'row' | 'column' | 'grid' | 'ring' | 'ringCentre' | 'hex'
  /** For grids: how many across (rows follow from the cell count). */
  cols?: number
}

/** Where each of `n` cells sits, in units of the face's half-size (-1..1), first cell first. */
export function cellPositions(n: number, layout: CellLayout | undefined, aspect = 1): Array<[number, number]> {
  const kind = layout?.kind ?? (n <= 1 ? 'row' : aspect > 2.5 ? 'row' : aspect < 0.4 ? 'column' : n === 7 ? 'ringCentre' : 'grid')
  if (n <= 1) return [[0, 0]]
  switch (kind) {
    case 'row':
      return Array.from({ length: n }, (_, i) => [-1 + (2 * (i + 0.5)) / n, 0])
    case 'column':
      return Array.from({ length: n }, (_, i) => [0, 1 - (2 * (i + 0.5)) / n])
    case 'ring':
      return Array.from({ length: n }, (_, i) => {
        const a = Math.PI / 2 - (i / n) * Math.PI * 2
        return [Math.cos(a) * 0.72, Math.sin(a) * 0.72]
      })
    case 'ringCentre': {
      const ring = n - 1
      const out: Array<[number, number]> = Array.from({ length: ring }, (_, i) => {
        const a = Math.PI / 2 - (i / ring) * Math.PI * 2
        return [Math.cos(a) * 0.66, Math.sin(a) * 0.66]
      })
      return [...out, [0, 0]]
    }
    case 'hex': {
      const out: Array<[number, number]> = [[0, 0]]
      let ring = 1
      while (out.length < n) {
        const count = ring * 6
        for (let i = 0; i < count && out.length < n; i++) {
          const a = Math.PI / 2 - (i / count) * Math.PI * 2
          out.push([Math.cos(a) * ring, Math.sin(a) * ring])
        }
        ring++
      }
      const s = 0.8 / Math.max(1, ring - 1)
      return out.map(([x, y]) => [x * s, y * s])
    }
    default: {
      const cols = Math.max(1, layout?.cols ?? Math.ceil(Math.sqrt(n * aspect)))
      const rows = Math.ceil(n / cols)
      return Array.from({ length: n }, (_, i) => {
        const c = i % cols
        const r = Math.floor(i / cols)
        return [-1 + (2 * (c + 0.5)) / cols, 1 - (2 * (r + 0.5)) / rows]
      })
    }
  }
}

/** A sensible size and beam for each look, when nothing better is known. */
export const LOOK_DEFAULTS: Record<LookKind, { size: [number, number, number]; beam: [number, number] }> = {
  mover: { size: [0.3, 0.42, 0.24], beam: [12, 20] },
  moverWash: { size: [0.3, 0.4, 0.22], beam: [10, 40] },
  gigbar: { size: [1.1, 0.45, 0.14], beam: [11, 19] },
  tube: { size: [0.05, 1.0, 0.05], beam: [180, 180] },
  bar: { size: [1.0, 0.1, 0.08], beam: [120, 120] },
  strip: { size: [1.0, 0.012, 0.012], beam: [120, 120] },
  uplight: { size: [0.16, 0.06, 0.15], beam: [25, 25] },
  flood: { size: [0.3, 0.2, 0.12], beam: [40, 60] },
  spider: { size: [0.3, 0.22, 0.19], beam: [20, 20] },
  par: { size: [0.22, 0.25, 0.22], beam: [25, 40] },
  cluster: { size: [0.42, 0.42, 0.16], beam: [30, 30] },
  panel: { size: [0.5, 0.5, 0.1], beam: [60, 60] },
  laser: { size: [0.2, 0.1, 0.22], beam: [40, 40] },
  derby: { size: [0.3, 0.22, 0.25], beam: [15, 15] },
  strobe: { size: [0.35, 0.12, 0.12], beam: [110, 110] },
  fog: { size: [0.25, 0.2, 0.5], beam: [30, 30] },
  string: { size: [3.0, 0.3, 0.06], beam: [180, 180] },
  twinbar: { size: [0.28, 0.16, 0.15], beam: [6, 6] },
  curtain: { size: [2.0, 1.0, 0.02], beam: [120, 120] },
  sphere: { size: [0.32, 0.41, 0.32], beam: [1, 1] },
  acrylic: { size: [0.5, 1.2, 0.04], beam: [160, 160] }
}

export interface FixtureSpec {
  look: LookKind
  /** How the cells sit on the face (cluster and panel looks). */
  layout?: CellLayout
  /** Housing colour, e.g. "#18191c" (black) or "#d8d8d8" (white). */
  bodyColor?: string
  /** Overall size: width (left-right), height, depth, metres. */
  size: [number, number, number]
  /** Movement range in degrees (movers only). */
  pan?: number
  tilt?: number
  /** Beam angle in degrees: [narrow, wide]. */
  beam: [number, number]
  /** Fastest head movement, degrees per second (from typical 540° pan times). */
  speed?: number
  /** Brightness relative to a 100 W LED spot. */
  output: number
  /** LEDs on the face, for wash looks: how many to draw. */
  leds?: number
  /**
   * The pan/tilt speed channel goes slow to fast (0 = slowest), the opposite of most
   * movers (Cameo Hydrabeam). Used when a fixture file doesn't say which way it goes.
   */
  speedRising?: boolean
  /** For lasers: how many apertures (separate fans of beams). */
  apertures?: number
  /** For movers: a ring of LEDs around the lens (BPM-Spots, Aura). */
  halo?: boolean
  /** How it's usually rigged. */
  mount: 'hanging' | 'floor' | 'stand'
  /**
   * Drawn with its own stand (a GigBar's 2.2 m pole). Missing means the old default:
   * GigBars have one, nothing else does. Fixture Studio sets it (off for new fixtures).
   */
  stand?: boolean
  note: string
}

/** Does this kind of fixture come with its own stand (see FixtureSpec.stand)? */
export function hasOwnStand(spec: Pick<FixtureSpec, 'look' | 'stand'> | undefined): boolean {
  return !!spec && spec.look === 'gigbar' && spec.stand !== false
}

interface Entry {
  match: RegExp
  spec: FixtureSpec
}

const CATALOG: Entry[] = [
  {
    match: /hybrid\s*140/i,
    spec: { look: 'mover', size: [0.322, 0.513, 0.22], pan: 540, tilt: 270, beam: [3, 28], speed: 220, output: 1.6, mount: 'hanging', note: 'Chauvet Intimidator Hybrid 140SR: 140 W discharge, beam/spot/wash, 12 colours + white, 2 gobo wheels, 2 prisms.' }
  },
  {
    match: /intimidator\s*spot\s*360/i,
    spec: { look: 'mover', size: [0.322, 0.423, 0.297], pan: 540, tilt: 270, beam: [12, 17], speed: 200, output: 1.0, mount: 'hanging', note: 'Chauvet Intimidator Spot 360: 100 W LED, 8 colours + white, 7 gobos, 2 prisms.' }
  },
  {
    match: /intimidator\s*spot\s*260/i,
    spec: { look: 'mover', size: [0.232, 0.351, 0.163], pan: 540, tilt: 270, beam: [12, 17], speed: 220, output: 0.75, mount: 'hanging', note: 'Chauvet Intimidator Spot 260: 75 W LED, 8 colours + white, 7 gobos, 3-facet prism.' }
  },
  {
    match: /joe1|bo-mh150|150w beam/i,
    spec: { look: 'mover', size: [0.3, 0.45, 0.25], pan: 540, tilt: 270, beam: [2, 6], speed: 260, output: 1.5, mount: 'hanging', note: 'Both Lighting MH-150: 150 W LED beam, 7 colours + white, 2 gobo wheels, 3-facet prism.' }
  },
  {
    match: /bpm-spots|100w spot moving/i,
    spec: { look: 'mover', size: [0.3, 0.43, 0.28], pan: 540, tilt: 270, beam: [14, 14], speed: 200, output: 1.0, halo: true, mount: 'floor', note: 'Both Lighting BPM-Spots 100: 100 W LED spot with an RGB halo ring (21 LEDs), battery and wireless DMX.' }
  },
  {
    match: /19x15w|aura/i,
    spec: { look: 'moverWash', size: [0.32, 0.38, 0.21], pan: 540, tilt: 240, beam: [8, 58], speed: 220, output: 1.2, leds: 19, halo: true, mount: 'hanging', note: 'Both Lighting Aura 19x15W: 19 RGBW LEDs with zoom, plus 30 RGB aura LEDs behind the lenses.' }
  },
  {
    match: /gigbar/i,
    spec: { look: 'gigbar', size: [1.1, 0.449, 0.144], pan: 540, tilt: 180, beam: [11, 19], speed: 250, output: 0.5, mount: 'stand', note: 'Chauvet GigBAR Move: a 1.1 m bar with 2 mini movers, 2 derbies, 2 pars, strobes and a laser.' }
  },
  {
    match: /bo-tube|pixel tube/i,
    spec: { look: 'tube', size: [0.053, 1.436, 0.053], beam: [180, 180], output: 0.35, mount: 'floor', note: 'Both Lighting BO-TUBE192: 1.44 m tube, 192 RGBWA LEDs shining all the way round, 16 pixel zones.' }
  },
  {
    match: /rockville|pixel hybrid bar/i,
    spec: { look: 'bar', size: [1.005, 0.125, 0.07], beam: [120, 120], output: 0.6, mount: 'floor', note: 'Rockville Pixel Hybrid Bar: 1 m bar, 96 RGB LEDs in 16 sections, 12 warm-white blinders, white strobe LEDs.' }
  },
  {
    match: /strip|decoder/i,
    spec: { look: 'strip', size: [1.0, 0.012, 0.012], beam: [120, 120], output: 0.25, mount: 'stand', note: 'LED tape: a single colour along its length.' }
  },
  {
    match: /ir4|mini spotlight|uplight/i,
    spec: { look: 'uplight', size: [0.153, 0.06, 0.145], beam: [25, 25], output: 0.45, leds: 4, mount: 'floor', note: 'Both Lighting IR4: 4 × 12 W RGBWA+UV LEDs, battery uplight, 25° beam.' }
  },
  {
    match: /wash\s*fx\s*2/i,
    spec: { look: 'flood', size: [0.31, 0.23, 0.14], beam: [40, 64], output: 0.5, leds: 18, mount: 'floor', note: 'Chauvet Wash FX 2: 18 quad-colour RGB+UV LEDs in 6 zones, 40° beam.' }
  },
  {
    match: /wash\s*fx/i,
    spec: { look: 'flood', size: [0.216, 0.254, 0.18], beam: [60, 90], output: 0.45, leds: 18, mount: 'floor', note: 'Chauvet Wash FX: 18 tri-colour RGB LEDs, pixel-mappable zones, 90° coverage.' }
  },
  {
    match: /spider\s*wash|wash\s*24/i,
    spec: { look: 'spider', size: [0.285, 0.22, 0.19], beam: [20, 20], output: 0.6, leds: 24, mount: 'floor', note: 'Both Lighting Spider Wash (WASH24): 24 × 12 W RGBWA+UV LEDs in separately coloured groups, 20° beams.' }
  },
  {
    match: /acrylic\s*(led\s*)?panel|led\s*acrylic/i,
    spec: { look: 'acrylic', size: [0.5, 1.2, 0.04], beam: [160, 160], output: 0.35, bodyColor: '#ececee', mount: 'floor', note: 'LED acrylic panel: a frosted acrylic panel in a frame, lit from its edges by an RGBW LED strip inside.' }
  },
  {
    match: /hydra\s*beam/i,
    spec: { look: 'mover', size: [0.81, 0.25, 0.13], pan: 540, tilt: 270, beam: [4.5, 4.5], speed: 330, output: 0.5, speedRising: true, mount: 'hanging', note: 'Cameo Hydrabeam: four small beam moving heads on one bar (540° pan, 270° tilt, 4.5° beams). Its head speed channels go slow to fast.' }
  },
  {
    match: /\bstarbu?r?st\b/i,
    spec: { look: 'sphere', size: [0.318, 0.4125, 0.318], beam: [1, 1], output: 0.55, leds: 56, mount: 'floor', note: 'ADJ Starburst: a ball covered in lenses on a base; five 15 W six-colour LEDs throw many 1° beams through them while a motor turns the ball.' }
  },
  {
    match: /\bEL-?900\s*RGB/i,
    spec: { look: 'laser', size: [0.34, 0.12, 0.26], beam: [40, 40], output: 0.5, apertures: 4, mount: 'hanging', note: 'Laserworld EL-900RGB: a full-colour (RGB) laser with four apertures in a curved front, each steered by its own pair of motors. Size estimated.' }
  },
  {
    match: /double\s*helix|mhl\s*-?820/i,
    spec: { look: 'twinbar', size: [0.28, 0.16, 0.15], pan: 0, tilt: 135, beam: [6, 6], speed: 180, output: 0.35, leds: 8, mount: 'floor', note: 'BeamZ Double Helix (MHL820): two heads side by side, each a bar of four 3 W LEDs (red, green, blue, white) tilting 135° on its own motor. Beam angle not printed: narrow, like similar effects.' }
  },
  {
    match: /sparkle\s*wall.*(led\s?36|1\s*x\s*2|2\s*x\s*1)|151\.?202/i,
    spec: { look: 'curtain', size: [2.0, 1.0, 0.02], beam: [120, 120], output: 0.3, leds: 36, mount: 'hanging', note: 'BeamZ SparkleWall LED36 (151.202): an LED curtain, 36 RGBW LEDs over 2 × 1 m of black cloth, all one colour.' }
  },
  {
    match: /sparkle\s*wall|151\.?200/i,
    spec: { look: 'curtain', size: [3.0, 2.0, 0.02], beam: [120, 120], output: 0.4, leds: 96, mount: 'hanging', note: 'BeamZ SparkleWall LED96 (151.200): an LED curtain, 96 RGBW LEDs over 3 × 2 m of black cloth, all one colour.' }
  }
]

const GENERIC_MOVER: FixtureSpec = { look: 'mover', size: [0.3, 0.42, 0.24], pan: 540, tilt: 270, beam: [10, 30], speed: 220, output: 1, mount: 'hanging', note: 'Generic moving head.' }
const GENERIC_PAR: FixtureSpec = { look: 'par', size: [0.2, 0.25, 0.2], beam: [20, 45], output: 0.6, mount: 'floor', note: 'Generic PAR.' }

/** The researched spec for a fixture name, if there is one. */
export function catalogSpec(name: string): FixtureSpec | undefined {
  return CATALOG.find((e) => e.match.test(name))?.spec
}

/** The spec for a fixture by its name, or a sensible generic one. */
export function specFor(definitionName: string, isMover: boolean): FixtureSpec {
  return CATALOG.find((e) => e.match.test(definitionName))?.spec ?? (isMover ? GENERIC_MOVER : GENERIC_PAR)
}

/**
 * How many LEDs a fixture's name says it has: "Par RGBWAU 12x12" and "18 x 10W" are
 * 12 and 18 LEDs, "8x3W" is 8. Sizes ("3 x 2 m") and channel counts aren't LEDs.
 * Used to draw the face when nothing else says how many LEDs there are.
 */
export function ledsFromName(name: string): number | undefined {
  const m = /(?:^|[^\d.])(\d{1,3})\s*[x×]\s*(\d{1,3}(?:[.,]\d+)?)\s*(w\b|watt)?(?!\s*(?:m\b|mm\b|cm\b|mtr|ft\b|'|"|\d))/i.exec(name)
  // "LED36", "LED96" (BeamZ SparkleWall): the LED count is part of the model name.
  const n = Number(m?.[1] ?? /\bLED\s?(\d{2,3})\b/i.exec(name)?.[1] ?? 0)
  return n >= 2 && n <= 200 ? n : undefined
}
