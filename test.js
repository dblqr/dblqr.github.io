const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { DblTimestampHelper, parseFriendCodeFromQR, isValidFriendCode, extractFriendCodes } = require('./timestamp.js');
const { createScanner } = require('./scanner.js');

// --- DblTimestampHelper.timestampEncoding ---

assert.deepStrictEqual(
    DblTimestampHelper.timestampEncoding,
    ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'N', 'P', 'Q', 'R', 'S', 'T'],
    'Encoding table must be exactly 16 specific characters'
);

assert.strictEqual(DblTimestampHelper.timestampEncoding.length, 16, 'Encoding table must have 16 entries');

// --- DblTimestampHelper.createDblTimestamp ---

const originalDateNow = Date.now;

// hex of 0x190e0a1b2c3 = "190e0a1b2c3"
// 1→C 9→M 0→B e→S 0→B a→N 1→C b→P 2→D c→Q 3→E
Date.now = () => 0x190e0a1b2c3;
assert.strictEqual(
    DblTimestampHelper.createDblTimestamp(),
    'CMBSBNCPDQE',
    'Deterministic timestamp for Date.now() = 0x190e0a1b2c3'
);

Date.now = () => 0x0;
assert.strictEqual(
    DblTimestampHelper.createDblTimestamp(),
    'B',
    'Timestamp for Date.now() = 0 should be single B (hex 0 → encoding[0])'
);

// hex "fedcba987654" → f→T e→S d→R c→Q b→P a→N 9→M 8→K 7→J 6→H 5→G 4→F
Date.now = () => 0xfedcba987654;
assert.strictEqual(
    DblTimestampHelper.createDblTimestamp(),
    'TSRQPNMKJHGF',
    'Deterministic timestamp exercising high hex digits'
);

Date.now = originalDateNow;

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

// --- DblTimestampHelper.buildQrData ---

Date.now = () => 0x190e0a1b2c3;
assert.strictEqual(
    DblTimestampHelper.buildQrData('abcd1234'),
    '4,abcd1234CMBSBNCPDQE',
    'QR data must be 4,{friendcode}{timestamp}'
);
Date.now = originalDateNow;

const qrData = DblTimestampHelper.buildQrData('testcode');
assert.ok(qrData.startsWith('4,'), 'QR data must start with "4,"');
assert.strictEqual(qrData.substring(2, 10), 'testcode', 'Friend code must be at positions 2-9');
assert.ok(qrData.length > 10, 'QR data must have timestamp after friend code');

// --- parseFriendCodeFromQR ---

// Plain 8-char friend codes (what other players' QR codes contain)
assert.strictEqual(parseFriendCodeFromQR('abcd1234'), 'abcd1234', 'Parse plain 8-char code');
assert.strictEqual(parseFriendCodeFromQR('ABCD1234'), 'abcd1234', 'Parse plain code should lowercase');
assert.strictEqual(parseFriendCodeFromQR('  abcd1234  '), 'abcd1234', 'Parse plain code with whitespace');

// App-generated format: 4,{code}{timestamp}
assert.strictEqual(parseFriendCodeFromQR('4,abcd1234BCDEFGHJ'), 'abcd1234', 'Parse app-format QR data');
assert.strictEqual(parseFriendCodeFromQR('4,ABCD1234BCDEFGHJ'), 'abcd1234', 'Parse app-format should lowercase');
assert.strictEqual(parseFriendCodeFromQR('4,ab12cd34X'), 'ab12cd34', 'Parse app-format with minimal timestamp');

// In-game "Scan Code" screen format: 7,{code}
assert.strictEqual(parseFriendCodeFromQR('7,y6r32ak9'), 'y6r32ak9', 'Parse in-game scan code format');
assert.strictEqual(parseFriendCodeFromQR('7,Y6R32AK9'), 'y6r32ak9', 'Parse in-game scan code uppercase');

// In-game profile card deep link URL: token={code}
assert.strictEqual(
    parseFriendCodeFromQR('https://dblww.go.link?adj_t=srpood5&deep_link=lgndappw-UniversalLinks%3A%2F%2F&type=7&token=gggv28nh'),
    'gggv28nh',
    'Parse profile card deep link URL'
);
assert.strictEqual(
    parseFriendCodeFromQR('https://example.com?token=ab12cd34&other=val'),
    'ab12cd34',
    'Parse token param mid-URL'
);
assert.strictEqual(
    parseFriendCodeFromQR('https://example.com?token=ab12cd34'),
    'ab12cd34',
    'Parse token param at end of URL'
);

