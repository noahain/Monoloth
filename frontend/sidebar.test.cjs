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
        this.parentElement = null;
        this.style = { setProperty(name, value) { this[name] = value; } };
        this.offsetWidth = 800;
        this.offsetHeight = 240;
        this.clientWidth = 800;
        this.clientHeight = 240;
        this.innerHTML = '';
        this.textContent = '';
        this.value = '';
        this.className = '';
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
        child.parentElement = this;
        this.children.push(child);
        return child;
    }
    insertBefore(child, reference) {
        child.parentNode = this;
        child.parentElement = this;
        var index = this.children.indexOf(reference);
        if (index === -1) this.children.push(child); else this.children.splice(index, 0, child);
        return child;
    }
    removeChild(child) {
        this.children = this.children.filter((item) => item !== child);
        child.parentNode = null;
        child.parentElement = null;
        return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    querySelector(selector) {
        if (selector[0] === '.') {
            var className = selector.slice(1).split('[')[0];
            var found = findChildByClass(this, className);
            if (found) return found;
        }
        return new FakeElement('nested:' + selector);
    }
    querySelectorAll() { return []; }
    setAttribute(name, value) { this[name] = value; }
    removeAttribute(name) { delete this[name]; }
    scrollIntoView() {}
    focus() {}
    select() {}
    click() {}
}

function findChildByClass(element, className) {
    for (const child of element.children) {
        if (String(child.className || '').split(/\s+/).includes(className) || child.classList.contains(className)) {
            return child;
        }
        const nested = findChildByClass(child, className);
        if (nested) return nested;
    }
    return null;
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
        querySelector(selector) { return this.getElementById('selector:' + selector); },
        querySelectorAll() { return []; }
    };
    return document;
}

function createHarness(bgState) {
    const document = createDocument();
    let webglLoadCount = 0;
    let lastTerminal = null;

    class FakeTerminal {
        constructor(options) {
            this.options = options || {};
            this.rows = 24;
            this.cols = 80;
            this.element = new FakeElement('xterm');
            lastTerminal = this;
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
        write() {}
        writeln() {}
        onData() {}
        dispose() {}
        resize(cols, rows) { this.cols = cols; this.rows = rows; }
    }

    class FakeWebglAddon {
        constructor() { this.__isWebglAddon = true; }
        onContextLoss() {}
        dispose() {}
    }

    const monolithApi = new Proxy({
        get_config: () => Promise.resolve(null),
        set_config: () => Promise.resolve(),
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
        matchMedia: () => ({ matches: false }),
        MonolothUI: {
            forceReflow() {},
            silent(fn) { try { return fn && fn(); } catch (e) { return undefined; } },
            openModal() {},
            closeModal() {},
            isWindows: () => true
        },
        MonolothTooltip: { cleanup() {}, attach() {}, scan() {} },
        MonolithTheme: {
            getTerminalDarkTheme: () => ({ background: '#0a0a0a', black: '#0a0a0a' }),
            getTerminalLightTheme: () => ({ background: '#f5f5f5', black: '#f5f5f5' })
        },
        MonolithShortcuts: { shortcutMatches: () => false, getShortcut: () => null },
        MonolithTerminal: { updateTabBarVisibility() {} },
        MonolothApp: {
            getCurrentDir: () => 'C:\\repo',
            getBgState: () => bgState,
            setSessionGeneration() {},
            refitTerminals() {}
        }
    };
    window.window = window;

    const context = {
        console,
        document,
        window,
        navigator: { clipboard: { writeText: () => Promise.resolve('') } },
        Terminal: FakeTerminal,
        FitAddon: { FitAddon: class FakeFitAddon {
            activate(terminal) { this._terminal = terminal; }
            proposeDimensions() { return { cols: 88, rows: 14 }; }
            fit() { if (this._terminal) this._terminal.resize(88, 14); }
            dispose() {}
        } },
        WebglAddon: { WebglAddon: FakeWebglAddon },
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

    const sidebarSource = fs.readFileSync('frontend/sidebar.js', 'utf8');
    vm.runInContext(sidebarSource, context, { filename: 'frontend/sidebar.js' });

    return {
        context,
        getWebglLoadCount: () => webglLoadCount,
        getLastTerminal: () => lastTerminal
    };
}

test('CMD panel always uses transparent canvas with no WebGL', async () => {
    // The panel xterm reverts to the pre-beta simple setup: hardcoded transparent
    // theme + allowTransparency:true + no WebGL addon. The container's CSS handles
    // the visual background (blur/glass/solid tint).
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    await harness.context.window.SidebarManager.createTab(null, true, 'C:\\repo');
    assert.equal(harness.getWebglLoadCount(), 0, 'panel must never load WebGL');
    const term = harness.getLastTerminal();
    assert.equal(term.options.allowTransparency, true, 'panel must allow transparency');
    assert.equal(term.options.theme.background, 'transparent', 'panel bg must be transparent');
});
