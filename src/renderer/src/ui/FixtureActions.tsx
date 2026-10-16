/**
 * Actions on fixtures right where they are in the 3D view:
 *  - a small bar that floats above the selection (mute, solo, hide, duplicate,
 *    mirror, invert pan/tilt), positioned every frame by the Viewport;
 *  - a right-click menu with everything, including hang/stand, rotate and delete.
 * Both call the same commands as the list, the inspector and the shortcuts.
 */
import { hasOwnStand } from '../model/catalog'
import { useEffect } from 'react'
import { useStore } from '../state/store'
import { useMix } from '../state/mix'
import { useFixtureMenu } from '../state/fixtureMenu'
import { useViewSettings } from '../state/viewSettings'
import { autoPlaceFixtures, deleteFixtures, detachFixtures, distributeFixtures, duplicateArray, duplicateFixtures, mirrorFixtures, mountFixtures, orientFixtures, selectSameType, updateFixtures } from '../state/commands'
import { notify } from '../state/notices'
import { attachOptions } from './StructureActions'
import { nearestMount } from '../model/physics'
import { getFixtureType } from '../model/fixtureTypes'
import { headsOf } from '../model/heads'
import { view } from '../state/viewBus'
import { MenuItem, MenuShell } from './Menu'
import { useStudio } from '../state/studio'
import { ArrangeMenu } from './ArrangeMenu'
import type { Fixture } from '../model/project'

/** Which selected fixtures can move (pan/tilt), so invert only shows when it means something. */
function movers(list: Fixture[]): Fixture[] {
  return list.filter((f) => headsOf(getFixtureType(f.typeId)).some((h) => h.ch.pan || h.ch.tilt))
}

type Tri = 'on' | 'off' | 'mixed'
function tri(values: boolean[]): Tri {
  if (values.length && values.every(Boolean)) return 'on'
  if (values.some(Boolean)) return 'mixed'
  return 'off'
}

function useSelectionInfo() {
  const fixtures = useStore((s) => s.project.fixtures)
  const selection = useStore((s) => s.selection)
  const mix = useMix()
  const chosen = fixtures.filter((f) => selection.includes(f.id))
  const moving = movers(chosen)
  return {
    chosen,
    ids: selection,
    moving,
    muted: tri(chosen.map((f) => mix.muted.includes(f.id))),
    solo: tri(chosen.map((f) => mix.solo.includes(f.id))),
    hidden: tri(chosen.map((f) => mix.hidden.includes(f.id))),
    invertPan: tri(moving.map((f) => !!f.invertPan)),
    invertTilt: tri(moving.map((f) => !!f.invertTilt)),
    hanging: tri(chosen.map((f) => f.mounting === 'hanging')),
    mix
  }
}

function orient(ids: string[], to: 'hanging' | 'floor') {
  const stuck = orientFixtures(ids, to)
  if (stuck.length) notify('error', `Nothing to hang ${stuck.length > 2 ? `${stuck.length} fixtures` : stuck.join(' and ')} from: add a truss from the Objects tab first.`)
}

function setInvert(ids: string[], key: 'invertPan' | 'invertTilt', current: Tri) {
  const on = current !== 'on'
  updateFixtures(ids, `${on ? 'Invert' : 'Un-invert'} ${key === 'invertPan' ? 'pan' : 'tilt'}`, (f) => ({ ...f, [key]: on }))
}

/** Edit a show's fixture type in Fixture Studio (your edited version if there is one). */
export function editFixtureType(typeId: string): void {
  useStudio.getState().openType(getFixtureType(typeId))
}

const shortTypeName = (typeId: string) => getFixtureType(typeId).name.replace(/\s*\([^)]*\)\s*$/, '')

