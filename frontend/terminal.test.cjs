const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class FakeClassList {
    constructor() { this.classes = new Set(); }
    add(...classes) { classes.forEach((cls) => this.classes.add(cls)); }
    remove(...classes) { classes.forEach((cls) => this.classes.delete(cls)); }
    contains(cls) { return this.classes.has(cls); }
    toggle(cls, force) {
        if (force === undefined) force = !this.classes.has(cls);
        if (force) this.classes.add(cls); else this.classes.delete(cls);
        return force;
    }
}

class FakeElement {
    constructor(id) {
        this.id = id;
        this.children = [];
        this.classList = new FakeClassList();
        this.dataset = {};
        this.eventListeners = {};
        this.parentNode = null;
        this.style = {};
        this.offsetParent = {};
        this.offsetWidth = 800;
        this.offsetHeight = 600;
        this.clientWidth = 800;
        this.clientHeight = 600;
        this.innerHTML = '';
        this.textContent = '';
        this.value = '';
    }
    get className() { return Array.from(this.classList.classes).join(' '); }
    set className(value) {
        this.classList.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    }
    addEventListener(type, handler) {
        if (!this.eventListeners[type]) this.eventListeners[type] = [];
        this.eventListeners[type].push(handler);
    }
    removeEventListener(type, handler) {
        if (!this.eventListeners[type]) return;
        this.eventListeners[type] = this.eventListeners[type].filter((fn) => fn !== handler);
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    removeChild(child) {
        this.children = this.children.filter((item) => item !== child);
        child.parentNode = null;
        return child;
    }
    insertBefore(child, ref) {
        var existing = this.children.indexOf(child);
        if (existing !== -1) this.children.splice(existing, 1);
        child.parentNode = this;
        var idx = ref ? this.children.indexOf(ref) : -1;
        if (idx === -1) this.children.push(child);
        else this.children.splice(idx, 0, child);
        return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    querySelector() { return new FakeElement('nested'); }
    querySelectorAll(selector) {
        const selectors = String(selector).split(',').map((s) => s.trim()).filter(Boolean);
        const classes = selectors.filter((s) => s.startsWith('.')).map((s) => s.slice(1));
        if (classes.length === 0 || classes.length !== selectors.length) return [];
        const out = [];
        const walk = (el) => {
            el.children.forEach((child) => {
                if (classes.some((cls) => child.classList.contains(cls))) out.push(child);
                walk(child);
            });
        };
        walk(this);
        return out;
    }
    setAttribute(name, value) { this[name] = value; }
    removeAttribute(name) { delete this[name]; }
    scrollIntoView() {}
    focus() {}
    select() {}
    click() {}
}

function createDocument() {
    const elements = new Map();
    const document = {
        body: new FakeElement('body'),
        documentElement: new FakeElement('html'),
        activeElement: null,
        addEventListener() {},
        removeEventListener() {},
        createElement(tag) { return new FakeElement(tag); },
        createTextNode(text) {
            const el = new FakeElement('text');
            el.textContent = String(text);
            return el;
        },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, new FakeElement(id));
            return elements.get(id);
        },
        querySelector(selector) { return this.getElementById(`selector:${selector}`); },
        querySelectorAll() { return []; }
    };
    document.body.appendChild = FakeElement.prototype.appendChild.bind(document.body);
    return document;
}

