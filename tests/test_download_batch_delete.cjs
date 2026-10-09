const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../code/frontend/static/app.js'), 'utf8');

function load(c, start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from);
    vm.runInContext(source.slice(from, to), c);
}

function element() {
    const classes = new Set();
    return {
        hidden: false, disabled: false, textContent: '', attributes: {},
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
        setAttribute(name, value) { this.attributes[name] = value; },
        append(child) { child.parentElement = this; },
    };
}

function fixture() {
    const nodes = new Map();
    const $ = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
    const requests = [], messages = [];
    const c = vm.createContext({
        $, AbortSignal, URL,
        state: { currentTab: 'downloads', localMusic: ['a', 'b', 'c'].map(id => ({ id, filename: `${id}.mp3`, title: id })),
            favorites: [], listFilters: {}, selectedSongIds: new Set(['a', 'b']), isBatchMode: true, isDeletingDownloads: false },
        SONG_LIST_TABS: new Set(['downloads', 'favorites', 'search']),
        getVisibleSongIds: () => ['a', 'b', 'c'], filterSongs: songs => songs,
        updateBatchSelectionUI() {}, syncBatchToolbar() {}, renderDownloads() {},
        showDeleteConfirm: async () => true,
        deleteLocalSongSilently: async (id, filename) => { requests.push(filename); return true; },
        syncSongRemovedFromCaches() {}, loadFavorites: async () => {}, loadDownloads: async () => true,
        loadPlaylists: async () => {}, refreshCurrentTab: async () => {},
        toast: message => messages.push(message),
    });
    c.requests = requests; c.messages = messages;
    load(c, 'async function batchDeleteLocalSongs()', '// ─── 我的歌单标签页');
    return c;
}

test('cancel leaves music and selection unchanged and sends no deletion request', async () => {
    const c = fixture();
    c.showDeleteConfirm = async () => false;
    await c.batchDeleteLocalSongs();
    assert.equal(c.requests.length, 0);
    assert.equal(c.state.localMusic.length, 3);
    assert.deepEqual(Array.from(c.state.selectedSongIds), ['a', 'b']);
    assert.equal(c.state.isDeletingDownloads, false);
});

test('only selected local files are deleted, once per filename, even if cache flags mutate', async () => {
    const c = fixture();
    c.state.localMusic.push({ id: 'alias', filename: 'a.mp3' }, { id: 'online' });
    c.state.selectedSongIds = new Set(['a', 'b', 'alias', 'online', 'unknown']);
    c.syncSongRemovedFromCaches = () => { for (const song of c.state.localMusic) song.downloaded = false; };
    await c.batchDeleteLocalSongs();
    assert.deepEqual(c.requests, ['a.mp3', 'b.mp3']);
    assert.deepEqual(Array.from(c.state.localMusic, song => song.id), ['c', 'online']);
    assert.equal(c.state.selectedSongIds.size, 0);
    assert.equal(c.state.isBatchMode, false);
    assert.match(c.$('downloadDeleteResult').textContent, /已删除 2 首/);
});

test('one failure does not stop later files; only failures remain selected for retry', async () => {
    const c = fixture();
    c.state.selectedSongIds.add('c');
    c.deleteLocalSongSilently = async (id, filename) => {
        c.requests.push(filename);
        if (id === 'b') throw new Error('文件被占用');
        return true;
    };
    c.loadDownloads = async () => false;
    await c.batchDeleteLocalSongs();
    assert.deepEqual(c.requests, ['a.mp3', 'b.mp3', 'c.mp3']);
    assert.deepEqual(Array.from(c.state.selectedSongIds), ['b']);
    assert.equal(c.state.localMusic.length, 1);
    assert.equal(c.state.isBatchMode, true);
    assert.equal(c.$('downloadDeleteResult').hidden, false);
    assert.match(c.$('downloadDeleteResult').textContent, /已删除 2 首，1 首失败\nb：文件被占用/);
    assert.match(c.$('downloadDeleteResult').textContent, /列表刷新失败/);
    c.deleteLocalSongSilently = async (id, filename) => { c.requests.push(filename); return true; };
    await c.batchDeleteLocalSongs();
    assert.deepEqual(c.requests, ['a.mp3', 'b.mp3', 'c.mp3', 'b.mp3']);
});

