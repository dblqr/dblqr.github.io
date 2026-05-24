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

if (typeof module !== 'undefined') module.exports = { DblTimestampHelper, parseFriendCodeFromQR };