function createHarness(bgState) {
    const document = createDocument();
    let webglLoadCount = 0;

    class FakeTerminal {
        constructor(options) {
            this.options = options || {};
            this.rows = 24;
            this.cols = 80;
            this.element = new FakeElement('xterm');
            this.writeCount = 0;
            this.lastWrite = null;
        }
        open(container) { container.appendChild(this.element); }
        loadAddon(addon) {
            if (addon && addon.__isWebglAddon) webglLoadCount += 1;
            if (addon && typeof addon.activate === 'function') addon.activate(this);
        }
        focus() {}
        attachCustomKeyEventHandler() {}
        getSelection() { return ''; }
        hasSelection() { return false; }
        clearSelection() {}
        write(data) { this.writeCount += 1; this.lastWrite = data; }
        writeln() {}
        onData() {}
        dispose() {}
        onScroll() {}
        onResize(cb) { this._onResize = cb; }
        refresh() { this.refreshCount = (this.refreshCount || 0) + 1; }
        resize(cols, rows) { this.cols = cols; this.rows = rows; this.resizeCount = (this.resizeCount || 0) + 1; if (this._onResize) this._onResize({ cols, rows }); }
        getOption(name) { return this.options[name]; }
        setOption(name, value) { this.options[name] = value; }
    }

    class FakeWebglAddon {
        constructor() { this.__isWebglAddon = true; }
        dispose() {}
        onContextLoss() {}
    }

    const monolithApi = new Proxy({
        start_terminal: () => Promise.resolve({ success: true, generation: 1 }),
        resize_terminal: () => Promise.resolve(),
        send_input: () => Promise.resolve(),
        terminate_terminal: () => Promise.resolve()
    }, {
        get(target, prop) {
            if (prop in target) return target[prop];
            return () => Promise.resolve({ success: false });
        }
    });

    const window = {
        monolithApi,
        addEventListener() {},
        removeEventListener() {},
        matchMedia: () => ({ matches: true }),
        __TAURI__: null
    };
    window.window = window;

    // Stub MonolothApp BEFORE loading terminal.js. terminal.js references these
    // only inside functions, but set them up front so initTerminal works.
    window.MonolothApp = {
        getStartupLabel: () => 'opencode',
        getBgState: () => bgState,
        computeTerminalBg: () => '#0a0a0a',
        applyTerminalBg: () => {},
        backToLanding: () => {},
        copyToClipboard: () => {}
    };

    const context = {
        console,
        document,
        window,
        navigator: {
            clipboard: {
                readText: () => Promise.resolve(''),
                writeText: () => Promise.resolve()
            }
        },
        Terminal: FakeTerminal,
        FitAddon: { FitAddon: class FakeFitAddon {
            activate(terminal) { this._terminal = terminal; }
            proposeDimensions() {
                if (!this._terminal) return undefined;
                var el = this._terminal.element;
                var parent = el && el.parentNode;
                if (!parent) return undefined;
                return {
                    cols: Math.max(2, Math.floor(parent.clientWidth / 9)),
                    rows: Math.max(1, Math.floor(parent.clientHeight / 17))
                };
            }
            fit() {
                var dims = this.proposeDimensions();
                if (!dims) return;
                if (this._terminal.cols !== dims.cols || this._terminal.rows !== dims.rows) {
                    this._terminal.resize(dims.cols, dims.rows);
                }
            }
        } },
        WebglAddon: { WebglAddon: FakeWebglAddon },
        Image: class {
            constructor() { this.width = 100; this.height = 100; this.onload = null; this.onerror = null; }
            set src(value) { this._src = value; if (this.onload) setTimeout(() => this.onload(), 0); }
            get src() { return this._src; }
        },
        ResizeObserver: class { observe() {} disconnect() {} },
        requestAnimationFrame: (fn) => { fn(); return 1; },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Promise
    };
    context.globalThis = context;
    vm.createContext(context);

    const domUtilsSource = fs.readFileSync('frontend/lib/dom-utils.js', 'utf8');
    vm.runInContext(domUtilsSource, context, { filename: 'frontend/lib/dom-utils.js' });

    const ctxMenuSource = fs.readFileSync('frontend/ctx-menu.js', 'utf8');
    vm.runInContext(ctxMenuSource, context, { filename: 'frontend/ctx-menu.js' });

    const shortcutsSource = fs.readFileSync('frontend/shortcuts.js', 'utf8');
    vm.runInContext(shortcutsSource, context, { filename: 'frontend/shortcuts.js' });

    const themeSource = fs.readFileSync('frontend/theme.js', 'utf8');
    vm.runInContext(themeSource, context, { filename: 'frontend/theme.js' });

    const terminalViewSource = fs.readFileSync('frontend/lib/terminal-view.js', 'utf8');
    vm.runInContext(terminalViewSource, context, { filename: 'frontend/lib/terminal-view.js' });

    const terminalSource = fs.readFileSync('frontend/terminal.js', 'utf8');
    vm.runInContext(terminalSource, context, { filename: 'frontend/terminal.js' });

    return {
        context,
        getWebglLoadCount: () => webglLoadCount
    };
}

function flushAsync() {
    return new Promise((resolve) => setTimeout(resolve, 20));
}

function installTimerControls(context) {
    const intervals = [];
    context.setInterval = function (fn) {
        const id = intervals.length + 1;
        intervals.push({ fn, cleared: false });
        return id;
    };
    context.clearInterval = function (id) {
        if (intervals[id - 1]) intervals[id - 1].cleared = true;
    };
    return {
        tick(id, count) {
            for (let i = 0; i < count; i++) {
                const interval = intervals[id - 1];
                if (!interval || interval.cleared) return;
                interval.fn();
            }
        },
        count() { return intervals.length; }
    };
}

