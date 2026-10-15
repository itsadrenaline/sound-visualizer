/**
 * The Studio's right-hand tabs besides the channel and look editors:
 *  - Tests: ready-made tests for this kind of light, run on the twin, each saying
 *    what you should see; "Something's off" offers the usual fixes.
 *  - Problems: what the import found and what's still wrong, each with a fix.
 *  - How it works: how this kind of light works, each idea linked to its channels.
 */
import { useMemo, useState } from 'react'
import { KINDS, type ChannelFn, type FixtureDef } from '../../model/fixtureDef'
import { checkDef } from '../../model/fixtureChecks'
import { fixesFor, scenesFor } from '../../model/fixtureTests'
import { getFixtureType } from '../../model/fixtureTypes'
import { dmxBus } from '../../state/dmxBus'
import { useStore } from '../../state/store'
import { useStudio } from '../../state/studio'
import { notify } from '../../state/notices'
import { useLive } from './Schematic'
import { twinNow } from './TwinView'

export function TestsPanel({ def }: { def: FixtureDef }) {
  useLive()
  const modeIndex = useStudio((s) => s.modeIndex)
  const driving = useStudio((s) => s.driving)
  const verdicts = useStudio((s) => s.verdicts)
  const scenes = useMemo(() => scenesFor(def, modeIndex), [def, modeIndex])
  const [showFixes, setShowFixes] = useState(false)
  const sets = [...new Set(scenes.map((s) => s.set))]
  const running = scenes.find((s) => s.id === driving.scene?.id)
  const st = useStudio.getState
  const next = running ? scenes[scenes.indexOf(running) + 1] : undefined
  const fixes = running ? fixesFor(running.id, def, modeIndex) : []
  return (
    <div className="tests-panel" data-tour="studio-tests">
      {running ? (
        <div className="running">
          <div className="panel-title">{running.title}</div>
          <div className="step-text">{twinNow.step?.text ?? running.steps[0].text}</div>
          <div className="step-count">
            Step {(twinNow.step?.index ?? 0) + 1} of {running.steps.length} · repeats until you stop it
          </div>
          <div className="verdict">
            <button
              className="primary"
              onClick={() => {
                st().setVerdict(running.id, 'ok')
                setShowFixes(false)
                if (next) st().runScene(next.id)
                else st().runScene(null)
              }}
              title="Mark the channels this test used as checked"
            >
              ✓ Looks right{next ? ', next test' : ''}
            </button>
            <button onClick={() => (st().setVerdict(running.id, 'off'), setShowFixes(true))}>Something's off</button>
            <button className="quiet" onClick={() => (st().runScene(null), setShowFixes(false))}>
              Stop
            </button>
          </div>
          {showFixes && (
            <div className="fixes">
              <p className="hint">The usual causes. Pick one and the test runs again with the fix; Undo takes it back.</p>
              {fixes.map((f) => (
                <button
                  key={f.label}
                  className="fix-row"
                  onClick={() => {
                    st().edit(f.apply)
                    st().runScene(running.id)
                    setShowFixes(false)
                    notify('info', `Fixed: ${f.label.replace(/:.*/, '')}.`)
                  }}
                >
                  {f.label}
                </button>
              ))}
              <p className="hint">Not listed? Pick the channel in the list and change it: the twin shows the result straight away. If the light is set to a different DMX mode than this one, switch the mode at the top.</p>
            </div>
          )}
        </div>
      ) : (
        <p className="hint">Run a test and watch the twin. Each one says what you should see; if the twin does something else, the fixture needs fixing, not your show.</p>
      )}
      {sets.map((set) => (
        <div key={set} className="test-set">
          <div className="panel-sub">{set}</div>
          {scenes
            .filter((s) => s.set === set)
            .map((s) => (
              <button key={s.id} className={`test-row ${running?.id === s.id ? 'on' : ''} ${verdicts[s.id] ?? ''}`} onClick={() => (st().runScene(s.id), setShowFixes(false))}>
                <span className="play">▶</span> {s.title}
                <span className="sub">{verdicts[s.id] === 'ok' ? 'looked right' : verdicts[s.id] === 'off' ? 'needs a look' : `${s.steps.length} step${s.steps.length === 1 ? '' : 's'}`}</span>
              </button>
            ))}
        </div>
      ))}
      <FollowSoundSwitch def={def} />
    </div>
  )
}

