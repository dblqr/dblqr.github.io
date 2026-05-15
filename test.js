const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { DblTimestampHelper, parseFriendCodeFromQR } = require('./timestamp.js');
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

console.log('timestamp tests passed.');

// --- createScanner tests ---

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
                if (!elements[id]) elements[id] = { textContent: '' };
                return elements[id];
            },
            querySelectorAll: () => [
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

// Valid code advances index
{
    const { deps, calls } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.onScanSuccess('ab12cd34');
    const state = scanner.getState();
    assert.strictEqual(state.currentScanIndex, 1, 'Index advances after valid scan');
    assert.strictEqual(state.scannedCodes[0], 'ab12cd34', 'Code stored at index 0');
}

// Duplicate code rejected
{
    const { deps, elements } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.onScanSuccess('ab12cd34');
    scanner.onScanSuccess('ab12cd34');
    const state = scanner.getState();
    assert.strictEqual(state.currentScanIndex, 1, 'Index does not advance for duplicate');
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

// 3rd scan triggers completion
{
    const { deps, calls } = makeMockDeps();
    const scanner = createScanner(deps);
    scanner.onScanSuccess('ab12cd34');
    scanner.onScanSuccess('ef56gh78');
    scanner.onScanSuccess('jk90mn12');
    const state = scanner.getState();
    assert.strictEqual(state.currentScanIndex, 3, 'Index is 3 after all scans');
    assert.deepStrictEqual(state.scannedCodes, ['ab12cd34', 'ef56gh78', 'jk90mn12'], 'All codes stored');
    assert.ok(calls.showToast.some(m => m.includes('All 3')), 'Toast shows completion message');
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
    assert.deepStrictEqual(state.scannedCodes, ['ef56gh78', 'jk90mn12', 'ab12cd34'], 'All QR formats parsed');
}

console.log('scanner tests passed.');

// --- QR fixture image verification ---

const jsQR = require('jsqr');
const { PNG } = require('pngjs');

const fixtures = [
    { file: 'plain-code.png', expectedData: 'ab12cd34', expectedCode: 'ab12cd34' },
    { file: 'ingame-scan.png', expectedData: '7,ef56gh78', expectedCode: 'ef56gh78' },
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
console.log('All tests passed.');