// Rejections
assert.strictEqual(parseFriendCodeFromQR(null), null, 'Reject null');
assert.strictEqual(parseFriendCodeFromQR(undefined), null, 'Reject undefined');
assert.strictEqual(parseFriendCodeFromQR(12345), null, 'Reject number');
assert.strictEqual(parseFriendCodeFromQR(''), null, 'Reject empty string');
assert.strictEqual(parseFriendCodeFromQR('hello'), null, 'Reject non-QR string');
assert.strictEqual(parseFriendCodeFromQR('abcd123'), null, 'Reject 7-char code');
assert.strictEqual(parseFriendCodeFromQR('abcd12345'), null, 'Reject 9-char code');
assert.strictEqual(parseFriendCodeFromQR('4,short'), null, 'Reject too-short app-format');
assert.strictEqual(parseFriendCodeFromQR('4,abcd123'), null, 'Reject 7-char app-format');
assert.strictEqual(parseFriendCodeFromQR('4,abcd!@#$BCDE'), null, 'Reject non-alphanumeric code');
assert.strictEqual(parseFriendCodeFromQR('https://example.com'), null, 'Reject URL without token');

// Round-trip
const roundTrip = DblTimestampHelper.buildQrData('zz99aa11');
assert.strictEqual(parseFriendCodeFromQR(roundTrip), 'zz99aa11', 'Round-trip: build then parse');

// --- isValidFriendCode ---

assert.strictEqual(isValidFriendCode('abcd1234'), true, 'Valid 8-char lowercase code');
assert.strictEqual(isValidFriendCode('abc'), false, 'Partial code is invalid');
assert.strictEqual(isValidFriendCode('abcd123!'), false, 'Special characters are invalid');
assert.strictEqual(isValidFriendCode('ABCD1234'), false, 'Uppercase is invalid (codes are normalized first)');
assert.strictEqual(isValidFriendCode(''), false, 'Empty is invalid');
assert.strictEqual(isValidFriendCode(null), false, 'Null is invalid');

// --- extractFriendCodes ---

