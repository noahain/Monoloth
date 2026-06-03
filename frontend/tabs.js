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
    var _terms = Object.create(null);
    var _fitAddons = Object.create(null);
    var _sessionGeneration = Object.create(null);
    var _skipNextEof = Object.create(null);
    var _firstOutput = Object.create(null);
    var _exitTimer = Object.create(null);
    var _terminalRunning = Object.create(null);

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
            if (_terms[tabId]) { try { _terms[tabId].dispose(); } catch (e) {} _terms[tabId] = null; }
            _fitAddons[tabId] = null;
            _terminalRunning[tabId] = false;
            this.clearExitTimer(tabId);
            delete _sessionGeneration[tabId + '__main'];
            delete _sessionGeneration[tabId + '__panel'];
            delete _skipNextEof[tabId + '__main'];
            delete _skipNextEof[tabId + '__panel'];
            delete _firstOutput[tabId];
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
        initTabTerminal: function (tabId, dir, opts) {
            opts = opts || {};
            var self = this;
            var sessionId = tabId + '__main';
            var container = document.querySelector('.terminal-instance[data-tab-id="' + tabId + '"]');
            if (!container) {
                console.error('[TabManager] no terminal-instance for tab', tabId);
                return Promise.resolve({ success: false, error: 'no container' });
            }

            if (_terms[tabId]) {
                try { _terms[tabId].dispose(); } catch (e) {}
                _terms[tabId] = null;
            }
            _fitAddons[tabId] = null;
            _firstOutput[tabId] = true;
            if (_exitTimer[tabId]) { clearTimeout(_exitTimer[tabId]); _exitTimer[tabId] = null; }
            container.innerHTML = '';

            if (typeof Terminal === 'undefined') {
                container.innerHTML = '<div style="color:#c0c0c0;padding:20px;font-family:monospace;">Error: Terminal library failed to load.</div>';
                return Promise.resolve({ success: false, error: 'no Terminal' });
            }

            var term = new Terminal({
                allowTransparency: true,
                fontFamily: '"Cascadia Mono", "Consolas", "Lucida Console", "Courier New", monospace',
                fontSize: 14,
                scrollback: 2000,
                smoothScrollDuration: 0,
                scrollSensitivity: 1,
                allowProposedApi: true,
                windowsMode: true,
                minimumContrastRatio: 1,
                fastScrollModifier: 'alt',
                fastScrollSensitivity: 5,
                scrollOnUserInput: true
            });
            term.open(container);
            term.focus();

            var fit = null;
            if (typeof FitAddon !== 'undefined') {
                fit = new FitAddon.FitAddon();
                term.loadAddon(fit);
            }
            _terms[tabId] = term;
            _fitAddons[tabId] = fit;
            _terminalRunning[tabId] = false;

            this.registerSession(tabId, sessionId);

            return new Promise(function (resolve) {
                requestAnimationFrame(function () {
                    if (fit) fit.fit();
                    var profile = (self.activeTab() && self.activeTab().profile) || 'Default';
                    var recordHistory = opts.recordHistory !== false;
                    window.monolithApi.start_terminal(sessionId, dir, recordHistory, opts.shell || null, term.cols, term.rows)
                        .then(function (result) {
                            if (!result || !result.success) {
                                term.writeln('Failed to start. ' + (result && result.error ? result.error : ''));
                                resolve({ success: false });
                                return;
                            }
                            _terminalRunning[tabId] = true;
                            _sessionGeneration[sessionId] = result.generation || 0;
                            resolve({ success: true, generation: result.generation });
                        })
                        .catch(function (err) {
                            term.writeln('Error: ' + err);
                            resolve({ success: false, error: String(err) });
                        });
                });
            });
        },
        getTerminal: function (tabId) { return _terms[tabId] || null; },
        getFitAddon: function (tabId) { return _fitAddons[tabId] || null; },
        isTerminalRunning: function (tabId) { return !!_terminalRunning[tabId]; },
        setSkipNextEof: function (sessionId, val) { _skipNextEof[sessionId] = !!val; },
        getSkipNextEof: function (sessionId) { return !!_skipNextEof[sessionId]; },
        setSessionGeneration: function (sessionId, gen) { _sessionGeneration[sessionId] = gen; },
        getSessionGeneration: function (sessionId) { return _sessionGeneration[sessionId] || 0; },
        clearExitTimer: function (tabId) {
            if (_exitTimer[tabId]) { clearTimeout(_exitTimer[tabId]); _exitTimer[tabId] = null; }
        },
        scheduleExitTimer: function (tabId, fn, ms) {
            this.clearExitTimer(tabId);
            _exitTimer[tabId] = setTimeout(fn, ms);
        },
        isFirstOutput: function (tabId) {
            var v = !!_firstOutput[tabId];
            if (v) _firstOutput[tabId] = false;
            return v;
        },
        switchTo: function (tabId) {
            if (!state) return;
            var tab = state.tabs.find(function (t) { return t.id === tabId; });
            if (!tab) return;
            if (state.activeTabId === tabId) return;

            state.activeTabId = tabId;

            var instances = document.querySelectorAll('.terminal-instance');
            instances.forEach(function (el) {
                el.style.display = (el.getAttribute('data-tab-id') === tabId) ? 'block' : 'none';
            });

            var slEl = document.getElementById('simplified-landing');
            if (slEl) slEl.style.display = 'none';

            var term = _terms[tabId];
            var fit = _fitAddons[tabId];
            if (term && fit) {
                requestAnimationFrame(function () {
                    fit.fit();
                    if (window.monolithApi && window.monolithApi.resize_terminal) {
                        window.monolithApi.resize_terminal(tabId + '__main', term.cols, term.rows);
                    }
                });
            }

            this._emit({ type: 'active_tab_changed', tabId: tabId });
            this._save();
        },
        handleBack: function (tabId) {
            var self = this;
            var tab = state.tabs.find(function (t) { return t.id === tabId; });
            if (!tab) return;
            var running = _terminalRunning[tabId];
            var proceed = function () { self._backToSimplifiedLanding(tabId); };
            if (running) {
                if (typeof window.showConfirm === 'function') {
                    window.showConfirm('Return to Launcher', 'Return to launcher? The current session will be terminated.')
                        .then(proceed).catch(function () {});
                } else if (confirm('Return to launcher? The current session will be terminated.')) {
                    proceed();
                }
            } else {
                proceed();
            }
        },
        _backToSimplifiedLanding: function (tabId) {
            if (window.monolithApi && window.monolithApi.terminate_terminal) {
                window.monolithApi.terminate_terminal(tabId + '__main').catch(function () {});
            }
            this.unregisterSession(tabId, tabId + '__main');

            var term = _terms[tabId];
            if (term) { try { term.dispose(); } catch (e) {} _terms[tabId] = null; }
            _fitAddons[tabId] = null;
            _terminalRunning[tabId] = false;
            this.clearExitTimer(tabId);

            var container = document.querySelector('.terminal-instance[data-tab-id="' + tabId + '"]');
            if (container) container.innerHTML = '';

            if (window.simplifiedLanding && window.simplifiedLanding.renderInto) {
                window.simplifiedLanding.renderInto(container, tabId);
            }
            this._emit({ type: 'back_to_simplified', tabId: tabId });
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
        },
        renderTabs: function () {
            var bar = document.getElementById('tab-bar');
            var tabsContainer = document.getElementById('tab-bar-tabs');
            if (!bar || !tabsContainer) return;
            if (!state) return;

            tabsContainer.innerHTML = '';

            state.tabs.forEach(function (tab) {
                var chip = document.createElement('div');
                chip.className = 'tab-chip';
                if (tab.id === state.activeTabId) chip.classList.add('active');
                if (tab.isMain) chip.classList.add('is-main');
                chip.setAttribute('data-tab-id', tab.id);

                var label = document.createElement('span');
                label.className = 'tab-chip-profile';
                label.textContent = tab.profile || 'Default';
                chip.appendChild(label);

                if (tab.isMain) {
                    var badge = document.createElement('span');
                    badge.className = 'tab-chip-main-badge';
                    badge.setAttribute('data-tooltip', 'Main tab');
                    badge.textContent = '\u25CF';
                    chip.appendChild(badge);
                }

                var closeBtn = document.createElement('button');
                closeBtn.className = 'tab-chip-close';
                closeBtn.setAttribute('data-tab-id', tab.id);
                closeBtn.setAttribute('data-tooltip', 'Close');
                closeBtn.textContent = '\u00d7';
                chip.appendChild(closeBtn);

                tabsContainer.appendChild(chip);
            });

            if (state.tabs.length < 16) {
                var addBtn = document.createElement('button');
                addBtn.className = 'tab-chip-add';
                addBtn.id = 'tab-add-btn';
                addBtn.setAttribute('data-tooltip', 'New Tab');
                addBtn.textContent = '+';
                tabsContainer.appendChild(addBtn);
            }
        },
        _setupDragHandlers: function () {
            var self = this;
            var tabsContainer = document.getElementById('tab-bar-tabs');
            if (!tabsContainer) return;
            var draggedFrom = null;
            var dragGhost = null;

            tabsContainer.addEventListener('mousedown', function (e) {
                var chip = e.target.closest('.tab-chip');
                if (!chip) return;
                var tabId = chip.getAttribute('data-tab-id');
                if (!tabId) return;
                if (e.target.classList.contains('tab-chip-close')) return;
                if (e.target.classList.contains('tab-chip-main-badge')) return;

                var fromIndex = state.tabs.findIndex(function (t) { return t.id === tabId; });
                if (fromIndex === -1) return;

                draggedFrom = fromIndex;
                var startX = e.clientX;
                var chipRect = chip.getBoundingClientRect();

                function onMove(ev) {
                    if (draggedFrom === null) return;
                    var dx = ev.clientX - startX;
                    if (!dragGhost) {
                        dragGhost = chip.cloneNode(true);
                        dragGhost.style.position = 'fixed';
                        dragGhost.style.left = chipRect.left + 'px';
                        dragGhost.style.top = chipRect.top + 'px';
                        dragGhost.style.width = chipRect.width + 'px';
                        dragGhost.style.opacity = '0.8';
                        dragGhost.style.zIndex = '9999';
                        dragGhost.style.pointerEvents = 'none';
                        document.body.appendChild(dragGhost);
                    }
                    dragGhost.style.left = (chipRect.left + dx) + 'px';
                }

                function onUp(ev) {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    if (dragGhost) { dragGhost.remove(); dragGhost = null; }
                    if (draggedFrom === null) return;
                    var dropX = ev.clientX;
                    var chips = Array.prototype.slice.call(tabsContainer.querySelectorAll('.tab-chip'));
                    var toIndex = draggedFrom;
                    for (var i = 0; i < chips.length; i++) {
                        var rect = chips[i].getBoundingClientRect();
                        if (dropX < rect.left + rect.width / 2) {
                            toIndex = i;
                            break;
                        }
                        toIndex = i + 1;
                    }
                    if (toIndex > chips.length) toIndex = chips.length;
                    if (toIndex !== draggedFrom) {
                        self.reorderTabs(draggedFrom, toIndex);
                        self.renderTabs();
                    }
                    draggedFrom = null;
                }

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        },
        _setupContextMenu: function () {
            var self = this;
            var tabsContainer = document.getElementById('tab-bar-tabs');
            if (!tabsContainer) return;
            var menu = document.createElement('div');
            menu.className = 'tab-context-menu';
            menu.style.display = 'none';
            menu.innerHTML = '<button data-action="close">Close</button><button data-action="close-others">Close Others</button>';
            document.body.appendChild(menu);

            var currentTabId = null;

            tabsContainer.addEventListener('contextmenu', function (e) {
                var chip = e.target.closest('.tab-chip');
                if (!chip) return;
                e.preventDefault();
                currentTabId = chip.getAttribute('data-tab-id');
                menu.style.left = e.clientX + 'px';
                menu.style.top = e.clientY + 'px';
                menu.style.display = 'block';
            });

            menu.addEventListener('click', function (e) {
                var action = e.target.getAttribute('data-action');
                if (!action || !currentTabId) return;
                menu.style.display = 'none';
                if (action === 'close') {
                    self.closeTab(currentTabId);
                    self.renderTabs();
                } else if (action === 'close-others') {
                    self._closeOthers(currentTabId);
                }
            });

            document.addEventListener('click', function (e) {
                if (!menu.contains(e.target)) menu.style.display = 'none';
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') menu.style.display = 'none';
            });
        },
        _closeOthers: function (keepTabId) {
            if (!state) return;
            var keepTab = state.tabs.find(function (t) { return t.id === keepTabId; });
            if (!keepTab) return;
            var mainTab = state.tabs.find(function (t) { return t.isMain; });
            var toClose = state.tabs.filter(function (t) {
                return t.id !== keepTabId && t.id !== (mainTab && mainTab.id);
            });
            if (toClose.length === 0) return;
            var self = this;
            var hasRunning = toClose.some(function (t) { return self.isTerminalRunning(t.id); });
            var proceed = function () {
                toClose.forEach(function (t) { self.closeTab(t.id); });
                self.renderTabs();
            };
            if (hasRunning) {
                if (typeof window.showConfirm === 'function') {
                    window.showConfirm('Close Other Tabs', 'One or more other tabs have running sessions. Close them anyway?').then(proceed).catch(function () {});
                } else if (confirm('Close other tabs?')) proceed();
            } else {
                proceed();
            }
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
