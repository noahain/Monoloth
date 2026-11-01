'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

function makeEl(tag) {
    const el = {
        tagName: (tag || 'div').toUpperCase(),
        className: '',
        style: {
            _props: {},
            setProperty(name, value) { this._props[name] = value; }
        },
        children: [],
        attrs: {},
        classList: {
            _set: new Set(),
            add(c) { this._set.add(c); },
            remove(c) { this._set.delete(c); },
            contains(c) { return this._set.has(c); },
            toggle(c, on) { if (on) this._set.add(c); else this._set.delete(c); }
        },
        getAttribute(n) { return this.attrs[n] === undefined ? null : this.attrs[n]; },
        setAttribute(n, v) { this.attrs[n] = String(v); },
        appendChild(child) { this.children.push(child); return child; },
        querySelectorAll(sel) {
            const name = sel.replace(/^\[data-view\]$/, 'data-view');
            if (name === 'data-view') {
                return this.children.filter(c => c.attrs && c.attrs['data-view']);
            }
            return [];
        },
        addEventListener() {},
        removeEventListener() {}
    };
    return el;
}

function loadSideDock() {
    const dock = makeEl();
    const files = makeEl();
    const git = makeEl();
    const viewFiles = makeEl('button');
    viewFiles.attrs['data-view'] = 'files';
    const viewGit = makeEl('button');
    viewGit.attrs['data-view'] = 'git';

    const config = {};
    const context = {
        console,
        Map,
        Set,
        Promise,
        JSON,
        setTimeout,
        clearTimeout,
        window: null,
        innerWidth: 1000,
        document: {
            getElementById(id) {
                return {
                    'side-dock': dock,
                    'side-dock-files': files,
                    'side-dock-git': git,
                    'side-dock-views': {
                        querySelectorAll: () => [viewFiles, viewGit],
                        addEventListener() {}
                    },
                    'side-dock-resize-handle': makeEl(),
                    'side-dock-close': makeEl()
                }[id] || null;
            },
            addEventListener() {},
            removeEventListener() {}
        },
        monolithApi: {
            set_config(k, v) { config[k] = v; return Promise.resolve(true); },
            get_config(k) { return Promise.resolve(config[k] === undefined ? null : config[k]); }
        },
        __config: config
    };
    context.window = context;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('frontend/side-dock.js', 'utf8'), context, { filename: 'side-dock.js' });
    return context;
}

test('toggle flips .open and persists sideDockOpen', async () => {
    const ctx = loadSideDock();
    ctx.window.MonolithSideDock.onMainTabChange('tab-1', '/proj');
    ctx.window.MonolithSideDock.toggle();
    assert.strictEqual(ctx.window.MonolithSideDock.isOpen(), true);
    assert.strictEqual(ctx.document.getElementById('side-dock').classList.contains('open'), true);
    await new Promise(r => setImmediate(r));
    assert.strictEqual(ctx.__config.sideDockOpen, true);
});

test('showView activates exactly one container', () => {
    const ctx = loadSideDock();
    ctx.window.MonolithSideDock.onMainTabChange('tab-1', '/proj');
    ctx.window.MonolithSideDock.open();
    ctx.window.MonolithSideDock.showView('git');
    const files = ctx.document.getElementById('side-dock-files');
    const git = ctx.document.getElementById('side-dock-git');
    assert.strictEqual(files.classList.contains('active'), false);
    assert.strictEqual(git.classList.contains('active'), true);
});

test('open synthesizes a group when none exists', () => {
    const ctx = loadSideDock();
    ctx.window.SidebarManager = {
        getActiveMainTabId: () => 'tab-x',
        getActiveMainTabDir: () => '/x'
    };
    ctx.window.MonolithSideDock.open();
    assert.strictEqual(ctx.window.MonolithSideDock.isOpen(), true);
    assert.strictEqual(ctx.window.MonolithSideDock.getGroupRoot('tab-x'), '/x');
});

