import { describe, expect, it } from 'vitest'
import { planNudge, usePlanCam, MAX_SCALE } from '../src/renderer/src/state/planCamera'

describe('Plan camera buttons', () => {
  it('zooms in and out about the middle, within limits', () => {
    usePlanCam.getState().setCam({ u: 1, v: 2, scale: 40 }, 'top')
    planNudge('zoom', 0, 1)
    expect(usePlanCam.getState().cam).toEqual({ u: 1, v: 2, scale: 44 })
    for (let i = 0; i < 100; i++) planNudge('zoom', 0, 1)
    expect(usePlanCam.getState().cam!.scale).toBe(MAX_SCALE)
  })
  it('slides about 40 pixels a step; up moves the view up the screen', () => {
    usePlanCam.getState().setCam({ u: 0, v: 0, scale: 40 }, 'front')
    planNudge('pan', 1, 1)
    expect(usePlanCam.getState().cam).toEqual({ u: 1, v: -1, scale: 40 })
    expect(usePlanCam.getState().side).toBe('front')
  })
})
