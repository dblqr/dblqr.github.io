function createScanner(deps) {
    // deps = { parseFriendCodeFromQR, showToast, generateAllQRCodes, getDialog, getElement, querySelectorAll, Html5Qrcode }
    const CAMERA_PERMISSION_DENIED_KEY = 'cameraPermissionDenied';
    let scannerInstance = null;
    let currentScanIndex = 0;
    const scannedCodes = [null, null, null, null, null, null];
    let permissionDenied = false;

    function getCameraPermissionState() {
        const state = sessionStorage.getItem(CAMERA_PERMISSION_DENIED_KEY);
        return state === 'true';
    }

    function setCameraPermissionState(denied) {
        permissionDenied = denied;
        console.debug(`[Camera Scanner] Permission state changed: ${denied ? 'DENIED' : 'ALLOWED'}`);
        if (denied) {
            sessionStorage.setItem(CAMERA_PERMISSION_DENIED_KEY, 'true');
        } else {
            sessionStorage.removeItem(CAMERA_PERMISSION_DENIED_KEY);
        }
    }

    function showRetryButton() {
        const retryBtn = deps.getElement('scanner-retry-btn');
        if (retryBtn) retryBtn.style.display = 'block';
    }

    function hideRetryButton() {
        const retryBtn = deps.getElement('scanner-retry-btn');
        if (retryBtn) retryBtn.style.display = 'none';
    }

    function updateScannerUI() {
        deps.getElement('scanner-title').textContent =
            `Scan Friend Code ${currentScanIndex + 1} of 6`;
        const statusEl = deps.getElement('scanner-status');
        if (permissionDenied) {
            statusEl.textContent =
                'Camera access denied. Please use the upload option or try again.';
            showRetryButton();
        } else {
            statusEl.textContent = 'Point your camera at a QR code';
            hideRetryButton();
        }
    }

    function isPermissionError(errorMsg) {
        const msg = (errorMsg || '').toLowerCase();
        return ['permission', 'notallowed', 'not allowed', 'notfound']
            .some(keyword => msg.includes(keyword));
    }

    /**
     * State diagram:
     * Initial → (success) → camera running
     * Initial → (denied) → permissionDenied=true → show retry
     * Retry → clear state → try again
     */
    function startCamera() {
        // Check if permission was already denied in this session
        if (getCameraPermissionState()) {
            permissionDenied = true;
            updateScannerUI();
            return;
        }

        scannerInstance = new deps.Html5Qrcode('scanner-viewfinder');
        scannerInstance.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
            onScanSuccess,
            () => {}
        ).catch(err => {
            const errorMsg = typeof err === 'string' ? err : (err?.message || err?.name || String(err));
            // Check if error is related to permission/NotAllowedError
            if (isPermissionError(errorMsg)) {
                setCameraPermissionState(true);
                permissionDenied = true;
                updateScannerUI();
            } else {
                deps.getElement('scanner-status').textContent =
                    'Camera error: ' + err.message;
            }
        });
    }

    function retryCamera() {
        permissionDenied = false;
        setCameraPermissionState(false);
        console.debug('[Camera Scanner] User initiated permission retry');
        startCamera();
    }

    function openScanner() {
        currentScanIndex = 0;
        scannedCodes.fill(null);
        permissionDenied = getCameraPermissionState();
        deps.getDialog().showModal();
        updateScannerUI();
        if (!permissionDenied) {
            startCamera();
        }
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
            try {
                scannerInstance.stop().then(() => {
                    scannerInstance.clear();
                    scannerInstance = null;
                }).catch(() => {
                    scannerInstance = null;
                });
            } catch (err) {
                // stop() throws synchronously if not running
                try {
                    scannerInstance.clear();
                } catch (e) {
                    // ignore
                }
                scannerInstance = null;
            }
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
        setScannerInstance,
        retryCamera,
        getCameraPermissionState,
        setCameraPermissionState
    };
}

if (typeof module !== 'undefined') module.exports = { createScanner };
