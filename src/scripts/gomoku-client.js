// Termination is required: synchronous Wasm search cannot receive cancel messages.
export class EngineWorker {
    constructor() {
        this.serial = 0;
        this.worker = null;
        this.pending = null;
    }
    create() {
        const url = new URL('../../assets/gomoku/worker.js', import.meta.url);
        url.search = new URL(import.meta.url).search;
        const worker = this.worker = new Worker(url);
        worker.onmessage = ({ data }) => {
            if (this.worker !== worker || !this.pending || data.id !== this.serial) return;
            const { resolve, reject, timer } = this.pending;
            clearTimeout(timer);
            this.pending = null;
            data.error ? reject(new Error(data.error)) : resolve(data.result);
        };
        worker.onerror = event => {
            if (this.worker === worker) this.stop(new Error(event.message || 'AI 引擎加载失败'));
        };
        worker.onmessageerror = () => {
            if (this.worker === worker) this.stop(new Error('AI 引擎返回的数据无法读取'));
        };
    }
    stop(error = new DOMException('Search cancelled', 'AbortError')) {
        ++this.serial;
        if (this.pending) {
            clearTimeout(this.pending.timer);
            this.pending.reject(error);
            this.pending = null;
        }
        this.worker?.terminate();
        this.worker = null;
    }
    search(moves, limits) {
        if (this.pending) this.stop();
        if (!this.worker) this.create();
        const id = ++this.serial;
        return new Promise((resolve, reject) => {
            // Include a cold download/compilation allowance; never hang forever.
            const timer = setTimeout(() => this.stop(new Error('AI 响应超时，请重试')), limits.hard_ms + 30000);
            this.pending = { resolve, reject, timer };
            try { this.worker.postMessage({ id, moves, limits }); }
            catch (error) { this.stop(error); }
        });
    }
}
