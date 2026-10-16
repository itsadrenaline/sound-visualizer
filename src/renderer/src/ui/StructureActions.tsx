/**
 * Actions on objects (totems, truss, stages…) and on how fixtures attach to them:
 *  - the floating bar and right-click menu for a selected object,
 *  - the object inspector (sizes in feet, with the sizes the gear comes in),
 *  - "Attached to …" for fixtures, and the list of places a fixture can go.
 */
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useViewSettings } from '../state/viewSettings'
import { useStore } from '../state/store'
import { useFixtureMenu } from '../state/fixtureMenu'
import {
  deleteStructures,
  detachFixtures,
  duplicateStructures,
  mountFixtures,
  rotateStructures,
  setStructureParams,
  updateStructures
} from '../state/commands'
import { FT, mountPoints, nearestOn, paramsOf, STRUCTURE_KINDS, toLocal, TRUSS_OPTIONS, type Cover, type MountPoint, type ParamField, type Structure } from '../model/structures'
import { roomFit } from '../model/physics'
import { roomOf, type Fixture } from '../model/project'
import { view } from '../state/viewBus'
import { Icon } from './ObjectsPanel'
import { MenuItem, MenuShell } from './Menu'
import { ArrangeButtons, ArrangeMenu } from './ArrangeMenu'
import { Section } from './Section'

function useChosenStructures(): Structure[] {
  const structures = useStore((s) => s.project.structures)
  const fixtures = useStore((s) => s.project.fixtures)
  const selection = useStore((s) => s.selection)
  // The fixture tools take over when a fixture is selected too.
  if (fixtures.some((f) => selection.includes(f.id))) return []
  return (structures ?? []).filter((s) => selection.includes(s.id))
}

/** The floating object editor in the 3D view: open or not. */
export const useStructureEditor = create<{ open: boolean; set(open: boolean): void }>((set) => ({ open: false, set: (open) => set({ open }) }))

export function StructureHud() {
  const chosen = useChosenStructures()
  const openMenu = useFixtureMenu((s) => s.open)
  const editing = useStructureEditor((s) => s.open)
  const setEditing = useStructureEditor((s) => s.set)
  if (!chosen.length) return null
  const ids = chosen.map((s) => s.id)
  const title = chosen.length === 1 ? chosen[0].name : `${chosen.length} objects`
  // Quick heights for totems, stands and tube stands: 4 ft to 6 ft in one click.
  const sameKind = chosen.every((s) => s.kind === chosen[0].kind)
  const heightField = sameKind ? STRUCTURE_KINDS[chosen[0].kind].fields.find((f) => f.key === 'height' && f.presets) : undefined
  const heights = heightField && ['totem', 'flexstand', 'tubeStand', 'tbar', 'micStand', 'speakerOnPole', 'speakerOnSub'].includes(chosen[0].kind) ? heightField : undefined
  return (
    <div className="fixture-hud" onPointerDown={(e) => e.stopPropagation()}>
      <span className="hud-name" title={title}>
        {title}
      </span>
      <button className={`hud-btn ${editing ? 'on' : ''}`} title="Edit size, height and options (or double-click it)" onClick={() => setEditing(!editing)}>
        Edit
      </button>
      {heights && (
        <>
          {heights.presets!.map((h) => (
            <button key={h} className={`hud-btn ${Math.abs(ft(paramsOf(chosen[0]).height) - h) < 0.05 ? 'on' : ''}`} title={`Make it ${h} ft`} onClick={() => setStructureParams(ids, { height: Math.max(heights.min ?? 0, Math.min(heights.max ?? 10, h * FT)) })}>
              {h}′
            </button>
          ))}
          <span className="hud-sep" />
        </>
      )}
      <button className="hud-btn" title="Turn 90°" onClick={() => rotateStructures(ids, 90)}>
        ⟳ 90°
      </button>
      <button className="hud-btn" title="Duplicate, with copies of the fixtures on it" onClick={() => duplicateStructures(ids)}>
        Dup
      </button>
      <button className="hud-btn" title="Delete (what's on it falls to the floor)" onClick={() => deleteStructures(ids)}>
        Delete
      </button>
      <button
        className="hud-btn"
        title="More actions (or right-click it)"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          openMenu(r.left, r.bottom + 4)
        }}
      >
        ⋯
      </button>
    </div>
  )
}

