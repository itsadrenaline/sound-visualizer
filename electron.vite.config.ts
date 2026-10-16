import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * The built page only runs its own scripts: a Content-Security-Policy that
 * blocks injected or remote code. (Only for builds: the dev server needs
 * inline scripts for hot reload.) `file:` is the built page's own origin.
 */
const CSP = [
  "default-src 'self' file:",
  "script-src 'self' file:",
  "style-src 'self' file: 'unsafe-inline'",
  "img-src 'self' file: data: blob:",
  "font-src 'self' file: data:",
  "connect-src 'self' file: data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
  }
}

// electron-vite builds three separate bundles:
//  - main:     the Node.js process (windows, UDP sockets)
//  - preload:  the small, safe bridge between Node and the page
//  - renderer: the web page itself (React + three.js)
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // Sandboxed preload scripts must be CommonJS.
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } }
  },
  renderer: { plugins: [react(), contentSecurityPolicy()], define: { __WEB__: 'false' } }
})