assert.deepStrictEqual(extractFriendCodes('upload01\nupload02'), ['upload01', 'upload02'], 'Newline-separated codes');
assert.deepStrictEqual(extractFriendCodes('aaaaaaaa, bbbbbbbb,cccccccc'), ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'], 'Comma-separated codes');
assert.deepStrictEqual(extractFriendCodes('4,abcd1234CMBSBNCPDQE'), ['abcd1234'], 'App QR data keeps its comma');
assert.deepStrictEqual(extractFriendCodes('7,y6r32ak9'), ['y6r32ak9'], 'In-game scan code format');
assert.deepStrictEqual(
    extractFriendCodes('https://dblww.go.link?adj_t=srpood5&type=7&token=jk90mn12'),
    ['jk90mn12'],
    'Profile deep link'
);
assert.deepStrictEqual(extractFriendCodes('ABCD1234 abcd1234'), ['abcd1234'], 'Duplicates removed case-insensitively');
assert.deepStrictEqual(extractFriendCodes('short\nvalid123\ntoolongcode\nbad!!bad'), ['valid123'], 'Invalid tokens dropped');
assert.deepStrictEqual(extractFriendCodes(''), [], 'Empty text');
assert.deepStrictEqual(extractFriendCodes(null), [], 'Non-string input');

console.log('timestamp tests passed.');

// --- createScanner tests ---

function makeMockDeps(initialValues = ['', '', '', '', '', '']) {
    const calls = { showToast: [], getElement: {}, generateAllQRCodes: 0, dialogClose: 0, vibrate: [] };
    const inputs = initialValues.map(value => ({ value }));
    const elements = {};
    const createElement = () => ({
        textContent: '',
        hidden: false,
        classList: {
            classes: new Set(),
            add(...names) { names.flat().forEach(name => this.classes.add(name)); },
            remove(...names) { names.flat().forEach(name => this.classes.delete(name)); },
            contains(name) { return this.classes.has(name); },
        },
    });
    return {
        deps: {
            parseFriendCodeFromQR,
            showToast: (msg) => calls.showToast.push(msg),
            generateAllQRCodes: () => calls.generateAllQRCodes++,
            getDialog: () => ({ showModal() { }, close() { calls.dialogClose++; } }),
            getElement: (id) => {
                if (!elements[id]) elements[id] = createElement();
                return elements[id];
            },
            querySelectorAll: () => inputs,
            vibrate: (pattern) => calls.vibrate.push(pattern),
            Html5Qrcode: class { start() { return Promise.resolve(); } stop() { return Promise.resolve(); } clear() { } },
        },
        calls,
        elements,
        inputs,
    };
}

/**
 * Html5Qrcode stand-in that mirrors the real library's state rules:
 * stop() throws synchronously unless the camera is actually scanning, and
 * start() stays pending until the test calls resolveStart().
 */
function makeControllableCamera() {
    const instances = [];
    class ControllableCamera {
        constructor(target) {
            this.target = target;
            this.scanning = false;
            this.cleared = false;
            instances.push(this);
        }
        start(_camera, _config, onSuccess) {
            this.onSuccess = onSuccess;
            return new Promise((resolve, reject) => {
                this.resolveStart = () => { this.scanning = true; resolve(); };
                this.rejectStart = reject;
            });
        }
        stop() {
            if (!this.scanning) throw 'Cannot stop, scanner is not running or paused.';
            this.scanning = false;
            return Promise.resolve();
        }
        clear() { this.cleared = true; }
    }
    return { ControllableCamera, instances };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

// Valid code advances index
{
    const { deps, calls } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.onScanSuccess('ab12cd34');
    const state = scanner.getState();
    assert.strictEqual(state.currentScanIndex, 1, 'Index advances after valid scan');
    assert.strictEqual(state.scannedCodes[0], 'ab12cd34', 'Code stored at index 0');
}

// Duplicate code rejected (an immediate re-read of the same code is ignored
// silently, see below; a code scanned earlier in the session is reported)
{
    const { deps, elements } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.onScanSuccess('ab12cd34');
    scanner.onScanSuccess('ef56gh78');
    scanner.onScanSuccess('ab12cd34');
    const state = scanner.getState();
    assert.strictEqual(state.currentScanIndex, 2, 'Index does not advance for duplicate');
    assert.ok(
        elements['scanner-status'].textContent.includes('Already scanned'),
        'Status shows duplicate message'
    );
}

// Invalid format rejected
{
    const { deps, elements } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.onScanSuccess('not-valid');
    const state = scanner.getState();
    assert.strictEqual(state.currentScanIndex, 0, 'Index does not advance for invalid code');
    assert.ok(
        elements['scanner-status'].textContent.includes('Invalid'),
        'Status shows invalid message'
    );
}

// Camera startup failure should clean up the scanner instance and show denied state
{
    const { deps, elements } = makeMockDeps();
    const targetState = {};
    const mockHtml5Qrcode = class {
        constructor(target) {
            this.target = target;
        }
        start() {
            if (!targetState[this.target]) {
                targetState[this.target] = false;
            }
            const error = new Error();
            error.name = 'NotAllowedError';
            error.message = undefined;
            return Promise.reject(error);
        }
        stop() { return Promise.resolve(); }
        clear() { targetState[this.target] = true; }
    };
    deps.Html5Qrcode = mockHtml5Qrcode;
    const scanner = createScanner(deps);
    scanner.startCamera().catch(err => {
        assert.strictEqual(err.name, 'NotAllowedError', 'Camera start rejects with permission denied error');
        assert.strictEqual(scanner.getScannerInstance(), null, 'Scanner instance must be cleared after camera failure');
        assert.strictEqual(
            elements['scanner-status'].textContent,
            'Camera error: permissions denied',
            'Denied permission uses a friendly error message'
        );
        assert.strictEqual(elements['scanner-retry'].hidden, false, 'Retry button is visible after denial');
        assert.ok(
            elements['scanner-viewfinder'].classList.contains('scanner-disabled'),
            'Viewfinder should shrink when camera is unavailable'
        );
    });
}

// Camera retry clears the denied state when permissions are re-enabled
{
    const { deps, elements } = makeMockDeps();
    let attempts = 0;
    const targetState = {}; // Track cleanup state per target
    const mockHtml5Qrcode = class {
        constructor(target) {
            this.target = target;
        }
        start() {
            attempts += 1;
            // Simulate: can't start if a previous instance on this target wasn't cleared
            if (attempts > 1 && !targetState[this.target]) {
                return Promise.reject(new Error('Cannot reinitialize without clearing previous instance'));
            }
            targetState[this.target] = false; // Mark as "not cleared" after starting
            return attempts === 1
                ? Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }))
                : Promise.resolve();
        }
        stop() { return Promise.resolve(); }
        clear() { targetState[this.target] = true; } // Mark as "cleared"
    };
    deps.Html5Qrcode = mockHtml5Qrcode;
    const scanner = createScanner(deps);
    scanner.startCamera().catch(() => {
        assert.strictEqual(elements['scanner-status'].textContent, 'Camera error: permissions denied');
        assert.strictEqual(elements['scanner-retry'].hidden, false, 'Retry button is visible after denial');
        scanner.startCamera().then(() => {
            assert.strictEqual(elements['scanner-retry'].hidden, true, 'Retry button hides after success');
            assert.strictEqual(
                elements['scanner-status'].textContent,
                'Point your camera at a QR code',
                'Scanner status resets after permissions are granted'
            );
            assert.strictEqual(
                elements['scanner-viewfinder'].classList.contains('scanner-disabled'),
                false,
                'Viewfinder returns to normal after success'
            );
        });
    });
}

