/**
 * Picking what a channel does: a searchable list of every channel job, grouped
 * (Intensity, Colour, Position…), each explained as you point at it. Type to
 * filter ("ring", "strobe", "cto", "x/y") and press Enter. Anything not listed
 * is "Other": it keeps the manual's name, is saved and exported, and can be
 * given a proper job later.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FN, FN_GROUPS, type ChannelFn } from '../../model/fixtureDef'

/** Other words manuals use for each job, so typing them finds it. */
const ALIASES: Partial<Record<ChannelFn, string>> = {
  dimmer: 'intensity master brightness level',
  dimmerMode: 'dimmer curve dimming mode smooth linear square',
  shutter: 'strobe flash shutter stopper blackout',
  white: 'w daylight',
  warmWhite: 'ww tungsten 3200',
  coolWhite: 'cw daylight 6500',
  uv: 'ultraviolet purple black light',
  colorWheel: 'color wheel colour wheel gel',
  colorMacro: 'color macro colour macro preset fixed colours',
  colorFx: 'color chase colour fade jump gradient auto colour rainbow ring effect',
  colorTemp: 'cto ctc ctb kelvin temperature',
  hue: 'hue colour angle',
  pan: 'x horizontal',
  tilt: 'y vertical',
  panTiltSpeed: 'xy speed vector speed movement speed p/t speed',
  panRotation: 'endless pan continuous pan infinite',
  tiltRotation: 'endless tilt continuous tilt infinite',
  positionFx: 'movement macro shape figure eight circle position effect',
  zoom: 'beam angle spread',
  iris: 'aperture',
  frost: 'diffusion soft edge filter',
  beamShaper: 'blades framing shaper',
  animation: 'animation wheel water fire effect wheel',
  gobo: 'pattern gobo wheel',
  goboRotation: 'gobo spin gobo index',
  prism: 'facet split',
  rotation: 'derby motor moonflower rotate turn',
  laser: 'laser pattern laser on',
  program: 'auto program show macro sound active chase effect mode',
  programSpeed: 'auto speed macro speed effect speed chase speed',
  sound: 'sound sensitivity music mic audio',
  fog: 'smoke haze fog output',
  specialFx: 'bubbles snow sparks spark co2 flame confetti',
  fan: 'fan speed',
  control: 'reset settings function special lamp on lamp off display maintenance',
  other: 'custom unknown',
  none: 'reserved unused no function blank'
}

export function FnPicker({ value, onPick, onClose, extra }: { value?: ChannelFn; onPick: (fn: ChannelFn) => void; onClose: () => void; extra?: Array<{ label: string; explain: string; run: () => void }> }) {
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const items = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const all = FN_GROUPS.flatMap((g) => (Object.keys(FN) as ChannelFn[]).filter((f) => FN[f].group === g))
    if (!words.length) return all
    return all.filter((f) => {
      const hay = `${FN[f].label} ${FN[f].group} ${ALIASES[f] ?? ''} ${f}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [q])
  const extras = useMemo(() => (extra ?? []).filter((x) => !q.trim() || `${x.label} ${x.explain}`.toLowerCase().includes(q.trim().toLowerCase())), [extra, q])
  useEffect(() => {
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose()
    window.addEventListener('pointerdown', down, true)
    return () => window.removeEventListener('pointerdown', down, true)
  }, [onClose])
  // Placed against the window (not the list it opens from), so a scrolling list never cuts it off.
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const anchor = box.current?.parentElement?.getBoundingClientRect()
    if (!anchor) return
    const h = 420
    const w = 280
    const below = window.innerHeight - anchor.bottom > h + 8 || anchor.top < h
    setPos({ position: 'fixed', left: Math.max(8, Math.min(window.innerWidth - w - 8, anchor.left)), top: below ? anchor.bottom + 4 : Math.max(8, anchor.top - h - 4) })
  }, [])
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (pos.visibility !== 'hidden') search.current?.focus()
  }, [pos])
  const total = items.length + extras.length
  // Parts (an LED ring…) come first, then the channel jobs.
  const choose = (k: number) => {
    if (k < extras.length) extras[k].run()
    else onPick(items[k - extras.length])
    onClose()
  }
  const shown = hi >= extras.length ? items[hi - extras.length] : undefined
  let group = ''
  return (
    <div className="fn-picker" ref={box} style={pos} onClick={(e) => e.stopPropagation()}>
      <input
        ref={search}
        placeholder="What does it do? Type to search…"
        value={q}
        onChange={(e) => (setQ(e.target.value), setHi(0))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setHi(Math.min(total - 1, hi + 1)))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setHi(Math.max(0, hi - 1)))
          else if (e.key === 'Enter' && total) (e.preventDefault(), choose(hi))
          else if (e.key === 'Escape') (e.stopPropagation(), onClose())
        }}
      />
      <div className="fn-options">
        {extras.length > 0 && <div className="fn-group">Add a part</div>}
        {extras.map((x, k) => (
          <button key={x.label} className={`fn-option ${k === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(k)} onClick={() => choose(k)} title={x.explain}>
            <span className="ch-swatch ring" />
            {x.label}
          </button>
        ))}
        {items.map((f, i) => {
          const k = i + extras.length
          const head = FN[f].group !== group ? (group = FN[f].group) : null
          return (
            <div key={f}>
              {head && <div className="fn-group">{extras.length ? `Add a channel: ${head}` : head}</div>}
              <button className={`fn-option ${k === hi ? 'hi' : ''} ${f === value ? 'cur' : ''}`} onMouseEnter={() => setHi(k)} onClick={() => choose(k)}>
                <span className="ch-swatch" style={{ background: FN[f].swatch }} />
                {FN[f].label}
              </button>
            </div>
          )
        })}
        {!total && <div className="fn-empty">Nothing matches. Pick “Other” and keep the manual’s name: it’s saved and exported as it is.</div>}
      </div>
      <div className="fn-explain">{shown ? FN[shown].explain : extras[hi] ? extras[hi].explain : 'Point at a job to see what it does.'}</div>
    </div>
  )
}

/** A button showing a channel's job that opens the picker. */
export function FnButton({ value, onPick, several }: { value: ChannelFn; onPick: (fn: ChannelFn) => void; several?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="fn-button-wrap">
      <button type="button" className="fn-button" onClick={(e) => (e.stopPropagation(), setOpen(!open))} title={several ? 'Set what all the picked channels do' : FN[value].explain}>
        <span className="ch-swatch" style={{ background: several ? 'linear-gradient(90deg,#ff3b30,#34c759,#0a84ff)' : FN[value].swatch }} />
        <span className="fn-button-label">{several ? 'Several…' : FN[value].label}</span>
        <span className="caret-down">▾</span>
      </button>
      {open && <FnPicker value={several ? undefined : value} onPick={onPick} onClose={() => setOpen(false)} />}
    </span>
  )
}
