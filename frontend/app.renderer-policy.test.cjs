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
