/**
 * Objects: totems, stands, truss, stage decks, speakers and subs, DJ and band
 * gear, furniture, walls, screens and people. Plain data, like fixtures;
 * three/structures.ts draws them. (In the code they're called structures.)
 *
 * Each kind knows its real-world size, the surfaces other things can stand on
 * (a stage deck's top, a table top), and its mount points: where a fixture can
 * sit on top, hang underneath or clamp to the side. physics.ts uses those to
 * keep everything resting on something (nothing in the floor, nothing floating).
 *
 * Sizes are stored in metres. Presets use the feet and inches the gear is sold in.
 * Sources: Chauvet DJ FLEXstand (1.5-2.4 m, 21.6 in base, M10 top); industry
 * standard F34 box truss (290 mm), 4 × 4 / 4 × 8 ft stage decks, 6/8 ft banquet
 * tables (30 in deep, 29 in high), Pro X XF-4X3048 facade panels (30 × 48 in),
 * 60/72 in round banquet tables and 30 in high-tops (42 in tall), 42 in bars,
 * typical 8-15 in powered tops, 18 in subs, and line array boxes around
 * 1 m × 0.3 m × 0.5 m (sizes vary by maker; these are typical, not one model).
 */
import type { Vec3 } from './project'

export const FT = 0.3048
export const IN = 0.0254

export type StructureKind =
  | 'totem' | 'flexstand' | 'tbar' | 'tubeStand'
  | 'goalpost' | 'trussBox' | 'groundTruss'
  | 'stage' | 'table' | 'djBooth' | 'pipeDrape'
  | 'speakerColumn' | 'speakerOnPole' | 'sub'
  // Audio
  | 'speakerOnSub' | 'speakerBox' | 'monitor' | 'subStack' | 'lineArray' | 'groundStack' | 'fohDesk' | 'ampRack'
  // DJ & band
  | 'djGear' | 'micStand' | 'drumKit' | 'guitarAmp' | 'keyboard'
  // Furniture
  | 'roundTable' | 'highTop' | 'bar' | 'chairs' | 'sofa'
  // Room
  | 'wall' | 'danceFloor' | 'screen' | 'ledWall' | 'backdrop' | 'stanchions' | 'plant' | 'pillar'
  // Party
  | 'tv' | 'balloonArch' | 'photoBooth' | 'neonSign' | 'discoBall' | 'photoBackdrop' | 'marqueeLetters' | 'monogram'
  // Room lights (not part of the show)
  | 'chandelier' | 'pendantLights' | 'ceilingDrape' | 'wallSconce'
  // People
  | 'person' | 'crowd'

export type Cover = 'none' | 'white' | 'black'

export interface Structure {
  id: string
  kind: StructureKind
  name: string
  /** x and z are where it stands; y is worked out (the floor, or the top of what it stands on). */
  position: Vec3
  /** Turn around its vertical axis, degrees. */
  rotation: number
  /** Size and options; which ones depend on the kind (see STRUCTURE_KINDS). */
  params: StructureParams
  /**
   * A disco ball hanging from a truss bar or the ceiling (worked out by physics.ts):
   * `position[1]` is then the point it hangs from. Missing: it stands (on a totem, a table, the floor).
   */
  hang?: 'truss' | 'ceiling'
}

export interface StructureParams {
  width?: number
  depth?: number
  height?: number
  /** Truss profile size (square, metres). */
  truss?: number
  /** Scrim, skirt or drape colour. */
  cover?: Cover
  /** Number of pipe & drape spans. */
  spans?: number
  /** Stage: steps at the front. */
  stairs?: boolean
  /** Speaker driver or table diameter, inches. */
  size?: number
  /** How many: boxes in an array, subs in a stack, chairs in a row, posts, players. */
  count?: number
  /** Rows of chairs; subs under a ground-stacked array. */
  rows?: number
  /** Chairs around a round table. */
  seats?: number
  /** Screens and LED walls: height of the bottom edge above what it stands on. */
  bottom?: number
  /** Crowd: people per square metre. */
  density?: number
  /** Sub stack: the middle sub faces backwards (cardioid). */
  cardioid?: boolean
  /** Mic stand with a boom arm. */
  boom?: boolean
  /** DJ gear: turntables instead of media players. */
  vinyl?: boolean
  /** Guitar amp: a half stack instead of a combo. */
  stack?: boolean
  /** Screens, TVs and LED walls: what's showing (see SCREEN_CONTENT). */
  content?: ScreenContent
  /** The picture (a data: URL, kept in the show) or video (an id in this computer's media store) it shows. */
  media?: string
  /** The picked file's name, to show in the inspector. */
  mediaName?: string
  /** Words on a screen or a neon sign. */
  text?: string
  /** Colour of the words or the neon, from NEON_COLOURS. */
  tint?: number
  /** Dance floor: light-up LED tiles. */
  led?: boolean
  /** Dance floor: what the LED tiles do, from FLOOR_PATTERNS. */
  pattern?: number
  /** Balloon arch: colours, from BALLOON_PALETTES. */
  palette?: number
  /** Disco ball: length of the chain it hangs on (or the rod it stands on), metres. */
  drop?: number
  /** Disco ball: motor speed, turns per minute (0 = still). */
  rpm?: number
  /** Room lights (chandeliers, sconces, fairy lights, a photo booth's lamps): switched on. Missing = on. */
  lightOn?: boolean
  /** Monogram projection: on a wall rather than the floor. */
  onWall?: boolean
  /** Room lights: dim and brighten with the room's light (Room ▸ light). Missing = yes. */
  followRoom?: boolean
}

/** Things that hang from a truss bar above them or the ceiling (or sit on a stand): see physics.ts. */
export const HANGING_KINDS: StructureKind[] = ['discoBall', 'chandelier', 'pendantLights']
/** Lights that are part of the room, not the show: they follow the room's light and can be switched off. */
export const ROOM_LIGHT_KINDS: StructureKind[] = ['chandelier', 'pendantLights', 'ceilingDrape', 'wallSconce', 'photoBackdrop', 'marqueeLetters', 'monogram']
const ROOM_LIGHT_FIELDS: ParamField[] = [
  { key: 'lightOn', label: 'Light on', kind: 'boolean' },
  { key: 'followRoom', label: 'Dims with the room light', kind: 'boolean' }
]

/** A disco ball's radius from its diameter in inches. */
export const discoRadius = (size = 16) => (size * IN) / 2

/** What a light-up dance floor can do. */
export const FLOOR_PATTERNS: Array<[string, number]> = [['Mix', 0], ['Rainbow chase', 1], ['Checkers', 2], ['Ripple', 3], ['Sparkle', 4], ['Starfield', 5], ['Colour fade', 6]]

/** What a screen can show. */
export type ScreenContent = 'off' | 'colours' | 'visuals' | 'image' | 'video' | 'text'
export const SCREEN_CONTENT: Array<[ScreenContent, string]> = [['off', 'Nothing'], ['colours', 'Colours'], ['visuals', 'Visuals'], ['image', 'Picture'], ['video', 'Video'], ['text', 'Words']]
/** Screens: things that show a picture. */
export const SCREEN_KINDS: StructureKind[] = ['screen', 'ledWall', 'tv']

export const NEON_COLOURS: Array<[string, string]> = [['Pink', '#ff3fa4'], ['Blue', '#3fa9ff'], ['White', '#fff3e0'], ['Red', '#ff3030'], ['Green', '#3fff7a'], ['Yellow', '#ffd23f'], ['Purple', '#b03fff'], ['Orange', '#ff8a2a']]
export const BALLOON_PALETTES: Array<[string, string[]]> = [
  ['Gold and white', ['#d4af37', '#f6f1e7', '#e8cf7a']],
  ['Pink and white', ['#ff8fc4', '#ffffff', '#ff4fa0']],
  ['Blue and silver', ['#2f6fd6', '#c9ccd2', '#8fc2ff']],
  ['Black and gold', ['#141414', '#d4af37', '#2a2a2a']],
  ['Red and white', ['#d62020', '#ffffff', '#ff6b6b']],
  ['Rainbow', ['#ff3030', '#ff9a2a', '#ffe23f', '#3fd66b', '#3fa9ff', '#9a4fff']]
]

/** A TV's diagonal (inches) → width and height of the screen, metres (16:9). */
export function tvSize(diagonal = 65): [number, number] {
  return [diagonal * 0.8716 * IN, diagonal * 0.4903 * IN]
}

/** Where a fixture attaches. */
export type MountKind = 'top' | 'under' | 'clamp' | 'face'

