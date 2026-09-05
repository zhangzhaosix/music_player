const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../code/frontend/static/app.js'), 'utf8');
const functions = source.slice(source.indexOf('async function hydrateCurrentSongDetails'), source.indexOf('async function prefetchNextSong'));
const merge = source.slice(source.indexOf('function mergeSongInfo'), source.indexOf('async function loadOnlineSongInfo'));

function fixture(fetchInfo) {
    const song = { id: 'one', title: 'Song', url: 'qjjlb://qq?mid=one', lyrics: [], lyrics_status: 'loading' };
    const context = vm.createContext({
        AbortController, AbortSignal,
        state: { currentSong: song },
        playbackState: { playToken: 1, detailController: null },
        fetchOnlineSongInfo: fetchInfo,
        getSongInfoReference: s => s.url,
        hasRealLyrics: s => Boolean(s?.lyrics?.some(line => line.text)),
        isBlockedSongText: () => false,
        syncImmersivePlayerUI() {}, savePlaybackState() {},
        audio: new Proxy({}, { get() { throw new Error('lyrics must not touch audio'); } }),
    });
    vm.runInContext(merge + functions, context);
    return context;
}

test('transient failure retries once and displays recovered lyrics without touching audio', async () => {
    let requests = 0;
    const c = fixture(async (url, song, options) => {
        assert.equal(options.lyricsOnly, true);
        return ++requests === 1 ? null : { lyrics_status: 'ok', lyrics: [{ time: 1, text: 'recovered' }] };
    });
    await c.hydrateCurrentSongDetails(c.state.currentSong, 1);
    assert.equal(requests, 2);
    assert.equal(c.state.currentSong.lyrics_status, 'ok');
    assert.equal(c.state.currentSong.lyrics[0].text, 'recovered');
});

test('persistent failure exits loading and offers a retryable state', async () => {
    let requests = 0;
    const c = fixture(async () => { requests++; return null; });
    await c.hydrateCurrentSongDetails(c.state.currentSong, 1);
    assert.equal(requests, 2);
    assert.equal(c.state.currentSong.lyrics_status, 'source_error');
});

test('missing lyrics are not repeatedly requested', async () => {
    let requests = 0;
    const c = fixture(async () => { requests++; return { lyrics: [], lyrics_status: 'not_found' }; });
    await c.hydrateCurrentSongDetails(c.state.currentSong, 1);
    assert.equal(requests, 1);
    assert.equal(c.state.currentSong.lyrics_status, 'not_found');
});

test('switching songs discards an earlier lyric response and its retry', async () => {
    let resolve;
    let requests = 0;
    const c = fixture(() => { requests++; return new Promise(r => { resolve = r; }); });
    const pending = c.hydrateCurrentSongDetails(c.state.currentSong, 1);
    c.state.currentSong = { id: 'two', lyrics_status: 'loading', lyrics: [] };
    c.playbackState.playToken = 2;
    resolve(null);
    await pending;
    assert.equal(requests, 1);
    assert.equal(c.state.currentSong.id, 'two');
    assert.equal(c.state.currentSong.lyrics_status, 'loading');
});

test('already available lyrics do not depend on another upstream response', async () => {
    const c = fixture(() => { throw new Error('unexpected request'); });
    c.state.currentSong.lyrics = [{ time: 1, text: 'cached' }];
    await c.hydrateCurrentSongDetails(c.state.currentSong, 1);
    assert.equal(c.state.currentSong.lyrics[0].text, 'cached');
});

test('manual retry recovers the current song and ignores repeated clicks while pending', async () => {
    let resolve;
    let requests = 0;
    const c = fixture(() => { requests++; return new Promise(r => { resolve = r; }); });
    c.state.currentSong.lyrics_status = 'source_error';
    c.retryCurrentLyrics();
    c.retryCurrentLyrics();
    assert.equal(requests, 1);
    assert.equal(c.state.currentSong.lyrics_status, 'loading');
    resolve({ lyrics_status: 'ok', lyrics: [{ time: 2, text: 'recovered manually' }] });
    await new Promise(setImmediate);
    assert.equal(c.state.currentSong.id, 'one');
    assert.equal(c.state.currentSong.lyrics_status, 'ok');
});

test('new-song lyrics start while audio is still buffering and old progress clears immediately', async () => {
    const c = fixture(async () => null);
    let finishAudio;
    let lyricsStarted = false;
    Object.assign(c, {
        resolvePlayableSong: id => ({ id, url: 'qjjlb://qq?mid=new' }),
        syncQueueForSong() {},
        audio: { pause() {}, removeAttribute() {}, load() {} },
        progressBar: { value: 75 }, currentTime: { textContent: '03:00' }, totalTime: { textContent: '04:00' },
        updateRangeFill() {}, playBtn: {}, ICON: { play: '' },
        loadOnlineSongInfo: async song => ({ song, audioUrl: '/test.mp3' }),
        hydrateCurrentSongDetails() { lyricsStarted = true; },
        startPlaybackWithLeveling: () => new Promise(r => { finishAudio = r; }),
        prefetchNextSong() {},
    });
    vm.runInContext(source.slice(source.indexOf('async function playSong('), source.indexOf('function findSongInState')), c);
    const pending = c.playSong('new');
    assert.equal(c.progressBar.value, 0);
    assert.equal(c.currentTime.textContent, '00:00');
    await new Promise(setImmediate);
    assert.equal(lyricsStarted, true);
    assert.equal(c.state.isLoading, true);
    finishAudio(true);
    await pending;
    assert.equal(c.state.isLoading, false);
});
