// ─── 状态管理 ──────────────────────────────────────────
const state = {
    currentTab: 'queue',
    searchError: '',
    searchSourceErrors: {},
    lyricsEffect: 'clear',
    searchResults: [],
    unavailableSources: new Map(),
    localMusic: [],
    favorites: [],
    favoritesRevision: 0,
    playlists: [],
    playlistsRevision: 0,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    isLoading: false,
    isBuffering: false,
    playbackError: '',
    resumeTime: 0,
    playHistory: [],
    lyricLines: [],
    timedLyrics: [],
    listFilters: {},
    playlistsError: '',
    lyricsFollow: true,
    libraryScroll: {},
    currentSong: null,
    playMode: 'sequence', // 'sequence' | 'shuffle' | 'repeat'
    currentPlayBtn: null,
    isSeeking: false,
    selectedSongIds: new Set(),
    isDeletingDownloads: false,
    isBatchMode: false,
    currentPlaylistDetailId: null,
    currentLyricIndex: -1,
    currentLyricsKey: '',
    isSearching: false,
    searchController: null,
    pendingKeyword: '',
    lastSearchKeyword: '',
};

// DOM 引用
const $ = id => document.getElementById(id);
const audio = $('audioPlayer');
const searchInput = $('searchInput');
const searchBtn = $('searchBtn');
const listFilterInput = $('listFilterInput');
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
let playerCover = $('playerCover');
const initialCoverUrl = playerCover.getAttribute('src');
let pendingCover = null;
const equalizer = $('equalizer');
const batchToolbar = $('batchToolbar');
const batchCount = $('batchCount');
const batchCancelBtn = $('batchCancelBtn');
const batchFavoriteBtn = $('batchFavoriteBtn');
const batchPlaylistBtn = $('batchPlaylistBtn');
const batchDownloadBtn = $('batchDownloadBtn');
const batchSelectAllBtn = $('batchSelectAllBtn');
const libraryPanel = $('libraryPanel');
const vinylState = $('vinylState');
const lyricsList = $('lyricsList');
const favoriteCurrentBtn = $('favoriteCurrentBtn');
const downloadCurrentBtn = $('downloadCurrentBtn');
const deleteConfirmModal = $('deleteConfirmModal');
const deleteConfirmTitle = $('deleteConfirmTitle');
const deleteConfirmMessage = $('deleteConfirmMessage');
const cancelDeleteConfirmBtn = $('cancelDeleteConfirmBtn');
const confirmDeleteConfirmBtn = $('confirmDeleteConfirmBtn');
const downloadsInProgress = new Set();

let deleteConfirmResolver = null;
let isSearchComposing = false;
const playbackState = {
    baseVolume: Number(volumeBar?.value || 80) / 100,
    trackGain: Math.pow(10, -2 / 20),
    audioPipeline: null,
    analysisToken: 0,
    analysisController: null,
    nextAnalysisController: null,
    playToken: 0,
    detailController: null,
    playController: null,
    playableInfoCache: new Map(),
    playableInfoRequests: new Map(),
    nextAudioPreloader: null,
    prefetchToken: 0,
    seekFeedbackTimer: null,
    bufferingTimer: null,
    autoAdvance: null,
};
const LEVELING_TIMEOUT_MS = 2500;
const LEVELING_FALLBACK_GAIN = Math.pow(10, -2 / 20);
const LEVELING_MAX_GAIN = Math.pow(10, 6 / 20);
const PLAYABLE_INFO_TTL_MS = 5 * 60 * 1000;

// ─── SVG 图标 ──────────────────────────────────────────
const ICON_SPRITE = '/static/player-icons.svg?v=20261122-shine';
const ICON = Object.fromEntries([
    'play', 'pause', 'heart', 'download', 'repeat', 'repeatOne', 'shuffle',
    'plus', 'minus', 'trash', 'more', 'back', 'check', 'record', 'musicNote',
    'queue', 'loader', 'info', 'alert',
].map(name => [name, `<svg class="icon" aria-hidden="true"><use href="${ICON_SPRITE}#${name}"/></svg>`]));

const contentFades = new WeakMap();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function fadeContent(element) {
    if (reducedMotion.matches || !element?.animate) return;
    const style = getComputedStyle(element);
    const duration = parseFloat(style.getPropertyValue('--motion-change'));
    if (!duration) return;
    contentFades.get(element)?.cancel();
    contentFades.set(element, element.animate({ opacity: [.76, 1] }, {
        duration,
        easing: style.getPropertyValue('--motion-ease').trim() || 'ease-out',
    }));
}

async function syncPlayerCover(url) {
    if ((playerCover.dataset.cover || initialCoverUrl) === url) return;
    playerCover.dataset.cover = url;
    pendingCover = null;
    if (playerCover.getAttribute('src') === url) return;

    const replacement = playerCover.cloneNode();
    pendingCover = replacement;
    replacement.src = url;
    try {
        await replacement.decode();
    } catch {
        if (pendingCover !== replacement) return;
        replacement.src = initialCoverUrl;
        try { await replacement.decode(); } catch { return; }
    }
    if (pendingCover !== replacement) return;
    pendingCover = null;
    if (playerCover.getAttribute('src') === replacement.getAttribute('src')) return;
    playerCover.replaceWith(replacement);
    playerCover = replacement;
    fadeContent(playerCover);
}

// ─── 工具栏 ─────────────────────────────────────────────

function toast(msg, isError = false, symbol = 'info') {
    document.querySelector('.toast:not(.undo-notice)')?.remove();
    const el = document.createElement('div');
    el.className = `toast show${isError ? ' error-toast' : ''}`;
    el.innerHTML = ICON[isError ? 'alert' : symbol];
    el.append(document.createTextNode(msg));
    el.setAttribute('role', isError ? 'alert' : 'status');
    document.body.appendChild(el);
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, isError ? 6000 : 3000);
}

let undoAction = null;
let undoReturnFocus = null;

function offerUndo(message, action) {
    undoAction = action;
    undoReturnFocus = document.activeElement;
    $('undoActionBtn').disabled = false;
    $('undoDismissBtn').disabled = false;
    $('undoNotice').hidden = false;
    $('undoMessage').textContent = message;
}

function dismissUndo() {
    const notice = $('undoNotice');
    if (notice.contains(document.activeElement) || document.activeElement === document.body) {
        const target = undoReturnFocus?.getClientRects().length ? undoReturnFocus : libraryPanel.querySelector('.tab.active');
        target?.focus({ preventScroll: true });
    }
    notice.hidden = true;
    undoAction = null;
    undoReturnFocus = null;
}

$('undoDismissBtn').addEventListener('click', dismissUndo);
$('undoActionBtn').addEventListener('click', async () => {
    const action = undoAction;
    if (!action) return;
    $('undoActionBtn').disabled = true;
    $('undoDismissBtn').disabled = true;
    try {
        await action();
        if (undoAction === action) dismissUndo();
        toast('已撤销', false, 'check');
    } catch (error) {
        if (undoAction !== action) return;
        $('undoActionBtn').disabled = false;
        $('undoDismissBtn').disabled = false;
        toast(error.message || '撤销失败，请重试', true);
    }
});

async function fetchJSON(url, options = {}) {
    const resp = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30000) });
    const data = await resp.json().catch(() => { throw new Error('服务响应异常，请重试'); });
    if (!resp.ok || data.error || data.success === false) throw new Error(data.error || '请求失败，请重试');
    return data;
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
    deleteConfirmModal.setAttribute('aria-hidden', 'false');
    deleteConfirmModal.style.display = 'flex';
    focusDialog(deleteConfirmModal);

    return new Promise(resolve => {
        deleteConfirmResolver = resolve;
    });
}

function formatTime(sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SEARCH_SOURCE_LIMIT = 20;
let searchPage = 1;
let searchHasMore = false;
let searchMoreLoading = false;

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
        .map((line, index) => `<p class="lyric-line" data-lyric-index="${index}" data-time="${line.time ?? ''}">${escapeHtml(line.text)}</p>`)
        .join('');
    lyricsList.scrollTop = 0;
    state.lyricLines = Array.from(lyricsList.querySelectorAll('.lyric-line'));
    state.timedLyrics = lyricEntries.map((line, index) => ({ index, time: line.time }))
        .filter(line => line.time !== null && line.time >= 0);
    lyricsList.closest('.lyric-panels').classList.toggle('empty-lyrics', lyricEntries.length === 0);
    $('lyricsEffectBtn').hidden = state.timedLyrics.length === 0;
}

