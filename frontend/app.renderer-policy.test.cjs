const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class FakeClassList {
    constructor() {
        this.classes = new Set();
    }

    add(...classes) {
        classes.forEach((cls) => this.classes.add(cls));
    }

    remove(...classes) {
        classes.forEach((cls) => this.classes.delete(cls));
    }

    contains(cls) {
        return this.classes.has(cls);
    }

    toggle(cls, force) {
        if (force === undefined) {
            force = !this.classes.has(cls);
        }
        if (force) this.classes.add(cls);
        else this.classes.delete(cls);
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

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        this.children = this.children.filter((item) => item !== child);
        child.parentNode = null;
        return child;
    }

    remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
    }

    querySelector() {
        return new FakeElement('nested');
    }

    querySelectorAll() {
        return [];
    }

    setAttribute(name, value) {
        this[name] = value;
    }

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
        createElement(tag) {
            return new FakeElement(tag);
        },
        createTextNode(text) {
            const el = new FakeElement('text');
            el.textContent = String(text);
            return el;
        },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, new FakeElement(id));
            return elements.get(id);
        },
        querySelector(selector) {
            return this.getElementById(`selector:${selector}`);
        },
        querySelectorAll() {
            return [];
        }
    };
    document.body.appendChild = FakeElement.prototype.appendChild.bind(document.body);
    return document;
}

function createHarness(backgroundConfig) {
    const document = createDocument();
    let webglLoadCount = 0;

    class FakeTerminal {
        constructor(options) {
            this.options = options || {};
            this.rows = 24;
            this.cols = 80;
            this.element = new FakeElement('xterm');
        }

        open(container) {
            container.appendChild(this.element);
        }

        loadAddon(addon) {
            if (addon && addon.__isWebglAddon) webglLoadCount += 1;
            if (addon && typeof addon.activate === 'function') addon.activate(this);
        }

        focus() {}
        attachCustomKeyEventHandler() {}
        getSelection() { return ''; }
        hasSelection() { return false; }
        clearSelection() {}
        write() {}
        writeln() {}
        onData() {}
        dispose() {}
        onScroll() {}
        refresh() {}
        resize(cols, rows) {
            this.cols = cols;
            this.rows = rows;
        }

        getOption(name) {
            return this.options[name];
        }

        setOption(name, value) {
            this.options[name] = value;
        }
    }

    class FakeWebglAddon {
        constructor() {
            this.__isWebglAddon = true;
        }

        dispose() {}
    }

    const monolithApi = new Proxy({
        get_background_config: () => Promise.resolve(backgroundConfig),
        get_shortcuts: () => Promise.resolve({}),
        get_profiles: () => Promise.resolve({ success: true, profiles: [], active: 'Default' }),
        get_startup_config: () => Promise.resolve({ command: 'opencode', type: 'preset' }),
        get_secondary_commands: () => Promise.resolve([]),
        get_recent_directories: () => Promise.resolve([]),
        get_last_directory: () => Promise.resolve({ success: false }),
        get_file_picker_type: () => Promise.resolve('custom'),
        get_config: () => Promise.resolve(false),
        set_recent_directories: () => Promise.resolve(),
        save_last_directory: () => Promise.resolve(),
        start_terminal: () => Promise.resolve({ success: true, generation: 1 }),
        resize_terminal: () => Promise.resolve(),
        send_input: () => Promise.resolve(),
        terminate_terminal: () => Promise.resolve(),
        is_window_maximized: () => Promise.resolve({ maximized: false })
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
            constructor() {
                this.width = 100;
                this.height = 100;
                this.onload = null;
                this.onerror = null;
            }

            set src(value) {
                this._src = value;
                if (this.onload) setTimeout(() => this.onload(), 0);
            }

            get src() {
                return this._src;
            }
        },
        ResizeObserver: class { observe() {} disconnect() {} },
        requestAnimationFrame: (fn) => {
            fn();
            return 1;
        },
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

    const updaterToastSource = fs.readFileSync('frontend/lib/updater-toast.js', 'utf8');
    vm.runInContext(updaterToastSource, context, { filename: 'frontend/lib/updater-toast.js' });

    const shortcutsSource = fs.readFileSync('frontend/shortcuts.js', 'utf8');
    vm.runInContext(shortcutsSource, context, { filename: 'frontend/shortcuts.js' });

    const themeSource = fs.readFileSync('frontend/theme.js', 'utf8');
    vm.runInContext(themeSource, context, { filename: 'frontend/theme.js' });

    const dialogSource = fs.readFileSync('frontend/dialog.js', 'utf8');
    vm.runInContext(dialogSource, context, { filename: 'frontend/dialog.js' });

    const filePickerSource = fs.readFileSync('frontend/file-picker.js', 'utf8');
    vm.runInContext(filePickerSource, context, { filename: 'frontend/file-picker.js' });

    const commandPaletteSource = fs.readFileSync('frontend/command-palette.js', 'utf8');
    vm.runInContext(commandPaletteSource, context, { filename: 'frontend/command-palette.js' });

    const profilesSource = fs.readFileSync('frontend/profiles.js', 'utf8');
    vm.runInContext(profilesSource, context, { filename: 'frontend/profiles.js' });

    const terminalSource = fs.readFileSync('frontend/terminal.js', 'utf8');
    vm.runInContext(terminalSource, context, { filename: 'frontend/terminal.js' });

    const source = fs.readFileSync('frontend/app.js', 'utf8');
    vm.runInContext(source, context, { filename: 'frontend/app.js' });

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
        }
    };
}

