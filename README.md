# Sound Visualizer

A 3D lighting visualizer. It reads your SoundSwitch rig, draws each fixture to its real size, and plays SoundSwitch's show live over Art-Net. A library of about 2,300 real fixtures (the Open Fixture Library, QLC+'s fixture library and Both Lighting) lets you add anything else, and the Fixture Studio makes or fixes any fixture that isn't there.

*Works with SoundSwitch. SoundSwitch is a trademark of inMusic; Sound Visualizer is not affiliated with or endorsed by inMusic.*

**For people using the app:** download the `.dmg` from this repository's [Releases](../../releases/latest) page, open it, drag Sound Visualizer to Applications, open it (the release notes say how to get past macOS's first-open warning). Nothing else to install. The first time, it starts with an empty show: a five-step welcome, then **New show** (from your SoundSwitch project, by describing it, from scratch, or the demo show), then a short guided tour of the screen.

## Learning the app

- **? Learn** (top right) and **Help ▸ Guided Tours** have short tours that dim the window and light up the real buttons one at a time: *Getting around the screen*, *Making a show*, *Adding lights*, *Objects, moving and lining up*, *SoundSwitch and live DMX*, and *Cameras, room and pictures*. Next/Back or the arrow keys step through; Esc ends one. Tours you've finished get a ✓.
- **Help ▸ Welcome Tour** shows the welcome again.
- **Starting fresh.** Deleting the app on a Mac leaves its settings behind, so after a reinstall or an update the app asks whether to carry on with your last show or **start fresh as a new user**. **Help ▸ Start Fresh as a New User…** (or ? Learn) does the same any time: the open show is cleared (saved show files are never touched), this Mac's SoundSwitch choices and the tour checkmarks are forgotten, and optionally the Claude key and imported fixture files too. The app then starts exactly as a new install would.

It's built with Electron (desktop app), React (panels), three.js (3D) and TypeScript.

## Run it

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
git clone <this repository's URL>   # the green Code button on GitHub shows it
cd sound-visualizer
npm install        # first time only, downloads everything into node_modules/
npm run setup      # first time only, downloads the Electron app itself
npm run dev        # opens the app, and reloads it when you save a file
```

Then click **Play demo** in the Faders panel, or select a fixture and move its faders.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run setup` | Downloads Electron if `npm run dev` says "Electron uninstall" |
| `npm test` | Runs the unit tests in `tests/` |
| `npm run typecheck` | Checks the TypeScript types without building |
| `npm run build` | Builds the app into `out/` |
| `npm start` | Runs the built app |
| `npm run artnet:test` | Sends test Art-Net, like a console would |
| `npm run check` | Typecheck and tests together, before you commit |
| `npm run library` | Downloads the latest Open Fixture Library and repacks `resources/library/ofl.json` |
| `npm run dist:mac` | Builds the signed universal app: `dist/Sound-Visualizer-<version>-mac.dmg` (see RELEASING.md) |
| `npm run verify:mac` | Runs Apple's checks (signature, notarization, Gatekeeper, universal) on the last build |

## Make the app (.dmg) to share

**The easy way: let GitHub build it.** On the repository page, go to **Releases ▸ Draft a new release**, type a new tag like `v1.2.0`, write what changed, and press **Publish release**. The *Release the Mac app* workflow (in `.github/workflows/release.yml`) builds the app on one of GitHub's Macs, runs the tests, and attaches the `.dmg` and `.zip` to that release about 10 minutes later, with install notes. Anyone can download it from the Releases page. You can also run it by hand: **Actions ▸ Release the Mac app ▸ Run workflow** makes a release named after the version in `package.json`.

**On your own Mac:**

```bash
npm install         # once, after pulling a new version
npm run dist:mac    # builds, signs, and runs Apple's checks
```

You get **`dist/Sound-Visualizer-<version>-mac.dmg`**: one universal app that runs natively on Apple Silicon (M1 and later) and Intel Macs, macOS 12 Monterey or newer. The script finishes with a pass/fail list of Apple's checks (also saved as `dist/verification.txt`).

