import { createParticleObject } from '../../vendor/particle-object.js';

const home = document.getElementById('home');
const stage = document.getElementById('particle-title-stage');
const titleCanvas = document.getElementById('particle-title-canvas');
const lyricCanvas = document.getElementById('particle-lyric-canvas');
const toggle = document.getElementById('particle-title-toggle');
const supportNote = document.getElementById('particle-title-support');

let enabled = false;
let titleParticles = null;
let lyricParticles = null;
let titleAssetUrl = null;
let lyricAssetUrl = null;
let failed = false;
let titleReady = false;
let lyricReady = false;
let liveLyricActive = stage.classList.contains('has-home-lyric');
let liveLyricText = document.getElementById('home-subtitle')?.textContent || '♪';
const staleLyricUrls = new Set();
let lyricLayout = { width: 1440, overflow: 0 };
let scrollFrame = 0;
let scrollStart = 0;
const lyricMeasure = document.createElement('canvas').getContext('2d');

function lyricScale() {
    return titleScale() * 0.72 * lyricLayout.width / 1200;
}

function resetLyricScroll() {
    cancelAnimationFrame(scrollFrame);
    scrollStart = 0;
    const extent = lyricLayout.overflow * titleScale() * 0.72 / 2400;
    lyricParticles?.setOptions({ xOffset: extent });
    if (!extent || !lyricParticles) return;
    function frame(time) {
        if (!scrollStart) scrollStart = time;
        // Pause at both ends, then return smoothly so no text jumps or disappears.
        const travel = Math.max(2400, lyricLayout.overflow / 100 * 1000);
        const phase = (time - scrollStart) % (2 * travel + 2400);
        const progress = phase < 1200 ? 0 : phase < travel + 1200
            ? (phase - 1200) / travel : phase < travel + 2400
                ? 1 : 1 - (phase - travel - 2400) / travel;
        lyricParticles?.setOptions({ xOffset: extent * (1 - 2 * progress) });
        scrollFrame = requestAnimationFrame(frame);
    }
    scrollFrame = requestAnimationFrame(frame);
}

try {
    const saved = localStorage.getItem('winy-particle-title');
    if (saved !== null) enabled = saved === 'true';
} catch (_) {}
toggle.checked = enabled;

