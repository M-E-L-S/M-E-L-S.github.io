// Shared, gesture-unlocked Web Audio effects for Wordle and Gomoku.
(function () {
    'use strict';
    let context;
    const effects = {
        key: [[580, .035, 'triangle', .025]],
        erase: [[330, .045, 'sine', .025]],
        select: [[660, .055, 'triangle', .035]],
        stone: [[420, .065, 'triangle', .065], [180, .045, 'sine', .04]],
        absent: [[260, .06, 'sine', .025]],
        present: [[520, .08, 'triangle', .035]],
        correct: [[780, .09, 'triangle', .04]],
        error: [[196, .12, 'sawtooth', .025]],
        undo: [[430, .07, 'sine', .04], [300, .09, 'sine', .035, .05]],
        start: [[523, .09, 'triangle', .045], [784, .12, 'triangle', .045, .07]],
        win: [523, 659, 784, 1047].map((f, i) => [f, .25, 'triangle', .06, i * .13]),
        lose: [440, 349, 262].map((f, i) => [f, .25, 'sine', .045, i * .16]),
        draw: [[440, .15, 'sine', .035], [440, .2, 'sine', .035, .17]]
    };
    function create(button, isVisible) {
        let enabled = true;
        const voices = new Set();
        const active = () => enabled && !document.hidden && isVisible();
        function stop() {
            for (const { oscillator, gain } of voices) {
                try { oscillator.stop(); oscillator.disconnect(); gain.disconnect(); } catch (_) {}
            }
            voices.clear();
        }
        function unlock() {
            if (!active()) return;
            try {
                if (!context || context.state === 'closed') context = new (window.AudioContext || window.webkitAudioContext)();
                if (context.state === 'suspended') context.resume().catch(() => {});
            } catch (_) { /* Audio support must never block a game action. */ }
        }
        function play(name, delay = 0) {
            if (!active() || !context || context.state !== 'running') return;
            for (const [frequency, duration, type, volume, offset = 0] of effects[name] || []) {
                try {
                    const start = context.currentTime + delay + offset;
                    const oscillator = context.createOscillator(), gain = context.createGain();
                    const voice = { oscillator, gain };
                    oscillator.type = type;
                    oscillator.frequency.setValueAtTime(frequency, start);
                    gain.gain.setValueAtTime(.0001, start);
                    gain.gain.linearRampToValueAtTime(volume, start + .004);
                    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
                    oscillator.connect(gain).connect(context.destination);
                    oscillator.onended = () => { voices.delete(voice); oscillator.disconnect(); gain.disconnect(); };
                    voices.add(voice);
                    oscillator.start(start); oscillator.stop(start + duration + .02);
                } catch (_) { /* Audio failures must never interrupt play. */ }
            }
        }
        button.addEventListener('click', () => {
            enabled = !enabled;
            button.innerHTML = `<i class="fas fa-volume-${enabled ? 'high' : 'xmark'}" aria-hidden="true"></i>`;
            button.classList.toggle('off', !enabled);
            button.setAttribute('aria-pressed', String(enabled));
            if (enabled) { unlock(); play('select'); } else stop();
        });
        document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
        window.addEventListener('pagehide', stop);
        return { unlock, play, stop };
    }
    window.MELSGameAudio = { create };
})();
