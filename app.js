// SLOT_COUNT is defined by scanner.js, which loads before this file.
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

// slot index (0-based) -> { block, label, trigger, downloadButton, qr, code }
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

// --- QR cards --------------------------------------------------------------

function cardLabel(slot, code) {
    return `Friend Code ${slot + 1}: ${code}`;
}

function setCardCode(card, slot, code) {
    const qrData = DblTimestampHelper.buildQrData(code);
    card.code = code;
    card.qr.makeCode(qrData);
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
    showToast('Downloaded!');
}

function createCard(slot, code) {
    const block = document.createElement('div');
    block.dataset.slot = String(slot + 1);

    const label = document.createElement('pre');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'qr-zoom-trigger';
    trigger.setAttribute('aria-label', `Enlarge QR code for friend code ${slot + 1}`);
    trigger.addEventListener('click', () => openZoom(slot));

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'download-button';
    downloadButton.textContent = 'Download QR Code';
    downloadButton.setAttribute('aria-label', `Download QR code for friend code ${slot + 1}`);
    downloadButton.addEventListener('click', () => downloadQr(slot));

    const qr = new QRCode(trigger, {
        text: DblTimestampHelper.buildQrData(code),
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    block.append(label, trigger, downloadButton);
    const card = { block, label, trigger, downloadButton, qr, code };
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
    updateZoom();
    setWakeLock(hasCodes);
}

// --- Auto refresh ----------------------------------------------------------

function renderCountdown() {
    document.getElementById('refresh-countdown').textContent =
        `Refreshing in ${secondsUntilRefresh}s`;
}

function startAutoRefresh() {
    clearInterval(refreshTickId);
    refreshTickId = setInterval(() => {
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
    zoomQr = new QRCode(target, {
        text: 'x',
        width: size,
        height: size,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
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
    zoomQr.makeCode(qrData);
    dialog.dataset.qrData = qrData;
    document.getElementById('qr-zoom-label').textContent = cardLabel(zoomSlot, card.code);
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

// --- Form ------------------------------------------------------------------

function setupFriendForm() {
    const form = document.getElementById('friend-code-form');
    const saved = loadFriendCodes();
    for (let i = 0; i < SLOT_COUNT; i++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = `Friend Code ${i + 1}`;
        input.maxLength = 8;
        input.pattern = '[a-zA-Z0-9]{8}';
        input.title = '8-character alphanumeric code';
        input.setAttribute('aria-label', `Friend code ${i + 1}`);
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('spellcheck', 'false');
        if (saved[i]) input.value = saved[i];
        form.appendChild(input);
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
    setupFriendForm();
    setupConsentBanner();
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
        Html5Qrcode: Html5Qrcode
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
        showToast('QRs refreshed!');
    });

    document.getElementById('export-codes').addEventListener('click', () => {
        const codes = getFriendCodes().filter(isValidFriendCode);
        if (codes.length === 0) {
            showToast('No friend codes to export');
            return;
        }
        const blob = new Blob([codes.join('\n')], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'friend-codes.txt';
        link.click();
        // Revoking synchronously can cancel the download in some browsers.
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        showToast('Friend codes exported!');
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
                showToast('No valid friend codes found in file');
                return;
            }
            setFriendCodes(codes);
            refreshNow();
            showToast(`${codes.length} code(s) uploaded!`);
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
            showToast('Friend codes cleared!');
            return;
        }
        showToast('Friend codes cleared!', {
            label: 'Undo',
            onClick: () => {
                setFriendCodes(previous);
                refreshNow();
                showToast('Friend codes restored');
            }
        });
    });

    document.getElementById('import-codes').addEventListener('click', () => {
        scanner.openScanner();
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
            const fileScanner = new Html5Qrcode('scanner-viewfinder');
            return fileScanner.scanFileV2(file, false).then(result => {
                fileScanner.clear();
                scanner.onScanSuccess(result.decodedText);
            }).catch(() => {
                fileScanner.clear();
                document.getElementById('scanner-status').textContent =
                    'No QR code found in image. Try another.';
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

    const zoomDialog = document.getElementById('qr-zoom');
    zoomDialog.addEventListener('click', () => zoomDialog.close());
    zoomDialog.addEventListener('close', () => { zoomSlot = null; });
});
