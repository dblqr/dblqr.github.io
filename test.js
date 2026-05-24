const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { DblTimestampHelper, parseFriendCodeFromQR } = require('./timestamp.js');
const { createScanner } = require('./scanner.js');

describe('DblTimestampHelper', () => {
    describe('timestampEncoding', () => {
        it('has exactly 16 specific characters', () => {
            assert.deepStrictEqual(
                DblTimestampHelper.timestampEncoding,
                ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'N', 'P', 'Q', 'R', 'S', 'T'],
                'Encoding table must be exactly 16 specific characters'
            );
            assert.strictEqual(DblTimestampHelper.timestampEncoding.length, 16, 'Encoding table must have 16 entries');
        });
    });

    describe('createDblTimestamp', () => {
        const originalDateNow = Date.now;
        
        it('creates deterministic timestamp for Date.now() = 0x190e0a1b2c3', () => {
            Date.now = () => 0x190e0a1b2c3;
            assert.strictEqual(DblTimestampHelper.createDblTimestamp(), 'CMBSBNCPDQE');
            Date.now = originalDateNow;
        });

        it('handles Date.now() = 0', () => {
            Date.now = () => 0x0;
            assert.strictEqual(DblTimestampHelper.createDblTimestamp(), 'B');
            Date.now = originalDateNow;
        });

        it('exercises high hex digits', () => {
            Date.now = () => 0xfedcba987654;
            assert.strictEqual(DblTimestampHelper.createDblTimestamp(), 'TSRQPNMKJHGF');
            Date.now = originalDateNow;
        });

        it('creates valid timestamp matching hex length', () => {
            const timestamp = DblTimestampHelper.createDblTimestamp();
            assert.ok(timestamp.length > 0, 'Timestamp must not be empty');
            for (const char of timestamp) {
                assert.ok(
                    DblTimestampHelper.timestampEncoding.includes(char),
                    `Character '${char}' must be in the encoding table`
                );
            }
            const hexLen = Date.now().toString(16).length;
            assert.strictEqual(timestamp.length, hexLen, 'Timestamp length must match hex digit count of Date.now()');
        });
    });

    describe('buildQrData', () => {
        const originalDateNow = Date.now;
        
        it('builds specific QR data format', () => {
            Date.now = () => 0x190e0a1b2c3;
            assert.strictEqual(DblTimestampHelper.buildQrData('abcd1234'), '4,abcd1234CMBSBNCPDQE');
            Date.now = originalDateNow;
        });

        it('maintains expected structure', () => {
            const qrData = DblTimestampHelper.buildQrData('testcode');
            assert.ok(qrData.startsWith('4,'), 'QR data must start with "4,"');
            assert.strictEqual(qrData.substring(2, 10), 'testcode', 'Friend code must be at positions 2-9');
            assert.ok(qrData.length > 10, 'QR data must have timestamp after friend code');
        });
    });
});

