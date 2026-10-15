/**
 * Guided tours: short walks through the app that light up the actual buttons
 * and panels, one at a time, with a note beside each. Each step points at an
 * element marked data-tour="…" (see ui/Tour.tsx), and can get the screen ready
 * first (switch a tab, open the builder). Help ▸ Guided Tours, or the ? Learn
 * button, starts any of them; the first show you make starts "Getting around".
 */
import { create } from 'zustand'
import { useViewSettings } from './viewSettings'
import { newFromKind, useStudio } from './studio'

export interface TourStep {
  /** The data-tour name of what to light up; none = a note in the middle. */
  target?: string
  title: string
  body: string
  /** Get the screen ready for this step. */
  prepare?: () => void
}

export interface Tour {
  id: string
  title: string
  summary: string
  steps: TourStep[]
  /** Put things back when the tour ends. */
  finish?: () => void
}

const view = () => useViewSettings.getState()
const panels = () => view().setFullView(false)
const leftTab = (tab: 'fixtures' | 'library' | 'set') => () => {
  panels()
  view().setLeftTab(tab)
}
const click = (name: string) => () => (document.querySelector(`[data-tour="${name}"]`) as HTMLElement | null)?.click()

export const TOURS: Tour[] = [
  {
    id: 'basics',
    title: 'Getting around the screen',
    summary: 'The panels, the 3D view, the tools and where your work is saved.',
    steps: [
      { title: 'Your workspace', body: 'A one-minute look at where everything is. Use Next and Back, or the arrow keys; Esc ends the tour any time.', prepare: panels },
      { target: 'left-tabs', title: 'Fixtures, Library and Objects', body: 'Fixtures lists the lights in your show, grouped by type (or SoundSwitch group, or patch): click a group’s name to select it all and edit it together, or fold it away. Library has hundreds of real fixtures to add. Objects has stages, totems, truss, speakers, furniture and more.', prepare: leftTab('fixtures') },
      { target: 'viewport', title: 'The 3D view', body: 'Click something to select it; drag it to move it. Drag on empty floor to select several. Hold Space and drag to look around, and scroll to zoom. Right-click anything for its actions.' },
      { target: 'tools', title: 'Select, Move and Orbit', body: 'Select (V) clicks and drags things. Move (W) adds arrows for exact moves and going up and down. Orbit (O) turns the mouse into the camera.' },
      { target: 'views', title: 'Camera views', body: 'Jump to a perspective, top, front, side or ceiling view (Shift+1 to Shift+6). Focus (F) frames whatever is selected.' },
      { target: 'navpad', title: 'Getting around without a mouse wheel', body: 'Zoom in and out, turn around the show, move left, right, forward and back, and go up and down. Hold a button to keep moving; ⌂ goes back to the starting view. The keyboard works too: arrows turn, Shift+arrows move, + and − zoom, Home goes back.' },
      { target: 'inspector', title: 'The inspector', body: 'Everything about what you selected: name, patch, how it is mounted, sizes, and buttons to move and line things up. Click a section’s title to fold it away. Select several to change them all at once. If two fixtures use the same channels, it says so here, with a button to fix it.' },
      { target: 'bottom', title: 'Faders and the DMX map', body: 'Test a fixture with faders, play a demo, or see where every fixture sits on the DMX channels.' },
      { target: 'undo', title: 'Undo anything', body: 'Every change is one step to undo (⌘Z) or redo (⇧⌘Z), even a whole show built from a description.' },
      { target: 'save', title: 'Save your show', body: 'Save (⌘S) keeps the show, the objects and the fixture types in one file you can open on any Mac.' },
      { target: 'learn', title: 'Come back any time', body: 'This Learn menu (and Help ▸ Guided Tours) has more tours: making a show, adding lights, objects, SoundSwitch, and cameras and pictures.' }
    ]
  },
  {
    id: 'build',
    title: 'Making a show',
    summary: 'Start a new show, describe one, or begin from a template.',
    steps: [
      { target: 'shows', title: 'Shows', body: 'New show… makes a show from your SoundSwitch project (you pick the fixtures), from a description, from scratch or from the demo. Below it: ready-made templates, importing and exporting.', prepare: () => (panels(), view().setBuilder(false)) },
      { target: 'build', title: 'Build show', body: 'Describe what you want, in your own words, and it is built and patched for you (⌘K).' },
      { target: 'builder', title: 'Type or talk', body: 'Write something like “two moving heads on 6 ft totems either side of the stage”, or press Fn twice to dictate. Common requests work right away; connect Claude at the bottom to build anything you can describe.', prepare: () => view().setBuilder(true) },
      { target: 'builder-target', title: 'Add, or start a new show', body: '“Add to this show” builds on what is already there. “Start a new show” clears the scene first, then builds. Either way, Undo brings back what you had.' },
      { target: 'add-fixtures', title: 'Or add things by hand', body: 'Add fixtures opens the Library. The Objects tab has the stage, stands, truss and everything else.', prepare: () => view().setBuilder(false) },
      { target: 'save', title: 'Save it', body: 'Save the show to a file when you are happy with it. You can keep several shows from the same SoundSwitch rig, a small one and a big one.' }
    ]
  },
  {
    id: 'lights',
    title: 'Adding lights',
    summary: 'Find a fixture in the Library, patch it and put it where you want.',
    steps: [
      { target: 'tab-library', title: 'The Library', body: 'Hundreds of real fixtures, with their real sizes, modes and DMX layouts.', prepare: leftTab('library') },
      { target: 'library-search', title: 'Search', body: 'Type a maker, a model or a kind of light: “chauvet spot”, “pixel bar”, “mh-150”.' },
      { target: 'library-list', title: 'Pick one', body: 'Click a fixture to see its size and choose its mode, how many and where to patch them, then add them. Or drag one straight into the 3D view, onto the floor, a totem or the truss.' },
      { target: 'viewport', title: 'Put it on something', body: 'Drag a fixture over a totem, a stand or a truss and it snaps on (a ring shows where). Grab the light later and its stand comes too; hold Option to lift it off.' },
      { target: 'tab-fixtures', title: 'Your fixtures', body: 'Everything in the show, with its patch, grouped by type so copies sit together. Click a group’s name to select it all; right-click a row for the same actions as in the 3D view. M mutes, S solos, H hides. Patch problems show at the top with a Fix button.', prepare: leftTab('fixtures') },
      { target: 'inspector', title: 'Fine-tune', body: 'Change the patch, hang it or stand it upright, invert pan or tilt, and line several up.' }
    ]
  },
  {
    id: 'objects',
    title: 'Objects, moving and lining up',
    summary: 'Stages, stands, speakers and furniture, and moving them around.',
    steps: [
      { target: 'tab-objects', title: 'Objects', body: 'Everything that isn’t a light: stands and totems, truss, staging, speakers and subs, DJ and band gear, furniture, walls, screens and people.', prepare: leftTab('set') },
      { target: 'objects-search', title: 'Find one', body: 'Search “speaker”, “chair”, “truss”… or open a group below.' },
      { target: 'objects-presets', title: 'Add it', body: 'Click to add it somewhere sensible, or drag it to exactly where you want it. Click it in the view to change its size, height or options.' },
      { target: 'viewport', title: 'Move things together', body: 'Drag anything to move it. What is on it comes too: a stage brings the speakers and lights on it, a stand brings its light. Drag a box on empty floor to select several.' },
      { target: 'viewport', title: 'Line things up in one click', body: 'Right-click and choose Move to (back, centre or front of the stage, either side), Line up evenly, Align, or Space evenly. It works on lights and objects together.' },
      { target: 'inspector', title: 'The same, as buttons', body: 'With something selected, Move and line up in the inspector has the same actions.' },
      { target: 'objects-list', title: 'What’s in this show', body: 'Every object in the show. Click to select, double-click to find it in 3D, right-click for actions.' }
    ]
  },
  {
    id: 'soundswitch',
    title: 'SoundSwitch and live DMX',
    summary: 'Following your SoundSwitch rig and watching the show play.',
    steps: [
      { target: 'soundswitch', title: 'Your SoundSwitch project', body: 'The app finds the project SoundSwitch has open. Click here to sync automatically (or now), find it again, choose another project, or make a new show from it.', prepare: panels },
      { target: 'artnet', title: 'Live lighting data', body: 'Turns green when SoundSwitch is playing. In SoundSwitch: Preferences ▸ Hardware ▸ DMX & Art-Net, tick Enable Art-Net and Localhost Art-Net Node, and select Sound Visualizer.' },
      { target: 'play-demo', title: 'No SoundSwitch to hand?', body: 'Play demo runs a test show on every fixture. Select a fixture to get its faders.', prepare: click('tab-faders') },
      { target: 'tab-dmx', title: 'The DMX map', body: 'Each universe the way SoundSwitch shows it, with live levels. Click a fixture to select it.' },
      { target: 'shows', title: 'A show from SoundSwitch', body: 'Shows ▸ New show… makes a show with just the SoundSwitch fixtures you pick, with copies that share a patch.' }
    ]
  },
  {
    id: 'studio',
    title: 'Making or fixing a fixture',
    summary: 'Fixture Studio: a 3D twin of any light, from its name, manual or a file, with tests.',
    steps: [
      { title: 'Fixture Studio', body: 'Any light can be in your show, even one that isn\u2019t in the Library. Fixture Studio builds it as a 3D twin you can test without the real light, and fixes ones that look wrong.', prepare: () => (useStudio.getState().close(true), panels()) },
      { target: 'new-fixture', title: 'Start here', body: 'New fixture… in the Library (or File ▸ New Fixture, ⇧⌘N). For a light already in your show: right-click it ▸ Edit in Fixture Studio, or Open in Fixture Studio in the inspector.', prepare: leftTab('library') },
      { target: 'studio-search', title: 'Say what light it is', body: 'Type its name: the Library is searched as you type (Open Fixture Library, QLC+ and your own). Not there? Ask Claude to make it, enter its DMX chart in the table (pasting the chart fills it in), drop the manual or a fixture file, or start from a kind of light and pick its channel count.', prepare: () => useStudio.getState().start() },
      { target: 'studio-twin', title: 'The twin', body: 'The light in a small test room, drawn exactly as it will be in your show. Drag to look around; the buttons jump to the front, the beam on the wall or a close-up.', prepare: () => newFromKind('bar', 'Example LED bar') },
      { target: 'studio-schematic', title: 'Schematic and DMX strip', body: 'The face of the light, lit as the twin shows it: click a cell to see its channels. Below, every DMX channel in order, filling up with its value.' },
      { target: 'studio-channels', title: 'Channels', body: 'One row per channel: what it does, a slider to try it, and a dot for how sure we are (amber = guessed, red = missing). Hover a row and the twin shows it. Pick several to change them together.' },
      { target: 'studio-tests', title: 'Tests', body: 'Ready-made tests for this kind of light, each saying what you should see. If the twin does something else, \u201cSomething\u2019s off\u201d offers the usual fixes.', prepare: () => useStudio.getState().setRightTab('tests') },
      { title: 'Save, share, edit later', body: 'Save keeps it in My Fixtures, and updates your show if it uses it. Export makes a file to share, or to send to the Open Fixture Library. Open it again any time to change it.' }
    ],
    finish: () => useStudio.getState().close(true)
  },
  {
    id: 'present',
    title: 'Looking good: cameras, room and pictures',
    summary: 'Haze, the room’s light, stored cameras and saving pictures.',
    steps: [
      { target: 'haze', title: 'Haze', body: 'More haze makes the beams show up in the air.', prepare: panels },
      { target: 'room', title: 'The room', body: 'How dark the room is (dark club to house lights), its colour, and the ceiling.' },
      { target: 'cameras', title: 'Cameras', body: 'Store a view you like and come back to it. Stored views are saved with the show.' },
      { target: 'views', title: 'Quick views', body: 'Perspective, top, front, sides and ceiling, Shift+1 to Shift+6.' },
      { target: 'image', title: 'Save a picture', body: 'Saves exactly what the 3D view shows as an image (⇧⌘E), for a client or the crew.' },
      { target: 'fullview', title: 'Full view', body: 'Hides the panels so the 3D view fills the window, for presenting (⇧⌘F).' }
    ]
  }
]

