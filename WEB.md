# The browser version

The same app as the Mac version, running in a web browser. It's the same code: the
3D view, Fixture Studio, the Library, shows, cameras and Claude all come from
`src/renderer`. Only the part that talks to the computer is different. In the Mac
app that's Electron (`src/main`, `src/preload`); in the browser it's
`src/renderer/src/web`, which gives the page the same `window.api`.

## Running it

```bash
npm install          # once
npm run dev:web      # http://localhost:5173, reloads as you edit
npm run build:web    # a static site in out/web, for any web host
npm run bridge       # the Art-Net bridge, for live DMX from SoundSwitch (see below)
```

## What's the same, and what isn't

| | Mac app | Browser |
| --- | --- | --- |
| 3D view, beams, Fixture Studio, Library (OFL, QLC+, Betopper, Rockville…) | ✓ | ✓ same |
| Shows: open, save, autosave | Files anywhere, save in place | Chrome/Edge: real Open/Save, save in place. Safari/Firefox: Open picks a file, Save downloads one |
| Finding the SoundSwitch project | Finds the one SoundSwitch has open | You pick your SoundSwitch folder once; every project in it is remembered |
| SoundSwitch patch changes showing up | Within a second | Chrome/Edge: within two seconds (it checks the file). Safari/Firefox: pick the folder again |
| Live DMX (Art-Net) from SoundSwitch | Built in | Needs the bridge running on the same computer |
| Your fixtures, imported fixtures, your kinds of light | In the app's folder | In this browser (IndexedDB): per browser, per computer |
| Claude | Key kept in the macOS keychain | Key kept in this browser's storage |
| Menus | Menu bar | The Shows menu has File's items; shortcuts work (⌘N is the browser's own) |

## The two things a browser can't do

**1. Look around your disk.** A web page can only read files and folders you pick.
So it can't ask "which project does SoundSwitch have open?" the way the Mac app does.
Instead: **Open another SoundSwitch project…** (the SoundSwitch pill) or **New show ▸
From my SoundSwitch ▸ Browse** asks for a folder. Pick the folder your projects are
in (a `SoundSwitch` folder in Music or Documents), or your whole Music folder: every
`.ssproj` project inside, up to three folders down, is found and remembered. Chrome
and Edge keep permission to read it; on a later visit they may ask again (click
**Read the project again** in the pill).

**2. Receive Art-Net.** Art-Net is UDP, and browsers can't open UDP sockets. The
**Art-Net bridge** (`src/bridge`) is a tiny program that receives Art-Net exactly
like the Mac app (and answers SoundSwitch's ArtPoll, so SoundSwitch lists "Sound
Visualizer"), then passes each universe to the page over a WebSocket on
`127.0.0.1:6455`, which only this computer can reach. The page connects by itself
and the Art-Net pill turns green. Everything else works without it.

The first time a page on the internet connects to the bridge, Chrome may ask to allow
it to reach devices on your local network: allow it.

## Browsers

- **Chrome, Edge, Arc, Brave, Opera** (Mac and Windows): everything above.
- **Safari, Firefox**: everything except saving in place and following SoundSwitch
  patch changes live (they can only read a copy of a folder at the moment you pick it).
  Safari also blocks the page from reaching the bridge when the site is on `https://`.

## Putting it online

`out/web` is a plain static site: GitHub Pages, Netlify, Cloudflare Pages, or any
web server. `.github/workflows/web.yml` publishes it to GitHub Pages when you run it
by hand (Actions ▸ Publish the web version). Turn on Pages first: Settings ▸ Pages ▸
Source: GitHub Actions. The site is about 20 MB, most of it the fixture libraries
(they're downloaded once and cached).

## Still to do for the browser

1. **Wording**: a dozen places say "this Mac" or "the Mac app" (the welcome, fresh start).
2. **The bridge as a download**: today it runs with Node (`npm run bridge`). For other
   people it should be a double-click app for Mac and Windows (one small file, no Node).
3. **Install as an app** (a PWA): its own window and Dock/taskbar icon, works offline,
   and `.ssvis` files open in it.
4. **Big shows**: the QLC+ list (14 MB) loads on first visit; load it only when the
   Library is opened.