export interface MountPoint {
  id: string
  kind: MountKind
  /** Local position (structure at the origin, unrotated), metres. */
  at: Vec3
  /** For a bar or a leg: the other end. A fixture can clamp anywhere between `at` and `to`. */
  to?: Vec3
  /** Which way a clamped fixture faces, degrees around Y (0 = towards the audience, +z). */
  facing?: number
  label: string
  /** Fixed aim a fixture gets when it's put here (degrees from straight up, or down when hanging). */
  aim?: number
  /**
   * Inside a totem: how far the beam can go before it meets the plate at the
   * other end, metres. The beam and the light it throws stop there.
   */
  reach?: number
  /** Inside the structure (a totem's scrim): the fixture's beam lights the scrim from within. */
  inside?: boolean
  /**
   * Clamped on its back to the front of the truss, so it faces out (towards the
   * audience, or `facing`) instead of up: a Double Helix or a PAR on a truss face.
   */
  out?: boolean
}

export interface ParamField {
  key: keyof StructureParams
  label: string
  kind: 'length' | 'cover' | 'count' | 'boolean' | 'truss' | 'choice' | 'content' | 'text'
  min?: number
  max?: number
  /** Quick picks, in feet for lengths. */
  presets?: number[]
  /** For 'choice': the options, as [label, value]. */
  options?: Array<[string, number]>
  /** For 'cover': what None, White and Black mean on this object. */
  coverNames?: Partial<Record<Cover, string>>
}

export type Category = 'Stands & totems' | 'Truss' | 'Staging' | 'Speakers & sound' | 'DJ & band' | 'Party' | 'Screens' | 'Room lights' | 'Furniture' | 'Room & decor' | 'People'

export interface KindInfo {
  label: string
  category: Category
  description: string
  defaults: StructureParams
  fields: ParamField[]
  /** Things can stand on its top. */
  surface: boolean
  /**
   * A stand that exists to hold what's on it (a totem, a tube stand): grabbing
   * the fixture on it moves the stand too, and arranging treats them as one.
   */
  carrier?: boolean
  /** Hangs from the ceiling: it never stands on the stage or a table below. */
  flown?: boolean
  /**
   * Big and underfoot (a stage, a dance floor, a crowd): pressing on it and
   * dragging draws a selection box, so you can pick out what's on it. Select it
   * first (click) to drag it.
   */
  ground?: boolean
}

/** Typical powered top sizes by woofer, inches → width, height, depth in metres. */
export const CABINETS: Record<number, [number, number, number]> = {
  8: [0.27, 0.42, 0.25],
  10: [0.31, 0.5, 0.29],
  12: [0.37, 0.6, 0.35],
  15: [0.44, 0.72, 0.42]
}
export function cabinetOf(size?: number): [number, number, number] {
  return CABINETS[size ?? 12] ?? CABINETS[12]
}
const SPEAKER_SIZES: Array<[string, number]> = [['8 in', 8], ['10 in', 10], ['12 in', 12], ['15 in', 15]]
/** An 18 in sub: width, height, depth. */
export const SUB_18: [number, number, number] = [0.6, 0.65, 0.75]
/** A typical line array box: width, height, depth. */
export const ARRAY_BOX: [number, number, number] = [1.0, 0.3, 0.5]
/** A line array sub (flyable 18 in, same width as the boxes). */
export const ARRAY_SUB: [number, number, number] = [1.0, 0.55, 0.75]
const SEAT_W = 0.5
const ROW_D = 0.85

const TRUSS_SIZES: Array<[string, number]> = [['F34 square (12 in)', 0.29], ['F24 square (8 in)', 0.22], ['F14 mini (6 in)', 0.15]]
export const TRUSS_OPTIONS = TRUSS_SIZES

