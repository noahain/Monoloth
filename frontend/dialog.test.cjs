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

// Regression for bug 6: overlapping inline dialogs used to overwrite the single
// shared _idResolve/_idReject, stranding the first promise. The fix is a stack.
test('overlapping showConfirm calls do not strand the first promise', async () => {
    const { D } = load();
    const p1 = D.showConfirm('A', 'first', null);
    const p2 = D.showConfirm('B', 'second', null);

    // Resolve the inner (top-of-stack) dialog first; the outer promise stays pending.
    D.closeDialog(true);
    const r2 = await p2;
    assert.equal(r2, true, 'inner confirm must resolve first');

    // Now resolve the outer dialog. It must NOT have been silently resolved already.
    let outerResolved = false;
    const outerSettled = p1.then(v => { outerResolved = true; return v; });
    D.closeDialog(true);
    const r1 = await outerSettled;
    assert.equal(r1, true);
    assert.ok(outerResolved, 'outer promise must still resolve after inner settles');
});

// Cancellations propagate as rejections, not unhandled.
test('cancelling an overlapping dialog rejects cleanly', async () => {
    const { D } = load();
    const p1 = D.showConfirm('A', 'first', null);
    const p2 = D.showConfirm('B', 'second', null);
    D.closeDialog(); // cancel inner
    await assert.rejects(p2, /cancelled/);
    D.closeDialog(); // cancel outer
    await assert.rejects(p1, /cancelled/);
});