function syncLyricHighlight(forceScroll = false) {
    if (!lyricsList) return;
    const lines = state.lyricLines;
    if (!lines.length || !state.timedLyrics.length) return;
    let activeIndex = -1;
    for (const item of state.timedLyrics) {
        if (item.time > audio.currentTime + 0.2) break;
        activeIndex = item.index;
    }
    if (activeIndex === state.currentLyricIndex && !forceScroll) return;
    if (activeIndex !== state.currentLyricIndex) {
        lines[state.currentLyricIndex]?.classList.remove('active');
        lines[state.currentLyricIndex]?.removeAttribute('aria-current');
        lines[activeIndex]?.classList.add('active');
        lines[activeIndex]?.setAttribute('aria-current', 'true');
        state.currentLyricIndex = activeIndex;
    }
    const activeLine = lines[activeIndex];
    if ((state.isPlaying || forceScroll) && state.lyricsFollow) {
        const top = activeLine ? activeLine.offsetTop - lyricsList.clientHeight / 2 + activeLine.clientHeight / 2 : 0;
        const nearby = Math.abs(top - lyricsList.scrollTop) <= lyricsList.clientHeight;
        lyricsList.scrollTo({ top, behavior: nearby && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
    }
}

function syncImmersivePlayerUI() {
    const song = state.currentSong;
    const waitingToRetry = playbackState.autoAdvance?.timer != null;
    const title = song ? (song.title || '未知歌曲') : '暂未选择歌曲';
    const artist = song ? (song.artist || '未知歌手') : '';

    document.body.classList.toggle('is-playing', state.isPlaying);
    playerBar.classList.toggle('is-flowing', state.isPlaying && !state.isBuffering && !state.isLoading);
    const status = waitingToRetry ? '等待自动重试' : state.playbackError ? '播放遇到问题' : state.isLoading ? '正在连接…' : state.isBuffering ? '正在缓冲…' : (state.isPlaying ? '正在播放' : (song ? '已暂停' : '等待播放'));
    if (vinylState && vinylState.textContent !== status) vinylState.textContent = status;
    const playbackNotice = $('playbackNotice');
    playbackNotice.hidden = !state.playbackError && !state.isBuffering;
    playbackNotice.classList.toggle('has-error', Boolean(state.playbackError));
    const message = state.playbackError || '正在缓冲音频，请稍候…';
    if ($('playbackMessage').textContent !== message) $('playbackMessage').textContent = message;
    $('retryPlaybackBtn').hidden = !state.playbackError;
    favoriteCurrentBtn.hidden = !song;
    playerArtist.hidden = !song;
    playerBar.querySelector('.lyrics-toolbar').hidden = !song;
    playerBar.querySelector('.lyric-panels').hidden = !song;
    syncDownloadCurrentButton();
    playBtn.title = waitingToRetry ? '取消自动重试' : state.isLoading ? '正在连接音频' : (state.isPlaying ? '暂停' : (song ? '播放' : '找歌播放'));
    playBtn.classList.toggle('shows-pause', state.isPlaying || waitingToRetry);
    playBtn.setAttribute('aria-label', playBtn.title);
    playBtn.disabled = state.isLoading;
    playBtn.setAttribute('aria-busy', String(state.isLoading));
    [prevBtn, nextBtn, favoriteCurrentBtn].forEach(control => control.disabled = !song);
    progressBar.disabled = !song || !Number.isFinite(audio.duration) || audio.duration <= 0;
    playModeBtn.setAttribute('aria-label', playModeBtn.title);
    playModeBtn.classList.toggle('is-selected', state.playMode !== 'sequence');
    if (playerTitle.textContent !== title || playerArtist.textContent !== artist) {
        playerTitle.textContent = playerTitle.title = title;
        playerArtist.textContent = playerArtist.title = artist;
        fadeContent(playerTitle.parentElement);
    }
    void syncPlayerCover(song?.cover_url || initialCoverUrl);

    renderLyrics(song);
    syncLyricHighlight();
    syncFavoriteCurrentButton();
}

function openLibrary() {
    libraryPanel.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    libraryPanel.querySelector('.tab.active')?.focus({ preventScroll: true });
}

function syncLyricsEffect() {
    const emphasis = state.lyricsEffect === 'emphasis';
    $('lyricsPanel').classList.toggle('emphasis-lyrics', emphasis);
    const button = $('lyricsEffectBtn');
    button.textContent = emphasis ? '强调高亮' : '清晰高亮';
    button.setAttribute('aria-pressed', String(emphasis));
    button.setAttribute('aria-label', `歌词效果：${button.textContent}，点击切换`);
}

function toggleLyricsEffect() {
    state.lyricsEffect = state.lyricsEffect === 'emphasis' ? 'clear' : 'emphasis';
    syncLyricsEffect();
    try { localStorage.setItem('shine_lyrics_effect', state.lyricsEffect); } catch { /* optional preference */ }
}

$('lyricsEffectBtn').addEventListener('click', toggleLyricsEffect);
downloadCurrentBtn.addEventListener('click', () => {
    if (state.currentSong) void downloadSong(state.currentSong.id);
});

const SONG_LIST_TABS = new Set(['favorites', 'downloads']);

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
    syncDownloadCurrentButton();
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
        const songType = parsed.searchParams.get('song_type') || '0';
        return `qjjlb:${provider}:${songId}` + (provider === 'qq' && !['0', '1'].includes(songType) ? `:${songType}` : '');
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
    favoriteCurrentBtn.title = favorited ? '取消收藏当前歌曲' : '收藏当前歌曲';
    favoriteCurrentBtn.setAttribute('aria-label', favoriteCurrentBtn.title);
    favoriteCurrentBtn.setAttribute('aria-pressed', favorited ? 'true' : 'false');
}

function syncDownloadCurrentButton() {
    const song = state.currentSong;
    const downloaded = song && (song.downloaded || findSongInState(song.id)?.downloaded);
    const streamingOnly = song?.download_allowed === false;
    const downloading = song && downloadsInProgress.has(song.id);
    downloadCurrentBtn.hidden = !song || streamingOnly;
    downloadCurrentBtn.disabled = !song || Boolean(downloaded) || streamingOnly || downloading;
    downloadCurrentBtn.title = downloaded ? '已保存到本地' : downloading ? '正在下载' : streamingOnly ? '此来源仅供在线播放' : '下载当前歌曲';
    downloadCurrentBtn.setAttribute('aria-label', downloadCurrentBtn.title);
}

function updateBatchSelectionUI() {
    document.querySelectorAll('.song-item').forEach(item => {
        const selected = state.selectedSongIds.has(item.dataset.songId);
        item.classList.toggle('selected', selected);
        const btn = item.querySelector('.song-select-btn');
        if (btn) {
            const title = item.querySelector('.song-title').textContent;
            const label = state.isBatchMode ? '选择' : item.querySelector('.play-btn-item').title;
            item.querySelector('.song-info').setAttribute('aria-label', `${label} ${title}`);
            btn.classList.toggle('selected', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        }
    });
}

function syncBatchToolbar() {
    if (!batchToolbar) return;
    const count = state.selectedSongIds.size;
    const allowBatch = SONG_LIST_TABS.has(state.currentTab);
    const visibleSongIds = getVisibleSongIds();
    const hasVisibleSongs = visibleSongIds.length > 0;
    const isDownloadsTab = state.currentTab === 'downloads';
    const visible = allowBatch && state.isBatchMode && (state.currentTab === 'favorites' || isDownloadsTab);
    const busy = state.isDeletingDownloads;
    const host = $(isDownloadsTab ? 'downloadsBatchHost' : 'favoritesBatchHost');
    if (batchToolbar.parentElement !== host) host.append(batchToolbar);

    batchToolbar.classList.toggle('hidden', !visible);
    batchToolbar.setAttribute('aria-label', isDownloadsTab ? '下载批量删除' : '收藏批量操作');
    batchToolbar.setAttribute('aria-busy', String(busy));
    libraryPanel.classList.toggle('batch-mode', state.isBatchMode);
    $('manageFavoritesBtn').textContent = state.isBatchMode ? '完成管理' : '批量管理';
    $('manageFavoritesBtn').setAttribute('aria-pressed', String(state.isBatchMode));
    $('manageFavoritesBtn').disabled = busy;
    $('manageDownloadsBtn').textContent = state.isBatchMode && isDownloadsTab ? '完成管理' : '批量删除';
    $('manageDownloadsBtn').setAttribute('aria-pressed', String(state.isBatchMode && isDownloadsTab));
    $('manageDownloadsBtn').disabled = busy || state.localMusic.length === 0;
    listFilterInput.disabled = busy && isDownloadsTab;
    const favoriteTargets = state.currentTab === 'favorites' ? filterSongs(state.favorites) : state.favorites;
    $('manageFavoritesBtn').hidden = !state.isBatchMode && !favoriteTargets.length;
    $('manageDownloadsBtn').hidden = !state.isBatchMode && !hasVisibleSongs;
    $('playFavoritesBtn').disabled = favoriteTargets.length === 0;
    $('playFavoritesBtn').hidden = !favoriteTargets.length || state.isBatchMode;
    $('playFavoritesBtn').textContent = state.listFilters.favorites?.trim() ? '播放筛选结果' : '播放收藏';
    batchCount.textContent = `已选择 ${count} 首`;
    batchCancelBtn.disabled = busy || count === 0;
    if (batchFavoriteBtn) {
        batchFavoriteBtn.hidden = state.currentTab === 'favorites' || isDownloadsTab;
        batchFavoriteBtn.disabled = count === 0;
    }
    batchPlaylistBtn.hidden = isDownloadsTab;
    batchPlaylistBtn.disabled = busy || count === 0;
    batchDownloadBtn.hidden = !isDownloadsTab && !favoriteTargets.some(song => canDownloadSong(song) && (!count || state.selectedSongIds.has(song.id)));
    batchDownloadBtn.textContent = isDownloadsTab ? (busy ? '处理中…' : '删除选中') : '本地下载';
    batchDownloadBtn.classList.toggle('danger', isDownloadsTab);
    batchDownloadBtn.disabled = busy || count === 0;
    batchSelectAllBtn.textContent = isDownloadsTab ? '全选当前列表' : '全选';
    batchSelectAllBtn.disabled = busy || !allowBatch || !hasVisibleSongs;
}

function clearBatchSelection() {
    state.selectedSongIds.clear();
    state.isBatchMode = false;
    updateBatchSelectionUI();
    syncBatchToolbar();
}

function toggleSongSelection(songId) {
    if (!SONG_LIST_TABS.has(state.currentTab) || state.isDeletingDownloads) return;

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
    if (!SONG_LIST_TABS.has(state.currentTab) || state.isDeletingDownloads) return;

    const ids = getVisibleSongIds();
    if (!ids.length) return toast('当前页没有可选歌曲', true);

    if (state.currentTab === 'downloads') state.selectedSongIds.clear();
    ids.forEach(id => state.selectedSongIds.add(id));
    state.isBatchMode = state.selectedSongIds.size > 0;
    updateBatchSelectionUI();
    syncBatchToolbar();
    toast(`已全选当前列表 ${ids.length} 首`);
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
    const current = state.currentTab === 'playlist-detail' ? 'playlists' : state.currentTab;
    document.querySelectorAll('.tab').forEach(tab => {
        const active = tab.dataset.tab === current;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-current', active ? 'page' : 'false');
    });
    const filterNames = { favorites: '收藏', downloads: '下载', 'playlist-detail': '歌单' };
    $('listFilterBar').hidden = !filterNames[state.currentTab];
    listFilterInput.value = state.listFilters[getListFilterKey()] || '';
    listFilterInput.placeholder = `筛选${filterNames[state.currentTab] || ''}中的歌名、歌手`;
    listFilterInput.setAttribute('aria-label', listFilterInput.placeholder);
    $('listFilterCount').textContent = '';
    libraryPanel.querySelector('.main-layout').scrollTop = 0;
}

function getListFilterKey() {
    return state.currentTab === 'playlist-detail' ? `playlist:${state.currentPlaylistDetailId}` : state.currentTab;
}

function normalizeSearchText(text) {
    return String(text || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function hideUnavailableSong(song) {
    if (!song) return;
    const identity = getSongIdentityKey(song);
    state.unavailableSources ||= new Map();
    const key = identity || song.id;
    if (state.unavailableSources.size >= 128 && !state.unavailableSources.has(key)) state.unavailableSources.delete(state.unavailableSources.keys().next().value);
    state.unavailableSources.set(key, Date.now() + PLAYABLE_INFO_TTL_MS);
    const lists = [state.searchResults, state.favorites, state.queue,
        ...(state.playlists || []).map(playlist => playlist.songs || [])];
    for (const list of lists) {
        for (const item of list || []) {
            if (!item || typeof item !== 'object' || item.filename) continue;
            const itemIdentity = getSongIdentityKey(item);
            if (identity && itemIdentity ? itemIdentity === identity : item.id === song.id) {
                item.unavailable_until = Date.now() + PLAYABLE_INFO_TTL_MS;
                playbackState.playableInfoCache.delete(getPlayableInfoKey(item));
            }
        }
    }
    state.searchResults = state.searchResults.filter(item => !(item.unavailable_until > Date.now()));
    state.queue = state.queue.filter(item => !(item.unavailable_until > Date.now()));
    state.queueIndex = state.queue.findIndex(item => item.id === state.currentSong?.id);
    renderSearchResults();
    if (state.currentTab === 'favorites') renderFavorites();
    else if (state.currentTab === 'queue') renderQueue();
    else if (state.currentTab === 'playlist-detail') renderPlaylistSongs(state.playlists.find(playlist => playlist.id === state.currentPlaylistDetailId));
}


function filterSongs(songs, key = getListFilterKey()) {
    const query = normalizeSearchText(state.listFilters[key] || '');
    const tokens = query.split(' ').filter(Boolean);
    return songs.filter(song => !(song.unavailable_until > Date.now()) && tokens.every(token => normalizeSearchText(`${song.title} ${song.artist}`).includes(token)));
}

function syncListFilterCount(tab, total, visible) {
    if (state.currentTab !== tab) return;
    const filtering = Boolean(state.listFilters[getListFilterKey()]?.trim());
    $('listFilterBar').hidden = !total && !filtering;
    $('listFilterCount').textContent = filtering ? `${visible} / ${total} 首` : tab === 'playlist-detail' ? '' : `${visible} 首`;
}

listFilterInput.addEventListener('input', () => {
    state.listFilters[getListFilterKey()] = listFilterInput.value;
    if (state.currentTab === 'favorites') renderFavorites();
    else if (state.currentTab === 'downloads') {
        state.selectedSongIds.clear();
        renderDownloads();
    }
    else if (state.currentTab === 'playlist-detail') renderPlaylistSongs(state.playlists.find(pl => pl.id === state.currentPlaylistDetailId));
});

function rankSearchResults(songs, keyword) {
    const query = normalizeSearchText(keyword);
    const tokens = query.split(' ').filter(Boolean);
    const score = song => {
        const title = normalizeSearchText(song.title), artist = normalizeSearchText(song.artist);
        const text = `${title} ${artist}`;
        let value = title === query ? 200 : title.includes(query) ? 100 : 0;
        if (title && artist && (query === `${title} ${artist}` || query === `${artist} ${title}`)) value += 500;
        if (tokens.length > 1 && tokens.some(token => title === token)) value += 70;
        if (tokens.length > 1 && tokens.some(token => artist === token)) value += 80;
        value += tokens.filter(token => text.includes(token)).length * 20;
        if (artist === query) value += 30;
        if (/翻唱|cover|钢琴|伴奏|dj|live|现场|女声|男声|深情|改编/i.test(song.title)
            && !/翻唱|cover|钢琴|伴奏|dj|live|现场|女声|男声|深情|改编/i.test(keyword)) value -= 60;
        const requestedVersions = ['翻唱', 'cover', '钢琴', '伴奏', 'dj', 'live', '现场', '改编'].filter(term => query.includes(term));
        if (requestedVersions.length) value += requestedVersions.some(term => title.includes(term)) ? 100 : -100;
        return value;
    };
    return songs.slice().sort((a, b) => score(b) - score(a));
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', async () => {
        const tabName = tab.dataset.tab;
        if (tabName === state.currentTab) return;
        const scroller = libraryPanel.querySelector('.main-layout');
        state.libraryScroll[state.currentTab] = scroller.scrollTop;
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

        state.currentTab = tabName;
        syncLibraryNavigation();

        const target = $(`tab-${tabName}`);
        if (target) target.classList.add('active');

        clearBatchSelection();
        let loading;
        if (tabName === 'favorites') loading = loadFavorites();
        else if (tabName === 'queue') renderQueue();
        else if (tabName === 'playlists') renderPlaylistsTab();
        else if (tabName === 'downloads') loading = loadDownloads();
        const savedTop = state.libraryScroll[tabName] || 0;
        scroller.scrollTop = savedTop;
        const restoredTop = scroller.scrollTop;
        if (loading && savedTop > restoredTop) {
            await loading;
            if (state.currentTab === tabName && scroller.scrollTop === restoredTop) scroller.scrollTop = savedTop;
        }
    });
});

['manageFavoritesBtn', 'manageDownloadsBtn'].forEach(id => {
    $(id).addEventListener('click', () => {
        if (state.isDeletingDownloads) return;
        if (state.isBatchMode) clearBatchSelection();
        else { state.isBatchMode = true; syncBatchToolbar(); }
    });
});
$('playFavoritesBtn').addEventListener('click', () => {
    const songs = filterSongs(state.favorites);
    if (!songs.length) return;
    if (state.currentSong?.id === songs[0].id && (state.isPlaying || state.isLoading)) {
        syncQueueForSong(songs[0].id);
        savePlaybackState();
        return;
    }
    playSong(songs[0].id);
});
$('locatePlayingBtn').addEventListener('click', () => {
    $('queueSongs').querySelector('.playing-now')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});

function focusMusicSearch() {
    if (matchMedia('(max-width: 1100px)').matches) searchInput.scrollIntoView({ block: 'center' });
    searchInput.focus({ preventScroll: true });
    searchInput.select();
}

document.querySelector('.mobile-navigation').addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (link.hash === '#searchHeading') focusMusicSearch();
    else if (link.hash === '#libraryPanel') openLibrary();
    else {
        playerBar.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        playerBar.focus({ preventScroll: true });
    }
});

function renderQueue() {
    $('queueSummary').textContent = state.queue.length ? `${state.queue.length} 首 · ${playModeBtn.title}` : '';
    replaceSongRows($('queueSongs'), state.queue.length
        ? state.queue.map(song => buildSongItem(song, { hideSelectBtn: true })).join('')
        : `<div class="empty-state">${ICON.queue}<p>还没有播放队列</p><p class="hint">播放一首歌后，队列会显示接下来要播的歌曲</p></div>`);
    updatePlayButtons();
}