export const STRUCTURE_KINDS: Record<StructureKind, KindInfo> = {
  totem: {
    label: 'Totem', category: 'Stands & totems', surface: false, carrier: true,
    description: 'Square truss totem with a 24 in base plate and a 12 in top plate. Fixtures sit on top or clamp to the front.',
    defaults: { height: 6 * FT, truss: 0.29, cover: 'white' },
    fields: [
      { key: 'height', label: 'Height', kind: 'length', min: 0.5, max: 4, presets: [2, 4, 6, 8, 9] },
      { key: 'truss', label: 'Truss', kind: 'truss' },
      { key: 'cover', label: 'Scrim', kind: 'cover' }
    ]
  },
  flexstand: {
    label: 'Chauvet DJ FLEXstand', category: 'Stands & totems', surface: false, carrier: true,
    description: 'Telescoping stand, 1.5-2.4 m (4.8-8 ft), 21.6 in square base, M10 mount on top. Optional scrim.',
    defaults: { height: 2.0, cover: 'none' },
    fields: [
      { key: 'height', label: 'Height', kind: 'length', min: 1.5, max: 2.44, presets: [5, 6, 7, 8] },
      { key: 'cover', label: 'Scrim', kind: 'cover' }
    ]
  },
  tubeStand: {
    label: 'Tube stand', category: 'Stands & totems', surface: false, carrier: true,
    description: 'A mic-stand style pole on a round weighted base for a pixel tube (like the Both Lighting 360 Tube). The tube stands upright on top.',
    defaults: { height: 4 * FT },
    fields: [{ key: 'height', label: 'Height', kind: 'length', min: 0.15, max: 3, presets: [1, 2, 4, 6, 8] }]
  },
  tbar: {
    label: 'T-bar lighting stand', category: 'Stands & totems', surface: false, carrier: true,
    description: 'Tripod stand with a T-bar on top: four fixtures on or under the bar.',
    defaults: { height: 2.6, width: 1.2 },
    fields: [
      { key: 'height', label: 'Height', kind: 'length', min: 1.2, max: 4, presets: [6, 8, 10, 12] },
      { key: 'width', label: 'Bar width', kind: 'length', min: 0.6, max: 2, presets: [3, 4, 5] }
    ]
  },
  goalpost: {
    label: 'Goalpost truss', category: 'Truss', surface: false,
    description: 'Two truss uprights and a crossbar. Hang fixtures under the bar, sit them on top, or clamp to the legs.',
    defaults: { width: 10 * FT, height: 10 * FT, truss: 0.29 },
    fields: [
      { key: 'width', label: 'Span', kind: 'length', min: 1, max: 24, presets: [10, 15, 20, 30, 40] },
      { key: 'height', label: 'Height', kind: 'length', min: 1.5, max: 10, presets: [8, 10, 12, 16, 20] },
      { key: 'truss', label: 'Truss', kind: 'truss' }
    ]
  },
  trussBox: {
    label: 'Truss box (cube)', category: 'Truss', surface: false,
    description: 'Four uprights with a square or rectangular truss frame on top, like a DJ cage or a ground-supported rig.',
    defaults: { width: 10 * FT, depth: 10 * FT, height: 10 * FT, truss: 0.29 },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 1, max: 24, presets: [8, 10, 15, 20] },
      { key: 'depth', label: 'Depth', kind: 'length', min: 1, max: 24, presets: [8, 10, 15, 20] },
      { key: 'height', label: 'Height', kind: 'length', min: 1.5, max: 10, presets: [8, 10, 12, 16] },
      { key: 'truss', label: 'Truss', kind: 'truss' }
    ]
  },
  groundTruss: {
    label: 'Truss on the floor', category: 'Truss', surface: false,
    description: 'A straight truss section lying on the floor (a ground row). Fixtures sit on top.',
    defaults: { width: 10 * FT, truss: 0.29 },
    fields: [
      { key: 'width', label: 'Length', kind: 'length', min: 0.5, max: 20, presets: [5, 8, 10, 15, 20] },
      { key: 'truss', label: 'Truss', kind: 'truss' }
    ]
  },
  stage: {
    label: 'Stage deck', category: 'Staging', surface: true, ground: true,
    description: 'Made of 4 × 4 ft or 4 × 8 ft decks on legs. Anything placed on it stands on top. Skirt (scrim) and front steps optional.',
    defaults: { width: 8 * FT, depth: 12 * FT, height: 2 * FT, cover: 'black', stairs: true },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 1.2, max: 30, presets: [4, 8, 12, 16, 24] },
      { key: 'depth', label: 'Depth', kind: 'length', min: 1.2, max: 20, presets: [4, 8, 12, 16] },
      { key: 'height', label: 'Height', kind: 'length', min: 0.05, max: 2.5, presets: [1, 2, 4, 6] },
      { key: 'cover', label: 'Skirt', kind: 'cover' },
      { key: 'stairs', label: 'Front steps', kind: 'boolean' }
    ]
  },
  table: {
    label: 'Banquet table', category: 'Furniture', surface: true,
    description: 'Banquet table, 30 in deep and 29 in high. Use for a second DJ setup or merch; add a skirt.',
    defaults: { width: 6 * FT, depth: 30 * IN, height: 29 * IN, cover: 'black' },
    fields: [
      { key: 'width', label: 'Length', kind: 'length', min: 0.6, max: 4, presets: [4, 6, 8] },
      { key: 'depth', label: 'Depth', kind: 'length', min: 0.4, max: 1.5 },
      { key: 'height', label: 'Height', kind: 'length', min: 0.4, max: 1.3, presets: [2.5, 3, 3.5] },
      { key: 'cover', label: 'Skirt', kind: 'cover' }
    ]
  },
  djBooth: {
    label: 'DJ booth (facade)', category: 'DJ & band', surface: true,
    description: 'Table with a scrim facade in front (30 × 48 in panels). Bars stand on top; LED tape can run along the front.',
    defaults: { width: 10 * FT, depth: 30 * IN, height: 48 * IN, cover: 'white' },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 1, max: 6, presets: [5, 7.5, 10] },
      { key: 'height', label: 'Height', kind: 'length', min: 0.8, max: 1.4, presets: [3.5, 4] },
      { key: 'cover', label: 'Facade', kind: 'cover' }
    ]
  },
  pipeDrape: {
    label: 'Pipe & drape', category: 'Room & decor', surface: false,
    description: 'Uprights on base plates with crossbars and drape. Light fixtures can hang from the crossbar.',
    defaults: { width: 10 * FT, height: 10 * FT, spans: 2, cover: 'black' },
    fields: [
      { key: 'spans', label: 'Spans', kind: 'count', min: 1, max: 12 },
      { key: 'width', label: 'Span width', kind: 'length', min: 1.5, max: 5, presets: [8, 10, 12, 16] },
      { key: 'height', label: 'Height', kind: 'length', min: 1.5, max: 6, presets: [8, 10, 12, 16] },
      { key: 'cover', label: 'Drape', kind: 'cover' }
    ]
  },
  speakerColumn: {
    label: 'Column PA speaker', category: 'Speakers & sound', surface: false,
    description: 'A column PA (like the LD Systems MAUI 44): sub base, spacer and column array, about 2 m tall.',
    defaults: { height: 2.0 },
    fields: [{ key: 'height', label: 'Height', kind: 'length', min: 1.5, max: 2.5 }]
  },
  speakerOnPole: {
    label: 'Speaker on a tripod', category: 'Speakers & sound', surface: false,
    description: 'A powered top speaker (8-15 in) on a tripod stand.',
    defaults: { height: 1.9, size: 12 },
    fields: [
      { key: 'size', label: 'Speaker', kind: 'choice', options: SPEAKER_SIZES },
      { key: 'height', label: 'Speaker height', kind: 'length', min: 1.2, max: 2.6, presets: [5, 6, 7] }
    ]
  },
  sub: {
    label: 'Subwoofer', category: 'Speakers & sound', surface: true,
    description: 'A subwoofer (15 in, 18 in, 21 in or double 18). Tops, monitors and fixtures can stand on it.',
    defaults: { width: 0.6, depth: 0.75, height: 0.65 },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 0.4, max: 1.4 },
      { key: 'depth', label: 'Depth', kind: 'length', min: 0.4, max: 1.1 },
      { key: 'height', label: 'Height', kind: 'length', min: 0.4, max: 1 }
    ]
  },

  // --- Speakers & sound ---
  speakerOnSub: {
    label: 'Speaker on a sub pole', category: 'Speakers & sound', surface: false,
    description: 'The classic DJ setup: an 18 in sub with a pole and a powered top speaker on it.',
    defaults: { size: 12, height: 1.85 },
    fields: [
      { key: 'size', label: 'Top speaker', kind: 'choice', options: SPEAKER_SIZES },
      { key: 'height', label: 'Speaker height', kind: 'length', min: 1.2, max: 2.4, presets: [5, 6, 7] }
    ]
  },
  speakerBox: {
    label: 'Speaker', category: 'Speakers & sound', surface: false,
    description: 'A powered top speaker on its own: put it on the stage, a sub, a table or the floor.',
    defaults: { size: 12 },
    fields: [{ key: 'size', label: 'Speaker', kind: 'choice', options: SPEAKER_SIZES }]
  },
  monitor: {
    label: 'Stage monitor (wedge)', category: 'Speakers & sound', surface: false,
    description: 'A floor wedge facing the performer. Turn it to point at whoever it is for.',
    defaults: { size: 12 },
    fields: [{ key: 'size', label: 'Woofer', kind: 'choice', options: [['10 in', 10], ['12 in', 12], ['15 in', 15]] }]
  },
  subStack: {
    label: 'Stacked subs', category: 'Speakers & sound', surface: true,
    description: '18 in subs stacked on top of each other. Cardioid: the middle one faces backwards, like a real cardioid stack.',
    defaults: { count: 2, cardioid: false },
    fields: [
      { key: 'count', label: 'Subs', kind: 'count', min: 1, max: 4 },
      { key: 'cardioid', label: 'Cardioid', kind: 'boolean' }
    ]
  },
  lineArray: {
    label: 'Line array (flown)', category: 'Speakers & sound', surface: false, flown: true,
    description: 'Line array boxes hanging from a rigging frame and motor, curved into a J. Height is the bottom of the array.',
    defaults: { count: 8, height: 4.5 },
    fields: [
      { key: 'count', label: 'Boxes', kind: 'count', min: 2, max: 18 },
      { key: 'height', label: 'Bottom of array', kind: 'length', min: 2, max: 15, presets: [12, 15, 20, 25] }
    ]
  },
  groundStack: {
    label: 'Line array (ground stack)', category: 'Speakers & sound', surface: false,
    description: 'A few line array boxes stacked on flyable subs, on the floor or the stage wings.',
    defaults: { count: 4, rows: 2 },
    fields: [
      { key: 'count', label: 'Array boxes', kind: 'count', min: 1, max: 8 },
      { key: 'rows', label: 'Subs under it', kind: 'count', min: 0, max: 3 }
    ]
  },
  fohDesk: {
    label: 'FOH mixing desk', category: 'Speakers & sound', surface: false,
    description: 'Front of house: a table with the mixing console and a laptop.',
    defaults: { width: 6 * FT, cover: 'black' },
    fields: [
      { key: 'width', label: 'Table', kind: 'length', min: 1.2, max: 3, presets: [4, 6, 8] },
      { key: 'cover', label: 'Skirt', kind: 'cover' }
    ]
  },
  ampRack: {
    label: 'Amp / rack case', category: 'Speakers & sound', surface: true,
    description: 'A road case rack on casters for amps or wireless. Things can stand on it.',
    defaults: { height: 1.1 },
    fields: [{ key: 'height', label: 'Height', kind: 'length', min: 0.5, max: 1.8, presets: [2, 3, 4] }]
  },

  // --- DJ & band ---
  djGear: {
    label: 'DJ decks and mixer', category: 'DJ & band', surface: false,
    description: 'Media players (or turntables) either side of a mixer. Put it on a DJ booth or table.',
    defaults: { count: 2, vinyl: false },
    fields: [
      { key: 'count', label: 'Players', kind: 'count', min: 2, max: 4 },
      { key: 'vinyl', label: 'Turntables', kind: 'boolean' }
    ]
  },
  micStand: {
    label: 'Mic stand', category: 'DJ & band', surface: false,
    description: 'A tripod mic stand with a microphone, straight or with a boom arm.',
    defaults: { height: 1.5, boom: true },
    fields: [
      { key: 'height', label: 'Height', kind: 'length', min: 0.5, max: 2, presets: [2, 4, 5, 6] },
      { key: 'boom', label: 'Boom arm', kind: 'boolean' }
    ]
  },
  drumKit: {
    label: 'Drum kit', category: 'DJ & band', surface: false,
    description: 'A five-piece kit with cymbals and a stool. Put it on a riser (a stage deck).',
    defaults: {},
    fields: []
  },
  guitarAmp: {
    label: 'Guitar / bass amp', category: 'DJ & band', surface: true,
    description: 'A combo amp, or a half stack (head on a 4 × 12 cabinet).',
    defaults: { stack: false },
    fields: [{ key: 'stack', label: 'Half stack', kind: 'boolean' }]
  },
  keyboard: {
    label: 'Keyboard on a stand', category: 'DJ & band', surface: false,
    description: 'An 88-key keyboard on an X stand.',
    defaults: {},
    fields: []
  },

  // --- Furniture ---
  roundTable: {
    label: 'Round table', category: 'Furniture', surface: true,
    description: 'A round banquet table with a floor-length linen and chairs around it.',
    defaults: { size: 60, seats: 8, cover: 'white' },
    fields: [
      { key: 'size', label: 'Diameter', kind: 'choice', options: [['48 in', 48], ['60 in', 60], ['72 in', 72]] },
      { key: 'seats', label: 'Chairs', kind: 'count', min: 0, max: 12 },
      { key: 'cover', label: 'Linen', kind: 'cover' }
    ]
  },
  highTop: {
    label: 'High-top table', category: 'Furniture', surface: true,
    description: 'A 30 in cocktail table, 42 in tall, with an optional spandex cover.',
    defaults: { size: 30, cover: 'white' },
    fields: [
      { key: 'size', label: 'Top', kind: 'choice', options: [['24 in', 24], ['30 in', 30], ['36 in', 36]] },
      { key: 'cover', label: 'Spandex', kind: 'cover' }
    ]
  },
  bar: {
    label: 'Bar', category: 'Furniture', surface: true,
    description: 'A bar counter, 42 in high, with a front panel. LED bars can run along the bottom of the front.',
    defaults: { width: 8 * FT, depth: 2 * FT, height: 42 * IN, cover: 'white' },
    fields: [
      { key: 'width', label: 'Length', kind: 'length', min: 1, max: 8, presets: [6, 8, 12, 16] },
      { key: 'cover', label: 'Front', kind: 'cover', coverNames: { none: 'Wood' } }
    ]
  },
  chairs: {
    label: 'Chairs', category: 'Furniture', surface: false,
    description: 'Rows of chairs, facing the stage.',
    defaults: { count: 8, rows: 1 },
    fields: [
      { key: 'count', label: 'Per row', kind: 'count', min: 1, max: 30 },
      { key: 'rows', label: 'Rows', kind: 'count', min: 1, max: 30 }
    ]
  },
  sofa: {
    label: 'Lounge sofa', category: 'Furniture', surface: false,
    description: 'A lounge sofa for a VIP area.',
    defaults: { width: 7 * FT, cover: 'white' },
    fields: [
      { key: 'width', label: 'Length', kind: 'length', min: 1, max: 3.5, presets: [5, 7, 9] },
      { key: 'cover', label: 'Colour', kind: 'cover', coverNames: { none: 'Grey' } }
    ]
  },

  // --- Room & decor ---
  wall: {
    label: 'Wall', category: 'Room & decor', surface: false,
    description: 'A wall or partition. Light and gobos show on it; fixtures can clamp near its top.',
    defaults: { width: 12 * FT, height: 10 * FT, cover: 'white' },
    fields: [
      { key: 'width', label: 'Length', kind: 'length', min: 0.5, max: 30, presets: [4, 8, 12, 20, 40] },
      { key: 'height', label: 'Height', kind: 'length', min: 0.5, max: 10, presets: [4, 8, 10, 12, 16] },
      { key: 'cover', label: 'Colour', kind: 'cover', coverNames: { none: 'Grey' } }
    ]
  },
  danceFloor: {
    label: 'Dance floor', category: 'Party', surface: true, ground: true,
    description: 'Dance floor panels laid on the floor (3 × 3 ft tiles). Turn on LED tiles for a light-up floor.',
    defaults: { width: 15 * FT, depth: 15 * FT, cover: 'none' },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 0.9, max: 25, presets: [12, 15, 18, 24] },
      { key: 'depth', label: 'Depth', kind: 'length', min: 0.9, max: 25, presets: [12, 15, 18, 24] },
      { key: 'cover', label: 'Finish', kind: 'cover', coverNames: { none: 'Wood' } },
      { key: 'led', label: 'LED tiles that light up', kind: 'boolean' },
      { key: 'pattern', label: 'LED pattern', kind: 'choice', options: FLOOR_PATTERNS }
    ]
  },
  screen: {
    label: 'Projection screen', category: 'Screens', surface: false,
    description: 'A 16:9 fast-fold screen on legs, with a projector on it: show colours, visuals, a picture, a video or words. Light lands on it too.',
    defaults: { width: 12 * FT, bottom: 3 * FT, content: 'off' },
    fields: [
      { key: 'content', label: 'Showing', kind: 'content' },
      { key: 'width', label: 'Width', kind: 'length', min: 1, max: 10, presets: [8, 10, 12, 16, 20] },
      { key: 'bottom', label: 'Bottom edge', kind: 'length', min: 0, max: 4, presets: [2, 3, 4, 6] }
    ]
  },
  ledWall: {
    label: 'LED video wall', category: 'Screens', surface: false,
    description: 'An LED wall of 500 mm panels on a ground-support frame: show colours, visuals, a picture, a video or words.',
    defaults: { width: 4, height: 2.5, bottom: 0.5, content: 'visuals' },
    fields: [
      { key: 'content', label: 'Showing', kind: 'content' },
      { key: 'width', label: 'Width', kind: 'length', min: 0.5, max: 20, presets: [8, 12, 16, 24] },
      { key: 'height', label: 'Height', kind: 'length', min: 0.5, max: 8, presets: [6, 8, 10, 12] },
      { key: 'bottom', label: 'Bottom edge', kind: 'length', min: 0, max: 4, presets: [0, 2, 3, 4] }
    ]
  },
  tv: {
    label: 'TV', category: 'Screens', surface: false,
    description: 'A flat-screen TV on a floor stand (or on its feet on a table): show colours, visuals, a picture, a video or words.',
    defaults: { size: 65, bottom: 3 * FT, content: 'colours' },
    fields: [
      { key: 'content', label: 'Showing', kind: 'content' },
      { key: 'size', label: 'Size', kind: 'choice', options: [['43 in', 43], ['55 in', 55], ['65 in', 65], ['75 in', 75], ['85 in', 85], ['98 in', 98]] },
      { key: 'bottom', label: 'Bottom edge (0 = on its feet)', kind: 'length', min: 0, max: 2.5, presets: [0, 2, 3, 4, 5] }
    ]
  },
  balloonArch: {
    label: 'Balloon arch', category: 'Party', surface: false,
    description: 'An arch of balloons on a frame, over an entrance, the DJ or a photo spot.',
    defaults: { width: 10 * FT, height: 8 * FT, palette: 0 },
    fields: [
      { key: 'palette', label: 'Colours', kind: 'choice', options: BALLOON_PALETTES.map(([name], i) => [name, i] as [string, number]) },
      { key: 'width', label: 'Width', kind: 'length', min: 1.2, max: 8, presets: [6, 8, 10, 12, 16] },
      { key: 'height', label: 'Height', kind: 'length', min: 1.2, max: 5, presets: [6, 7, 8, 10] }
    ]
  },
  photoBooth: {
    label: '360 photo booth', category: 'Party', surface: true,
    description: 'A round platform guests stand on while a camera arm turns around them, with a ring light.',
    defaults: { size: 39 },
    fields: [{ key: 'size', label: 'Platform', kind: 'choice', options: [['31 in', 31], ['39 in', 39], ['45 in', 45]] }]
  },
  discoBall: {
    label: 'Disco ball', category: 'Party', surface: false,
    description: 'A mirror ball on a motor. It hangs from the ceiling, under a truss bar it is put beneath, or sits on a totem or stand. Point a pin spot or a moving head at it and its reflections fly round the room.',
    defaults: { size: 16, drop: 0.5, rpm: 2 },
    fields: [
      { key: 'size', label: 'Size', kind: 'choice', options: [['8 in', 8], ['12 in', 12], ['16 in', 16], ['20 in', 20], ['24 in', 24], ['30 in', 30], ['40 in', 40]] },
      { key: 'drop', label: 'Chain or rod length', kind: 'length', min: 0.05, max: 4, presets: [0.5, 1, 2, 3, 5] },
      { key: 'rpm', label: 'Turning', kind: 'choice', options: [['Still', 0], ['Slow', 1], ['Normal', 2], ['Fast', 4]] }
    ]
  },
  photoBackdrop: {
    label: 'Photo booth with backdrop', category: 'Party', surface: false,
    description: 'A selfie or photo booth: a backdrop on a frame, a camera kiosk in front and two soft lights on stands.',
    defaults: { width: 8 * FT, height: 8 * FT, cover: 'white', lightOn: true, followRoom: false },
    fields: [
      { key: 'width', label: 'Backdrop width', kind: 'length', min: 1.5, max: 6, presets: [6, 8, 10] },
      { key: 'height', label: 'Backdrop height', kind: 'length', min: 1.5, max: 4, presets: [7, 8, 10] },
      { key: 'cover', label: 'Backdrop', kind: 'cover', coverNames: { none: 'Sequins' } },
      ...ROOM_LIGHT_FIELDS
    ]
  },
  chandelier: {
    label: 'Chandelier', category: 'Room lights', surface: false,
    description: 'A crystal chandelier with candle bulbs. It hangs from the ceiling or a truss bar above it. A room light: it dims with the room light and can be switched off.',
    defaults: { size: 36, drop: 0.6, lightOn: true },
    fields: [
      { key: 'size', label: 'Size', kind: 'choice', options: [['24 in', 24], ['36 in', 36], ['48 in', 48], ['60 in', 60]] },
      { key: 'drop', label: 'Chain length', kind: 'length', min: 0.05, max: 4, presets: [1, 2, 3, 4] },
      ...ROOM_LIGHT_FIELDS
    ]
  },
  pendantLights: {
    label: 'Pendant lights', category: 'Room lights', surface: false,
    description: 'Bare bulbs on long cords, hanging at different lengths from the ceiling or a truss bar. A room light.',
    defaults: { count: 5, drop: 1.2, lightOn: true },
    fields: [
      { key: 'count', label: 'Bulbs', kind: 'count', min: 1, max: 12 },
      { key: 'drop', label: 'Cord length', kind: 'length', min: 0.1, max: 4, presets: [2, 3, 4, 6] },
      ...ROOM_LIGHT_FIELDS
    ]
  },
  ceilingDrape: {
    label: 'Ceiling drape with fairy lights', category: 'Room lights', surface: false,
    description: 'Fabric swagged across the ceiling with fairy lights in it. A room light.',
    defaults: { width: 20 * FT, depth: 20 * FT, cover: 'white', lightOn: true },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 2, max: 20, presets: [12, 20, 30, 40] },
      { key: 'depth', label: 'Depth', kind: 'length', min: 2, max: 20, presets: [12, 20, 30, 40] },
      { key: 'cover', label: 'Fabric', kind: 'cover', coverNames: { none: 'Ivory' } },
      ...ROOM_LIGHT_FIELDS
    ]
  },
  wallSconce: {
    label: 'Wall light', category: 'Room lights', surface: false,
    description: 'A sconce on the wall, washing light up and down it. Put it against a wall or a backdrop. A room light.',
    defaults: { bottom: 6 * FT, lightOn: true },
    fields: [{ key: 'bottom', label: 'Height', kind: 'length', min: 0.5, max: 4, presets: [5, 6, 7, 8] }, ...ROOM_LIGHT_FIELDS]
  },
  marqueeLetters: {
    label: 'Marquee letters', category: 'Party', surface: false,
    description: 'Big light-up letters with bulbs: LOVE, initials, a name, a number. They follow the room light, or switch them on and off.',
    defaults: { text: 'LOVE', height: 4 * FT, cover: 'white', lightOn: true, followRoom: false },
    fields: [
      { key: 'text', label: 'Letters', kind: 'text' },
      { key: 'height', label: 'Letter height', kind: 'length', min: 0.3, max: 2.4, presets: [3, 4, 5] },
      { key: 'cover', label: 'Letters', kind: 'cover', coverNames: { none: 'Gold', white: 'White', black: 'Black' } },
      ...ROOM_LIGHT_FIELDS
    ]
  },
  monogram: {
    label: 'Monogram projection', category: 'Party', surface: false,
    description: 'Initials or a name projected on the dance floor or a wall, in a frame: the couple’s monogram, the venue’s logo text.',
    defaults: { text: 'A & J', width: 8 * FT, tint: 2, onWall: false, lightOn: true, followRoom: false },
    fields: [
      { key: 'text', label: 'Words', kind: 'text' },
      { key: 'tint', label: 'Colour', kind: 'choice', options: NEON_COLOURS.map(([name], i) => [name, i] as [string, number]) },
      { key: 'width', label: 'Size', kind: 'length', min: 0.5, max: 6, presets: [6, 8, 10, 12] },
      { key: 'onWall', label: 'On a wall (not the floor)', kind: 'boolean' },
      ...ROOM_LIGHT_FIELDS
    ]
  },
  neonSign: {
    label: 'Neon sign', category: 'Party', surface: false,
    description: 'Glowing words on a clear panel, on a stand or a wall: "Happy Birthday", a name, the venue.',
    defaults: { width: 4 * FT, bottom: 4 * FT, text: 'Let’s Party', tint: 0 },
    fields: [
      { key: 'text', label: 'Words', kind: 'text' },
      { key: 'tint', label: 'Colour', kind: 'choice', options: NEON_COLOURS.map(([name], i) => [name, i] as [string, number]) },
      { key: 'width', label: 'Width', kind: 'length', min: 0.4, max: 4, presets: [2, 3, 4, 6] },
      { key: 'bottom', label: 'Bottom edge', kind: 'length', min: 0, max: 3, presets: [3, 4, 5, 6] }
    ]
  },
  backdrop: {
    label: 'Backdrop (step and repeat)', category: 'Room & decor', surface: false,
    description: 'A banner on a frame, for photos or behind the DJ.',
    defaults: { width: 8 * FT, height: 8 * FT, cover: 'white' },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 1, max: 6, presets: [8, 10, 20] },
      { key: 'height', label: 'Height', kind: 'length', min: 1, max: 4, presets: [8, 10] },
      { key: 'cover', label: 'Banner', kind: 'cover' }
    ]
  },
  stanchions: {
    label: 'Stanchions and rope', category: 'Room & decor', surface: false,
    description: 'Chrome posts with velvet rope, for a VIP area or a line.',
    defaults: { count: 4, width: 6 * FT },
    fields: [
      { key: 'count', label: 'Posts', kind: 'count', min: 2, max: 20 },
      { key: 'width', label: 'Rope length', kind: 'length', min: 0.6, max: 3, presets: [4, 6, 8] }
    ]
  },
  plant: {
    label: 'Plant', category: 'Room & decor', surface: false,
    description: 'A potted plant or small tree.',
    defaults: { height: 5 * FT },
    fields: [{ key: 'height', label: 'Height', kind: 'length', min: 0.4, max: 4, presets: [2, 4, 6, 8] }]
  },
  pillar: {
    label: 'Pillar', category: 'Room & decor', surface: false,
    description: "A room column. Light lands on it, so you can see what it'll block.",
    defaults: { width: 2 * FT, height: 12 * FT },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 0.2, max: 2, presets: [1, 2, 3] },
      { key: 'height', label: 'Height', kind: 'length', min: 1, max: 15, presets: [10, 12, 16, 20] }
    ]
  },

  // --- People ---
  person: {
    label: 'Person', category: 'People', surface: false,
    description: 'A standing person, for scale: the DJ, a performer, a guest.',
    defaults: { height: 5.75 * FT },
    fields: [{ key: 'height', label: 'Height', kind: 'length', min: 1, max: 2.1, presets: [5, 5.5, 6] }]
  },
  crowd: {
    label: 'Crowd', category: 'People', surface: false, ground: true,
    description: 'An area of standing guests, to see how the room reads when it is full.',
    defaults: { width: 8, depth: 6, density: 1.5 },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 1, max: 30, presets: [10, 20, 30, 40] },
      { key: 'depth', label: 'Depth', kind: 'length', min: 1, max: 30, presets: [10, 20, 30] },
      { key: 'density', label: 'How busy', kind: 'choice', options: [['Light', 0.7], ['Busy', 1.5], ['Packed', 2.5]] }
    ]
  }
}

