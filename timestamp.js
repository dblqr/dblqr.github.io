class DblTimestampHelper {
    static timestampEncoding = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'N', 'P', 'Q', 'R', 'S', 'T'];

    static createDblTimestamp() {
        return [...Date.now().toString(16)].map(char => this.timestampEncoding[parseInt(char, 16)]).join('');
    }

    static buildQrData(friendCode) {
        return `4,${friendCode}${this.createDblTimestamp()}`;
    }
}

function parseFriendCodeFromQR(qrData) {
    if (typeof qrData !== 'string') return null;
    const trimmed = qrData.trim().toLowerCase();

    // Plain 8-char friend code
    if (/^[a-z0-9]{8}$/.test(trimmed)) return trimmed;

    // Prefixed format: "4,{code}{timestamp}" (this app) or "7,{code}" (in-game scan code screen)
    const prefixMatch = trimmed.match(/^[0-9]+,([a-z0-9]{8})/);
    if (prefixMatch) return prefixMatch[1];

    // Deep link URL from profile card QR: token={code}
    const tokenMatch = trimmed.match(/[?&]token=([a-z0-9]{8})(?:&|$)/);
    if (tokenMatch) return tokenMatch[1];

    return null;
}

// A normalized friend code: exactly 8 lowercase letters or digits.
function isValidFriendCode(code) {
    return typeof code === 'string' && /^[a-z0-9]{8}$/.test(code);
}

// Pull every friend code out of free text (an exported .txt, pasted QR data,
// a profile link, ...). Tokens are whitespace-separated; a token that isn't a
// recognised format by itself is also tried as a comma-separated list, so
// "4,{code}{timestamp}" keeps its comma but "code1,code2" still splits.
function extractFriendCodes(text) {
    if (typeof text !== 'string') return [];
    const codes = [];
    for (const token of text.split(/\s+/).filter(Boolean)) {
        const whole = parseFriendCodeFromQR(token);
        const parts = whole ? [whole] : token.split(',').map(parseFriendCodeFromQR);
        for (const code of parts) {
            if (code && !codes.includes(code)) codes.push(code);
        }
    }
    return codes;
}

if (typeof module !== 'undefined') {
    module.exports = { DblTimestampHelper, parseFriendCodeFromQR, isValidFriendCode, extractFriendCodes };
}
