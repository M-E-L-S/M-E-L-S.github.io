// Apply the saved appearance before styles finish loading to avoid a flash of defaults.
(() => {
    const DEFAULT_COLOR = '#3295d2';
    let preference = 'light';
    let themeColor = DEFAULT_COLOR;

    try {
        const savedTheme = localStorage.getItem('winy-theme');
        const savedColor = localStorage.getItem('mels-theme-color');
        if (savedTheme === 'light' || savedTheme === 'dark') preference = savedTheme;
        if (/^#[0-9a-f]{6}$/i.test(savedColor || '')) themeColor = savedColor.toLowerCase();
    } catch (_) { /* Storage can be unavailable without breaking appearance controls. */ }

    const toRgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
    const toHex = rgb => `#${rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
    const mix = (color, target, amount) => {
        const source = toRgb(color);
        const destination = toRgb(target);
        return toHex(source.map((value, index) => value + (destination[index] - value) * amount));
    };

    function applyTheme() {
        const root = document.documentElement;
        const dark = preference === 'dark';
        const accent = dark ? mix(themeColor, '#ffffff', 0.25) : themeColor;
        const soft = dark ? mix(themeColor, '#000000', 0.08) : mix(themeColor, '#ffffff', 0.52);
        const strong = dark ? mix(themeColor, '#ffffff', 0.48) : mix(themeColor, '#000000', 0.28);

        root.dataset.theme = dark ? 'dark' : 'light';
        root.style.setProperty('--accent', accent);
        root.style.setProperty('--accent-soft', soft);
        root.style.setProperty('--accent-strong', strong);
        root.style.setProperty('--button-text', strong);
        root.style.setProperty('--announcement-text', strong);
        root.style.setProperty('--subtle-accent', dark ? mix(themeColor, '#ffffff', 0.35) : mix(themeColor, '#000000', 0.15));
        root.style.setProperty('--particle-title', dark ? mix(themeColor, '#ffffff', 0.3) : mix(themeColor, '#000000', 0.04));
        root.style.setProperty('--particle-lyric', dark ? mix(themeColor, '#ffffff', 0.58) : mix(themeColor, '#ffffff', 0.22));

        const themeToggle = document.getElementById('theme-quick-toggle');
        const colorInput = document.getElementById('theme-color');
        const colorValue = document.getElementById('theme-color-value');
        if (themeToggle) {
            const label = dark ? '切换到浅色模式' : '切换到深色模式';
            themeToggle.setAttribute('aria-pressed', String(dark));
            themeToggle.setAttribute('aria-label', label);
            themeToggle.title = label;
            const icon = themeToggle.querySelector('i');
            if (icon) icon.className = dark ? 'fas fa-sun' : 'fas fa-moon';
        }
        if (colorInput) colorInput.value = themeColor;
        if (colorValue) {
            colorValue.value = themeColor.toUpperCase();
            colorValue.textContent = themeColor.toUpperCase();
        }
        document.querySelectorAll('[data-theme-color]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.themeColor.toLowerCase() === themeColor));
        });
    }

    function saveColor(color) {
        if (!/^#[0-9a-f]{6}$/i.test(color)) return;
        themeColor = color.toLowerCase();
        try { localStorage.setItem('mels-theme-color', themeColor); } catch (_) {}
        applyTheme();
    }

    applyTheme();
    window.addEventListener('winy-reset-appearance', () => {
        preference = 'light';
        themeColor = DEFAULT_COLOR;
        try {
            localStorage.removeItem('winy-theme');
            localStorage.removeItem('mels-theme-color');
        } catch (_) {}
        applyTheme();
    });

    document.addEventListener('DOMContentLoaded', () => {
        applyTheme();
        document.getElementById('theme-quick-toggle')?.addEventListener('click', () => {
            preference = preference === 'dark' ? 'light' : 'dark';
            try { localStorage.setItem('winy-theme', preference); } catch (_) {}
            applyTheme();
        });
        document.getElementById('theme-color')?.addEventListener('input', event => saveColor(event.target.value));
        document.querySelectorAll('[data-theme-color]').forEach(button => {
            button.addEventListener('click', () => saveColor(button.dataset.themeColor));
        });
    });
    window.addEventListener('mels-languagechange', applyTheme);
})();