function cssColor(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function titleScale() {
    const aspect = Math.max(stage.clientWidth, 1) / Math.max(stage.clientHeight, 1);
    return Math.min(10.6, Math.max(5.2, aspect * 4.25));
}

function paddedFov() {
    // Preserve text size while extending the camera view into the canvas gutter.
    const ratio = titleCanvas.clientHeight / Math.max(stage.clientHeight, 1);
    return 2 * Math.atan(Math.tan(65 * Math.PI / 360) * ratio) * 180 / Math.PI;
}

function escapeSvgText(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function lyricWidthUnits(value) {
    return Array.from(value).reduce((total, character) =>
        total + (/[^\u0000-\u00ff]/.test(character) ? 1 : 0.58), 0);
}

function createTitleAsset() {
    const color = cssColor('--particle-title', '#368fca');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="260" viewBox="0 0 1200 260">
        <text x="600" y="205" text-anchor="middle" fill="${color}"
            font-family="Segoe UI, Microsoft YaHei, sans-serif"
            font-size="190" font-weight="800">M.E.的家</text>
    </svg>`;
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}

function createLyricAsset() {
    const color = cssColor('--particle-lyric', '#65acd9');
    const text = liveLyricActive ? liveLyricText : '✦ 愿每日平安幸福 ✦';
    const lines = String(text || '♪').split('\n').slice(0, 2);
    // Convert the available screen width to source-image units at the lyric plane.
    const worldPerPixel = 2 * (4.2 - 2.35 / Math.sqrt(17)) * Math.tan(65 * Math.PI / 360)
        / Math.max(stage.clientHeight, 1);
    const availablePixels = Math.max(160, Math.min(window.innerWidth - 64, stage.clientWidth + 140));
    // Start scrolling at 72% of the previous width, without shrinking the font further.
    const scrollWindowPixels = Math.max(160, availablePixels * 0.72);
    lyricCanvas.style.setProperty('--lyric-window-width', `${scrollWindowPixels}px`);
    const sourceUnitsPerPixel = worldPerPixel / (titleScale() * 0.72 / 1200);
    const visibleWidth = scrollWindowPixels * sourceUnitsPerPixel;
    const fontFitWidth = availablePixels * sourceUnitsPerPixel;
    function measure(line, size) {
        if (!lyricMeasure) return lyricWidthUnits(line) * size;
        lyricMeasure.font = `500 ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;
        return lyricMeasure.measureText(line).width;
    }
    const maxWidth = Math.max(...lines.map(line => measure(line, 68)), 1);
    const fontSize = Math.max(52, Math.min(68, Math.floor(68 * fontFitWidth / maxWidth)));
    const sizes = lines.map((_, index) => Math.max(52, fontSize - index * 4));
    const textWidth = Math.max(...lines.map((line, index) => measure(line, sizes[index])));
    const width = Math.ceil(Math.max(1440, textWidth + 80));
    lyricLayout = { width, overflow: Math.max(0, textWidth - visibleWidth) };
    const positions = lines.length > 1 ? [76, 156] : [118];
    const lyricMarkup = lines.map((line, index) => {
        return `<text x="${width / 2}" y="${positions[index]}" text-anchor="middle"
            fill="${color}" font-family="Segoe UI, Microsoft YaHei, sans-serif"
            font-size="${sizes[index]}" font-weight="500">${escapeSvgText(line)}</text>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="200" viewBox="0 0 ${width} 200">
        ${lyricMarkup}
    </svg>`;
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}

function describeSupport(message = '') {
    if (message) supportNote.textContent = message;
    else if (!enabled) supportNote.textContent = '首页当前显示普通文字。';
    else if (failed) supportNote.textContent = '当前环境无法运行粒子效果，已自动保留普通文字。';
    else supportNote.textContent = titleParticles && lyricParticles ? '粒子文字已开启。' : '粒子文字将在首页加载…';
}

function revealWhenReady() {
    if (!titleReady || !lyricReady) return;
    stage.classList.add('is-particle-ready');
    describeSupport('粒子文字已开启，移动鼠标即可拨散粒子。');
}

function revokeAssets() {
    if (titleAssetUrl) URL.revokeObjectURL(titleAssetUrl);
    if (lyricAssetUrl) URL.revokeObjectURL(lyricAssetUrl);
    titleAssetUrl = null;
    lyricAssetUrl = null;
    staleLyricUrls.forEach(url => URL.revokeObjectURL(url));
    staleLyricUrls.clear();
}

function stop() {
    cancelAnimationFrame(scrollFrame);
    stage.classList.remove('is-particle-ready');
    titleParticles?.destroy();
    lyricParticles?.destroy();
    titleParticles = null;
    lyricParticles = null;
    titleReady = false;
    lyricReady = false;
    revokeAssets();
}

function fail(error) {
    console.warn('Particle title could not initialize:', error);
    failed = true;
    stop();
    describeSupport();
}

function start() {
    if (titleParticles || lyricParticles || failed) return;
    const mobile = window.matchMedia('(max-width: 600px)').matches;
    titleAssetUrl = createTitleAsset();
    lyricAssetUrl = createLyricAsset();
    try {
        titleParticles = createParticleObject({ canvas: titleCanvas, interactionTarget: stage }, {
            src: titleAssetUrl,
            count: mobile ? 6000 : 9000,
            size: 2.45,
            sizeVariance: 0.65,
            radius: 105,
            strength: 1.15,
            swirl: 0.7,
            spring: 1.1,
            damping: 0.38,
            drift: 0.32,
            scale: titleScale(),
            fov: paddedFov(),
            yOffset: 0.34,
            floatIntensity: 0.18,
            rotationIntensity: 0.035,
            floatSpeed: 0.7,
            orbit: false,
            zoom: false,
            autoRotate: false,
            onLoad() {
                if (!titleParticles) return;
                titleReady = true;
                revealWhenReady();
            },
            onError: fail,
        });
        lyricParticles = createParticleObject({ canvas: lyricCanvas, interactionTarget: home }, {
            src: lyricAssetUrl,
            count: mobile ? 1600 : 2600,
            imageParticleDensity: mobile ? 0.24 : 0.36,
            maxImageParticles: mobile ? 6000 : 10000,
            size: 2.3,
            sizeVariance: 0.35,
            radius: 90,
            strength: 1.4,
            swirl: 0.3,
            spring: 2.4,
            damping: 0.85,
            drift: 0.12,
            scale: lyricScale(),
            fov: paddedFov(),
            yOffset: -1.8,
            floatIntensity: 0.08,
            rotationIntensity: 0.012,
            floatSpeed: 0.55,
            orbit: false,
            zoom: false,
            autoRotate: false,
            morph: true,
            normalizeImage: false,
            rasterSize: 4096,
            onLoad() {
                if (!lyricParticles) return;
                lyricReady = true;
                resetLyricScroll();
                staleLyricUrls.forEach(url => URL.revokeObjectURL(url));
                staleLyricUrls.clear();
                revealWhenReady();
            },
            onError: fail,
        });
    } catch (error) {
        fail(error);
        return;
    }
    if (!titleParticles || !lyricParticles) fail(new Error('WebGL particle renderer unavailable'));
    else describeSupport();
}

function updateLyricParticles() {
    if (!lyricParticles) return;
    const previousUrl = lyricAssetUrl;
    lyricAssetUrl = createLyricAsset();
    if (previousUrl) staleLyricUrls.add(previousUrl);
    cancelAnimationFrame(scrollFrame);
    lyricParticles.setOptions({ src: lyricAssetUrl, scale: lyricScale(), xOffset: 0 });
}

function sync() {
    if (enabled && home.classList.contains('active') && !document.hidden) start();
    else stop();
    describeSupport();
}

toggle.addEventListener('change', () => {
    enabled = toggle.checked;
    failed = false;
    try { localStorage.setItem('winy-particle-title', String(enabled)); } catch (_) {}
    sync();
});

window.addEventListener('winy-reset-appearance', () => {
    enabled = false;
    failed = false;
    toggle.checked = false;
    try { localStorage.removeItem('winy-particle-title'); } catch (_) {}
    sync();
});

window.addEventListener('winy-home-lyric-change', event => {
    const nextActive = Boolean(event.detail?.active);
    const nextText = String(event.detail?.text || '♪');
    const changed = nextActive !== liveLyricActive || nextText !== liveLyricText;
    liveLyricActive = nextActive;
    liveLyricText = nextText;
    if (changed) updateLyricParticles();
});

new MutationObserver(sync).observe(home, { attributes: true, attributeFilter: ['class'] });
new MutationObserver(() => {
    if (!titleParticles && !lyricParticles) return;
    stop();
    sync();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

new ResizeObserver(() => {
    const scale = titleScale();
    const fov = paddedFov();
    titleParticles?.setOptions({ scale, fov });
    lyricParticles?.setOptions({ fov });
    updateLyricParticles();
}).observe(stage);

document.addEventListener('visibilitychange', sync);
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', sync);
sync();