export function StructureMenu() {
  const at = useFixtureMenu((s) => s.at)
  const close = useFixtureMenu((s) => s.close)
  const chosen = useChosenStructures()
  const fixtures = useStore((s) => s.project.fixtures)
  useEffect(() => {
    if (!at) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at, close])
  if (!at || !chosen.length) return null
  const ids = chosen.map((s) => s.id)
  const run = (action: () => void) => () => {
    action()
    close()
  }
  const attached = fixtures.filter((f) => f.mount && ids.includes(f.mount.structure))
  return (
    <MenuShell at={at} onClose={close}>
      <div className="menu-title">{chosen.length === 1 ? chosen[0].name : `${chosen.length} objects`}</div>
      <MenuItem label="Edit size and options…" onClick={run(() => openEditor(ids))} />
      <MenuItem label="Turn 90° left" onClick={run(() => rotateStructures(ids, 90))} />
      <MenuItem label="Turn 90° right" onClick={run(() => rotateStructures(ids, -90))} />
      <MenuItem label="Duplicate (with its fixtures)" onClick={run(() => duplicateStructures(ids))} />
      <hr />
      <ArrangeMenu ids={ids} run={run} />
      {attached.length > 0 && (
        <>
          <hr />
          <MenuItem label={`Select it with the ${attached.length} fixture${attached.length > 1 ? 's' : ''} on it`} onClick={run(() => useStore.getState().select([...ids, ...attached.map((f) => f.id)]))} />
          <MenuItem label={`Select just the fixture${attached.length > 1 ? 's' : ''} on it`} onClick={run(() => useStore.getState().select(attached.map((f) => f.id)))} />
          <MenuItem label="Take the fixtures off" onClick={run(() => detachFixtures(attached.map((f) => f.id)))} />
        </>
      )}
      <hr />
      <MenuItem label="Focus on it" onClick={run(() => view.focus(ids))} />
      <hr />
      <MenuItem label="Delete" danger onClick={run(() => deleteStructures(ids))} />
    </MenuShell>
  )
}

/** Open the object editor: the inspector lights up, or the floating editor in full view. */
function openEditor(ids: string[]) {
  useStore.getState().select(ids)
  useStructureEditor.getState().set(true)
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

/** Edit an object right in the 3D view: the same fields as the inspector, in a panel beside it. */
export function StructureEditor() {
  const chosen = useChosenStructures()
  const open = useStructureEditor((s) => s.open)
  const setOpen = useStructureEditor((s) => s.set)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])
  const fullView = useViewSettings((v) => v.fullView)
  // With the side panels showing, the inspector on the right is the editor (it lights up).
  if (!open || !chosen.length || !fullView) return null
  return (
    <div className="structure-editor" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button className="mini close" title="Close (Esc)" onClick={() => setOpen(false)}>
        ✕
      </button>
      <StructureInspector chosen={chosen} />
    </div>
  )
}

const ft = (m: number) => Math.round((m / FT) * 10) / 10

