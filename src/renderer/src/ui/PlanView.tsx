/**
 * The Plan: the show drawn flat, like a lighting plot, to place things exactly.
 *
 * From the top (default), the front or the side. Click to select (Shift adds), drag
 * to move (with whatever is on it), drag on empty floor to box-select. Arrow keys
 * nudge the selection; R turns objects. Space-drag or the middle button pans, the
 * wheel or a pinch zooms. With Snap to grid on, things land on the grid; without it,
 * they line up with their neighbours (blue guides).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '../state/store'
import { usePrefs } from '../state/prefs'
import { useFixtureMenu } from '../state/fixtureMenu'
import { addLibraryFixtures, addStructure, mountFixtures, moveSelection, rotateStructures, updateStructures } from '../state/commands'
import { notify } from '../state/notices'
import { useLibrary } from '../state/library'
import { getFixtureType } from '../model/fixtureTypes'
import { roomFit } from '../model/physics'
import { roomOf } from '../model/project'
import { isSideView, itemAt, majorSpacing, mountNear, planBounds, planDelta, planItems, toPlan, type PlanItem, type PlanMount } from '../model/plan'
import { movingRoots, withRiders } from '../model/arrange'
import { formatLength } from '../model/units'
import { STRUCTURE_DRAG, type StructureDrag } from './ObjectsPanel'
import { DRAG_TYPE, type DragPayload } from './LibraryPanel'
import { useStructureEditor } from './StructureActions'
import { planNudge, usePlanCam, type PlanCam } from '../state/planCamera'

type Cam = PlanCam

const CATEGORY_FILL: Record<string, string> = {
  'Stands & totems': '#5b6577',
  Truss: '#8a94a6',
  Staging: '#262c37',
  'Speakers & sound': '#3a3f4a',
  'DJ & band': '#33415c',
  Party: '#4b3756',
  Screens: '#1e2b42',
  'Room lights': '#4d4329',
  Furniture: '#3d3829',
  'Room & decor': '#2d3340',
  People: '#2c3d33'
}

/** Colour of a fixture's symbol, by what it is. */
function fixtureColour(look: string | undefined): string {
  if (!look) return '#f0b44c'
  if (/mover|beeEye|scanner|movingBar/.test(look)) return '#6ea2ff'
  if (/tube|bar|strip|string|panel|acrylic|curtain/.test(look)) return '#3fbf7f'
  if (/laser/.test(look)) return '#ef5b5b'
  if (/derby|sphere|gigbar|twinbar|cluster|spider/.test(look)) return '#c07bff'
  if (/fog|spark/.test(look)) return '#8b95a3'
  if (/strobe/.test(look)) return '#e8e8ea'
  return '#f0b44c'
}

const ROUND_LOOKS = /par|uplight|mover|moverWash|beeEye|sphere|derby|spark|fog|strobe/

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; x: number; y: number; cam: Cam }
  | { kind: 'box'; x: number; y: number; x2: number; y2: number; add: boolean }
  | { kind: 'move'; x: number; y: number; ids: string[]; anchor: PlanItem; du: number; dv: number; moved: boolean; mount: PlanMount | null; guides: { u?: number; v?: number } }
  | { kind: 'turn'; id: string; centre: [number, number]; start: number; from: number; angle: number }
  | { kind: 'click'; x: number; y: number; id: string; add: boolean; locked: boolean }

