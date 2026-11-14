// Loaded before this file: i18n.js (t, initI18n), timestamp.js, daily.js
// (DAILY_GOAL, scan-log helpers), scanner.js (SLOT_COUNT, createScanner).
const REFRESH_SECONDS = 10;
const TOAST_MS = 2000;
const ACTION_TOAST_MS = 5000;

let refreshTickId = null;
let secondsUntilRefresh = REFRESH_SECONDS;
let toastTimer = null;
let zoomSlot = null;
let zoomQr = null;
let wakeLock = null;
let wakeLockWanted = false;
let wakeLockRequest = null;
let scanLog = null;
let dailySlot = null;
let dailyQr = null;

// slot index (0-based) -> { block, label, trigger, scanToggle, downloadButton, qr, code }
const qrCards = new Map();

// --- Toast -----------------------------------------------------------------

function hideToast() {
    clearTimeout(toastTimer);
    document.getElementById('toast').classList.remove('show');
}

// Show a message; `action` ({ label, onClick }) adds a button and keeps the
// toast up longer. A new toast always replaces the previous one's timer.
function showToast(message, action) {
    const toast = document.getElementById('toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    if (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'toast-action';
        button.textContent = action.label;
        button.addEventListener('click', () => {
            hideToast();
            action.onClick();
        });
        toast.append(' ', button);
    }
    toast.classList.add('show');
    toastTimer = setTimeout(hideToast, action ? ACTION_TOAST_MS : TOAST_MS);
}

// --- Storage ---------------------------------------------------------------

function getInputs() {
    return Array.from(document.querySelectorAll('#friend-code-form input'));
}

function getFriendCodes() {
    return getInputs().map(input => input.value.trim().toLowerCase());
}

function saveFriendCodes(codes) {
    try {
        localStorage.setItem('friendCodes', JSON.stringify(codes));
    } catch (_e) {
        // Storage can be unavailable (private mode, quota); the page still works.
    }
}

function loadFriendCodes() {
    try {
        const saved = JSON.parse(localStorage.getItem('friendCodes') || '[]');
        return Array.isArray(saved) ? saved.map(c => (typeof c === 'string' ? c : '')) : [];
    } catch (_e) {
        return [];
    }
}

function setFriendCodes(codes) {
    getInputs().forEach((input, i) => { input.value = codes[i] || ''; });
}

// --- QR drawing --------------------------------------------------------------

