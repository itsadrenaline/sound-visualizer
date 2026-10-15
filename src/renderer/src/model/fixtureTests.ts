/**
 * Ready-made tests for the Studio's twin: each one plays DMX into the twin,
 * step by step, and says in one line what you should see. They're built from the
 * fixture's own channels, so a PAR gets colour and strobe tests, a bar gets a cell
 * chase, a moving head gets pan and tilt sweeps, a spot gets a gobo walk, and so
 * on. When something looks wrong, "Something's off" offers the usual fixes.
 */
import { FN, channelLabel, rgbOf, type ChannelDef, type ChannelFn, type FixtureDef, type ModeDef, type PartDef } from './fixtureDef'
import { updateMode } from './fixtureChecks'

export interface TestStep {
  /** What you should see during this step. */
  text: string
  seconds: number
  /** DMX levels for the mode's channels, `t` = 0..1 through the step, `time` = seconds since start. */
  levels: (t: number, time: number) => Uint8Array
}

export interface TestScene {
  id: string
  title: string
  set: string
  steps: TestStep[]
}

export interface TestFix {
  label: string
  apply: (def: FixtureDef) => FixtureDef
}

const COLOUR_FNS: ChannelFn[] = ['red', 'green', 'blue', 'white', 'warmWhite', 'coolWhite', 'amber', 'uv', 'lime']
const PALETTE: Array<[string, Partial<Record<ChannelFn, number>>]> = [
  ['red', { red: 255 }], ['green', { green: 255 }], ['blue', { blue: 255 }], ['yellow', { red: 255, green: 255 }],
  ['magenta', { red: 255, blue: 255 }], ['cyan', { green: 255, blue: 255 }], ['white', { red: 255, green: 255, blue: 255, white: 255, warmWhite: 255 }]
]

const mid = (lo: number, hi: number) => Math.round((lo + hi) / 2)

/** A channel's resting value: dimmers up, shutters open, pan and tilt centred, the rest at their default or 0. */
export function restValue(c: ChannelDef): number {
  if (c.defaultValue !== undefined) return c.defaultValue
  if (c.fine) return 0
  switch (c.fn) {
    case 'dimmer':
      return 255
    case 'shutter': {
      const open = c.ranges.find((r) => r.kind === 'open')
      return open ? mid(open.lo, open.hi) : 0
    }
    case 'pan':
    case 'tilt':
      return 128
    case 'zoom':
      return 128
    case 'colorWheel': {
      const white = c.ranges.find((r) => r.kind === 'slot' && /open|white/i.test(r.label)) ?? c.ranges[0]
      return white ? mid(white.lo, white.hi) : 0
    }
    case 'program':
    case 'laser': {
      const off = c.ranges.find((r) => r.kind === 'off' || r.pattern === 'none')
      return off ? mid(off.lo, off.hi) : 0
    }
    default:
      return 0
  }
}

function base(mode: ModeDef): Uint8Array {
  return Uint8Array.from(mode.channels.map(restValue))
}

/** Parts that make light, in cell order: what a cell chase walks through. */
export function lightParts(def: FixtureDef, mode: ModeDef): PartDef[] {
  const ids = new Set(mode.channels.filter((c) => c.part && COLOUR_FNS.includes(c.fn)).map((c) => c.part!))
  return def.parts.filter((p) => ids.has(p.id)).sort((a, b) => (a.cell ?? 0) - (b.cell ?? 0))
}

/** Set a colour on one part (or the whole fixture if `part` is undefined): uses whatever colour channels it has. */
function paint(levels: Uint8Array, mode: ModeDef, mix: Partial<Record<ChannelFn, number>>, part?: string | null): void {
  const target = mode.channels.filter((c) => !c.fine && COLOUR_FNS.includes(c.fn) && (part === undefined || c.part === part))
  const hasRgb = target.some((c) => c.fn === 'red' || c.fn === 'green' || c.fn === 'blue')
  for (const c of target) {
    let v = mix[c.fn] ?? 0
    // Lights without RGB (white COBs) show any colour as white.
    if (!hasRgb && Object.keys(mix).length) v = 255
    levels[mode.channels.indexOf(c)] = v
  }
}

function step(text: string, seconds: number, levels: (t: number, time: number) => Uint8Array): TestStep {
  return { text, seconds, levels }
}

