document.addEventListener('DOMContentLoaded', () => {
    // Shared by game and utility pickers; DOM order is the only animation order.
    document.querySelectorAll('.game-picker-menu').forEach(menu => {
        const syncOrder = () => Array.from(menu.children)
            .filter(item => item.classList.contains('game-picker-item'))
            .forEach((item, index) => item.style.setProperty('--picker-index', index));
        syncOrder();
        new MutationObserver(syncOrder).observe(menu, { childList: true });
    });
    document.querySelectorAll('[data-route]').forEach(link => link.addEventListener('click', event => {
        if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const nav = document.querySelector(`.nav-link[data-page="${link.dataset.route}"]`);
        if(nav) { event.preventDefault(); nav.click(); window.scrollTo({top:0,behavior:'instant'}); }
    }));
    document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
        if (button.dataset.action === 'music') {
            const player = document.getElementById('music-player');
            if (player?.hidden) document.getElementById('music-quick-toggle')?.click();
            if (player?.classList.contains('is-collapsed')) document.getElementById('music-collapse-toggle')?.click();
            if (document.getElementById('music-search-panel')?.hidden) document.getElementById('music-search-toggle')?.click();
        } else document.getElementById('settings-toggle')?.click();
    }));
});
