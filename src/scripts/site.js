document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-route]').forEach(link => link.addEventListener('click', event => {
        if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const nav = document.querySelector(`.nav-link[data-page="${link.dataset.route}"]`);
        if(nav) { event.preventDefault(); nav.click(); window.scrollTo({top:0,behavior:'instant'}); }
    }));
    document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
        if (button.dataset.action === 'music') {
            if (document.getElementById('music-player')?.hidden) document.getElementById('music-quick-toggle')?.click();
            document.getElementById('music-search-toggle')?.click();
        } else document.getElementById('settings-toggle')?.click();
    }));
});
