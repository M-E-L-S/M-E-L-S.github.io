// Wordle：经典五字母 + 考试五字母 + 长单词滑动匹配。
// 核心逻辑与 DOM 分离，便于在 Node 中测试。
// 许可：经典与考试五字母模式的原创实现适用仓库 MIT 条款；长单词模式的
// 原创实现与可版权表达明确排除在 MIT 之外，详见 LONG-WORDLE-NONCOMMERCIAL-LICENSE.md。
(function (root) {
    'use strict';

    const ANSWERS = {
        // 页面启动后会由原版 2,315 词数据文件替换；这里只保留加载占位。
        5: ['apple']
    };

    function cleanWord(word) { return String(word || '').trim().toLowerCase(); }

    // offset 为猜词首字母在答案中的零基位置。黄字从“整个答案”剩余字母中扣除，
    // 而不是只查看被猜词覆盖的窗口；这也是长单词模式与普通 Wordle 的关键差异。
    function evaluateGuess(answer, guess, offset) {
        answer = cleanWord(answer);
        guess = cleanWord(guess);
        offset = Number.isInteger(offset) ? offset : 0;
        if (!/^[a-z]+$/.test(answer) || !/^[a-z]+$/.test(guess)) throw new Error('Words must contain letters only');
        if (offset < 0 || offset + guess.length > answer.length) throw new RangeError('Guess does not fit at this alignment');

        const result = new Array(guess.length).fill('absent');
        const remaining = Object.create(null);
        const exactAnswerIndexes = new Set();
        for (let i = 0; i < guess.length; i++) {
            const ai = offset + i;
            if (guess[i] === answer[ai]) {
                result[i] = 'correct';
                exactAnswerIndexes.add(ai);
            }
        }
        for (let i = 0; i < answer.length; i++) {
            if (!exactAnswerIndexes.has(i)) remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
        }
        for (let i = 0; i < guess.length; i++) {
            if (result[i] === 'correct') continue;
            const letter = guess[i];
            if (remaining[letter] > 0) {
                result[i] = 'present';
                remaining[letter]--;
            }
        }
        return result;
    }

    function chooseAnswer(mode, rng) {
        rng = typeof rng === 'function' ? rng : Math.random;
        if (mode === 'classic') {
            const pool = ANSWERS[5];
            return pool[Math.floor(rng() * pool.length)];
        }
        throw new Error('This mode requires an exam vocabulary pool');
    }

    function chooseExamAnswer(words, mode, rng) {
        rng = typeof rng === 'function' ? rng : Math.random;
        words = Array.from(new Set((words || []).map(cleanWord).filter(word => /^[a-z]+$/.test(word))));
        if (mode === 'exam') {
            const pool = words.filter(word => word.length === 5);
            if (!pool.length) throw new Error('No five-letter answers in exam vocabulary');
            return pool[Math.floor(rng() * pool.length)];
        }
        const byLength = { 6: [], 7: [], 8: [], 9: [] };
        words.forEach(word => { if (byLength[word.length]) byLength[word.length].push(word); });
        // 长词长度权重独立于各词表规模，让 8–9 字母答案保持明显少见。
        const weights = [[6, 0.42], [7, 0.38], [8, 0.13], [9, 0.07]].filter(([n]) => byLength[n].length);
        if (!weights.length) throw new Error('No 6–9 letter answers in exam vocabulary');
        const total = weights.reduce((sum, item) => sum + item[1], 0);
        let roll = rng() * total, length = weights[weights.length - 1][0];
        for (const item of weights) { roll -= item[1]; if (roll < 0) { length = item[0]; break; } }
        const pool = byLength[length];
        return pool[Math.floor(rng() * pool.length)];
    }

    class WordleGame {
        constructor(options) {
            options = options || {};
            this.mode = options.mode === 'long' ? 'long' : (options.mode === 'exam' ? 'exam' : 'classic');
            this.answer = cleanWord(options.answer || chooseAnswer(this.mode, options.rng));
            this.maxAttempts = this.mode === 'long' ? 8 : 6;
            this.validWords = options.validWords || null;
            this.guesses = [];
            this.over = false;
            this.won = false;
            if ((this.mode === 'classic' || this.mode === 'exam') && this.answer.length !== 5) throw new Error('Five-letter mode answer must be 5 letters');
            if (this.mode === 'long' && (this.answer.length < 6 || this.answer.length > 9)) throw new Error('Long answer must be 6–9 letters');
        }

        alignmentsFor(guess) {
            const n = cleanWord(guess).length;
            if (n < (this.mode === 'long' ? 5 : 5) || n > this.answer.length) return [];
            return Array.from({ length: this.answer.length - n + 1 }, (_, i) => i);
        }

        submit(word, offset) {
            if (this.over) return { status: 'over' };
            const guess = cleanWord(word);
            const min = this.mode === 'long' ? 5 : 5;
            const max = this.mode === 'long' ? this.answer.length : 5;
            if (!/^[a-z]+$/.test(guess)) return { status: 'invalid', message: '只能输入英文字母' };
            if (guess.length < min || guess.length > max) return { status: 'invalid', message: `请输入 ${min}${min === max ? '' : '–' + max} 个字母` };
            if (this.validWords && !this.validWords.has(guess)) return { status: 'invalid', message: '词库中没有这个单词' };
            offset = this.mode === 'long' ? Number(offset) : 0;
            if (!Number.isInteger(offset) || offset < 0 || offset + guess.length > this.answer.length) return { status: 'invalid', message: '请选择有效的对齐位置' };
            const marks = evaluateGuess(this.answer, guess, offset);
            const won = guess.length === this.answer.length && offset === 0 && guess === this.answer;
            const row = { guess, offset, marks };
            this.guesses.push(row);
            this.won = won;
            this.over = won || this.guesses.length >= this.maxAttempts;
            return { status: won ? 'win' : (this.over ? 'lose' : 'ok'), row, attemptsLeft: this.maxAttempts - this.guesses.length };
        }
    }

    WordleGame.ANSWERS = ANSWERS;
    WordleGame.evaluateGuess = evaluateGuess;
    WordleGame.chooseAnswer = chooseAnswer;
    WordleGame.chooseExamAnswer = chooseExamAnswer;
    root.WordleGame = WordleGame;
    if (typeof module !== 'undefined' && module.exports) module.exports = WordleGame;
})(globalThis);

