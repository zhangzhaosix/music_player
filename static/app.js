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
const heroSongMeta = $('heroSongMeta');
const songSource = $('songSource');
const lyricsList = $('lyricsList');
const aboutSongText = $('aboutSongText');
const relatedSongText = $('relatedSongText');
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
};
const LEVELING_TARGET_RMS = 0.16;
const LEVELING_ANALYZE_MS = 1200;
const LEVELING_TIMEOUT_MS = 2500;
const LEVELING_MIN_GAIN = 0.75;
const LEVELING_MAX_GAIN = 1.45;
const LEVELING_PEAK_LIMIT = 0.92;

// ─── SVG 图标 ──────────────────────────────────────────
const ICON = {
  play: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/></svg>',
  pause: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z"/></svg>',
  heart: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 018-2.828A4.5 4.5 0 0118 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 01-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 01-.69.001l-.002-.001z"/></svg>',
  heartOutline: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 018-2.828A4.5 4.5 0 0118 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 01-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 01-.69.001l-.002-.001z"/></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"/><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"/></svg>',
  downloadDone: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"/><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/></svg>',
  minus: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z"/></svg>',
  prev: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M4.5 4.5a.75.75 0 00-1.5 0v11a.75.75 0 001.5 0v-11zM6.058 9.69a.75.75 0 000 1.026l5.236 5.228a.75.75 0 001.06 0 .75.75 0 000-1.061l-3.435-3.428L15 9.554a.75.75 0 000-1.5L8.92 8.006l3.435-3.428a.75.75 0 000-1.06.75.75 0 00-1.06 0L6.058 9.69z"/></svg>',
  next: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M3.28 4.23a.75.75 0 00-1.06 1.06l3.427 3.428L2.222 12.69a.75.75 0 101.06 1.06l4.236-4.236a.75.75 0 000-1.061L3.28 4.23zM16.5 4.5a.75.75 0 00-1.5 0v11a.75.75 0 001.5 0v-11z"/></svg>',
  shuffle: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M15.22 4.97a.75.75 0 01.78.28l2 2.5a.75.75 0 01-.11 1.05l-2.5 2a.75.75 0 01-.99-1.13l1.11-.89H13.5a1.5 1.5 0 00-1.15.56l-1.3 1.63a.75.75 0 11-1.2-.9l1.3-1.63A3 3 0 0113.5 6.5h1.72l-1.1-.89a.75.75 0 01.1-1.14z"/><path d="M3.25 5.5a.75.75 0 000 1.5h1.65a1.5 1.5 0 011.15.56l3.07 3.84a.75.75 0 101.2-.9l-3.07-3.84A3 3 0 004.9 5.5H3.25z"/><path d="M8.58 10.94a.75.75 0 00-1.06-.02l-.38.34a3 3 0 01-2.2.92H3.25a.75.75 0 000 1.5h1.69a4.5 4.5 0 003.3-1.38l.38-.34a.75.75 0 00-.04-1.02z"/><path d="M10.22 11.78a.75.75 0 111.06-1.06l.03.03a3 3 0 012.19.93H15.3l-1.1-.89a.75.75 0 111-1.13l2.5 2a.75.75 0 01.11 1.05l-2 2.5a.75.75 0 01-.99 1.13l-1.11-.89H13.5a3 3 0 00-2.19-.93l-.03-.03z"/></svg>',
  repeat: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M15.22 6.03a.75.75 0 010 1.06L14.08 8.23a.75.75 0 01-1.06-1.06l.47-.47H7.5a2.25 2.25 0 000 4.5h.19a.75.75 0 010 1.5h-.19a3.75 3.75 0 010-7.5h5.99l-.47-.47a.75.75 0 011.06-1.06l1.14 1.14a.75.75 0 01.22.53z"/><path d="M5.78 13.97a.75.75 0 010-1.06l1.14-1.14a.75.75 0 011.06 1.06l-.47.47h5.99a2.25 2.25 0 000-4.5h-.19a.75.75 0 010-1.5h.19a3.75 3.75 0 010 7.5H7.51l.47.47a.75.75 0 01-1.06 1.06l-1.14-1.14a.75.75 0 01-.22-.53z"/></svg>',
  repeatOne: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M15.22 6.03a.75.75 0 010 1.06L14.08 8.23a.75.75 0 01-1.06-1.06l.47-.47H7.5a2.25 2.25 0 000 4.5h.19a.75.75 0 010 1.5h-.19a3.75 3.75 0 010-7.5h5.99l-.47-.47a.75.75 0 011.06-1.06l1.14 1.14a.75.75 0 01.22.53z"/><path d="M5.78 13.97a.75.75 0 010-1.06l1.14-1.14a.75.75 0 011.06 1.06l-.47.47h5.99a2.25 2.25 0 000-4.5h-.19a.75.75 0 010-1.5h.19a3.75 3.75 0 010 7.5H7.51l.47.47a.75.75 0 01-1.06 1.06l-1.14-1.14a.75.75 0 01-.22-.53z"/><circle cx="10" cy="10.5" r="1.5"/></svg>',
  musicNote: '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M14.5 2.25A.75.75 0 0115.17 3l.006 11.747a3.748 3.748 0 01-5.304 3.36 3.75 3.75 0 01-1.806-4.226 3.75 3.75 0 014.05-2.882l.002 2a2.25 2.25 0 10-1.582 2.522L11 11.193V4.909c0-.21.07-.414.198-.575l.098-.125a2.25 2.25 0 011.328-.738l.206-.027.545-.068.322-.04.496-.062c.4-.05.807-.074 1.222-.074h.117a.75.75 0 01.087 1.498l-.026.001h-.242z"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5l3 3 8-8"/></svg>',
};

