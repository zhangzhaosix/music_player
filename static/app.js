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
};

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

function formatTime(sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

        if (tabName === 'favorites') loadFavorites();
        else if (tabName === 'search') renderSearchResults();
        else if (tabName === 'playlists') renderPlaylistsTab();
        else if (tabName === 'downloads') loadDownloads();
    });
});

// ─── 搜索 ───────────────────────────────────────────────

searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
});

async function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return toast('请输入搜索关键词', true);

    // 切换到搜索结果标签
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelector('.tab[data-tab="search"]').classList.add('active');
    $('tab-search').classList.add('active');
    state.currentTab = 'search';

    const container = $('searchResults');
    container.innerHTML = '<div class="loading">搜索中</div>';

    try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await resp.json();
        if (data.error) {
            container.innerHTML = `<div class="empty-state"><p>${data.error}</p></div>`;
            return;
        }
        state.searchResults = data.results || [];
        renderSearchResults();
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>搜索失败，请检查网络</p></div>';
    }
}

function renderSearchResults() {
    const container = $('searchResults');
    if (!state.searchResults.length) {
        container.innerHTML = '<div class="empty-state"><p>没有找到相关歌曲</p><p class="hint">试试其他关键词</p></div>';
        return;
    }
    container.innerHTML = state.searchResults.map(song => buildSongItem(song)).join('');
}

// ─── 全部歌曲（本地 + 收藏混合）────────────────────────

async function loadAllSongs() {
    const container = $('allSongs');
    container.innerHTML = '<div class="loading">加载中</div>';

    try {
        const [localResp, favResp] = await Promise.all([
            fetch('/api/music'),
            fetch('/api/favorites'),
        ]);
        const localData = await localResp.json();
        const favData = await favResp.json();
        state.localMusic = localData.music || [];
        state.favorites = favData.favorites || [];

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
            });
            seen.add(fav.id);
        }

        // 再加本地但未收藏的
        for (const s of state.localMusic) {
            if (!seen.has(s.id)) {
                all.push({ ...s, favorited: false });
                seen.add(s.id);
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

    try {
        const resp = await fetch('/api/music');
        const data = await resp.json();
        state.localMusic = data.music || [];

        if (!state.localMusic.length) {
            container.innerHTML = '<div class="empty-state"><p>本地还没有歌曲</p><p class="hint">搜索后点击 💾 下载</p></div>';
            return;
        }
        container.innerHTML = state.localMusic.map(song => buildSongItem(song)).join('');
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
            s.favorited = favIds.has(s.id);
        }

        if (!state.localMusic.length) {
            container.innerHTML = '<div class="empty-state"><p>还没有下载过歌曲</p><p class="hint">搜索歌曲后点击 💾 下载</p></div>';
            return;
        }
        container.innerHTML = state.localMusic.map(song => buildSongItem(song)).join('');
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

// ─── 构建歌曲项 HTML ────────────────────────────────────

function buildSongItem(song, options = {}) {
    const isPlaying = state.currentSong && state.currentSong.id === song.id;
    const playIcon = isPlaying && state.isPlaying ? ICON.pause : ICON.play;
    const dlClass = song.downloaded ? 'downloaded' : '';
    const dlIcon = song.downloaded ? ICON.downloadDone : ICON.download;
    const favClass = song.favorited ? 'favorited' : '';
    const favIcon = song.favorited ? ICON.heart : ICON.heartOutline;
    const removeFromPlaylistBtn = options.playlistId
        ? `<button class="remove-from-pl-btn" onclick="removeSongFromPlaylist('${options.playlistId}', '${song.id}')" title="从歌单移除">${ICON.minus}</button>`
        : '';
    const deleteBtn = `<button class="del-btn${song.downloaded ? '' : ' hidden'}" onclick="deleteLocalSong('${song.id}')" title="删除本地文件">${ICON.trash}</button>`;

    const playingClass = isPlaying ? 'playing-now' : '';
    return `
        <div class="song-item ${playingClass}" data-song-id="${song.id}">
            <div class="song-cover">${ICON.musicNote}</div>
            <div class="song-info">
                <div class="song-title">${escapeHtml(song.title || '未知歌曲')}</div>
                <div class="song-artist">${escapeHtml(song.artist || '未知歌手')}</div>
            </div>
            <div class="song-actions">
                <button class="play-btn-item ${isPlaying ? 'playing' : ''}" onclick="playSong('${song.id}')" title="播放">${playIcon}</button>
                <button class="fav-btn ${favClass}" onclick="toggleFavorite('${song.id}')" title="${song.favorited ? '取消收藏' : '收藏'}">${favIcon}</button>
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

// ─── 删除本地音乐 ──────────────────────────────────────

async function deleteLocalSong(songId) {
    // 找到歌曲信息用于显示
    const song = findSongInState(songId);
    const songName = song ? (song.title || '未知歌曲') : '这首歌';

    if (!confirm(`确定要删除本地文件「${songName}」吗？\n删除后如需再次播放需要重新下载。`)) {
        return;
    }

    // 需要找到文件名。先在收藏或本地音乐中查找
    let filename = '';
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

    try {
        const resp = await fetch(`/api/music/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
        });
        const data = await resp.json();
        if (data.success) {
            toast('已删除本地文件');
            // 刷新当前视图
            refreshCurrentTab();
            loadPlaylists();
        } else {
            toast(data.error || '删除失败', true);
        }
    } catch {
        toast('删除请求失败', true);
    }
}