/** Drive the twin from SoundSwitch: the Art-Net it sends for a fixture in the show. */
function FollowSoundSwitch({ def }: { def: FixtureDef }) {
  const driving = useStudio((s) => s.driving)
  const origin = useStudio((s) => s.origin)
  const modeIndex = useStudio((s) => s.modeIndex)
  const fixtures = useStore((s) => s.project.fixtures)
  const n = def.modes[modeIndex]?.channels.length ?? 0
  // Show fixtures this one stands in for, or any with the same channel count.
  const candidates = fixtures.filter((f) => origin?.typeIds.includes(f.typeId) || getFixtureType(f.typeId).studioId === def.id || getFixtureType(f.typeId).channels.length === n).slice(0, 30)
  const active = dmxBus.artNetActive()
  return (
    <div className="follow">
      <div className="panel-sub">Live from SoundSwitch</div>
      {driving.follow ? (
        <>
          <p className="hint">The twin is following {driving.follow.name} (universe {driving.follow.universe + 1}, address {driving.follow.address}). Play a show or use SoundSwitch's overrides.</p>
          <button onClick={() => useStudio.getState().setFollow(null)}>Stop following</button>
        </>
      ) : (
        <>
          <p className="hint">{active ? 'SoundSwitch is sending lighting data.' : 'No lighting data from SoundSwitch right now (set it up in Learn ▸ SoundSwitch and live DMX).'} Pick a fixture in your show and the twin follows exactly what SoundSwitch sends it, no real light needed.</p>
          <select value="" onChange={(e) => {
            const f = fixtures.find((x) => x.id === e.target.value)
            if (f) useStudio.getState().setFollow({ universe: f.universe, address: f.address, name: f.name })
          }}>
            <option value="">Follow a fixture in the show…</option>
            {candidates.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} (U{f.universe + 1}.{f.address})
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}

export function ProblemsPanel({ def }: { def: FixtureDef }) {
  const modeIndex = useStudio((s) => s.modeIndex)
  const report = useStudio((s) => s.report)
  const problems = useMemo(() => checkDef(def, modeIndex), [def, modeIndex])
  const st = useStudio.getState
  const fixAll = problems.filter((p) => p.fix && p.level === 'error')
  return (
    <div className="problems-panel">
      {report.length > 0 && (
        <div className="report">
          <div className="panel-sub">What was read</div>
          <ul>
            {report.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="panel-sub">
        {problems.length ? `To check (${problems.length})` : 'Checks'}
        {fixAll.length > 1 && (
          <span className="sub-tools">
            <button className="mini" onClick={() => st().edit((d) => fixAll.reduce((acc, p) => p.fix!.apply(acc), d))}>
              Fix all {fixAll.length}
            </button>
          </span>
        )}
      </div>
      {!problems.length && <p className="ok-note">✓ No problems found in this mode. Run the tests to see it working.</p>}
      {problems.map((p) => (
        <div key={p.id} className={`problem p-${p.level}`}>
          <span className="pdot" />
          <div className="ptext">
            {p.text}
            <div className="pactions">
              {p.channels && (
                <button className="mini quiet" onClick={() => st().select(p.channels!)}>
                  Show {p.channels.length === 1 ? 'it' : 'them'}
                </button>
              )}
              {p.fix && (
                <button className="mini" onClick={() => st().edit(p.fix!.apply)}>
                  {p.fix.label}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function LearnPanel({ def }: { def: FixtureDef }) {
  const modeIndex = useStudio((s) => s.modeIndex)
  const info = KINDS[def.kind]
  const mode = def.modes[modeIndex]
  const scenes = useMemo(() => scenesFor(def, modeIndex), [def, modeIndex])
  const showConcept = (fns: ChannelFn[]) => {
    const ids = mode?.channels.filter((c) => fns.includes(c.fn)).map((c) => c.id) ?? []
    useStudio.getState().select(ids)
    useStudio.getState().setRightTab('learn')
    const scene = scenes.find((s) => s.steps.length && fns.some((fn) => sceneUses(s.id, fn)))
    if (scene) useStudio.getState().runScene(scene.id)
    useStudio.getState().setRightTab('learn')
  }
  return (
    <div className="learn-panel">
      <div className="panel-title">How a {info.label.toLowerCase()} works</div>
      <p>{info.explain}</p>
      {info.concepts.map((c) => {
        const has = mode?.channels.some((ch) => c.fns.includes(ch.fn))
        return (
          <button key={c.title} className="concept" onClick={() => showConcept(c.fns)} disabled={!c.fns.length}>
            <span className="concept-title">{c.title}</span>
            <span className="concept-text">{c.text}</span>
            {c.fns.length > 0 && <span className="concept-go">{has ? 'Show me on the twin ▶' : 'This mode has none of these channels'}</span>}
          </button>
        )
      })}
      <p className="hint">Not this kind of light? Change it under Look; the tests and these notes follow.</p>
    </div>
  )
}

function sceneUses(sceneId: string, fn: ChannelFn): boolean {
  const id = sceneId.replace(/-.*/, '')
  const map: Record<string, ChannelFn[]> = {
    dim: ['dimmer'], colours: ['red', 'green', 'blue', 'white', 'warmWhite', 'coolWhite', 'amber', 'uv'], chase: ['red', 'green', 'blue', 'warmWhite', 'white'], strobe: ['shutter'],
    move: ['pan', 'tilt', 'panTiltSpeed'], zoom: ['zoom'], gobo: ['gobo'], gspin: ['goboRotation'], prism: ['prism', 'prismRotation'], prog: ['program', 'programSpeed', 'sound'],
    laser: ['laser'], rot: ['rotation'], wheel: ['colorWheel', 'colorMacro'], master: ['dimmer']
  }
  return (map[id] ?? []).includes(fn)
}
