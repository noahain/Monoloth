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
        onResize(cb) { this._onResize = cb; }
        dispose() {}
        resize(cols, rows) { this.cols = cols; this.rows = rows; if (this._onResize) this._onResize({ cols, rows }); }
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
            escapeHtml: (s) => String(s == null ? '' : s).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"').replace(/'/g,'&#39;'),
            silent(fn) { try { return fn && fn(); } catch (e) { return undefined; } },
            openModal() {},
            closeModal() {},
            isWindows: () => true,
            computeTermBgColors(bgType, bgLayer) {
                var isLight = document.body.classList.contains('light-mode') || document.body.classList.contains('adaptive-light');
                var bg, black;
                if (bgLayer === 'overlay') { bg = '#000000'; black = '#000000'; }
                else if (bgType !== 'none') { bg = 'transparent'; black = 'rgba(10, 10, 10, 0)'; }
                else { bg = isLight ? '#f5f5f5' : '#0a0a0a'; black = bg; }
                return { background: bg, black: black, isLight: isLight };
            }
        },
        MonolithCtxMenu: {
            createContextMenu() {},
            shortcutHtml() { return ''; }
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

    const terminalViewSource = fs.readFileSync('frontend/lib/terminal-view.js', 'utf8');
    vm.runInContext(terminalViewSource, context, { filename: 'frontend/lib/terminal-view.js' });

    const sidebarSource = fs.readFileSync('frontend/sidebar.js', 'utf8');
    vm.runInContext(sidebarSource, context, { filename: 'frontend/sidebar.js' });

    return {
        context,
        getWebglLoadCount: () => webglLoadCount,
        getLastTerminal: () => lastTerminal
    };
}

test('CMD panel uses opaque canvas when bg type is none', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    await harness.context.window.SidebarManager.createTab(null, true, 'C:\\repo');
    assert.equal(harness.getWebglLoadCount(), 0, 'panel must never load WebGL');
    const term = harness.getLastTerminal();
    assert.equal(term.options.allowTransparency, false, 'panel must use opaque canvas when no wallpaper');
    assert.equal(term.options.theme.background, '#0a0a0a', 'panel bg must match main terminal for none type');
});

test('switchToMainTab hides the OLD group containers (regression: panel tabs from previous main tab were leaking)', async () => {
    // Bug: switchToMainTab read the "old group" via _getActiveGroup(), which calls
    // MonolithTerminal.getActiveTabId(). By the time terminal.js's hook calls
    // switchToMainTab (terminal.js:231-233), terminal.js has already updated its
    // own _activeTabId to the NEW main tab. So _getActiveGroup() returned the NEW
    // group (or null for a not-yet-created group), and the OLD group's containers
    // were never hidden. New panel tabs created in the NEW group visually overlapped
    // with the still-visible OLD group containers.
    //
    // Fix: read sidebar.js's own _activeMainTabId (still the OLD value here) instead
    // of asking terminal.js.

    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });

    // Mimic app.js bootstrap: sidebar.js's _activeMainTabId starts as the initial main tab.
    harness.context.window.SidebarManager.initForMainTab('mtab-1');

    // Simulate terminal.js reporting the current active main tab.
    // Start with mtab-1 so createTab (without explicit mainTabId) puts tabs in mtab-1.
    let terminalActiveTab = 'mtab-1';
    harness.context.window.MonolithTerminal.getActiveTabId = function () { return terminalActiveTab; };

    // Create 2 panel tabs in mtab-1.
    await harness.context.window.SidebarManager.createTab(null, true, 'C:\\repo');
    await harness.context.window.SidebarManager.createTab(null, true, 'C:\\repo');

    // Create 1 panel tab in mtab-2 (passing mainTabId explicitly).
    await harness.context.window.SidebarManager.createTab(null, true, 'C:\\repo', 'mtab-2');

    // Save container references while terminal.js still says mtab-1 is active.
    const mtab1Tabs = harness.context.window.SidebarManager.getAllTabs();
    assert.equal(mtab1Tabs.length, 2, 'expected 2 panel tabs in mtab-1');
    const mtab1ContainerA = mtab1Tabs[0].container;
    const mtab1ContainerB = mtab1Tabs[1].container;

    // Get mtab-2's tab via getTab (uses tabId, not active main tab).
    const mtab2Container = harness.context.window.SidebarManager.getTab('ptab-mtab-2-1').container;

    // Simulate terminal.js having already switched its active tab to mtab-2.
    // This is the production order: terminal.js sets _activeTabId, then calls
    // SidebarManager.switchToMainTab(tabId) at terminal.js:232.
    terminalActiveTab = 'mtab-2';

    // Trigger the switch.
    harness.context.window.SidebarManager.switchToMainTab('mtab-2');

    // The OLD group (mtab-1) containers must be hidden.
    assert.equal(mtab1ContainerA.style.display, 'none',
        'mtab-1 first panel container should be hidden after switching to mtab-2');
    assert.equal(mtab1ContainerB.style.display, 'none',
        'mtab-1 second panel container should be hidden after switching to mtab-2');

    // The NEW group (mtab-2) container must be visible.
    assert.equal(mtab2Container.style.display, '',
        'mtab-2 panel container should be visible after switching to mtab-2');
});

test('looksLikePrompt clears busy dot with ANSI-colored prompt at start of chunk', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    await harness.context.window.SidebarManager.createTab(null, true, 'C:\\test');
    const tabs = harness.context.window.SidebarManager.getAllTabs();
    const tab = tabs[0];
    tab.busy = true;
    harness.context.window.SidebarManager.writeToTab(tab.id, '\x1B[32mPS C:\\test> \x1B[0m', false);
    assert.equal(tab.busy, false, 'busy should be cleared after ANSI-colored prompt');
});
