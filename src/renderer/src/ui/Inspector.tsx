/**
 * A generic inspector: it knows nothing about fixtures. It draws a field for
 * each property descriptor and edits every selected fixture at once.
 */
import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { isAcrylicPanel, joinPanels, orientFixtures, panelSize, setPanel, updateFixtures } from '../state/commands'
import { notify } from '../state/notices'
import { FIXTURE_PROPERTIES, type PropertyDescriptor } from '../state/properties'
import { footprint, type Fixture } from '../model/project'
import { mirrorsOf } from '../model/patchCheck'
import { SelectionProblems } from './PatchProblems'
import { getFixtureType, isOverridden } from '../model/fixtureTypes'
import { useStudio } from '../state/studio'
import { useLibrary } from '../state/library'
import { modeChoices, setFixtureMode } from '../state/modes'
import { originalFixtureType } from '../model/fixtureTypes'
import { ArrangePanel } from './ArrangePanel'
import { ArrangeButtons } from './ArrangeMenu'
import { FixtureMount, NumberField, StructureInspector } from './StructureActions'
import { Section } from './Section'

export function Inspector() {
  const fixtures = useStore((s) => s.project.fixtures)
  const selection = useStore((s) => s.selection)
  const structures = useStore((s) => s.project.structures)
  const selected = fixtures.filter((f) => selection.includes(f.id))
  const pieces = (structures ?? []).filter((s) => selection.includes(s.id))

  if (selected.length === 0 && pieces.length) return <StructureInspector chosen={pieces} />
  if (selected.length === 0) {
    return (
      <div className="inspector">
        <h2>Inspector</h2>
        <p className="hint">Select a fixture in the list or the 3D view.</p>
      </div>
    )
  }

  const mirrors = selected.length === 1 ? mirrorsOf(fixtures, selected[0]) : []

  return (
    <div className="inspector">
      <h2>{selected.length === 1 ? selected[0].name : `${selected.length} fixtures`}</h2>
      {pieces.length > 0 && <p className="hint">Also selected: {pieces.length === 1 ? pieces[0].name : `${pieces.length} objects`}. Moving and lining up takes them all.</p>}
      <SelectionProblems ids={selected.map((f) => f.id)} />
      {mirrors.length > 0 && (
        <p className="mirror-note" title="Fixtures of the same type on the same address get the same DMX, so they move together: that's how copies work">
          Mirrors {mirrors.length === 1 ? mirrors[0].name : `${mirrors.length} copies`} on the same patch.{' '}
          <a onClick={() => useStore.getState().select([selected[0].id, ...mirrors.map((m) => m.id)])}>Select {mirrors.length === 1 ? 'both' : 'them all'}</a>
        </p>
      )}
      {selected.length === 1 && <TypeInfo fixture={selected[0]} />}
      <ModeField fixtures={selected} />
      <FixtureMount fixtures={selected} />
      <ArrangeButtons ids={selection} />
      <PanelSection fixtures={selected} />
      {FIXTURE_PROPERTIES.map(({ section, properties }) => (
        <Section key={section} id={`fixture:${section}`} title={section}>
          {properties.map((p) => (
            <Field key={p.key} property={p} fixtures={selected} />
          ))}
        </Section>
      ))}
      <ArrangePanel ids={selection} />
    </div>
  )
}

function Field({ property, fixtures }: { property: PropertyDescriptor; fixtures: Fixture[] }) {
  const values = fixtures.map((f) => property.get(f) as string | number | boolean)
  const mixed = values.some((v) => v !== values[0])
  const shown = mixed ? '' : String(values[0])
  const ids = fixtures.map((f) => f.id)

  // Text and number fields keep a local draft and commit on Enter or when you leave the field,
  // so typing "120" is one undo step, not three.
  const [draft, setDraft] = useState(shown)
  useEffect(() => setDraft(shown), [shown])

  const commit = (raw: string) => {
    if (raw === shown) return
    if (property.kind === 'number') {
      const n = Number(raw)
      if (raw.trim() === '' || Number.isNaN(n)) return setDraft(shown)
      const v = Math.max(property.min, Math.min(property.max, n))
      updateFixtures(ids, `Set ${property.label}`, (f) => property.set(f, v))
    } else if (property.kind === 'text') {
      updateFixtures(ids, `Set ${property.label}`, (f) => property.set(f, raw))
    }
  }

  return (
    <label className="field" title={property.hint}>
      <span className="label">
        {property.label}
        {property.kind === 'number' && property.unit ? ` (${property.unit})` : ''}
      </span>
      {property.kind === 'boolean' ? (
        <span className="check">
          <input
            type="checkbox"
            checked={!mixed && values[0] === (true as unknown)}
            ref={(el) => {
              if (el) el.indeterminate = mixed
            }}
            onChange={(e) => updateFixtures(ids, `Set ${property.label}`, (f) => property.set(f, e.target.checked))}
          />
          {mixed ? 'Mixed' : values[0] ? 'On' : 'Off'}
        </span>
      ) : property.kind === 'select' ? (
        <select
          value={mixed ? '' : String(values[0])}
          onChange={(e) => {
            // Hanging needs a truss: go through the command that finds one.
            if (property.key === 'mounting') {
              const stuck = orientFixtures(ids, e.target.value as 'hanging' | 'floor')
              if (stuck.length) notify('error', `Nothing to hang ${stuck.join(', ')} from: add a truss in the Objects tab.`)
            } else updateFixtures(ids, `Set ${property.label}`, (f) => property.set(f, e.target.value))
          }}
        >
          {mixed && <option value="">Mixed</option>}
          {property.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={property.kind === 'number' ? 'number' : 'text'}
          step={property.kind === 'number' ? property.step : undefined}
          placeholder={mixed ? 'Mixed' : ''}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setDraft(shown)
          }}
        />
      )}
      {property.hint && <span className="hint">{property.hint}</span>}
    </label>
  )
}

