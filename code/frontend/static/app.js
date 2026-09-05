// ─── 状态管理 ──────────────────────────────────────────
const state = {
    currentTab: 'favorites',
    searchResults: [],
    localMusic: [],
    favorites: [],
    playlists: [],
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    isLoading: false,
    lyricsFollow: true,
    libraryScroll: {},
    currentSong: null,
    playMode: 'sequence', // 'sequence' | 'shuffle' | 'repeat'
    currentPlayBtn: null,
    isSeeking: false,
    selectedSongIds: new Set(),
    isBatchMode: false,
    currentPlaylistDetailId: null,
    currentLyricIndex: -1,
    currentLyricsKey: '',
    isSearching: false,
    searchController: null,
    pendingKeyword: '',
    lastSearchKeyword: '',
    searchDebounceTimer: null,
};

// DOM 引用
const $ = id => document.getElementById(id);
const audio = $('audioPlayer');
const searchInput = $('searchInput');
const searchBtn = $('searchBtn');
const playBtn = $('playBtn');
const prevBtn = $('prevBtn');
const nextBtn = $('nextBtn');
const playModeBtn = $('playModeBtn');
const progressBar = $('progressBar');
const volumeBar = $('volumeBar');
const currentTime = $('currentTime');
const totalTime = $('totalTime');
const playerBar = $('player');
const playerTitle = $('playerTitle');
const playerArtist = $('playerArtist');
const equalizer = $('equalizer');
const batchToolbar = $('batchToolbar');
const batchCount = $('batchCount');
const batchCancelBtn = $('batchCancelBtn');
const batchFavoriteBtn = $('batchFavoriteBtn');
const batchPlaylistBtn = $('batchPlaylistBtn');
const batchDownloadBtn = $('batchDownloadBtn');
const batchSelectAllBtn = $('batchSelectAllBtn');
const libraryToggle = $('libraryToggle');
const queueBtn = $('queueBtn');
const closeLibraryPanel = $('closeLibraryPanel');
const libraryPanel = $('libraryPanel');
const libraryBackdrop = $('libraryBackdrop');
const vinylRecord = $('vinylRecord');
const albumInitial = $('albumInitial');
const vinylState = $('vinylState');
const ambientSongTitle = $('ambientSongTitle');
const heroSongTitle = $('heroSongTitle');
const lyricsList = $('lyricsList');
const favoriteCurrentBtn = $('favoriteCurrentBtn');
const deleteConfirmModal = $('deleteConfirmModal');
const deleteConfirmTitle = $('deleteConfirmTitle');
const deleteConfirmMessage = $('deleteConfirmMessage');
const cancelDeleteConfirmBtn = $('cancelDeleteConfirmBtn');
const confirmDeleteConfirmBtn = $('confirmDeleteConfirmBtn');

let deleteConfirmResolver = null;
let isSearchComposing = false;
const playbackState = {
    baseVolume: Number(volumeBar?.value || 80) / 100,
    trackGain: 1,
    trackGainCache: new Map(),
    audioPipeline: null,
    analysisToken: 0,
    playToken: 0,
    detailController: null,
    playableInfoCache: new Map(),
    playableInfoRequests: new Map(),
    nextAudioPreloader: null,
    prefetchToken: 0,
    seekFeedbackTimer: null,
};
const LEVELING_TARGET_RMS = 0.16;
const LEVELING_ANALYZE_MS = 1200;
const LEVELING_TIMEOUT_MS = 2500;
const LEVELING_MIN_GAIN = 0.75;
const LEVELING_MAX_GAIN = 1.45;
const LEVELING_PEAK_LIMIT = 0.92;
const PLAYABLE_INFO_TTL_MS = 5 * 60 * 1000;

// ─── SVG 图标 ──────────────────────────────────────────
const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 10 7-10 7z" fill="currentColor" stroke="none"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 5.2-8.8 10-8.8 10s-8.8-4.8-8.8-10a4.6 4.6 0 018-3.1 4.6 4.6 0 018 3.1z" fill="currentColor"/></svg>',
    heartOutline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 5.2-8.8 10-8.8 10s-8.8-4.8-8.8-10a4.6 4.6 0 018-3.1 4.6 4.6 0 018 3.1z"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg>',
    downloadDone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 4 4 7-8M5 16v4h14v-4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14m13-14L8 12l10 7z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5v14M6 5l10 7-10 7z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h2c4 0 8 12 12 12h2m-4-4 4 4-4 3M4 18h2c1.5 0 3-2 4-4m4-4c1.5-2.5 2.5-4 4-4h2m-4-3 4 3-4 4"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 4 4-4 4M4 11V9a2 2 0 012-2h14M8 21l-4-4 4-4m12 0v2a2 2 0 01-2 2H4"/></svg>',
    repeatOne: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 4 4-4 3M4 11V9a2 2 0 012-2h14M8 21l-4-4 4-3m12-1v2a2 2 0 01-2 2H4m7-6 1-1v4"/></svg>',
    musicNote: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="17" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
};

function renderPlaylistFolderIcon(kind = 'card') {
    return `<span class="playlist-folder-icon playlist-folder-icon-${kind}" aria-hidden="true">
        <svg viewBox="0 0 64 64"><rect x="5" y="5" width="54" height="54" rx="6" fill="var(--accent-soft)" stroke="none"/>
        <circle cx="32" cy="32" r="21"/><circle cx="32" cy="32" r="14" opacity="0.45"/>
        <circle cx="32" cy="32" r="6" fill="currentColor" stroke="none"/>
        <circle cx="32" cy="32" r="2" fill="var(--surface)" stroke="none"/></svg>
    </span>`;
}

// ─── 工具栏 ─────────────────────────────────────────────

function toast(msg, isError = false) {
    document.querySelectorAll('.toast').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = `toast${isError ? ' error-toast' : ''}`;
    el.textContent = msg;
    el.setAttribute('role', isError ? 'alert' : 'status');
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, 2000);
}

function closeDeleteConfirm(confirmed) {
    if (!deleteConfirmResolver) return;

    dismissDialog(deleteConfirmModal);
    deleteConfirmModal.setAttribute('aria-hidden', 'true');

    const resolve = deleteConfirmResolver;
    deleteConfirmResolver = null;
    resolve(confirmed);
}

function showDeleteConfirm({ title = '确认删除', message = '', confirmText = '确认删除' } = {}) {
    if (!deleteConfirmModal || !deleteConfirmTitle || !deleteConfirmMessage || !confirmDeleteConfirmBtn) {
        toast('删除确认框初始化失败', true);
        return Promise.resolve(false);
    }

    if (deleteConfirmResolver) {
        closeDeleteConfirm(false);
    }

    deleteConfirmTitle.textContent = title;
    deleteConfirmMessage.textContent = message;
    confirmDeleteConfirmBtn.textContent = confirmText;
    deleteConfirmModal.style.display = 'flex';
    focusDialog(deleteConfirmModal);
    deleteConfirmModal.setAttribute('aria-hidden', 'false');

    return new Promise(resolve => {
        deleteConfirmResolver = resolve;
        requestAnimationFrame(() => cancelDeleteConfirmBtn?.focus());
    });
}

