/**
 * The 3D view. React only creates the canvas; three.js does the rest in its
 * own animation loop, reading the project and live DMX directly. React
 * re-rendering 60 times a second would be far too slow.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { addLibraryFixtures, addStructure, mountFixtures, moveFixtures, moveSelection } from '../state/commands'
import { registerView, type NudgeKind, type ViewPreset } from '../state/viewBus'
import { useLibrary } from '../state/library'
import { DRAG_TYPE, type DragPayload } from '../ui/LibraryPanel'
import { STRUCTURE_DRAG, type StructureDrag } from '../ui/ObjectsPanel'
import { StructureEditor, StructureHud, StructureMenu, useStructureEditor } from '../ui/StructureActions'
import { ShowBuilder } from '../ui/ShowBuilder'
import { roomFit, type RoomFit } from '../model/physics'
import { mountPoints, nearestOn, pointAt, STRUCTURE_KINDS, toWorld, type MountPoint, type Structure } from '../model/structures'
import { movingRoots, withRiders } from '../model/arrange'
import { boundsOf, EMPTY_BOUNDS, fitCamera } from '../model/cameraFit'
import { StructureRig, mountGuides } from './structures'
import { ViewToolbar } from '../ui/ViewToolbar'
import { NavPad } from '../ui/NavPad'
import { Notices } from '../ui/Notices'
import { useStore } from '../state/store'
import { useViewSettings } from '../state/viewSettings'
import { dmxBus } from '../state/dmxBus'
import { runDemo } from '../state/demo'
import { decodeHeads } from '../model/heads'
import { useMix } from '../state/mix'
import { getFixtureType } from '../model/fixtureTypes'
import type { Project } from '../model/project'
import { applyAmbient, buildStage, type Stage } from './stage'
import { projectors } from './projectors'
import { setProjectors } from './roomMaterial'
import { roomOf, type RoomSettings } from '../model/project'
import { useFixtureMenu } from '../state/fixtureMenu'
import { FixtureHud, FixtureMenu } from '../ui/FixtureActions'
import { FixtureRig } from './fixtureRig'
import { useStudio } from '../state/studio'

export function Viewport() {
  const host = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0c0f)
    const fog = new THREE.FogExp2(0x0b0c0f, 0.025)

    // --- The room: rebuilt when its settings change (ceiling, height, ambient light) ---
    let stage: Stage | null = null
    let builtRoom: RoomSettings | null = null
    let builtFit: RoomFit | null = null
    const syncRoom = (room: RoomSettings, fit: RoomFit) => {
      const same =
        builtRoom && builtFit && builtRoom.ceiling === room.ceiling && builtFit.ceiling === fit.ceiling &&
        builtFit.wallZ === fit.wallZ && builtFit.halfWidth === fit.halfWidth && builtFit.front === fit.front
      if (!same) {
        if (stage) {
          scene.remove(stage.group)
          stage.group.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.geometry.dispose()
              ;(o.material as THREE.Material).dispose()
            }
          })
        }
        stage = buildStage(room, fit)
        scene.add(stage.group)
      }
      if (room !== builtRoom || !same) applyAmbient(room, stage!, scene, fog)
      builtRoom = room
      builtFit = fit
    }
    // The room grows to hold the set: the back wall moves back, the ceiling goes up.
    const fitRoom = (project: Project) => {
      const room = roomOf(project)
      syncRoom(room, roomFit(project, room.ceilingHeight))
    }
    fitRoom(useStore.getState().project)
    const unsubscribeRoom = useStore.subscribe((s, prev) => {
      if (s.project !== prev.project) fitRoom(s.project)
    })

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
    camera.position.set(0, 4.5, 15)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 2.5, -1)
    controls.enableDamping = true
    // For screenshots and debugging: window.__lookAt(x, y, z, targetX, targetY, targetZ)
    ;(window as unknown as { __lookAt?: (...v: number[]) => void }).__lookAt = (x, y, z, tx, ty, tz) => {
      camera.position.set(x, y, z)
      controls.target.set(tx, ty, tz)
    }
    // You can look up at the ceiling; the camera just never goes below the floor (see the frame loop).
    controls.maxPolarAngle = Math.PI * 0.94

    // --- Camera moves: presets, framing, stored positions (eased, not jumped) ---
    let flight: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } | null = null
    const flyTo = (position: THREE.Vector3, target: THREE.Vector3) => {
      // Drop any leftover orbit momentum, or the camera keeps drifting after it lands.
      controls.enableDamping = false
      controls.update()
      controls.enableDamping = true
      flight = { from: camera.position.clone(), to: position, fromT: controls.target.clone(), toT: target, t: 0 }
    }
    /**
     * Each view looks from a direction (from the show towards the camera) and is
     * framed to fit the show: everything in it is in view, nothing more.
     */
    const DIRECTIONS: Record<Exclude<ViewPreset, 'up'>, [number, number, number]> = {
      perspective: [0.3, 0.42, 1],
      top: [0, 1, 0.035],
      front: [0, 0.12, 1],
      left: [-1, 0.18, 0.04],
      right: [1, 0.18, 0.04]
    }
    const showBounds = (ids: string[] | 'all' = 'all') => boundsOf(useStore.getState().project, ids)
    const fitView = (v: ViewPreset, ids: string[] | 'all' = 'all', instant = false) => {
      const b = showBounds(ids) ?? EMPTY_BOUNDS
      let position: THREE.Vector3
      let target: THREE.Vector3
      if (v === 'up') {
        // Standing in the audience, looking up: where the gobos land on the ceiling.
        const cx = (b.min[0] + b.max[0]) / 2
        const cz = (b.min[2] + b.max[2]) / 2
        position = new THREE.Vector3(cx, 1.4, b.max[2] + 4)
        target = new THREE.Vector3(cx, Math.max(4, b.max[1] + 1.5), cz)
      } else {
        const fit = fitCamera(b, DIRECTIONS[v], camera.fov, camera.aspect)
        position = new THREE.Vector3(...fit.position)
        target = new THREE.Vector3(...fit.target)
      }
      if (!instant) return flyTo(position, target)
      camera.position.copy(position)
      controls.target.copy(target)
      controls.update()
    }
    /** Frame these things (or everything) from where the camera is looking now. */
    const frameIds = (ids: string[] | 'all') => {
      const b = showBounds(ids)
      if (!b) return
      const direction = camera.position.clone().sub(controls.target).normalize()
      const fit = fitCamera(b, [direction.x, direction.y, direction.z], camera.fov, camera.aspect, 0.8)
      flyTo(new THREE.Vector3(...fit.position), new THREE.Vector3(...fit.target))
    }

    /**
     * Small camera moves, for the on-screen buttons and the keyboard, so the view
     * works without a scroll wheel or a right mouse button. `amount` is in steps
     * (a button held down sends a fraction of a step every frame).
     */
    const nudge = (kind: NudgeKind, x: number, y: number) => {
      flight = null
      const offset = camera.position.clone().sub(controls.target)
      const distance = offset.length()
      if (kind === 'zoom') {
        const next = Math.min(120, Math.max(0.6, distance * Math.pow(0.9, y)))
        camera.position.copy(controls.target).add(offset.setLength(next))
      } else if (kind === 'orbit') {
        const sph = new THREE.Spherical().setFromVector3(offset)
        sph.theta -= x * 0.07
        sph.phi = Math.min(controls.maxPolarAngle, Math.max(0.05, sph.phi - y * 0.05))
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph))
      } else {
        // Pan: sideways along the screen; 'lift': straight up and down in the room.
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
        const step = Math.max(0.05, distance * 0.04)
        const move = new THREE.Vector3()
        if (kind === 'pan') {
          const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).setY(0).normalize().negate()
          move.addScaledVector(right, x * step).addScaledVector(forward, y * step)
        } else move.set(0, y * step, 0).addScaledVector(right, x * step)
        if (controls.target.y + move.y < 0) move.y = -controls.target.y
        camera.position.add(move)
        controls.target.add(move)
      }
      controls.update()
    }

    // Keys held down move the camera smoothly (see the frame loop).
    const held = new Set<string>()

    // --- Keep one FixtureRig per fixture in the project ---
    const rigs = new Map<string, FixtureRig>()
    const sync = (project: Project, selection: string[]) => {
      const seen = new Set<string>()
      for (const fixture of project.fixtures) {
        seen.add(fixture.id)
        let rig = rigs.get(fixture.id)
        // Rebuild if the kind of fixture changed; otherwise just move it.
        if (rig && (rig.typeId !== fixture.typeId || rig.mounting !== fixture.mounting || rig.typeVersion !== getFixtureType(fixture.typeId))) {
          scene.remove(rig.root)
          rig.dispose()
          rig = undefined
        }
        if (!rig) {
          rig = new FixtureRig(fixture, getFixtureType(fixture.typeId))
          rigs.set(fixture.id, rig)
          scene.add(rig.root)
        }
        rig.place(fixture)
        rig.setSelected(selection.includes(fixture.id))
      }
      for (const [id, rig] of rigs) {
        if (seen.has(id)) continue
        scene.remove(rig.root)
        rig.dispose()
        rigs.delete(id)
      }
    }
    // --- And one StructureRig per object ---
    const sets = new Map<string, StructureRig>()
    const syncSets = (project: Project, selection: string[]) => {
      const seen = new Set<string>()
      for (const st of project.structures ?? []) {
        seen.add(st.id)
        let rig = sets.get(st.id)
        if (!rig) {
          rig = new StructureRig(st)
          sets.set(st.id, rig)
          scene.add(rig.root)
        } else rig.update(st)
        rig.setSelected(selection.includes(st.id))
      }
      for (const [id, rig] of sets) {
        if (seen.has(id)) continue
        scene.remove(rig.root)
        rig.dispose()
        sets.delete(id)
      }
    }
    sync(useStore.getState().project, useStore.getState().selection)
    syncSets(useStore.getState().project, useStore.getState().selection)
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.project !== prev.project || s.selection !== prev.selection) {
        sync(s.project, s.selection)
        syncSets(s.project, s.selection)
      }
    })

    // --- Drag the selection around with a move gizmo (Capture's Move tool) ---
    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.setTranslationSnap(0.05)
    gizmo.setSize(0.75)
    const pivot = new THREE.Object3D()
    scene.add(pivot)
    scene.add(gizmo.getHelper())
    let dragStart: THREE.Vector3 | null = null
    const placePivot = () => {
      const { project, selection } = useStore.getState()
      const chosen = [...project.fixtures, ...(project.structures ?? [])].filter((f) => selection.includes(f.id))
      if (!chosen.length || useViewSettings.getState().tool !== 'move') return gizmo.detach()
      const c = chosen.reduce((a, f) => a.add(new THREE.Vector3(...f.position)), new THREE.Vector3()).divideScalar(chosen.length)
      pivot.position.copy(c)
      gizmo.attach(pivot)
    }
    placePivot()
    const unsubscribeGizmo = useStore.subscribe((s, prev) => {
      if ((s.selection !== prev.selection || s.project !== prev.project) && !dragStart) placePivot()
    })
    gizmo.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value
      if (event.value) {
        dragStart = pivot.position.clone()
      } else if (dragStart) {
        const d = pivot.position.clone().sub(dragStart)
        dragStart = null
        moveSelection(useStore.getState().selection, [d.x, d.y, d.z])
      }
    })
    gizmo.addEventListener('objectChange', () => {
      // Live preview while dragging; the move becomes one undo step when you let go.
      if (!dragStart) return
      const d = pivot.position.clone().sub(dragStart)
      previewMove(useStore.getState().selection, d, true)
    })

    /** Show a move before it's made: the selection, and whatever is attached to it or standing on it. */
    const previewMove = (ids: string[], d: THREE.Vector3, vertical: boolean) => {
      const { project } = useStore.getState()
      const roots = movingRoots(project, ids)
      const moved = withRiders(project, roots)
      for (const st of project.structures ?? []) {
        if (moved.structures.has(st.id)) sets.get(st.id)?.root.position.set(st.position[0] + d.x, st.position[1], st.position[2] + d.z)
      }
      for (const f of project.fixtures) {
        const onMoved = !!f.mount && moved.structures.has(f.mount.structure)
        if (!moved.fixtures.has(f.id) && !onMoved) continue
        const dy = vertical && roots.fixtures.has(f.id) ? d.y : 0
        rigs.get(f.id)?.root.position.set(f.position[0] + d.x, Math.max(0, f.position[1] + dy), f.position[2] + d.z)
      }
    }

    // --- Drop fixtures from the library onto the floor ---
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const floorPoint = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const rect = renderer.domElement.getBoundingClientRect()
      const p = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      const ray = new THREE.Raycaster()
      ray.setFromCamera(p, camera)
      return ray.ray.intersectPlane(floor, new THREE.Vector3())
    }
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(DRAG_TYPE) && !e.dataTransfer?.types.includes(STRUCTURE_DRAG)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      const piece = e.dataTransfer?.getData(STRUCTURE_DRAG)
      if (piece) {
        e.preventDefault()
        const drag = JSON.parse(piece) as StructureDrag
        const at = floorPoint(e.clientX, e.clientY) ?? new THREE.Vector3(0, 0, 2)
        const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v))
        addStructure(drag.kind, drag.params, { at: [clamp(at.x, 30), 0, clamp(at.z, 25)] })
        return
      }
      const raw = e.dataTransfer?.getData(DRAG_TYPE)
      if (!raw) return
      e.preventDefault()
      const payload = JSON.parse(raw) as DragPayload
      const type = 'rig' in payload ? getFixtureType(payload.rig) : useLibrary.getState().typeFor(payload.library, payload.mode)
      if (!type || type.id === 'unknown') return
      // Dropped onto a totem, stand, truss or booth: attached to it.
      const snap = snapAt(e.clientX, e.clientY, 40)
      if (snap) {
        addLibraryFixtures(type, 1, { at: snap.position, mount: { structure: snap.structure.id, point: snap.point.id, t: snap.t } })
        return
      }
      const at = floorPoint(e.clientX, e.clientY) ?? new THREE.Vector3(0, 0, 0)
      const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v))
      addLibraryFixtures(type, 1, { at: [clamp(at.x, 30), 0.1, clamp(at.z, 25)] })
    }
    container.addEventListener('dragover', onDragOver)
    container.addEventListener('drop', onDrop)

    // --- Mouse tools -------------------------------------------------------------
    // Select and Move tools: click a fixture or object to select it, Shift-click
    // to add or remove, drag on empty space to box-select (objects count when
    // they're wholly inside). Drag anything selected to slide it across the floor,
    // with what's on it; a fixture on a stand brings the stand (Option/Alt-drag
    // lifts it off). Move also shows arrows for exact moves and going up and down.
    // Holding Space (or the Orbit tool) turns the mouse into the camera:
    // drag to orbit, Shift+drag to pan, Alt/Option+drag to zoom. The wheel always zooms.
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const nav = { space: false, shift: false, alt: false }
    const tool = () => useViewSettings.getState().tool
    const navigating = () => nav.space || tool() === 'orbit'
    let gesture: {
      kind: 'none' | 'click' | 'box' | 'body' | 'set'
      x: number
      y: number
      id?: string
      plane?: THREE.Plane
      from?: THREE.Vector3
      delta?: THREE.Vector3
      snap?: Snap | null
      moved: boolean
    } = { kind: 'none', x: 0, y: 0, moved: false }
    const applyNav = () => {
      const look = navigating()
      controls.mouseButtons.LEFT = look ? (nav.shift ? THREE.MOUSE.PAN : nav.alt ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE) : null
      controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN
      controls.mouseButtons.RIGHT = null
      renderer.domElement.style.cursor = look ? 'grab' : gesture.kind === 'body' || gesture.kind === 'set' ? 'grabbing' : ''
    }
    applyNav()

    const toNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect()
      return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    }
    const screenOf = (v: THREE.Vector3) => {
      const p = v.clone().project(camera)
      return { x: ((p.x + 1) / 2) * container.clientWidth, y: ((1 - p.y) / 2) * container.clientHeight, front: p.z < 1 }
    }
    /** The fixture under the pointer: what the ray hits, or failing that, the nearest one within a few pixels. */
    const pick = (clientX: number, clientY: number): string | undefined => {
      pointer.copy(toNdc(clientX, clientY))
      raycaster.setFromCamera(pointer, camera)
      const visible = [...rigs.values()].filter((r) => r.root.visible)
      const hit = raycaster.intersectObjects(visible.map((r) => r.root), true).find((h) => h.object.userData.fixtureId)
      if (hit) return hit.object.userData.fixtureId as string
      const rect = renderer.domElement.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      let best: string | undefined
      // Over an object, only a fixture right under the pointer counts: the click is for the piece.
      let bestD = pickStructure(clientX, clientY) ? 9 : 26
      for (const r of visible) {
        const s = screenOf(r.center())
        const d = Math.hypot(s.x - x, s.y - y)
        if (s.front && d < bestD) [best, bestD] = [r.fixtureId, d]
      }
      return best
    }
    const clickSelect = (id: string | undefined, add: boolean) => {
      const { selection, select } = useStore.getState()
      if (!id) select(add ? selection : [])
      else if (add) select(selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id])
      else select([id])
    }

    /** The object under the pointer, if any. */
    const pickStructure = (clientX: number, clientY: number): string | undefined => {
      raycaster.setFromCamera(toNdc(clientX, clientY), camera)
      const hit = raycaster.intersectObjects([...sets.values()].map((r) => r.root), true).find((h) => h.object.userData.structureId)
      return hit?.object.userData.structureId as string | undefined
    }

    /**
     * The mount point nearest the pointer on screen, within `radius` pixels:
     * a totem's top plate, a stretch of truss, a leg, a booth facade.
     */
    type Snap = { structure: Structure; point: MountPoint; t: number; position: [number, number, number] }
    const snapAt = (clientX: number, clientY: number, radius: number, kinds?: MountPoint['kind'][]): Snap | null => {
      const rect = renderer.domElement.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      let best: Snap | null = null
      let bestD = radius
      for (const st of useStore.getState().project.structures ?? []) {
        for (const m of mountPoints(st)) {
          if (kinds && !kinds.includes(m.kind)) continue
          // Along a bar: check points along it, then refine with the closest.
          const samples = m.to ? 40 : 0
          for (let i = 0; i <= samples; i++) {
            const t = samples ? i / samples : 0
            const w = toWorld(st, pointAt(m, t))
            const sp = screenOf(new THREE.Vector3(...w))
            const d = Math.hypot(sp.x - x, sp.y - y)
            if (sp.front && d < bestD) {
              bestD = d
              best = { structure: st, point: m, t, position: w }
            }
          }
        }
      }
      if (best?.point.to) {
        // Refine t: project the pointer ray's closest point onto the bar.
        raycaster.setFromCamera(toNdc(clientX, clientY), camera)
        const a = new THREE.Vector3(...toWorld(best.structure, best.point.at))
        const b = new THREE.Vector3(...toWorld(best.structure, best.point.to))
        const onBar = new THREE.Vector3()
        raycaster.ray.distanceSqToSegment(a, b, undefined, onBar)
        const local = toLocalVec(best.structure, onBar)
        const { t } = nearestOn(best.point, local)
        best = { ...best, t, position: toWorld(best.structure, pointAt(best.point, t)) }
      }
      return best
    }
    const toLocalVec = (st: Structure, w: THREE.Vector3): [number, number, number] => {
      const a = (st.rotation * Math.PI) / 180
      const dx = w.x - st.position[0]
      const dz = w.z - st.position[2]
      return [dx * Math.cos(a) - dz * Math.sin(a), w.y - st.position[1], dx * Math.sin(a) + dz * Math.cos(a)]
    }

    // While dragging a fixture: faint guides on every mount point, and a ring where it would attach.
    let guides: THREE.Group | null = null
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 32), new THREE.MeshBasicMaterial({ color: 0x4da3ff, depthTest: false, transparent: true, opacity: 0.95 }))
    ring.renderOrder = 21
    ring.visible = false
    ring.raycast = () => {}
    scene.add(ring)
    const showGuides = (on: boolean) => {
      if (guides) {
        scene.remove(guides)
        guides.traverse((o) => {
          if (o instanceof THREE.LineSegments || o instanceof THREE.Points) {
            o.geometry.dispose()
            ;(o.material as THREE.Material).dispose()
          }
        })
        guides = null
      }
      if (on) {
        guides = mountGuides(useStore.getState().project.structures ?? [])
        scene.add(guides)
      }
      if (!on) ring.visible = false
    }
    const showRing = (snap: Snap | null) => {
      ring.visible = !!snap
      if (!snap) return
      ring.position.set(...snap.position)
      // Flat for a top plate or under a bar, upright facing out for a clamp or facade.
      const flat = snap.point.kind === 'top' || snap.point.kind === 'under'
      ring.rotation.set(flat ? Math.PI / 2 : 0, flat ? 0 : (snap.structure.rotation * Math.PI) / 180, 0)
    }

    // For tests: where a fixture is on screen.
    ;(window as unknown as { __screenOf?: (id: string) => unknown }).__screenOf = (id) => {
      const rect = renderer.domElement.getBoundingClientRect()
      const r = rigs.get(id)
      if (r) {
        const s = screenOf(r.center())
        return { x: s.x + rect.left, y: s.y + rect.top }
      }
      // An object, or one of its mount points: "st-id" or "st-id/point".
      const [sid, pid] = id.split('/')
      const st = (useStore.getState().project.structures ?? []).find((x) => x.id === sid)
      if (!st) return null
      const m = pid ? mountPoints(st).find((x) => x.id === pid) : undefined
      const w = m ? toWorld(st, pointAt(m, 0.5)) : ([st.position[0], st.position[1] + 0.5, st.position[2]] as [number, number, number])
      const s = screenOf(new THREE.Vector3(...w))
      return { x: s.x + rect.left, y: s.y + rect.top }
    }
    const marquee = document.createElement('div')
    marquee.className = 'marquee'
    container.appendChild(marquee)

    const onModifiers = (e: KeyboardEvent | PointerEvent) => {
      nav.shift = e.shiftKey
      nav.alt = e.altKey
    }
    const typing = (e: Event) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
    const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'PageUp', 'PageDown'])
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e)) return
      // Camera keys: arrows orbit, Shift+arrows move, + and - zoom, Page Up/Down raise and lower, Home frames the show.
      if (NAV_KEYS.has(e.key) && !e.metaKey && !e.ctrlKey && !document.querySelector('.tour-layer, .wizard-backdrop, .fixture-menu.floating')) {
        e.preventDefault()
        held.add(e.key)
      }
      if (e.key === 'Home' && !e.metaKey) {
        e.preventDefault()
        fitView('perspective')
      }
      if (e.code === 'Space') {
        e.preventDefault()
        nav.space = true
      }
      if (e.key === 'Escape' && gesture.kind !== 'none') {
        gesture = { kind: 'none', x: 0, y: 0, moved: false }
        marquee.style.display = 'none'
        showGuides(false)
        sync(useStore.getState().project, useStore.getState().selection)
        syncSets(useStore.getState().project, useStore.getState().selection)
      }
      onModifiers(e)
      applyNav()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      held.delete(e.key)
      // Shift changes '=' to '+' and '-' to '_' between press and release.
      if (e.key === '+' || e.key === '=') (held.delete('+'), held.delete('='))
      if (e.key === '-' || e.key === '_') (held.delete('-'), held.delete('_'))
      if (e.code === 'Space') nav.space = false
      onModifiers(e)
      applyNav()
    }
    const onBlur = () => {
      held.clear()
      nav.space = nav.shift = nav.alt = false
      applyNav()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    const unsubscribeTool = useViewSettings.subscribe((s, prev) => {
      if (s.tool !== prev.tool) {
        applyNav()
        placePivot()
      }
    })

    // Runs before OrbitControls sees the press, so it uses the right button mapping.
    const onDownCapture = (e: PointerEvent) => {
      onModifiers(e)
      applyNav()
    }
    const onDown = (e: PointerEvent) => {
      useFixtureMenu.getState().close()
      if (e.button !== 0 || navigating() || gizmo.axis !== null) return
      const id = pick(e.clientX, e.clientY)
      const { selection, select } = useStore.getState()
      let piece = id ? undefined : pickStructure(e.clientX, e.clientY)
      // A stage or dance floor that isn't selected yet: drag draws a box (click still selects it).
      const pieceKind = piece && (useStore.getState().project.structures ?? []).find((x) => x.id === piece)?.kind
      if (piece && pieceKind && STRUCTURE_KINDS[pieceKind].ground && !selection.includes(piece)) {
        gesture = { kind: 'box', x: e.clientX, y: e.clientY, id: piece, moved: false }
        renderer.domElement.setPointerCapture(e.pointerId)
        applyNav()
        piece = undefined
        return
      }
      if (piece) {
        // An object: click to select it; with the Move tool, drag it across the floor.
        const st = (useStore.getState().project.structures ?? []).find((x) => x.id === piece)!
        {
          if (!selection.includes(piece)) select(e.shiftKey ? [...selection, piece] : [piece])
          const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -st.position[1])
          raycaster.setFromCamera(toNdc(e.clientX, e.clientY), camera)
          const from = raycaster.ray.intersectPlane(plane, new THREE.Vector3())
          gesture = { kind: from ? 'set' : 'click', x: e.clientX, y: e.clientY, id: piece, plane, from: from ?? undefined, delta: new THREE.Vector3(), moved: false }
        }
        renderer.domElement.setPointerCapture(e.pointerId)
        applyNav()
        return
      }
      if (id) {
        // Drag the fixture: it slides on a level plane at its own height.
        if (!selection.includes(id)) select(e.shiftKey ? [...selection, id] : [id])
        const { project } = useStore.getState()
        const fixture = project.fixtures.find((f) => f.id === id)!
        // On a stand or totem: the stand comes too (hold Option/Alt to lift the fixture off instead).
        const carrier = fixture.mount && !e.altKey ? (project.structures ?? []).find((x) => x.id === fixture.mount!.structure && STRUCTURE_KINDS[x.kind].carrier) : undefined
        if (carrier) {
          const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -carrier.position[1])
          raycaster.setFromCamera(toNdc(e.clientX, e.clientY), camera)
          const from = raycaster.ray.intersectPlane(plane, new THREE.Vector3())
          gesture = { kind: from ? 'set' : 'click', x: e.clientX, y: e.clientY, id, plane, from: from ?? undefined, delta: new THREE.Vector3(), moved: false }
          renderer.domElement.setPointerCapture(e.pointerId)
          applyNav()
          return
        }
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -fixture.position[1])
        raycaster.setFromCamera(toNdc(e.clientX, e.clientY), camera)
        const from = raycaster.ray.intersectPlane(plane, new THREE.Vector3())
        gesture = { kind: from ? 'body' : 'click', x: e.clientX, y: e.clientY, id, plane, from: from ?? undefined, delta: new THREE.Vector3(), moved: false }
      } else {
        gesture = { kind: id ? 'click' : 'box', x: e.clientX, y: e.clientY, id, moved: false }
      }
      renderer.domElement.setPointerCapture(e.pointerId)
      applyNav()
    }
    const onMove = (e: PointerEvent) => {
      if (gesture.kind === 'none') return
      const far = Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 4
      if (!far && !gesture.moved) return
      gesture.moved = true
      if (gesture.kind === 'box') {
        const rect = renderer.domElement.getBoundingClientRect()
        const x0 = Math.min(gesture.x, e.clientX) - rect.left
        const y0 = Math.min(gesture.y, e.clientY) - rect.top
        Object.assign(marquee.style, { display: 'block', left: `${x0}px`, top: `${y0}px`, width: `${Math.abs(e.clientX - gesture.x)}px`, height: `${Math.abs(e.clientY - gesture.y)}px` })
      } else if ((gesture.kind === 'body' || gesture.kind === 'set') && gesture.plane && gesture.from) {
        if (gesture.kind === 'body' && !guides) showGuides(true)
        raycaster.setFromCamera(toNdc(e.clientX, e.clientY), camera)
        const at = raycaster.ray.intersectPlane(gesture.plane, new THREE.Vector3())
        // Snap to 5 cm, like the arrows.
        if (at) gesture.delta = at.sub(gesture.from).divideScalar(0.05).round().multiplyScalar(0.05)
        const delta = gesture.delta ?? new THREE.Vector3()
        const { selection } = useStore.getState()
        if (gesture.kind === 'set') {
          previewMove(selection, delta, false)
          return
        }
        // A fixture near a mount point snaps onto it: a totem top, a truss, a facade.
        gesture.snap = snapAt(e.clientX, e.clientY, 28)
        showRing(gesture.snap)
        previewMove(selection, delta, false)
        if (gesture.snap && gesture.id) rigs.get(gesture.id)?.root.position.set(...gesture.snap.position)
      }
    }
    const onUp = (e: PointerEvent) => {
      if (gesture.kind === 'none' || e.button !== 0) return
      const g = gesture
      gesture = { kind: 'none', x: 0, y: 0, moved: false }
      marquee.style.display = 'none'
      if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId)
      applyNav()
      if (g.kind === 'body') {
        showGuides(false)
        const { selection } = useStore.getState()
        const fixtures = useStore.getState().project.fixtures.filter((f) => selection.includes(f.id)).map((f) => f.id)
        if (g.moved && g.snap) mountFixtures(fixtures, g.snap.structure.id, g.snap.point.id, g.snap.t)
        else if (g.moved && g.delta) moveFixtures(fixtures, [g.delta.x, 0, g.delta.z])
        else clickSelect(g.id, e.shiftKey)
        sync(useStore.getState().project, useStore.getState().selection)
        return
      }
      if (g.kind === 'set') {
        if (g.moved && g.delta) moveSelection(useStore.getState().selection, [g.delta.x, 0, g.delta.z])
        else clickSelect(g.id, e.shiftKey)
        syncSets(useStore.getState().project, useStore.getState().selection)
        sync(useStore.getState().project, useStore.getState().selection)
        return
      }
      if (g.kind === 'box' && g.moved) {
        const rect = renderer.domElement.getBoundingClientRect()
        const [x0, x1] = [Math.min(g.x, e.clientX) - rect.left, Math.max(g.x, e.clientX) - rect.left]
        const [y0, y1] = [Math.min(g.y, e.clientY) - rect.top, Math.max(g.y, e.clientY) - rect.top]
        const inside = [...rigs.values()]
          .filter((r) => r.root.visible)
          .filter((r) => {
            const s = screenOf(r.center())
            return s.front && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1
          })
          .map((r) => r.fixtureId)
        // Objects count when they're wholly inside the box (so boxing a few things on a stage doesn't grab the stage).
        for (const r of sets.values()) {
          if (!r.root.visible) continue
          const b = new THREE.Box3().setFromObject(r.root)
          if (b.isEmpty()) continue
          const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => screenOf(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)))
          if (corners.every((c) => c.front && c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1)) inside.push(r.structureId)
        }
        const { selection, select } = useStore.getState()
        select(e.shiftKey ? [...new Set([...selection, ...inside])] : inside)
        return
      }
      clickSelect(g.id, e.shiftKey)
    }
    renderer.domElement.addEventListener('pointerdown', onDownCapture, { capture: true })
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerup', onUp)

    // --- Right-click a fixture for its actions ---
    const onContext = (e: MouseEvent) => {
      e.preventDefault()
      const rect = renderer.domElement.getBoundingClientRect()
      const id = pick(e.clientX, e.clientY) ?? pickStructure(e.clientX, e.clientY)
      const { selection, select } = useStore.getState()
      if (id && !selection.includes(id)) select([id])
      void rect
      if (id || selection.length) useFixtureMenu.getState().open(e.clientX, e.clientY)
    }
    renderer.domElement.addEventListener('contextmenu', onContext)

    // --- Double-click an object to edit it ---
    const onDouble = (e: MouseEvent) => {
      if (navigating() || pick(e.clientX, e.clientY)) return
      const piece = pickStructure(e.clientX, e.clientY)
      if (!piece) return
      useStore.getState().select([piece])
      useStructureEditor.getState().set(true)
    }
    renderer.domElement.addEventListener('dblclick', onDouble)

    // --- Resize with the panel ---
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    // The first view: the show from the front and a little to the side, everything in it in view.
    let framed = false
    const observer = new ResizeObserver(() => {
      resize()
      if (!framed && container.clientWidth > 0 && container.clientHeight > 0) {
        framed = true
        fitView('perspective', 'all', true)
      }
    })
    observer.observe(container)
    resize()

    registerView({
      preset: (v) => fitView(v),
      focus: (ids) => frameIds(ids),
      home: (instant) => fitView('perspective', 'all', instant),
      nudge: (kind, x, y) => nudge(kind, x, y),
      goTo: (p, t) => flyTo(new THREE.Vector3(...p), new THREE.Vector3(...t)),
      current: () => ({ position: camera.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number] }),
      capture: () => {
        // Draw a frame without the gizmo, then read the canvas straight away.
        const helper = gizmo.getHelper()
        const was = helper.visible
        helper.visible = false
        renderer.render(scene, camera)
        const url = renderer.domElement.toDataURL('image/png')
        helper.visible = was
        return url
      }
    })

    // --- Keep the fixture action bar above the selection, on screen ---
    const hudAt = new THREE.Vector3()
    const placeHud = () => {
      const el = wrap.current
      if (!el) return
      const { project, selection } = useStore.getState()
      const fixtures = project.fixtures.filter((f) => selection.includes(f.id))
      // Objects get the bar too, when no fixture is selected.
      const pieces = fixtures.length ? [] : (project.structures ?? []).filter((st) => selection.includes(st.id))
      const chosen = fixtures.length
        ? fixtures.map((f) => ({ id: f.id, position: f.position, top: f.mounting === 'hanging' ? 0.15 : 0.6 }))
        : pieces.map((st) => ({ id: st.id, position: st.position, top: (sets.get(st.id) ? new THREE.Box3().setFromObject(sets.get(st.id)!.root).max.y - st.position[1] : 1) + 0.1 }))
      if (!chosen.length || dragStart || gesture.kind === 'body' || gesture.kind === 'set') {
        el.style.setProperty('--hud-show', '0')
        el.style.setProperty('--hud-events', 'none')
        return
      }
      hudAt.set(0, 0, 0)
      let highest = -Infinity
      for (const f of chosen) {
        const rig = rigs.get(f.id) ?? sets.get(f.id)
        const p = rig ? rig.root.position : new THREE.Vector3(...f.position)
        hudAt.x += p.x
        hudAt.z += p.z
        highest = Math.max(highest, p.y + f.top)
      }
      hudAt.x /= chosen.length
      hudAt.z /= chosen.length
      hudAt.y = highest
      hudAt.project(camera)
      const visible = hudAt.z < 1 && Math.abs(hudAt.x) < 1.1 && Math.abs(hudAt.y) < 1.1
      el.style.setProperty('--hud-show', visible ? '1' : '0')
      el.style.setProperty('--hud-events', visible ? 'auto' : 'none')
      // Keep the whole bar on screen and clear of the view toolbar.
      const hud = el.querySelector<HTMLElement>('.fixture-hud')
      const halfW = (hud?.offsetWidth ?? 300) / 2
      const h = hud?.offsetHeight ?? 34
      const x = Math.min(container.clientWidth - halfW - 8, Math.max(halfW + 8, ((hudAt.x + 1) / 2) * container.clientWidth))
      const y = Math.max(h + 60, ((1 - hudAt.y) / 2) * container.clientHeight)
      el.style.setProperty('--hud-x', `${x}px`)
      el.style.setProperty('--hud-y', `${y}px`)
    }

    // --- The frame loop: DMX in, mechanics, draw ---
    const timer = new THREE.Timer()
    let frameId = 0
    const tick = (now?: number) => {
      frameId = requestAnimationFrame(tick)
      // Fixture Studio covers the show and has its own view: don't draw this one meanwhile.
      if (useStudio.getState().open) return
      timer.update(now)
      const dt = Math.min(0.1, timer.getDelta())
      const time = timer.getElapsed()
      const { project } = useStore.getState()
      const { haze, demo } = useViewSettings.getState()
      if (demo) runDemo(project, time)

      projectors.begin()
      dmxBus.alignUniverses([...new Set(project.fixtures.map((f) => f.universe))])
      const universes = new Map<number, Uint8Array>()
      for (const fixture of project.fixtures) {
        const rig = rigs.get(fixture.id)
        if (!rig) continue
        let levels = universes.get(fixture.universe)
        if (!levels) {
          levels = dmxBus.levels(fixture.universe).slice()
          universes.set(fixture.universe, levels)
        }
        const mix = useMix.getState()
        rig.root.visible = !mix.hidden.includes(fixture.id)
        if (!rig.root.visible) continue
        if (mix.isLive(fixture.id)) rig.update(decodeHeads(getFixtureType(fixture.typeId), levels, fixture.address, time), dt, haze, time)
        else rig.blackout(haze, time)
      }
      fog.density = 0.008 + haze * 0.025
      scene.fog = haze > 0 ? fog : null
      if (held.size) {
        const k = dt * 12 // about 12 steps a second
        const shift = nav.shift
        for (const key of held) {
          if (key === 'ArrowLeft') nudge(shift ? 'pan' : 'orbit', shift ? -k : -k, 0)
          if (key === 'ArrowRight') nudge(shift ? 'pan' : 'orbit', k, 0)
          if (key === 'ArrowUp') nudge(shift ? 'pan' : 'orbit', 0, k)
          if (key === 'ArrowDown') nudge(shift ? 'pan' : 'orbit', 0, -k)
          if (key === '+' || key === '=') nudge('zoom', 0, k)
          if (key === '-' || key === '_') nudge('zoom', 0, -k)
          if (key === 'PageUp') nudge('lift', 0, k)
          if (key === 'PageDown') nudge('lift', 0, -k)
        }
      }
      if (flight) {
        flight.t = Math.min(1, flight.t + dt / 0.45)
        const k = 1 - Math.pow(1 - flight.t, 3)
        camera.position.lerpVectors(flight.from, flight.to, k)
        controls.target.lerpVectors(flight.fromT, flight.toT, k)
        if (flight.t >= 1) flight = null
      }
      const lit = projectors.brightest()
      setProjectors(lit, time)
      ;(window as unknown as { __projectors?: unknown }).__projectors = { total: projectors.count(), used: lit.length, up: lit.filter((p) => p.direction.y > 0.2).length }
      controls.update()
      // Looking up is allowed; going through the floor (or the ceiling) isn't.
      const top = builtRoom?.ceiling && builtFit ? builtFit.ceiling - 0.25 : 1e4
      if (camera.position.y < 0.3 || camera.position.y > top) {
        const y = Math.min(top, Math.max(0.3, camera.position.y))
        camera.position.y = y
      }
      placeHud()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frameId)
      registerView(null)
      unsubscribe()
      unsubscribeRoom()
      renderer.domElement.removeEventListener('contextmenu', onContext)
      renderer.domElement.removeEventListener('dblclick', onDouble)
      unsubscribeGizmo()
      gizmo.dispose()
      container.removeEventListener('dragover', onDragOver)
      container.removeEventListener('drop', onDrop)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDownCapture, { capture: true })
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      unsubscribeTool()
      marquee.remove()
      for (const rig of rigs.values()) rig.dispose()
      for (const rig of sets.values()) rig.dispose()
      showGuides(false)
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="viewport-wrap" ref={wrap}>
      <div className="viewport" ref={host} />
      <FixtureHud />
      <FixtureMenu />
      <StructureHud />
      <StructureMenu />
      <ShowBuilder />
      <StructureEditor />
      <ViewToolbar />
      <NavPad />
      <Notices />
    </div>
  )
}
