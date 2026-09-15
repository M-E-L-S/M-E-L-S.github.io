// 页面切换功能
document.addEventListener('DOMContentLoaded', function() {
    // Decorative floating particles are intentionally omitted; settings effects remain available.

    // 导航切换
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');

    const routeByPage = { home: '/', about: '/about/', tools: '/tools/', game: '/minigame/', freshcup: '/freshcup/' };
    const pageByRoute = { '/': 'home', '/about': 'about', '/tools': 'tools', '/minigame': 'game' };
    const resolvePage = path => path.startsWith('/freshcup') ? 'freshcup' : path.startsWith('/minigame') ? 'game' : path.startsWith('/tools') ? 'tools' : pageByRoute[path] || 'home';

    function showPage(pageId, updateHistory = false) {
        const target = document.getElementById(pageId) ? pageId : 'home';

            // 更新导航状态
            navLinks.forEach(nav => nav.classList.remove('active'));
            document.querySelector(`.nav-link[data-page="${target}"]`)?.classList.add('active');

            // 切换页面
            pages.forEach(page => {
                page.classList.remove('active');
                if (page.id === target) {
                    page.classList.add('active');
                }
            });

            navLinks.forEach(nav => {
                if(nav.dataset.page === target) nav.setAttribute('aria-current','page');
                else nav.removeAttribute('aria-current');
            });

            // 打开关于页时，默认展开最新公告
            if (target === 'about') {
                resetAnnounceArchive();
            }
            if (updateHistory && routeByPage[target]) {
                let route = routeByPage[target];
                if (target === 'freshcup') route = document.querySelector('.tool-tabs [aria-current="page"]')?.getAttribute('href') || route;
                if (target === 'game') route = document.querySelector('#game-picker-menu [aria-selected="true"]')?.getAttribute('href') || route;
                if (target === 'tools') route = document.querySelector('#utility-picker-menu [aria-selected="true"]')?.getAttribute('href') || route;
                history.pushState({ page: target }, '', route);
                window.scrollTo({top:0,behavior:'instant'});
            }
            document.title = target === 'home' ? 'MELS' : `${document.querySelector(`.nav-link[data-page="${target}"]`)?.textContent || 'MELS'} · MELS`;
    }

    navLinks.forEach(link => {
        if (!link.dataset.page) return;
        link.addEventListener('click', function(event) {
            if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            showPage(this.getAttribute('data-page'), true);
        });
    });

    const initialPath = location.pathname.replace(/\/$/, '') || '/';
    showPage(resolvePage(initialPath));
    addEventListener('popstate', () => {
        const path = location.pathname.replace(/\/$/, '') || '/';
        showPage(resolvePage(path));
    });

    // 初始化数据
    initMusicPlayer();
    initAnnounceArchive();
    initAnnouncement();

    // 初始时滚动到顶部
    window.scrollTo(0, 0);
});