test('does not load WebGL when the terminal background is transparent', async () => {
    const harness = createHarness({
        type: 'image',
        image: 'C:\\wallpaper.png',
        imageUrl: 'file:///C:/wallpaper.png',
        transparency: 75,
        bgLayer: 'behind',
        themeMode: 'dark',
        ctaButtonStyle: 'blur'
    });

    await flushAsync();
    harness.context.window.MonolothApp.restartSession('main');
    await flushAsync();

    assert.equal(harness.getWebglLoadCount(), 0);
});

test('showTerminal waits for previous main session termination before starting another', async () => {
    const harness = createHarness({
        type: 'none',
        image: '',
        imageUrl: '',
        transparency: 75,
        bgLayer: 'behind',
        themeMode: 'dark',
        ctaButtonStyle: 'blur'
    });

    await flushAsync();
    let releaseTerminate;
    let startCalls = 0;
    harness.context.window.monolithApi.terminate_terminal = () => new Promise((resolve) => { releaseTerminate = resolve; });
    harness.context.window.monolithApi.start_terminal = () => {
        startCalls += 1;
        return Promise.resolve({ success: true, generation: 2 });
    };
    harness.context.window.MonolithTerminal.setRunning(true);

    harness.context.window.MonolothApp.showTerminal('C:\\repo');
    await flushAsync();
    assert.equal(startCalls, 0);

    releaseTerminate();
    await flushAsync();
    assert.equal(startCalls, 1);
});

test('showTerminal ignores stale delayed launches when a newer launch starts', async () => {
    const harness = createHarness({
        type: 'none',
        image: '',
        imageUrl: '',
        transparency: 75,
        bgLayer: 'behind',
        themeMode: 'dark',
        ctaButtonStyle: 'blur'
    });

    await flushAsync();
    let releaseFirstTerminate;
    const startedDirs = [];
    harness.context.window.monolithApi.terminate_terminal = () => new Promise((resolve) => { releaseFirstTerminate = resolve; });
    harness.context.window.monolithApi.start_terminal = (_sessionId, dir) => {
        startedDirs.push(dir);
        return Promise.resolve({ success: true, generation: startedDirs.length + 1 });
    };
    harness.context.window.MonolithTerminal.setRunning(true);

    harness.context.window.MonolothApp.showTerminal('C:\\old');
    harness.context.window.MonolothApp.showTerminal('C:\\new');
    await flushAsync();
    assert.deepEqual(startedDirs, ['C:\\new']);

    releaseFirstTerminate();
    await flushAsync();
    assert.deepEqual(startedDirs, ['C:\\new']);
});

test('titlebar refresh ignores late EOF from the previous main generation', async () => {
    const harness = createHarness({
        type: 'none',
        image: '',
        imageUrl: '',
        transparency: 75,
        bgLayer: 'behind',
        themeMode: 'dark',
        ctaButtonStyle: 'blur'
    });
    const timers = installTimerControls(harness.context);
    let startCalls = 0;
    let releaseRefreshStart;
    let backToLandingCalls = 0;

    harness.context.window.monolithApi.start_terminal = () => {
        startCalls += 1;
        if (startCalls === 1) return Promise.resolve({ success: true, generation: 1 });
        return new Promise((resolve) => { releaseRefreshStart = () => resolve({ success: true, generation: 2 }); });
    };
    harness.context.window.monolithApi.terminate = () => Promise.resolve();
    harness.context.window.MonolothApp.backToLanding = () => { backToLandingCalls += 1; };

    await flushAsync();
    harness.context.window.MonolothApp.showTerminal('C:\\repo');
    await flushAsync();

    const refreshButton = harness.context.document.getElementById('tb-refresh');
    refreshButton.eventListeners.click[0]();
    await flushAsync();
    assert.equal(startCalls, 2);

    harness.context.window.writeToTerm('', true, 'main', 1);
    timers.tick(1, 5);

    assert.equal(backToLandingCalls, 0, 'old EOF must not start auto-return after refresh begins');
    releaseRefreshStart();
    await flushAsync();
});

