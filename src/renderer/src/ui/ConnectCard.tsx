/**
 * Browser version: "Connect your SoundSwitch", right in the app.
 *
 * Two things link the page to SoundSwitch, and both are a click away here:
 *  1. The project: pick your SoundSwitch folder (the fixtures and patch).
 *  2. Live DMX: download and open the helper (the show playing live).
 * The card ticks each one off as it's done, and goes away once both are (or when
 * you close it; it can be opened again from the Art-Net pill).
 */
import { useEffect, useState } from 'react'
import { useSoundSwitch } from '../state/soundswitchLink'
import { useWizards } from '../state/wizards'

const DISMISSED = 'sv.web.connectCardClosed'

export function ConnectCard() {
  const status = useSoundSwitch((s) => s.status)
  const [bridge, setBridge] = useState(false)
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED) === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (!window.api) return
    const off = window.api.onArtNetStatus((s) => setBridge(s.listening))
    window.api.requestArtNetStatus()
    return off
  }, [])
  const project = status?.state === 'linked'
  if (closed || (project && bridge)) return null
  const close = () => {
    setClosed(true)
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      // Closed for this visit only.
    }
  }
  return (
    <div className="connect-card" role="region" aria-label="Connect your SoundSwitch">
      <div className="cc-head">
        <strong>Connect your SoundSwitch</strong>
        <button className="cc-close" title="Close (open it again from the Art-Net pill)" onClick={close}>
          ×
        </button>
      </div>
      <ol>
        <li className={project ? 'done' : ''}>
          <span className="cc-text">{project ? `Project: ${status!.name}` : 'Your project (fixtures and patch)'}</span>
          {!project && (
            <button
              className="mini primary"
              onClick={async () => {
                const path = await window.api?.browseSoundSwitchProfile()
                if (path) useWizards.getState().openNewShow({ path, name: path.replace(/^web:/, '').split('/').pop()!.replace(/\.ssproj$/, '') })
              }}
            >
              Choose folder…
            </button>
          )}
        </li>
        <li className={bridge ? 'done' : ''}>
          <span className="cc-text">{bridge ? 'Live DMX: connected' : 'Live DMX (the show playing here)'}</span>
          {!bridge && (
            <button className="mini primary" onClick={() => useWizards.getState().setBridgeHelp(true)}>
              Get the helper…
            </button>
          )}
        </li>
      </ol>
      <p className="cc-hint">Pick the folder your SoundSwitch projects are in (Music or Documents). The helper is a small download for Mac or Windows: open it and the page connects by itself.</p>
    </div>
  )
}
