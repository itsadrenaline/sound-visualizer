/**
 * About Sound Visualizer: which version and build is running, on what system.
 * Everything someone needs to say when they report a problem, with a button
 * that copies it all. Opened from the app menu, Help, and the ? Learn menu.
 */
import { useEffect, useState } from 'react'
import type { AboutInfo } from '../../../shared/ipc'
import { useWizards } from '../state/wizards'

let cached: Promise<AboutInfo | null> | null = null
function aboutInfo(): Promise<AboutInfo | null> {
  cached ??= window.api?.aboutInfo ? window.api.aboutInfo().catch(() => null) : Promise.resolve(null)
  return cached
}

/** The running version ("1.4.1"), once known. */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    void aboutInfo().then((info) => setVersion(info?.version ?? null))
  }, [])
  return version
}

export function AboutDialog() {
  const open = useWizards((s) => s.about)
  const setOpen = useWizards((s) => s.setAbout)
  const [info, setInfo] = useState<AboutInfo | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!open) return
    setCopied(false)
    void aboutInfo().then(setInfo)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])
  if (!open) return null

  const rows: Array<[string, string]> = info
    ? [
        ['Version', info.version],
        ['Build', info.build],
        ['Running as', info.kind],
        ['System', info.system],
        ['Engine', info.engine]
      ]
    : [['Version', 'unknown (running without the app)']]
  const text = `Sound Visualizer\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="wizard-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="wizard small-dialog about-dialog" role="dialog" aria-label="About Sound Visualizer">
        <h2>Sound Visualizer</h2>
        <p className="about-version">Version {info?.version ?? '…'}</p>
        <p className="soft">A 3D lighting visualizer that plays your SoundSwitch shows over Art-Net.</p>
        <dl className="about-rows">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="soft small">Reporting a problem? Copy these details and paste them in your message: they say exactly which version you have.</p>
        <div className="wizard-foot">
          <button onClick={() => void copy()}>{copied ? 'Copied ✓' : 'Copy details'}</button>
          <span className="spacer" />
          <button className="primary" autoFocus onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
