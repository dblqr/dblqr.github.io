<<<<<<< HEAD
# shenron-qr
=======
# Friend Code QR Generator

QR code generator for friend codes. Generates time-stamped QR codes that can be scanned in-game.

## Features

- Enter up to 3 friend codes, generates QR codes with rotating timestamps
- Scan friend code QR codes using your device camera
- Upload QR code screenshots when camera can't focus
- Friend codes saved in browser localStorage
- Auto-refreshes every 10 seconds
- Export/upload friend codes as .txt files
- Download individual QR codes as PNG

## Architecture

```
index.html          Semantic HTML5 shell — no inline CSS or JS
styles.css          All styles, extracted verbatim from original inline <style>
timestamp.js        QR data encoding + friend code parser (shared: browser + Node tests)
scanner.js          Camera/QR scanner module with dependency injection for testability
app.js              UI/DOM glue — wires up buttons, form, scanner, auto-refresh
test.js             Zero-framework Node.js tests (assert only + devDependencies for QR decode)
generate-fixtures.js  One-time script to regenerate test QR code PNGs
test-fixtures/      Committed QR code PNGs used by test.js
```

### timestamp.js — QR encoding (critical, never change output)

This file contains the core QR data logic. Its output format is consumed by the game client, so **the encoding must never change** — tests enforce this with deterministic assertions.

**`DblTimestampHelper.buildQrData(friendCode)`** produces the string encoded into each QR code:

```
4,{8-char-friend-code}{timestamp}
```

The timestamp is `Date.now()` converted to hex, with each hex digit mapped through a 16-char encoding table:

```
Hex:  0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f
Char: B  C  D  E  F  G  H  J  K  M  N  P  Q  R  S  T
```

Example: `Date.now()` = `0x190e0a1b2c3` → timestamp `CMBSBNCPDQE` → QR data `4,abcd1234CMBSBNCPDQE`

**`parseFriendCodeFromQR(qrData)`** is a universal parser that extracts the 8-char friend code from any of the 3 known QR formats:

| Format | Example | Source |
|--------|---------|--------|
| Plain 8-char code | `ab12cd34` | Other players' QR codes |
| `4,{code}{timestamp}` | `4,ab12cd34CMBSBNCPDQE` | This app's generated QR codes |
| `7,{code}` | `7,ab12cd34` | In-game "Scan Code" screen |
| URL with `token=` param | `https://...?token=ab12cd34` | In-game profile card deep link |

Both exports use a `module.exports` guard so the file works as a browser global AND a Node.js module.

### scanner.js — testable scanner module

Exports `createScanner(deps)` — a factory that returns scanner methods without touching the DOM directly. All DOM access goes through injected dependencies:

```js
const scanner = createScanner({
    parseFriendCodeFromQR,  // from timestamp.js
    showToast,              // from app.js
    generateAllQRCodes,     // from app.js
    getDialog,              // returns the <dialog> element
    getElement,             // getElementById wrapper
    querySelectorAll,       // querySelectorAll wrapper
    Html5Qrcode             // QR scanning library from CDN
});
```

This makes `onScanSuccess` (the core scan logic: parse, validate, dedupe, advance) testable in Node.js by mocking the DOM callbacks.

Key methods:
- `openScanner()` — resets state, opens `<dialog>` via `showModal()`, starts camera
- `onScanSuccess(decodedText)` — parses QR data, rejects duplicates/invalid, advances scan index
- `closeScanner()` — stops camera, closes dialog via `close()`
- `applyScanResults()` — writes scanned codes into form inputs
- `getState()` — returns `{ currentScanIndex, scannedCodes }` for testing
- `getScannerInstance()` / `setScannerInstance()` — used by app.js to coordinate file scanning

### app.js — UI wiring

Browser-only (no module.exports). Runs on `DOMContentLoaded`:

1. Sets up the friend code form (3 inputs, loads saved codes from localStorage)
2. Creates the scanner via `createScanner(...)` with all deps wired in
3. Wires up button handlers: scan, export, upload, refresh, clear
4. Manages the file-scan flow: stop camera → scan image file → restart camera
5. Handles dialog `close` event (Escape key or X button) — stops camera and applies partial scan results

### index.html — semantic HTML5

Uses native HTML5 elements:
- `<dialog id="scanner-dialog">` for the scanner modal (native `showModal()`/`close()`, `::backdrop`, Escape key)
- `<nav id="actions">` for the button bar
- `<section>` for QR display and empty state
- `<output>` for toast notifications (with `role="status"` and `aria-live="polite"`)
- `<main>` wrapping primary content
- `<header>` inside the dialog for the scanner title bar

External dependencies (CDN, loaded with `defer`):
- `qrcodejs` 1.0.0 — QR code generation
- `html5-qrcode` 2.3.8 — camera QR scanning and image file scanning

## Development

Serve locally (camera API requires HTTPS, but localhost HTTP works):

```
python3 -m http.server
```

Run tests:

```
npm install
node test.js
```

Regenerate test QR code fixtures:

```
node generate-fixtures.js
```

## Testing

Tests use Node.js `assert` with no test framework. Three test suites:

1. **Timestamp tests** — encoding table integrity, deterministic timestamp output with mocked `Date.now()`, QR data format, parser for all 4 QR input formats, rejection cases, round-trip
2. **Scanner tests** — `onScanSuccess` logic via mocked deps: valid code advances index, duplicate rejected, invalid format rejected, 3rd scan triggers completion, all QR formats work through the scanner
3. **Fixture tests** — decodes each committed QR code PNG with `jsqr`, asserts the raw data matches, then runs it through `parseFriendCodeFromQR` to verify the expected friend code

Dev dependencies (test-only, not used in browser):
- `qrcode` — generates test fixture PNGs
- `jsqr` — decodes QR codes from pixel data
- `pngjs` — reads PNG files into pixel arrays for jsqr

## Deployment

Static site — deploy to GitHub Pages directly from the repo root. No build step required.
>>>>>>> 069c239 (feat: initial push)
