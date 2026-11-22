// Independent decoration: never reads or changes audio, queues, or lyrics.
(() => {
    const sky = document.getElementById('skyBackground');
    const button = document.getElementById('ambientToggle');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia('(max-width: 600px), (max-height: 500px) and (pointer: coarse)');
    let enabled = true;
    let timer;
    let sequence = 0;
    let watching = false;
    try { enabled = localStorage.getItem('shine_ambient_motion') !== 'off'; } catch { /* Optional preference. */ }

    // Seed the field once. Only the three layer transforms move the star positions.
    let seed = 8293;
    function scatter() {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    }
    [
        { name: 'far', count: 58, size: .65, light: .24 },
        { name: 'middle', count: 30, size: 1.05, light: .38 },
        { name: 'near', count: 14, size: 1.8, light: .54 },
    ].forEach(({ name, count, size, light }) => {
        const layer = document.createElement('div');
        layer.className = `sky-layer sky-layer-${name}`;
        for (let i = 0; i < count; i++) {
            const star = document.createElement('span');
            const twinkle = i % 7 === 2;
            const bright = name === 'near' && i % 3 === 0;
            star.className = 'sky-star' + (twinkle ? ' twinkle' : '') + (bright ? ' bright' : '');
            const x = scatter() * 100;
            const y = scatter() * 100;
            const diameter = size + scatter() * (bright ? 1.3 : .65);
            const opacity = light + scatter() * .24;
            star.style.cssText = `--star-x:${x.toFixed(2)}%;--star-y:${y.toFixed(2)}%;--star-size:${diameter.toFixed(2)}px;--star-opacity:${opacity.toFixed(2)};--twinkle-duration:${(4.5 + scatter() * 8).toFixed(2)}s;--twinkle-delay:${(-scatter() * 14).toFixed(2)}s`;
            layer.append(star);
        }
        sky.append(layer);
    });

    const meteors = [...sky.querySelectorAll('.sky-meteor')];
    const overlays = '.modal-overlay, .add-to-pl-overlay';
    function schedule(first = false) {
        const [min, max] = first ? (mobile.matches ? [7000, 12000] : [4500, 8000])
            : (mobile.matches ? [19000, 33000] : [13000, 24000]);
        timer = setTimeout(shoot, min + Math.random() * (max - min));
    }
    function shoot() {
        if (!sky.classList.contains('is-moving')) return;
        sequence++;
        const length = mobile.matches ? 115 + Math.random() * 50 : 180 + Math.random() * 100;
        const fromTop = Math.random() < .68;
        const x = fromTop ? `${5 + Math.random() * 58}%` : `${32 - length}px`;
        const y = fromTop ? 2 + Math.random() * 23 : 16 + Math.random() * 38;
        const angle = 22 + Math.random() * 23;
        const travel = mobile.matches ? 205 + Math.random() * 75 : 300 + Math.random() * 170;
        const drop = travel * Math.tan(angle * Math.PI / 180);
        const duration = 1.7 + Math.random() * .75;
        meteors[0].style.cssText = `--meteor-x:${x};--meteor-y:${y}%;--meteor-length:${length}px;--meteor-duration:${duration}s;--meteor-travel:${travel}px;--meteor-drop:${drop}px;--meteor-angle:${angle}deg`;
        meteors[0].classList.add('is-active');
        if (!mobile.matches && sequence % 3 === 0) {
            meteors[1].style.cssText = `--meteor-x:calc(${x} - 94px);--meteor-y:${y + 6}%;--meteor-length:${length * .55}px;--meteor-duration:${duration * .87}s;--meteor-delay:.42s;--meteor-travel:${travel * .8}px;--meteor-drop:${drop * .8}px;--meteor-angle:${angle}deg;--meteor-peak:.44`;
            meteors[1].classList.add('is-active');
        }
        schedule();
    }
    meteors.forEach(meteor => meteor.addEventListener('animationend', () => meteor.classList.remove('is-active')));
    function sync(reset = false) {
        const allowed = enabled && !reduced.matches;
        const visible = allowed && !document.hidden;
        if (visible !== watching) {
            watching = visible;
            if (watching) {
                observeOverlays();
                bodyObserver.observe(document.body, { childList: true, subtree: true });
            } else {
                modalObserver.disconnect();
                bodyObserver.disconnect();
            }
        }
        const moving = visible && !document.querySelector(':popover-open') &&
            ![...document.querySelectorAll(overlays)].some(node => !node.hidden && getComputedStyle(node).display !== 'none');
        if (reset === true || moving !== sky.classList.contains('is-moving')) {
            clearTimeout(timer);
            meteors.forEach(meteor => meteor.classList.remove('is-active'));
            sky.classList.toggle('is-moving', moving);
            if (moving) schedule(true);
        }
        button.setAttribute('aria-pressed', String(allowed));
        button.disabled = reduced.matches;
        button.title = reduced.matches ? '系统已开启减少动态效果，使用静态星空' : enabled ? '关闭动态背景' : '开启动态背景';
    }
    button.addEventListener('click', () => {
        enabled = !enabled;
        try { localStorage.setItem('shine_ambient_motion', enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
        sync();
    });
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('toggle', () => { if (watching) sync(); }, true);
    reduced.addEventListener('change', sync);
    mobile.addEventListener('change', () => { if (watching) sync(true); });
    const modalObserver = new MutationObserver(() => sync());
    function observeOverlays() {
        modalObserver.disconnect();
        document.querySelectorAll(overlays).forEach(node => modalObserver.observe(node, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] }));
    }
    const bodyObserver = new MutationObserver(records => {
        if (!records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(overlays) || node.querySelector(overlays))))) return;
        observeOverlays();
        sync();
    });
    sync();
})();