export function FixtureHud() {
  const info = useSelectionInfo()
  const openMenu = useFixtureMenu((s) => s.open)
  if (!info.chosen.length) return null
  const { ids, mix, moving } = info
  const title = info.chosen.length === 1 ? info.chosen[0].name : `${info.chosen.length} fixtures`
  const movingIds = moving.map((f) => f.id)

  return (
    <div className="fixture-hud" onPointerDown={(e) => e.stopPropagation()}>
      <span className="hud-name" title={title}>
        {title}
      </span>
      <button className={`hud-btn ${info.muted !== 'off' ? 'on-mute' : ''}`} title="Mute (M): stop it doing anything" onClick={() => mix.toggle('muted', ids)}>
        M
      </button>
      <button className={`hud-btn ${info.solo !== 'off' ? 'on-solo' : ''}`} title="Solo (S): only soloed fixtures act" onClick={() => mix.toggle('solo', ids)}>
        S
      </button>
      <button className={`hud-btn ${info.hidden !== 'off' ? 'on' : ''}`} title="Hide (H)" onClick={() => mix.toggle('hidden', ids)}>
        Hide
      </button>
      <span className="hud-sep" />
      <button className="hud-btn" title="Duplicate on the same patch: mirrors the original (Cmd+D)" onClick={() => duplicateFixtures(ids)}>
        Dup
      </button>
      <button className="hud-btn" title="Mirror copy on the other side, panning the opposite way" onClick={() => mirrorFixtures(ids)}>
        Mirror
      </button>
      {moving.length > 0 && (
        <>
          <span className="hud-sep" />
          <button className={`hud-btn ${info.invertPan === 'on' ? 'on' : info.invertPan === 'mixed' ? 'mixed' : ''}`} title="Invert pan: same DMX, opposite direction" onClick={() => setInvert(movingIds, 'invertPan', info.invertPan)}>
            ⇄ Pan
          </button>
          <button className={`hud-btn ${info.invertTilt === 'on' ? 'on' : info.invertTilt === 'mixed' ? 'mixed' : ''}`} title="Invert tilt" onClick={() => setInvert(movingIds, 'invertTilt', info.invertTilt)}>
            ⇅ Tilt
          </button>
          <span className="hud-sep" />
          <button
            className="hud-btn"
            title={info.hanging === 'on' ? 'Totem mode: stand it upright (on the truss top, or the floor below)' : 'Truss mode: hang it upside down under the nearest truss'}
            onClick={() => orient(ids, info.hanging === 'on' ? 'floor' : 'hanging')}
          >
            {info.hanging === 'on' ? '⤒ Upright' : '⤓ Hang'}
          </button>
        </>
      )}
      <button
        className="hud-btn"
        title="More actions (or right-click the fixture)"
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

export function FixtureMenu() {
  const at = useFixtureMenu((s) => s.at)
  const close = useFixtureMenu((s) => s.close)
  const info = useSelectionInfo()
  const structures = useStore((s) => s.project.structures ?? [])

  useEffect(() => {
    if (!at) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at, close])

  if (!at || !info.chosen.length) return null
  const { ids, mix, moving } = info
  const movingIds = moving.map((f) => f.id)
  const run = (action: () => void) => () => {
    action()
    close()
  }
  const check = (t: Tri) => (t === 'on' ? '✓' : t === 'mixed' ? '–' : '')
  // Where it could go: the nearest truss to hang from, and the closest stands, totems and bars.
  const first = info.chosen[0]
  const hangTarget = nearestMount(structures, first.position, ['under'], 1e3)
  const attach = attachOptions(structures, first, 6).filter((o) => (o.point.kind !== 'under' || o.point.inside) && !(first.mount?.structure === o.structure.id && first.mount.point === o.point.id))

  const all = useStore.getState().selection
  const types = [...new Set(info.chosen.map((f) => f.typeId))]
  return (
    <MenuShell at={at} onClose={close}>
        <div className="menu-title">{info.chosen.length === 1 ? info.chosen[0].name : all.length > info.chosen.length ? `${all.length} items` : `${info.chosen.length} fixtures`}</div>
        <Item label={`Edit fixture${types.length > 1 ? ` “${shortTypeName(types[0])}”` : ''}…`} title="Open this fixture in Fixture Studio: change its channels, look or modes. Save & add to show updates every fixture of this type in the show." onClick={run(() => editFixtureType(info.chosen[0].typeId))} />
        <hr />
        <Item label="Mute" check={check(info.muted)} keys="M" onClick={run(() => mix.toggle('muted', ids))} />
        <Item label="Solo" check={check(info.solo)} keys="S" onClick={run(() => mix.toggle('solo', ids))} />
        <Item label="Hide" check={check(info.hidden)} keys="H" onClick={run(() => mix.toggle('hidden', ids))} />
        <hr />
        <Item label="Duplicate (same patch)" keys="⌘D" onClick={run(() => duplicateFixtures(ids))} />
        <Item label="Duplicate with its own patch" onClick={run(() => duplicateArray(ids, 1, [0.6, 0, 0], true))} />
        <Item label="Mirror copy" onClick={run(() => mirrorFixtures(ids))} />
        {moving.length > 0 && (
          <>
            <hr />
            <Item label="Invert pan" check={check(info.invertPan)} onClick={run(() => setInvert(movingIds, 'invertPan', info.invertPan))} />
            <Item label="Invert tilt" check={check(info.invertTilt)} onClick={run(() => setInvert(movingIds, 'invertTilt', info.invertTilt))} />
          </>
        )}
        <hr />
        {info.chosen.some((f) => hasOwnStand(getFixtureType(f.typeId).spec)) && (
          <Item
            label="Its own stand"
            check={info.chosen.every((f) => !f.hideStand) ? '✓' : info.chosen.every((f) => f.hideStand) ? '' : '–'}
            title="The stand this fixture comes with (a GigBar's pole). Take it off when it sits on a totem, the booth or a T-bar stand."
            onClick={run(() => {
              const off = info.chosen.some((f) => !f.hideStand)
              updateFixtures(ids, off ? 'Take off its stand' : 'Put its stand back', (f) => ({ ...f, hideStand: off || undefined }))
            })}
          />
        )}
        {info.chosen.some((f) => f.mount) && <Item label="Detach (stand on the floor)" onClick={run(() => detachFixtures(ids))} />}
        <Item label="Upright (totem mode)" check={info.hanging === 'off' ? '✓' : info.hanging === 'mixed' ? '–' : ''} onClick={run(() => orient(ids, 'floor'))} />
        <Item label={hangTarget ? `Hanging (truss mode): under ${hangTarget.structure.name}` : 'Hanging (truss mode)'} check={info.hanging === 'on' ? '✓' : info.hanging === 'mixed' ? '–' : ''} onClick={run(() => orient(ids, 'hanging'))} />
        {attach.map((o) => (
          <Item key={o.structure.id + o.point.id} label={`${o.point.label}: ${o.structure.name}`} onClick={run(() => mountFixtures(ids, o.structure.id, o.point.id, o.t))} />
        ))}
        <hr />
        <ArrangeMenu ids={all} run={run} />
        {ids.length > 1 && <Item label="Spread along the truss" onClick={run(() => distributeFixtures(ids, 'line', 'truss'))} />}
        <Item label="Auto-place by type" onClick={run(() => autoPlaceFixtures(ids))} />
        <Item label="Rotate 90° left" onClick={run(() => updateFixtures(ids, 'Rotate', (f) => ({ ...f, rotation: (((f.rotation ?? 0) + 90 + 180) % 360) - 180 })))} />
        <Item label="Rotate 90° right" onClick={run(() => updateFixtures(ids, 'Rotate', (f) => ({ ...f, rotation: (((f.rotation ?? 0) - 90 + 540) % 360) - 180 })))} />
        <hr />
        <Item label="Focus on it" keys="F" onClick={run(() => view.focus(ids))} />
        <Item label="Select same type" onClick={run(() => selectSameType(ids))} />
        <Item
          label="Show in inspector"
          onClick={run(() => {
            useViewSettings.getState().setFullView(false)
            useViewSettings.getState().setLeftTab('fixtures')
          })}
        />
        <hr />
        <Item label="Delete" keys="⌫" danger onClick={run(() => deleteFixtures(ids))} />
    </MenuShell>
  )
}

const Item = MenuItem