// Denied message should persist when moving between scan slots
{
    const { deps, elements } = makeMockDeps();
    const targetState = {};
    const mockHtml5Qrcode = class {
        constructor(target) {
            this.target = target;
        }
        start() {
            if (!targetState[this.target]) {
                targetState[this.target] = false; // Mark as "not cleared"
            }
            const error = new Error();
            error.name = 'NotAllowedError';
            error.message = undefined;
            return Promise.reject(error);
        }
        stop() { return Promise.resolve(); }
        clear() { targetState[this.target] = true; }
    };
    deps.Html5Qrcode = mockHtml5Qrcode;
    const scanner = createScanner(deps);
    scanner.startCamera().catch(() => {
        scanner.nextSlot();
        scanner.prevSlot();
        assert.strictEqual(
            elements['scanner-status'].textContent,
            'Camera error: permissions denied',
            'Permissions denied status persists across slot navigation'
        );
    });
}

// 6th scan triggers completion
{
    const { deps, calls } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.onScanSuccess('ab12cd34');
    scanner.onScanSuccess('ef56gh78');
    scanner.onScanSuccess('jk90mn12');
    scanner.onScanSuccess('aa11bb22');
    scanner.onScanSuccess('cc33dd44');
    scanner.onScanSuccess('ee55ff66');
    const state = scanner.getState();
    assert.strictEqual(state.currentScanIndex, 6, 'Index is 6 after all scans');
    assert.deepStrictEqual(state.scannedCodes, ['ab12cd34', 'ef56gh78', 'jk90mn12', 'aa11bb22', 'cc33dd44', 'ee55ff66'], 'All codes stored');
    assert.ok(calls.showToast.some(m => m.includes('All 6')), 'Toast shows completion message');
    assert.strictEqual(calls.generateAllQRCodes, 1, 'generateAllQRCodes called on completion');
}

// Supports all QR formats via parseFriendCodeFromQR
{
    const { deps } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.onScanSuccess('7,ef56gh78');
    scanner.onScanSuccess('https://example.com?token=jk90mn12');
    scanner.onScanSuccess('4,ab12cd34BCDEFGHJ');
    const state = scanner.getState();
    assert.deepStrictEqual(state.scannedCodes, ['ef56gh78', 'jk90mn12', 'ab12cd34', null, null, null], 'All QR formats parsed');
}

