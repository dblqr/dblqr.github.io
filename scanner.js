function createScanner(deps) {
    // deps = { parseFriendCodeFromQR, showToast, generateAllQRCodes, getDialog, getElement, querySelectorAll, Html5Qrcode }
    let scannerInstance = null;
    let currentScanIndex = 0;
    const scannedCodes = [null, null, null, null, null, null];

    function updateScannerUI() {
        deps.getElement('scanner-title').textContent =
            `Scan Friend Code ${currentScanIndex + 1} of 6`;
        deps.getElement('scanner-status').textContent =
            'Point your camera at a QR code';
    }

    function startCamera() {
        scannerInstance = new deps.Html5Qrcode('scanner-viewfinder');
        scannerInstance.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
            onScanSuccess,
            () => {}
        ).catch(err => {
            deps.getElement('scanner-status').textContent =
                'Camera error: ' + err.message;
        });
    }

    function openScanner() {
        currentScanIndex = 0;
        scannedCodes.fill(null);
        deps.getDialog().showModal();
        updateScannerUI();
        startCamera();
    }

    function onScanSuccess(decodedText) {
        const friendCode = deps.parseFriendCodeFromQR(decodedText);

        if (!friendCode) {
            deps.getElement('scanner-status').textContent =
                'Invalid QR code format. Try another.';
            return;
        }

        if (scannedCodes.includes(friendCode)) {
            deps.getElement('scanner-status').textContent =
                'Already scanned this code. Try a different one.';
            return;
        }

        scannedCodes[currentScanIndex] = friendCode;
        currentScanIndex++;

        if (currentScanIndex >= 6) {
            closeScanner();
            applyScanResults();
            deps.showToast('All 6 friend codes scanned!');
        } else {
            updateScannerUI();
            deps.getElement('scanner-status').textContent =
                `Code ${currentScanIndex} scanned! Point at the next QR code.`;
        }
    }

    function closeScanner() {
        if (scannerInstance) {
            scannerInstance.stop().then(() => {
                scannerInstance.clear();
                scannerInstance = null;
            }).catch(() => {
                scannerInstance = null;
            });
        }
        deps.getDialog().close();
    }

    function applyScanResults() {
        const inputs = deps.querySelectorAll('#friend-code-form input');
        scannedCodes.forEach((code, idx) => {
            if (code && inputs[idx]) inputs[idx].value = code;
        });
        deps.generateAllQRCodes();
    }

    function nextSlot() {
        currentScanIndex = (currentScanIndex + 1) % 6;
        updateScannerUI();
    }

    function prevSlot() {
        currentScanIndex = (currentScanIndex - 1 + 6) % 6;
        updateScannerUI();
    }

    function getState() {
        return { currentScanIndex, scannedCodes };
    }

    function getScannerInstance() {
        return scannerInstance;
    }

    function setScannerInstance(instance) {
        scannerInstance = instance;
    }

    return {
        openScanner,
        closeScanner,
        startCamera,
        onScanSuccess,
        applyScanResults,
        updateScannerUI,
        nextSlot,
        prevSlot,
        getState,
        getScannerInstance,
        setScannerInstance
    };
}

if (typeof module !== 'undefined') module.exports = { createScanner };
