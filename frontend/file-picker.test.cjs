const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function fakeEl() {
    return {
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        dataset: {}, style: {},
        addEventListener() {}, appendChild() {}, setAttribute() {},
        querySelectorAll() { return []; }, querySelector() { return null; }
    };
}

function load() {
    const context = {
        console, setTimeout, clearTimeout, Promise,
        document: { getElementById: () => fakeEl(), createElement: () => fakeEl(), querySelectorAll: () => [], addEventListener() {} },
        window: { monolithApi: {}, MonolothUI: { escapeHtml: s => s } }
    };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('frontend/file-picker.js', 'utf8'), context, { filename: 'file-picker.js' });
    return context.window.MonolithFilePicker;
}

test('joinPath appends name with single backslash, trims trailing slashes', () => {
    const FP = load();
    assert.equal(FP.joinPath('C:\\Users', 'file.txt'), 'C:\\Users\\file.txt');
    assert.equal(FP.joinPath('C:\\Users\\', 'file.txt'), 'C:\\Users\\file.txt');
    assert.equal(FP.joinPath('C:\\\\', 'a'), 'C:\\a');
});