function formatTime(sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SEARCH_SOURCE_LIMIT = 20;

function getSongInitial(song) {
    const text = (song && (song.title || song.artist)) || '♪';
    return String(text).trim().charAt(0).toUpperCase() || '♪';
}

function isBlockedSongText(text) {
    if (!text) return false;
    const normalized = String(text).replace(/\s+/g, '').toLowerCase();
    return ['安全验证', '安全检查', '验证码', '访问过于频繁', 'captcha', 'robot', 'verify']
        .some(marker => normalized.includes(marker));
}

function hasRealLyrics(song) {
    return !!(song && Array.isArray(song.lyrics) && song.lyrics.some(item => String(item && (item.text || item.lineLyric || item.line || '')).trim()));
}

function getLyricEntries(song) {
    if (hasRealLyrics(song)) {
        return song.lyrics
            .map(item => {
                const rawTime = item.time;
                const parsedTime = rawTime === null || rawTime === undefined || rawTime === ''
                    ? null
                    : Number(rawTime);
                return {
                    text: String(item.text || item.lineLyric || item.line || '').trim(),
                    time: Number.isFinite(parsedTime) ? parsedTime : null,
                };
            })
            .filter(item => item.text);
    }
    return [];
}

function getLyricStatusMessage(song) {
    if (!song) return '搜索新声音，或继续听你的收藏。';
    if (song.lyrics_status === 'loading') return song.lyrics_message || '正在加载真实歌词…';
    if (song.lyrics_status === 'source_error') {
        return '歌词暂时没加载出来，音乐会继续播放。';
    }
    return song.lyrics_message || '暂未找到歌词，可能为纯音乐或歌词源尚未收录。';
}

function renderLyrics(song) {
    if (!lyricsList) return;
    const lyricEntries = getLyricEntries(song);
    const lyricsKey = JSON.stringify([
        song ? (song.id || song.url || song.filename || '') : '',
        hasRealLyrics(song),
        song ? (song.lyrics_status || '') : '',
        song ? (song.lyrics_message || '') : '',
        lyricEntries.map(line => [line.time ?? '', line.text]),
    ]);
    if (state.currentLyricsKey === lyricsKey) return;
    state.currentLyricsKey = lyricsKey;
    state.currentLyricIndex = -1;
    state.lyricsFollow = true;
    $('resumeLyricsBtn').hidden = true;
    const fallbackNotice = !hasRealLyrics(song)
        ? `<p class="lyric-note" role="status">${escapeHtml(getLyricStatusMessage(song))}</p>${song?.lyrics_status === 'source_error' ? '<button class="btn-secondary" onclick="retryCurrentLyrics()">重试歌词</button>' : ''}`
        : '';
    lyricsList.innerHTML = fallbackNotice + lyricEntries
        .map((line, index) => `<p class="lyric-line${index === 0 ? ' active' : ''}" data-lyric-index="${index}" data-time="${line.time ?? ''}">${escapeHtml(line.text)}</p>`)
        .join('');
}

function syncLyricHighlight(forceScroll = false) {
    if (!lyricsList) return;
    const lines = Array.from(lyricsList.querySelectorAll('.lyric-line'));
    if (!lines.length) return;

    const timedLines = lines
        .map((line, index) => ({ index, rawTime: line.dataset.time }))
        .filter(item => item.rawTime !== '')
        .map(item => ({ index: item.index, time: Number(item.rawTime) }))
        .filter(item => Number.isFinite(item.time) && item.time >= 0);

    let activeIndex = 0;
    if (timedLines.length && audio.currentTime) {
        for (const item of timedLines) {
            if (item.time <= audio.currentTime + 0.2) {
                activeIndex = item.index;
            } else {
                break;
            }
        }
    } else if (audio.duration && audio.currentTime) {
        activeIndex = Math.min(lines.length - 1, Math.floor((audio.currentTime / audio.duration) * lines.length));
    } else if (state.isPlaying) {
        activeIndex = 1;
    }

    if (activeIndex === state.currentLyricIndex) return;

    state.currentLyricIndex = activeIndex;
    lines.forEach((line, index) => line.classList.toggle('active', index === activeIndex));
    const activeLine = lines[activeIndex];
    if (activeLine && (state.isPlaying || forceScroll) && state.lyricsFollow) {
        lyricsList.scrollTo({
            top: activeLine.offsetTop - lyricsList.offsetTop - lyricsList.clientHeight / 2 + activeLine.clientHeight / 2,
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
    }
}

function syncImmersivePlayerUI() {
    const song = state.currentSong;
    const title = song ? (song.title || '未知歌曲') : '今天，想听什么？';
    const artist = song ? (song.artist || '未知歌手') : '打开音乐库选择播放';

    document.body.classList.toggle('is-playing', state.isPlaying);
    if (vinylRecord) vinylRecord.classList.toggle('is-spinning', state.isPlaying);
    if (albumInitial) albumInitial.textContent = getSongInitial(song);
    if (vinylState) vinylState.textContent = state.isLoading ? '正在连接…' : (state.isPlaying ? '正在播放' : (state.currentSong ? '已暂停' : '等待播放'));
    if (ambientSongTitle) ambientSongTitle.textContent = song ? title : '选择一首歌开始播放';
    if (heroSongTitle) {
        heroSongTitle.textContent = title;
        heroSongTitle.title = title;
    }
    $('heroSongArtist').textContent = song ? artist : '从一首喜欢的歌开始。';
    $('chooseMusicBtn').hidden = !!song;
    playBtn.title = state.isLoading ? '正在连接音频' : (state.isPlaying ? '暂停' : (song ? '播放' : '选歌播放'));
    playBtn.setAttribute('aria-label', playBtn.title);
    playBtn.disabled = state.isLoading;
    playBtn.setAttribute('aria-busy', String(state.isLoading));
    [prevBtn, nextBtn, favoriteCurrentBtn, progressBar].forEach(control => control.disabled = !song);
    playModeBtn.setAttribute('aria-label', playModeBtn.title);
    playModeBtn.classList.toggle('is-selected', state.playMode !== 'sequence');
    if (playerTitle) playerTitle.textContent = song ? title : '未选择歌曲';
    if (playerArtist) playerArtist.textContent = song ? artist : '打开音乐库选择播放';

    renderLyrics(song);
    syncLyricHighlight();
    syncFavoriteCurrentButton();
}

let libraryReturnFocus = null;

function setLibraryOpen(open) {
    if (!libraryPanel || !libraryBackdrop) return;
    if (open && !libraryPanel.classList.contains('open')) libraryReturnFocus = document.activeElement;
    libraryPanel.inert = !open;
    document.querySelector('.music-player-page').inert = open;
    document.querySelector('.app-header').inert = open;
    libraryPanel.classList.toggle('open', open);
    libraryPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    libraryBackdrop.hidden = !open;
    if (libraryToggle) libraryToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    queueBtn.classList.toggle('is-selected', open && state.currentTab === 'queue');
    queueBtn.setAttribute('aria-expanded', String(open && state.currentTab === 'queue'));
    if (open) requestAnimationFrame(() => closeLibraryPanel.focus({ preventScroll: true }));
    else if (libraryReturnFocus?.isConnected) libraryReturnFocus.focus({ preventScroll: true });
}

function openLibrary() {
    setLibraryOpen(true);
}

function closeLibrary() {
    setLibraryOpen(false);
}

const SONG_LIST_TABS = new Set(['search', 'favorites', 'downloads']);

function getVisibleSongIds() {
    return Array.from(document.querySelectorAll('.tab-content.active .song-item'))
        .map(item => item.dataset.songId)
        .filter(Boolean);
}

function syncCachedSongFlags() {
    const favoriteIds = new Set(state.favorites.map(f => f.id));
    const localIds = new Set(state.localMusic.map(s => s.id));
    const lists = [state.searchResults, state.localMusic, state.favorites, state.queue];

    for (const list of lists) {
        for (const song of list) {
            if (!song) continue;
            const favorite = findFavoriteForSong(song);
            const localSong = state.localMusic.find(item => {
                return item.id === song.id
                    || (item.filename && song.filename && item.filename === song.filename)
                    || (sameSongIdentity(item.title, song.title) && sameSongIdentity(item.artist, song.artist));
            });
            song.favorited = Boolean(favorite || favoriteIds.has(song.id));
            song.downloaded = Boolean(song.filename) || localIds.has(song.id) || Boolean(localSong);
            if (localSong && !song.filename) song.filename = localSong.filename;
            if (localSong && !song.url) song.url = localSong.url || localSong.source_url || '';
            if (localSong && !song.source_url) song.source_url = localSong.source_url || localSong.url || '';
        }
    }

    syncFavoriteCurrentButton();
}

function qjjlbSongIdentityKeyFromUrl(url) {
    const value = String(url || '').trim();
    if (!value.toLowerCase().startsWith('qjjlb://')) return '';

    try {
        const parsed = new URL(value);
        const provider = (parsed.hostname || parsed.pathname.replace(/^\/+/, '')).trim().toLowerCase();
        const songIdParam = provider === 'qq' ? 'mid' : 'id';
        const songId = (
            parsed.searchParams.get(songIdParam)
            || parsed.searchParams.get('id')
            || parsed.searchParams.get('mid')
            || parsed.searchParams.get('rid')
            || ''
        ).trim();
        if (!provider || !songId) return '';
        return `qjjlb:${provider}:${songId}`;
    } catch {
        return '';
    }
}

function getSongIdentityKey(song) {
    if (!song || typeof song !== 'object') return '';

    for (const key of ['song_ref', 'url', 'source_url', 'song_url', 'resolved_url']) {
        const identity = qjjlbSongIdentityKeyFromUrl(song[key]);
        if (identity) return identity;
    }

    const provider = String(song.type || '').trim().toLowerCase();
    const songId = String(song.songid || '').trim();
    if (song.source === 'qjjlb' && provider && songId) {
        return `qjjlb:${provider}:${songId}`;
    }
    return '';
}

function getSongInfoReference(song) {
    if (!song) return '';
    for (const key of ['song_ref', 'url', 'song_url', 'resolved_url', 'source_url']) {
        const value = String(song[key] || '').trim();
        if (qjjlbSongIdentityKeyFromUrl(value)) return value;
    }
    return String(song.source_url || song.url || song.mp3_url || '').trim();
}

function findFavoriteForSong(songOrId) {
    const song = typeof songOrId === 'object' ? songOrId : findSongInState(songOrId);
    const songId = typeof songOrId === 'object' ? songOrId?.id : songOrId;
    const identity = getSongIdentityKey(song);
    return state.favorites.find(fav => {
        return fav.id === songId
            || (identity && identity === getSongIdentityKey(fav))
            || (
                song
                && fav.filename
                && song.filename
                && fav.filename === song.filename
                && (fav.id === fav.filename || song.id === song.filename)
            );
    });
}

function isSongFavorited(songOrId) {
    return Boolean(findFavoriteForSong(songOrId));
}

function syncFavoriteCurrentButton() {
    if (!favoriteCurrentBtn) return;

    const favorited = Boolean(state.currentSong && isSongFavorited(state.currentSong));
    favoriteCurrentBtn.classList.toggle('favorited', favorited);
    favoriteCurrentBtn.innerHTML = favorited ? ICON.heart : ICON.heartOutline;
    favoriteCurrentBtn.title = favorited ? '取消收藏当前歌曲' : '收藏当前歌曲';
    favoriteCurrentBtn.setAttribute('aria-label', favoriteCurrentBtn.title);
    favoriteCurrentBtn.setAttribute('aria-pressed', favorited ? 'true' : 'false');
}

function updateBatchSelectionUI() {
    document.querySelectorAll('.song-item').forEach(item => {
        const selected = state.selectedSongIds.has(item.dataset.songId);
        item.classList.toggle('selected', selected);
        const btn = item.querySelector('.song-select-btn');
        if (btn) {
            btn.classList.toggle('selected', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
            btn.innerHTML = selected ? ICON.check : '';
        }
    });
}

function syncBatchToolbar() {
    if (!batchToolbar) return;
    const count = state.selectedSongIds.size;
    const allowBatch = SONG_LIST_TABS.has(state.currentTab);
    const visibleSongIds = getVisibleSongIds();
    const hasVisibleSongs = visibleSongIds.length > 0;
    const visible = allowBatch && (state.isBatchMode || (state.currentTab !== 'favorites' && hasVisibleSongs));
    const isDownloadsTab = state.currentTab === 'downloads';

    batchToolbar.classList.toggle('hidden', !visible);
    libraryPanel.classList.toggle('batch-mode', state.isBatchMode);
    $('manageFavoritesBtn').textContent = state.isBatchMode ? '完成管理' : '批量管理';
    $('manageFavoritesBtn').setAttribute('aria-pressed', String(state.isBatchMode));
    $('favoriteCount').textContent = `${state.favorites.length} 首收藏`;
    $('playFavoritesBtn').disabled = state.favorites.length === 0;
    batchCount.textContent = `已选择 ${count} 首`;
    batchCancelBtn.disabled = count === 0;
    if (batchFavoriteBtn) {
        batchFavoriteBtn.hidden = state.currentTab === 'favorites' || isDownloadsTab;
        batchFavoriteBtn.disabled = count === 0;
    }
    batchPlaylistBtn.disabled = count === 0;
    batchDownloadBtn.hidden = false;
    batchDownloadBtn.textContent = isDownloadsTab ? '批量删除' : '本地下载';
    batchDownloadBtn.classList.toggle('danger', isDownloadsTab);
    batchDownloadBtn.disabled = count === 0;
    batchSelectAllBtn.disabled = !allowBatch || !hasVisibleSongs;
}

function clearBatchSelection() {
    state.selectedSongIds.clear();
    state.isBatchMode = false;
    updateBatchSelectionUI();
    syncBatchToolbar();
}

function toggleSongSelection(songId) {
    if (!SONG_LIST_TABS.has(state.currentTab)) return;

    if (state.selectedSongIds.has(songId)) {
        state.selectedSongIds.delete(songId);
    } else {
        state.selectedSongIds.add(songId);
    }
    state.isBatchMode = true;
    updateBatchSelectionUI();
    syncBatchToolbar();
}

function selectAllCurrentPage() {
    if (!SONG_LIST_TABS.has(state.currentTab)) return;

    const ids = getVisibleSongIds();
    if (!ids.length) return toast('当前页没有可选歌曲', true);

    ids.forEach(id => state.selectedSongIds.add(id));
    state.isBatchMode = state.selectedSongIds.size > 0;
    updateBatchSelectionUI();
    syncBatchToolbar();
    toast(`已全选当前页 ${ids.length} 首`);
}

function showBatchAddToPlaylist() {
    if (!state.selectedSongIds.size) return toast('请先选择歌曲', true);
    showAddToPlaylist(Array.from(state.selectedSongIds));
}

function resolveLocalFilename(songId) {
    const song = findSongInState(songId);
    if (song && song.filename) {
        return song.filename;
    }

    const fav = state.favorites.find(f => f.id === songId && f.filename);
    if (fav) return fav.filename;

    const localSong = state.localMusic.find(s => s.id === songId && s.filename);
    if (localSong) return localSong.filename;

    if (song) {
        const matchedByMeta = state.localMusic.find(localSong => {
            return sameSongIdentity(localSong.title, song.title) && sameSongIdentity(localSong.artist, song.artist);
        });
        if (matchedByMeta && matchedByMeta.filename) return matchedByMeta.filename;
    }

    return song ? songId : '';
}

function sameSongIdentity(a, b) {
    const normalize = value => String(value || '')
        .toLowerCase()
        .replace(/[\s·•－—\-_/()（）\[\]【】,，.。！？!?'"“”‘’]+/g, '')
        .trim();
    return normalize(a) && normalize(a) === normalize(b);
}

// ─── 选项卡切换 ─────────────────────────────────────────

function syncLibraryNavigation() {
    queueBtn.classList.toggle('is-selected', state.currentTab === 'queue' && libraryPanel.classList.contains('open'));
    queueBtn.setAttribute('aria-expanded', String(state.currentTab === 'queue' && libraryPanel.classList.contains('open')));
    const current = state.currentTab === 'playlist-detail' ? 'playlists' : state.currentTab;
    document.querySelectorAll('.tab').forEach(tab => {
        const active = tab.dataset.tab === current;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-current', active ? 'page' : 'false');
    });
    libraryPanel.querySelector('.main-layout').scrollTop = 0;
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', async () => {
        const scroller = libraryPanel.querySelector('.main-layout');
        state.libraryScroll[state.currentTab] = scroller.scrollTop;
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

        const tabName = tab.dataset.tab;
        state.currentTab = tabName;
        syncLibraryNavigation();

        const target = $(`tab-${tabName}`);
        if (target) target.classList.add('active');

        clearBatchSelection();
        if (tabName === 'favorites') await loadFavorites();
        else if (tabName === 'search') renderSearchResults();
        else if (tabName === 'playlists') renderPlaylistsTab();
        else if (tabName === 'downloads') await loadDownloads();
        if (state.currentTab === tabName) scroller.scrollTop = state.libraryScroll[tabName] || 0;
    });
});

if (libraryToggle) libraryToggle.addEventListener('click', openLibrary);
if (queueBtn) queueBtn.addEventListener('click', showQueue);
$('chooseMusicBtn').addEventListener('click', openLibrary);
$('quickSearchBtn').addEventListener('click', focusMusicSearch);
$('manageFavoritesBtn').addEventListener('click', () => {
    if (state.isBatchMode) clearBatchSelection();
    else { state.isBatchMode = true; syncBatchToolbar(); }
});
$('playFavoritesBtn').addEventListener('click', () => {
    if (state.favorites.length) playSong(state.favorites[0].id);
});
$('locatePlayingBtn').addEventListener('click', () => {
    $('queueSongs').querySelector('.playing-now')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});

function focusMusicSearch() {
    openLibrary();
    requestAnimationFrame(() => { searchInput.focus({ preventScroll: true }); searchInput.select(); });
}

function renderQueue() {
    $('queueSummary').textContent = `${state.queue.length} 首 · ${playModeBtn.title}`;
    $('locatePlayingBtn').disabled = !state.currentSong || !state.queue.length;
    $('queueSongs').innerHTML = state.queue.length
        ? state.queue.map(song => buildSongItem(song, { hideSelectBtn: true })).join('')
        : '<div class="empty-state"><p>还没有播放队列</p><p class="hint">从收藏、搜索或歌单播放一首歌，就会出现在这里</p></div>';
    updatePlayButtons();
}

function showQueue() {
    state.libraryScroll[state.currentTab] = libraryPanel.querySelector('.main-layout').scrollTop;
    state.currentTab = 'queue';
    clearBatchSelection();
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === 'tab-queue'));
    syncLibraryNavigation();
    renderQueue();
    openLibrary();
}

function pauseLyricFollow() {
    if (!lyricsList.querySelector('.lyric-line')) return;
    state.lyricsFollow = false;
    $('resumeLyricsBtn').hidden = false;
}
lyricsList.addEventListener('wheel', pauseLyricFollow, { passive: true });
lyricsList.addEventListener('touchstart', pauseLyricFollow, { passive: true });
lyricsList.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) pauseLyricFollow();
});
$('resumeLyricsBtn').addEventListener('click', () => {
    state.lyricsFollow = true;
    state.currentLyricIndex = -1;
    $('resumeLyricsBtn').hidden = true;
    syncLyricHighlight(true);
    lyricsList.focus({ preventScroll: true });
});
if (closeLibraryPanel) closeLibraryPanel.addEventListener('click', closeLibrary);
if (libraryBackdrop) libraryBackdrop.addEventListener('click', closeLibrary);
// Keep keyboard focus in the visible sheet or dialog and restore it on close.
function focusDialog(overlay) {
    overlay.returnFocus = document.activeElement;
    requestAnimationFrame(() => {
        if (overlay.isConnected && overlay.style.display !== 'none') {
            overlay.querySelector('input, button')?.focus();
        }
    });
}