(function () {
    'use strict';
    if (typeof document === 'undefined' || !globalThis.WordleGame) return;
    const $ = (id) => document.getElementById(id);
    const STREAK_KEY = 'winy_wordle_streak_v1';
    const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    const rank = { absent: 1, present: 2, correct: 3 };
    const VOCAB_LABELS = { cet4: 'CET-4', cet6: 'CET-6', ielts: 'IELTS', toefl: 'TOEFL', gre: 'GRE', kaoyan: '考研英语' };
    const VOCAB_COUNTS = {
        cet4: [363, 1503], cet6: [287, 1439], ielts: [385, 2106],
        toefl: [534, 2639], gre: [653, 3787], kaoyan: [514, 2195]
    };
    let mode = 'classic', vocab = 'cet4', game, visible = false, keyMarks = Object.create(null), streak = 0;
    let draft = '', draftOffset = 0, drag = null;
    let validWords = null, examWords = null, examDefinitions = null, dictionaryState = 'loading';

    function loadStreak() { try { streak = Number(localStorage.getItem(STREAK_KEY)) || 0; } catch (e) { streak = 0; } }
    function saveStreak() { try { localStorage.setItem(STREAK_KEY, String(streak)); } catch (e) { /* ignore */ } }
    function message(text, kind) {
        const el = $('wordle-message');
        el.textContent = text;
        el.className = 'wordle-message' + (kind ? ' ' + kind : '');
    }

    function loadDictionary() {
        dictionaryState = 'loading';
        const loadText = path => fetch(path, { cache: 'force-cache' }).then(response => {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.text();
        });
        return Promise.all([
            loadText('assets/data/wordle-words.txt'),
            loadText('assets/data/wordle-classic-answers.txt'),
            loadText('assets/data/wordle-cet4.txt'),
            loadText('assets/data/wordle-cet6.txt'),
            loadText('assets/data/wordle-ielts.txt'),
            loadText('assets/data/wordle-toefl.txt'),
            loadText('assets/data/wordle-gre.txt'),
            loadText('assets/data/wordle-kaoyan.txt'),
            loadText('assets/data/wordle-exam-definitions.json')
        ])
            .then(([guessText, classicText, cet4Text, cet6Text, ieltsText, toeflText, greText, kaoyanText, definitionsText]) => {
                const classicAnswers = classicText.split(/\s+/).map(word => String(word).trim().toLowerCase()).filter(word => /^[a-z]{5}$/.test(word));
                if (classicAnswers.length < 2000) throw new Error('Classic answer list is incomplete');
                globalThis.WordleGame.ANSWERS[5] = Array.from(new Set(classicAnswers));
                examWords = { cet4: cet4Text, cet6: cet6Text, ielts: ieltsText, toefl: toeflText, gre: greText, kaoyan: kaoyanText };
                Object.keys(examWords).forEach(key => {
                    examWords[key] = Array.from(new Set(examWords[key].split(/\s+/).filter(word => /^[a-z]{5,9}$/.test(word))));
                    if (examWords[key].length < 1000) throw new Error(key + ' exam list is incomplete');
                });
                examDefinitions = JSON.parse(definitionsText);
                validWords = new Set(guessText.split(/\s+/).filter(Boolean));
                Object.values(globalThis.WordleGame.ANSWERS).flat().forEach(word => validWords.add(word));
                Object.values(examWords).flat().forEach(word => validWords.add(word));
                dictionaryState = 'ready';
                // 加载期间不能提交，安全地用真实词表重新开局并替换占位答案。
                if (game && !game.guesses.length) newGame();
            })
            .catch(() => {
                dictionaryState = 'failed';
                message('单词词库加载失败，请刷新页面重试', 'error');
            });
    }

    function renderKeyboard() {
        const host = $('wordle-keyboard');
        host.innerHTML = '';
        KEY_ROWS.forEach((letters, rowIndex) => {
            const row = document.createElement('div'); row.className = 'wordle-key-row';
            if (rowIndex === 2) row.appendChild(makeKey('⌫', 'wide', 'Backspace'));
            letters.split('').forEach(letter => row.appendChild(makeKey(letter, keyMarks[letter.toLowerCase()] || '', letter)));
            if (rowIndex === 2) row.appendChild(makeKey('↵', 'wide', 'Enter'));
            host.appendChild(row);
        });
    }
    function makeKey(label, cls, value) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'wordle-key ' + cls;
        b.textContent = label; b.dataset.key = value; b.setAttribute('aria-label', value);
        return b;
    }

    function flashKey(key) {
        const wanted = String(key).toUpperCase();
        const button = Array.from($('wordle-keyboard').querySelectorAll('[data-key]')).find(el => el.dataset.key.toUpperCase() === wanted);
        if (!button) return;
        button.classList.add('pressed');
        setTimeout(() => button.classList.remove('pressed'), 110);
    }

    function paintGlossRow(id, word, data) {
        const row = $(id);
        row.hidden = !data;
        if (!data) return false;
        row.querySelector('strong').textContent = word.toUpperCase();
        row.querySelector('em').textContent = `${data[0]} · ${data[1]}`;
        return true;
    }

    function updateGlossary(guess, revealAnswer) {
        const panel = $('wordle-glossary');
        if (mode === 'classic' || !examDefinitions) { panel.hidden = true; return; }
        const dictionary = examDefinitions[vocab] || {};
        const hasGuess = paintGlossRow('wordle-guess-gloss', guess, guess ? dictionary[guess] : null);
        const hasAnswer = paintGlossRow('wordle-answer-gloss', game.answer, revealAnswer ? dictionary[game.answer] : null);
        panel.hidden = !(hasGuess || hasAnswer);
    }

    function updateModeNote() {
        const note = $('wordle-mode-note');
        if (mode === 'classic') {
            note.innerHTML = '题库说明：答案库为原版 Wordle 的 <b>2,315</b> 个经典答案；猜词库为宽泛英文词表中的五字母单词。 ' +
                '<a href="https://github.com/dbraginskiy/wordle/blob/master/wordle-answers.txt" target="_blank" rel="noopener noreferrer">答案库来源</a> · ' +
                '<a href="https://www.npmjs.com/package/word-list" target="_blank" rel="noopener noreferrer">猜词库来源</a>';
            return;
        }
        const counts = VOCAB_COUNTS[vocab];
        const source = '<a href="https://github.com/RealKai42/qwerty-learner/tree/master/public/dicts" target="_blank" rel="noopener noreferrer">考试词库来源</a>';
        const guesses = '<a href="https://www.npmjs.com/package/word-list" target="_blank" rel="noopener noreferrer">猜词库来源</a>';
        if (mode === 'exam') {
            note.innerHTML = `题库说明：答案库从 <b>${VOCAB_LABELS[vocab]}</b> 中筛选出 <b>${counts[0]}</b> 个五字母单词；猜词库为宽泛英文词表中的五字母单词。 ${source} · ${guesses}`;
        } else {
            note.innerHTML = `题库说明：答案库从 <b>${VOCAB_LABELS[vocab]}</b> 中筛选出 <b>${counts[1].toLocaleString()}</b> 个 6–9 字母单词，6–7 字母优先抽取；猜词库为宽泛英文词表中长度介于 5 与本局答案长度之间的单词。 ${source} · ${guesses}`;
        }
    }

    function makeTile(letter, state) {
        const tile = document.createElement('div');
        tile.className = 'wordle-tile' + (state ? ' ' + state : '');
        if (letter) tile.textContent = letter.toUpperCase();
        return tile;
    }

    function layoutTrack(row, track, offset) {
        if (!row || !track || !row.clientWidth) return;
        const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
        const cell = (row.clientWidth - gap * (game.answer.length - 1)) / game.answer.length;
        track.style.width = (cell * draft.length + gap * Math.max(0, draft.length - 1)) + 'px';
        track.style.left = ((cell + gap) * offset) + 'px';
    }

    function attachDrag(row, track) {
        requestAnimationFrame(() => layoutTrack(row, track, draftOffset));
        track.addEventListener('pointerdown', (e) => {
            if (mode !== 'long' || game.over || draft.length >= game.answer.length) return;
            e.preventDefault();
            const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
            const step = (row.clientWidth - gap * (game.answer.length - 1)) / game.answer.length + gap;
            drag = { id: e.pointerId, x: e.clientX, start: draftOffset, step, max: game.answer.length - draft.length };
            track.setPointerCapture?.(e.pointerId);
            track.classList.add('dragging');
        });
        track.addEventListener('pointermove', (e) => {
            if (!drag || drag.id !== e.pointerId) return;
            const raw = e.clientX - drag.x;
            const min = -drag.start * drag.step, max = (drag.max - drag.start) * drag.step;
            track.style.transform = `translateX(${Math.max(min, Math.min(max, raw))}px)`;
        });
        const finish = (e) => {
            if (!drag || drag.id !== e.pointerId) return;
            const delta = Math.round((e.clientX - drag.x) / drag.step);
            const next = Math.max(0, Math.min(drag.max, drag.start + delta));
            drag = null; track.classList.remove('dragging'); track.style.transform = '';
            setAlignment(next);
        };
        track.addEventListener('pointerup', finish);
        track.addEventListener('pointercancel', finish);
    }

    function renderBoard() {
        const board = $('wordle-board');
        const n = game.answer.length;
        for (let rowIndex = 0; rowIndex < game.maxAttempts; rowIndex++) {
            const entry = game.guesses[rowIndex];
            const active = !game.over && rowIndex === game.guesses.length;
            const row = board.children[rowIndex] || board.appendChild(document.createElement('div'));
            // 已提交的行保持原节点，避免后续输入、提交或 resize 重播翻转动画。
            if (entry && row.renderedEntry === entry) continue;
            const slidable = active && mode === 'long' && draft.length >= 5 && draft.length < n;
            row.className = 'wordle-row' + (active ? ' active' : '') + (slidable ? ' slidable' : '');
            row.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
            row.style.maxWidth = (n * 56) + 'px';
            row.style.setProperty('--answer-len', n);
            if (entry) row.replaceChildren();
            for (let i = 0; i < n; i++) {
                if (entry) {
                    const gi = i - entry.offset;
                    const tile = gi >= 0 && gi < entry.guess.length ? makeTile(entry.guess[gi], entry.marks[gi]) : makeTile('', 'unused');
                    if (gi >= 0) tile.style.animationDelay = (gi * 70) + 'ms';
                    row.appendChild(tile);
                } else {
                    const tile = row.children[i] || row.appendChild(makeTile('', active ? 'slot' : 'future'));
                    tile.className = 'wordle-tile ' + (active ? 'slot' : 'future');
                }
            }
            let track = row.querySelector('.wordle-draft-track');
            if (active && draft.length) {
                if (!track) {
                    track = document.createElement('div');
                    attachDrag(row, track);
                    row.appendChild(track);
                }
                track.className = 'wordle-draft-track' + (slidable ? ' alignable' : '');
                track.style.setProperty('--guess-len', draft.length);
                track.style.setProperty('--offset', draftOffset);
                track.style.gridTemplateColumns = `repeat(${draft.length}, minmax(0, 1fr))`;
                // 保留已有字母，只为新输入的字母创建节点并播放 pop 动画。
                while (track.children.length > draft.length) track.lastElementChild.remove();
                for (let i = track.children.length; i < draft.length; i++) {
                    track.appendChild(makeTile(draft[i], 'filled'));
                }
                layoutTrack(row, track, draftOffset);
            } else if (track) track.remove();
            row.renderedEntry = entry;
        }
    }

    function updateAlignControls() {
        if (!game) return;
        const max = Math.max(0, game.answer.length - draft.length);
        const show = mode === 'long' && draft.length >= 5 && max > 0 && !game.over;
        $('wordle-align-controls').hidden = !show;
        $('wordle-align-hint').textContent = `拖动当前字母组调整对齐 · 第 ${draftOffset + 1} 位`;
        $('wordle-slide-left').disabled = draftOffset <= 0;
        $('wordle-slide-right').disabled = draftOffset >= max;
    }

    function setAlignment(next) {
        const max = Math.max(0, game.answer.length - draft.length);
        draftOffset = Math.max(0, Math.min(max, Number(next) || 0));
        const track = $('wordle-board').querySelector('.wordle-draft-track');
        if (track) layoutTrack(track.parentNode, track, draftOffset);
        updateAlignControls();
    }

    function slideAlignment(delta) { setAlignment(draftOffset + delta); }

    function newGame() {
        let answer;
        if (mode !== 'classic') {
            answer = examWords ? globalThis.WordleGame.chooseExamAnswer(examWords[vocab], mode) : (mode === 'exam' ? 'apple' : 'planet');
        }
        game = new globalThis.WordleGame({ mode, answer, validWords }); keyMarks = Object.create(null); draft = ''; draftOffset = 0;
        drag = null;
        $('wordle-board').replaceChildren();
        $('wordle-vocab-picker').hidden = mode === 'classic';
        updateModeNote();
        $('wordle-length').textContent = (mode === 'classic' ? '经典 · ' : VOCAB_LABELS[vocab] + ' · ') + game.answer.length + ' 字母';
        $('wordle-attempts').textContent = `0 / ${game.maxAttempts}`;
        $('wordle-streak').textContent = String(streak);
        updateGlossary('', false);
        $('wordle-rules').textContent = mode === 'long'
            ? '长单词模式：答案为 6–9 字母，共八次机会。可填入最短 5 个、最长与答案等长的单词；短词可直接拖动整组方格选择起始对齐位置。绿字按对齐后的绝对位置判断，黄字会在答案全词中查找，灰字则表示答案全词中没有可用的该字母。'
            : (mode === 'exam' ? `考试五字模式：答案从 ${VOCAB_LABELS[vocab]} 词库的五字母单词中抽取，共六次机会。` : '经典模式：答案来自原版 Wordle 的 2,315 词答案池，共六次机会。') + '绿色表示字母与位置都正确，黄色表示答案中有该字母但位置不对，灰色表示答案中没有可用的该字母。';
        message(dictionaryState === 'loading' ? '正在加载单词词库…' : (dictionaryState === 'failed' ? '单词词库加载失败，请刷新页面重试' :
            (mode === 'long' ? `答案有 ${game.answer.length} 个字母；填入 5–${game.answer.length} 个字母` : '填满当前行，然后按回车提交')),
            dictionaryState === 'failed' ? 'error' : '');
        updateAlignControls(); renderBoard(); renderKeyboard();
    }

    function submit() {
        if (dictionaryState === 'loading') { message('单词词库仍在加载，请稍候', 'error'); return; }
        if (dictionaryState === 'failed') { message('单词词库加载失败，请刷新页面重试', 'error'); return; }
        const result = game.submit(draft, mode === 'long' ? draftOffset : 0);
        if (result.status === 'invalid') {
            message(result.message, 'error');
            const row = $('wordle-board').querySelector('.wordle-row.active');
            if (row) { row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); }
            return;
        }
        if (result.status === 'over') return;
        updateGlossary(result.row.guess, result.status === 'win' || result.status === 'lose');
        result.row.guess.split('').forEach((letter, i) => {
            const mark = result.row.marks[i];
            if (!keyMarks[letter] || rank[mark] > rank[keyMarks[letter]]) keyMarks[letter] = mark;
        });
        draft = ''; draftOffset = 0; updateAlignControls(); renderBoard(); renderKeyboard();
        $('wordle-attempts').textContent = `${game.guesses.length} / ${game.maxAttempts}`;
        if (result.status === 'win') {
            streak++; saveStreak(); $('wordle-streak').textContent = String(streak);
            message(`猜对了！答案是 ${game.answer.toUpperCase()}`, 'success');
        } else if (result.status === 'lose') {
            streak = 0; saveStreak(); $('wordle-streak').textContent = '0';
            message(`本局结束，答案是 ${game.answer.toUpperCase()}`, 'error');
        } else message(`还剩 ${result.attemptsLeft} 次机会`);
    }

    function typeKey(key) {
        if (!game || game.over) return;
        if (key === 'Enter') submit();
        else if (key === 'Backspace') { draft = draft.slice(0, -1); setAlignment(draftOffset); renderBoard(); }
        else if (/^[a-z]$/i.test(key) && draft.length < game.answer.length) { draft += key.toLowerCase(); setAlignment(draftOffset); renderBoard(); }
        updateAlignControls();
    }

    function init() {
        if (!$('wordle-view')) return;
        loadStreak();
        loadDictionary();
        document.querySelectorAll('.wordle-mode-btn').forEach(btn => btn.addEventListener('click', () => {
            mode = btn.dataset.wordleMode;
            document.querySelectorAll('.wordle-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
            newGame();
        }));
        document.querySelectorAll('.wordle-vocab-btn').forEach(btn => btn.addEventListener('click', () => {
            vocab = btn.dataset.wordleVocab;
            document.querySelectorAll('.wordle-vocab-btn').forEach(b => b.classList.toggle('active', b === btn));
            newGame();
        }));
        $('wordle-start-btn').addEventListener('click', newGame);
        $('wordle-slide-left').addEventListener('click', () => slideAlignment(-1));
        $('wordle-slide-right').addEventListener('click', () => slideAlignment(1));
        $('wordle-keyboard').addEventListener('click', (e) => {
            const b = e.target.closest('[data-key]');
            if (b) { const key = b.dataset.key; typeKey(key); flashKey(key); }
        });
        document.addEventListener('keydown', (e) => {
            if (!visible || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
            if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-z]$/i.test(e.key)) { e.preventDefault(); typeKey(e.key); flashKey(e.key); }
            else if (mode === 'long' && draft.length >= 5 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); slideAlignment(e.key === 'ArrowLeft' ? -1 : 1); }
        });
        window.addEventListener('resize', () => { if (visible && game) renderBoard(); });
        newGame();
    }

    globalThis.__WORDLE = { setVisible(on) { visible = !!on; }, newGame };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
