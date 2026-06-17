const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadBridge() {
    const calls = [];
    const fakeCore = {
        invoke(cmd, args) {
            calls.push({ cmd, args });
            return Promise.resolve(null);
        }
    };
    const window = {
        __TAURI__: { core: fakeCore },
        __TAURI_CORE__: fakeCore,
        addEventListener() {},
        removeEventListener() {}
    };
    window.window = window;
    const context = {
        console, Promise, setTimeout, clearTimeout,
        window,
        document: { addEventListener() {}, body: {} }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('frontend/tauri-bridge.js', 'utf8'), context, { filename: 'tauri-bridge.js' });
    return { api: context.window.monolithApi, calls };
}

test('set_background_config uses set_many_config as a single atomic call', () => {
    // Regression for bug 13: previously, set_background_config fired N parallel
    // set_config IPC calls. The normal frontend save path now goes through one
    // set_many_config call so a partial write cannot leave a half-saved config.
    const { api, calls } = loadBridge();
    api.set_background_config('color', null, '#112233', null, 80, 'light', 'glass', 'behind');
    const setMany = calls.filter((c) => c.cmd === 'set_many_config');
    const setConfig = calls.filter((c) => c.cmd === 'set_config');
    assert.equal(setMany.length, 1, 'set_background_config must call set_many_config exactly once');
    assert.equal(setConfig.length, 0, 'set_background_config must not call set_config');
    const entries = setMany[0].args.entries;
    assert.equal(entries.bg_type, 'color');
    assert.equal(entries.bg_color, '#112233');
    assert.equal(entries.bg_transparency, 80);
    assert.equal(entries.theme_mode, 'light');
    assert.equal(entries.cta_button_style, 'glass');
    assert.equal(entries.bg_layer, 'behind');
});

test('set_background_config handles undefined args without writing them', () => {
    const { api, calls } = loadBridge();
    api.set_background_config('none', undefined, undefined, undefined, undefined, undefined, undefined, undefined);
    const setMany = calls.filter((c) => c.cmd === 'set_many_config');
    assert.equal(setMany.length, 1);
    const entries = setMany[0].args.entries;
    assert.deepEqual(Object.keys(entries), ['bg_type']);
    assert.equal(entries.bg_type, 'none');
});

test('retire_panel_tab is exposed on the bridge', () => {
    const { api, calls } = loadBridge();
    api.retire_panel_tab('panel-tab-7');
    const retire = calls.filter((c) => c.cmd === 'retire_panel_tab');
    assert.equal(retire.length, 1);
    assert.equal(retire[0].args.sessionId, 'panel-tab-7');
});