function pauseLyricFollow() {
    if (!state.timedLyrics.length || !state.lyricsFollow) return;
    state.lyricsFollow = false;
    lyricsList.scrollTo({ top: lyricsList.scrollTop, behavior: 'instant' });
    $('resumeLyricsBtn').hidden = false;
}
lyricsList.addEventListener('wheel', pauseLyricFollow, { passive: true });
lyricsList.addEventListener('touchmove', pauseLyricFollow, { passive: true });
lyricsList.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.target === lyricsList && event.offsetX >= lyricsList.clientWidth) pauseLyricFollow();
});
lyricsList.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) pauseLyricFollow();
});
$('resumeLyricsBtn').addEventListener('click', () => {
    state.lyricsFollow = true;
    $('resumeLyricsBtn').hidden = true;
    syncLyricHighlight(true);
    lyricsList.focus({ preventScroll: true });
});
// Keep keyboard focus in the visible sheet or dialog and restore it on close.
function focusDialog(overlay) {
    overlay.returnFocus = document.activeElement;
    overlay.inert = false;
    overlay.classList.remove('is-closing');
    overlay.querySelector('input:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true });
}

function dismissDialog(overlay) {
    if (overlay.inert || overlay.dataset.submitting === 'true') return;
    const target = overlay.returnFocus;
    overlay.inert = true;
    overlay.classList.add('is-closing');
    overlay.style.display = 'none';
    if (target?.isConnected && target !== document.body && !target.disabled && target.getClientRects().length) target.focus({ preventScroll: true });
    else libraryPanel.querySelector('.tab.active')?.focus({ preventScroll: true });
    if (overlay.classList.contains('add-to-pl-overlay')) {
        overlay.removeAttribute('id');
        const exit = overlay.getAnimations().find(animation => animation.transitionProperty === 'display');
        if (exit) exit.finished.then(() => overlay.remove(), () => overlay.remove());
        else overlay.remove();
    }
}

document.addEventListener('keydown', e => {
    const popover = document.querySelector(':popover-open');
    const overlay = [...document.querySelectorAll('.modal-overlay, .add-to-pl-overlay')]
        .findLast(el => el.style.display !== 'none');
    if (e.key === 'Escape') {
        if (popover) { e.preventDefault(); popover.hidePopover(); return; }
        if (overlay) {
            e.preventDefault();
            if (overlay === deleteConfirmModal) closeDeleteConfirm(false);
            else dismissDialog(overlay);
        }
    }
    const scope = overlay || popover;
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
$('retrySearchBtn').addEventListener('click', () => doSearch({ keyword: state.pendingKeyword }));
$('loadMoreSearchBtn').addEventListener('click', loadMoreSearch);
function clearEmptySearch() {
    if (isSearchComposing || searchInput.value.trim() || !state.pendingKeyword) return;
    state.searchController?.abort();
    state.searchController = null;
    state.searchResults = [];
    state.pendingKeyword = '';
    state.lastSearchKeyword = '';
    state.searchError = '';
    state.searchSourceErrors = {};
    searchHasMore = false;
    searchMoreLoading = false;
    setSearchLoading(false);
}
searchInput.addEventListener('input', clearEmptySearch);
searchInput.addEventListener('compositionstart', () => {
    isSearchComposing = true;
});
searchInput.addEventListener('compositionend', () => {
    isSearchComposing = false;
    clearEmptySearch();
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
    syncSearchPreview();
    searchBtn.textContent = isLoading ? '搜索中' : '搜索';
}

async function readSearchStream(response, onSnapshot) {
    if (!response.body || !response.headers.get('content-type')?.includes('ndjson')) {
        onSnapshot({ ...(await response.json()), done: true });
        return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    try {
        while (true) {
            const { value, done } = await reader.read();
            pending += decoder.decode(value, { stream: !done });
            const lines = pending.split('\n');
            pending = lines.pop();
            for (const line of lines) if (line.trim()) onSnapshot(JSON.parse(line));
            if (done) break;
        }
        if (pending.trim()) onSnapshot(JSON.parse(pending));
    } finally { reader.releaseLock(); }
}

async function doSearch(options = {}) {
    const q = options.keyword ?? searchInput.value.trim();
    if (options.keyword === undefined) searchInput.value = q;
    if (!q) {
        if (!options.silentEmpty) searchInput.focus();
        return;
    }
    if (state.isSearching && q === state.pendingKeyword) return;
    if (q !== state.pendingKeyword) state.searchResults = [];
    state.searchController?.abort();
    const controller = new AbortController();
    state.searchController = controller;
    state.pendingKeyword = q;
    state.searchError = '';
    state.searchSourceErrors = {};
    searchPage = 1;
    searchHasMore = false;
    searchMoreLoading = false;
    state.lastSearchKeyword = '';
    setSearchLoading(true);
    try {
        const params = new URLSearchParams({ q, source_limit: String(SEARCH_SOURCE_LIMIT), stream: '1' });
        const response = await fetch(`/api/search?${params}`, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '搜索服务暂时不可用');
        }
        let finished = false;
        await readSearchStream(response, snapshot => {
            if (controller !== state.searchController || controller.signal.aborted) return;
            if (snapshot.error) throw new Error(snapshot.error);
            state.searchResults = rankSearchResults((snapshot.results || []).filter(song => !song.is_preview
                && !(state.unavailableSources?.get(getSongIdentityKey(song) || song.id) > Date.now())), q);
            searchHasMore = snapshot.has_more ?? state.searchResults.length >= SEARCH_SOURCE_LIMIT;
            state.searchSourceErrors = snapshot.source_errors || {};
            state.lastSearchKeyword = q;
            finished = Boolean(snapshot.done);
            syncCachedSongFlags();
            renderSearchResults();
        });
        if (!finished && controller === state.searchController) throw new Error('搜索连接中断');
    } catch (error) {
        if (!controller.signal.aborted && controller === state.searchController) {
            state.searchError = error.name === 'TimeoutError' ? '搜索等待超时，请重试' : error.message || '搜索暂时未完成，请重试';
        }
    } finally {
        if (controller === state.searchController) setSearchLoading(false);
    }
}

async function loadMoreSearch() {
    if (searchMoreLoading || !searchHasMore || !state.lastSearchKeyword) return;
    const keyword = state.lastSearchKeyword;
    const controller = state.searchController;
    const moreButton = $('loadMoreSearchBtn');
    const hadFocus = Boolean(moreButton && moreButton === document.activeElement);
    let firstAddedId;
    searchMoreLoading = true;
    syncSearchPreview();
    try {
        const params = new URLSearchParams({ q: keyword, source_limit: String(SEARCH_SOURCE_LIMIT), page: String(searchPage + 1) });
        const signal = AbortSignal.timeout(15000);
        const response = await fetch(`/api/search?${params}`, { signal: controller ? AbortSignal.any([controller.signal, signal]) : signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '加载失败');
        if (controller !== state.searchController || keyword !== state.lastSearchKeyword) return;
        const ids = new Set(state.searchResults.map(song => song.id));
        const newSongs = (data.results || []).filter(song => !ids.has(song.id) && !song.is_preview
            && !(state.unavailableSources?.get(getSongIdentityKey(song) || song.id) > Date.now()));
        firstAddedId = newSongs[0]?.id;
        state.searchResults.push(...rankSearchResults(newSongs, keyword));
        syncCachedSongFlags();
        searchPage += 1;
        searchHasMore = Boolean(data.has_more);
    } catch (error) {
        if (controller === state.searchController) toast(error.message || '加载更多失败', true);
    } finally {
        if (controller === state.searchController) {
            searchMoreLoading = false;
            syncSearchPreview();
            if (hadFocus && (document.activeElement === moreButton || document.activeElement === document.body)) {
                const added = firstAddedId && $('searchMiniResults').querySelector(`[data-song-id="${CSS.escape(firstAddedId)}"] .song-info`);
                (added || (!moreButton.hidden && moreButton) || searchInput).focus({ preventScroll: !added });
            }
        }
    }
}

async function resumeGD() {
    try {
        const response = await fetch('/api/gd-resume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) });
        if (!response.ok) throw new Error();
        if ($('gdResumeBtn')) $('gdResumeBtn').hidden = true;
        toast('已恢复音源请求，请重新搜索');
    } catch { toast('恢复请求失败', true); }
}

async function updateGDServerStatus() {
    const message = 'GD 音乐台搜索服务暂时不可用，请稍后重试。';
    if (state.isSearching || (state.searchError !== message && state.searchSourceErrors.netease !== message)) return;
    const controller = state.searchController;
    try {
        const response = await fetch('/api/gd-status', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!response.ok) return;
        const data = await response.json();
        if (data.server_error !== false || controller !== state.searchController) return;
        if (state.searchError === message) state.searchError = '';
        if (state.searchSourceErrors.netease === message) delete state.searchSourceErrors.netease;
        if (!state.searchResults.length) state.lastSearchKeyword = '';
        syncSearchPreview();
    } catch { /* Keep the last confirmed status when the local service cannot be reached. */ }
}

function renderSearchResults() {
    syncSearchPreview();
}

function syncSearchPreview() {
    const results = $('searchMiniResults');
    const status = $('searchStatus');
    const count = $('searchResultCount');
    if (!results || !status || !count) return;
    const countText = state.searchResults.length ? `${state.searchResults.length} 首` : '';
    if (count.textContent !== countText) count.textContent = countText;
    results.setAttribute('aria-busy', String(state.isSearching && !state.searchResults.length));
    const partial = Object.keys(state.searchSourceErrors || {}).length > 0;
    const sourceMessage = Object.values(state.searchSourceErrors || {}).join('；');
    if ($('gdResumeBtn') && /拒绝访问|要求验证/.test(`${state.searchError} ${sourceMessage}`)) $('gdResumeBtn').hidden = false;
    const statusText = state.isSearching
        ? (state.searchResults.length ? '正在搜索…' : '正在搜索音源…')
        : state.searchError || (partial ? sourceMessage : state.lastSearchKeyword ? (state.searchResults.length ? `“${state.lastSearchKeyword}”的搜索结果` : '没有找到匹配歌曲') : '');
    if (status.textContent !== statusText) status.textContent = statusText;
    const searchTokens = normalizeSearchText(state.lastSearchKeyword || state.pendingKeyword).split(' ').filter(Boolean);
    let previousMatch;
    const markup = state.searchResults.length
        ? state.searchResults.map(song => {
            const text = normalizeSearchText(`${song.title || ''} ${song.artist || ''} ${song.album || ''}`);
            const direct = searchTokens.every(token => text.includes(token));
            const heading = searchTokens.length && direct !== previousMatch
                ? `<h3 class="search-result-group">${direct ? '直接匹配' : '其他相关结果'}</h3>` : '';
            previousMatch = direct;
            return heading + buildSongItem(song, { hideSelectBtn: true, fromSearch: true });
        }).join('')
        : state.isSearching ? `<div class="loading">${ICON.loader}正在搜索…</div>`
        : `<div class="empty-state">${state.searchError || partial ? ICON.alert : ICON.musicNote}<p>${escapeHtml(state.searchError || (partial ? '暂时无法连接搜索来源' : state.lastSearchKeyword ? '没有找到可播放的完整版' : '输入歌名或歌手开始搜索。'))}</p>${state.lastSearchKeyword && !state.searchError && !partial ? '<p class="hint">试试其他歌名或歌手。</p>' : ''}</div>`;
    if (results.renderedMarkup !== markup) {
        replaceSongRows(results, markup, searchInput);
        results.renderedMarkup = markup;
    }
    const retry = $('retrySearchBtn');
    const more = $('loadMoreSearchBtn');
    if (retry === document.activeElement && (state.isSearching || !(state.searchError || partial))) searchInput.focus({ preventScroll: true });
    retry.hidden = state.isSearching || !(state.searchError || partial);
    more.hidden = state.isSearching || !searchHasMore || !state.lastSearchKeyword;
    more.setAttribute('aria-disabled', String(searchMoreLoading));
    more.textContent = searchMoreLoading ? '加载中…' : '加载更多';
}

// ─── 全部歌曲（本地 + 收藏混合）────────────────────────

async function loadAllSongs() {
    const container = $('allSongs');
    container.innerHTML = `<div class="loading">${ICON.loader}加载中</div>`;
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
            container.innerHTML = `<div class="empty-state">${ICON.musicNote}<p>还没有歌曲，去搜索添加吧！</p></div>`;
            return;
        }
        container.innerHTML = all.map(song => buildSongItem(song)).join('');
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${ICON.alert}<p>加载失败</p></div>`;
    }
}

// ─── 本地音乐 ───────────────────────────────────────────

async function loadLocalMusic() {
    const container = $('localSongs');
    container.innerHTML = `<div class="loading">${ICON.loader}加载中</div>`;
    clearBatchSelection();

    try {
        const resp = await fetch('/api/music');
        const data = await resp.json();
        state.localMusic = data.music || [];

        if (!state.localMusic.length) {
            container.innerHTML = `<div class="empty-state">${ICON.musicNote}<p>本地还没有歌曲</p><p class="hint">搜索歌曲后，点击下载按钮保存到本地</p></div>`;
            return;
        }
        container.innerHTML = state.localMusic.map(song => buildSongItem(song)).join('');
        updateBatchSelectionUI();
        syncBatchToolbar();
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${ICON.alert}<p>加载失败</p></div>`;
    }
}

// ─── 收藏 ───────────────────────────────────────────────

async function loadFavorites() {
    const container = $('favSongs');
    const revision = state.favoritesRevision;
    if (!container.querySelector('.song-item')) container.innerHTML = `<div class="loading">${ICON.loader}加载中</div>`;

    try {
        const data = await fetchJSON('/api/favorites');
        if (revision !== state.favoritesRevision) return;
        state.favorites = data.favorites || [];
        syncCachedSongFlags();
        renderFavorites();
    } catch (err) {
        if (revision === state.favoritesRevision) {
            container.innerHTML = `<div class="empty-state" role="alert">${ICON.alert}<p>收藏加载失败，已有收藏不会丢失</p><button class="btn-secondary" onclick="loadFavorites()">重新加载</button></div>`;
        }
    } finally {
        syncBatchToolbar();
    }
}

function renderFavorites() {
    const songs = filterSongs(state.favorites, 'favorites');
    syncListFilterCount('favorites', state.favorites.length, songs.length);
    replaceSongRows($('favSongs'), songs.length ? songs.map(fav => buildSongItem({ ...fav, favorited: true })).join('')
        : state.favorites.length ? `<div class="empty-state">${ICON.musicNote}<p>没有匹配的收藏，试试其他歌名或歌手</p></div>`
        : `<div class="empty-state">${ICON.musicNote}<p>还没有收藏的歌曲</p><button class="btn-secondary" onclick="focusMusicSearch()">找首歌</button></div>`);
    updateBatchSelectionUI();
    syncBatchToolbar();
}

// ─── 下载标签页 ─────────────────────────────────────────

async function loadDownloads() {
    const container = $('downloadSongs');
    const revision = state.favoritesRevision;
    if (!container.querySelector('.song-item')) container.innerHTML = `<div class="loading">${ICON.loader}加载中</div>`;

    try {
        const [musicData, favData] = await Promise.all([
            fetchJSON('/api/music'),
            fetchJSON('/api/favorites'),
        ]);
        state.localMusic = musicData.music || [];
        if (revision === state.favoritesRevision) state.favorites = favData.favorites || [];

        const favIds = new Set(state.favorites.map(f => f.id));
        for (const s of state.localMusic) {
            s.favorited = Boolean(favIds.has(s.id) || findFavoriteForSong(s));
        }

        if (state.currentTab === 'downloads') renderDownloads();
        return true;
    } catch (err) {
        container.innerHTML = `<div class="empty-state" role="alert">${ICON.alert}<p>下载列表加载失败</p><button class="btn-secondary" onclick="loadDownloads()">重新加载</button></div>`;
        return false;
    } finally {
        syncBatchToolbar();
    }
}

function renderDownloads() {
    const songs = filterSongs(state.localMusic, 'downloads');
    syncListFilterCount('downloads', state.localMusic.length, songs.length);
    replaceSongRows($('downloadSongs'), songs.length ? songs.map(song => buildSongItem(song)).join('')
        : state.localMusic.length ? `<div class="empty-state">${ICON.musicNote}<p>没有匹配的下载歌曲</p></div>`
        : `<div class="empty-state">${ICON.musicNote}<p>还没有本地歌曲</p></div>`);
    updateBatchSelectionUI();
    syncBatchToolbar();
}

// ─── 构建歌曲项 HTML ────────────────────────────────────

function replaceSongRows(container, html, fallback = null) {
    const focused = document.activeElement;
    const row = container.contains(focused) ? focused.closest('.song-item') : null;
    const index = row ? Array.from(container.querySelectorAll('.song-item')).indexOf(row) : -1;
    container.innerHTML = html;
    if (!row) return;
    const rows = Array.from(container.querySelectorAll('.song-item'));
    const next = rows.find(item => item.dataset.songId === row.dataset.songId) || rows[Math.min(index, rows.length - 1)];
    const control = focused.classList[0];
    const target = (control && next?.querySelector(`.${CSS.escape(control)}`)) || next?.querySelector('.song-info')
        || container.querySelector('button') || fallback || libraryPanel.querySelector('.tab.active');
    target?.focus({ preventScroll: true });
}

function songDescription(song) {
    return [song.artist || '未知歌手', song.album, song.version].filter(Boolean).join(' · ');
}

function buildSongItem(song, options = {}) {
    const isPlaying = state.currentSong && state.currentSong.id === song.id;
    const isSelected = state.selectedSongIds.has(song.id);
    const hideSelectBtn = !!options.hideSelectBtn;
    const playIcon = isPlaying && state.isPlaying ? ICON.pause : ICON.play;
    const favorited = isSongFavorited(song);

    const id = escapeHtml(JSON.stringify(song.id));
    const playlistId = escapeHtml(JSON.stringify(options.playlistId || ''));
    const playAction = `playSong(${id}${options.fromSearch ? ', { fromSearch: true }' : ''})`;
    const selectAction = `toggleSongSelection(${id})`;
    const playLabel = isPlaying && state.isPlaying ? '暂停' : '播放';
    const playingClass = isPlaying ? 'playing-now' : '';
    return `
        <div class="song-item ${playingClass}${isSelected ? ' selected' : ''}" data-song-id="${escapeHtml(song.id)}">
            ${hideSelectBtn ? '' : `<button class="song-select-btn${isSelected ? ' selected' : ''}" ${state.isDeletingDownloads ? 'disabled' : ''} onclick="${selectAction}" aria-label="选择 ${escapeHtml(song.title || '歌曲')}" aria-pressed="${isSelected ? 'true' : 'false'}">${ICON.check}</button>`}
            <button class="play-btn-item song-cover ${isPlaying ? 'playing' : ''}" onclick="${playAction}" title="${isPlaying && state.isPlaying ? '暂停' : '播放'}" aria-label="${isPlaying && state.isPlaying ? '暂停' : '播放'} ${escapeHtml(song.title)}">${song.cover_url || options.fromSearch ? `<img loading="lazy" src="${escapeHtml(song.cover_url || '/static/player-illustration.png')}" alt="" onerror="this.onerror=null;this.src='/static/player-illustration.png'">` : ''}${playIcon}</button>
            <button class="song-info" onclick="${hideSelectBtn ? '' : `state.isBatchMode ? ${selectAction} : `}${playAction}" aria-label="${!hideSelectBtn && state.isBatchMode ? '选择' : playLabel} ${escapeHtml(song.title)}">
                <span class="song-title" title="${escapeHtml(song.title || '未知歌曲')}">${escapeHtml(song.title || '未知歌曲')}</span>
                <span class="song-artist" title="${escapeHtml(songDescription(song))}">${escapeHtml(songDescription(song))}</span>
            </button>
            <div class="song-actions">
                <button class="fav-btn" onclick="toggleFavorite(${id})" title="${favorited ? '取消收藏' : '收藏'}" aria-label="${favorited ? '取消收藏' : '收藏'} ${escapeHtml(song.title)}" aria-pressed="${favorited}">${ICON.heart}</button>
                <button class="more-btn" popovertarget="songActionsPopover" onclick="prepareSongActions(${id}, ${playlistId}, this)" title="更多操作" aria-label="更多操作 ${escapeHtml(song.title)}">${ICON.more}</button>
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
    ];
    if (canDownloadSong(song)) actions.push({ label: '下载到本地', icon: ICON.download, run: () => downloadSong(songId) });
    if (playlistId) actions.push({ label: '从歌单移除', icon: ICON.minus, run: () => removeSongFromPlaylist(playlistId, songId, trigger) });
    if (song.downloaded && trigger.closest('#downloadSongs')) actions.push({ label: '删除本地文件', icon: ICON.trash, danger: true, run: () => deleteLocalSong(songId) });
    for (const [index, action] of actions.entries()) {
        const button = document.createElement('button');
        button.className = `pl-option${action.danger ? ' danger' : ''}`;
        button.autofocus = index === 0;
        button.innerHTML = `${action.icon}<span>${action.label}</span>`;
        button.addEventListener('click', () => { menu.hidePopover(); trigger.focus({ preventScroll: true }); action.run(); });
        menu.append(button);
    }
    const rect = trigger.getBoundingClientRect();
    const menuHeight = Math.min(innerHeight - 24, actions.length * 48 + 82);
    const opensAbove = rect.bottom + 8 + menuHeight > innerHeight - 12 && rect.top - 8 - menuHeight >= 12;
    menu.style.left = `${Math.max(12, Math.min(rect.right - 240, innerWidth - 252))}px`;
    menu.style.top = opensAbove ? 'auto' : `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - menuHeight - 12))}px`;
    menu.style.bottom = opensAbove ? `${innerHeight - rect.top + 8}px` : 'auto';
    menu.style.setProperty('--menu-origin', opensAbove ? 'bottom right' : 'top right');
    menu.style.setProperty('--menu-offset', opensAbove ? '4px' : '-4px');
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

    cancelAutomaticPlayback();
    playbackState.playToken += 1;
    playbackState.analysisToken += 1;
    playbackState.analysisController?.abort();
    playbackState.nextAnalysisController?.abort();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    state.isPlaying = false;
    state.isLoading = false;
    state.currentSong = null;
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

    const data = await fetchJSON(`/api/music/${encodeURIComponent(targetFilename)}`, {
        method: 'DELETE',
    });
    if (!data.success) {
        throw new Error(data.error || '删除失败');
    }
    return true;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function applyEffectiveVolume({ immediate = false, trackChanged = false } = {}) {
    playbackState.baseVolume = clamp(Number(playbackState.baseVolume || 0), 0, 1);
    const trackValue = Number(playbackState.trackGain);
    playbackState.trackGain = Number.isFinite(trackValue) ? clamp(trackValue, 0, LEVELING_MAX_GAIN) : LEVELING_FALLBACK_GAIN;
    if (playbackState.audioPipeline?.gain) {
        audio.volume = 1;
        const { context, gain, trackGain } = playbackState.audioPipeline;
        const now = context.currentTime;
        const param = gain.gain;
        if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
        else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
        if (immediate) param.setValueAtTime(playbackState.baseVolume, now);
        else param.linearRampToValueAtTime(playbackState.baseVolume, now + 0.025);
        if (trackChanged) {
            trackGain.gain.cancelScheduledValues(now);
            trackGain.gain.setValueAtTime(playbackState.trackGain, now);
        }
        return;
    }
    // The native media volume cannot amplify; unsupported Web Audio stays conservative.
    audio.volume = playbackState.baseVolume * Math.min(LEVELING_FALLBACK_GAIN, playbackState.trackGain);
}

async function ensureAudioPipeline() {
    if (playbackState.audioPipeline) return playbackState.audioPipeline;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;

    try {
        const context = new AudioContextCtor();
        const trackGain = context.createGain();
        const gain = context.createGain();
        trackGain.connect(gain);
        gain.connect(context.destination);
        const source = context.createMediaElementSource(audio);
        const audioPipeline = { context, source, trackGain, gain };
        audioPipeline.source.connect(audioPipeline.trackGain);
        playbackState.audioPipeline = audioPipeline;
        applyEffectiveVolume({ immediate: true, trackChanged: true });
        return audioPipeline;
    } catch {
        return null;
    }
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

async function startAudioPlayback({ song, shouldPlay, seekTime, saveState, playToken, deadline = Date.now() + 10000 }) {
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
        equalizer.classList.add('paused');
        updatePlayButtons();
        syncImmersivePlayerUI();
        return true;
    }

    let startupTimer;
    let startupExpired = false;
    try {
        await Promise.race([(async () => {
            await resumeAudioContext();
            if (startupExpired || playToken !== playbackState.playToken) throw new Error('播放请求已取消');
            return audio.play();
        })(), new Promise((_, reject) => {
            startupTimer = window.setTimeout(() => {
                startupExpired = true;
                if (playToken === playbackState.playToken) audio.pause();
                reject(new Error('音频连接超时'));
            }, Math.max(1, deadline - Date.now()));
        })]);
        if (playToken !== playbackState.playToken) return false;
        state.isPlaying = true;
        equalizer.classList.remove('paused');
        updatePlayButtons();
        syncImmersivePlayerUI();
        if (saveState) savePlaybackState();
        return true;
    } catch {
        if (playToken !== playbackState.playToken) return false;
        state.isPlaying = false;
        equalizer.classList.add('paused');
        updatePlayButtons();
        syncImmersivePlayerUI();
        return false;
    } finally { clearTimeout(startupTimer); }
}

async function fetchAudioAnalysis(audioUrl, { start = false, priority = 'current', signal = null, timeout = 5000 } = {}) {
    try {
        const response = await fetch(start ? '/api/audio-analysis' : `/api/audio-analysis?${new URLSearchParams({ audio_url: audioUrl })}`, {
            method: start ? 'POST' : 'GET',
            ...(start ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio_url: audioUrl, priority }) } : {}),
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
        });
        return await response.json();
    } catch { return null; }
}

async function analyzeTrackGain(song, audioUrl, requestToken, { priority = 'current', signal = null } = {}) {
    // Analysis only warms the server cache. Never alter the gain of an already-playing track.
    if (song?.stream_only) return false;
    const deadline = Date.now() + 300000;
    let submitted = false;
    while (Date.now() < deadline && !signal?.aborted) {
        if (priority === 'current' && requestToken !== playbackState.analysisToken) return false;
        // A whole-song download must not compete with startup or recovery from buffering.
        if (!submitted && !hasPlaybackBuffer()) { await delay(1000); continue; }
        const result = await fetchAudioAnalysis(audioUrl, { start: true, priority, signal });
        submitted = result?.status === 'pending';
        if (['ready', 'silent'].includes(result?.status)) return true;
        if (['failed', 'busy'].includes(result?.status) || result?.message === '未配置 FFmpeg/FFprobe') return false;
        await delay(2000);
    }
    return false;
}

function hasPlaybackBuffer() {
    if (state.isLoading || state.isBuffering || audio.paused) return false;
    const target = Math.min(audio.currentTime + 30, audio.duration || Infinity);
    for (let i = 0; i < audio.buffered.length; i++) {
        if (audio.buffered.start(i) <= audio.currentTime && audio.buffered.end(i) >= target - 0.25) return true;
    }
    return false;
}

async function resumeAudioContext() {
    const pipeline = await ensureAudioPipeline();
    if (pipeline?.context.state === 'suspended') await pipeline.context.resume();
}

async function startPlaybackWithLeveling({ song, audioUrl, shouldPlay = true, seekTime = 0, saveState = false, deadline }) {
    const requestToken = ++playbackState.analysisToken;
    const playToken = playbackState.playToken;
    playbackState.analysisController?.abort();
    const controller = new AbortController();
    playbackState.analysisController = controller;
    playbackState.trackGain = LEVELING_FALLBACK_GAIN;
    await ensureAudioPipeline();
    if (playToken !== playbackState.playToken || controller.signal.aborted) return false;
    applyEffectiveVolume({ immediate: true, trackChanged: true });
    // A metadata lookup has a small fixed budget; a cold analysis never delays startup.
    const measured = song.stream_only ? null : await fetchAudioAnalysis(audioUrl, { signal: controller.signal, timeout: 120 });
    if (playToken !== playbackState.playToken || controller.signal.aborted) return false;
    if (measured?.status === 'ready' && Number.isFinite(measured.gain_db)) {
        playbackState.trackGain = Math.pow(10, Math.min(6, measured.gain_db) / 20);
        applyEffectiveVolume({ immediate: true, trackChanged: true });
    }
    audio.src = audioUrl;
    const started = await startAudioPlayback({ song, shouldPlay, seekTime, saveState, playToken, deadline });
    if (started && shouldPlay && !['ready', 'silent'].includes(measured?.status)) {
        void analyzeTrackGain(song, audioUrl, requestToken, { signal: controller.signal });
    }
    return started;
}

function cancelAutomaticPlayback() {
    clearTimeout(playbackState.autoAdvance?.timer);
    playbackState.autoAdvance = null;
}

function scheduleAutomaticPlaybackRetry() {
    const recovery = playbackState.autoAdvance;
    if (!recovery || recovery.songId !== state.currentSong?.id) return;
    if (recovery.timer == null && recovery.retries >= 3) {
        recovery.failedIds.add(recovery.songId);
        if (!state.queue.some(song => !recovery.failedIds.has(song.id))) {
            cancelAutomaticPlayback();
            state.playbackError = '队列中的歌曲暂时都无法播放，请稍后重试。';
            syncImmersivePlayerUI();
            return;
        }
        if (state.queueIndex < 0 && state.playMode !== 'shuffle') {
            state.queueIndex = state.queue.findIndex(song => song.id === recovery.nextSongId) - 1;
        }
        toast('重试 3 次仍无法播放，已跳过这首歌');
        stepQueue(1, { automatic: true });
        return;
    }
    if (recovery.timer == null) {
        recovery.retries += 1;
        const playToken = playbackState.playToken;
        recovery.timer = window.setTimeout(() => {
            recovery.timer = null;
            if (playbackState.autoAdvance !== recovery || playToken !== playbackState.playToken) return;
            void playSong(recovery.songId, { keepQueue: true, force: true, rememberHistory: false, automatic: true });
        }, 5000);
    }
    state.playbackError = `播放失败，5 秒后重试（${recovery.retries}/3）。`;
    syncImmersivePlayerUI();
}

async function playSong(songId, { keepQueue = false, force = false, seekTime = 0, rememberHistory = true, fromSearch = false, automatic = false } = {}) {
    // 在当前所有歌曲列表中找这个歌曲
    let song = resolvePlayableSong(songId) || (automatic && state.currentSong?.id === songId ? state.currentSong : null);
    if (!keepQueue) syncQueueForSong(songId, { fromSearch });
    if (!song) return toast('找不到歌曲信息', true);
    const originalCacheKey = getPlayableInfoKey(song);

    // 如果点击的是同一首歌，切换播放/暂停
    if (!force && state.currentSong && state.currentSong.id === songId) {
        if (state.isLoading) return;
        togglePlayPause();
        return;
    }

    if (!automatic) cancelAutomaticPlayback();
    if (playbackState.autoAdvance?.songId !== songId) {
        playbackState.autoAdvance = {
            songId, retries: 0, timer: null,
            failedIds: playbackState.autoAdvance?.failedIds || new Set(),
            nextSongId: state.queue[(state.queueIndex + 1) % state.queue.length]?.id,
        };
    }
    if (rememberHistory && state.currentSong && state.currentSong.id !== songId
        && state.queue.some(item => item.id === state.currentSong.id)) {
        state.playHistory.push(state.currentSong.id);
        if (state.playHistory.length > 100) state.playHistory.shift();
    }
    const playToken = ++playbackState.playToken;
    playbackState.sourceLimit = '';
    playbackState.prefetchToken += 1;
    clearTimeout(playbackState.bufferingTimer);
    playbackState.analysisToken += 1;
    playbackState.analysisController?.abort();
    playbackState.nextAnalysisController?.abort();
    playbackState.detailController?.abort();
    playbackState.playController?.abort();
    let preloader = playbackState.nextAudioPreloader;
    playbackState.nextAudioPreloader = null;
    if (preloader && preloader.songKey !== getPlayableInfoKey(song)) {
        preloader.removeAttribute('src'); preloader.load(); preloader = null;
    }
    const controller = new AbortController();
    playbackState.playController = controller;
    playbackState.startupDeadline = Date.now() + 10000;
    playbackState.incompleteSource = false;
    const startupTimer = window.setTimeout(() => {
        if (playToken !== playbackState.playToken) return;
        controller.abort();
        if (preloader) { preloader.removeAttribute('src'); preloader.load(); }
        setPlaybackError('音频连接超过 10 秒，请重试或切换歌曲。');
    }, 10000);
    try {
        clearSeekFeedback();
        state.isSeeking = false;
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
        state.isBuffering = false;
        state.playbackError = '';
        state.resumeTime = seekTime;
        syncImmersivePlayerUI();

        let hydrated = await loadOnlineSongInfo(song, { playbackOnly: true, silent: automatic, signal: controller.signal, refresh: force, deadline: playbackState.startupDeadline });
        const releasePreloader = () => { if (preloader) { preloader.removeAttribute('src'); preloader.load(); } };
        if (playToken !== playbackState.playToken || controller.signal.aborted) { releasePreloader(); return; }
        if (!hydrated || !hydrated.audioUrl) {
            releasePreloader();
            setPlaybackError('这首歌暂时无法播放，请重试或切换歌曲。');
            return;
        }
        let started = false;
        let fallbackInfo = null;
        void hydrateCurrentSongDetails(mergeSongInfo(state.currentSong, hydrated.song), playToken);
        for (let attempt = 0; attempt < 2; attempt++) {
            song = hydrated.song || song;
            state.currentSong = mergeSongInfo(state.currentSong, song);
            playbackState.incompleteSource = false;
            syncImmersivePlayerUI();
            started = await startPlaybackWithLeveling({
                song, audioUrl: hydrated.audioUrl, shouldPlay: true, seekTime, saveState: true, deadline: playbackState.startupDeadline,
            });
            if (playToken !== playbackState.playToken || controller.signal.aborted) { releasePreloader(); return; }
            if (started && !playbackState.incompleteSource) break;
            started = false;
            playbackState.playableInfoCache.delete(getPlayableInfoKey(song));
            playbackState.playableInfoCache.delete(originalCacheKey);
            if (attempt || song.filename || Date.now() >= playbackState.startupDeadline) break;
            const info = await fetchOnlineSongInfo(getSongInfoReference(song), song, {
                playbackOnly: true, fallbackOnly: playbackState.incompleteSource, refresh: !playbackState.incompleteSource,
                silent: true, signal: controller.signal, deadline: playbackState.startupDeadline,
            });
            if (playToken !== playbackState.playToken || controller.signal.aborted) { releasePreloader(); return; }
            if (!info?.mp3_url) break;
            fallbackInfo = info;
            hydrated = { song: mergeSongInfo(song, info), audioUrl: getAudioUrl(info.mp3_url) };
            playbackState.detailController?.abort();
            void hydrateCurrentSongDetails(hydrated.song, playToken);
            state.playbackError = '';
            state.isLoading = true;
        }
        releasePreloader();
        state.isLoading = false;
        syncImmersivePlayerUI();
        if (!started) {
            if (playbackState.incompleteSource) hideUnavailableSong(resolvePlayableSong(songId) || state.currentSong);
            setPlaybackError(playbackState.incompleteSource ? '当前音源是片段，未找到可确认的同版本完整版。' : '音频未能开始播放，请重试或切换歌曲。');
            return;
        }
        cancelAutomaticPlayback();
        if (fallbackInfo) {
            if (playbackState.playableInfoCache.size >= 128) playbackState.playableInfoCache.delete(playbackState.playableInfoCache.keys().next().value);
            playbackState.playableInfoCache.set(originalCacheKey, {
                info: fallbackInfo, expiresAt: Date.now() + PLAYABLE_INFO_TTL_MS,
            });
        }
        void prefetchNextSong();
    } finally { clearTimeout(startupTimer); }
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

function syncQueueForSong(songId, { fromSearch = false } = {}) {
    let queue = null;

    if (fromSearch) {
        queue = state.searchResults.slice();
    } else if (state.currentTab === 'playlist-detail' && state.currentPlaylistDetailId) {
        const pl = state.playlists.find(p => p.id === state.currentPlaylistDetailId);
        if (pl?.songs?.length) {
            queue = filterSongs(pl.songs.map(normalizePlaylistSong).filter(song => song && song.id));
        }
    } else if (state.currentTab === 'favorites' && state.favorites.length) {
        queue = filterSongs(state.favorites);
    } else if (state.currentTab === 'downloads' && state.localMusic.length) {
        queue = filterSongs(state.localMusic);
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

    if (queue.length !== state.queue.length || queue.some((song, index) => song.id !== state.queue[index]?.id)) state.playHistory = [];
    state.queue = queue;
    state.queueIndex = queueIndex;
    if (state.currentTab === 'queue') renderQueue();
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
    if (/^qjjlb:\/\//i.test(getSongInfoReference(song))) return '';
    const directMp3Url = song.mp3_url
        || (song.url && /\.(?:mp3|m4a|aac|flac|wav|ogg|opus)(?:[?#].*)?$/i.test(song.url) ? song.url : '');
    return directMp3Url ? getAudioUrl(directMp3Url) : '';
}

function getPlayableInfoKey(song) {
    return String(getSongInfoReference(song) || song?.id || '').trim();
}

async function fetchOnlineSongInfo(songUrl, song = null, options = {}) {
    const { playbackOnly = false, lyricsOnly = false, signal = null, silent = false, refresh = false, fallbackOnly = false, deadline = null } = options;
    try {
        const params = new URLSearchParams({ url: songUrl });
        if (song && song.title) params.set('title', song.title);
        if (song && song.artist) params.set('artist', song.artist);
        if (song && getSongInfoReference(song)) params.set('song_ref', getSongInfoReference(song));
        if (playbackOnly) params.set('playback_only', '1');
        if (playbackOnly && deadline) params.set('budget_ms', String(Math.max(1, deadline - Date.now())));
        if (refresh) params.set('refresh', '1');
        if (lyricsOnly) params.set('lyrics_only', '1');
        if (fallbackOnly) params.set('fallback_only', '1');
        if (song?.album) params.set('album', song.album);
        if (song?.version) params.set('version', song.version);
        const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(playbackOnly ? 10000 : 45000)]) : AbortSignal.timeout(playbackOnly ? 10000 : 45000);
        const resp = await fetch(`/api/song-info?${params.toString()}`, { signal: requestSignal });
        const data = await resp.json();
        if (data.error || !resp.ok) {
            if (playbackOnly && !signal?.aborted && /请求受限|拒绝访问|要求验证|安全上限|未提供播放地址|暂无可确认|手动确认/.test(data.error || '')) {
                playbackState.sourceLimit = data.error;
                if ($('gdResumeBtn') && /拒绝访问|要求验证/.test(data.error)) $('gdResumeBtn').hidden = false;
            }
            const unavailable = playbackOnly && data.error_code === 'source_unavailable' && !signal?.aborted;
            if (unavailable) hideUnavailableSong(song);
            if (!silent) toast(unavailable ? '该版本暂无可播完整版，已从列表隐藏' : data.error || '音频服务暂时不可用，请重试', true);
            return null;
        }
        return data;
    } catch (error) {
        if (!silent && !signal?.aborted && error?.name !== 'AbortError') toast('音频连接未完成，请重试', true);
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
        quality_label: info.quality_label || song.quality_label,
        album: info.album || song.album,
        version: info.version || song.version,
        stream_only: info.mp3_url ? Boolean(info.stream_only) : song.stream_only,
        download_allowed: info.mp3_url ? info.download_allowed !== false : song.download_allowed,
        expected_duration: info.expected_duration ?? song.expected_duration,
        actual_duration: info.actual_duration ?? song.actual_duration,
        is_preview: info.is_preview ?? song.is_preview,
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
    const { playbackOnly = true, silent = false, signal = null, refresh = false, deadline = null } = options;
    if (!song) {
        return { song, audioUrl: '' };
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
    if (!refresh && cached && cached.expiresAt > Date.now()) {
        return {
            song: mergeSongInfo(song, cached.info),
            audioUrl: getAudioUrl(cached.info.mp3_url),
        };
    }

    let requestPromise = playbackState.playableInfoRequests.get(cacheKey);
    if (!requestPromise) {
        requestPromise = fetchOnlineSongInfo(songUrl, song, { playbackOnly, silent, signal, refresh, deadline });
        if (!signal) {
            requestPromise = requestPromise.finally(() => playbackState.playableInfoRequests.delete(cacheKey));
            playbackState.playableInfoRequests.set(cacheKey, requestPromise);
        }
    }
    const info = await requestPromise;
    if (signal?.aborted) return null;
    if (!info || !info.mp3_url) return null;
    if (playbackState.playableInfoCache.size >= 128) {
        playbackState.playableInfoCache.delete(playbackState.playableInfoCache.keys().next().value);
    }
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
    playbackState.nextAnalysisController?.abort();
    if (state.playMode === 'shuffle' || state.queue.length < 2 || state.queueIndex < 0) return;
    const bufferDeadline = Date.now() + 30000;
    while (!hasPlaybackBuffer()) {
        if (Date.now() >= bufferDeadline) return;
        await delay(500);
        if (prefetchToken !== playbackState.prefetchToken) return;
    }
    const nextSong = state.queue[(state.queueIndex + 1) % state.queue.length];
    if (!nextSong) return;
    if (nextSong.stream_only || /^qjjlb:\/\//i.test(getSongInfoReference(nextSong))) return;
    const immediateAudioUrl = getImmediateAudioUrl(nextSong);
    const prefetched = immediateAudioUrl
        ? { audioUrl: immediateAudioUrl }
        : await loadOnlineSongInfo(nextSong, { playbackOnly: true, silent: true });
    if (!prefetched?.audioUrl || prefetched.audioUrl === audio.currentSrc
        || prefetchToken !== playbackState.prefetchToken) return;

    if (prefetched.song) Object.assign(nextSong, prefetched.song);
    const previousPreloader = playbackState.nextAudioPreloader;
    const nextPreloader = new Audio();
    nextPreloader.addEventListener('loadedmetadata', () => {
        if (!isIncompleteAudio(nextSong, nextPreloader.duration)) return;
        playbackState.playableInfoCache.delete(getPlayableInfoKey(nextSong));
        state.searchResults = state.searchResults.filter(song => getPlayableInfoKey(song) !== getPlayableInfoKey(nextSong));
        renderSearchResults();
        nextPreloader.removeAttribute('src');
        nextPreloader.load();
    }, { once: true });
    nextPreloader.songKey = getPlayableInfoKey(nextSong);
    nextPreloader.preload = 'auto';
    nextPreloader.src = prefetched.audioUrl;
    playbackState.nextAudioPreloader = nextPreloader;
    nextPreloader.load();
    const controller = new AbortController();
    playbackState.nextAnalysisController = controller;
    void analyzeTrackGain(nextSong, prefetched.audioUrl, playbackState.analysisToken, { priority: 'next', signal: controller.signal });
    if (previousPreloader) {
        previousPreloader.removeAttribute('src');
        previousPreloader.load();
    }
}


function togglePlayPause() {
    if (playbackState.autoAdvance?.timer != null) {
        cancelAutomaticPlayback();
        state.playbackError = '已取消自动重试，可手动重试播放。';
        syncImmersivePlayerUI();
        savePlaybackState();
        return;
    }
    if (state.isLoading) return;
    if (state.playbackError) { retryCurrentPlayback(); return; }
    if (!state.currentSong && !audio.src) {
        focusMusicSearch();
        return;
    }

    if (audio.paused) {
        const playToken = playbackState.playToken;
        state.isLoading = true;
        syncImmersivePlayerUI();
        void startAudioPlayback({ song: state.currentSong || {}, shouldPlay: true, seekTime: 0, saveState: true, playToken }).then(started => {
            if (playToken !== playbackState.playToken) return;
            state.isLoading = false;
            if (!started) setPlaybackError('播放失败，请重试或切换歌曲。');
            else syncImmersivePlayerUI();
        });
    } else {
        audio.pause();
        state.isPlaying = false;
        equalizer.classList.add('paused');
        updatePlayButtons();
        syncImmersivePlayerUI();
        savePlaybackState();
    }
}

function setPlaybackError(message) {
    clearTimeout(playbackState.bufferingTimer);
    audio.pause();
    state.playbackError = playbackState.sourceLimit || message;
    state.isPlaying = false;
    state.isLoading = false;
    state.isBuffering = false;
    equalizer.classList.add('paused');
    updatePlayButtons();
    syncImmersivePlayerUI();
    if (playbackState.sourceLimit) cancelAutomaticPlayback();
    else scheduleAutomaticPlaybackRetry();
}

function retryCurrentPlayback() {
    if (!state.currentSong || state.isLoading) return;
    playbackState.playableInfoCache.delete(getPlayableInfoKey(state.currentSong));
    playbackState.playableInfoCache.delete(getPlayableInfoKey(resolvePlayableSong(state.currentSong.id)));
    void playSong(state.currentSong.id, { keepQueue: true, force: true, seekTime: audio.currentTime || state.resumeTime || 0, rememberHistory: false });
}
$('retryPlaybackBtn').addEventListener('click', retryCurrentPlayback);

for (const eventName of ['waiting', 'stalled']) audio.addEventListener(eventName, () => {
    if (!state.currentSong || audio.paused || state.playbackError) return;
    state.isBuffering = true;
    clearTimeout(playbackState.bufferingTimer);
    playbackState.bufferingTimer = window.setTimeout(() => {
        if (state.isBuffering && !audio.paused) setPlaybackError('音频缓冲时间较长，请重试或切换歌曲。');
    }, 20000);
    syncImmersivePlayerUI();
});
audio.addEventListener('playing', () => {
    clearTimeout(playbackState.bufferingTimer);
    state.isPlaying = true;
    state.isBuffering = false;
    state.playbackError = '';
    updatePlayButtons();
    syncImmersivePlayerUI();
});
audio.addEventListener('pause', () => {
    clearTimeout(playbackState.bufferingTimer);
    if (state.isLoading) return;
    state.isPlaying = false;
    state.isBuffering = false;
    updatePlayButtons();
    syncImmersivePlayerUI();
});
audio.addEventListener('error', () => {
    if (audio.error && state.currentSong) {
        playbackState.playableInfoCache.delete(getPlayableInfoKey(state.currentSong));
        playbackState.playableInfoCache.delete(getPlayableInfoKey(resolvePlayableSong(state.currentSong.id)));
        if (!state.isLoading) setPlaybackError('音频连接中断或暂时不可用，请重试。');
    }
});

playBtn.addEventListener('click', togglePlayPause);

// 禁止右键菜单（屏蔽"从该页面下载音频"）
audio.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('contextmenu', e => {
    // 如果右键点击在播放器区域附近，也阻止
    if (e.target.closest('#player') || e.target.closest('.song-actions')) {
        e.preventDefault();
    }
});

audio.addEventListener('ended', () => {
    state.isPlaying = false;
    equalizer.classList.add('paused');
    progressBar.value = 0;
    updateRangeFill(progressBar);
    updatePlayButtons();
    syncImmersivePlayerUI();
    // 根据播放模式处理
    if (state.playMode === 'repeat') {
        // Start a new playback so a completed cold analysis takes effect on the next loop.
        void playSong(state.currentSong.id, { keepQueue: true, force: true, seekTime: 0, rememberHistory: false, automatic: true });
    } else stepQueue(1, { automatic: true });
});

// 上一首/下一首
function stepQueue(direction, { automatic = false } = {}) {
    const count = state.queue.length;
    if (!count) return;
    if (state.playMode === 'shuffle') {
        if (direction < 0) {
            const previousId = state.playHistory.pop();
            const index = state.queue.findIndex(song => song.id === previousId);
            if (index < 0) return toast('还没有上一首播放记录');
            state.queueIndex = index;
        } else {
            const candidates = state.queue.map((song, index) => index).filter(index => state.queue[index].id !== state.currentSong?.id
                && !(automatic && playbackState.autoAdvance?.failedIds.has(state.queue[index].id)));
            state.queueIndex = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : 0;
        }
    } else {
        state.queueIndex = (state.queueIndex + direction + count) % count;
        while (automatic && playbackState.autoAdvance?.failedIds.has(state.queue[state.queueIndex].id)) {
            state.queueIndex = (state.queueIndex + direction + count) % count;
        }
    }
    const song = state.queue[state.queueIndex];
    void playSong(song.id, { keepQueue: true, force: song.id === state.currentSong?.id, rememberHistory: direction > 0, automatic });
}
prevBtn.addEventListener('click', () => stepQueue(-1));
nextBtn.addEventListener('click', () => stepQueue(1));

// 播放模式切换
playModeBtn.addEventListener('click', () => {
    const modes = ['sequence', 'shuffle', 'repeat'];
    const labels = { sequence: '列表循环', shuffle: '随机播放', repeat: '单曲循环' };
    const icons = { sequence: ICON.repeat, shuffle: ICON.shuffle, repeat: ICON.repeatOne };
    const currentIdx = modes.indexOf(state.playMode);
    state.playMode = modes[(currentIdx + 1) % modes.length];
    playModeBtn.innerHTML = icons[state.playMode];
    fadeContent(playModeBtn.firstElementChild);
    playModeBtn.title = labels[state.playMode];
    playModeBtn.setAttribute('aria-label', playModeBtn.title);
    playModeBtn.classList.toggle('is-selected', state.playMode !== 'sequence');
    if (state.currentTab === 'queue') $('queueSummary').textContent = `${state.queue.length} 首 · ${playModeBtn.title}`;
    savePlaybackState();
});

function updateRangeFill(el) {
    const val = parseFloat(el.value);
    const min = parseFloat(el.min) || 0;
    const max = parseFloat(el.max) || 100;
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    // Native range thumbs travel within the track, inset by half their width.
    const stop = `calc(${pct}% + var(--thumb-size) * ${0.5 - pct / 100})`;
    el.style.setProperty('--range-fill', `linear-gradient(to right, var(--accent-strong) 0 ${stop}, var(--range-track) ${stop} 100%)`);
}

function isIncompleteAudio(song, actualDuration) {
    if (song?.is_preview) return true;
    const expected = Number(song?.expected_duration);
    return Number.isFinite(actualDuration) && Number.isFinite(expected) && actualDuration > 0 && expected > 60
        && actualDuration < expected * 0.8 && expected - actualDuration > 30;
}

audio.addEventListener('loadedmetadata', () => {
    if (!state.currentSong || !Number.isFinite(audio.duration)) return;
    progressBar.disabled = audio.duration <= 0;
    totalTime.textContent = formatTime(audio.duration);
    state.currentSong.actual_duration = audio.duration;
    if (isIncompleteAudio(state.currentSong, audio.duration)) {
        const key = getPlayableInfoKey(state.currentSong);
        playbackState.playableInfoCache.delete(key);
        playbackState.playableInfoCache.delete(getPlayableInfoKey(resolvePlayableSong(state.currentSong.id)));
        state.searchResults = state.searchResults.filter(song => getPlayableInfoKey(song) !== key);
        playbackState.incompleteSource = true;
        audio.pause();
        if (!state.isLoading) setPlaybackError('此音源明显短于整曲，请重试以恢复同版本音源。');
        renderSearchResults();
    }
});

function syncPlaybackProgress() {
    if (!Number.isFinite(audio.duration) || !audio.duration || state.isSeeking) return;
    progressBar.value = (audio.currentTime / audio.duration) * 100;
    const time = formatTime(audio.currentTime);
    if (currentTime.textContent !== time) currentTime.textContent = time;
    const duration = formatTime(audio.duration);
    if (totalTime.textContent !== duration) totalTime.textContent = duration;
    updateRangeFill(progressBar);
    syncLyricHighlight();
}
audio.addEventListener('timeupdate', syncPlaybackProgress);

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
    syncLyricHighlight(true);
}

function clearSeekFeedback() {
    clearTimeout(playbackState.bufferingTimer);
    clearTimeout(playbackState.seekFeedbackTimer);
    playbackState.seekFeedbackTimer = null;
    progressBar.removeAttribute('aria-busy');
    state.isBuffering = false;
    syncImmersivePlayerUI();
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
    savePlaybackState();
});

progressBar.addEventListener('pointercancel', () => {
    state.isSeeking = false;
    syncPlaybackProgress();
});

audio.addEventListener('seeked', clearSeekFeedback);
audio.addEventListener('canplay', clearSeekFeedback);

volumeBar.addEventListener('input', () => {
    setVolume(Number(volumeBar.value));
});

function setVolume(value) {
    const next = Math.max(0, Math.min(100, Math.round(value)));
    volumeBar.value = String(next);
    playbackState.baseVolume = next / 100;
    try { localStorage.setItem('music_volume', String(next)); } catch { /* Playback works without storage. */ }
    applyEffectiveVolume();
    updateRangeFill(volumeBar);
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
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.target.closest('.modal-box, .add-to-pl-panel, [popover]')) return;
    if (e.key === '/' && !e.isComposing && !e.target.closest('input, textarea, select, [contenteditable], .modal-box, .add-to-pl-panel, [popover]')) {
        e.preventDefault();
        focusMusicSearch();
        return;
    }
    if (e.target.closest('#lyricsList') && e.key !== ' ' && e.key.toLowerCase() !== 'l') return;
    if (isShortcutInputTarget(e.target) && !(e.key.toLowerCase() === 'l' && e.target.tagName === 'BUTTON')) return;

    const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
    if (!['space', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'l'].includes(key)) return;

    e.preventDefault();
    if (key === 'l') {
        if (!e.repeat) toggleLyricsEffect();
    } else if (key === 'space') {
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
    $('locatePlayingBtn').disabled = !state.queue.some(song => song.id === state.currentSong?.id);
    $('locatePlayingBtn').hidden = $('locatePlayingBtn').disabled;
    document.querySelectorAll('.play-btn-item').forEach(btn => {
        const item = btn.closest('.song-item');
        const current = item.dataset.songId === state.currentSong?.id;
        const playing = current && state.isPlaying;
        item.classList.toggle('playing-now', current);
        btn.classList.toggle('playing', current);
        btn.querySelector('use')?.setAttribute('href', `${ICON_SPRITE}#${playing ? 'pause' : 'play'}`);
        btn.title = playing ? '暂停' : '播放';
        const title = item.querySelector('.song-title')?.textContent || '歌曲';
        const label = `${btn.title} ${title}`;
        btn.setAttribute('aria-label', label);
        if (!state.isBatchMode || !item.querySelector('.song-select-btn')) {
            item.querySelector('.song-info').setAttribute('aria-label', label);
        }
    });
}

