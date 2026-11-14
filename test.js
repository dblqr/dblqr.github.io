const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { DblTimestampHelper, parseFriendCodeFromQR, isValidFriendCode, extractFriendCodes } = require('./timestamp.js');
const { createScanner } = require('./scanner.js');
const { PNG: PNGReader } = require('pngjs');
const { STRINGS, LANGUAGES, translate, detectLanguage, languageForPath } = require('./i18n.js');
const {
    DAILY_GOAL, gameDayKey, nextGameReset, normalizeScanLog, markScanned, unmarkScanned, isScanned,
    nextUnscannedSlot, nextDailySlot,
} = require('./daily.js');

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

let asyncKillSwitchTest = Promise.resolve();
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

// --- daily.js: once-per-day scan tracking ---

assert.strictEqual(DAILY_GOAL, 3, 'Events need 3 scans per day');

// gameDayKey: the game day rolls over at 1:00 AM Pacific time (DST-aware),
// regardless of the player's own time zone.
assert.strictEqual(gameDayKey(new Date('2026-11-14T08:59:59Z')), '2026-11-13', '00:59:59 PST is still the previous game day');
assert.strictEqual(gameDayKey(new Date('2026-11-14T09:00:00Z')), '2026-11-14', '01:00 PST starts the new game day');
assert.strictEqual(gameDayKey(new Date('2026-11-14T08:00:00Z')), '2026-11-13', 'Midnight PST does not roll over');
assert.strictEqual(gameDayKey(new Date('2026-07-01T07:59:59Z')), '2026-06-30', '00:59:59 PDT is still the previous game day');
assert.strictEqual(gameDayKey(new Date('2026-07-01T08:00:00Z')), '2026-07-01', '01:00 PDT starts the new game day');

// nextGameReset: the next 1:00 AM Pacific instant after `date`
assert.strictEqual(nextGameReset(new Date('2026-11-14T08:59:50Z')).toISOString(), '2026-11-14T09:00:00.000Z', 'Reset in 10 seconds (PST)');
assert.strictEqual(nextGameReset(new Date('2026-11-14T09:00:00Z')).toISOString(), '2026-11-15T09:00:00.000Z', 'At reset, next is tomorrow');
assert.strictEqual(nextGameReset(new Date('2026-07-01T12:00:00Z')).toISOString(), '2026-07-02T08:00:00.000Z', 'Summer reset is 08:00 UTC (PDT)');
assert.strictEqual(nextGameReset(new Date('2026-03-08T00:00:00Z')).toISOString(), '2026-03-08T09:00:00.000Z', 'DST start day: reset still at 1:00 PST');
assert.strictEqual(nextGameReset(new Date('2026-03-08T09:00:00Z')).toISOString(), '2026-03-09T08:00:00.000Z', 'Day after DST starts: 1:00 PDT');

// normalizeScanLog keeps today's log and resets anything else
{
    const today = '2026-11-14';
    assert.deepStrictEqual(
        normalizeScanLog({ date: today, codes: ['aaaaaaaa'] }, today),
        { date: today, codes: ['aaaaaaaa'] },
        "Today's log is kept"
    );
    assert.deepStrictEqual(
        normalizeScanLog({ date: '2026-11-13', codes: ['aaaaaaaa'] }, today),
        { date: today, codes: [] },
        "Yesterday's log resets at midnight"
    );
    assert.deepStrictEqual(normalizeScanLog(null, today), { date: today, codes: [] }, 'Missing log');
    assert.deepStrictEqual(normalizeScanLog('garbage', today), { date: today, codes: [] }, 'Corrupt log');
    assert.deepStrictEqual(
        normalizeScanLog({ date: today, codes: ['aaaaaaaa', 42, 'bad!', 'aaaaaaaa'] }, today),
        { date: today, codes: ['aaaaaaaa'] },
        'Invalid and duplicate entries dropped'
    );
}

