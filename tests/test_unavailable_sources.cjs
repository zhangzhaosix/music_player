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

test('confirmed unavailable version is hidden from views and queue without deleting library records or local files', () => {
    const bad = { id: 'bad', song_ref: 'one' };
    const favorite = { ...bad }, playlistSong = { ...bad };
    const good = { id: 'good', song_ref: 'two' };
    const local = { ...bad, filename: 'downloaded.mp3' };
    let now = 1000;
    const c = vm.createContext({
        Date: { now: () => now }, PLAYABLE_INFO_TTL_MS: 300000,
        state: { searchResults: [bad, good], favorites: [favorite, local], queue: [bad, good],
            currentSong: good, currentTab: 'favorites', playlists: [{ songs: [playlistSong] }], listFilters: {} },
        playbackState: { playableInfoCache: new Map([['one', {}], ['two', {}]]) },
        getSongIdentityKey: s => s.song_ref, getPlayableInfoKey: s => s.song_ref,
        renderSearchResults() {}, renderFavorites() {}, renderQueue() {}, renderPlaylistSongs() {},
        normalizeSearchText: s => s, getListFilterKey: () => 'favorites', $: () => ({ hidden: true }),
    });
    load(c, 'function hideUnavailableSong(', "listFilterInput.addEventListener");
    c.hideUnavailableSong(bad);
    assert.deepEqual(c.state.searchResults.map(s => s.id), ['good']);
    assert.deepEqual(c.state.queue.map(s => s.id), ['good']);
    assert.equal(c.state.queueIndex, 0);
    assert.equal(c.state.favorites.length, 2);
    assert.equal(c.state.playlists[0].songs.length, 1);
    assert.deepEqual(c.filterSongs(c.state.favorites), [local]);
    assert.equal(local.unavailable_until, undefined);
    assert.equal(c.playbackState.playableInfoCache.has('one'), false);
    now += 300001;
    assert.equal(c.filterSongs(c.state.favorites).length, 2);
});

function requestFixture(errorCode) {
    const hidden = [], messages = [];
    const c = vm.createContext({
        URLSearchParams, AbortSignal,
        getSongInfoReference: s => s.song_ref,
        hideUnavailableSong: song => hidden.push(song.id),
        toast: message => messages.push(message),
        fetch: async () => ({ ok: false, json: async () => ({ error: 'source failed', error_code: errorCode }) }),
    });
    load(c, 'async function fetchOnlineSongInfo(', 'function mergeSongInfo(');
    return { c, hidden, messages };
}

test('only confirmed playback failures hide rows; timeout and lyric failures remain retryable', async () => {
    const song = { id: 'one', song_ref: 'qjjlb://qq?mid=one' };
    const unavailable = requestFixture('source_unavailable');
    await unavailable.c.fetchOnlineSongInfo(song.song_ref, song, { playbackOnly: true });
    assert.deepEqual(unavailable.hidden, ['one']);
    assert.match(unavailable.messages[0], /已从列表隐藏/);
    const temporary = requestFixture('source_temporary');
    await temporary.c.fetchOnlineSongInfo(song.song_ref, song, { playbackOnly: true });
    assert.equal(temporary.hidden.length, 0);
    const lyric = requestFixture('source_unavailable');
    await lyric.c.fetchOnlineSongInfo(song.song_ref, song, { lyricsOnly: true });
    assert.equal(lyric.hidden.length, 0);
});

test('cancelled older playback cannot hide a song after a quick switch', async () => {
    const { c, hidden } = requestFixture('source_unavailable');
    const controller = new AbortController();
    controller.abort();
    await c.fetchOnlineSongInfo('qjjlb://qq?mid=one', { id: 'one' }, {
        playbackOnly: true, signal: controller.signal, silent: true,
    });
    assert.equal(hidden.length, 0);
});


test('hiding a failed recording does not hide an available reference sharing its display id', () => {
    const failed = { id: 'same', song_ref: 'failed' };
    const available = { id: 'same', song_ref: 'available' };
    const c = vm.createContext({
        Date, PLAYABLE_INFO_TTL_MS: 300000,
        state: { searchResults: [failed, available], favorites: [], queue: [], playlists: [], currentTab: 'queue' },
        playbackState: { playableInfoCache: new Map() },
        getSongIdentityKey: s => s.song_ref, getPlayableInfoKey: s => s.song_ref,
        renderSearchResults() {}, renderQueue() {},
    });
    load(c, 'function hideUnavailableSong(', 'function filterSongs(');
    c.hideUnavailableSong(failed);
    assert.deepEqual(c.state.searchResults, [available]);
});