function renderPlaylistFolderIcon(kind = 'card') {
    const className = kind === 'inline'
        ? 'playlist-folder-icon playlist-folder-icon-inline'
        : 'playlist-folder-icon playlist-folder-icon-card';
    return `<span class="${className}" aria-hidden="true">
        <svg viewBox="0 0 512 512" focusable="false" role="img">
            <defs>
                <linearGradient id="pf-body" x1="96" y1="120" x2="416" y2="400" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stop-color="#637558" />
                    <stop offset="0.46" stop-color="#3e4b3e" />
                    <stop offset="1" stop-color="#161d18" />
                </linearGradient>
                <linearGradient id="pf-front" x1="84" y1="188" x2="430" y2="402" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stop-color="#55634d" />
                    <stop offset="0.5" stop-color="#2f392f" />
                    <stop offset="1" stop-color="#171d18" />
                </linearGradient>
                <linearGradient id="pf-tab" x1="120" y1="106" x2="300" y2="176" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stop-color="#75886a" />
                    <stop offset="1" stop-color="#435245" />
                </linearGradient>
                <radialGradient id="pf-disc" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(250 300) rotate(90) scale(126)">
                    <stop offset="0" stop-color="#474d45" />
                    <stop offset="0.58" stop-color="#212622" />
                    <stop offset="1" stop-color="#111512" />
                </radialGradient>
                <radialGradient id="pf-center" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(250 300) scale(58)">
                    <stop offset="0" stop-color="#fbf5e6" />
                    <stop offset="1" stop-color="#e0d0af" />
                </radialGradient>
                <filter id="pf-shadow" x="54" y="74" width="404" height="392" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#020302" flood-opacity="0.18" />
                </filter>
            </defs>
            <g filter="url(#pf-shadow)">
                <path d="M108 150c0-28 23-50 50-50h80c15 0 29 6 39 17l22 25h113c28 0 50 22 50 50v156c0 34-28 62-62 62H170c-34 0-62-28-62-62V150z" fill="url(#pf-body)" />
                <path d="M96 178c0-25 20-45 45-45h93c15 0 28 6 38 17l18 21h126c28 0 50 22 50 50v143c0 36-29 65-65 65H161c-36 0-65-29-65-65V178z" fill="url(#pf-front)" />
                <path d="M105 139h89c16 0 30 7 40 18l15 17h133c23 0 41 18 41 41v10H105v-86z" fill="url(#pf-tab)" />
                <path d="M104 187h306" stroke="rgba(223,232,210,0.56)" stroke-width="2.7" stroke-linecap="round" />
                <g transform="translate(250 304)">
                    <circle r="120" fill="url(#pf-disc)" />
                    <circle r="98" fill="none" stroke="rgba(255,255,255,0.055)" stroke-width="1.8" />
                    <circle r="78" fill="none" stroke="rgba(255,255,255,0.045)" stroke-width="1.8" />
                    <circle r="58" fill="none" stroke="rgba(255,255,255,0.038)" stroke-width="1.8" />
                    <circle r="38" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1.8" />
                    <circle r="62" fill="rgba(0,0,0,0.08)" />
                    <circle r="50" fill="url(#pf-center)" stroke="rgba(255,255,255,0.4)" stroke-width="1.6" />
                    <circle r="14" fill="#1b1710" />
                    <circle r="8" fill="rgba(255,255,255,0.04)" />
                </g>
                <circle cx="250" cy="304" r="130" fill="none" stroke="rgba(206,224,181,0.42)" stroke-width="3" />
                <circle cx="250" cy="304" r="131.5" fill="none" stroke="rgba(25,31,26,0.72)" stroke-width="1.8" />
                <path d="M135 388c18 10 44 16 76 16h72c73 0 117-27 131-81" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="14" stroke-linecap="round" />
            </g>
        </svg>
    </span>`;
}

// ─── 工具栏 ─────────────────────────────────────────────

function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = `toast${isError ? ' error-toast' : ''}`;
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, 2000);
}