const asyncScannerTests = (async () => {
    // Closing via the X button while the camera is still starting must not throw,
    // and the camera must be stopped once it finishes starting.
    {
        const { deps, calls } = makeMockDeps();
        const { ControllableCamera, instances } = makeControllableCamera();
        deps.Html5Qrcode = ControllableCamera;
        const scanner = createScanner(deps);
        scanner.openScanner();
        assert.doesNotThrow(() => scanner.closeScanner(), 'closeScanner must not throw while camera is starting');
        assert.strictEqual(calls.dialogClose, 1, 'Dialog closes even while camera is starting');
        instances[0].resolveStart();
        await flush();
        assert.strictEqual(instances[0].scanning, false, 'Camera that finishes starting after close is stopped');
        assert.strictEqual(scanner.getScannerInstance(), null, 'No scanner instance left after late start');
    }

    // Escape (native dialog close) while the camera is starting: no throw, camera stopped later
    {
        const { deps } = makeMockDeps();
        const { ControllableCamera, instances } = makeControllableCamera();
        deps.Html5Qrcode = ControllableCamera;
        const scanner = createScanner(deps);
        scanner.openScanner();
        assert.doesNotThrow(() => scanner.handleDialogClose(), 'handleDialogClose must not throw while camera is starting');
        instances[0].resolveStart();
        await flush();
        assert.strictEqual(instances[0].scanning, false, 'Camera is stopped after Escape during startup');
    }

    // stopCamera() while starting resolves instead of throwing (used before image upload)
    {
        const { deps } = makeMockDeps();
        const { ControllableCamera, instances } = makeControllableCamera();
        deps.Html5Qrcode = ControllableCamera;
        const scanner = createScanner(deps);
        scanner.openScanner();
        let stopResult;
        assert.doesNotThrow(() => { stopResult = scanner.stopCamera(); }, 'stopCamera must not throw while starting');
        await stopResult;
        instances[0].resolveStart();
        await flush();
        assert.strictEqual(instances[0].scanning, false, 'Camera started late is stopped after stopCamera');
    }

    // stopCamera() on a running camera stops and clears it
    {
        const { deps } = makeMockDeps();
        const { ControllableCamera, instances } = makeControllableCamera();
        deps.Html5Qrcode = ControllableCamera;
        const scanner = createScanner(deps);
        scanner.openScanner();
        instances[0].resolveStart();
        await flush();
        await scanner.stopCamera();
        assert.strictEqual(instances[0].scanning, false, 'Running camera is stopped');
        assert.strictEqual(instances[0].cleared, true, 'Running camera is cleared');
        assert.strictEqual(scanner.getScannerInstance(), null, 'Instance released after stop');
    }

    console.log('async scanner tests passed.');
})();

// Re-reading the code just scanned (still in view) is ignored silently
{
    const { deps, elements } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.onScanSuccess('ab12cd34');
    const successMessage = elements['scanner-status'].textContent;
    scanner.onScanSuccess('ab12cd34');
    scanner.onScanSuccess('4,ab12cd34BCDE');
    assert.strictEqual(elements['scanner-status'].textContent, successMessage, 'Success message survives repeat reads');
    assert.strictEqual(scanner.getState().currentScanIndex, 1, 'Repeat reads do not advance');
}

// An earlier (not most recent) code scanned again is still reported as a duplicate
{
    const { deps, elements } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.onScanSuccess('ab12cd34');
    scanner.onScanSuccess('ef56gh78');
    scanner.onScanSuccess('ab12cd34');
    assert.ok(elements['scanner-status'].textContent.includes('Already scanned'), 'Older duplicate is reported');
}

// Wrapping to slot 6 with prev and scanning once must not finish the session
{
    const { deps, calls } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.openScanner();
    scanner.prevSlot();
    assert.strictEqual(scanner.getState().currentScanIndex, 5, 'Prev from slot 1 wraps to slot 6');
    scanner.onScanSuccess('ab12cd34');
    assert.strictEqual(calls.dialogClose, 0, 'Scanner stays open while empty slots remain');
    assert.strictEqual(scanner.getState().scannedCodes[5], 'ab12cd34', 'Code stored in slot 6');
    assert.strictEqual(scanner.getState().currentScanIndex, 0, 'Moves to the first empty slot');
    assert.ok(!calls.showToast.some(m => m.includes('All 6')), 'No false completion toast');
}

// Opening the scanner with saved codes starts at the first empty slot
{
    const { deps, elements } = makeMockDeps(['aaaaaaaa', 'bbbbbbbb', '', 'cccccccc', '', '']);
    const scanner = createScanner(deps);
    scanner.openScanner();
    assert.strictEqual(scanner.getState().currentScanIndex, 2, 'Starts at first empty slot');
    assert.strictEqual(elements['scanner-title'].textContent, 'Scan Friend Code 3 of 6', 'Title shows first empty slot');
    scanner.onScanSuccess('dddddddd');
    assert.strictEqual(scanner.getState().currentScanIndex, 4, 'Skips filled slot 4 and moves to slot 5');
}

