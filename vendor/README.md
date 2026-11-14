# Vendored libraries

Third-party libraries served from this site instead of a CDN, so the site has
no third-party script dependency (availability, privacy, supply chain) and the
Content Security Policy can stay `script-src 'self'` plus Google Tag Manager.

| File | Library | Version | Source | License |
| ---- | ------- | ------- | ------ | ------- |
| `qrcode.min.js` | [qrcodejs](https://github.com/davidshimjs/qrcodejs) | 1.0.0 | `https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js` | MIT ([LICENSE-qrcodejs](LICENSE-qrcodejs)) |
| `html5-qrcode.min.js` | [html5-qrcode](https://github.com/mebjas/html5-qrcode) | 2.3.8 | `https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js` | Apache-2.0 ([LICENSE-html5-qrcode](LICENSE-html5-qrcode)) |

The files are byte-identical to those CDN URLs. `test.js` checks their
SHA-384 hashes, so an accidental edit fails the tests.

To upgrade: download the new version, update the expected hash in `test.js`,
and update this table. `html5-qrcode` is loaded on demand when the scanner
opens (see `loadScannerLibrary()` in `app.js`).
