// Once-per-day scan tracking for the Shenron/Porunga events: each code can be
// scanned once per day and the event needs DAILY_GOAL scans. The game's day
// rolls over at 1:00 AM Pacific time (server time, DST-aware) for every
// player. The log is { date: 'YYYY-MM-DD' (game day), codes: [...] }.

const DAILY_GOAL = 3;
const GAME_TIME_ZONE = 'America/Los_Angeles';
const GAME_RESET_HOUR = 1;
const HOUR_MS = 60 * 60 * 1000;

const gameDateFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: GAME_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

const isValidDailyCode = typeof isValidFriendCode === 'function'
    ? isValidFriendCode
    : require('./timestamp.js').isValidFriendCode;

// The game day containing `date`: the Pacific calendar date, shifted back by
// the reset hour so the day starts at 1:00 AM Pacific.
function gameDayKey(date) {
    const parts = {};
    for (const { type, value } of gameDateFormat.formatToParts(new Date(date.getTime() - GAME_RESET_HOUR * HOUR_MS))) {
        parts[type] = value;
    }
    return `${parts.year}-${parts.month}-${parts.day}`;
}

// The next reset instant after `date`. Pacific offsets are whole hours, so the
// reset always falls on a UTC hour boundary within the next 25 hours.
function nextGameReset(date) {
    const today = gameDayKey(date);
    let candidate = Math.floor(date.getTime() / HOUR_MS) * HOUR_MS + HOUR_MS;
    for (let i = 0; i < 26; i++, candidate += HOUR_MS) {
        if (gameDayKey(new Date(candidate)) !== today) return new Date(candidate);
    }
    throw new Error('No game reset found within 26 hours');
}

// Today's log, or a fresh one if the stored log is from another day or corrupt.
function normalizeScanLog(value, today) {
    if (!value || typeof value !== 'object' || value.date !== today || !Array.isArray(value.codes)) {
        return { date: today, codes: [] };
    }
    const codes = [];
    for (const code of value.codes) {
        if (isValidDailyCode(code) && !codes.includes(code)) codes.push(code);
    }
    return { date: today, codes };
}

function isScanned(log, code) {
    return log.codes.includes(code);
}

function markScanned(log, code) {
    return isScanned(log, code) ? log : { date: log.date, codes: [...log.codes, code] };
}

function unmarkScanned(log, code) {
    return { date: log.date, codes: log.codes.filter(c => c !== code) };
}

// First slot at or after `from` (wrapping) holding a valid code not yet
// scanned today, or -1.
function nextUnscannedSlot(codes, log, from) {
    for (let offset = 0; offset < codes.length; offset++) {
        const slot = (from + offset) % codes.length;
        if (isValidDailyCode(codes[slot]) && !isScanned(log, codes[slot])) return slot;
    }
    return -1;
}

// The next code for the daily view, which always loops: the first unscanned
// code at or after `from` (wrapping), else the first valid code, never
// `exclude` (the code currently on screen). -1 if there is nowhere to go.
function nextDailySlot(codes, log, from, exclude = -1) {
    const candidates = [];
    for (let offset = 0; offset < codes.length; offset++) {
        const slot = (from + offset) % codes.length;
        if (slot !== exclude && isValidDailyCode(codes[slot])) candidates.push(slot);
    }
    const unscanned = candidates.find(slot => !isScanned(log, codes[slot]));
    if (unscanned !== undefined) return unscanned;
    return candidates.length > 0 ? candidates[0] : -1;
}

if (typeof module !== 'undefined') {
    module.exports = {
        DAILY_GOAL, gameDayKey, nextGameReset, normalizeScanLog, markScanned, unmarkScanned, isScanned,
        nextUnscannedSlot, nextDailySlot,
    };
}