export function paramsOf(s: Structure): Required<Pick<StructureParams, 'width' | 'depth' | 'height' | 'truss'>> & StructureParams {
  const d = STRUCTURE_KINDS[s.kind].defaults
  const p = { ...d, ...s.params }
  return { ...p, width: p.width ?? 1, depth: p.depth ?? 1, height: p.height ?? 1, truss: p.truss ?? 0.29 }
}

/** Width × depth of the base (local, before rotation), metres. */
export function footprint(s: Structure): [number, number] {
  const p = paramsOf(s)
  switch (s.kind) {
    case 'totem': return [0.6, 0.6]
    case 'flexstand': return [0.55, 0.55]
    case 'tubeStand': return [0.3, 0.3]
    case 'tbar': return [1.1, 1.1]
    case 'goalpost': return [p.width + 0.6, 0.6]
    case 'trussBox': return [p.width + 0.6, p.depth + 0.6]
    case 'groundTruss': return [p.width, p.truss]
    case 'stage': case 'table': case 'sub': return [p.width, p.depth]
    case 'djBooth': return [p.width, p.depth]
    case 'pipeDrape': return [(p.spans ?? 1) * p.width, 0.5]
    case 'speakerColumn': return [0.4, 0.5]
    case 'speakerOnPole': return [0.9, 0.9]
    case 'speakerOnSub': return [SUB_18[0], SUB_18[2]]
    case 'speakerBox': { const c = cabinetOf(p.size); return [c[0], c[2]] }
    case 'monitor': { const c = cabinetOf(p.size); return [c[0] + 0.12, c[1] * 0.75] }
    case 'subStack': return [SUB_18[0], SUB_18[2]]
    case 'lineArray': return [ARRAY_BOX[0], ARRAY_BOX[2] + 0.2]
    case 'groundStack': return [ARRAY_BOX[0], ARRAY_SUB[2]]
    case 'fohDesk': return [p.width, 0.9]
    case 'ampRack': return [0.6, 0.65]
    case 'djGear': return [(p.count ?? 2) * 0.33 + 0.37, 0.45]
    case 'micStand': return [0.55, 0.55]
    case 'drumKit': return [2.0, 1.8]
    case 'guitarAmp': return p.stack ? [0.76, 0.36] : [0.62, 0.27]
    case 'keyboard': return [1.35, 0.5]
    case 'roundTable': return [(p.size ?? 60) * IN, (p.size ?? 60) * IN]
    case 'highTop': return [(p.size ?? 30) * IN, (p.size ?? 30) * IN]
    case 'bar': return [p.width, p.depth]
    case 'chairs': return [(p.count ?? 1) * SEAT_W, (p.rows ?? 1) * ROW_D - 0.3]
    case 'sofa': return [p.width, 0.85]
    case 'wall': return [p.width, 0.15]
    case 'danceFloor': return [p.width, p.depth]
    case 'screen': return [p.width + 0.1, 0.7]
    case 'ledWall': return [p.width, 0.9]
    case 'tv': return [tvSize(p.size)[0], (p.bottom ?? 0) > 0.15 ? 0.6 : 0.25]
    case 'balloonArch': return [p.width + 0.5, 0.5]
    case 'photoBooth': return [Math.max(1.4, (p.size ?? 39) * IN + 0.5), Math.max(1.4, (p.size ?? 39) * IN + 0.5)]
    case 'neonSign': return [p.width, 0.35]
    case 'marqueeLetters': return [Math.max(0.4, (p.text ?? 'LOVE').replace(/\s/g, '').length * p.height * 0.72), 0.3]
    case 'monogram': return p.onWall ? [p.width, 0.1] : [p.width, p.width]
    case 'discoBall': return [Math.max(0.2, discoRadius(p.size) * 2), Math.max(0.2, discoRadius(p.size) * 2)]
    case 'photoBackdrop': return [p.width + 0.6, 2.6]
    case 'chandelier': return [(p.size ?? 36) * IN, (p.size ?? 36) * IN]
    case 'pendantLights': return [0.9, 0.9]
    case 'ceilingDrape': return [p.width, p.depth]
    case 'wallSconce': return [0.3, 0.2]
    case 'backdrop': return [p.width, 0.6]
    case 'stanchions': return [Math.max(1, (p.count ?? 2) - 1) * p.width, 0.35]
    case 'plant': return [Math.max(0.35, p.height * 0.35), Math.max(0.35, p.height * 0.35)]
    case 'pillar': return [p.width, p.width]
    case 'person': return [0.5, 0.3]
    case 'crowd': return [p.width, p.depth]
  }
}