function closeDeleteConfirm(confirmed) {
    if (!deleteConfirmResolver) return;

    deleteConfirmModal.style.display = 'none';
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

const DEFAULT_LYRIC_LINES = [
    '把唱针轻轻落下，让房间慢慢安静。',
    '这一刻，只留下旋转的黑胶和低声的旋律。',
    '歌词数据暂未接入，当前展示为沉浸式占位。',
    '你可以继续搜索、收藏，或把歌曲加入歌单。',
    '当音乐播放时，唱片会跟随状态缓慢旋转。',
    '暂停之后，夜色和节拍一起停在这里。',
];
const SEARCH_SOURCE_LIMIT = 20;
const SOURCE_LABELS = {
    netease: '网易云',
};

function getSongInitial(song) {
    const text = (song && (song.title || song.artist)) || '♪';
    return String(text).trim().charAt(0).toUpperCase() || '♪';
}

function getSourceLabel(song) {
    if (!song) return 'LOCAL PLAYER';
    if (song.downloaded || song.filename) return 'LOCAL FILE';
    if (song.type && SOURCE_LABELS[song.type]) return SOURCE_LABELS[song.type];
    return (song.source || 'ONLINE').toUpperCase();
}

function getSongMeta(song) {
    if (!song) return '在音乐库中选择歌曲，播放后唱片会随音乐缓慢旋转。';
    const artist = song.artist || '未知歌手';
    const source = getSourceLabel(song);
    const cache = song.downloaded ? '本地下载' : '在线试听';
    return `${artist} · ${source} · ${cache}`;
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
            .map(item => ({
                text: String(item.text || item.lineLyric || item.line || '').trim(),
                time: Number(item.time || 0),
            }))
            .filter(item => item.text);
    }

    if (!song) return DEFAULT_LYRIC_LINES;
    const title = song.title || '这首歌';
    const artist = song.artist || '未知歌手';
    return [
        `正在播放：${title}`,
        `${artist} 的声音在深色房间里展开。`,
        '真实歌词暂未接入，这里保留沉浸式阅读节奏。',
        '旋转的唱片、轻微的颗粒感和留白一起服务播放体验。',
        '打开音乐库，可以继续搜索、收藏、下载或整理歌单。',
        '让这一首歌慢慢走完，不急着切到下一首。',
    ].map(text => ({ text, time: null }));
}

function renderLyrics(song) {
    if (!lyricsList) return;
    const lyricEntries = getLyricEntries(song);
    const lyricsKey = JSON.stringify([
        song ? (song.id || song.url || song.filename || '') : '',
        hasRealLyrics(song),
        lyricEntries.map(line => [line.time ?? '', line.text]),
    ]);
    if (state.currentLyricsKey === lyricsKey) return;
    state.currentLyricsKey = lyricsKey;
    state.currentLyricIndex = -1;
    const fallbackNotice = song && !hasRealLyrics(song)
        ? '<p class="lyric-note">暂无真实歌词，已显示占位歌词。</p>'
        : '';
    lyricsList.innerHTML = fallbackNotice + lyricEntries
        .map((line, index) => `<p class="lyric-line${index === 0 ? ' active' : ''}" data-lyric-index="${index}" data-time="${line.time ?? ''}">${escapeHtml(line.text)}</p>`)
        .join('');
}

function syncLyricHighlight() {
    if (!lyricsList) return;
    const lines = Array.from(lyricsList.querySelectorAll('.lyric-line'));
    if (!lines.length) return;

    const timedLines = lines
        .map((line, index) => ({ index, time: Number(line.dataset.time) }))
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
    if (activeLine && state.isPlaying) {
        activeLine.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

function syncImmersivePlayerUI() {
    const song = state.currentSong;
    const title = song ? (song.title || '未知歌曲') : '沉浸式黑胶播放器';
    const artist = song ? (song.artist || '未知歌手') : '打开音乐库选择播放';
    const source = getSourceLabel(song);

    document.body.classList.toggle('is-playing', state.isPlaying);
    if (vinylRecord) vinylRecord.classList.toggle('is-spinning', state.isPlaying);
    if (albumInitial) albumInitial.textContent = getSongInitial(song);
    if (vinylState) vinylState.textContent = state.isPlaying ? 'Playing' : 'Paused';
    if (ambientSongTitle) ambientSongTitle.textContent = song ? title : '选择一首歌开始播放';
    if (heroSongTitle) heroSongTitle.textContent = title;
    if (heroSongMeta) heroSongMeta.textContent = getSongMeta(song);
    if (songSource) songSource.textContent = source;
    if (playerTitle) playerTitle.textContent = song ? title : '未选择歌曲';
    if (playerArtist) playerArtist.textContent = song ? artist : '打开音乐库选择播放';
    if (aboutSongText) {
        aboutSongText.textContent = song
            ? `${title} · ${artist}。当前百科位不额外抓取第三方资料，优先保持播放体验安静、稳定。`
            : '当前页面保留原有搜索、收藏、下载和歌单能力；歌曲百科区域作为轻量信息位，不额外抓取第三方资料。';
    }
    if (relatedSongText) {
        const queueCount = state.queue.length;
        relatedSongText.textContent = queueCount
            ? `当前播放队列共有 ${queueCount} 首歌。你可以在音乐库里继续调整收藏、下载和歌单。`
            : '相关推荐会优先使用当前播放队列。打开音乐库可继续搜索、收藏或管理歌单。';
    }

    renderLyrics(song);
    syncLyricHighlight();
    syncFavoriteCurrentButton();
}

function setLibraryOpen(open) {
    if (!libraryPanel || !libraryBackdrop) return;
    libraryPanel.classList.toggle('open', open);
    libraryPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    libraryBackdrop.hidden = !open;
    if (libraryToggle) libraryToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
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

    for (const key of ['url', 'source_url', 'song_url', 'resolved_url']) {
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
    const visible = allowBatch && (count > 0 || hasVisibleSongs);
    const isDownloadsTab = state.currentTab === 'downloads';

    batchToolbar.classList.toggle('hidden', !visible);
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
    state.isBatchMode = state.selectedSongIds.size > 0;
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

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

        const tabName = tab.dataset.tab;
        state.currentTab = tabName;

        const target = $(`tab-${tabName}`);
        if (target) target.classList.add('active');

        clearBatchSelection();
        if (tabName === 'favorites') loadFavorites();
        else if (tabName === 'search') renderSearchResults();
        else if (tabName === 'playlists') renderPlaylistsTab();
        else if (tabName === 'downloads') loadDownloads();
    });
});

