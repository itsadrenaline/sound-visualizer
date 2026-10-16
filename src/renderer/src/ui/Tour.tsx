/**
 * The guided tour overlay: dims the window except for the part being explained,
 * rings it, and puts a note beside it with Back and Next. It follows the element
 * if the window changes size, and centres the note when there's nothing to point at.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TOURS, useTour } from '../state/tours'
import { useWizards } from '../state/wizards'
import { MenuItem, MenuShell } from './Menu'
import { useAppVersion } from './About'

type Box = { left: number; top: number; width: number; height: number }
const PAD = 6
const GAP = 14
const EDGE = 10

function measure(name?: string): Box | null {
  if (!name) return null
  const el = document.querySelector(`[data-tour="${name}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return null
  // Keep the ring on screen even for big panels.
  const left = Math.max(EDGE, r.left - PAD)
  const top = Math.max(EDGE, r.top - PAD)
  const right = Math.min(window.innerWidth - EDGE, r.right + PAD)
  const bottom = Math.min(window.innerHeight - EDGE, r.bottom + PAD)
  return { left, top, width: right - left, height: bottom - top }
}

/** Beside the box: to the right, left, below or above, whichever fits; else inside it. */
function placeCard(box: Box | null, w: number, h: number): { left: number; top: number } {
  const W = window.innerWidth
  const H = window.innerHeight
  if (!box) return { left: (W - w) / 2, top: (H - h) / 2 }
  const clampX = (x: number) => Math.max(EDGE, Math.min(W - w - EDGE, x))
  const clampY = (y: number) => Math.max(EDGE, Math.min(H - h - EDGE, y))
  const midY = box.top + box.height / 2 - h / 2
  const midX = box.left + box.width / 2 - w / 2
  if (box.left + box.width + GAP + w <= W - EDGE) return { left: box.left + box.width + GAP, top: clampY(midY) }
  if (box.left - GAP - w >= EDGE) return { left: box.left - GAP - w, top: clampY(midY) }
  if (box.top + box.height + GAP + h <= H - EDGE) return { left: clampX(midX), top: box.top + box.height + GAP }
  if (box.top - GAP - h >= EDGE) return { left: clampX(midX), top: box.top - GAP - h }
  // A big panel: sit inside it, near the top.
  return { left: clampX(midX), top: clampY(box.top + 40) }
}

export function TourOverlay() {
  const tour = useTour((s) => s.tour)
  const step = useTour((s) => s.step)
  const next = useTour((s) => s.next)
  const back = useTour((s) => s.back)
  const end = useTour((s) => s.end)
  const [box, setBox] = useState<Box | null>(null)
  const [card, setCard] = useState<{ left: number; top: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const current = tour?.steps[step]

  // Follow the target: it can appear a moment after a tab switch, or move with the window.
  useEffect(() => {
    if (!current) return
    let frame = 0
    let last = ''
    const tick = () => {
      const b = measure(current.target)
      const key = b ? `${b.left},${b.top},${b.width},${b.height}` : 'none'
      if (key !== last) {
        last = key
        setBox(b)
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [current])

  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    setCard(placeCard(box, el.offsetWidth, el.offsetHeight))
  }, [box, step, tour])

  useEffect(() => {
    if (!tour) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (e.preventDefault(), end())
      if (e.key === 'ArrowRight' || e.key === 'Enter') (e.preventDefault(), next())
      if (e.key === 'ArrowLeft') (e.preventDefault(), back())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [tour, next, back, end])

  if (!tour || !current) return null
  const last = step === tour.steps.length - 1
  return createPortal(
    <div className="tour-layer" role="dialog" aria-label={`Tour: ${tour.title}`}>
      {/* Clicks outside the note do nothing, so the tour can't be knocked off course. */}
      <div className="tour-block" onPointerDown={(e) => e.preventDefault()} />
      {box ? <div className="tour-hole" style={box} /> : <div className="tour-dim" />}
      <div ref={cardRef} className="tour-card" style={{ left: card?.left ?? -9999, top: card?.top ?? 0 }}>
        <div className="tour-count">
          {tour.title} · {step + 1} of {tour.steps.length}
        </div>
        <h3>{current.title}</h3>
        <p>{current.body}</p>
        <div className="tour-foot">
          <button className="quiet" onClick={() => end()}>
            End tour
          </button>
          <span className="spacer" />
          {step > 0 && <button onClick={back}>Back</button>}
          <button className="primary" autoFocus onClick={next}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** The ? Learn button: the welcome tour, every guided tour, and starting fresh. */
export function LearnMenu() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const done = useTour((s) => s.done)
  const start = useTour((s) => s.start)
  const close = () => setAt(null)
  const version = useAppVersion()
  return (
    <>
      <button
        data-tour="learn"
        className={at ? 'on' : ''}
        title="Learn: guided tours that point at the real buttons, and the welcome again"
        onClick={(e) => {
          if (at) return close()
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: r.right - 280, y: r.bottom + 4 })
        }}
      >
        <span className="ic">?</span>
        <span className="lbl">? Learn</span>
      </button>
      {at && (
        <MenuShell at={at} onClose={close}>
          <div className="menu-title">Guided tours: they point at the real buttons</div>
          {TOURS.map((t) => (
            <MenuItem key={t.id} label={t.title} title={t.summary} check={done.includes(t.id) ? '✓' : ''} onClick={() => (close(), start(t.id))} />
          ))}
          <hr />
          <MenuItem label="Welcome tour" onClick={() => (close(), useWizards.getState().openWelcome())} />
          <MenuItem label="Start fresh as a new user…" onClick={() => (close(), useWizards.getState().askFreshStart())} />
          <hr />
          <MenuItem label={`About Sound Visualizer${version ? ` · version ${version}` : ''}`} title="Version, build and system: send these when you report a problem" onClick={() => (close(), useWizards.getState().setAbout(true))} />
        </MenuShell>
      )}
    </>
  )
}

/** Help ▸ Guided Tours ▸ All Tours…: a list with what each covers. */
export function ToursDialog() {
  const open = useWizards((s) => s.toursList)
  const setOpen = useWizards((s) => s.setToursList)
  const done = useTour((s) => s.done)
  const start = useTour((s) => s.start)
  if (!open) return null
  return (
    <div className="wizard-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="wizard tours-list" role="dialog" aria-label="Guided tours">
        <h2>Guided tours</h2>
        <p className="soft">Each one lights up the real buttons and panels, one at a time. About a minute each.</p>
        <ul>
          {TOURS.map((t) => (
            <li key={t.id}>
              <div>
                <strong>
                  {t.title} {done.includes(t.id) && <span className="tour-done">✓ done</span>}
                </strong>
                <span>{t.summary}</span>
              </div>
              <button className="primary" onClick={() => (setOpen(false), start(t.id))}>
                Start
              </button>
            </li>
          ))}
        </ul>
        <div className="wizard-foot">
          <button onClick={() => (setOpen(false), useWizards.getState().openWelcome())}>Welcome tour</button>
          <span className="spacer" />
          <button className="primary" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
