(() => {
    'use strict';
    const API = 'https://mels-api.3209692800.workers.dev';
    const $ = id => document.getElementById(`aicu-${id}`);
    const form = $('form');
    if (!form) return;
    let active = null, query = null, page = 1;
    const STORAGE = 'mels.aicu.authorization.v1';
    let token = '', authorized = false, authRequest = null, expiryTimer, visible = false;
    const overlay = $('auth-overlay');
    const isVisible = () => !$('view').hidden && document.getElementById('tools').classList.contains('active');
    function storedToken() { try { return localStorage.getItem(STORAGE) || ''; } catch { return ''; } }
    function removeToken() { try { localStorage.removeItem(STORAGE); } catch {} }
    function lock(message = '请输入访问密码。', forget = false) {
        authorized = false; token = ''; clearTimeout(expiryTimer);
        active?.abort(); authRequest?.abort(); authRequest = null;
        if (forget) removeToken();
        $('auth-content').inert = true; form.inert = true; $('logout').hidden = true;
        $('results').replaceChildren(); $('pagination').hidden = true;
        $('status').textContent = '输入 UID 后开始查询。';
        $('password').value = ''; $('password').disabled = false; $('auth-submit').disabled = false;
        $('auth-status').textContent = message;
        overlay.hidden = false;
    }
    async function authenticate(password) {
        if (authRequest) return;
        const candidate = password === undefined ? storedToken() : '';
        if (password === undefined && (!candidate || candidate.length > 2048)) { lock('请输入访问密码。', true); return; }
        const controller = new AbortController(); authRequest = controller;
        $('auth-submit').disabled = true; $('password').disabled = true;
        $('auth-status').textContent = '正在验证授权…';
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(`${API}/api/aicu/auth/${password === undefined ? 'session' : 'login'}`, {
                method: password === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', signal: controller.signal,
                headers: password === undefined ? { Authorization: `Bearer ${candidate}` } : { 'Content-Type': 'application/json' },
                body: password === undefined ? undefined : JSON.stringify({ password })
            });
            if (authRequest !== controller || controller.signal.aborted) return;
            if (response.status === 401) { removeToken(); throw Error(password === undefined ? 'expired' : 'password'); }
            if (response.status === 429) throw Error('rate');
            if (!response.ok) throw Error('service');
            const body = await response.json();
            const nextToken = password === undefined ? candidate : body.token;
            if (body.ok !== true || typeof nextToken !== 'string' || !nextToken || nextToken.length > 2048 ||
                !Number.isSafeInteger(body.expiresAt) || body.expiresAt <= Date.now() || body.expiresAt > Date.now() + 86400000) throw Error('service');
            if (authRequest !== controller || controller.signal.aborted || !isVisible()) return;
            try { localStorage.setItem(STORAGE, nextToken); } catch { throw Error('storage'); }
            token = nextToken; authorized = true; $('auth-content').inert = false; form.inert = false; $('logout').hidden = false;
            clearTimeout(expiryTimer);
            expiryTimer = setTimeout(() => lock('授权已失效，请重新输入密码。', true), body.expiresAt - Date.now());
            overlay.hidden = true;
        } catch (error) {
            if (authRequest !== controller) return;
            $('auth-status').textContent = error.message === 'password' ? '访问密码不正确。' : error.message === 'expired' ? '授权已失效，请重新输入密码。' : error.message === 'rate' ? '验证过于频繁，请一分钟后重试。' : error.message === 'storage' ? '无法保存授权，请允许本站使用浏览器存储。' : '验证失败，请检查网络或服务配置后重试。';
        } finally {
            clearTimeout(timer);
            if (authRequest === controller) {
                authRequest = null; $('auth-submit').disabled = false; $('password').disabled = false; $('password').value = '';
            }
        }
    }
    $('auth-form').addEventListener('submit', event => {
        event.preventDefault();
        const password = $('password').value; $('password').value = '';
        if (password) authenticate(password);
    });
    $('logout').addEventListener('click', () => lock('请输入访问密码。', true));
    addEventListener('storage', event => {
        if (event.key === STORAGE || event.key === null) { lock(); if (isVisible()) authenticate(); }
    });
    function syncVisibility() {
        const next = isVisible();
        if (next === visible) return;
        visible = next;
        lock();
        if (next) authenticate();
    }
    const say = text => { $('status').textContent = text; };
    function node(tag, text, raw = false) {
        const element = document.createElement(tag);
        element.textContent = String(text ?? '');
        if (raw) element.setAttribute('translate', 'no');
        return element;
    }
    function link(text, url) {
        const a = node('a', text);
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        return a;
    }
    function busy(value) {
        $('results').setAttribute('aria-busy', String(value));
        $('submit').disabled = value;
        ['uid', 'kind', 'keyword'].forEach(id => { $(id).disabled = value; });
        $('cancel').hidden = !value;
        $('prev').disabled = value || page <= 1;
        $('next').disabled = value;
    }
    const numeric = value => /^\d+$/.test(String(value ?? '')) && (typeof value !== 'number' || Number.isSafeInteger(value));
    function render(data, kind) {
        const fragment = document.createDocumentFragment();
        if (kind === 'replies' || kind === 'video-danmaku') {
            const list = kind === 'replies' ? data.replies : data.videodmlist;
            if (!Array.isArray(list) || !data.cursor || typeof data.cursor.is_end !== 'boolean') throw new Error('format');
            list.forEach(item => {
                const card = node('article', ''); card.className = 'aicu-record';
                card.append(node('p', kind === 'replies' ? item.message : item.content, true));
                const stamp = Number(kind === 'replies' ? item.time : item.ctime);
                if (stamp > 0 && Number.isFinite(new Date(stamp * 1000).getTime())) card.append(node('small', new Date(stamp * 1000).toLocaleString(), true));
                const oid = kind === 'replies' ? item.dyn?.oid : item.oid;
                if (numeric(oid) && (kind !== 'replies' || Number(item.dyn?.type) === 1)) card.append(link('打开原视频', `https://www.bilibili.com/video/av${oid}/`));
                fragment.append(card);
            });
            $('pagination').hidden = list.length === 0 && page === 1;
            $('next').disabled = data.cursor.is_end || page >= 1000;
            $('prev').disabled = page <= 1;
            const count = data.cursor.all_count;
            const pageLabel = Number.isSafeInteger(count) && count >= 0 ? '第 {page} 页 · 共 {count} 条收录' : '第 {page} 页';
            if (window.MELSI18n) window.MELSI18n.bind($('page'), pageLabel, { page, count });
            else $('page').textContent = pageLabel.replace('{page}', page).replace('{count}', count);
            say(list.length ? '查询完成。页码与收录总数见下方。' : '没有查到记录；这不代表用户没有相关活动。');
        } else if (kind === 'live-danmaku') {
            if (!Array.isArray(data.records) || typeof data.hasMore !== 'boolean') throw new Error('format');
            data.records.forEach(record => {
                if (!record?.channel || !record?.live || !Array.isArray(record.danmakus)) throw new Error('format');
                const card = node('article', ''); card.className = 'aicu-record';
                card.append(node('h4', record.live.title || '未命名直播', true));
                const roomId = record.channel.roomId;
                if (numeric(roomId)) card.append(link(record.channel.name || `直播间 ${roomId}`, `https://live.bilibili.com/${roomId}`));
                else card.append(node('p', record.channel.name || '未知主播', true));
                const start = Number(record.live.startDate);
                if (start > 0 && Number.isFinite(new Date(start).getTime())) card.append(node('small', `开播：${new Date(start).toLocaleString()}`, true));
                const ul = node('ul', '');
                record.danmakus.forEach(item => {
                    const type = Number(item?.type);
                    const label = type === 0 ? '弹幕' : `直播互动（类型 ${Number.isInteger(type) ? type : '未知'}）`;
                    const content = item?.message || (item?.price != null ? `${label} · ¥${item.price}` : item?.count != null ? `${label} × ${item.count}` : label);
                    const stamp = Number(item?.sendDate);
                    const time = stamp > 0 && Number.isFinite(new Date(stamp).getTime()) ? ` · ${new Date(stamp).toLocaleString()}` : '';
                    ul.append(node('li', `${content}${time}`, true));
                });
                if (record.danmakus.length) card.append(ul); else card.append(node('p', '该场直播暂无可显示记录。'));
                fragment.append(card);
            });
            $('pagination').hidden = data.records.length === 0 && page === 1;
            $('next').disabled = !data.hasMore || page >= 1000;
            $('prev').disabled = page <= 1;
            const count = data.total;
            const pageLabel = Number.isSafeInteger(count) && count >= 0 ? '第 {page} 页 · 共 {count} 场直播' : '第 {page} 页';
            if (window.MELSI18n) window.MELSI18n.bind($('page'), pageLabel, { page, count });
            else $('page').textContent = pageLabel.replace('{page}', page).replace('{count}', count);
            say(data.records.length ? '查询完成。直播弹幕按直播场次展示。' : '没有查到直播弹幕；这不代表用户没有相关活动。');
        } else {
            const groups = kind === 'history' ? [['历史用户名', data.hname]] : [['粉丝牌', data.medals], ['装扮', data.collections]];
            for (const [title, list] of groups) {
                if (list != null && !Array.isArray(list)) throw new Error('format');
                const card = node('section', ''); card.className = 'aicu-record';
                card.append(node('h4', title));
                if (list == null) card.append(node('p', '此项暂未获取成功，请稍后重新查询。'));
                else if (!list.length) card.append(node('p', '暂无收录。'));
                else {
                    const ul = node('ul', '');
                    list.forEach(item => {
                        const text = typeof item === 'string' ? item : `${item.name ?? ''}${title === '粉丝牌' && item.level != null ? ` · Lv.${item.level}` : ''}${title === '装扮' && item.number != null ? ` · #${item.number}` : ''}`;
                        ul.append(node('li', text, true));
                    });
                    card.append(ul);
                }
                fragment.append(card);
            }
            say('查询完成。');
        }
        $('results').replaceChildren(fragment);
    }
    async function run(targetPage) {
        if (!query || active || !authorized) return;
        const controller = new AbortController(); active = controller;
        const previousPage = page;
        page = targetPage; busy(true);
        $('pagination').hidden = true;
        $('results').replaceChildren();
        say('正在查询，繁忙时可能需要排队，请稍候…');
        const timer = setTimeout(() => controller.abort('timeout'), 95000);
        try {
            const url = new URL(`/api/aicu/${query.kind}`, API);
            url.searchParams.set('uid', query.uid);
            if (['replies', 'video-danmaku', 'live-danmaku'].includes(query.kind)) {
                url.searchParams.set('pn', String(page)); url.searchParams.set('ps', query.kind === 'live-danmaku' ? '10' : '20');
            }
            if (['replies', 'video-danmaku'].includes(query.kind)) {
                url.searchParams.set('keyword', query.keyword);
            }
            const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
            if (controller.signal.aborted) return;
            if (response.status === 401) { lock('授权已失效，请重新输入密码。', true); return; }
            if (response.status === 429) throw new Error('rate');
            if (!response.ok) throw new Error('upstream');
            const body = await response.json();
            if (body.ok !== true || !body.data) throw new Error('format');
            if (controller.signal.aborted) return;
            busy(false);
            render(body.data, query.kind);
            if (body.partial) say('部分资料获取失败；已显示成功的部分，可稍后重新查询。');
        } catch (error) {
            page = previousPage;
            $('pagination').hidden = true;
            say(controller.signal.aborted ? (controller.signal.reason === 'timeout' ? '查询超时，请稍后重试。' : '查询已取消。') : error.message === 'rate' ? '查询过于频繁，请一分钟后重试。' : '查询失败，请检查网络或稍后重试。');
        } finally {
            clearTimeout(timer); active = null;
            $('results').setAttribute('aria-busy', 'false');
            $('submit').disabled = false; $('cancel').hidden = true;
            ['uid', 'kind', 'keyword'].forEach(id => { $(id).disabled = false; });
        }
    }
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (active || !authorized) return;
        const uid = $('uid').value.trim();
        if (!/^\d{1,20}$/.test(uid) || BigInt(uid) === 0n) { say('请输入有效的数字 UID。'); return; }
        query = { uid: BigInt(uid).toString(), kind: $('kind').value, keyword: $('keyword').value.trim() };
        run(1);
    });
    $('kind').addEventListener('change', () => { $('keyword-label').hidden = !['replies', 'video-danmaku'].includes($('kind').value); });
    form.addEventListener('input', () => {
        if (active) return;
        query = null; page = 1;
        $('results').replaceChildren(); $('pagination').hidden = true;
        say('输入 UID 后开始查询。');
    });
    $('cancel').addEventListener('click', () => active?.abort());
    $('prev').addEventListener('click', () => run(page - 1));
    $('next').addEventListener('click', () => run(page + 1));
    new MutationObserver(() => {
        syncVisibility();
        if ($('view').hidden || !document.getElementById('tools').classList.contains('active')) active?.abort();
    }).observe(document.getElementById('tools'), { attributes: true, subtree: true, attributeFilter: ['hidden', 'class'] });
    syncVisibility();
})();
