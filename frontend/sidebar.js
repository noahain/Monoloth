(function () {
    'use strict';

    var UI = window.MonolothUI;
    var escapeHtml = UI.escapeHtml;
    var forceReflow = UI.forceReflow;
    var silent = UI.silent;
    var openModal = UI.openModal;
    var closeModal = UI.closeModal;

    var sidebar = document.getElementById('sidebar');
    var sidebarButtons = document.getElementById('sidebar-buttons');
    var terminalView = document.getElementById('terminal-view');
    var cmdPanel = document.getElementById('cmd-panel');
    var cmdPanelClose = document.getElementById('cmd-panel-close');
    var cmdPanelTerminal = document.getElementById('cmd-panel-terminal');
    var cmdPanelExitBanner = document.getElementById('cmd-panel-exit-banner');
    var cmdPanelResizeHandle = document.getElementById('cmd-panel-resize-handle');

    var _sidebarConfig = null;
    var _sidebarEnabled = true;  // default on, async config will override if needed
    var _sidebarPosition = 'left';
    var _cmdPanelOpen = false;
    var _panelRunning = false;
    var _panelClosing = false;
    var _panelHeight = 250;
    var _panelShell = 'cmd';
    var panelTerm = null;
    var panelFitAddon = null;
    var _isDragging = false;
    var _resizeStartY = 0;
    var _resizeStartHeight = 0;
    var _resizeDebounceTimer = null;
    var _configSaveTimer = null;
    var _panelRestoreNeeded = false;

    // ---- SVG Icons ----
    var ICONS = {
        folder: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        terminal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
        panel: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
        copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        refresh: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
        play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
        gear: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
        git: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/><line x1="8.5" y1="7.5" x2="15.5" y2="7.5"/></svg>',
        download: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        upload: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        server: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
        database: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
        globe: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        package: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        wrench: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
        zap: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        monitor: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
        edit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    };

    var ICON_NAMES = ['folder', 'terminal', 'panel', 'copy', 'refresh', 'play', 'gear', 'search', 'git', 'download', 'upload', 'server', 'database', 'globe', 'package', 'wrench', 'zap', 'clock', 'trash', 'monitor', 'edit'];

    // ---- Default Buttons ----
    var DEFAULT_BUTTONS = [
        { id: 'open_folder', name: 'Open Project Folder', icon: 'folder' },
        { id: 'open_cmd_project', name: 'Open CMD in Project', icon: 'terminal' },
        { id: 'open_cmd_panel', name: 'Open CMD Panel', icon: 'panel' },
        { id: 'copy_path', name: 'Copy Current Path', icon: 'copy' }
    ];

    // ---- Button Actions ----
    function getCurrentDir() {
        if (window.MonolothApp && window.MonolothApp.getCurrentDir) {
            return window.MonolothApp.getCurrentDir();
        }
        return '';
    }

    function handleOpenFolder() {
        var dir = getCurrentDir();
        if (dir && window.monolithApi) {
            window.monolithApi.open_in_explorer(dir).catch(function () {});
        }
    }

    function handleOpenCmdProject() {
        if (!window.monolithApi) return;
        var dir = getCurrentDir() || '%USERPROFILE%';
        var shell = _panelShell === 'powershell' ? 'powershell' : 'cmd';
        window.monolithApi.open_external_terminal(shell, dir).catch(function () {});
    }

    function handleOpenCmdPanel() {
        if (!window.monolithApi) return;
        if (_cmdPanelOpen) {
            hideCmdPanel();
        } else {
            var dir = getCurrentDir() || '%USERPROFILE%';
            openCmdPanelAt(dir);
        }
    }

    function openCmdPanelAt(dir) {
        if (_panelRunning) {
            if (!_cmdPanelOpen) {
                showCmdPanel();
            }
        } else {
            showCmdPanel();
            initCmdPanel(dir);
        }
    }

    function handleCopyPath() {
        var dir = getCurrentDir();
        if (dir) {
            navigator.clipboard.writeText(dir).catch(function () {});
        }
    }

    function executeCustomButton(btn) {
        if (!window.monolithApi) return;
        var dir = getCurrentDir() || '%USERPROFILE%';
        var mode = btn.mode || 'background';
        var cmd = btn.command || '';

        if (!cmd.trim()) return;

        if (mode === 'background') {
            window.monolithApi.execute_background(cmd, dir).catch(function () {});
        } else if (mode === 'externalCmd') {
            window.monolithApi.open_external_terminal(cmd, dir).catch(function () {});
        } else if (mode === 'cmdPanel') {
            if (!_panelRunning) {
                showCmdPanel();
                initCmdPanel(dir);
            }
            if (!_cmdPanelOpen) {
                showCmdPanel();
            }
            window.monolithApi.send_input('panel', cmd + '\n').catch(function () {});
        }
    }

    // ---- Render Sidebar Buttons ----
    function renderSidebarButtons() {
        if (!sidebarButtons) return;
        if (window.MonolothTooltip) {
            window.MonolothTooltip.cleanup();
        }
        sidebarButtons.innerHTML = '';

        var cfg = _sidebarConfig || getDefaultSidebarConfig();
        var allButtons = [];

        cfg.buttons.forEach(function (b) {
            if (!b.visible) return;
            var def = findDefaultButton(b.id);
            if (def) {
                allButtons.push({ id: b.id, name: def.name, icon: def.icon, order: b.order, type: 'default' });
            }
        });

        (cfg.customButtons || []).forEach(function (b) {
            if (!b.visible) return;
            allButtons.push({ id: b.id, name: b.name, icon: b.icon, command: b.command, mode: b.mode, order: b.order, type: 'custom' });
        });

        allButtons.sort(function (a, b) { return a.order - b.order; });

        var defaultButtons = allButtons.filter(function (b) { return b.type === 'default'; });
        var customButtons = allButtons.filter(function (b) { return b.type === 'custom'; });

        function appendButton(btnDef) {
            var btn = document.createElement('button');
            btn.className = 'sidebar-btn';
            btn.dataset.btnId = btnDef.id;
            btn.innerHTML = ICONS[btnDef.icon] || ICONS.terminal;

            if (btnDef.type === 'default') {
                switch (btnDef.id) {
                    case 'open_folder': btn.addEventListener('click', handleOpenFolder); break;
                    case 'open_cmd_project': btn.addEventListener('click', handleOpenCmdProject); break;
                    case 'open_cmd_panel': btn.addEventListener('click', handleOpenCmdPanel); break;
                    case 'copy_path': btn.addEventListener('click', handleCopyPath); break;
                }
            } else {
                btn.addEventListener('click', (function (b) {
                    return function () { executeCustomButton(b); };
                })(btnDef));
            }

            if (window.MonolothTooltip) {
                window.MonolothTooltip.attach(btn, btnDef.name);
            }

            sidebarButtons.appendChild(btn);
        }

        defaultButtons.forEach(appendButton);

        if (customButtons.length > 0) {
            var sep = document.createElement('div');
            sep.className = 'sidebar-btn-separator';
            sidebarButtons.appendChild(sep);
            customButtons.forEach(appendButton);
        }

        if (window.MonolothTooltip) {
            window.MonolothTooltip.scan(sidebarButtons);
        }
    }

    function findDefaultButton(id) {
        for (var i = 0; i < DEFAULT_BUTTONS.length; i++) {
            if (DEFAULT_BUTTONS[i].id === id) return DEFAULT_BUTTONS[i];
        }
        return null;
    }

    function getDefaultSidebarConfig() {
        return {
            enabled: true,
            position: 'left',
            buttons: [
                { id: 'open_folder', visible: true, order: 0 },
                { id: 'open_cmd_project', visible: true, order: 1 },
                { id: 'open_cmd_panel', visible: true, order: 2 },
                { id: 'copy_path', visible: true, order: 3 }
            ],
            customButtons: [],
            customButtonCounter: 0
        };
    }

    // ---- Sidebar Visibility ----
    function updateSidebarVisibility() {
        var tv = terminalView;
        if (!tv) return;

        var hasVisible = false;
        var cfg = _sidebarConfig || getDefaultSidebarConfig();

        cfg.buttons.forEach(function (b) {
            if (b.visible) hasVisible = true;
        });
        (cfg.customButtons || []).forEach(function (b) {
            if (b.visible) hasVisible = true;
        });

    document.body.classList.remove('sidebar-visible-left', 'sidebar-visible-right');

    if (_sidebarEnabled && hasVisible) {
        tv.classList.add('sidebar-visible');
        sidebar.style.display = 'flex';
        document.body.classList.add('sidebar-visible-' + _sidebarPosition);

        // Force reflow so margin transition animates from 0
        sidebar.offsetHeight;

        // Add slide-in animation
        sidebar.classList.remove('anim-slide-left', 'anim-slide-right');
        void sidebar.offsetWidth; // reflow to restart animation
        sidebar.classList.add('anim-slide-' + _sidebarPosition);
    } else {
        tv.classList.remove('sidebar-visible', 'has-sidebar-left', 'has-sidebar-right');
        sidebar.style.display = 'none';
    }
    }

    function setSidebarPosition(pos) {
        _sidebarPosition = pos;
        var tv = terminalView;
        if (!tv) return;
        tv.classList.remove('has-sidebar-left', 'has-sidebar-right');
        // Force reflow so margin transition animates
        void tv.offsetWidth;
        tv.classList.add('has-sidebar-' + pos);
    }

    function applySidebar() {
        updateSidebarVisibility();
        setSidebarPosition(_sidebarPosition);
        renderSidebarButtons();
    }

    function toggleSidebar() {
        _sidebarEnabled = !_sidebarEnabled;
        if (_sidebarConfig) _sidebarConfig.enabled = _sidebarEnabled;
        applySidebar();
        if (window.monolithApi) {
            window.monolithApi.set_config('sidebar_config', _sidebarConfig);
        }
    }

    function cleanSidebarButtons(buttons) {
        var validIds = {};
        DEFAULT_BUTTONS.forEach(function (b) { validIds[b.id] = true; });
        return buttons.filter(function (b) { return validIds[b.id]; });
    }

    // ---- Config ----
    function loadSidebarConfig() {
        if (!window.monolithApi) {
            _sidebarConfig = getDefaultSidebarConfig();
            _sidebarEnabled = _sidebarConfig.enabled;
            _sidebarPosition = _sidebarConfig.position;
            return;
        }
        window.monolithApi.get_config('sidebar_config').then(function (val) {
            if (val && typeof val === 'object' && val.buttons) {
                _sidebarConfig = val;
                _sidebarConfig.buttons = cleanSidebarButtons(_sidebarConfig.buttons);
            } else {
                _sidebarConfig = getDefaultSidebarConfig();
            }
            _sidebarEnabled = _sidebarConfig.enabled !== false;
            _sidebarPosition = _sidebarConfig.position || 'left';
            applySidebar();
        }).catch(function () {
            _sidebarConfig = getDefaultSidebarConfig();
            _sidebarEnabled = _sidebarConfig.enabled;
            _sidebarPosition = _sidebarConfig.position;
            applySidebar();
        });
    }

    function saveSidebarConfig() {
        if (!window.monolithApi) return;
        window.monolithApi.set_config('sidebar_config', _sidebarConfig).catch(function () {});
    }

    function debounceSaveConfig() {
        if (_configSaveTimer) clearTimeout(_configSaveTimer);
        _configSaveTimer = setTimeout(function () {
            saveSidebarConfig();
        }, 300);
    }

    function saveSidebarConfigImmediate() {
        if (_configSaveTimer) clearTimeout(_configSaveTimer);
        saveSidebarConfig();
    }

    // ---- CMD Panel ----
    function loadPanelConfig() {
        if (!window.monolithApi) return;
        window.monolithApi.get_config('cmdPanelHeight').then(function (val) {
            _panelHeight = (typeof val === 'number') ? val : 250;
            applyPanelHeight(_panelHeight);
        }).catch(function () {});
        window.monolithApi.get_config('panelShell').then(function (val) {
            _panelShell = (typeof val === 'string') ? val : 'cmd';
        }).catch(function () {});
        window.monolithApi.get_config('cmdPanelOpen').then(function (val) {
            if (val === true) {
                _panelRestoreNeeded = true;
            }
        }).catch(function () {});
    }

    function applyPanelHeight(height) {
        _panelHeight = height;
        document.documentElement.style.setProperty('--cmd-panel-height', height + 'px');
    }

    function showCmdPanel() {
        _cmdPanelOpen = true;
        if (cmdPanel) {
            cmdPanel.classList.remove('anim-close');
            cmdPanel.classList.add('open');
            // Force reflow then animate
            void cmdPanel.offsetWidth;
            cmdPanel.classList.add('anim-open');
        }
        var panelBtn = sidebarButtons.querySelector('[data-btn-id="open_cmd_panel"]');
        if (panelBtn) panelBtn.classList.add('active');
        if (window.monolithApi) {
            window.monolithApi.set_config('cmdPanelOpen', true).catch(function () {});
        }
        if (window.MonolothApp && window.MonolothApp.refitTerminals) {
            setTimeout(function () { window.MonolothApp.refitTerminals(); }, 50);
        }
    }

    function hideCmdPanel() {
        _cmdPanelOpen = false;
        if (cmdPanel) {
            cmdPanel.classList.remove('anim-open');
            cmdPanel.classList.add('anim-close');
            // Wait for animation to finish before hiding
            setTimeout(function () {
                cmdPanel.classList.remove('open', 'anim-close');
            }, 200);
        }
        var panelBtn = sidebarButtons.querySelector('[data-btn-id="open_cmd_panel"]');
        if (panelBtn) panelBtn.classList.remove('active');
        if (window.monolithApi) {
            window.monolithApi.set_config('cmdPanelOpen', false).catch(function () {});
        }
        if (window.MonolothApp && window.MonolothApp.refitTerminals) {
            setTimeout(function () { window.MonolothApp.refitTerminals(); }, 250);
        }
    }

    function toggleCmdPanel() {
        if (_cmdPanelOpen) {
            hideCmdPanel();
        } else {
            showCmdPanel();
            if (!_panelRunning) {
                var dir = getCurrentDir() || '%USERPROFILE%';
                initCmdPanel(dir);
            }
        }
    }

    function initCmdPanel(dir) {
        if (!window.monolithApi) return;
        dir = dir || getCurrentDir() || '%USERPROFILE%';

        hidePanelExitBanner();

        if (!panelTerm) {
            if (typeof Terminal === 'undefined') return;
            var panelBg = 'transparent';
            panelTerm = new Terminal({
                theme: { background: panelBg, foreground: '#b8b8b8', cursor: '#c0c0c0' },
                fontFamily: '"Cascadia Mono", "Consolas", "Lucida Console", "Courier New", monospace',
                fontSize: 13,
                cursorBlink: true,
                cursorStyle: 'block',
                scrollback: 2000,
                smoothScrollDuration: 0,
                convertEol: true,
                windowsMode: true
            });

            if (cmdPanelTerminal) {
                panelTerm.open(cmdPanelTerminal);
                panelTerm.focus();
            }

            if (typeof FitAddon !== 'undefined') {
                panelFitAddon = new FitAddon.FitAddon();
                panelTerm.loadAddon(panelFitAddon);
            }

            panelTerm.onData(function (data) {
                if (window.monolithApi) {
                    window.monolithApi.send_input('panel', data).catch(function () {});
                }
            });
        }

        _panelRunning = true;
        var pCols = panelTerm ? panelTerm.cols : 80;
        var pRows = panelTerm ? panelTerm.rows : 24;
        window.monolithApi.start_terminal('panel', dir, false, _panelShell, pCols, pRows)
            .then(function (result) {
                if (!result || !result.success) {
                    _panelRunning = false;
                    showPanelExitBanner();
                } else if (result.generation && window.MonolothApp && typeof window.MonolothApp.setSessionGeneration === 'function') {
                    window.MonolothApp.setSessionGeneration('panel', result.generation);
                }
                if (panelFitAddon && panelTerm) {
                    setTimeout(function () {
                        panelFitAddon.fit();
                        if (window.monolithApi) {
                            window.monolithApi.resize_terminal('panel', panelTerm.cols, panelTerm.rows).catch(function () {});
                        }
                        try { panelTerm.refresh(0, panelTerm.rows - 1); } catch (e) {}
                    }, 100);
                }
            })
            .catch(function () {
                _panelRunning = false;
                showPanelExitBanner();
            });
    }

    function showPanelExitBanner() {
        _panelRunning = false;
        if (cmdPanelExitBanner) {
            UI.togglePanelExitBanner(cmdPanelExitBanner, true, function () {
                if (window.MonolothApp && window.MonolothApp.restartSession) {
                    window.MonolothApp.restartSession('panel');
                }
            });
        }
    }

    function hidePanelExitBanner() {
        UI.togglePanelExitBanner(cmdPanelExitBanner, false);
    }

    function terminateCmdPanel(skipHide) {
        if (skipHide) _panelClosing = true;
        _panelRunning = false;
        hidePanelExitBanner();
        if (window.monolithApi) {
            window.monolithApi.terminate_terminal('panel').catch(function () {});
        }
        if (panelTerm) {
            try { panelTerm.dispose(); } catch (e) {}
            panelTerm = null;
            panelFitAddon = null;
        }
        if (cmdPanelTerminal) {
            cmdPanelTerminal.innerHTML = '';
        }
        if (!skipHide) {
            hideCmdPanel();
        }
    }

    // ---- CMD Panel Resize ----
    if (cmdPanelResizeHandle) {
        cmdPanelResizeHandle.addEventListener('mousedown', function (e) {
            e.preventDefault();
            _isDragging = true;
            _resizeStartY = e.clientY;
            _resizeStartHeight = _panelHeight;

            document.addEventListener('mousemove', onResizeMouseMove);
            document.addEventListener('mouseup', onResizeMouseUp);
        });
    }

    function onResizeMouseMove(e) {
        if (!_isDragging) return;
        var dy = _resizeStartY - e.clientY;
        var newHeight = _resizeStartHeight + dy;
        if (newHeight < 80) newHeight = 80;
        var maxH = window.innerHeight * 0.6;
        if (newHeight > maxH) newHeight = maxH;

        applyPanelHeight(newHeight);

        if (_resizeDebounceTimer) clearTimeout(_resizeDebounceTimer);
        _resizeDebounceTimer = setTimeout(function () {
            if (window.monolithApi) {
                window.monolithApi.set_config('cmdPanelHeight', _panelHeight).catch(function () {});
            }
            if (window.MonolothApp && window.MonolothApp.refitTerminals) {
                window.MonolothApp.refitTerminals();
            }
        }, 100);
    }

    function onResizeMouseUp() {
        _isDragging = false;
        document.removeEventListener('mousemove', onResizeMouseMove);
        document.removeEventListener('mouseup', onResizeMouseUp);

        if (window.monolithApi) {
            window.monolithApi.set_config('cmdPanelHeight', _panelHeight).catch(function () {});
        }
        if (window.MonolothApp && window.MonolothApp.refitTerminals) {
            window.MonolothApp.refitTerminals();
        }
    }

    // ---- CMD Panel Close ----
    if (cmdPanelClose) {
        cmdPanelClose.addEventListener('click', function () {
            terminateCmdPanel();
        });
    }

    // ---- Settings Tab ----
    function renderSettingsTab() {
        var panel = document.getElementById('tab-sidebar');
        if (!panel) return;

        var cfg = _sidebarConfig || getDefaultSidebarConfig();

        var html = '';

        // --- Sidebar Settings Card ---
        html += '<div class="settings-card">';
        html += '<div class="card-icon">' + ICONS.gear + '</div>';
        html += '<div class="card-body">';
        html += '<h3>Sidebar</h3>';
        html += '<p class="card-desc">Enable or disable the sidebar and choose its position.</p>';

        html += '<div class="form-group"><label>Enable Sidebar</label>';
        html += '<div class="sidebar-toggle-btns">';
        html += '<button class="sidebar-toggle-btn' + (_sidebarEnabled ? ' active' : '') + '" data-enabled="true">On</button>';
        html += '<button class="sidebar-toggle-btn' + (!_sidebarEnabled ? ' active' : '') + '" data-enabled="false">Off</button>';
        html += '</div></div>';

        html += '<div class="form-group"><label>Position</label>';
        html += '<div class="sidebar-toggle-btns">';
        html += '<button class="sidebar-pos-btn' + (_sidebarPosition === 'left' ? ' active' : '') + '" data-pos="left">Left</button>';
        html += '<button class="sidebar-pos-btn' + (_sidebarPosition === 'right' ? ' active' : '') + '" data-pos="right">Right</button>';
        html += '</div></div>';

        html += '</div></div>';

        // --- Buttons Card (vertical layout) ---
        html += '<div class="settings-card settings-card--vertical">';
        html += '<div class="card-icon-row">';
        html += '<div class="card-icon">' + ICONS.panel + '</div>';
        html += '<div class="card-header-text">';
        html += '<h3>Buttons</h3>';
        html += '<p class="card-desc">Configure default and custom sidebar buttons.</p>';
        html += '</div></div>';

        // Default Buttons
        html += '<div class="adv-section"><h4>Default Buttons</h4>';
        html += '<div class="sidebar-default-buttons" id="sidebar-default-buttons">';
        cfg.buttons.sort(function (a, b) { return a.order - b.order; }).forEach(function (b, idx) {
            var def = findDefaultButton(b.id);
            var name = def ? def.name : b.id;
            html += '<div class="sidebar-setting-row" data-id="' + b.id + '" data-type="default">';
            html += '<span class="sidebar-drag-handle" data-tooltip="Drag to reorder"></span>';
            html += '<span class="sidebar-setting-icon">' + (ICONS[def ? def.icon : 'terminal'] || ICONS.terminal) + '</span>';
            html += '<span class="sidebar-setting-name">' + name + '</span>';
            html += '<label class="sidebar-toggle-label">';
            html += '<input type="checkbox"' + (b.visible ? ' checked' : '') + ' data-action="toggle-visibility" data-id="' + b.id + '" data-type="default">';
            html += '<span class="toggle-track"></span>';
            html += '</label>';
            html += '</div>';
        });
        html += '</div></div>';

        // Custom Buttons
        html += '<div class="adv-section"><h4>Custom Buttons</h4>';
        html += '<div class="sidebar-custom-buttons" id="sidebar-custom-buttons">';
        (cfg.customButtons || []).sort(function (a, b) { return a.order - b.order; }).forEach(function (b) {
            html += '<div class="sidebar-setting-row" data-id="' + b.id + '" data-type="custom">';
            html += '<span class="sidebar-drag-handle" data-tooltip="Drag to reorder"></span>';
            html += '<span class="sidebar-setting-icon">' + (ICONS[b.icon] || ICONS.terminal) + '</span>';
            html += '<span class="sidebar-setting-name">' + escapeHtml(b.name) + '</span>';
            html += '<span class="sidebar-setting-mode">' + escapeHtml(b.mode || 'background') + '</span>';
            html += '<label class="sidebar-toggle-label">';
            html += '<input type="checkbox"' + (b.visible ? ' checked' : '') + ' data-action="toggle-visibility" data-id="' + b.id + '" data-type="custom">';
            html += '<span class="toggle-track"></span>';
            html += '</label>';
            html += '<button class="sidebar-edit-btn" data-action="edit-custom" data-id="' + b.id + '" data-tooltip="Edit">' + ICONS.edit + '</button>';
            html += '<button class="sidebar-remove-btn" data-action="remove-custom" data-id="' + b.id + '" data-tooltip="Remove">&times;</button>';
            html += '</div>';
        });
        html += '</div>';

        html += '<button id="add-custom-btn" class="btn-secondary add-cmd-btn" style="margin-top:0.5rem;">';
        html += ICONS.plus + ' Add Custom Button';
        html += '</button>';

        html += '<div id="custom-btn-editor" class="custom-btn-editor" style="display:none;"></div>';

        html += '</div>'; // end adv-section
        html += '</div>'; // end buttons card

        // --- CMD Panel Card ---
        html += '<div class="settings-card">';
        html += '<div class="card-icon">' + ICONS.terminal + '</div>';
        html += '<div class="card-body">';
        html += '<h3>CMD Panel</h3>';
        html += '<p class="card-desc">Configure the embedded command panel shell.</p>';

        html += '<div class="form-group"><label>Panel Shell</label>';
        html += '<select id="panel-shell-select" class="secondary-cmd-mode" style="width:100%;">';
        html += '<option value="cmd"' + (_panelShell === 'cmd' ? ' selected' : '') + '>cmd (Command Prompt)</option>';
        html += '<option value="powershell"' + (_panelShell === 'powershell' ? ' selected' : '') + '>PowerShell</option>';
        html += '</select></div>';

        html += '</div></div>';

        html += '<div id="sidebar-status" class="appearance-status"></div>';

        if (window.MonolothTooltip) {
            window.MonolothTooltip.cleanup();
        }
        panel.innerHTML = html;

        if (window.MonolothTooltip) {
            window.MonolothTooltip.scan(panel);
        }
        wireSettingsEvents();
    }

    function wireSettingsEvents() {
        // Enable/disable toggle
        var toggleBtns = document.querySelectorAll('#tab-sidebar .sidebar-toggle-btn');
        toggleBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var enabled = this.dataset.enabled === 'true';
                _sidebarEnabled = enabled;
                _sidebarConfig.enabled = enabled;
                toggleBtns.forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');
                saveSidebarConfigImmediate();
                applySidebar();
            });
        });

        // Position toggle
        var posBtns = document.querySelectorAll('#tab-sidebar .sidebar-pos-btn');
        posBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                _sidebarPosition = this.dataset.pos;
                _sidebarConfig.position = _sidebarPosition;
                posBtns.forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');
                saveSidebarConfigImmediate();
                applySidebar();
            });
        });

        // Visibility toggles
        var visToggles = document.querySelectorAll('#tab-sidebar input[data-action="toggle-visibility"]');
        visToggles.forEach(function (toggle) {
            toggle.addEventListener('change', function () {
                var id = this.dataset.id;
                var type = this.dataset.type;
                var visible = this.checked;

                if (type === 'default') {
                    _sidebarConfig.buttons.forEach(function (b) {
                        if (b.id === id) b.visible = visible;
                    });
                } else {
                    (_sidebarConfig.customButtons || []).forEach(function (b) {
                        if (b.id === id) b.visible = visible;
                    });
                }
                saveSidebarConfigImmediate();
                applySidebar();
            });
        });

        // Edit custom button
        var editBtns = document.querySelectorAll('#tab-sidebar .sidebar-edit-btn');
        editBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = this.dataset.id;
                var customBtns = _sidebarConfig.customButtons || [];
                for (var i = 0; i < customBtns.length; i++) {
                    if (customBtns[i].id === id) {
                        showCustomBtnEditor(customBtns[i]);
                        break;
                    }
                }
            });
        });

        // Remove custom button
        var removeBtns = document.querySelectorAll('#tab-sidebar .sidebar-remove-btn');
        removeBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = this.dataset.id;
                _sidebarConfig.customButtons = (_sidebarConfig.customButtons || []).filter(function (b) {
                    return b.id !== id;
                });
                saveSidebarConfigImmediate();
                applySidebar();
                renderSettingsTab();
            });
        });

        // Add custom button
        var addBtn = document.getElementById('add-custom-btn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                showCustomBtnEditor();
            });
        }

        // Shell select
        var shellSelect = document.getElementById('panel-shell-select');
        if (shellSelect) {
            shellSelect.addEventListener('change', function () {
                _panelShell = this.value;
                if (window.monolithApi) {
                    window.monolithApi.set_config('panelShell', _panelShell).catch(function () {});
                }
            });
        }

        // Drag reorder
        setupDragReorder();
    }

    var _dragData = null;
    var _dragReorderSetup = false;

    function clearDragState() {
        _dragData = null;
        document.querySelectorAll('#tab-sidebar .sidebar-setting-row').forEach(function (r) {
            r.classList.remove('dragging');
            r.classList.remove('drag-over');
        });
    }

    function getRowUnderCursor(e) {
        var rows = document.querySelectorAll('#tab-sidebar .sidebar-setting-row');
        for (var i = 0; i < rows.length; i++) {
            var rect = rows[i].getBoundingClientRect();
            if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                return rows[i];
            }
        }
        return null;
    }

    function setupDragReorder() {
        if (_dragReorderSetup) return;
        _dragReorderSetup = true;
        var container = document.querySelector('#tab-sidebar');
        if (!container) return;

        // Use event delegation on the container for handles
        container.addEventListener('mousedown', function (e) {
            var handle = e.target.closest('.sidebar-drag-handle');
            if (!handle) return;
            var row = handle.closest('.sidebar-setting-row');
            if (!row) return;
            e.preventDefault();
            _dragData = { id: row.dataset.id, type: row.dataset.type };
            row.classList.add('dragging');
        });

        document.addEventListener('mousemove', function (e) {
            if (!_dragData) return;

            var rows = document.querySelectorAll('#tab-sidebar .sidebar-setting-row');
            rows.forEach(function (r) { r.classList.remove('drag-over'); });

            var target = getRowUnderCursor(e);
            if (target) target.classList.add('drag-over');
        });

        document.addEventListener('mouseup', function (e) {
            if (!_dragData) return;

            var target = getRowUnderCursor(e);
            if (target) {
                target.classList.remove('drag-over');
                var targetId = target.dataset.id;
                var targetType = target.dataset.type;

                if (_dragData.type === targetType && _dragData.id !== targetId) {
                    if (_dragData.type === 'default') {
                        reorderButtons(_sidebarConfig.buttons, _dragData.id, targetId);
                    } else {
                        _sidebarConfig.customButtons = _sidebarConfig.customButtons || [];
                        reorderButtons(_sidebarConfig.customButtons, _dragData.id, targetId);
                    }
                    debounceSaveConfig();
                    applySidebar();
                    renderSettingsTab();
                }
            }
            clearDragState();
        });
    }

    function reorderButtons(arr, dragId, targetId) {
        var dragIdx = -1, targetIdx = -1;
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].id === dragId) dragIdx = i;
            if (arr[i].id === targetId) targetIdx = i;
        }
        if (dragIdx === -1 || targetIdx === -1) return;
        var item = arr.splice(dragIdx, 1)[0];
        arr.splice(targetIdx, 0, item);
        for (var j = 0; j < arr.length; j++) {
            arr[j].order = j;
        }
    }

    function debounceSavePanelHeight(height) {
        if (_configSaveTimer) clearTimeout(_configSaveTimer);
        _configSaveTimer = setTimeout(function () {
            if (window.monolithApi) {
                window.monolithApi.set_config('cmdPanelHeight', height).catch(function () {});
            }
        }, 100);
    }

    function savePanelHeight(height) {
        if (window.monolithApi) {
            window.monolithApi.set_config('cmdPanelHeight', height).catch(function () {});
        }
    }

    function showCustomBtnEditor(editBtn) {
        var editor = document.getElementById('custom-btn-editor');
        if (!editor) return;

        var isEdit = !!editBtn;
        var id = isEdit ? editBtn.id : ('custom_' + (_sidebarConfig.customButtonCounter || 0));
        var name = isEdit ? editBtn.name : '';
        var icon = isEdit ? editBtn.icon : 'terminal';
        var command = isEdit ? editBtn.command : '';
        var mode = isEdit ? (editBtn.mode || 'background') : 'background';
        var visible = isEdit ? editBtn.visible !== false : true;
        var order = isEdit ? editBtn.order : ((_sidebarConfig.customButtons || []).length);

        var html = '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:0.75rem;margin-top:0.5rem;">';

        html += '<div class="form-group"><label>Name</label>';
        html += '<input type="text" id="cust-name" class="settings-input" value="' + escapeHtml(name) + '" placeholder="Button name">';
        html += '</div>';

        html += '<div class="form-group"><label>Command</label>';
        html += '<input type="text" id="cust-cmd" class="settings-input" value="' + escapeHtml(command) + '" placeholder="Command to run">';
        html += '</div>';

        // Icon picker grid
        html += '<div class="form-group"><label>Icon</label>';
        html += '<div class="sidebar-icon-grid">';
        ICON_NAMES.forEach(function (icn) {
            html += '<div class="sidebar-icon-option' + (icon === icn ? ' selected' : '') + '" data-icon="' + icn + '">';
            html += ICONS[icn] || '';
            html += '</div>';
        });
        html += '</div>';

        // Mode selector
        html += '<div class="form-group"><label>Mode</label>';
        html += '<select id="cust-mode" class="secondary-cmd-mode" style="width:100%;">';
        html += '<option value="background"' + (mode === 'background' ? ' selected' : '') + '>Background</option>';
        html += '<option value="externalCmd"' + (mode === 'externalCmd' ? ' selected' : '') + '>External CMD</option>';
        html += '<option value="cmdPanel"' + (mode === 'cmdPanel' ? ' selected' : '') + '>CMD Panel</option>';
        html += '</select></div>';

        html += '<div style="display:flex;gap:0.5rem;">';
        html += '<button id="cust-save-btn" class="btn-primary">Save</button>';
        html += '<button id="cust-cancel-btn" class="btn-secondary">Cancel</button>';
        html += '</div>';

        html += '</div>';
        editor.style.display = '';
        if (window.MonolothTooltip) {
            window.MonolothTooltip.cleanup();
        }
        editor.innerHTML = html;

        document.getElementById('cust-save-btn').addEventListener('click', function () {
            var newName = document.getElementById('cust-name').value.trim();
            var newCmd = document.getElementById('cust-cmd').value.trim();
            var newMode = document.getElementById('cust-mode').value;
            var newIcon = editor.querySelector('.sidebar-icon-option.selected') ? editor.querySelector('.sidebar-icon-option.selected').dataset.icon : 'terminal';

            if (!newName) return;

            var btnData = {
                id: id,
                name: newName,
                icon: newIcon,
                command: newCmd,
                mode: newMode,
                visible: visible,
                order: order
            };

            _sidebarConfig.customButtons = _sidebarConfig.customButtons || [];
            if (isEdit) {
                for (var i = 0; i < _sidebarConfig.customButtons.length; i++) {
                    if (_sidebarConfig.customButtons[i].id === id) {
                        _sidebarConfig.customButtons[i] = btnData;
                        break;
                    }
                }
            } else {
                _sidebarConfig.customButtons.push(btnData);
                _sidebarConfig.customButtonCounter = (_sidebarConfig.customButtonCounter || 0) + 1;
            }

            saveSidebarConfigImmediate();
            applySidebar();
            renderSettingsTab();
        });

        document.getElementById('cust-cancel-btn').addEventListener('click', function () {
            editor.style.display = 'none';
            editor.innerHTML = '';
        });

        // Wire icon picker
        editor.querySelectorAll('.sidebar-icon-option').forEach(function (opt) {
            opt.addEventListener('click', function () {
                editor.querySelectorAll('.sidebar-icon-option').forEach(function (o) { o.classList.remove('selected'); });
                this.classList.add('selected');
                // Pulse animation
                this.classList.remove('just-selected');
                void this.offsetWidth;
                this.classList.add('just-selected');
                var self = this;
                setTimeout(function () { self.classList.remove('just-selected'); }, 200);
            });
        });
    }

    // ---- Settings Tab Integration ----
    function setupSettingsTab() {
        var tabsContainer = document.querySelector('.settings-tabs');
        if (!tabsContainer) return;

        // Check if sidebar tab already exists
        if (document.querySelector('.settings-tab[data-tab="sidebar"]')) return;

        // Insert sidebar tab after Keybinds
        var keybindsTab = document.querySelector('.settings-tab[data-tab="keybinds"]');
        if (!keybindsTab) return;

        var sidebarTab = document.createElement('button');
        sidebarTab.className = 'settings-tab';
        sidebarTab.dataset.tab = 'sidebar';
        sidebarTab.textContent = 'Sidebar';
        sidebarTab.addEventListener('click', function () {
            if (window.MonolothApp && window.MonolothApp.switchTab) {
                window.MonolothApp.switchTab('sidebar');
            }
        });
        tabsContainer.insertBefore(sidebarTab, keybindsTab.nextSibling);

        // Create sidebar tab panel
        var settingsContent = document.querySelector('.settings-content');
        if (!settingsContent) return;

        var sidebarPanel = document.createElement('div');
        sidebarPanel.id = 'tab-sidebar';
        sidebarPanel.className = 'tab-panel';
        settingsContent.appendChild(sidebarPanel);
    }

    // ---- Window Resize Handler ----
    function onWindowResize() {
        if (window.MonolothApp && window.MonolothApp.refitTerminals) {
            window.MonolothApp.refitTerminals();
        }
    }

    // ---- Init ----
    function init() {
        loadSidebarConfig();
        loadPanelConfig();

        // Defer settings tab setup until DOM is fully ready
        setTimeout(function () {
            setupSettingsTab();
        }, 500);

        window.addEventListener('resize', function () {
            if (window._sidebarResizeTimer) clearTimeout(window._sidebarResizeTimer);
            window._sidebarResizeTimer = setTimeout(onWindowResize, 100);
        });
    }

    // ---- Public API ----
    window.SidebarManager = {
        init: init,
        show: function () {
            if (_sidebarEnabled) {
                applySidebar();
            }
        },
        hide: function () {
            sidebar.style.display = 'none';
            sidebar.classList.remove('anim-slide-left', 'anim-slide-right');
            if (terminalView) {
                terminalView.classList.remove('sidebar-visible', 'has-sidebar-left', 'has-sidebar-right');
            }
            document.body.classList.remove('sidebar-visible-left', 'sidebar-visible-right');
        },
        isPanelOpen: function () { return _cmdPanelOpen; },
        isPanelRunning: function () { return _panelRunning; },
        consumePanelClosing: function () { if (_panelClosing) { _panelClosing = false; return true; } return false; },
        toggleCmdPanel: toggleCmdPanel,
        showCmdPanel: showCmdPanel,
        hideCmdPanel: hideCmdPanel,
        terminateCmdPanel: terminateCmdPanel,
        initCmdPanel: initCmdPanel,
        applySidebar: applySidebar,
        toggleSidebar: toggleSidebar,
        renderSettingsTab: renderSettingsTab,
        getPanelShell: function () { return _panelShell; },
        writeToPanel: function (data) { if (panelTerm) { panelTerm.write(data); } },
        restorePanelState: function () {
            if (typeof Terminal === 'undefined' || !window.monolithApi) return;
            window.monolithApi.get_config('cmdPanelOpen').then(function (val) {
                if (val === true) {
                    var dir = getCurrentDir() || '%USERPROFILE%';
                    showCmdPanel();
                    initCmdPanel(dir);
                }
            }).catch(function () {});
        }
    };

    console.log('[Sidebar] Initialized');

    // Auto-initialize
    init();
})();