To make it open on anyone's Mac with no warnings, it has to be signed with your Developer ID and notarized by Apple. **[RELEASING.md](RELEASING.md)** walks through the one-time setup, on your Mac or in the GitHub workflow. Without it you get an ad-hoc signed build: on other Macs, the first time, run `xattr -cr "/Applications/Sound Visualizer.app"` in Terminal (or use System Settings ▸ Privacy & Security ▸ Open Anyway).

On first launch macOS asks to let the app find devices on your local network: allow it, or Art-Net from SoundSwitch can't reach it. Each person's SoundSwitch project, settings, imported fixtures and Claude key stay on their own Mac (in `~/Library/Application Support/Sound Visualizer`).

## Adding fixtures: the Library

Press **+ Add fixtures** (or Cmd+L) to open the Library tab.

- **Search** by maker, model or type ("chauvet spot", "pixel bar"), or browse by maker. The chips filter by kind: moving heads, pars and washes, bars and pixels, strobes, effects and lasers, smoke.
- **Click a fixture** to see its real size, weight and power, and choose a **mode**.
- **How many** and **Patch from** set how many to add and where they start: each fixture goes in the next free gap, carrying on into the next universe when one is full. The line underneath tells you where they'll land before you add them.
- **Drag** a fixture (or the ⠿ handle in the details, which keeps the chosen mode) onto the floor in the 3D view to place one there.
- **In your rig** lists the fixture types already in your show (including the SoundSwitch ones). Press + to add another of the same type with its own patch.
- **Import…** adds fixture files you download from [open-fixture-library.org](https://open-fixture-library.org) (choose "Open Fixture Library JSON"). They're kept in your user data folder, so updates never lose them.

The fixture types you use are saved inside the project, so a project opens the same on any computer.

**Both Lighting.** The library includes 24 Both Lighting fixtures (MH-150, Hybrid 300W, BPM-Spots and BPM-Beams, Mini Beam Mover, Splash Pro/X, Aura 1915, Spider Wash, the IR/S/SQ uplights, Chroma Cannon, SQ-BAR9, FX Pix Bar 1000, 360 Tubes, Retro bars and hexes, G-Pins), written from Both Lighting's own user manuals, with colour wheel orders from their SoundSwitch profiles. Search "both lighting". Where a manual leaves something out (a pan range, a colour name), the fixture's notes say what was assumed.

**QLC+ fixtures.** About 1,600 more fixtures come from the QLC+ project's fixture library (Apache 2.0, see `resources/library/LICENSE-QLCPLUS.txt`); ones already in the Open Fixture Library are left out. `node scripts/build-qlcplus.mjs` (optionally with a path to a QLC+ `resources/fixtures` folder) rebuilds `resources/library/qlcplus.json`.

## Fixture Studio: make or fix a fixture

**File ▸ New Fixture…** (Shift+Cmd+N), **New fixture…** in the Library, or **Open in Fixture Studio** on any fixture (from the Library, the inspector, or the right-click menu). No real light is needed.

- **Start from anything**:
  - **Enter the DMX chart** in a table: one row per channel, with its name, what it does (picked from a searchable list, or worked out from the name as you type), the part it drives (the whole light, a cell, an LED ring) and its value ranges. Paste a chart copied from a PDF anywhere in the table and it fills itself in; **Fill from a template** starts the table from a usual layout.
  - **Ask Claude to make it**: name the light (Claude finds its manual on the web) or describe it (“a 7-channel RGBW PAR with strobe and programs”). Claude also reads dropped manuals (PDF or photos).
  - **Drop a fixture file** (.svfixture, QLC+ .qxf, GDTF, Open Fixture Library .json), or **Search the web** for the manual (Claude, or your browser without it).
  - **Start from a kind of light**, then pick its channel count: the usual layouts for each kind (from a 3-channel RGB PAR up to a 96-channel pixel tube or a CMY spot), with the most common marked, plus any count you type, any number of cells, and an LED ring for heads that have one. The counts were chosen from how often each mode size turns up in SoundSwitch's fixture library (only totals were used; nothing from it is in the app).
- **See it working**: a 3D twin of the fixture in a test room, and a schematic of its face and every DMX channel, both lit live as you move a slider or hover a value.
- **Tests for its kind** (PARs, washes, bars and tubes, clusters, moving heads, lasers, effects, GigBar-style combos): each says what you should see; *Something's off* offers the usual fixes. Built-in programs and gobos are shown as close as a generic pattern allows. Or follow a fixture in your show and watch exactly what SoundSwitch sends it.
- **Edit in batches**: select many channels to change them together, *Repeat* them for each cell, drag the lines between value ranges. **+ Add** finds any channel job by name (strobe, CTO, frost, endless pan, beam shaper, fog…) or adds an **LED ring** part. Anything not listed is *Other* with the manual's name, kept in saves and exports. **Problems** lists what still looks wrong, with one-click fixes. Each channel shows whether it was read for sure, guessed, or is missing.
- **DMX modes**: the **DMX mode** menu lists the light's modes (the channel layouts it can be set to), and adds one as a copy, from a usual layout (e.g. the 3-channel mode of a bar, sharing its cells), or empty.
- **✦ Ask Claude** (with Claude connected) changes the open fixture as you describe it: “add a 3-channel mode”, “channel 7 is the strobe”, “add the LED ring channels from the manual”. One Undo takes it back.
- **Look**: shape, size, housing colour, cell layout and beam, from a template, a photo, or borrowed from a similar Library fixture.
- **Save** keeps it in **My Fixtures** (Library); **Save & add to show** also makes it stand in for the fixture it fixes (SoundSwitch ones included; **Back to the original** undoes that). **← Fixtures** goes back to the Studio's start for another fixture, and **Back to show** closes the Studio; with unsaved changes, both ask whether to save or leave without saving. **Export** writes a `.svfixture` file to share: it holds an Open Fixture Library fixture plus the Studio's own details, so it opens in other tools and comes back here fully editable.

## Objects: stands, truss, staging, sound, furniture, people

The **Objects** tab has everything in the room that isn't a light, in folding groups with a search box:

- **Stands & totems**: totems (2-9 ft), Chauvet DJ FLEXstands, tube stands, T-bar stands.
- **Truss**: goalposts, truss boxes, truss on the floor.
- **Staging**: 4 × 4 and 4 × 8 ft decks, or whole stages, at 1, 2, 4 or 6 ft, with skirts and steps.
- **Speakers & sound**: 8, 10, 12 and 15 in tops on a sub pole, on a tripod or on their own; 15, 18, 21 in and double 18 subs; stacked subs (cardioid too); wedge monitors; flown line arrays and ground stacks; column PAs; a FOH mixing desk; amp racks.
- **DJ & band**: DJ booths with facades, decks or turntables and a mixer, mic stands (boom or straight), a drum kit, guitar amps, a keyboard.
- **Furniture**: banquet tables, round tables with chairs, high-tops, a bar, rows of chairs, lounge sofas.
- **Room & decor**: walls and partitions, pipe and drape, dance floors, projection screens, LED walls, backdrops, stanchions, plants, pillars.
- **People**: a person for scale, or a crowd (light, busy or packed).

Click one to add it, or drag it into the view. **Click an object to edit it**: the bar above it has the standard heights (a 4 ft totem becomes 6 ft in one click) and **Edit**, which opens all its settings: sizes in feet with − / + half-foot steps, speaker sizes, how many chairs or boxes, colours and turn. Double-click one to edit it straight away.

**Moving heads: truss or totem mode.** The bar above a moving head has **⤓ Hang** / **⤒ Upright**: upright stands it on a totem, a stand, the top of the truss or the floor; hang puts it upside down under the truss (the nearest one, or the same bar it's on). The inspector's Mounting does the same.

**It all obeys physics.** Nothing sinks into the floor or floats: an object stands on the floor, or on top of the stage, table or sub under it, and goes up and down with it. Flown line arrays hang at their height. The room grows to fit everything: the back wall moves back and the ceiling goes up if something wouldn't fit (Room ▾ says when).

**Fixtures snap onto objects.** Drag a fixture over a totem or stand and it snaps to the top plate; over a truss and it hangs from the bar; next to a totem's face and it clamps on (washes); along a booth facade, a bar front or near the top of a wall. A ring shows where it will go, and blue guides show every place a fixture can attach. You can also drop a fixture from the Library straight onto an object, or use the right-click menu or the inspector's **Attached to** list. Delete the object and the fixture falls to the floor.

## Moving and lining things up

- **Drag anything** (Select or Move tool) to slide it across the floor. What's attached to it or standing on it comes along: a stage brings the speakers and lights on it, a sub brings the top on it.
- **A light on a stand moves its stand.** Grab the tube on a tube stand, or the head on a totem, and both move. Hold **Option** while dragging to lift the fixture off instead.
- **Select several at once**: drag a box on empty floor. Objects are picked when they're wholly inside the box, so you can box a few things on a stage without grabbing the stage. A stage, dance floor or crowd drags once it's selected (click it first).
- **One-click arranging**: right-click (in the view, the fixture list or the Objects list) and use **Move to** (back, centre or front of the stage, left or right side, in front of the stage), **Line up evenly** (a row across the back or front of the stage, in front of it, or where they are), **Align** (edges or centres) and **Space evenly**. The same buttons are in the inspector under **Move and line up**. Each is one undo step.

## Describe your show

**✦ Build show** (Cmd+K) lets you type what you want, or talk: press Fn twice (Edit ▸ Start Dictation) in the box. For example: *"two Both Lighting 100 watt moving heads on 6 ft totems, one each side of the stage, the right one with pan inverted"*. It finds the fixtures in the library, adds the totems beside the stage, puts a head on each, patches them into free addresses and inverts the pan on one. The whole build is one undo step.

Above the box you choose what happens to the show that's open: **＋ Add to this show** builds on what's already there, and **↺ Start a new show** clears the scene first, then builds (the button says *Clear and build*). Either way ⌘Z puts back what you had, and if nothing could be built the show is left as it was.

- **Without setup**, a built-in reader understands requests like that one: a number of a fixture, on totems, FLEXstands or the truss, one each side, invert one.
- **Connect Claude** (in the builder) to build anything you can describe, like "a 16 × 12 stage 2 ft high with a black skirt, a booth on it, four MH-150s on a 20 ft truss and uplights along the front". It needs an Anthropic API key from console.anthropic.com. The key is stored encrypted with your Mac's keychain and only the app's main process sends it to Anthropic; requests are billed to your API account.

## New show: pick the fixtures from SoundSwitch

**File ▸ New Show…** (⌘N) asks how to start:

- **From my SoundSwitch**: pick one of the SoundSwitch projects found on this Mac (the one open in SoundSwitch is marked), then choose which of its fixtures this show uses. Each fixture type lists every place it's patched (an IR-4 patched four times shows four lines, each with its universe and channels). For each line: tick it, set **how many** (more than 1 adds copies on the *same* DMX patch, so they do exactly what the original does), and **where it goes**: on the truss, on totems or FLEXstands either side, on tube stands, along the front or back, or on the booth. Or type it in the box: *“two copies of the movers on 6 ft totems, the IR-4s along the front, skip the tubes”* fills the list in for you, and you can still change it. Pairs of moving heads can be mirrored (the right-hand one pans the other way).
- **Describe it**, **Start from scratch** (an empty room or a basic stage, then the Library), or the **Demo show**.

A show made from SoundSwitch follows that project: patch changes there come in, but only for the fixtures you picked, and copies follow their original. A show made from scratch, a template or the demo ignores SoundSwitch until you press **Follow it** in the toolbar. Make as many shows from the same SoundSwitch project as you like: a small one and a big one, with different fixtures.

## Shows: save, start from, import, export

- **Save and open** `.ssvis` files (below): everything is in them, objects and fixture types included.
- **Shows ▾ / File ▸ New from Template**: start from a Mobile DJ, Club stage, Wedding/event or empty room rig, built from Both Lighting fixtures. Undo puts your previous show back.
- **Import Show into This One**: adds another show's objects and fixtures to the current one, re-patching anything that would clash. Objects you already have (the same stage in the same place) aren't doubled.
- **MVR** (My Virtual Rig, the open format lighting design and console software uses to exchange rigs): **Export** writes fixtures with their position, patch and GDTF name, and objects as 3D models. **Open MVR** reads fixtures from any MVR: matched to the library by name, or built from the GDTF file inside it. An MVR this app wrote comes back exactly as it was.
- **Export ▸ Patch List (CSV)**: every fixture with its universe, address, group and what it's attached to, for a spreadsheet.

## Working in the 3D view

**Mouse tools** (top left of the 3D view):

| Tool | Left mouse button |
| --- | --- |
| **Select** (V), the default | Click a fixture or object to select it; Shift-click adds or removes; drag on empty space to box-select (Shift adds to the selection); drag anything to slide it across the floor, with what's on it |
| **Move** (W) | Same, plus arrows to move exactly in 3D, and up and down |
| **Orbit** (O) | Drag to look around |

With any tool, **hold Space** and drag to orbit, **Space+Shift** drag to pan, **Space+Alt/Option** drag to zoom. The scroll wheel always zooms, and the middle button pans. Clicks go through beams to the fixture, and a click near a small fixture picks it.

**No scroll wheel or right button needed.** The camera buttons in the bottom-right corner of the 3D view zoom (＋ −), turn around the show (◀ ▶ ▲ ▼), move left, right, forward and back, and go up and down; hold one to keep moving, and ⌂ goes back to the starting view. ✕ tucks them away (✥ brings them back). The keyboard does the same: **arrows** turn, **Shift+arrows** move, **+ / −** zoom, **Page Up / Page Down** go up and down, **Home** goes back to the starting view. On a trackpad, pinch to zoom.

**The starting view.** A show opens (and a new show, template or file starts) looking at the whole show from the front and a little to the side, framed so every fixture and object is in view. The view buttons (Persp, Top, Front, Left, Right) frame the show the same way, from their side.

| Do this | How |
| --- | --- |
| Views | Persp, Top, Front, Left, Right, Up buttons, or Shift+1 to Shift+6 |
| Frame the selection | **Focus** or F (Shift+F frames everything) |
| Remember a camera | **Cameras ▾ → Store current view**. Stored views are saved with the project |
| Move things | Drag them (a light on a stand brings the stand; Option-drag lifts it off), or use the Move tool's arrows. Snaps to 5 cm, one undo step per drag |
| Line things up | Right-click ▸ **Move to**, **Line up evenly**, **Align**, **Space evenly** |
| Save a picture | **Image** or Shift+Cmd+E |
| Only the stage | **Full view** or Shift+Cmd+F |

| Look at the ceiling | **Up** or Shift+6. You can also orbit right round and look up from anywhere |
| Room light | **Room ▾**: brightness (dark club to house lights), colour, quick presets, ceiling on/off and height. Saved with the project |

**Gobos and pools.** Every beam lights the floor, the stage, the back wall and the ceiling where it actually lands, with its colour, its gobo (the fixture's real wheel slot, from its fixture data), gobo rotation from its rotation channel, and prism copies. Beams stop at the ceiling, the floor and the back wall. Gobo shapes are representative (fixture data doesn't include the gobo images), but each slot always draws the same shape, so you can tell them apart. Up to 32 of the brightest beams light the room at once.

**Acting on fixtures in the 3D view.** Select a fixture (or several) and a bar appears above it: **M** mute, **S** solo, **Hide**, **Dup** (same patch, mirrors it), **Mirror**, and for moving heads **⇄ Pan** / **⇅ Tilt** to invert. **⋯** or right-clicking a fixture (in the view or the fixture list) opens the full menu: duplicate with its own patch, hang from the truss or stand on the floor, move and line up, rotate 90°, focus, select the same type, and delete. Long menus scroll, and submenus open to the side.

**Groups in the fixture list.** The list is grouped **by type** (so copies sit together), or by SoundSwitch group, by patch, or not at all (the menu next to the filter). Click a group's name to select all of it and edit it together in the inspector; ▾ folds a group away (▾▾ folds them all); M, S and ● on the group's row mute, solo and hide all of it. Grouped by SoundSwitch group, double-click a group's name to give it a name (SoundSwitch only numbers them).

**Patch problems.** Copies of a fixture on the same address mirror each other on purpose, so they're never flagged. When two *different* fixtures use some of the same channels (or one runs past channel 512), the top of the fixture list says so once, in plain words, and so does the inspector when one of them is selected: **Move … to …** puts it (and its copies) on the first free channels, **Select** shows them, **Keep as is** stops reporting a clash you meant (saved with the show), and **Fix all** does every one at once. The DMX map only marks real clashes in yellow.

**The inspector** is in sections (Attached to, Move and line up, Fixture, Patch, Mounting…). Click a section's title to fold it away; the app remembers. Hover over almost anything for a short explanation of what it does.

**Distribute.** In the inspector's Arrange section, **Distribute evenly** spreads the selection as a **Line**, **Arc**, **Circle** or **Grid**, where they are, on the truss, or on the floor at the front or back, with an optional total width. **Auto-place by type** puts fixtures where a new import would: movers on the truss, tubes across the back, bars on the booth, GigBars on stands, floor units at the front. Both are also in the right-click menu.

**Panel widths.** Drag the edge of the left or right panel to make it wider or narrower (double-click the edge for the usual width; with the edge selected, the arrow keys nudge it). Each panel keeps a minimum width so nothing is cut off, the 3D view always keeps room, and the widths are remembered.

**The toolbar** fits any window: as it gets narrower, labels turn into icons and the SoundSwitch and Art-Net pills shorten. Click the SoundSwitch pill for its options: sync automatically or now, follow the open project, find it again, choose another, or make a new show from it.

**DMX Map.** The bottom panel's DMX Map shows each universe the way SoundSwitch does: Universe One, Universe Two, each fixture as a coloured band across its channels (coloured by group), named at its start address, with cross-patched channels in yellow and live levels along the bottom. Hover to see what a channel does; click to select; double-click to find it in 3D. Universes are numbered like SoundSwitch everywhere in the app (Universe 1 is Art-Net universe 0).

**Moving heads** move like the real fixture: pan and tilt over the fixture's own ranges at its real top speed, slowed by the pan/tilt speed channel; the prism and gobos turn only when their rotation channels say so.

In the inspector, **Arrange** has tools for the selection: align left/centre/right (and by height or depth), spread evenly, **Mirror copy** (a copy on the other side of the stage, panning the opposite way, on the same patch), **Select same type**, and **Duplicate** a number of copies with an offset, either mirroring the original's patch or each with its own.

## Project files

File ▸ Save (Cmd+S) writes a `.ssvis` file; File ▸ Open, Open Recent, or double-clicking one in Finder opens it. A dot on the Save button means there are unsaved changes. Separately, the app keeps your current project after every change, so quitting or a crash never loses work. Saves are written to a temporary file first, so a crash mid-save can't damage a show file.

If something goes wrong, Help ▸ Open Log Folder shows the log (`~/Library/Application Support/Sound Visualizer/logs`). A panel that crashes shows the error and a **Try again** button instead of taking the window down.

## Try Art-Net

1. Start the app with `npm run dev`.
2. In a second terminal, run `npm run artnet:test`.
3. The status pill at the top right turns green and the rig starts moving.

To use a real console or another visualizer, send Art-Net universe 0 to this Mac's IP address. The first time, macOS may ask whether to allow incoming network connections: click **Allow**. Only one program at a time can listen on port 6454, so close other visualizers first.

The default rig is patched like this (universe 0):

| Fixtures | Type | Addresses |
| --- | --- | --- |
| Spot 1–6 | Moving Head Spot, 16 channels | 1, 17, 33, 49, 65, 81 |
| PAR 1–4 | LED PAR Wash, 8 channels | 97, 105, 113, 121 |

Spot channels: 1 pan, 2 pan fine, 3 tilt, 4 tilt fine, 5 speed, 6 dimmer, 7 shutter (0–31 open, 32–255 strobe), 8 red, 9 green, 10 blue, 11 white, 12 zoom.
PAR channels: 1 dimmer, 2 red, 3 green, 4 blue, 5 white, 6 zoom, 7 shutter.

## Use it with SoundSwitch

The app follows your SoundSwitch rig automatically:

1. **Fixtures.** On start, it finds the project SoundSwitch has open and reads the fixtures, modes and DMX addresses from its `SoundSwitchVenues.bin`. The toolbar shows `SoundSwitch: <project> · <n> fixtures`. With **Auto** ticked, any patch change you make in SoundSwitch shows up within a second, and fixtures you've moved keep their position. **Find** looks again (for example after you open another project); **Choose…** lets you pick a `.ssproj` folder yourself.
2. **The show.** In SoundSwitch, open Preferences → Hardware → DMX & Art-Net, keep **Enable Art-Net** and **Localhost Art-Net Node** ticked, and select *Sound Visualizer* in the device list. SoundSwitch's universe One arrives as Art-Net universe 0, and universe Two as 1.

Everything SoundSwitch plays goes out as DMX over Art-Net, so the visualizer follows every SoundSwitch screen the same way: Autoloops, Static Looks, Performance Mode, Edit Mode and scripted tracks. When a show starts arriving, the demo stops and the show drives every channel, pan and tilt included: a fader only takes over a channel when you move it yourself, until you press **Release** in the Faders panel. If SoundSwitch's universes arrive numbered from 1 instead of 0, the app lines them up and says so in the Art-Net pill.

**Leaving fixtures out.** SoundSwitch can keep records of fixtures that aren't in your profile any more. Delete one in the app and it's added to `soundswitch-exclude.json` in your user data folder (`~/Library/Application Support/Sound Visualizer/`), so it stays gone on every sync. Edit or empty that file to bring fixtures back. Entries in the older copy in this project folder are still read.

The venue file format isn't documented by SoundSwitch; `src/shared/soundswitch.ts` explains what we worked out. If a SoundSwitch update changes the format, the toolbar will show fewer fixtures or an error instead of guessing.

To check the reader against your own venue file:

```bash
SOUNDSWITCH_VENUE="$HOME/Music/SoundSwitch/My Venue.ssproj/SoundSwitchVenues.bin" npm test
```

## How the code is organised

Each folder matches a layer from the architecture blueprint.

```
resources/library/       The bundled fixture library (ofl.json) and its MIT licence
scripts/build-library.mjs  Packs the Open Fixture Library into ofl.json
build/icon.png           The app icon (source: build/icon-src/icon.svg)
build/entitlements.mac.plist  The one hardened-runtime exception the app needs (JIT)
scripts/dist-mac.mjs     Builds, signs, notarizes and checks the Mac app
electron-builder.yml     How `npm run dist` packages the app
src/
  main/index.ts          Electron main process: the window, the Art-Net UDP sockets, IPC
  main/soundswitch.ts    Finds and watches the SoundSwitch project you have open
  main/library.ts        Loads the fixture library and your imported fixture files
  main/files.ts          Saving and opening .ssvis projects, saving images
  main/menu.ts           The app menu
  main/claude.ts         The show builder's link to Claude (API key kept encrypted)
  main/security.ts       IPC only from our page, no navigation or new windows, permissions refused
  main/log.ts            The log file
  main/paths.ts          Where bundled and per-user files live
  preload/index.ts       The safe bridge that passes DMX from main to the page
  shared/                Code both sides use: Art-Net packets, the SoundSwitch reader, message types
  renderer/src/
    model/               The document: plain data, no UI
      fixtureTypes.ts    What each kind of light can do and its DMX channel layout
      project.ts         Fixtures, patch checks, the default rig
      decode.ts          Raw DMX levels -> pan, tilt, colour, intensity, beam angle, pixel cells
      soundswitchImport.ts  SoundSwitch fixtures -> our fixture types, with a starting layout
      layout.ts          Automatic layout and Distribute (line, arc, circle, grid)
      structures.ts      Objects: sizes, surfaces and mount points (totems, truss, stages, speakers, furniture…)
      arrange.ts         What moves together (a stand and its light, a stage and what's on it); Move to, Line up, Align
      physics.ts         Everything rests on something; attached fixtures follow; the room grows to fit
      exchange.ts        Merging shows, MVR (and GDTF) in and out, CSV patch lists
      oflImport.ts       Open Fixture Library fixtures -> our fixture types (heads, wheels, shutter, pixels)
      heads.ts           Decoding DMX per head: colour, wheels, shutter ranges, master dimmers
      catalog.ts         Researched real sizes and looks for the fixtures in your rig
    state/               Changing things
      store.ts           Project state with undo/redo
      commands.ts        Every way to change the project, each one undoable
      properties.ts      Descriptions of editable properties, used by the inspector
      dmxBus.ts          Live DMX levels, kept out of undo and the saved project
      demo.ts            Test signals for the faders
      library.ts         The library in the page: search, recent, converting on demand
      document.ts        The project as a file: path, unsaved changes, save/open
      menuCommands.ts    Menu items and shortcuts, all running the same commands
      viewBus.ts         Camera requests to the 3D view (presets, focus, image)
      showBuilder.ts     "Describe your show": the builder's tools, the built-in reader, Claude
      shows.ts           Templates, importing and exporting shows
    three/               The 3D view
      Viewport.tsx       Scene, camera, click-to-select, and the frame loop
      fixtureRig.ts      One fixture's 3D model and its movement simulation
      beamMaterial.ts    The shader that draws a beam in haze
      stage.ts           The room (floor, wall, ceiling), sized to fit everything, and its ambient light
      structures.ts      Draws objects: box truss, decks, speakers and line arrays, furniture, walls, people
      roomMaterial.ts    Room surfaces light themselves from every beam, gobo and prism included
      projectors.ts      Each frame's list of lit beams, for the room surfaces
      gobos.ts           The gobo pattern atlas
    ui/                  The panels around the 3D view
tests/                   Unit tests (Vitest)
scripts/artnet-test.mjs  Art-Net test sender
```

### How one DMX frame becomes a beam

1. A console sends an Art-Net packet to port 6454.
2. `main/index.ts` receives it and `shared/artnet.ts` checks and decodes it.
3. The preload bridge passes the 512 levels to the page; `dmxBus` stores them.
4. Every frame, `Viewport.tsx` asks `decode.ts` what each fixture should be doing.
5. `fixtureRig.ts` moves the head toward that target at the fixture's top speed, sets the colour and zoom, and the beam shader draws it.

### Ideas worth noticing

- **Live DMX never touches the project.** Levels change 40 times a second; keeping them in `dmxBus` instead of the store means undo and saving only see real edits.
- **One inspector for everything.** `Inspector.tsx` knows nothing about fixtures. It draws fields from the descriptors in `properties.ts`, and edits every selected fixture at once.
- **Commands, not scattered edits.** The toolbar buttons, the inspector and the Delete key all change the project through `commands.ts`, which calls `store.apply`, so every change is one undoable step for Cmd+Z.

## What's next

- **More objects**: circle truss, arches, tents, hazers on the floor.
- **Gobo images**: draw the fixture's real gobo glass where a GDTF file includes it, instead of the representative shapes.

## License

GPL-3.0. See [LICENSE](LICENSE).
