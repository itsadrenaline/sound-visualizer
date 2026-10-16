/**
 * Browser version: getting live DMX from SoundSwitch.
 *
 * A web page can't receive Art-Net or start programs, so this is as close to one
 * click as a browser allows: the right download for this computer, how to open it
 * the first time, and a live check that turns green as soon as the bridge is running.
 */
import { useEffect, useState } from 'react'
import { useWizards } from '../state/wizards'

const RELEASE = 'https://github.com/itsadrenaline/sound-visualizer/releases/download/bridge-latest'
const DOWNLOADS = {
  macArm: { label: 'Mac (Apple Silicon: M1 and newer)', file: 'Sound-Visualizer-Bridge-Mac-Apple-Silicon.zip' },
  macIntel: { label: 'Mac (Intel)', file: 'Sound-Visualizer-Bridge-Mac-Intel.zip' },
  windows: { label: 'Windows', file: 'Sound-Visualizer-Bridge-Windows.zip' },
  linux: { label: 'Linux', file: 'Sound-Visualizer-Bridge-Linux.tar.gz' }
} as const
type System = keyof typeof DOWNLOADS

/** Which computer this is. Browsers say "Intel" on every Mac, so the graphics chip tells Apple Silicon apart. */
function thisSystem(): System {
  const ua = navigator.userAgent
  if (/Windows/.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh/.test(ua)) {
    try {
      const gl = document.createElement('canvas').getContext('webgl')
      const info = gl?.getExtension('WEBGL_debug_renderer_info')
      const renderer = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
      if (/Apple M|Apple GPU/i.test(renderer)) return 'macArm'
      if (/Intel|AMD|Radeon|NVIDIA/i.test(renderer)) return 'macIntel'
    } catch {
      // Can't tell: Apple Silicon is the likelier.
    }
    return 'macArm'
  }
  return 'linux'
}

export function BridgeHelp() {
  const open = useWizards((s) => s.bridgeHelp)
  const setOpen = useWizards((s) => s.setBridgeHelp)
  const [connected, setConnected] = useState(false)
  const [system] = useState<System>(() => thisSystem())
  useEffect(() => {
    if (!open || !window.api) return
    const off = window.api.onArtNetStatus((s) => setConnected(s.listening))
    window.api.requestArtNetStatus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])
  if (!open) return null
  const mine = DOWNLOADS[system]
  const mac = system === 'macArm' || system === 'macIntel'
  return (
    <div className="wizard-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="wizard small-dialog bridge-help" role="dialog" aria-label="Live DMX from SoundSwitch">
        <h2>Live DMX from SoundSwitch</h2>
        <p className="soft">Browsers can't receive Art-Net, so a small helper on this computer passes SoundSwitch's lighting to this page. Everything else works without it.</p>
        <div className={`bridge-state ${connected ? 'on' : ''}`}>{connected ? '● Connected: the show plays here live.' : '○ Waiting for the helper… (this turns green by itself)'}</div>
        {!connected && (
          <ol className="bridge-steps">
            <li>
              <a className="button primary" href={`${RELEASE}/${mine.file}`} download>
                Download the helper for {mine.label}
              </a>
              <span className="others">
                Other computers:{' '}
                {(Object.keys(DOWNLOADS) as System[])
                  .filter((k) => k !== system)
                  .map((k, i) => (
                    <span key={k}>
                      {i > 0 && ' · '}
                      <a href={`${RELEASE}/${DOWNLOADS[k].file}`} download>
                        {DOWNLOADS[k].label}
                      </a>
                    </span>
                  ))}
              </span>
            </li>
            <li>
              <strong>Open it</strong> and leave it running (a small window shows what it's doing).{' '}
              {mac
                ? 'The first time, macOS may say it can’t check it: right-click it ▸ Open ▸ Open (or System Settings ▸ Privacy & Security ▸ Open Anyway).'
                : system === 'windows'
                  ? 'If Windows SmartScreen warns, click More info ▸ Run anyway, and allow it on private networks.'
                  : 'Unpack it and run it from a terminal.'}
            </li>
            <li>
              <strong>In SoundSwitch</strong>: Preferences ▸ Hardware ▸ DMX & Art-Net, tick Enable Art-Net (and Localhost Art-Net Node if SoundSwitch is on this computer), and select <em>Sound Visualizer</em>.
            </li>
            <li className="soft">If the browser asks to let this site reach devices on your network, allow it: that's how the page talks to the helper.</li>
          </ol>
        )}
        <div className="wizard-foot">
          <span className="soft small">Developers: <code>npm run bridge</code></span>
          <span className="spacer" />
          <button className="primary" autoFocus onClick={() => setOpen(false)}>
            {connected ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
