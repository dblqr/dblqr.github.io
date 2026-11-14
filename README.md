# Friend Code QR Generator

QR code generator for friend codes. Generates time-stamped QR codes that can
be scanned in-game.

## Features

- Enter up to 6 friend codes, generates QR codes with rotating timestamps
- Paste QR data, a profile link, or several codes at once into any field
- Scan friend code QR codes using your device camera
- Upload QR code screenshots when camera can't focus
- Friend codes saved in browser localStorage
- Auto-refreshes every 10 seconds in place (no flicker), with a countdown, and
  immediately when you return to the tab
- Tap a QR code to enlarge it; the screen stays awake while codes are shown
- Export/upload friend codes as .txt files
- Download individual QR codes as PNG
- Clear with undo, dark mode, and an analytics consent banner

## Architecture

```text
index.html            Semantic HTML5 shell (inline code: consent + GTM only)
styles.css            All styles, extracted from the original inline <style>
timestamp.js          QR encoding + friend code parsing helpers (browser + Node)
scanner.js            Camera/QR scanner module, dependency-injected for tests
app.js                UI/DOM glue: buttons, form, scanner, auto-refresh
test.js               Zero-framework Node.js unit tests (assert only)
e2e.test.js           Playwright end-to-end tests run in headless Chromium
playwright.config.js  Playwright config; starts a local `serve` on port 4173
generate-fixtures.js  One-time script to regenerate test QR code PNGs
test-fixtures/        Committed QR code PNGs used by test.js
```

### timestamp.js — QR encoding (critical, never change output)

This file contains the core QR data logic. Its output format is consumed by
the game client, so **the encoding must never change** — tests enforce this
with deterministic assertions.

**`DblTimestampHelper.buildQrData(friendCode)`** produces the string encoded
into each QR code:

```text
4,{8-char-friend-code}{timestamp}
```

The timestamp is `Date.now()` converted to hex, with each hex digit mapped
through a 16-char encoding table:

```text
Hex:  0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f
Char: B  C  D  E  F  G  H  J  K  M  N  P  Q  R  S  T
```

Example: `Date.now()` = `0x190e0a1b2c3` → timestamp `CMBSBNCPDQE` → QR data
`4,abcd1234CMBSBNCPDQE`

**`parseFriendCodeFromQR(qrData)`** is a universal parser that extracts the
8-char friend code from any of the 4 known QR formats:

| Format                  | Example                      | Source             |
| ----------------------- | ---------------------------- | ------------------ |
| Plain 8-char code       | `ab12cd34`                   | Other players      |
| `4,{code}{timestamp}`   | `4,ab12cd34CMBSBNCPDQE`      | This app           |
| `7,{code}`              | `7,ab12cd34`                 | In-game Scan Code  |
| URL with `token=` param | `https://...?token=ab12cd34` | Profile deep link  |

Two helpers build on the parser:

- **`isValidFriendCode(code)`** — `true` for exactly 8 lowercase letters or
  digits. Only valid codes get a QR card.
- **`extractFriendCodes(text)`** — every friend code in free text, de-duplicated.
  Used for `.txt` uploads and paste. Tokens are whitespace-separated; a token
  that is not a known format is retried as a comma-separated list, so
  `4,{code}{timestamp}` keeps its comma while `code1,code2` still splits.

All exports use a `module.exports` guard so the file works as a browser global
AND a Node.js module.

### scanner.js — testable scanner module

Exports `createScanner(deps)` — a factory that returns scanner methods without
touching the DOM directly. All DOM access goes through injected dependencies:

```js
const scanner = createScanner({
  parseFriendCodeFromQR, // from timestamp.js
  showToast, // from app.js
  generateAllQRCodes, // from app.js
  getDialog, // returns the <dialog> element
  getElement, // getElementById wrapper
  querySelectorAll, // querySelectorAll wrapper
  Html5Qrcode, // QR scanning library from CDN
});
```

An optional `vibrate(pattern)` dependency gives haptic feedback on each
successful scan.

This makes `onScanSuccess` (the core scan logic: parse, validate, dedupe,
advance) testable in Node.js by mocking the DOM callbacks.

Slot behaviour:

- The scanner snapshots the form when it opens and starts at the first empty
  slot. Saved codes are never overwritten unless the user navigates to that
  slot with ‹ › (the title then shows `(replaces …)`).
- After each scan it moves to the next empty slot and finishes when none are
  left.
- Codes already in the form or scanned this session are rejected. Re-reads of
  the code just scanned (still in front of the camera) are ignored silently.

Camera lifecycle: `Html5Qrcode.stop()` throws synchronously until the camera
is actually scanning (for example while the permission prompt is open). Every
start and stop bumps a generation counter; a camera that finishes starting
after the scanner was closed stops itself. Stopping never throws.

Key methods:

- `openScanner()` — snapshots the form, opens `<dialog>` via `showModal()`,
  starts camera
- `onScanSuccess(decodedText)` — parses QR data, rejects duplicates/invalid,
  advances to the next empty slot
- `closeScanner()` — stops camera, closes dialog, applies results
- `handleDialogClose()` — handler for the dialog's native `close` event
  (Escape); stops camera, applies results
- `stopCamera()` — safely stops the camera; returns a promise
- `applyScanResults()` — writes scanned codes into form inputs
- `getState()` — returns `{ currentScanIndex, scannedCodes }` for testing
- `getScannerInstance()` — used by app.js to decide whether to restart the
  camera after an image upload

Results are applied exactly once per session, however the dialog closes.

### app.js — UI wiring

Browser-only (no module.exports). Runs on `DOMContentLoaded`:

1. Sets up the friend code form (6 inputs, loads saved codes from
   localStorage, tolerating corrupt or missing storage)
2. Shows the analytics consent banner if the visitor has not chosen yet
3. Creates the scanner via `createScanner(...)` with all deps wired in
4. Wires up button handlers: scan, export, upload, refresh, clear (with undo)
5. Manages the file-scan flow: stop camera → scan image file → restart camera
6. Forwards the scanner dialog's `close` event to `handleDialogClose()`

`generateAllQRCodes()` keeps one card per valid input slot, labelled by slot
number. Existing cards are redrawn in place with `qr.makeCode()` so nothing
flickers; the current payload is exposed as `data-qr-data` on each card. A
one-second ticker drives the "Refreshing in Ns" countdown and regenerates at
zero; `visibilitychange` regenerates immediately when the tab becomes visible.
While any card is shown the page holds a screen wake lock (where supported).

### index.html — semantic HTML5

Uses native HTML5 elements:

- `<dialog id="scanner-dialog">` for the scanner modal (native
  `showModal()`/`close()`, `::backdrop`, Escape key)
- `<nav id="actions">` for the button bar
- `<section>` for QR display and empty state
- `<output>` for toast notifications (with `role="status"` and
  `aria-live="polite"`)
- `<main>` wrapping primary content
- `<header>` inside the dialog for the scanner title bar
- `<dialog id="qr-zoom">` for the enlarged QR view

External dependencies (CDN, loaded with `defer`):

- `qrcodejs` 1.0.0 — QR code generation
- `html5-qrcode` 2.3.8 — camera QR scanning and image file scanning

Both `<script>` tags pin an SRI `integrity` hash. When bumping either version,
regenerate the hash or the browser will refuse to load the script:

```bash
curl -fsSL <url> | openssl dgst -sha384 -binary | openssl base64 -A
```

### Analytics consent

An inline script in `<head>` sets Google Consent Mode defaults before Google
Tag Manager loads: analytics are denied unless `localStorage.analyticsConsent`
is `granted`, and ad storage is always denied. The banner's Allow and Decline
buttons store the choice and send `gtag('consent', 'update', …)`. Tags inside
the GTM container must respect consent mode for this to take effect.

## Development

Serve locally (camera API requires HTTPS, but localhost HTTP works):

```bash
python3 -m http.server
```

Run tests:

```bash
npm ci
npx playwright install chromium  # first time, or after a Playwright upgrade
npm test                         # unit tests only
npm run test:e2e                 # Playwright end-to-end tests only
npm run test:all                 # both
```

Regenerate test QR code fixtures:

```bash
npm run generate-fixtures
```

## Testing

There are two layers of tests: Node.js unit tests and Playwright end-to-end
tests. CI runs both on every pull request
([.github/workflows/test.yml](.github/workflows/test.yml)) and before every
deploy.

### Unit tests (`test.js`)

Run with `npm test`. Tests use Node.js `assert` with no test framework. Three
test suites:

1. **Timestamp tests** — encoding table integrity, deterministic timestamp
   output with mocked `Date.now()`, QR data format, parser for all 4 QR input
   formats, rejection cases, round-trip, `isValidFriendCode`,
   `extractFriendCodes`
2. **Scanner tests** — `onScanSuccess` logic via mocked deps: valid code
   advances, duplicates and saved codes rejected, silent repeat reads,
   first-empty-slot start and advance, completion, single application of
   results, vibration. Camera lifecycle tests use a stand-in that mirrors
   `Html5Qrcode` (synchronous `stop()` throw while starting).
3. **Fixture tests** — decodes each committed QR code PNG with `jsqr`, asserts
   the raw data matches, then runs it through `parseFriendCodeFromQR` to
   verify the expected friend code

### End-to-end tests (`e2e.test.js`)

Run with `npm run test:e2e`. Playwright drives headless Chromium against the
site served locally by `serve` on port 4173 (started automatically by
[playwright.config.js](playwright.config.js)). Set `BASE_URL` to run the suite
against an already-running or deployed site instead.

The suite covers page load, QR generation and in-place refresh (using
Playwright's fake clock for the countdown), localStorage persistence and
corruption, export/upload of `.txt` files, paste, clear with undo, toasts, the
enlarged view, wake lock, accessibility labels, dark mode, the consent banner,
and the scanner dialog. `beforeEach` pre-answers the consent banner so it does
not cover controls. Scanner tests that simulate camera errors replace the CDN
`html5-qrcode` script with a mock via the `mockHtml5Qrcode()` helper, which
also strips that script's SRI `integrity` attribute so the browser accepts the
mock.

### Dev dependencies

Test-only, not used in the browser:

- `@playwright/test` — end-to-end test runner
- `serve` — static file server for end-to-end tests
- `qrcode` — generates test fixture PNGs
- `jsqr` — decodes QR codes from pixel data
- `pngjs` — reads PNG files into pixel arrays for jsqr

## Deployment

Deployed to GitHub Pages by
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) on every push to
`main` (or manually via `workflow_dispatch`). It first runs the test workflow
as a reusable workflow and deploys only if it passes.

The deploy job runs `npm run build` (no dependency install needed), which
copies the site files (`index.html`, `styles.css`, `app.js`, `scanner.js`,
`timestamp.js`, `favicon.ico`) into `dist/`, and publishes `dist/` as the
Pages artifact. The deploy fails if the `build` script is missing or `dist/`
is not produced. When adding a new file the site needs at runtime, add it to
the `build` script in [package.json](package.json) or it will not be
deployed.