// qrcodejs copies the encoded text into a `title` tooltip on its container and
// leaves its <img> without alt text. Every QR sits inside a labelled control or
// dialog, so the image is decorative: give it alt="" and drop the tooltip.
function createQr(element, size, text) {
    const qr = new QRCode(element, {
        text,
        width: size,
        height: size,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
    const img = element.querySelector('img');
    if (img) img.alt = '';
    element.removeAttribute('title');
    return qr;
}

function drawQr(qr, element, text) {
    qr.makeCode(text);
    element.removeAttribute('title');
}

// --- QR cards --------------------------------------------------------------

function cardLabel(slot, code) {
    return t('card.label', { slot: slot + 1, code });
}

function setCardCode(card, slot, code) {
    const qrData = DblTimestampHelper.buildQrData(code);
    card.code = code;
    drawQr(card.qr, card.trigger, qrData);
    card.block.dataset.qrData = qrData;
    card.label.textContent = cardLabel(slot, code);
}

function downloadQr(slot) {
    const card = qrCards.get(slot);
    if (!card) return;
    // Regenerate first so the image carries a fresh timestamp.
    setCardCode(card, slot, card.code);
    const canvas = card.trigger.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `friend-code-${slot + 1}-${card.code}.png`;
    link.click();
    showToast(t('toast.downloaded'));
}

function createCard(slot, code) {
    const block = document.createElement('div');
    block.dataset.slot = String(slot + 1);

    const label = document.createElement('h3');
    label.className = 'card-label';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'qr-zoom-trigger';
    trigger.setAttribute('aria-label', t('card.enlargeLabel', { slot: slot + 1 }));
    trigger.addEventListener('click', () => openZoom(slot));

    const scanToggle = document.createElement('button');
    scanToggle.type = 'button';
    scanToggle.className = 'scan-toggle';
    scanToggle.addEventListener('click', () => {
        const card = qrCards.get(slot);
        if (card) setScanned(card.code, !isScanned(scanLog, card.code));
    });

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'download-button';
    downloadButton.textContent = t('card.download');
    downloadButton.setAttribute('aria-label', t('card.downloadLabel', { slot: slot + 1 }));
    downloadButton.addEventListener('click', () => downloadQr(slot));

    // Rendered at 600px and scaled down by CSS (--qr-size) so it stays sharp
    // on large screens.
    const qr = createQr(trigger, 600, DblTimestampHelper.buildQrData(code));

    block.append(label, trigger, scanToggle, downloadButton);
    const card = { block, label, trigger, scanToggle, downloadButton, qr, code };
    setCardCode(card, slot, code);
    requestAnimationFrame(() => block.classList.add('visible'));
    return card;
}

function insertCardInOrder(container, slot, block) {
    const later = [...qrCards.keys()].filter(s => s > slot).sort((a, b) => a - b)[0];
    container.insertBefore(block, later === undefined ? null : qrCards.get(later).block);
}

function updateInputValidity() {
    getInputs().forEach(input => {
        const code = input.value.trim().toLowerCase();
        input.setAttribute('aria-invalid', String(code !== '' && !isValidFriendCode(code)));
    });
}

// Bring the QR cards in line with the inputs. Existing cards are redrawn in
// place with a fresh timestamp, so nothing flickers while someone scans.
function generateAllQRCodes() {
    const codes = getFriendCodes();
    saveFriendCodes(codes);
    updateInputValidity();

    const container = document.querySelector('.qr-display');
    codes.forEach((code, slot) => {
        const card = qrCards.get(slot);
        if (!isValidFriendCode(code)) {
            if (card) {
                card.block.remove();
                qrCards.delete(slot);
            }
            return;
        }
        if (card) {
            setCardCode(card, slot, code);
            return;
        }
        const newCard = createCard(slot, code);
        insertCardInOrder(container, slot, newCard.block);
        qrCards.set(slot, newCard);
    });

    const hasCodes = qrCards.size > 0;
    document.getElementById('empty-state').hidden = hasCodes;
    document.getElementById('refresh-countdown').hidden = !hasCodes;
    secondsUntilRefresh = REFRESH_SECONDS;
    renderCountdown();
    renderScanState();
    updateZoom();
    updateDaily();
    setWakeLock(hasCodes);
}

// --- Auto refresh ----------------------------------------------------------

function renderCountdown() {
    document.getElementById('refresh-countdown').textContent =
        t('refresh.countdown', { seconds: secondsUntilRefresh });
}

function startAutoRefresh() {
    clearInterval(refreshTickId);
    refreshTickId = setInterval(() => {
        if (rollOverDay()) renderScanState();
        secondsUntilRefresh--;
        if (secondsUntilRefresh <= 0) {
            generateAllQRCodes();
        } else {
            renderCountdown();
        }
    }, 1000);
}

function refreshNow() {
    generateAllQRCodes();
    startAutoRefresh();
}

// --- Enlarged QR view ------------------------------------------------------

function openZoom(slot) {
    const dialog = document.getElementById('qr-zoom');
    const target = document.getElementById('qr-zoom-code');
    const size = Math.max(200, Math.min(window.innerWidth, window.innerHeight, 640) - 96);
    target.innerHTML = '';
    zoomQr = createQr(target, size, 'x');
    zoomSlot = slot;
    dialog.showModal();
    updateZoom();
}

function updateZoom() {
    const dialog = document.getElementById('qr-zoom');
    if (zoomSlot === null || !dialog.open) return;
    const card = qrCards.get(zoomSlot);
    if (!card) {
        dialog.close();
        return;
    }
    const qrData = card.block.dataset.qrData;
    drawQr(zoomQr, document.getElementById('qr-zoom-code'), qrData);
    dialog.dataset.qrData = qrData;
    document.getElementById('qr-zoom-label').textContent = cardLabel(zoomSlot, card.code);
}

// --- Daily scans (Shenron/Porunga events) -----------------------------------

function todayKey() {
    return gameDayKey(new Date());
}

function loadScanLog() {
    let stored = null;
    try {
        stored = JSON.parse(localStorage.getItem('dailyScans') || 'null');
    } catch (_e) {
        // Corrupt or unavailable storage: start today's log fresh.
    }
    return normalizeScanLog(stored, todayKey());
}

function saveScanLog() {
    try {
        localStorage.setItem('dailyScans', JSON.stringify(scanLog));
    } catch (_e) { /* storage unavailable */ }
}

// Start a fresh log when the game day has changed (1:00 AM Pacific).
// Returns true if it rolled over.
function rollOverDay() {
    const today = todayKey();
    if (scanLog.date === today) return false;
    scanLog = normalizeScanLog(null, today);
    saveScanLog();
    return true;
}

function setScanned(code, scanned) {
    rollOverDay();
    scanLog = scanned ? markScanned(scanLog, code) : unmarkScanned(scanLog, code);
    saveScanLog();
    renderScanState();
}

function renderScanState() {
    qrCards.forEach(card => {
        const scanned = isScanned(scanLog, card.code);
        card.block.classList.toggle('scanned', scanned);
        card.scanToggle.setAttribute('aria-pressed', String(scanned));
        card.scanToggle.textContent = t(scanned ? 'card.scannedToday' : 'card.markScanned');
    });
    const progress = t('daily.progress', { count: scanLog.codes.length, goal: DAILY_GOAL });
    document.getElementById('daily-progress').textContent = progress;
    document.getElementById('daily-scan-progress').textContent = progress;
    renderResetTime(document.getElementById('daily-reset'), nextGameReset(new Date()));
    document.getElementById('daily-panel').hidden = qrCards.size === 0;
}

// "Resets at <time datetime="…">4:00 AM</time> your time": the translated
// sentence with the local time as a machine-readable <time> element.
function renderResetTime(element, resetAt) {
    const marker = '\u0000';
    const [before, after = ''] = t('daily.resetsAt', { time: marker }).split(marker);
    const time = document.createElement('time');
    time.dateTime = resetAt.toISOString();
    time.textContent = resetAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    element.replaceChildren(before, time, after);
}

function openDaily() {
    rollOverDay();
    const target = document.getElementById('daily-code');
    const size = Math.max(200, Math.min(window.innerWidth, window.innerHeight - 220, 560) - 64);
    target.innerHTML = '';
    dailyQr = createQr(target, size, 'x');
    const first = nextDailySlot(getFriendCodes(), scanLog, 0);
    if (first === -1) return;
    document.getElementById('daily-scan').showModal();
    renderScanState();
    showDailySlot(first);
}

// Show a slot in the daily view. The status line explains anything notable:
// an explicit message, else a reminder that this code was already scanned.
function showDailySlot(slot, message = '') {
    dailySlot = slot;
    updateDaily();
    const card = qrCards.get(slot);
    document.getElementById('daily-status').textContent =
        message || (card && isScanned(scanLog, card.code) ? t('daily.alreadyScanned') : '');
}

// Keep the daily view's QR in sync with refreshes; move on if its code was
// removed.
function updateDaily() {
    const dialog = document.getElementById('daily-scan');
    if (!dialog.open || dailySlot === null) return;
    const card = qrCards.get(dailySlot);
    if (!card) {
        const next = nextDailySlot(getFriendCodes(), scanLog, dailySlot);
        if (next === -1) {
            dialog.close();
        } else {
            showDailySlot(next);
        }
        return;
    }
    const qrData = card.block.dataset.qrData;
    drawQr(dailyQr, document.getElementById('daily-code'), qrData);
    dialog.dataset.qrData = qrData;
    document.getElementById('daily-label').textContent = cardLabel(dailySlot, card.code);
}

// The daily view always loops: Next and Skip move to the next unscanned code,
// or once everything is scanned, to the next code in order.
function dailyDone() {
    const card = qrCards.get(dailySlot);
    if (!card) return;
    const current = dailySlot;
    const before = scanLog.codes.length;
    setScanned(card.code, true);
    const reachedGoal = before < DAILY_GOAL && scanLog.codes.length >= DAILY_GOAL;
    const message = reachedGoal ? t('daily.goalReached', { count: scanLog.codes.length }) : '';
    const next = nextDailySlot(getFriendCodes(), scanLog, current + 1, current);
    showDailySlot(next === -1 ? current : next, message);
}

function dailySkip() {
    const next = nextDailySlot(getFriendCodes(), scanLog, dailySlot + 1, dailySlot);
    if (next === -1) {
        document.getElementById('daily-status').textContent = t('daily.onlyCode');
        return;
    }
    showDailySlot(next);
}

// --- Screen wake lock ------------------------------------------------------

// Keep the screen on while QR codes are showing so it doesn't dim while a
// friend scans. The browser drops the lock when the tab is hidden; the
// visibilitychange handler asks again on return.
function setWakeLock(wanted) {
    wakeLockWanted = wanted;
    if (!('wakeLock' in navigator)) return;
    if (wanted && !wakeLock && !wakeLockRequest && document.visibilityState === 'visible') {
        wakeLockRequest = navigator.wakeLock.request('screen')
            .then(lock => {
                wakeLock = lock;
                lock.addEventListener('release', () => {
                    if (wakeLock === lock) wakeLock = null;
                });
                if (!wakeLockWanted) setWakeLock(false);
            })
            .catch(() => { /* denied or unsupported; not critical */ })
            .finally(() => { wakeLockRequest = null; });
    } else if (!wanted && wakeLock) {
        const lock = wakeLock;
        wakeLock = null;
        lock.release().catch(() => {});
    }
}

// --- Analytics consent -----------------------------------------------------

// How It Works is open on a first visit and folded on later ones; visitors
// can still open it any time.
function setupHowItWorks() {
    const details = document.getElementById('how-details');
    let seen = false;
    try {
        seen = localStorage.getItem('howItWorksSeen') === 'true';
        localStorage.setItem('howItWorksSeen', 'true');
    } catch (_e) {
        // Without storage every visit counts as a first visit.
    }
    details.open = !seen;
}

function setupConsentBanner() {
    const banner = document.getElementById('consent-banner');
    let choice = null;
    try {
        choice = localStorage.getItem('analyticsConsent');
    } catch (_e) {
        // Without storage the banner shows each visit; analytics stay denied.
    }
    banner.hidden = choice === 'granted' || choice === 'denied';

    const decide = (value) => {
        try {
            localStorage.setItem('analyticsConsent', value);
        } catch (_e) { /* see above */ }
        if (typeof window.gtag === 'function') {
            window.gtag('consent', 'update', { analytics_storage: value });
        }
        banner.hidden = true;
    };
    document.getElementById('consent-accept').addEventListener('click', () => decide('granted'));
    document.getElementById('consent-decline').addEventListener('click', () => decide('denied'));
}

// --- Camera library (loaded on demand) ------------------------------------

// html5-qrcode is ~375 KB and only needed when the scanner opens, so it is
// loaded on first use instead of on every page view. The service worker
// precaches it, so the scanner still opens offline.
let scannerLibrary = null;

function loadScannerLibrary() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (!scannerLibrary) {
        scannerLibrary = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/vendor/html5-qrcode.min.js';
            script.onload = () => (window.Html5Qrcode ? resolve() : reject(new Error('Html5Qrcode missing')));
            script.onerror = () => reject(new Error('Failed to load the scanner library'));
            document.head.appendChild(script);
        }).catch(error => {
            scannerLibrary = null; // allow a retry
            throw error;
        });
    }
    return scannerLibrary;
}

