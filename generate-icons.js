// Generates the app icons in icons/ and the link-preview image og-image.png:
// a stylised QR code on the site's blue (no game artwork).
// The white panel covers 54% of the icon so it stays inside the maskable-icon
// safe zone (a centred circle of 40% radius). Run: npm run generate-icons
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const BLUE = [37, 99, 235];
const WHITE = [255, 255, 255];
const DARK = [26, 26, 46];
const GRID = 21; // QR version 1 is 21x21 modules
const QUIET = 2; // quiet-zone modules around the code inside the panel

function moduleGrid() {
    const grid = Array.from({ length: GRID }, () => new Array(GRID).fill(false));
    const reserved = Array.from({ length: GRID }, () => new Array(GRID).fill(false));

    // Finder patterns (with separators) in three corners
    for (const [ox, oy] of [[0, 0], [GRID - 7, 0], [0, GRID - 7]]) {
        for (let y = -1; y <= 7; y++) {
            for (let x = -1; x <= 7; x++) {
                const gx = ox + x;
                const gy = oy + y;
                if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue;
                reserved[gy][gx] = true;
                const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
                grid[gy][gx] = x >= 0 && y >= 0 && x <= 6 && y <= 6 && ring !== 2;
            }
        }
    }

    // Timing patterns
    for (let i = 8; i < GRID - 8; i++) {
        grid[6][i] = grid[i][6] = i % 2 === 0;
        reserved[6][i] = reserved[i][6] = true;
    }

    // Deterministic "data" modules
    let seed = 20261114;
    for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
            if (reserved[y][x]) continue;
            seed = (seed * 1103515245 + 12345) % 2147483648;
            grid[y][x] = seed / 2147483648 < 0.45;
        }
    }
    return grid;
}

function render(size, grid) {
    const png = new PNG({ width: size, height: size });
    const panel = Math.round(size * 0.54);
    const offset = Math.round((size - panel) / 2);
    const moduleSize = panel / (GRID + 2 * QUIET);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let color = BLUE;
            const px = x - offset;
            const py = y - offset;
            if (px >= 0 && py >= 0 && px < panel && py < panel) {
                color = WHITE;
                const gx = Math.floor(px / moduleSize) - QUIET;
                const gy = Math.floor(py / moduleSize) - QUIET;
                if (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID && grid[gy][gx]) color = DARK;
            }
            const i = (y * size + x) * 4;
            png.data[i] = color[0];
            png.data[i + 1] = color[1];
            png.data[i + 2] = color[2];
            png.data[i + 3] = 255;
        }
    }
    return PNG.sync.write(png);
}

// 5x7 pixel font for the preview image (only the characters it uses).
const FONT = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

function makeCanvas(width, height, color) {
    const png = new PNG({ width, height });
    const fill = (x0, y0, w, h, c) => {
        for (let y = Math.max(0, y0); y < Math.min(height, y0 + h); y++) {
            for (let x = Math.max(0, x0); x < Math.min(width, x0 + w); x++) {
                const i = (y * width + x) * 4;
                png.data[i] = c[0];
                png.data[i + 1] = c[1];
                png.data[i + 2] = c[2];
                png.data[i + 3] = 255;
            }
        }
    };
    fill(0, 0, width, height, color);
    return { png, fill };
}

function drawText(fill, text, x, y, scale, color) {
    let cursor = x;
    for (const char of text) {
        const glyph = FONT[char];
        if (!glyph) throw new Error(`No glyph for "${char}"`);
        glyph.forEach((row, gy) => {
            [...row].forEach((cell, gx) => {
                if (cell === '#') fill(cursor + gx * scale, y + gy * scale, scale, scale, color);
            });
        });
        cursor += 6 * scale;
    }
}

// 1200x630 link-preview image: a QR panel beside the site name.
function renderPreview(grid) {
    const { png, fill } = makeCanvas(1200, 630, BLUE);
    const panel = 420;
    const panelX = 90;
    const panelY = 105;
    fill(panelX, panelY, panel, panel, WHITE);
    const moduleSize = panel / (GRID + 2 * QUIET);
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            if (!grid[gy][gx]) continue;
            const x0 = Math.round(panelX + (gx + QUIET) * moduleSize);
            const y0 = Math.round(panelY + (gy + QUIET) * moduleSize);
            const x1 = Math.round(panelX + (gx + QUIET + 1) * moduleSize);
            const y1 = Math.round(panelY + (gy + QUIET + 1) * moduleSize);
            fill(x0, y0, x1 - x0, y1 - y0, DARK);
        }
    }
    const LIGHT = [191, 219, 254];
    drawText(fill, 'SHENRON &', 570, 140, 9, WHITE);
    drawText(fill, 'PORUNGA', 570, 225, 9, WHITE);
    drawText(fill, 'QR GENERATOR', 570, 320, 6, WHITE);
    drawText(fill, 'FOR DRAGON BALL LEGENDS', 570, 400, 4, LIGHT);
    drawText(fill, 'UNOFFICIAL FAN TOOL', 570, 448, 4, LIGHT);
    return PNG.sync.write(png);
}

const outDir = path.join(__dirname, 'icons');
fs.mkdirSync(outDir, { recursive: true });
const grid = moduleGrid();
const outputs = {
    'icon-192.png': 192,
    'icon-512.png': 512,
    'icon-maskable-512.png': 512,
    'apple-touch-icon.png': 180,
};
for (const [name, size] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(outDir, name), render(size, grid));
    console.log(`wrote icons/${name} (${size}x${size})`);
}
fs.writeFileSync(path.join(__dirname, 'og-image.png'), renderPreview(grid));
console.log('wrote og-image.png (1200x630)');