function dismissDialog(overlay) {
    if (overlay.classList.contains('add-to-pl-overlay')) overlay.remove();
    else overlay.style.display = 'none';
    const target = overlay.returnFocus;
    if (target?.isConnected && target.getClientRects().length) target.focus();
    else if (libraryPanel.classList.contains('open')) closeLibraryPanel.focus();
}

document.addEventListener('keydown', e => {
    const popover = $('songActionsPopover').matches(':popover-open') ? $('songActionsPopover') : null;
    const overlay = [...document.querySelectorAll('.modal-overlay, .add-to-pl-overlay')]
        .findLast(el => el.style.display !== 'none');
    if (e.key === 'Escape') {
        if (popover) { e.preventDefault(); popover.hidePopover(); return; }
        if (overlay) {
            e.preventDefault();
            if (overlay === deleteConfirmModal) closeDeleteConfirm(false);
            else dismissDialog(overlay);
        } else if (libraryPanel.classList.contains('open')) closeLibrary();
    }
    const scope = overlay || popover || (libraryPanel.classList.contains('open') ? libraryPanel : null);
    if (e.key !== 'Tab' || !scope) return;
    const focusable = [...scope.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')]
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) return;
    if (e.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
    }
});

if (favoriteCurrentBtn) {
    favoriteCurrentBtn.addEventListener('click', () => {
        if (!state.currentSong) return toast('请先选择歌曲', true);
        toggleFavorite(state.currentSong.id);
    });
}

// 搜索
searchBtn.addEventListener('click', () => {
    doSearch();
});
searchInput.addEventListener('compositionstart', () => {
    isSearchComposing = true;
});
searchInput.addEventListener('compositionend', () => {
    isSearchComposing = false;
});
searchInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || isSearchComposing || e.keyCode === 229) return;
    e.preventDefault();
    doSearch();
});

if (batchCancelBtn) batchCancelBtn.addEventListener('click', () => {
    state.selectedSongIds.clear();
    updateBatchSelectionUI();
    syncBatchToolbar();
});
if (batchFavoriteBtn) batchFavoriteBtn.addEventListener('click', batchFavoriteSongs);
if (batchPlaylistBtn) batchPlaylistBtn.addEventListener('click', showBatchAddToPlaylist);
if (batchDownloadBtn) {
    batchDownloadBtn.addEventListener('click', () => {
        if (state.currentTab === 'downloads') {
            batchDeleteLocalSongs();
        } else {
            batchDownloadLocalSongs();
        }
    });
}
if (batchSelectAllBtn) batchSelectAllBtn.addEventListener('click', selectAllCurrentPage);

function setSearchLoading(isLoading) {
    state.isSearching = isLoading;
    searchBtn.textContent = isLoading ? '搜索中' : '搜索';
    $('searchResults').setAttribute('aria-busy', String(isLoading));
}

async function doSearch(options = {}) {
    const q = searchInput.value.trim();
    searchInput.value = q;
    if (!q) {
        if (!options.silentEmpty) toast('请输入搜索关键词', true);
        return;
    }
    if (state.isSearching && q === state.pendingKeyword) return;
    state.searchController?.abort();
    const controller = new AbortController();
    state.searchController = controller;
    state.pendingKeyword = q;

    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    $('tab-search').classList.add('active');
    state.currentTab = 'search';
    syncLibraryNavigation();
    clearBatchSelection();

    const container = $('searchResults');
    if (q === state.lastSearchKeyword) {
        renderSearchResults();
        setSearchLoading(false);
        return;
    }

    container.innerHTML = '<div class="loading">搜索中...</div>';
    setSearchLoading(true);

    try {
        const params = new URLSearchParams({
            q,
            source_limit: String(SEARCH_SOURCE_LIMIT),
        });
        const resp = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
        const data = await resp.json();
        if (controller !== state.searchController) return;
        if (data.error) {
            container.innerHTML = `<div class="empty-state"><p>${escapeHtml(data.error)}</p></div>`;
            syncBatchToolbar();
            return;
        }
        state.searchResults = data.results || [];
        state.lastSearchKeyword = q;
        syncCachedSongFlags();
        renderSearchResults();
    } catch (err) {
        if (err.name !== 'AbortError' && controller === state.searchController) {
            container.innerHTML = '<div class="empty-state"><p>搜索失败，请检查网络</p><button class="btn-secondary" onclick="doSearch()">重新搜索</button></div>';
        }
    } finally {
        if (controller === state.searchController) setSearchLoading(false);
    }
}

function renderSearchResults() {
    const container = $('searchResults');
    if (!state.searchResults.length) {
        container.innerHTML = state.lastSearchKeyword
            ? '<div class="empty-state"><p>没有找到相关歌曲</p><p class="hint">试试其他关键词</p></div>'
            : '<div class="empty-state"><p>想听什么？</p><p class="hint">在上方搜索歌曲或歌手</p></div>';
        syncBatchToolbar();
        return;
    }
    container.innerHTML = state.searchResults.map(song => buildSongItem(song, { hideSelectBtn: true })).join('');
    updateBatchSelectionUI();
    syncBatchToolbar();
}

// ─── 全部歌曲（本地 + 收藏混合）────────────────────────

async function loadAllSongs() {
    const container = $('allSongs');
    container.innerHTML = '<div class="loading">加载中</div>';
    clearBatchSelection();

    try {
        const [localResp, favResp] = await Promise.all([
            fetch('/api/music'),
            fetch('/api/favorites'),
        ]);
        const localData = await localResp.json();
        const favData = await favResp.json();
        state.localMusic = localData.music || [];
        state.favorites = favData.favorites || [];
        syncCachedSongFlags();

        const favIds = new Set(state.favorites.map(f => f.id));
        const all = [];
        const seen = new Set();

        // 先加收藏的
        for (const fav of state.favorites) {
            all.push({
                id: fav.id,
                title: fav.title,
                artist: fav.artist,
                filename: fav.filename,
                downloaded: fav.downloaded,
                favorited: true,
                url: fav.url,
                source_url: fav.source_url,
            });
            seen.add(getSongIdentityKey(fav) || fav.id);
        }

        // 再加本地但未收藏的
        for (const s of state.localMusic) {
            const seenKey = getSongIdentityKey(s) || s.id;
            if (!seen.has(seenKey)) {
                all.push({ ...s, favorited: Boolean(findFavoriteForSong(s)) });
                seen.add(seenKey);
            }
        }

        if (!all.length) {
            container.innerHTML = '<div class="empty-state"><p>还没有歌曲，去搜索添加吧！</p></div>';
            return;
        }
        container.innerHTML = all.map(song => buildSongItem(song)).join('');
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

// ─── 本地音乐 ───────────────────────────────────────────

async function loadLocalMusic() {
    const container = $('localSongs');
    container.innerHTML = '<div class="loading">加载中</div>';
    clearBatchSelection();

    try {
        const resp = await fetch('/api/music');
        const data = await resp.json();
        state.localMusic = data.music || [];

        if (!state.localMusic.length) {
            container.innerHTML = '<div class="empty-state"><p>本地还没有歌曲</p><p class="hint">搜索歌曲后，点击下载按钮保存到本地</p></div>';
            return;
        }
        container.innerHTML = state.localMusic.map(song => buildSongItem(song)).join('');
        updateBatchSelectionUI();
        syncBatchToolbar();
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

// ─── 收藏 ───────────────────────────────────────────────

async function loadFavorites() {
    const container = $('favSongs');
    if (!container.querySelector('.song-item')) container.innerHTML = '<div class="loading">加载中</div>';

    try {
        const resp = await fetch('/api/favorites');
        const data = await resp.json();
        state.favorites = data.favorites || [];
        syncCachedSongFlags();

        if (!state.favorites.length) {
            container.innerHTML = '<div class="empty-state"><p>还没有收藏的歌曲</p><p class="hint">搜索喜欢的歌曲，点击爱心即可收藏</p></div>';
            return;
        }
        container.innerHTML = state.favorites.map(fav => buildSongItem({
            id: fav.id,
            title: fav.title,
            artist: fav.artist,
            filename: fav.filename,
            downloaded: fav.downloaded,
            favorited: true,
            url: fav.url,
        })).join('');
        updateBatchSelectionUI();
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    } finally {
        syncBatchToolbar();
    }
}

// ─── 下载标签页 ─────────────────────────────────────────

async function loadDownloads() {
    const container = $('downloadSongs');
    container.innerHTML = '<div class="loading">加载中</div>';

    try {
        const [musicResp, favResp] = await Promise.all([
            fetch('/api/music'),
            fetch('/api/favorites'),
        ]);
        const musicData = await musicResp.json();
        const favData = await favResp.json();
        state.localMusic = musicData.music || [];
        state.favorites = favData.favorites || [];

        const favIds = new Set(state.favorites.map(f => f.id));
        for (const s of state.localMusic) {
            s.favorited = Boolean(favIds.has(s.id) || findFavoriteForSong(s));
        }

        if (!state.localMusic.length) {
            container.innerHTML = '<div class="empty-state"><p>还没有下载过歌曲</p><p class="hint">搜索歌曲后，点击下载按钮保存到本地</p></div>';
            return;
        }
        container.innerHTML = state.localMusic.map(song => buildSongItem(song, { hideSelectBtn: true })).join('');
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

// ─── 构建歌曲项 HTML ────────────────────────────────────

function buildSongItem(song, options = {}) {
    const isPlaying = state.currentSong && state.currentSong.id === song.id;
    const isSelected = state.selectedSongIds.has(song.id);
    const hideSelectBtn = !!options.hideSelectBtn;
    const playIcon = isPlaying && state.isPlaying ? ICON.pause : ICON.play;
    const favorited = isSongFavorited(song);
    const favClass = favorited ? 'favorited' : '';
    const favIcon = favorited ? ICON.heart : ICON.heartOutline;

    const playingClass = isPlaying ? 'playing-now' : '';
    return `
        <div class="song-item ${playingClass}${isSelected ? ' selected' : ''}" data-song-id="${song.id}">
            ${hideSelectBtn ? '' : `<button class="song-select-btn${isSelected ? ' selected' : ''}" onclick="toggleSongSelection('${song.id}')" aria-label="选择 ${escapeHtml(song.title || '歌曲')}" aria-pressed="${isSelected ? 'true' : 'false'}">${isSelected ? ICON.check : ''}</button>`}
            <button class="play-btn-item song-cover ${isPlaying ? 'playing' : ''}" onclick="playSong('${song.id}')" title="${isPlaying && state.isPlaying ? '暂停' : '播放'}" aria-label="${isPlaying && state.isPlaying ? '暂停' : '播放'} ${escapeHtml(song.title)}">${playIcon}</button>
            <button class="song-info" onclick="${hideSelectBtn ? '' : `state.isBatchMode ? toggleSongSelection('${song.id}') : `}playSong('${song.id}')" aria-label="${hideSelectBtn ? '播放或暂停' : '播放或选择'} ${escapeHtml(song.title)}">
                <span class="song-title" title="${escapeHtml(song.title || '未知歌曲')}">${escapeHtml(song.title || '未知歌曲')}</span>
                <span class="song-artist" title="${escapeHtml(song.artist || '未知歌手')}">${escapeHtml(song.artist || '未知歌手')}</span>
            </button>
            <div class="song-actions">
                <button class="fav-btn ${favClass}" onclick="toggleFavorite('${song.id}')" title="${favorited ? '取消收藏' : '收藏'}">${favIcon}</button>
                <button class="more-btn" popovertarget="songActionsPopover" onclick="prepareSongActions('${song.id}', '${options.playlistId || ''}', this)" title="更多操作" aria-label="更多操作 ${escapeHtml(song.title)}">${ICON.more}</button>
            </div>
        </div>`;
}

function prepareSongActions(songId, playlistId, trigger) {
    const song = findSongInState(songId);
    if (!song) return;
    const menu = $('songActionsPopover');
    menu.replaceChildren();
    const title = document.createElement('p');
    title.className = 'song-menu-title';
    title.textContent = song.title || '歌曲操作';
    menu.append(title);
    const actions = [
        { label: '加入歌单', icon: ICON.plus, run: () => showAddToPlaylist(songId) },
        { label: song.downloaded ? '已保存到本地' : '下载到本地', icon: ICON.download, disabled: song.downloaded, run: () => downloadSong(songId) },
    ];
    if (playlistId) actions.push({ label: '从歌单移除', icon: ICON.minus, run: () => removeSongFromPlaylist(playlistId, songId) });
    if (song.downloaded) actions.push({ label: '删除本地文件', icon: ICON.trash, danger: true, run: () => deleteLocalSong(songId) });
    for (const action of actions) {
        const button = document.createElement('button');
        button.className = `pl-option${action.danger ? ' danger' : ''}`;
        button.innerHTML = `${action.icon}<span>${action.label}</span>`;
        button.disabled = !!action.disabled;
        button.addEventListener('click', () => { menu.hidePopover(); action.run(); });
        menu.append(button);
    }
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(12, Math.min(rect.right - 240, innerWidth - 252))}px`;
    menu.style.top = `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - (actions.length * 48 + 82)))}px`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function releaseAudioIfDeletingFile(filename) {
    if (!filename) return;

    let currentFilename = state.currentSong?.filename || '';
    if (!currentFilename && audio.currentSrc) {
        try {
            const url = new URL(audio.currentSrc);
            if (url.pathname.startsWith('/api/stream/')) {
                currentFilename = decodeURIComponent(url.pathname.split('/').pop() || '');
            }
        } catch {
            currentFilename = '';
        }
    }

    if (currentFilename !== filename) return;

    playbackState.playToken += 1;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    state.isPlaying = false;
    state.isLoading = false;
    state.currentSong = null;
    playBtn.innerHTML = ICON.play;
    equalizer.classList.add('paused');
    updatePlayButtons();
    syncImmersivePlayerUI();
}

// ─── 删除本地音乐 ──────────────────────────────────────

async function deleteLocalSong(songId) {
    // 找到歌曲信息用于显示
    const song = findSongInState(songId);
    const songName = song ? (song.title || '未知歌曲') : '这首歌';

    const confirmed = await showDeleteConfirm({
        title: '删除本地歌曲',
        message: `确定删除本地文件「${songName}」吗？\n删除后如需再次播放，需要重新下载。`,
        confirmText: '确认删除',
    });
    if (!confirmed) {
        return;
    }

    // 需要找到文件名。先在收藏或本地音乐中查找
    let filename = resolveLocalFilename(songId);
    if (song && song.filename) {
        filename = song.filename;
    } else {
        // 从收藏中找
        const fav = state.favorites.find(f => f.id === songId);
        if (fav && fav.filename) filename = fav.filename;
    }
    if (!filename) {
        // 如果都没有，用 songId 当文件名试试
        const localSong = state.localMusic.find(s => s.id === songId);
        filename = localSong ? localSong.filename : songId;
    }

    releaseAudioIfDeletingFile(filename);

    let data;
    try {
        const resp = await fetch(`/api/music/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
        });
        data = await resp.json();
    } catch {
        toast('删除请求失败', true);
        return;
    }

    if (!data.success) {
        toast(data.error || '删除失败', true);
        return;
    }

    toast('已删除本地文件');
    try {
        syncSongRemovedFromCaches(songId, filename, song?.title, song?.artist);
        await Promise.all([loadFavorites(), loadDownloads(), loadPlaylists()]);
        refreshCurrentTab();
    } catch {
        // 删除已成功，刷新失败不回滚文件删除结果
    }
}

