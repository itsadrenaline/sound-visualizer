/**
 * The digital twin: the fixture being edited, alone in a small test room with a
 * floor, a wall to catch the beam and adjustable haze. It's drawn by the same
 * FixtureRig and DMX decoder as the show, so what you see here is what you'll
 * see on stage. It's driven by the channel sliders, a running test, or live
 * Art-Net from SoundSwitch.
 */
import { hasOwnStand } from '../../model/catalog'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FixtureRig } from '../../three/fixtureRig'
import { createRoomMaterial, getRoomAmbient, setProjectors, setRoomAmbient } from '../../three/roomMaterial'
import { projectors } from '../../three/projectors'
import { decodeHeads, type HeadState } from '../../model/heads'
import { typeFromDef } from '../../model/fixtureDef'
import { sceneAt, scenesFor } from '../../model/fixtureTests'
import type { Fixture } from '../../model/project'
import { dmxBus } from '../../state/dmxBus'
import { useStudio } from '../../state/studio'

/** What the twin is showing right now, for the schematic and the test panel (updated every frame). */
export const twinNow: { heads: HeadState[]; levels: Uint8Array; step: { index: number; text: string } | null } = { heads: [], levels: new Uint8Array(0), step: null }

type View = 'front' | 'beam' | 'close' | 'below'

