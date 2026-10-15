/**
 * Rockville fixtures, written from Rockville's own owner's manuals
 * (support.rockvilleaudio.com ▸ each product ▸ Owner's Manual) in Open Fixture
 * Library format. Models already in the Open Fixture Library or QLC+ libraries
 * (RockPAR50, Rockstrip 252, Motionstrip, Battery Strip 24, Best Strip 60,
 * RockWedge LED) are left to those.
 */
import { cap, intensity, color, pan, tilt, ptSpeed, zoom, focus, generic, effect, maintenance, caps, strobe, wheel, spin, shake, goboSpin, slots, colorSlots, goboSlots } from './ofl-helpers.mjs'

const fixtures = {}

export function rockvilleFixtures() {
  return fixtures
}