// ─── 播放控制 ───────────────────────────────────────────

async function deleteLocalSongSilently(songId, filename = '') {
    const targetFilename = filename || resolveLocalFilename(songId);
    if (!targetFilename) return false;

    releaseAudioIfDeletingFile(targetFilename);

    const resp = await fetch(`/api/music/${encodeURIComponent(targetFilename)}`, {
        method: 'DELETE',
    });
    const data = await resp.json();
    if (!data.success) {
        throw new Error(data.error || '删除失败');
    }
    return true;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getTrackCacheKey(song, audioUrl = '') {
    if (!song) return String(audioUrl || '');
    return String(song.filename || song.mp3_url || song.url || song.source_url || audioUrl || song.id || '');
}

function applyEffectiveVolume() {
    playbackState.baseVolume = clamp(Number(playbackState.baseVolume || 0), 0, 1);
    playbackState.trackGain = clamp(Number(playbackState.trackGain || 1), 0, LEVELING_MAX_GAIN);
    if (playbackState.audioPipeline?.gain) {
        audio.volume = 1;
        playbackState.audioPipeline.gain.gain.value = playbackState.baseVolume * playbackState.trackGain;
        return;
    }
    audio.volume = playbackState.baseVolume;
}

async function ensureAudioPipeline() {
    if (playbackState.audioPipeline) return playbackState.audioPipeline;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;

    try {
        const context = new AudioContextCtor();
        const source = context.createMediaElementSource(audio);
        const analyser = context.createAnalyser();
        const gain = context.createGain();
        analyser.fftSize = 2048;
        const audioPipeline = { context, source, analyser, gain };
        audioPipeline.source.connect(audioPipeline.analyser);
        audioPipeline.analyser.connect(audioPipeline.gain);
        audioPipeline.gain.connect(audioPipeline.context.destination);
        playbackState.audioPipeline = audioPipeline;
        applyEffectiveVolume();
        return audioPipeline;
    } catch {
        return null;
    }
}

function restoreCachedTrackGain(song, audioUrl = '') {
    const trackKey = getTrackCacheKey(song, audioUrl);
    if (!trackKey || !playbackState.trackGainCache.has(trackKey)) {
        playbackState.trackGain = 1;
        applyEffectiveVolume();
        return false;
    }
    playbackState.trackGain = playbackState.trackGainCache.get(trackKey) || 1;
    applyEffectiveVolume();
    return true;
}

function rememberTrackGain(song, audioUrl, gainValue) {
    const trackKey = getTrackCacheKey(song, audioUrl);
    if (!trackKey) return;
    playbackState.trackGainCache.set(trackKey, gainValue);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForMediaEvent(target, eventName, timeoutMs = LEVELING_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            target.removeEventListener(eventName, onEvent);
            clearTimeout(timer);
        };
        const onEvent = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
        };
        const timer = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(`${eventName} timeout`));
        }, timeoutMs);
        target.addEventListener(eventName, onEvent, { once: true });
    });
}

async function waitForAudioMetadata() {
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return;
    await waitForMediaEvent(audio, 'loadedmetadata');
}

async function startAudioPlayback({ song, shouldPlay, seekTime, saveState, playToken }) {
    if (playToken !== playbackState.playToken) return false;

    if (seekTime > 0.5) {
        try {
            await waitForAudioMetadata();
            if (playToken !== playbackState.playToken) return false;
            if (seekTime < (audio.duration || Infinity)) audio.currentTime = seekTime;
        } catch {
            // ponytail: seek fails on some remote streams, playback can still continue from 0.
        }
    }

    playerTitle.textContent = song.title || '未知歌曲';
    playerArtist.textContent = song.artist || '未知歌手';
    updateRangeFill(progressBar);

    if (!shouldPlay) {
        state.isPlaying = false;
        playBtn.innerHTML = ICON.play;
        equalizer.classList.add('paused');
        updatePlayButtons();
        syncImmersivePlayerUI();
        return true;
    }

    try {
        await audio.play();
        if (playToken !== playbackState.playToken) return false;
        state.isPlaying = true;
        playBtn.innerHTML = ICON.pause;
        equalizer.classList.remove('paused');
        updatePlayButtons();
        syncImmersivePlayerUI();
        if (saveState) savePlaybackState();
        return true;
    } catch {
        if (playToken !== playbackState.playToken) return false;
        state.isPlaying = false;
        playBtn.innerHTML = ICON.play;
        equalizer.classList.add('paused');
        updatePlayButtons();
        syncImmersivePlayerUI();
        return false;
    }
}

async function analyzeTrackGain(song, audioUrl, requestToken) {
    const audioPipeline = await ensureAudioPipeline();
    if (!audioPipeline) return false;

    try {
        if (audioPipeline.context.state === 'suspended') {
            await audioPipeline.context.resume();
        }
        await delay(LEVELING_ANALYZE_MS);
        if (requestToken !== playbackState.analysisToken || audio.paused) return false;

        const samples = new Float32Array(audioPipeline.analyser.fftSize);
        audioPipeline.analyser.getFloatTimeDomainData(samples);
        let sumSquares = 0;
        let peak = 0;
        for (const sample of samples) {
            const magnitude = Math.abs(sample);
            sumSquares += sample * sample;
            if (magnitude > peak) peak = magnitude;
        }

        if (requestToken !== playbackState.analysisToken) return false;

        const rms = Math.sqrt(sumSquares / samples.length);
        if (!Number.isFinite(rms) || rms <= 0.0001 || !Number.isFinite(peak) || peak <= 0) {
            return false;
        }

        let nextGain = clamp(LEVELING_TARGET_RMS / rms, LEVELING_MIN_GAIN, LEVELING_MAX_GAIN);
        if (peak * nextGain > LEVELING_PEAK_LIMIT) {
            nextGain = Math.min(nextGain, LEVELING_PEAK_LIMIT / peak);
        }

        playbackState.trackGain = clamp(nextGain, LEVELING_MIN_GAIN, LEVELING_MAX_GAIN);
        rememberTrackGain(song, audioUrl, playbackState.trackGain);
        const gainParam = audioPipeline.gain.gain;
        const now = audioPipeline.context.currentTime;
        const targetGain = playbackState.baseVolume * playbackState.trackGain;
        gainParam.cancelScheduledValues(now);
        gainParam.setValueAtTime(gainParam.value, now);
        gainParam.linearRampToValueAtTime(targetGain, now + 0.15);
        return true;
    } catch {
        return false;
    }
}

async function startPlaybackWithLeveling({ song, audioUrl, shouldPlay = true, seekTime = 0, saveState = false }) {
    playbackState.analysisToken += 1;
    playbackState.trackGain = 1;
    applyEffectiveVolume();
    const nextPreloader = playbackState.nextAudioPreloader;
    if (nextPreloader?.src === new URL(audioUrl, window.location.href).href) {
        playbackState.nextAudioPreloader = null;
        nextPreloader.removeAttribute('src');
        nextPreloader.load();
    }
    audio.src = audioUrl;
    const requestToken = playbackState.analysisToken;
    const playToken = playbackState.playToken;
    const hasCachedGain = restoreCachedTrackGain(song, audioUrl);
    const started = await startAudioPlayback({ song, shouldPlay, seekTime, saveState, playToken });
    if (started && shouldPlay && !hasCachedGain) {
        // ponytail: analyze the already-playing track; startup must never wait for leveling.
        void analyzeTrackGain(song, audioUrl, requestToken);
    }
    return started;
}

