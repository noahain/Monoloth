const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BRIDGE_JS = fs.readFileSync(path.join(__dirname, 'tauri-bridge.js'), 'utf8');
const TABS_JS = fs.readFileSync(path.join(__dirname, 'tabs.js'), 'utf8');

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESERVED_IDS = new Set(['main', 'panel']);

class FakeClassList {
    constructor() { this._set = new Set(); }
    add(...cs) { cs.forEach((c) => this._set.add(c)); }
    remove(...cs) { cs.forEach((c) => this._set.delete(c)); }
    contains(c) { return this._set.has(c); }
    toggle(c, force) {
        if (force === undefined) force = !this._set.has(c);
        if (force) this._set.add(c); else this._set.delete(c);
        return force;
    }
}

class FakeElement {
    constructor(tag) {
        this.tagName = tag || 'div';
        this.id = '';
        this.children = [];
        this.classList = new FakeClassList();
        this.dataset = {};
        this.eventListeners = {};
        this.parentNode = null;
        this.style = {};
        this.attrs = {};
        this.textContent = '';
        this.innerHTML = '';
        this.className = '';
        this.clientWidth = 800;
        this.clientHeight = 600;
        this.offsetWidth = 800;
        this.offsetHeight = 600;
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
    insertBefore(child, ref) {
        child.parentNode = this;
        const idx = ref ? this.children.indexOf(ref) : this.children.length;
        if (idx < 0) this.children.push(child);
        else this.children.splice(idx, 0, child);
        return child;
    }
    removeChild(child) {
        this.children = this.children.filter((c) => c !== child);
        child.parentNode = null;
        return child;
    }
    remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
    }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k]; }
    querySelector(selector) { return new FakeElement('match'); }
    querySelectorAll(selector) {
        if (selector === '.tab.active') {
            const out = [];
            const visit = (el) => {
                for (const c of el.children) {
                    if (c.classList && c.classList.contains('tab') && c.classList.contains('active')) {
                        out.push(c);
                    }
                    if (c.children && c.children.length) visit(c);
                }
            };
            visit(this);
            return out;
        }
        return [];
    }
    contains(node) {
        if (node === this) return true;
        if (!this.children) return false;
        return this.children.some((c) => c.contains && c.contains(node));
    }
    getBoundingClientRect() {
        return { top: 0, left: 0, width: 100, height: 32, right: 100, bottom: 32 };
    }
    get firstChild() { return this.children[0] || null; }
    get parentElement() { return this.parentNode; }
    focus() {}
    click() {}
    dispatchEvent() {}
}

function createDocument() {
    const elements = new Map();
    const doc = {
        readyState: 'loading',
        body: new FakeElement('body'),
        documentElement: new FakeElement('html'),
        addEventListener(type, handler) {
            if (!this._listeners) this._listeners = {};
            if (!this._listeners[type]) this._listeners[type] = [];
            this._listeners[type].push(handler);
        },
        removeEventListener() {},
        dispatchEvent(event) {
            if (!this._listeners) return;
            const handlers = this._listeners[event.type] || [];
            for (const h of handlers) h(event);
        },
        createElement(tag) { return new FakeElement(tag); },
        getElementById(id) {
            if (!elements.has(id)) {
                const el = new FakeElement('div');
                el.id = id;
                elements.set(id, el);
            }
            return elements.get(id);
        },
        querySelector() { return null; },
        querySelectorAll() { return []; },
    };
    return doc;
}

function makeInvokeHarness(initialConfig) {
    const calls = [];
    const config = JSON.parse(JSON.stringify(initialConfig));
    let nextGen = 1;
    const invoke = (cmd, args) => {
        const a = args || {};
        calls.push({ cmd, args: a });
        if (cmd === 'get_tabs_config') return Promise.resolve(JSON.parse(JSON.stringify(config)));
        if (cmd === 'create_tab') {
            const tab = {
                id: a.tabId,
                profile: a.profile,
                pinned: false,
                color: null,
                activeView: 'primary',
                dir: a.dir || null,
                secondaryCount: 0,
            };
            return Promise.resolve([tab, [[a.tabId, nextGen++]]]);
        }
        if (cmd === 'restore_tab_sessions') {
            return Promise.resolve([JSON.parse(JSON.stringify(config.tabs)), []]);
        }
        if (cmd === 'set_active_tab') {
            config.activeTabId = a.tabId;
            return Promise.resolve();
        }
        if (cmd === 'set_tabs_config') {
            Object.assign(config, a.cfg || {});
            return Promise.resolve();
        }
        if (cmd === 'get_config' && a.key === 'last_directory') return Promise.resolve(null);
        if (cmd === 'get_config' && a.key === 'active_profile') return Promise.resolve('Default');
        if (cmd === 'get_profiles') {
            return Promise.resolve({ success: true, profiles: ['Default', 'opencode'], active: 'Default' });
        }
        return Promise.resolve();
    };
    return { calls, invoke, config };
}

