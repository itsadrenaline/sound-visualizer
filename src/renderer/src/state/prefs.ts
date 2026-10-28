/**
 * Your own settings, kept on this computer (not in the show file): metric or imperial,
 * the grid and snapping, and whether the main view is 3D or the Plan.
 */
import { create } from 'zustand'
import { FOOT, INCH, setUnitsValue, type Units } from '../model/units'

const KEY = 'sv.prefs'

export type MainView = '3d' | 'plan'
export type PlanSide = 'top' | 'front' | 'side'
export type PlanLabels = 'name' | 'patch' | 'none'

interface Prefs {
  units: Units
  /** Draw the grid on the floor (3D) and in the Plan. */
  grid: boolean
  /** Moving things lands them on the grid. */
  snap: boolean
  /** Grid spacing, metres. */
  gridSize: number
  view: MainView
  planSide: PlanSide
  /** What the Plan writes next to each fixture. */
  planLabels: PlanLabels
  setUnits(u: Units): void
  setGrid(on: boolean): void
  setSnap(on: boolean): void
  setGridSize(m: number): void
  setView(v: MainView): void
  setPlanSide(s: PlanSide): void
  setPlanLabels(l: PlanLabels): void
}

type Saved = Pick<Prefs, 'units' | 'grid' | 'snap' | 'gridSize' | 'view' | 'planSide' | 'planLabels'>

const DEFAULTS: Saved = { units: 'metric', grid: true, snap: false, gridSize: 0.5, view: '3d', planSide: 'top', planLabels: 'name' }

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>
    return { ...DEFAULTS, ...raw }
  } catch {
    return DEFAULTS
  }
}

function save(p: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Settings are a convenience; the app works without them.
  }
}

/** Grid sizes to choose from, in the chosen system. */
export function gridChoices(u: Units): Array<{ m: number; label: string }> {
  return u === 'imperial'
    ? [
        { m: 6 * INCH, label: '6″' },
        { m: FOOT, label: '1′' },
        { m: 2 * FOOT, label: '2′' },
        { m: 4 * FOOT, label: '4′' }
      ]
    : [
        { m: 0.1, label: '10 cm' },
        { m: 0.25, label: '25 cm' },
        { m: 0.5, label: '50 cm' },
        { m: 1, label: '1 m' }
      ]
}

const initial = load()
setUnitsValue(initial.units)

export const usePrefs = create<Prefs>((set, get) => {
  const change = (patch: Partial<Saved>) => {
    set(patch)
    const { units, grid, snap, gridSize, view, planSide, planLabels } = { ...get(), ...patch }
    save({ units, grid, snap, gridSize, view, planSide, planLabels })
  }
  return {
    ...initial,
    setUnits: (units) => {
      setUnitsValue(units)
      // Keep the grid a round size in the new system (50 cm ↔ 2 ft, 1 m ↔ 4 ft…).
      const choices = gridChoices(units)
      const nearest = choices.reduce((a, b) => (Math.abs(b.m - get().gridSize) < Math.abs(a.m - get().gridSize) ? b : a))
      change({ units, gridSize: nearest.m })
    },
    setGrid: (grid) => change({ grid }),
    setSnap: (snap) => change({ snap }),
    setGridSize: (gridSize) => change({ gridSize }),
    setView: (view) => change({ view }),
    setPlanSide: (planSide) => change({ planSide }),
    setPlanLabels: (planLabels) => change({ planLabels })
  }
})

/** Snap a horizontal position to the grid when snapping is on. */
export function snapXZ(x: number, z: number): [number, number] {
  const { snap, gridSize } = usePrefs.getState()
  if (!snap || gridSize <= 0) return [x, z]
  return [Math.round(x / gridSize) * gridSize, Math.round(z / gridSize) * gridSize]
}

/** Just the units, for components that only show lengths. */
export function useUnits(): Units {
  return usePrefs((s) => s.units)
}