// ─── 下载 ───────────────────────────────────────────────

function canDownloadSong(song) {
    return song && !song.downloaded && song.download_allowed !== false && Boolean(song.mp3_url || song.url);
}

async function downloadSong(songId, options = {}) {
    const quiet = options.quiet === true;
    const song = findSongInState(songId);
    if (!song) {
        if (!quiet) toast('找不到歌曲', true);
        return 'missing';
    }
    if (song.download_allowed === false) {
        if (!quiet) toast('此来源仅供在线播放，不能下载到本地', true);
        return 'skipped';
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
    if (downloadsInProgress.has(songId)) return 'skipped';
    downloadsInProgress.add(songId);
    syncDownloadCurrentButton();

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
            if (!quiet) toast('下载完成', false, 'check');
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
    } finally {
        downloadsInProgress.delete(songId);
        syncDownloadCurrentButton();
    }
}
const favoriteWrites = new Set();

async function toggleFavorite(songId) {
    const song = findSongInState(songId) || (state.currentSong?.id === songId ? state.currentSong : null);
    if (!song) return toast('找不到歌曲', true);
    const favorite = findFavoriteForSong(song);
    const key = getSongIdentityKey(song) || song.id;
    if (favoriteWrites.has(key)) return;
    favoriteWrites.add(key);
    try {
        if (favorite) {
            const removed = await fetchJSON('/api/favorites', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: favorite.id }),
            });
            state.favoritesRevision++;
            state.favorites = state.favorites.filter(item => item.id !== favorite.id);
            refreshFavoriteViews();
            if (removed.favorite) {
                offerUndo('已取消收藏', async () => {
                    if (favoriteWrites.has(key)) throw new Error('收藏正在更新，请稍后重试');
                    favoriteWrites.add(key);
                    try {
                        await saveFavorite({ ...removed.favorite, restore_position: removed.position });
                        refreshFavoriteViews();
                    } finally {
                        favoriteWrites.delete(key);
                    }
                });
            }
        } else {
            const actualDuration = state.currentSong?.id === songId ? state.currentSong.actual_duration ?? song.actual_duration : song.actual_duration;
            await saveFavorite({ ...song, actual_duration: actualDuration, song_ref: getSongInfoReference(song), source_url: song.source_url || song.url || '' });
            refreshFavoriteViews();
            toast('已收藏', false, 'check');
        }
    } catch (error) {
        toast(error.message || '收藏操作失败，请重试', true);
    } finally {
        favoriteWrites.delete(key);
    }
}