function buildContext(options = {}) {
    const initialConfig = options.initialConfig || {
        enabled: true,
        position: 'top',
        activeTabId: 'init-tab-id',
        tabs: [
            { id: 'init-tab-id', profile: 'Default', pinned: false, color: null, activeView: 'primary', dir: null, secondaryCount: 0 },
        ],
    };
    const { calls, invoke, config } = makeInvokeHarness(initialConfig);
    const document = createDocument();
    const xtermPool = document.getElementById('tab-xterm-pool');
    void xtermPool;

    class FakeTerminal {
        constructor(opts) {
            this.options = opts || {};
            this.cols = 80;
            this.rows = 24;
            this.element = new FakeElement('xterm');
            this.disposed = false;
        }
        open(container) { container.appendChild(this.element); }
        loadAddon(addon) { this._fitAddon = addon; }
        attachCustomKeyEventHandler() {}
        onScroll() {}
        dispose() { this.disposed = true; }
        hasSelection() { return false; }
        clearSelection() {}
        getSelection() { return ''; }
        write() {}
        refresh() {}
    }

    class FakeFitAddon {
        activate(term) { this._term = term; }
        fit() {}
    }

    const window = {
        addEventListener() {},
        removeEventListener() {},
        crypto: { randomUUID: () => '550e8400-e29b-41d4-a716-446655440000' },
        Terminal: FakeTerminal,
        FitAddon: { FitAddon: FakeFitAddon },
        getSelection: () => '',
        confirm: () => true,
        navigator: { clipboard: { writeText: () => Promise.resolve() } },
        requestAnimationFrame: (fn) => { fn(); return 1; },
        setTimeout: (fn, t) => { if (!t) fn(); return 0; },
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        Promise,
        Math,
        Date,
        JSON,
    };
    window.window = window;
    window.__TAURI__ = {
        core: { invoke },
        event: { listen: () => Promise.resolve(() => {}) },
    };

    const sandbox = {
        console,
        document,
        window,
        Promise,
        JSON,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Date,
        Math,
        setTimeout: window.setTimeout,
        clearTimeout: window.clearTimeout,
        setInterval: window.setInterval,
        clearInterval: window.clearInterval,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);

    vm.runInContext(BRIDGE_JS, sandbox, { filename: 'tauri-bridge.js' });
    vm.runInContext(TABS_JS, sandbox, { filename: 'tabs.js' });

    return {
        sandbox,
        window: sandbox.window,
        document: sandbox.document,
        calls,
        config,
        runInit: () => sandbox.window.TabManager.init(),
    };
}

function flushAsync() {
    return new Promise((resolve) => setTimeout(resolve, 20));
}

test('createTab invokes create_tab with a valid UUID and the requested profile', async () => {
    const ctx = buildContext();
    await ctx.runInit();
    ctx.calls.length = 0;

    const tab = await ctx.window.TabManager.createTab('opencode');

    const call = ctx.calls.find((c) => c.cmd === 'create_tab');
    assert.ok(call, 'create_tab should be called');
    assert.equal(call.args.tabId, '550e8400-e29b-41d4-a716-446655440000');
    assert.equal(call.args.profile, 'opencode');
    assert.equal(call.args.cols, 80);
    assert.equal(call.args.rows, 24);
    assert.ok(UUID_V4_RE.test(call.args.tabId), 'id must match UUID v4 format');
    assert.equal(tab.id, call.args.tabId);
});

test('closeTab invokes close_tab with force:false by default for a non-pinned tab', async () => {
    const ctx = buildContext();
    await ctx.runInit();
    await ctx.window.TabManager.createTab('Default');
    const newId = ctx.calls.filter((c) => c.cmd === 'create_tab').pop().args.tabId;
    ctx.calls.length = 0;

    await ctx.window.TabManager.closeTab(newId);

    const closeCall = ctx.calls.find((c) => c.cmd === 'close_tab');
    assert.ok(closeCall, 'close_tab should be called');
    assert.equal(closeCall.args.tabId, newId);
    assert.equal(closeCall.args.force, false);
});

test('resolveSessionId maps "primary" to tab id and "secondary:N" to <id>__secN', () => {
    const ctx = buildContext();
    const id = '550e8400-e29b-41d4-a716-446655440000';
    assert.equal(ctx.window.TabManager.resolveSessionId(id, 'primary'), id);
    assert.equal(ctx.window.TabManager.resolveSessionId(id), id);
    assert.equal(ctx.window.TabManager.resolveSessionId(id, 'secondary:0'), `${id}__sec0`);
    assert.equal(ctx.window.TabManager.resolveSessionId(id, 'secondary:3'), `${id}__sec3`);
    assert.equal(ctx.window.TabManager.resolveSessionId(null, 'primary'), null);
    assert.equal(ctx.window.TabManager.resolveSessionId(id, 'garbage'), null);
});

test('createTab id avoids reserved names, contains no "__" separator, and is UUID v4', async () => {
    const ctx = buildContext();
    await ctx.runInit();
    ctx.calls.length = 0;

    await ctx.window.TabManager.createTab('Default');
    await ctx.window.TabManager.createTab('opencode');
    await ctx.window.TabManager.createTab('Default');

    const createCalls = ctx.calls.filter((c) => c.cmd === 'create_tab');
    assert.equal(createCalls.length, 3);
    for (const c of createCalls) {
        const id = c.args.tabId;
        assert.ok(!RESERVED_IDS.has(id), `id ${id} must not be reserved`);
        assert.ok(!id.includes('__'), `id ${id} must not contain __`);
        assert.match(id, UUID_V4_RE, `id ${id} must be UUID v4`);
    }
});

test('reorderTabs invokes reorder_tabs with the new order', async () => {
    const ctx = buildContext();
    await ctx.runInit();
    ctx.calls.length = 0;

    const order = ['alpha', 'beta', 'gamma'];
    await ctx.window.TabManager.reorderTabs(order);

    const call = ctx.calls.find((c) => c.cmd === 'reorder_tabs');
    assert.ok(call, 'reorder_tabs should be called');
    assert.deepEqual(call.args.newOrder, order);
});
