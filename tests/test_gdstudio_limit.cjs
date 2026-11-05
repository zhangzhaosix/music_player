const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../code/frontend/static/app.js'), 'utf8');

test('a restricted source stops automatic playback recovery', () => {
    const from = source.indexOf('function setPlaybackError(');
    const to = source.indexOf('function retryCurrentPlayback(', from);
    let cancelled = 0, retried = 0;
    const c = vm.createContext({
        clearTimeout() {}, playbackState: { sourceLimit: 'GD 音乐台拒绝访问', bufferingTimer: null },
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
    const icon = { outerHTML: 'old' };
    const image = { src: '/api/gd-cover/123' };
    const button = {
        classList: { add() {}, remove() {} }, querySelector: () => icon,
        closest: () => ({ querySelector: () => ({ textContent: 'Song' }) }),
        setAttribute() {}, image,
    };
    Object.defineProperty(button, 'innerHTML', { set() { throw new Error('cover was replaced'); } });
    const c = vm.createContext({
        document: { querySelectorAll(selector) { return selector === '.play-btn-item' ? [button] : []; } },
        state: { currentSong: null }, ICON: { play: '<svg>play</svg>' },
    });
    vm.runInContext(source.slice(from, to), c);
    c.updatePlayButtons();
    assert.equal(icon.outerHTML, '<svg>play</svg>');
    assert.equal(button.image, image);
});
