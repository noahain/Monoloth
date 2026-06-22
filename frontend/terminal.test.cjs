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
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    querySelector() { return new FakeElement('nested'); }
    querySelectorAll() { return []; }
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
        refresh() { this.refreshCount = (this.refreshCount || 0) + 1; }
        resize(cols, rows) { this.cols = cols; this.rows = rows; this.resizeCount = (this.resizeCount || 0) + 1; }
        getOption(name) { return this.options[name]; }
        setOption(name, value) { this.options[name] = value; }
    }

    class FakeWebglAddon {
        constructor() { this.__isWebglAddon = true; }
        dispose() {}
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
// These pin the fix for terminal corruption on repaint/resize: the PTY must be
// resized before xterm, and refit must NOT force a synchronous term.refresh()
// (which paints the transitional reflow buffer that diff-based TUI apps never
// overwrite -> frozen edges + random middle characters).

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

test('refit resizes the PTY before xterm', async () => {
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

    assert.deepEqual(order, ['pty:40x10', 'term:40x10'],
        'PTY resize must precede xterm resize, both at the final dimensions');
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