document.querySelectorAll('.lyric-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const name = tab.dataset.lyricTab;
        document.querySelectorAll('.lyric-tab').forEach(t => {
            const active = t === tab;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('.lyric-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === name);
        });
    });
});

if (libraryToggle) libraryToggle.addEventListener('click', openLibrary);
if (queueBtn) queueBtn.addEventListener('click', openLibrary);
if (closeLibraryPanel) closeLibraryPanel.addEventListener('click', closeLibrary);
if (libraryBackdrop) libraryBackdrop.addEventListener('click', closeLibrary);
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLibrary();
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

if (batchCancelBtn) batchCancelBtn.addEventListener('click', clearBatchSelection);
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
    searchInput.disabled = isLoading;
    searchBtn.disabled = isLoading;
    searchBtn.textContent = isLoading ? '搜索中' : '搜索';
}

async function doSearch(options = {}) {
    const q = searchInput.value.trim();
    searchInput.value = q;
    if (!q) {
        if (!options.silentEmpty) toast('请输入搜索关键词', true);
        return;
    }
    if (state.isSearching) return;

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelector('.tab[data-tab="search"]').classList.add('active');
    $('tab-search').classList.add('active');
    state.currentTab = 'search';
    clearBatchSelection();

    const container = $('searchResults');
    if (q === state.lastSearchKeyword) {
        renderSearchResults();
        return;
    }

    container.innerHTML = '<div class="loading">搜索中...</div>';
    setSearchLoading(true);

    try {
        const params = new URLSearchParams({
            q,
            source_limit: String(SEARCH_SOURCE_LIMIT),
        });
        const resp = await fetch(`/api/search?${params.toString()}`);
        const data = await resp.json();
        if (data.error) {
            container.innerHTML = `<div class="empty-state"><p>${data.error}</p></div>`;
            syncBatchToolbar();
            return;
        }
        state.searchResults = data.results || [];
        state.lastSearchKeyword = q;
        syncCachedSongFlags();
        renderSearchResults();
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>搜索失败，请检查网络</p></div>';
    } finally {
        setSearchLoading(false);
    }
}

