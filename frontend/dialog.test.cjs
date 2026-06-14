const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function makeEl() {
    const cl = new Set();
    return {
        classList: { add: c => cl.add(c), remove: c => cl.delete(c), contains: c => cl.has(c) },
        addEventListener() {}, setAttribute() {}, focus() {}, select() {},
        innerHTML: '', textContent: '', value: ''
    };
}
function load() {
    const els = {};
    const context = {
        console, setTimeout, clearTimeout, Promise,
        document: {
            getElementById: id => (els[id] || (els[id] = makeEl())),
            createElement: () => makeEl(), addEventListener() {}
        },
        window: { monolithApi: { get_confirm_dialog_prefs: () => Promise.resolve({}) } }
    };
    context.window.MonolothUI = { openModal(){}, closeModal(){}, escapeHtml: s => s };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('frontend/dialog.js', 'utf8'), context, { filename: 'dialog.js' });
    return { D: context.window.MonolithDialog, els };
}

test('showConfirm resolves on accept, rejects on cancel', async () => {
    const { D } = load();
    const p = D.showConfirm('T', 'M', null);
    D.closeDialog(true);
    await assert.doesNotReject(p);
    const p2 = D.showConfirm('T', 'M', null);
    D.closeDialog();
    await assert.rejects(p2);
});

test('isDialogActive returns boolean', () => {
    const { D } = load();
    assert.equal(typeof D.isDialogActive(), 'boolean');
});