// 音乐播放器功能
function initMusicPlayer() {
    const audio = document.getElementById('bg-music');
    const player = document.getElementById('music-player');
    const collapseToggle = document.getElementById('music-collapse-toggle');
    const playBtn = document.getElementById('play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const favoriteBtn = document.getElementById('favorite-btn');
    const searchToggle = document.getElementById('music-search-toggle');
    const libraryToggle = document.getElementById('music-library-toggle');
    const searchPanel = document.getElementById('music-search-panel');
    const libraryPanel = document.getElementById('music-library-panel');
    const panelClose = document.getElementById('music-panel-close');
    const libraryClose = document.getElementById('music-library-close');
    const searchForm = document.getElementById('music-search-form');
    const searchInput = document.getElementById('music-search-input');
    const statusElement = document.getElementById('music-panel-status');
    const resultList = document.getElementById('music-result-list');
    const libraryStatusElement = document.getElementById('music-library-status');
    const libraryResultList = document.getElementById('music-library-list');
    const playModePanel = document.getElementById('music-play-mode');
    const historyClearButton = document.getElementById('music-history-clear');
    const favoriteSort = document.getElementById('music-favorite-sort');
    const favoriteOrderSelect = document.getElementById('music-favorite-order');
    const historyPauseToggle = document.getElementById('music-history-pause-toggle');
    const historyPauseNote = document.getElementById('music-history-pause-note');
    const lyricsPauseToggle = document.getElementById('music-lyrics-pause-toggle');
    const lyricsPauseNote = document.getElementById('music-lyrics-pause-note');
    const homeLyricsEffectToggle = document.getElementById('home-lyrics-effect-toggle');
    const homeLyricsEffectNote = document.getElementById('home-lyrics-effect-note');
    const clearMusicDataButton = document.getElementById('clear-music-data');
    const musicDataConfirm = document.getElementById('music-data-confirm');
    const cancelClearMusicDataButton = document.getElementById('cancel-clear-music-data');
    const confirmClearMusicDataButton = document.getElementById('confirm-clear-music-data');
    const currentSongElement = document.querySelector('.current-song');
    const currentArtistElement = document.querySelector('.current-artist');
    const currentLyricElement = document.getElementById('current-lyric');
    const homePage = document.getElementById('home');
    const homeSubtitle = document.getElementById('home-subtitle');
    const particleTitleStage = document.getElementById('particle-title-stage');
    const coverImage = document.getElementById('music-cover-image');
    const coverFallback = document.getElementById('music-cover-fallback');
    const progressInput = document.getElementById('music-progress');
    const currentTimeElement = document.getElementById('music-current-time');
    const durationElement = document.getElementById('music-duration');
    const volumeToggle = document.getElementById('music-volume-toggle');
    const volumePanel = document.getElementById('music-volume-panel');
    const volumeInput = document.getElementById('music-volume');
    const volumeValue = document.getElementById('music-volume-value');

    if (!audio || !playBtn || !searchPanel || !libraryPanel || !searchForm || !resultList || !libraryResultList) return;

    const API_URL = 'https://music-api.gdstudio.xyz/api.php';
    const HISTORY_KEY = 'winy_music_history_v1';
    const FAVORITES_KEY = 'winy_music_favorites_v1';
    const FAVORITE_ORDER_KEY = 'winy_music_favorite_order_v1';
    const PLAY_MODE_KEY = 'winy_music_play_mode_v1';
    const HISTORY_ENABLED_KEY = 'winy_music_history_enabled_v1';
    const LYRICS_ENABLED_KEY = 'winy_music_lyrics_enabled_v1';
    const HOME_LYRICS_EFFECT_KEY = 'winy_home_lyrics_effect_enabled_v1';
    const VOLUME_KEY = 'winy_music_volume_v1';
    const PLAYER_COLLAPSED_KEY = 'winy_music_player_collapsed_v1';
    const REMOTE_URL_TTL = 20 * 60 * 1000;
    const MAX_HISTORY = 30;
    const coverRequests = new Map();
    const lyricRequests = new Map();
    const PLAY_MODES = ['sequential', 'repeat-one', 'shuffle'];

    const localSongs = [
        { id: 'local-1', name: '生日快乐（海底捞版）', artist: '本地音乐', album: '', src: 'assets/audio/music1.mp3', source: 'local', isLocal: true },
        { id: 'local-2', name: 'Fly My Wings', artist: 'Mili', album: '', src: 'assets/audio/music2.mp3', source: 'local', isLocal: true },
        { id: 'local-3', name: '这世界那么多人', artist: '莫文蔚', album: '', src: 'assets/audio/music3.mp3', source: 'local', isLocal: true },
        { id: 'local-4', name: '小美满', artist: '周深', album: '', src: 'assets/audio/music4.mp3', source: 'local', isLocal: true }
    ];

    let activeQueue = localSongs;
    let currentSongIndex = 0;
    let currentTrack = localSongs[0];
    let isPlaying = false;
    let activeTab = 'playlist';
    let searchResults = [];
    let history = readStoredTracks(HISTORY_KEY);
    let favorites = readStoredTracks(FAVORITES_KEY).map((track, index) => ({
        ...track,
        addedAt: track.addedAt || Date.now() - index
    }));
    let favoriteOrder = readStoredValue(FAVORITE_ORDER_KEY, 'added-desc');
    let playbackMode = readStoredValue(PLAY_MODE_KEY, 'sequential');
    if (!PLAY_MODES.includes(playbackMode)) playbackMode = 'sequential';
    let historyEnabled = readStoredValue(HISTORY_ENABLED_KEY, 'true') !== 'false';
    let lyricsEnabled = readStoredValue(LYRICS_ENABLED_KEY, 'true') !== 'false';
    let homeLyricsEffectEnabled = readStoredValue(HOME_LYRICS_EFFECT_KEY, 'true') !== 'false';
    let currentLyrics = [];
    let currentLyricIndex = -1;
    let displayedLyric = currentLyricElement.textContent;
    let searchController = null;
    let retryingTrackKey = '';

    const defaultHomeSubtitle = '✨ 愿每日平安幸福 ✨';

    function setPlayerCollapsed(collapsed, persist = true) {
        if (!player || !collapseToggle) return;
        player.classList.toggle('is-collapsed', collapsed);
        document.body.classList.toggle('music-player-collapsed', collapsed);
        collapseToggle.setAttribute('aria-expanded', String(!collapsed));
        collapseToggle.setAttribute('aria-label', collapsed ? '展开音乐栏' : '收起音乐栏');
        collapseToggle.title = collapsed ? '展开音乐栏' : '收起音乐栏';
        if (collapsed) {
            searchPanel.hidden = true;
            libraryPanel.hidden = true;
            volumePanel.hidden = true;
            searchToggle.setAttribute('aria-expanded', 'false');
            libraryToggle.setAttribute('aria-expanded', 'false');
            volumeToggle.setAttribute('aria-expanded', 'false');
        }
        if (persist) saveStoredValue(PLAYER_COLLAPSED_KEY, String(collapsed));
    }

    setPlayerCollapsed(readStoredValue(PLAYER_COLLAPSED_KEY, 'false') === 'true', false);
    collapseToggle?.addEventListener('click', () => {
        setPlayerCollapsed(!player.classList.contains('is-collapsed'));
    });

    const storedVolume = Number(readStoredValue(VOLUME_KEY, '1'));
    audio.volume = Number.isFinite(storedVolume) ? Math.min(1, Math.max(0, storedVolume)) : 1;
    function syncVolume() {
        const percent = Math.round((audio.muted ? 0 : audio.volume) * 100);
        volumeInput.value = String(percent);
        volumeValue.textContent = `${percent}%`;
        volumeInput.setAttribute('aria-valuetext', `${percent}%`);
        volumeToggle.querySelector('i').className = `fas fa-volume-${percent === 0 ? 'xmark' : percent < 50 ? 'low' : 'high'}`;
        volumeToggle.title = `音量 ${percent}%`;
    }
    function closeVolume() {
        volumePanel.hidden = true;
        volumeToggle.setAttribute('aria-expanded', 'false');
    }
    volumeToggle.addEventListener('click', () => {
        volumePanel.hidden = !volumePanel.hidden;
        volumeToggle.setAttribute('aria-expanded', String(!volumePanel.hidden));
        if (!volumePanel.hidden) volumeInput.focus();
    });
    volumeInput.addEventListener('input', () => {
        audio.volume = Number(volumeInput.value) / 100;
        audio.muted = false;
        saveStoredValue(VOLUME_KEY, String(audio.volume));
        syncVolume();
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.music-volume-control')) closeVolume();
    });
    volumePanel.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeVolume();
            volumeToggle.focus();
        }
    });
    audio.addEventListener('volumechange', syncVolume);
    syncVolume();

    function syncLyricPlacement() {
        const showOnHome = lyricsEnabled
            && homeLyricsEffectEnabled
            && homePage?.classList.contains('active');
        currentLyricElement.classList.toggle('is-home-routed', showOnHome);
        particleTitleStage?.classList.toggle('has-home-lyric', showOnHome);
        if (homeSubtitle) homeSubtitle.textContent = showOnHome ? displayedLyric : defaultHomeSubtitle;
        window.dispatchEvent(new CustomEvent('winy-home-lyric-change', {
            detail: { active: showOnHome, text: displayedLyric }
        }));
    }

    function setLyricText(text) {
        displayedLyric = text;
        currentLyricElement.textContent = text;
        syncLyricPlacement();
    }

    if (homePage) {
        new MutationObserver(syncLyricPlacement).observe(homePage, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    function readStoredTracks(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(parsed) ? parsed.filter(track => track && track.id && track.name) : [];
        } catch (error) {
            return [];
        }
    }

    function saveTracks(key, tracks) {
        try {
            localStorage.setItem(key, JSON.stringify(tracks));
        } catch (error) {
            setStatus('浏览器存储空间不足，历史或收藏可能无法保存', true);
        }
    }

    function readStoredValue(key, fallback) {
        try {
            return localStorage.getItem(key) || fallback;
        } catch (error) {
            return fallback;
        }
    }

    function saveStoredValue(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {}
    }

    function removeStoredValue(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {}
    }

    function updateMusicSettings() {
        if (historyPauseToggle) historyPauseToggle.checked = !historyEnabled;
        if (historyPauseNote) historyPauseNote.textContent = historyEnabled
            ? '默认关闭，正在记录播放历史。'
            : '已开启，之后播放的歌曲不会加入历史记录。';
        if (lyricsPauseToggle) lyricsPauseToggle.checked = !lyricsEnabled;
        if (lyricsPauseNote) lyricsPauseNote.textContent = lyricsEnabled
            ? '默认关闭，实时歌词已开启。'
            : '已开启，实时歌词不会加载或显示。';
        if (homeLyricsEffectToggle) homeLyricsEffectToggle.checked = homeLyricsEffectEnabled;
        if (homeLyricsEffectNote) homeLyricsEffectNote.textContent = homeLyricsEffectEnabled
            ? '默认开启，首页使用独立粒子歌词。'
            : '已关闭，歌词保留在音乐栏。';
    }

    function trackKey(track) {
        return `${track.source || 'netease'}:${track.id}`;
    }

    function isFavorite(track) {
        const key = trackKey(track);
        return favorites.some(item => trackKey(item) === key);
    }

    function serializableTrack(track) {
        return {
            id: String(track.id),
            name: track.name,
            artist: track.artist,
            album: track.album || '',
            pic_id: track.pic_id || null,
            lyric_id: track.lyric_id || track.id,
            source: track.source || 'netease',
            url: track.url || null,
            resolvedAt: track.resolvedAt || 0,
            cover: track.cover || null,
            src: track.src || null,
            isLocal: Boolean(track.isLocal),
            addedAt: track.addedAt || 0
        };
    }

    function updateStoredTrack(track) {
        const key = trackKey(track);
        let changed = false;
        history = history.map(item => {
            if (trackKey(item) !== key) return item;
            changed = true;
            return serializableTrack(track);
        });
        if (changed) saveTracks(HISTORY_KEY, history);

        changed = false;
        favorites = favorites.map(item => {
            if (trackKey(item) !== key) return item;
            changed = true;
            return { ...serializableTrack(track), addedAt: item.addedAt || track.addedAt || Date.now() };
        });
        if (changed) saveTracks(FAVORITES_KEY, favorites);
    }

    function addToHistory(track) {
        if (!historyEnabled) return;
        const key = trackKey(track);
        history = [serializableTrack(track), ...history.filter(item => trackKey(item) !== key)].slice(0, MAX_HISTORY);
        saveTracks(HISTORY_KEY, history);
        if (activeTab === 'history') renderList(history, '还没有播放历史', libraryResultList);
    }

    function setStatus(message, isError = false, target = null) {
        const targets = target ? [target] : [statusElement, libraryStatusElement];
        targets.forEach(element => {
            if (!element) return;
            element.textContent = message;
            element.classList.toggle('error', isError);
        });
    }

    async function fetchApi(params, signal) {
        const url = new URL(API_URL);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
        });
        const requestController = new AbortController();
        const timeoutId = window.setTimeout(() => requestController.abort(), 10000);
        if (signal) {
            if (signal.aborted) requestController.abort();
            else signal.addEventListener('abort', () => requestController.abort(), { once: true });
        }
        try {
            const response = await fetch(url, { signal: requestController.signal, referrerPolicy: 'no-referrer' });
            if (!response.ok) throw new Error(`音乐服务响应异常（${response.status}）`);
            return response.json();
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    function normalizeSearchTrack(item) {
        return {
            id: String(item.id),
            name: item.name || '未知歌曲',
            artist: Array.isArray(item.artist) ? item.artist.join('、') : (item.artist || '未知歌手'),
            album: item.album || '',
            pic_id: item.pic_id || null,
            lyric_id: item.lyric_id || item.id,
            source: item.source || 'netease',
            url: null,
            resolvedAt: 0,
            cover: null,
            isLocal: false
        };
    }

    async function resolveTrackUrl(track, force = false) {
        if (track.isLocal) return track.src;
        if (!force && track.url && Date.now() - track.resolvedAt < REMOTE_URL_TTL) return track.url;
        const data = await fetchApi({ types: 'url', source: track.source, id: track.id, br: 192 });
        if (!data || !data.url) throw new Error('这首歌暂时无法播放');
        track.url = data.url;
        track.resolvedAt = Date.now();
        updateStoredTrack(track);
        return track.url;
    }

    async function resolveCover(track) {
        if (track.cover || !track.pic_id || track.isLocal) return track.cover;
        const key = trackKey(track);
        if (!coverRequests.has(key)) {
            coverRequests.set(key, fetchApi({ types: 'pic', source: track.source, id: track.pic_id, size: 300 })
                .then(data => {
                    track.cover = data && data.url ? data.url : null;
                    updateStoredTrack(track);
                    return track.cover;
                })
                .catch(() => null)
                .finally(() => coverRequests.delete(key)));
        }
        return coverRequests.get(key);
    }

    function parseLrc(text, translatedText = '') {
        function parseLines(value) {
            const lines = [];
            String(value || '').split(/\r?\n/).forEach(line => {
                const timestamps = [...line.matchAll(/\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g)];
                const content = line.replace(/\[[^\]]*\]/g, '').trim();
                if (!content) return;
                timestamps.forEach(match => {
                    lines.push({ time: Number(match[1]) * 60 + Number(match[2]), text: content });
                });
            });
            return lines.sort((a, b) => a.time - b.time);
        }

        const original = parseLines(text);
        const translated = parseLines(translatedText);
        if (!translated.length) return original;
        return original.map(line => {
            const translation = translated.find(item => Math.abs(item.time - line.time) < 0.15);
            return translation && translation.text !== line.text
                ? { ...line, text: `${line.text}\n${translation.text}` }
                : line;
        });
    }

    async function loadLyrics(track) {
        currentLyrics = [];
        currentLyricIndex = -1;
        if (!lyricsEnabled) {
            setLyricText('实时歌词已关闭');
            return;
        }
        if (track.isLocal || !track.lyric_id) {
            setLyricText(track.isLocal ? '本地音乐暂无歌词' : '暂无歌词');
            return;
        }

        const key = trackKey(track);
        setLyricText('歌词加载中…');
        if (!lyricRequests.has(key)) {
            lyricRequests.set(key, fetchApi({ types: 'lyric', source: track.source, id: track.lyric_id })
                .then(data => parseLrc(data && data.lyric, data && data.tlyric))
                .catch(() => [])
                .finally(() => lyricRequests.delete(key)));
        }
        const lyrics = await lyricRequests.get(key);
        if (!lyricsEnabled || trackKey(currentTrack) !== key) return;
        currentLyrics = lyrics;
        currentLyricIndex = -1;
        setLyricText(lyrics.length ? '♪' : '暂无歌词');
        updateLyricLine();
    }

    function updateLyricLine() {
        if (!currentLyrics.length) return;
        const time = audio.currentTime;
        let low = 0;
        let high = currentLyrics.length - 1;
        let found = -1;
        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            if (currentLyrics[middle].time <= time + 0.05) {
                found = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        if (found !== currentLyricIndex) {
            currentLyricIndex = found;
            setLyricText(found >= 0 ? currentLyrics[found].text : '♪');
        }
    }

    function formatMediaTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
        const minutes = Math.floor(seconds / 60);
        const remaining = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
    }

    function updateProgress() {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const value = duration > 0 ? Math.round((audio.currentTime / duration) * 1000) : 0;
        progressInput.value = String(value);
        progressInput.style.setProperty('--music-progress', `${value / 10}%`);
        currentTimeElement.textContent = formatMediaTime(audio.currentTime);
        durationElement.textContent = formatMediaTime(duration);
        updateLyricLine();
    }

    function playbackModeLabel() {
        return playbackMode === 'repeat-one' ? '单曲循环' : playbackMode === 'shuffle' ? '随机播放' : '顺序播放';
    }

    function updatePlayModeButtons() {
        libraryPanel.querySelectorAll('[data-play-mode]').forEach(button => {
            const active = button.dataset.playMode === playbackMode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    function updateSongInfo() {
        currentSongElement.textContent = currentTrack.name;
        currentArtistElement.textContent = currentTrack.album
            ? `${currentTrack.artist} · ${currentTrack.album}`
            : currentTrack.artist;

        if (currentTrack.cover) {
            coverImage.src = currentTrack.cover;
            coverImage.hidden = false;
            coverFallback.hidden = true;
        } else {
            coverImage.removeAttribute('src');
            coverImage.hidden = true;
            coverFallback.hidden = false;
        }
        updateFavoriteButton();
    }

    function updateFavoriteButton() {
        const favorite = isFavorite(currentTrack);
        favoriteBtn.classList.toggle('active', favorite);
        favoriteBtn.innerHTML = `<i class="${favorite ? 'fas' : 'far'} fa-heart"></i>`;
        favoriteBtn.setAttribute('aria-label', favorite ? '取消收藏当前歌曲' : '收藏当前歌曲');
        favoriteBtn.title = favorite ? '取消收藏' : '收藏当前歌曲';
    }

    function updatePlayButton() {
        playBtn.innerHTML = `<i class="fas fa-${isPlaying ? 'pause' : 'play'}"></i>`;
        playBtn.setAttribute('aria-label', isPlaying ? '暂停' : '播放');
    }

    async function playTrack(track, queue = activeQueue, index = 0, forceUrl = false) {
        activeQueue = queue;
        currentSongIndex = index;
        currentTrack = track;
        currentLyrics = [];
        currentLyricIndex = -1;
        progressInput.value = '0';
        progressInput.style.setProperty('--music-progress', '0%');
        currentTimeElement.textContent = '00:00';
        durationElement.textContent = '00:00';
        updateSongInfo();
        setStatus(`正在加载：${track.name}`);
        loadLyrics(track);

        try {
            const source = await resolveTrackUrl(track, forceUrl);
            audio.src = source;
            await audio.play();
            addToHistory(track);
            setStatus(`正在播放：${track.name}`);
            resolveCover(track).then(cover => {
                if (cover && trackKey(currentTrack) === trackKey(track)) updateSongInfo();
            });
            if (activeTab === 'playlist') renderCurrentTab();
        } catch (error) {
            isPlaying = false;
            updatePlayButton();
            setStatus(error && error.message ? error.message : '播放失败，请稍后重试', true);
        }
    }

    function playOffset(offset) {
        if (!activeQueue.length) return;
        currentSongIndex = (currentSongIndex + offset + activeQueue.length) % activeQueue.length;
        playTrack(activeQueue[currentSongIndex], activeQueue, currentSongIndex);
    }

    function playNextByMode() {
        if (!activeQueue.length) return;
        if (playbackMode === 'repeat-one') {
            audio.currentTime = 0;
            audio.play().catch(() => playTrack(currentTrack, activeQueue, currentSongIndex));
            return;
        }
        if (playbackMode === 'shuffle') {
            if (activeQueue.length === 1) {
                playTrack(activeQueue[0], activeQueue, 0);
                return;
            }
            let nextIndex = currentSongIndex;
            while (nextIndex === currentSongIndex) nextIndex = Math.floor(Math.random() * activeQueue.length);
            playTrack(activeQueue[nextIndex], activeQueue, nextIndex);
            return;
        }
        const nextIndex = (currentSongIndex + 1) % activeQueue.length;
        playTrack(activeQueue[nextIndex], activeQueue, nextIndex);
    }

    function toggleFavorite(track = currentTrack) {
        const key = trackKey(track);
        const existingIndex = favorites.findIndex(item => trackKey(item) === key);
        if (existingIndex >= 0) {
            favorites.splice(existingIndex, 1);
            setStatus(`已取消收藏：${track.name}`);
        } else {
            track.addedAt = Date.now();
            favorites.unshift({ ...serializableTrack(track), addedAt: track.addedAt });
            setStatus(`已收藏：${track.name}`);
            if (!track.isLocal && !track.url) {
                resolveTrackUrl(track).catch(() => {});
            }
            if (!track.cover) resolveCover(track).then(() => updateStoredTrack(track));
        }
        saveTracks(FAVORITES_KEY, favorites);
        updateFavoriteButton();
        if (activeTab === 'favorites') renderCurrentTab();
    }

    function createTrackRow(track, index, queue) {
        const row = document.createElement('div');
        row.className = 'music-result-item';
        if (trackKey(track) === trackKey(currentTrack)) row.classList.add('playing');
        row.tabIndex = 0;

        const artwork = document.createElement('div');
        artwork.className = 'music-result-cover';
        artwork.innerHTML = '<i class="fas fa-music"></i>';

        const info = document.createElement('div');
        info.className = 'music-result-info';
        const title = document.createElement('div');
        title.className = 'music-result-title';
        title.textContent = track.name;
        const meta = document.createElement('div');
        meta.className = 'music-result-meta';
        meta.textContent = track.album ? `${track.artist} · ${track.album}` : track.artist;
        info.append(title, meta);

        const favorite = document.createElement('button');
        favorite.type = 'button';
        favorite.className = `music-result-favorite${isFavorite(track) ? ' active' : ''}`;
        favorite.setAttribute('aria-label', isFavorite(track) ? '取消收藏' : '收藏');
        favorite.innerHTML = `<i class="${isFavorite(track) ? 'fas' : 'far'} fa-heart"></i>`;
        favorite.addEventListener('click', event => {
            event.stopPropagation();
            toggleFavorite(track);
            renderSearchResults();
            renderCurrentTab();
        });

        const startPlayback = () => playTrack(track, queue, index);
        row.addEventListener('click', startPlayback);
        row.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                startPlayback();
            }
        });
        row.append(artwork, info, favorite);

        if (track.cover) {
            artwork.innerHTML = '';
            const image = document.createElement('img');
            image.src = track.cover;
            image.alt = '';
            artwork.appendChild(image);
        } else if (track.pic_id) {
            resolveCover(track).then(cover => {
                if (!cover || !row.isConnected) return;
                artwork.innerHTML = '';
                const image = document.createElement('img');
                image.src = cover;
                image.alt = '';
                artwork.appendChild(image);
            });
        }
        return row;
    }

    function renderList(queue, emptyMessage, container = resultList) {
        container.replaceChildren();
        if (!queue.length) {
            const empty = document.createElement('div');
            empty.className = 'music-empty-state';
            empty.textContent = emptyMessage;
            container.appendChild(empty);
            return;
        }
        queue.forEach((track, index) => container.appendChild(createTrackRow(track, index, queue)));
    }

    function renderSearchResults() {
        renderList(searchResults, '输入关键词搜索在线音乐', resultList);
    }

    function sortedFavorites() {
        const sorted = favorites.slice();
        if (favoriteOrder === 'added-asc') {
            sorted.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
        } else if (favoriteOrder === 'name-asc') {
            sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' }));
        } else if (favoriteOrder === 'name-desc') {
            sorted.sort((a, b) => b.name.localeCompare(a.name, 'zh-CN', { sensitivity: 'base' }));
        } else {
            sorted.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        }
        return sorted;
    }

    function renderCurrentTab() {
        playModePanel.hidden = activeTab !== 'playlist';
        favoriteSort.hidden = activeTab !== 'favorites';
        historyClearButton.hidden = activeTab !== 'history' || history.length === 0;
        if (activeTab === 'playlist') {
            renderList(activeQueue, '播放列表为空', libraryResultList);
            setStatus(`${playbackModeLabel()} · ${activeQueue.length} 首歌曲`, false, libraryStatusElement);
        } else if (activeTab === 'history') {
            renderList(history, '还没有播放历史', libraryResultList);
            setStatus(history.length ? `最近播放 ${history.length} 首` : '播放过的歌曲会保存在这里', false, libraryStatusElement);
        } else {
            renderList(sortedFavorites(), '还没有收藏歌曲', libraryResultList);
            setStatus(favorites.length ? `已收藏 ${favorites.length} 首` : '点击爱心收藏喜欢的歌曲', false, libraryStatusElement);
        }
    }

    async function searchMusic(keyword) {
        if (searchController) searchController.abort();
        const controller = new AbortController();
        searchController = controller;
        setStatus('正在搜索…', false, statusElement);
        resultList.replaceChildren();
        try {
            const data = await fetchApi({ types: 'search', source: 'netease', name: keyword, count: 8, pages: 1 }, controller.signal);
            searchResults = Array.isArray(data) ? data.filter(item => item && item.id).map(normalizeSearchTrack) : [];
            renderList(searchResults, '没有找到相关歌曲', resultList);
            setStatus(searchResults.length ? `找到 ${searchResults.length} 首歌曲` : '没有找到相关歌曲', false, statusElement);
        } catch (error) {
            if (error.name === 'AbortError' && controller.signal.aborted) return;
            setStatus('在线音乐服务暂时无法连接，本地歌曲仍可播放', true, statusElement);
            renderList([], '搜索失败，请稍后重试', resultList);
        }
    }

    playBtn.addEventListener('click', async function() {
        if (isPlaying) {
            audio.pause();
        } else {
            if (!audio.src) {
                await playTrack(currentTrack, activeQueue, currentSongIndex);
            } else {
                try {
                    await audio.play();
                } catch (error) {
                    setStatus('浏览器阻止了播放，请再次点击播放', true);
                }
            }
        }
        this.style.transform = 'scale(0.9)';
        setTimeout(() => { this.style.transform = ''; }, 200);
    });

    prevBtn.addEventListener('click', function() {
        playOffset(-1);
        this.style.transform = 'scale(0.9)';
        setTimeout(() => { this.style.transform = ''; }, 200);
    });

    nextBtn.addEventListener('click', function() {
        if (playbackMode === 'shuffle' && activeQueue.length > 1) {
            let nextIndex = currentSongIndex;
            while (nextIndex === currentSongIndex) nextIndex = Math.floor(Math.random() * activeQueue.length);
            playTrack(activeQueue[nextIndex], activeQueue, nextIndex);
        } else {
            playOffset(1);
        }
        this.style.transform = 'scale(0.9)';
        setTimeout(() => { this.style.transform = ''; }, 200);
    });

    libraryPanel.querySelectorAll('[data-play-mode]').forEach(button => {
        button.addEventListener('click', () => {
            playbackMode = button.dataset.playMode;
            saveStoredValue(PLAY_MODE_KEY, playbackMode);
            updatePlayModeButtons();
            setStatus(`已切换为${playbackModeLabel()}`, false, libraryStatusElement);
            renderCurrentTab();
        });
    });

    favoriteBtn.addEventListener('click', () => toggleFavorite());

    searchToggle.addEventListener('click', () => {
        const opening = searchPanel.hidden;
        searchPanel.hidden = !opening;
        libraryPanel.hidden = true;
        searchToggle.setAttribute('aria-expanded', String(opening));
        libraryToggle.setAttribute('aria-expanded', 'false');
        if (opening) {
            renderSearchResults();
            searchInput.focus();
        }
    });

    panelClose.addEventListener('click', () => {
        searchPanel.hidden = true;
        searchToggle.setAttribute('aria-expanded', 'false');
    });

    libraryToggle.addEventListener('click', () => {
        const opening = libraryPanel.hidden;
        libraryPanel.hidden = !opening;
        searchPanel.hidden = true;
        libraryToggle.setAttribute('aria-expanded', String(opening));
        searchToggle.setAttribute('aria-expanded', 'false');
        if (opening) renderCurrentTab();
    });

    libraryClose.addEventListener('click', () => {
        libraryPanel.hidden = true;
        libraryToggle.setAttribute('aria-expanded', 'false');
    });

    libraryPanel.querySelectorAll('[data-music-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            activeTab = tab.dataset.musicTab;
            libraryPanel.querySelectorAll('[data-music-tab]').forEach(item => item.classList.toggle('active', item === tab));
            renderCurrentTab();
        });
    });

    searchForm.addEventListener('submit', event => {
        event.preventDefault();
        const keyword = searchInput.value.trim();
        if (!keyword) {
            setStatus('请输入歌曲、歌手或专辑名', true, statusElement);
            searchInput.focus();
            return;
        }
        searchMusic(keyword);
    });

    favoriteOrderSelect.value = favoriteOrder;
    favoriteOrderSelect.addEventListener('change', () => {
        favoriteOrder = favoriteOrderSelect.value;
        saveStoredValue(FAVORITE_ORDER_KEY, favoriteOrder);
        if (activeTab === 'favorites') renderCurrentTab();
    });

    historyClearButton.addEventListener('click', () => {
        history = [];
        saveTracks(HISTORY_KEY, history);
        renderCurrentTab();
        setStatus('已清除全部播放历史', false, libraryStatusElement);
    });

    historyPauseToggle?.addEventListener('change', () => {
        historyEnabled = !historyPauseToggle.checked;
        saveStoredValue(HISTORY_ENABLED_KEY, String(historyEnabled));
        updateMusicSettings();
    });

    lyricsPauseToggle?.addEventListener('change', () => {
        lyricsEnabled = !lyricsPauseToggle.checked;
        saveStoredValue(LYRICS_ENABLED_KEY, String(lyricsEnabled));
        updateMusicSettings();
        loadLyrics(currentTrack);
    });

    homeLyricsEffectToggle?.addEventListener('change', () => {
        homeLyricsEffectEnabled = homeLyricsEffectToggle.checked;
        saveStoredValue(HOME_LYRICS_EFFECT_KEY, String(homeLyricsEffectEnabled));
        updateMusicSettings();
        syncLyricPlacement();
    });

    clearMusicDataButton?.addEventListener('click', () => {
        musicDataConfirm.hidden = false;
        confirmClearMusicDataButton.focus();
    });

    cancelClearMusicDataButton?.addEventListener('click', () => {
        musicDataConfirm.hidden = true;
        clearMusicDataButton.focus();
    });

    confirmClearMusicDataButton?.addEventListener('click', () => {
        [HISTORY_KEY, FAVORITES_KEY, FAVORITE_ORDER_KEY, PLAY_MODE_KEY, HISTORY_ENABLED_KEY, LYRICS_ENABLED_KEY, HOME_LYRICS_EFFECT_KEY, VOLUME_KEY, PLAYER_COLLAPSED_KEY]
            .forEach(removeStoredValue);
        history = [];
        favorites = [];
        favoriteOrder = 'added-desc';
        playbackMode = 'sequential';
        historyEnabled = true;
        lyricsEnabled = true;
        homeLyricsEffectEnabled = true;
        searchResults = [];
        activeQueue = localSongs;
        currentSongIndex = 0;
        currentTrack = localSongs[0];
        currentLyrics = [];
        currentLyricIndex = -1;
        coverRequests.clear();
        lyricRequests.clear();
        audio.pause();
        audio.volume = 1;
        audio.muted = false;
        setPlayerCollapsed(false, false);
        syncVolume();
        audio.src = currentTrack.src;
        audio.currentTime = 0;
        searchInput.value = '';
        musicDataConfirm.hidden = true;
        updateMusicSettings();
        updateSongInfo();
        updatePlayButton();
        updatePlayModeButtons();
        renderSearchResults();
        renderCurrentTab();
        loadLyrics(currentTrack);
        updateProgress();
        setStatus('已清除全部本地音乐数据');
    });

    progressInput.addEventListener('input', () => {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        audio.currentTime = (Number(progressInput.value) / 1000) * audio.duration;
        updateProgress();
    });

    audio.addEventListener('play', () => {
        isPlaying = true;
        updatePlayButton();
    });
    audio.addEventListener('pause', () => {
        isPlaying = false;
        updatePlayButton();
    });
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('durationchange', updateProgress);
    audio.addEventListener('ended', playNextByMode);
    audio.addEventListener('error', () => {
        if (!currentTrack || currentTrack.isLocal) {
            setStatus('本地音乐加载失败', true);
            return;
        }
        const key = trackKey(currentTrack);
        if (retryingTrackKey === key) {
            retryingTrackKey = '';
            setStatus('歌曲链接已失效，重新解析后仍无法播放', true);
            return;
        }
        retryingTrackKey = key;
        playTrack(currentTrack, activeQueue, currentSongIndex, true).finally(() => {
            window.setTimeout(() => { retryingTrackKey = ''; }, 3000);
        });
    });

    coverImage.addEventListener('error', () => {
        coverImage.hidden = true;
        coverFallback.hidden = false;
    });

    audio.src = currentTrack.src;
    updateSongInfo();
    updatePlayButton();
    updatePlayModeButtons();
    updateMusicSettings();
    syncLyricPlacement();
    renderSearchResults();
    renderCurrentTab();
    updateProgress();
}
// ---------- 首次访问公告 ----------
function initAnnouncement() {
    const KEY = 'winy_announce_music_v4_0';
    let seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { seen = false; }
    if (seen) return;

    const mask = document.getElementById('announce-mask');
    const goBtn = document.getElementById('announce-go');
    const laterBtn = document.getElementById('announce-later');
    if (!mask || !goBtn || !laterBtn) return;

    let closed = false;
    function closeAnnounce(target) {
        if (closed) return;
        closed = true;
        try { localStorage.setItem(KEY, '1'); } catch (e) {}
        mask.classList.remove('show');
        if (target === 'settings') {
            document.getElementById('settings-toggle')?.click();
        } else if (target === 'game') {
            document.querySelector('.nav-link[data-page="game"]')?.click();
        } else if (target === 'music') {
            document.getElementById('music-search-toggle')?.click();
        }
    }

    setTimeout(() => { if (!closed) mask.classList.add('show'); }, 600);

    goBtn.addEventListener('click', () => closeAnnounce('music'));
    laterBtn.addEventListener('click', () => closeAnnounce(null));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mask.classList.contains('show')) closeAnnounce(null);
    });
}

