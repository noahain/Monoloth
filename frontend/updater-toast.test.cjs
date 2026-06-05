const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class FakeClassList {
    constructor() { this.classes = new Set(); }
    add(...c) { c.forEach((x) => this.classes.add(x)); }
    remove(...c) { c.forEach((x) => this.classes.delete(x)); }
    contains(c) { return this.classes.has(c); }
    toggle(c, force) {
        if (force === undefined) force = !this.classes.has(c);
        if (force) this.classes.add(c); else this.classes.delete(c);
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
        this.innerHTML = '';
        this.textContent = '';
    }
    addEventListener(t, h) { (this.eventListeners[t] = this.eventListeners[t] || []).push(h); }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter((i) => i !== c); c.parentNode = null; }
    insertAdjacentHTML(_, html) {
        const wrap = new FakeElement('wrap');
        wrap._html = html;
        this.children.push(wrap);
        return wrap;
    }
    querySelector(sel) {
        const tag = sel.startsWith('.') ? sel.slice(1) : sel;
        for (const child of this.children) {
            if (child.id === tag || (child._html && child._html.includes(sel))) {
                return new FakeElement(tag);
            }
        }
        return new FakeElement(tag);
    }
    querySelectorAll() { return []; }
    getAttribute(name) { return this[name] || ''; }
    setAttribute(name, value) { this[name] = value; }
}

function makeHarness({ checkResult, checkError } = {}) {
    const document = {
        body: new FakeElement('body'),
        getElementById: () => null,
        createElement: (tag) => new FakeElement(tag),
        addEventListener() {},
        removeEventListener() {}
    };
    document.documentElement = new FakeElement('html');

    const checkCalls = [];
    function fakeInvoke(cmd) {
        if (cmd === 'plugin:updater|check') {
            checkCalls.push(cmd);
            if (checkError) return Promise.reject(checkError);
            return Promise.resolve(checkResult);
        }
        if (cmd === 'plugin:updater|download_and_install') return Promise.resolve();
        return Promise.reject(new Error('Unexpected: ' + cmd));
    }
    class FakeChannel { constructor() { this.onmessage = null; } }

    const window = {
        __TAURI__: {
            core: { invoke: fakeInvoke, Channel: FakeChannel }
        },
        addEventListener() {},
        removeEventListener() {}
    };
    window.window = window;
    window.document = document;

    const context = {
        console,
        document,
        window,
        navigator: { clipboard: { readText: () => Promise.resolve(''), writeText: () => Promise.resolve() } },
        Promise,
        setTimeout, clearTimeout,
        requestAnimationFrame: (fn) => { fn(); return 1; }
    };
    context.globalThis = context;
    vm.createContext(context);

    const updaterSource = fs.readFileSync('frontend/lib/plugin-updater.js', 'utf8');
    vm.runInContext(updaterSource, context, { filename: 'frontend/lib/plugin-updater.js' });

    const processSource = fs.readFileSync('frontend/lib/plugin-process.js', 'utf8');
    vm.runInContext(processSource, context, { filename: 'frontend/lib/plugin-process.js' });

    const toastSource = fs.readFileSync('frontend/lib/updater-toast.js', 'utf8');
    vm.runInContext(toastSource, context, { filename: 'frontend/lib/updater-toast.js' });

    return { context, getCheckCalls: () => checkCalls.slice() };
}

function flushAsync() {
    return new Promise((r) => setTimeout(r, 10));
}

test('init() auto-check runs the IPC and mounts a toast when an update is found', async () => {
    const h = makeHarness({
        checkResult: {
            rid: 7,
            currentVersion: '2.0.0',
            version: '2.0.1',
            date: '2026-06-01T00:00:00Z',
            body: 'Bug fixes',
            rawJson: {}
        }
    });

    h.context.window.MonolothUpdater.init();
    await flushAsync();

    const state = h.context.window.MonolothUpdater._state;
    assert.strictEqual(state.current, 'AVAILABLE', 'state should be AVAILABLE after a successful auto-check');
    assert.ok(state.mounted, 'a toast should be mounted');
    assert.strictEqual(state.update.version, '2.0.1');
    assert.ok(h.context.document.body.children.length > 0, 'container should be appended to body');
});

test('init() is silent when no update is available', async () => {
    const h = makeHarness({ checkResult: null });
    h.context.window.MonolothUpdater.init();
    await flushAsync();

    const state = h.context.window.MonolothUpdater._state;
    assert.strictEqual(state.current, 'IDLE', 'state should remain IDLE when check returns null');
    assert.strictEqual(state.mounted, null, 'no toast should be mounted');
});

test('init() does not throw and remains silent when the IPC rejects', async () => {
    const warnings = [];
    const h = makeHarness({ checkError: new Error('network down') });
    const origWarn = h.context.console.warn;
    h.context.console.warn = (...a) => { warnings.push(a.join(' ')); };

    h.context.window.MonolothUpdater.init();
    await flushAsync();

    const state = h.context.window.MonolothUpdater._state;
    assert.strictEqual(state.current, 'IDLE');
    assert.strictEqual(state.mounted, null);
    assert.ok(warnings.length > 0, 'a warning should be logged so the failure is not silent');
});

test('init() retries once after a transient IPC failure and mounts the toast', async () => {
    let calls = 0;
    const metadata = {
        rid: 9,
        currentVersion: '2.0.0',
        version: '2.0.1',
        date: null,
        body: null,
        rawJson: {}
    };
    const document = {
        body: new FakeElement('body'),
        getElementById: () => null,
        createElement: (tag) => new FakeElement(tag),
        addEventListener() {},
        removeEventListener() {}
    };
    document.documentElement = new FakeElement('html');
    class FakeChannel { constructor() { this.onmessage = null; } }
    function fakeInvoke(cmd) {
        if (cmd !== 'plugin:updater|check') return Promise.reject(new Error('Unexpected: ' + cmd));
        calls += 1;
        if (calls === 1) return Promise.reject(new Error('transient blip'));
        return Promise.resolve(metadata);
    }
    const window = {
        __TAURI__: { core: { invoke: fakeInvoke, Channel: FakeChannel } },
        addEventListener() {},
        removeEventListener() {}
    };
    window.window = window;
    window.document = document;
    const context = {
        console, document, window,
        Promise, setTimeout, clearTimeout,
        requestAnimationFrame: (fn) => { fn(); return 1; }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('frontend/lib/plugin-updater.js', 'utf8'), context, { filename: 'frontend/lib/plugin-updater.js' });
    vm.runInContext(fs.readFileSync('frontend/lib/plugin-process.js', 'utf8'), context, { filename: 'frontend/lib/plugin-process.js' });
    vm.runInContext(fs.readFileSync('frontend/lib/updater-toast.js', 'utf8'), context, { filename: 'frontend/lib/updater-toast.js' });

    context.window.MonolothUpdater.init();
    await new Promise((r) => setTimeout(r, 5200));

    const state = context.window.MonolothUpdater._state;
    assert.strictEqual(calls, 2, 'check should have been retried once');
    assert.strictEqual(state.current, 'AVAILABLE', 'toast should be mounted after retry');
    assert.ok(state.mounted, 'a toast should be mounted');
});
