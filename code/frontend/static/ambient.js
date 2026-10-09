// Independent decoration: never reads or changes audio, queues, or lyrics.
(() => {
    const sky = document.getElementById('skyBackground');
    const button = document.getElementById('ambientToggle');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia('(max-width: 600px)');
    let enabled = true;
    let timer;
    let sequence = 0;
    try { enabled = localStorage.getItem('shine_ambient_motion') !== 'off'; } catch { /* Optional preference. */ }

    // Stable positions avoid regeneration and layout work on resize.
    for (let i = 0; i < 96; i++) {
        const star = document.createElement('span');
        star.className = 'sky-star' + (i < 12 ? ' twinkle' : '') + (i % 11 === 0 ? ' bright' : '');
        const x = (i * 37.7 + 3) % 100;
        const y = (i * 23.3 + 7) % 100;
        star.style.cssText = `--star-x:${x}%;--star-y:${y}%;--star-size:${i % 11 === 0 ? 3 : i % 3 === 0 ? 2 : 1}px;--star-opacity:${.35 + (i % 5) * .1};--twinkle-duration:${5 + i % 5}s;--twinkle-delay:${-i}s`;
        sky.append(star);
    }

    const meteors = [...sky.querySelectorAll('.sky-meteor')];
    const overlays = '.modal-overlay, .add-to-pl-overlay';
    function blocked() {
        return !enabled || reduced.matches || document.hidden || document.querySelector(':popover-open') ||
            [...document.querySelectorAll(overlays)].some(node => !node.hidden && getComputedStyle(node).display !== 'none');
    }
    function schedule(first = false) {
        timer = setTimeout(shoot, first ? (mobile.matches ? 1800 : 1200) : (mobile.matches ? 6000 + Math.random() * 4000 : 3200 + Math.random() * 2200));
    }
    function shoot() {
        if (blocked()) return;
        sequence++;
        const length = mobile.matches ? 140 + Math.random() * 60 : 260 + Math.random() * 120;
        // One shared sky: top, left, and right paths stay visible through the shell.
        const lane = sequence % 3;
        const x = lane === 1 ? `${8 + Math.random() * 48}%` : lane === 2 ? `${-length + 24}px` : `${62 + Math.random() * 14}%`;
        const y = lane === 1 ? 1 + Math.random() * 8 : 16 + Math.random() * 38;
        const travel = mobile.matches ? 280 : 480;
        meteors[0].style.cssText = `--meteor-x:${x};--meteor-y:${y}%;--meteor-length:${length}px;--meteor-duration:${2.1 + Math.random() * .6}s;--meteor-travel:${travel}px;--meteor-drop:${travel * .781}px`;
        meteors[0].classList.add('is-active');
        // A shorter, delayed companion adds depth without an unbounded particle system.
        if (!mobile.matches && sequence % 3 === 0) {
            meteors[1].style.cssText = `--meteor-x:calc(${x} - 110px);--meteor-y:${y + 8}%;--meteor-length:${length * .65}px;--meteor-duration:2.1s;--meteor-delay:.32s;--meteor-travel:420px;--meteor-drop:328px;--meteor-peak:.58`;
            meteors[1].classList.add('is-active');
        }
        schedule();
    }
    meteors.forEach(meteor => meteor.addEventListener('animationend', () => meteor.classList.remove('is-active')));
    function sync() {
        clearTimeout(timer);
        meteors.forEach(meteor => meteor.classList.remove('is-active'));
        const paused = blocked();
        document.body.classList.toggle('ambient-paused', paused);
        button.setAttribute('aria-pressed', String(enabled && !reduced.matches));
        button.disabled = reduced.matches;
        button.title = reduced.matches ? '系统已开启减少动态效果，使用静态星空' : enabled ? '关闭动态背景' : '开启动态背景';
        if (!paused) schedule(true);
    }
    button.addEventListener('click', () => {
        enabled = !enabled;
        try { localStorage.setItem('shine_ambient_motion', enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
        sync();
    });
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('toggle', sync, true);
    [reduced, mobile].forEach(query => query.addEventListener('change', sync));
    const modalObserver = new MutationObserver(sync);
    // Existing overlays toggle style/hidden; dynamically created overlays live under body.
    document.querySelectorAll(overlays).forEach(node => modalObserver.observe(node, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] }));
    const bodyObserver = new MutationObserver(records => {
        if (!records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(overlays) || node.querySelector(overlays))))) return;
        document.querySelectorAll(overlays).forEach(node => modalObserver.observe(node, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] }));
        sync();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    sync();
})();