// ─── 播放控制 ───────────────────────────────────────────

async function playSong(songId) {
    // 在当前所有歌曲列表中找这个歌曲
    let song = findSongInState(songId);
    if (!song) return toast('找不到歌曲信息', true);

    // 如果点击的是同一首歌，切换播放/暂停
    if (state.currentSong && state.currentSong.id === songId) {
        togglePlayPause();
        return;
    }

    state.currentSong = song;
    state.isPlaying = false;
    playBtn.innerHTML = ICON.play;

    // 构建播放 URL
    let audioUrl;
    if (song.downloaded && song.filename) {
        audioUrl = `/api/stream/${encodeURIComponent(song.filename)}`;
    } else if (song.url) {
        // 如果是 qeecc 搜索结果，先获取 MP3 链接再代理播放
        audioUrl = await getProxyUrl(song.url);
        if (!audioUrl) return;
    } else if (song.filename) {
        audioUrl = `/api/stream/${encodeURIComponent(song.filename)}`;
    } else {
        toast('无法播放此歌曲', true);
        return;
    }

    audio.src = audioUrl;
    audio.play().then(() => {
        state.isPlaying = true;
        playBtn.innerHTML = ICON.pause;
        equalizer.classList.remove('paused');
        playerBar.style.display = 'flex';
        playerTitle.textContent = song.title || '未知歌曲';
        playerArtist.textContent = song.artist || '未知歌手';
        updatePlayButtons();
        updateRangeFill(progressBar);
        savePlaybackState();
    }).catch(() => {
        toast('播放失败', true);
    });
}

function findSongInState(songId) {
    const sources = [
        ...state.searchResults,
        ...state.localMusic,
        ...state.favorites,
        ...state.queue,
    ];
    return sources.find(s => s.id === songId);
}

async function getProxyUrl(songUrl) {
    try {
        const resp = await fetch(`/api/song-info?url=${encodeURIComponent(songUrl)}`);
        const data = await resp.json();
        if (data.mp3_url) {
            return `/api/proxy-stream?url=${encodeURIComponent(data.mp3_url)}`;
        }
        if (data.error) toast(data.error, true);
        return null;
    } catch {
        toast('获取播放链接失败', true);
        return null;
    }
}

function togglePlayPause() {
    if (audio.paused) {
        audio.play();
        state.isPlaying = true;
        playBtn.innerHTML = ICON.pause;
        equalizer.classList.remove('paused');
    } else {
        audio.pause();
        state.isPlaying = false;
        playBtn.innerHTML = ICON.play;
        equalizer.classList.add('paused');
    }
    updatePlayButtons();
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
    // 根据播放模式处理
    if (state.playMode === 'repeat') {
        // 单曲循环：重播当前歌曲
        audio.currentTime = 0;
        audio.play().then(() => {
            state.isPlaying = true;
            playBtn.innerHTML = ICON.pause;
            updatePlayButtons();
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
    }
});

function seekAudio() {
    if (audio.duration) {
        audio.currentTime = (progressBar.value / 100) * audio.duration;
        currentTime.textContent = formatTime(audio.currentTime);
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
    audio.volume = volumeBar.value / 100;
    localStorage.setItem('music_volume', volumeBar.value);
    updateRangeFill(volumeBar, 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)');
});

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

async function downloadSong(songId) {
    const song = findSongInState(songId);
    if (!song) return toast('找不到歌曲', true);
    if (song.downloaded) return toast('已下载过了');

    if (!song.url) return toast('没有下载链接', true);

    toast('开始下载...');
    try {
        const resp = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: song.url,
                title: song.title,
            }),
        });
        const data = await resp.json();
        if (data.success) {
            toast('下载完成 ✅');
            song.downloaded = true;
            song.filename = data.filename;
            // 刷新页面状态
            refreshCurrentTab();
        } else {
            toast(data.error || '下载失败', true);
        }
    } catch {
        toast('下载请求失败', true);
    }
}

// ─── 收藏 ───────────────────────────────────────────────