async function saveFavorite(song) {
    const data = await fetchJSON('/api/favorites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(song),
    });
    state.favoritesRevision++;
    if (!state.favorites.some(item => item.id === data.favorite.id)) {
        state.favorites.splice(data.position ?? state.favorites.length, 0, data.favorite);
    }
}

function refreshFavoriteViews() {
    syncCachedSongFlags();
    if (state.currentTab === 'favorites') renderFavorites();
    else if (state.currentTab === 'downloads') renderDownloads();
    else if (state.currentTab === 'playlist-detail') renderPlaylistSongs(state.playlists.find(pl => pl.id === state.currentPlaylistDetailId));
    else if (state.currentTab === 'queue') renderQueue();
    renderSearchResults();
}

// ─── 歌单管理 ───────────────────────────────────────────

async function loadPlaylists() {
    const revision = state.playlistsRevision;
    try {
        const data = await fetchJSON('/api/playlists');
        if (revision !== state.playlistsRevision) return;
        if (!Array.isArray(data.playlists)) throw new Error('歌单数据暂时不可用');
        state.playlists = data.playlists || [];
        state.playlistsError = '';
        if (state.currentTab === 'playlists') renderPlaylistsTab();
        else if (state.currentTab === 'playlist-detail') renderPlaylistSongs(state.playlists.find(pl => pl.id === state.currentPlaylistDetailId));
    } catch {
        if (revision !== state.playlistsRevision) return;
        state.playlistsError = '歌单加载失败，已有歌单不会丢失';
        if (state.currentTab === 'playlists') renderPlaylistsTab();
    }
}