/** Overall height above its base. */
export function heightOf(s: Structure): number {
  const p = paramsOf(s)
  if (s.kind === 'groundTruss') return p.truss
  if (s.kind === 'flexstand' || s.kind === 'totem') return p.height + 0.012
  if (s.kind === 'tubeStand') return p.height + 0.01
  if (s.kind === 'speakerOnPole' || s.kind === 'speakerOnSub') return p.height + cabinetOf(p.size)[1] / 2
  switch (s.kind) {
    case 'speakerBox': return cabinetOf(p.size)[1]
    case 'monitor': return cabinetOf(p.size)[0] * 0.95
    case 'subStack': return (p.count ?? 2) * SUB_18[1]
    case 'lineArray': return p.height + (p.count ?? 8) * ARRAY_BOX[1] + 0.25
    case 'groundStack': return (p.rows ?? 0) * ARRAY_SUB[1] + (p.count ?? 4) * ARRAY_BOX[1] + 0.05
    case 'fohDesk': return 1.05
    case 'djGear': return 0.13
    case 'drumKit': return 1.25
    case 'guitarAmp': return p.stack ? 1.3 : 0.55
    case 'keyboard': return 0.98
    case 'roundTable': return 30 * IN
    case 'highTop': return 42 * IN
    case 'chairs': return 0.85
    case 'sofa': return 0.8
    case 'danceFloor': return 0.025
    case 'screen': return (p.bottom ?? 0) + (p.width * 9) / 16 + 0.1
    case 'ledWall': case 'backdrop': return (p.bottom ?? 0) + p.height
    case 'tv': return (p.bottom ?? 0) + tvSize(p.size)[1] + 0.06
    case 'balloonArch': return p.height + 0.3
    case 'photoBooth': return 0.1
    case 'neonSign': return (p.bottom ?? 0) + p.width * 0.4
    case 'marqueeLetters': return p.height
    case 'monogram': return p.onWall ? (p.bottom ?? 1) + p.width : 0.01
    case 'discoBall': return s.hang ? 0 : 0.1 + (p.drop ?? 0.5) + discoRadius(p.size) * 2
    case 'photoBackdrop': return p.height
    case 'chandelier': case 'pendantLights': return s.hang ? 0 : (p.drop ?? 0.5) + 0.8
    case 'ceilingDrape': return 0.5
    case 'wallSconce': return (p.bottom ?? 1.8) + 0.3
    case 'stanchions': return 0.95
    case 'crowd': return 1.8
  }
  return p.height
}

