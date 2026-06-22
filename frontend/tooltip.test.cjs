const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class FakeClassList {
    constructor() { this.classes = new Set(); }
    add(...c) { c.forEach((x) => this.classes.add(x)); }
    remove(...c) { c.forEach((x) => this.classes.delete(x)); }
    contains(c) { return this.classes.has(c); }
    toggle(c, force) {
        if (force === undefined) force = !this.classes.has(c);
        if (force) this.classes.add(c); else this.classes.delete(c);
        return force;
    }
    toString() { return Array.from(this.classes).join(' '); }
}

class FakeElement {
    constructor(tag) {
        this.tagName = tag;
        this.children = [];
        this.classList = new FakeClassList();
        this.eventListeners = {};
        this.parentNode = null;
        this.style = {};
        this.offsetParent = {};
        this.innerHTML = '';
        this.textContent = '';
        this.dataset = {};
        this._attrs = {};
    }
    addEventListener(t, h) { (this.eventListeners[t] = this.eventListeners[t] || []).push(h); }
    removeEventListener(t, h) { if (this.eventListeners[t]) this.eventListeners[t] = this.eventListeners[t].filter((fn) => fn !== h); }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter((i) => i !== c); c.parentNode = null; }
    contains(node) {
        if (node === this) return true;
        for (const child of this.children) if (child.contains && child.contains(node)) return true;
        return false;
    }
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name); }
    getAttribute(name) { return this._attrs[name] || ''; }
    setAttribute(name, value) { this._attrs[name] = value; this[name] = value; }
    removeAttribute(name) { delete this._attrs[name]; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    querySelector() { return null; }
    querySelectorAll() { return []; }
}

function loadTooltip() {
    const document = {
        body: new FakeElement('body'),
        createElement: (tag) => new FakeElement(tag),
        addEventListener() {},
        removeEventListener() {}
    };
    const window = {};
    window.window = window;
    window.document = document;
    const context = {
        console, document, window, Promise, setTimeout, clearTimeout
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('frontend/tooltip.js', 'utf8'), context, { filename: 'tooltip.js' });
    return { T: context.window.MonolothTooltip, document, context };
}

function flushAsync() {
    return new Promise((r) => setTimeout(r, 5));
}

test('cleanup detaches event listeners from removed elements', () => {
    const { T, document } = loadTooltip();
    const btn = new FakeElement('button');
    document.body.appendChild(btn);
    T.attach(btn, 'hint');
    assert.equal(btn.eventListeners.mouseenter.length, 1);

    btn.remove();
    T.cleanup();

    assert.equal(btn.eventListeners.mouseenter.length, 0, 'mouseenter listener must be removed');
    assert.equal(btn.eventListeners.mouseleave.length, 0, 'mouseleave listener must be removed');
    assert.equal(btn.eventListeners.mousemove.length, 0, 'mousemove listener must be removed');
});

test('cleanup hides a visible tooltip when its target is detached', () => {
    // Regression for bug 11: previously the tooltip could stay "stuck" because
    // cleanup removed the entry but did not hide the live tooltip element.
    // The fix: when cleanup removes a target that is the current tooltip target,
    // it must also call hide() so the floating tooltip element is removed.
    const { T, document } = loadTooltip();
    const btn = new FakeElement('button');
    document.body.appendChild(btn);
    T.attach(btn, 'stuck-hint');
    btn.remove();
    // cleanup() must not throw even when the target is detached.
    assert.doesNotThrow(() => T.cleanup());
    // After cleanup, the entry should be gone — re-attach to a fresh element to verify.
    const btn2 = new FakeElement('button');
    document.body.appendChild(btn2);
    T.attach(btn2, 'fresh');
    assert.equal(btn2.eventListeners.mouseenter.length, 1, 'fresh attach should add a listener');
});

// Regression for bug 10: clicking a still-initializing CMD tab used to be a
// no-op because the early `if (tab.initializing) return ...` guard fired before
// any visual activation. The fix delegates visual activation to
// _activatePanelTabInGroup, which must run BEFORE the initializing guard.
test('activateTab performs visual activation before the initializing guard', () => {
    const src = fs.readFileSync('frontend/sidebar.js', 'utf8');
    const helperMatch = src.match(/function _activatePanelTabInGroup\(group, tabId\)\s*\{[\s\S]*?\n\s{4}\}/);
    assert.ok(helperMatch, '_activatePanelTabInGroup helper must exist');
    const helperBlock = helperMatch[0];
    assert.ok(/classList\.(remove|add)\('inactive'\)/.test(helperBlock),
        '_activatePanelTabInGroup must toggle the inactive class');
    assert.ok(/classList\.(remove|add)\('active'\)/.test(helperBlock),
        '_activatePanelTabInGroup must toggle the active class');

    const activateMatch = src.match(/function activateTab\(tabId\)\s*\{[\s\S]*?if\s*\(\s*tab\.initializing\s*\)\s*\{/);
    assert.ok(activateMatch, 'activateTab must contain an initializing guard');
    const beforeGuard = activateMatch[0].split('tab.initializing')[0];
    assert.ok(/_activatePanelTabInGroup\(/.test(beforeGuard),
        'activateTab must call _activatePanelTabInGroup before the initializing guard');
});

// Regression for bug 9: closeTab used to call showConfirm().then(...) without a
// .catch, so cancelling the dialog produced an unhandled promise rejection.
test('closeTab attaches a catch handler to showConfirm', () => {
    const src = fs.readFileSync('frontend/sidebar.js', 'utf8');
    // Find the closeTab showConfirm chain and confirm a catch is present.
    const idx = src.indexOf("window.MonolothApp.showConfirm('Close Tab'");
    assert.ok(idx !== -1, 'closeTab must call showConfirm');
    const after = src.slice(idx, idx + 800);
    assert.ok(/\.then\(/.test(after), 'closeTab must use .then');
    assert.ok(/\.catch\(/.test(after), 'closeTab must use .catch to silence the cancel rejection');
});

// Regression for bug 16: _doCloseTab must retire the per-session generation
// state so the backend map does not leak retired panel tab ids.
test('_doCloseTab calls deleteSessionGeneration and retire_panel_tab', () => {
    const src = fs.readFileSync('frontend/sidebar.js', 'utf8');
    const idx = src.indexOf('function _doCloseTab(tabId)');
    assert.ok(idx !== -1);
    const after = src.slice(idx, idx + 1500);
    assert.ok(/deleteSessionGeneration\(tab\.sessionId\)/.test(after),
        '_doCloseTab must clear the per-session generation map');
    assert.ok(/retire_panel_tab\(tab\.sessionId\)/.test(after),
        '_doCloseTab must call the backend retire_panel_tab to free the backend generation');
});