// markScanned / unmarkScanned / isScanned are immutable and idempotent
{
    const empty = { date: '2026-11-14', codes: [] };
    const once = markScanned(empty, 'aaaaaaaa');
    assert.deepStrictEqual(empty.codes, [], 'markScanned does not mutate its input');
    assert.deepStrictEqual(markScanned(once, 'aaaaaaaa').codes, ['aaaaaaaa'], 'Marking twice is a no-op');
    assert.strictEqual(isScanned(once, 'aaaaaaaa'), true, 'Marked code is scanned');
    assert.strictEqual(isScanned(once, 'bbbbbbbb'), false, 'Other code is not scanned');
    assert.deepStrictEqual(unmarkScanned(once, 'aaaaaaaa').codes, [], 'Unmark removes the code');
    assert.deepStrictEqual(once.codes, ['aaaaaaaa'], 'unmarkScanned does not mutate its input');
}

// nextUnscannedSlot finds the next valid, unscanned slot, wrapping around
{
    const codes = ['aaaaaaaa', '', 'bbbbbbbb', 'abc', 'cccccccc', ''];
    const log = { date: '2026-11-14', codes: ['bbbbbbbb'] };
    assert.strictEqual(nextUnscannedSlot(codes, log, 0), 0, 'Starts at the given slot');
    assert.strictEqual(nextUnscannedSlot(codes, log, 1), 4, 'Skips empty, scanned, and partial slots');
    assert.strictEqual(nextUnscannedSlot(codes, log, 5), 0, 'Wraps around');
    assert.strictEqual(
        nextUnscannedSlot(codes, { date: '2026-11-14', codes: ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'] }, 0),
        -1,
        'Returns -1 when every code is scanned'
    );
    assert.strictEqual(nextUnscannedSlot(['', '', '', '', '', ''], log, 0), -1, 'Returns -1 with no codes');
}

// nextDailySlot: the daily view always loops. Unscanned codes come first;
// once everything is scanned it cycles through all valid codes. `exclude`
// (the code on screen) is never returned, so Next/Skip always move on.
{
    const codes = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', '', 'abc', ''];
    const log = (...scanned) => ({ date: '2026-11-14', codes: scanned });
    assert.strictEqual(nextDailySlot(codes, log('aaaaaaaa'), 0), 1, 'Prefers the next unscanned code');
    assert.strictEqual(nextDailySlot(codes, log('aaaaaaaa', 'bbbbbbbb', 'cccccccc'), 1), 1, 'All scanned: loops through every code');
    assert.strictEqual(nextDailySlot(codes, log('aaaaaaaa', 'bbbbbbbb', 'cccccccc'), 3), 0, 'All scanned: wraps past empty and partial slots');
    assert.strictEqual(nextDailySlot(codes, log(), 1, 0), 1, 'Moves on from the excluded slot');
    assert.strictEqual(nextDailySlot(codes, log('bbbbbbbb', 'cccccccc'), 1, 0), 1, 'Only unscanned code on screen: loops to a scanned one');
    assert.strictEqual(nextDailySlot(['aaaaaaaa', '', '', '', '', ''], log(), 1, 0), -1, 'A single code has nowhere else to go');
    assert.strictEqual(nextDailySlot(['', '', '', '', '', ''], log(), 0), -1, 'No codes');
}

console.log('daily tests passed.');

// --- i18n.js ---

assert.deepStrictEqual(LANGUAGES.map(l => l.code), ['en', 'ja', 'es', 'pt-BR'], 'Supported languages');
assert.deepStrictEqual(languageForPath('/ja/'), 'ja', 'Path to language');
assert.deepStrictEqual(languageForPath('/pt-br/'), 'pt-BR', 'Path to language (pt-BR)');
assert.deepStrictEqual(languageForPath('/'), 'en', 'Root is English');
assert.deepStrictEqual(languageForPath('/unknown/'), 'en', 'Unknown path is English');

// Every language defines exactly the English keys, with the same placeholders
{
    const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort().join(',');
    const englishKeys = Object.keys(STRINGS.en).sort();
    for (const { code } of LANGUAGES) {
        assert.deepStrictEqual(Object.keys(STRINGS[code]).sort(), englishKeys, `${code} has every English key and no extras`);
        for (const key of englishKeys) {
            assert.ok(STRINGS[code][key].trim().length > 0, `${code}.${key} is not empty`);
            assert.strictEqual(
                placeholders(STRINGS[code][key]),
                placeholders(STRINGS.en[key]),
                `${code}.${key} uses the same placeholders as English`
            );
        }
    }
}

// translate interpolates parameters and falls back sensibly
assert.strictEqual(translate('en', 'card.label', { slot: 2, code: 'abcd1234' }), 'Friend Code 2: abcd1234', 'Interpolation');
assert.strictEqual(translate('en', 'daily.progress', { count: 0, goal: 3 }), 'Scanned today: 0 of 3', 'Zero is interpolated');
assert.strictEqual(translate('xx', 'toast.undo'), 'Undo', 'Unknown language falls back to English');
assert.strictEqual(translate('en', 'no.such.key'), 'no.such.key', 'Unknown key returns the key');

// detectLanguage: saved choice first, then browser languages, then English
assert.strictEqual(detectLanguage('es', ['ja-JP']), 'es', 'Saved choice wins');
assert.strictEqual(detectLanguage('xx', ['ja-JP']), 'ja', 'Invalid saved choice ignored');
assert.strictEqual(detectLanguage(null, ['ja-JP', 'en-US']), 'ja', 'Japanese browser');
assert.strictEqual(detectLanguage(null, ['es-MX']), 'es', 'Any Spanish variant');
assert.strictEqual(detectLanguage(null, ['pt-PT']), 'pt-BR', 'Any Portuguese variant uses pt-BR');
assert.strictEqual(detectLanguage(null, ['PT-br']), 'pt-BR', 'Case-insensitive');
assert.strictEqual(detectLanguage(null, ['fr-FR', 'es-ES']), 'es', 'First supported browser language');
assert.strictEqual(detectLanguage(null, ['fr-FR']), 'en', 'Unsupported falls back to English');
assert.strictEqual(detectLanguage(null, []), 'en', 'No languages falls back to English');

// The scanner speaks the injected language
{
    const { deps, elements } = makeMockDeps();
    deps.t = (key, params) => translate('es', key, params);
    const scanner = createScanner(deps);
    scanner.onScanSuccess('not-valid');
    assert.strictEqual(elements['scanner-status'].textContent, STRINGS.es['scanner.invalid'], 'Scanner uses injected translator');
}

console.log('i18n tests passed.');

// --- build.js: static language pages, sitemap, robots.txt, preview image ---
const os = require('node:os');
const { build, SITE_URL } = require('./build.js');
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dblqr-build-'));
build(buildDir);
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pageFile = (lang) => {
    const { path: urlPath } = LANGUAGES.find(l => l.code === lang);
    return path.join(buildDir, urlPath, 'index.html');
};

assert.strictEqual(SITE_URL, 'https://dblqr.github.io', 'Site URL');
assert.deepStrictEqual(
    LANGUAGES.map(l => l.path),
    ['/', '/ja/', '/es/', '/pt-br/'],
    'Each language has its own URL'
);

for (const { code: lang, path: urlPath } of LANGUAGES) {
    const html = fs.readFileSync(pageFile(lang), 'utf8');
    const T = (key) => escapeHtml(STRINGS[lang][key]);
    const url = SITE_URL + urlPath;

    assert.ok(html.includes(`<html lang="${lang}">`), `${lang}: <html lang>`);
    assert.ok(html.includes(`<title>${T('page.title')}</title>`), `${lang}: translated, escaped <title>`);
    assert.ok(html.includes(`<meta name="description" content="${T('page.description')}">`), `${lang}: meta description`);
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`), `${lang}: canonical is the page itself`);
    assert.ok(html.includes(`<meta property="og:url" content="${url}">`), `${lang}: og:url`);
    assert.ok(html.includes(`<meta property="og:title" content="${T('page.ogTitle')}">`), `${lang}: og:title`);
    assert.ok(html.includes(`<meta property="og:description" content="${T('page.ogDescription')}">`), `${lang}: og:description`);
    assert.ok(html.includes(`<meta property="og:image" content="${SITE_URL}/og-image.png">`), `${lang}: og:image is absolute`);
    assert.ok(html.includes('<meta property="og:image:width" content="1200">'), `${lang}: og:image width`);
    assert.ok(html.includes('<meta property="og:image:height" content="630">'), `${lang}: og:image height`);
    assert.ok(html.includes(`<meta property="og:image:alt" content="${T('page.ogImageAlt')}">`), `${lang}: og:image alt`);
    assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), `${lang}: large preview card`);

    for (const other of LANGUAGES) {
        assert.ok(
            html.includes(`<link rel="alternate" hreflang="${other.code}" href="${SITE_URL}${other.path}">`),
            `${lang}: hreflang link to ${other.code}`
        );
    }
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}/">`), `${lang}: x-default`);

    const jsonLd = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.strictEqual(jsonLd['@type'], 'WebApplication', `${lang}: JSON-LD type`);
    assert.strictEqual(jsonLd.url, url, `${lang}: JSON-LD url`);
    assert.strictEqual(jsonLd.inLanguage, lang, `${lang}: JSON-LD language`);
    assert.strictEqual(jsonLd.name, STRINGS[lang]['page.appName'], `${lang}: JSON-LD name`);
    assert.strictEqual(jsonLd.offers.price, '0', `${lang}: JSON-LD free`);
    assert.strictEqual(jsonLd.isAccessibleForFree, true, `${lang}: JSON-LD accessible for free`);

    // Static text is translated in the HTML itself (indexable without JS)
    assert.ok(html.includes(`>${T('header.title')}</h1>`), `${lang}: h1 translated in HTML`);
    assert.ok(html.includes(`>${T('actions.scan')}</button>`), `${lang}: buttons translated in HTML`);
    assert.ok(html.includes(`>${STRINGS[lang]['empty.scan']}</li>`), `${lang}: markup strings inserted as HTML`);
    assert.ok(html.includes(`aria-label="${T('scanner.close')}"`), `${lang}: attributes translated in HTML`);

    // Assets use root-absolute paths so /ja/ etc. load them correctly
    assert.ok(html.includes('src="/app.js"') && html.includes('href="/styles.css"'), `${lang}: root-absolute assets`);
    assert.ok(!/(src|href)="(?!https?:|\/|#|mailto:)[^"]+"/.test(html), `${lang}: no relative asset paths`);
}
assert.ok(
    !fs.readFileSync(pageFile('ja'), 'utf8').includes(`>${STRINGS.en['actions.scan']}</button>`),
    'Japanese page has no English button text left'
);