/** The height things standing on it are at (local, above its base). Only for surface kinds. */
export function surfaceHeight(s: Structure): number | null {
  if (!STRUCTURE_KINDS[s.kind].surface) return null
  const p = paramsOf(s)
  if (s.kind === 'djBooth') return p.height + 0.02
  if (s.kind === 'subStack') return (p.count ?? 2) * SUB_18[1]
  if (s.kind === 'roundTable') return 30 * IN
  if (s.kind === 'highTop') return 42 * IN
  if (s.kind === 'danceFloor') return 0.025
  return p.height
}

/** A bar along x, centred: fixtures clamp anywhere on it. */
function bar(id: string, kind: MountKind, label: string, length: number, y: number, z: number, facing?: number): MountPoint {
  return { id, kind, at: [round(-length / 2), round(y), round(z)], to: [round(length / 2), round(y), round(z)], facing, label }
}

/** The same mount, with fixtures on their backs facing out (see MountPoint.out). */
function facingOut(m: MountPoint, id: string, label: string, z?: number): MountPoint {
  const shift = (v: Vec3): Vec3 => (z === undefined ? v : [v[0], v[1], round(z)])
  return { ...m, id, kind: m.kind === 'clamp' ? 'clamp' : 'face', at: shift(m.at), to: m.to && shift(m.to), label, out: true }
}

/** A vertical leg or column: clamp anywhere between two heights. */
function leg(id: string, label: string, x: number, z: number, from: number, to: number): MountPoint {
  return { id, kind: 'clamp', at: [round(x), round(from), round(z)], to: [round(x), round(to), round(z)], facing: 0, label }
}

