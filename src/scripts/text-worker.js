importScripts('/src/scripts/text-core.js' + self.location.search);
self.onmessage = event => {
    try { self.postMessage({ ok: true, result: self.MELSTextCore.replace(event.data.input, event.data.options) }); }
    catch (error) { self.postMessage({ ok: false, error: error.message || '替换失败。' }); }
};