test('does not load WebGL when terminal background is transparent', async () => {
    const harness = createHarness({ type: 'image', layer: 'behind', transparency: 75 });
    harness.context.window.MonolithTerminal.initTerminal('C:\\dir');
    await flushAsync();
    assert.equal(harness.getWebglLoadCount(), 0);
});

test('loads WebGL when terminal background is opaque', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 0 });
    harness.context.window.MonolithTerminal.initTerminal('C:\\dir');
    await flushAsync();
    assert.equal(harness.getWebglLoadCount(), 1);
});

test('writeToTerm drops stale generation', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 0 });
    const T = harness.context.window.MonolithTerminal;
    T.initTerminal('C:\\dir');
    await flushAsync();
    T.setSessionGeneration('main', 2);
    const term = T.getTerm();
    const before = term.writeCount;
    harness.context.window.writeToTerm('x', false, 'main', 1); // older gen -> dropped
    assert.equal(term.writeCount, before, 'stale-generation write must be dropped');
    harness.context.window.writeToTerm('y', false, 'main', 2); // current gen -> written
    assert.equal(term.writeCount, before + 1, 'current-generation write must go through');
    assert.equal(term.lastWrite, 'y');
});

test('writeToTerm honors skipNextEof', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 0 });
    const T = harness.context.window.MonolithTerminal;
    T.initTerminal('C:\\dir');
    await flushAsync();
    T.setSessionGeneration('main', 0);
    T.setSkipNextEof('main', true);
    const term = T.getTerm();
    const before = term.writeCount;
    harness.context.window.writeToTerm('', true, 'main', 0); // eof skipped once
    assert.equal(term.writeCount, before, 'skipped eof must not write');
    // skip flag cleared: a subsequent eof now writes (and starts countdown)
    harness.context.window.writeToTerm('z', true, 'main', 0);
    assert.equal(term.writeCount, before + 1, 'skip flag must clear after one eof');
});

test('closeTab cancels pending session-exit auto-return', async () => {
    // In the tab-based model, closing a tab clears its exit countdown so
    // the 5s setInterval does not fire. (Closing the LAST tab also calls
    // backToLanding — that's expected, but the countdown timer itself
    // must be cleared so it doesn't fire a second time.)
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 0 });
    const timers = installTimerControls(harness.context);
    const T = harness.context.window.MonolithTerminal;
    let backToLandingCalls = 0;
    harness.context.window.MonolothApp.backToLanding = () => { backToLandingCalls += 1; };

    T.initTerminal('C:\\old');
    await flushAsync();
    harness.context.window.writeToTerm('', true, 'main', 0);
    assert.equal(timers.count(), 1, 'EOF must arm an exit countdown');

    T.closeTab(T.getActiveTab().id, true);
    await flushAsync();
    const afterClose = backToLandingCalls;
    timers.tick(1, 5);  // would fire the countdown 5x if not cleared

    // The close itself called backToLanding (one call), but the countdown
    // must NOT fire — so backToLanding count is unchanged after ticking.
    assert.equal(backToLandingCalls, afterClose, 'exit countdown must not fire after tab close');
});

// --- Resize-corruption regression tests ---
// These pin the fix for terminal corruption on repaint/resize: a single
// term.onResize handler in terminal-view.js syncs the PTY on ANY resize source
// (fit(), applyResize(), pixel-size fallback). refit must NOT force a
// synchronous term.refresh() (which paints the transitional reflow buffer that
// diff-based TUI apps never overwrite -> frozen edges + random middle chars).

function createResizeHarness() {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 0 });
    const order = [];
    // Wrap resize_terminal to record call order relative to term.resize.
    harness.context.window.monolithApi.resize_terminal = function (id, cols, rows) {
        order.push('pty:' + cols + 'x' + rows);
        return Promise.resolve();
    };
    return { harness, order };
}

test('refit syncs PTY via onResize after xterm resize', async () => {
    const { harness, order } = createResizeHarness();
    const T = harness.context.window.MonolithTerminal;
    T.initTerminal('C:\\dir');
    await flushAsync();
    const term = T.getTerm();
    const origResize = term.resize.bind(term);
    term.resize = function (cols, rows) { order.push('term:' + cols + 'x' + rows); origResize(cols, rows); };

    // Force a size change: shrink the xterm's parent, then refit.
    // The FakeFitAddon reads from parent.clientWidth/Height.
    const container = term.element.parentNode;
    container.clientWidth = 360;   // 360/9 = 40 cols
    container.clientHeight = 170;  // 170/17 = 10 rows
    order.length = 0;
    T.refit();

    assert.deepEqual(order, ['term:40x10', 'pty:40x10'],
        'xterm resize fires onResize which syncs PTY — both at the final dimensions');
});

