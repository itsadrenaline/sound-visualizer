/**
 * File ▸ New Show…: start from a SoundSwitch project (pick it, tick the fixtures
 * this show uses, say how many of each and where they go), from scratch, by
 * describing it, or with the demo. Every step can be changed before the show
 * is made, and making it is one undo step.
 */
import { useEffect, useMemo, useState } from 'react'
import { useWizards } from '../state/wizards'
import { useViewSettings } from '../state/viewSettings'
import { useDocument } from '../state/document'
import { view } from '../state/viewBus'
import { notify } from '../state/notices'
import { startFromTemplate, TEMPLATES } from '../state/shows'
import {
  chooseFromText,
  createEmptyShow,
  createShowFromSoundSwitch,
  groupRows,
  planSummary,
  rowsFor,
  WHERE_LABELS,
  type PickRow,
  type Room,
  type Where
} from '../state/newShow'
import type { SoundSwitchProfile } from '../../../shared/ipc'
import type { SoundSwitchFixture } from '../../../shared/soundswitch'

type Start = 'soundswitch' | 'scratch' | 'describe' | 'demo'
type Step = 'start' | 'profile' | 'fixtures' | 'finish'

const STEPS: Record<Start, Step[]> = {
  soundswitch: ['start', 'profile', 'fixtures', 'finish'],
  scratch: ['start', 'finish'],
  describe: ['start', 'finish'],
  demo: ['start']
}
const STEP_NAMES: Record<Step, string> = { start: 'Start', profile: 'SoundSwitch project', fixtures: 'Fixtures', finish: 'Stage & name' }

