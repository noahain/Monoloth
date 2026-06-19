(function () {
    'use strict';

    // --- Main Terminal Tab Manager ---
    // Depends on: window.MonolithTheme, window.MonolithShortcuts, window.MonolothApp
    // Mirrors the sidebar.js panel-tab pattern but for the MAIN terminal view.
    // session_id "main" = first tab (gets secondary commands).
    // session_id "main-tab-N" = additional tabs.

    var tabHost = document.getElementById('main-tab-host');
    var tabBar = document.getElementById('main-tab-bar');
    var tabList = document.getElementById('main-tab-tabs');
    var tabNewBtn = document.getElementById('main-tab-new');

    var _tabs = new Map();       // tabId -> tab object
    var _activeTabId = null;
    var _nextTabId = 1;          // numeric counter; first tab gets id "1", session "main"

    // Windows PTY compat info — fetched once, shared across all tabs.
    var _windowsPtyInfo = null;

    // Session-generation / skip-eof tracking, keyed by session ID.
    var _skipNextEof = {};
    var _sessionGeneration = {};

    var _resizeTimer = null;

    function buildTerminalWindowsOptions() {
        var info = window.__monolithWindowsPty || _windowsPtyInfo;
        if (info && info.backend && typeof info.buildNumber === 'number') {
            return { windowsPty: { backend: info.backend, buildNumber: info.buildNumber } };
        }
        return {};
    }
    window.__monolithTermWinOpts = buildTerminalWindowsOptions;

    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getActiveTab() {
        return _activeTabId ? _tabs.get(_activeTabId) : null;
    }

    function updateTabBarVisibility() {
        if (!tabBar) return;
        if (_tabs.size > 1) {
            tabBar.classList.add('visible');
        } else {
            tabBar.classList.remove('visible');
        }
    }

    function updateBusyDot(tab) {
        var item = tabList && tabList.querySelector('.main-tab[data-tab-id="' + tab.id + '"]');
        if (!item) return;
        var dot = item.querySelector('.main-tab-dirty');
        if (dot) dot.style.display = tab.busy ? '' : 'none';
    }

    // --- Tab Persistence ---
    var _persistSaveTimer = null;
    var _persistenceEnabled = null;  // null = not yet loaded

    function schedulePersistSave() {
        if (_persistenceEnabled === null) return;  // not loaded yet
        if (!_persistenceEnabled) return;
        clearTimeout(_persistSaveTimer);
        _persistSaveTimer = setTimeout(persistSaveNow, 300);
    }

    function persistSaveNow() {
        if (!_persistenceEnabled) return;
        if (!window.monolithApi) return;
        var tabsArr = Array.from(_tabs.values());
        var tabsData = tabsArr.map(function (t) {
            return { name: t.name, dir: t.dir || '' };
        });
        // Save active tab by INDEX (stable across sessions), not by ephemeral tabId.
        var activeIndex = -1;
        if (_activeTabId) {
            var i = 0;
            tabsArr.forEach(function (t) {
                if (t.id === _activeTabId) activeIndex = i;
                i++;
            });
        }
        try {
            window.monolithApi.set_config('mainTabs', tabsData).catch(function () {});
            window.monolithApi.set_config('mainTabActive', String(activeIndex)).catch(function () {});
        } catch (e) {}
    }

    function loadPersistenceSetting(callback) {
        if (!window.monolithApi) { _persistenceEnabled = false; if (callback) callback(false); return; }
        window.monolithApi.get_config('persistMainTabs').then(function (val) {
            // Bridge contract: get_config returns the RAW backend value via callApiValue.
            // Returns true/false (Value::Bool), null (Value::Null or error fallback), or a string.
            // Default ON when null/undefined (key not set or error) — matches config default.
            _persistenceEnabled = (val === false || val === 'false') ? false : true;
            if (callback) callback(_persistenceEnabled);
        }).catch(function () {
            _persistenceEnabled = true;  // default ON
            if (callback) callback(true);
        });
    }

    // Synchronous save on window close (beforeunload). The 300ms debounce
    // schedulePersistSave may not have fired before the webview dies.
    window.addEventListener('beforeunload', function () {
        if (_persistenceEnabled) persistSaveNow();
    });

    // Create a tab. The FIRST tab created uses session_id "main" (so the Rust
    // backend runs secondary commands on it). Subsequent tabs use "main-tab-N".
    function createTab(dir, activate, profile) {
        activate = activate !== false;
        dir = dir || (window.MonolothApp && window.MonolothApp.getCurrentDir ? window.MonolothApp.getCurrentDir() : '');
        profile = profile || null;  // null = use global active profile

        var tabId = 'mtab-' + _nextTabId;
        var isFirst = _nextTabId === 1;
        var sessionId = isFirst ? 'main' : 'main-tab-' + _nextTabId;
        _nextTabId++;

        // Name the first tab from the dir basename; subsequent tabs default to "Terminal".
        var tabName = 'Terminal';
        if (isFirst && dir) {
            var base = dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
            if (base) tabName = base;
        }

        var container = document.createElement('div');
        container.className = 'main-tab-container';
        container.id = 'main-tab-container-' + tabId;
        if (activate) container.classList.add('active');

        var termDiv = document.createElement('div');
        termDiv.className = 'main-tab-terminal';
        container.appendChild(termDiv);

        if (tabHost) tabHost.appendChild(container);

        var tabItem = document.createElement('div');
        tabItem.className = 'main-tab';
        tabItem.setAttribute('data-tab-id', tabId);
        if (activate) tabItem.classList.add('active');
        tabItem.innerHTML = '<span class="main-tab-name">' + escapeHtml(tabName) + '</span>' +
            '<button class="main-tab-close" data-tab-id="' + tabId + '" aria-label="Close tab">&times;</button>';
        if (tabList) tabList.appendChild(tabItem);

        tabItem.addEventListener('click', function (e) {
            if (e.target.classList.contains('main-tab-close')) {
                e.stopPropagation();
                closeTab(tabId);
            } else {
                activateTab(tabId);
            }
        });
        tabItem.querySelector('.main-tab-name').addEventListener('dblclick', function (e) {
            e.stopPropagation();
            startRenameTab(tabId);
        });

        var tab = {
            id: tabId,
            name: tabName,
            sessionId: sessionId,
            profile: profile,  // Profile name for this tab (null = Default/global). Set in Phase 5.
            running: false,
            container: container,
            termDiv: termDiv,
            term: null,
            fitAddon: null,
            webglAddon: null,
            generation: null,
            busy: false,
            closing: false,
            exitBanner: null,
            exitCountdown: null,
            dir: dir,
            firstOutput: true
        };
        _tabs.set(tabId, tab);

        updateTabBarVisibility();
        schedulePersistSave();

        if (activate) {
            return activateTab(tabId);
        }
        return Promise.resolve(tab);
    }

    function activateTab(tabId) {
        var tab = _tabs.get(tabId);
        if (!tab) return Promise.resolve();

        if (_activeTabId && _activeTabId !== tabId) {
            var oldTab = _tabs.get(_activeTabId);
            if (oldTab) {
                oldTab.container.classList.remove('active');
                var oldItem = tabList && tabList.querySelector('.main-tab[data-tab-id="' + _activeTabId + '"]');
                if (oldItem) oldItem.classList.remove('active');
                updateBusyDot(oldTab);
            }
        }

        tab.container.classList.add('active');
        var newItem = tabList && tabList.querySelector('.main-tab[data-tab-id="' + tabId + '"]');
        if (newItem) {
            newItem.classList.add('active');
            newItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
        _activeTabId = tabId;
        updateBusyDot(tab);
        schedulePersistSave();

        if (tab.profile && window.monolithApi && window.monolithApi.get_profile_appearance) {
            window.monolithApi.get_profile_appearance(tab.profile).then(function (appearance) {
                if (window.MonolithTheme && window.MonolithTheme.applyProfileAppearance) {
                    window.MonolithTheme.applyProfileAppearance(appearance);
                }
                if (typeof window.SidebarManager !== 'undefined' && window.SidebarManager.refitActiveTab) {
                    window.SidebarManager.refitActiveTab();
                }
            }).catch(function () {});
        }

        if (!tab.term) {
            return initTabXterm(tab);
        }
        refitActiveTab();
        if (tab.term) tab.term.focus();
        return Promise.resolve();
    }

    function initTabXterm(tab) {
        var termDiv = tab.termDiv;
        if (!termDiv || typeof Terminal === 'undefined') return Promise.resolve();

        var _bg = window.MonolothApp.getBgState();
        var initBgConfig = { type: _bg.type, bgLayer: _bg.layer };
        var terminalBg = _bg.layer === 'overlay' ? '#000000' : window.MonolothApp.computeTerminalBg(initBgConfig);
        var terminalBlack = _bg.layer === 'overlay' ? '#000000' : (_bg.type !== 'none' ? 'rgba(10, 10, 10, 0)' : '#0a0a0a');
        var isLight = document.body.classList.contains('light-mode') || document.body.classList.contains('adaptive-light');
        var initTheme = isLight ? window.MonolithTheme.getTerminalLightTheme() : window.MonolithTheme.getTerminalDarkTheme();
        initTheme.background = terminalBg;
        initTheme.black = terminalBlack;

        var termOptions = {
            allowTransparency: true,
            theme: initTheme,
            fontFamily: '"Cascadia Mono", "Consolas", "Lucida Console", "Courier New", monospace',
            fontSize: 14,
            letterSpacing: 0,
            lineHeight: 1.0,
            cursorBlink: true,
            cursorStyle: 'block',
            scrollback: 2000,
            smoothScrollDuration: 0,
            scrollSensitivity: 1,
            allowProposedApi: true,
            macOptionIsMeta: true,
            macOptionClickForcesSelection: true,
            minimumContrastRatio: 1,
            fastScrollModifier: 'alt',
            fastScrollSensitivity: 5,
            scrollOnUserInput: true
        };
        Object.assign(termOptions, buildTerminalWindowsOptions());

        var term = new Terminal(termOptions);
        var fitAddon = (typeof FitAddon !== 'undefined') ? new FitAddon.FitAddon() : null;
        if (fitAddon) term.loadAddon(fitAddon);
        term.open(termDiv);
        term.focus();

        tab.term = term;
        tab.fitAddon = fitAddon;

        // Keyboard copy/paste/shortcut interception (same as original terminal.js)
        term.attachCustomKeyEventHandler(function (e) {
            if (e.ctrlKey && !e.shiftKey && e.code === 'KeyC' && term.hasSelection()) {
                window.MonolothApp.copyToClipboard(term.getSelection());
                term.clearSelection();
                return false;
            }
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
                if (term.hasSelection()) {
                    window.MonolothApp.copyToClipboard(term.getSelection());
                    term.clearSelection();
                }
                return false;
            }
            if ((e.ctrlKey && e.code === 'KeyV') || (e.shiftKey && e.code === 'Insert')) return false;
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyW') return false;
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('command_palette'))) return false;
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('settings'))) return false;
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('toggle_sidebar'))) return false;
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('cmd_panel'))) return false;
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('clear_terminal'))) return false;
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('switch_profile'))) return false;
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('back_to_launcher'))) return false;
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('new_main_tab'))) return false;
            return true;
        });

        term.element.addEventListener('paste', function (e) {
            var text = e.clipboardData.getData('text');
            if (text && window.monolithApi) {
                e.preventDefault();
                e.stopPropagation();
                try { window.monolithApi.send_input(tab.sessionId, text); } catch (err) {}
            }
        });

        termDiv.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            var selection = term.getSelection();
            if (selection) {
                window.MonolothApp.copyToClipboard(selection);
                var indicator = document.createElement('div');
                indicator.className = 'copied-toast';
                indicator.textContent = 'Copied!';
                indicator.style.cssText = 'position:fixed;top:' + e.clientY + 'px;left:' + e.clientX + 'px;background:#4a4a4a;color:#e0e0e0;padding:4px 8px;border-radius:4px;font-size:12px;font-family:monospace;pointer-events:none;z-index:9999;';
                document.body.appendChild(indicator);
                setTimeout(function () {
                    indicator.classList.add('anim-exit');
                    setTimeout(function () { indicator.remove(); }, 300);
                }, 500);
            } else {
                navigator.clipboard.readText().then(function (text) {
                    if (window.monolithApi && text) {
                        window.monolithApi.send_input(tab.sessionId, text).catch(function () {});
                    }
                }).catch(function () {});
            }
        });

        term.onData(function (data) {
            if (window.monolithApi) {
                try { window.monolithApi.send_input(tab.sessionId, data); } catch (e) {}
            }
            if (data.indexOf('\r') !== -1) {
                tab.busy = true;
                updateBusyDot(tab);
            }
        });

        // Start the PTY session
        var startGen = _sessionGeneration[tab.sessionId] || 0;
        var cols = term.cols || 80;
        var rows = term.rows || 24;

        term.writeln('');
        term.writeln('Monoloth Terminal');
        term.writeln('Directory: ' + (tab.dir || ''));
        term.writeln('Starting ' + window.MonolothApp.getStartupLabel() + '...');
        term.writeln('');

        if (!window.monolithApi) {
            term.writeln('Error: Bridge not available.');
            return Promise.resolve(tab);
        }

        return window.monolithApi.start_terminal(tab.sessionId, tab.dir, true, null, cols, rows)
            .then(function (result) {
                if (tab.closing || !_tabs.has(tab.id)) {
                    if (result && result.success && window.monolithApi) {
                        window.monolithApi.terminate_terminal(tab.sessionId).catch(function () {});
                    }
                    return tab;
                }
                if (result && result.success) {
                    tab.running = true;
                    tab.generation = result.generation;
                    if (result.generation) _sessionGeneration[tab.sessionId] = result.generation;
                    requestAnimationFrame(function () {
                        if (fitAddon) fitAddon.fit();
                        refitActiveTab();
                    });
                } else {
                    tab.running = false;
                    term.writeln('');
                    term.writeln('Failed to start ' + window.MonolothApp.getStartupLabel() + '. ' + (result && result.error ? result.error : 'Check that it is installed and in your PATH.'));
                    showTabExitBanner(tab);
                }
                return tab;
            })
            .catch(function (err) {
                if (tab.closing || !_tabs.has(tab.id)) return tab;
                tab.running = false;
                term.writeln('');
                term.writeln('Error starting ' + window.MonolothApp.getStartupLabel() + ': ' + err);
                showTabExitBanner(tab);
                return tab;
            });
    }

    function startSessionExitCountdown(tab) {
        tab.running = false;
        clearTabExitCountdown(tab);
        var banner = document.createElement('div');
        banner.className = 'session-exit-banner';
        banner.style.cssText = 'position:absolute;bottom:40px;left:50%;transform:translateX(-50%);background:rgba(30,30,30,0.9);color:#c0c0c0;padding:8px 16px;border-radius:6px;font-family:monospace;font-size:13px;z-index:101;border:1px solid rgba(255,255,255,0.1);backdrop-filter:blur(4px);pointer-events:auto;cursor:pointer;';
        banner.textContent = 'Session ended \u2014 returning to launcher in 5s (click to stay)';
        tab.container.appendChild(banner);
        tab.exitBanner = banner;
        var countdown = 5;
        banner.addEventListener('click', function () { clearTabExitCountdown(tab); });
        tab.exitCountdown = setInterval(function () {
            countdown--;
            if (countdown <= 0) {
                clearTabExitCountdown(tab);
                window.MonolothApp.backToLanding();
            } else {
                banner.textContent = 'Session ended \u2014 returning to launcher in ' + countdown + 's (click to stay)';
            }
        }, 1000);
    }

    function clearTabExitCountdown(tab) {
        if (tab.exitCountdown) { clearInterval(tab.exitCountdown); tab.exitCountdown = null; }
        if (tab.exitBanner && tab.exitBanner.parentNode) tab.exitBanner.remove();
        tab.exitBanner = null;
    }

    function showTabExitBanner(tab) {
        // For main tabs, show the auto-return countdown (matches original behavior).
        startSessionExitCountdown(tab);
    }

    function hideTabExitBanner(tab) {
        clearTabExitCountdown(tab);
    }

    function closeTab(tabId, force) {
        var tab = _tabs.get(tabId);
        if (!tab) return;
        force = force || false;
        if (tab.running && tab.busy && !force) {
            window.MonolothApp.showConfirm('Close Tab', 'This tab has a running process. Close anyway?', 'close_main_tab')
                .then(function (confirmed) { if (confirmed) _doCloseTab(tabId); })
                .catch(function () {});
            return;
        }
        _doCloseTab(tabId);
    }

    function _doCloseTab(tabId) {
        var tab = _tabs.get(tabId);
        if (!tab) return;
        tab.closing = true;

        if (window.monolithApi) {
            window.monolithApi.terminate_terminal(tab.sessionId).catch(function () {});
            if (tab.sessionId === 'main' && typeof window.monolithApi.terminate_hidden === 'function') {
                window.monolithApi.terminate_hidden().catch(function () {});
            }
        }
        clearTabExitCountdown(tab);
        if (tab.term) {
            try { tab.term.dispose(); } catch (e) {}
            try { if (tab.fitAddon) tab.fitAddon.dispose(); } catch (e) {}
            tab.term = null;
            tab.fitAddon = null;
        }
        delete _sessionGeneration[tab.sessionId];
        delete _skipNextEof[tab.sessionId];

        // For main-tab-N sessions, call retire (cleans backend generation tracking).
        // The "main" session is fully terminated by terminate_terminal above.
        if (tab.sessionId.startsWith('main-tab-') && window.monolithApi && typeof window.monolithApi.retire_panel_tab === 'function') {
            window.monolithApi.retire_panel_tab(tab.sessionId).catch(function () {});
        }

        tab.container.remove();
        var tabItem = tabList && tabList.querySelector('.main-tab[data-tab-id="' + tabId + '"]');
        if (tabItem) tabItem.remove();
        _tabs.delete(tabId);

        // If no tabs left, go back to landing.
        if (_tabs.size === 0) {
            _activeTabId = null;
            updateTabBarVisibility();
            schedulePersistSave();
            window.MonolothApp.backToLanding();
            return;
        }

        // Activate the nearest surviving tab.
        if (_activeTabId === tabId) {
            var arr = Array.from(_tabs.values());
            // Find the index of the closed tab in insertion order, pick prev or next.
            var closedIdx = -1;
            for (var i = 0; i < arr.length; i++) {
                // arr reflects current _tabs after deletion; the closed tab's
                // neighbors shifted. Use _nextTabId ordering as a proxy: the
                // tab with the highest id below the closed tab's id, else lowest.
            }
            // Simpler: activate the last tab in the array (most recently added
            // survivor), which is the most likely "previous" in usage.
            var newActive = arr[arr.length - 1] || arr[0];
            activateTab(newActive.id);
        }
        updateTabBarVisibility();
        schedulePersistSave();
    }

    function startRenameTab(tabId) {
        var tab = _tabs.get(tabId);
        if (!tab) return;
        var tabItem = tabList && tabList.querySelector('.main-tab[data-tab-id="' + tabId + '"]');
        if (!tabItem) return;
        var nameSpan = tabItem.querySelector('.main-tab-name');
        if (!nameSpan) return;
        var input = document.createElement('input');
        input.type = 'text';
        input.value = tab.name;
        input.style.cssText = 'width:100%;font-size:0.75rem;border:none;background:transparent;color:inherit;outline:none;';
        input.maxLength = 20;
        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        function finish() {
            var newName = input.value.trim() || tab.name;
            tab.name = newName;
            var newSpan = document.createElement('span');
            newSpan.className = 'main-tab-name';
            newSpan.textContent = newName;
            newSpan.addEventListener('dblclick', function (e) { e.stopPropagation(); startRenameTab(tabId); });
            input.replaceWith(newSpan);
            schedulePersistSave();
        }
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') finish();
            if (e.key === 'Escape') { input.value = tab.name; finish(); }
        });
    }

    function applyResize() {
        var tab = getActiveTab();
        if (!tab || !tab.term || !tab.fitAddon) return;
        var el = tab.term.element || tab.termDiv;
        if (!el || el.offsetParent === null) return;
        var dims;
        try { dims = tab.fitAddon.proposeDimensions(); } catch (e) { return; }
        if (!dims || isNaN(dims.cols) || isNaN(dims.rows)) return;
        if (dims.cols === tab.term.cols && dims.rows === tab.term.rows) return;
        if (window.monolithApi) {
            try { window.monolithApi.resize_terminal(tab.sessionId, dims.cols, dims.rows); } catch (e) {}
        }
        try { tab.term.resize(dims.cols, dims.rows); } catch (e) {}
    }

    function scheduleResize() {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(applyResize, 120);
    }

    function refit() {
        applyResize();
    }

    function refitActiveTab() {
        applyResize();
    }

    // Global resize listener (once, for all tabs — applies to active tab)
    window.addEventListener('resize', function () { scheduleResize(); });
    if (tabHost) {
        var ro = new ResizeObserver(function () { scheduleResize(); });
        ro.observe(tabHost);
    }

    // New-tab button — opens the file picker modal (same one as the landing page)
    // to choose a directory, then a profile picker. The new tab opens with the
    // chosen directory and profile's appearance.
    if (tabNewBtn) {
        tabNewBtn.addEventListener('click', function () {
            promptNewTab();
        });
    }

    // Shared new-tab flow: file picker → profile picker → createTab.
    // Also called from the Ctrl+T shortcut handler in app.js.
    function promptNewTab() {
        if (typeof window.MonolithFilePicker === 'undefined' || !window.MonolithFilePicker.pickPath) return;
        window.MonolithFilePicker.pickPath({
            id: 'opencode_dir',
            title: 'Choose Directory for New Tab',
            mode: 'folder'
        }).then(function (path) {
            if (!path) return;  // user cancelled the file picker
            // After picking a directory, show the profile picker.
            promptProfileForNewTab(path);
        });
    }

    function showProfileSelectorModal(profiles, activeProfile, callback) {
        // Build a simple modal overlay for profile selection.
        var overlay = document.createElement('div');
        overlay.className = 'main-tab-profile-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';

        var modal = document.createElement('div');
        modal.className = 'main-tab-profile-modal';
        modal.style.cssText = 'background:var(--modal-bg-glass,#1e1e1e);border:1px solid var(--modal-border,rgba(255,255,255,0.1));border-radius:12px;padding:20px;min-width:300px;max-width:400px;font-family:inherit;color:var(--modal-text,#e0e0e0);';

        modal.innerHTML = '<h3 style="margin:0 0 12px;font-size:1rem;">Select Profile for New Tab</h3>';

        var list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:16px;';

        profiles.forEach(function (p) {
            var name = (typeof p === 'string') ? p : (p.name || p);
            var item = document.createElement('div');
            item.className = 'main-tab-profile-option';
            item.style.cssText = 'padding:8px 12px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:0.85rem;';
            item.style.background = (name === activeProfile) ? 'rgba(255,255,255,0.1)' : 'transparent';
            item.textContent = name;
            if (name === activeProfile) {
                var check = document.createElement('span');
                check.textContent = '\u2713';
                check.style.marginLeft = 'auto';
                item.appendChild(check);
            }
            item.addEventListener('mouseenter', function () { item.style.background = 'rgba(255,255,255,0.08)'; });
            item.addEventListener('mouseleave', function () { item.style.background = (name === activeProfile) ? 'rgba(255,255,255,0.1)' : 'transparent'; });
            item.addEventListener('click', function () {
                overlay.remove();
                callback(name);
            });
            list.appendChild(item);
        });

        modal.appendChild(list);

        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:6px 14px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:inherit;border-radius:6px;cursor:pointer;font-size:0.8rem;';
        cancelBtn.addEventListener('click', function () { overlay.remove(); callback(null); });
        btnRow.appendChild(cancelBtn);
        modal.appendChild(btnRow);

        overlay.appendChild(modal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) { overlay.remove(); callback(null); } });
        document.body.appendChild(overlay);
    }

    // Shows a profile selection dropdown/modal, then creates the tab.
    // Falls back to the global active profile if the user skips selection.
    function promptProfileForNewTab(dir) {
        if (typeof window.MonolithProfiles === 'undefined' || !window.MonolithProfiles.getProfilesList) {
            createTab(dir, true, null);
            return;
        }
        var profiles = window.MonolithProfiles.getProfilesList();
        var activeProfile = window.MonolithProfiles.getActiveProfileName ? window.MonolithProfiles.getActiveProfileName() : 'Default';
        // Show a lightweight profile selector modal.
        showProfileSelectorModal(profiles, activeProfile, function (selectedProfile) {
            createTab(dir, true, selectedProfile || activeProfile);
        });
    }

    // --- writeToTerm router (called by Rust backend via tauri-bridge) ---
    // Routes PTY output to the correct tab by session ID.
    window.writeToTerm = function (data, eof, sessionId, generation) {
        sessionId = sessionId || 'main';
        generation = generation || 0;
        if (generation > 0 && _sessionGeneration[sessionId] > 0 &&
            generation < _sessionGeneration[sessionId]) {
            return;
        }
        if (eof && _skipNextEof[sessionId]) {
            _skipNextEof[sessionId] = false;
            return;
        }

        // Find the tab for this session ID.
        var tab = null;
        _tabs.forEach(function (t) {
            if (t.sessionId === sessionId) tab = t;
        });
        if (!tab || !tab.term) {
            // Delegate panel-tab routing to SidebarManager (unchanged).
            if (sessionId.startsWith('panel-tab-')) {
                var panelTabId = sessionId.replace('panel-', '');
                if (typeof window.SidebarManager !== 'undefined' && window.SidebarManager.writeToTab) {
                    window.SidebarManager.writeToTab(panelTabId, data, eof);
                }
            } else if (sessionId === 'panel') {
                if (typeof window.SidebarManager !== 'undefined' && window.SidebarManager.writeToPanel) {
                    window.SidebarManager.writeToPanel(data, eof);
                }
            }
            return;
        }

        if (eof) {
            tab.term.write(data);
            startSessionExitCountdown(tab);
            return;
        }
        tab.term.write(data);
        if (tab.firstOutput) {
            tab.firstOutput = false;
            setTimeout(function () { if (tab === getActiveTab()) applyResize(); }, 1500);
        }
        if (typeof data === 'string' && data.indexOf('[session ended]') !== -1) {
            startSessionExitCountdown(tab);
        }
        // Prompt detection: clear busy dot when shell returns to prompt.
        if (/[A-Za-z]:\\[^\n]*>\s*$/.test(data) || /\nPS [^\n]*>\s*$/.test(data) || /\n[^\n]*\$\s*$/.test(data)) {
            tab.busy = false;
            updateBusyDot(tab);
        }
    };

    // --- Public API (window.MonolithTerminal) ---
    // Stays compatible with app.js callers. "initTerminal" now means:
    // create the first main tab (if none exists) and activate it.
    window.MonolithTerminal = {
        initTerminal: function (dir) {
            // If we already have tabs (e.g., restoring persisted state), just
            // activate the active one. Otherwise create the first tab.
            if (_tabs.size > 0) {
                var active = getActiveTab();
                if (active) return activateTab(active.id);
                var first = Array.from(_tabs.values())[0];
                return activateTab(first.id);
            }
            return createTab(dir, true);
        },
        getTerm: function () {
            var tab = getActiveTab();
            return tab ? tab.term : null;
        },
        refit: refit,
        refitActiveTab: refitActiveTab,
        dispose: function () {
            // Tear down ALL tabs: terminate PTYs, dispose xterms, remove DOM.
            // Called from backToLanding. Must terminate PTYs BEFORE clearing
            // or backend sessions leak.
            var hadMain = false;
            _tabs.forEach(function (tab) {
                clearTabExitCountdown(tab);
                if (window.monolithApi) {
                    try { window.monolithApi.terminate_terminal(tab.sessionId).catch(function () {}); } catch (e) {}
                }
                if (tab.sessionId === 'main') hadMain = true;
                if (tab.sessionId.startsWith('main-tab-') && window.monolithApi && typeof window.monolithApi.retire_panel_tab === 'function') {
                    try { window.monolithApi.retire_panel_tab(tab.sessionId).catch(function () {}); } catch (e) {}
                }
                if (tab.term) {
                    try { tab.term.dispose(); } catch (e) {}
                    try { if (tab.fitAddon) tab.fitAddon.dispose(); } catch (e) {}
                }
                // Remove DOM elements (containers + tab bar items).
                if (tab.container && tab.container.parentNode) tab.container.remove();
                var tabItem = tabList && tabList.querySelector('.main-tab[data-tab-id="' + tab.id + '"]');
                if (tabItem) tabItem.remove();
                delete _sessionGeneration[tab.sessionId];
                delete _skipNextEof[tab.sessionId];
            });
            // If the "main" tab was among those disposed, also kill hidden-* PTYs.
            if (hadMain && window.monolithApi && typeof window.monolithApi.terminate_hidden === 'function') {
                try { window.monolithApi.terminate_hidden().catch(function () {}); } catch (e) {}
            }
            _tabs.clear();
            _activeTabId = null;
            _nextTabId = 1;  // Reset so the next first tab gets session_id "main"
            updateTabBarVisibility();
        },
        setSkipNextEof: function (sessionId, val) { _skipNextEof[sessionId] = val; },
        setSessionGeneration: function (sessionId, gen) { _sessionGeneration[sessionId] = gen; },
        incrementSessionGeneration: function (sessionId) {
            _sessionGeneration[sessionId] = (_sessionGeneration[sessionId] || 0) + 1;
        },
        deleteSessionGeneration: function (sessionId) { delete _sessionGeneration[sessionId]; },
        hasSkipNextEof: function (sessionId) { return _skipNextEof[sessionId] !== undefined; },
        deleteSkipNextEof: function (sessionId) { delete _skipNextEof[sessionId]; },
        isRunning: function () {
            var tab = getActiveTab();
            return tab ? tab.running : false;
        },
        anyRunning: function () {
            var any = false;
            _tabs.forEach(function (t) { if (t.running) any = true; });
            return any;
        },
        anyBusy: function () {
            var any = false;
            _tabs.forEach(function (t) { if (t.running && t.busy) any = true; });
            return any;
        },
        setRunning: function (v) {
            var tab = getActiveTab();
            if (tab) tab.running = v;
        },
        setWindowsPtyInfo: function (info) { _windowsPtyInfo = info || null; },
        // New tab-manager API
        createTab: createTab,
        promptNewTab: promptNewTab,
        activateTab: activateTab,
        closeTab: closeTab,
        getAllTabs: function () { return Array.from(_tabs.values()); },
        getTab: function (id) { return _tabs.get(id) || null; },
        getActiveTab: getActiveTab,
        getActiveTabId: function () { return _activeTabId; },
        getTabBySessionId: function (sessionId) {
            var found = null;
            _tabs.forEach(function (t) { if (t.sessionId === sessionId) found = t; });
            return found;
        },
        hideTabExitBanner: hideTabExitBanner,
        initTabXterm: initTabXterm,
        updateTabBarVisibility: updateTabBarVisibility,
        // Tab persistence (Task 3.2)
        schedulePersistSave: schedulePersistSave,
        loadPersistenceSetting: loadPersistenceSetting,
        restorePersistedTabs: function (callback) {
            if (!window.monolithApi) { if (callback) callback(false); return; }
            loadPersistenceSetting(function (enabled) {
                if (!enabled) { if (callback) callback(false); return; }
                window.monolithApi.get_config('mainTabs').then(function (tabsArr) {
                    if (!Array.isArray(tabsArr) || tabsArr.length === 0) {
                        if (callback) callback(false);
                        return;
                    }
                    // Validate tab entries: skip malformed items (non-object, missing dir).
                    var validTabs = tabsArr.filter(function (td) {
                        return td && typeof td === 'object' && typeof (td.dir || '') === 'string';
                    });
                    if (validTabs.length === 0) { if (callback) callback(false); return; }

                    window.monolithApi.get_config('mainTabActive').then(function (activeIdxStr) {
                        var activeIdx = parseInt(activeIdxStr, 10);
                        if (isNaN(activeIdx)) activeIdx = 0;
                        // Create all tabs without activating.
                        var promises = validTabs.map(function (td) {
                            return createTab(td.dir || '', false).then(function (tab) {
                                if (td.name && typeof td.name === 'string' && td.name !== 'Terminal') {
                                    tab.name = td.name;
                                    var item = tabList && tabList.querySelector('.main-tab[data-tab-id="' + tab.id + '"] .main-tab-name');
                                    if (item) item.textContent = td.name;
                                }
                            });
                        });
                        Promise.all(promises).then(function () {
                            var tabsArr2 = Array.from(_tabs.values());
                            var clampedIdx = Math.max(0, Math.min(activeIdx, tabsArr2.length - 1));

                            // ALWAYS activate tab 0 (session "main") first so secondary
                            // commands run at launch (Design Decision 1). Then switch to
                            // the saved active tab if it's different. The loading overlay
                            // covers the brief visual transition.
                            activateTab(tabsArr2[0].id).then(function () {
                                if (clampedIdx !== 0) {
                                    activateTab(tabsArr2[clampedIdx].id).then(function () {
                                        if (callback) callback(true);
                                    });
                                } else {
                                    if (callback) callback(true);
                                }
                            });
                        });
                    }).catch(function () { if (callback) callback(false); });
                }).catch(function () { if (callback) callback(false); });
            });
        }
    };
})();
