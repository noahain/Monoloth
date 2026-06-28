const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// --- Fake DOM ---

class FakeClassList {
    constructor() { this.classes = new Set(); }
    add(...classes) { classes.forEach(function (c) { this.classes.add(c); }, this); }
    remove(...classes) { classes.forEach(function (c) { this.classes.delete(c); }, this); }
    contains(cls) { return this.classes.has(cls); }
    toggle(cls, force) {
        if (force === undefined) force = !this.classes.has(cls);
        if (force) this.classes.add(cls); else this.classes.delete(cls);
        return force;
    }
}

class FakeElement {
    constructor(id) {
        var self = this;
        this.id = id;
        this.children = [];
        this.classList = new FakeClassList();
        this.dataset = {};
        this.eventListeners = {};
        this.parentNode = null;
        this.style = {};
        this._innerHTML = '';
        Object.defineProperty(this, 'innerHTML', {
            get: function () { return self._innerHTML; },
            set: function (v) { self._innerHTML = v; if (v === '') self.children = []; },
            enumerable: true,
            configurable: true
        });
        this.textContent = '';
        this.value = '';
        this.className = '';
    }
    addEventListener(type, handler) {
        if (!this.eventListeners[type]) this.eventListeners[type] = [];
        this.eventListeners[type].push(handler);
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    remove() {
        if (this.parentNode) {
            this.parentNode.children = this.parentNode.children.filter(function (c) { return c !== this; }, this);
            this.parentNode = null;
        }
    }
    querySelector(sel) {
        if (sel === '.command-palette-item.selected') {
            for (var i = 0; i < this.children.length; i++) {
                if (this.children[i].classList && this.children[i].classList.contains('selected')) return this.children[i];
            }
            for (var j = 0; j < this.children.length; j++) {
                if (this.children[j].className && this.children[j].className.indexOf('selected') !== -1) return this.children[j];
            }
        }
        return null;
    }
    querySelectorAll(sel) {
        if (sel === '.command-palette-item') {
            return this.children.filter(function (c) { return c.className && c.className.indexOf('command-palette-item') !== -1; });
        }
        return [];
    }
    setAttribute(name, value) { this['__attr_' + name] = value; }
    scrollIntoView() {}
    focus() {}
    click() {
        if (this.eventListeners.click) {
            for (var i = 0; i < this.eventListeners.click.length; i++) {
                this.eventListeners.click[i].call(this);
            }
        }
    }
}

function createDocument() {
    var body = new FakeElement('body');
    var elements = new Map();

    return {
        body: body,
        documentElement: new FakeElement('html'),
        createElement: function (tag) {
            var el = new FakeElement(tag);
            if (tag === 'input') el.value = '';
            return el;
        },
        getElementById: function (id) {
            if (!elements.has(id)) {
                var el = new FakeElement(id);
                if (id === 'command-palette-input') el.value = '';
                elements.set(id, el);
            }
            return elements.get(id);
        }
    };
}

// --- Module Loader ---

function getItemLabels(list) {
    var labels = [];
    for (var i = 0; i < list.children.length; i++) {
        var c = list.children[i];
        if (c.className && c.className.indexOf('command-palette-item') !== -1 && c.className.indexOf('command-palette-empty') === -1) {
            for (var j = 0; j < c.children.length; j++) {
                if (c.children[j].className === 'command-palette-label') {
                    labels.push(c.children[j].textContent);
                    break;
                }
            }
        } else if (c.textContent) {
            labels.push(c.textContent);
        }
    }
    return labels;
}

function loadPalette(opts) {
    opts = opts || {};
    var document = createDocument();
    var window = {};

    window.MonolithShortcuts = opts.shortcuts || {
        getShortcut: function (k) { return 'Ctrl+' + (k[0] || 'K').toUpperCase(); }
    };

    window.MonolothUI = opts.monolothUI || {
        openModal: function (el) { if (el) el.classList.add('active'); },
        closeModal: function (el) { if (el) el.classList.remove('active'); }
    };

    if (opts.MonolithTerminal) {
        window.MonolithTerminal = opts.MonolithTerminal;
    }
    if (opts.MonolothApp) {
        window.MonolothApp = opts.MonolothApp;
    }
    if (opts.SidebarManager) {
        window.SidebarManager = opts.SidebarManager;
    }

    window.window = window;

    var context = {
        console: console,
        document: document,
        window: window,
        Promise: Promise,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Array: Array,
        Math: Math
    };
    context.globalThis = context;
    vm.createContext(context);

    var src = fs.readFileSync('frontend/command-palette.js', 'utf8');
    var patchedSrc = src.replace(
        'window.MonolithPalette = {',
        'window.__monolithPaletteInternals = { state: _paletteState, subs: _subPalettes, enterSub: enterSubPalette }; window.MonolithPalette = {'
    );
    vm.runInContext(patchedSrc, context, { filename: 'frontend/command-palette.js' });

    return {
        P: window.MonolithPalette,
        internals: window.__monolithPaletteInternals,
        document: document,
        window: window
    };
}

// --- Tests ---

test('openPalette renders commands and shows the palette', function () {
    var harness = loadPalette();
    var P = harness.P;
    var list = harness.document.getElementById('command-palette-list');

    P.open();

    assert.ok(list.children.length > 0, 'list should have children');
    var labels = getItemLabels(list);
    assert.ok(labels.indexOf('New Tab') !== -1, 'New Tab command should appear');
    assert.equal(P.isActive(), true, 'palette should be active');
});

test('closePalette hides the palette', function () {
    var harness = loadPalette();
    var P = harness.P;

    P.open();
    assert.equal(P.isActive(), true);
    P.close();
    assert.equal(P.isActive(), false);
});

test('isActive returns correct state', function () {
    var harness = loadPalette();
    var P = harness.P;

    assert.equal(P.isActive(), false, 'should be inactive before open');
    P.open();
    assert.equal(P.isActive(), true, 'should be active after open');
    P.close();
    assert.equal(P.isActive(), false, 'should be inactive after close');
});

test('filterPaletteCommands filters by query', function () {
    var harness = loadPalette();
    var P = harness.P;
    var list = harness.document.getElementById('command-palette-list');

    P.open();
    P.filter('settings');

    var labels = getItemLabels(list);
    assert.ok(labels.indexOf('Settings') !== -1, 'Settings should appear');
    assert.ok(labels.indexOf('Appearance Settings') !== -1, 'Appearance Settings should appear');
    assert.ok(labels.indexOf('New Tab') === -1, 'New Tab should not appear');
});

test('filterPaletteCommands shows all when query is empty', function () {
    var harness = loadPalette();
    var P = harness.P;
    var list = harness.document.getElementById('command-palette-list');

    P.open();
    P.filter('');

    var labels = getItemLabels(list);
    assert.ok(labels.indexOf('New Tab') !== -1, 'New Tab should appear');
    assert.ok(labels.indexOf('Settings') !== -1, 'Settings should appear');
    assert.ok(labels.indexOf('Toggle Sidebar') !== -1, 'Toggle Sidebar should appear');
});

test('filterPaletteCommands shows "No matching commands" when no match', function () {
    var harness = loadPalette();
    var P = harness.P;
    var list = harness.document.getElementById('command-palette-list');

    P.open();
    P.filter('zzzxyznomatch');

    assert.ok(list.children.length > 0, 'list should have at least one child');
    assert.equal(list.children[0].textContent, 'No matching commands', 'should show empty state');
    assert.ok(list.children[0].className.indexOf('command-palette-empty') !== -1, 'should have empty class');
});

test('handleNav ArrowDown moves selection', function () {
    var harness = loadPalette();
    var P = harness.P;
    var list = harness.document.getElementById('command-palette-list');

    P.open();

    var items = list.querySelectorAll('.command-palette-item');

    P.handleNav({ code: 'ArrowDown', preventDefault: function () {} });

    var selected = list.querySelector('.command-palette-item.selected');
    assert.ok(selected !== null, 'an item should be selected');
    assert.equal(selected.textContent || (selected.children[1] && selected.children[1].textContent),
        items.length > 1 ? items[1].textContent || (items[1].children[1] && items[1].children[1].textContent) : '',
        'second item should be selected after ArrowDown');

    assert.equal(harness.internals.state.selectedIndex, 1, 'selectedIndex should be 1');
});

test('handleNav ArrowUp moves selection up', function () {
    var harness = loadPalette();
    var P = harness.P;
    var list = harness.document.getElementById('command-palette-list');

    P.open();

    P.handleNav({ code: 'ArrowDown', preventDefault: function () {} });
    P.handleNav({ code: 'ArrowDown', preventDefault: function () {} });
    P.handleNav({ code: 'ArrowUp', preventDefault: function () {} });

    assert.equal(harness.internals.state.selectedIndex, 1, 'selectedIndex should be 1 after down-down-up');

    var items = list.querySelectorAll('.command-palette-item');
    var selected = list.querySelector('.command-palette-item.selected');
    assert.equal(selected, items[1], 'second item (index 1) should be selected');
});

test('handleNav Enter clicks the selected item', function () {
    var promptNewTabCalls = 0;

    var harness = loadPalette({
        MonolithTerminal: {
            promptNewTab: function () { promptNewTabCalls += 1; }
        },
        MonolothApp: {
            backToLanding: function () {},
            getCurrentDir: function () { return ''; },
            copyToClipboard: function () {},
            clearTerminal: function () {},
            showSettings: function () {},
            switchTab: function () {},
            openProfileSwitcher: function () {}
        },
        SidebarManager: {
            toggleSidebar: function () {},
            toggleCmdPanel: function () {}
        }
    });
    var P = harness.P;
    var list = harness.document.getElementById('command-palette-list');

    P.open();

    var items = list.querySelectorAll('.command-palette-item');
    assert.ok(items.length > 0, 'should have items');

    P.handleNav({ code: 'Enter', preventDefault: function () {} });

    assert.equal(promptNewTabCalls, 1, 'New Tab action should have been called');
    assert.equal(P.isActive(), false, 'palette should close after executing item');
});

test('handleNav Backspace with empty input exits sub-palette', function () {
    var harness = loadPalette();
    var P = harness.P;
    var internals = harness.internals;
    var list = harness.document.getElementById('command-palette-list');

    internals.subs['test-sub'] = {
        render: function (q) { return [{ label: 'Sub Item', icon: 'gear' }]; },
        placeholder: 'Search sub...',
        backLabel: 'Back'
    };

    P.open();
    internals.enterSub('test-sub', '');
    assert.equal(P.isSubActive(), true, 'should be in sub-palette');

    var items = list.querySelectorAll('.command-palette-item');
    assert.ok(items.length >= 1, 'sub-palette should have items');

    var backFound = false;
    for (var i = 0; i < items.length; i++) {
        for (var j = 0; j < items[i].children.length; j++) {
            if (items[i].children[j].textContent === 'Back') backFound = true;
        }
    }
    assert.ok(backFound, 'back button should appear in sub-palette');

    P.handleNav({ code: 'Backspace', preventDefault: function () {} });
    assert.equal(P.isSubActive(), false, 'should exit sub-palette after Backspace');
});

test('enterSubPalette and exitSubPalette cycle', function () {
    var harness = loadPalette();
    var P = harness.P;
    var internals = harness.internals;
    var list = harness.document.getElementById('command-palette-list');

    internals.subs['path-picker'] = {
        render: function (q) {
            var items = [
                { id: 'home', label: 'Home Directory', icon: 'gear', action: function () {} },
                { id: 'docs', label: 'Documents', icon: 'gear', action: function () {} }
            ];
            if (q) items = items.filter(function (it) { return it.label.toLowerCase().indexOf(q.toLowerCase()) !== -1; });
            return items;
        },
        placeholder: 'Pick a path...',
        backLabel: 'Back to Commands'
    };

    P.open();

    var beforeLabels = getItemLabels(list);
    assert.ok(beforeLabels.indexOf('New Tab') !== -1, 'original commands should include New Tab');
    assert.ok(beforeLabels.indexOf('Home Directory') === -1, 'original commands should NOT include Home Directory');

    internals.enterSub('path-picker', '');

    var afterLabels = getItemLabels(list);
    assert.ok(afterLabels.indexOf('Home Directory') !== -1, 'sub-palette should show Home Directory');
    assert.ok(afterLabels.indexOf('Documents') !== -1, 'sub-palette should show Documents');
    assert.equal(P.isSubActive(), true, 'should be in sub-palette');

    P.exitSub();

    var restoredLabels = getItemLabels(list);
    assert.ok(restoredLabels.indexOf('New Tab') !== -1, 'original commands should be restored');
    assert.ok(restoredLabels.indexOf('Home Directory') === -1, 'Home Directory should be gone after exit');
    assert.equal(P.isSubActive(), false, 'should not be in sub-palette');
});
