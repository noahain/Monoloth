const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const tabsSource = fs.readFileSync(path.join(__dirname, 'tabs.js'), 'utf8');

function makeContext(monolithApi) {
    const ctx = {
        console,
        setTimeout, clearTimeout, setInterval, clearInterval,
        Promise,
        crypto: { randomUUID: function () {
            return '00000000-0000-4000-8000-' + (Math.random().toString(16).slice(2, 14).padEnd(12, '0'));
        }},
        window: {
            addEventListener: function () {},
            removeEventListener: function () {}
        },
        monolithApi: monolithApi || {
            get_config: () => Promise.resolve(null),
            set_config: () => Promise.resolve(null)
        }
    };
    ctx.window.monolithApi = ctx.monolithApi;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(tabsSource, ctx, { filename: 'tabs.js' });
    return ctx;
}

test('createTab appends a new tab with cloned profile', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({ tabs: [{ id: 'a', isMain: true, profile: 'Work' }], activeTabId: 'a' });
    const before = tm.state().tabs.length;
    const newTab = tm.createTab();
    assert.ok(newTab, 'createTab returns new tab');
    assert.equal(newTab.isMain, false);
    assert.equal(newTab.profile, 'Work', 'clones active profile');
    assert.equal(tm.state().tabs.length, before + 1);
    assert.equal(tm.state().activeTabId, newTab.id);
});

test('closeTab removes the tab and switches to adjacent', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    let terminateCalls = 0;
    ctx.monolithApi.terminate_tab_sessions = function (id) {
        terminateCalls++;
        assert.equal(id, 'a');
        return Promise.resolve();
    };
    const result = tm.closeTab('a');
    assert.equal(result.removed, true);
    assert.equal(tm.state().tabs.length, 1);
    assert.equal(tm.state().tabs[0].id, 'b');
    assert.equal(tm.state().tabs[0].isMain, true, 'b promoted to isMain');
    assert.equal(tm.state().activeTabId, 'b', 'active switched to b');
    assert.equal(terminateCalls, 1);
});

test('closeTab on the only main tab preserves the tab', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({
        tabs: [{ id: 'a', isMain: true, profile: 'Default' }],
        activeTabId: 'a'
    });
    const result = tm.closeTab('a');
    assert.equal(result.removed, false);
    assert.equal(tm.state().tabs.length, 1);
    assert.equal(tm.state().tabs[0].isMain, true);
});

test('reorderTabs moves a tab', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' },
            { id: 'c', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    tm.reorderTabs(0, 2);
    assert.deepEqual(tm.state().tabs.map(function (t) { return t.id; }), ['b', 'c', 'a']);
});

test('setActiveTab updates activeTabId', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    let emitted = null;
    tm.on(function (e) { if (e.type === 'active_tab_changed') emitted = e; });
    tm.setActiveTab('b');
    assert.equal(tm.state().activeTabId, 'b');
    assert.ok(emitted);
    assert.equal(emitted.tabId, 'b');
});

test('setTabProfile updates only that tab', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    tm.setTabProfile('b', 'Work');
    assert.equal(tm.state().tabs[0].profile, 'Default');
    assert.equal(tm.state().tabs[1].profile, 'Work');
});

test('restoreFromConfig normalizes isMain invariant (0 mains)', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    const normalized = tm._normalize({
        tabs: [
            { id: 'a', isMain: false, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    assert.equal(normalized.tabs[0].isMain, true);
    assert.equal(normalized.tabs[1].isMain, false);
});

test('restoreFromConfig normalizes isMain invariant (2 mains)', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    const normalized = tm._normalize({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: true, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    assert.equal(normalized.tabs[0].isMain, true);
    assert.equal(normalized.tabs[1].isMain, false);
});

test('restoreFromConfig falls back to first tab if activeTabId missing', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    const normalized = tm._normalize({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'nonexistent'
    });
    assert.equal(normalized.activeTabId, 'a');
});

test('init with empty tabs creates fresh main tab', (t, done) => {
    const ctx = makeContext({
        get_config: function () { return Promise.resolve({ tabs: [], activeTabId: '', tabBarEnabled: true }); }
    });
    const tm = ctx.window.TabManager;
    tm.init(function (s) {
        assert.equal(s.tabs.length, 1);
        assert.equal(s.tabs[0].isMain, true);
        done();
    });
});

test('save debounces rapid calls', (t, done) => {
    let saveCount = 0;
    const ctx = makeContext({
        get_config: () => Promise.resolve(null),
        set_config: function (k, v) { saveCount++; return Promise.resolve(); }
    });
    const tm = ctx.window.TabManager;
    tm._init_for_test({ tabs: [{ id: 'a', isMain: true, profile: 'Default' }], activeTabId: 'a' });
    tm._save();
    tm._save();
    tm._save();
    setTimeout(function () {
        assert.equal(saveCount, 1, 'three rapid saves produce one write');
        done();
    }, 600);
});
