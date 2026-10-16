/** View settings that aren't part of the show file. */
import { create } from 'zustand'
import { dmxBus } from './dmxBus'

interface ViewSettings {
  haze: number
  demo: boolean
  /** Hide the side and bottom panels so the 3D view fills the window. */
  fullView: boolean
  /** Which tab the left panel shows. */
  leftTab: 'fixtures' | 'library' | 'set'
  /**
   * What the left mouse button does in the 3D view. select: click and box-select;
   * move: the same, plus dragging fixtures; orbit: look around. Holding Space
   * always looks around, whatever the tool.
   */
  tool: 'select' | 'move' | 'orbit'
  /** The "describe your show" builder is open. */
  builder: boolean
  setBuilder(open: boolean): void
  setTool(tool: 'select' | 'move' | 'orbit'): void
  setHaze(haze: number): void
  setDemo(demo: boolean): void
  setFullView(full: boolean): void
  setLeftTab(tab: 'fixtures' | 'library' | 'set'): void
}

export const useViewSettings = create<ViewSettings>((set) => ({
  haze: 0.6,
  demo: false,
  fullView: false,
  leftTab: 'fixtures',
  tool: 'select',
  builder: false,
  setBuilder: (builder) => set({ builder }),
  setTool: (tool) => set({ tool }),
  setHaze: (haze) => set({ haze }),
  setDemo: (demo) =>
    set((s) => {
      // Starting the demo begins from clean test levels (a stray fader can't hold a head still).
      if (demo && !s.demo) dmxBus.clearFaders()
      // Stopping it, however it's stopped, takes its levels away too (faders moved by hand stay).
      if (!demo && s.demo) dmxBus.clearAuto()
      dmxBus.setPreview(demo)
      return { demo }
    }),
  setFullView: (fullView) => set({ fullView }),
  setLeftTab: (leftTab) => set({ leftTab })
}))