function renderSearchResults() {
    const container = $('searchResults');
    if (!state.searchResults.length) {
        container.innerHTML = '<div class="empty-state"><p>没有找到相关歌曲</p><p class="hint">试试其他关键词</p></div>';
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
            container.innerHTML = '<div class="empty-state"><p>本地还没有歌曲</p><p class="hint">搜索后点击 💾 下载</p></div>';
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
    container.innerHTML = '<div class="loading">加载中</div>';

    try {
        const resp = await fetch('/api/favorites');
        const data = await resp.json();
        state.favorites = data.favorites || [];
        syncCachedSongFlags();

        if (!state.favorites.length) {
            container.innerHTML = '<div class="empty-state"><p>还没有收藏的歌曲</p><p class="hint">点击 ♡ 收藏喜欢的歌</p></div>';
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
        syncBatchToolbar();
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
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
            container.innerHTML = '<div class="empty-state"><p>还没有下载过歌曲</p><p class="hint">搜索歌曲后点击 💾 下载</p></div>';
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
    const dlClass = song.downloaded ? 'downloaded' : '';
    const dlIcon = song.downloaded ? ICON.downloadDone : ICON.download;
    const favorited = isSongFavorited(song);
    const favClass = favorited ? 'favorited' : '';
    const favIcon = favorited ? ICON.heart : ICON.heartOutline;
    const removeFromPlaylistBtn = options.playlistId
        ? `<button class="remove-from-pl-btn" onclick="removeSongFromPlaylist('${options.playlistId}', '${song.id}')" title="从歌单移除">${ICON.minus}</button>`
        : '';
    const deleteBtn = `<button class="del-btn${song.downloaded ? '' : ' hidden'}" onclick="deleteLocalSong('${song.id}')" title="删除本地文件">${ICON.trash}</button>`;

    const playingClass = isPlaying ? 'playing-now' : '';
    return `
        <div class="song-item ${playingClass}${isSelected ? ' selected' : ''}" data-song-id="${song.id}">
            ${hideSelectBtn ? '' : `<button class="song-select-btn${isSelected ? ' selected' : ''}" onclick="toggleSongSelection('${song.id}')" aria-label="选择歌曲" aria-pressed="${isSelected ? 'true' : 'false'}">${isSelected ? ICON.check : ''}</button>`}
            <div class="song-cover">${ICON.musicNote}</div>
            <div class="song-info">
                <div class="song-title">${escapeHtml(song.title || '未知歌曲')}</div>
                <div class="song-artist">${escapeHtml(song.artist || '未知歌手')}</div>
            </div>
            <div class="song-actions">
                <button class="play-btn-item ${isPlaying ? 'playing' : ''}" onclick="playSong('${song.id}')" title="播放">${playIcon}</button>
                <button class="fav-btn ${favClass}" onclick="toggleFavorite('${song.id}')" title="${favorited ? '取消收藏' : '收藏'}">${favIcon}</button>
                <button class="add-to-pl-btn" onclick="showAddToPlaylist('${song.id}')" title="加入歌单">${ICON.plus}</button>
                <button class="dl-btn ${dlClass}" onclick="downloadSong('${song.id}')" title="${song.downloaded ? '已下载' : '下载'}">${dlIcon}</button>
                ${removeFromPlaylistBtn}
                ${deleteBtn}
            </div>
        </div>`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    state.isPlaying = false;
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

async function startAudioPlayback({ song, shouldPlay, seekTime, saveState }) {
    try {
        await waitForAudioMetadata();
    } catch {
        return false;
    }

    if (seekTime > 0.5 && seekTime < (audio.duration || Infinity)) {
        try {
            audio.currentTime = seekTime;
        } catch {
            // ponytail: seek fails on some remote streams, playback can still continue from 0.
        }
    }

    playerBar.style.display = 'flex';
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
        state.isPlaying = true;
        playBtn.innerHTML = ICON.pause;
        equalizer.classList.remove('paused');
        updatePlayButtons();
        syncImmersivePlayerUI();
        if (saveState) savePlaybackState();
        return true;
    } catch {
        state.isPlaying = false;
        playBtn.innerHTML = ICON.play;
        equalizer.classList.add('paused');
        updatePlayButtons();
        syncImmersivePlayerUI();
        return false;
    }
}

async function analyzeTrackGain(song, audioUrl) {
    if (restoreCachedTrackGain(song, audioUrl)) return true;

    const audioPipeline = await ensureAudioPipeline();
    if (!audioPipeline) return false;

    const requestToken = playbackState.analysisToken;
    try {
        if (audioPipeline.context.state === 'suspended') {
            await audioPipeline.context.resume();
        }
        await waitForAudioMetadata();
        audioPipeline.gain.gain.value = 0;
        try {
            audio.currentTime = 0;
        } catch {
            return false;
        }
        await audio.play();
        await delay(LEVELING_ANALYZE_MS);
        if (requestToken !== playbackState.analysisToken) return false;

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
        audio.pause();
        try {
            audio.currentTime = 0;
        } catch {
            return false;
        }

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
        applyEffectiveVolume();
        return true;
    } catch {
        return false;
    } finally {
        if (requestToken === playbackState.analysisToken) {
            try {
                audio.pause();
            } catch {
                // ignore pause failures
            }
            applyEffectiveVolume();
        }
    }
}

async function startPlaybackWithLeveling({ song, audioUrl, shouldPlay = true, seekTime = 0, saveState = false }) {
    playbackState.analysisToken += 1;
    playbackState.trackGain = 1;
    applyEffectiveVolume();
    audio.src = audioUrl;

    if (!shouldPlay) {
        restoreCachedTrackGain(song, audioUrl);
        return startAudioPlayback({ song, shouldPlay, seekTime, saveState });
    }

    const leveled = await analyzeTrackGain(song, audioUrl);
    if (!leveled) {
        return startAudioPlayback({ song, shouldPlay, seekTime, saveState });
    }
    return startAudioPlayback({ song, shouldPlay, seekTime, saveState });
}

async function playSong(songId) {
    // 在当前所有歌曲列表中找这个歌曲
    let song = resolvePlayableSong(songId);
    syncQueueForSong(songId);
    if (!song) return toast('找不到歌曲信息', true);

    // 如果点击的是同一首歌，切换播放/暂停
    if (state.currentSong && state.currentSong.id === songId) {
        togglePlayPause();
        return;
    }

    state.currentSong = song;
    state.isPlaying = false;
    playBtn.innerHTML = ICON.play;
    syncImmersivePlayerUI();

    // 构建播放 URL
    let audioUrl;
    if (song.downloaded && song.filename) {
        const hydrated = await loadOnlineSongInfo(song);
        song = hydrated.song || song;
        state.currentSong = song;
        audioUrl = hydrated.audioUrl || `/api/stream/${encodeURIComponent(song.filename)}`;
        syncImmersivePlayerUI();
    } else if (song.url) {
        // 如果是在线结果，先补全直链再代理播放
        renderLyrics({ ...song, lyrics: [{ time: 0, text: '正在加载歌词...' }] });
        const hydrated = await loadOnlineSongInfo(song);
        if (!hydrated) {
            toast('无法获取网易云播放地址', true);
            syncImmersivePlayerUI();
            return;
        }
        song = hydrated.song;
        state.currentSong = song;
        audioUrl = hydrated.audioUrl;
        syncImmersivePlayerUI();
    } else if (song.filename) {
        audioUrl = `/api/stream/${encodeURIComponent(song.filename)}`;
    } else {
        toast('无法播放此歌曲', true);
        return;
    }

    const started = await startPlaybackWithLeveling({
        song,
        audioUrl,
        shouldPlay: true,
        seekTime: 0,
        saveState: true,
    });
    if (!started) {
        toast('播放失败', true);
        syncImmersivePlayerUI();
    }
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

async function fetchOnlineSongInfo(songUrl, song = null) {
    try {
        const params = new URLSearchParams({ url: songUrl });
        if (song && song.title) params.set('title', song.title);
        if (song && song.artist) params.set('artist', song.artist);
        const resp = await fetch(`/api/song-info?${params.toString()}`);
        const data = await resp.json();
        if (data.error) {
            toast(data.error, true);
            return null;
        }
        return data;
    } catch {
        toast('鑾峰彇鎾斁淇℃伅澶辫触', true);
        return null;
    }
}

function mergeSongInfo(song, info) {
    if (!song || !info) return song;
    const merged = {
        ...song,
        title: isBlockedSongText(info.title) ? song.title : (info.title || song.title),
        artist: isBlockedSongText(info.artist) ? song.artist : (info.artist || song.artist),
        cover_url: info.cover_url || song.cover_url,
        lyric_id: info.lyric_id || song.lyric_id,
        mp3_url: info.mp3_url || song.mp3_url,
        source_url: info.source_url || song.source_url || song.url,
        url: info.source_url || song.source_url || song.url,
    };

    if (Array.isArray(info.lyrics) && info.lyrics.length) {
        merged.lyrics = info.lyrics;
    }

    return merged;
}

async function loadOnlineSongInfo(song) {
    if (!song) {
        return {
            song,
            audioUrl: '',
        };
    }

    if (song.downloaded && song.filename) {
        const infoSourceUrl = song.source_url || song.url;
        const info = infoSourceUrl ? await fetchOnlineSongInfo(infoSourceUrl, song) : null;
        return {
            song: mergeSongInfo(song, info || song),
            audioUrl: "/api/stream/" + encodeURIComponent(song.filename),
        };
    }

    const directMp3Url = song.mp3_url || (song.url && /\.mp3(?:[?#].*)?$/i.test(song.url) ? song.url : '');
    if (directMp3Url) {
        const infoSourceUrl = song.source_url || song.url;
        const info = infoSourceUrl ? await fetchOnlineSongInfo(infoSourceUrl, song) : null;
        return {
            song: mergeSongInfo(song, info || {
                title: song.title,
                artist: song.artist,
                mp3_url: directMp3Url,
                source_url: infoSourceUrl,
                cover_url: song.cover_url,
                lyrics: song.lyrics,
            }),
            audioUrl: getAudioUrl(directMp3Url),
        };
    }
    if (!song.url) {
        return {
            song,
            audioUrl: '',
        };
    }

    const info = await fetchOnlineSongInfo(song.url, song);
    if (!info || !info.mp3_url) return null;

    return {
        song: mergeSongInfo(song, info),
        audioUrl: getAudioUrl(info.mp3_url),
    };
}


function togglePlayPause() {
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
        playSong(state.queue[state.queueIndex].id);
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
    playSong(state.queue[state.queueIndex].id);
});

nextBtn.addEventListener('click', () => {
    if (state.queue.length === 0) return;
    if (state.playMode === 'shuffle') {
        state.queueIndex = Math.floor(Math.random() * state.queue.length);
    } else {
        state.queueIndex = (state.queueIndex + 1) % state.queue.length;
    }
    playSong(state.queue[state.queueIndex].id);
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
});

function updateRangeFill(el, color1, color2) {
    const val = parseFloat(el.value);
    const min = parseFloat(el.min) || 0;
    const max = parseFloat(el.max) || 100;
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    const c1 = color1 || 'var(--accent)';
    const c2 = color2 || 'rgba(255,255,255,0.12)';
    el.style.background = `linear-gradient(to right, ${c1} 0%, ${c1} ${pct}%, ${c2} ${pct}%, ${c2} 100%)`;
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
    if (audio.duration) {
        audio.currentTime = (progressBar.value / 100) * audio.duration;
        currentTime.textContent = formatTime(audio.currentTime);
        syncLyricHighlight();
    }
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

progressBar.addEventListener('pointerup', () => {
    seekAudio();
    state.isSeeking = false;
    updateRangeFill(progressBar);
});

volumeBar.addEventListener('input', () => {
    playbackState.baseVolume = Number(volumeBar.value || 0) / 100;
    localStorage.setItem('music_volume', volumeBar.value);
    applyEffectiveVolume();
    updateRangeFill(volumeBar, 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)');
});

function setVolume(value) {
    const next = Math.max(0, Math.min(100, Math.round(value)));
    volumeBar.value = String(next);
    playbackState.baseVolume = next / 100;
    localStorage.setItem('music_volume', String(next));
    applyEffectiveVolume();
    updateRangeFill(volumeBar, 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)');
}

function adjustVolume(delta) {
    setVolume(Number(volumeBar.value || 0) + delta);
}

function isShortcutInputTarget(target = document.activeElement) {
    if (!target) return false;
    if (target.closest && target.closest('.modal-box, .add-to-pl-panel')) return true;
    if (target.isContentEditable) return true;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    return ['input', 'textarea', 'select'].includes(tag);
}

function handleKeyboardShortcuts(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
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
    });
    document.querySelectorAll('.song-item').forEach(item => {
        item.classList.remove('playing-now');
    });
    if (state.currentSong) {
        const songItem = document.querySelector(`.song-item[data-song-id="${state.currentSong.id}"]`);
        if (songItem) {
            songItem.classList.add('playing-now');
            const target = songItem.querySelector('.play-btn-item');
            if (target) {
                target.classList.add('playing');
                target.innerHTML = state.isPlaying ? ICON.pause : ICON.play;
            }
        }
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
                toast(data.error || '鎿嶄綔澶辫触', true);
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
                    filename: song.filename || '',
                    downloaded: song.downloaded || false,
                }),
            });
            const data = await resp.json();
            if (!data.success) {
                toast(data.error || '鎿嶄綔澶辫触', true);
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
    $('playlistNameInput').value = '';
    $('playlistNameInput').focus();
});

$('cancelPlaylistBtn').addEventListener('click', () => {
    $('playlistModal').style.display = 'none';
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
            $('playlistModal').style.display = 'none';
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
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    // 不突出显示任何 tab
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    $('tab-playlist-detail').classList.add('active');
    state.currentTab = 'playlist-detail';
    state.currentPlaylistDetailId = plId;

    // 构建头部按钮（直接替换 header 内容）
    const header = document.querySelector('.playlist-detail-header');
    header.innerHTML = `
        <div class="playlist-detail-main">
            <button class="back-btn" onclick="document.querySelector('.tab[data-tab=\\'playlists\\']').click()">← 返回</button>
            <div class="playlist-detail-info">
                <h2>${escapeHtml(pl.name)}</h2>
                <span class="song-count">${pl.songs.length} 首</span>
            </div>
        </div>
        <div class="playlist-detail-actions">
            <button class="play-all-btn" onclick="playPlaylist('${pl.id}')">▶ 播放全部</button>
            <button class="add-song-btn" onclick="showAddSongToPlaylist('${pl.id}')">+ 添加歌曲</button>
            <button class="del-pl-btn" onclick="deletePlaylist('${pl.id}')">🗑 删除</button>
        </div>
    `;

    const container = $('playlistDetailSongs');
    if (!pl.songs.length) {
        container.innerHTML = '<div class="empty-state"><p>歌单还没有歌曲</p><p class="hint">在歌曲上点击 📋 添加到歌单</p></div>';
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
        <div class="pl-option" onclick="addSongToPlaylist('${pl.id}')">
            <span class="pl-option-name">${escapeHtml(pl.name)}</span>
            <span class="pl-option-count">(${pl.songs.length})</span>
        </div>
    `).join('');

    if (!state.playlists.length) {
        optionsHtml = '<div style="padding:10px 12px;font-size:13px;color:#999">还没有歌单，先去创建</div>';
    }

    overlay.innerHTML = `
        <div class="add-to-pl-panel">
            <h3>添加到歌单</h3>
            ${optionsHtml}
            <button class="btn-secondary" onclick="this.closest('.add-to-pl-overlay').remove()">取消</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.remove();
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
            document.getElementById('addToPlOverlay').remove();
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
        container.innerHTML = '<div class="empty-state"><p>还没有创建歌单</p><p class="hint">点击左侧栏 + 或搜索歌曲时点击 📋 创建</p></div>';
        return;
    }
    container.innerHTML = state.playlists.map(pl => {
        const count = pl.songs.length;
        return `
            <div class="playlist-card">
                <div class="pl-card-top" onclick="showPlaylistDetail('${pl.id}')">
                    <div class="pl-card-icon">${renderPlaylistFolderIcon('card')}</div>
                    <div class="pl-card-name">${escapeHtml(pl.name)}</div>
                    <div class="pl-card-count">${count} 首</div>
                </div>
                ${count > 0 ? `<button class="pl-card-play" onclick="event.stopPropagation(); playPlaylist('${pl.id}')" title="播放全部">▶</button>` : ''}
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
        <div class="add-to-pl-panel" style="max-height:80vh;overflow-y:auto;">
            <h3>从收藏添加歌曲到「${escapeHtml(pl.name)}」</h3>
            <div class="song-select-list">${itemsHtml}</div>
            <div style="display:flex;gap:8px;margin-top:12px;">
                <button class="btn-primary" onclick="confirmAddSongsToPlaylist('${plId}')">添加选中</button>
                <button class="btn-secondary" onclick="this.closest('.add-to-pl-overlay').remove()">取消</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.remove();
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
            document.getElementById('addSongsOverlay').remove();
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
    playSong(playlistSongs[0].id);
    toast(`正在播放歌单「${pl.name}」`);
}

// ─── 刷新当前标签页 ─────────────────────────────────────

function refreshCurrentTab() {
    const tab = state.currentTab;
    if (tab === 'search') renderSearchResults();
    else if (tab === 'favorites') loadFavorites();
    else if (tab === 'playlists') renderPlaylistsTab();
    else if (tab === 'downloads') loadDownloads();
    else if (tab === 'playlist-detail' && state.currentPlaylistDetailId) showPlaylistDetail(state.currentPlaylistDetailId);
}

// ─── 状态持久化 ─────────────────────────────────────────

function savePlaybackState() {
    if (!state.currentSong) return;
    try {
        const s = state.currentSong;
        localStorage.setItem('music_playback', JSON.stringify({
            currentSong: {
                id: s.id, title: s.title, artist: s.artist,
                url: s.url, filename: s.filename, downloaded: s.downloaded,
            },
            currentTime: audio.currentTime || 0,
            wasPlaying: state.isPlaying,
            queue: state.queue.map(q => ({
                id: q.id, title: q.title, artist: q.artist,
                url: q.url, filename: q.filename, downloaded: q.downloaded,
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
    state.currentSong = song;
    playerBar.style.display = 'flex';
    playerTitle.textContent = song.title || '未知歌曲';
    playerArtist.textContent = song.artist || '未知歌手';
    equalizer.classList.add('paused');
    updatePlayButtons();
    syncImmersivePlayerUI();

    // 构建播放 URL
    let audioUrl;
    if (song.downloaded && song.filename) {
        const hydrated = await loadOnlineSongInfo(song);
        song = hydrated.song || song;
        state.currentSong = song;
        audioUrl = hydrated.audioUrl || `/api/stream/${encodeURIComponent(song.filename)}`;
        syncImmersivePlayerUI();
    } else if (song.url) {
        const hydrated = await loadOnlineSongInfo(song);
        if (!hydrated) {
            localStorage.removeItem('music_playback');
            state.currentSong = null;
            syncImmersivePlayerUI();
            return;
        }
        song = hydrated.song;
        state.currentSong = song;
        audioUrl = hydrated.audioUrl;
        syncImmersivePlayerUI();
    } else if (song.filename) {
        audioUrl = `/api/stream/${encodeURIComponent(song.filename)}`;
    }
    if (!audioUrl) {
        localStorage.removeItem('music_playback');
        state.currentSong = null;
        syncImmersivePlayerUI();
        return;
    }

    const seekTime = data.currentTime || 0;
    const shouldPlay = data.wasPlaying;
    await startPlaybackWithLeveling({
        song,
        audioUrl,
        shouldPlay,
        seekTime,
        saveState: false,
    });
}

// ─── 初始化 ─────────────────────────────────────────────

async function showPlaylistDetail(plId) {
    const pl = state.playlists.find(p => p.id === plId);
    if (!pl) return;

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    $('tab-playlist-detail').classList.add('active');
    state.currentTab = 'playlist-detail';
    state.currentPlaylistDetailId = plId;

    const header = document.querySelector('.playlist-detail-header');
    header.innerHTML = `
        <div class="playlist-detail-main">
            <button class="back-btn" onclick="document.querySelector('.tab[data-tab=\\'playlists\\']').click()">← 返回</button>
            <div class="playlist-detail-info">
                <h2>${escapeHtml(pl.name)}</h2>
                <span class="song-count">${pl.songs.length} 首</span>
            </div>
        </div>
        <div class="playlist-detail-actions">
            <button class="play-all-btn" onclick="playPlaylist('${pl.id}')">▶ 播放全部</button>
            <button class="add-song-btn" onclick="showAddSongToPlaylist('${pl.id}')">+ 添加歌曲</button>
            <button class="del-pl-btn" onclick="deletePlaylist('${pl.id}')">🗑 删除</button>
        </div>
    `;

    const container = $('playlistDetailSongs');
    if (!pl.songs.length) {
        container.innerHTML = '<div class="empty-state"><p>歌单还没有歌曲</p><p class="hint">在歌曲上点击 📋 添加到歌单</p></div>';
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
            document.getElementById('addToPlOverlay')?.remove();
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
            document.getElementById('addSongsOverlay')?.remove();
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
    playSong(playlistSongs[0].id);
    toast(`正在播放歌单《${pl.name}》`);
}

async function init() {
    await loadPlaylists();
    await loadFavorites();
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
    updateRangeFill(volumeBar, 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)');
    await restorePlaybackState();
    syncImmersivePlayerUI();
}

init();