describe('parseFriendCodeFromQR', () => {
    it('parses plain 8-char codes', () => {
        assert.strictEqual(parseFriendCodeFromQR('abcd1234'), 'abcd1234');
        assert.strictEqual(parseFriendCodeFromQR('ABCD1234'), 'abcd1234');
        assert.strictEqual(parseFriendCodeFromQR('  abcd1234  '), 'abcd1234');
    });

    it('parses app-generated format', () => {
        assert.strictEqual(parseFriendCodeFromQR('4,abcd1234BCDEFGHJ'), 'abcd1234');
        assert.strictEqual(parseFriendCodeFromQR('4,ABCD1234BCDEFGHJ'), 'abcd1234');
        assert.strictEqual(parseFriendCodeFromQR('4,ab12cd34X'), 'ab12cd34');
    });

    it('parses in-game Scan Code screen format', () => {
        assert.strictEqual(parseFriendCodeFromQR('7,y6r32ak9'), 'y6r32ak9');
        assert.strictEqual(parseFriendCodeFromQR('7,Y6R32AK9'), 'y6r32ak9');
    });

    it('parses in-game profile card deep link URL', () => {
        assert.strictEqual(parseFriendCodeFromQR('https://dblww.go.link?adj_t=srpood5&deep_link=lgndappw-UniversalLinks%3A%2F%2F&type=7&token=gggv28nh'), 'gggv28nh');
        assert.strictEqual(parseFriendCodeFromQR('https://example.com?token=ab12cd34&other=val'), 'ab12cd34');
        assert.strictEqual(parseFriendCodeFromQR('https://example.com?token=ab12cd34'), 'ab12cd34');
    });

    it('rejects invalid inputs', () => {
        assert.strictEqual(parseFriendCodeFromQR(null), null);
        assert.strictEqual(parseFriendCodeFromQR(undefined), null);
        assert.strictEqual(parseFriendCodeFromQR(12345), null);
        assert.strictEqual(parseFriendCodeFromQR(''), null);
        assert.strictEqual(parseFriendCodeFromQR('hello'), null);
        assert.strictEqual(parseFriendCodeFromQR('abcd123'), null);
        assert.strictEqual(parseFriendCodeFromQR('abcd12345'), null);
        assert.strictEqual(parseFriendCodeFromQR('4,short'), null);
        assert.strictEqual(parseFriendCodeFromQR('4,abcd123'), null);
        assert.strictEqual(parseFriendCodeFromQR('4,abcd!@#$BCDE'), null);
        assert.strictEqual(parseFriendCodeFromQR('https://example.com'), null);
    });

    it('round-trips build then parse', () => {
        const roundTrip = DblTimestampHelper.buildQrData('zz99aa11');
        assert.strictEqual(parseFriendCodeFromQR(roundTrip), 'zz99aa11');
    });
});

describe('Scanner', () => {
    function makeMockDeps() {
        const calls = { showToast: [], getElement: {}, generateAllQRCodes: 0 };
        const elements = {};
        return {
            deps: {
                parseFriendCodeFromQR,
                showToast: (msg) => calls.showToast.push(msg),
                generateAllQRCodes: () => calls.generateAllQRCodes++,
                getDialog: () => ({ showModal() { }, close() { } }),
                getElement: (id) => {
                    if (!elements[id]) elements[id] = { textContent: '', style: {} };
                    return elements[id];
                },
                querySelectorAll: () => [
                    { value: '' },
                    { value: '' },
                    { value: '' },
                    { value: '' },
                    { value: '' },
                    { value: '' },
                ],
                Html5Qrcode: class { start() { return Promise.resolve(); } stop() { return Promise.resolve(); } clear() { } },
            },
            calls,
            elements,
        };
    }

    it('advances index on valid code', () => {
        const { deps } = makeMockDeps();
        const scanner = createScanner(deps);
        scanner.onScanSuccess('ab12cd34');
        const state = scanner.getState();
        assert.strictEqual(state.currentScanIndex, 1);
        assert.strictEqual(state.scannedCodes[0], 'ab12cd34');
    });

    it('rejects duplicate code', () => {
        const { deps, elements } = makeMockDeps();
        const scanner = createScanner(deps);
        scanner.onScanSuccess('ab12cd34');
        scanner.onScanSuccess('ab12cd34');
        const state = scanner.getState();
        assert.strictEqual(state.currentScanIndex, 1);
        assert.ok(elements['scanner-status'].textContent.includes('Already scanned'));
    });

    it('rejects invalid format', () => {
        const { deps, elements } = makeMockDeps();
        const scanner = createScanner(deps);
        scanner.onScanSuccess('not-valid');
        const state = scanner.getState();
        assert.strictEqual(state.currentScanIndex, 0);
        assert.ok(elements['scanner-status'].textContent.includes('Invalid'));
    });

    it('triggers completion after 6th scan', () => {
        const { deps, calls } = makeMockDeps();
        const scanner = createScanner(deps);
        ['ab12cd34', 'ef56gh78', 'jk90mn12', 'aa11bb22', 'cc33dd44', 'ee55ff66'].forEach(c => scanner.onScanSuccess(c));
        const state = scanner.getState();
        assert.strictEqual(state.currentScanIndex, 6);
        assert.ok(calls.showToast.some(m => m.includes('All 6')));
        assert.strictEqual(calls.generateAllQRCodes, 1);
    });

    it('supports all QR formats', () => {
        const { deps } = makeMockDeps();
        const scanner = createScanner(deps);
        scanner.onScanSuccess('7,ef56gh78');
        scanner.onScanSuccess('https://example.com?token=jk90mn12');
        scanner.onScanSuccess('4,ab12cd34BCDEFGHJ');
        const state = scanner.getState();
        assert.deepStrictEqual(state.scannedCodes, ['ef56gh78', 'jk90mn12', 'ab12cd34', null, null, null]);
    });
});