export function PlanView() {
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const { units, grid, snap, gridSize, planSide: side, planLabels } = usePrefs()
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const cam = usePlanCam((st) => st.cam)
  const camSide = usePlanCam((st) => st.side)
  const setCam = usePlanCam((st) => st.setCam)
  const [gesture, setGesture] = useState<Gesture>({ kind: 'none' })
  const space = useRef(false)

  const items = useMemo(() => planItems(project, side), [project, side])
  const fit = useMemo(() => roomFit(project, roomOf(project).ceilingHeight), [project])

  // --- Size and framing ---
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const measure = () => {
      const next = { w: el.clientWidth || 800, h: el.clientHeight || 600 }
      setSize(next)
      usePlanCam.getState().setSize(next)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const frame = useCallback(
    (only?: string[] | 'all') => {
      const chosen = only && only !== 'all' ? items.filter((it) => only.includes(it.id)) : items
      // The room too, so an empty show still shows the floor.
      const room: PlanItem[] =
        side === 'top'
          ? [{ id: 'room', kind: 'structure', u: 0, v: (fit.wallZ + Math.min(fit.front, 8)) / 2, w: 12, h: Math.min(fit.front, 8) - fit.wallZ, turn: 0, label: '', locked: false, layer: 0 }]
          : [{ id: 'room', kind: 'structure', u: side === 'front' ? 0 : ((side === 'right' ? -1 : 1) * (fit.wallZ + 8)) / 2, v: -2, w: 12, h: 4, turn: 0, label: '', locked: false, layer: 0 }]
      const b = planBounds(chosen.length ? chosen : room)!
      const pad = chosen.length === 1 ? 2 : 1.5
      const scale = Math.max(8, Math.min(400, Math.min(size.w / (b.maxU - b.minU + pad * 2), (size.h - 70) / (b.maxV - b.minV + pad * 2))))
      setCam({ u: (b.minU + b.maxU) / 2, v: (b.minV + b.maxV) / 2 - 28 / scale, scale }, side)
    },
    [items, side, fit, size.w, size.h]
  )
  // Frame everything when the side changes. Coming from 3D, the view carries across
  // (set by the 3D view as it hands over), so it isn't framed afresh.
  useEffect(() => {
    if (cam && camSide === side) return
    frame('all')
  }, [side, camSide, frame, cam])
  useEffect(() => {
    const onFocus = (e: Event) => frame((e as CustomEvent).detail as string[] | 'all')
    window.addEventListener('plan:focus', onFocus)
    return () => window.removeEventListener('plan:focus', onFocus)
  }, [frame])

  const c = cam ?? { u: 0, v: 0, scale: 40 }
  const sx = (u: number) => (u - c.u) * c.scale + size.w / 2
  const sy = (v: number) => (v - c.v) * c.scale + size.h / 2
  const toPlanPt = (clientX: number, clientY: number): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect()
    return [(clientX - r.left - size.w / 2) / c.scale + c.u, (clientY - r.top - size.h / 2) / c.scale + c.v]
  }

  // --- What moves with the selection (things on a stage, fixtures on a totem) ---
  const moving = useMemo(() => {
    if (gesture.kind !== 'move' || !gesture.moved) return null
    const moved = withRiders(project, movingRoots(project, gesture.ids))
    return new Set([...moved.structures, ...moved.fixtures])
  }, [gesture, project])
  const offsetOf = (id: string): [number, number] => {
    if (gesture.kind !== 'move' || !moving?.has(id)) return [0, 0]
    // In the front and side views only loose fixtures go up and down.
    const it = items.find((x) => x.id === id)
    const vertical = side === 'top' || (it?.kind === 'fixture' && !project.fixtures.find((f) => f.id === id)?.mount && gesture.ids.includes(id))
    return [gesture.du, vertical ? gesture.dv : 0]
  }

  // --- The fixture/object bar (the same one as in 3D) sits above the selection ---
  useEffect(() => {
    const wrap = svgRef.current?.closest('.viewport-wrap') as HTMLElement | null
    if (!wrap) return
    const chosen = items.filter((it) => selection.includes(it.id))
    const fixtures = chosen.filter((it) => it.kind === 'fixture')
    const shown = fixtures.length ? fixtures : chosen
    if (!shown.length || gesture.kind === 'move' || gesture.kind === 'turn') {
      wrap.style.setProperty('--hud-show', '0')
      wrap.style.setProperty('--hud-events', 'none')
      return
    }
    const b = planBounds(shown)!
    const x = Math.max(160, Math.min(size.w - 160, sx((b.minU + b.maxU) / 2)))
    const y = Math.max(96, sy(b.minV) - 6)
    wrap.style.setProperty('--hud-x', `${x}px`)
    wrap.style.setProperty('--hud-y', `${y}px`)
    wrap.style.setProperty('--hud-show', '1')
    wrap.style.setProperty('--hud-events', 'auto')
  })

  // --- Keys: arrows nudge, R turns, Space pans ---
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    }
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || document.querySelector('.tour-layer, .wizard-backdrop, .fixture-menu.floating')) return
      if (e.code === 'Space') {
        space.current = true
        e.preventDefault()
        return
      }
      // + and − zoom; arrows slide the view when nothing is selected (they move the selection otherwise).
      if (!e.metaKey && !e.ctrlKey && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_')) {
        e.preventDefault()
        return planNudge('zoom', 0, e.key === '+' || e.key === '=' ? 1 : -1)
      }
      if (e.key === 'Home' && !e.metaKey) {
        e.preventDefault()
        return frame('all')
      }
      const { selection: sel } = useStore.getState()
      const pans: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
      if (pans[e.key] && !sel.length && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        return planNudge('pan', pans[e.key][0], pans[e.key][1])
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      const dir = arrows[e.key]
      if (dir && sel.length && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        const { snap: sn, gridSize: g, units: un } = usePrefs.getState()
        const step = sn ? g : e.shiftKey ? (un === 'imperial' ? 0.3048 : 1) : un === 'imperial' ? 0.0254 * 3 : 0.1
        const d = planDelta(side, dir[0] * step, dir[1] * step)
        const before = sel.length
        const free = sel.filter((id) => ![...project.fixtures, ...(project.structures ?? [])].find((x) => x.id === id)?.locked)
        if (free.length < before) notify('info', 'Locked items stay where they are. Unlock them to move them.')
        if (free.length) moveSelection(free, d)
        return
      }
      if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && side === 'top') {
        const pieces = (project.structures ?? []).filter((s) => sel.includes(s.id)).map((s) => s.id)
        if (pieces.length) {
          e.preventDefault()
          rotateStructures(pieces, e.shiftKey ? 90 : -90)
        }
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  }, [side, project, frame])

  // --- Wheel: zoom (mouse wheel, pinch); two-finger scroll pans ---
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setCam((prev) => {
        const cc = prev ?? { u: 0, v: 0, scale: 40 }
        const trackpadPan = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(e.deltaX) > 0.5 || (Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY)))
        if (trackpadPan) return { ...cc, u: cc.u + e.deltaX / cc.scale, v: cc.v + e.deltaY / cc.scale }
        const r = el.getBoundingClientRect()
        const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
        const scale = Math.max(6, Math.min(600, cc.scale * k))
        // Keep the point under the pointer where it is.
        const pu = (e.clientX - r.left - r.width / 2) / cc.scale + cc.u
        const pv = (e.clientY - r.top - r.height / 2) / cc.scale + cc.v
        return { scale, u: pu - (e.clientX - r.left - r.width / 2) / scale, v: pv - (e.clientY - r.top - r.height / 2) / scale }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // --- Pointer ---
  const locked = (id: string) => !![...project.fixtures, ...(project.structures ?? [])].find((x) => x.id === id)?.locked
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    useFixtureMenu.getState().close()
    if (e.button === 2) return
    const [u, v] = toPlanPt(e.clientX, e.clientY)
    svgRef.current!.setPointerCapture(e.pointerId)
    if (e.button === 1 || space.current) return setGesture({ kind: 'pan', x: e.clientX, y: e.clientY, cam: c })
    // The turn handle of a selected object.
    const handle = (e.target as Element).closest('[data-turn]')?.getAttribute('data-turn')
    if (handle) {
      const it = items.find((x) => x.id === handle)!
      const st = project.structures?.find((s) => s.id === handle)
      if (st?.locked) return notify('info', 'Locked: unlock it to turn it.')
      const start = Math.atan2(v - it.v, u - it.u)
      return setGesture({ kind: 'turn', id: handle, centre: [it.u, it.v], start, from: st?.rotation ?? 0, angle: st?.rotation ?? 0 })
    }
    const hit = itemAt(items, u, v, 4 / c.scale)
    if (!hit) return setGesture({ kind: 'box', x: e.clientX, y: e.clientY, x2: e.clientX, y2: e.clientY, add: e.shiftKey })
    const add = e.shiftKey || e.metaKey
    // Click selects; dragging moves the selection (unless it's locked).
    if (add) return setGesture({ kind: 'click', x: e.clientX, y: e.clientY, id: hit.id, add, locked: true })
    if (!selection.includes(hit.id)) select([hit.id])
    const ids = selection.includes(hit.id) ? selection : [hit.id]
    if (locked(hit.id)) return setGesture({ kind: 'click', x: e.clientX, y: e.clientY, id: hit.id, add: false, locked: true })
    setGesture({ kind: 'move', x: e.clientX, y: e.clientY, ids: ids.filter((id) => !locked(id)), anchor: hit, du: 0, dv: 0, moved: false, mount: null, guides: {} })
  }

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (gesture.kind === 'none') return
    if (gesture.kind === 'pan') {
      const du = (e.clientX - gesture.x) / gesture.cam.scale
      const dv = (e.clientY - gesture.y) / gesture.cam.scale
      return setCam({ ...gesture.cam, u: gesture.cam.u - du, v: gesture.cam.v - dv })
    }
    if (gesture.kind === 'box') return setGesture({ ...gesture, x2: e.clientX, y2: e.clientY })
    if (gesture.kind === 'click') {
      if (gesture.locked && !gesture.add && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 4) {
        notify('info', 'Locked: it stays where it is. Right-click ▸ Unlock (or ⇧⌘L) to move it.')
        setGesture({ kind: 'none' })
      }
      return
    }
    if (gesture.kind === 'turn') {
      const [u, v] = toPlanPt(e.clientX, e.clientY)
      const now = Math.atan2(v - gesture.centre[1], u - gesture.centre[0])
      // The plan's turn is the world's turn backwards (see planItems).
      let angle = gesture.from - ((now - gesture.start) * 180) / Math.PI
      if (!e.shiftKey) angle = Math.round(angle / 15) * 15
      angle = (((angle % 360) + 540) % 360) - 180
      return setGesture({ ...gesture, angle })
    }
    // Moving.
    const far = Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 3
    if (!far && !gesture.moved) return
    let du = (e.clientX - gesture.x) / c.scale
    let dv = (e.clientY - gesture.y) / c.scale
    const a = gesture.anchor
    const guides: { u?: number; v?: number } = {}
    if (snap) {
      // The thing you grabbed lands on the grid.
      du = Math.round((a.u + du) / gridSize) * gridSize - a.u
      dv = Math.round((a.v + dv) / gridSize) * gridSize - a.v
    } else {
      // Line up with neighbours: centres within a few pixels snap together.
      const reach = 6 / c.scale
      let bestU = reach
      let bestV = reach
      for (const it of items) {
        if (gesture.ids.includes(it.id)) continue
        const gu = it.u - (a.u + du)
        const gv = it.v - (a.v + dv)
        if (Math.abs(gu) < bestU) [bestU, guides.u] = [Math.abs(gu), it.u]
        if (Math.abs(gv) < bestV) [bestV, guides.v] = [Math.abs(gv), it.v]
      }
      if (guides.u !== undefined) du = guides.u - a.u
      if (guides.v !== undefined) dv = guides.v - a.v
      if (guides.u === undefined && guides.v === undefined) {
        // 1 cm steps, so numbers stay tidy.
        du = Math.round(du * 100) / 100
        dv = Math.round(dv * 100) / 100
      }
    }
    // A single loose fixture over a totem, stand or truss (from the top): it'll go on it.
    let mount: PlanMount | null = null
    if (side === 'top' && gesture.ids.length === 1 && a.kind === 'fixture') {
      const f = project.fixtures.find((x) => x.id === a.id)
      const carrier = f?.mount && project.structures?.find((s) => s.id === f.mount!.structure)
      if (f && !(carrier && STRUCTURE_CARRIER(carrier.kind))) {
        mount = mountNear(project.structures ?? [], a.u + du, a.v + dv, f.mounting === 'hanging', Math.max(0.25, 16 / c.scale))
        if (mount && f.mount?.structure === mount.structure.id && f.mount.point === mount.point.id) mount = null
      }
    }
    setGesture({ ...gesture, du, dv, moved: true, mount, guides })
  }

  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture
    setGesture({ kind: 'none' })
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
    if (g.kind === 'box') {
      const moved = Math.hypot(g.x2 - g.x, g.y2 - g.y) > 4
      if (!moved) return select(g.add ? selection : [])
      const [u0, v0] = toPlanPt(Math.min(g.x, g.x2), Math.min(g.y, g.y2))
      const [u1, v1] = toPlanPt(Math.max(g.x, g.x2), Math.max(g.y, g.y2))
      // Fixtures count when their middle is inside; objects when they're wholly inside.
      const inside = items
        .filter((it) => (it.kind === 'fixture' ? it.u >= u0 && it.u <= u1 && it.v >= v0 && it.v <= v1 : it.u - it.w / 2 >= u0 && it.u + it.w / 2 <= u1 && it.v - it.h / 2 >= v0 && it.v + it.h / 2 <= v1))
        .map((it) => it.id)
      return select(g.add ? [...new Set([...selection, ...inside])] : inside)
    }
    if (g.kind === 'click') {
      if (g.add) select(selection.includes(g.id) ? selection.filter((x) => x !== g.id) : [...selection, g.id])
      else select([g.id])
      return
    }
    if (g.kind === 'turn') {
      const st = project.structures?.find((s) => s.id === g.id)
      if (st && Math.abs(g.angle - st.rotation) > 0.01) updateStructures([g.id], 'Turn object', (s) => ({ ...s, rotation: g.angle }))
      return
    }
    if (g.kind === 'move') {
      if (!g.moved) {
        if (g.ids.length > 1) select([g.anchor.id])
        return
      }
      if (g.mount) {
        mountFixtures([g.anchor.id], g.mount.structure.id, g.mount.point.id, g.mount.t)
        return
      }
      if (g.ids.length) moveSelection(g.ids, planDelta(side, g.du, g.dv))
    }
  }

  const onContext = (e: React.MouseEvent) => {
    e.preventDefault()
    const [u, v] = toPlanPt(e.clientX, e.clientY)
    const hit = itemAt(items, u, v, 4 / c.scale)
    if (hit && !selection.includes(hit.id)) select([hit.id])
    if (hit || selection.length) useFixtureMenu.getState().open(e.clientX, e.clientY)
  }

  const onDouble = (e: React.MouseEvent) => {
    const [u, v] = toPlanPt(e.clientX, e.clientY)
    const hit = itemAt(items, u, v, 4 / c.scale)
    if (hit?.kind === 'structure') {
      select([hit.id])
      useStructureEditor.getState().set(true)
    }
  }

  // --- Drop from the Library or Objects (top view): it lands where you let go ---
  const onDragOver = (e: React.DragEvent) => {
    if (side !== 'top') return
    if (!e.dataTransfer.types.includes(DRAG_TYPE) && !e.dataTransfer.types.includes(STRUCTURE_DRAG)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDrop = (e: React.DragEvent) => {
    if (side !== 'top') return
    const [x, z] = toPlanPt(e.clientX, e.clientY)
    const [sx2, sz2] = snap ? [Math.round(x / gridSize) * gridSize, Math.round(z / gridSize) * gridSize] : [x, z]
    const piece = e.dataTransfer.getData(STRUCTURE_DRAG)
    if (piece) {
      e.preventDefault()
      const drag = JSON.parse(piece) as StructureDrag
      addStructure(drag.kind, drag.params, { at: [sx2, 0, sz2] })
      return
    }
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    e.preventDefault()
    const payload = JSON.parse(raw) as DragPayload
    const type = 'rig' in payload ? getFixtureType(payload.rig) : useLibrary.getState().typeFor(payload.library, payload.mode)
    if (!type || type.id === 'unknown') return
    const mount = mountNear(project.structures ?? [], x, z, type.spec?.mount === 'hanging', Math.max(0.3, 18 / c.scale))
    if (mount) addLibraryFixtures(type, 1, { at: mount.position, mount: { structure: mount.structure.id, point: mount.point.id, t: mount.t } })
    else addLibraryFixtures(type, 1, { at: [sx2, 0.1, sz2] })
  }

  // --- Drawing ---
  const imperial = units === 'imperial'
  const major = majorSpacing(gridSize, imperial)
  const [u0, v0] = [c.u - size.w / 2 / c.scale, c.v - size.h / 2 / c.scale]
  const [u1, v1] = [c.u + size.w / 2 / c.scale, c.v + size.h / 2 / c.scale]
  const lines = (from: number, to: number, step: number) => {
    const out: number[] = []
    if (step * c.scale < 4) return out
    for (let k = Math.ceil(from / step); k * step <= to && out.length < 600; k++) out.push(k * step)
    return out
  }
  const isMajor = (x: number) => Math.abs(x / major - Math.round(x / major)) < 1e-6
  const minorU = grid ? lines(u0, u1, gridSize).filter((x) => !isMajor(x)) : []
  const minorV = grid ? lines(v0, v1, gridSize).filter((x) => !isMajor(x)) : []
  const majorU = lines(u0, u1, major)
  const majorV = lines(v0, v1, major)
  // Ruler numbers no closer than about 60 px apart.
  const every = Math.max(1, Math.ceil(60 / (major * c.scale)))
  const rulerU = majorU.filter((x) => Math.round(x / major) % every === 0)
  const rulerV = majorV.filter((y) => Math.round(y / major) % every === 0)
  const short = (m: number) => (imperial ? `${Math.round(m / 0.3048)}′` : `${Math.round(m * 10) / 10} m`)

  // The room: floor and back wall (top), floor line and ceiling (front/side).
  const ceiling = roomOf(project).ceiling ? fit.ceiling : null
  const selectedItems = items.filter((it) => selection.includes(it.id))
  const two = selectedItems.length === 2 ? selectedItems : null

  // Labels that would overlap one another are left out (selected ones and objects first).
  const labelShown = new Set<string>()
  {
    const placed: Array<[number, number, number, number]> = []
    const order = [...items].sort((a, b) => Number(selection.includes(b.id)) - Number(selection.includes(a.id)) || (a.kind === b.kind ? 0 : a.kind === 'structure' ? -1 : 1))
    for (const it of order) {
      const text = it.kind === 'fixture' && planLabels === 'patch' ? it.patch ?? '' : it.label
      if (!text) continue
      const tw = Math.min(26, text.length) * 5.7 + 6
      const hpx = Math.max(it.w, it.h) * c.scale
      const x = sx(it.u)
      const y = sy(it.v) + (it.kind === 'fixture' ? Math.max(hpx, 9) / 2 + 7 : 0)
      const box: [number, number, number, number] = [x - tw / 2, y - 7, x + tw / 2, y + 7]
      if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue
      placed.push(box)
      labelShown.add(it.id)
    }
  }

  const ghostOf = (it: PlanItem) => {
    const [du, dv] = offsetOf(it.id)
    return { ...it, u: it.u + du, v: it.v + dv, turn: gesture.kind === 'turn' && gesture.id === it.id ? -gesture.angle : it.turn }
  }

  const readout = (() => {
    if (gesture.kind !== 'move' || !gesture.moved) return null
    const a = ghostOf(gesture.anchor)
    const [lu, lv] = side === 'top' ? ['X', 'Z'] : side === 'front' ? ['X', 'H'] : ['Z', 'H']
    const uu = side === 'right' ? -a.u : a.u
    const vv = side === 'top' ? a.v : -a.v
    return { x: sx(a.u), y: sy(a.v) - (a.h * c.scale) / 2 - 12, text: `${lu} ${formatLength(uu)}   ${lv} ${formatLength(side === 'top' ? vv : vv - a.h / 2)}` }
  })()

  return (
    <svg
      ref={svgRef}
      className={`plan-view ${gesture.kind === 'pan' || space.current ? 'panning' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onContextMenu={onContext}
      onDoubleClick={onDouble}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <style>{PLAN_CSS}</style>
      <defs>
        <pattern id="truss-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#c4cbd6" strokeWidth="1.2" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={size.w} height={size.h} className="plan-bg" />

      {/* Room */}
      {side === 'top' ? (
        <>
          <rect x={sx(-fit.halfWidth)} y={sy(fit.wallZ)} width={fit.halfWidth * 2 * c.scale} height={(fit.front - fit.wallZ) * c.scale} className="plan-floor" />
          <line x1={sx(-fit.halfWidth)} x2={sx(fit.halfWidth)} y1={sy(fit.wallZ)} y2={sy(fit.wallZ)} className="plan-wall" />
          <text x={sx(0)} y={sy(fit.wallZ) - 6} className="plan-room-label" textAnchor="middle">
            Back wall
          </text>
          <text x={sx(0)} y={sy(fit.front) - 8} className="plan-room-label" textAnchor="middle">
            Audience
          </text>
        </>
      ) : (
        <>
          <rect x={sx(side === 'front' ? -fit.halfWidth : side === 'right' ? -fit.front : fit.wallZ)} y={sy(-(ceiling ?? fit.ceiling))} width={(side === 'front' ? fit.halfWidth * 2 : fit.front - fit.wallZ) * c.scale} height={(ceiling ?? fit.ceiling) * c.scale} className="plan-floor" />
          <line x1={0} x2={size.w} y1={sy(0)} y2={sy(0)} className="plan-wall" />
          {ceiling !== null && <line x1={sx(side === 'front' ? -fit.halfWidth : side === 'right' ? -fit.front : fit.wallZ)} x2={sx(side === 'front' ? fit.halfWidth : side === 'right' ? -fit.wallZ : fit.front)} y1={sy(-ceiling)} y2={sy(-ceiling)} className="plan-ceiling" />}
          {isSideView(side) && <line x1={sx(side === 'right' ? -fit.wallZ : fit.wallZ)} x2={sx(side === 'right' ? -fit.wallZ : fit.wallZ)} y1={sy(0)} y2={sy(-(ceiling ?? fit.ceiling))} className="plan-wall" />}
        </>
      )}

      {/* Grid */}
      <g className="plan-grid">
        {minorU.map((x) => (
          <line key={`mu${x}`} x1={sx(x)} x2={sx(x)} y1={0} y2={size.h} className="minor" />
        ))}
        {minorV.map((y) => (
          <line key={`mv${y}`} y1={sy(y)} y2={sy(y)} x1={0} x2={size.w} className="minor" />
        ))}
        {majorU.map((x) => (
          <line key={`Mu${x}`} x1={sx(x)} x2={sx(x)} y1={0} y2={size.h} className={Math.abs(x) < 1e-9 && !isSideView(side) ? 'centre' : 'major'} />
        ))}
        {majorV.map((y) => (
          <line key={`Mv${y}`} y1={sy(y)} y2={sy(y)} x1={0} x2={size.w} className="major" />
        ))}
      </g>

      {/* Things */}
      {items.map((raw) => {
        const it = ghostOf(raw)
        const sel = selection.includes(it.id)
        const w = Math.max(it.w * c.scale, it.kind === 'fixture' ? 9 : 4)
        const h = Math.max(it.h * c.scale, it.kind === 'fixture' ? 9 : 4)
        const x = sx(it.u)
        const y = sy(it.v)
        return (
          <g key={it.id} data-id={it.id} transform={`translate(${x} ${y}) rotate(${it.turn})`} className={`plan-item ${it.kind} ${sel ? 'selected' : ''} ${it.locked ? 'locked' : ''}`}>
            {it.kind === 'structure' ? (
              <StructureShape it={it} w={w} h={h} side={side} />
            ) : side === 'top' && it.look && ROUND_LOOKS.test(it.look) && it.w < 0.7 ? (
              <>
                <circle r={Math.max(w, h) / 2} fill={fixtureColour(it.look)} className={`fx ${it.hanging ? 'hanging' : ''}`} />
                {/^(mover|moverWash|beeEye)$/.test(it.look) && <circle r={Math.max(w, h) / 4} className="fx-lens" />}
              </>
            ) : (
              <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2} fill={fixtureColour(it.look)} className={`fx ${it.hanging ? 'hanging' : ''}`} />
            )}
            {sel && <rect x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6} rx={3} className="plan-sel" />}
            {it.locked && (
              <g transform={`translate(${w / 2 - 2} ${-h / 2 - 2}) rotate(${-it.turn})`} className="plan-lock">
                <circle r={6} />
                <rect x={-3} y={-1} width={6} height={4.5} rx={0.8} />
                <path d="M-1.8 -1V-2.4a1.8 1.8 0 0 1 3.6 0V-1" />
              </g>
            )}
          </g>
        )
      })}

      {/* Labels, over everything */}
      {items.map((raw) => {
        if (!labelShown.has(raw.id)) return null
        const it = ghostOf(raw)
        const w = Math.max(it.w * c.scale, it.kind === 'fixture' ? 9 : 4)
        const h = Math.max(it.h * c.scale, it.kind === 'fixture' ? 9 : 4)
        const showLabel = it.kind === 'structure' ? w > 46 && h > 14 && c.scale > 14 : planLabels !== 'none' && c.scale > 16
        const label = it.kind === 'fixture' && planLabels === 'patch' ? it.patch : it.label
        if (!showLabel || !label) return null
        return (
          <text key={`l${it.id}`} x={sx(it.u)} y={sy(it.v) + (it.kind === 'fixture' ? Math.max(w, h) / 2 + 11 : 4)} textAnchor="middle" className={`plan-label ${it.kind}`}>
            {label.length > 26 ? `${label.slice(0, 25)}…` : label}
          </text>
        )
      })}

      {/* Turn handle for one selected object (top view) */}
      {side === 'top' &&
        selectedItems.length === 1 &&
        selectedItems[0].kind === 'structure' &&
        !selectedItems[0].locked &&
        gesture.kind !== 'move' &&
        (() => {
          const it = ghostOf(selectedItems[0])
          const a = (it.turn * Math.PI) / 180
          const r = (it.h * c.scale) / 2 + 22
          const hx = sx(it.u) + Math.sin(a) * r
          const hy = sy(it.v) - Math.cos(a) * r
          return (
            <g className="plan-turn" data-turn={it.id}>
              <line x1={sx(it.u)} y1={sy(it.v)} x2={hx} y2={hy} />
              <circle cx={hx} cy={hy} r={7} data-turn={it.id}>
                <title>Drag to turn (15° steps; hold Shift for any angle). R turns 90°.</title>
              </circle>
            </g>
          )
        })()}
      {gesture.kind === 'turn' && (
        <text x={sx(gesture.centre[0])} y={sy(gesture.centre[1]) - 30} textAnchor="middle" className="plan-readout">
          {Math.round(gesture.angle)}°
        </text>
      )}

      {/* Distance between two selected things */}
      {two && gesture.kind === 'none' && (
        <g className="plan-dim">
          <line x1={sx(two[0].u)} y1={sy(two[0].v)} x2={sx(two[1].u)} y2={sy(two[1].v)} />
          <text x={(sx(two[0].u) + sx(two[1].u)) / 2} y={(sy(two[0].v) + sy(two[1].v)) / 2 - 6} textAnchor="middle" className="plan-readout">
            {formatLength(Math.hypot(two[0].u - two[1].u, two[0].v - two[1].v))}
          </text>
        </g>
      )}

      {/* Alignment guides, the drop target ring, and the position while dragging */}
      {gesture.kind === 'move' && gesture.guides.u !== undefined && <line x1={sx(gesture.guides.u)} x2={sx(gesture.guides.u)} y1={0} y2={size.h} className="plan-guide" />}
      {gesture.kind === 'move' && gesture.guides.v !== undefined && <line y1={sy(gesture.guides.v)} y2={sy(gesture.guides.v)} x1={0} x2={size.w} className="plan-guide" />}
      {gesture.kind === 'move' && gesture.mount && (
        <g>
          <circle cx={sx(toPlan('top', gesture.mount.position)[0])} cy={sy(toPlan('top', gesture.mount.position)[1])} r={12} className="plan-mount" />
          <text x={sx(toPlan('top', gesture.mount.position)[0])} y={sy(toPlan('top', gesture.mount.position)[1]) + 26} textAnchor="middle" className="plan-readout">
            On {gesture.mount.structure.name}
          </text>
        </g>
      )}
      {readout && (
        <text x={readout.x} y={readout.y} textAnchor="middle" className="plan-readout">
          {readout.text}
        </text>
      )}
      {gesture.kind === 'box' && <rect x={Math.min(gesture.x, gesture.x2) - (svgRef.current?.getBoundingClientRect().left ?? 0)} y={Math.min(gesture.y, gesture.y2) - (svgRef.current?.getBoundingClientRect().top ?? 0)} width={Math.abs(gesture.x2 - gesture.x)} height={Math.abs(gesture.y2 - gesture.y)} className="plan-marquee" />}

      {/* Rulers */}
      <g className="plan-ruler">
        {rulerU.filter((x) => sx(x) < size.w - 190).map((x) => (
          <text key={`ru${x}`} x={sx(x) + 3} y={size.h - 8}>
            {short(side === 'right' ? -x : x)}
          </text>
        ))}
        {rulerV.map((y) => (
          <text key={`rv${y}`} x={6} y={sy(y) - 3}>
            {short(side === 'top' ? y : -y)}
          </text>
        ))}
      </g>
      <text x={size.w - 10} y={size.h - 104} textAnchor="end" className="plan-scale">
        {side === 'top' ? 'Top' : side === 'front' ? 'Front' : side === 'left' ? 'Left' : 'Right'} · grid {formatLength(gridSize, 'length')}
        {snap ? ' · snapping' : ''}
      </text>
    </svg>
  )
}

/** The Plan's look (inside the SVG, so a saved image looks the same). */
const PLAN_CSS = `
.plan-bg { fill: #0f1216; }
.plan-floor { fill: #151a21; stroke: #2a313c; stroke-width: 1; }
.plan-wall { stroke: #8b95a3; stroke-width: 3; }
.plan-ceiling { stroke: #5c6676; stroke-width: 1.5; stroke-dasharray: 6 4; }
.plan-room-label { fill: #6b7584; font: 600 10px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
.plan-grid line { shape-rendering: crispEdges; }
.plan-grid .minor { stroke: #1d232c; stroke-width: 1; }
.plan-grid .major { stroke: #2b3440; stroke-width: 1; }
.plan-grid .centre { stroke: #36507c; stroke-width: 1; stroke-dasharray: 8 5; }
.plan-item .st { stroke: #0a0c10; stroke-width: 1; }
.plan-item .st.deck { stroke: #3a4352; }
.plan-item .st.truss { stroke: none; opacity: 0.7; }
.plan-item .st.truss-edge { fill: none; stroke: #c4cbd6; stroke-width: 1.4; }
.plan-item .fx { stroke: #0a0c10; stroke-width: 1.2; }
.plan-item .fx.hanging { stroke: #f2f5fa; stroke-dasharray: 2 2; }
.plan-item .fx-lens { fill: #0f1216; opacity: 0.55; }
.plan-item.locked .st, .plan-item.locked .fx { opacity: 0.8; }
.plan-sel { fill: none; stroke: #4d8dff; stroke-width: 2; }
.plan-lock circle { fill: #f0b44c; stroke: #0f1216; stroke-width: 1; }
.plan-lock rect { fill: #0f1216; }
.plan-lock path { fill: none; stroke: #0f1216; stroke-width: 1.2; }
.plan-label { fill: #c9d1dc; font: 500 10px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; paint-order: stroke; stroke: #0f1216; stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
.plan-label.structure { fill: #e6ebf2; font-weight: 600; }
.plan-turn line { stroke: #4d8dff; stroke-width: 1; stroke-dasharray: 3 3; pointer-events: none; }
.plan-turn circle { fill: #0f1216; stroke: #4d8dff; stroke-width: 2; cursor: grab; }
.plan-dim line { stroke: #f0b44c; stroke-width: 1.2; stroke-dasharray: 4 3; }
.plan-readout { fill: #fff; font: 600 11px ui-monospace, Menlo, monospace; paint-order: stroke; stroke: #0f1216; stroke-width: 3px; pointer-events: none; }
.plan-guide { stroke: #4d8dff; stroke-width: 1; stroke-dasharray: 5 4; pointer-events: none; }
.plan-mount { fill: rgba(77, 141, 255, 0.18); stroke: #4d8dff; stroke-width: 2; }
.plan-marquee { fill: rgba(77, 141, 255, 0.12); stroke: #6ea2ff; stroke-width: 1; }
.plan-ruler text { fill: #6b7584; font: 10px ui-monospace, Menlo, monospace; pointer-events: none; }
.plan-scale { fill: #6b7584; font: 10.5px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; }
`

/** Save the Plan as a PNG (twice the screen's size). Returns a data URL, or null. */
export async function capturePlan(): Promise<string | null> {
  const svg = document.querySelector('svg.plan-view') as SVGSVGElement | null
  if (!svg) return null
  const w = svg.clientWidth
  const h = svg.clientHeight
  const copy = svg.cloneNode(true) as SVGSVGElement
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.setAttribute('width', String(w))
  copy.setAttribute('height', String(h))
  copy.querySelectorAll('.plan-turn').forEach((n) => n.remove())
  const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('could not draw the plan'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = w * 2
    canvas.height = h * 2
    const g = canvas.getContext('2d')!
    g.scale(2, 2)
    g.drawImage(img, 0, 0)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

const STRUCTURE_CARRIER = (kind: string) => ['totem', 'flexstand', 'tubeStand', 'tbar'].includes(kind)

function StructureShape({ it, w, h, side }: { it: PlanItem; w: number; h: number; side: string }) {
  const truss = it.category === 'Truss'
  const fill = CATEGORY_FILL[it.category ?? ''] ?? '#3a404c'
  // From the front or side a truss is a frame you see through: just its outline.
  if (truss && side !== 'top') return <rect x={-w / 2} y={-h / 2} width={w} height={h} className="st truss-edge" />
  if (truss) {
    return (
      <>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} className="st truss" fill="url(#truss-hatch)" />
        <rect x={-w / 2} y={-h / 2} width={w} height={h} className="st truss-edge" />
      </>
    )
  }
  const round = it.structureKind && /roundTable|highTop|discoBall|chandelier|totem|flexstand|tubeStand/.test(it.structureKind) && Math.abs(w - h) < 2
  if (round) return <ellipse rx={w / 2} ry={h / 2} fill={fill} className="st" />
  return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2} fill={fill} className={`st ${it.structureKind === 'stage' ? 'deck' : ''}`} />
}
