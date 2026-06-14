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
        refresh() {}
        resize(cols, rows) { this.cols = cols; this.rows = rows; }
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
            fit() {
                if (!this._terminal) return;
                var el = this._terminal.element;
                var parent = el && el.parentNode;
                if (!parent) return;
                var cols = Math.max(2, Math.floor(parent.clientWidth / 9));
                var rows = Math.max(1, Math.floor(parent.clientHeight / 17));
                if (this._terminal.cols !== cols || this._terminal.rows !== rows) {
                    this._terminal.resize(cols, rows);
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

    const shortcutsSource = fs.readFileSync('frontend/shortcuts.js', 'utf8');
    vm.runInContext(shortcutsSource, context, { filename: 'frontend/shortcuts.js' });

    const themeSource = fs.readFileSync('frontend/theme.js', 'utf8');
    vm.runInContext(themeSource, context, { filename: 'frontend/theme.js' });

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
