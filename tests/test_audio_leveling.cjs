const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../code/frontend/static/app.js'), 'utf8').replace(/\r\n/g, '\n');
const fallback = Math.pow(10, -2 / 20);
const flush = () => new Promise(setImmediate);

function fixture(measured = { status: 'unavailable' }) {
    const calls = [];
    function parameter(value = 1) {
        return { value, cancelScheduledValues() {}, cancelAndHoldAtTime() {},
            setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v, time) { this.value = v; this.rampTime = time; } };
    }
    const pipeline = { context: { currentTime: 4, state: 'running', async resume() { this.state = 'running'; } },
        gain: { gain: parameter(.8) }, trackGain: { gain: parameter(fallback) } };
    const context = vm.createContext({
        Math, Number, Date, JSON, URL, URLSearchParams, AbortController, AbortSignal,
        LEVELING_FALLBACK_GAIN: fallback, LEVELING_MAX_GAIN: Math.pow(10, 6 / 20),
        LEVELING_TIMEOUT_MS: 2500,
        playbackState: { baseVolume: .8, trackGain: fallback, playToken: 1, analysisToken: 0, audioPipeline: pipeline },
        state: { isLoading: false, isBuffering: false },
        audio: { volume: .8, src: '', currentTime: 0, duration: 120, paused: false,
            buffered: { length: 1, start: () => 0, end: () => 40 } }, window: { location: { href: 'http://localhost/' } },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { json: async () => options.method === 'POST' ? { status: 'ready', gain_db: -10 } : measured };
        },
        startAudioPlayback: async () => { calls.push({ started: true }); return true; },
    });
    vm.runInContext(source.slice(source.indexOf('function clamp('), source.indexOf('function waitForMediaEvent(')), context);
    vm.runInContext(source.slice(source.indexOf('async function fetchAudioAnalysis('), source.indexOf('async function playSong(')), context);
    return { context, pipeline, calls };
}

test('cold playback uses fixed attenuation and a completed analysis never changes it midway', async () => {
    const { context, pipeline, calls } = fixture();
    assert.equal(await context.startPlaybackWithLeveling({ song: {}, audioUrl: '/api/stream/a.wav' }), true);
    await flush();
    assert.equal(context.playbackState.trackGain, fallback);
    assert.equal(pipeline.trackGain.gain.value, fallback);
    assert.equal(pipeline.gain.gain.value, .8);
    assert.ok(calls.findIndex(call => call.started) < calls.findIndex(call => call.options?.method === 'POST'));
});

test('measured attenuation has no artificial lower bound and is applied before playback', async () => {
    const { context, pipeline, calls } = fixture({ status: 'ready', gain_db: -24 });
    await context.startPlaybackWithLeveling({ song: {}, audioUrl: '/api/stream/a.wav' });
    assert.equal(pipeline.trackGain.gain.value, Math.pow(10, -24 / 20));
    assert.equal(calls.filter(call => call.options?.method === 'POST').length, 0);
});

test('user volume ramps independently and cannot reset a safe track gain', () => {
    const { context, pipeline } = fixture();
    context.playbackState.trackGain = .05;
    context.applyEffectiveVolume({ immediate: true, trackChanged: true });
    context.playbackState.baseVolume = 1;
    context.applyEffectiveVolume();
    assert.equal(pipeline.trackGain.gain.value, .05);
    assert.equal(pipeline.gain.gain.value, 1);
    assert.equal(pipeline.gain.gain.rampTime, 4.025);
});

test('switching during an outstanding lookup discards the old gain and source', async () => {
    const { context } = fixture();
    const pending = [];
    context.fetch = async () => ({ json: () => new Promise(resolve => pending.push(resolve)) });
    const first = context.startPlaybackWithLeveling({ song: {}, audioUrl: '/api/stream/old.wav' });
    await flush();
    context.playbackState.playToken++;
    const second = context.startPlaybackWithLeveling({ song: {}, audioUrl: '/api/stream/new.wav' });
    await flush();
    pending[1]({ status: 'ready', gain_db: -5 });
    await second;
    pending[0]({ status: 'ready', gain_db: 6 });
    assert.equal(await first, false);
    assert.equal(context.audio.src, '/api/stream/new.wav');
    assert.equal(context.playbackState.trackGain, Math.pow(10, -5 / 20));
});

test('unsupported Web Audio and unavailable analysis never boost native playback', async () => {
    const { context } = fixture();
    context.playbackState.audioPipeline = null;
    context.playbackState.trackGain = 1.8;
    context.applyEffectiveVolume();
    assert.equal(context.audio.volume, .8 * fallback);
    context.fetch = async () => { throw new Error('offline'); };
    assert.equal(await context.fetchAudioAnalysis('/api/stream/a.wav'), null);
});

test('resuming playback resumes a suspended context', async () => {
    const { context, pipeline } = fixture();
    pipeline.context.state = 'suspended';
    await context.resumeAudioContext();
    assert.equal(pipeline.context.state, 'running');
});

test('cancelled analysis and old song tokens cannot submit work', async () => {
    const { context, calls } = fixture();
    const controller = new AbortController();
    controller.abort();
    await context.analyzeTrackGain({}, '/api/stream/a.wav', 0, { signal: controller.signal });
    context.playbackState.analysisToken = 5;
    await context.analyzeTrackGain({}, '/api/stream/a.wav', 4);
    assert.equal(calls.length, 0);
});