export function TwinView() {
  const host = useRef<HTMLDivElement>(null)
  const def = useStudio((s) => s.def)
  const modeIndex = useStudio((s) => s.modeIndex)
  const [haze, setHaze] = useState(0.45)
  const [view, setView] = useState<View>('front')
  const type = useMemo(() => (def ? typeFromDef(def, modeIndex) : null), [def, modeIndex])
  const [room, setRoom] = useState(0.45)
  const api = useRef<{ setType(t: ReturnType<typeof typeFromDef>): void; setView(v: View): void; haze: number; setRoom(k: number): void } | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    // The test room's own light (the show's room light comes back when the Studio closes).
    const showAmbient = getRoomAmbient()
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0b0e)
    const fog = new THREE.FogExp2(0x0a0b0e, 0.02)
    scene.fog = fog
    const hemi = new THREE.HemisphereLight(0xc8d2e0, 0x2a2a30, 2.5)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 2)
    key.position.set(3, 5, 6)
    scene.add(key)
    const setRoomLight = (k: number) => {
      hemi.intensity = 0.6 + k * 8
      key.intensity = k * 5
      setRoomAmbient(new THREE.Color(0.55, 0.58, 0.65).multiplyScalar(0.15 + k * k * 7))
      const bg = new THREE.Color(0x07080a).lerp(new THREE.Color(0x3a404b), k)
      scene.background = bg
      fog.color.copy(bg)
    }

    // The test room: floor, a wall in front of the fixture to catch the beam, a back wall.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), createRoomMaterial(0x3a3d44))
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), createRoomMaterial(0x6a6e78))
    wall.position.set(0, 3.5, 7)
    wall.rotation.y = Math.PI
    scene.add(wall)
    const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), createRoomMaterial(0x24262b))
    back.position.set(0, 3.5, -3)
    scene.add(back)
    const grid = new THREE.GridHelper(20, 20, 0x3a3f48, 0x2a2e35)
    grid.position.y = 0.002
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.4
    scene.add(grid)
    // A truss for hanging fixtures, a stand for the rest.
    const metal = new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.6, roughness: 0.4 })
    const truss = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.12), metal)
    truss.position.set(0, 3.32, 0)
    scene.add(truss)
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 10), metal)
    scene.add(stand)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    let rig: FixtureRig | null = null
    let fixture: Fixture | null = null
    let center = new THREE.Vector3(0, 1.4, 0)
    const placeFor = (t: ReturnType<typeof typeFromDef>): Fixture => {
      const look = t.spec?.look ?? 'par'
      const size = t.spec?.size ?? [0.3, 0.3, 0.3]
      const moving = look === 'mover' || look === 'moverWash'
      const tube = look === 'tube'
      const gig = look === 'gigbar'
      const string = look === 'string'
      const faceUp = ['par', 'uplight', 'flood', 'spider', 'cluster', 'panel', 'laser', 'derby', 'strobe'].includes(look)
      const hanging = moving || string
      const y = hanging ? 3.25 : tube ? 0 : gig ? 2.2 : 1.3
      truss.visible = hanging
      // String lights hang along the truss: make it long enough for them.
      truss.scale.x = string ? Math.max(1, (size[0] + 0.4) / 3) : 1
      // The test room's stand holds it up, unless it brings its own (a GigBar with its stand).
      stand.visible = !hanging && !tube && !(gig && hasOwnStand(t.spec))
      stand.scale.y = y
      stand.position.set(0, y / 2, 0)
      center = new THREE.Vector3(0, string ? y - size[1] * 0.5 : moving ? y - size[1] / 2 : tube ? size[1] / 2 : y + (faceUp ? size[2] / 2 : size[1] / 2), 0)
      return {
        id: 'studio-twin', name: 'Twin', typeId: t.id, universe: 0, address: 1, position: [0, y, 0],
        mounting: hanging ? 'hanging' : 'floor',
        // Box and cell fixtures face the wall in front, with their face towards the camera.
        aimTilt: faceUp ? -78 : 0,
        rotation: 0
      }
    }
    let span = 0.5
    let hangs = false
    const frame = (v: View, instant = false) => {
      const c = center
      // Far enough back that the whole fixture fits, whatever its size.
      const d = Math.max(0.9, span * 2.1 + 0.5)
      const pos =
        v === 'front' ? new THREE.Vector3(c.x + d * 0.5, c.y + d * 0.22, c.z + d)
        : v === 'beam' ? (hangs ? new THREE.Vector3(c.x + 3.2, 2.4, c.z + 3.8) : new THREE.Vector3(c.x + 4.2, c.y + 1.6, c.z + 2.4))
        : v === 'close' ? new THREE.Vector3(c.x + d * 0.12, c.y + d * 0.08, c.z + d * 0.42)
        : new THREE.Vector3(c.x + d * 0.25, 0.4, c.z + d)
      // A hanging head shines down onto the floor; everything else at the wall in front.
      const target = v === 'beam' ? (hangs ? new THREE.Vector3(c.x, 0.6, c.z + 0.8) : new THREE.Vector3(c.x, Math.max(1, c.y), c.z + 4.5)) : c.clone()
      if (instant) {
        camera.position.copy(pos)
        controls.target.copy(target)
      } else flight = { from: camera.position.clone(), to: pos, fromT: controls.target.clone(), toT: target, t: 0 }
    }
    let flight: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } | null = null

    const local = { haze: 0.45, room: 0.45 }
    setRoomLight(local.room)
    api.current = {
      setType(t) {
        const firstTime = !rig
        if (rig) {
          scene.remove(rig.root)
          rig.dispose()
        }
        fixture = placeFor(t)
        rig = new FixtureRig(fixture, t)
        scene.add(rig.root)
        const newSpan = Math.max(...(t.spec?.size ?? [0.4, 0.4, 0.4]))
        const resized = Math.abs(newSpan - span) > 0.05
        span = newSpan
        hangs = fixture.mounting === 'hanging'
        if (firstTime) frame('front', true)
        else if (resized) frame('front')
      },
      setView(v) {
        frame(v)
      },
      get haze() {
        return local.haze
      },
      set haze(h: number) {
        local.haze = h
      },
      setRoom(k: number) {
        local.room = k
        setRoomLight(k)
      }
    }

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = `${w}px`
      renderer.domElement.style.height = `${h}px`
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    resize()

    // For debugging from the console.
    ;(window as unknown as { __twin?: unknown }).__twin = { scene, camera, get rig() { return rig }, controls }
    const timer = new THREE.Timer()
    let id = 0
    let cachedScenes: { key: unknown; scenes: ReturnType<typeof scenesFor> } = { key: null, scenes: [] }
    const tick = (now?: number) => {
      id = requestAnimationFrame(tick)
      timer.update(now)
      const dt = Math.min(0.1, timer.getDelta())
      const time = timer.getElapsed()
      const st = useStudio.getState()
      const d = st.def
      if (!rig || !fixture || !d) return renderer.render(scene, camera)
      const t = typeFromDefCached(d, st.modeIndex)
      const n = d.modes[st.modeIndex]?.channels.length ?? 0
      let levels = new Uint8Array(Math.max(1, n))
      let step: typeof twinNow.step = null
      if (st.driving.scene) {
        if (cachedScenes.key !== d || (cachedScenes as { mode?: number }).mode !== st.modeIndex) cachedScenes = Object.assign({ key: d, scenes: scenesFor(d, st.modeIndex) }, { mode: st.modeIndex })
        const sc = cachedScenes.scenes.find((s) => s.id === st.driving.scene!.id)
        if (sc) {
          const at = sceneAt(sc, performance.now() / 1000 - st.driving.scene.startedAt)
          levels.set(at.levels.subarray(0, levels.length))
          step = { index: at.index, text: at.step.text }
        }
      } else if (st.driving.follow) {
        const u = dmxBus.levels(st.driving.follow.universe)
        levels.set(u.subarray(st.driving.follow.address - 1, st.driving.follow.address - 1 + levels.length))
      } else {
        levels = Uint8Array.from(st.levels.length === n ? st.levels : new Array(n).fill(0))
      }
      if (st.preview && st.preview.channel < levels.length) levels[st.preview.channel] = st.preview.value
      // Pad, so the decoder can read every channel of the mode from address 1.
      const universe = new Uint8Array(512)
      universe.set(levels.subarray(0, 512))
      const heads = decodeHeads(t, universe, 1, time)
      twinNow.heads = heads
      twinNow.levels = levels
      twinNow.step = step
      projectors.begin()
      rig.update(heads, dt, local.haze, time)
      setProjectors(projectors.brightest(), time)
      fog.density = 0.006 + local.haze * 0.03
      if (flight) {
        flight.t = Math.min(1, flight.t + dt / 0.45)
        const k = 1 - Math.pow(1 - flight.t, 3)
        camera.position.lerpVectors(flight.from, flight.to, k)
        controls.target.lerpVectors(flight.fromT, flight.toT, k)
        if (flight.t >= 1) flight = null
      }
      controls.update()
      renderer.render(scene, camera)
    }
    tick()
    return () => {
      cancelAnimationFrame(id)
      observer.disconnect()
      if (rig) rig.dispose()
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      setRoomAmbient(showAmbient)
      api.current = null
    }
  }, [])

  useEffect(() => {
    if (type) api.current?.setType(type)
  }, [type])

  useEffect(() => {
    if (api.current) api.current.haze = haze
  }, [haze])

  useEffect(() => {
    api.current?.setRoom(room)
  }, [room])

  const views: Array<[View, string, string]> = [
    ['front', 'Front', 'Look at the fixture from the front'],
    ['beam', 'Beam', 'See where the beam lands on the wall'],
    ['close', 'Close-up', 'Close to the face: the cells and lenses'],
    ['below', 'Low', 'From low down, like the audience']
  ]
  return (
    <div className="twin" data-tour="studio-twin">
      <div className="twin-canvas" ref={host} />
      <div className="twin-tools">
        {views.map(([v, label, title]) => (
          <button key={v} className={`mini ${view === v ? 'active' : ''}`} title={title} onClick={() => (setView(v), api.current?.setView(v))}>
            {label}
          </button>
        ))}
        <label className="twin-haze" title="More haze makes the beam show in the air">
          Haze
          <input type="range" min={0} max={1} step={0.05} value={haze} onChange={(e) => setHaze(Number(e.target.value))} />
        </label>
        <label className="twin-haze" title="Light the test room up to see the fixture's body, or darken it to see the light better">
          Room
          <input type="range" min={0} max={1} step={0.05} value={room} onChange={(e) => setRoom(Number(e.target.value))} />
        </label>
      </div>
      <DrivingBadge />
    </div>
  )
}

const typeCache = new WeakMap<object, Map<number, ReturnType<typeof typeFromDef>>>()
function typeFromDefCached(def: Parameters<typeof typeFromDef>[0], mode: number) {
  let m = typeCache.get(def)
  if (!m) typeCache.set(def, (m = new Map()))
  let t = m.get(mode)
  if (!t) m.set(mode, (t = typeFromDef(def, mode)))
  return t
}

function DrivingBadge() {
  const driving = useStudio((s) => s.driving)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!driving.scene) return
    const t = setInterval(() => tick((n) => n + 1), 200)
    return () => clearInterval(t)
  }, [driving.scene])
  if (driving.follow) return <div className="twin-badge live">Live from SoundSwitch: {driving.follow.name}</div>
  if (driving.scene && twinNow.step) return <div className="twin-badge">{twinNow.step.text}</div>
  return null
}
