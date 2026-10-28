/**
 * Where the Plan is looking: the plan point in the middle of the view and how far in
 * it's zoomed. Kept here (not inside the Plan) so switching between 3D and the Plan
 * can carry the view across, and so the on-screen buttons can move the Plan too.
 */
import { create } from 'zustand'
import type { PlanSide } from './prefs'

export interface PlanCam {
  /** Plan point at the middle of the view, metres. */
  u: number
  v: number
  /** Pixels per metre. */
  scale: number
}

interface PlanCamState {
  cam: PlanCam | null
  /** The side the view was set for; another side gets framed afresh. */
  side: PlanSide | null
  /** The Plan's size on screen, pixels. */
  size: { w: number; h: number }
  setCam(next: PlanCam | null | ((prev: PlanCam | null) => PlanCam | null), side?: PlanSide): void
  setSize(size: { w: number; h: number }): void
}

export const usePlanCam = create<PlanCamState>((set, get) => ({
  cam: null,
  side: null,
  size: { w: 800, h: 600 },
  setCam: (next, side) => {
    const cam = typeof next === 'function' ? next(get().cam) : next
    set(side ? { cam, side } : { cam })
  },
  setSize: (size) => set({ size })
}))

export const MIN_SCALE = 6
export const MAX_SCALE = 600

/** A small move of the Plan, for the on-screen buttons and keys: zoom in and out, or slide. */
export function planNudge(kind: 'zoom' | 'pan', x: number, y: number): void {
  usePlanCam.getState().setCam((c) => {
    if (!c) return c
    if (kind === 'zoom') return { ...c, scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.scale * Math.pow(1.1, y))) }
    // About 40 pixels a step, whatever the zoom: up moves the view up the screen.
    const step = 40 / c.scale
    return { ...c, u: c.u + x * step, v: c.v - y * step }
  })
}
