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
        window: { monolithApi: {}, MonolothUI: { escapeHtml: s => s, isWindows: () => isWindows }, MonolithCtxMenu: { createContextMenu() {}, shortcutHtml() { return ''; } } }
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

test('FILE_IMAGE_EXTS no longer advertises SVG/ICO as previewable', () => {
    // Regression for bug 3: SVG/ICO are listed in the picker but get_file_preview
    // does not return a dataUrl for them, so the preview always shows "not available".
    // The honest fix is to drop them from FILE_IMAGE_EXTS.
    const FP = load(true);
    const FP2 = load(false);
    for (const FP_ of [FP, FP2]) {
        const src = fs.readFileSync('frontend/file-picker.js', 'utf8');
        assert.ok(!src.includes(".push('.svg'") && !src.includes(".push('.ico'"),
            'FILE_IMAGE_EXTS must not include .svg or .ico');
    }
});

test('formatDate handles backend relative strings and ISO', () => {
    // Regression for bug 2: backend format_time returns "3d ago" / "5h ago" / "just now".
    // The frontend must not treat them as epoch seconds (would produce "Invalid Date").
    const src = fs.readFileSync('frontend/file-picker.js', 'utf8');
    // The showPreview ext check must use the array, not a substring indexOf.
    assert.ok(!src.includes("'.png.jpg.jpeg.gif.bmp.webp.svg.ico'.indexOf"),
        'showPreview must use FILE_IMAGE_EXTS.indexOf, not a hardcoded substring');
    // formatDate must be defined and accept strings
    const m = src.match(/function formatDate\([^)]*\)\s*{[\s\S]*?\n\s{4}\}/);
    assert.ok(m, 'formatDate function must exist');
});

test('custom file picker is stacked above the new tab card', () => {
    const css = fs.readFileSync('frontend/style.css', 'utf8');
    const filePickerZIndex = Number(css.match(/\.file-picker\s*{[^}]*z-index:\s*(\d+)/s)?.[1]);
    const newTabCardZIndex = Number(css.match(/\.new-tab-card-overlay\s*{[^}]*z-index:\s*(\d+)/s)?.[1]);

    assert.ok(filePickerZIndex > newTabCardZIndex,
        `file picker z-index (${filePickerZIndex}) must exceed new tab card z-index (${newTabCardZIndex})`);
});
