// Builds the deployable site into dist/:
// - one static page per language (index.html, ja/, es/, pt-br/) with the
//   static text, <html lang>, and search/preview tags translated in the HTML,
//   so search engines can index every language without running JavaScript;
// - hreflang alternates, JSON-LD structured data, sitemap.xml;
// - the static assets.
// No dependencies: index.html is a controlled template, so the translatable
// elements (data-i18n, data-i18n-html, data-i18n-attr) are rewritten with
// targeted regular expressions. test.js checks the output.
//
// Usage: node build.js   (or npm run build)

const fs = require('node:fs');
const path = require('node:path');
const { STRINGS, LANGUAGES } = require('./i18n.js');

const SITE_URL = 'https://dblqr.github.io';
const STATIC_FILES = [
    'favicon.ico', 'styles.css', 'analytics.js', 'i18n.js', 'timestamp.js', 'daily.js', 'scanner.js', 'app.js',
    'sw.js', 'manifest.webmanifest', 'robots.txt', 'og-image.png',
    'vendor/qrcode.min.js', 'vendor/html5-qrcode.min.js', 'vendor/LICENSE-qrcodejs', 'vendor/LICENSE-html5-qrcode',
];
const STATIC_DIRS = ['icons'];
const OG_LOCALES = { en: 'en_US', ja: 'ja_JP', es: 'es_ES', 'pt-BR': 'pt_BR' };

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// JSON inside <script> must not contain "</script>"; escape every "<".
function jsonForScript(value) {
    return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

function seoBlock(lang) {
    const T = (key) => escapeHtml(STRINGS[lang][key]);
    const page = LANGUAGES.find(l => l.code === lang);
    const url = SITE_URL + page.path;
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: STRINGS[lang]['page.appName'],
        url,
        description: STRINGS[lang]['page.description'],
        inLanguage: lang,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    };
    const lines = [
        `<title>${T('page.title')}</title>`,
        `<meta name="description" content="${T('page.description')}">`,
        `<link rel="canonical" href="${url}">`,
        ...LANGUAGES.map(l => `<link rel="alternate" hreflang="${l.code}" href="${SITE_URL}${l.path}">`),
        `<link rel="alternate" hreflang="x-default" href="${SITE_URL}/">`,
        '<meta property="og:type" content="website">',
        `<meta property="og:url" content="${url}">`,
        `<meta property="og:title" content="${T('page.ogTitle')}">`,
        `<meta property="og:description" content="${T('page.ogDescription')}">`,
        `<meta property="og:image" content="${SITE_URL}/og-image.png">`,
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        `<meta property="og:image:alt" content="${T('page.ogImageAlt')}">`,
        `<meta property="og:locale" content="${OG_LOCALES[lang]}">`,
        ...LANGUAGES.filter(l => l.code !== lang)
            .map(l => `<meta property="og:locale:alternate" content="${OG_LOCALES[l.code]}">`),
        '<meta name="twitter:card" content="summary_large_image">',
        `<script type="application/ld+json">\n${jsonForScript(jsonLd)}\n    </script>`,
    ];
    return lines.map(line => `    ${line}`).join('\n').trimStart();
}

function setAttribute(attrs, name, value) {
    const pattern = new RegExp(`(\\s${name}=")[^"]*(")`);
    return pattern.test(attrs) ? attrs.replace(pattern, `$1${value}$2`) : `${attrs} ${name}="${value}"`;
}

function renderPage(source, lang) {
    const T = (key) => {
        if (!(key in STRINGS[lang])) throw new Error(`Missing translation ${lang}.${key}`);
        return STRINGS[lang][key];
    };
    let html = source;
    if (!html.includes('<html lang="en">')) throw new Error('index.html must start with <html lang="en">');
    html = html.replace('<html lang="en">', `<html lang="${lang}">`);

    const seo = /<!-- seo:start[\s\S]*?<!-- seo:end -->/;
    if (!seo.test(html)) throw new Error('index.html is missing the seo:start/seo:end block');
    html = html.replace(seo, seoBlock(lang));

    // <tag ... data-i18n="key" ...>text</tag>  -> escaped translation
    html = html.replace(
        /<(\w+)((?:\s[^>]*?)?\sdata-i18n="([^"]+)"[^>]*)>[\s\S]*?<\/\1>/g,
        (_m, tag, attrs, key) => `<${tag}${attrs}>${escapeHtml(T(key))}</${tag}>`
    );
    // <tag ... data-i18n-html="key" ...>markup</tag>  -> trusted markup
    html = html.replace(
        /<(\w+)((?:\s[^>]*?)?\sdata-i18n-html="([^"]+)"[^>]*)>[\s\S]*?<\/\1>/g,
        (_m, tag, attrs, key) => `<${tag}${attrs}>${T(key)}</${tag}>`
    );
    // data-i18n-attr="attr:key;attr:key" -> translated attribute values
    html = html.replace(
        /<(\w+)((?:\s[^>]*?)?\sdata-i18n-attr="([^"]+)"[^>]*)>/g,
        (_m, tag, attrs, spec) => {
            let updated = attrs;
            for (const pair of spec.split(';')) {
                const [name, key] = pair.split(':').map(part => part.trim());
                updated = setAttribute(updated, name, escapeHtml(T(key)));
            }
            return `<${tag}${updated}>`;
        }
    );
    return html;
}

function sitemap() {
    const alternates = LANGUAGES
        .map(l => `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${SITE_URL}${l.path}"/>`)
        .join('\n');
    const urls = LANGUAGES.map(l => [
        '  <url>',
        `    <loc>${SITE_URL}${l.path}</loc>`,
        alternates,
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/"/>`,
        '  </url>',
    ].join('\n')).join('\n');
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        urls,
        '</urlset>',
        '',
    ].join('\n');
}

function build(outDir = path.join(__dirname, 'dist')) {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    for (const file of STATIC_FILES) {
        fs.mkdirSync(path.dirname(path.join(outDir, file)), { recursive: true });
        fs.copyFileSync(path.join(__dirname, file), path.join(outDir, file));
    }
    for (const dir of STATIC_DIRS) {
        fs.cpSync(path.join(__dirname, dir), path.join(outDir, dir), { recursive: true });
    }
    const source = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    for (const { code, path: urlPath } of LANGUAGES) {
        const pageDir = path.join(outDir, urlPath);
        fs.mkdirSync(pageDir, { recursive: true });
        fs.writeFileSync(path.join(pageDir, 'index.html'), renderPage(source, code));
    }
    fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap());
}

if (require.main === module) {
    build();
    console.log('Built dist/');
}

module.exports = { build, renderPage, SITE_URL };