test('whole-track downloads wait for enough buffer and are cancelled while waiting', async () => {
    const { context, calls } = fixture();
    const controller = new AbortController();
    context.audio.buffered.end = () => 2;
    context.delay = async () => { controller.abort(); };
    await context.analyzeTrackGain({}, '/a.wav', 0, { signal: controller.signal });
    assert.equal(calls.length, 0);
    context.audio.duration = 8;
    context.audio.buffered.end = () => 8;
    assert.equal(context.hasPlaybackBuffer(), true);
    context.state.isBuffering = true;
    assert.equal(context.hasPlaybackBuffer(), false);
});

function infoFixture() {
    const c = vm.createContext({ URLSearchParams, Date, AbortController,
        playbackState: { playableInfoCache: new Map(), playableInfoRequests: new Map() },
        PLAYABLE_INFO_TTL_MS: 300000,
        getSongInfoReference: song => song.song_ref || song.url,
        isBlockedSongText: () => false, hasRealLyrics: () => false });
    vm.runInContext(source.slice(source.indexOf('function getAudioUrl('), source.indexOf('async function hydrateCurrentSongDetails(')), c);
    return c;
}

test('saved provider links resolve again while real direct files and local files stay immediate', async () => {
    const c = infoFixture();
    c.fetchOnlineSongInfo = async () => ({ mp3_url: 'https://example.com/fresh.m4a' });
    const song = { id: 'a', song_ref: 'qjjlb://kuwo?id=1', mp3_url: 'http://old-api/?format=mp3' };
    const result = await c.loadOnlineSongInfo(song);
    assert.equal(result.audioUrl, '/api/proxy-stream?url=https%3A%2F%2Fexample.com%2Ffresh.m4a');
    assert.equal(c.getImmediateAudioUrl({ ...song, filename: 'a.flac' }), '/api/stream/a.flac');
    assert.ok(c.getImmediateAudioUrl({ url: 'https://example.com/a.m4a' }));
    c.fetchOnlineSongInfo = () => { throw new Error('valid cache must be reused'); };
    assert.equal((await c.loadOnlineSongInfo(song)).audioUrl, result.audioUrl);
    c.playbackState.playableInfoCache.get(song.song_ref).expiresAt = 0;
    c.fetchOnlineSongInfo = async () => ({ mp3_url: 'https://example.com/new.m4a' });
    assert.notEqual((await c.loadOnlineSongInfo(song)).audioUrl, result.audioUrl);
});

test('switching to the prefetched song reuses its request and a cancelled waiter cannot apply it', async () => {
    const c = infoFixture();
    let resolve, requests = 0;
    c.fetchOnlineSongInfo = () => { requests++; return new Promise(r => { resolve = r; }); };
    const song = { id: 'a', song_ref: 'qjjlb://qq?mid=1' };
    const prefetch = c.loadOnlineSongInfo(song);
    const controller = new AbortController();
    const play = c.loadOnlineSongInfo(song, { signal: controller.signal });
    const cancelled = new AbortController();
    const oldPlay = c.loadOnlineSongInfo(song, { signal: cancelled.signal });
    cancelled.abort();
    resolve({ mp3_url: 'https://example.com/a.m4a' });
    assert.equal((await prefetch).audioUrl, (await play).audioUrl);
    assert.equal(await oldPlay, null);
    assert.equal(requests, 1);
});

test('single-song repeat starts a new fixed-gain playback instead of keeping cold gain forever', () => {
    let ended, restarted;
    const c = vm.createContext({
        audio: { addEventListener(_event, handler) { ended = handler; } },
        state: { currentSong: { id: 'a.wav' }, playMode: 'repeat' },
        playBtn: {}, progressBar: {}, ICON: { play: 'play' },
        equalizer: { classList: { add() {} } },
        updateRangeFill() {}, updatePlayButtons() {}, syncImmersivePlayerUI() {},
        playSong(id, options) { restarted = { id, options }; }, stepQueue() {},
    });
    const start = source.indexOf("audio.addEventListener('ended'");
    const end = source.indexOf('// 上一首/下一首', start);
    vm.runInContext(source.slice(start, end), c);
    ended();
    assert.equal(restarted.id, 'a.wav');
    assert.equal(restarted.options.force, true);
    assert.equal(restarted.options.keepQueue, true);
    assert.equal(restarted.options.rememberHistory, false);
});

test('an old resume cannot clear a new song loading state or report an error on it', async () => {
    let resolve, error;
    const c = vm.createContext({
        state: { currentSong: { id: 'old' }, isLoading: false },
        playbackState: { playToken: 1 }, audio: { paused: true, src: '/old.wav' },
        syncImmersivePlayerUI() {},
        startAudioPlayback: () => new Promise(r => { resolve = r; }),
        setPlaybackError(message) { error = message; },
    });
    const start = source.indexOf('function togglePlayPause()');
    const end = source.indexOf('\n}\n', start) + 3;
    assert.ok(start >= 0 && end > start);
    vm.runInContext(source.slice(start, end), c);
    c.togglePlayPause();
    assert.equal(c.state.isLoading, true);
    c.playbackState.playToken = 2;
    c.state.currentSong = { id: 'new' };
    resolve(false);
    await flush();
    assert.equal(c.state.isLoading, true);
    assert.equal(c.state.currentSong.id, 'new');
    assert.equal(error, undefined);
});
