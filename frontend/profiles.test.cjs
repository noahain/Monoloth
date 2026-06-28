const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// --- Fake DOM ---

class FakeClassList {
    constructor() { this.classes = new Set(); }
    add() {
        for (var i = 0; i < arguments.length; i++) { this.classes.add(arguments[i]); }
    }
    remove() {
        for (var i = 0; i < arguments.length; i++) { this.classes.delete(arguments[i]); }
    }
    contains(cls) { return this.classes.has(cls); }
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
    setAttribute(name, value) {}
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
    var elements = new Map();

    return {
        body: new FakeElement('body'),
        documentElement: new FakeElement('html'),
        createElement: function (tag) {
            var el = new FakeElement(tag);
            if (tag === 'input') el.value = '';
            return el;
        },
        getElementById: function (id) {
            if (!elements.has(id)) {
                elements.set(id, new FakeElement(id));
            }
            return elements.get(id);
        }
    };
}

// --- Module Loader ---

function flushAsync() {
    return new Promise(function (resolve) { setTimeout(resolve, 20); });
}

function loadProfilesModule(opts) {
    opts = opts || {};
    var document = createDocument();
    var window = {};
    var trackedCalls = [];

    window.MonolothUI = {
        openModal: function (el) { if (el) el.classList.add('active'); },
        closeModal: function (el) { if (el) el.classList.remove('active'); }
    };

    window.MonolithDialog = {
        showConfirm: opts.overrideShowConfirm || function (title, msg, skipKey) {
            trackedCalls.push({ method: 'showConfirm', title: title, skipKey: skipKey });
            return Promise.resolve(true);
        },
        showPrompt: opts.overrideShowPrompt || function (title, label, defaultValue) {
            trackedCalls.push({ method: 'showPrompt', title: title, defaultValue: defaultValue });
            return Promise.resolve(defaultValue || '');
        }
    };

    window.MonolothApp = {
        showStatus: function (id, msg, isError) {
            trackedCalls.push({ method: 'showStatus', id: id, isError: !!isError });
        },
        isMainActive: opts.overrideIsMainActive || function () { return true; },
        reloadProfileSettings: function () {
            trackedCalls.push({ method: 'reloadProfileSettings' });
        }
    };

    window.MonolothTooltip = {
        attach: function () {},
        cleanup: function () {},
        scan: function () {}
    };

    var apiCalls = [];
    var apiHandlers = opts.api || {};
    var defaultResolve = function () { return Promise.resolve({ success: false }); };

    window.monolithApi = {};
    var apiMethods = ['get_profiles', 'switch_profile', 'delete_profile', 'rename_profile', 'create_profile'];
    apiMethods.forEach(function (method) {
        window.monolithApi[method] = function () {
            var args = Array.prototype.slice.call(arguments);
            apiCalls.push({ method: method, args: args });
            if (apiHandlers[method]) {
                var result = apiHandlers[method].apply(null, args);
                if (result && typeof result.then === 'function') return result;
                return Promise.resolve(result);
            }
            return defaultResolve();
        };
    });

    window.window = window;

    var context = {
        console: console,
        document: document,
        window: window,
        Promise: Promise,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Array: Array,
        Object: Object,
        JSON: JSON
    };
    context.globalThis = context;
    vm.createContext(context);

    var src = fs.readFileSync('frontend/profiles.js', 'utf8');
    vm.runInContext(src, context, { filename: 'frontend/profiles.js' });

    return {
        P: window.MonolithProfiles,
        trackedCalls: trackedCalls,
        apiCalls: apiCalls,
        document: document,
        window: window
    };
}

// --- Tests ---

test('getProfilesList returns empty array on init', function () {
    var harness = loadProfilesModule();
    var list = harness.P.getProfilesList();
    assert.ok(Array.isArray(list), 'should be an array');
    assert.equal(list.length, 0, 'should be empty');
});

test('getActiveProfileName returns Default on init', function () {
    var harness = loadProfilesModule();
    assert.equal(harness.P.getActiveProfileName(), 'Default');
});

test('loadProfiles populates profiles and active', async function () {
    var harness = loadProfilesModule({
        api: {
            get_profiles: function () {
                return Promise.resolve({
                    success: true,
                    profiles: [
                        { name: 'Dev', isDefault: false },
                        { name: 'Default', isDefault: true }
                    ],
                    active: 'Dev'
                });
            }
        }
    });

    await harness.P.loadProfiles();
    await flushAsync();

    var list = harness.P.getProfilesList();
    assert.equal(list.length, 2);
    assert.equal(list[0].name, 'Dev');
    assert.equal(list[1].name, 'Default');
    assert.equal(harness.P.getActiveProfileName(), 'Dev');
});