/** What the fixture is: make, model, mode, real size and where it's patched. */
function TypeInfo({ fixture }: { fixture: Fixture }) {
  const type = getFixtureType(fixture.typeId)
  const size = type.spec?.size
  const end = fixture.address + footprint(fixture) - 1
  return (
    <div className="type-info">
      <div>{type.name}</div>
      <div className="sub">
        {[type.manufacturer, type.source].filter(Boolean).join(' · ')}
        {size ? ` · ${size.map((v) => Math.round(v * 1000)).join(' × ')} mm` : ''}
      </div>
      <div className="sub">
        Universe {fixture.universe + 1}, channels {fixture.address}–{end} ({footprint(fixture)} ch)
      </div>
      {type.lookGuessed && !isOverridden(fixture.typeId) && <div className="sub warn-text">Its look is a guess: open it in Fixture Studio to choose its real shape and size.</div>}
      <button className="mini studio-open" onClick={() => useStudio.getState().openType(type)} title="See every channel on a 3D twin, test it, and fix or improve it">
        Open in Fixture Studio
      </button>
    </div>
  )
}

/**
 * Every DMX mode the fixture comes in (from its Library entry or its SoundSwitch
 * definition), to switch to another one.
 */
function ModeField({ fixtures }: { fixtures: Fixture[] }) {
  const entries = useLibrary((s) => s.entries)
  useEffect(() => void useLibrary.getState().load(), [])
  const typeId = fixtures[0]?.typeId
  if (!typeId || fixtures.some((f) => f.typeId !== typeId)) return null
  void entries
  const choices = modeChoices(originalFixtureType(typeId))
  if (!choices || choices.modes.length < 2) return null
  const fromSoundSwitch = fixtures.some((f) => f.soundswitchKey)
  return (
    <label className="field">
      <span className="label">DMX mode</span>
      <select
        value={choices.current}
        disabled={fromSoundSwitch}
        onChange={(e) => {
          const mode = Number(e.target.value)
          void setFixtureMode(fixtures.map((f) => f.id), mode).then((t) => {
            if (!t) notify('error', 'That mode could not be loaded from the Library.')
          })
        }}
      >
        {choices.modes.map((m, i) => (
          <option key={i} value={i}>
            {m.name} ({m.channels} ch)
          </option>
        ))}
      </select>
      <span className="sub">
        {fromSoundSwitch
          ? `All ${choices.modes.length} modes it comes in. SoundSwitch sets which one: change it in SoundSwitch's patch and it updates here.`
          : `It comes in ${choices.modes.length} modes. A mode with more channels may overlap the next fixture's address.`}
      </span>
    </label>
  )
}

const INCH = 0.0254

/** An LED acrylic panel's size and frame colour, and joining panels into a row. */
function PanelSection({ fixtures }: { fixtures: Fixture[] }) {
  const panels = fixtures.filter(isAcrylicPanel)
  if (!panels.length) return null
  const ids = panels.map((f) => f.id)
  const same = <T,>(values: T[]): T | null => (values.every((v) => v === values[0]) ? values[0] : null)
  const inches = (m: number) => Math.round(m / INCH)
  const width = same(panels.map((f) => inches(panelSize(f)[0])))
  const height = same(panels.map((f) => inches(panelSize(f)[1])))
  const border = same(panels.map((f) => f.panel?.border ?? 'white'))
  const clamp = (n: number) => Math.max(4, Math.min(120, n)) * INCH
  return (
    <Section id="fixture:panel" title="Panel" hint="Each panel's own size and frame. The RGBW strip inside lights it from the edges.">
      <NumberField label="Width (in)" step={1} value={width} onCommit={(v) => setPanel(ids, { width: clamp(v) })} />
      <NumberField label="Height (in)" step={1} value={height} onCommit={(v) => setPanel(ids, { height: clamp(v) })} />
      <label className="field">
        <span className="label">Frame</span>
        <select value={border ?? ''} onChange={(e) => setPanel(ids, { border: e.target.value as 'white' | 'black' | 'silver' })}>
          {border === null && <option value="">Mixed</option>}
          <option value="white">White</option>
          <option value="black">Black</option>
          <option value="silver">Silver</option>
        </select>
      </label>
      {panels.length > 1 && (
        <button onClick={() => joinPanels(ids)} title="Line the panels up edge to edge in a row, from the leftmost one">
          Join side by side
        </button>
      )}
    </Section>
  )
}