test('two groups keep separate roots', () => {
    const ctx = loadSideDock();
    const dock = ctx.window.MonolithSideDock;
    dock.onMainTabChange('tab-1', '/a');
    dock.onMainTabChange('tab-2', '/b');
    assert.strictEqual(dock.getGroupRoot('tab-1'), '/a');
    assert.strictEqual(dock.getGroupRoot('tab-2'), '/b');
});

test('disposeGroup removes the group', () => {
    const ctx = loadSideDock();
    const dock = ctx.window.MonolithSideDock;
    dock.onMainTabChange('tab-1', '/a');
    dock.disposeGroup('tab-1');
    assert.strictEqual(dock.getGroupRoot('tab-1'), null);
});

test('mounting a view happens once even when re-activated', () => {
    const ctx = loadSideDock();
    const dock = ctx.window.MonolithSideDock;
    let mounts = 0;
    ctx.window.MonolithSideDockGit = {
        mount() { mounts += 1; },
        activate() {}
    };
    dock.onMainTabChange('tab-1', '/a');
    dock.open();
    dock.showView('git');
    dock.showView('files');
    dock.showView('git');
    assert.strictEqual(mounts, 1);
});

test('width clamps to 220 on a narrow window', () => {
    const ctx = loadSideDock();
    ctx.window.innerWidth = 300;
    ctx.window.MonolithSideDock.onMainTabChange('tab-1', '/a');
    ctx.window.MonolithSideDock.open();
    const dockEl = ctx.document.getElementById('side-dock');
    assert.strictEqual(dockEl.style._props['--side-dock-width'], '220px');
});

test('close aborts when the dirty prompt is cancelled', async () => {
    const ctx = loadSideDock();
    const dock = ctx.window.MonolithSideDock;
    let prompted = 0;
    ctx.window.MonolithSideDockFiles = {
        hasDirty() { return true; },
        saveActive() { return Promise.resolve(true); },
        discardActive() {}
    };
    ctx.window.MonolithDialog = {
        showChoice() { prompted += 1; return Promise.resolve(2); }
    };
    dock.onMainTabChange('tab-1', '/a');
    dock.open();
    await dock.close();
    assert.strictEqual(prompted, 1);
    assert.strictEqual(dock.isOpen(), true);
});

test('hasDirty delegates to the files module', () => {
    const ctx = loadSideDock();
    ctx.window.MonolithSideDockFiles = {
        hasDirty(id) { return id === 'tab-2'; }
    };
    const dock = ctx.window.MonolithSideDock;
    assert.strictEqual(dock.hasDirty('tab-2'), true);
    assert.strictEqual(dock.hasDirty('tab-1'), false);
});

test('disposeGroup disposes the editor and git state for that group', () => {
    const ctx = loadSideDock();
    const disposed = [];
    ctx.window.MonolithSideDockFiles = { dispose(id) { disposed.push('files:' + id); } };
    ctx.window.MonolithSideDockGit = { dispose(id) { disposed.push('git:' + id); } };
    const dock = ctx.window.MonolithSideDock;
    dock.onMainTabChange('tab-1', '/a');
    dock.disposeGroup('tab-1');
    assert.deepStrictEqual(disposed, ['files:tab-1', 'git:tab-1']);
});

test('no PTY call is made for any side dock action', () => {
    const ctx = loadSideDock();
    const calls = [];
    ctx.monolithApi.spawn_terminal = (...args) => { calls.push(args); return Promise.resolve(1); };
    ctx.monolithApi.create_panel_session = (...args) => { calls.push(args); return Promise.resolve(1); };
    const dock = ctx.window.MonolithSideDock;
    dock.onMainTabChange('tab-1', '/a');
    dock.open();
    dock.showView('git');
    dock.showView('files');
    dock.close();
    assert.deepStrictEqual(calls, []);
});
