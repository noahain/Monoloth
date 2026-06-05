const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function createUpdaterHarness() {
    const invokeCalls = [];

    class FakeChannel {
        constructor() {
            this.onmessage = null;
            this.sent = [];
        }
        send(payload) {
            this.sent.push(payload);
        }
    }

    const fakeMetadata = {
        rid: 42,
        currentVersion: '2.0.0',
        version: '2.0.1',
        date: '2026-06-01T00:00:00Z',
        body: 'New release',
        rawJson: {}
    };

    function fakeInvoke(cmd, args) {
        invokeCalls.push({ cmd: cmd, args: args });
        if (cmd === 'plugin:updater|check') {
            return Promise.resolve(fakeMetadata);
        }
        if (cmd === 'plugin:updater|download_and_install') {
            return Promise.resolve();
        }
        return Promise.reject(new Error('Unexpected invoke: ' + cmd));
    }

    const window = {
        __TAURI__: {
            core: {
                invoke: fakeInvoke,
                Channel: FakeChannel
            }
        },
        addEventListener() {},
        removeEventListener() {}
    };
    window.window = window;

    const context = {
        console,
        window,
        Promise
    };
    context.globalThis = context;
    vm.createContext(context);

    const source = fs.readFileSync('frontend/lib/plugin-updater.js', 'utf8');
    vm.runInContext(source, context, { filename: 'frontend/lib/plugin-updater.js' });

    return {
        context: context,
        getInvokeCalls: () => invokeCalls.slice(),
        getLastInvokeCall: () => invokeCalls[invokeCalls.length - 1]
    };
}

test('plugin-updater IIFE exposes __TAURI_PLUGIN_UPDATER__.check', () => {
    const h = createUpdaterHarness();
    assert.ok(h.context.window.__TAURI_PLUGIN_UPDATER__, 'plugin global should be set');
    assert.strictEqual(typeof h.context.window.__TAURI_PLUGIN_UPDATER__.check, 'function');
});

test('check() invokes plugin:updater|check and wraps the metadata', async () => {
    const h = createUpdaterHarness();
    const update = await h.context.window.__TAURI_PLUGIN_UPDATER__.check();
    assert.ok(update, 'update should be non-null when metadata is returned');
    assert.strictEqual(update.available, true);
    assert.strictEqual(update.version, '2.0.1');
    assert.strictEqual(update.currentVersion, '2.0.0');
    assert.strictEqual(update.notes, 'New release');
    assert.strictEqual(update.pubdate, '2026-06-01T00:00:00Z');
    assert.strictEqual(typeof update.downloadAndInstall, 'function');

    const checkCall = h.getInvokeCalls().find((c) => c.cmd === 'plugin:updater|check');
    assert.ok(checkCall, 'check should have been invoked');
});

test('check() returns null when the backend reports no update', async () => {
    const h = createUpdaterHarness();
    h.context.window.__TAURI__.core.invoke = (cmd) => {
        if (cmd === 'plugin:updater|check') return Promise.resolve(null);
        return Promise.reject(new Error('Unexpected: ' + cmd));
    };
    const update = await h.context.window.__TAURI_PLUGIN_UPDATER__.check();
    assert.strictEqual(update, null);
});

test('downloadAndInstall sends rid at the top level (Tauri 2 contract)', async () => {
    const h = createUpdaterHarness();
    const update = await h.context.window.__TAURI_PLUGIN_UPDATER__.check();
    let receivedEvent = null;
    await update.downloadAndInstall(function (event) { receivedEvent = event; });

    const dlCall = h.getInvokeCalls().find((c) => c.cmd === 'plugin:updater|download_and_install');
    assert.ok(dlCall, 'download_and_install should have been invoked');
    const args = dlCall.args;
    assert.ok(args, 'args should be passed');
    assert.strictEqual(args.rid, 42, 'rid must be a top-level integer, not nested in an object');
    assert.strictEqual(args.update, undefined, 'no "update" wrapper object should be sent');
    assert.ok(args.onEvent, 'onEvent channel should be passed');
    assert.strictEqual(typeof args.onEvent.send, 'function', 'onEvent must be a Channel instance');
    void receivedEvent;
});

test('plugin-updater IIFE exits early when Tauri is not available', () => {
    const window = { __TAURI__: null };
    window.window = window;
    const context = { console, window, Promise };
    context.globalThis = context;
    vm.createContext(context);
    const source = fs.readFileSync('frontend/lib/plugin-updater.js', 'utf8');
    vm.runInContext(source, context, { filename: 'frontend/lib/plugin-updater.js' });
    assert.strictEqual(context.window.__TAURI_PLUGIN_UPDATER__, undefined);
});
