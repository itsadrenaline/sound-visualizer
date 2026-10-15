/**
 * Buttons floating over the 3D view: camera presets, framing, stored camera
 * positions and saving the view as an image.
 */
import { useCallback, useState } from 'react'
import { useDismiss } from './useDismiss'
import { view, type ViewPreset } from '../state/viewBus'
import { useStore } from '../state/store'
import { deleteCamera, storeCamera, updateRoom } from '../state/commands'
import { roomFit } from '../model/physics'
import { roomOf } from '../model/project'
import { useViewSettings } from '../state/viewSettings'
import { notify } from '../state/notices'

const PRESETS: Array<[ViewPreset, string, string]> = [
  ['perspective', 'Persp', '⇧1'],
  ['top', 'Top', '⇧2'],
  ['front', 'Front', '⇧3'],
  ['left', 'Left', '⇧4'],
  ['right', 'Right', '⇧5'],
  ['up', 'Up', '⇧6']
]

const NO_CAMERAS: never[] = []

export async function saveViewImage(): Promise<void> {
  const url = view.capture()
  if (!url) return
  if (!window.api) {
    // In a plain browser: download it.
    const a = document.createElement('a')
    a.href = url
    a.download = 'view.png'
    a.click()
    return
  }
  const path = await window.api.saveImage(url, useStore.getState().project.name)
  if (path) notify('info', `Saved ${path.split('/').pop()}`)
}

export function ViewToolbar() {
  const cameras = useStore((s) => s.project.cameras) ?? NO_CAMERAS
  const selection = useStore((s) => s.selection)
  const fullView = useViewSettings((s) => s.fullView)
  const setFullView = useViewSettings((s) => s.setFullView)
  const [menu, setMenu] = useState(false)
  const camerasRef = useDismiss<HTMLDivElement>(menu, useCallback(() => setMenu(false), []))

  const store = () => {
    const now = view.current()
    if (!now) return
    let n = cameras.length + 1
    while (cameras.some((c) => c.name === `View ${n}`)) n++
    storeCamera(`View ${n}`, now.position, now.target)
    notify('info', `Stored camera position "View ${n}"`)
  }

  return (
    <div className="view-toolbar">
      <ToolPicker />
      <div className="seg" data-tour="views">
        {PRESETS.map(([id, label, key]) => (
          <button key={id} onClick={() => view.preset(id)} title={`${label} view (${key})`}>
            {label}
          </button>
        ))}
      </div>
      <button onClick={() => view.focus(selection.length ? selection : 'all')} title="Frame the selection, or everything (F)">
        Focus
      </button>
      <div className="dropdown" ref={camerasRef}>
        <button data-tour="cameras" onClick={() => setMenu(!menu)} className={menu ? 'on' : ''} title="Stored camera positions">
          Cameras ▾
        </button>
        {menu && (
          <div className="dropdown-menu">
            {cameras.length === 0 && <div className="hint">No stored positions yet.</div>}
            {cameras.map((c) => (
              <div key={c.name} className="dropdown-row">
                <button className="link" onClick={() => view.goTo(c.position, c.target)}>
                  {c.name}
                </button>
                <button className="mini" title="Delete" onClick={() => deleteCamera(c.name)}>
                  ×
                </button>
              </div>
            ))}
            <button className="primary small" onClick={store} title="Remember this camera position; it's saved with the show">
              Store current view
            </button>
          </div>
        )}
      </div>
      <RoomMenu />
      <button data-tour="image" onClick={() => void saveViewImage()} title="Save the view as a PNG (Shift+Cmd+E)">
        Image
      </button>
      <button data-tour="fullview" onClick={() => setFullView(!fullView)} className={fullView ? 'on' : ''} title="Hide the panels (Shift+Cmd+F)">
        {fullView ? 'Panels' : 'Full view'}
      </button>
    </div>
  )
}

