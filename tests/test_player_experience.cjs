const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../code/frontend/static/app.js'), 'utf8');

function load(context, start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from);
    vm.runInContext(source.slice(from, to), context);
}

function playerFixture() {
    const songs = ['a', 'b', 'c'].map(id => ({ id, title: id, url: `/${id}.mp3` }));
    const c = vm.createContext({
        AbortController, AbortSignal, clearTimeout,
        state: { queue: songs, queueIndex: 0, currentSong: songs[0], isPlaying: true, isLoading: false, playMode: 'shuffle', playHistory: [] },
        playbackState: { playToken: 0, playableInfoCache: new Map() },
        audio: { paused: false, currentTime: 37, pause() { this.paused = true; }, removeAttribute() {}, load() {} },
        progressBar: {}, currentTime: {}, totalTime: {}, playBtn: {}, playerTitle: {}, playerArtist: {},
        ICON: { play: 'play' }, equalizer: { classList: { add() {} } },
        Math: { floor: Math.floor, random: () => 0 },
        resolvePlayableSong: id => songs.find(song => song.id === id),
        syncQueueForSong() {}, clearSeekFeedback() {}, updateRangeFill() {},
        syncImmersivePlayerUI() {}, updatePlayButtons() {}, toast() {},
        hasRealLyrics: () => true, mergeSongInfo: (song, info) => ({ ...song, ...info }),
        loadOnlineSongInfo: async song => ({ song, audioUrl: song.url }),
        hydrateCurrentSongDetails() {}, prefetchNextSong() {}, getPlayableInfoKey: song => song.id,
    });
    c.startPlaybackWithLeveling = async options => { c.started = options; c.audio.paused = false; c.state.isPlaying = true; return true; };
    load(c, 'async function playSong(', 'function findSongInState');
    load(c, 'function stepQueue(', "prevBtn.addEventListener('click'");
    load(c, 'function setPlaybackError(', "$('retryPlaybackBtn').addEventListener");
    return c;
}
const flush = () => new Promise(setImmediate);

test('random next excludes the current song and previous returns the actual history', async () => {
    const c = playerFixture();
    c.stepQueue(1);
    await flush();
    assert.equal(c.state.currentSong.id, 'b');
    assert.equal(c.audio.paused, false);
    assert.deepEqual(Array.from(c.state.playHistory), ['a']);
    c.stepQueue(-1);
    await flush();
    assert.equal(c.state.currentSong.id, 'a');
    assert.equal(c.state.playHistory.length, 0);
});

test('next in a one-song queue restarts instead of toggling pause', async () => {
    const c = playerFixture();
    c.state.queue = [c.state.currentSong];
    c.stepQueue(1);
    await flush();
    assert.equal(c.audio.paused, false);
    assert.equal(c.started.seekTime, 0);
});

test('switching songs aborts an older playback request and discards its response', async () => {
    const c = playerFixture();
    const pending = [];
    c.loadOnlineSongInfo = (song, options) => new Promise(resolve => pending.push({ song, options, resolve }));
    const first = c.playSong('b', { keepQueue: true });
    const second = c.playSong('c', { keepQueue: true });
    assert.equal(pending[0].options.signal.aborted, true);
    pending[1].resolve({ song: pending[1].song, audioUrl: '/c.mp3' });
    await second;
    pending[0].resolve({ song: pending[0].song, audioUrl: '/b.mp3' });
    await first;
    assert.equal(c.state.currentSong.id, 'c');
    assert.equal(c.started.audioUrl, '/c.mp3');
});

test('failure stops misleading playing state and retry retains the listening position', async () => {
    const c = playerFixture();
    c.setPlaybackError('disconnected');
    assert.equal(c.audio.paused, true);
    assert.equal(c.state.isPlaying, false);
    assert.equal(c.state.playbackError, 'disconnected');
    c.retryCurrentPlayback();
    await flush();
    assert.equal(c.started.seekTime, 37);
    assert.equal(c.state.playbackError, '');
    assert.equal(c.state.currentSong.id, 'a');
});

test('restoring a previously playing tab keeps its progress but does not autoplay', async () => {
    const c = playerFixture();
    const saved = { currentSong: c.state.currentSong, currentTime: 28, wasPlaying: true, playMode: 'shuffle', queue: c.state.queue, queueIndex: 0 };
    c.localStorage = { getItem: () => JSON.stringify(saved) };
    c.playerTitle = {}; c.playerArtist = {}; c.isBlockedSongText = () => false;
    load(c, 'async function restorePlaybackState(', '// ─── 初始化');
    await c.restorePlaybackState();
    assert.equal(c.started.shouldPlay, false);
    assert.equal(c.started.seekTime, 28);
});

