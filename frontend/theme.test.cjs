const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function load() {
    const body = { classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);}, toggle(c,f){ if(f===undefined)f=!this._s.has(c); f?this._s.add(c):this._s.delete(c); return f; } } };
    const context = { console, document: { body, documentElement: { style:{}, classList: body.classList }, getElementById: () => null, querySelectorAll: () => [] }, window: { monolithApi: {} } };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('frontend/theme.js', 'utf8'), context, { filename: 'theme.js' });
    return context.window.MonolithTheme;
}

test('hexToLuminance returns 0..1, 0 for invalid', () => {
    const T = load();
    assert.equal(T.hexToLuminance('#000000'), 0);
    assert.ok(Math.abs(T.hexToLuminance('#ffffff') - 1) < 1e-9);
    assert.equal(T.hexToLuminance('notacolor'), 0);
});