test('loadProfiles handles API failure gracefully', async function () {
    var harness = loadProfilesModule({
        api: {
            get_profiles: function () {
                return Promise.reject(new Error('fail'));
            }
        }
    });

    await harness.P.loadProfiles();
    await flushAsync();

    assert.equal(harness.P.getProfilesList().length, 0);
});

test('switchToProfile updates state and shows status', async function () {
    var harness = loadProfilesModule({
        api: {
            switch_profile: function (name) {
                return Promise.resolve({ success: true });
            }
        }
    });

    harness.P.switchToProfile('Dev');
    await flushAsync();

    assert.equal(harness.P.getActiveProfileName(), 'Dev');

    var statusCalls = harness.trackedCalls.filter(function (c) { return c.method === 'showStatus'; });
    assert.ok(statusCalls.length > 0, 'showStatus should have been called');
    assert.equal(statusCalls[0].isError, false, 'should not be an error');

    var reloadCalls = harness.trackedCalls.filter(function (c) { return c.method === 'reloadProfileSettings'; });
    assert.ok(reloadCalls.length > 0, 'reloadProfileSettings should have been called');
});

test('switchToProfile shows error on failure', async function () {
    var harness = loadProfilesModule({
        api: {
            switch_profile: function (name) {
                return Promise.resolve({ success: false, error: 'nope' });
            }
        }
    });

    harness.P.switchToProfile('Bad');
    await flushAsync();

    var statusCalls = harness.trackedCalls.filter(function (c) { return c.method === 'showStatus'; });
    assert.ok(statusCalls.length > 0, 'showStatus should have been called');
    assert.equal(statusCalls[0].isError, true, 'should be an error');
});

test('openProfileSwitcher opens the modal', function () {
    var harness = loadProfilesModule();
    harness.P.openProfileSwitcher();

    var switcher = harness.document.getElementById('profile-switcher');
    assert.ok(switcher.classList.contains('active'), 'switcher should have active class');
});

test('closeProfileSwitcher closes the modal', function () {
    var harness = loadProfilesModule();
    harness.P.openProfileSwitcher();
    harness.P.closeProfileSwitcher();

    var switcher = harness.document.getElementById('profile-switcher');
    assert.equal(switcher.classList.contains('active'), false, 'switcher should not be active');
});

test('isSwitcherActive returns false when closed', function () {
    var harness = loadProfilesModule();
    assert.equal(harness.P.isSwitcherActive(), false);
});

test('deleteProfileConfirm calls showConfirm then delete', async function () {
    var confirmResolve;
    var showConfirmPromise = new Promise(function (resolve) { confirmResolve = resolve; });

    var harness = loadProfilesModule({
        overrideShowConfirm: function () { return showConfirmPromise; },
        api: {
            delete_profile: function (name) { return Promise.resolve({ success: true }); },
            get_profiles: function () { return Promise.resolve({ success: true, profiles: [], active: 'Default' }); }
        }
    });

    harness.P.deleteProfileConfirm('Test');
    confirmResolve();
    await flushAsync();

    var deleteCalls = harness.apiCalls.filter(function (c) { return c.method === 'delete_profile'; });
    assert.equal(deleteCalls.length, 1);
    assert.equal(deleteCalls[0].args[0], 'Test');
});

test('deleteProfileConfirm does nothing when confirm is cancelled', async function () {
    var confirmReject;
    var showConfirmPromise = new Promise(function (_, reject) { confirmReject = reject; });

    var harness = loadProfilesModule({
        overrideShowConfirm: function () { return showConfirmPromise; },
        api: {
            delete_profile: function (name) { return Promise.resolve({ success: true }); }
        }
    });

    harness.P.deleteProfileConfirm('Test');
    confirmReject();
    await flushAsync();

    var deleteCalls = harness.apiCalls.filter(function (c) { return c.method === 'delete_profile'; });
    assert.equal(deleteCalls.length, 0, 'delete_profile should not have been called');
});

test('renameProfileInline calls showPrompt then rename', async function () {
    var harness = loadProfilesModule({
        overrideShowPrompt: function (title, label, defaultValue) {
            return Promise.resolve('NewName');
        },
        api: {
            rename_profile: function (oldName, newName) {
                return Promise.resolve({ success: true });
            },
            get_profiles: function () { return Promise.resolve({ success: true, profiles: [], active: 'Default' }); }
        }
    });

    harness.P.renameProfileInline('OldName');
    await flushAsync();

    var renameCalls = harness.apiCalls.filter(function (c) { return c.method === 'rename_profile'; });
    assert.equal(renameCalls.length, 1);
    assert.equal(renameCalls[0].args[0], 'OldName');
    assert.equal(renameCalls[0].args[1], 'NewName');
});
