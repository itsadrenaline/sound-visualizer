/**
 * Camera buttons in the corner of the 3D view, so getting around never needs a
 * scroll wheel or a right mouse button: zoom in and out, turn around the show,
 * slide left, right, forward and back, go up and down, and back to the
 * starting view. Hold a button to keep moving. The keyboard does the same
 * (arrows turn, Shift+arrows slide, + and - zoom, Page Up/Down raise, Home).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { view, type NudgeKind } from '../state/viewBus'
import { usePrefs } from '../state/prefs'
import { planNudge } from '../state/planCamera'

const KEY = 'sound-visualizer:navpad'

function loadOpen(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'closed'
  } catch {
    return true
  }
}

/** A button that moves the camera while it's held down. */
function Hold({ kind, x, y, tip, children, className = '', plan = false }: { kind: NudgeKind; x: number; y: number; tip: string; children: ReactNode; className?: string; plan?: boolean }) {
  // In the Plan the same buttons zoom and slide the drawing.
  const nudge = (k: NudgeKind, a: number, b: number) => (plan ? planNudge(k === 'zoom' ? 'zoom' : 'pan', a, b) : view.nudge(k, a, b))
  const timer = useRef<number | null>(null)
  const stop = () => {
    if (timer.current !== null) cancelAnimationFrame(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])
  const start = () => {
    stop()
    // One step straight away (a click), then smooth movement while held.
    nudge(kind, x, y)
    let last = performance.now() + 220
    const tick = (now: number) => {
      if (now > last) {
        const dt = Math.min(0.05, (now - last) / 1000)
        nudge(kind, x * dt * 12, y * dt * 12)
        last = now
      }
      timer.current = requestAnimationFrame(tick)
    }
    timer.current = requestAnimationFrame(tick)
  }
  return (
    <button
      className={`nav-btn ${className}`}
      title={tip}
      aria-label={tip}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        start()
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), nudge(kind, x, y))}
    >
      {children}
    </button>
  )
}

export function NavPad() {
  const [open, setOpen] = useState(loadOpen)
  const plan = usePrefs((s) => s.view === 'plan')
  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem(KEY, open ? 'closed' : 'open')
    } catch {
      // Not remembered.
    }
  }
  if (!open) {
    return (
      <div className="navpad closed" data-tour="navpad" onPointerDown={(e) => e.stopPropagation()}>
        <button className="nav-btn" title="Show the camera buttons: zoom, turn, move, up and down" onClick={toggle}>
          ✥
        </button>
      </div>
    )
  }
  if (plan) {
    return (
      <div className="navpad" data-tour="navpad" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
        <div className="nav-group">
          <span className="nav-label">Zoom</span>
          <div className="nav-col">
            <Hold plan kind="zoom" x={0} y={1} tip="Zoom in (or press +). Hold to keep going.">
              ＋
            </Hold>
            <Hold plan kind="zoom" x={0} y={-1} tip="Zoom out (or press −). Hold to keep going.">
              −
            </Hold>
          </div>
        </div>
        <div className="nav-group">
          <span className="nav-label">Move</span>
          <div className="nav-cross">
            <Hold plan kind="pan" x={0} y={1} tip="Move the view up (↑ with nothing selected)" className="n">
              ↑
            </Hold>
            <Hold plan kind="pan" x={-1} y={0} tip="Move the view left (←)" className="w">
              ←
            </Hold>
            <button className="nav-btn c" title="Show everything (Home)" aria-label="Show everything" onClick={() => window.dispatchEvent(new CustomEvent('plan:focus', { detail: 'all' }))}>
              ⌂
            </button>
            <Hold plan kind="pan" x={1} y={0} tip="Move the view right (→)" className="e">
              →
            </Hold>
            <Hold plan kind="pan" x={0} y={-1} tip="Move the view down (↓)" className="s">
              ↓
            </Hold>
          </div>
        </div>
        <button className="nav-hide" title="Hide the camera buttons (✥ brings them back)" onClick={toggle}>
          ✕
        </button>
      </div>
    )
  }
  return (
    <div className="navpad" data-tour="navpad" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div className="nav-group">
        <span className="nav-label">Zoom</span>
        <div className="nav-col">
          <Hold kind="zoom" x={0} y={1} tip="Zoom in (or press +). Hold to keep going.">
            ＋
          </Hold>
          <Hold kind="zoom" x={0} y={-1} tip="Zoom out (or press −). Hold to keep going.">
            −
          </Hold>
        </div>
      </div>
      <div className="nav-group">
        <span className="nav-label">Turn</span>
        <div className="nav-cross">
          <Hold kind="orbit" x={0} y={1} tip="Look down from higher up (↑)" className="n">
            ▲
          </Hold>
          <Hold kind="orbit" x={-1} y={0} tip="Turn around the show to the left (←)" className="w">
            ◀
          </Hold>
          <button className="nav-btn c" title="Back to the starting view: the whole show (Home)" aria-label="Starting view" onClick={() => view.home()}>
            ⌂
          </button>
          <Hold kind="orbit" x={1} y={0} tip="Turn around the show to the right (→)" className="e">
            ▶
          </Hold>
          <Hold kind="orbit" x={0} y={-1} tip="Look from lower down (↓)" className="s">
            ▼
          </Hold>
        </div>
      </div>
      <div className="nav-group">
        <span className="nav-label">Move</span>
        <div className="nav-cross">
          <Hold kind="pan" x={0} y={1} tip="Move forward, towards the stage (Shift+↑)" className="n">
            ↑
          </Hold>
          <Hold kind="pan" x={-1} y={0} tip="Move left (Shift+←)" className="w">
            ←
          </Hold>
          <span className="nav-btn c dot" aria-hidden />
          <Hold kind="pan" x={1} y={0} tip="Move right (Shift+→)" className="e">
            →
          </Hold>
          <Hold kind="pan" x={0} y={-1} tip="Move back, away from the stage (Shift+↓)" className="s">
            ↓
          </Hold>
        </div>
      </div>
      <div className="nav-group">
        <span className="nav-label">Height</span>
        <div className="nav-col">
          <Hold kind="lift" x={0} y={1} tip="Move up (Page Up)">
            ⇡
          </Hold>
          <Hold kind="lift" x={0} y={-1} tip="Move down (Page Down)">
            ⇣
          </Hold>
        </div>
      </div>
      <button className="nav-hide" title="Hide the camera buttons (✥ brings them back)" onClick={toggle}>
        ✕
      </button>
    </div>
  )
}
