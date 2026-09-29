document.addEventListener('DOMContentLoaded', () => {
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