test('duplicate submissions are blocked while confirming and while deleting', async () => {
    const c = fixture();
    let confirm, complete, confirmations = 0;
    c.showDeleteConfirm = () => { confirmations++; return new Promise(resolve => { confirm = resolve; }); };
    c.deleteLocalSongSilently = (id, filename) => {
        c.requests.push(filename);
        return new Promise(resolve => { complete = resolve; });
    };
    c.state.selectedSongIds = new Set(['a']);
    const first = c.batchDeleteLocalSongs();
    await c.batchDeleteLocalSongs();
    assert.equal(confirmations, 1);
    confirm(true);
    await new Promise(setImmediate);
    await c.batchDeleteLocalSongs();
    assert.deepEqual(c.requests, ['a.mp3']);
    complete(true);
    await first;
    assert.equal(c.state.isDeletingDownloads, false);
});

test('deleting one version does not clear the filename of a failed version with the same title', async () => {
    const c = fixture();
    c.state.localMusic = [
        { id: 'a', filename: 'a.mp3', title: '同一首歌', artist: '同一歌手' },
        { id: 'b', filename: 'b.mp3', title: '同一首歌', artist: '同一歌手' },
    ];
    c.state.searchResults = []; c.state.queue = [];
    c.sameSongIdentity = (a, b) => a === b;
    load(c, 'function syncSongRemovedFromCaches(', 'async function batchFavoriteSongs');
    c.deleteLocalSongSilently = async id => {
        if (id === 'b') throw new Error('占用');
        return true;
    };
    c.loadDownloads = async () => false;
    await c.batchDeleteLocalSongs();
    assert.equal(c.state.localMusic[0].filename, 'b.mp3');
    assert.deepEqual(Array.from(c.state.selectedSongIds), ['b']);
});

test('switching tabs during deletion does not alter the new tab selection', async () => {
    const c = fixture();
    c.deleteLocalSongSilently = async () => {
        c.state.currentTab = 'favorites';
        c.state.selectedSongIds.clear();
        c.state.isBatchMode = false;
        return true;
    };
    let refreshed = 0;
    c.refreshCurrentTab = async () => { refreshed++; };
    await c.batchDeleteLocalSongs();
    assert.equal(refreshed, 1);
    assert.equal(c.state.selectedSongIds.size, 0);
    assert.equal(c.state.isDeletingDownloads, false);
});

test('select all uses the filtered list and discards hidden selections; busy state blocks changes', () => {
    const c = fixture();
    load(c, 'function toggleSongSelection(', 'function showBatchAddToPlaylist');
    c.getVisibleSongIds = () => ['c'];
    c.selectAllCurrentPage();
    assert.deepEqual(Array.from(c.state.selectedSongIds), ['c']);
    c.state.isDeletingDownloads = true;
    c.toggleSongSelection('a');
    c.getVisibleSongIds = () => ['b'];
    c.selectAllCurrentPage();
    assert.deepEqual(Array.from(c.state.selectedSongIds), ['c']);
});

test('changing the download filter clears selection before rendering', () => {
    const c = fixture();
    let onInput, renders = 0;
    c.listFilterInput = { value: '歌手', addEventListener: (event, fn) => { onInput = fn; } };
    c.getListFilterKey = () => 'downloads';
    c.renderDownloads = () => { renders++; assert.equal(c.state.selectedSongIds.size, 0); };
    load(c, "listFilterInput.addEventListener('input'", 'function rankSearchResults');
    onInput();
    assert.equal(renders, 1);
    assert.equal(c.state.listFilters.downloads, '歌手');
});

