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
        window: {},
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