export function StructureInspector({ chosen }: { chosen: Structure[] }) {
  const fixtures = useStore((s) => s.project.fixtures)
  const project = useStore((s) => s.project)
  const first = chosen[0]
  const sameKind = chosen.every((s) => s.kind === first.kind)
  const info = STRUCTURE_KINDS[first.kind]
  const ids = chosen.map((s) => s.id)
  const attached = fixtures.filter((f) => f.mount && ids.includes(f.mount.structure))
  const fit = roomFit(project, roomOf(project).ceilingHeight)

  const editing = useStructureEditor((v) => v.open)
  return (
    <div className={`inspector ${editing ? 'editing' : ''}`}>
      <h2 className="with-icon">
        <Icon kind={first.kind} />
        {chosen.length === 1 ? first.name : `${chosen.length} objects`}
      </h2>
      <p className="hint">{info.description}</p>
      {chosen.length === 1 && <NameField structure={first} />}
      {sameKind && (
        <Section id="object:size" title="Size and options">
          {info.fields.map((field) => (
            <ParamInput key={field.key} field={field} chosen={chosen} />
          ))}
        </Section>
      )}
      <Section id="object:place" title="Place">
        <NumberField label="Left-right (ft)" value={chosen.length === 1 ? ft(first.position[0]) : null} onCommit={(v) => updateStructures(ids, 'Move object', (s) => ({ ...s, position: [v * FT, s.position[1], s.position[2]] }))} />
        <NumberField label="Front-back (ft)" value={chosen.length === 1 ? ft(first.position[2]) : null} onCommit={(v) => updateStructures(ids, 'Move object', (s) => ({ ...s, position: [s.position[0], s.position[1], v * FT] }))} />
        <NumberField label="Turn (°)" value={chosen.every((s) => s.rotation === first.rotation) ? first.rotation : null} onCommit={(v) => updateStructures(ids, 'Turn object', (s) => ({ ...s, rotation: v }))} />
        <div className="field">
          <span className="label">Stands on</span>
          <span className="sub">{first.position[1] > 0.001 ? `something ${ft(first.position[1])} ft up (a stage or table)` : 'the floor'}</span>
        </div>
      </Section>
      <ArrangeButtons ids={ids} />
      {fit.raised && <p className="hint">The ceiling has been raised to {ft(fit.ceiling)} ft so everything fits.</p>}
      {chosen.length === 1 && <MountList structure={first} />}
      {attached.length > 0 && (
        <Section id="object:on-it" title="On it">
          <ul className="set-list compact">
            {attached.map((f) => (
              <li key={f.id} onClick={() => useStore.getState().select([f.id])}>
                <span className="name">{f.name}</span>
                <span className="sub">{mountPoints(chosen.find((s) => s.id === f.mount!.structure)!).find((m) => m.id === f.mount!.point)?.label}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <div className="row-buttons">
        <button onClick={() => rotateStructures(ids, 90)} title="Turn it a quarter turn (what's on it turns too)">Turn 90°</button>
        <button onClick={() => duplicateStructures(ids)} title="A copy beside it, with copies of the fixtures on it (each with its own patch)">Duplicate</button>
        <button className="danger" onClick={() => deleteStructures(ids)} title="Delete it. Fixtures on it fall to the floor; Undo brings it back">
          Delete
        </button>
      </div>
    </div>
  )
}

/** Where things can go on this piece, with a quick "put the selected library fixture here". */
function MountList({ structure }: { structure: Structure }) {
  const points = mountPoints(structure)
  if (!points.length) return null
  return (
    <Section id="object:mounts" title="Fixtures go">
      <ul className="set-list compact">
        {points.map((m) => (
          <li key={m.id}>
            <span className="name">{m.label}</span>
            <span className="sub">{m.inside ? 'inside' : m.kind === 'under' ? 'hang' : m.kind === 'top' ? 'stand on top' : 'clamp'}</span>
          </li>
        ))}
      </ul>
      <p className="hint">Drag a fixture onto it with the Move tool (W), or drop one from the Library onto it.{points.some((m) => m.inside) ? ' Inside, a light glows through a white scrim; a black scrim hides it, and bare truss catches it on the metal.' : ''}</p>
    </Section>
  )
}

function NameField({ structure }: { structure: Structure }) {
  const [draft, setDraft] = useState(structure.name)
  useEffect(() => setDraft(structure.name), [structure.name])
  const commit = () => draft.trim() && draft !== structure.name && updateStructures([structure.id], 'Rename object', (s) => ({ ...s, name: draft.trim() }))
  return (
    <label className="field">
      <span className="label">Name</span>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  )
}

function NumberField({ label, value, onCommit, step = 0.5 }: { label: string; value: number | null; onCommit: (v: number) => void; step?: number }) {
  const shown = value === null ? '' : String(value)
  const [draft, setDraft] = useState(shown)
  useEffect(() => setDraft(shown), [shown])
  const commit = () => {
    const n = Number(draft)
    if (draft.trim() === '' || Number.isNaN(n) || draft === shown) return setDraft(shown)
    onCommit(n)
  }
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input type="number" step={step} placeholder={value === null ? 'Mixed' : ''} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  )
}

function ParamInput({ field, chosen }: { field: ParamField; chosen: Structure[] }) {
  const ids = chosen.map((s) => s.id)
  const values = chosen.map((s) => paramsOf(s)[field.key])
  const mixed = values.some((v) => v !== values[0])
  const value = mixed ? null : values[0]
  switch (field.kind) {
    case 'length': {
      const clamp = (m: number) => Math.max(field.min ?? 0, Math.min(field.max ?? 100, m))
      return (
        <div className="field">
          <NumberField label={`${field.label} (ft)`} value={value === null ? null : ft(value as number)} onCommit={(v) => setStructureParams(ids, { [field.key]: clamp(v * FT) })} />
          <div className="stepper">
            <button className="mini" title="Half a foot less" onClick={() => setStructureParams(ids, { [field.key]: clamp(((value as number) ?? 0) - FT / 2) })}>
              −
            </button>
            <input
              type="range"
              min={field.min ?? 0}
              max={field.max ?? 10}
              step={FT / 12}
              value={(value as number) ?? field.min ?? 0}
              onChange={(e) => setStructureParams(ids, { [field.key]: clamp(Number(e.target.value)) })}
            />
            <button className="mini" title="Half a foot more" onClick={() => setStructureParams(ids, { [field.key]: clamp(((value as number) ?? 0) + FT / 2) })}>
              +
            </button>
          </div>
          {field.presets && (
            <div className="presets">
              {field.presets.map((p) => (
                <button key={p} className={`mini ${value !== null && Math.abs(ft(value as number) - p) < 0.05 ? 'on' : ''}`} onClick={() => setStructureParams(ids, { [field.key]: clamp(p * FT) })}>
                  {p}′
                </button>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'count':
      return <NumberField label={field.label} step={1} value={value as number | null} onCommit={(v) => setStructureParams(ids, { [field.key]: Math.round(Math.max(field.min ?? 1, Math.min(field.max ?? 20, v))) })} />
    case 'boolean':
      return (
        <label className="field">
          <span className="label">{field.label}</span>
          <span className="check">
            <input type="checkbox" checked={value === true} onChange={(e) => setStructureParams(ids, { [field.key]: e.target.checked })} />
            {value ? 'Yes' : 'No'}
          </span>
        </label>
      )
    case 'cover':
      return (
        <label className="field">
          <span className="label">{field.label}</span>
          <select value={(value as string) ?? ''} onChange={(e) => setStructureParams(ids, { cover: e.target.value as Cover })}>
            {value === null && <option value="">Mixed</option>}
            <option value="none">{field.coverNames?.none ?? 'None'}</option>
            <option value="white">{field.coverNames?.white ?? 'White'}</option>
            <option value="black">{field.coverNames?.black ?? 'Black'}</option>
          </select>
        </label>
      )
    case 'choice':
      return (
        <div className="field">
          <span className="label">{field.label}</span>
          <div className="presets">
            {(field.options ?? []).map(([label, v]) => (
              <button key={label} className={`mini ${value === v ? 'on' : ''}`} onClick={() => setStructureParams(ids, { [field.key]: v })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )
    case 'truss':
      return (
        <label className="field">
          <span className="label">{field.label}</span>
          <select value={value === null ? '' : String(value)} onChange={(e) => setStructureParams(ids, { truss: Number(e.target.value) })}>
            {value === null && <option value="">Mixed</option>}
            {TRUSS_OPTIONS.map(([name, size]) => (
              <option key={name} value={size}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )
  }
}

// ---------------------------------------------------------------------------
// Fixtures on objects
// ---------------------------------------------------------------------------

/** Places a fixture could attach, nearest first: "Top plate of Totem 6 ft", "Under Main truss". */
export function attachOptions(structures: Structure[], fixture: Fixture, limit = 6): Array<{ structure: Structure; point: MountPoint; t: number; distance: number }> {
  const out: Array<{ structure: Structure; point: MountPoint; t: number; distance: number }> = []
  for (const s of structures) {
    const local = toLocal(s, fixture.position)
    for (const m of mountPoints(s)) {
      const { t, distance } = nearestOn(m, local)
      out.push({ structure: s, point: m, t, distance })
    }
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, limit)
}

/** In the fixture inspector: what it's attached to, with Detach, or the nearest places to attach it. */
export function FixtureMount({ fixtures }: { fixtures: Fixture[] }) {
  const structures = useStore((s) => s.project.structures ?? [])
  const ids = fixtures.map((f) => f.id)
  const mounted = fixtures.filter((f) => f.mount)
  const first = fixtures[0]
  const on = first.mount && structures.find((s) => s.id === first.mount!.structure)
  const point = on && mountPoints(on).find((m) => m.id === first.mount!.point)
  const options = structures.length ? attachOptions(structures, first, 6).filter((o) => !(first.mount?.structure === o.structure.id && first.mount.point === o.point.id)).slice(0, 5) : []
  return (
    <Section id="fixture:attached" title="Attached to">
      {mounted.length === 0 ? (
        <p className="hint">Nothing: {first.mounting === 'hanging' ? 'it hangs where it is' : 'it stands on what is below it'}.</p>
      ) : mounted.length === fixtures.length && on && fixtures.every((f) => f.mount?.structure === on.id) ? (
        <p className="sub">
          {point?.label} of <a onClick={() => useStore.getState().select([on.id])}>{on.name}</a>
        </p>
      ) : (
        <p className="sub">{mounted.length} of {fixtures.length} are attached to something.</p>
      )}
      {mounted.length > 0 && (
        <button className="mini" onClick={() => detachFixtures(mounted.map((f) => f.id))} title="Take them off what they're attached to; they stand on the floor">
          Detach
        </button>
      )}
      {options.length > 0 && (
        <div className="attach-options">
          {options.map((o) => (
            <button key={o.structure.id + o.point.id} className="mini" title={`${Math.round(o.distance * 10) / 10} m away`} onClick={() => mountFixtures(ids, o.structure.id, o.point.id, o.t)}>
              {o.point.label} · {o.structure.name}
            </button>
          ))}
        </div>
      )}
    </Section>
  )
}