// ---------- 公告存档（关于页面） ----------
// 新增公告：向 announcements 追加一条（ver 递增，列表自动按版本号倒序）；
// 同时更新首页模态框文案，并升级首次访问标记 KEY，让老访客也能看到新公告。
const announcements = [
    {
        ver: 5.0,
        date: '2026-09-15',
        title: '「小功能」区正式上线！',
        body: '1. 新增「小功能」区，点击顶部导航的「小功能」进入页面，可使用一些实用(或许)的小工具。<br>' +
            '2. 新增“缩写转义”，工具来源是：“社交平台上通过拼音首字母缩写指代特定词句的情况越来越多，为了让更多人能勉强理解这一门另类沟通方式、做了这一个划词转义工具”。<br>'+
            '3. 在输入框输入由连续 <b>字母和数字</b> 组成的缩写，即可自动显示所有可能的含义，仅供参考！'
    },
    {
        ver: 4.1,
        date: '2026-09-14',
        title: '「小游戏」区新增“Wordle”！',
        body: '1. 新增「Wordle」小游戏，点击顶部导航的「小游戏」进入游戏页，选择「Wordle」即可开始挑战。<br>' +
            '2.支持经典五字模式，使用原生题库，来挑战吧！<br>' +
            '3. 新增考试模式，支持CET-4/CET-6/IELTS/TOEFL/GRE/考研题库，同时猜词时附有词性及释义，来检验你的词汇量！<br>' +
            '4. 新增长单词模式，自创“滑动窗口”玩法！支持不等长词语猜测对齐，来尝试这种更具挑战性的新玩法吧！<br>'
    },
    {
        ver: 4.0,
        date: '2026-09-14',
        title: '「在线音乐」功能上线！',
        body: '1. 音乐栏蜕变！正式支持在线播放而不仅是本地播放，并支持专辑封面、播放进度和实时歌词。<br>' +
            '2. 新增独立播放列表，可选择顺序循环、单曲循环或随机播放，并直接切换歌曲。<br>' +
            '3. 新增本地播放历史和收藏，收藏可按加入时间或歌名正序、倒序排列。<br>' +
            '4. 新增在线搜索，可以搜索歌名、歌手和专辑，并播放搜索结果。<br>' +
            '5. 历史、收藏、缓存播放地址和播放偏好仅保存在当前浏览器，可在设置中调整相关功能，清除本站浏览器数据即可移除。<br>' +
            '6. 在线搜索结果、封面、歌词和播放地址由 GD音乐台及其上游来源提供；本站仅提供前端播放界面，不主张拥有相关内容版权，服务可用性以第三方实际状态为准。'
    },
    {
        ver: 3.1,
        date: '2026-09-12',
        title: '“关于”文本增加网站内容开源许可声明',
        body: '1. 在「关于」页面的文本中增加了针对代码、原创内容（文字、图片等）以及第三方代码和资源等内容开源许可声明，明确了网站内容的使用、分发和商用规则。'
    },
    {
        ver: 3.0,
        date: '2026-09-11',
        title: '「小游戏」专区上线！新增两个小游戏',
        body: '1. 顶部导航的「连连看」升级为「小游戏」专区，页面顶部新增下拉框，可在「连连看」、「扫雷」和「蜘蛛纸牌」之间自由切换，选择会自动记住。<br>' +
            '2. 连连看模式焕新！三个模式改为竞速（小地图拼速度）、常规（大地图长时间）和BOSS对决（来挑战电脑吧！当然电脑连线速度受到限制，但似乎反而觉醒了一些特殊手段...？）<br>' +
            '3. 全新上线「扫雷」：三档难度；支持插旗、双击数字快速翻开周围格子，还有「提示」道具与各难度的最佳用时纪录。<br>' +
            '4. 全新上线「蜘蛛纸牌」：单色 / 双色 / 四色三档难度，支持点选或拖拽整组搬牌、撤销与提示，并记录各难度的最佳得分。<br>' +
            '5. 小游戏支持后台自动暂停和「老板键」，老板键详细说明详见设置。但作者不对任何上班上学时摸鱼行为负责。'
    },
    {
        ver: 2.0,
        date: '2026-09-06',
        title: '外观系统上线！来自定义属于你的网站 🎨',
        body: '1. 新增「外观」系统，点击顶部导航的「设置」进入设置页，可自定义网站的深浅色、和一些高级视觉效果。<br>' +
            '2. 设置自动保存到设备！换设备访问外观会不同。你也可以点击「恢复默认」来重置所有设置。<br>' +
            '3. 部分动态效果需要浏览器支持，如果你的设置无效请换台设备再试。<br>' +
            '4. 注意！开启高级视觉效果可能会带来设备的卡顿和发热，请根据设备性能谨慎开启。'
    },
    {
        ver: 1.0,
        date: '2026-08-27',
        title: '「连连看」小游戏上线 🎉',
        body: '1. 新上线「连连看」小游戏！点击顶部导航的「连连看」进入游戏页，选好难度后按「开始游戏」即可开局。三种难度、提示与洗牌一应俱全，至于怎么玩……就留给你自己探索啦 😉<br>' +
            '2. 公告系统正式入驻「关于」页面，历史公告可在此查看。'
    },
    {
        ver: 0.1,
        date: '2026-01-16',
        title:'关于网站正式转入常态化运营的通知',
        body: '测试期圆满结束，功能正常，经主页文本调整后决定正式进入常态化运营。特此通知'
    },
    {
        ver: 0.0,
        date: '2026-01-12',
        title:'网站上线啦 🎉',
        body: '这一天终于来了。This is a special gift.'
    }
];