const DONE_KEY = 'sound-visualizer:tours-done'

function loadDone(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

interface TourState {
  tour: Tour | null
  step: number
  done: string[]
  start(id: string): void
  next(): void
  back(): void
  end(completed?: boolean): void
  /** Forget which tours were done (starting fresh). */
  reset(): void
}

export const useTour = create<TourState>((set, get) => ({
  tour: null,
  step: 0,
  done: loadDone(),
  start(id) {
    const tour = TOURS.find((t) => t.id === id)
    if (!tour) return
    set({ tour, step: 0 })
    tour.steps[0].prepare?.()
  },
  next() {
    const { tour, step } = get()
    if (!tour) return
    if (step >= tour.steps.length - 1) return get().end(true)
    tour.steps[step + 1].prepare?.()
    set({ step: step + 1 })
  },
  back() {
    const { tour, step } = get()
    if (!tour || step === 0) return
    tour.steps[step - 1].prepare?.()
    set({ step: step - 1 })
  },
  end(completed = false) {
    const { tour, done } = get()
    if (!tour) return
    tour.finish?.()
    const next = completed && !done.includes(tour.id) ? [...done, tour.id] : done
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(next))
    } catch {
      // Not remembered; that's fine.
    }
    set({ tour: null, step: 0, done: next })
  },
  reset() {
    try {
      localStorage.removeItem(DONE_KEY)
    } catch {
      // Nothing to forget.
    }
    set({ tour: null, step: 0, done: [] })
  }
}))
