/**
 * The first-launch tour: five short panels, then "Create my first show".
 * Help ▸ Welcome Tour shows it again.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { useWizards } from '../state/wizards'
import { useSoundSwitch } from '../state/soundswitchLink'

interface Panel {
  title: string
  body: ReactElement
  art: ReactElement
}

export function Welcome() {
  const open = useWizards((s) => s.welcome)
  const close = useWizards((s) => s.closeWelcome)
  const openNewShow = useWizards((s) => s.openNewShow)
  const status = useSoundSwitch((s) => s.status)
  const [i, setI] = useState(0)

  useEffect(() => {
    if (open) setI(0)
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') setI((n) => Math.min(4, n + 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
  if (!open) return null

  const found = status?.state === 'linked' ? `SoundSwitch is running: found a project with ${status.fixtures.length} fixtures. You choose which project to use when you make a show.` : null
  const PANELS: Panel[] = [
    {
      title: 'Welcome to Sound Visualizer',
      art: <Art kind="welcome" />,
      body: (
        <>
          <p>See your lighting rig in 3D, and watch it play your SoundSwitch shows live: beams, colours, gobos and moving heads, exactly as the DMX says.</p>
          <p className="soft">Everything stays on this Mac. Nothing to install: SoundSwitch is all you need, and even that's optional for trying it out.</p>
        </>
      )
    },
    {
      title: 'Connect SoundSwitch',
      art: <Art kind="connect" />,
      body: (
        <ol>
          <li>
            In SoundSwitch, open <b>Preferences ▸ Hardware ▸ DMX & Art-Net</b>, tick <b>Enable Art-Net</b> and <b>Localhost Art-Net Node</b>, and select <b>Sound Visualizer</b> in the device list.
          </li>
          <li>When macOS asks, <b>allow Local Network</b> access: that's how the lighting data arrives.</li>
          <li>The app finds your SoundSwitch projects by itself. {found ?? 'Open your project in SoundSwitch and it will show up.'}</li>
        </ol>
      )
    },
    {
      title: 'Build the room',
      art: <Art kind="set" />,
      body: (
        <ul>
          <li>
            <b>Library</b>: hundreds of real fixtures. Drag one into the view.
          </li>
          <li>
            <b>Objects</b>: stages, totems and stands, truss, speakers and subs, DJ and band gear, tables, chairs, walls, screens, even a crowd. Click one to resize it.
          </li>
          <li>
            Drag anything to move it; a light on a stand brings the stand. Drag a fixture onto a totem or truss and it snaps on. Right-click to line things up. Hold <b>Space</b> and drag to look around.
          </li>
        </ul>
      )
    },
    {
      title: 'Or just describe it',
      art: <Art kind="describe" />,
      body: (
        <>
          <p>
            <b>✦ Build show</b> (⌘K): type, or press Fn twice to dictate, “two moving heads on 6 ft totems either side of the stage, one with pan inverted”, and it's built and patched for you.
          </p>
          <p className="soft">Common requests work right away. Connect Claude in that box to build anything you can describe: it walks you through getting a key.</p>
        </>
      )
    },
    {
      title: 'Save, reuse and share',
      art: <Art kind="share" />,
      body: (
        <ul>
          <li>
            <b>File ▸ New Show…</b> makes a show from a SoundSwitch project with just the fixtures you choose: a small show and a big show from the same rig.
          </li>
          <li>
            <b>Save</b> (⌘S) keeps the show, set and fixtures in one file. <b>Shows ▾</b> has templates and imports one show into another.
          </li>
          <li>
            <b>Export MVR</b> for other lighting software, or a patch list for the paperwork.
          </li>
          <li>
            Lost? <b>? Learn</b> (top right) or <b>Help ▸ Guided Tours</b> walk you through each part of the app, pointing at the real buttons.
          </li>
        </ul>
      )
    }
  ]
  const last = i === PANELS.length - 1
  const panel = PANELS[i]

  return (
    <div className="wizard-backdrop">
      <div className="welcome" role="dialog" aria-label="Welcome">
        <div className="welcome-art">{panel.art}</div>
        <div className="welcome-text">
          <div className="welcome-count">
            {i + 1} of {PANELS.length}
          </div>
          <h2>{panel.title}</h2>
          <div className="welcome-body">{panel.body}</div>
        </div>
        <div className="welcome-foot">
          <div className="dots">
            {PANELS.map((p, n) => (
              <button key={p.title} className={n === i ? 'on' : ''} aria-label={p.title} onClick={() => setI(n)} />
            ))}
          </div>
          <button className="quiet" onClick={close}>
            Skip
          </button>
          {i > 0 && <button onClick={() => setI(i - 1)}>Back</button>}
          {last ? (
            <button
              className="primary"
              onClick={() => {
                close()
                openNewShow()
              }}
            >
              {useWizards.getState().firstRun ? 'Create my first show' : 'Make a new show'}
            </button>
          ) : (
            <button className="primary" onClick={() => setI(i + 1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Small line drawings for each panel, in the app's beam colours. */