// --- Form ------------------------------------------------------------------

function setupFriendForm() {
    const form = document.getElementById('friend-code-form');
    const saved = loadFriendCodes();
    for (let i = 0; i < SLOT_COUNT; i++) {
        const field = document.createElement('div');
        field.className = 'code-field';
        const label = document.createElement('label');
        label.htmlFor = `code-${i + 1}`;
        label.textContent = t('input.label', { slot: i + 1 });
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `code-${i + 1}`;
        input.placeholder = t('input.placeholder');
        input.minLength = 8;
        input.maxLength = 8;
        input.pattern = '[a-zA-Z0-9]{8}';
        input.title = t('input.title');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('spellcheck', 'false');
        if (saved[i]) input.value = saved[i];
        field.append(label, input);
        form.appendChild(field);
    }
}

// Pasting QR data, a profile link, or several codes fills inputs with the
// extracted friend codes, starting at the input pasted into.
function handlePaste(e) {
    const inputs = getInputs();
    const start = inputs.indexOf(e.target);
    if (start === -1 || !e.clipboardData) return;
    const codes = extractFriendCodes(e.clipboardData.getData('text/plain'));
    if (codes.length === 0) return;
    e.preventDefault();
    codes.slice(0, SLOT_COUNT - start).forEach((code, i) => {
        inputs[start + i].value = code;
    });
    refreshNow();
}

