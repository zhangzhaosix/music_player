const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../code/frontend/static/app.js'), 'utf8');
function load(c, start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from);
    vm.runInContext(source.slice(from, to), c);
}

test('stream decoder handles split UTF-8 characters and a final line without newline', async () => {
    const c = vm.createContext({ TextDecoder });
    load(c, 'async function readSearchStream(', 'async function doSearch(');
    const bytes = new TextEncoder().encode('{"results":[{"title":"晴天"}],"done":false}\n{"results":[],"done":true}');
    const stream = new ReadableStream({ start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 2) controller.enqueue(bytes.slice(offset, offset + 2));
        controller.close();
    } });
    const snapshots = [];
    await c.readSearchStream(new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } }), value => snapshots.push(value));
    assert.equal(snapshots[0].results[0].title, '晴天');
    assert.equal(snapshots[1].done, true);
});

test('cancelled search response cannot replace newer results or switch the right-hand tab', async () => {
    const pending = [];
    const c = vm.createContext({
        AbortController, AbortSignal, TextDecoder, URLSearchParams, SEARCH_SOURCE_LIMIT: 20,
        state: { currentTab: 'favorites', searchResults: [], lastSearchKeyword: '', pendingKeyword: '' },
        searchInput: { value: 'a' }, toast() {}, syncCachedSongFlags() {},
        renderSearchResults() {}, setSearchLoading(value) { c.state.isSearching = value; },
        syncSearchPreview() {}, rankSearchResults: songs => songs,
        fetch: () => new Promise(resolve => pending.push(resolve)),
    });
    load(c, 'async function readSearchStream(', 'function syncSearchPreview(');
    const a = c.doSearch();
    const oldController = c.state.searchController;
    c.searchInput.value = 'b';
    const b = c.doSearch();
    assert.equal(oldController.signal.aborted, true);
    pending[1]({ ok: true, body: null, json: async () => ({ results: [{ id: 'new' }] }) });
    await b;
    pending[0]({ ok: true, body: null, json: async () => ({ results: [{ id: 'old' }] }) });
    await a;
    assert.equal(c.state.searchResults[0].id, 'new');
    assert.equal(c.state.currentTab, 'favorites');
});

test('timeout keeps already received playable results and offers a retryable state', async () => {
    const c = vm.createContext({
        AbortController, AbortSignal, URLSearchParams, SEARCH_SOURCE_LIMIT: 20,
        state: { currentTab: 'queue', searchResults: [], lastSearchKeyword: '' }, searchInput: { value: 'song' },
        toast() {}, syncCachedSongFlags() {}, syncSearchPreview() {},
        setSearchLoading(value) { c.state.isSearching = value; }, rankSearchResults: songs => songs,
        fetch: async () => ({ ok: true }),
    });
    load(c, 'async function doSearch(', 'function syncSearchPreview(');
    c.readSearchStream = async (response, snapshot) => {
        snapshot({ results: [{ id: 'good' }], done: false });
        const error = new Error('timeout'); error.name = 'TimeoutError'; throw error;
    };
    await c.doSearch();
    assert.equal(c.state.searchResults[0].id, 'good');
    assert.match(c.state.searchError, /超时/);
    assert.equal(c.state.isSearching, false);
});

test('left search click captures its own queue while the right-hand library stays unchanged', () => {
    const c = vm.createContext({
        state: { currentTab: 'favorites', searchResults: [{ id: 'a' }, { id: 'b' }], queue: [], playHistory: [], favorites: [{ id: 'f' }] },
        filterSongs: songs => songs, renderQueue() {},
    });
    load(c, 'function syncQueueForSong(', 'async function getProxyUrl(');
    assert.equal(c.syncQueueForSong('b', { fromSearch: true }), true);
    c.state.searchResults.push({ id: 'later' });
    assert.equal(c.state.queue.length, 2);
    assert.equal(c.state.queueIndex, 1);
    assert.equal(c.state.currentTab, 'favorites');
});

test('a real short song and missing duration are not inferred to be previews', () => {
    const c = vm.createContext({});
    load(c, 'function isIncompleteAudio(', "audio.addEventListener('loadedmetadata'");
    assert.equal(c.isIncompleteAudio({ expected_duration: 30 }, 30), false);
    assert.equal(c.isIncompleteAudio({}, 30), false);
    assert.equal(c.isIncompleteAudio({ expected_duration: 200 }, 30), true);
    assert.equal(c.isIncompleteAudio({ is_preview: true }, NaN), true);
});


test('a later search snapshot cannot reintroduce a recording already confirmed unplayable', async () => {
    const c = vm.createContext({
        AbortController, AbortSignal, TextDecoder, URLSearchParams, SEARCH_SOURCE_LIMIT: 20,
        state: { unavailableSources: new Map([['failed', Date.now() + 10000]]), searchResults: [], listFilters: {} },
        searchInput: { value: 'song' }, toast() {}, syncCachedSongFlags() {}, renderSearchResults() {},
        setSearchLoading() {}, syncSearchPreview() {}, rankSearchResults: songs => songs,
        getSongIdentityKey: song => song.song_ref,
        fetch: async () => new Response(JSON.stringify({ results: [
            { id: 'bad', song_ref: 'failed' }, { id: 'good', song_ref: 'available' },
        ], done: true }), { headers: { 'content-type': 'application/json' } }),
    });
    load(c, 'async function readSearchStream(', 'function syncSearchPreview(');
    await c.doSearch();
    assert.equal(c.state.searchResults.length, 1);
    assert.equal(c.state.searchResults[0].id, 'good');
});