let newPlaylistSongs = [];

function showPlaylistForm(songs = []) {
    newPlaylistSongs = songs;
    const overlay = $('playlistModal');
    overlay.style.display = 'flex';
    $('playlistModalTitle').textContent = songs.length ? '新建歌单并添加歌曲' : '新建歌单';
    $('confirmPlaylistBtn').textContent = songs.length ? '创建并添加' : '创建';
    $('playlistNameInput').value = '';
    $('playlistNameInput').removeAttribute('aria-invalid');
    $('playlistFormError').hidden = true;
    focusDialog(overlay);
}

$('addPlaylistBtn').addEventListener('click', () => showPlaylistForm());

$('playlistNameInput').addEventListener('input', event => {
    if (!event.target.value.trim()) return;
    event.target.removeAttribute('aria-invalid');
    $('playlistFormError').hidden = true;
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

$('playlistForm').addEventListener('submit', async event => {
    event.preventDefault();
    const overlay = $('playlistModal');
    if (overlay.dataset.submitting === 'true') return;
    const input = $('playlistNameInput');
    const errorMessage = $('playlistFormError');
    const name = input.value.trim();
    if (!name) {
        input.setAttribute('aria-invalid', 'true');
        errorMessage.textContent = '请输入歌单名称';
        errorMessage.hidden = false;
        input.focus();
        return;
    }

    const songs = newPlaylistSongs;
    overlay.dataset.submitting = 'true';
    $('confirmPlaylistBtn').disabled = $('cancelPlaylistBtn').disabled = true;
    $('confirmPlaylistBtn').textContent = '创建中…';
    input.removeAttribute('aria-invalid');
    errorMessage.hidden = true;
    try {
        const data = await fetchJSON('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, songs }),
        });
        updatePlaylistFromResponse(data.playlist);
        newPlaylistSongs = [];
        delete overlay.dataset.submitting;
        dismissDialog(overlay);
        toast(songs.length ? `已创建歌单并添加 ${songs.length} 首歌曲` : '歌单已创建', false, 'check');
    } catch (error) {
        errorMessage.textContent = error.message || '创建失败，请重试';
        errorMessage.hidden = false;
    } finally {
        delete overlay.dataset.submitting;
        $('confirmPlaylistBtn').disabled = $('cancelPlaylistBtn').disabled = false;
        $('confirmPlaylistBtn').textContent = songs.length ? '创建并添加' : '创建';
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
        const data = await fetchJSON(`/api/playlists/${plId}`, { method: 'DELETE' });
        if (!data.success) throw new Error('歌单未删除，请重试');
        toast('歌单已删除');
        state.playlistsRevision++;
        state.playlists = state.playlists.filter(item => item.id !== plId);
        if (state.currentTab === 'playlist-detail' && state.currentPlaylistDetailId === plId) {
            document.querySelector('.tab[data-tab="playlists"]').click();
            $('addPlaylistBtn').focus({ preventScroll: true });
        } else if (state.currentTab === 'playlists') {
            renderPlaylistsTab();
        }
    } catch (error) {
        toast(error.message || '删除失败，请重试', true);
    }
}

async function removeSongFromPlaylist(plId, songId, trigger) {
    if (trigger.getAttribute('aria-busy') === 'true') return;
    trigger.setAttribute('aria-busy', 'true');
    try {
        const data = await changePlaylistSongs(plId, { remove_song: songId });
        updatePlaylistFromResponse(data.playlist);
        if (data.removed) {
            offerUndo('已从歌单移除', async () => {
                const restored = await changePlaylistSongs(plId, { add_song: data.removed.song, song_position: data.removed.position });
                updatePlaylistFromResponse(restored.playlist);
            });
        }
    } catch (error) {
        toast(error.message || '移除失败，请重试', true);
    } finally {
        trigger.removeAttribute('aria-busy');
    }
}

// ─── 添加到歌单浮层 ─────────────────────────────────────

function showAddToPlaylist(songIdOrIds) {
    const ids = Array.isArray(songIdOrIds) ? songIdOrIds : [songIdOrIds];
    const songs = [...new Set(ids)].map(findSongInState).filter(Boolean);
    if (!songs.length) return;
    if (!state.playlists.length && !state.playlistsError) {
        showPlaylistForm(songs);
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'add-to-pl-overlay';
    overlay.id = 'addToPlOverlay';

    const optionsHtml = state.playlists.map(pl => {
        const existing = new Set(pl.songs.map(song => typeof song === 'string' ? song : song.id));
        const missing = songs.filter(song => !existing.has(song.id)).length;
        return `
        <button type="button" class="pl-option" data-playlist-id="${escapeHtml(pl.id)}" ${missing ? '' : 'disabled'}>
            <span class="pl-option-name">${escapeHtml(pl.name)}</span>
            <span class="pl-option-count">${missing ? `${pl.songs.length} 首` : '已添加'}</span>
        </button>
    `;
    }).join('');

    overlay.innerHTML = `
        <div class="add-to-pl-panel" role="dialog" aria-modal="true" aria-label="添加歌曲到歌单">
            <h3 class="notice-with-icon">${ICON.plus}添加到歌单</h3>
            <div class="song-select-list">${optionsHtml}</div>
            <p class="form-error" role="alert" ${state.playlistsError ? '' : 'hidden'}>${escapeHtml(state.playlistsError)}</p>
            ${state.playlistsError ? '<button class="text-btn picker-retry" type="button">重新加载歌单</button>' : ''}
            <div class="modal-actions">
                <button class="btn-secondary" onclick="dismissDialog(this.closest('.add-to-pl-overlay'))">取消</button>
                <button class="btn-primary picker-create" type="button">${ICON.plus} 新建歌单</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    focusDialog(overlay);
    overlay.addEventListener('click', async e => {
        if (e.target === overlay) dismissDialog(overlay);
        const button = e.target.closest('button');
        if (!button || overlay.dataset.submitting === 'true') return;
        if (button.dataset.playlistId) addSongsToPlaylist(button.dataset.playlistId, songs, overlay, button);
        else if (button.classList.contains('picker-create')) {
            dismissDialog(overlay);
            showPlaylistForm(songs);
        } else if (button.classList.contains('picker-retry')) {
            button.disabled = true;
            await loadPlaylists();
            if (!overlay.isConnected || overlay.inert) return;
            if (state.playlistsError) {
                button.disabled = false;
                toast('歌单加载失败，请重试', true);
                button.focus({ preventScroll: true });
            } else {
                dismissDialog(overlay);
                showAddToPlaylist(ids);
            }
        }
    });
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
                    album: song.album || '',
                    version: song.version || '',
                    cover_url: song.cover_url || '',
                    pic_id: song.pic_id || '',
                    song_ref: getSongInfoReference(song),
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
            if (!canDownloadSong(song) || seen.has(song.id)) return false;
            seen.add(song.id);
            return true;
        });

    if (!songs.length) return;

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
    if (state.currentTab !== 'downloads' || state.isDeletingDownloads) return;
    const seen = new Set();
    const songs = state.localMusic
        .filter(song => {
            if (!state.selectedSongIds.has(song.id) || !song.filename || seen.has(song.filename)) return false;
            seen.add(song.filename);
            return true;
        })
        .map(song => ({ ...song }));

    if (!songs.length) return toast('选中的歌曲都不在本地', true);
    state.isDeletingDownloads = true;
    let deleted = 0;
    const failures = [];
    let confirmed = false;
    try {
        confirmed = await showDeleteConfirm({
            title: '批量删除本地歌曲',
            message: `确定删除选中的 ${songs.length} 个本地音乐文件吗？\n此操作无法撤销，收藏和歌单中的对应记录也会同步清理。`,
            confirmText: `删除 ${songs.length} 首`,
        });
        if (!confirmed) return;
        syncBatchToolbar();
        $('downloadDeleteResult').hidden = true;

        for (const song of songs) {
            try {
                const ok = await deleteLocalSongSilently(song.id, song.filename);
                if (!ok) throw new Error('没有可删除的本地文件');
                deleted++;
                state.localMusic = state.localMusic.filter(item => item.filename !== song.filename);
                syncSongRemovedFromCaches(song.id, song.filename);
            } catch (err) {
                failures.push({ filename: song.filename, title: song.title || song.filename, reason: err.message || '删除请求失败' });
            }
        }

        const [, downloadsRefreshed] = await Promise.all([loadFavorites(), loadDownloads(), loadPlaylists()]);
        const message = `已删除 ${deleted} 首${failures.length ? `，${failures.length} 首失败` : ''}`;
        const result = $('downloadDeleteResult');
        result.textContent = [message, ...failures.map(item => `${item.title}：${item.reason}`),
            ...(downloadsRefreshed === false ? ['列表刷新失败，请切换回下载页重新加载；已成功删除的文件不会再次删除。'] : [])].join('\n');
        result.hidden = false;
        if (state.currentTab !== 'downloads') {
            toast(message, failures.length > 0);
            await refreshCurrentTab();
        }
    } catch (err) {
        toast(err.message || '批量删除失败', true);
    } finally {
        state.isDeletingDownloads = false;
        if (confirmed && state.currentTab === 'downloads') {
            const failedFiles = new Set(failures.map(item => item.filename));
            state.selectedSongIds = new Set(state.localMusic.filter(song => failedFiles.has(song.filename)).map(song => song.id));
            state.isBatchMode = state.selectedSongIds.size > 0;
            renderDownloads();
        }
        updateBatchSelectionUI();
        syncBatchToolbar();
    }
}

// ─── 我的歌单标签页 ─────────────────────────────────────

function renderPlaylistsTab() {
    const container = $('playlistsGrid');
    if (state.playlistsError) {
        container.innerHTML = `<div class="empty-state" role="alert">${ICON.alert}<p>${escapeHtml(state.playlistsError)}</p><button class="btn-secondary" onclick="loadPlaylists()">重新加载</button></div>`;
        return;
    }
    if (!state.playlists.length) {
        container.innerHTML = `<div class="empty-state">${ICON.record}<p>还没有创建歌单</p><p class="hint">点击上方「新建歌单」，收好同一种心情</p></div>`;
        return;
    }
    container.innerHTML = state.playlists.map(pl => {
        const count = pl.songs.length;
        return `
            <div class="playlist-card">
                <button type="button" class="pl-card-top" data-playlist-id="${escapeHtml(pl.id)}" onclick="showPlaylistDetail(this.dataset.playlistId)">
                    <div class="pl-card-icon">${ICON.record}</div>
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
    const trigger = document.activeElement;
    // 确保收藏数据已加载
    if (!state.favorites.length) {
        try {
            const data = await fetchJSON('/api/favorites');
            state.favorites = data.favorites || [];
        } catch {
            return toast('获取收藏列表失败', true);
        }
    }
    if (!isCurrentPlaylist(plId) || !trigger.isConnected) return;

    if (!state.favorites.length) {
        return toast('还没有收藏的歌曲，先去收藏一些吧', true);
    }

    const pl = state.playlists.find(p => p.id === plId);
    if (!pl) return;

    // 过滤掉已在歌单中的歌曲
    const available = getAvailableFavorites(pl);
    if (!available.length) {
        return toast('收藏的歌曲都已在该歌单中了');
    }

    // 创建选择浮层
    const overlay = document.createElement('div');
    overlay.className = 'add-to-pl-overlay';
    overlay.id = 'addSongsOverlay';

    let itemsHtml = available.map(f => `
        <label class="song-select-item">
            <input type="checkbox" value="${escapeHtml(f.id)}">
            <span>${escapeHtml(f.title)} - ${escapeHtml(f.artist)}</span>
        </label>
    `).join('');

    overlay.innerHTML = `
        <div class="add-to-pl-panel" role="dialog" aria-modal="true" aria-label="添加歌曲到歌单" style="max-height:80vh;overflow-y:auto;">
            <h3>从收藏添加歌曲到「${escapeHtml(pl.name)}」</h3>
            <div class="song-select-list">${itemsHtml}</div>
            <p class="form-error" role="alert" hidden></p>
            <div class="modal-actions">
                <button class="btn-secondary" onclick="dismissDialog(this.closest('.add-to-pl-overlay'))">取消</button>
                <button class="btn-primary confirm-add-songs" type="button" disabled>添加选中</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    focusDialog(overlay);
    const confirm = overlay.querySelector('.confirm-add-songs');
    overlay.addEventListener('change', () => { confirm.disabled = !overlay.querySelector('input:checked'); });
    confirm.addEventListener('click', () => {
        const chosen = new Set([...overlay.querySelectorAll('input:checked')].map(input => input.value));
        addSongsToPlaylist(plId, available.filter(song => chosen.has(song.id)), overlay, confirm);
    });
    overlay.addEventListener('click', e => {
        if (e.target === overlay) dismissDialog(overlay);
    });
}

// ─── 刷新当前标签页 ─────────────────────────────────────

async function refreshCurrentTab() {
    const tab = state.currentTab;
    const scroller = libraryPanel.querySelector('.main-layout');
    const position = scroller.scrollTop;
    if (tab === 'favorites') await loadFavorites();
    else if (tab === 'playlists') renderPlaylistsTab();
    else if (tab === 'downloads') await loadDownloads();
    else if (tab === 'playlist-detail' && state.currentPlaylistDetailId) await showPlaylistDetail(state.currentPlaylistDetailId);
    else if (tab === 'queue') renderQueue();
    renderSearchResults();
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
                album: s.album, version: s.version,
                url: s.url, source_url: s.source_url, song_ref: s.song_ref,
                type: s.type, songid: s.songid,
                cover_url: s.cover_url, pic_id: s.pic_id, lyric_id: s.lyric_id,
                stream_only: s.stream_only, download_allowed: s.download_allowed,
                filename: s.filename, downloaded: s.downloaded,
            },
            currentTime: audio.currentTime || (state.playbackError ? state.resumeTime : 0) || 0,
            wasPlaying: state.isPlaying,
            queue: state.queue.map(q => ({
                id: q.id, title: q.title, artist: q.artist,
                album: q.album, version: q.version,
                url: q.url, source_url: q.source_url, song_ref: q.song_ref,
                type: q.type, songid: q.songid,
                cover_url: q.cover_url, pic_id: q.pic_id, lyric_id: q.lyric_id,
                stream_only: q.stream_only, download_allowed: q.download_allowed,
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
    let data;
    try { data = JSON.parse(localStorage.getItem('music_playback')); } catch { return; }
    if (!data?.currentSong || state.currentSong) return;

    // 恢复播放模式
    if (data.playMode && data.playMode !== state.playMode) {
        state.playMode = data.playMode;
        const icons = { sequence: ICON.repeat, shuffle: ICON.shuffle, repeat: ICON.repeatOne };
        const labels = { sequence: '列表循环', shuffle: '随机播放', repeat: '单曲循环' };
        playModeBtn.innerHTML = icons[data.playMode] || ICON.repeat;
        playModeBtn.title = labels[data.playMode] || '列表循环';
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
    playbackState.playController?.abort();
    const controller = new AbortController();
    playbackState.playController = controller;
    state.currentSong = hasRealLyrics(song) ? song : { ...song, lyrics_status: 'loading' };
    state.resumeTime = data.currentTime || 0;
    state.isLoading = true;
    playerTitle.textContent = song.title || '未知歌曲';
    playerArtist.textContent = song.artist || '未知歌手';
    equalizer.classList.add('paused');
    updatePlayButtons();
    syncImmersivePlayerUI();

    const hydrated = await loadOnlineSongInfo(song, { playbackOnly: true, silent: true, signal: controller.signal });
    if (playToken !== playbackState.playToken) return;
    if (!hydrated?.audioUrl) {
        setPlaybackError('上次的歌曲暂时无法连接，进度已保留，可重试播放。');
        return;
    }
    song = hydrated.song || song;
    state.currentSong = mergeSongInfo(state.currentSong, song);
    const audioUrl = hydrated.audioUrl;
    const seekTime = data.currentTime || 0;
    const shouldPlay = false;
    void hydrateCurrentSongDetails(state.currentSong, playToken);
    const started = await startPlaybackWithLeveling({
        song,
        audioUrl,
        shouldPlay,
        seekTime,
        saveState: false,
    });
    if (playToken !== playbackState.playToken) return;
    state.isLoading = false;
    syncImmersivePlayerUI();
    if (started) void prefetchNextSong();
    else setPlaybackError('上次的歌曲暂时无法连接，进度已保留，可重试播放。');
}

// ─── 初始化 ─────────────────────────────────────────────

async function showPlaylistDetail(plId) {
    const pl = state.playlists.find(p => p.id === plId);
    if (!pl) return;
    if (isCurrentPlaylist(plId)) {
        renderPlaylistSongs(pl);
        return;
    }

    const scroller = libraryPanel.querySelector('.main-layout');
    if (state.currentTab === 'playlists') state.libraryScroll.playlists = scroller.scrollTop;
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    $('tab-playlist-detail').classList.add('active');
    state.currentTab = 'playlist-detail';
    state.currentPlaylistDetailId = plId;
    syncLibraryNavigation();

    const header = document.querySelector('.playlist-detail-header');
    header.innerHTML = `
        <div class="playlist-detail-main">
            <button class="back-btn" type="button">${ICON.back}返回</button>
            <div class="playlist-detail-info">
                <h2 title="${escapeHtml(pl.name)}">${escapeHtml(pl.name)}</h2>
                <span id="playlistDetailCount" class="song-count"></span>
            </div>
        </div>
        <div class="playlist-detail-actions">
            <button class="play-all-btn" type="button">${ICON.play} 播放全部</button>
            <button class="add-song-btn" type="button">${ICON.plus} 从收藏添加</button>
            <button class="del-pl-btn" type="button">${ICON.trash} 删除歌单</button>
        </div>
    `;
    const backButton = header.querySelector('.back-btn');
    backButton.addEventListener('click', () => {
        document.querySelector('.tab[data-tab="playlists"]').click();
        $('playlistsGrid').querySelector(`[data-playlist-id="${CSS.escape(plId)}"]`)?.focus({ preventScroll: true });
    });
    header.querySelector('.play-all-btn').addEventListener('click', () => playPlaylist(plId));
    header.querySelector('.add-song-btn').addEventListener('click', () => showAddSongToPlaylist(plId));
    header.querySelector('.del-pl-btn').addEventListener('click', () => deletePlaylist(plId));

    renderPlaylistSongs(pl);
    scroller.scrollTop = 0;
    backButton.focus({ preventScroll: true });
}

function renderPlaylistSongs(pl) {
    if (!pl) return;
    const container = $('playlistDetailSongs');
    const header = document.querySelector('.playlist-detail-header');
    const addButton = header.querySelector('.add-song-btn');
    const hasCandidates = getAvailableFavorites(pl).length > 0;
    const focused = document.activeElement;
    addButton.hidden = !hasCandidates;
    header.querySelector('.play-all-btn').hidden = !pl.songs.length;
    const total = pl.songs.length;
    const detailSongs = filterSongs(pl.songs.map(normalizePlaylistSong).filter(song => song && song.id), `playlist:${pl.id}`);
    syncListFilterCount('playlist-detail', total, detailSongs.length);
    $('playlistDetailCount').textContent = `${total} 首`;
    if (focused === addButton && !hasCandidates) header.querySelector('.back-btn').focus({ preventScroll: true });
    if (!pl.songs.length) {
        replaceSongRows(container, `<div class="empty-state">${ICON.musicNote}<p>歌单还没有歌曲</p>${hasCandidates ? '' : '<p class="hint">搜索歌曲后，可以从更多操作加入歌单</p><button class="btn-secondary" onclick="focusMusicSearch()">找首歌</button>'}</div>`);
        return;
    }

    replaceSongRows(container, detailSongs.length ? detailSongs.map(song => buildSongItem(song, { playlistId: pl.id, hideSelectBtn: true })).join('')
        : `<div class="empty-state">${ICON.musicNote}<p>没有匹配的歌单歌曲</p></div>`);
}

function getAvailableFavorites(playlist) {
    const ids = new Set(playlist.songs.map(song => typeof song === 'string' ? song : song.id));
    return state.favorites.filter(song => !ids.has(song.id));
}

function isCurrentPlaylist(plId) {
    return state.currentTab === 'playlist-detail' && state.currentPlaylistDetailId === plId;
}

function updatePlaylistFromResponse(playlist) {
    state.playlistsRevision++;
    const index = state.playlists.findIndex(item => item.id === playlist.id);
    if (index >= 0) state.playlists[index] = playlist;
    else state.playlists.push(playlist);
    if (state.currentTab === 'playlists') renderPlaylistsTab();
    else if (isCurrentPlaylist(playlist.id)) renderPlaylistSongs(playlist);
    if (state.playlistsError) void loadPlaylists();
}

const playlistWrites = new Map();

function changePlaylistSongs(plId, change) {
    const previous = playlistWrites.get(plId) || Promise.resolve();
    const request = previous.catch(() => {}).then(() => fetchJSON(`/api/playlists/${encodeURIComponent(plId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
    }));
    playlistWrites.set(plId, request);
    return request.finally(() => {
        if (playlistWrites.get(plId) === request) playlistWrites.delete(plId);
    });
}

async function addSongsToPlaylist(plId, songs, overlay, button) {
    if (!songs.length || overlay.dataset.submitting === 'true') return;
    const errorMessage = overlay.querySelector('.form-error');
    const label = button.innerHTML;
    errorMessage.hidden = true;
    overlay.dataset.submitting = 'true';
    button.textContent = '添加中…';
    button.setAttribute('aria-busy', 'true');
    try {
        const data = await changePlaylistSongs(plId, { add_songs: songs });
        delete overlay.dataset.submitting;
        dismissDialog(overlay);
        updatePlaylistFromResponse(data.playlist);
        toast(data.added_count ? `已添加 ${data.added_count} 首歌曲到歌单` : '所选歌曲已在歌单中', false, 'check');
    } catch (error) {
        errorMessage.textContent = error.message || '添加失败，请重试';
        errorMessage.hidden = false;
    } finally {
        delete overlay.dataset.submitting;
        button.innerHTML = label;
        button.removeAttribute('aria-busy');
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
    state.playHistory = [];
    state.queueIndex = 0;
    const firstSong = playlistSongs[0];
    if (state.currentSong?.id === firstSong.id && (state.isPlaying || state.isLoading)) {
        savePlaybackState();
        return;
    }
    playSong(firstSong.id, { keepQueue: true, rememberHistory: false });
}

async function init() {
    const ambience = playerBar.querySelector('.player-ambience');
    let playerInView = true;
    const syncAmbience = () => { ambience.hidden = document.hidden || !playerInView; };
    if ('IntersectionObserver' in window) {
        const visibleRatio = 0.15;
        new IntersectionObserver(([entry]) => {
            playerInView = entry.intersectionRatio >= visibleRatio;
            syncAmbience();
        }, { threshold: visibleRatio }).observe(playerBar);
    }
    document.addEventListener('visibilitychange', syncAmbience);
    syncAmbience();
    setInterval(updateGDServerStatus, 20000);
    try {
        const savedLyricsEffect = localStorage.getItem('shine_lyrics_effect');
        if (savedLyricsEffect === 'emphasis' || savedLyricsEffect === 'neon') state.lyricsEffect = 'emphasis';
    } catch { /* Use the default when storage is unavailable. */ }
    syncLyricsEffect();
    syncLibraryNavigation();
    renderSearchResults();
    // 初始化按钮图标
    playModeBtn.innerHTML = ICON.repeat;
    playModeBtn.title = '列表循环';
    equalizer.classList.add('paused');

    // 恢复音量和播放状态
    try {
        const savedVol = localStorage.getItem('music_volume');
        if (savedVol !== null && savedVol.trim() && Number.isFinite(Number(savedVol))) volumeBar.value = savedVol;
    } catch { /* Use default volume when storage is unavailable. */ }
    playbackState.baseVolume = Number(volumeBar.value || 0) / 100;
    setVolume(Number(volumeBar.value));
    syncImmersivePlayerUI();
    await Promise.all([loadPlaylists(), loadFavorites()]);
    await restorePlaybackState();
    renderQueue();
    syncImmersivePlayerUI();
}

init();