export function NewShow() {
  const open = useWizards((s) => s.newShow)
  const close = useWizards((s) => s.closeNewShow)
  const [start, setStart] = useState<Start | null>(null)
  const [step, setStep] = useState<Step>('start')
  const [profiles, setProfiles] = useState<SoundSwitchProfile[] | null>(null)
  const [profile, setProfile] = useState<SoundSwitchProfile | null>(null)
  const [rows, setRows] = useState<PickRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [room, setRoom] = useState<Room>('basic')
  const [mirror, setMirror] = useState(true)
  const [standFt, setStandFt] = useState(6)

  // Fresh every time it opens; opened with a project (from the toolbar), it goes straight to that project's fixtures.
  useEffect(() => {
    if (!open) return
    setStart(null)
    setStep('start')
    setProfile(null)
    setRows([])
    setError('')
    setName('')
    setRoom('basic')
    window.api?.soundSwitchProfiles().then(setProfiles).catch(() => setProfiles([]))
    const preset = useWizards.getState().newShowProject
    if (preset) {
      setStart('soundswitch')
      setStep('profile')
      void pickProfile({ path: preset.path, name: preset.name, fixtures: 0, modified: Date.now(), open: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null
  const steps = STEPS[start ?? 'soundswitch']
  const at = steps.indexOf(step)

  const choose = (s: Start) => {
    setStart(s)
    if (s === 'demo') {
      close(true)
      void startFromTemplate('club').then(() => useViewSettings.getState().setDemo(true))
      return
    }
    setName(s === 'describe' ? 'My show' : 'New show')
    setStep(s === 'soundswitch' ? 'profile' : 'finish')
  }

  const pickProfile = async (p: SoundSwitchProfile) => {
    if (!window.api) return
    setLoading(true)
    setError('')
    const r = await window.api.readSoundSwitchProfile(p.path)
    setLoading(false)
    if ('error' in r) return setError(r.error)
    setProfile(p)
    setRows(rowsFor(r.fixtures))
    setName(`${r.name} show`)
    setStep('fixtures')
  }

  const browse = async () => {
    const path = await window.api?.browseSoundSwitchProfile()
    if (!path) return
    const name = path.split('/').pop()!.replace(/\.ssproj$/, '')
    void pickProfile({ path, name, fixtures: 0, modified: Date.now(), open: false })
  }

  const finish = () => {
    const showName = name.trim() || 'New show'
    if (start === 'soundswitch' && profile) {
      try {
        createShowFromSoundSwitch({ name: showName, room, profile: { name: profile.name, path: profile.path }, rows, mirrorPairs: mirror, standFt })
      } catch (error) {
        // Never leave the wizard stuck on a button that does nothing: say what went wrong.
        window.api?.log('error', 'Making a show from SoundSwitch failed', String((error as Error)?.stack ?? error))
        setError(`Couldn't make the show: ${(error as Error).message}. Please send the log (Help ▸ Open Log Folder) so it can be fixed.`)
        return
      }
      // From now on this Mac follows that SoundSwitch project.
      window.api?.useSoundSwitchProfile(profile.path)
      const s = planSummary(rows)
      notify('info', `"${showName}": ${s.fixtures} fixtures from ${profile.name}${s.copies ? ` (${s.copies} copies on the same patch)` : ''}. It follows SoundSwitch: patch changes there show up here.`)
    } else {
      createEmptyShow(showName, room)
      if (start === 'describe') useViewSettings.getState().setBuilder(true)
      else {
        useViewSettings.getState().setFullView(false)
        useViewSettings.getState().setLeftTab('library')
      }
    }
    useDocument.getState().setSaved(null, null)
    close(start === 'describe' ? 'build' : true)
    setTimeout(() => view.home(), 50)
  }

  const back = () => setStep(steps[Math.max(0, at - 1)])

  return (
    <div className="wizard-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="wizard" role="dialog" aria-label="New show">
        <div className="wizard-head">
          <h2>New show</h2>
          {start && start !== 'demo' && (
            <ol className="wizard-steps">
              {steps.map((s, i) => (
                <li key={s} className={i === at ? 'now' : i < at ? 'done' : ''}>
                  <span>{i + 1}</span>
                  {STEP_NAMES[s]}
                </li>
              ))}
            </ol>
          )}
          <button className="mini" onClick={() => close()} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="wizard-body">
          {step === 'start' && <StartStep profiles={profiles} onChoose={choose} onTemplate={(id) => (close(true), void startFromTemplate(id))} />}
          {step === 'profile' && <ProfileStep profiles={profiles} loading={loading} error={error} onPick={pickProfile} onBrowse={browse} />}
          {step === 'fixtures' && profile && <FixturesStep profile={profile} rows={rows} setRows={setRows} mirror={mirror} setMirror={setMirror} standFt={standFt} setStandFt={setStandFt} />}
          {step === 'finish' && <FinishStep name={name} setName={setName} room={room} setRoom={setRoom} start={start!} summary={start === 'soundswitch' ? planSummary(rows) : null} />}
          {step === 'finish' && error && <p className="problem">{error}</p>}
        </div>

        {step !== 'start' && (
          <div className="wizard-foot">
            <button onClick={back}>Back</button>
            <div className="spacer" />
            {step === 'fixtures' && (
              <button className="primary" disabled={!rows.some((r) => r.include)} onClick={() => setStep('finish')}>
                Next: stage & name
              </button>
            )}
            {step === 'finish' && (
              <button className="primary" onClick={finish}>
                {start === 'soundswitch' ? 'Create show' : start === 'describe' ? 'Create and describe it' : 'Create empty show'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function StartStep({ profiles, onChoose, onTemplate }: { profiles: SoundSwitchProfile[] | null; onChoose: (s: Start) => void; onTemplate: (id: string) => void }) {
  const inApp = !!window.api
  const found = profiles?.length ?? 0
  return (
    <>
      <p className="wizard-lead">How do you want to start?</p>
      <div className="start-cards">
        <button className="start-card" disabled={!inApp} onClick={() => onChoose('soundswitch')}>
          <StartIcon kind="soundswitch" />
          <strong>From my SoundSwitch</strong>
          <span>Pick a SoundSwitch project and choose which fixtures this show uses, how many of each, and where they go.</span>
          <em>{!inApp ? 'In the Mac app' : profiles === null ? 'Looking for projects…' : found ? `${found} project${found > 1 ? 's' : ''} found` : 'No projects found yet: you can browse for one'}</em>
        </button>
        <button className="start-card" onClick={() => onChoose('describe')}>
          <StartIcon kind="describe" />
          <strong>Describe it</strong>
          <span>Type or say what you want, like “two moving heads on 6 ft totems either side of the stage”, and it's built for you.</span>
        </button>
        <button className="start-card" onClick={() => onChoose('scratch')}>
          <StartIcon kind="scratch" />
          <strong>Start from scratch</strong>
          <span>An empty stage. Add fixtures from the library, patch them and place them yourself.</span>
        </button>
        <button className="start-card" onClick={() => onChoose('demo')}>
          <StartIcon kind="demo" />
          <strong>Demo show</strong>
          <span>A ready-made club rig with a light show playing. The quickest way to see what the app does.</span>
        </button>
      </div>
      <div className="template-row">
        <span>Or start from a ready-made rig:</span>
        {TEMPLATES.filter((t) => t.id !== 'empty').map((t) => (
          <button key={t.id} className="mini" title={t.description} onClick={() => onTemplate(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
    </>
  )
}

function ProfileStep({ profiles, loading, error, onPick, onBrowse }: { profiles: SoundSwitchProfile[] | null; loading: boolean; error: string; onPick: (p: SoundSwitchProfile) => void; onBrowse: () => void }) {
  return (
    <>
      <p className="wizard-lead">Which SoundSwitch project is this show for?</p>
      <p className="hint">Each SoundSwitch project has its own fixtures and patch. The show will follow the one you pick.</p>
      <div className="profile-list">
        {profiles === null && <p className="hint">Looking…</p>}
        {profiles?.map((p) => (
          <button key={p.path} className="profile" disabled={loading} onClick={() => onPick(p)} title={p.path}>
            <strong>{p.name}</strong>
            <span>
              {p.fixtures} fixture{p.fixtures === 1 ? '' : 's'} · changed {new Date(p.modified).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            {p.open && <em>Open in SoundSwitch</em>}
          </button>
        ))}
        {profiles?.length === 0 && <p className="hint">No SoundSwitch projects in Music, Documents, Downloads or Desktop. Browse for the .ssproj folder, or open the project in SoundSwitch and come back.</p>}
      </div>
      <button className="quiet" onClick={onBrowse}>
        Browse for another project…
      </button>
      {loading && <p className="hint">Reading the project…</p>}
      {error && <p className="problem">{error}</p>}
    </>
  )
}

function FixturesStep(props: {
  profile: SoundSwitchProfile
  rows: PickRow[]
  setRows: (r: PickRow[]) => void
  mirror: boolean
  setMirror: (v: boolean) => void
  standFt: number
  setStandFt: (v: number) => void
}) {
  const { profile, rows, setRows } = props
  const [text, setText] = useState('')
  const [understood, setUnderstood] = useState<string[]>([])
  const groups = useMemo(() => groupRows(rows), [rows])
  const summary = planSummary(rows)
  const update = (keys: string[], change: Partial<PickRow>) => setRows(rows.map((r) => (keys.includes(r.key) ? { ...r, ...change } : r)))
  const usesStands = rows.some((r) => r.include && ['totems', 'flexstands', 'tubeStands'].includes(r.where))

  const apply = () => {
    if (!text.trim()) return
    const r = chooseFromText(text, rows)
    setRows(r.rows)
    setUnderstood(r.understood.length ? r.understood : ["Didn't recognise any of your fixtures there: try their names as SoundSwitch shows them below."])
    if (r.standFt) props.setStandFt(r.standFt)
  }

  return (
    <>
      <p className="wizard-lead">
        Which fixtures from <strong>{profile.name}</strong> are in this show?
      </p>
      <div className="say-it">
        <textarea
          rows={2}
          value={text}
          placeholder="Say it, or tick below: “two copies of the movers on 6 ft totems, the IR4s along the front, skip the tubes”"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              apply()
            }
          }}
        />
        <button onClick={apply} disabled={!text.trim()}>
          Apply
        </button>
      </div>
      {understood.length > 0 && (
        <ul className="understood">
          {understood.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      )}

      <div className="pick-tools">
        <button className="mini" onClick={() => update(rows.map((r) => r.key), { include: true })}>
          All
        </button>
        <button className="mini" onClick={() => update(rows.map((r) => r.key), { include: false })}>
          None
        </button>
        <span className="pick-summary">
          <strong>{summary.fixtures}</strong> fixture{summary.fixtures === 1 ? '' : 's'} from {summary.patches} patch{summary.patches === 1 ? '' : 'es'}
          {summary.copies ? ` · ${summary.copies} cop${summary.copies === 1 ? 'y' : 'ies'} on the same DMX` : ''} · {summary.universes} universe{summary.universes === 1 ? '' : 's'}
        </span>
      </div>

      <div className="pick-list">
        {groups.map((g) => {
          const on = g.rows.filter((r) => r.include)
          const keys = g.rows.map((r) => r.key)
          const sameWhere = g.rows.every((r) => r.where === g.rows[0].where) ? g.rows[0].where : ''
          return (
            <div key={g.type} className={`pick-group ${on.length ? '' : 'off'}`}>
              <div className="pick-type">
                <input
                  type="checkbox"
                  checked={on.length === g.rows.length}
                  ref={(el) => {
                    if (el) el.indeterminate = on.length > 0 && on.length < g.rows.length
                  }}
                  onChange={(e) => update(keys, { include: e.target.checked })}
                />
                <div className="pick-name">
                  <strong>{g.type}</strong>
                  <span>
                    {g.manufacturer} · {g.rows[0].fixture.mode.channels} ch · patched {g.rows.length}×
                  </span>
                </div>
                {g.rows.length > 1 && (
                  <WhereSelect value={sameWhere} mixed={!sameWhere} onChange={(w) => update(keys, { where: w })} title="Where all of these go" />
                )}
              </div>
              {g.rows.map((r) => (
                <PickLine key={r.key} row={r} onChange={(c) => update([r.key], c)} />
              ))}
            </div>
          )
        })}
      </div>

      <div className="pick-options">
        <label>
          <input type="checkbox" checked={props.mirror} onChange={(e) => props.setMirror(e.target.checked)} /> Mirror pairs of moving heads (the right-hand one pans the other way)
        </label>
        {usesStands && (
          <label>
            Totems and stands:
            <select value={props.standFt} onChange={(e) => props.setStandFt(Number(e.target.value))}>
              {[2, 4, 6, 8, 9].map((h) => (
                <option key={h} value={h}>
                  {h} ft
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </>
  )
}

function patchText(f: SoundSwitchFixture): string {
  return `Universe ${f.universe + 1} · ch ${f.address}–${f.address + f.mode.channels - 1}`
}

function PickLine({ row, onChange }: { row: PickRow; onChange: (c: Partial<PickRow>) => void }) {
  return (
    <div className={`pick-line ${row.include ? '' : 'off'}`}>
      <input type="checkbox" checked={row.include} onChange={(e) => onChange({ include: e.target.checked })} />
      <span className="pick-patch mono" title="Its DMX patch in SoundSwitch">
        {patchText(row.fixture)}
      </span>
      {row.fixture.group ? <span className="pick-group-badge">G{row.fixture.group}</span> : <span className="pick-group-badge empty" />}
      <span className="count" title="How many of this fixture: more than 1 adds copies on the same DMX patch, so they do the same thing">
        <button className="mini" disabled={!row.include || row.count <= 1} onClick={() => onChange({ count: row.count - 1 })}>
          −
        </button>
        <span className="mono">{row.count}</span>
        <button className="mini" disabled={!row.include || row.count >= 16} onClick={() => onChange({ count: row.count + 1 })}>
          +
        </button>
      </span>
      <WhereSelect value={row.where} disabled={!row.include} onChange={(w) => onChange({ where: w })} />
    </div>
  )
}

function WhereSelect({ value, onChange, disabled, mixed, title }: { value: Where | ''; onChange: (w: Where) => void; disabled?: boolean; mixed?: boolean; title?: string }) {
  return (
    <select className="where" value={value} disabled={disabled} title={title ?? 'Where it goes'} onChange={(e) => onChange(e.target.value as Where)}>
      {mixed && <option value="">Mixed</option>}
      {(Object.keys(WHERE_LABELS) as Where[]).map((w) => (
        <option key={w} value={w}>
          {WHERE_LABELS[w]}
        </option>
      ))}
    </select>
  )
}

function FinishStep({ name, setName, room, setRoom, start, summary }: { name: string; setName: (v: string) => void; room: Room; setRoom: (r: Room) => void; start: Start; summary: ReturnType<typeof planSummary> | null }) {
  return (
    <>
      <p className="wizard-lead">Name it and pick the room</p>
      <label className="field wide">
        <span className="label">Show name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="room-cards">
        <button className={`room-card ${room === 'basic' ? 'on' : ''}`} onClick={() => setRoom('basic')}>
          <strong>Stage, truss and DJ booth</strong>
          <span>A low stage with a goalpost truss over it and a booth at the front. Change or remove any of it later in the Objects tab.</span>
        </button>
        <button className={`room-card ${room === 'empty' ? 'on' : ''}`} onClick={() => setRoom('empty')}>
          <strong>Empty room</strong>
          <span>Just the floor. Totems and stands still get added for fixtures that go on them; a truss is added if anything hangs.</span>
        </button>
      </div>
      {summary && (
        <p className="hint">
          {summary.fixtures} fixtures, patched as in SoundSwitch{summary.copies ? `, including ${summary.copies} copies sharing their original's DMX` : ''}. You can move anything afterwards, and File ▸ New Show… makes another show from the same project with different fixtures.
        </p>
      )}
      {start === 'describe' && <p className="hint">Next, the “Describe your show” box opens: type or dictate what you want.</p>}
      {start === 'scratch' && <p className="hint">Next, the Library opens: search for your fixtures and drag them in.</p>}
    </>
  )
}

function StartIcon({ kind }: { kind: 'soundswitch' | 'describe' | 'scratch' | 'demo' }) {
  const s = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg className="start-icon" viewBox="0 0 32 32" width="34" height="34" aria-hidden>
      {kind === 'soundswitch' && <><path d="M4 22v-6M9 25V10M14 22V7M19 26V12M24 21v-8M28 18v-2" {...s} /></>}
      {kind === 'describe' && <><path d="M6 8h20v13H14l-6 5v-5H6z" {...s} /><path d="M11 13h10M11 17h6" {...s} /></>}
      {kind === 'scratch' && <><rect x="5" y="18" width="22" height="6" rx="1" {...s} /><path d="M16 4v10M11 9h10" {...s} /></>}
      {kind === 'demo' && <><path d="M16 5l-7 18M16 5l7 18M16 5v18" {...s} /><circle cx="16" cy="5" r="2" {...s} /><path d="M6 26h20" {...s} /></>}
    </svg>
  )
}