function rangeWalk(mode: ModeDef, ch: ChannelDef, what: string, seconds = 1.6, prep?: (l: Uint8Array) => void): TestStep[] {
  const i = mode.channels.indexOf(ch)
  return ch.ranges.map((r) =>
    step(`${what}: ${r.label} (${r.lo}–${r.hi})${r.kind === 'program' ? ', shown as the nearest pattern' : ''}`, seconds, () => {
      const l = base(mode)
      prep?.(l)
      l[i] = mid(r.lo, r.hi)
      return l
    })
  )
}

export function scenesFor(def: FixtureDef, modeIndex: number): TestScene[] {
  const mode = def.modes[modeIndex]
  if (!mode || !mode.channels.length) return []
  const out: TestScene[] = []
  const of = (fn: ChannelFn) => mode.channels.filter((c) => c.fn === fn && !c.fine)
  const has = (fn: ChannelFn) => of(fn).length > 0
  const idx = (c: ChannelDef) => mode.channels.indexOf(c)
  const white = (l: Uint8Array) => paint(l, mode, PALETTE[6][1])
  const cells = lightParts(def, mode)
  const lightsUp = (l: Uint8Array) => {
    white(l)
    for (const c of of('colorWheel')) l[idx(c)] = restValue(c)
  }

  // --- Every fixture -------------------------------------------------------------
  out.push({
    id: 'identify', title: 'Identify each channel', set: 'Every fixture',
    steps: mode.channels.map((c, i) =>
      step(`Channel ${i + 1}: ${channelLabel(def, c)} — ${FN[c.fn].explain}`, 1.4, (t) => {
        const l = base(mode)
        // Colour-only fixtures need some colour for a dimmer or strobe to show.
        if (!COLOUR_FNS.includes(c.fn) && c.fn !== 'colorWheel') lightsUp(l)
        const style = FN[c.fn].style
        if (style === 'slots' || style === 'shutter' || style === 'program' || style === 'spin') {
          const r = c.ranges[Math.min(c.ranges.length - 1, Math.floor(t * c.ranges.length))]
          l[i] = r ? mid(r.lo, r.hi) : Math.round(t * 255)
        } else if (c.fn === 'pan' || c.fn === 'tilt') l[i] = Math.round(128 + Math.sin(t * Math.PI * 2) * 100)
        else l[i] = 255
        return l
      })
    )
  })
  out.push({ id: 'home', title: 'Home (resting values)', set: 'Every fixture', steps: [step('Everything at its resting value: dimmer up, shutter open, colour off, head centred.', 3, () => base(mode))] })

  // --- Brightness and colour ---------------------------------------------------
  if (has('dimmer')) {
    out.push({
      id: 'dim', title: 'Dim up and down', set: 'Brightness and colour',
      steps: [step('A smooth fade from dark to full, then back down.', 4, (t) => {
        const l = base(mode)
        lightsUp(l)
        const v = Math.round((t < 0.5 ? t * 2 : 2 - t * 2) * 255)
        for (const c of of('dimmer')) l[idx(c)] = v
        return l
      })]
    })
  }
  const colours = COLOUR_FNS.filter(has).concat((['cyan', 'magenta', 'yellow'] as ChannelFn[]).filter(has))
  if (colours.length) {
    out.push({
      id: 'colours', title: 'Each colour', set: 'Brightness and colour',
      steps: colours.map((fn) => step(`${FN[fn].label} only, on every part.`, 1.5, () => {
        const l = base(mode)
        for (const c of of(fn)) l[idx(c)] = 255
        return l
      }))
    })
  }
  if (has('red') && has('green') && has('blue')) {
    out.push({
      id: 'mix', title: 'Colour mixing', set: 'Brightness and colour',
      steps: [
        step('Red + green + blue together: white (or close to it).', 2, () => {
          const l = base(mode)
          paint(l, mode, { red: 255, green: 255, blue: 255 })
          return l
        }),
        step('A rainbow: the colour sweeps red → yellow → green → blue → magenta.', 5, (t) => {
          const l = base(mode)
          const [r, g, b] = hueRgb(t)
          paint(l, mode, { red: r, green: g, blue: b })
          return l
        })
      ]
    })
  }
  for (const c of of('colorWheel').concat(of('colorMacro'))) {
    if (c.ranges.length) out.push({ id: `wheel-${c.id}`, title: c.fn === 'colorWheel' ? 'Colour wheel walk' : 'Colour presets', set: 'Brightness and colour', steps: rangeWalk(mode, c, 'Colour', 1.4, c.fn === 'colorMacro' ? undefined : (l) => white(l)) })
  }
  for (const c of of('shutter')) {
    const strobe = c.ranges.find((r) => r.kind === 'strobe')
    out.push({
      id: `strobe-${c.id}`, title: 'Strobe', set: 'Brightness and colour',
      steps: [
        ...c.ranges.filter((r) => r.kind !== 'strobe').map((r) => step(`${r.label} (${r.lo}–${r.hi}): ${r.kind === 'closed' ? 'dark' : 'steady light'}.`, 1.5, () => {
          const l = base(mode)
          lightsUp(l)
          l[idx(c)] = mid(r.lo, r.hi)
          return l
        })),
        step(strobe ? `Strobe from ${strobe.lo} to ${strobe.hi}: flashes slow, getting faster.` : 'Values from 10 up: flashes slow, getting faster (the usual layout; no ranges given).', 5, (t) => {
          const l = base(mode)
          lightsUp(l)
          l[idx(c)] = strobe ? Math.round(strobe.lo + t * (strobe.hi - strobe.lo)) : Math.round(10 + t * 245)
          return l
        })
      ]
    })
  }

  // --- Cells ---------------------------------------------------------------------
  if (cells.length > 1) {
    out.push({
      id: 'chase', title: 'Cell chase', set: 'Cells',
      steps: cells.map((p, k) => step(`Cell ${k + 1} of ${cells.length} (${p.name}) lit on its own. The chase should run in the cells' real order.`, 0.8, () => {
        const l = base(mode)
        paint(l, mode, {}, undefined)
        paint(l, mode, { red: 255, warmWhite: 255, white: 255 }, p.id)
        return l
      }))
    })
    out.push({
      id: 'percell', title: 'Colour per cell', set: 'Cells',
      steps: [step('Each cell its own colour: red, green, blue, yellow, magenta, cyan, white, then again.', 4, () => {
        const l = base(mode)
        cells.forEach((p, k) => paint(l, mode, PALETTE[k % PALETTE.length][1], p.id))
        return l
      })]
    })
    if (has('red') && has('green') && has('blue')) {
      out.push({
        id: 'rainbowcells', title: 'Rainbow across', set: 'Cells',
        steps: [step('A rainbow moving across the cells.', 6, (_t, time) => {
          const l = base(mode)
          cells.forEach((p, k) => {
            const [r, g, b] = hueRgb((time * 0.25 + k / cells.length) % 1)
            paint(l, mode, { red: r, green: g, blue: b }, p.id)
          })
          return l
        })]
      })
    }
    const masters = mode.channels.filter((c) => c.fn === 'dimmer' && !c.part && !c.fine)
    if (masters.length) {
      out.push({
        id: 'master', title: 'Master over cells', set: 'Cells',
        steps: [step('All cells white; the master dimmer fades them all together.', 4, (t) => {
          const l = base(mode)
          paint(l, mode, PALETTE[6][1])
          for (const c of masters) l[idx(c)] = Math.round((t < 0.5 ? t * 2 : 2 - t * 2) * 255)
          return l
        })]
      })
    }
  }

  // --- Movement ------------------------------------------------------------------
  if (has('pan') || has('tilt')) {
    const sweep = (fn: 'pan' | 'tilt', text: string): TestStep => step(text, 5, (t) => {
      const l = base(mode)
      lightsUp(l)
      for (const c of of(fn)) l[idx(c)] = Math.round(t < 0.5 ? t * 2 * 255 : (2 - t * 2) * 255)
      return l
    })
    out.push({
      id: 'move', title: 'Pan, tilt and circle', set: 'Movement',
      steps: [
        ...(has('pan') ? [sweep('pan', `Pan from one end to the other (${def.look.pan ?? 540}°) and back. The head turns; it shouldn't tip.`)] : []),
        ...(has('tilt') ? [sweep('tilt', `Tilt from one end to the other (${def.look.tilt ?? 270}°) and back. The head tips; it shouldn't turn.`)] : []),
        step('A smooth circle: pan and tilt together.', 6, (_t, time) => {
          const l = base(mode)
          lightsUp(l)
          for (const c of of('pan')) l[idx(c)] = Math.round(128 + Math.sin(time * 1.2) * 60)
          for (const c of of('tilt')) l[idx(c)] = Math.round(128 + Math.cos(time * 1.2) * 40)
          return l
        })
      ]
    })
  }

  // --- Beam ----------------------------------------------------------------------
  if (has('zoom')) {
    out.push({
      id: 'zoom', title: 'Zoom', set: 'Beam',
      steps: [step('The beam goes from narrow to wide and back.', 4, (t) => {
        const l = base(mode)
        lightsUp(l)
        for (const c of of('zoom')) l[idx(c)] = Math.round((t < 0.5 ? t * 2 : 2 - t * 2) * 255)
        return l
      })]
    })
  }
  for (const c of of('gobo')) {
    out.push({ id: `gobo-${c.id}`, title: 'Gobo walk', set: 'Beam', steps: rangeWalk(mode, c, 'Gobo', 1.5, lightsUp) })
  }
  for (const c of of('goboRotation')) {
    const gobo = of('gobo')[0]
    out.push({ id: `gspin-${c.id}`, title: 'Gobo spin', set: 'Beam', steps: rangeWalk(mode, c, 'Gobo rotation', 2.5, (l) => {
      lightsUp(l)
      const slot = gobo?.ranges.find((r) => (r.gobo ?? 0) > 0)
      if (gobo && slot) l[idx(gobo)] = mid(slot.lo, slot.hi)
    }) })
  }
  for (const c of of('prism')) {
    out.push({
      id: `prism-${c.id}`, title: 'Prism', set: 'Beam',
      steps: [
        ...rangeWalk(mode, c, 'Prism', 2, lightsUp),
        ...of('prismRotation').flatMap((pr) => rangeWalk(mode, pr, 'Prism rotation', 2.5, (l) => {
          lightsUp(l)
          const inn = c.ranges.find((r) => r.kind !== 'off')
          l[idx(c)] = inn ? mid(inn.lo, inn.hi) : 255
        }))
      ]
    })
  }

  // --- Effects -------------------------------------------------------------------
  for (const c of of('program')) {
    out.push({ id: `prog-${c.id}`, title: 'Program walk', set: 'Effects', steps: rangeWalk(mode, c, 'Program', 3) })
  }
  for (const c of of('laser')) {
    out.push({ id: `laser-${c.id}`, title: 'Laser', set: 'Effects', steps: c.ranges.length ? rangeWalk(mode, c, 'Laser', 2) : [step('Laser off at 0, on and patterns above.', 4, (t) => { const l = base(mode); l[idx(c)] = Math.round(t * 255); return l })] })
  }
  for (const c of of('rotation')) {
    out.push({ id: `rot-${c.id}`, title: 'Rotation', set: 'Effects', steps: rangeWalk(mode, c, 'Rotation', 2.5, lightsUp) })
  }
  return out
}