/** Quick starting points for the room's own light. */
const ROOM_PRESETS: Array<{ name: string; ambient: number; color: string }> = [
  { name: 'Dark club', ambient: 0.04, color: '#9fb0c8' },
  { name: 'Lounge', ambient: 0.25, color: '#ffcf9e' },
  { name: 'Ballroom', ambient: 0.5, color: '#ffe2bd' },
  { name: 'House lights', ambient: 0.85, color: '#f2f5ff' }
]

/** The room: how bright its own light is, its colour, and the ceiling. Saved with the project. */
function RoomMenu() {
  const project = useStore((s) => s.project)
  const room = roomOf(project)
  const fit = roomFit(project, room.ceilingHeight)
  const [open, setOpen] = useState(false)
  const ref = useDismiss<HTMLDivElement>(open, useCallback(() => setOpen(false), []))
  return (
    <div className="dropdown" ref={ref}>
      <button data-tour="room" onClick={() => setOpen(!open)} className={open ? 'on' : ''} title="Room light and ceiling">
        Room ▾
      </button>
      {open && (
        <div className="dropdown-menu room-menu">
          <div className="room-row">
            <span className="label">Room light</span>
            <span className="hint">{Math.round(room.ambient * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={room.ambient}
            onChange={(e) => updateRoom({ ambient: Number(e.target.value) }, 'Room light')}
            title="0% is a pitch-black room; 100% is house lights up"
          />
          <div className="room-scale">
            <span>Dark</span>
            <span>Bright</span>
          </div>
          <div className="room-row">
            <span className="label">Colour</span>
            <input type="color" value={room.ambientColor} onChange={(e) => updateRoom({ ambientColor: e.target.value }, 'Room light colour')} />
          </div>
          <div className="chips">
            {ROOM_PRESETS.map((p) => (
              <button key={p.name} className="chip" title={`Room light like a ${p.name.toLowerCase()}`} onClick={() => updateRoom({ ambient: p.ambient, ambientColor: p.color }, `Room: ${p.name}`)}>
                {p.name}
              </button>
            ))}
          </div>
          <hr />
          <label className="check">
            <input type="checkbox" checked={room.ceiling} onChange={(e) => updateRoom({ ceiling: e.target.checked }, e.target.checked ? 'Add ceiling' : 'Remove ceiling')} /> Ceiling
          </label>
          {room.ceiling && (
            <div className="room-row">
              <span className="label">Height (m)</span>
              <input
                type="number"
                min={3}
                max={25}
                step={0.1}
                value={room.ceilingHeight}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (v >= 3 && v <= 25) updateRoom({ ceilingHeight: v }, 'Ceiling height')
                }}
              />
            </div>
          )}
          {fit.raised && room.ceiling && <p className="hint">Raised to {fit.ceiling} m so everything fits under it.</p>}
          <p className="hint">The room grows to hold everything. Gobos and beam pools show on the floor, the back wall and the ceiling. Press Up (Shift+6) to look at the ceiling.</p>
        </div>
      )}
    </div>
  )
}

const TOOLS: Array<['select' | 'move' | 'orbit', string, string, string]> = [
  ['select', 'Select', 'V', 'Click a fixture to select it, Shift-click to add, drag to box-select'],
  ['move', 'Move', 'W', 'Select, then drag fixtures (or the arrows) to move them'],
  ['orbit', 'Orbit', 'O', 'Drag to look around, Shift-drag to pan, Alt-drag to zoom']
]

/** The mouse tool. Holding Space with any tool looks around (like the Orbit tool). */
function ToolPicker() {
  const tool = useViewSettings((s) => s.tool)
  const setTool = useViewSettings((s) => s.setTool)
  return (
    <div className="seg tools" data-tour="tools" title="Hold Space and drag to look around with any tool. Space+Shift pans, Space+Alt zooms, the wheel zooms.">
      {TOOLS.map(([id, label, key, hint]) => (
        <button key={id} className={tool === id ? 'on' : ''} onClick={() => setTool(id)} title={`${label} (${key}): ${hint}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
