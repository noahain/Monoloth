(function () {
    'use strict';

    function stripAnsi(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1B\][0-9]*;[^\x07]*\x07?/g, '');
    }
    function looksLikePrompt(data) {
        if (typeof data !== 'string') return false;
        var text = stripAnsi(data);
        return /(?:^|[\n\r])[A-Za-z]:\\[^\n]*>\s*$/.test(text) ||
               /(?:^|[\n\r])PS [^\n]*>\s*$/.test(text) ||
               /(?:^|[\n\r])[^\n]*[$#]\s*$/.test(text);
    }

    var _promptDetectBuffer = '';
    var PROMPT_BUFFER_MAX = 256;
    function detectPromptInChunks(data, tab) {
        if (typeof data !== 'string') return false;
        _promptDetectBuffer = (_promptDetectBuffer + data).slice(-PROMPT_BUFFER_MAX);
        if (looksLikePrompt(_promptDetectBuffer)) {
            tab.busy = false;
            updateBusyDot(tab);
            _promptDetectBuffer = '';
            return true;
        }
        return false;
    }

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
    var _appProfile = null;

    function buildTerminalWindowsOptions() {
        var info = window.__monolithWindowsPty || _windowsPtyInfo;
        if (info && info.backend && info.buildNumber > 0) {
            return { windowsPty: { backend: info.backend, buildNumber: info.buildNumber } };
        }
        return {};
    }
    window.__monolithTermWinOpts = buildTerminalWindowsOptions;

    function bumpMainSessionGen(tab) {
        // Bump the generation before terminating so any lingering output from the
        // dying PTY is filtered out instead of leaking into the next session that
        // reuses this session ID (especially "main", which is the only one reused).
        if (tab.sessionId === 'main') {
            _sessionGeneration[tab.sessionId] = (_sessionGeneration[tab.sessionId] || 0) + 1;
        }
    }

    var escapeHtml = window.MonolothUI.escapeHtml;

    function getActiveTab() {
        return _activeTabId ? _tabs.get(_activeTabId) : null;
    }

    function updateTabBarVisibility() {
        if (!tabBar) return;
        var position = document.body.classList.contains('tabbar-titlebar') ? 'titlebar'
            : document.body.classList.contains('tabbar-hidden') ? 'hidden' : 'standard';
        if (position === 'hidden') {
            tabBar.classList.remove('visible');
        } else {
            tabBar.classList.add('visible');
        }
    }

    function updateBusyDot(tab) {
        var item = tabList && tabList.querySelector('.main-tab[data-tab-id="' + tab.id + '"]');
        if (!item) return;
        var dot = item.querySelector('.main-tab-dirty');
        if (dot) dot.style.display = tab.busy ? '' : 'none';
    }

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

        var tabName = 'Terminal';
        if (dir) {
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
        tabItem.classList.add('entering');

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
        tabItem.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            showMainTabContextMenu(tabId, e.clientX, e.clientY);
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
        if (window.MonolothApp && window.MonolothApp.setEditingProfile) {
            window.MonolothApp.setEditingProfile(tab.profile);
        }
        if (window.MonolothApp && window.MonolothApp.reloadStartupConfig) {
            window.MonolothApp.reloadStartupConfig();
        }
        if (typeof window.SidebarManager !== 'undefined' && typeof window.SidebarManager.switchToMainTab === 'function') {
            window.SidebarManager.switchToMainTab(tabId);
        }

        if (window.monolithApi && window.monolithApi.get_profile_appearance) {
            var profileName = tab.profile || (window.MonolithProfiles && window.MonolithProfiles.getActiveProfileName ? window.MonolithProfiles.getActiveProfileName() : 'Default');
            return window.monolithApi.get_profile_appearance(profileName).then(function (appearance) {
                if (_appProfile !== profileName) {
                    _appProfile = profileName;
                    if (window.MonolithTheme && window.MonolithTheme.applyProfileAppearance) {
                        window.MonolithTheme.applyProfileAppearance(appearance);
                    }
                }
                if (!tab.term) {
                    return initTabXterm(tab);
                }
                applyTabXtermTheme(tab, appearance);
                refitActiveTab();
                if (tab.term && !tab._renaming) tab.term.focus();
                if (typeof window.SidebarManager !== 'undefined' && window.SidebarManager.refitActiveTab) {
                    window.SidebarManager.refitActiveTab();
                }
                return Promise.resolve();
            }).catch(function () {
                if (!tab.term) return initTabXterm(tab);
                refitActiveTab();
                if (tab.term && !tab._renaming) tab.term.focus();
                return Promise.resolve();
            });
        }

        if (!tab.term) {
            return initTabXterm(tab);
        }
        refitActiveTab();
        if (tab.term && !tab._renaming) tab.term.focus();
        return Promise.resolve();
    }

    function applyTabXtermTheme(tab, appearance) {
        if (!tab || !tab.term) return;
        var themeMode = (appearance && appearance.theme_mode) || 'dark';
        var isLight;
        if (themeMode === 'light') {
            isLight = true;
        } else if (themeMode === 'auto') {
            isLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        } else {
            isLight = false;
        }
        var newTheme = isLight ? (window.MonolithTheme && window.MonolithTheme.getTerminalLightTheme ? window.MonolithTheme.getTerminalLightTheme() : null)
            : (window.MonolithTheme && window.MonolithTheme.getTerminalDarkTheme ? window.MonolithTheme.getTerminalDarkTheme() : null);
        if (!newTheme) return;

        var existing = {};
        try { existing = Object.assign({}, tab.term.getOption('theme')); } catch (e) {}
        Object.assign(existing, newTheme);

        var tc = window.MonolothUI.computeTermBgColors(
            (appearance && appearance.bg_type) || 'none',
            (appearance && appearance.bg_layer) || 'behind'
        );
        existing.background = tc.background;
        existing.black = tc.black;

        document.body.classList.add('theme-transitioning');
        tab.container.classList.add('tab-theme-transitioning');
        tab.term.setOption('theme', existing);
        setTimeout(function () {
            document.body.classList.remove('theme-transitioning');
            tab.container.classList.remove('tab-theme-transitioning');
        }, 350);
    }

    function initTabXterm(tab) {
        var termDiv = tab.termDiv;
        if (!termDiv || typeof Terminal === 'undefined') return Promise.resolve();

        var _bg = window.MonolothApp.getBgState();
        var initBgConfig = { type: _bg.type, bgLayer: _bg.layer };
        var tc = window.MonolothUI.computeTermBgColors(_bg.type || 'none', _bg.layer || 'behind');
        var terminalBg = tc.background;
        var terminalBlack = tc.black;
        // xterm.js WebGL renderer corrupts with transparent backgrounds; only opaque backgrounds (no wallpaper/color/gradient) are safe.
        tab.useWebgl = _bg && (_bg.layer === 'overlay' || _bg.type === 'none');
        var initTheme = tc.isLight ? window.MonolithTheme.getTerminalLightTheme() : window.MonolithTheme.getTerminalDarkTheme();
        initTheme.background = terminalBg;
        initTheme.black = terminalBlack;

        return window.MonolithTerminalView.create({
            terminalDiv: termDiv,
            theme: initTheme,
            extraTermOptions: {
                letterSpacing: 0,
                lineHeight: 1.0,
                macOptionIsMeta: true,
                macOptionClickForcesSelection: true
            },
            startLabel: window.MonolothApp.getStartupLabel(),
            dir: tab.dir,
            busyOnEnter: 'immediate',
            sessionId: tab.sessionId,
            customKeyHandler: function (e) {
                if (e.ctrlKey && !e.shiftKey && e.code === 'KeyC' && tab.term.hasSelection()) {
                    window.MonolothApp.copyToClipboard(tab.term.getSelection());
                    tab.term.clearSelection();
                    return false;
                }
                if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
                    if (tab.term.hasSelection()) {
                        window.MonolothApp.copyToClipboard(tab.term.getSelection());
                        tab.term.clearSelection();
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
            },
            pasteHandler: function (e) {
                var text = e.clipboardData.getData('text');
                if (text && window.monolithApi) {
                    e.preventDefault();
                    e.stopPropagation();
                    try { window.monolithApi.send_input(tab.sessionId, text); } catch (err) {}
                }
            },
            contextMenuHandler: function (e) {
                e.preventDefault();
                var selection = tab.term.getSelection();
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
            },
            onData: function (data) {
                if (window.monolithApi) {
                    try { window.monolithApi.send_input(tab.sessionId, data); } catch (e) {}
                }
                if (data.indexOf('\r') !== -1) {
                    tab.busy = true;
                    updateBusyDot(tab);
                }
            },
            onTermCreated: function (refs) {
                tab.term = refs.term;
                tab.fitAddon = refs.fitAddon;
                tab._lastPixelSize = tab.termDiv.clientWidth + 'x' + tab.termDiv.clientHeight;
            },
            abortCheck: function () { return tab.closing || !_tabs.has(tab.id); },
            startPty: function (cols, rows) {
                return window.monolithApi.start_terminal(tab.sessionId, tab.dir, true, null, cols, rows, tab.profile);
            },
            onPtyResult: function (result) {
                if (tab.closing || !_tabs.has(tab.id)) {
                    if (result.success && window.monolithApi) {
                        window.monolithApi.terminate_terminal(tab.sessionId).catch(function () {});
                    }
                    return;
                }
                if (result.success) {
                    tab.running = true;
                    tab.generation = result.generation;
                    if (result.generation) _sessionGeneration[tab.sessionId] = result.generation;
                    requestAnimationFrame(function () {
                        if (tab.fitAddon) tab.fitAddon.fit();
                        refitActiveTab();
                        if (tab.useWebgl && typeof WebglAddon !== 'undefined' && !tab.webglAddon) {
                            try {
                                var gl = new WebglAddon.WebglAddon();
                                gl.onContextLoss(function () { gl.dispose(); });
                                tab.term.loadAddon(gl);
                                tab.webglAddon = gl;
                            } catch (e) {}
                        }
                    });
                } else {
                    tab.running = false;
                    tab.term.writeln('');
                    tab.term.writeln('Failed to start ' + window.MonolothApp.getStartupLabel() + '. ' + (result.error ? result.error : 'Check that it is installed and in your PATH.'));
                    showTabExitBanner(tab);
                }
            },
            onPtyError: function (err) {
                if (tab.closing || !_tabs.has(tab.id)) return;
                tab.running = false;
                tab.term.writeln('');
                tab.term.writeln('Error starting ' + window.MonolothApp.getStartupLabel() + ': ' + err);
                showTabExitBanner(tab);
            },
            focus: true
        }).then(function (refs) {
            if (!refs) return tab;
            tab.term = refs.term || tab.term;
            tab.fitAddon = refs.fitAddon || tab.fitAddon;
            return tab;
        });
    }

    function startSessionExitCountdown(tab) {
        tab.running = false;
        clearTabExitCountdown(tab);
        var isActive = (tab.id === _activeTabId);
        var hasOtherTabs = _tabs.size > 1;
        var banner = document.createElement('div');
        banner.className = 'session-exit-banner';
        if (isActive && !hasOtherTabs) {
            banner.textContent = 'Session ended \u2014 returning to launcher in 5s (click to stay)';
        } else if (isActive && hasOtherTabs) {
            banner.textContent = 'Session ended (switch tabs or close this one)';
        } else {
            banner.textContent = 'Session ended (tab inactive)';
        }
        tab.container.appendChild(banner);
        tab.exitBanner = banner;
        if (!isActive || hasOtherTabs) return;
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

        bumpMainSessionGen(tab);

        if (window.monolithApi) {
            window.monolithApi.terminate_terminal(tab.sessionId).catch(function () {});
            if (tab.sessionId === 'main' && typeof window.monolithApi.terminate_hidden === 'function') {
                window.monolithApi.terminate_hidden().catch(function () {});
            }
        }
        clearTabExitCountdown(tab);
        window.MonolithTerminalView.disposeTerminals(tab);
        if (tab.sessionId !== 'main') {
            delete _sessionGeneration[tab.sessionId];
        }
        delete _skipNextEof[tab.sessionId];

        if (tab.sessionId.startsWith('main-tab-') && window.monolithApi && typeof window.monolithApi.retire_panel_tab === 'function') {
            window.monolithApi.retire_panel_tab(tab.sessionId).catch(function () {});
        }

        var tabItem = tabList && tabList.querySelector('.main-tab[data-tab-id="' + tabId + '"]');
        var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (reducedMotion) {
            tab.container.remove();
            if (tabItem) tabItem.remove();
        } else {
            if (tabItem) {
                var currentWidth = tabItem.getBoundingClientRect().width;
                tabItem.style.width = currentWidth + 'px';
                void document.body.offsetWidth;
            }
            tab.container.classList.add('closing');
            if (tabItem) tabItem.classList.add('closing');
            setTimeout(function () {
                if (tab.container.parentNode) tab.container.remove();
                if (tabItem && tabItem.parentNode) tabItem.remove();
            }, 240);
        }
        _tabs.delete(tabId);

        if (_tabs.size === 0) {
            _activeTabId = null;
            if (typeof window.SidebarManager !== 'undefined' && typeof window.SidebarManager.closeAllPanelTabsForMainTab === 'function') {
                window.SidebarManager.closeAllPanelTabsForMainTab(tabId);
            }
            updateTabBarVisibility();
            window.MonolothApp.backToLanding();
            return;
        }

        if (_activeTabId === tabId) {
            var arr = Array.from(_tabs.values());
            var newActive = arr[arr.length - 1] || arr[0];
            activateTab(newActive.id);
        }
        if (typeof window.SidebarManager !== 'undefined' && typeof window.SidebarManager.closeAllPanelTabsForMainTab === 'function') {
            window.SidebarManager.closeAllPanelTabsForMainTab(tabId);
        }
        updateTabBarVisibility();
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
        tab._renaming = true;
        input.focus();
        input.select();
        function finish() {
            var newName = input.value.trim() || tab.name;
            tab.name = newName;
            tab._renaming = false;
            var newSpan = document.createElement('span');
            newSpan.className = 'main-tab-name';
            newSpan.textContent = newName;
            newSpan.addEventListener('dblclick', function (e) { e.stopPropagation(); startRenameTab(tabId); });
            input.replaceWith(newSpan);
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

        var pixelSize = el.clientWidth + 'x' + el.clientHeight;

        if (dims.cols === tab.term.cols && dims.rows === tab.term.rows) {
            if (tab._lastPixelSize && tab._lastPixelSize !== pixelSize) {
                requestAnimationFrame(function () {
                    if (tab.closing || !tab.term || !tab.fitAddon) return;
                    try { tab.fitAddon.fit(); } catch (e) {}
                });
            }
            tab._lastPixelSize = pixelSize;
            return;
        }

        tab._lastPixelSize = pixelSize;
        try { tab.term.resize(dims.cols, dims.rows); } catch (e) {}
    }

    function scheduleResize() {
        clearTimeout(_resizeTimer);
        // ponytail: maximize/restore animations need time to settle; 250ms
        // coalesces rapid ResizeObserver/window events into one final measurement.
        _resizeTimer = setTimeout(applyResize, 250);
    }

    function refit() {
        applyResize();
    }

    function refitActiveTab() {
        applyResize();
    }

    // Global resize listener (once, for all tabs — applies to active tab).
    // window.resize and the ResizeObserver share the same debounce, so they
    // coalesce into a single applyResize call when the container settles.
    window.addEventListener('resize', function () { scheduleResize(); });
    if (tabHost) {
        var ro = new ResizeObserver(function () { scheduleResize(); });
        ro.observe(tabHost);
    }

    var _newTabCardOverlay = null;
    var _newTabCardProfile = null;

    if (tabNewBtn) {
        tabNewBtn.addEventListener('click', function () {
            showNewTabCard();
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && _newTabCardOverlay) {
            var activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;
            hideNewTabCard();
        }
    });

    function createTabFromCard(dir) {
        var profile = _newTabCardProfile || (window.MonolithProfiles && window.MonolithProfiles.getActiveProfileName ? window.MonolithProfiles.getActiveProfileName() : null);
        hideNewTabCard();
        if (window.MonolothApp && window.MonolothApp.addToRecentDirectories) {
            window.MonolothApp.addToRecentDirectories(dir);
        }
        createTab(dir, true, profile);
    }

    function showNewTabCard() {
        if (_newTabCardOverlay) return;
        var existing = document.querySelector('.new-tab-card-overlay');
        if (existing) return;
        _newTabCardProfile = (window.MonolithProfiles && window.MonolithProfiles.getActiveProfileName) ? window.MonolithProfiles.getActiveProfileName() : 'Default';

        var overlay = document.createElement('div');
        overlay.className = 'new-tab-card-overlay';

        var card = document.createElement('div');
        card.className = 'command-palette-modal new-tab-card-modal';

        var toolbar = document.createElement('div');
        toolbar.className = 'landing-card-toolbar';

        var agentLabel = document.createElement('div');
        agentLabel.className = 'landing-card-agent';
        var label = (window.MonolothApp && window.MonolothApp.getStartupLabel) ? window.MonolothApp.getStartupLabel() : 'TUI';
        agentLabel.innerHTML = '<span>' + escapeHtml(label) + '</span>';

        var actions = document.createElement('div');
        actions.className = 'landing-card-actions';

        var profileBtn = document.createElement('button');
        profileBtn.className = 'profile-selector-btn new-tab-profile-btn';
        profileBtn.innerHTML = '<span class="new-tab-profile-name">' + escapeHtml(_newTabCardProfile) + '</span>' +
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
        profileBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (window.MonolithProfiles && typeof window.MonolithProfiles.openProfileSwitcher === 'function') {
                window.MonolithProfiles.openProfileSwitcher(function (selectedName) {
                    _newTabCardProfile = selectedName;
                    var nameEl = card.querySelector('.new-tab-profile-name');
                    if (nameEl) nameEl.textContent = selectedName;
                });
            }
        });
        actions.appendChild(profileBtn);
        toolbar.appendChild(agentLabel);
        toolbar.appendChild(actions);
        card.appendChild(toolbar);

        var chooseBtn = document.createElement('button');
        chooseBtn.className = 'dir-primary-btn';
        chooseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
            '<span>Choose Project Directory</span>';
        chooseBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (typeof window.MonolithFilePicker === 'undefined' || !window.MonolithFilePicker.pickPath) return;
            window.MonolithFilePicker.pickPath({
                id: 'opencode_dir',
                title: 'Choose Directory for New Tab',
                mode: 'folder'
            }).then(function (path) {
                if (!path) return;
                createTabFromCard(path);
            });
        });
        card.appendChild(chooseBtn);

        var recentSection = document.createElement('div');
        recentSection.className = 'recent-projects-section';
        recentSection.innerHTML = '<div class="recent-section-label">Recent Projects</div>';
        var recentList = document.createElement('div');
        recentList.className = 'recent-projects-list';
        recentList.id = 'new-tab-recent-list';
        recentSection.appendChild(recentList);
        card.appendChild(recentSection);

        overlay.appendChild(card);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) hideNewTabCard();
        });

        document.body.appendChild(overlay);
        _newTabCardOverlay = overlay;

        void overlay.offsetWidth;
        overlay.classList.add('anim-enter');
        card.classList.add('anim-enter');
        overlay.addEventListener('animationend', function onEnd(e) {
            if (e.target === overlay) {
                overlay.classList.remove('anim-enter');
                overlay.removeEventListener('animationend', onEnd);
            }
        });
        card.addEventListener('animationend', function onEnd(e) {
            if (e.target === card) {
                card.classList.remove('anim-enter');
                card.removeEventListener('animationend', onEnd);
            }
        });

        renderNewTabRecentDirs(recentList);
    }

    function hideNewTabCard() {
        if (!_newTabCardOverlay) return;
        var overlay = _newTabCardOverlay;
        var card = overlay.querySelector('.new-tab-card-modal');
        overlay.classList.add('anim-exit');
        if (card) card.classList.add('anim-exit');
        overlay.addEventListener('animationend', function onEnd(e) {
            if (e.target === overlay) {
                overlay.removeEventListener('animationend', onEnd);
                if (overlay.parentNode) overlay.remove();
            }
        });
        _newTabCardOverlay = null;
    }

    function renderNewTabRecentDirs(listEl) {
        if (!window.monolithApi) return;
        listEl.innerHTML = '';
        window.monolithApi.get_recent_directories().then(function (dirs) {
            if (!Array.isArray(dirs) || dirs.length === 0) {
                var section = listEl.closest('.recent-projects-section');
                if (section) section.style.display = 'none';
                return;
            }
            var section = listEl.closest('.recent-projects-section');
            if (section) section.style.display = '';
            dirs.slice(0, 7).forEach(function (dirPath) {
                var item = document.createElement('div');
                item.className = 'recent-project-item';
                item.innerHTML = '<div class="recent-project-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>' +
                    '<span class="recent-project-path">' + escapeHtml(dirPath) + '</span>' +
                    '<div class="recent-project-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>';
                item.title = dirPath;
                item.addEventListener('click', function () {
                    createTabFromCard(dirPath);
                });
                item.addEventListener('contextmenu', function (e) {
                    e.preventDefault();
                    if (window.MonolothApp && window.MonolothApp.showRecentContextMenu) {
                        window.MonolothApp.showRecentContextMenu(dirPath, e.clientX, e.clientY, createTabFromCard, renderNewTabRecentDirs.bind(null, listEl));
                    }
                });
                listEl.appendChild(item);
            });
        }).catch(function () {});
    }

    function promptNewTab() {
        showNewTabCard();
    }

    function showProfileSelectorModal(profiles, activeProfile, callback) {
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
                check.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
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

    function showMainTabContextMenu(tabId, x, y) {
        var tab = _tabs.get(tabId);
        if (!tab) return;
        var CM = window.MonolithCtxMenu;
        CM.createContextMenu(x, y, [
            { action: 'new', label: 'New Tab', icon: 'plus', shortcutHtml: CM.shortcutHtml('new_main_tab'), onSelect: function () { promptNewTab(); } },
            { action: 'close', label: 'Close Tab', icon: 'x', danger: true, onSelect: function () { closeTab(tabId); } },
            { divider: true },
            { action: 'rename', label: 'Rename Tab', icon: 'pencil', onSelect: function () { startRenameTab(tabId); } },
            { action: 'profile', label: 'Switch Profile', icon: 'profile', shortcutHtml: CM.shortcutHtml('switch_profile'), onSelect: function () { showProfileSwitchForTab(tabId); } }
        ]);
    }

    function restartTabWithProfile(tab) {
        if (!tab.term || !window.monolithApi) return;
        _sessionGeneration[tab.sessionId] = (_sessionGeneration[tab.sessionId] || 0) + 1;
        tab.running = false;
        tab.firstOutput = true;
        tab.term.reset();
        tab.term.writeln('');
        tab.term.writeln('Monoloth Terminal');
        tab.term.writeln('Directory: ' + (tab.dir || ''));
        tab.term.writeln('Restarting with profile: ' + tab.profile);
        tab.term.writeln('');
        var cols = tab.term.cols || 80;
        var rows = tab.term.rows || 24;
        window.monolithApi.start_terminal(tab.sessionId, tab.dir, true, null, cols, rows, tab.profile)
            .then(function (result) {
                if (tab.closing || !_tabs.has(tab.id)) {
                    if (result && result.success && window.monolithApi) {
                        window.monolithApi.terminate_terminal(tab.sessionId).catch(function () {});
                    }
                    return;
                }
                if (result && result.success) {
                    tab.running = true;
                    tab.generation = result.generation;
                    if (result.generation) _sessionGeneration[tab.sessionId] = result.generation;
                    clearTabExitCountdown(tab);
                    requestAnimationFrame(function () {
                        if (tab.fitAddon) tab.fitAddon.fit();
                        refitActiveTab();
                    });
                } else {
                    tab.term.writeln('');
                    tab.term.writeln('Failed to start profile ' + tab.profile + '. ' + (result && result.error ? result.error : 'Check that it is installed and in your PATH.'));
                    showTabExitBanner(tab);
                }
            })
            .catch(function (err) {
                if (tab.closing || !_tabs.has(tab.id)) return;
                tab.term.writeln('');
                tab.term.writeln('Error starting profile ' + tab.profile + ': ' + err);
                showTabExitBanner(tab);
            });
    }

    function showProfileSwitchForTab(tabId) {
        var tab = _tabs.get(tabId);
        if (!tab) return;
        if (typeof window.MonolithProfiles === 'undefined' || typeof window.MonolithProfiles.openProfileSwitcher !== 'function') return;
        var currentTabProfile = tab.profile || (window.MonolithProfiles.getActiveProfileName ? window.MonolithProfiles.getActiveProfileName() : 'Default');
        window.MonolithProfiles.openProfileSwitcher(function (selectedProfile) {
            if (!selectedProfile) return;
            var t = _tabs.get(tabId);
            if (!t) return;
            if (t.profile === selectedProfile) return;
            t.profile = selectedProfile;
            restartTabWithProfile(t);
            if (_activeTabId === tabId) {
                if (window.monolithApi && window.monolithApi.get_profile_appearance) {
                    window.monolithApi.get_profile_appearance(selectedProfile).then(function (appearance) {
                        if (_appProfile !== selectedProfile) {
                            _appProfile = selectedProfile;
                            if (window.MonolithTheme && window.MonolithTheme.applyProfileAppearance) {
                                window.MonolithTheme.applyProfileAppearance(appearance);
                            }
                        }
                        applyTabXtermTheme(t, appearance);
                    }).catch(function () {});
                }
            }
        });
        setTimeout(function () {
            var items = document.querySelectorAll('#ps-body .ps-item');
            items.forEach(function (el) {
                var nameSpan = el.querySelector('.ps-item-name');
                if (nameSpan && nameSpan.textContent === currentTabProfile) {
                    el.classList.add('active');
                    if (!el.querySelector('.ps-item-check')) {
                        var checkSpan = document.createElement('span');
                        checkSpan.className = 'ps-item-check';
                        checkSpan.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                        el.appendChild(checkSpan);
                    }
                } else {
                    el.classList.remove('active');
                    var existingCheck = el.querySelector('.ps-item-check');
                    if (existingCheck) existingCheck.remove();
                }
            });
        }, 0);
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
            if (sessionId.startsWith('panel-')) {
                var match = sessionId.match(/^panel-(mtab-\d+)-tab-(\d+)$/);
                if (match) {
                    var panelTabId = 'ptab-' + match[1] + '-' + match[2];
                    if (typeof window.SidebarManager !== 'undefined' && window.SidebarManager.writeToTab) {
                        window.SidebarManager.writeToTab(panelTabId, data, eof);
                    }
                } else if (sessionId.startsWith('panel-tab-')) {
                    var legacyTabId = sessionId.replace('panel-', '');
                    if (typeof window.SidebarManager !== 'undefined' && window.SidebarManager.writeToTab) {
                        window.SidebarManager.writeToTab(legacyTabId, data, eof);
                    }
                } else if (sessionId === 'panel') {
                    if (typeof window.SidebarManager !== 'undefined' && window.SidebarManager.writeToPanel) {
                        window.SidebarManager.writeToPanel(data, eof);
                    }
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
        detectPromptInChunks(data, tab);
    };

    // --- Public API (window.MonolithTerminal) ---
    // Stays compatible with app.js callers. "initTerminal" now means:
    // create the first main tab (if none exists) and activate it.
    window.MonolithTerminal = {
        tabs: {
            createTab: createTab,
            activateTab: activateTab,
            closeTab: closeTab,
            promptNewTab: promptNewTab,
            getActiveTab: getActiveTab,
            getActiveTabId: function () { return _activeTabId; },
            getTabBySessionId: function (sessionId) {
                var found = null;
                _tabs.forEach(function (t) { if (t.sessionId === sessionId) found = t; });
                return found;
            },
            getAllTabs: function () { return Array.from(_tabs.values()); },
            getTab: function (id) { return _tabs.get(id) || null; },
            hideTabExitBanner: hideTabExitBanner,
            updateTabBarVisibility: updateTabBarVisibility,
        },
        pty: {
            writeToTerm: window.writeToTerm,
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
        },
        view: {
            getTerm: function () {
                var tab = getActiveTab();
                return tab ? tab.term : null;
            },
            refit: refit,
            refitActiveTab: refitActiveTab,
            initTabXterm: initTabXterm,
        },
        lifecycle: {
            initTerminal: function (dir) {
                if (_tabs.size > 0) {
                    var active = getActiveTab();
                    if (active) return activateTab(active.id);
                    var first = Array.from(_tabs.values())[0];
                    return activateTab(first.id);
                }
                return createTab(dir, true);
            },
            dispose: function () {
                var hadMain = false;
                _tabs.forEach(function (tab) {
                    clearTabExitCountdown(tab);
                    if (tab.sessionId === 'main') {
                        hadMain = true;
                    }
                    bumpMainSessionGen(tab);
                    if (window.monolithApi) {
                        try { window.monolithApi.terminate_terminal(tab.sessionId).catch(function () {}); } catch (e) {}
                    }
                    if (tab.sessionId.startsWith('main-tab-') && window.monolithApi && typeof window.monolithApi.retire_panel_tab === 'function') {
                        try { window.monolithApi.retire_panel_tab(tab.sessionId).catch(function () {}); } catch (e) {}
                    }
                    window.MonolithTerminalView.disposeTerminals(tab);
                    if (tab.container && tab.container.parentNode) tab.container.remove();
                    var tabItem = tabList && tabList.querySelector('.main-tab[data-tab-id="' + tab.id + '"]');
                    if (tabItem) tabItem.remove();
                    if (tab.sessionId !== 'main') {
                        delete _sessionGeneration[tab.sessionId];
                    }
                    delete _skipNextEof[tab.sessionId];
                });
                if (typeof window.SidebarManager !== 'undefined' && typeof window.SidebarManager.closeAllPanelTabsForMainTab === 'function') {
                    _tabs.forEach(function (tab) {
                        window.SidebarManager.closeAllPanelTabsForMainTab(tab.id);
                    });
                }
                if (hadMain && window.monolithApi && typeof window.monolithApi.terminate_hidden === 'function') {
                    try { window.monolithApi.terminate_hidden().catch(function () {}); } catch (e) {}
                }
                _tabs.clear();
                _activeTabId = null;
                _appProfile = null;
                _nextTabId = 1;
                hideNewTabCard();
                updateTabBarVisibility();
            },
        },
    };
    // Flat backwards-compatible aliases (preserve every existing call site)
    window.MonolithTerminal.initTerminal = window.MonolithTerminal.lifecycle.initTerminal;
    window.MonolithTerminal.getTerm = window.MonolithTerminal.view.getTerm;
    window.MonolithTerminal.refit = window.MonolithTerminal.view.refit;
    window.MonolithTerminal.refitActiveTab = window.MonolithTerminal.view.refitActiveTab;
    window.MonolithTerminal.dispose = window.MonolithTerminal.lifecycle.dispose;
    window.MonolithTerminal.setSkipNextEof = window.MonolithTerminal.pty.setSkipNextEof;
    window.MonolithTerminal.setSessionGeneration = window.MonolithTerminal.pty.setSessionGeneration;
    window.MonolithTerminal.incrementSessionGeneration = window.MonolithTerminal.pty.incrementSessionGeneration;
    window.MonolithTerminal.deleteSessionGeneration = window.MonolithTerminal.pty.deleteSessionGeneration;
    window.MonolithTerminal.hasSkipNextEof = window.MonolithTerminal.pty.hasSkipNextEof;
    window.MonolithTerminal.deleteSkipNextEof = window.MonolithTerminal.pty.deleteSkipNextEof;
    window.MonolithTerminal.isRunning = window.MonolithTerminal.pty.isRunning;
    window.MonolithTerminal.anyRunning = window.MonolithTerminal.pty.anyRunning;
    window.MonolithTerminal.anyBusy = window.MonolithTerminal.pty.anyBusy;
    window.MonolithTerminal.setRunning = window.MonolithTerminal.pty.setRunning;
    window.MonolithTerminal.setWindowsPtyInfo = window.MonolithTerminal.pty.setWindowsPtyInfo;
    window.MonolithTerminal.createTab = window.MonolithTerminal.tabs.createTab;
    window.MonolithTerminal.promptNewTab = window.MonolithTerminal.tabs.promptNewTab;
    window.MonolithTerminal.activateTab = window.MonolithTerminal.tabs.activateTab;
    window.MonolithTerminal.closeTab = window.MonolithTerminal.tabs.closeTab;
    window.MonolithTerminal.getAllTabs = window.MonolithTerminal.tabs.getAllTabs;
    window.MonolithTerminal.getTab = window.MonolithTerminal.tabs.getTab;
    window.MonolithTerminal.getActiveTab = window.MonolithTerminal.tabs.getActiveTab;
    window.MonolithTerminal.getActiveTabId = window.MonolithTerminal.tabs.getActiveTabId;
    window.MonolithTerminal.getTabBySessionId = window.MonolithTerminal.tabs.getTabBySessionId;
    window.MonolithTerminal.hideTabExitBanner = window.MonolithTerminal.tabs.hideTabExitBanner;
    window.MonolithTerminal.initTabXterm = window.MonolithTerminal.view.initTabXterm;
    window.MonolithTerminal.updateTabBarVisibility = window.MonolithTerminal.tabs.updateTabBarVisibility;
})();
