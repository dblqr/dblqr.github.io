import { test, expect } from '@playwright/test';

/**
 * Fill the nth friend-code input (0-based index) with the given code.
 */
function fillCode(page, index, code) {
  return page.locator('#friend-code-form input').nth(index).fill(code);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
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
    await expect(page.locator('#toast')).toHaveText('Friend codes cleared!');

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