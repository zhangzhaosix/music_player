const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../code/frontend/static/app.js'), 'utf8');

test('only a failed search checks for recovery and clears its error', async () => {
    const from = source.indexOf('async function updateGDServerStatus(');
    const to = source.indexOf('function renderSearchResults(', from);
    let result = true;
    let requests = 0;
    let renders = 0;
    const state = {
        searchError: '', searchSourceErrors: {}, searchResults: [], searchController: {},
        lastSearchKeyword: 'Song',
    };
    const c = vm.createContext({
        fetch: async () => {
            requests++;
            return { ok: true, json: async () => ({ server_error: result }) };
        },
        AbortSignal, state, syncSearchPreview() { renders++; },
    });
    vm.runInContext(source.slice(from, to), c);
    await c.updateGDServerStatus();
    assert.equal(requests, 0);
    const message = 'GD 音乐台搜索服务暂时不可用，请稍后重试。';
    state.searchSourceErrors.netease = message;
    await c.updateGDServerStatus();
    assert.equal(state.searchSourceErrors.netease, message);
    result = false;
    await c.updateGDServerStatus();
    assert.equal(renders, 1);
    assert.deepEqual(state.searchSourceErrors, {});
    assert.equal(state.lastSearchKeyword, '');
    await c.updateGDServerStatus();
    assert.equal(requests, 2);
});

test('a restricted source stops automatic playback recovery', () => {
    const from = source.indexOf('function setPlaybackError(');
    const to = source.indexOf('function retryCurrentPlayback(', from);
    let cancelled = 0, retried = 0;
    const c = vm.createContext({
        clearTimeout() {}, playbackState: { sourceErrorCode: 'source_restricted', sourceMessage: 'GD 音乐台拒绝访问', bufferingTimer: null },
        state: {}, audio: { pause() {} }, playBtn: {}, ICON: { play: '' },
        equalizer: { classList: { add() {} } }, updatePlayButtons() {}, syncImmersivePlayerUI() {},
        cancelAutomaticPlayback() { cancelled++; }, scheduleAutomaticPlaybackRetry() { retried++; },
    });
    vm.runInContext(source.slice(from, to), c);
    c.setPlaybackError('播放失败');
    assert.equal(cancelled, 1);
    assert.equal(retried, 0);
    assert.equal(c.state.playbackError, 'GD 音乐台拒绝访问');
});

test('restored queue retains covers and streaming restrictions', () => {
    const from = source.indexOf('function savePlaybackState(');
    const to = source.indexOf('// 页面关闭/刷新前保存', from);
    const song = { id: '1', cover_url: '/api/gd-cover/123', stream_only: true, download_allowed: false };
    let saved;
    const c = vm.createContext({
        state: { currentSong: song, queue: [song], queueIndex: 0, isPlaying: false, playMode: 'sequence' },
        localStorage: { setItem(_key, value) { saved = JSON.parse(value); } },
        audio: { currentTime: 0 },
    });
    vm.runInContext(source.slice(from, to), c);
    c.savePlaybackState();
    assert.equal(saved.currentSong.cover_url, song.cover_url);
    assert.equal(saved.queue[0].stream_only, true);
    assert.equal(saved.currentSong.download_allowed, false);
});

test('updating play icons preserves song cover images', () => {
    const from = source.indexOf('function updatePlayButtons(');
    const to = source.indexOf('// ─── 下载', from);
    const icon = { setAttribute(name, value) { this[name] = value; } };
    const image = { src: '/api/gd-cover/123' };
    const button = {
        classList: { toggle() {} }, querySelector: () => icon,
        closest: () => ({
            dataset: { songId: 'test' }, classList: { toggle() {} },
            querySelector: selector => selector === '.song-title' ? { textContent: 'Song' } : { setAttribute() {} },
        }),
        setAttribute() {}, image,
    };
    Object.defineProperty(button, 'innerHTML', { set() { throw new Error('cover was replaced'); } });
    const c = vm.createContext({
        document: { querySelectorAll(selector) { return selector === '.play-btn-item' ? [button] : []; } },
        state: { currentSong: null, queue: [] }, $: () => ({}), ICON_SPRITE: '/static/player-icons.svg',
    });
    vm.runInContext(source.slice(from, to), c);
    c.updatePlayButtons();
    assert.equal(icon.href, '/static/player-icons.svg#play');
    assert.equal(button.image, image);
});

test('locate button follows the current song after the first search queue is created', () => {
    const song = { id: 'first', title: 'First' };
    const nodes = { queueSummary: {}, locatePlayingBtn: {}, queueSongs: {} };
    const state = { currentTab: 'queue', currentSong: null, queue: [], searchResults: [song], playHistory: [] };
    const c = vm.createContext({
        state, $: id => nodes[id], playModeBtn: { title: '列表循环' },
        document: { querySelectorAll: () => [] }, buildSongItem: () => '', ICON: {},
        replaceSongRows(container, html) { container.innerHTML = html; },
    });
    vm.runInContext(source.slice(source.indexOf('function renderQueue('), source.indexOf('function pauseLyricFollow(')), c);
    vm.runInContext(source.slice(source.indexOf('function syncQueueForSong('), source.indexOf('function getAudioUrl(')), c);
    const from = source.indexOf('function updatePlayButtons(');
    vm.runInContext(source.slice(from, source.indexOf('// ─── 下载', from)), c);

    c.renderQueue();
    assert.equal(nodes.locatePlayingBtn.disabled, true);
    c.syncQueueForSong(song.id, { fromSearch: true });
    assert.equal(nodes.locatePlayingBtn.disabled, true);
    state.currentSong = song;
    c.updatePlayButtons();
    assert.equal(nodes.locatePlayingBtn.disabled, false);
    state.isPlaying = true;
    c.updatePlayButtons();
    assert.equal(nodes.locatePlayingBtn.disabled, false);
    state.currentSong = null;
    c.updatePlayButtons();
    assert.equal(nodes.locatePlayingBtn.disabled, true);
    state.currentSong = song;
    state.queue = [];
    c.updatePlayButtons();
    assert.equal(nodes.locatePlayingBtn.disabled, true);
});
