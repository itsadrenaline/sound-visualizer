/** Every set of fixtures written from manufacturers' manuals, by maker. */
import { bothLightingFixtures } from './both-lighting.mjs'
import { betopperFixtures } from './betopper.mjs'
import { rockvilleFixtures } from './rockville.mjs'
import { beamzFixtures } from './beamz.mjs'
import { laserworldFixtures } from './laserworld.mjs'
import { adjFixtures } from './adj.mjs'
import { genericFixtures } from './generic.mjs'

export function manualFixtures() {
  return [
    { maker: 'Both Lighting', slug: 'both-lighting', fixtures: bothLightingFixtures() },
    { maker: 'Betopper', slug: 'betopper', fixtures: betopperFixtures() },
    { maker: 'Rockville', slug: 'rockville', fixtures: rockvilleFixtures() },
    { maker: 'BeamZ', slug: 'beamz', fixtures: beamzFixtures() },
    { maker: 'Laserworld', slug: 'laserworld', fixtures: laserworldFixtures() },
    { maker: 'American DJ', slug: 'american-dj', fixtures: adjFixtures() },
    { maker: 'Generic', slug: 'generic', fixtures: genericFixtures() }
  ]
}
