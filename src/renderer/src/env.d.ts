import type { VisualizerApi } from '../../shared/ipc'

declare global {
  /** Set by vite.web.config.ts: this is the browser version (src/renderer/src/web). */
  const __WEB__: boolean | undefined
  /** The app's version, from package.json (browser version only). */
  const __APP_VERSION__: string | undefined
  /** Commit and date of the build (browser version). */
  const __BUILD__: string | undefined
  interface Window {
    /** Present when running inside Electron; missing in a plain browser. */
    api?: VisualizerApi
  }
}
export {}
