import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

async function start(): Promise<void> {
  // The browser version (npm run dev:web) brings its own window.api; the Mac app's comes from Electron.
  if (typeof __WEB__ !== 'undefined' && __WEB__ && !window.api) (await import('./web/api')).installWebApi()
  // The app is loaded after window.api is in place: some modules read it as they load.
  const { App } = await import('./App')
  // On a site with the account API (Cloudflare): who's signed in, their settings and shows.
  if (typeof __WEB__ !== 'undefined' && __WEB__) void (await import('./state/account')).startAccount()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
void start()
