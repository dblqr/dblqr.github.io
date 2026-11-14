import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import i18n from './i18n.js';

const { STRINGS, translate } = i18n;

/**
 * Fill the nth friend-code input (0-based index) with the given code.
 */
function fillCode(page, index, code) {
  return page.locator('#friend-code-form input').nth(index).fill(code);
}

/**
 * Replace the (self-hosted, lazily loaded) html5-qrcode library with a mock.
 */
async function mockHtml5Qrcode(context, body) {
  await context.route('**/html5-qrcode.min.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body,
  }));
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
    const label = block.first().locator('.card-label');
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
    await expect(blocks.nth(0).locator('.card-label')).toHaveText('Friend Code 1: aaaaaaaa');
    await expect(blocks.nth(1).locator('.card-label')).toHaveText('Friend Code 2: bbbbbbbb');
    await expect(blocks.nth(2).locator('.card-label')).toHaveText('Friend Code 3: cccccccc');
    await expect(blocks.nth(3).locator('.card-label')).toHaveText('Friend Code 4: dddddddd');
    await expect(blocks.nth(4).locator('.card-label')).toHaveText('Friend Code 5: eeeeeeee');
    await expect(blocks.nth(5).locator('.card-label')).toHaveText('Friend Code 6: ffffffff');
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
    // "Refresh now" lives in the countdown, which only shows when there are codes.
    await fillCode(page, 0, 'abcd1234');
    await page.locator('.qr-display > div.visible').first().waitFor();
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
    await page.locator('#export-codes').click();
    const toast = page.locator('#toast');
    await expect(toast).toHaveClass(/show/);
  });

  test('auto-dismisses after ~2 seconds', async ({ page }) => {
    await page.locator('#export-codes').click();
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
    // Opening waits for the on-demand camera library, so poll for it.
    await expect.poll(() => page.evaluate(() => document.getElementById('scanner-dialog').open)).toBe(true);
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
    await expect(card.locator('.card-label')).toHaveText('Friend Code 2: bbbbbbbb');
  });

  test('inputs disable autocapitalize, autocomplete, and spellcheck, and are labelled', async ({ page }) => {
    const input = page.locator('#friend-code-form input').first();
    await expect(input).toHaveAttribute('autocapitalize', 'off');
    await expect(input).toHaveAttribute('autocomplete', 'off');
    await expect(input).toHaveAttribute('spellcheck', 'false');
    await expect(page.getByLabel('Friend code 1', { exact: true })).toHaveCount(1);
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
    await page.locator('#export-codes').click();
    await page.clock.runFor(1000);
    await expect(page.locator('#toast')).toHaveClass(/show/);
    await expect(page.locator('#toast')).toHaveText('No friend codes to export');
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

// ---------------------------------------------------------------------------
// 17. Daily scan mode for the Shenron/Porunga events
// ---------------------------------------------------------------------------
test.describe('Daily scan mode', () => {
  async function fillCodes(page, codes) {
    for (let i = 0; i < codes.length; i++) await fillCode(page, i, codes[i]);
    await expect(page.locator('.qr-display > div.visible')).toHaveCount(codes.filter(Boolean).length);
  }

  const card = (page, index) => page.locator('.qr-display > div').nth(index);

  test('daily panel is hidden without codes and shows progress with codes', async ({ page }) => {
    await expect(page.locator('#daily-panel')).toBeHidden();
    await fillCodes(page, ['aaaaaaaa']);
    await expect(page.locator('#daily-panel')).toBeVisible();
    await expect(page.locator('#daily-progress')).toHaveText('Scanned today: 0 of 3');
  });

  test('"Scanned, next" marks the code and moves to the next one', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa', 'bbbbbbbb', 'cccccccc']);
    await page.locator('#start-daily').click();

    await expect(page.locator('#daily-scan')).toBeVisible();
    await expect(page.locator('#daily-label')).toHaveText('Friend Code 1: aaaaaaaa');
    await expect(page.locator('#daily-scan-progress')).toHaveText('Scanned today: 0 of 3');
    await expect(page.locator('#daily-code canvas')).toBeAttached();

    await page.locator('#daily-done').click();
    await expect(page.locator('#daily-label')).toHaveText('Friend Code 2: bbbbbbbb');
    await expect(page.locator('#daily-scan-progress')).toHaveText('Scanned today: 1 of 3');
    await expect(card(page, 0)).toHaveClass(/scanned/);
    await expect(card(page, 0).locator('.scan-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#daily-progress')).toHaveText('Scanned today: 1 of 3');
  });

  test('Skip moves on without marking the code', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa', 'bbbbbbbb']);
    await page.locator('#start-daily').click();
    await page.locator('#daily-skip').click();
    await expect(page.locator('#daily-label')).toHaveText('Friend Code 2: bbbbbbbb');
    await expect(page.locator('#daily-scan-progress')).toHaveText('Scanned today: 0 of 3');
    await expect(card(page, 0)).not.toHaveClass(/scanned/);
  });

  test('Skip with a single code says it is the only one', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa']);
    await page.locator('#start-daily').click();
    await page.locator('#daily-skip').click();
    await expect(page.locator('#daily-label')).toHaveText('Friend Code 1: aaaaaaaa');
    await expect(page.locator('#daily-status')).toHaveText(STRINGS.en['daily.onlyCode']);
  });

  test('reaching the daily goal shows a note and keeps looping', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd']);
    await page.locator('#start-daily').click();
    for (let i = 0; i < 3; i++) await page.locator('#daily-done').click();

    await expect(page.locator('#daily-status')).toHaveText(translate('en', 'daily.goalReached', { count: 3 }));
    await expect(page.locator('#daily-label')).toHaveText('Friend Code 4: dddddddd');
    await expect(page.locator('#daily-done')).toBeVisible();
    await expect(page.locator('#daily-scan-progress')).toHaveText('Scanned today: 3 of 3');
  });

  test('after every code is scanned it loops back to the first', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa', 'bbbbbbbb']);
    await page.locator('#start-daily').click();
    await page.locator('#daily-done').click();
    await page.locator('#daily-done').click();
    await expect(page.locator('#daily-label')).toHaveText('Friend Code 1: aaaaaaaa');
    await expect(page.locator('#daily-status')).toHaveText(STRINGS.en['daily.alreadyScanned']);
    await expect(page.locator('#daily-done')).toBeVisible();

    await page.locator('#daily-skip').click();
    await expect(page.locator('#daily-label')).toHaveText('Friend Code 2: bbbbbbbb');
    await page.locator('#daily-done').click();
    await expect(page.locator('#daily-label')).toHaveText('Friend Code 1: aaaaaaaa');
  });

  test('opening after the goal is met still shows a code', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd']);
    for (let i = 0; i < 3; i++) await card(page, i).locator('.scan-toggle').click();
    await page.locator('#start-daily').click();
    await expect(page.locator('#daily-label')).toHaveText('Friend Code 4: dddddddd');
    await expect(page.locator('#daily-done')).toBeVisible();
  });

  test('the daily view never shows a stop screen', async ({ page }) => {
    await expect(page.locator('#daily-complete')).toHaveCount(0);
    await expect(page.locator('#daily-continue')).toHaveCount(0);
  });

  test('starting again resumes at the first unscanned code', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa', 'bbbbbbbb']);
    await card(page, 0).locator('.scan-toggle').click();
    await page.locator('#start-daily').click();
    await expect(page.locator('#daily-label')).toHaveText('Friend Code 2: bbbbbbbb');
    await expect(page.locator('#daily-scan-progress')).toHaveText('Scanned today: 1 of 3');
  });

  test('cards can be marked and unmarked by hand', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa']);
    const toggle = card(page, 0).locator('.scan-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(card(page, 0)).toHaveClass(/scanned/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(card(page, 0)).not.toHaveClass(/scanned/);
    await expect(page.locator('#daily-progress')).toHaveText('Scanned today: 0 of 3');
  });

  test('scanned state survives a reload', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa']);
    await card(page, 0).locator('.scan-toggle').click();
    await page.reload();
    await expect(card(page, 0)).toHaveClass(/scanned/);
    await expect(page.locator('#daily-progress')).toHaveText('Scanned today: 1 of 3');
  });

  test('scanned state resets at the 1:00 AM Pacific game reset', async ({ page }) => {
    // 00:59:50 PST on 2026-11-14
    await page.clock.install({ time: new Date('2026-11-14T08:59:50Z') });
    await page.reload();
    await fillCode(page, 0, 'aaaaaaaa');
    await page.clock.runFor(400);
    await card(page, 0).locator('.scan-toggle').click();
    await expect(card(page, 0)).toHaveClass(/scanned/);

    await page.clock.runFor(15000);
    await expect(card(page, 0)).not.toHaveClass(/scanned/);
    await expect(page.locator('#daily-progress')).toHaveText('Scanned today: 0 of 3');
  });

  test('scanned state does not reset at midnight Pacific', async ({ page }) => {
    // 23:59:50 PST on 2026-11-13
    await page.clock.install({ time: new Date('2026-11-14T07:59:50Z') });
    await page.reload();
    await fillCode(page, 0, 'aaaaaaaa');
    await page.clock.runFor(400);
    await card(page, 0).locator('.scan-toggle').click();
    await page.clock.runFor(15000);
    await expect(card(page, 0)).toHaveClass(/scanned/);
  });

  test('daily panel shows the next reset in the player\'s local time', async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: 'America/New_York', locale: 'en-US' });
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-11-14T12:00:00Z') });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('analyticsConsent', 'denied'));
    await page.reload();
    await fillCode(page, 0, 'aaaaaaaa');
    await page.clock.runFor(400);
    await expect(page.locator('#daily-reset')).toHaveText('Resets at 4:00 AM your time');
    await context.close();
  });

  test('daily view QR stays in sync with refreshes', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa']);
    await page.locator('#start-daily').click();
    await page.waitForTimeout(5);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(await page.locator('#daily-scan').getAttribute('data-qr-data')).toBe(await qrDataOf(page));
  });

  test('close button and Escape close the daily view', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa']);
    await page.locator('#start-daily').click();
    await page.locator('#daily-close').click();
    await expect(page.locator('#daily-scan')).toBeHidden();
    await page.locator('#start-daily').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#daily-scan')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 18. Search, credit, and large screens
// ---------------------------------------------------------------------------
test.describe('Search and credit', () => {
  test('title, description, and link previews name the Shenron/Porunga use', async ({ page }) => {
    await expect(page).toHaveTitle(/Shenron.*Porunga/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Dragon Ball Legends/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Shenron/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://dblqr.github.io/');
  });

  test('footer says the tool is unofficial', async ({ page }) => {
    await expect(page.locator('footer')).toContainText('Not affiliated with Bandai Namco');
  });
});

test.describe('Layout', () => {
  test('large screens show bigger QR codes, three per row', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    for (let i = 0; i < 6; i++) await fillCode(page, i, `bigcode${i}`);
    await expect(page.locator('.qr-display > div.visible')).toHaveCount(6);

    const trigger = await page.locator('.qr-zoom-trigger').first().boundingBox();
    expect(trigger.width).toBeGreaterThanOrEqual(280);

    const tops = await page.locator('.qr-display > div').evaluateAll(cards =>
      cards.map(c => Math.round(c.getBoundingClientRect().top)));
    expect(tops[0]).toBe(tops[2]);
    expect(tops[3]).toBeGreaterThan(tops[0]);
  });

  test('small phones do not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await fillCode(page, 0, 'abcd1234');
    await page.locator('.qr-display > div.visible').first().waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 19. Translations
// ---------------------------------------------------------------------------
test.describe('Translations', () => {
  async function pageWithLocale(browser, locale) {
    const context = await browser.newContext({ locale });
    await context.route('https://www.googletagmanager.com/**', route => route.abort());
    await context.addInitScript(() => localStorage.setItem('analyticsConsent', 'denied'));
    const page = await context.newPage();
    await page.goto('/');
    return { context, page };
  }

  for (const [locale, lang, urlPath] of [['ja-JP', 'ja', '/ja/'], ['es-MX', 'es', '/es/'], ['pt-BR', 'pt-BR', '/pt-br/']]) {
    test(`${locale} browser is sent to the ${lang} page`, async ({ browser }) => {
      const { context, page } = await pageWithLocale(browser, locale);
      await expect(page).toHaveURL(new RegExp(`${urlPath.replace(/\//g, '\\/')}$`));
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page).toHaveTitle(STRINGS[lang]['page.title']);
      await expect(page.locator('h1')).toHaveText(STRINGS[lang]['header.title']);
      await expect(page.locator('#import-codes')).toHaveText(STRINGS[lang]['actions.scan']);
      await expect(page.locator('#empty-state li').nth(1)).toHaveText(
        STRINGS[lang]['empty.scan'].replace(/<\/?strong>/g, ''));
      await expect(page.locator('#scanner-close')).toHaveAttribute('aria-label', STRINGS[lang]['scanner.close']);
      await expect(page.locator('#language-select')).toHaveValue(lang);
      await context.close();
    });
  }

  test('unsupported browser languages fall back to English', async ({ browser }) => {
    const { context, page } = await pageWithLocale(browser, 'fr-FR');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toHaveText(STRINGS.en['header.title']);
    await context.close();
  });

  test('language picker switches page and remembers the language', async ({ page }) => {
    await page.locator('#language-select').selectOption('es');
    await expect(page).toHaveURL(/\/es\/$/);
    await expect(page.locator('h1')).toHaveText(STRINGS.es['header.title']);
    expect(await page.evaluate(() => localStorage.getItem('language'))).toBe('es');

    await page.goto('/');
    await expect(page).toHaveURL(/\/es\/$/);

    await page.locator('#language-select').selectOption('en');
    await expect(page).toHaveURL(/:\d+\/$/);
    await expect(page.locator('h1')).toHaveText(STRINGS.en['header.title']);
  });

  test('a saved English choice keeps a Japanese browser on the English page', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ja-JP' });
    await context.addInitScript(() => {
      localStorage.setItem('analyticsConsent', 'denied');
      localStorage.setItem('language', 'en');
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/:\d+\/$/);
    await expect(page.locator('h1')).toHaveText(STRINGS.en['header.title']);
    await context.close();
  });

  test('language pages are translated in the HTML itself, without JavaScript', async ({ request }) => {
    for (const [urlPath, lang] of [['/ja/', 'ja'], ['/es/', 'es'], ['/pt-br/', 'pt-BR']]) {
      const html = await (await request.get(urlPath)).text();
      expect(html).toContain(`<html lang="${lang}">`);
      expect(html).toContain(STRINGS[lang]['actions.scan']);
    }
  });

  test('dynamic text is translated too', async ({ page }) => {
    await page.locator('#language-select').selectOption('pt-BR');
    await page.locator('h1').filter({ hasText: STRINGS['pt-BR']['header.title'] }).waitFor();
    await fillCode(page, 0, 'abcd1234');
    const card = page.locator('.qr-display > div.visible').first();
    await expect(card.locator('.card-label')).toHaveText(translate('pt-BR', 'card.label', { slot: 1, code: 'abcd1234' }));
    await expect(card.locator('.scan-toggle')).toHaveText(STRINGS['pt-BR']['card.markScanned']);
    await expect(page.locator('#daily-progress')).toHaveText(translate('pt-BR', 'daily.progress', { count: 0, goal: 3 }));
    await expect(page.locator('#refresh-countdown')).toHaveText(translate('pt-BR', 'refresh.countdown', { seconds: 10 }));
    await expect(page.locator('#friend-code-form input').first())
      .toHaveAttribute('placeholder', translate('pt-BR', 'input.placeholder', { slot: 1 }));

    await page.locator('#manual-refresh').click();
    await expect(page.locator('#toast')).toHaveText(STRINGS['pt-BR']['toast.refreshed']);

    await page.locator('#import-codes').click();
    await expect(page.locator('#scanner-title')).toHaveText(translate('pt-BR', 'scanner.title', { slot: 2, total: 6 }));
  });
});

// ---------------------------------------------------------------------------
// 20. Installable offline app
// ---------------------------------------------------------------------------
test.describe('Offline app', () => {
  test('page links a valid manifest with loadable icons', async ({ page, request }) => {
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', /^#/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /\.png$/);

    const manifest = await (await request.get('/manifest.webmanifest')).json();
    for (const icon of manifest.icons) {
      const response = await request.get(`/${icon.src}`);
      expect(response.ok(), icon.src).toBe(true);
      expect(response.headers()['content-type']).toContain('image/png');
    }
  });

  test('works offline after the first visit', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    await context.route('https://www.googletagmanager.com/**', route => route.abort());
    await context.addInitScript(() => localStorage.setItem('analyticsConsent', 'denied'));
    const page = await context.newPage();
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await fillCode(page, 0, 'offline1');
    await page.locator('.qr-display > div.visible').first().waitFor();

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('#friend-code-form input').first()).toHaveValue('offline1');
    await expect(page.locator('.qr-display > div.visible canvas').first()).toBeAttached();
    await context.close();
  });
});

// ---------------------------------------------------------------------------
// 21. Search engines and link previews
// ---------------------------------------------------------------------------
test.describe('Search engines and link previews', () => {
  test('preview image, robots.txt, and sitemap are served', async ({ request }) => {
    const image = await request.get('/og-image.png');
    expect(image.ok()).toBe(true);
    expect(image.headers()['content-type']).toContain('image/png');

    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBe(true);
    expect(await robots.text()).toContain('Sitemap: https://dblqr.github.io/sitemap.xml');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain('<loc>https://dblqr.github.io/ja/</loc>');
  });

  test('page carries a large preview image and WebApplication structured data', async ({ page }) => {
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://dblqr.github.io/og-image.png');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    const jsonLd = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    expect(jsonLd['@type']).toBe('WebApplication');
    expect(jsonLd.inLanguage).toBe('en');
  });

  test('each language page lists its alternates', async ({ page }) => {
    await page.goto('/es/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://dblqr.github.io/es/');
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(5);
  });
});

// ---------------------------------------------------------------------------
// 22. HTML5 best practices and hardening
// ---------------------------------------------------------------------------
test.describe('HTML5 best practices and hardening', () => {
  test('QR images have no leaked tooltip and an empty alt (the button is labelled)', async ({ page }) => {
    await fillCode(page, 0, 'abcd1234');
    await page.locator('.qr-display > div.visible').first().waitFor();
    const trigger = page.locator('.qr-zoom-trigger').first();
    expect(await trigger.getAttribute('title')).toBeNull();
    await expect(trigger.locator('img')).toHaveAttribute('alt', '');

    await page.locator('#manual-refresh').click();
    expect(await trigger.getAttribute('title')).toBeNull();

    await trigger.click();
    expect(await page.locator('#qr-zoom-code').getAttribute('title')).toBeNull();
    await expect(page.locator('#qr-zoom-code img')).toHaveAttribute('alt', '');
    await page.keyboard.press('Escape');

    await page.locator('#start-daily').click();
    expect(await page.locator('#daily-code').getAttribute('title')).toBeNull();
    await expect(page.locator('#daily-code img')).toHaveAttribute('alt', '');
  });

  test('friend code inputs have visible labels', async ({ page }) => {
    const label = page.locator('label[for="code-1"]');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('Friend code 1');
    await expect(page.locator('#code-1')).toBeVisible();
  });

  test('reduced motion turns off animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fillCode(page, 0, 'abcd1234');
    const card = page.locator('.qr-display > div').first();
    await card.waitFor();
    expect(await card.evaluate(el => getComputedStyle(el).transitionDuration)).toMatch(/^0s(, 0s)*$/);
    expect(await page.locator('#toast').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  });

  test('camera library loads only when the scanner is opened', async ({ page }) => {
    const requests = [];
    page.on('request', request => { if (request.url().includes('html5-qrcode')) requests.push(request.url()); });
    await page.reload();
    await page.locator('#friend-code-form input').first().waitFor();
    expect(requests).toHaveLength(0);

    await page.locator('#import-codes').click();
    await expect(page.locator('#scanner-dialog')).toBeVisible();
    expect(requests).toEqual([expect.stringContaining('/vendor/html5-qrcode.min.js')]);

    await page.locator('#scanner-close').click();
    await page.locator('#import-codes').click();
    await expect(page.locator('#scanner-dialog')).toBeVisible();
    expect(requests).toHaveLength(1);
  });

  test('a camera library that fails to load shows a friendly message', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('analyticsConsent', 'denied'));
    await context.route('**/html5-qrcode.min.js', route => route.abort());
    const page = await context.newPage();
    await page.goto('/');
    await page.locator('#import-codes').click();
    await expect(page.locator('#toast')).toHaveText(STRINGS.en['scanner.loadFailed']);
    await expect(page.locator('#scanner-dialog')).toBeHidden();
    await context.close();
  });

  test('the content security policy blocks nothing the site uses', async ({ browser }) => {
    const context = await browser.newContext();
    await mockHtml5Qrcode(context, PENDING_CAMERA_MOCK);
    await context.addInitScript(() => {
      localStorage.setItem('analyticsConsent', 'granted');
      window.cspViolations = [];
      document.addEventListener('securitypolicyviolation', e => {
        window.cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    const page = await context.newPage();
    await page.goto('/');
    await fillCode(page, 0, 'abcd1234');
    await fillCode(page, 1, 'ef56gh78');
    await page.locator('.qr-display > div.visible').nth(1).waitFor();
    await page.locator('.qr-zoom-trigger').first().click();
    await page.keyboard.press('Escape');
    await page.locator('#start-daily').click();
    await page.locator('#daily-done').click();
    await page.locator('#daily-close').click();
    await page.locator('#import-codes').click();
    await expect(page.locator('#scanner-dialog')).toBeVisible();
    await page.locator('#scanner-close').click();
    await page.locator('.download-button').first().click();
    expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
    await context.close();
  });
});

// ---------------------------------------------------------------------------
// 23. Automated accessibility checks (axe, WCAG 2.1 A/AA)
// ---------------------------------------------------------------------------
test.describe('Accessibility (axe)', () => {
  async function expectNoViolations(page, include) {
    let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    if (include) builder = builder.include(include);
    const { violations } = await builder.analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }

  async function withCodes(page) {
    await fillCode(page, 0, 'aaaaaaaa');
    await fillCode(page, 1, 'bbbbbbbb');
    await page.locator('.qr-display > div.visible').nth(1).waitFor();
    await page.locator('.qr-display > div').first().locator('.scan-toggle').click();
  }

  test('main page with codes (light)', async ({ page }) => {
    await withCodes(page);
    await expectNoViolations(page);
  });

  test('main page with codes (dark)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await withCodes(page);
    await expectNoViolations(page);
  });

  test('empty page', async ({ page }) => {
    await expectNoViolations(page);
  });

  test('daily scan dialog', async ({ page }) => {
    await withCodes(page);
    await page.locator('#start-daily').click();
    await expectNoViolations(page, '#daily-scan');
  });

  test('enlarged QR dialog', async ({ page }) => {
    await withCodes(page);
    await page.locator('.qr-zoom-trigger').first().click();
    await expectNoViolations(page, '#qr-zoom');
  });

  test('scanner dialog', async ({ page }) => {
    const context = await page.context().browser().newContext();
    await mockHtml5Qrcode(context, PENDING_CAMERA_MOCK);
    await context.addInitScript(() => localStorage.setItem('analyticsConsent', 'denied'));
    const scannerPage = await context.newPage();
    await scannerPage.goto('/');
    await scannerPage.locator('#import-codes').click();
    await expect(scannerPage.locator('#scanner-dialog')).toBeVisible();
    await expectNoViolations(scannerPage, '#scanner-dialog');
    await context.close();
  });

  test('consent banner', async ({ browser }) => {
    const context = await browser.newContext();
    await context.route('https://www.googletagmanager.com/**', route => route.abort());
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    await expectNoViolations(page);
    await context.close();
  });

  test('Japanese page', async ({ page }) => {
    await page.goto('/ja/');
    await withCodes(page);
    await expectNoViolations(page);
  });
});

// ---------------------------------------------------------------------------
// 24. Small HTML best-practice updates
// ---------------------------------------------------------------------------
test.describe('HTML best-practice updates', () => {
  test('How It Works is open on the first visit and folded afterwards', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('analyticsConsent', 'denied'));
    const page = await context.newPage();
    await page.goto('/');
    const details = page.locator('#how-details');
    await expect(details).toHaveAttribute('open', '');
    await expect(page.locator('#how-it-works ol')).toBeVisible();

    await page.reload();
    await expect(details).not.toHaveAttribute('open', '');
    await expect(page.locator('#how-it-works ol')).toBeHidden();

    await page.locator('#how-details summary').click();
    await expect(page.locator('#how-it-works ol')).toBeVisible();
    await context.close();
  });

  test('the reset time is machine-readable', async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: 'America/New_York', locale: 'en-US' });
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-11-14T12:00:00Z') });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('analyticsConsent', 'denied'));
    await page.reload();
    await fillCode(page, 0, 'aaaaaaaa');
    await page.clock.runFor(400);
    const time = page.locator('#daily-reset time');
    await expect(time).toHaveAttribute('datetime', '2026-11-15T09:00:00.000Z');
    await expect(time).toHaveText('4:00 AM');
    await expect(page.locator('#daily-reset')).toHaveText('Resets at 4:00 AM your time');
    await context.close();
  });

  test('code boxes declare the 8-character length to the browser', async ({ page }) => {
    const input = page.locator('#code-1');
    await expect(input).toHaveAttribute('minlength', '8');
    await expect(input).toHaveAttribute('maxlength', '8');
    await expect(input).toHaveAttribute('pattern', '[a-zA-Z0-9]{8}');
  });
});