async function playSong(songId, { keepQueue = false } = {}) {
    // 在当前所有歌曲列表中找这个歌曲
    let song = resolvePlayableSong(songId);
    if (!keepQueue) syncQueueForSong(songId);
    if (!song) return toast('找不到歌曲信息', true);

    // 如果点击的是同一首歌，切换播放/暂停
    if (state.currentSong && state.currentSong.id === songId) {
        if (state.isLoading) return;
        togglePlayPause();
        return;
    }

    const playToken = ++playbackState.playToken;
    playbackState.detailController?.abort();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    progressBar.value = 0;
    currentTime.textContent = '00:00';
    totalTime.textContent = '00:00';
    updateRangeFill(progressBar);
    state.currentSong = hasRealLyrics(song) ? song : {
        ...song,
        lyrics_status: 'loading',
        lyrics_message: '正在加载真实歌词…',
    };
    state.isPlaying = false;
    state.isLoading = true;
    playBtn.innerHTML = ICON.play;
    syncImmersivePlayerUI();

    const hydrated = await loadOnlineSongInfo(song, { playbackOnly: true });
    if (playToken !== playbackState.playToken) return;
    if (!hydrated || !hydrated.audioUrl) {
        state.isLoading = false;
        syncImmersivePlayerUI();
        toast('无法播放此歌曲', true);
        return;
    }
    song = hydrated.song || song;
    state.currentSong = mergeSongInfo(state.currentSong, song);
    const audioUrl = hydrated.audioUrl;
    syncImmersivePlayerUI();
    void hydrateCurrentSongDetails(state.currentSong, playToken);

    const started = await startPlaybackWithLeveling({
        song,
        audioUrl,
        shouldPlay: true,
        seekTime: 0,
        saveState: true,
    });
    if (playToken !== playbackState.playToken) return;
    state.isLoading = false;
    syncImmersivePlayerUI();
    if (!started) {
        toast('播放失败', true);
        syncImmersivePlayerUI();
        return;
    }
    void prefetchNextSong();
}

function findSongInState(songId) {
    const playlistSongs = state.playlists.flatMap(pl => (pl.songs || []).filter(song => {
        return song && typeof song === 'object' && !Array.isArray(song);
    }));
    const sources = [
        ...state.searchResults,
        ...state.localMusic,
        ...state.favorites,
        ...state.queue,
        ...playlistSongs,
    ];
    return sources.find(s => s.id === songId);
}

function resolvePlayableSong(songId) {
    const song = findSongInState(songId);
    if (song) return song;
    if (typeof songId !== 'string' || !songId.trim()) return null;

    if (/\.mp3$/i.test(songId)) {
        return {
            id: songId,
            title: songId.replace(/\.mp3$/i, ''),
            artist: '未知歌手',
            filename: songId,
            downloaded: true,
        };
    }

    if (/^https?:\/\//i.test(songId)) {
        return {
            id: songId,
            title: '未知歌曲',
            artist: '未知歌手',
            url: songId,
            downloaded: false,
        };
    }

    if (/^qjjlb:\/\//i.test(songId)) {
        return {
            id: songId,
            title: '未知歌曲',
            artist: '未知歌手',
            url: songId,
            downloaded: false,
        };
    }

    return null;
}

function normalizePlaylistSong(songOrId) {
    if (songOrId && typeof songOrId === 'object' && !Array.isArray(songOrId)) {
        const resolved = songOrId.id ? resolvePlayableSong(songOrId.id) : null;
        return {
            ...(resolved || {}),
            ...songOrId,
            id: songOrId.id || resolved?.id || '',
            title: songOrId.title || resolved?.title || '未知歌曲',
            artist: songOrId.artist || resolved?.artist || '未知歌手',
        };
    }
    return resolvePlayableSong(songOrId) || { id: songOrId, title: '未知歌曲', artist: '未知歌手' };
}

function syncQueueForSong(songId) {
    let queue = null;

    if (state.currentTab === 'playlist-detail' && state.currentPlaylistDetailId) {
        const pl = state.playlists.find(p => p.id === state.currentPlaylistDetailId);
        if (pl?.songs?.length) {
            queue = pl.songs.map(normalizePlaylistSong).filter(song => song && song.id);
        }
    } else if (state.currentTab === 'search' && state.searchResults.length) {
        queue = state.searchResults.slice();
    } else if (state.currentTab === 'favorites' && state.favorites.length) {
        queue = state.favorites.slice();
    } else if (state.currentTab === 'downloads' && state.localMusic.length) {
        queue = state.localMusic.slice();
    }

    if (!queue || !queue.length) {
        const existingIndex = state.queue.findIndex(song => song.id === songId);
        if (existingIndex >= 0) {
            state.queueIndex = existingIndex;
            return true;
        }
        return false;
    }

    const queueIndex = queue.findIndex(song => song.id === songId);
    if (queueIndex < 0) return false;

    state.queue = queue;
    state.queueIndex = queueIndex;
    return true;
}

async function getProxyUrl(songUrl) {
    try {
        const resp = await fetch(`/api/song-info?url=${encodeURIComponent(songUrl)}`);
        const data = await resp.json();
        if (data.mp3_url) {
            return getAudioUrl(data.mp3_url);
        }
        if (data.error) toast(data.error, true);
        return null;
    } catch {
        toast('获取播放链接失败', true);
        return null;
    }
}

function getAudioUrl(mp3Url) {
    const url = String(mp3Url || '');
    if (!url) return '';
    if (url.startsWith('/api/stream/')) return url;
    return "/api/proxy-stream?url=" + encodeURIComponent(url);
}

