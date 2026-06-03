(function () {
    'use strict';

    var DEFAULT_STATE = function () {
        var id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).slice(2);
        return {
            version: 1,
            tabs: [
                { id: id, isMain: true, profile: 'Default' }
            ],
            activeTabId: id,
            tabBarPosition: 'bottom',
            tabBarEnabled: true
        };
    };

    var state = null;
    var _listeners = [];
    var _debounceTimer = null;
    var _sessionsByTab = Object.create(null);
    var _saveInflight = false;

    function genId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    function loadConfig(callback) {
        if (!window.monolithApi || !window.monolithApi.get_config) {
            if (callback) callback(null);
            return;
        }
        window.monolithApi.get_config('tabs_state')
            .then(function (val) { if (callback) callback(val); })
            .catch(function () { if (callback) callback(null); });
    }

    window.TabManager = {
        state: function () { return state; },
        activeTabId: function () { return state ? state.activeTabId : null; },
        activeTab: function () {
            if (!state) return null;
            return state.tabs.find(function (t) { return t.id === state.activeTabId; }) || null;
        },
        getSessionsForTab: function (tabId) { return _sessionsByTab[tabId] || null; },
        on: function (fn) { _listeners.push(fn); },
        _emit: function (event) {
            _listeners.forEach(function (fn) { try { fn(event); } catch (e) { console.error(e); } });
        },
        registerSession: function (tabId, sessionId) {
            if (!_sessionsByTab[tabId]) _sessionsByTab[tabId] = new Set();
            _sessionsByTab[tabId].add(sessionId);
        },
        unregisterSession: function (tabId, sessionId) {
            if (_sessionsByTab[tabId]) {
                _sessionsByTab[tabId].delete(sessionId);
                if (_sessionsByTab[tabId].size === 0) delete _sessionsByTab[tabId];
            }
        },
        unregisterAllForTab: function (tabId) {
            delete _sessionsByTab[tabId];
        },
        _save: function () { },
        createTab: function (opts) {
            opts = opts || {};
            if (!state) state = DEFAULT_STATE();
            if (state.tabs.length >= 16) {
                console.warn('[TabManager] tab cap reached (16)');
                return null;
            }
            var newTab = {
                id: genId(),
                isMain: false,
                profile: (opts.profile || (this.activeTab() && this.activeTab().profile) || 'Default')
            };
            state.tabs.push(newTab);
            state.activeTabId = newTab.id;
            this._emit({ type: 'tab_created', tab: newTab });
            this._save();
            return newTab;
        },
        _init_for_test: function (initialState) { state = initialState; }
    };
})();