test('refit does not force a synchronous refresh', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 0 });
    const T = harness.context.window.MonolithTerminal;
    T.initTerminal('C:\\dir');
    await flushAsync();
    const term = T.getTerm();

    const container = term.element;
    container.clientWidth = 360;
    container.clientHeight = 170;
    term.refreshCount = 0;
    T.refit();

    assert.equal(term.refreshCount || 0, 0,
        'refit must not call term.refresh() — that paints the transitional reflow buffer');
});

test('refit is a no-op when dimensions are unchanged', async () => {
    const { harness, order } = createResizeHarness();
    const T = harness.context.window.MonolithTerminal;
    T.initTerminal('C:\\dir');
    await flushAsync();
    const term = T.getTerm();
    // Container unchanged since init -> proposeDimensions equals current size.
    order.length = 0;
    const resizeBefore = term.resizeCount || 0;
    T.refit();
    assert.equal(order.length, 0, 'no PTY resize when dimensions are unchanged');
    assert.equal(term.resizeCount || 0, resizeBefore, 'no xterm resize when dimensions are unchanged');
});

test('terminal tab lifecycle create → activate → close', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 0 });
    const T = harness.context.window.MonolithTerminal;
    const t1 = await T.tabs.createTab('C:\\repo', false);
    const t2 = await T.tabs.createTab('C:\\repo', false);
    assert.equal(T.tabs.getAllTabs().length, 2, 'should have 2 tabs after creation');
    T.tabs.activateTab(t1.id);
    assert.equal(T.tabs.getActiveTab().id, t1.id, 'activate should switch active tab');
    T.tabs.closeTab(t2.id);
    assert.equal(T.tabs.getAllTabs().length, 1, 'should have 1 tab after closing one');
    assert.equal(T.tabs.getAllTabs()[0].id, t1.id, 'remaining tab should be the first one');
});

test('visible tab ids start as the single active tab', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    assert.deepEqual(Array.from(MT.getVisibleTabIds()), ['mtab-1']);
    assert.equal(MT.getFocusedTabId(), 'mtab-1');
});

test('splitPane wraps the leaf and renders nested pane DOM', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    const tab2 = await MT.createTab('C:\\dir2', false);
    MT.splitPane('mtab-1', 'row', tab2.id);

    assert.deepEqual(Array.from(MT.getVisibleTabIds()), ['mtab-1', 'mtab-2']);
    const host = harness.context.document.getElementById('main-tab-host');
    const split = host.children.find((c) => c.classList.contains('pane-split'));
    assert.ok(split, 'a .pane-split element must exist inside #main-tab-host');
    assert.equal(split.classList.contains('split-row'), true);
    const slots = [split.children[0].children[0], split.children[1].children[0]];
    assert.equal(slots[0].dataset.tabId, 'mtab-1');
    assert.equal(slots[1].dataset.tabId, 'mtab-2');
});

test('setRatio clamps panes to a minimum of 80px', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    const tab2 = await MT.createTab('C:\\dir2', false);
    MT.splitPane('mtab-1', 'row', tab2.id);
    MT.setRatio('pnode-0', 0.01);
    const host = harness.context.document.getElementById('main-tab-host');
    const split = host.children.find((c) => c.classList.contains('pane-split'));
    assert.equal(split.children[0].style.flexBasis, '10.0000%');
});

test('splits render a divider whose position tracks setRatio', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    const tab2 = await MT.createTab('C:\\dir2', false);
    MT.splitPane('mtab-1', 'row', tab2.id);

    const host = harness.context.document.getElementById('main-tab-host');
    const split = host.children.find((c) => c.classList.contains('pane-split'));
    const divider = split.children.find((c) => c.classList.contains('pane-divider'));
    assert.ok(divider, 'a .pane-divider must exist inside the split');
    assert.equal(divider.style.left, '50.0000%');

    MT.setRatio('pnode-0', 0.75);
    assert.equal(divider.style.left, '75.0000%');
});

