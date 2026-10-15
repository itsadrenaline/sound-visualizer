/**
 * Fixture Studio's first screen: one step to a working twin, whatever you have.
 *  - Type the light's name: the Library (Open Fixture Library, QLC+, My Fixtures)
 *    and your show are searched as you type; pick one to open it.
 *  - Enter the manual's DMX chart in a table (pasting a chart fills it in).
 *  - Ask Claude to make it: from its name (Claude finds the manual on the web)
 *    or from a description.
 *  - Drop the manual (PDF or photos, read by Claude) or a fixture file.
 *  - Search the web for the manual (Claude, or your browser).
 *  - Or start from a kind of light, with the usual channel layouts to pick from.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { KINDS, KIND_ORDER, type FixtureKind } from '../../model/fixtureDef'
import { readFixtureFile } from '../../model/fixtureFiles'
import { plainName, type FixtureType } from '../../model/fixtureTypes'
import { searchLibrary, useLibrary } from '../../state/library'
import { useStore } from '../../state/store'
import { useStudio } from '../../state/studio'
import { makeWithClaude, openManualSearch, photoForClaude, readManualWithClaude, searchWebWithClaude, toBase64, type AiInput } from '../../state/fixtureAi'
import { notify } from '../../state/notices'
import { KindIcon } from './LookPanel'
import { ChartTable } from './ChartTable'
import { StartPicker } from './StartPicker'
import { ConnectClaude, useClaude } from './ClaudeBox'

const CLAUDE_EXAMPLES = ['Chauvet Intimidator Spot 360, 14-channel mode', 'ADJ Mega Hex Par', 'A 7-channel RGBW PAR with strobe and auto programs', 'A moving head wash with an RGB LED ring around the lens']

export function StudioStart() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<'chart' | 'claude' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { connected: claude } = useClaude()
  const [kind, setKind] = useState<FixtureKind | null>(null)
  const [prompt, setPrompt] = useState('')
  const kindSection = useRef<HTMLDivElement>(null)
  // Picking a kind brings the whole kind-and-layouts section into view.
  const kindOpen = kind !== null
  useEffect(() => {
    if (kindOpen) kindSection.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [kindOpen])
  const entries = useLibrary((s) => s.entries)
  const status = useLibrary((s) => s.status)
  const project = useStore((s) => s.project)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void useLibrary.getState().load()
  }, [])

  const results = useMemo(() => (query.trim().length > 1 ? searchLibrary(entries, query, 'all').slice(0, 8) : []), [entries, query])
  const showTypes = useMemo(() => {
    const ids = new Set(project.fixtures.map((f) => f.typeId))
    return (project.fixtureTypes ?? []).filter((t) => ids.has(t.id))
  }, [project])
  const [maker, ...rest] = query.trim().split(/\s+/)
  const model = rest.join(' ')

  const openKey = async (key: string) => {
    setBusy('Opening…')
    const def = await useLibrary.getState().defFor(key)
    setBusy(null)
    if (!def) return notify('error', 'Couldn’t open that fixture.')
    useStudio.getState().openDef(structuredClone(def), [`Opened from the Library: ${def.manufacturer} ${def.name}. Edits make your own copy; the Library keeps the original.`])
  }

  const readTextWithClaude = async (text: string) => {
    await withClaude('Claude is reading the chart…', () => readManualWithClaude([{ kind: 'text', text }], { name: model || query, manufacturer: model ? maker : undefined, kind: kind ?? undefined }))
  }

  const askClaude = async (text: string) => {
    if (!text.trim()) return
    await withClaude('Claude is making the fixture…', () => makeWithClaude(text.trim(), { kind: kind ?? undefined }))
  }

  const withClaude = async (label: string, run: () => Promise<{ def: Parameters<ReturnType<typeof useStudio.getState>['openDef']>[0]; notes: string[]; sources?: string[] }>) => {
    setBusy(label)
    try {
      const r = await run()
      const n = r.def.modes.reduce((a, m) => a + m.channels.length, 0)
      useStudio.getState().openDef(r.def, [`Claude made ${r.def.modes.length} mode${r.def.modes.length === 1 ? '' : 's'} (${n} channels). Check the amber rows on the twin.`, ...r.notes, ...(r.sources?.length ? [`Sources: ${r.sources.join(', ')}`] : [])])
    } catch (error) {
      notify('error', (error as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const takeFiles = async (files: File[]) => {
    if (!files.length) return
    const fixtureFile = files.find((f) => /\.(gdtf|json|qxf|svfixture)$/i.test(f.name))
    if (fixtureFile) {
      try {
        const { def, report } = readFixtureFile(fixtureFile.name, new Uint8Array(await fixtureFile.arrayBuffer()))
        useStudio.getState().openDef(def, report)
      } catch (error) {
        notify('error', `${fixtureFile.name}: ${(error as Error).message}`)
      }
      return
    }
    const manual = files.filter((f) => f.type.startsWith('image/') || /\.pdf$/i.test(f.name))
    if (!manual.length) return notify('error', 'Drop a manual (PDF or photos) or a fixture file (.gdtf, .json, .qxf, .svfixture).')
    if (!claude) {
      notify('info', 'Reading photos and PDFs needs Claude: connect it in the “Ask Claude” box. Meanwhile, type or paste the DMX chart into the table.')
      setOpen('chart')
      return
    }
    await withClaude(`Claude is reading ${manual.length} page${manual.length === 1 ? '' : 's'}…`, async () => {
      const inputs: AiInput[] = []
      for (const f of manual) {
        if (/\.pdf$/i.test(f.name)) inputs.push({ kind: 'pdf', base64: toBase64(new Uint8Array(await f.arrayBuffer())) })
        else inputs.push({ kind: 'image', ...(await photoForClaude(f)) })
      }
      return readManualWithClaude(inputs, { name: model || query, manufacturer: model ? maker : undefined, kind: kind ?? undefined })
    })
  }

  const webSearch = async () => {
    if (!query.trim()) return notify('info', 'Type the light’s maker and model first, e.g. “Equinox SpectraPix Batten”.')
    if (!claude) {
      openManualSearch(model ? maker : '', model || query)
      setOpen('chart')
      notify('info', 'Opened a search for the manual in your browser. Copy its DMX chart and paste it into the table.')
      return
    }
    await withClaude(`Claude is searching the web for the ${query.trim()} manual…`, () => searchWebWithClaude(model ? maker : '', model || query))
  }

  return (
    <div
      className="studio-start"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        void takeFiles([...e.dataTransfer.files])
      }}
    >
      <div className="start-inner">
        <h1>New fixture</h1>
        <p className="lead">Tell us what you have; the fixture appears as a 3D twin you can test and adjust.</p>

        <div className="start-search">
          <input autoFocus placeholder="What light is it? e.g. Chauvet Freedom Stick" value={query} onChange={(e) => setQuery(e.target.value)} data-tour="studio-search" />
          <button className="claude-btn" onClick={() => (setOpen('claude'), setPrompt(prompt || query))} title="Claude makes it: from the name (it finds the manual on the web) or from a description">
            ✦ Make it with Claude
          </button>
        </div>
        {status === 'loading' && <p className="hint">Loading the Library…</p>}
        {results.length > 0 && (
          <div className="start-results">
            <div className="panel-sub">Already known: open it, test it, change it if you need to</div>
            {results.map((e) => (
              <button key={e.key} className="result" onClick={() => void openKey(e.key)}>
                <span className="r-name">
                  {e.manufacturer} {e.name}
                </span>
                <span className="sub">
                  {e.source === 'mine' ? 'My Fixtures' : e.source === 'qlc' ? 'QLC+ library' : 'Open Fixture Library'} · {e.modes.length} mode{e.modes.length === 1 ? '' : 's'} · up to {Math.max(...e.modes.map((m) => m.channels))} ch
                </span>
              </button>
            ))}
          </div>
        )}
        {query.trim().length > 1 && !results.length && status === 'ready' && <p className="hint">Not in the Library. Make it with Claude, get its DMX chart from the manual, or start from a kind of light below.</p>}

        <div className={`start-tiles ${open ? 'has-open' : ''}`}>
          <div className={`tile ${open === 'chart' ? 'open' : ''}`} onClick={() => open !== 'chart' && setOpen('chart')} title={open === 'chart' ? undefined : "Fill in a table from the manual's DMX chart, or paste the chart into it"}>
            <div className="tile-head">
              <span className="tile-title">Enter the DMX chart</span>
              <span className="tile-text">From the manual: one row per channel. Paste the chart from a PDF and the table fills itself in.</span>
            </div>
            {open === 'chart' && (
              <>
                <ChartTable name={model || query.trim() || undefined} maker={model ? maker : undefined} claude={claude} onClaude={(t) => void readTextWithClaude(t)} onMake={(def, notes) => useStudio.getState().openDef(def, [`Made from the table: ${def.modes[0].channels.length} channels.`, ...notes])} />
                <button className="mini quiet tile-close" onClick={(e) => (e.stopPropagation(), setOpen(null))} title="Close the table">
                  Close
                </button>
              </>
            )}
          </div>

          <div className={`tile claude-tile ${open === 'claude' ? 'open' : ''}`} onClick={() => open !== 'claude' && (setOpen('claude'), setPrompt(prompt || query))}>
            <div className="tile-head">
              <span className="tile-title">✦ Ask Claude to make it</span>
              <span className="tile-text">{claude ? 'Name the light and Claude finds its manual on the web, or describe it and Claude builds it.' : 'Name or describe the light and Claude builds it (connects with your Anthropic API key).'}</span>
            </div>
            {open === 'claude' &&
              (claude ? (
                <div className="claude-make" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    autoFocus
                    value={prompt}
                    placeholder="e.g. “Chauvet Intimidator Spot 360, 14-channel mode” or “a 7-channel RGBW PAR with strobe and programs”"
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void askClaude(prompt))}
                  />
                  <div className="ask-examples">
                    {CLAUDE_EXAMPLES.map((x) => (
                      <button key={x} className="mini" onClick={() => setPrompt(x)}>
                        {x}
                      </button>
                    ))}
                  </div>
                  <div className="tile-actions">
                    <button className="primary" disabled={!prompt.trim()} onClick={() => void askClaude(prompt)}>
                      Make it
                    </button>
                    <span className="hint">Enter to make it · Claude marks what it guessed, so you can check it on the twin</span>
                    <span className="spacer" />
                    <button className="mini quiet" onClick={() => setOpen(null)}>
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <ConnectClaude onClose={() => setOpen(null)} />
              ))}
          </div>

          <div className="tile drop" onClick={() => file.current?.click()} title="Or drop the files anywhere on this screen">
            <div className="tile-head">
              <span className="tile-title">Drop the manual or a fixture file</span>
              <span className="tile-text">
                Photos or a PDF of the manual{claude ? ' (read by Claude)' : ' (needs Claude)'}, or a fixture file: GDTF, Open Fixture Library, QLC+ or one shared from this app (.gdtf, .json, .qxf, .svfixture).
              </span>
            </div>
            <input ref={file} type="file" multiple hidden accept=".gdtf,.json,.qxf,.svfixture,.pdf,image/*" onChange={(e) => void takeFiles([...(e.target.files ?? [])])} />
          </div>

          <div className="tile" onClick={() => void webSearch()} title={claude ? 'Claude searches the web for the manual and reads it' : 'Opens a web search for the manual in your browser'}>
            <div className="tile-head">
              <span className="tile-title">Search the web for its manual</span>
              <span className="tile-text">{claude ? 'Type the name above first: Claude finds the manual and reads its DMX chart and size.' : 'Type the name above first: opens a search in your browser, then paste the chart into the table.'}</span>
            </div>
          </div>
        </div>

        <div className="kind-section" ref={kindSection}>
          <div className="kind-section-head">
            <span className="tile-title">Start from a kind of light</span>
            <span className="tile-text">{kind ? 'Pick how many channels it has, or switch to another kind on the left.' : 'Pick the kind, then how many channels it has: you get a working fixture to adjust.'}</span>
          </div>
          {kind ? (
            <div className="kind-split">
              <div className="kind-list" role="listbox" aria-label="Kinds of light">
                {KIND_ORDER.map((k) => (
                  <button key={k} role="option" aria-selected={kind === k} className={`kind-item ${kind === k ? 'active' : ''}`} title={KINDS[k].explain} onClick={() => setKind(k)}>
                    <KindIcon kind={k} />
                    <span>{KINDS[k].label}</span>
                  </button>
                ))}
              </div>
              <StartPicker
                kind={kind}
                name={model || query.trim() || undefined}
                maker={model ? maker : undefined}
                onClose={() => setKind(null)}
                onPick={(def, note) => useStudio.getState().openDef(def, [note])}
              />
            </div>
          ) : (
            <div className="kind-grid big">
              {KIND_ORDER.map((k) => (
                <button key={k} className="kind" title={KINDS[k].explain} onClick={() => setKind(k)}>
                  <KindIcon kind={k} />
                  <span>{KINDS[k].label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {showTypes.length > 0 && (
          <>
            <div className="panel-sub">Or change one in your show</div>
            <div className="show-types">
              {showTypes.map((t: FixtureType) => (
                <button key={t.id} className="result" onClick={() => useStudio.getState().openType(t)}>
                  <span className="r-name">{plainName(t.name)}</span>
                  <span className="sub">
                    {t.source ?? 'Fixture'} · {t.channels.length} ch{t.lookGuessed ? ' · look guessed' : ''}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {busy && (
        <div className="busy">
          <div className="spinner" />
          {busy}
        </div>
      )}
    </div>
  )
}
