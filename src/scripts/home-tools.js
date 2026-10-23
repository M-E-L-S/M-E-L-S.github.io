(function () {
    'use strict';
    const previews = {
        tools: {
            acronym: ['缩写转义', '/tools/acronym/'], arg: ['ARG 辅助器', '/tools/arg/'],
            favicon: ['Favicon 图包', '/tools/favicon/'], text: ['快捷文本工作台', '/tools/text/'], aicu: ['B站记录查询', '/tools/aicu/']
        },
        game: {
            llk: ['连连看', '/minigame/link/'], mine: ['扫雷', '/minigame/minesweeper/'], spider: ['蜘蛛纸牌', '/minigame/spider/'],
            wordle: ['Wordle', '/minigame/wordle/'], gomoku: ['五子棋', '/minigame/gomoku/']
        },
        freshcup: { score: ['计分器', '/freshcup/'], damage: ['伤害计算器', '/freshcup/calculator/'] }
    };
    function initPreviewArtwork(stage) {
        stage.querySelectorAll('[data-roll-number]').forEach(number => {
            const fragment = document.createDocumentFragment();
            let column = 0;
            for (const character of number.dataset.rollNumber) {
                if (!/\d/.test(character)) { fragment.append(document.createTextNode(character)); continue; }
                const reel = document.createElement('span'), track = document.createElement('span');
                reel.className = 'number-reel'; track.className = 'number-track';
                const steps = 20 + Number(character);
                track.style.setProperty('--roll-steps', steps);
                track.style.setProperty('--roll-delay', `${column++ * .08}s`);
                for (let i = 0; i <= steps; i++) {
                    const digit = document.createElement('i'); digit.textContent = String(i % 10); track.append(digit);
                }
                reel.append(track); fragment.append(reel);
            }
            number.classList.add('rolling-number'); number.replaceChildren(fragment);
        });
        const faviconSlide = stage.querySelector('.tools-slide-favicon');
        if (faviconSlide) {
            const positionFavicon = () => {
                const slide = faviconSlide.getBoundingClientRect();
                const icon = faviconSlide.querySelector('.tools-browser-tab>b').getBoundingClientRect();
                faviconSlide.style.setProperty('--favicon-x', `${icon.left + icon.width / 2 - slide.left - slide.width / 2}px`);
                faviconSlide.style.setProperty('--favicon-y', `${icon.top + icon.height / 2 - slide.top - slide.height / 2}px`);
            };
            if (typeof ResizeObserver !== 'undefined') new ResizeObserver(positionFavicon).observe(stage);
            else window.addEventListener('resize', positionFavicon);
            positionFavicon();
        }
    }
    function initCarousel(stage) {
        initPreviewArtwork(stage);
        const page = stage.dataset.featureCarousel;
        const card = stage.closest('.feature-carousel-card');
        const slides = Array.from(stage.querySelectorAll('.tools-slide'));
        const dots = Array.from(stage.querySelectorAll('[data-tools-slide]'));
        const link = stage.querySelector('.tools-slide-link');
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
        let index = 0, timer = null, hovered = false, focused = false;
        let inView = typeof IntersectionObserver === 'undefined';
        function schedule() {
            clearTimeout(timer); timer = null;
            stage.classList.toggle('is-preview-visible', inView && !document.hidden && !reducedMotion.matches);
            if (inView && !hovered && !focused && !document.hidden && !reducedMotion.matches) {
                timer = setTimeout(() => show(index + 1), 4000);
            }
        }
        function updateLink() {
            const tool = slides[index].dataset.tool;
            const [name, href] = previews[page][tool];
            link.setAttribute('href', href);
            link.setAttribute('aria-label', name);
            dots.forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === index)));
        }
        function show(next, direction = 1) {
            next = (next + slides.length) % slides.length;
            if (next === index) { schedule(); return; }
            const outgoing = slides[index], incoming = slides[next];
            // Reset a reused slide offscreen before starting its entrance, even
            // when the user clicks repeatedly during the previous transition.
            incoming.style.transition = 'none';
            for (const slide of slides) if (slide !== outgoing) slide.classList.remove('is-active', 'is-leaving', 'from-left', 'to-right');
            incoming.classList.toggle('from-left', direction < 0);
            void incoming.offsetWidth;
            incoming.style.removeProperty('transition');
            outgoing.classList.remove('is-active'); outgoing.classList.add('is-leaving');
            outgoing.classList.toggle('to-right', direction < 0);
            incoming.classList.add('is-active');
            index = next;
            updateLink();
            schedule();
        }
        stage.querySelector('[data-tools-prev]').addEventListener('click', () => show(index - 1, -1));
        stage.querySelector('[data-tools-next]').addEventListener('click', () => show(index + 1));
        dots.forEach((dot, i) => dot.addEventListener('click', () => show(i, i < index ? -1 : 1)));
        link.addEventListener('click', event => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            // Reuse the page, game and tool route listeners without restarting music.
            history.pushState({ page }, '', link.getAttribute('href'));
            window.dispatchEvent(new PopStateEvent('popstate'));
            window.scrollTo({ top: 0, behavior: 'instant' });
        });
        updateLink();
        stage.querySelector('.tools-slide-controls').hidden = false;
        stage.querySelector('.tools-slide-dots').hidden = false;
        card.addEventListener('pointerenter', () => { hovered = true; schedule(); });
        card.addEventListener('pointerleave', () => { hovered = false; schedule(); });
        card.addEventListener('focusin', () => { focused = true; schedule(); });
        card.addEventListener('focusout', event => {
            if (!card.contains(event.relatedTarget)) { focused = false; schedule(); }
        });
        document.addEventListener('visibilitychange', schedule);
        reducedMotion.addEventListener('change', schedule);
        window.addEventListener('pagehide', () => { clearTimeout(timer); stage.classList.remove('is-preview-visible'); });
        window.addEventListener('pageshow', schedule);
        if (typeof IntersectionObserver !== 'undefined') {
            new IntersectionObserver(entries => {
                inView = entries[0].isIntersecting;
                schedule();
            }, { threshold: .15 }).observe(stage);
        }
        schedule();
    }
    function initMusicPreview() {
        const art = document.querySelector('.record-art');
        if (!art) return;
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
        let inView = typeof IntersectionObserver === 'undefined';
        const sync = () => art.classList.toggle('is-animating', inView && !document.hidden && !reducedMotion.matches);
        if (typeof IntersectionObserver !== 'undefined') {
            new IntersectionObserver(entries => { inView = entries[0].isIntersecting; sync(); }, { threshold: .1 }).observe(art);
        }
        document.addEventListener('visibilitychange', sync);
        reducedMotion.addEventListener('change', sync);
        window.addEventListener('pagehide', () => art.classList.remove('is-animating'));
        window.addEventListener('pageshow', sync);
        sync();
    }
    function init() {
        document.querySelectorAll('[data-feature-carousel]').forEach(initCarousel);
        initMusicPreview();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
