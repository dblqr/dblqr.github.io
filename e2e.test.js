import { test, expect } from '@playwright/test';

/**
 * Fill the nth friend-code input (0-based index) with the given code.
 */
function fillCode(page, index, code) {
  return page.locator('#friend-code-form input').nth(index).fill(code);
}

/**
 * Replace the CDN html5-qrcode script with a mock implementation.
 * The real <script> tag carries an SRI hash, which the browser would use to
 * reject the mock body, so the integrity attribute is stripped from the
 * served HTML for this context only.
 */
async function mockHtml5Qrcode(context, body) {
  await context.route('**/*html5-qrcode.min.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body,
  }));
  await context.route(url => url.pathname === '/' || url.pathname.endsWith('/index.html'), async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      /(<script src="[^"]*html5-qrcode\.min\.js")\s+integrity="[^"]*"/,
      '$1',
    );
    await route.fulfill({ response, body: html });
  });
}

/**
 * Dispatch a paste event carrying `text` into the nth friend-code input.
 */
function pasteIntoCode(page, index, text) {
  return page.locator('#friend-code-form input').nth(index).evaluate((input, value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

/** Upload a .txt file through the "Upload Friend Codes" button. */
async function uploadCodesFile(page, content) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('#upload-codes').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: 'codes.txt', mimeType: 'text/plain', buffer: Buffer.from(content) });
}

/** Current QR payload of the nth QR card. */
function qrDataOf(page, index = 0) {
  return page.locator('.qr-display > div').nth(index).getAttribute('data-qr-data');
}

/**
 * Mock camera whose start() stays pending until window.resolveStart() is
 * called, and whose stop() throws synchronously unless the camera is
 * scanning, matching the real html5-qrcode behaviour.
 */
const PENDING_CAMERA_MOCK = `
  window.cameraScanning = false;
  window.stopCalls = 0;
  window.Html5Qrcode = class {
    constructor(target) { this.target = target; this.scanning = false; }
    start() {
      return new Promise(resolve => {
        window.resolveStart = () => { this.scanning = true; window.cameraScanning = true; resolve(); };
      });
    }
    stop() {
      if (!this.scanning) throw 'Cannot stop, scanner is not running or paused.';
      this.scanning = false;
      window.cameraScanning = false;
      window.stopCalls += 1;
      return Promise.resolve();
    }
    clear() {}
  };
`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    // Pre-answer the analytics prompt so the banner does not cover controls.
    localStorage.setItem('analyticsConsent', 'denied');
  });
  await page.reload();
  await page.locator('#friend-code-form input').first().waitFor();
});

