const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../code/frontend/static/ambient.js'), 'utf8');

function fixture({ saved = null, reduced = false, mobile = false, storageFails = false } = {}) {
    function node() {
        const classes = new Set(), listeners = {};
        return { style: {}, children: [], attributes: {}, hidden: false, display: 'none', nodeType: 1,
            classList: { add: name => classes.add(name), remove: name => classes.delete(name),
                toggle(name, on) { on ? classes.add(name) : classes.delete(name); }, contains: name => classes.has(name) },
            addEventListener(name, fn) { listeners[name] = fn; },
            fire(name) { listeners[name]?.(); },
            setAttribute(name, value) { this.attributes[name] = value; }, append(child) { this.children.push(child); },
            querySelectorAll() { return this.meteors; }, querySelector() { return this.meteor; }, matches() { return false; },
        };
    }
    const sky = node(), button = node(), body = node(), modal = node();
    sky.meteors = [node(), node()];
    sky.meteor = sky.meteors[0];
    const media = {}, timers = new Map(), observers = [], writes = [];
    let timerId = 0;
    const document = { body, hidden: false, listeners: {}, createElement: node,
        getElementById: id => ({ skyBackground: sky, ambientToggle: button })[id],
        querySelectorAll: () => [modal], querySelector() { return this.openPopover ? modal : null; },
        addEventListener(name, fn) { this.listeners[name] = fn; },
    };
    vm.runInNewContext(source, { document,
        matchMedia(query) {
            const value = node(); value.matches = query.includes('reduced') ? reduced : query.includes('max-width') ? mobile : !mobile;
            media[query] = value; return value;
        },
        getComputedStyle: value => ({ display: value.display }),
        localStorage: { getItem() { if (storageFails) throw Error('blocked'); return saved; },
            setItem(...args) { if (storageFails) throw Error('blocked'); writes.push(args); } },
        setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
        clearTimeout: id => timers.delete(id),
        MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} },
    });
    return { sky, button, body, modal, document, media, timers, observers, writes,
        tick() { const [id, { fn }] = timers.entries().next().value; timers.delete(id); fn(); },
    };
}

test('bounded meteor pair is reused and stopping cancels the delayed companion and pending work', () => {
    const f = fixture();
    for (let i = 0; i < 3; i++) {
        f.tick();
        assert.ok(f.sky.meteor.classList.contains('is-active'));
        assert.equal(f.timers.size, 1);
        assert.equal(f.sky.meteors[1].classList.contains('is-active'), i === 2);
        if (i < 2) f.sky.meteor.fire('animationend');
    }
    assert.ok(f.sky.meteor.classList.contains('is-active'));
    f.button.fire('click');
    assert.equal(f.timers.size, 0);
    assert.equal(f.sky.meteor.classList.contains('is-active'), false);
    assert.equal(f.sky.meteors[1].classList.contains('is-active'), false);
    assert.deepEqual(f.writes, [['shine_ambient_motion', 'off']]);
});

test('modal and hidden page stop timers; only an available page resumes; repeated events do not multiply timers', () => {
    const f = fixture();
    f.modal.display = 'flex'; f.observers[0].fn();
    assert.equal(f.timers.size, 0);
    f.document.hidden = true; f.document.listeners.visibilitychange();
    f.modal.display = 'none'; f.observers[0].fn();
    assert.equal(f.timers.size, 0);
    f.document.hidden = false; f.document.listeners.visibilitychange();
    f.document.listeners.visibilitychange();
    assert.equal(f.timers.size, 1);
    assert.equal(f.body.classList.contains('ambient-paused'), false);
    f.document.openPopover = true; f.document.listeners.toggle();
    assert.equal(f.timers.size, 0);
    f.document.openPopover = false; f.document.listeners.toggle();
    assert.equal(f.timers.size, 1);
    f.modal.display = 'flex';
    f.observers[1].fn([{ addedNodes: [{ nodeType: 1, matches: () => true }], removedNodes: [] }]);
    assert.equal(f.timers.size, 0);
});

test('saved preference and system reduced motion both retain stars without scheduling motion', () => {
    for (const options of [{ saved: 'off' }, { reduced: true }]) {
        const f = fixture(options);
        assert.equal(f.timers.size, 0);
        assert.equal(f.sky.children.length, 96);
        assert.equal(f.button.attributes['aria-pressed'], 'false');
    }
    const f = fixture();
    const reduced = f.media['(prefers-reduced-motion: reduce)'];
    reduced.matches = true; reduced.fire('change');
    assert.equal(f.button.disabled, true);
    assert.equal(f.timers.size, 0);
    reduced.matches = false; reduced.fire('change');
    assert.equal(f.timers.size, 1);
});

test('blocked storage remains usable and mobile schedule keeps the slower interval', () => {
    const f = fixture({ storageFails: true, mobile: true });
    f.tick();
    const delay = [...f.timers.values()][0].delay;
    assert.ok(delay >= 6000 && delay <= 10000);
    const firstPath = f.sky.meteor.style.cssText;
    f.sky.meteor.fire('animationend'); f.tick();
    assert.notEqual(f.sky.meteor.style.cssText, firstPath);
    f.sky.meteor.fire('animationend'); f.tick();
    assert.equal(f.sky.meteors[1].classList.contains('is-active'), false);
    f.button.fire('click'); f.button.fire('click');
    assert.equal(f.timers.size, 1);
    assert.equal(f.sky.children.length, 96);
});

test('switching to mobile or hiding an active pair clears both meteors without adding timers', () => {
    const f = fixture();
    for (let i = 0; i < 3; i++) { f.tick(); if (i < 2) f.sky.meteor.fire('animationend'); }
    assert.equal(f.sky.meteors[1].classList.contains('is-active'), true);
    const mobile = f.media['(max-width: 600px)'];
    mobile.matches = true; mobile.fire('change');
    assert.ok(f.sky.meteors.every(meteor => !meteor.classList.contains('is-active')));
    assert.equal(f.timers.size, 1);
    f.tick();
    f.document.hidden = true; f.document.listeners.visibilitychange();
    assert.equal(f.timers.size, 0);
    assert.ok(f.sky.meteors.every(meteor => !meteor.classList.contains('is-active')));
});
