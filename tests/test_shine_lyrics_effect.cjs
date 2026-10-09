const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../code/frontend/static/app.js'), 'utf8');

function fixture(storageFails = false) {
    const classes = new Set();
    const attributes = {};
    const button = { textContent: '', setAttribute(key, value) { attributes[key] = value; } };
    const panel = { classList: { toggle(key, value) { if (value) classes.add(key); else classes.delete(key); } } };
    const saved = [];
    const c = vm.createContext({
        state: { lyricsEffect: 'neon', isPlaying: true, currentLyricsKey: 'same-song', lyricsFollow: false },
        audio: { currentTime: 42 },
        $: id => id === 'lyricsPanel' ? panel : button,
        localStorage: { setItem(key, value) { if (storageFails) throw new Error('blocked'); saved.push([key, value]); } },
        document: { activeElement: null },
        focusMusicSearch() { throw new Error('L must not focus search'); },
    });
    vm.runInContext(source.slice(source.indexOf('function syncLyricsEffect()'), source.indexOf("$('lyricsEffectBtn').addEventListener")), c);
    vm.runInContext(source.slice(source.indexOf('function isShortcutInputTarget('), source.indexOf("document.addEventListener('keydown', handleKeyboardShortcuts)")), c);
    return { c, button, classes, attributes, saved };
}

function event(tag = 'DIV', overrides = {}, inside = '') {
    return {
        key: 'l', isComposing: false, repeat: false, metaKey: false, ctrlKey: false, altKey: false,
        target: { tagName: tag, isContentEditable: false, closest(selector) { return inside && selector.includes(inside) ? {} : null; } },
        prevented: false, preventDefault() { this.prevented = true; }, ...overrides,
    };
}

test('switching lyric appearance persists the mode without changing playback or manual lyric follow', () => {
    const { c, button, classes, attributes, saved } = fixture();
    c.toggleLyricsEffect();
    assert.equal(c.state.lyricsEffect, 'clear');
    assert.equal(button.textContent, '清晰高亮');
    assert.equal(attributes['aria-pressed'], 'false');
    assert.equal(classes.has('clear-lyrics'), true);
    assert.equal(c.audio.currentTime, 42);
    assert.equal(c.state.isPlaying, true);
    assert.equal(c.state.currentLyricsKey, 'same-song');
    assert.equal(c.state.lyricsFollow, false);
    assert.deepEqual(saved, [['shine_lyrics_effect', 'clear']]);
    c.toggleLyricsEffect();
    assert.equal(c.state.lyricsEffect, 'neon');
    assert.equal(classes.has('clear-lyrics'), false);
});

test('L works after a normal button receives focus, but a held key toggles only once', () => {
    const { c } = fixture();
    const press = event('BUTTON');
    c.handleKeyboardShortcuts(press);
    assert.equal(press.prevented, true);
    assert.equal(c.state.lyricsEffect, 'clear');
    c.handleKeyboardShortcuts(event('BUTTON', { repeat: true }));
    assert.equal(c.state.lyricsEffect, 'clear');
});

test('typing, composing, modifier shortcuts, dialogs and popovers do not switch lyrics', () => {
    const { c } = fixture();
    const events = [event('INPUT'), event('TEXTAREA'), event('SELECT'), event('DIV', { isComposing: true }),
        event('DIV', { ctrlKey: true }), event('DIV', { altKey: true }), event('DIV', { metaKey: true }),
        event('BUTTON', {}, '.modal-box'), event('BUTTON', {}, '.add-to-pl-panel'), event('BUTTON', {}, '[popover]')];
    for (const press of events) {
        c.handleKeyboardShortcuts(press);
        assert.equal(c.state.lyricsEffect, 'neon');
        assert.equal(press.prevented, false);
    }
});

test('blocked optional storage does not stop the visible lyric mode changing', () => {
    const { c, button } = fixture(true);
    assert.doesNotThrow(() => c.toggleLyricsEffect());
    assert.equal(button.textContent, '清晰高亮');
});

test('quick search reveals its field on mobile without jumping to the library or scrolling desktop', () => {
    for (const mobile of [true, false]) {
        const actions = [];
        const c = vm.createContext({
            matchMedia: () => ({ matches: mobile }),
            searchInput: {
                scrollIntoView(options) { actions.push(['reveal search', options.block]); },
                focus(options) { actions.push(['focus', options.preventScroll]); },
                select() { actions.push(['select']); },
            },
            openLibrary() { throw new Error('search must not jump to the library'); },
            requestAnimationFrame(fn) { fn(); },
        });
        vm.runInContext(source.slice(source.indexOf('function focusMusicSearch()'), source.indexOf('function renderQueue()')), c);
        c.focusMusicSearch();
        assert.deepEqual(actions, mobile
            ? [['reveal search', 'center'], ['focus', true], ['select']]
            : [['focus', true], ['select']]);
    }
});

test('timed lyrics stay centered inside their positioned scroll container and respect manual follow', () => {
    const scrolls = [];
    const line = { offsetTop: 900, clientHeight: 30, classList: { add() {}, remove() {} } };
    const c = vm.createContext({
        lyricsList: { offsetTop: 430, clientHeight: 210, scrollTo(options) { scrolls.push(options.top); } },
        state: { lyricLines: [line], timedLyrics: [{ time: 10, index: 0 }], currentLyricIndex: -1, isPlaying: true, lyricsFollow: true },
        audio: { currentTime: 15 }, matchMedia: () => ({ matches: true }),
    });
    vm.runInContext(source.slice(source.indexOf('function syncLyricHighlight('), source.indexOf('function syncImmersivePlayerUI()')), c);
    c.syncLyricHighlight();
    assert.equal(c.state.currentLyricIndex, 0);
    assert.equal(scrolls[0], 810);
    assert.equal(line.offsetTop - scrolls[0] + line.clientHeight / 2, c.lyricsList.clientHeight / 2);
    c.state.lyricsFollow = false;
    c.syncLyricHighlight(true);
    assert.equal(scrolls.length, 1);
    c.state.lyricsFollow = true;
    c.state.isPlaying = false;
    c.syncLyricHighlight(true);
    assert.equal(scrolls.length, 2);
    assert.equal(scrolls[1], 810);
});