// A code already saved in the form is rejected
{
    const { deps, elements } = makeMockDeps(['aaaaaaaa', '', '', '', '', '']);
    const scanner = createScanner(deps);
    scanner.openScanner();
    scanner.onScanSuccess('7,aaaaaaaa');
    assert.ok(elements['scanner-status'].textContent.includes('already in your list'), 'Saved code rejected');
    assert.strictEqual(scanner.getState().currentScanIndex, 1, 'Index unchanged after rejecting saved code');
}

// Filling the remaining empty slots completes the session without touching saved codes
{
    const { deps, calls, inputs } = makeMockDeps(['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd', '', '']);
    const scanner = createScanner(deps);
    scanner.openScanner();
    scanner.onScanSuccess('eeeeeeee');
    scanner.onScanSuccess('ffffffff');
    assert.strictEqual(calls.dialogClose, 1, 'Session completes when no empty slots remain');
    assert.deepStrictEqual(
        inputs.map(i => i.value),
        ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd', 'eeeeeeee', 'ffffffff'],
        'Saved codes kept, scanned codes added'
    );
    assert.ok(calls.showToast.some(m => m.includes('2 code(s) imported')), 'Completion toast counts scanned codes');
}

// Navigating to a filled slot shows it will be replaced, and scanning replaces it
{
    const { deps, elements, inputs } = makeMockDeps(['aaaaaaaa', '', '', '', '', '']);
    const scanner = createScanner(deps);
    scanner.openScanner();
    scanner.prevSlot();
    assert.ok(elements['scanner-title'].textContent.includes('replaces aaaaaaaa'), 'Title warns about replacement');
    scanner.onScanSuccess('zzzzzzzz');
    scanner.closeScanner();
    assert.strictEqual(inputs[0].value, 'zzzzzzzz', 'Explicitly chosen slot is replaced');
}

// Results are applied exactly once when completion is followed by the dialog close event
{
    const { deps, calls } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.openScanner();
    ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd', 'eeeeeeee', 'ffffffff'].forEach(c => scanner.onScanSuccess(c));
    scanner.handleDialogClose();
    assert.strictEqual(calls.generateAllQRCodes, 1, 'Results applied once');
    assert.strictEqual(calls.showToast.length, 1, 'Only the completion toast is shown');
    assert.ok(calls.showToast[0].includes('All 6'), 'Completion toast kept');
}

// Partial session: closing applies results once and toasts the count
{
    const { deps, calls } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.openScanner();
    scanner.onScanSuccess('aaaaaaaa');
    scanner.closeScanner();
    scanner.handleDialogClose();
    assert.strictEqual(calls.generateAllQRCodes, 1, 'Partial results applied once');
    assert.deepStrictEqual(calls.showToast, ['1 code(s) imported'], 'Partial import toast shown once');
}

// Successful scans vibrate; rejected ones do not
{
    const { deps, calls } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.onScanSuccess('ab12cd34');
    scanner.onScanSuccess('not-valid');
    assert.strictEqual(calls.vibrate.length, 1, 'Vibrates once for the one successful scan');
}

console.log('scanner tests passed.');

// --- QR fixture image verification ---

const jsQR = require('jsqr');
const { PNG } = require('pngjs');

const fixtures = [
    { file: 'plain-code.png', expectedData: 'ab12cd34', expectedCode: 'ab12cd34' },
    { file: 'ingame-scan.png', expectedData: '4,zz99aa11CMBSBNCPDQE', expectedCode: 'zz99aa11' },
    { file: 'deeplink-url.png', expectedData: 'https://dblww.go.link?adj_t=srpood5&type=7&token=jk90mn12', expectedCode: 'jk90mn12' },
];

for (const { file, expectedData, expectedCode } of fixtures) {
    const pngData = fs.readFileSync(path.join(__dirname, 'test-fixtures', file));
    const png = PNG.sync.read(pngData);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.ok(decoded, `${file}: QR code must be decodable`);
    assert.strictEqual(decoded.data, expectedData, `${file}: decoded data must match`);
    assert.strictEqual(parseFriendCodeFromQR(decoded.data), expectedCode, `${file}: parsed friend code must match`);
}

console.log('fixture tests passed.');

asyncScannerTests.then(() => console.log('All tests passed.'));
