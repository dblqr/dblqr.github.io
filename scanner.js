function createScanner(deps) {
    // deps = { parseFriendCodeFromQR, showToast, generateAllQRCodes, getDialog, getElement, querySelectorAll, Html5Qrcode }
    let scannerInstance = null;
    let currentScanIndex = 0;
    let lastCameraError = null;
    const scannedCodes = [null, null, null, null, null, null];

    function setScannerUnavailable(isUnavailable) {
        const viewfinder = deps.getElement('scanner-viewfinder');
        if (isUnavailable) {
            viewfinder.classList.add('scanner-disabled');
        } else {
            viewfinder.classList.remove('scanner-disabled');
        }
    }

    function clearCameraErrorState() {
        lastCameraError = null;
        deps.getElement('scanner-retry').hidden = true;
        setScannerUnavailable(false);
    }

    function showCameraDeniedState(errorText = 'Camera error: permissions denied') {
        lastCameraError = errorText;
        deps.getElement('scanner-status').textContent = lastCameraError;
        deps.getElement('scanner-retry').hidden = false;
        setScannerUnavailable(true);
    }

    function updateScannerUI() {
        deps.getElement('scanner-title').textContent =
            `Scan Friend Code ${currentScanIndex + 1} of 6`;

        if (lastCameraError) {
            deps.getElement('scanner-status').textContent = lastCameraError;
            deps.getElement('scanner-retry').hidden = false;
            setScannerUnavailable(true);
            return;
        }

        deps.getElement('scanner-status').textContent =
            'Point your camera at a QR code';
        deps.getElement('scanner-retry').hidden = true;
        setScannerUnavailable(false);
    }

    function getCameraErrorText(err) {
        const name = err && err.name ? err.name : '';
        const message = err && err.message ? err.message : '';
        const denied = /permission|denied|notallowed/i.test(name + ' ' + message);
        return denied
            ? 'Camera error: permissions denied'
            : `Camera error: ${message || 'unknown error'}`;
    }

    function startCamera() {
        // Clean up any existing instance before creating a new one
        // This is critical for proper Html5Qrcode reinitialization on retry
        if (scannerInstance) {
            try {
                scannerInstance.stop();
                scannerInstance.clear();
            } catch (_e) {
                // ignore cleanup errors
            }
            scannerInstance = null;
        }

        scannerInstance = new deps.Html5Qrcode('scanner-viewfinder');
        return scannerInstance.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
            onScanSuccess,
            () => {}
        ).then(() => {
            clearCameraErrorState();
            updateScannerUI();
            return scannerInstance;
        }).catch(err => {
            showCameraDeniedState(getCameraErrorText(err));
            try {
                scannerInstance.clear();
            } catch (_e) {
                // ignore cleanup errors
            }
            scannerInstance = null;
            return Promise.reject(err);
        });
    }

    function openScanner() {
        currentScanIndex = 0;
        scannedCodes.fill(null);
        clearCameraErrorState();
        deps.getDialog().showModal();
        updateScannerUI();
        startCamera().catch(() => {
            // Camera failure is already shown in UI.
        });
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
        clearCameraErrorState();
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