function getImmediateAudioUrl(song) {
    if (!song) return '';
    if (song.filename) return `/api/stream/${encodeURIComponent(song.filename)}`;
    const directMp3Url = song.mp3_url
        || (song.url && /\.mp3(?:[?#].*)?$/i.test(song.url) ? song.url : '');
    return directMp3Url ? getAudioUrl(directMp3Url) : '';
}

function getPlayableInfoKey(song) {
    return String(getSongInfoReference(song) || song?.id || '').trim();
}

async function fetchOnlineSongInfo(songUrl, song = null, options = {}) {
    const { playbackOnly = false, lyricsOnly = false, signal = null, silent = false } = options;
    try {
        const params = new URLSearchParams({ url: songUrl });
        if (song && song.title) params.set('title', song.title);
        if (song && song.artist) params.set('artist', song.artist);
        if (song && getSongInfoReference(song)) params.set('song_ref', getSongInfoReference(song));
        if (playbackOnly) params.set('playback_only', '1');
        if (lyricsOnly) params.set('lyrics_only', '1');
        const resp = await fetch(`/api/song-info?${params.toString()}`, { signal });
        const data = await resp.json();
        if (data.error) {
            if (!silent) toast(data.error, true);
            return null;
        }
        return data;
    } catch (error) {
        if (!silent && error?.name !== 'AbortError') toast('获取播放信息失败', true);
        return null;
    }
}

function mergeSongInfo(song, info) {
    if (!song || !info) return song;
    const songRef = info.song_ref || song.song_ref || getSongInfoReference(song);
    const merged = {
        ...song,
        title: isBlockedSongText(info.title) ? song.title : (info.title || song.title),
        artist: isBlockedSongText(info.artist) ? song.artist : (info.artist || song.artist),
        cover_url: info.cover_url || song.cover_url,
        lyric_id: info.lyric_id || song.lyric_id,
        mp3_url: info.mp3_url || song.mp3_url,
        song_ref: songRef,
        source_url: info.source_url || song.source_url || song.url,
        url: song.url || songRef || info.source_url || song.source_url,
        lyrics_status: info.lyrics_status || song.lyrics_status,
        lyrics_message: info.lyrics_message || '',
        lyrics_source: info.lyrics_source || song.lyrics_source || '',
        lyrics_cached: Boolean(info.lyrics_cached),
    };

    if (Array.isArray(info.lyrics) && (info.lyrics.length || !hasRealLyrics(song))) {
        merged.lyrics = info.lyrics;
    }

    return merged;
}

async function loadOnlineSongInfo(song, options = {}) {
    const { playbackOnly = true, silent = false } = options;
    if (!song) {
        return {
            song,
            audioUrl: '',
        };
    }

    const immediateAudioUrl = getImmediateAudioUrl(song);
    if (immediateAudioUrl) {
        return {
            song,
            audioUrl: immediateAudioUrl,
        };
    }

    const songUrl = getSongInfoReference(song);
    if (!songUrl) {
        return {
            song,
            audioUrl: '',
        };
    }

    const cacheKey = getPlayableInfoKey(song);
    const cached = playbackState.playableInfoCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return {
            song: mergeSongInfo(song, cached.info),
            audioUrl: getAudioUrl(cached.info.mp3_url),
        };
    }

    let requestPromise = playbackState.playableInfoRequests.get(cacheKey);
    if (!requestPromise) {
        requestPromise = fetchOnlineSongInfo(songUrl, song, { playbackOnly, silent })
            .finally(() => playbackState.playableInfoRequests.delete(cacheKey));
        playbackState.playableInfoRequests.set(cacheKey, requestPromise);
    }
    const info = await requestPromise;
    if (!info || !info.mp3_url) return null;
    playbackState.playableInfoCache.set(cacheKey, {
        info,
        expiresAt: Date.now() + PLAYABLE_INFO_TTL_MS,
    });

    return {
        song: mergeSongInfo(song, info),
        audioUrl: getAudioUrl(info.mp3_url),
    };
}

async function hydrateCurrentSongDetails(song, playToken) {
    if (hasRealLyrics(state.currentSong) && state.currentSong?.id === song.id) return;
    const songUrl = getSongInfoReference(song);
    playbackState.detailController?.abort();
    const controller = new AbortController();
    playbackState.detailController = controller;
    for (let attempt = 0; attempt < 2; attempt++) {
        const info = songUrl ? await fetchOnlineSongInfo(songUrl, song, {
            lyricsOnly: true,
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
            silent: true,
        }) : { lyrics: [], lyrics_status: 'not_found' };
        if (controller.signal.aborted || playToken !== playbackState.playToken || state.currentSong?.id !== song.id) return;
        const failed = !info || info.lyrics_status === 'source_error';
        if (failed && attempt === 0) {
            state.currentSong.lyrics_status = 'loading';
            state.currentSong.lyrics_message = '歌词连接有些慢，正在重试…';
            syncImmersivePlayerUI();
            continue;
        }
        state.currentSong = mergeSongInfo(state.currentSong, info || { lyrics: [], lyrics_status: 'source_error' });
        syncImmersivePlayerUI();
        savePlaybackState();
        return;
    }
}

function retryCurrentLyrics() {
    if (!state.currentSong || state.currentSong.lyrics_status === 'loading') return;
    state.currentSong.lyrics_status = 'loading';
    state.currentSong.lyrics_message = '';
    syncImmersivePlayerUI();
    void hydrateCurrentSongDetails(state.currentSong, playbackState.playToken);
}

async function prefetchNextSong() {
    const prefetchToken = ++playbackState.prefetchToken;
    if (state.playMode === 'shuffle' || state.queue.length < 2 || state.queueIndex < 0) return;
    const nextSong = state.queue[(state.queueIndex + 1) % state.queue.length];
    if (!nextSong) return;
    const immediateAudioUrl = getImmediateAudioUrl(nextSong);
    const prefetched = immediateAudioUrl
        ? { audioUrl: immediateAudioUrl }
        : await loadOnlineSongInfo(nextSong, { playbackOnly: true, silent: true });
    if (!prefetched?.audioUrl || prefetched.audioUrl === audio.currentSrc
        || prefetchToken !== playbackState.prefetchToken) return;

    const previousPreloader = playbackState.nextAudioPreloader;
    const nextPreloader = new Audio();
    nextPreloader.preload = 'metadata';
    nextPreloader.src = prefetched.audioUrl;
    playbackState.nextAudioPreloader = nextPreloader;
    nextPreloader.load();
    if (previousPreloader) {
        previousPreloader.removeAttribute('src');
        previousPreloader.load();
    }
}


function togglePlayPause() {
    if (state.isLoading) return;
    if (!state.currentSong && !audio.src) {
        toast('请先在音乐库中选择歌曲', true);
        openLibrary();
        return;
    }

    if (audio.paused) {
        audio.play().then(() => {
            state.isPlaying = true;
            playBtn.innerHTML = ICON.pause;
            equalizer.classList.remove('paused');
            updatePlayButtons();
            syncImmersivePlayerUI();
        }).catch(() => {
            state.isPlaying = false;
            playBtn.innerHTML = ICON.play;
            equalizer.classList.add('paused');
            updatePlayButtons();
            syncImmersivePlayerUI();
            toast('播放失败', true);
        });
    } else {
        audio.pause();
        state.isPlaying = false;
        playBtn.innerHTML = ICON.play;
        equalizer.classList.add('paused');
        updatePlayButtons();
        syncImmersivePlayerUI();
    }
}

playBtn.addEventListener('click', togglePlayPause);

// 禁止右键菜单（屏蔽"从该页面下载音频"）
audio.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('contextmenu', e => {
    // 如果右键点击在播放器区域附近，也阻止
    if (e.target.closest('.player-bar') || e.target.closest('.song-actions')) {
        e.preventDefault();
    }
});

audio.addEventListener('ended', () => {
    state.isPlaying = false;
    playBtn.innerHTML = ICON.play;
    equalizer.classList.add('paused');
    progressBar.value = 0;
    updateRangeFill(progressBar);
    updatePlayButtons();
    syncImmersivePlayerUI();
    // 根据播放模式处理
    if (state.playMode === 'repeat') {
        // 单曲循环：重播当前歌曲
        audio.currentTime = 0;
        audio.play().then(() => {
            state.isPlaying = true;
            playBtn.innerHTML = ICON.pause;
            equalizer.classList.remove('paused');
            updatePlayButtons();
            syncImmersivePlayerUI();
        });
    } else if (state.queue.length > 0) {
        if (state.playMode === 'shuffle') {
            // 随机播放：从队列中随机选一首
            state.queueIndex = Math.floor(Math.random() * state.queue.length);
        } else {
            // 顺序播放：下一首
            state.queueIndex = (state.queueIndex + 1) % state.queue.length;
        }
        playSong(state.queue[state.queueIndex].id, { keepQueue: true });
    }
});

// 上一首/下一首
prevBtn.addEventListener('click', () => {
    if (state.queue.length === 0) return;
    if (state.playMode === 'shuffle') {
        state.queueIndex = Math.floor(Math.random() * state.queue.length);
    } else {
        state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
    }
    playSong(state.queue[state.queueIndex].id, { keepQueue: true });
});

nextBtn.addEventListener('click', () => {
    if (state.queue.length === 0) return;
    if (state.playMode === 'shuffle') {
        state.queueIndex = Math.floor(Math.random() * state.queue.length);
    } else {
        state.queueIndex = (state.queueIndex + 1) % state.queue.length;
    }
    playSong(state.queue[state.queueIndex].id, { keepQueue: true });
});

// 播放模式切换
playModeBtn.addEventListener('click', () => {
    const modes = ['sequence', 'shuffle', 'repeat'];
    const labels = { sequence: '顺序播放', shuffle: '随机播放', repeat: '单曲循环' };
    const icons = { sequence: ICON.repeat, shuffle: ICON.shuffle, repeat: ICON.repeatOne };
    const currentIdx = modes.indexOf(state.playMode);
    state.playMode = modes[(currentIdx + 1) % modes.length];
    playModeBtn.innerHTML = icons[state.playMode];
    playModeBtn.title = labels[state.playMode];
    playModeBtn.setAttribute('aria-label', playModeBtn.title);
    playModeBtn.classList.toggle('is-selected', state.playMode !== 'sequence');
    if (state.currentTab === 'queue') $('queueSummary').textContent = `${state.queue.length} 首 · ${playModeBtn.title}`;
});

function updateRangeFill(el, color1, color2) {
    const val = parseFloat(el.value);
    const min = parseFloat(el.min) || 0;
    const max = parseFloat(el.max) || 100;
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    const c1 = color1 || 'var(--accent)';
    const c2 = color2 || 'rgba(255,255,255,0.12)';
    el.style.backgroundImage = `linear-gradient(to right, ${c1} 0%, ${c1} ${pct}%, ${c2} ${pct}%, ${c2} 100%)`;
}

audio.addEventListener('timeupdate', () => {
    if (audio.duration && !state.isSeeking) {
        progressBar.value = (audio.currentTime / audio.duration) * 100;
        currentTime.textContent = formatTime(audio.currentTime);
        totalTime.textContent = formatTime(audio.duration);
        updateRangeFill(progressBar);
        syncLyricHighlight();
    }
});

function seekAudio() {
    if (!audio.duration) return;
    const targetTime = (progressBar.value / 100) * audio.duration;
    currentTime.textContent = formatTime(targetTime);
    if (Math.abs(audio.currentTime - targetTime) < 0.25) return;

    clearTimeout(playbackState.seekFeedbackTimer);
    playbackState.seekFeedbackTimer = null;
    const targetBuffered = Array.from({ length: audio.buffered.length }, (_, index) => ({
        start: audio.buffered.start(index),
        end: audio.buffered.end(index),
    })).some(range => targetTime >= range.start && targetTime <= range.end);
    if (!targetBuffered) {
        playbackState.seekFeedbackTimer = window.setTimeout(() => {
            progressBar.setAttribute('aria-busy', 'true');
            if (vinylState) vinylState.textContent = '正在缓冲…';
        }, 300);
    }

    audio.currentTime = targetTime;
    syncLyricHighlight();
}

function clearSeekFeedback() {
    clearTimeout(playbackState.seekFeedbackTimer);
    playbackState.seekFeedbackTimer = null;
    progressBar.removeAttribute('aria-busy');
    if (vinylState) vinylState.textContent = state.isPlaying ? '正在播放' : (state.currentSong ? '已暂停' : '等待播放');
}

progressBar.addEventListener('input', () => {
    state.isSeeking = true;
    updateRangeFill(progressBar);
    if (audio.duration) {
        currentTime.textContent = formatTime((progressBar.value / 100) * audio.duration);
    }
});

progressBar.addEventListener('change', () => {
    seekAudio();
    state.isSeeking = false;
    updateRangeFill(progressBar);
});

progressBar.addEventListener('pointercancel', () => {
    state.isSeeking = false;
    updateRangeFill(progressBar);
});

audio.addEventListener('seeked', clearSeekFeedback);
audio.addEventListener('canplay', clearSeekFeedback);

volumeBar.addEventListener('input', () => {
    playbackState.baseVolume = Number(volumeBar.value || 0) / 100;
    localStorage.setItem('music_volume', volumeBar.value);
    applyEffectiveVolume();
    updateRangeFill(volumeBar, 'var(--accent)', 'rgba(255,255,255,0.12)');
});

function setVolume(value) {
    const next = Math.max(0, Math.min(100, Math.round(value)));
    volumeBar.value = String(next);
    playbackState.baseVolume = next / 100;
    localStorage.setItem('music_volume', String(next));
    applyEffectiveVolume();
    updateRangeFill(volumeBar, 'var(--accent)', 'rgba(255,255,255,0.12)');
}

function adjustVolume(delta) {
    setVolume(Number(volumeBar.value || 0) + delta);
}

function isShortcutInputTarget(target = document.activeElement) {
    if (!target) return false;
    if (target.closest && target.closest('.modal-box, .add-to-pl-panel')) return true;
    if (target.isContentEditable) return true;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    return ['input', 'textarea', 'select', 'button'].includes(tag);
}

function handleKeyboardShortcuts(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/' && !e.isComposing && !e.target.closest('input, textarea, select, [contenteditable], .modal-box, .add-to-pl-panel, [popover]')) {
        e.preventDefault();
        focusMusicSearch();
        return;
    }
    if (e.target.closest('#lyricsList') && e.key !== ' ') return;
    if (isShortcutInputTarget(e.target)) return;

    const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
    if (!['space', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) return;

    e.preventDefault();
    if (key === 'space') {
        togglePlayPause();
    } else if (key === 'arrowleft') {
        prevBtn.click();
    } else if (key === 'arrowright') {
        nextBtn.click();
    } else if (key === 'arrowup') {
        adjustVolume(5);
    } else if (key === 'arrowdown') {
        adjustVolume(-5);
    }
}

document.addEventListener('keydown', handleKeyboardShortcuts);

function updatePlayButtons() {
    document.querySelectorAll('.play-btn-item').forEach(btn => {
        btn.classList.remove('playing');
        btn.innerHTML = ICON.play;
        btn.title = '播放';
        btn.setAttribute('aria-label', '播放 ' + (btn.closest('.song-item')?.querySelector('.song-title')?.textContent || '歌曲'));
    });
    document.querySelectorAll('.song-item').forEach(item => {
        item.classList.remove('playing-now');
    });
    if (state.currentSong) {
        document.querySelectorAll(`.song-item[data-song-id="${state.currentSong.id}"]`).forEach(songItem => {
            songItem.classList.add('playing-now');
            const target = songItem.querySelector('.play-btn-item');
            if (target) {
                target.classList.add('playing');
                target.innerHTML = state.isPlaying ? ICON.pause : ICON.play;
                target.title = state.isPlaying ? '暂停' : '播放';
                target.setAttribute('aria-label', target.title + ' ' + (state.currentSong.title || '歌曲'));
            }
        });
    }
}

// ─── 下载 ───────────────────────────────────────────────

async function downloadSong(songId, options = {}) {
    const quiet = options.quiet === true;
    const song = findSongInState(songId);
    if (!song) {
        if (!quiet) toast('找不到歌曲', true);
        return 'missing';
    }
    if (song.downloaded) {
        if (!quiet) toast('已下载过了');
        return 'skipped';
    }

    const downloadUrl = song.mp3_url || song.url;
    if (!downloadUrl) {
        if (!quiet) toast('没有下载链接', true);
        return 'failed';
    }

    if (!quiet) toast('开始下载...');
    try {
        const resp = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: downloadUrl,
                source_url: song.source_url || song.url || downloadUrl,
                song_ref: getSongInfoReference(song),
                title: song.title,
                artist: song.artist,
            }),
        });
        const data = await resp.json();
        if (data.success) {
            if (!quiet) toast('下载完成 ✅');
            if (data.filename) song.filename = data.filename;
            song.downloaded = true;
            if (!quiet) {
                await loadDownloads();
                syncCachedSongFlags();
                if (state.currentTab !== 'downloads') {
                    refreshCurrentTab();
                }
            }
            return 'downloaded';
        } else {
            if (!quiet) toast(data.error || '下载失败', true);
            return 'failed';
        }
    } catch {
        if (!quiet) toast('下载请求失败', true);
        return 'failed';
    }
}
async function toggleFavorite(songId) {
    const song = findSongInState(songId);
    if (!song) return toast('找不到歌曲', true);

    const favorite = findFavoriteForSong(song);
    const favorited = Boolean(favorite);

    if (favorited) {
        try {
            const resp = await fetch('/api/favorites', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: favorite.id }),
            });
            const data = await resp.json();
            if (!data.success) {
                toast(data.error || '操作失败', true);
                return;
            }
            state.favorites = state.favorites.filter(f => f.id !== favorite.id);
            song.favorited = false;
            toast('已取消收藏');
        } catch {
            toast('操作失败', true);
        }
    } else {
        try {
            const resp = await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: songId,
                    title: song.title,
                    artist: song.artist,
                    url: song.url,
                    source_url: song.source_url || song.url || '',
                    mp3_url: song.mp3_url || '',
                    song_ref: getSongInfoReference(song),
                    source: song.source || '',
                    type: song.type || '',
                    songid: song.songid || '',
                    lyric_id: song.lyric_id || '',
                    lyrics: Array.isArray(song.lyrics) ? song.lyrics : [],
                    lyrics_status: song.lyrics_status || '',
                    lyrics_source: song.lyrics_source || '',
                    filename: song.filename || '',
                    downloaded: song.downloaded || false,
                }),
            });
            const data = await resp.json();
            if (!data.success) {
                toast(data.error || '操作失败', true);
                return;
            }
            if (!state.favorites.some(f => f.id === songId)) {
                state.favorites = state.favorites.concat(data.favorite || {
                    id: song.id,
                    title: song.title,
                    artist: song.artist,
                    url: song.url || '',
                    source_url: song.source_url || song.url || '',
                    mp3_url: song.mp3_url || '',
                    song_ref: getSongInfoReference(song),
                    source: song.source || '',
                    type: song.type || '',
                    songid: song.songid || '',
                    lyric_id: song.lyric_id || '',
                    lyrics: Array.isArray(song.lyrics) ? song.lyrics : [],
                    lyrics_status: song.lyrics_status || '',
                    lyrics_source: song.lyrics_source || '',
                    filename: song.filename || '',
                    downloaded: song.downloaded || false,
                });
            }
            song.favorited = true;
            toast('已收藏 ♥');
        } catch {
            toast('操作失败', true);
        }
    }
    syncCachedSongFlags();
    refreshCurrentTab();
}

// ─── 歌单管理 ───────────────────────────────────────────

