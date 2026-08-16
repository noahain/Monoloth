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
        this._top = 0;
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
    closest(selector) {
        let el = this;
        const cls = selector.startsWith('.') ? selector.slice(1) : selector;
        while (el) {
            if (el.classList && el.classList.contains(cls)) return el;
            if (el.className && String(el.className).split(/\s+/).includes(cls)) return el;
            el = el.parentNode;
        }
        return null;
    }
    getBoundingClientRect() {
        return { top: this._top || 0, bottom: (this._top || 0) + 24, height: 24, left: 0, width: 200, right: 200, x: 0, y: this._top || 0 };
    }
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
        eventListeners: {},
        addEventListener(type, handler) {
            if (!this.eventListeners[type]) this.eventListeners[type] = [];
            this.eventListeners[type].push(handler);
        },
        removeEventListener(type, handler) {
            if (!this.eventListeners[type]) return;
            this.eventListeners[type] = this.eventListeners[type].filter((fn) => fn !== handler);
        },
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
        querySelector(selector) {
            if (selector.startsWith('#')) {
                const id = selector.split(' ')[0].slice(1).split('.')[0].split('[')[0];
                return this.getElementById(id);
            }
            return this.getElementById('selector:' + selector);
        },
        querySelectorAll(selector) {
            if (selector === '#tab-sidebar .sidebar-setting-row') {
                const container = this.getElementById('tab-sidebar');
                return container.children.filter(c => c.classList.contains('sidebar-setting-row') || String(c.className||'').split(/\s+/).includes('sidebar-setting-row'));
            }
            return [];
        }
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
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });

    harness.context.window.SidebarManager.initForMainTab('mtab-1');

    let terminalActiveTab = 'mtab-1';
    harness.context.window.MonolithTerminal.getActiveTabId = function () { return terminalActiveTab; };

    await harness.context.window.SidebarManager.createTab(null, true, 'C:\\repo');
    await harness.context.window.SidebarManager.createTab(null, true, 'C:\\repo');

    await harness.context.window.SidebarManager.createTab(null, true, 'C:\\repo', 'mtab-2');

    const mtab1Tabs = harness.context.window.SidebarManager.getAllTabs();
    assert.equal(mtab1Tabs.length, 2, 'expected 2 panel tabs in mtab-1');
    const mtab1ContainerA = mtab1Tabs[0].container;
    const mtab1ContainerB = mtab1Tabs[1].container;

    const mtab2Container = harness.context.window.SidebarManager.getTab('ptab-mtab-2-1').container;

    terminalActiveTab = 'mtab-2';

    harness.context.window.SidebarManager.switchToMainTab('mtab-2');

    assert.equal(mtab1ContainerA.style.display, 'none',
        'mtab-1 first panel container should be hidden after switching to mtab-2');
    assert.equal(mtab1ContainerB.style.display, 'none',
        'mtab-1 second panel container should be hidden after switching to mtab-2');

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

test('drag reorder via DOM events reorders sidebar config', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const doc = harness.context.document;
    const win = harness.context.window;

    let savedConfig = null;
    win.monolithApi.set_config = (key, val) => {
        if (key === 'sidebar_config') savedConfig = JSON.parse(JSON.stringify(val));
        return Promise.resolve();
    };

    await new Promise(r => setTimeout(r, 30));
    if (win.SidebarManager.renderSettingsTab) win.SidebarManager.renderSettingsTab();

    const container = doc.getElementById('tab-sidebar');
    container.children = [];
    container.innerHTML = '';

    function makeRow(id, type, top) {
        const row = doc.createElement('div');
        row.className = 'sidebar-setting-row';
        row.classList.add('sidebar-setting-row');
        row.dataset.id = id;
        row.dataset.type = type;
        row._top = top;
        row.getBoundingClientRect = () => ({ top, bottom: top + 24, height: 24, left: 0, width: 200, right: 200, x: 0, y: top });
        const handle = doc.createElement('span');
        handle.className = 'sidebar-drag-handle';
        handle.classList.add('sidebar-drag-handle');
        row.appendChild(handle);
        return { row, handle };
    }

    const a = makeRow('open_folder', 'default', 0);
    const b = makeRow('open_cmd_project', 'default', 24);
    const c = makeRow('open_cmd_panel', 'default', 48);
    container.appendChild(a.row);
    container.appendChild(b.row);
    container.appendChild(c.row);

    const originalQSA = doc.querySelectorAll.bind(doc);
    doc.querySelectorAll = (sel) => {
        if (sel === '#tab-sidebar .sidebar-setting-row') return [a.row, b.row, c.row];
        return originalQSA(sel);
    };

    const mousedownHandlers = container.eventListeners['mousedown'] || [];
    assert.ok(mousedownHandlers.length > 0, 'drag mousedown handler should be wired');
    const onMousedown = mousedownHandlers[0];
    const mousedownEvent = {
        target: c.handle,
        preventDefault() {}
    };
    onMousedown(mousedownEvent);

    const moveHandlers = doc.eventListeners['mousemove'] || [];
    const upHandlers = doc.eventListeners['mouseup'] || [];
    assert.ok(moveHandlers.length > 0, 'mousemove should be registered after mousedown');
    assert.ok(upHandlers.length > 0, 'mouseup should be registered after mousedown');

    const moveEvent = { clientY: 10 };
    moveHandlers.forEach(fn => fn(moveEvent));
    assert.equal(a.row.classList.contains('drag-over'), true, 'target row should have drag-over');

    const upEvent = { clientY: 10 };
    upHandlers.forEach(fn => fn(upEvent));

    await new Promise(r => setTimeout(r, 450));

    assert.ok(savedConfig, 'config should have been saved after drag');
    const ids = savedConfig.buttons.map(b => b.id);
    const idxA = ids.indexOf('open_folder');
    const idxB = ids.indexOf('open_cmd_project');
    const idxC = ids.indexOf('open_cmd_panel');
    assert.ok(idxC < idxA && idxA < idxB, `expected order c,a,b after drag but got ${ids.join(',')}`);
});

test('panel groups are isolated per main tab', async () => {
    const harness = createHarness({ type: 'none', layer: 'behind', transparency: 75 });
    const win = harness.context.window;
    win.SidebarManager.initForMainTab('mtab-1');
    await win.SidebarManager.createTab(null, true, 'C:\\repo');
    await win.SidebarManager.createTab(null, true, 'C:\\repo');
    assert.equal(win.SidebarManager.getAllTabs().length, 2, 'mtab-1 should have 2 tabs initially');
    await win.SidebarManager.createTab(null, true, 'C:\\repo', 'mtab-2');
    assert.equal(win.SidebarManager.getAllTabs().length, 2, 'active group still mtab-1 after creating mtab-2 tab');
    win.SidebarManager.switchToMainTab('mtab-2');
    const mtab2Tabs = win.SidebarManager.getAllTabs();
    assert.equal(mtab2Tabs.length, 1, 'mtab-2 should have 1 tab after switch');
    assert.equal(mtab2Tabs[0].mainTabId, 'mtab-2');
    win.SidebarManager.switchToMainTab('mtab-1');
    const backTabs = win.SidebarManager.getAllTabs();
    assert.equal(backTabs.length, 2, 'switch back should restore mtab-1 tabs');
});
