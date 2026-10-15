# Releasing the Mac app

`npm run dist:mac` builds one universal `.dmg` (Apple Silicon + Intel). How far it gets through Apple's checks depends on what's set up on the Mac that builds it:

| You have | You get | On someone else's Mac |
| --- | --- | --- |
| Nothing (default) | Ad-hoc signed build | "Can't be opened because Apple cannot check it": run `xattr -cr "/Applications/Sound Visualizer.app"` in Terminal once, or System Settings ▸ Privacy & Security ▸ **Open Anyway** |
| A Developer ID certificate | Signed with your name, hardened runtime | Still warns: not notarized |
| Certificate **and** notarization credentials | Signed, notarized by Apple, ticket stapled | Opens normally, no warnings. This is the one to share |

## One-time setup to sign and notarize

1. **Join the Apple Developer Program** at [developer.apple.com/programs](https://developer.apple.com/programs/) (paid, yearly, individual is fine). Only a member can make a Developer ID certificate and use the notary service.
2. **Make a Developer ID Application certificate.** In Xcode: Settings ▸ Accounts ▸ your team ▸ Manage Certificates ▸ **+** ▸ *Developer ID Application*. It lands in your login keychain; `security find-identity -v -p codesigning` should list `Developer ID Application: Your Name (TEAMID)`.
3. **Make a notarization key** (recommended over your Apple ID password): [App Store Connect ▸ Users and Access ▸ Integrations ▸ Team Keys](https://appstoreconnect.apple.com/access/integrations/api), **+**, access *Developer*. Download the `.p8` once and keep it somewhere private (not in this folder). Note the **Key ID** and the **Issuer ID**.
4. **Put the key in your shell**, e.g. in `~/.zshrc`:
   ```bash
   export APPLE_API_KEY="$HOME/.private_keys/AuthKey_ABC123XYZ.p8"
   export APPLE_API_KEY_ID="ABC123XYZ"
   export APPLE_API_ISSUER="00000000-0000-0000-0000-000000000000"
   ```
   (Or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` from appleid.apple.com, and `APPLE_TEAM_ID`.)

Then:

```bash
npm install
npm run dist:mac
```

It checks types, runs the tests, builds, signs every binary with the hardened runtime, sends the app to Apple's notary service (a few minutes), staples the ticket, and runs the checks below. Share `dist/Sound-Visualizer-<version>-mac.dmg` (or the `.zip`).

## Releasing from GitHub (no Mac needed)

`.github/workflows/release.yml` builds the app on GitHub's own Macs and attaches it to a release:

1. On the repository page: **Releases ▸ Draft a new release**.
2. **Choose a tag** ▸ type a new one, like `v1.2.0` (bump `version` in `package.json` to match first, so the file is named right).
3. Write what changed (or press **Generate release notes**), then **Publish release**.
4. Watch it under **Actions**. In about 10 minutes the release has the `.dmg`, the `.zip`, the check results and install notes.

**What's new**: put the notes for a version in `release-notes/v<version>.md` (e.g. `release-notes/v1.4.0.md`) before releasing. The workflow puts them at the top of the release page, above the changelog link and the install steps it adds.

**Actions ▸ Release the Mac app ▸ Run workflow** does the same without drafting a release: it makes one named after the version in `package.json` if there isn't one yet.

To have GitHub sign and notarize it too, add these under **Settings ▸ Secrets and variables ▸ Actions** (the workflow uses them only when they're there):

| Secret | What it is |
| --- | --- |
| `MAC_CERTIFICATE_P12_BASE64` | Your Developer ID Application certificate exported from Keychain Access as a `.p12`, then `base64 -i cert.p12 \| pbcopy` |
| `MAC_CERTIFICATE_PASSWORD` | The password you gave the `.p12` |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | For notarization (an app-specific password from appleid.apple.com) |

## What the checks are

`npm run verify:mac` re-runs them on the last build; the result is also in `dist/verification.txt`.

- **Universal**: the app binary contains both `arm64` and `x86_64` (`lipo -archs`).
- **Signature valid**: `codesign --verify --deep --strict`.
- **Developer ID** and **hardened runtime**: `codesign -dv`.
- **No risky entitlements**: only `allow-jit`, which Electron's JavaScript engine needs. No library-validation or debugger exceptions.
- **Local network permission text** is in Info.plist, so macOS can ask before Art-Net arrives.
- **Electron fuses**: the app can't be run as plain Node.js, ignores `NODE_OPTIONS` and `--inspect`, only loads its own `app.asar` and checks it for tampering.
- **Gatekeeper** accepts the app and the `.dmg` (`spctl --assess`), and the notarization ticket is stapled (`xcrun stapler validate`).

## Before each release

- Bump `version` in `package.json` (the `.dmg` is named after it).
- `npm run check` passes.
- Try the `.dmg` on a second Mac, ideally one Intel and one Apple Silicon: install, allow Local Network, start SoundSwitch, check the rig syncs and the show plays.

## The name

The app is **Sound Visualizer** (`com.soundvisualizer.app`). "SoundSwitch" is inMusic's trademark, so the app only uses it to say what it works with ("works with SoundSwitch; not affiliated with or endorsed by inMusic"), never as its own name or in its icon. Settings from the earlier "SoundSwitch Visualizer" builds are brought over on first launch, and old `.ssvis` files still open.

"Sound Visualizer" is a plain description, and as far as a web search shows, the only US filing for it (Samsung, 2020, for a TV app) was abandoned. A descriptive name like this is hard for anyone, including you, to own as a trademark, which is why it's low risk to use. That isn't legal advice: if the app goes public or commercial, have a trademark attorney run a proper clearance search.
