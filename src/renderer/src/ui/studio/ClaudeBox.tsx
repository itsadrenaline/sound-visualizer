/**
 * Claude in Fixture Studio: whether it's connected, connecting it right here
 * (the same API key as Build show), and the "Ask Claude" box that changes the
 * open fixture as you ask.
 */
import { useCallback, useEffect, useState } from 'react'
import { useDismiss } from '../useDismiss'
import { editWithClaude } from '../../state/fixtureAi'
import { useStudio } from '../../state/studio'
import { notify } from '../../state/notices'

let known: boolean | null = null
const listeners = new Set<(v: boolean) => void>()

export function useClaude(): { connected: boolean; refresh: () => Promise<void> } {
  const [connected, set] = useState(known ?? false)
  const refresh = useCallback(async () => {
    const s = await window.api?.claudeStatus()
    known = !!s?.connected
    listeners.forEach((l) => l(known!))
  }, [])
  useEffect(() => {
    listeners.add(set)
    void refresh()
    return () => void listeners.delete(set)
  }, [refresh])
  return { connected, refresh }
}

/** Paste an Anthropic API key to connect Claude (stored encrypted, as in Build show). */
export function ConnectClaude({ onClose }: { onClose?: () => void }) {
  const { refresh } = useClaude()
  const [key, setKey] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const save = async (k = key) => {
    if (!window.api || checking || !k.trim()) return
    setChecking(true)
    const r = await window.api.setClaudeKey(k.trim()).finally(() => setChecking(false))
    if (r.error) setError(r.error)
    else {
      await refresh()
      notify('info', 'Claude is connected: describe a light, drop its manual, or ask it to change a fixture.')
      onClose?.()
    }
  }
  return (
    <div className="claude-connect studio-connect" onClick={(e) => e.stopPropagation()}>
      <p>
        Claude connects with an <b>API key</b> from your Anthropic account (separate from a Claude.ai subscription; you pay only for what you use).{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          Get a key ↗
        </a>{' '}
        (Create Key, then Copy), and paste it here:
      </p>
      <span className="claude-key-row">
        <input
          type="password"
          autoFocus
          placeholder="sk-ant-…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text')
            if (/sk-ant-/.test(pasted)) {
              e.preventDefault()
              setKey(pasted)
              void save(pasted)
            }
          }}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        <button className="mini primary" disabled={checking || !key.trim()} onClick={() => void save()}>
          {checking ? 'Checking…' : 'Connect'}
        </button>
        {onClose && (
          <button className="mini quiet" onClick={onClose}>
            Not now
          </button>
        )}
      </span>
      {error && <p className="warn-text">{error}</p>}
      <p className="soft">The key is checked with Anthropic and stored encrypted on this Mac. It's the same key Build show uses.</p>
    </div>
  )
}

const EDIT_EXAMPLES = ['Add a 3-channel RGB mode', 'Channel 7 is the strobe, not a program', 'Add the LED ring channels from the manual', 'Split the colours into 8 cells', 'Fill in the colour wheel colours from the manual']

/** The top bar's "Ask Claude": change the open fixture by describing the change. */
export function AskClaude() {
  const { connected } = useClaude()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useDismiss<HTMLDivElement>(open && !busy, useCallback(() => setOpen(false), []))
  const run = async () => {
    const def = useStudio.getState().def
    if (!def || !text.trim()) return
    setBusy(true)
    try {
      const r = await editWithClaude(def, text.trim())
      useStudio.getState().edit(() => r.def)
      useStudio.getState().setRightTab('problems')
      notify('info', r.notes[0] ? `Claude: ${r.notes.join(' ')}` : 'Claude changed the fixture. Undo takes it back.')
      setText('')
      setOpen(false)
    } catch (error) {
      notify('error', (error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="menu-anchor" ref={ref}>
      <button className="quiet claude-btn" onClick={() => setOpen(!open)} title="Describe a change and Claude makes it (adds modes, fixes channels, reads the manual from the web). Undo takes it back.">
        ✦ Ask Claude
      </button>
      {open && (
        <div className="dropdown-menu studio-menu ask-claude">
          {connected ? (
            <>
              <textarea autoFocus value={text} disabled={busy} placeholder="What should change? e.g. “add a 3-channel mode” or “channel 7 is the strobe”" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void run())} />
              <div className="ask-examples">
                {EDIT_EXAMPLES.map((x) => (
                  <button key={x} className="mini" disabled={busy} onClick={() => setText(x)}>
                    {x}
                  </button>
                ))}
              </div>
              <div className="tile-actions">
                <button className="primary mini" disabled={busy || !text.trim()} onClick={() => void run()}>
                  {busy ? 'Claude is working…' : 'Make the change'}
                </button>
                <span className="hint">One Undo takes it back.</span>
              </div>
            </>
          ) : (
            <ConnectClaude />
          )}
        </div>
      )}
    </div>
  )
}