function hueRgb(h: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6
    return Math.round(255 * Math.max(0, Math.min(1, Math.abs(k - 3) - 1)))
  }
  return [f(0), f(4), f(2)]
}

/** Total length of a scene in seconds. */
export function sceneLength(scene: TestScene): number {
  return scene.steps.reduce((a, s) => a + s.seconds, 0)
}

/** Where a running scene is: which step, and the levels to send. */
export function sceneAt(scene: TestScene, time: number): { index: number; step: TestStep; levels: Uint8Array } {
  const total = sceneLength(scene)
  let t = total > 0 ? time % total : 0
  for (let i = 0; i < scene.steps.length; i++) {
    const s = scene.steps[i]
    if (t < s.seconds || i === scene.steps.length - 1) return { index: i, step: s, levels: s.levels(Math.min(1, t / s.seconds), time) }
    t -= s.seconds
  }
  const s = scene.steps[0]
  return { index: 0, step: s, levels: s.levels(0, time) }
}

// ---------------------------------------------------------------------------
// "Something's off": the usual fixes for each test
// ---------------------------------------------------------------------------

function swapFns(def: FixtureDef, modeId: string, a: ChannelFn, b: ChannelFn): FixtureDef {
  return updateMode(def, modeId, (m) => ({ ...m, channels: m.channels.map((c) => (c.fn === a ? { ...c, fn: b, name: c.name === FN[a].label ? FN[b].label : c.name } : c.fn === b ? { ...c, fn: a, name: c.name === FN[b].label ? FN[a].label : c.name } : c)) }))
}

