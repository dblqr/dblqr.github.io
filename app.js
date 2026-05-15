let intervalId = null;

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function getFriendCodes() {
    return Array.from(document.querySelectorAll('#friend-code-form input'))
        .map(input => input.value.trim().toLowerCase());
}

function saveFriendCodes(codes) {
    localStorage.setItem('friendCodes', JSON.stringify(codes));
}

function loadFriendCodes() {
    return JSON.parse(localStorage.getItem('friendCodes') || '[]');
}

function generateAllQRCodes() {
    const displayContainer = document.querySelector('.qr-display');
    displayContainer.innerHTML = '';
    const codes = getFriendCodes();
    saveFriendCodes(codes);

    const hasAnyCodes = codes.some(c => c.length > 0);
    const emptyState = document.getElementById('empty-state');
    if (!hasAnyCodes) {
        emptyState.hidden = false;
        return;
    }
    emptyState.hidden = true;

    codes.forEach((code, index) => {
        const qrBlock = document.createElement('div');
        const textContainer = document.createElement('pre');
        const qrContainer = document.createElement('div');
        const downloadButton = document.createElement('button');
        downloadButton.className = 'download-button';
        downloadButton.textContent = 'Download QR Code';

        const qrData = DblTimestampHelper.buildQrData(code);
        textContainer.textContent = `Friend Code ${index + 1}: ${code}`;

        new QRCode(qrContainer, {
            text: qrData,
            width: 180,
            height: 180,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        const checkCanvasReady = () => {
            const canvas = qrContainer.querySelector('canvas');
            if (canvas) {
                const imgData = canvas.toDataURL("image/png");
                downloadButton.onclick = () => {
                    const link = document.createElement('a');
                    link.href = imgData;
                    link.download = `qr-${index + 1}.png`;
                    link.click();
                    showToast('Downloaded!');
                };
            } else {
                if (checkCanvasReady.attempts < 10) {
                    checkCanvasReady.attempts++;
                    setTimeout(checkCanvasReady, 100);
                }
            }
        };
        checkCanvasReady.attempts = 0;
        checkCanvasReady();

        qrBlock.appendChild(textContainer);
        qrBlock.appendChild(qrContainer);
        qrBlock.appendChild(downloadButton);
        displayContainer.appendChild(qrBlock);

        requestAnimationFrame(() => qrBlock.classList.add('visible'));
    });
}

function startAutoRefresh() {
    clearInterval(intervalId);
    intervalId = setInterval(generateAllQRCodes, 10000);
}

function setupFriendForm() {
    const form = document.getElementById('friend-code-form');
    const saved = loadFriendCodes();
    for (let i = 0; i < 3; i++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = `Friend Code ${i + 1}`;
        input.maxLength = 8;
        input.pattern = '[a-zA-Z0-9]{8}';
        input.title = '8-character alphanumeric code';
        if (saved[i]) input.value = saved[i];
        form.appendChild(input);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupFriendForm();
    document.getElementById('friend-code-form').addEventListener('submit', e => e.preventDefault());
    generateAllQRCodes();
    startAutoRefresh();

    const scanner = createScanner({
        parseFriendCodeFromQR: parseFriendCodeFromQR,
        showToast: showToast,
        generateAllQRCodes: generateAllQRCodes,
        getDialog: () => document.getElementById('scanner-dialog'),
        getElement: (id) => document.getElementById(id),
        querySelectorAll: (sel) => document.querySelectorAll(sel),
        Html5Qrcode: Html5Qrcode
    });

    document.getElementById('friend-code-form').addEventListener('input', () => {
        generateAllQRCodes();
        startAutoRefresh();
    });

    document.getElementById('manual-refresh').addEventListener('click', () => {
        generateAllQRCodes();
        startAutoRefresh();
        showToast('QRs refreshed!');
    });

    document.getElementById('export-codes').addEventListener('click', () => {
        const codes = getFriendCodes().filter(c => c.length > 0);
        if (codes.length === 0) {
            showToast('No friend codes to export');
            return;
        }
        const blob = new Blob([codes.join('\n')], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'friend-codes.txt';
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Friend codes exported!');
    });

    document.getElementById('upload-codes').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        file.text().then(text => {
            const parsed = text.split(/[\s,]+/)
                .map(c => c.trim().toLowerCase())
                .filter(c => /^[a-z0-9]{8}$/.test(c))
                .slice(0, 3);
            const inputs = document.querySelectorAll('#friend-code-form input');
            parsed.forEach((code, idx) => {
                if (inputs[idx]) inputs[idx].value = code;
            });
            generateAllQRCodes();
            showToast(`${parsed.length} code(s) uploaded!`);
        });
        e.target.value = '';
    });

    document.getElementById('clear-codes').addEventListener('click', () => {
        const inputs = document.querySelectorAll('#friend-code-form input');
        inputs.forEach(input => input.value = '');
        localStorage.removeItem('friendCodes');
        document.querySelector('.qr-display').innerHTML = '';
        document.getElementById('empty-state').hidden = false;
        showToast('Friend codes cleared!');
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

        const currentInstance = scanner.getScannerInstance();
        const stopCamera = currentInstance
            ? currentInstance.stop().then(() => { currentInstance.clear(); scanner.setScannerInstance(null); }).catch(() => { scanner.setScannerInstance(null); })
            : Promise.resolve();

        stopCamera.then(() => {
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
            if (state.currentScanIndex < 3 && dialog.open) {
                scanner.startCamera();
            }
        });
    });

    document.getElementById('scanner-close').addEventListener('click', () => {
        scanner.closeScanner();
    });

    document.getElementById('scanner-dialog').addEventListener('close', () => {
        const currentInstance = scanner.getScannerInstance();
        if (currentInstance) {
            currentInstance.stop().then(() => {
                currentInstance.clear();
                scanner.setScannerInstance(null);
            }).catch(() => {
                scanner.setScannerInstance(null);
            });
        }
        const state = scanner.getState();
        if (state.scannedCodes.some(c => c !== null)) {
            scanner.applyScanResults();
            showToast(`${state.scannedCodes.filter(c => c !== null).length} code(s) imported`);
        }
    });
});
