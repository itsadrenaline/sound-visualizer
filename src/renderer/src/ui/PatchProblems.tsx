/**
 * Patch problems, said once and plainly, each with what to do about it:
 * fix it (move to free channels), select the fixtures involved, or keep it as
 * it is. Copies that share a patch on purpose are never listed.
 */
import { useMemo } from 'react'
import { useStore } from '../state/store'
import { fixAllPatchProblems, fixPatchProblem, ignorePatchProblem } from '../state/commands'
import { describe, fixFor, fixLabel, patchProblems, range, sharedInSoundSwitch, slotName, type PatchProblem } from '../model/patchCheck'
import { notify } from '../state/notices'
import { view } from '../state/viewBus'

export function usePatchProblems(): PatchProblem[] {
  const project = useStore((s) => s.project)
  return useMemo(() => patchProblems(project), [project])
}

/** Fixture ids with a problem, and the sentence for each, for markers in lists. */
export function useProblemIndex(): Map<string, string> {
  const problems = usePatchProblems()
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const p of problems) for (const f of [...p.move.fixtures, ...(p.other?.fixtures ?? [])]) if (!m.has(f.id)) m.set(f.id, describe(p))
    return m
  }, [problems])
}

export function ProblemCard({ problem }: { problem: PatchProblem }) {
  const project = useStore((s) => s.project)
  const fix = fixLabel(project, problem)
  const ids = [...problem.move.fixtures, ...(problem.other?.fixtures ?? [])].map((f) => f.id)
  return (
    <div className="problem-card">
      <div className="problem-text">
        <span className="problem-icon">!</span>
        {describe(problem)}
      </div>
      <div className="problem-actions">
        {fix ? (
          <button className="mini primary" title="Move them to the first free channels (Undo puts them back)" onClick={() => fixPatchProblem(problem)}>
            {fix}
          </button>
        ) : (
          <span className="hint">No free channels to move to.</span>
        )}
        <button
          className="mini"
          title="Select the fixtures involved and show them in the 3D view"
          onClick={() => {
            useStore.getState().select(ids)
            view.focus(ids)
          }}
        >
          Select
        </button>
        {problem.kind === 'clash' && (
          <button className="mini quiet" title="They share these channels on purpose: stop reporting it (saved with the show)" onClick={() => ignorePatchProblem(problem)}>
            Keep as is
          </button>
        )}
      </div>
    </div>
  )
}

/** For the inspector: only the problems that involve what's selected. */
export function SelectionProblems({ ids }: { ids: string[] }) {
  const problems = usePatchProblems().filter((p) => [...p.move.fixtures, ...(p.other?.fixtures ?? [])].some((f) => ids.includes(f.id)))
  if (!problems.length) return null
  return (
    <div className="problems">
      {problems.map((p) => (
        <ProblemCard key={p.key} problem={p} />
      ))}
    </div>
  )
}

/**
 * A quiet line, not a problem: fixtures SoundSwitch itself patches on shared channels
 * (a second light on the same address follows the first). Hover for which ones.
 */
function SharedNote() {
  const project = useStore((s) => s.project)
  const shared = useMemo(() => sharedInSoundSwitch(project), [project])
  if (!shared.length) return null
  const names = new Set(shared.flatMap(([a, b]) => [...a.fixtures, ...b.fixtures].map((f) => f.id)))
  const detail = shared.map(([a, b]) => `${slotName(a)} and ${slotName(b)}: ${range(a.universe, Math.max(a.address, b.address), Math.min(a.end, b.end))}`).join('\n')
  return (
    <div className="patch-note" title={`Patched this way in SoundSwitch, so they get the same levels there too:\n${detail}`}>
      {names.size} fixtures share channels in your SoundSwitch patch, as set up there.
    </div>
  )
}

/** For the fixture list: one line when there are problems, opening to the list. */
export function ProblemsBanner({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const problems = usePatchProblems()
  const project = useStore((s) => s.project)
  if (!problems.length) return <SharedNote />
  const fixable = problems.filter((p) => fixFor(project, p)).length
  return (
    <div className="problems-banner">
      <button className="problems-head" onClick={() => setOpen(!open)} aria-expanded={open} title="Fixtures whose DMX channels clash or run past 512">
        <span className="problem-icon">!</span>
        {problems.length === 1 ? '1 patch problem' : `${problems.length} patch problems`}
        <span className="fold-arrow">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          {problems.map((p) => (
            <ProblemCard key={p.key} problem={p} />
          ))}
          {fixable > 1 && (
            <button
              className="mini primary"
              title="Move every clashing fixture to free channels, as one undo step"
              onClick={() => {
                const n = fixAllPatchProblems()
                notify('info', n ? `Fixed ${n} patch problem${n > 1 ? 's' : ''}. Undo puts them back.` : 'Nothing could be moved.')
              }}
            >
              Fix all {fixable}
            </button>
          )}
          <SharedNote />
        </>
      )}
    </div>
  )
}