async function loadPlaylists() {
    try {
        const resp = await fetch('/api/playlists');
        const data = await resp.json();
        state.playlists = data.playlists || [];
        if (state.currentTab === 'playlists' || state.currentTab === 'playlist-detail') {
            renderPlaylistsTab();
        }
    } catch {
        // 静默失败
    }
}

$('addPlaylistBtn').addEventListener('click', () => {
    $('playlistModal').style.display = 'flex';
    focusDialog($('playlistModal'));
    $('playlistNameInput').value = '';
    $('playlistNameInput').focus();
});

$('cancelPlaylistBtn').addEventListener('click', () => {
    dismissDialog($('playlistModal'));
});

cancelDeleteConfirmBtn?.addEventListener('click', () => {
    closeDeleteConfirm(false);
});

confirmDeleteConfirmBtn?.addEventListener('click', () => {
    closeDeleteConfirm(true);
});

deleteConfirmModal?.addEventListener('click', e => {
    if (e.target === deleteConfirmModal) {
        closeDeleteConfirm(false);
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && deleteConfirmResolver) {
        e.preventDefault();
        closeDeleteConfirm(false);
    }
});

$('confirmPlaylistBtn').addEventListener('click', async () => {
    const name = $('playlistNameInput').value.trim();
    if (!name) return toast('请输入歌单名称', true);

    try {
        const resp = await fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        const data = await resp.json();
        if (data.success) {
            toast('歌单已创建');
            dismissDialog($('playlistModal'));
            await loadPlaylists();
        }
    } catch {
        toast('创建失败', true);
    }
});

async function deletePlaylist(plId) {
    const playlist = state.playlists.find(item => item.id === plId);
    const confirmed = await showDeleteConfirm({
        title: '删除歌单',
        message: `确定删除歌单「${playlist?.name || '当前歌单'}」吗？\n歌单里的歌曲不会被一起删除。`,
        confirmText: '确认删除',
    });
    if (!confirmed) return;
    try {
        await fetch(`/api/playlists/${plId}`, { method: 'DELETE' });
        toast('歌单已删除');
        await loadPlaylists();
        // 如果当前在歌单详情页，切回我的歌单
        if (state.currentTab === 'playlist-detail') {
            document.querySelector('.tab[data-tab="playlists"]').click();
        }
    } catch {
        toast('删除失败', true);
    }
}

async function showPlaylistDetail(plId) {
    const pl = state.playlists.find(p => p.id === plId);
    if (!pl) return;

    // 切换到歌单详情视图
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    $('tab-playlist-detail').classList.add('active');
    state.currentTab = 'playlist-detail';
    state.currentPlaylistDetailId = plId;
    syncLibraryNavigation();

    // 构建头部按钮（直接替换 header 内容）
    const header = document.querySelector('.playlist-detail-header');
    header.innerHTML = `
        <div class="playlist-detail-main">
            <button class="back-btn" onclick="document.querySelector('.tab[data-tab=\\'playlists\\']').click()">← 返回</button>
            <div class="playlist-detail-info">
                <h2 title="${escapeHtml(pl.name)}">${escapeHtml(pl.name)}</h2>
                <span class="song-count">${pl.songs.length} 首</span>
            </div>
        </div>
        <div class="playlist-detail-actions">
            <button class="play-all-btn" onclick="playPlaylist('${pl.id}')">${ICON.play} 播放全部</button>
            <button class="add-song-btn" onclick="showAddSongToPlaylist('${pl.id}')">${ICON.plus} 添加歌曲</button>
            <button class="del-pl-btn" onclick="deletePlaylist('${pl.id}')">${ICON.trash} 删除</button>
        </div>
    `;

    const container = $('playlistDetailSongs');
    if (!pl.songs.length) {
        container.innerHTML = '<div class="empty-state"><p>歌单还没有歌曲</p><p class="hint">点击「添加歌曲」，从收藏中挑选</p></div>';
        return;
    }

    const detailSongs = pl.songs.map(songId => {
        return resolvePlayableSong(songId) || { id: songId, title: '未知歌曲', artist: '未知歌手' };
    });

    container.innerHTML = detailSongs.map(song => buildSongItem(song, { playlistId: pl.id, hideSelectBtn: true })).join('');
}

async function removeSongFromPlaylist(plId, songId) {
    const pl = state.playlists.find(p => p.id === plId);
    if (!pl) return toast('歌单不存在', true);

    try {
        const resp = await fetch(`/api/playlists/${plId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ remove_song: songId }),
        });
        const data = await resp.json();
        if (data.success) {
            toast('已从歌单移除');
            await loadPlaylists();
            showPlaylistDetail(plId);
        } else {
            toast(data.error || '移除失败', true);
        }
    } catch {
        toast('移除失败', true);
    }
}

// ─── 添加到歌单浮层 ─────────────────────────────────────

let addToPlSongIds = [];

function showAddToPlaylist(songIdOrIds) {
    addToPlSongIds = Array.isArray(songIdOrIds) ? songIdOrIds.slice() : [songIdOrIds];

    const overlay = document.createElement('div');
    overlay.className = 'add-to-pl-overlay';
    overlay.id = 'addToPlOverlay';

    let optionsHtml = state.playlists.map(pl => `
        <button type="button" class="pl-option" onclick="addSongToPlaylist('${pl.id}')">
            <span class="pl-option-name">${escapeHtml(pl.name)}</span>
            <span class="pl-option-count">(${pl.songs.length})</span>
        </button>
    `).join('');

    if (!state.playlists.length) {
        optionsHtml = '<div style="padding:10px 12px;font-size:13px;color:#999">还没有歌单，先去创建</div>';
    }

    overlay.innerHTML = `
        <div class="add-to-pl-panel" role="dialog" aria-modal="true" aria-label="添加歌曲到歌单">
            <h3>添加到歌单</h3>
            ${optionsHtml}
            <button class="btn-secondary" onclick="dismissDialog(this.closest('.add-to-pl-overlay'))">取消</button>
        </div>
    `;
    document.body.appendChild(overlay);
    focusDialog(overlay);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) dismissDialog(overlay);
    });
}

async function addSongToPlaylist(plId) {
    if (!addToPlSongIds.length) return;

    try {
        const pl = state.playlists.find(p => p.id === plId);
        if (!pl) return;
        const nextSongs = Array.from(new Set([...(pl.songs || []), ...addToPlSongIds]));
        const resp = await fetch(`/api/playlists/${plId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songs: nextSongs }),
        });
        const data = await resp.json();
        if (data.success) {
            toast('已添加到歌单');
            if ($('addToPlOverlay')) dismissDialog($('addToPlOverlay'));
            await loadPlaylists();
        }
    } catch {
        toast('添加失败', true);
    }
}

function syncSongRemovedFromCaches(songId, filename = '', title = '', artist = '') {
    const targetTitle = title;
    const targetArtist = artist;
    const lists = [state.searchResults, state.localMusic, state.favorites, state.queue];
    for (const list of lists) {
        for (const song of list) {
            if (!song) continue;
            const sameMeta = targetTitle && targetArtist
                ? sameSongIdentity(song.title, targetTitle) && sameSongIdentity(song.artist, targetArtist)
                : false;
            if (song.id === songId || song.filename === songId || song.filename === filename || sameMeta) {
                song.downloaded = false;
                song.filename = '';
                song.favorited = false;
            }
        }
    }
}

async function batchFavoriteSongs() {
    const songs = Array.from(state.selectedSongIds)
        .map(id => findSongInState(id))
        .filter(Boolean);
    const targets = songs.filter(song => !song.favorited);

    if (!targets.length) return toast('选中的歌曲都已收藏');

    try {
        for (const song of targets) {
            await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: song.id,
                    title: song.title,
                    artist: song.artist,
                    url: song.url,
                    source_url: song.source_url || song.url || '',
                    mp3_url: song.mp3_url || '',
                    filename: song.filename || '',
                    downloaded: song.downloaded || false,
                }),
            });
            song.favorited = true;
        }
        await loadFavorites();
        refreshCurrentTab();
        clearBatchSelection();
        toast(`已收藏 ${targets.length} 首`);
    } catch {
        toast('批量收藏失败', true);
    }
}

async function batchDownloadLocalSongs() {
    const seen = new Set();
    const songs = Array.from(state.selectedSongIds)
        .map(id => findSongInState(id))
        .filter(song => {
            if (!song || song.downloaded || seen.has(song.id)) return false;
            seen.add(song.id);
            return true;
        });

    if (!songs.length) return toast('选中的歌曲都已在本地', true);

    let downloaded = 0;
    let failed = 0;
    try {
        for (const song of songs) {
            const result = await downloadSong(song.id, { quiet: true });
            if (result === 'downloaded') downloaded++;
            else if (result === 'failed' || result === 'missing') failed++;
        }
        await loadDownloads();
        syncCachedSongFlags();
        clearBatchSelection();
        if (state.currentTab !== 'downloads') {
            refreshCurrentTab();
        }

        if (downloaded && failed) {
            toast(`已本地下载 ${downloaded} 首，${failed} 首失败`, failed > 0);
        } else if (downloaded) {
            toast(`已本地下载 ${downloaded} 首`);
        } else {
            toast('本地下载失败', true);
        }
    } catch (err) {
        toast(err.message || '本地下载失败', true);
    }
}

async function batchDeleteLocalSongs() {
    const seen = new Set();
    const songs = Array.from(state.selectedSongIds)
        .map(id => findSongInState(id))
        .filter(song => {
            if (!song || !song.downloaded || seen.has(song.id)) return false;
            seen.add(song.id);
            return true;
        });

    if (!songs.length) return toast('选中的歌曲都不在本地', true);
    const confirmed = await showDeleteConfirm({
        title: '批量删除本地歌曲',
        message: `确定删除选中的 ${songs.length} 首本地歌曲吗？\n删除后需要重新下载才能播放。`,
        confirmText: `删除 ${songs.length} 首`,
    });
    if (!confirmed) {
        return;
    }

    let deleted = 0;
    let failed = 0;
    try {
        for (const song of songs) {
            try {
                const ok = await deleteLocalSongSilently(song.id, song.filename);
                if (ok) {
                    deleted++;
                    syncSongRemovedFromCaches(song.id, song.filename, song.title, song.artist);
                } else {
                    failed++;
                }
            } catch {
                failed++;
            }
        }

        await Promise.all([loadFavorites(), loadDownloads(), loadPlaylists()]);
        clearBatchSelection();
        if (state.currentTab !== 'downloads') {
            refreshCurrentTab();
        }

        if (deleted && failed) {
            toast(`已删除本地 ${deleted} 首，${failed} 首失败`, true);
        } else if (deleted) {
            toast(`已删除本地 ${deleted} 首`);
        } else {
            toast('批量删除失败', true);
        }
    } catch (err) {
        toast(err.message || '批量删除失败', true);
    }
}

// ─── 我的歌单标签页 ─────────────────────────────────────

function renderPlaylistsTab() {
    const container = $('playlistsGrid');
    if (!state.playlists.length) {
        container.innerHTML = '<div class="empty-state"><p>还没有创建歌单</p><p class="hint">点击上方「新建歌单」，收好同一种心情</p></div>';
        return;
    }
    container.innerHTML = state.playlists.map(pl => {
        const count = pl.songs.length;
        return `
            <div class="playlist-card">
                <button type="button" class="pl-card-top" onclick="showPlaylistDetail('${pl.id}')">
                    <div class="pl-card-icon">${renderPlaylistFolderIcon('card')}</div>
                    <div class="pl-card-name" title="${escapeHtml(pl.name)}">${escapeHtml(pl.name)}</div>
                    <div class="pl-card-count">${count} 首</div>
                </button>
                ${count > 0 ? `<button class="pl-card-play" onclick="event.stopPropagation(); playPlaylist('${pl.id}')" title="播放全部">${ICON.play} 播放全部</button>` : ''}
            </div>
        `;
    }).join('');
}

// ─── 从收藏添加歌曲到歌单 ───────────────────────────────

