/**
 * Fixture Studio's first screen: one step to a working twin, whatever you have.
 *  - Type the light's name: the Library (Open Fixture Library, QLC+, My Fixtures)
 *    and your show are searched as you type; pick one to open it.
 *  - Paste or type the manual's DMX chart; or drop the manual (PDF or photos,
 *    read by Claude) or a fixture file (GDTF, OFL, QLC+).
 *  - Search the web for the manual (Claude, or your browser).
 *  - Or start from a type of light.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { KINDS, KIND_ORDER, type FixtureKind } from '../../model/fixtureDef'
import { parseChart } from '../../model/manualParser'
import { readFixtureFile } from '../../model/fixtureFiles'
import { plainName, type FixtureType } from '../../model/fixtureTypes'
import { searchLibrary, useLibrary } from '../../state/library'
import { useStore } from '../../state/store'
import { newFromKind, useStudio } from '../../state/studio'
import { openManualSearch, photoForClaude, readManualWithClaude, searchWebWithClaude, toBase64, type AiInput } from '../../state/fixtureAi'
import { notify } from '../../state/notices'
import { KindIcon } from './LookPanel'

const EXAMPLE = `1  Dimmer  0-255
2  Red
3  Green
4  Blue
5  Strobe  0-9 no strobe
           10-255 slow to fast
6  Program  0-9 off
            10-255 auto programs`

export function StudioStart() {
  const [query, setQuery] = useState('')
  const [chart, setChart] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [claude, setClaude] = useState(false)
  const [kind, setKind] = useState<FixtureKind | ''>('')
  const entries = useLibrary((s) => s.entries)
  const status = useLibrary((s) => s.status)
  const project = useStore((s) => s.project)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void useLibrary.getState().load()
    void window.api?.claudeStatus().then((s) => setClaude(s.connected))
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

  const readText = () => {
    if (!chart?.trim()) return
    const { def, notes } = parseChart(chart, kind || undefined, model || query.trim() || undefined, model ? maker : undefined)
    if (!def.modes[0]?.channels.length) {
      notify('error', 'No channels found: each line should start with the channel number, like the example.')
      return
    }
    useStudio.getState().openDef(def, [`Read ${def.modes[0].channels.length} channels from the text.`, ...notes])
  }

  const readTextWithClaude = async () => {
    if (!chart?.trim()) return
    await withClaude('Claude is reading the chart…', () => readManualWithClaude([{ kind: 'text', text: chart }], { name: model || query, manufacturer: model ? maker : undefined, kind: kind || undefined }))
  }

  const withClaude = async (label: string, run: () => Promise<{ def: Parameters<ReturnType<typeof useStudio.getState>['openDef']>[0]; notes: string[]; sources?: string[] }>) => {
    setBusy(label)
    try {
      const r = await run()
      const n = r.def.modes.reduce((a, m) => a + m.channels.length, 0)
      useStudio.getState().openDef(r.def, [`Claude read ${r.def.modes.length} mode${r.def.modes.length === 1 ? '' : 's'} (${n} channels). Check the amber rows on the twin.`, ...r.notes, ...(r.sources?.length ? [`Sources: ${r.sources.join(', ')}`] : [])])
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
      notify('info', 'Reading photos and PDFs needs Claude connected (Build show ▸ Connect Claude). Meanwhile, type or paste the DMX chart: it’s read right here.')
      setChart(chart ?? '')
      return
    }
    await withClaude(`Claude is reading ${manual.length} page${manual.length === 1 ? '' : 's'}…`, async () => {
      const inputs: AiInput[] = []
      for (const f of manual) {
        if (/\.pdf$/i.test(f.name)) inputs.push({ kind: 'pdf', base64: toBase64(new Uint8Array(await f.arrayBuffer())) })
        else inputs.push({ kind: 'image', ...(await photoForClaude(f)) })
      }
      return readManualWithClaude(inputs, { name: model || query, manufacturer: model ? maker : undefined, kind: kind || undefined })
    })
  }

  const webSearch = async () => {
    if (!query.trim()) return notify('info', 'Type the light’s maker and model first, e.g. “Equinox SpectraPix Batten”.')
    if (!claude) {
      openManualSearch(model ? maker : '', model || query)
      setChart(chart ?? '')
      notify('info', 'Opened a search for the manual in your browser. Copy its DMX chart and paste it here.')
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
          {status === 'loading' && <span className="hint">Loading the Library…</span>}
        </div>
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
        {query.trim().length > 1 && !results.length && status === 'ready' && <p className="hint">Not in the Library. Get its DMX chart: search the web for the manual, or paste or drop it below.</p>}

        <div className="start-tiles">
          <div className={`tile ${chart !== null ? 'open' : ''}`}>
            <div className="tile-head" onClick={() => setChart(chart ?? '')}>
              <span className="tile-title">Type or paste the DMX chart</span>
              <span className="tile-text">Copy it from the manual's PDF or type it in: channel number, name, and value ranges if it has them.</span>
            </div>
            {chart !== null && (
              <>
                <textarea autoFocus placeholder={EXAMPLE} value={chart} onChange={(e) => setChart(e.target.value)} spellCheck={false} />
                <div className="tile-actions">
                  <select value={kind} onChange={(e) => setKind(e.target.value as FixtureKind | '')} title="What kind of light is it? (worked out from the channels if you leave it)">
                    <option value="">Kind: work it out</option>
                    {KIND_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {KINDS[k].label}
                      </option>
                    ))}
                  </select>
                  <button className="primary" disabled={!chart.trim()} onClick={readText}>
                    Read it
                  </button>
                  {claude && (
                    <button disabled={!chart.trim()} onClick={() => void readTextWithClaude()} title="For messy text: Claude reads it instead">
                      Read with Claude
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="tile drop" onClick={() => file.current?.click()}>
            <span className="tile-title">Drop the manual or a fixture file</span>
            <span className="tile-text">
              Photos or a PDF of the manual{claude ? ' (read by Claude)' : ' (needs Claude connected)'}, or a fixture file from the maker, GDTF Share, the Open Fixture Library or QLC+ (.gdtf, .json, .qxf).
            </span>
            <input ref={file} type="file" multiple hidden accept=".gdtf,.json,.qxf,.svfixture,.pdf,image/*" onChange={(e) => void takeFiles([...(e.target.files ?? [])])} />
          </div>

          <div className="tile" onClick={() => void webSearch()}>
            <span className="tile-title">Search the web for its manual</span>
            <span className="tile-text">{claude ? 'Claude finds the manual and reads its DMX chart and size for you.' : 'Opens a search in your browser; paste the chart you find here. (With Claude connected, it does this for you.)'}</span>
          </div>
        </div>

        <div className="panel-sub">Or start from a type of light</div>
        <div className="kind-grid big">
          {KIND_ORDER.map((k) => (
            <button key={k} className="kind" title={KINDS[k].explain} onClick={() => newFromKind(k, model || query.trim() || undefined, model ? maker : undefined)}>
              <KindIcon kind={k} />
              <span>{KINDS[k].label}</span>
            </button>
          ))}
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