/** Every place a fixture can attach. */
export function mountPoints(s: Structure): MountPoint[] {
  const p = paramsOf(s)
  const t = p.truss
  switch (s.kind) {
    case 'totem': {
      // Inside: on the base plate pointing up, or fixed (magnets, a clamp) under the top plate pointing down.
      // The beam stops at the plate at the far end (less the fixture's own height): none of it reaches the floor or ceiling.
      const inner = round(Math.max(0.3, p.height - 0.3))
      return [
        { id: 'top', kind: 'top', at: [0, round(p.height + 0.012), 0], label: 'Top plate' },
        leg('front', 'Front face', 0, t / 2 + 0.05, 0.35, Math.max(0.4, p.height - 0.15)),
        facingOut(leg('front', '', 0, t / 2 + 0.01, 0.2, Math.max(0.3, p.height - 0.1)), 'frontOut', 'Front face, facing out'),
        { id: 'inBottom', kind: 'top', at: [0, 0.012, 0], label: 'Inside, at the bottom (pointing up)', aim: 0, reach: inner, inside: true },
        { id: 'inTop', kind: 'under', at: [0, round(p.height), 0], label: 'Inside, at the top (pointing down)', aim: 0, reach: inner, inside: true }
      ]
    }
    case 'speakerColumn': {
      // Column PAs: a light bracket on the spacer pole, or something small on top of the column.
      const columnBottom = p.height - 0.85
      return [{ id: 'top', kind: 'top', at: [0, round(p.height), 0], label: 'On top of the column' }, leg('pole', 'Bracket on the pole', 0, 0.05, 0.68, Math.max(0.7, columnBottom - 0.05))]
    }
    case 'speakerOnPole': {
      const ch = cabinetOf(p.size)[1]
      return [{ id: 'top', kind: 'top', at: [0, round(p.height + ch / 2), 0], label: 'On top of the speaker' }, leg('pole', 'Bracket on the pole', 0, 0.05, 0.75, Math.max(0.8, p.height - ch / 2 - 0.08))]
    }
    case 'speakerOnSub': {
      const ch = cabinetOf(p.size)[1]
      return [
        { id: 'top', kind: 'top', at: [0, round(p.height + ch / 2), 0], label: 'On top of the speaker' },
        leg('pole', 'Bracket on the pole', 0, 0.05, SUB_18[1] + 0.1, Math.max(SUB_18[1] + 0.15, p.height - ch / 2 - 0.08)),
        { id: 'subTop', kind: 'top', at: [0.17, round(SUB_18[1]), 0.12], label: 'On the sub, beside the pole' }
      ]
    }
    case 'speakerBox':
      return [{ id: 'top', kind: 'top', at: [0, round(cabinetOf(p.size)[1]), 0], label: 'On top of the speaker' }]
    case 'sub':
      return [{ id: 'top', kind: 'top', at: [0, round(p.height), 0], label: 'On top of the sub' }]
    case 'subStack':
      return [{ id: 'top', kind: 'top', at: [0, round((p.count ?? 2) * SUB_18[1]), 0], label: 'On top of the stack' }]
    case 'groundStack':
      return [{ id: 'top', kind: 'top', at: [0, round(heightOf(s)), 0], label: 'On top of the array' }]
    case 'flexstand':
      return [{ id: 'top', kind: 'top', at: [0, round(p.height + 0.012), 0], label: 'Top (M10)' }]
    case 'tubeStand':
      return [{ id: 'top', kind: 'top', at: [0, round(p.height + 0.01), 0], label: 'Tube holder' }]
    case 'tbar':
      return [bar('top', 'top', 'On the T-bar', p.width - 0.1, p.height + 0.03, 0), bar('under', 'under', 'Under the T-bar', p.width - 0.1, p.height - 0.03, 0)]
    case 'goalpost':
      return [
        bar('under', 'under', 'Under the crossbar', p.width - t, p.height - t, 0),
        bar('top', 'top', 'On the crossbar', p.width - t, p.height, 0),
        leg('legL', 'Left leg', -p.width / 2, t / 2 + 0.05, 0.5, p.height - t - 0.2),
        leg('legR', 'Right leg', p.width / 2, t / 2 + 0.05, 0.5, p.height - t - 0.2),
        // On their backs on the front of the truss, facing the audience.
        facingOut(bar('x', 'face', '', p.width - t * 2, p.height - t / 2, t / 2 + 0.01, 0), 'frontOut', 'Front of the crossbar, facing out'),
        facingOut(leg('x', '', -p.width / 2, t / 2 + 0.01, 0.3, p.height - t - 0.1), 'legLOut', 'Front of the left leg, facing out'),
        facingOut(leg('x', '', p.width / 2, t / 2 + 0.01, 0.3, p.height - t - 0.1), 'legROut', 'Front of the right leg, facing out'),
        facingOut(bar('x', 'face', '', p.width - t * 2, p.height - t / 2, -t / 2 - 0.01, 180), 'backOut', 'Back of the crossbar, facing out')
      ]
    case 'trussBox':
      return [
        bar('front', 'under', 'Under the front bar', p.width - t, p.height - t, p.depth / 2),
        bar('back', 'under', 'Under the back bar', p.width - t, p.height - t, -p.depth / 2),
        bar('ftop', 'top', 'On the front bar', p.width - t, p.height, p.depth / 2),
        bar('btop', 'top', 'On the back bar', p.width - t, p.height, -p.depth / 2),
        facingOut(bar('x', 'face', '', p.width - t * 2, p.height - t / 2, p.depth / 2 + t / 2 + 0.01, 0), 'frontOut', 'Front of the front bar, facing out'),
        facingOut(bar('x', 'face', '', p.width - t * 2, p.height - t / 2, -p.depth / 2 - t / 2 - 0.01, 180), 'backOut', 'Back of the back bar, facing out')
      ]
    case 'groundTruss':
      return [bar('top', 'top', 'On the truss', p.width - 0.1, t, 0), facingOut(bar('x', 'face', '', p.width - 0.1, t / 2, t / 2 + 0.01, 0), 'frontOut', 'Front of the truss, facing out')]
    case 'djBooth':
      return [bar('ftop', 'face', 'Facade, top edge', p.width - 0.2, p.height - 0.06, p.depth / 2 + 0.02, 0), bar('fbot', 'face', 'Facade, bottom edge', p.width - 0.2, 0.08, p.depth / 2 + 0.02, 0)]
    case 'pipeDrape':
      return [bar('under', 'under', 'Under the crossbar', (p.spans ?? 1) * p.width - 0.1, p.height - 0.05, 0)]
    case 'wall':
      return [bar('face', 'face', 'Wall, near the top', p.width - 0.3, Math.max(0.3, p.height - 0.3), 0.1, 0)]
    case 'bar':
      return [bar('fbot', 'face', 'Bar front, bottom edge', p.width - 0.2, 0.08, p.depth / 2 + 0.03, 0)]
    case 'ledWall':
      return [bar('top', 'top', 'On top of the LED wall', p.width - 0.2, (p.bottom ?? 0) + p.height + 0.02, 0)]
    default:
      return []
  }
}

/** The local point at `t` (0..1) along a mount point (or the point itself). */
export function pointAt(m: MountPoint, t = 0.5): Vec3 {
  if (!m.to) return m.at
  const k = Math.max(0, Math.min(1, t))
  return [m.at[0] + (m.to[0] - m.at[0]) * k, m.at[1] + (m.to[1] - m.at[1]) * k, m.at[2] + (m.to[2] - m.at[2]) * k]
}

/** World point → local (structure at the origin, unrotated). */
export function toLocal(s: Structure, world: Vec3): Vec3 {
  const a = (s.rotation * Math.PI) / 180
  const dx = world[0] - s.position[0]
  const dz = world[2] - s.position[2]
  return [dx * Math.cos(a) - dz * Math.sin(a), world[1] - s.position[1], dx * Math.sin(a) + dz * Math.cos(a)]
}

/** Where along a mount point (0..1) is closest to a local point, and how far it is. */
export function nearestOn(m: MountPoint, local: Vec3): { t: number; distance: number } {
  if (!m.to) return { t: 0, distance: Math.hypot(local[0] - m.at[0], local[1] - m.at[1], local[2] - m.at[2]) }
  const d: Vec3 = [m.to[0] - m.at[0], m.to[1] - m.at[1], m.to[2] - m.at[2]]
  const len2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1
  const t = Math.max(0, Math.min(1, ((local[0] - m.at[0]) * d[0] + (local[1] - m.at[1]) * d[1] + (local[2] - m.at[2]) * d[2]) / len2))
  const q = pointAt(m, t)
  return { t, distance: Math.hypot(local[0] - q[0], local[1] - q[1], local[2] - q[2]) }
}

/** World position of a local point on a structure. */
export function toWorld(s: Structure, local: Vec3): Vec3 {
  const a = (s.rotation * Math.PI) / 180
  const c = Math.cos(a)
  const sn = Math.sin(a)
  return [round(s.position[0] + local[0] * c + local[2] * sn), round(s.position[1] + local[1]), round(s.position[2] - local[0] * sn + local[2] * c)]
}

/** True if the world point (x, z) is over the structure's base. */
export function covers(s: Structure, x: number, z: number, margin = 0): boolean {
  const [w, d] = footprint(s)
  const a = (-s.rotation * Math.PI) / 180
  const dx = x - s.position[0]
  const dz = z - s.position[2]
  const lx = dx * Math.cos(a) + dz * Math.sin(a)
  const lz = -dx * Math.sin(a) + dz * Math.cos(a)
  return Math.abs(lx) <= w / 2 + margin && Math.abs(lz) <= d / 2 + margin
}

/** A friendly default name: "Totem 6 ft", "Stage deck 8 × 12 ft". */
export function defaultName(kind: StructureKind, params: StructureParams): string {
  const info = STRUCTURE_KINDS[kind]
  const p = { ...info.defaults, ...params }
  const ft = (m?: number) => (m === undefined ? '' : `${Math.round((m / FT) * 10) / 10}`)
  switch (kind) {
    case 'totem': return `Totem ${ft(p.height)} ft`
    case 'flexstand': return `FLEXstand ${ft(p.height)} ft`
    case 'tubeStand': return `Tube stand ${ft(p.height)} ft`
    case 'stage': return `Stage ${ft(p.width)} × ${ft(p.depth)} ft, ${ft(p.height)} ft high`
    case 'table': return `Banquet table ${ft(p.width)} ft`
    case 'goalpost': return `Goalpost truss ${ft(p.width)} ft`
    case 'trussBox': return `Truss box ${ft(p.width)} × ${ft(p.depth)} ft`
    case 'groundTruss': return `Truss ${ft(p.width)} ft`
    case 'pipeDrape': return `Pipe & drape ${p.spans} × ${ft(p.width)} ft`
    case 'speakerOnPole': return `${p.size ?? 12} in speaker on a tripod`
    case 'speakerOnSub': return `${p.size ?? 12} in speaker on a sub`
    case 'speakerBox': return `${p.size ?? 12} in speaker`
    case 'monitor': return `${p.size ?? 12} in wedge monitor`
    case 'subStack': return `${p.count} stacked subs${p.cardioid ? ' (cardioid)' : ''}`
    case 'lineArray': return `Line array, ${p.count} boxes`
    case 'groundStack': return `Ground stack, ${p.count} boxes on ${p.rows} subs`
    case 'roundTable': return `Round table ${p.size} in`
    case 'highTop': return `High-top ${p.size} in`
    case 'bar': return `Bar ${ft(p.width)} ft`
    case 'chairs': return (p.rows ?? 1) > 1 ? `Chairs, ${p.rows} rows of ${p.count}` : `Chairs × ${p.count}`
    case 'wall': return `Wall ${ft(p.width)} × ${ft(p.height)} ft`
    case 'danceFloor': return `Dance floor ${ft(p.width)} × ${ft(p.depth)} ft`
    case 'screen': return `Screen ${ft(p.width)} ft`
    case 'tv': return `TV ${p.size ?? 65} in`
    case 'balloonArch': return `Balloon arch ${ft(p.width)} ft`
    case 'photoBooth': return '360 photo booth'
    case 'neonSign': return `Neon sign “${(p.text ?? '').slice(0, 20)}”`
    case 'discoBall': return `Disco ball ${p.size ?? 16} in`
    case 'photoBackdrop': return 'Photo booth'
    case 'chandelier': return `Chandelier ${p.size ?? 36} in`
    case 'pendantLights': return `Pendant lights × ${p.count ?? 5}`
    case 'ceilingDrape': return `Ceiling drape ${ft(p.width)} × ${ft(p.depth)} ft`
    case 'wallSconce': return 'Wall light'
    case 'ledWall': return `LED wall ${ft(p.width)} × ${ft(p.height)} ft`
    case 'stanchions': return `Stanchions × ${p.count}`
    case 'crowd': return `Crowd ${ft(p.width)} × ${ft(p.depth)} ft`
    default: return info.label
  }
}

