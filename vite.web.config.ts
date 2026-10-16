/**
 * The browser version: the same page as the Mac app, without Electron.
 *
 *   npm run dev:web    a dev server at http://localhost:5173 with hot reload
 *   npm run build:web  a static site in out/web (any web host: GitHub Pages, Netlify…)
 *   npm run bridge     the Art-Net bridge, for live DMX from SoundSwitch
 *
 * `__WEB__` switches in src/renderer/src/web/api.ts as window.api. The fixture
 * libraries in resources/ are served as they are (resources/library/*.json).
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  root: 'src/renderer',
  publicDir: '../../resources',
  // Relative paths, so the site works from any folder (e.g. username.github.io/sound-visualizer/).
  base: './',
  plugins: [react()],
  define: { __WEB__: 'true', __APP_VERSION__: JSON.stringify(version) },
  server: { port: 5173, strictPort: false },
  build: { outDir: '../../out/web', emptyOutDir: true, chunkSizeWarningLimit: 4000 }
})
