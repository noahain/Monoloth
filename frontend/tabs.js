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
        setTabProfile: function (tabId, profile) {
            if (!state) return;
            var tab = state.tabs.find(function (t) { return t.id === tabId; });
            if (!tab) return;
            tab.profile = profile;
            this._emit({ type: 'tab_profile_changed', tabId: tabId, profile: profile });
            this._save();
        },
        reorderTabs: function (fromIndex, toIndex) {
            if (!state) return;
            if (fromIndex < 0 || fromIndex >= state.tabs.length) return;
            if (toIndex < 0 || toIndex >= state.tabs.length) return;
            if (fromIndex === toIndex) return;
            var moved = state.tabs.splice(fromIndex, 1)[0];
            state.tabs.splice(toIndex, 0, moved);
            this._emit({ type: 'tabs_reordered' });
            this._save();
        },
        setActiveTab: function (tabId) {
            if (!state) return;
            var tab = state.tabs.find(function (t) { return t.id === tabId; });
            if (!tab) return;
            state.activeTabId = tabId;
            this._emit({ type: 'active_tab_changed', tabId: tabId });
            this._save();
        },
        closeTab: function (tabId, opts) {
            opts = opts || {};
            if (!state) return null;
            var idx = state.tabs.findIndex(function (t) { return t.id === tabId; });
            if (idx === -1) return null;
            var tab = state.tabs[idx];
            var wasActive = (state.activeTabId === tabId);
            var isOnlyTab = (state.tabs.length === 1);

            if (!opts.skipTerminate && window.monolithApi && window.monolithApi.terminate_tab_sessions) {
                window.monolithApi.terminate_tab_sessions(tabId).catch(function (e) {
                    console.error('[TabManager] terminate_tab_sessions failed', e);
                });
            }

            this.unregisterAllForTab(tabId);
            this._emit({ type: 'tab_closing', tabId: tabId });

            if (isOnlyTab && tab.isMain) {
                this._emit({ type: 'tab_close_main_only', tabId: tabId });
                this._save();
                return { removed: false, switchedTo: null, tab: tab };
            }

            if (tab.isMain) {
                var newMain = state.tabs[idx + 1] || state.tabs[idx - 1];
                if (newMain) newMain.isMain = true;
            }

            state.tabs.splice(idx, 1);

            var switchedTo = null;
            if (wasActive) {
                switchedTo = state.tabs[idx] || state.tabs[idx - 1] || state.tabs[0] || null;
                if (switchedTo) state.activeTabId = switchedTo.id;
            }

            this._emit({ type: 'tab_closed', tabId: tabId, switchedTo: switchedTo });
            this._save();
            return { removed: true, switchedTo: switchedTo, tab: tab };
        },
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
        _init_for_test: function (initialState) { state = initialState; },
        _save: function () {
            if (!state) return;
            if (!window.monolithApi || !window.monolithApi.set_config) return;
            if (_debounceTimer) clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(function () {
                _debounceTimer = null;
                _doSave();
            }, 500);
        },
        flushSave: function () {
            if (_debounceTimer) {
                clearTimeout(_debounceTimer);
                _debounceTimer = null;
            }
            _doSave();
        },
        init: function (callback) {
            var self = this;
            loadConfig(function (raw) {
                if (raw && raw.tabs && Array.isArray(raw.tabs) && raw.tabs.length > 0 && raw.tabBarEnabled) {
                    state = self._normalize(raw);
                } else {
                    state = DEFAULT_STATE();
                    self._save();
                }
                self._emit({ type: 'initialized' });
                if (callback) callback(state);
            });
        },
        _normalize: function (raw) {
            var s = {
                version: raw.version || 1,
                tabs: raw.tabs.slice(),
                activeTabId: raw.activeTabId,
                tabBarPosition: raw.tabBarPosition || 'bottom',
                tabBarEnabled: raw.tabBarEnabled !== false
            };
            var mainCount = s.tabs.filter(function (t) { return t.isMain; }).length;
            if (mainCount === 0 && s.tabs.length > 0) {
                s.tabs[0].isMain = true;
            } else if (mainCount > 1) {
                var firstMain = true;
                s.tabs.forEach(function (t) {
                    if (t.isMain && firstMain) { firstMain = false; }
                    else if (t.isMain) { t.isMain = false; }
                });
            }
            var activeExists = s.tabs.some(function (t) { return t.id === s.activeTabId; });
            if (!activeExists && s.tabs.length > 0) {
                s.activeTabId = s.tabs[0].id;
            }
            return s;
        }
    };

    function _doSave() {
        if (!state || !window.monolithApi || !window.monolithApi.set_config) return;
        _saveInflight = true;
        window.monolithApi.set_config('tabs_state', state)
            .catch(function (e) { console.error('[TabManager] save failed', e); })
            .then(function () { _saveInflight = false; });
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', function () {
            if (_debounceTimer) {
                clearTimeout(_debounceTimer);
                _debounceTimer = null;
            }
            _doSave();
        });
    }
})();
