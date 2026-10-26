// Load only on the first AI turn. Closing the owner also interrupts synchronous Wasm.
export class HalmaEngine {
    constructor() { this.client = null; this.generation = 0; }
    stop() { ++this.generation; this.client?.close(); this.client = null; }
    async search(position, difficulty) {
        const generation = this.generation;
        if (!this.client) {
            const version = new URL(import.meta.url).search;
            const { HalmaClient } = await import('../../assets/halma/client.js' + version);
            if (generation !== this.generation) throw new DOMException('Cancelled', 'AbortError');
            const worker = new URL('../../assets/halma/worker.js', import.meta.url); worker.search = version;
            this.client = new HalmaClient(worker);
        }
        const client = this.client;
        let timer;
        try {
            return await Promise.race([
                client.search({ ...position, difficulty }),
                new Promise((_, reject) => { timer = setTimeout(() => {
                    reject(new Error('AI 响应超时，请重试'));
                    if (this.client === client) this.stop();
                }, 35000); })
            ]);
        } finally { clearTimeout(timer); }
    }
}
