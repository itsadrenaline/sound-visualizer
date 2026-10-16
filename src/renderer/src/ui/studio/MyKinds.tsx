/**
 * Your own kinds of light in the Studio: the panel that starts a fixture from
 * one (next to the built-in kinds on the first screen), and the "Save as a
 * kind of light" form under Look.
 */
import { useState } from 'react'
import { KINDS, type FixtureDef } from '../../model/fixtureDef'
import { describeStart } from '../../model/fixtureStarts'
import { myKindChannels, startFromMyKind, useMyKinds, type MyKind } from '../../state/myKinds'
import { notify } from '../../state/notices'
import { KindIcon } from './LookPanel'

/** After picking one of your kinds: what it is, and a button to start from it. */
export function MyKindPicker({ kind, name, maker, onPick, onClose }: { kind: MyKind; name?: string; maker?: string; onPick: (def: FixtureDef, note: string) => void; onClose?: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const sample = startFromMyKind(kind, name, maker)
  const count = myKindChannels(kind)
  const modes = kind.template.modes
  return (
    <div className="start-picker">
      <div className="sp-head">
        <KindIcon kind={kind.template.kind} />
        <div>
          <div className="sp-title">{kind.label}</div>
          <div className="sp-sub">{kind.explain ? kind.explain.replace(/([^.!?])$/, '$1.') : `Your own kind of light, based on ${KINDS[kind.template.kind].label.toLowerCase()}.`} You can change any channel afterwards.</div>
        </div>
        {onClose && (
          <button className="mini sp-close" onClick={onClose} title="Back to all the kinds of light">
            All kinds
          </button>
        )}
      </div>
      <div className="sp-list">
        <button className="sp-row common" onClick={() => onPick(sample, `Started from your kind of light “${kind.label}”.`)} title={describeStart(sample)}>
          <span className="sp-num">
            <span className="sp-count">{count}</span>
            <span className="sp-ch">ch</span>
          </span>
          <span className="sp-text">
            <span className="sp-label">{modes.length > 1 ? `${modes.length} modes: ${modes.map((m) => m.name).join(', ')}` : modes[0]?.name ?? 'No channels yet'}</span>
            <span className="sp-desc">{describeStart(sample)}</span>
          </span>
          <span className="sp-badge" title="One of your own kinds of light">Yours</span>
        </button>
      </div>
      <div className="sp-custom">
        {confirm ? (
          <>
            <span>Delete “{kind.label}”? Fixtures made from it stay as they are.</span>
            <button
              className="mini danger"
              onClick={() => {
                useMyKinds.getState().remove(kind.id)
                onClose?.()
              }}
            >
              Delete
            </button>
            <button className="mini" onClick={() => setConfirm(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button className="mini" onClick={() => setConfirm(true)} title="Remove this kind from the list (fixtures made from it aren't changed)">
            Delete this kind…
          </button>
        )}
      </div>
    </div>
  )
}

/** Under Look: save the fixture being edited as a new kind of light, to start the next one from. */
export function SaveAsKind({ def }: { def: FixtureDef }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [explain, setExplain] = useState('')
  if (!open)
    return (
      <button
        className="mini save-kind"
        title="Keep this fixture's channels, parts and look as a new kind of light: it's listed with the built-in kinds when you start the next fixture"
        onClick={() => {
          setLabel(def.name && def.name !== 'New fixture' ? def.name : '')
          setOpen(true)
        }}
      >
        + Save as a new kind of light…
      </button>
    )
  return (
    <div className="save-kind-form">
      <label className="field small">
        <span className="label">Name</span>
        <input autoFocus placeholder="e.g. LED stand, String lights 20 bulbs" value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="field small">
        <span className="label">What it is (optional)</span>
        <input placeholder="e.g. A stand with an RGB LED strip up the pole" value={explain} onChange={(e) => setExplain(e.target.value)} />
      </label>
      <div className="row-actions">
        <button
          className="mini primary"
          disabled={!label.trim()}
          onClick={() => {
            useMyKinds.getState().save(def, label, explain)
            notify('info', `Saved “${label.trim()}” as a kind of light: it's listed under Your kinds when you start a fixture.`)
            setOpen(false)
          }}
        >
          Save kind
        </button>
        <button className="mini" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}
