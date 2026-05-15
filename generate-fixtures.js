const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const fixtures = [
    { filename: 'plain-code.png', data: 'ab12cd34' },
    { filename: 'ingame-scan.png', data: '7,ef56gh78' },
    { filename: 'deeplink-url.png', data: 'https://dblww.go.link?adj_t=srpood5&type=7&token=jk90mn12' },
];

const dir = path.join(__dirname, 'test-fixtures');
fs.mkdirSync(dir, { recursive: true });

(async () => {
    for (const { filename, data } of fixtures) {
        await QRCode.toFile(path.join(dir, filename), data, { width: 300, margin: 2 });
        console.log(`Generated ${filename}`);
    }
    console.log('All fixtures generated.');
})();