test('a failed restore retains the saved song and progress for retry', async () => {
    const c = playerFixture();
    c.localStorage = { getItem: () => JSON.stringify({ currentSong: c.state.currentSong, currentTime: 28 }) };
    c.playerTitle = {}; c.playerArtist = {}; c.isBlockedSongText = () => false;
    c.loadOnlineSongInfo = async () => null;
    load(c, 'async function restorePlaybackState(', '// ─── 初始化');
    await c.restorePlaybackState();
    assert.equal(c.state.currentSong.id, 'a');
    assert.equal(c.state.resumeTime, 28);
    assert.ok(c.state.playbackError);
    c.audio.currentTime = 0;
    c.localStorage.setItem = (_key, value) => { c.savedAgain = JSON.parse(value); };
    load(c, 'function savePlaybackState(', '// 页面关闭/刷新前保存');
    c.savePlaybackState();
    assert.equal(c.savedAgain.currentTime, 28);
});

test('a stalled initial audio play times out and pauses the pending media request', async () => {
    const c = playerFixture();
    c.state.currentSong = c.state.queue[0];
    c.window = { setTimeout: fn => setTimeout(fn, 1) };
    c.audio.play = () => new Promise(() => {});
    load(c, 'async function startAudioPlayback(', 'async function analyzeTrackGain');
    const started = await c.startAudioPlayback({ song: c.state.currentSong, shouldPlay: true, seekTime: 0, playToken: 0 });
    assert.equal(started, false);
    assert.equal(c.audio.paused, true);
});

test('exact song titles rank above covers and artist-only matches', () => {
    const c = vm.createContext({});
    load(c, 'function normalizeSearchText(', 'function filterSongs(');
    load(c, 'function rankSearchResults(', "\ndocument.querySelectorAll('.tab').forEach");
    const result = c.rankSearchResults([
        { title: '晴天 (钢琴版)', artist: 'Pianist' },
        { title: '其他歌曲', artist: '晴天' },
        { title: '晴天', artist: 'Jay' },
    ], '晴天');
    assert.equal(result[0].artist, 'Jay');
    assert.equal(result[1].artist, 'Pianist');
    const combined = c.rankSearchResults([
        { title: '晴天 (原唱 周杰伦)', artist: 'Cover' },
        { title: '晴天', artist: 'Jay' },
        { title: '晴天', artist: '周杰伦' },
    ], '晴天 周杰伦');
    assert.equal(combined[0].artist, '周杰伦');
    assert.equal(combined[1].artist, 'Jay');
});

test('local filtering matches combined title and artist without fetching online', () => {
    const nodes = { listFilterBar: { hidden: false }, listFilterCount: {} };
    const c = vm.createContext({ state: { currentTab: 'favorites', listFilters: { favorites: '小宇 张震岳' } }, $: id => nodes[id] });
    load(c, 'function getListFilterKey(', "listFilterInput.addEventListener");
    const result = c.filterSongs([{ title: '小宇', artist: '张震岳' }, { title: '小宇', artist: '蓝心羽' }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].artist, '张震岳');
    assert.equal(nodes.listFilterCount.textContent, '1 / 2 首');
});

test('playlist picker excludes existing object-format songs', async () => {
    let overlay;
    const c = vm.createContext({
        state: { favorites: [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }], playlists: [{ id: 'pl', name: 'Playlist', songs: [{ id: 'one' }] }] },
        normalizePlaylistSong: song => typeof song === 'object' ? song : { id: song },
        document: { createElement: () => ({ addEventListener() {} }), body: { appendChild: node => { overlay = node; } } },
        escapeHtml: text => text || '', focusDialog() {}, toast() {},
    });
    load(c, 'async function showAddSongToPlaylist(', '// ─── 刷新当前标签页');
    await c.showAddSongToPlaylist('pl');
    assert.equal(overlay.innerHTML.includes('value="one"'), false);
    assert.equal(overlay.innerHTML.includes('value="two"'), true);
});

test('HTTP and application errors cannot masquerade as a successful operation', async () => {
    const c = vm.createContext({ AbortSignal, fetch: async () => ({ ok: false, json: async () => ({ error: 'save failed' }) }) });
    load(c, 'async function fetchJSON(', 'function closeDeleteConfirm(');
    await assert.rejects(c.fetchJSON('/test'), /save failed/);
    c.fetch = async () => ({ ok: true, json: async () => ({ success: false }) });
    await assert.rejects(c.fetchJSON('/test'), /请求失败/);
});

test('untimed lyrics do not simulate synchronized highlighting', () => {
    const c = vm.createContext({ lyricsList: {}, state: { lyricLines: [{}], timedLyrics: [], currentLyricIndex: -1 }, audio: { currentTime: 30, duration: 60 } });
    load(c, 'function syncLyricHighlight(', 'function syncImmersivePlayerUI(');
    c.syncLyricHighlight();
    assert.equal(c.state.currentLyricIndex, -1);
});