/** Reverse which part each cell's channels drive: cell 1 becomes the last. */
export function reverseCells(def: FixtureDef): FixtureDef {
  const cells = def.parts.filter((p) => p.cell !== undefined)
  const max = Math.max(0, ...cells.map((p) => p.cell!))
  return { ...def, parts: def.parts.map((p) => (p.cell === undefined ? p : { ...p, cell: max - p.cell })) }
}

/** Move every cell one place along (the chase starts one cell later). */
export function shiftCells(def: FixtureDef, by = 1): FixtureDef {
  const cells = [...new Set(def.parts.filter((p) => p.cell !== undefined).map((p) => p.cell!))].sort((a, b) => a - b)
  const n = cells.length
  if (n < 2) return def
  return { ...def, parts: def.parts.map((p) => (p.cell === undefined ? p : { ...p, cell: cells[(cells.indexOf(p.cell) + by + n) % n] })) }
}

export function fixesFor(sceneId: string, def: FixtureDef, modeIndex: number): TestFix[] {
  const mode = def.modes[modeIndex]
  if (!mode) return []
  const out: TestFix[] = []
  const id = sceneId.replace(/-.*/, '')
  if (id === 'chase' || id === 'percell' || id === 'rainbowcells') {
    out.push({ label: 'Cells count from the other end: reverse the order', apply: reverseCells })
    out.push({ label: 'The chase starts one cell off: move cell 1 along by one', apply: (d) => shiftCells(d, 1) })
    if (def.look.layout?.kind === 'ringCentre' || def.look.shape === 'cluster') {
      out.push({ label: 'The centre cell is first, not last', apply: (d) => ({ ...d, parts: d.parts.map((p) => (p.cell === undefined ? p : { ...p, cell: p.cell === 0 ? Math.max(...d.parts.map((x) => x.cell ?? 0)) : p.cell - 1 })) }) })
    }
  }
  if (id === 'colours' || id === 'mix' || id === 'chase' || id === 'percell' || id === 'rainbowcells') {
    out.push({ label: 'Red and green are swapped (the light is GRB)', apply: (d) => swapFns(d, mode.id, 'red', 'green') })
    out.push({ label: 'Green and blue are swapped (RBG)', apply: (d) => swapFns(d, mode.id, 'green', 'blue') })
    out.push({ label: 'Red and blue are swapped (BGR)', apply: (d) => swapFns(d, mode.id, 'red', 'blue') })
  }
  if (id === 'move') {
    out.push({ label: 'Pan and tilt are swapped', apply: (d) => swapFns(d, mode.id, 'pan', 'tilt') })
  }
  if (id === 'dim' || id === 'identify' || id === 'colours' || id === 'home') {
    const sh = mode.channels.find((c) => c.fn === 'shutter')
    if (sh) {
      out.push({
        label: 'It stays dark: low strobe values mean open, not closed',
        apply: (d) => updateMode(d, mode.id, (m) => ({ ...m, channels: m.channels.map((c) => (c.id !== sh.id ? c : { ...c, ranges: [{ lo: 0, hi: 9, label: 'Open', kind: 'open' }, ...c.ranges.filter((r) => r.lo > 9 || r.kind === 'strobe').map((r) => ({ ...r, lo: Math.max(10, r.lo) }))] })) }))
      })
    }
  }
  if (id === 'strobe') {
    out.push({ label: 'The ranges are different on my light: edit them on the value bar', apply: (d) => d })
  }
  return out
}

/** A colour for a range on the value bar. */
export function rangeColour(c: ChannelDef, r: ChannelDef['ranges'][number]): string {
  if (r.color && rgbOf(r.color)) return r.color
  if (r.kind === 'closed' || r.kind === 'off') return '#2a2a2e'
  if (r.kind === 'open') return '#f2f2f2'
  if (r.kind === 'strobe') return '#fff27a'
  if (r.kind === 'program') return ({ chase: '#ffd60a', fade: '#ff9f0a', jump: '#ff6ec7', rainbow: '#5ac8fa', strobe: '#f2f2f2', pulse: '#bf5af2', static: '#8e8e93' } as Record<string, string>)[r.pattern ?? 'chase'] ?? '#ffd60a'
  if (r.kind === 'spin') return (r.from ?? 0) + (r.to ?? 0) < 0 ? '#5ac8fa' : (r.from ?? 0) + (r.to ?? 0) > 0 ? '#30d158' : '#3a3a3c'
  return FN[c.fn].swatch
}