/** Ready-made objects for the Objects tab, in the order they're shown. */
export const STRUCTURE_PRESETS: Array<{ name: string; kind: StructureKind; params: StructureParams }> = [
  ...[2, 4, 6, 8, 9].map((h) => ({ name: `Totem ${h} ft`, kind: 'totem' as const, params: { height: h * FT } })),
  { name: 'FLEXstand (5-8 ft)', kind: 'flexstand', params: { height: 2.0 } },
  ...[2, 4, 6, 8].map((h) => ({ name: `Tube stand ${h} ft`, kind: 'tubeStand' as const, params: { height: h * FT } })),
  { name: 'T-bar stand', kind: 'tbar', params: {} },
  { name: 'Goalpost truss 10 × 10 ft', kind: 'goalpost', params: { width: 10 * FT, height: 10 * FT } },
  { name: 'Goalpost truss 20 × 12 ft', kind: 'goalpost', params: { width: 20 * FT, height: 12 * FT } },
  { name: 'Truss box 10 × 10 × 10 ft', kind: 'trussBox', params: {} },
  { name: 'Truss on the floor 10 ft', kind: 'groundTruss', params: {} },
  { name: 'Stage deck 4 × 4 ft', kind: 'stage', params: { width: 4 * FT, depth: 4 * FT, height: 2 * FT, stairs: false } },
  { name: 'Stage deck 4 × 8 ft', kind: 'stage', params: { width: 8 * FT, depth: 4 * FT, height: 2 * FT, stairs: false } },
  { name: 'Stage 8 × 12 ft', kind: 'stage', params: { width: 12 * FT, depth: 8 * FT, height: 2 * FT } },
  { name: 'Stage 16 × 12 ft, 4 ft high', kind: 'stage', params: { width: 16 * FT, depth: 12 * FT, height: 4 * FT } },
  // Speakers & sound
  ...[10, 12, 15].map((size) => ({ name: `${size} in speaker on a sub pole`, kind: 'speakerOnSub' as const, params: { size } })),
  ...[8, 10, 12, 15].map((size) => ({ name: `${size} in speaker on a tripod`, kind: 'speakerOnPole' as const, params: { size } })),
  ...[8, 10, 12, 15].map((size) => ({ name: `${size} in speaker`, kind: 'speakerBox' as const, params: { size } })),
  { name: 'Column PA speaker', kind: 'speakerColumn', params: {} },
  { name: 'Subwoofer 15 in', kind: 'sub', params: { width: 0.5, depth: 0.6, height: 0.58 } },
  { name: 'Subwoofer 18 in', kind: 'sub', params: {} },
  { name: 'Subwoofer 21 in', kind: 'sub', params: { width: 0.7, depth: 0.85, height: 0.75 } },
  { name: 'Subwoofer double 18 in', kind: 'sub', params: { width: 1.2, depth: 0.8, height: 0.6 } },
  { name: '2 stacked subs', kind: 'subStack', params: { count: 2 } },
  { name: '3 stacked subs, cardioid', kind: 'subStack', params: { count: 3, cardioid: true } },
  ...[10, 12, 15].map((size) => ({ name: `${size} in wedge monitor`, kind: 'monitor' as const, params: { size } })),
  { name: 'Line array, 6 boxes (flown)', kind: 'lineArray', params: { count: 6, height: 4 } },
  { name: 'Line array, 12 boxes (flown)', kind: 'lineArray', params: { count: 12, height: 6 } },
  { name: 'Line array ground stack', kind: 'groundStack', params: {} },
  { name: 'FOH mixing desk', kind: 'fohDesk', params: {} },
  { name: 'Amp / rack case', kind: 'ampRack', params: {} },
  // DJ & band
  { name: 'DJ booth with facade', kind: 'djBooth', params: {} },
  { name: 'DJ decks and mixer', kind: 'djGear', params: {} },
  { name: 'Turntables and mixer', kind: 'djGear', params: { vinyl: true } },
  { name: '4 decks and mixer', kind: 'djGear', params: { count: 4 } },
  { name: 'Mic stand with boom', kind: 'micStand', params: {} },
  { name: 'Mic stand, straight', kind: 'micStand', params: { boom: false } },
  { name: 'Drum kit', kind: 'drumKit', params: {} },
  { name: 'Guitar amp (combo)', kind: 'guitarAmp', params: {} },
  { name: 'Guitar amp (half stack)', kind: 'guitarAmp', params: { stack: true } },
  { name: 'Keyboard on a stand', kind: 'keyboard', params: {} },
  // Furniture
  { name: 'Banquet table 6 ft', kind: 'table', params: { width: 6 * FT } },
  { name: 'Banquet table 8 ft', kind: 'table', params: { width: 8 * FT } },
  { name: 'Round table 60 in, 8 chairs', kind: 'roundTable', params: { size: 60, seats: 8 } },
  { name: 'Round table 72 in, 10 chairs', kind: 'roundTable', params: { size: 72, seats: 10 } },
  { name: 'High-top table', kind: 'highTop', params: {} },
  { name: 'Bar 8 ft', kind: 'bar', params: {} },
  { name: 'Chair', kind: 'chairs', params: { count: 1, rows: 1 } },
  { name: 'Row of 8 chairs', kind: 'chairs', params: { count: 8, rows: 1 } },
  { name: 'Chairs, 6 rows of 10', kind: 'chairs', params: { count: 10, rows: 6 } },
  { name: 'Lounge sofa', kind: 'sofa', params: {} },
  // Room & decor
  { name: 'Wall 12 × 10 ft', kind: 'wall', params: {} },
  { name: 'Partition 8 × 8 ft', kind: 'wall', params: { width: 8 * FT, height: 8 * FT } },
  { name: 'Pipe & drape, 2 × 10 ft', kind: 'pipeDrape', params: {} },
  { name: 'Dance floor 15 × 15 ft', kind: 'danceFloor', params: {} },
  { name: 'Dance floor, white', kind: 'danceFloor', params: { cover: 'white' } },
  // Party
  { name: 'LED dance floor 15 × 15 ft', kind: 'danceFloor', params: { led: true, cover: 'black' } },
  { name: 'Sparkle dance floor 15 × 15 ft', kind: 'danceFloor', params: { led: true, cover: 'black', pattern: 4 } },
  { name: 'Balloon arch', kind: 'balloonArch', params: {} },
  { name: '360 photo booth', kind: 'photoBooth', params: {} },
  { name: 'Neon sign', kind: 'neonSign', params: {} },
  { name: 'Photo booth with backdrop', kind: 'photoBackdrop', params: {} },
  { name: 'Disco ball 12 in', kind: 'discoBall', params: { size: 12 } },
  { name: 'Disco ball 20 in', kind: 'discoBall', params: { size: 20 } },
  { name: 'Disco ball 30 in', kind: 'discoBall', params: { size: 30, drop: 1 } },
  // Room lights
  { name: 'Chandelier 36 in', kind: 'chandelier', params: {} },
  { name: 'Chandelier 48 in', kind: 'chandelier', params: { size: 48 } },
  { name: 'Pendant lights', kind: 'pendantLights', params: {} },
  { name: 'Ceiling drape with fairy lights', kind: 'ceilingDrape', params: {} },
  { name: 'Wall light', kind: 'wallSconce', params: {} },
  // Screens
  { name: 'Projection screen 12 ft', kind: 'screen', params: {} },
  { name: 'LED wall 4 × 2.5 m', kind: 'ledWall', params: {} },
  { name: 'TV 65 in on a stand', kind: 'tv', params: {} },
  { name: 'TV 85 in on a stand', kind: 'tv', params: { size: 85 } },
  { name: 'TV 55 in on a table', kind: 'tv', params: { size: 55, bottom: 0 } },
  { name: 'Backdrop 8 × 8 ft', kind: 'backdrop', params: {} },
  { name: 'Stanchions and rope', kind: 'stanchions', params: {} },
  { name: 'Plant', kind: 'plant', params: {} },
  { name: 'Pillar', kind: 'pillar', params: {} },
  // People
  { name: 'Person', kind: 'person', params: {} },
  { name: 'Crowd, busy', kind: 'crowd', params: {} },
  { name: 'Crowd, packed', kind: 'crowd', params: { width: 10, depth: 8, density: 2.5 } }
]

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