async function toggleFavorite(songId) {
    const song = findSongInState(songId);
    if (!song) return toast('找不到歌曲', true);

    if (song.favorited) {
        try {
            await fetch('/api/favorites', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: songId }),
            });
            song.favorited = false;
            toast('已取消收藏');
        } catch {
            toast('操作失败', true);
        }
    } else {
        try {
            await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: songId,
                    title: song.title,
                    artist: song.artist,
                    url: song.url,
                    filename: song.filename || '',
                    downloaded: song.downloaded || false,
                }),
            });
            song.favorited = true;
            toast('已收藏 ♥');
        } catch {
            toast('操作失败', true);
        }
    }
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
    if (!confirm('确定要删除这个歌单吗？')) return;
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

    // 构建头部按钮（直接替换 header 内容）
    const header = document.querySelector('.playlist-detail-header');
    header.innerHTML = `
        <button class="back-btn" onclick="document.querySelector('.tab[data-tab=\\'playlists\\']').click()">← 返回</button>
        <h2>📁 ${escapeHtml(pl.name)}</h2>
        <span class="song-count">${pl.songs.length} 首</span>
        <button class="play-all-btn" onclick="playPlaylist('${pl.id}')">▶ 播放全部</button>
        <button class="add-song-btn" onclick="showAddSongToPlaylist('${pl.id}')">+ 添加歌曲</button>
        <button class="del-pl-btn" onclick="deletePlaylist('${pl.id}')">🗑 删除</button>
    `;

    const container = $('playlistDetailSongs');
    if (!pl.songs.length) {
        container.innerHTML = '<div class="empty-state"><p>歌单还没有歌曲</p><p class="hint">在歌曲上点击 📋 添加到歌单</p></div>';
        return;
    }

    // 从所有来源查找歌曲信息
    const allSongs = [...state.searchResults, ...state.localMusic, ...state.favorites];
    const detailSongs = pl.songs.map(songId => {
        return allSongs.find(s => s.id === songId) || { id: songId, title: '未知歌曲', artist: '未知歌手' };
    });

    container.innerHTML = detailSongs.map(song => buildSongItem(song, { playlistId: pl.id })).join('');
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

let addToPlSongId = null;

function showAddToPlaylist(songId) {
    addToPlSongId = songId;

    const overlay = document.createElement('div');
    overlay.className = 'add-to-pl-overlay';
    overlay.id = 'addToPlOverlay';

    let optionsHtml = state.playlists.map(pl =>
        `<div class="pl-option" onclick="addSongToPlaylist('${pl.id}')">📁 ${escapeHtml(pl.name)} (${pl.songs.length})</div>`
    ).join('');

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
    if (!addToPlSongId) return;

    try {
        const resp = await fetch(`/api/playlists/${plId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ add_song: addToPlSongId }),
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
                    <div class="pl-card-icon">📁</div>
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

    // 从所有来源收集歌曲信息
    const allSongs = [...state.searchResults, ...state.localMusic, ...state.favorites];
    const playlistSongs = pl.songs
        .map(songId => allSongs.find(s => s.id === songId))
        .filter(Boolean);

    if (!playlistSongs.length) return toast('歌单没有可播放的歌曲', true);

    // 设置播放队列
    state.queue = playlistSongs;
    state.queueIndex = 0;
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
    const song = data.currentSong;
    state.currentSong = song;
    playerBar.style.display = 'flex';
    playerTitle.textContent = song.title || '未知歌曲';
    playerArtist.textContent = song.artist || '未知歌手';
    equalizer.classList.add('paused');
    updatePlayButtons();

    // 构建播放 URL
    let audioUrl;
    if (song.downloaded && song.filename) {
        audioUrl = `/api/stream/${encodeURIComponent(song.filename)}`;
    } else if (song.url) {
        audioUrl = await getProxyUrl(song.url);
    } else if (song.filename) {
        audioUrl = `/api/stream/${encodeURIComponent(song.filename)}`;
    }
    if (!audioUrl) {
        localStorage.removeItem('music_playback');
        state.currentSong = null;
        return;
    }

    // 加载音频，恢复进度
    audio.src = audioUrl;
    const seekTime = data.currentTime || 0;
    const shouldPlay = data.wasPlaying;

    function onReady() {
        if (seekTime > 0.5 && seekTime < (audio.duration || Infinity)) {
            audio.currentTime = seekTime;
        }
        updateRangeFill(progressBar);
        if (shouldPlay) {
            audio.play().then(() => {
                state.isPlaying = true;
                playBtn.innerHTML = ICON.pause;
                equalizer.classList.remove('paused');
                updatePlayButtons();
            }).catch(() => {});
        }
    }

    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        onReady();
    } else {
        audio.addEventListener('loadedmetadata', onReady, { once: true });
    }
}

// ─── 初始化 ─────────────────────────────────────────────

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
        audio.volume = savedVol / 100;
    }
    updateRangeFill(volumeBar, 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.12)');
    await restorePlaybackState();
}

init();
