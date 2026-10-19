/** Every set of fixtures written from manufacturers' manuals, by maker. */
import { bothLightingFixtures } from './both-lighting.mjs'
import { betopperFixtures } from './betopper.mjs'
import { rockvilleFixtures } from './rockville.mjs'
import { beamzFixtures } from './beamz.mjs'
import { laserworldFixtures } from './laserworld.mjs'

export function manualFixtures() {
  return [
    { maker: 'Both Lighting', slug: 'both-lighting', fixtures: bothLightingFixtures() },
    { maker: 'Betopper', slug: 'betopper', fixtures: betopperFixtures() },
    { maker: 'Rockville', slug: 'rockville', fixtures: rockvilleFixtures() },
    { maker: 'BeamZ', slug: 'beamz', fixtures: beamzFixtures() },
    { maker: 'Laserworld', slug: 'laserworld', fixtures: laserworldFixtures() }
  ]
}