test('removeLeaf collapses the split and activateTab swaps parked tabs into the focused leaf', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    const tab2 = await MT.createTab('C:\\dir2', false);
    MT.splitPane('mtab-1', 'row', tab2.id);
    MT.removeLeaf('mtab-1');
    assert.deepEqual(Array.from(MT.getVisibleTabIds()), ['mtab-2']);

    await MT.activateTab('mtab-1');
    assert.deepEqual(Array.from(MT.getVisibleTabIds()), ['mtab-1']);
    assert.equal(MT.getFocusedTabId(), 'mtab-1');
});

test('getPaneSlotEl returns the rendered slot element for a leaf', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    const tab2 = await MT.createTab('C:\\dir2', false);
    MT.splitPane('mtab-1', 'row', tab2.id);
    const slot1 = MT.getPaneSlotEl('mtab-1');
    const slot2 = MT.getPaneSlotEl('mtab-2');
    assert.ok(slot1 && slot2, 'both leaves must expose a slot');
    assert.equal(slot1.dataset.tabId, 'mtab-1');
    assert.equal(slot2.dataset.tabId, 'mtab-2');
});

test('splitTab splits the anchor with a new terminal on the chosen axis', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    await MT.splitTab('mtab-1', 'row', 'C:\\dir2');

    assert.deepEqual(Array.from(MT.getVisibleTabIds()), ['mtab-1', 'mtab-2']);
    assert.equal(MT.getFocusedTabId(), 'mtab-2');
    const host = harness.context.document.getElementById('main-tab-host');
    const split = host.children.find((c) => c.classList.contains('pane-split'));
    assert.equal(split.classList.contains('split-row'), true);
});

test('splitFocusedPane column splits downward from the focused tab', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    const tab2 = await MT.createTab('C:\\dir2', false);
    MT.splitPane('mtab-1', 'row', tab2.id);
    await MT.activateTab(tab2.id);
    await MT.splitFocusedPane('column', 'C:\\dir3');

    assert.deepEqual(Array.from(MT.getVisibleTabIds()), ['mtab-1', 'mtab-2', 'mtab-3']);
    const host = harness.context.document.getElementById('main-tab-host');
    const splits = host.querySelectorAll('.pane-split');
    assert.equal(splits.some((s) => s.classList.contains('split-col')), true);
});

test('splitTab without a directory opens the new-tab card and defers the split', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    // vm-sandbox traps (apply AFTER initTerminal): document.querySelector
    // returns a stub for any selector (the card would think one already
    // exists), and FakeElement lacks .closest (used by the card's
    // recent-dirs renderer).
    harness.context.document.querySelector = () => null;
    const fakeProto = Object.getPrototypeOf(harness.context.document.createElement('div'));
    if (!fakeProto.closest) fakeProto.closest = function () { return null; };
    await MT.splitTab('mtab-1', 'row');

    const body = harness.context.document.body;
    assert.equal(body.children.some((c) => c.classList.contains('new-tab-card-overlay')), true);
    assert.deepEqual(Array.from(MT.getVisibleTabIds()), ['mtab-1']);
});

test('Ctrl+Alt+Right matches the split_pane_right default', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const S = harness.context.window.MonolithShortcuts;
    const ev = { key: 'ArrowRight', ctrlKey: true, altKey: true, shiftKey: false, metaKey: false };
    assert.equal(S.shortcutMatches(ev, 'Ctrl+Alt+Right'), true);
    const evBad = { key: 'ArrowRight', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false };
    assert.equal(S.shortcutMatches(evBad, 'Ctrl+Alt+Right'), false);
});

function tabItemIds(children) {
    return children
        .filter((c) => c.classList.contains('main-tab'))
        .map((c) => c['data-tab-id']);
}

test('split leaves render as one capsule in tree order', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    await MT.createTab('C:\\dir2', false);
    await MT.createTab('C:\\dir3', false);
    MT.splitPane('mtab-1', 'row', 'mtab-2');

    const bar = harness.context.document.getElementById('main-tab-tabs');
    const capsule = bar.children.find((c) => c.classList.contains('main-tab-capsule'));
    assert.ok(capsule, 'a .main-tab-capsule must exist');
    assert.deepEqual(tabItemIds(capsule.children), ['mtab-1', 'mtab-2']);
    assert.deepEqual(tabItemIds(bar.children), ['mtab-3']);
    assert.ok(bar.children.indexOf(capsule) < bar.children.findIndex((c) => c['data-tab-id'] === 'mtab-3'),
        'capsule must sit where the first leaf was');
});

