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

test('set_background_config calls set_background_config IPC with validated args', () => {
    // Regression for validation bypass: previously, set_background_config called
    // set_many_config directly, bypassing backend validation. Now it calls
    // set_background_config which validates all bg_* entries server-side.
    const { api, calls } = loadBridge();
    api.set_background_config('color', null, '#112233', null, 80, 'light', 'glass', 'behind');
    const setBg = calls.filter((c) => c.cmd === 'set_background_config');
    const setMany = calls.filter((c) => c.cmd === 'set_many_config');
    assert.equal(setBg.length, 1, 'set_background_config must call set_background_config exactly once');
    assert.equal(setMany.length, 0, 'set_background_config must not call set_many_config');
    const args = setBg[0].args;
    assert.equal(args.bg_type, 'color');
    assert.equal(args.bg_color, '#112233');
    assert.equal(args.bg_transparency, 80);
    assert.equal(args.theme_mode, 'light');
    assert.equal(args.cta_button_style, 'glass');
    assert.equal(args.bg_layer, 'behind');
});

test('set_background_config handles undefined args without writing them', () => {
    const { api, calls } = loadBridge();
    api.set_background_config('none', undefined, undefined, undefined, undefined, undefined, undefined, undefined);
    const setBg = calls.filter((c) => c.cmd === 'set_background_config');
    assert.equal(setBg.length, 1);
    const args = setBg[0].args;
    assert.deepEqual(Object.keys(args), ['bg_type']);
    assert.equal(args.bg_type, 'none');
});

test('retire_panel_tab is exposed on the bridge', () => {
    const { api, calls } = loadBridge();
    api.retire_panel_tab('panel-tab-7');
    const retire = calls.filter((c) => c.cmd === 'retire_panel_tab');
    assert.equal(retire.length, 1);
    assert.equal(retire[0].args.sessionId, 'panel-tab-7');
});
