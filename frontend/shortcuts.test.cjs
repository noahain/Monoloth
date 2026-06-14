const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadShortcuts() {
    const context = { console, window: {}, document: { getElementById: () => null } };
    context.window.window = context.window;
    vm.createContext(context);
    const src = fs.readFileSync('frontend/shortcuts.js', 'utf8');
    vm.runInContext(src, context, { filename: 'frontend/shortcuts.js' });
    return context.window.MonolithShortcuts;
}

test('parseShortcutString handles modifiers and Plus', () => {
    const S = loadShortcuts();
    assert.deepEqual({ ...S.parseShortcutString('Ctrl+Shift+P') },
        { ctrl: true, shift: true, alt: false, meta: false, key: 'P' });
    assert.equal(S.parseShortcutString('Ctrl++').key, 'Plus');
    assert.equal(S.parseShortcutString('Ctrl+,').key, 'Comma');
});

test('shortcutMatches compares event to shortcut string', () => {
    const S = loadShortcuts();
    const e = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'p' };
    assert.equal(S.shortcutMatches(e, 'Ctrl+P'), true);
    assert.equal(S.shortcutMatches(e, 'Ctrl+Shift+P'), false);
});

test('setShortcut updates and getAllShortcuts reflects it', () => {
    const S = loadShortcuts();
    S.setShortcut('settings', 'Ctrl+Alt+S');
    assert.equal(S.getAllShortcuts().settings, 'Ctrl+Alt+S');
});
