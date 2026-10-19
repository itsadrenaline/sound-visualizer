/**
 * Lasers in colour, the ADJ Starburst, fixtures facing out on the front of a truss,
 * and the party objects (TVs, screens, dance floor, balloon arch, photo booth, neon sign).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { useStore } from '../src/renderer/src/state/store'
import { addLibraryFixtures, addStructure, mountFixtures, moveFixtures } from '../src/renderer/src/state/commands'
import { defaultProject } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import { FT, footprint, heightOf, mountPoints, STRUCTURE_KINDS, STRUCTURE_PRESETS, type Structure } from '../src/renderer/src/model/structures'
import { fixtureTypeFromOfl, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { coloursFromName, decodeHeads, RAINBOW } from '../src/renderer/src/model/heads'
import { fixtureTypeFromMode } from '../src/renderer/src/model/soundswitchImport'
import type { SoundSwitchFixture } from '../src/shared/soundswitch'

const lib: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const ofl = (key: string, mode = 0) => fixtureTypeFromOfl(key, lib.manufacturers[key.split('/')[0]], lib.fixtures[key], mode)
const levels = (values: number[]) => {
  const u = new Uint8Array(512)
  u.set(values)
  return u
}
const state = () => useStore.getState().project

beforeEach(() => useStore.setState({ project: settle(defaultProject()), past: [], future: [], selection: [] }))

describe('Laser colours', () => {
  it('reads colours from names, several at once, in English and Dutch', () => {
    expect(coloursFromName('Red + Green')).toEqual([[1, 0, 0], [0, 1, 0]])
    expect(coloursFromName('lazer wit')).toEqual([[1, 1, 1]])
    expect(coloursFromName('groen')).toEqual([[0, 1, 0]])
    expect(coloursFromName('Multicolour')).toBe(RAINBOW)
    expect(coloursFromName('Pattern 3')).toEqual([])
  })

  it('a SoundSwitch laser whose colour wheel only names its colours', () => {
    const f = {
      definitionId: 1, definition: 'EL-900RGB', manufacturer: 'Laserworld', universe: 0, address: 1,
      wheels: { 'Wheel 1': [{ lo: 0, hi: 39, name: 'White' }, { lo: 40, hi: 79, name: 'Red/Green' }, { lo: 80, hi: 119, name: 'Multicolour' }] },
      mode: { name: 'Mode 1', channels: 9, heads: [], attributes: [
        { code: 0, name: 'laser uit', width: 1, coarse: 0, fine: 0 },
        { code: 2, name: 'Colour wheel', width: 1, coarse: 3, fine: 3, wheel: 'Wheel 1' }
      ] }
    } as unknown as SoundSwitchFixture
    const type = fixtureTypeFromMode(f)
    expect(type.spec!.look).toBe('laser')
    expect(type.spec!.apertures).toBe(4)
    const at = (colour: number) => decodeHeads(type, levels([200, 0, 0, colour]), 1, 0)[0]
    expect(at(10).colours).toBeUndefined()
    expect(at(50).colours).toEqual([[1, 0, 0], [0, 1, 0]])
    expect(at(100).colours).toBe(RAINBOW)
  })
})

describe('ADJ Starburst', () => {
  it('comes from the manual: 12 channels, six colours, the ball turning both ways', () => {
    const type = ofl('american-dj/starburst')
    expect(lib.fixtures['american-dj/starburst'].name).toBe('Starburst')
    expect(type.channels).toHaveLength(12)
    expect(type.spec!.look).toBe('sphere')
    const head = type.heads!.find((h) => h.ch.red)!
    expect(head.ch.rotation).toBeTruthy()
    const spin = (v: number) => decodeHeads(type, levels([255, 0, 0, 0, 0, 0, 10, 255, v]), 1, 0).find((s) => s.intensity > 0)!.rotation
    expect(spin(0)).toBe(0)
    expect(spin(40)).toBeGreaterThan(0)
    expect(spin(143)).toBe(0)
    expect(spin(250)).toBeLessThan(0)
  })
})

describe('Fixtures facing out on the front of a truss', () => {
  it('a Double Helix on the front of the crossbar faces out, and stays that way', () => {
    const truss = addStructure('goalpost', { width: 16 * FT, height: 10 * FT }, { at: [0, 0, -3] })
    const helix = ofl('beamz/double-helix-mhl820')
    const [a] = addLibraryFixtures(helix, 1)
    expect(mountFixtures([a], truss, 'frontOut')).toBe(true)
    const f = () => state().fixtures.find((x) => x.id === a)!
    expect(f().faceOut).toBe(true)
    expect(f().mounting).toBe('floor')
    // In front of the truss, at the crossbar's height.
    expect(f().position[2]).toBeGreaterThan(-3)
    expect(f().position[1]).toBeGreaterThan(2.5)
    // Moved under the crossbar instead: it hangs, and doesn't face out any more.
    mountFixtures([a], truss, 'under')
    expect(f().faceOut).toBeUndefined()
    expect(f().mounting).toBe('hanging')
  })

  it('every truss offers a facing-out place; dropping a fixture nearby never picks it by itself', () => {
    for (const kind of ['totem', 'goalpost', 'trussBox', 'groundTruss'] as const) {
      const s: Structure = { id: 'x', kind, name: '', position: [0, 0, 0], rotation: 0, params: {} }
      expect(mountPoints(s).some((m) => m.out), kind).toBe(true)
    }
    const totem = addStructure('totem', { height: 6 * FT }, { at: [5, 0, 0] })
    const [b] = addLibraryFixtures(ofl('beamz/double-helix-mhl820'), 1)
    moveFixtures([b], [5, 1.2, 0.2])
    const f = state().fixtures.find((x) => x.id === b)!
    if (f.mount) expect(f.mount.structure === totem && f.faceOut).toBeFalsy()
  })
})

describe('Party objects and screens', () => {
  it('each new object has a size, a height and a preset in the list', () => {
    for (const kind of ['tv', 'balloonArch', 'photoBooth', 'neonSign'] as const) {
      const s: Structure = { id: kind, kind, name: '', position: [0, 0, 0], rotation: 0, params: {} }
      expect(footprint(s).every((v) => v > 0), kind).toBe(true)
      expect(heightOf(s), kind).toBeGreaterThan(0)
      expect(STRUCTURE_PRESETS.some((p) => p.kind === kind), kind).toBe(true)
    }
    expect(STRUCTURE_KINDS.danceFloor.category).toBe('Party')
    expect(STRUCTURE_KINDS.tv.fields.some((f) => f.kind === 'content')).toBe(true)
    expect(STRUCTURE_KINDS.screen.fields.some((f) => f.kind === 'content')).toBe(true)
    expect(STRUCTURE_KINDS.ledWall.fields.some((f) => f.kind === 'content')).toBe(true)
  })

  it('a TV stands on the floor, its screen at the height you set', () => {
    const tv = addStructure('tv', { size: 65, bottom: 3 * FT, content: 'text', text: 'Happy Birthday' }, { at: [9, 0, 6] })
    const s = state().structures!.find((x) => x.id === tv)!
    expect(s.position[1]).toBe(0)
    expect(heightOf(s)).toBeGreaterThan(3 * FT + 0.7)
    expect(s.params.text).toBe('Happy Birthday')
  })
})

describe('Hanging from the ceiling, and disco balls', () => {
  it('a fixture hung from the ceiling stays up there, wherever it is moved', async () => {
    const { hangFromCeiling, orientFixtures } = await import('../src/renderer/src/state/commands')
    const [a] = addLibraryFixtures(ofl('american-dj/starburst'), 1)
    const f0 = state().fixtures.find((x) => x.id === a)!
    moveFixtures([a], [12 - f0.position[0], 0, 8 - f0.position[2]])
    expect(hangFromCeiling([a])).toBe(true)
    const f = () => state().fixtures.find((x) => x.id === a)!
    expect(f().mounting).toBe('hanging')
    expect(f().mount).toBeUndefined()
    expect(f().position).toEqual([12, 7.5, 8])
    moveFixtures([a], [1, 0, 0])
    expect(f().position).toEqual([13, 7.5, 8])
    // Stood up again, it's on the floor.
    orientFixtures([a], 'floor')
    expect(f().onCeiling).toBeUndefined()
    expect(f().position[1]).toBe(0)
  })

  it('a disco ball hangs from the ceiling, under a truss bar, or sits on a totem', () => {
    const ceiling = addStructure('discoBall', { size: 20 }, { at: [10, 0, 8] })
    const truss = addStructure('goalpost', { width: 16 * FT, height: 10 * FT }, { at: [-10, 0, 8] })
    const under = addStructure('discoBall', { size: 16 }, { at: [-10, 0, 8] })
    const totem = addStructure('totem', { height: 6 * FT }, { at: [14, 0, -4] })
    const onTop = addStructure('discoBall', { size: 12, drop: 0.2 }, { at: [14, 0, -4] })
    const s = (id: string) => state().structures!.find((x) => x.id === id)!
    expect(s(ceiling).hang).toBe('ceiling')
    expect(s(ceiling).position[1]).toBe(7.5)
    expect(s(under).hang).toBe('truss')
    expect(s(under).position[1]).toBeCloseTo(10 * FT - 0.29, 2)
    expect(s(onTop).hang).toBeUndefined()
    expect(s(onTop).position[1]).toBeGreaterThan(6 * FT)
    void truss, void totem
  })
})

describe('Disco ball reflections', () => {
  it('a beam on the ball throws spots round the room, and they move as it turns', async () => {
    const THREE = await import('three')
    const { DiscoReflections } = await import('../src/renderer/src/three/discoBalls')
    const d = new DiscoReflections()
    const ball = new THREE.Group()
    ball.position.set(0, 6, 0)
    ball.updateMatrixWorld(true)
    const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.25), new THREE.MeshStandardMaterial())
    // A pin spot from the side and below, at 45°.
    const beam = { position: new THREE.Vector3(-4, 2, 0), direction: new THREE.Vector3(1, 1, 0).normalize(), right: new THREE.Vector3(0, 0, 1), tanHalf: Math.tan((3 * Math.PI) / 180), color: [1, 0.2, 0.2] as [number, number, number], goboCell: 0, goboTurn: 0, prismSpread: 0, prismTurn: 0 }
    const spots = () => {
      d.update([{ ball, radius: 0.25, mirror }], [beam], { ceiling: 7.5, wallZ: -6 }, 0.4)
      const m = d.group.children[0] as InstanceType<typeof THREE.InstancedMesh>
      const p = new THREE.Vector3()
      const list: number[] = []
      for (let i = 0; i < m.count; i++) {
        const mat = new THREE.Matrix4()
        m.getMatrixAt(i, mat)
        p.setFromMatrixPosition(mat)
        list.push(p.x, p.y, p.z)
      }
      return { count: m.count, list }
    }
    const before = spots()
    expect(before.count).toBeGreaterThan(30)
    ball.rotation.y = 0.3
    ball.updateMatrixWorld(true)
    const after = spots()
    expect(after.list.slice(0, 6)).not.toEqual(before.list.slice(0, 6))
    // Nothing hits it: no spots.
    beam.direction.set(-1, 0, 0)
    expect(spots().count).toBe(0)
  })
})

describe('1.6.2: Starburst from SoundSwitch, the ceiling, room lights', () => {
  it('a SoundSwitch Starburst: UV and the ball motor are recognised by name, the ball turns both ways', () => {
    const names = ['Red', 'Green', 'Blue', 'White', 'Yellow', 'UV', 'Strobe', 'Dimmer', 'Rotation']
    const f = {
      definitionId: 7, definition: 'Starburst', manufacturer: 'ADJ', universe: 0, address: 1, wheels: {},
      mode: { name: '12 Channel', channels: 12, heads: [], attributes: names.map((name, i) => ({ code: 900 + i, name, width: 1, coarse: i, fine: i })) }
    } as unknown as SoundSwitchFixture
    const type = fixtureTypeFromMode(f)
    expect(type.spec!.look).toBe('sphere')
    const head = type.heads![0]
    expect(head.ch.uv).toBeTruthy()
    expect(head.ch.amber).toBeTruthy()
    expect(head.ch.rotation).toBeTruthy()
    const at = (uv: number, turn: number) => decodeHeads(type, levels([0, 0, 0, 0, 0, uv, 10, 255, turn]), 1, 0)[0]
    const lit = at(255, 0)
    expect(lit.intensity).toBeGreaterThan(0.5)
    expect(lit.color[2]).toBeGreaterThan(0.9)
    expect(at(255, 40).rotation).toBeGreaterThan(0)
    expect(at(255, 250).rotation).toBeLessThan(0)
    expect(at(255, 143).rotation).toBe(0)
  })

  it('dragged onto the ceiling, and back down to the floor', async () => {
    const { hangFromCeiling, standOnFloor } = await import('../src/renderer/src/state/commands')
    const [a, b] = addLibraryFixtures(ofl('american-dj/starburst'), 2)
    const f = (id: string) => state().fixtures.find((x) => x.id === id)!
    const gap = f(b).position[0] - f(a).position[0]
    hangFromCeiling([a, b], { id: a, x: 2, z: 3 })
    expect(f(a).position).toEqual([2, 7.5, 3])
    expect(f(b).position[0] - f(a).position[0]).toBeCloseTo(gap)
    expect(f(b).onCeiling).toBe(true)
    standOnFloor([a, b], { id: a, x: -1, z: 1 })
    expect([f(a).position[0], f(a).position[2]]).toEqual([-1, 1])
    expect(f(a).position[1]).toBeLessThan(0.2)
    expect(f(a).onCeiling).toBeUndefined()
    expect(f(a).mounting).toBe('floor')
  })

  it('things hung from the ceiling stay at the ceiling (the room isn’t raised around them)', async () => {
    const { roomFit } = await import('../src/renderer/src/model/physics')
    const { hangFromCeiling } = await import('../src/renderer/src/state/commands')
    addStructure('discoBall', { size: 20 }, { at: [10, 0, 8] })
    addStructure('ceilingDrape', {}, { at: [0, 0, 8] })
    const [a] = addLibraryFixtures(ofl('american-dj/starburst'), 1)
    hangFromCeiling([a])
    expect(roomFit(state(), 7.5).ceiling).toBe(7.5)
  })

  it('chandeliers and pendant lights hang like a disco ball; room lights can be switched off', () => {
    const ch = addStructure('chandelier', { size: 48 }, { at: [12, 0, 10] })
    const pend = addStructure('pendantLights', { lightOn: false }, { at: [-12, 0, 10] })
    const s = (id: string) => state().structures!.find((x) => x.id === id)!
    expect(s(ch).hang).toBe('ceiling')
    expect(s(pend).hang).toBe('ceiling')
    expect(s(pend).params.lightOn).toBe(false)
    for (const kind of ['chandelier', 'pendantLights', 'ceilingDrape', 'wallSconce', 'photoBackdrop'] as const) {
      expect(STRUCTURE_KINDS[kind].fields.some((f) => f.key === 'lightOn'), kind).toBe(true)
      expect(STRUCTURE_PRESETS.some((p) => p.kind === kind), kind).toBe(true)
    }
    expect(STRUCTURE_KINDS.danceFloor.fields.find((f) => f.key === 'pattern')!.options!.some(([name]) => name === 'Sparkle')).toBe(true)
  })
})

describe('Cameo Hydrabeam speed', () => {
  it('its head speed goes slow to fast: at 255 the heads move at full speed', () => {
    // From SoundSwitch: four heads, a master "Head Speed" channel.
    const attrs = [
      { code: 1, name: 'Dimmer', width: 1, coarse: 0, fine: 0 },
      { code: 900, name: 'Head Speed', width: 1, coarse: 1, fine: 1 },
      ...[0, 1, 2, 3].flatMap((k) => [{ code: 3, name: `Pan ${k + 1}`, width: 1, coarse: 2 + k * 2, fine: 2 + k * 2 }, { code: 4, name: `Tilt ${k + 1}`, width: 1, coarse: 3 + k * 2, fine: 3 + k * 2 }])
    ]
    const f = {
      definitionId: 8, definition: 'Hydrabeam 400 RGBW', manufacturer: 'Cameo', universe: 0, address: 1, wheels: {},
      mode: { name: '10 Channel', channels: 10, attributes: attrs, heads: [{ name: 'Master', attributes: [0, 1] }, ...[0, 1, 2, 3].map((k) => ({ name: `Head ${k + 1}`, attributes: [2 + k * 2, 3 + k * 2] }))] }
    } as unknown as SoundSwitchFixture
    const type = fixtureTypeFromMode(f)
    const heads = decodeHeads(type, levels([255, 255, 128, 128]), 1, 0)
    const moving = type.heads!.map((h, i) => (h.ch.pan ? heads[i] : null)).filter(Boolean)
    expect(moving).toHaveLength(4)
    expect(moving.every((s) => s!.moveSpeed > 0.95)).toBe(true)
    expect(decodeHeads(type, levels([255, 0, 128, 128]), 1, 0).find((_, i) => type.heads![i].ch.pan)!.moveSpeed).toBeLessThan(0.1)
  })

  it('the Library Hydrabeam too, in every mode with a speed channel', () => {
    const fx = lib.fixtures['cameo/hydrabeam-400-rgbw']
    fx.modes.forEach((m, i) => {
      const type = ofl('cameo/hydrabeam-400-rgbw', i)
      const speed = type.heads!.find((h) => h.ch.moveSpeed)
      if (!speed) return
      const u = new Uint8Array(512).fill(255)
      const states = decodeHeads(type, u, 1, 0)
      const movers = type.heads!.map((h, k) => (h.ch.pan ? states[k] : null)).filter(Boolean)
      expect(movers.every((s) => s!.moveSpeed > 0.95), m.name).toBe(true)
    })
  })
})
