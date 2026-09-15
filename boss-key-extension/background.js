'use strict';
async function execute(action, tab) {
    switch (action) {
        case 'switch': {
            const tabs = (await chrome.tabs.query({})).filter(t => t.id !== tab.id);
            tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
            if (tabs.length) {
                await chrome.tabs.update(tabs[0].id, { active: true });
                if (tabs[0].windowId !== undefined && tabs[0].windowId !== tab.windowId) {
                    await chrome.windows.update(tabs[0].windowId, { focused: true });
                }
            }
            break;
        }
        case 'minimize': await chrome.windows.update(tab.windowId, { state: 'minimized' }); break;
        case 'close-tab': await chrome.tabs.remove(tab.id); break;
        case 'close-browser': {
            const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
            await Promise.all(windows.map(w => chrome.windows.remove(w.id)));
            break;
        }
        default: throw new Error('Unknown action');
    }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'boss-key' || !sender.tab || sender.frameId !== 0) return;
    let url;
    try { url = new URL(sender.url); } catch (_) { return; }
    if (!(url.protocol === 'https:' && url.hostname === 'winyandme.github.io') &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return;
    execute(message.action, sender.tab).then(() => respond({ ok: true }), () => respond({ ok: false }));
    return true;
});