test('main restartSession ignores late EOF from the previous generation', async () => {
    const harness = createHarness({
        type: 'none',
        image: '',
        imageUrl: '',
        transparency: 75,
        bgLayer: 'behind',
        themeMode: 'dark',
        ctaButtonStyle: 'blur'
    });
    const timers = installTimerControls(harness.context);
    let startCalls = 0;
    let releaseRestartStart;
    let backToLandingCalls = 0;

    harness.context.window.monolithApi.start_terminal = () => {
        startCalls += 1;
        if (startCalls === 1) return Promise.resolve({ success: true, generation: 1 });
        return new Promise((resolve) => { releaseRestartStart = () => resolve({ success: true, generation: 2 }); });
    };
    harness.context.window.monolithApi.terminate_terminal = () => Promise.resolve();
    harness.context.window.MonolothApp.backToLanding = () => { backToLandingCalls += 1; };

    await flushAsync();
    harness.context.window.MonolothApp.showTerminal('C:\\repo');
    await flushAsync();

    harness.context.window.MonolothApp.restartSession('main');
    await flushAsync();
    assert.equal(startCalls, 2);

    harness.context.window.writeToTerm('', true, 'main', 1);
    timers.tick(1, 5);

    assert.equal(backToLandingCalls, 0, 'old EOF must not start auto-return after restart begins');
    releaseRestartStart();
    await flushAsync();
});

test('panel-tab restart ignores late EOF from the previous generation', async () => {
    const harness = createHarness({
        type: 'none',
        image: '',
        imageUrl: '',
        transparency: 75,
        bgLayer: 'behind',
        themeMode: 'dark',
        ctaButtonStyle: 'blur'
    });
    const tab = {
        id: 'tab-1',
        sessionId: 'panel-tab-1',
        term: { dispose() {} },
        fitAddon: { dispose() {} },
        container: { querySelector: () => ({ innerHTML: '' }) },
        running: false,
        busy: false,
        generation: 5,
        closing: false
    };
    let eofWrites = 0;

    await flushAsync();
    harness.context.window.MonolithTerminal.initTerminal('C:\\repo');
    await flushAsync();
    harness.context.window.MonolithTerminal.setSessionGeneration('panel-tab-1', 5);
    harness.context.window.monolithApi.terminate_terminal = () => Promise.resolve();
    harness.context.window.SidebarManager = {
        getTab: () => tab,
        getActiveTabId: () => 'tab-1',
        hideTabExitBanner() {},
        initTabXterm() {},
        writeToTab(_tabId, _data, eof) { if (eof) eofWrites += 1; }
    };

    harness.context.window.MonolothApp.restartSession('panel-tab-1');
    await flushAsync();
    harness.context.window.writeToTerm('', true, 'panel-tab-1', 5);

    assert.equal(eofWrites, 0, 'old panel EOF must not mark the restarted tab as exited');
});

// Regression for bug 1: the async start_terminal callback inside initTerminal's
// requestAnimationFrame must not write to a terminal instance that has been
// replaced by a newer initTerminal call (e.g. titlebar refresh during slow spawn).
test('initTerminal ignores late start_terminal result after a new terminal is created', async () => {
    const harness = createHarness({
        type: 'none',
        image: '',
        imageUrl: '',
        transparency: 75,
        bgLayer: 'behind',
        themeMode: 'dark',
        ctaButtonStyle: 'blur'
    });
    const T = harness.context.window.MonolithTerminal;
    let resolveFirst;
    harness.context.window.monolithApi.start_terminal = () => new Promise((resolve) => { resolveFirst = resolve; });
    T.initTerminal('C:\\old');
    await flushAsync();
    const oldTerm = T.getTerm();

    // Start a second terminal while the first start_terminal is still pending.
    harness.context.window.monolithApi.start_terminal = () => Promise.resolve({ success: true, generation: 2 });
    T.initTerminal('C:\\new');
    await flushAsync();
    const newTerm = T.getTerm();
    assert.notStrictEqual(oldTerm, newTerm, 'initTerminal must replace the terminal instance');

    // The original RAF callback's start_terminal finally resolves with a failure.
    // It must NOT call writeln on the new terminal (which would write "Failed to
    // start" onto the live terminal after the user already started a new one).
    const writeSpyCalls = [];
    const origWrite = newTerm.write.bind(newTerm);
    newTerm.write = function (data) { writeSpyCalls.push(data); return origWrite(data); };
    resolveFirst({ success: false, error: 'late' });
    await flushAsync();

    const lateFailureWrites = writeSpyCalls.filter((d) => /Failed to start/.test(d));
    assert.equal(lateFailureWrites.length, 0,
        'late start_terminal failure must not write onto the replacement terminal');
});