// sitemap.xml lists every language page with its alternates
{
    const sitemap = fs.readFileSync(path.join(buildDir, 'sitemap.xml'), 'utf8');
    assert.ok(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Sitemap XML declaration');
    for (const { code, path: urlPath } of LANGUAGES) {
        assert.ok(sitemap.includes(`<loc>${SITE_URL}${urlPath}</loc>`), `Sitemap lists ${code}`);
        assert.ok(
            sitemap.includes(`<xhtml:link rel="alternate" hreflang="${code}" href="${SITE_URL}${urlPath}"/>`),
            `Sitemap alternate for ${code}`
        );
    }
}

// robots.txt allows crawling and points at the sitemap
{
    const robots = fs.readFileSync(path.join(buildDir, 'robots.txt'), 'utf8');
    assert.ok(/User-agent: \*\nAllow: \//.test(robots), 'robots.txt allows everything');
    assert.ok(robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`), 'robots.txt points at the sitemap');
}

// Preview image is 1200x630
{
    const png = PNGReader.sync.read(fs.readFileSync(path.join(buildDir, 'og-image.png')));
    assert.strictEqual(`${png.width}x${png.height}`, '1200x630', 'og-image.png is 1200x630');
}


// --- HTML5 / OWASP hardening of the built pages ---
{
    const { HtmlValidate } = require('html-validate');
    const crypto = require('node:crypto');
    const htmlvalidate = new HtmlValidate(require('./.htmlvalidate.json'));
    const sri = (file) => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(file)).digest('base64');

    for (const { code: lang } of LANGUAGES) {
        const html = fs.readFileSync(pageFile(lang), 'utf8');
        const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));

        // Encoding is declared first, inside the first 1024 bytes (W3C validator error before)
        assert.ok(/^<head>\s*<meta charset="utf-8">/.test(head), `${lang}: <meta charset> is the first element in <head>`);
        assert.ok(Buffer.byteLength(html.slice(0, html.indexOf('<meta charset'))) < 1024, `${lang}: charset within first 1024 bytes`);

        // Content Security Policy, before any script
        const csp = head.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
        assert.ok(csp, `${lang}: CSP meta tag`);
        assert.ok(head.indexOf('Content-Security-Policy') < head.indexOf('<script'), `${lang}: CSP precedes every script`);
        for (const directive of [
            "default-src 'self'",
            "script-src 'self' https://*.googletagmanager.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]) {
            assert.ok(csp[1].includes(directive), `${lang}: CSP includes ${directive}`);
        }
        assert.ok(!/unsafe-inline|unsafe-eval/.test(csp[1].split(';').find(d => d.trim().startsWith('script-src'))),
            `${lang}: CSP script-src allows no inline or eval`);

        // No inline executable scripts (JSON-LD is data, not executed)
        for (const [tag] of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)) {
            assert.ok(tag.includes('type="application/ld+json"'), `${lang}: no inline executable <script> (${tag})`);
        }

        // Referrer policy and safe external links
        assert.ok(head.includes('<meta name="referrer" content="no-referrer">'), `${lang}: referrer policy`);
        for (const [link] of html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) {
            assert.ok(link.includes('rel="noopener noreferrer"'), `${lang}: target=_blank link has rel="noopener noreferrer"`);
        }

        // Third-party code: only Google Tag Manager, loaded by /analytics.js
        assert.ok(!/<script[^>]+src="https?:/.test(html), `${lang}: no third-party <script src>`);
        assert.ok(html.includes('<script src="/analytics.js"></script>'), `${lang}: analytics loader script`);
        assert.ok(html.includes('<script src="/vendor/qrcode.min.js" defer></script>'), `${lang}: QR library is self-hosted`);
        assert.ok(!html.includes('html5-qrcode'), `${lang}: camera library is not loaded up front`);

        // Accessibility and semantics
        assert.ok(html.includes('<dialog id="scanner-dialog" aria-labelledby="scanner-title">'), `${lang}: scanner dialog is named`);
        assert.ok(!html.includes('<nav'), `${lang}: action buttons are not marked up as navigation`);
        assert.ok(html.includes('<output id="toast" aria-live="polite">'), `${lang}: toast output without redundant role`);
        for (const [tag] of html.matchAll(/<section\b[^>]*>/g)) {
            assert.ok(/aria-labelledby="[^"]+"/.test(tag), `${lang}: every <section> is labelled by a heading (${tag})`);
        }
        const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
        assert.ok(main.includes('id="how-it-works"'), `${lang}: How It Works is part of the main content`);
        const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
        assert.ok(footer.includes('class="disclaimer"') && !footer.includes('how-it-works'), `${lang}: footer holds the disclaimer only`);

        // How It Works is collapsible; its heading is the <summary>
        assert.ok(
            /<section id="how-it-works" aria-labelledby="how-title">\s*<details id="how-details">\s*<summary><h2 id="how-title"/.test(html),
            `${lang}: How It Works is a <details> with the heading in its <summary>`
        );

        // Below-the-fold image loads lazily
        assert.ok(/<img [^>]*alt="Buy Me a Coffee"[^>]*loading="lazy" decoding="async"/.test(html), `${lang}: lazy Buy Me a Coffee image`);

        // Valid HTML
        const report = htmlvalidate.validateStringSync(html, `${lang}/index.html`);
        const problems = report.results.flatMap(r => r.messages.map(m => `${m.line}:${m.column} ${m.ruleId} ${m.message}`));
        assert.deepStrictEqual(problems, [], `${lang}: html-validate finds no problems`);
    }

    // Self-hosted libraries are byte-identical to the versions previously pinned by SRI on the CDNs
    assert.strictEqual(
        sri(path.join(__dirname, 'vendor/qrcode.min.js')),
        'sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU',
        'vendor/qrcode.min.js matches qrcodejs 1.0.0'
    );
    assert.strictEqual(
        sri(path.join(__dirname, 'vendor/html5-qrcode.min.js')),
        'sha384-c9d8RFSL+u3exBOJ4Yp3HUJXS4znl9f+z66d1y54ig+ea249SpqR+w1wyvXz/lk+',
        'vendor/html5-qrcode.min.js matches html5-qrcode 2.3.8'
    );
    for (const file of ['vendor/README.md', 'vendor/LICENSE-qrcodejs', 'vendor/LICENSE-html5-qrcode']) {
        assert.ok(fs.existsSync(path.join(__dirname, file)), `${file} exists`);
    }
}

// --- Service worker kill switch: clears caches, unregisters, reloads open pages ---
{
    const vm = require('node:vm');
    const source = fs.readFileSync(path.join(__dirname, 'sw-kill-switch.js'), 'utf8');
    const handlers = {};
    const calls = { deleted: [], unregistered: 0, navigated: [], skipWaiting: 0, claimed: 0 };
    const sandbox = {
        self: {
            addEventListener: (type, fn) => { handlers[type] = fn; },
            skipWaiting: async () => { calls.skipWaiting++; },
            registration: { unregister: async () => { calls.unregistered++; return true; } },
            clients: {
                claim: async () => { calls.claimed++; },
                matchAll: async () => [{ url: 'https://dblqr.github.io/ja/', navigate: async (url) => calls.navigated.push(url) }],
            },
        },
        caches: {
            keys: async () => ['dblqr-v1', 'dblqr-v2'],
            delete: async (name) => { calls.deleted.push(name); return true; },
        },
    };
    vm.runInNewContext(source, sandbox);
    assert.ok(handlers.install && handlers.activate, 'Kill switch handles install and activate');
    let installDone;
    handlers.install({ waitUntil: (p) => { installDone = p; } });
    let activateDone;
    handlers.activate({ waitUntil: (p) => { activateDone = p; } });
    asyncKillSwitchTest = Promise.all([installDone, activateDone]).then(() => {
        assert.strictEqual(calls.skipWaiting, 1, 'Kill switch activates immediately');
        assert.deepStrictEqual(calls.deleted, ['dblqr-v1', 'dblqr-v2'], 'Kill switch deletes every cache');
        assert.strictEqual(calls.unregistered, 1, 'Kill switch unregisters itself');
        assert.deepStrictEqual(calls.navigated, ['https://dblqr.github.io/ja/'], 'Kill switch reloads open pages');
        console.log('kill switch tests passed.');
    });
}

console.log('build tests passed.');

// --- Offline app: service worker cache list stays in sync with the build ---
{
    const swSource = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
    const listFrom = (name) => {
        const match = swSource.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
        assert.ok(match, `sw.js defines ${name}`);
        return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    };
    const shell = listFrom('SHELL_FILES');

    // Every deployed file the app needs must be cached for offline use.
    // Crawler and link-preview files are not needed offline.
    const notCached = new Set([
        'sw.js', 'robots.txt', 'sitemap.xml', 'og-image.png', 'vendor/LICENSE-qrcodejs', 'vendor/LICENSE-html5-qrcode',
    ]);
    const walk = (dir, prefix = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory()
            ? walk(path.join(dir, entry.name), `${prefix}${entry.name}/`)
            : [`${prefix}${entry.name}`]);
    for (const file of walk(buildDir)) {
        if (notCached.has(file)) continue;
        const cacheKey = file.endsWith('/index.html') ? file.replace(/index\.html$/, '') : file;
        assert.ok(shell.includes(cacheKey), `sw.js SHELL_FILES caches deployed file ${cacheKey}`);
    }
    for (const entry of shell.filter(f => f !== './')) {
        const file = entry.endsWith('/') ? `${entry}index.html` : entry;
        assert.ok(fs.existsSync(path.join(buildDir, file)), `sw.js SHELL_FILES entry ${entry} is deployed`);
    }

    assert.ok(!/CDN_FILES/.test(swSource), 'sw.js no longer special-cases CDN files (libraries are self-hosted)');
}
fs.rmSync(buildDir, { recursive: true, force: true });

// --- Offline app: manifest ---
{
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.webmanifest'), 'utf8'));
    assert.ok(manifest.name.includes('Shenron'), 'Manifest name');
    assert.ok(manifest.short_name.length <= 12, 'Short name fits under a home-screen icon');
    assert.strictEqual(manifest.display, 'standalone', 'Opens like an app');
    assert.strictEqual(manifest.start_url, './', 'Starts at the site root');
    const sizes = manifest.icons.map(i => i.sizes);
    assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'Has 192 and 512 icons');
    assert.ok(manifest.icons.some(i => i.purpose === 'maskable'), 'Has a maskable icon');
    for (const icon of manifest.icons) {
        const png = PNGReader.sync.read(fs.readFileSync(path.join(__dirname, icon.src)));
        assert.strictEqual(`${png.width}x${png.height}`, icon.sizes, `${icon.src} is ${icon.sizes}`);
    }
}

console.log('offline app tests passed.');

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

Promise.all([asyncScannerTests, asyncKillSwitchTest]).then(() => console.log('All tests passed.'));
