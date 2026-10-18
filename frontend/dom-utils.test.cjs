const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function escapeBrowser(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createStyleShim() {
    return {
        setProperty: function (name, value) { this[name] = value; },
        removeProperty: function (name) { delete this[name]; }
    };
}

function loadDomUtils(opts) {
    opts = opts || {};
    var userAgent = opts.userAgent || '';
    var windowObj = opts.windowObj || {};
    var context = {
        console: console,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Promise: Promise,
        Date: Date,
        Array: Array,
        document: {
            createElement: function () {
                var html = '';
                return {
                    appendChild: function (child) { html = escapeBrowser(String(child)); },
                    get innerHTML() { return html; }
                };
            },
            createTextNode: function (str) { return str; },
            addEventListener: function () {},
            removeEventListener: function () {},
            body: {
                classList: {
                    contains: function (cls) { return (opts.bodyClasses || []).indexOf(cls) !== -1; }
                }
            },
            documentElement: { style: opts.documentElementStyle || createStyleShim() }
        },
        navigator: { userAgent: userAgent },
        window: windowObj
    };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('frontend/lib/dom-utils.js', 'utf8'), context, { filename: 'dom-utils.js' });
    return { UI: context.window.MonolothUI, context: context };
}

test('escapeHtml escapes special characters', function () {
    var UI = loadDomUtils().UI;
    assert.equal(UI.escapeHtml('a&b'), 'a&amp;b');
    assert.equal(UI.escapeHtml('<script>'), '&lt;script&gt;');
    assert.equal(UI.escapeHtml('"hi"'), '&quot;hi&quot;');
    assert.equal(UI.escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml returns empty for null/undefined', function () {
    var UI = loadDomUtils().UI;
    assert.equal(UI.escapeHtml(null), '');
    assert.equal(UI.escapeHtml(undefined), '');
});

test('escapeHtml stringifies non-strings', function () {
    var UI = loadDomUtils().UI;
    assert.equal(UI.escapeHtml(42), '42');
});

test('debounce delays execution', async function () {
    var UI = loadDomUtils().UI;
    var count = 0;
    var fn = function () { count++; };
    var debounced = UI.debounce(fn, 50);
    debounced();
    debounced();
    assert.equal(count, 0, 'fn not called immediately');
    await new Promise(function (r) { return setTimeout(r, 60); });
    assert.equal(count, 1, 'fn called exactly once after delay');
});

test('silent swallows errors', async function () {
    var UI = loadDomUtils().UI;
    var p = UI.silent(Promise.reject('boom'));
    await assert.doesNotReject(p);
});

test('silent passes through non-promise', function () {
    var UI = loadDomUtils().UI;
    assert.equal(UI.silent(42), 42);
});

test('waitFor resolves when predicate becomes true', async function () {
    var UI = loadDomUtils().UI;
    var counter = 0;
    var predicate = function () { return counter > 0; };
    var p = UI.waitFor(predicate, 500, 10);
    setTimeout(function () { counter = 1; }, 15);
    var result = await p;
    assert.equal(result, true);
});

test('waitFor times out', async function () {
    var UI = loadDomUtils().UI;
    var result = await UI.waitFor(function () { return false; }, 50, 10);
    assert.equal(result, false);
});

test("getPlatform returns 'windows' for Windows UA", function () {
    var UI = loadDomUtils({ userAgent: 'Windows NT 10.0' }).UI;
    assert.equal(UI.getPlatform(), 'windows');
});

test('isWindows returns true on Windows UA', function () {
    var UI = loadDomUtils({ userAgent: 'Windows NT 10.0' }).UI;
    assert.equal(UI.isWindows(), true);
});

test('getCore returns null when Tauri not available', function () {
    var loaded = loadDomUtils();
    loaded.context.window.__TAURI__ = null;
    assert.equal(loaded.UI.getCore(), null);
});

test('getCore returns core when available', function () {
    var core = { invoke: function () { return 'ok'; } };
    var loaded = loadDomUtils({ windowObj: { __TAURI_CORE__: core } });
    assert.strictEqual(loaded.UI.getCore(), core);
});

test('opaque none-mode background sets --terminal-solid-bg on the html root', function () {
    var style = createStyleShim();
    var loaded = loadDomUtils({ documentElementStyle: style });
    var tc = loaded.UI.computeTermBgColors('none', 'behind');
    assert.equal(tc.background, '#0a0a0a');
    assert.equal(style['--terminal-solid-bg'], '#0a0a0a');
});

test('light-mode opaque background publishes #f5f5f5 as --terminal-solid-bg', function () {
    var style = createStyleShim();
    var loaded = loadDomUtils({ bodyClasses: ['adaptive-light'], documentElementStyle: style });
    var tc = loaded.UI.computeTermBgColors('none', 'behind');
    assert.equal(tc.background, '#f5f5f5');
    assert.equal(style['--terminal-solid-bg'], '#f5f5f5');
});

test('swapping to a transparent terminal background clears --terminal-solid-bg', function () {
    var style = createStyleShim();
    var loaded = loadDomUtils({ documentElementStyle: style });
    loaded.UI.computeTermBgColors('none', 'behind');
    assert.equal(style['--terminal-solid-bg'], '#0a0a0a');
    loaded.UI.computeTermBgColors('image', 'behind');
    assert.equal(style['--terminal-solid-bg'], undefined);
});

test('overlay wallpaper keeps an opaque #000000 terminal background var', function () {
    var style = createStyleShim();
    var loaded = loadDomUtils({ documentElementStyle: style });
    var tc = loaded.UI.computeTermBgColors('image', 'overlay');
    assert.equal(tc.background, '#000000');
    assert.equal(style['--terminal-solid-bg'], '#000000');
});
