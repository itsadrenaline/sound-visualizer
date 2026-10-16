/**
 * Test faders for the selected fixture: a stand-in for a lighting console.
 * They write to the live DMX bus, not the project, so they never enter undo.
 */
import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useViewSettings } from '../state/viewSettings'
import { dmxBus } from '../state/dmxBus'
import { homeFixtures } from '../state/demo'
import { getFixtureType, type ChannelFunction } from '../model/fixtureTypes'

const LABELS: Partial<Record<ChannelFunction, string>> = {
  pan: 'Pan', panFine: 'Pan fine', tilt: 'Tilt', tiltFine: 'Tilt fine', speed: 'Speed',
  dimmer: 'Dimmer', shutter: 'Shutter', red: 'Red', green: 'Green', blue: 'Blue', white: 'White', zoom: 'Zoom',
  amber: 'Amber', uv: 'UV', colorWheel: 'Colour', gobo: 'Gobo', prism: 'Prism'
}

export function Faders() {
  const fixtures = useStore((s) => s.project.fixtures)
  const selection = useStore((s) => s.selection)
  const demo = useViewSettings((s) => s.demo)
  const setDemo = useViewSettings((s) => s.setDemo)
  const selected = fixtures.filter((f) => selection.includes(f.id))
  const [, redraw] = useState(0)

  // While the demo runs the values change on their own, so refresh the fader positions.
  useEffect(() => {
    if (!demo) return
    const id = setInterval(() => redraw((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [demo])

  const first = selected[0]
  // Show the channels of the first selected fixture, but move all selected fixtures of that type.
  const targets = first ? selected.filter((f) => f.typeId === first.typeId) : []
  const channels = first ? getFixtureType(first.typeId).channels : []

  const setLevel = (index: number, level: number) => {
    if (demo) {
      // Stopping the demo clears its levels: point the heads down again before taking over.
      setDemo(false)
      homeFixtures(useStore.getState().project)
    }
    for (const f of targets) dmxBus.setFader(f.universe, f.address + index, level)
    redraw((n) => n + 1)
  }

  const setAll = (fn: ChannelFunction, level: number) => {
    if (demo) {
      setDemo(false)
      homeFixtures(useStore.getState().project)
    }
    for (const f of fixtures) {
      const index = getFixtureType(f.typeId).channels.indexOf(fn)
      if (index >= 0) dmxBus.setFader(f.universe, f.address + index, level)
    }
    redraw((n) => n + 1)
  }

  return (
    <div className="faders">
      <div className="fader-actions">
        <button
          data-tour="play-demo"
          className={demo ? 'active' : ''}
          disabled={!demo && fixtures.length === 0}
          title={
            fixtures.length === 0
              ? 'Add fixtures first: the demo plays the fixtures in this show'
              : demo
                ? 'Stop the demo and hand the rig back to SoundSwitch (or the faders)'
                : 'Play a looping test show on every fixture in this show: colours, sweeps and gobos'
          }
          onClick={() => {
            if (!demo) return setDemo(true)
            setDemo(false)
            dmxBus.clearFaders()
            homeFixtures(useStore.getState().project)
            redraw((n) => n + 1)
          }}
        >
          {demo ? '■ Stop demo' : '▶ Play demo'}
        </button>
        <button onClick={() => setAll('dimmer', 255)} title="Every fixture's dimmer to full, to check the rig">All on</button>
        <button
          title="Everything off: stops the demo and resets the test faders (heads point down)"
          onClick={() => {
            setDemo(false)
            dmxBus.clearFaders()
            homeFixtures(useStore.getState().project)
            redraw((n) => n + 1)
          }}
        >
          Blackout
        </button>
        {dmxBus.artNetActive() && dmxBus.overrides() > 0 && (
          <button
            title="Hand every channel back to the show"
            onClick={() => {
              dmxBus.clearFaders()
              redraw((n) => n + 1)
            }}
          >
            Release {dmxBus.overrides()} to show
          </button>
        )}
        <p className="hint">
          {demo
            ? dmxBus.artNetActive()
              ? 'Demo playing on every fixture, over the SoundSwitch show. Stop demo to see the show again.'
              : 'Demo playing on every fixture in this show.'
            : first
            ? `Faders move ${targets.length === 1 ? first.name : `${targets.length} selected fixtures`}. While a show is playing, a fader you move takes over that channel until you press Release.`
            : 'Select a fixture to get its faders.'}
        </p>
      </div>
      <div className="fader-bank">
        {first &&
          channels.map((fn, i) =>
            fn === 'reserved' ? null : (
              <label key={i} className={`fader fn-${fn}`}>
                <span className="value mono">{dmxBus.getFader(first.universe, first.address + i)}</span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={dmxBus.getFader(first.universe, first.address + i)}
                  onChange={(e) => setLevel(i, Number(e.target.value))}
                />
                <span className="name">{LABELS[fn] ?? fn}</span>
                <span className="channel mono">{first.address + i}</span>
              </label>
            )
          )}
      </div>
    </div>
  )
}