function Art({ kind }: { kind: 'welcome' | 'connect' | 'set' | 'describe' | 'share' }) {
  const beam = (x: number, color: string, spread = 40) => <polygon points={`${150},48 ${156},48 ${x + spread / 2},170 ${x - spread / 2},170`} fill={color} opacity="0.55" />
  return (
    <svg viewBox="0 -90 300 380" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id="wbg" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#1d1446" />
          <stop offset="1" stopColor="#08080f" />
        </linearGradient>
      </defs>
      <rect y="-90" width="300" height="380" fill="url(#wbg)" />
      {kind === 'welcome' && (
        <>
          {beam(70, '#ff4fd8')}
          {beam(153, '#3fe7ff')}
          {beam(236, '#ffb43f')}
          <rect x="128" y="34" width="50" height="16" rx="6" fill="#4a4573" />
          <ellipse cx="153" cy="50" rx="12" ry="4" fill="#fff" />
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <rect key={n} x={98 + n * 16} y={182 - [8, 14, 20, 12, 18, 10, 6][n]} width="9" height={[8, 14, 20, 12, 18, 10, 6][n]} rx="3" fill="#c9bcff" />
          ))}
        </>
      )}
      {kind === 'connect' && (
        <>
          <rect x="30" y="70" width="80" height="54" rx="6" fill="#2b2650" stroke="#8f7dff" />
          <text x="70" y="102" textAnchor="middle" fill="#c9bcff" fontSize="11">SoundSwitch</text>
          <rect x="190" y="70" width="80" height="54" rx="6" fill="#2b2650" stroke="#3fe7ff" />
          <text x="230" y="102" textAnchor="middle" fill="#bdf6ff" fontSize="11">Visualizer</text>
          <path d="M116 97 H184" stroke="#ffb43f" strokeWidth="3" strokeDasharray="3 7" strokeLinecap="round" />
          <text x="150" y="88" textAnchor="middle" fill="#ffd18a" fontSize="10">Art-Net</text>
        </>
      )}
      {kind === 'set' && (
        <>
          <rect x="40" y="150" width="220" height="16" fill="#2c2d40" />
          <path d="M60 150 V60 H240 V150" stroke="#9aa0b4" strokeWidth="5" fill="none" />
          <rect x="22" y="100" width="14" height="66" fill="#e9e9ec" />
          <rect x="264" y="100" width="14" height="66" fill="#e9e9ec" />
          <circle cx="29" cy="94" r="7" fill="#ff4fd8" />
          <circle cx="271" cy="94" r="7" fill="#3fe7ff" />
          {[100, 150, 200].map((x) => (
            <rect key={x} x={x - 7} y="62" width="14" height="12" rx="3" fill="#4a4573" />
          ))}
        </>
      )}
      {kind === 'describe' && (
        <>
          <rect x="40" y="56" width="220" height="70" rx="12" fill="#2b2650" stroke="#8f7dff" />
          <text x="58" y="84" fill="#e9e4ff" fontSize="12">“two movers on totems,</text>
          <text x="58" y="104" fill="#e9e4ff" fontSize="12">one each side”</text>
          <path d="M150 134 l-8 14 h16 z" fill="#ffb43f" />
          <text x="150" y="176" textAnchor="middle" fill="#ffd18a" fontSize="12">✦ built for you</text>
        </>
      )}
      {kind === 'share' && (
        <>
          {[0, 1, 2].map((n) => (
            <g key={n} transform={`translate(${60 + n * 70} ${60 - n * 6})`}>
              <rect width="56" height="72" rx="6" fill="#2b2650" stroke={['#ff4fd8', '#3fe7ff', '#ffb43f'][n]} />
              <text x="28" y="44" textAnchor="middle" fill="#e9e4ff" fontSize="11">{['.ssvis', '.mvr', '.csv'][n]}</text>
            </g>
          ))}
        </>
      )}
    </svg>
  )
}