test('removeLeaf dissolves the capsule back to a flat row', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    await MT.createTab('C:\\dir2', false);
    MT.splitPane('mtab-1', 'row', 'mtab-2');
    MT.removeLeaf('mtab-2');

    const bar = harness.context.document.getElementById('main-tab-tabs');
    assert.equal(bar.children.some((c) => c.classList.contains('main-tab-capsule')), false);
    assert.deepEqual(tabItemIds(bar.children), ['mtab-1', 'mtab-2']);
});

function findContainer(root, tabId) {
    var want = 'main-tab-container-' + tabId;
    if (root && root.id === want) return root;
    var kids = (root && root.children) || [];
    for (var i = 0; i < kids.length; i++) {
        var hit = findContainer(kids[i], tabId);
        if (hit) return hit;
    }
    return null;
}

test('split flow keeps every pane container visible', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    await MT.splitTab('mtab-1', 'row', 'C:\\dir2');

    const host = harness.context.document.getElementById('main-tab-host');
    const c1 = findContainer(host, 'mtab-1');
    const c2 = findContainer(host, 'mtab-2');
    assert.ok(c1 && c2, 'both pane containers must exist');
    assert.equal(c1.classList.contains('active'), true, 'anchor pane must stay visible');
    assert.equal(c2.classList.contains('active'), true, 'new pane must be visible');
});

test('capsule grouping survives HTMLCollection children (no Array methods)', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    await MT.createTab('C:\\dir2', false);
    const bar = harness.context.document.getElementById('main-tab-tabs');
    // Real DOM: .children is an HTMLCollection with no Array methods.
    bar.children.slice = undefined;

    MT.splitPane('mtab-1', 'row', 'mtab-2');
    const capsule = bar.children.find((c) => c.classList.contains('main-tab-capsule'));
    assert.ok(capsule, 'capsule must form without Array methods on children');
    assert.deepEqual(tabItemIds(capsule.children), ['mtab-1', 'mtab-2']);

    capsule.children.slice = undefined;
    MT.removeLeaf('mtab-2');
    assert.equal(bar.children.some((c) => c.classList.contains('main-tab-capsule')), false);
});

test('hitPaneEdge detects 25% edge bands with horizontal tie-break', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    const rect = { left: 0, top: 0, width: 400, height: 300 };
    assert.equal(MT.hitPaneEdge(rect, 10, 150), 'left');
    assert.equal(MT.hitPaneEdge(rect, 390, 150), 'right');
    assert.equal(MT.hitPaneEdge(rect, 200, 10), 'top');
    assert.equal(MT.hitPaneEdge(rect, 200, 290), 'bottom');
    assert.equal(MT.hitPaneEdge(rect, 200, 150), null);
    assert.equal(MT.hitPaneEdge(rect, 500, 150), null);
    assert.equal(MT.hitPaneEdge(rect, 5, 5), 'left');
});

test('splitPane placeFirst puts the new leaf first', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    await MT.createTab('C:\\dir2', false);
    MT.splitPane('mtab-1', 'row', 'mtab-2', true);
    assert.deepEqual(Array.from(MT.getVisibleTabIds()), ['mtab-2', 'mtab-1']);
});

test('moveTabToPaneEdge moves a parked tab onto the anchor edge', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    await MT.createTab('C:\\dir2', false);
    await MT.moveTabToPaneEdge('mtab-2', 'mtab-1', 'right');
    assert.deepEqual(Array.from(MT.getVisibleTabIds()), ['mtab-1', 'mtab-2']);
    assert.equal(MT.getFocusedTabId(), 'mtab-2');
    await MT.moveTabToPaneEdge('mtab-2', 'mtab-1', 'left');
    assert.deepEqual(Array.from(MT.getVisibleTabIds()), ['mtab-2', 'mtab-1']);
});

test('ungroupTab collapses the pane but keeps the session alive', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const MT = harness.context.window.MonolithTerminal;
    await MT.initTerminal('C:\\dir');
    await MT.createTab('C:\\dir2', false);
    MT.splitPane('mtab-1', 'row', 'mtab-2');
    MT.ungroupTab('mtab-2');
    assert.deepEqual(Array.from(MT.getVisibleTabIds()), ['mtab-1']);
    assert.ok(MT.getTab('mtab-2'), 'ungrouped tab session must survive');
    const host = harness.context.document.getElementById('main-tab-host');
    assert.equal(MT.getTab('mtab-2').container.parentNode, host);
});
