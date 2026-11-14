const SLOT_COUNT = 6;

const scannerTranslate = typeof translate === 'function' ? translate : require('./i18n.js').translate;

function createScanner(deps) {
    // deps = { parseFriendCodeFromQR, showToast, generateAllQRCodes, getDialog, getElement,
    //          querySelectorAll, Html5Qrcode, vibrate?, t? }
    const t = deps.t || ((key, params) => scannerTranslate('en', key, params));
    let scannerInstance = null;
    // Bumped on every camera start and stop. A start that resolves after the
    // generation has moved on (the scanner was closed or restarted while the
    // camera was still starting) stops itself instead of running unseen.
    let cameraGeneration = 0;
    let currentScanIndex = 0;
    let lastCameraError = null;
    let lastScannedCode = null;
    let finished = false;
    const scannedCodes = new Array(SLOT_COUNT).fill(null);
    let existingCodes = new Array(SLOT_COUNT).fill('');

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

    function showCameraDeniedState(errorText = t('scanner.permissionDenied')) {
        lastCameraError = errorText;
        deps.getElement('scanner-status').textContent = lastCameraError;
        deps.getElement('scanner-retry').hidden = false;
        setScannerUnavailable(true);
    }

    function slotCode(index) {
        return scannedCodes[index] || existingCodes[index] || null;
    }

    // First slot at or after `from` (wrapping) with no saved or scanned code, or -1.
    function firstEmptySlot(from = 0) {
        for (let offset = 0; offset < SLOT_COUNT; offset++) {
            const index = (from + offset) % SLOT_COUNT;
            if (!slotCode(index)) return index;
        }
        return -1;
    }

    function updateScannerUI() {
        if (currentScanIndex >= SLOT_COUNT) return;
        const replaced = slotCode(currentScanIndex);
        const titleParams = { slot: currentScanIndex + 1, total: SLOT_COUNT, code: replaced };
        deps.getElement('scanner-title').textContent =
            t(replaced ? 'scanner.titleReplace' : 'scanner.title', titleParams);

        if (lastCameraError) {
            deps.getElement('scanner-status').textContent = lastCameraError;
            deps.getElement('scanner-retry').hidden = false;
            setScannerUnavailable(true);
            return;
        }

        deps.getElement('scanner-status').textContent = t('scanner.point');
        deps.getElement('scanner-retry').hidden = true;
        setScannerUnavailable(false);
    }

    function getCameraErrorText(err) {
        const name = err && err.name ? err.name : '';
        const message = err && err.message ? err.message : '';
        const denied = /permission|denied|notallowed/i.test(name + ' ' + message);
        return denied
            ? t('scanner.permissionDenied')
            : t('scanner.cameraError', { message: message || t('scanner.unknownError') });
    }

    // Stop and clear one instance without ever throwing. Html5Qrcode.stop()
    // throws synchronously when the camera is not scanning yet (for example
    // while the permission prompt is open); the generation check in
    // startCamera() stops such a camera once it finishes starting.
    function releaseInstance(instance) {
        let stopping;
        try {
            stopping = Promise.resolve(instance.stop());
        } catch (_e) {
            return Promise.resolve();
        }
        return stopping
            .then(() => {
                try { instance.clear(); } catch (_e) { /* ignore cleanup errors */ }
            })
            .catch(() => { /* already stopped */ });
    }

    function stopCamera() {
        cameraGeneration++;
        const instance = scannerInstance;
        scannerInstance = null;
        return instance ? releaseInstance(instance) : Promise.resolve();
    }

    function startCamera() {
        // Release any existing instance first; Html5Qrcode cannot reinitialize
        // a target that was not cleared.
        stopCamera();
        const generation = cameraGeneration;
        const instance = new deps.Html5Qrcode('scanner-viewfinder');
        scannerInstance = instance;
        return instance.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
            onScanSuccess,
            () => {}
        ).then(() => {
            if (generation !== cameraGeneration) {
                releaseInstance(instance);
                return null;
            }
            clearCameraErrorState();
            updateScannerUI();
            return instance;
        }).catch(err => {
            if (generation === cameraGeneration) {
                showCameraDeniedState(getCameraErrorText(err));
                scannerInstance = null;
            }
            try {
                instance.clear();
            } catch (_e) {
                // ignore cleanup errors
            }
            return Promise.reject(err);
        });
    }

    function openScanner() {
        finished = false;
        lastScannedCode = null;
        scannedCodes.fill(null);
        existingCodes = Array.from(deps.querySelectorAll('#friend-code-form input'))
            .map(input => input.value.trim().toLowerCase());
        while (existingCodes.length < SLOT_COUNT) existingCodes.push('');
        const firstEmpty = firstEmptySlot();
        currentScanIndex = firstEmpty === -1 ? 0 : firstEmpty;
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
            deps.getElement('scanner-status').textContent = t('scanner.invalid');
            return;
        }

        // The camera keeps seeing the code it just read; ignore those repeats
        // so the success message stays visible.
        if (friendCode === lastScannedCode) return;

        if (scannedCodes.includes(friendCode)) {
            deps.getElement('scanner-status').textContent = t('scanner.alreadyScanned');
            return;
        }

        if (existingCodes.includes(friendCode)) {
            deps.getElement('scanner-status').textContent = t('scanner.alreadyInList');
            return;
        }

        scannedCodes[currentScanIndex] = friendCode;
        lastScannedCode = friendCode;
        if (deps.vibrate) deps.vibrate(50);

        const nextEmpty = firstEmptySlot(currentScanIndex + 1);
        if (nextEmpty === -1) {
            currentScanIndex = SLOT_COUNT;
            closeScanner();
            return;
        }

        currentScanIndex = nextEmpty;
        updateScannerUI();
        const count = scannedCodes.filter(Boolean).length;
        deps.getElement('scanner-status').textContent = t('scanner.scannedNext', { count });
    }

    // Apply scanned codes to the form exactly once per session, however the
    // dialog ends up closed (completion, X button, or Escape).
    function finish() {
        if (finished) return;
        finished = true;
        const count = scannedCodes.filter(Boolean).length;
        if (count === 0) return;
        applyScanResults();
        if (firstEmptySlot() !== -1) {
            deps.showToast(t('scanner.imported', { count }));
        } else if (count === SLOT_COUNT) {
            deps.showToast(t('scanner.allScanned', { total: SLOT_COUNT }));
        } else {
            deps.showToast(t('scanner.importedFull', { count }));
        }
    }

    function closeScanner() {
        stopCamera();
        clearCameraErrorState();
        deps.getDialog().close();
        finish();
    }

    // Handler for the dialog's native `close` event (Escape key).
    function handleDialogClose() {
        stopCamera();
        finish();
    }

    function applyScanResults() {
        const inputs = deps.querySelectorAll('#friend-code-form input');
        scannedCodes.forEach((code, idx) => {
            if (code && inputs[idx]) inputs[idx].value = code;
        });
        deps.generateAllQRCodes();
    }

    function nextSlot() {
        currentScanIndex = (currentScanIndex + 1) % SLOT_COUNT;
        updateScannerUI();
    }

    function prevSlot() {
        currentScanIndex = (currentScanIndex - 1 + SLOT_COUNT) % SLOT_COUNT;
        updateScannerUI();
    }

    function getState() {
        return { currentScanIndex, scannedCodes };
    }

    function getScannerInstance() {
        return scannerInstance;
    }

    return {
        openScanner,
        closeScanner,
        handleDialogClose,
        startCamera,
        stopCamera,
        onScanSuccess,
        applyScanResults,
        updateScannerUI,
        nextSlot,
        prevSlot,
        getState,
        getScannerInstance
    };
}

if (typeof module !== 'undefined') module.exports = { createScanner };