// ---------------------------------------------------------------------------
// 1. Initial page load
// ---------------------------------------------------------------------------
test.describe('Initial page load', () => {
  test('form has 6 empty inputs', async ({ page }) => {
    const inputs = page.locator('#friend-code-form input');
    await expect(inputs).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      await expect(inputs.nth(i)).toHaveValue('');
    }
  });

  test('empty state is visible and no QR blocks', async ({ page }) => {
    const emptyState = page.locator('#empty-state');
    await expect(emptyState).toBeVisible();
    const qrBlocks = page.locator('.qr-display > div');
    await expect(qrBlocks).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 2. QR code generation
// ---------------------------------------------------------------------------
test.describe('QR code generation', () => {
  test('valid code generates a QR block with canvas and correct label', async ({ page }) => {
    await fillCode(page, 0, 'abcd1234');
    const block = page.locator('.qr-display > div.visible');
    await expect(block.first()).toBeVisible();
    const canvas = block.first().locator('canvas');
    await expect(canvas).toBeAttached();
    const label = block.first().locator('pre');
    await expect(label).toHaveText('Friend Code 1: abcd1234');
  });

  test('empty state hides when a code is entered', async ({ page }) => {
    await fillCode(page, 0, 'abcd1234');
    await page.locator('.qr-display > div.visible').first().waitFor();
    await expect(page.locator('#empty-state')).toBeHidden();
  });

  test('multiple codes produce multiple QR blocks', async ({ page }) => {
    await fillCode(page, 0, 'aaaaaaaa');
    await fillCode(page, 1, 'bbbbbbbb');
    await fillCode(page, 2, 'cccccccc');
    await fillCode(page, 3, 'dddddddd');
    await fillCode(page, 4, 'eeeeeeee');
    await fillCode(page, 5, 'ffffffff');
    const blocks = page.locator('.qr-display > div.visible');
    await expect(blocks).toHaveCount(6);
    await expect(blocks.nth(0).locator('pre')).toHaveText('Friend Code 1: aaaaaaaa');
    await expect(blocks.nth(1).locator('pre')).toHaveText('Friend Code 2: bbbbbbbb');
    await expect(blocks.nth(2).locator('pre')).toHaveText('Friend Code 3: cccccccc');
    await expect(blocks.nth(3).locator('pre')).toHaveText('Friend Code 4: dddddddd');
    await expect(blocks.nth(4).locator('pre')).toHaveText('Friend Code 5: eeeeeeee');
    await expect(blocks.nth(5).locator('pre')).toHaveText('Friend Code 6: ffffffff');
  });
});

// ---------------------------------------------------------------------------
// 3. localStorage persistence
// ---------------------------------------------------------------------------
test.describe('localStorage persistence', () => {
  test('codes survive a page reload', async ({ page }) => {
    await fillCode(page, 0, 'persist1');
    await fillCode(page, 1, 'persist2');
    await page.locator('.qr-display > div.visible').first().waitFor();

    await page.reload();
    await page.locator('#friend-code-form input').first().waitFor();

    const inputs = page.locator('#friend-code-form input');
    await expect(inputs.nth(0)).toHaveValue('persist1');
    await expect(inputs.nth(1)).toHaveValue('persist2');
  });

  test('localStorage contains correct JSON', async ({ page }) => {
    await fillCode(page, 0, 'store123');
    await page.locator('.qr-display > div.visible').first().waitFor();

    const stored = await page.evaluate(() => localStorage.getItem('friendCodes'));
    const parsed = JSON.parse(stored);
    expect(parsed[0]).toBe('store123');
    expect(parsed).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// 4. Export
// ---------------------------------------------------------------------------
test.describe('Export', () => {
  test('downloads a .txt file with correct content', async ({ page }) => {
    await fillCode(page, 0, 'export01');
    await fillCode(page, 1, 'export02');
    await page.locator('.qr-display > div.visible').first().waitFor();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-codes').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('friend-codes.txt');
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const content = Buffer.concat(chunks).toString('utf-8');
    expect(content).toBe('export01\nexport02');
  });

  test('shows toast when no codes to export', async ({ page }) => {
    await page.locator('#export-codes').click();
    const toast = page.locator('#toast');
    await expect(toast).toHaveClass(/show/);
    await expect(toast).toHaveText('No friend codes to export');
  });
});

// ---------------------------------------------------------------------------
// 5. Upload .txt
// ---------------------------------------------------------------------------
test.describe('Upload .txt', () => {
  test('populates form and generates QR codes', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#upload-codes').click();
    const fileChooser = await fileChooserPromise;

    const content = 'upload01\nupload02\nupload03\nupload04\nupload05\nupload06\nupload07';
    await fileChooser.setFiles({
      name: 'codes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(content),
    });

    const blocks = page.locator('.qr-display > div.visible');
    await expect(blocks).toHaveCount(6);

    const inputs = page.locator('#friend-code-form input');
    await expect(inputs.nth(0)).toHaveValue('upload01');
    await expect(inputs.nth(1)).toHaveValue('upload02');
    await expect(inputs.nth(2)).toHaveValue('upload03');
    await expect(inputs.nth(3)).toHaveValue('upload04');
    await expect(inputs.nth(4)).toHaveValue('upload05');
    await expect(inputs.nth(5)).toHaveValue('upload06');
  });

  test('filters out invalid codes', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#upload-codes').click();
    const fileChooser = await fileChooserPromise;

    // "short" is too short, "toolongcode" is too long, "bad!!bad" has special chars
    const content = 'short\nvalid123\ntoolongcode\nbad!!bad\nvalid456';
    await fileChooser.setFiles({
      name: 'codes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(content),
    });

    const inputs = page.locator('#friend-code-form input');
    await expect(inputs.nth(0)).toHaveValue('valid123');
    await expect(inputs.nth(1)).toHaveValue('valid456');
  });
});

// ---------------------------------------------------------------------------
// 6. Clear
// ---------------------------------------------------------------------------
test.describe('Clear', () => {
  test('empties everything, shows empty state and toast', async ({ page }) => {
    await fillCode(page, 0, 'clear001');
    await page.locator('.qr-display > div.visible').first().waitFor();

    await page.locator('#clear-codes').click();

    const inputs = page.locator('#friend-code-form input');
    for (let i = 0; i < 6; i++) {
      await expect(inputs.nth(i)).toHaveValue('');
    }

    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('.qr-display > div')).toHaveCount(0);
    await expect(page.locator('#toast')).toHaveClass(/show/);
    await expect(page.locator('#toast')).toContainText('Friend codes cleared!');

    const stored = await page.evaluate(() => localStorage.getItem('friendCodes'));
    expect(stored).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Manual refresh
// ---------------------------------------------------------------------------
test.describe('Manual refresh', () => {
  test('shows toast on click', async ({ page }) => {
    await page.locator('#manual-refresh').click();
    const toast = page.locator('#toast');
    await expect(toast).toHaveClass(/show/);
    await expect(toast).toHaveText('QRs refreshed!');
  });
});

// ---------------------------------------------------------------------------
// 8. Toast
// ---------------------------------------------------------------------------
test.describe('Toast', () => {
  test('appears with show class', async ({ page }) => {
    await page.locator('#manual-refresh').click();
    const toast = page.locator('#toast');
    await expect(toast).toHaveClass(/show/);
  });

  test('auto-dismisses after ~2 seconds', async ({ page }) => {
    await page.locator('#manual-refresh').click();
    const toast = page.locator('#toast');
    await expect(toast).toHaveClass(/show/);
    // The toast removes the show class after 2000ms; allow a small buffer.
    await expect(toast).not.toHaveClass(/show/, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// 9. Scanner dialog
// ---------------------------------------------------------------------------
test.describe('Scanner dialog', () => {
  test('opens on import button click', async ({ page }) => {
    await page.locator('#import-codes').click();
    const isOpen = await page.evaluate(
      () => document.getElementById('scanner-dialog').open,
    );
    expect(isOpen).toBe(true);
  });

  test('closes via Escape key', async ({ page }) => {
    await page.locator('#import-codes').click();
    await expect(page.locator('#scanner-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#scanner-dialog')).toBeHidden({ timeout: 5000 });
  });

  test('denied camera permission shows friendly message and retry button', async ({ page }) => {
    const context = await page.context().browser().newContext();
    await mockHtml5Qrcode(context, `
        window.startAttempts = 0;
        window.scanCalls = 0;
        window.targetState = {};
        window.Html5Qrcode = class {
          constructor(target) {
            this.target = target;
          }
          start() {
            window.startAttempts += 1;
            if (!window.targetState[this.target]) {
              window.targetState[this.target] = false;
            }
            return Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
          }
          stop() { return Promise.resolve(); }
          clear() { window.targetState[this.target] = true; }
          scanFileV2() { window.scanCalls += 1; return Promise.resolve({ decodedText: '4,abcd1234CMBSBNCPDQE' }); }
        };
      `);
    const customPage = await context.newPage();
    await customPage.goto('/');

    await customPage.locator('#import-codes').click();
    await expect(customPage.locator('#scanner-status')).toHaveText('Camera error: permissions denied');
    await expect(customPage.locator('#scanner-retry')).toBeVisible();
    await expect(customPage.locator('#scanner-viewfinder')).toHaveClass(/scanner-disabled/);

    await customPage.locator('#scanner-prev').click();
    await expect(customPage.locator('#scanner-status')).toHaveText('Camera error: permissions denied');
    await customPage.locator('#scanner-next').click();
    await expect(customPage.locator('#scanner-status')).toHaveText('Camera error: permissions denied');

    await customPage.locator('#scanner-close').click();
    await expect(customPage.locator('#scanner-dialog')).toBeHidden({ timeout: 5000 });

    const startAttempts = await customPage.evaluate(() => window.startAttempts);
    expect(startAttempts).toBe(1);

    await context.close();
  });

  test('retry button restores camera view when permissions are re-enabled', async ({ page }) => {
    const context = await page.context().browser().newContext();
    await mockHtml5Qrcode(context, `
        window.startAttempts = 0;
        window.targetState = {};
        window.Html5Qrcode = class {
          constructor(target) {
            this.target = target;
          }
          start() {
            window.startAttempts += 1;
            if (!window.targetState[this.target]) {
              window.targetState[this.target] = false;
            }
            if (window.startAttempts > 1 && !window.targetState[this.target]) {
              return Promise.reject(new Error('Cannot reinitialize without clearing previous instance'));
            }
            window.targetState[this.target] = false;
            return window.startAttempts === 1
              ? Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }))
              : Promise.resolve();
          }
          stop() { return Promise.resolve(); }
          clear() { window.targetState[this.target] = true; }
        };
      `);
    const customPage = await context.newPage();
    await customPage.goto('/');

    await customPage.locator('#import-codes').click();
    await expect(customPage.locator('#scanner-status')).toHaveText('Camera error: permissions denied');
    await customPage.locator('#scanner-retry').click();
    await expect(customPage.locator('#scanner-retry')).toBeHidden();
    await expect(customPage.locator('#scanner-status')).toHaveText('Point your camera at a QR code');
    await expect(customPage.locator('#scanner-viewfinder')).not.toHaveClass(/scanner-disabled/);

    await context.close();
  });

  test('image upload scan does not restart camera after permission denied', async ({ page }) => {
    const context = await page.context().browser().newContext();
    await mockHtml5Qrcode(context, `
        window.startAttempts = 0;
        window.scanCalls = 0;
        window.targetState = {};
        window.Html5Qrcode = class {
          constructor(target) {
            this.target = target;
          }
          start() {
            window.startAttempts += 1;
            if (!window.targetState[this.target]) {
              window.targetState[this.target] = false;
            }
            return Promise.reject(new Error('Permission denied'));
          }
          stop() { return Promise.resolve(); }
          clear() { window.targetState[this.target] = true; }
          scanFileV2() {
            window.scanCalls += 1;
            const decodedText = window.scanCalls === 1
              ? '4,abcd1234CMBSBNCPDQE'
              : '4,ef56gh78CMBSBNCPDQE';
            return Promise.resolve({ decodedText });
          }
        };
      `);
    const customPage = await context.newPage();
    await customPage.goto('/');

    await customPage.locator('#import-codes').click();
    await expect(customPage.locator('#scanner-status')).toHaveText(/Camera error/i);

    for (let i = 0; i < 2; i += 1) {
      const fileChooserPromise = customPage.waitForEvent('filechooser');
      await customPage.locator('#scanner-upload-btn').click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: `qr-${i + 1}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      });
      await expect(customPage.locator('#scanner-status')).toHaveText(/scanned/i);
    }

    await customPage.locator('#scanner-close').click();
    await expect(customPage.locator('#scanner-dialog')).toBeHidden({ timeout: 5000 });

    const inputs = customPage.locator('#friend-code-form input');
    await expect(inputs.nth(0)).toHaveValue('abcd1234');
    await expect(inputs.nth(1)).toHaveValue('ef56gh78');

    const startAttempts = await customPage.evaluate(() => window.startAttempts);
    const scanCalls = await customPage.evaluate(() => window.scanCalls);
    expect(startAttempts).toBe(1);
    expect(scanCalls).toBe(2);

    await context.close();
  });

  test('prev and next buttons change the slot', async ({ page }) => {
    await page.locator('#import-codes').click();
    await expect(page.locator('#scanner-title')).toHaveText('Scan Friend Code 1 of 6');
    await page.locator('#scanner-next').click();
    await expect(page.locator('#scanner-title')).toHaveText('Scan Friend Code 2 of 6');
    await page.locator('#scanner-prev').click();
    await expect(page.locator('#scanner-title')).toHaveText('Scan Friend Code 1 of 6');
    await page.locator('#scanner-prev').click();
    await expect(page.locator('#scanner-title')).toHaveText('Scan Friend Code 6 of 6');
  });
});

// ---------------------------------------------------------------------------
// 10. Scanner robustness while the camera is starting (#1, #4)
// ---------------------------------------------------------------------------
test.describe('Scanner while camera is starting', () => {
  test('X button closes the dialog while the camera is still starting', async ({ page }) => {
    const context = await page.context().browser().newContext();
    await mockHtml5Qrcode(context, PENDING_CAMERA_MOCK);
    const customPage = await context.newPage();
    await customPage.goto('/');

    await customPage.locator('#import-codes').click();
    await expect(customPage.locator('#scanner-dialog')).toBeVisible();
    await customPage.locator('#scanner-close').click();
    await expect(customPage.locator('#scanner-dialog')).toBeHidden({ timeout: 5000 });

    await context.close();
  });

  test('camera that finishes starting after Escape is stopped', async ({ page }) => {
    const context = await page.context().browser().newContext();
    await mockHtml5Qrcode(context, PENDING_CAMERA_MOCK);
    const customPage = await context.newPage();
    await customPage.goto('/');

    await customPage.locator('#import-codes').click();
    await expect(customPage.locator('#scanner-dialog')).toBeVisible();
    await customPage.keyboard.press('Escape');
    await expect(customPage.locator('#scanner-dialog')).toBeHidden({ timeout: 5000 });

    await customPage.evaluate(() => window.resolveStart());
    await expect.poll(() => customPage.evaluate(() => window.cameraScanning)).toBe(false);
    expect(await customPage.evaluate(() => window.stopCalls)).toBe(1);

    await context.close();
  });

  test('scanner opens on the first empty slot when codes are saved', async ({ page }) => {
    await fillCode(page, 0, 'aaaaaaaa');
    await fillCode(page, 1, 'bbbbbbbb');
    await page.locator('.qr-display > div.visible').nth(1).waitFor();
    await page.locator('#import-codes').click();
    await expect(page.locator('#scanner-title')).toHaveText('Scan Friend Code 3 of 6');
  });
});

// ---------------------------------------------------------------------------
// 11. In-place refresh, countdown, and visibility (#7, #12, #15)
// ---------------------------------------------------------------------------
test.describe('QR refresh', () => {
  test('manual refresh updates QR codes in place without rebuilding cards', async ({ page }) => {
    await fillCode(page, 0, 'abcd1234');
    const card = page.locator('.qr-display > div.visible').first();
    await card.waitFor();
    const before = await qrDataOf(page);
    await card.evaluate(el => { el.dataset.marker = 'original'; });

    await page.waitForTimeout(5);
    await page.locator('#manual-refresh').click();

    await expect(page.locator('.qr-display > div[data-marker="original"]')).toHaveCount(1);
    await expect(page.locator('.qr-display > div')).toHaveCount(1);
    expect(await qrDataOf(page)).not.toBe(before);
    expect(await qrDataOf(page)).toMatch(/^4,abcd1234[B-T]+$/);
  });

  test('auto refresh every 10 seconds keeps the same card and shows a countdown', async ({ page }) => {
    await page.clock.install();
    await page.reload();
    await fillCode(page, 0, 'abcd1234');
    await page.clock.runFor(400);
    const card = page.locator('.qr-display > div').first();
    await card.waitFor();
    await card.evaluate(el => { el.dataset.marker = 'original'; });
    const before = await qrDataOf(page);

    await expect(page.locator('#refresh-countdown')).toHaveText('Refreshing in 10s');
    await page.clock.runFor(3000);
    await expect(page.locator('#refresh-countdown')).toHaveText('Refreshing in 7s');

    await page.clock.runFor(7000);
    await expect(page.locator('#refresh-countdown')).toHaveText('Refreshing in 10s');
    await expect(page.locator('.qr-display > div[data-marker="original"]')).toHaveCount(1);
    expect(await qrDataOf(page)).not.toBe(before);
  });

  test('countdown is hidden when there are no codes', async ({ page }) => {
    await expect(page.locator('#refresh-countdown')).toBeHidden();
  });

  test('returning to the tab refreshes QR codes immediately', async ({ page }) => {
    await fillCode(page, 0, 'abcd1234');
    await page.locator('.qr-display > div.visible').first().waitFor();
    const before = await qrDataOf(page);
    await page.waitForTimeout(5);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(await qrDataOf(page)).not.toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 12. Input validation, labels, and paste (#5, #10, #11)
// ---------------------------------------------------------------------------
test.describe('Friend code inputs', () => {
  test('partial codes are flagged and do not produce QR codes', async ({ page }) => {
    await fillCode(page, 0, 'abc');
    await page.waitForTimeout(500);
    await expect(page.locator('.qr-display > div')).toHaveCount(0);
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#friend-code-form input').first()).toHaveAttribute('aria-invalid', 'true');

    await fillCode(page, 0, 'abcd1234');
    await expect(page.locator('.qr-display > div.visible')).toHaveCount(1);
    await expect(page.locator('#friend-code-form input').first()).toHaveAttribute('aria-invalid', 'false');
  });

  test('QR label uses the input slot number', async ({ page }) => {
    await fillCode(page, 1, 'bbbbbbbb');
    const card = page.locator('.qr-display > div.visible').first();
    await expect(card.locator('pre')).toHaveText('Friend Code 2: bbbbbbbb');
  });

  test('inputs disable autocapitalize, autocomplete, and spellcheck, and are labelled', async ({ page }) => {
    const input = page.locator('#friend-code-form input').first();
    await expect(input).toHaveAttribute('autocapitalize', 'off');
    await expect(input).toHaveAttribute('autocomplete', 'off');
    await expect(input).toHaveAttribute('spellcheck', 'false');
    await expect(input).toHaveAttribute('aria-label', 'Friend code 1');
  });

  test('pasting app QR data extracts the friend code', async ({ page }) => {
    await pasteIntoCode(page, 0, '4,abcd1234CMBSBNCPDQE');
    await expect(page.locator('#friend-code-form input').first()).toHaveValue('abcd1234');
    await expect(page.locator('.qr-display > div.visible')).toHaveCount(1);
  });

  test('pasting a profile link extracts the token', async ({ page }) => {
    await pasteIntoCode(page, 0, 'https://dblww.go.link?adj_t=srpood5&type=7&token=jk90mn12');
    await expect(page.locator('#friend-code-form input').first()).toHaveValue('jk90mn12');
  });

  test('pasting several codes fills the following inputs', async ({ page }) => {
    await pasteIntoCode(page, 1, 'aaaaaaaa\nbbbbbbbb');
    const inputs = page.locator('#friend-code-form input');
    await expect(inputs.nth(1)).toHaveValue('aaaaaaaa');
    await expect(inputs.nth(2)).toHaveValue('bbbbbbbb');
    await expect(inputs.nth(0)).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// 13. Toasts, storage, upload, clear (#6, #14)
// ---------------------------------------------------------------------------
test.describe('Robustness and recovery', () => {
  test('a second toast is not hidden early by the first toast timer', async ({ page }) => {
    await page.clock.install();
    await page.reload();
    await page.locator('#export-codes').click();
    await page.clock.runFor(1500);
    await page.locator('#manual-refresh').click();
    await page.clock.runFor(1000);
    await expect(page.locator('#toast')).toHaveClass(/show/);
    await expect(page.locator('#toast')).toHaveText('QRs refreshed!');
    await page.clock.runFor(1500);
    await expect(page.locator('#toast')).not.toHaveClass(/show/);
  });

  test('corrupted saved codes do not break the page', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('friendCodes', '{not json'));
    await page.reload();
    await expect(page.locator('#friend-code-form input')).toHaveCount(6);
    await expect(page.locator('#empty-state')).toBeVisible();
  });

  test('uploading a file replaces the whole list', async ({ page }) => {
    for (let i = 0; i < 5; i++) await fillCode(page, i, `oldcode${i}`);
    await expect(page.locator('.qr-display > div.visible')).toHaveCount(5);

    await uploadCodesFile(page, 'newcode1\nnewcode2');

    const inputs = page.locator('#friend-code-form input');
    await expect(inputs.nth(0)).toHaveValue('newcode1');
    await expect(inputs.nth(1)).toHaveValue('newcode2');
    for (let i = 2; i < 6; i++) await expect(inputs.nth(i)).toHaveValue('');
    await expect(page.locator('.qr-display > div')).toHaveCount(2);
  });

  test('uploading a file with no valid codes keeps the current list', async ({ page }) => {
    await fillCode(page, 0, 'keepcode');
    await page.locator('.qr-display > div.visible').first().waitFor();
    await uploadCodesFile(page, 'nope\nbad!!bad');
    await expect(page.locator('#toast')).toHaveText('No valid friend codes found in file');
    await expect(page.locator('#friend-code-form input').first()).toHaveValue('keepcode');
  });

  test('clear can be undone from the toast', async ({ page }) => {
    await fillCode(page, 0, 'undo0001');
    await fillCode(page, 1, 'undo0002');
    await expect(page.locator('.qr-display > div.visible')).toHaveCount(2);

    await page.locator('#clear-codes').click();
    await expect(page.locator('.qr-display > div')).toHaveCount(0);
    await page.locator('#toast-action').click();

    const inputs = page.locator('#friend-code-form input');
    await expect(inputs.nth(0)).toHaveValue('undo0001');
    await expect(inputs.nth(1)).toHaveValue('undo0002');
    await expect(page.locator('.qr-display > div.visible')).toHaveCount(2);
    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('friendCodes')));
    expect(stored.slice(0, 2)).toEqual(['undo0001', 'undo0002']);
  });
});

// ---------------------------------------------------------------------------
// 14. Showing codes to another phone (#13, #16)
// ---------------------------------------------------------------------------
test.describe('Showing QR codes', () => {
  test('tapping a QR code opens an enlarged view that stays in sync', async ({ page }) => {
    await fillCode(page, 0, 'abcd1234');
    await page.locator('.qr-display > div.visible').first().waitFor();
    await page.locator('.qr-zoom-trigger').first().click();

    const zoom = page.locator('#qr-zoom');
    await expect(zoom).toBeVisible();
    await expect(page.locator('#qr-zoom-label')).toHaveText('Friend Code 1: abcd1234');
    await expect(zoom.locator('canvas')).toBeAttached();

    await page.waitForTimeout(5);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(await zoom.getAttribute('data-qr-data')).toBe(await qrDataOf(page));

    await page.keyboard.press('Escape');
    await expect(zoom).toBeHidden();
  });

  test('screen wake lock is held while QR codes are shown and released on clear', async ({ page }) => {
    await page.addInitScript(() => {
      window.wakeLockRequests = [];
      window.wakeLockReleases = 0;
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: async (type) => {
            window.wakeLockRequests.push(type);
            const sentinel = new EventTarget();
            sentinel.released = false;
            sentinel.release = async () => { sentinel.released = true; window.wakeLockReleases += 1; };
            return sentinel;
          },
        },
      });
    });
    await page.reload();
    await fillCode(page, 0, 'abcd1234');
    await page.locator('.qr-display > div.visible').first().waitFor();
    await expect.poll(() => page.evaluate(() => window.wakeLockRequests)).toContain('screen');

    await page.locator('#clear-codes').click();
    await expect.poll(() => page.evaluate(() => window.wakeLockReleases)).toBe(1);
  });

  test('downloaded QR file name includes the slot and code', async ({ page }) => {
    await fillCode(page, 0, 'abcd1234');
    await page.locator('.qr-display > div.visible').first().waitFor();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('.download-button').first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('friend-code-1-abcd1234.png');
  });

  test('page explains that downloaded QR images can expire', async ({ page }) => {
    await expect(page.locator('#how-it-works')).toContainText('may stop working');
  });
});

// ---------------------------------------------------------------------------
// 15. Accessibility and polish (#17, #18)
// ---------------------------------------------------------------------------
test.describe('Accessibility and polish', () => {
  test('icon buttons and repeated buttons have descriptive labels', async ({ page }) => {
    await expect(page.locator('#scanner-close')).toHaveAttribute('aria-label', 'Close scanner');
    await expect(page.locator('#scanner-prev')).toHaveAttribute('aria-label', 'Previous slot');
    await expect(page.locator('#scanner-next')).toHaveAttribute('aria-label', 'Next slot');

    await fillCode(page, 0, 'abcd1234');
    await page.locator('.qr-display > div.visible').first().waitFor();
    await expect(page.locator('.download-button').first())
      .toHaveAttribute('aria-label', 'Download QR code for friend code 1');
    await expect(page.locator('.qr-zoom-trigger').first())
      .toHaveAttribute('aria-label', 'Enlarge QR code for friend code 1');
  });

  test('Buy Me a Coffee image reserves its size without inline styles', async ({ page }) => {
    const img = page.locator('img[alt="Buy Me a Coffee"]');
    await expect(img).toHaveAttribute('width', '217');
    await expect(img).toHaveAttribute('height', '60');
    expect(await img.getAttribute('style')).toBeNull();
  });

  test('dark mode darkens the page but keeps QR codes on white', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await fillCode(page, 0, 'abcd1234');
    await page.locator('.qr-display > div.visible').first().waitFor();
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).not.toBe('rgb(245, 246, 248)');
    const qrBg = await page.locator('.qr-zoom-trigger').first()
      .evaluate(el => getComputedStyle(el).backgroundColor);
    expect(qrBg).toBe('rgb(255, 255, 255)');
  });
});

// ---------------------------------------------------------------------------
// 16. Analytics consent (#19)
// ---------------------------------------------------------------------------
test.describe('Analytics consent', () => {
  async function freshPage(browser) {
    const context = await browser.newContext();
    await context.route('https://www.googletagmanager.com/**', route => route.abort());
    const page = await context.newPage();
    await page.goto('/');
    return { context, page };
  }

  test('banner is shown on first visit with analytics denied by default', async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    await expect(page.locator('#consent-banner')).toBeVisible();
    const deniedByDefault = await page.evaluate(() => (window.dataLayer || []).some(entry =>
      entry[0] === 'consent' && entry[1] === 'default' && entry[2].analytics_storage === 'denied'));
    expect(deniedByDefault).toBe(true);
    await context.close();
  });

  test('accepting grants consent, hides the banner, and is remembered', async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    await page.locator('#consent-accept').click();
    await expect(page.locator('#consent-banner')).toBeHidden();
    const granted = await page.evaluate(() => (window.dataLayer || []).some(entry =>
      entry[0] === 'consent' && entry[1] === 'update' && entry[2].analytics_storage === 'granted'));
    expect(granted).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('analyticsConsent'))).toBe('granted');

    await page.reload();
    await expect(page.locator('#consent-banner')).toBeHidden();
    const grantedOnLoad = await page.evaluate(() => (window.dataLayer || []).some(entry =>
      entry[0] === 'consent' && entry[1] === 'default' && entry[2].analytics_storage === 'granted'));
    expect(grantedOnLoad).toBe(true);
    await context.close();
  });

  test('declining keeps analytics denied and is remembered', async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    await page.locator('#consent-decline').click();
    await expect(page.locator('#consent-banner')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('analyticsConsent'))).toBe('denied');
    await page.reload();
    await expect(page.locator('#consent-banner')).toBeHidden();
    await context.close();
  });
});
