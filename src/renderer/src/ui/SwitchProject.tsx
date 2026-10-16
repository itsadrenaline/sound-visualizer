/**
 * Moving a show to another SoundSwitch project. Nothing happens to the show
 * until you pick what should happen to its fixtures: a new project is often the
 * same rig with different programs, so the work you put into the stage and the
 * fixtures is kept unless you choose otherwise.
 */
import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useWizards } from '../state/wizards'
import { fixturesNotInProject, someNames, switchPlan, switchSoundSwitchProject, type SwitchHow } from '../state/commands'
import { isEdited, saveDocument } from '../state/document'
import { notify } from '../state/notices'

type Choice = SwitchHow | 'fresh'

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`

export function SwitchProjectDialog() {
  const ask = useWizards((s) => s.switchProject)
  const close = useWizards((s) => s.closeSwitchProject)
  const project = useStore((s) => s.project)
  const [choice, setChoice] = useState<Choice>('keep')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ask) return
    // A project mapped the same way: keeping the show is the safe first choice.
    setChoice('keep')
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ask, close])

  if (!ask) return null
  const plan = switchPlan(project, ask.fixtures)
  const from = project.soundswitch?.profile ?? 'the old project'
  // Fixtures the new project doesn't patch: SoundSwitch sends them nothing, so they'd stay dark.
  const missing = fixturesNotInProject(project, ask.fixtures)
  const missingOwn = missing.filter((f) => !f.soundswitchKey && !f.copyOf).length
  const dark = (k: number) => (k ? ` ${n(k, 'fixture')} not in “${ask.name}” stay${k === 1 ? 's' : ''} in the show but stay${k === 1 ? 's' : ''} dark when it plays.` : '')
  const options: Array<{ id: Choice; title: string; text: string; result: string }> = [
    {
      id: 'keep',
      title: 'Keep my show as it is',
      text: `Every fixture stays where it is. The show follows “${ask.name}” from now on, so its programs play on your fixtures. Use this when it's the same rig with different programs.`,
      result: plan.same
        ? `${n(plan.same, 'fixture')} on the same patch carry on as they are; nothing is added or removed.${dark(missing.length)}`
        : `None of this show's fixtures are on the same patch in “${ask.name}”, so its programs won't reach them: the show stays dark. Nothing is added or removed.`
    },
    {
      id: 'add',
      title: `Add “${ask.name}” to my show`,
      text: `Keep everything, and bring in the fixtures from “${ask.name}” this show doesn't have yet.`,
      result: (plan.onlyThere ? `${n(plan.onlyThere, 'fixture')} added; nothing removed.` : 'Nothing to add: the show already has every fixture in it.') + dark(missing.length)
    },
    {
      id: 'match',
      title: `Update my show to match “${ask.name}”`,
      text: `Fixtures on the same patch keep their place and settings. Ones only in “${from}” are removed, and new ones come in.`,
      result: `${n(plan.same, 'fixture')} kept, ${plan.onlyHere} removed, ${plan.onlyThere} added.${missingOwn ? ` Your own ${n(missingOwn, 'fixture')} not in “${ask.name}” stay${missingOwn === 1 ? 's' : ''} but stay${missingOwn === 1 ? 's' : ''} dark.` : ''}`
    },
    {
      id: 'fresh',
      title: `Start a new show from “${ask.name}”`,
      text: 'A fresh show: choose its fixtures, stage and stands from scratch. This show is replaced, so save it first to keep it.',
      result: isEdited() ? 'This show has unsaved changes: you will be asked to save it first.' : 'This show is saved, so you can open it again any time.'
    }
  ]

  const go = async () => {
    if (choice === 'fresh') {
      if (isEdited()) {
        setBusy(true)
        const saved = await saveDocument()
        setBusy(false)
        // Cancelled saving: stay here rather than lose the show.
        if (!saved) return
      }
      close()
      useWizards.getState().openNewShow({ path: ask.path, name: ask.name })
      return
    }
    switchSoundSwitchProject(ask.name, ask.fixtures, choice)
    close()
    const kept = choice === 'keep' ? 'kept as it is' : choice === 'add' ? 'with the new fixtures added' : 'updated to match'
    notify('info', `This show follows “${ask.name}” now, ${kept}. Edit ▸ Undo puts it back.`)
  }

  const fixed = plan.own ? ` Your ${n(plan.own, 'own fixture')} (copies, Library fixtures), trusses, stands and cameras stay whichever you choose.` : ' Trusses, stands and cameras stay whichever you choose.'
  return (
    <div className="wizard-backdrop">
      <div className="wizard small-dialog switch-project" role="dialog" aria-label="Switch SoundSwitch project">
        <h2>Switch to “{ask.name}”?</h2>
        <p className="soft">
          This show follows “{from}”. What should happen to its fixtures?
          {fixed}
        </p>
        {missing.length > 0 && (
          <div className="switch-missing" role="note">
            <strong>
              {missing.length === project.fixtures.length ? `None of this show's ${n(missing.length, 'fixture')} are` : `${n(missing.length, 'fixture')} in this show ${missing.length === 1 ? 'isn’t' : 'aren’t'}`} in “{ask.name}”
            </strong>
            <span>
              {someNames(missing)}. {ask.name} doesn't use {missing.length === 1 ? 'its DMX channels' : 'their DMX channels'}, so SoundSwitch sends {missing.length === 1 ? 'it' : 'them'} nothing: when the show plays, {missing.length === 1 ? 'it stays' : 'they stay'} dark. Add {missing.length === 1 ? 'it' : 'them'} to the project in SoundSwitch (same universe and address) to light {missing.length === 1 ? 'it' : 'them'}.
            </span>
          </div>
        )}
        <div className="switch-options" role="radiogroup">
          {options.map((o) => (
            <button key={o.id} role="radio" aria-checked={choice === o.id} className={`switch-option ${choice === o.id ? 'on' : ''}`} onClick={() => setChoice(o.id)}>
              <span className="dot" />
              <span className="body">
                <strong>{o.title}</strong>
                <span>{o.text}</span>
                <em>{o.result}</em>
              </span>
            </button>
          ))}
        </div>
        <div className="wizard-foot">
          <button onClick={close}>Cancel</button>
          <span className="spacer" />
          <button className="primary" autoFocus disabled={busy} onClick={() => void go()}>
            {choice === 'fresh' ? (isEdited() ? 'Save and start a new show…' : 'Start a new show…') : 'Switch'}
          </button>
        </div>
      </div>
    </div>
  )
}