function initAnnounceArchive() {
    const list = document.querySelector('.announce-list');
    if (!list) return;

    announcements.slice().sort((a, b) => b.ver - a.ver).forEach(item => {
        const el = document.createElement('div');
        el.className = 'announce-item';
        el.innerHTML = '<div class="announce-item-head">' +
            '<span class="announce-ver">v' + item.ver + '</span>' +
            '<span class="announce-item-title">' + item.title + '</span>' +
            '<span class="announce-date">' + item.date + '</span>' +
            '<i class="fas fa-chevron-down announce-arrow"></i>' +
            '</div>' +
            '<div class="announce-item-body"><p>' + item.body + '</p></div>';
        const head = el.querySelector('.announce-item-head');
        const body = el.querySelector('.announce-item-body');
        head.setAttribute('role', 'button');
        head.setAttribute('tabindex', '0');
        head.setAttribute('aria-expanded', 'false');
        const toggle = () => setAnnouncementExpanded(el, !el.classList.contains('expanded'));
        head.addEventListener('click', toggle);
        head.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggle();
        });
        body.addEventListener('transitionend', event => {
            if (event.propertyName === 'height' && el.classList.contains('expanded')) body.style.height = 'auto';
        });
        list.appendChild(el);
    });
    if (document.getElementById('about')?.classList.contains('active')) resetAnnounceArchive();
}

function setAnnouncementExpanded(el, expanded) {
    const body = el.querySelector('.announce-item-body');
    const head = el.querySelector('.announce-item-head');
    if (!body || !head || el.classList.contains('expanded') === expanded) return;
    body.style.height = `${body.getBoundingClientRect().height}px`;
    body.offsetHeight;
    el.classList.toggle('expanded', expanded);
    head.setAttribute('aria-expanded', String(expanded));
    body.style.height = expanded ? `${body.scrollHeight}px` : '0px';
}

// 打开关于页：最新公告默认展开，旧公告折叠
function resetAnnounceArchive() {
    document.querySelectorAll('.announce-item').forEach((el, i) => {
        setAnnouncementExpanded(el, i === 0);
    });
}