test('the single toolbar moves between tab hosts with deletion-only controls and busy guards', () => {
    const c = fixture();
    for (const name of ['batchToolbar', 'libraryPanel', 'batchCount', 'batchCancelBtn', 'batchPlaylistBtn', 'batchDownloadBtn', 'batchSelectAllBtn', 'listFilterInput']) c[name] = c.$(name);
    c.batchFavoriteBtn = null;
    load(c, 'function syncBatchToolbar()', 'function clearBatchSelection');
    c.syncBatchToolbar();
    assert.equal(c.batchToolbar.parentElement, c.$('downloadsBatchHost'));
    assert.equal(c.batchToolbar.classList.contains('hidden'), false);
    assert.equal(c.batchPlaylistBtn.hidden, true);
    assert.equal(c.batchDownloadBtn.textContent, '删除选中');
    c.state.isDeletingDownloads = true;
    c.syncBatchToolbar();
    assert.equal(c.batchDownloadBtn.disabled, true);
    assert.equal(c.batchSelectAllBtn.disabled, true);
    assert.equal(c.listFilterInput.disabled, true);
    c.state.isDeletingDownloads = false;
    c.state.currentTab = 'favorites';
    c.syncBatchToolbar();
    assert.equal(c.batchToolbar.parentElement, c.$('favoritesBatchHost'));
    assert.equal(c.batchPlaylistBtn.hidden, false);
    assert.equal(c.batchDownloadBtn.textContent, '本地下载');
    assert.equal(c.batchDownloadBtn.classList.contains('danger'), false);
});

test('download rows expose selection controls and synchronize selection after rendering', () => {
    const c = fixture();
    let built = 0, updated = 0;
    c.buildSongItem = (song, options) => { assert.equal(options?.hideSelectBtn, undefined); built++; return song.id; };
    c.updateBatchSelectionUI = () => { updated++; };
    load(c, 'function renderDownloads()', '// ─── 构建歌曲项');
    c.renderDownloads();
    assert.equal(built, 3);
    assert.equal(updated, 1);
});

test('deleting the playing local file releases audio first and rejects HTTP errors', async () => {
    const c = fixture(), events = [];
    c.state.currentSong = { id: 'a', filename: 'a.mp3' };
    c.playbackState = { playToken: 0 };
    c.audio = { pause: () => events.push('pause'), removeAttribute() {}, load: () => events.push('release') };
    c.playBtn = {}; c.ICON = { play: 'play' }; c.equalizer = { classList: { add() {} } };
    c.updatePlayButtons = () => {}; c.syncImmersivePlayerUI = () => {};
    c.fetch = async (url, options) => {
        events.push('delete');
        assert.equal(options.method, 'DELETE');
        assert.equal(url, '/api/music/a.mp3');
        assert.equal(c.state.currentSong, null);
        return { ok: false, json: async () => ({ error: '无法删除文件' }) };
    };
    load(c, 'async function fetchJSON(', 'function closeDeleteConfirm');
    load(c, 'function releaseAudioIfDeletingFile(', '// ─── 删除本地音乐');
    load(c, 'async function deleteLocalSongSilently(', 'function clamp');
    await assert.rejects(c.deleteLocalSongSilently('a', 'a.mp3'), /无法删除文件/);
    assert.deepEqual(events, ['pause', 'release', 'delete']);
    assert.equal(c.playbackState.playToken, 1);
    c.state.currentSong = { filename: 'other.mp3' };
    c.releaseAudioIfDeletingFile('a.mp3');
    assert.equal(c.state.currentSong.filename, 'other.mp3');
    assert.equal(events.length, 3);
});

test('a background download refresh does not replace the active tab filter count', async () => {
    const c = fixture();
    c.state.currentTab = 'favorites';
    c.fetchJSON = async () => ({});
    c.findFavoriteForSong = () => false;
    c.renderDownloads = () => { throw new Error('must not render the inactive tab'); };
    load(c, 'async function loadDownloads()', 'function renderDownloads');
    assert.equal(await c.loadDownloads(), true);
});