describe('QR fixture image verification', () => {
    const jsQR = require('jsqr');
    const { PNG } = require('pngjs');

    const fixtures = [
        { file: 'plain-code.png', expectedData: 'ab12cd34', expectedCode: 'ab12cd34' },
        { file: 'ingame-scan.png', expectedData: '4,zz99aa11CMBSBNCPDQE', expectedCode: 'zz99aa11' },
        { file: 'deeplink-url.png', expectedData: 'https://dblww.go.link?adj_t=srpood5&type=7&token=jk90mn12', expectedCode: 'jk90mn12' },
    ];

    for (const { file, expectedData, expectedCode } of fixtures) {
        it(`decodes and parses ${file}`, () => {
            const pngData = fs.readFileSync(path.join(__dirname, 'test-fixtures', file));
            const png = PNG.sync.read(pngData);
            const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
            assert.ok(decoded);
            assert.strictEqual(decoded.data, expectedData);
            assert.strictEqual(parseFriendCodeFromQR(decoded.data), expectedCode);
        });
    }
});

describe('Camera Permission State', () => {
    const originalDebug = console.debug;
    
    function makeMockDeps() {
        return {
            deps: {
                parseFriendCodeFromQR,
                showToast: () => {},
                generateAllQRCodes: () => {},
                getDialog: () => ({ showModal() { }, close() { } }),
                getElement: (id) => ({ textContent: '', style: {} }),
                querySelectorAll: () => [],
                Html5Qrcode: class { start() { return Promise.resolve(); } stop() { return Promise.resolve(); } clear() { } },
            }
        };
    }

    it('gets and sets permission state correctly', () => {
        globalThis.sessionStorage = { data: {}, getItem(k) { return this.data[k]; }, setItem(k, v) { this.data[k] = v; }, removeItem(k) { delete this.data[k]; } };
        console.debug = () => {};

        const { deps } = makeMockDeps();
        const scanner = createScanner(deps);

        assert.strictEqual(scanner.getCameraPermissionState(), false);

        scanner.setCameraPermissionState(true);
        assert.strictEqual(scanner.getCameraPermissionState(), true);

        const scanner2 = createScanner(deps);
        assert.strictEqual(scanner2.getCameraPermissionState(), true);

        scanner2.setCameraPermissionState(false);
        assert.strictEqual(scanner2.getCameraPermissionState(), false);
        
        console.debug = originalDebug;
    });

    it('respects permission state on openScanner', () => {
        globalThis.sessionStorage = { data: {}, getItem(k) { return this.data[k]; }, setItem(k, v) { this.data[k] = v; }, removeItem(k) { delete this.data[k]; } };
        console.debug = () => {};

        const { deps } = makeMockDeps();
        const scanner = createScanner(deps);

        scanner.setCameraPermissionState(true);

        let cameraStarted = false;
        deps.Html5Qrcode = class {
            start() { cameraStarted = true; return Promise.resolve(); }
            stop() { return Promise.resolve(); }
            clear() { }
        };

        scanner.openScanner();
        assert.strictEqual(cameraStarted, false);
        
        console.debug = originalDebug;
    });

    it('clears permission state on retryCamera', () => {
        globalThis.sessionStorage = { data: {}, getItem(k) { return this.data[k]; }, setItem(k, v) { this.data[k] = v; }, removeItem(k) { delete this.data[k]; } };
        console.debug = () => {};

        const { deps } = makeMockDeps();
        const scanner = createScanner(deps);

        scanner.setCameraPermissionState(true);
        assert.strictEqual(scanner.getCameraPermissionState(), true);

        scanner.retryCamera();
        assert.strictEqual(scanner.getCameraPermissionState(), false);
        
        console.debug = originalDebug;
    });
});
