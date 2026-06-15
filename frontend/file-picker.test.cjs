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

function load(isWindows) {
    const context = {
        console, setTimeout, clearTimeout, Promise,
        document: { getElementById: () => fakeEl(), createElement: () => fakeEl(), querySelectorAll: () => [], addEventListener() {} },
        window: { monolithApi: {}, MonolothUI: { escapeHtml: s => s, isWindows: () => isWindows } }
    };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('frontend/file-picker.js', 'utf8'), context, { filename: 'file-picker.js' });
    return context.window.MonolithFilePicker;
}

test('joinPath uses Windows separators and trims trailing separators', () => {
    const FP = load(true);
    assert.equal(FP.joinPath('C:\\Users', 'file.txt'), 'C:\\Users\\file.txt');
    assert.equal(FP.joinPath('C:\\Users\\', 'file.txt'), 'C:\\Users\\file.txt');
    assert.equal(FP.joinPath('C:\\\\', 'a'), 'C:\\a');
});

test('joinPath uses Unix separators and preserves root', () => {
    const FP = load(false);
    assert.equal(FP.joinPath('/home/user', 'file.txt'), '/home/user/file.txt');
    assert.equal(FP.joinPath('/home/user/', 'file.txt'), '/home/user/file.txt');
    assert.equal(FP.joinPath('/', 'home'), '/home');
    assert.equal(FP.joinPath('~', 'Downloads'), '~/Downloads');
});