document.addEventListener('DOMContentLoaded', () => {
    initI18n();
    scanLog = loadScanLog();
    setupFriendForm();
    setupConsentBanner();
    setupHowItWorks();
    const form = document.getElementById('friend-code-form');
    form.addEventListener('submit', e => e.preventDefault());
    form.addEventListener('paste', handlePaste);
    refreshNow();

    const scanner = createScanner({
        parseFriendCodeFromQR: parseFriendCodeFromQR,
        showToast: showToast,
        generateAllQRCodes: generateAllQRCodes,
        getDialog: () => document.getElementById('scanner-dialog'),
        getElement: (id) => document.getElementById(id),
        querySelectorAll: (sel) => document.querySelectorAll(sel),
        vibrate: (pattern) => { if (navigator.vibrate) navigator.vibrate(pattern); },
        t: t,
        // Resolved when used: the library is loaded on demand.
        get Html5Qrcode() { return window.Html5Qrcode; }
    });

    let inputTimeout;
    form.addEventListener('input', () => {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(refreshNow, 300);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshNow();
    });

    document.getElementById('manual-refresh').addEventListener('click', () => {
        refreshNow();
        showToast(t('toast.refreshed'));
    });

    document.getElementById('export-codes').addEventListener('click', () => {
        const codes = getFriendCodes().filter(isValidFriendCode);
        if (codes.length === 0) {
            showToast(t('toast.nothingToExport'));
            return;
        }
        const blob = new Blob([codes.join('\n')], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'friend-codes.txt';
        link.click();
        // Revoking synchronously can cancel the download in some browsers.
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        showToast(t('toast.exported'));
    });

    document.getElementById('upload-codes').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';
        file.text().then(text => {
            const codes = extractFriendCodes(text).slice(0, SLOT_COUNT);
            if (codes.length === 0) {
                showToast(t('toast.noValidInFile'));
                return;
            }
            setFriendCodes(codes);
            refreshNow();
            showToast(t('toast.uploaded', { count: codes.length }));
        });
    });

    document.getElementById('clear-codes').addEventListener('click', () => {
        const previous = getFriendCodes();
        setFriendCodes([]);
        generateAllQRCodes();
        try {
            localStorage.removeItem('friendCodes');
        } catch (_e) { /* storage unavailable */ }
        if (!previous.some(Boolean)) {
            showToast(t('toast.cleared'));
            return;
        }
        showToast(t('toast.cleared'), {
            label: t('toast.undo'),
            onClick: () => {
                setFriendCodes(previous);
                refreshNow();
                showToast(t('toast.restored'));
            }
        });
    });

    document.getElementById('import-codes').addEventListener('click', () => {
        loadScannerLibrary()
            .then(() => scanner.openScanner())
            .catch(() => showToast(t('scanner.loadFailed')));
    });

    document.getElementById('scanner-upload-btn').addEventListener('click', () => {
        document.getElementById('scanner-file-input').click();
    });

    document.getElementById('scanner-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        const hadCamera = !!scanner.getScannerInstance();
        scanner.stopCamera().then(() => {
            const fileScanner = new window.Html5Qrcode('scanner-viewfinder');
            return fileScanner.scanFileV2(file, false).then(result => {
                fileScanner.clear();
                scanner.onScanSuccess(result.decodedText);
            }).catch(() => {
                fileScanner.clear();
                document.getElementById('scanner-status').textContent = t('scanner.noQrInImage');
            });
        }).then(() => {
            const state = scanner.getState();
            const dialog = document.getElementById('scanner-dialog');
            if (hadCamera && state.currentScanIndex < SLOT_COUNT && dialog.open) {
                scanner.startCamera().catch(() => {
                    // Already shown in the scanner UI.
                });
            }
        });
    });

    document.getElementById('scanner-retry').addEventListener('click', () => {
        scanner.startCamera().catch(() => {
            // Already handled by scanner state
        });
    });

    document.getElementById('scanner-prev').addEventListener('click', () => {
        scanner.prevSlot();
    });

    document.getElementById('scanner-next').addEventListener('click', () => {
        scanner.nextSlot();
    });

    document.getElementById('scanner-close').addEventListener('click', () => {
        scanner.closeScanner();
    });

    document.getElementById('scanner-dialog').addEventListener('close', () => {
        scanner.handleDialogClose();
    });

    document.getElementById('start-daily').addEventListener('click', openDaily);
    document.getElementById('daily-done').addEventListener('click', dailyDone);
    document.getElementById('daily-skip').addEventListener('click', dailySkip);
    const dailyDialog = document.getElementById('daily-scan');
    document.getElementById('daily-close').addEventListener('click', () => dailyDialog.close());
    dailyDialog.addEventListener('close', () => { dailySlot = null; });

    // Offline support (see sw.js). Registration failure is harmless.
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }

    const zoomDialog = document.getElementById('qr-zoom');
    zoomDialog.addEventListener('click', () => zoomDialog.close());
    zoomDialog.addEventListener('close', () => { zoomSlot = null; });
});