// ---------------------------------------------------------------------------
// 25. Design pass
// ---------------------------------------------------------------------------
test.describe('Design', () => {
  async function fillCodes(page, codes) {
    for (let i = 0; i < codes.length; i++) await fillCode(page, i, codes[i]);
    await expect(page.locator('.qr-display > div.visible')).toHaveCount(codes.length);
  }
  const box = (page, selector) => page.locator(selector).first().boundingBox();
  const SIX = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd', 'eeeeeeee', 'ffffffff'];

  // 1. Daily view QR fits on phones, and the daily view is full-screen there
  for (const [width, height] of [[390, 844], [360, 640], [1440, 900]]) {
    test(`daily view QR is fully visible at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await fillCodes(page, ['aaaaaaaa']);
      await page.locator('#start-daily').click();
      const dialog = await box(page, '#daily-scan');
      const qr = await box(page, '#daily-code');
      expect(qr.x).toBeGreaterThanOrEqual(dialog.x);
      expect(qr.x + qr.width).toBeLessThanOrEqual(dialog.x + dialog.width);
      expect(qr.x + qr.width).toBeLessThanOrEqual(width);
      expect(qr.y + qr.height).toBeLessThanOrEqual(height);
      expect(qr.width).toBeGreaterThanOrEqual(Math.min(280, width - 80));
      if (width < 600) {
        expect(dialog.width).toBeGreaterThanOrEqual(width - 1);
        expect(dialog.height).toBeGreaterThanOrEqual(height - 1);
      }
    });
  }

  // 2. Phones: two code boxes per row; QR codes start within about a screen
  test('phones show two code boxes per row and QR codes start sooner', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fillCodes(page, ['aaaaaaaa', 'bbbbbbbb', 'cccccccc']);
    const first = await box(page, '#code-1');
    const second = await box(page, '#code-2');
    expect(Math.round(first.y)).toBe(Math.round(second.y));
    const card = await box(page, '.qr-display > div');
    expect(card.y).toBeLessThan(1000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('wide screens show all six code boxes in one row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tops = await page.locator('#friend-code-form input').evaluateAll(inputs =>
      inputs.map(i => Math.round(i.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  });

  // 3. Hierarchy
  test('daily scans is the main call to action above the other actions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await fillCodes(page, ['aaaaaaaa']);
    const panel = await box(page, '#daily-panel');
    const actions = await box(page, '#actions');
    expect(panel.y).toBeLessThan(actions.y);
    const start = await box(page, '#start-daily');
    expect(start.height).toBeGreaterThanOrEqual(44);
  });

  test('refresh now sits in the countdown; clear all sits with the code boxes', async ({ page }) => {
    await expect(page.locator('#actions #manual-refresh')).toHaveCount(0);
    await expect(page.locator('#actions #clear-codes')).toHaveCount(0);
    await expect(page.locator('#codes-header #clear-codes')).toHaveText(STRINGS.en['actions.clear']);
    await expect(page.locator('#codes-title')).toHaveText(STRINGS.en['input.groupLabel']);
    await fillCodes(page, ['aaaaaaaa']);
    await expect(page.locator('#refresh-status #manual-refresh')).toHaveText(STRINGS.en['actions.refresh']);
    await expect(page.locator('#refresh-status #refresh-countdown')).toBeVisible();
  });

  test('only the action descriptions that add information remain', async ({ page }) => {
    await expect(page.locator('#actions .btn-desc')).toHaveCount(3);
    await expect(page.locator('#actions button')).toHaveCount(3);
  });

  // 4. Cards
  test('card titles are plain text and Mark scanned outranks Download', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa']);
    const card = page.locator('.qr-display > div').first();
    const title = await card.locator('.card-label').evaluate(el => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, border: s.borderTopWidth };
    });
    expect(title).toEqual({ background: 'rgba(0, 0, 0, 0)', border: '0px' });

    const bg = (selector) => card.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor);
    expect(await bg('.download-button')).toBe('rgba(0, 0, 0, 0)');
    expect(await bg('.scan-toggle')).not.toBe('rgba(0, 0, 0, 0)');
    const toggle = await card.locator('.scan-toggle').boundingBox();
    expect(toggle.height).toBeGreaterThanOrEqual(36);
  });

  // 5. Progress meter
  test('progress pills fill as codes are scanned', async ({ page }) => {
    await fillCodes(page, ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd']);
    const pills = page.locator('#daily-panel .progress-pills .pill');
    await expect(pills).toHaveCount(3);
    await expect(page.locator('#daily-panel .progress-pills .pill.filled')).toHaveCount(0);
    for (let i = 0; i < 2; i++) await page.locator('.qr-display > div').nth(i).locator('.scan-toggle').click();
    await expect(page.locator('#daily-panel .progress-pills .pill.filled')).toHaveCount(2);

    await page.locator('#start-daily').click();
    await expect(page.locator('#daily-scan .progress-pills .pill.filled')).toHaveCount(2);
    await page.locator('#daily-done').click();
    await page.locator('#daily-done').click();
    await expect(page.locator('#daily-scan .progress-pills .pill.filled')).toHaveCount(3);
    await expect(page.locator('#daily-scan .progress-pills .pill')).toHaveCount(3);
  });

  // 6. Consistent widths and tighter spacing
  test('code boxes line up with the QR grid on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await fillCodes(page, SIX);
    const form = await box(page, '#friend-code-form');
    const grid = await box(page, '.qr-display');
    expect(Math.abs(form.width - grid.width)).toBeLessThanOrEqual(4);
    expect(Math.abs(form.x - grid.x)).toBeLessThanOrEqual(4);
  });

  test('the empty page has no large gap before How It Works', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const empty = await box(page, '#empty-state');
    const how = await box(page, '#how-it-works');
    expect(how.y - (empty.y + empty.height)).toBeLessThanOrEqual(48);
  });
});