async function showAddSongToPlaylist(plId) {
    // 确保收藏数据已加载
    if (!state.favorites.length) {
        try {
            const resp = await fetch('/api/favorites');
            const data = await resp.json();
            state.favorites = data.favorites || [];
        } catch {
            return toast('获取收藏列表失败', true);
        }
    }

    if (!state.favorites.length) {
        return toast('还没有收藏的歌曲，先去收藏一些吧', true);
    }

    const pl = state.playlists.find(p => p.id === plId);
    if (!pl) return;

    // 过滤掉已在歌单中的歌曲
    const available = state.favorites.filter(f => !pl.songs.includes(f.id));
    if (!available.length) {
        return toast('收藏的歌曲都已在该歌单中了');
    }

    // 创建选择浮层
    const overlay = document.createElement('div');
    overlay.className = 'add-to-pl-overlay';
    overlay.id = 'addSongsOverlay';

    let itemsHtml = available.map(f => `
        <label class="song-select-item">
            <input type="checkbox" value="${f.id}" data-title="${escapeHtml(f.title)}">
            <span>${escapeHtml(f.title)} - ${escapeHtml(f.artist)}</span>
        </label>
    `).join('');

    overlay.innerHTML = `
        <div class="add-to-pl-panel" role="dialog" aria-modal="true" aria-label="添加歌曲到歌单" style="max-height:80vh;overflow-y:auto;">
            <h3>从收藏添加歌曲到「${escapeHtml(pl.name)}」</h3>
            <div class="song-select-list">${itemsHtml}</div>
            <div style="display:flex;gap:8px;margin-top:12px;">
                <button class="btn-primary" onclick="confirmAddSongsToPlaylist('${plId}')">添加选中</button>
                <button class="btn-secondary" onclick="dismissDialog(this.closest('.add-to-pl-overlay'))">取消</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    focusDialog(overlay);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) dismissDialog(overlay);
    });
}

async function confirmAddSongsToPlaylist(plId) {
    const checked = document.querySelectorAll('#addSongsOverlay input[type="checkbox"]:checked');
    if (!checked.length) return toast('请选择要添加的歌曲');

    const songIds = Array.from(checked).map(cb => cb.value);
    const pl = state.playlists.find(p => p.id === plId);
    if (!pl) return;

    // 批量添加
    let added = 0;
    for (const songId of songIds) {
        if (!pl.songs.includes(songId)) {
            pl.songs.push(songId);
            added++;
        }
    }

    // 保存到后端
    try {
        const resp = await fetch(`/api/playlists/${plId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songs: pl.songs }),
        });
        const data = await resp.json();
        if (data.success) {
            toast(`已添加 ${added} 首歌到歌单`);
            if ($('addSongsOverlay')) dismissDialog($('addSongsOverlay'));
            await loadPlaylists();
            showPlaylistDetail(plId);
        }
    } catch {
        toast('添加失败', true);
    }
}

// ─── 播放歌单全部歌曲 ───────────────────────────────────

function playPlaylist(plId) {
    const pl = state.playlists.find(p => p.id === plId);
    if (!pl || !pl.songs.length) return toast('歌单是空的', true);

    const playlistSongs = pl.songs
        .map(songId => resolvePlayableSong(songId))
        .filter(Boolean);

    if (!playlistSongs.length) return toast('歌单没有可播放的歌曲', true);

    // 设置播放队列
    state.queue = playlistSongs;
    state.queueIndex = 0;
    state.currentSong = null;
    playSong(playlistSongs[0].id, { keepQueue: true });
    toast(`正在播放歌单「${pl.name}」`);
}

// ─── 刷新当前标签页 ─────────────────────────────────────

async function refreshCurrentTab() {
    const tab = state.currentTab;
    const scroller = libraryPanel.querySelector('.main-layout');
    const position = scroller.scrollTop;
    if (tab === 'search') renderSearchResults();
    else if (tab === 'favorites') await loadFavorites();
    else if (tab === 'playlists') renderPlaylistsTab();
    else if (tab === 'downloads') await loadDownloads();
    else if (tab === 'playlist-detail' && state.currentPlaylistDetailId) await showPlaylistDetail(state.currentPlaylistDetailId);
    else if (tab === 'queue') renderQueue();
    if (state.currentTab === tab) scroller.scrollTop = position;
}

// ─── 状态持久化 ─────────────────────────────────────────

function savePlaybackState() {
    if (!state.currentSong) return;
    try {
        const s = state.currentSong;
        localStorage.setItem('music_playback', JSON.stringify({
            currentSong: {
                id: s.id, title: s.title, artist: s.artist,
                url: s.url, source_url: s.source_url, song_ref: s.song_ref,
                type: s.type, songid: s.songid,
                filename: s.filename, downloaded: s.downloaded,
            },
            currentTime: audio.currentTime || 0,
            wasPlaying: state.isPlaying,
            queue: state.queue.map(q => ({
                id: q.id, title: q.title, artist: q.artist,
                url: q.url, source_url: q.source_url, song_ref: q.song_ref,
                type: q.type, songid: q.songid,
                filename: q.filename, downloaded: q.downloaded,
            })),
            queueIndex: state.queueIndex,
            playMode: state.playMode,
        }));
    } catch { /* ignore storage errors */ }
}

// 页面关闭/刷新前保存
window.addEventListener('beforeunload', savePlaybackState);
// 播放中每 30 秒自动保存进度
setInterval(() => {
    if (state.currentSong && state.isPlaying) savePlaybackState();
}, 30000);

async function restorePlaybackState() {
    const saved = localStorage.getItem('music_playback');
    if (!saved) return;
    let data;
    try { data = JSON.parse(saved); } catch { return; }
    if (!data.currentSong) return;

    // 恢复播放模式
    if (data.playMode && data.playMode !== state.playMode) {
        state.playMode = data.playMode;
        const icons = { sequence: ICON.repeat, shuffle: ICON.shuffle, repeat: ICON.repeatOne };
        const labels = { sequence: '顺序播放', shuffle: '随机播放', repeat: '单曲循环' };
        playModeBtn.innerHTML = icons[data.playMode] || ICON.repeat;
        playModeBtn.title = labels[data.playMode] || '顺序播放';
    }

    // 恢复队列
    if (data.queue && data.queue.length > 0) {
        state.queue = data.queue;
        state.queueIndex = data.queueIndex >= 0 ? data.queueIndex : 0;
    }

    // 恢复当前歌曲
    let song = data.currentSong;
    if (isBlockedSongText(song.title) || isBlockedSongText(song.artist)) {
        song = {
            ...song,
            title: song.title && !isBlockedSongText(song.title) ? song.title : '未知歌曲',
            artist: song.artist && !isBlockedSongText(song.artist) ? song.artist : '未知歌手',
        };
    }
    const playToken = ++playbackState.playToken;
    state.currentSong = song;
    playerTitle.textContent = song.title || '未知歌曲';
    playerArtist.textContent = song.artist || '未知歌手';
    equalizer.classList.add('paused');
    updatePlayButtons();
    syncImmersivePlayerUI();

    const hydrated = await loadOnlineSongInfo(song, { playbackOnly: true, silent: true });
    if (playToken !== playbackState.playToken) return;
    if (!hydrated?.audioUrl) {
        localStorage.removeItem('music_playback');
        state.currentSong = null;
        syncImmersivePlayerUI();
        return;
    }
    song = hydrated.song || song;
    state.currentSong = mergeSongInfo(state.currentSong, song);
    const audioUrl = hydrated.audioUrl;
    syncImmersivePlayerUI();

    const seekTime = data.currentTime || 0;
    const shouldPlay = data.wasPlaying;
    void hydrateCurrentSongDetails(state.currentSong, playToken);
    const started = await startPlaybackWithLeveling({
        song,
        audioUrl,
        shouldPlay,
        seekTime,
        saveState: false,
    });
    if (started && playToken === playbackState.playToken) {
        void prefetchNextSong();
    }
}

// ─── 初始化 ─────────────────────────────────────────────

async function showPlaylistDetail(plId) {
    const pl = state.playlists.find(p => p.id === plId);
    if (!pl) return;

    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    $('tab-playlist-detail').classList.add('active');
    state.currentTab = 'playlist-detail';
    state.currentPlaylistDetailId = plId;
    syncLibraryNavigation();

    const header = document.querySelector('.playlist-detail-header');
    header.innerHTML = `
        <div class="playlist-detail-main">
            <button class="back-btn" onclick="document.querySelector('.tab[data-tab=\\'playlists\\']').click()">← 返回</button>
            <div class="playlist-detail-info">
                <h2 title="${escapeHtml(pl.name)}">${escapeHtml(pl.name)}</h2>
                <span class="song-count">${pl.songs.length} 首</span>
            </div>
        </div>
        <div class="playlist-detail-actions">
            <button class="play-all-btn" onclick="playPlaylist('${pl.id}')">${ICON.play} 播放全部</button>
            <button class="add-song-btn" onclick="showAddSongToPlaylist('${pl.id}')">${ICON.plus} 添加歌曲</button>
            <button class="del-pl-btn" onclick="deletePlaylist('${pl.id}')">${ICON.trash} 删除</button>
        </div>
    `;

    const container = $('playlistDetailSongs');
    if (!pl.songs.length) {
        container.innerHTML = '<div class="empty-state"><p>歌单还没有歌曲</p><p class="hint">点击「添加歌曲」，从收藏中挑选</p></div>';
        return;
    }

    const detailSongs = pl.songs.map(normalizePlaylistSong).filter(song => song && song.id);
    container.innerHTML = detailSongs.map(song => buildSongItem(song, { playlistId: pl.id, hideSelectBtn: true })).join('');
}

async function addSongToPlaylist(plId) {
    if (!addToPlSongIds.length) return;

    try {
        const pl = state.playlists.find(p => p.id === plId);
        if (!pl) return;
        const nextSongs = (pl.songs || []).map(normalizePlaylistSong).filter(song => song && song.id);
        for (const songId of addToPlSongIds) {
            const song = findSongInState(songId);
            if (!song || nextSongs.some(existing => existing.id === song.id)) continue;
            nextSongs.push({ ...song });
        }
        const resp = await fetch(`/api/playlists/${plId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songs: nextSongs }),
        });
        const data = await resp.json();
        if (data.success) {
            toast('已添加到歌单');
            if ($('addToPlOverlay')) dismissDialog($('addToPlOverlay'));
            await loadPlaylists();
        }
    } catch {
        toast('添加失败', true);
    }
}

async function confirmAddSongsToPlaylist(plId) {
    const checked = document.querySelectorAll('#addSongsOverlay input[type="checkbox"]:checked');
    if (!checked.length) return toast('请选择要添加的歌曲');

    const songIds = Array.from(checked).map(cb => cb.value);
    const pl = state.playlists.find(p => p.id === plId);
    if (!pl) return;

    const nextSongs = (pl.songs || []).map(normalizePlaylistSong).filter(song => song && song.id);
    let added = 0;
    for (const songId of songIds) {
        const song = findSongInState(songId);
        if (!song || nextSongs.some(existing => existing.id === song.id)) continue;
        nextSongs.push({ ...song });
        added++;
    }

    try {
        const resp = await fetch(`/api/playlists/${plId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songs: nextSongs }),
        });
        const data = await resp.json();
        if (data.success) {
            toast(`已添加 ${added} 首歌曲到歌单`);
            if ($('addSongsOverlay')) dismissDialog($('addSongsOverlay'));
            await loadPlaylists();
            showPlaylistDetail(plId);
        }
    } catch {
        toast('添加失败', true);
    }
}

function playPlaylist(plId) {
    const pl = state.playlists.find(p => p.id === plId);
    if (!pl || !pl.songs.length) return toast('歌单是空的', true);

    const playlistSongs = pl.songs
        .map(normalizePlaylistSong)
        .filter(song => song && song.id && (song.url || song.mp3_url || song.filename));

    if (!playlistSongs.length) return toast('歌单没有可播放的歌曲', true);

    state.queue = playlistSongs;
    state.queueIndex = 0;
    state.currentSong = null;
    playSong(playlistSongs[0].id, { keepQueue: true });
    toast(`正在播放歌单《${pl.name}》`);
}

async function init() {
    syncLibraryNavigation();
    // 初始化按钮图标
    prevBtn.innerHTML = ICON.prev;
    nextBtn.innerHTML = ICON.next;
    playBtn.innerHTML = ICON.play;
    playBtn.classList.add('play-btn');
    playModeBtn.innerHTML = ICON.repeat;
    playModeBtn.title = '顺序播放';
    equalizer.classList.add('paused');

    // 恢复音量和播放状态
    const savedVol = localStorage.getItem('music_volume');
    if (savedVol !== null) {
        volumeBar.value = savedVol;
    }
    playbackState.baseVolume = Number(volumeBar.value || 0) / 100;
    applyEffectiveVolume();
    updateRangeFill(volumeBar, 'var(--accent)', 'rgba(255,255,255,0.12)');
    syncImmersivePlayerUI();
    await Promise.all([loadPlaylists(), loadFavorites()]);
    await restorePlaybackState();
    syncImmersivePlayerUI();
}

init();
