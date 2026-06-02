(function () {
    'use strict';

    const landing = document.getElementById('landing');
    const terminalView = document.getElementById('terminal-view');
    const settingsPage = document.getElementById('settings-page');
    const chooseBtn = document.getElementById('choose-dir-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsClose = document.getElementById('settings-close');
    const terminalContainer = document.getElementById('terminal');

    let term = null;
    let fitAddon = null;
    let webglAddon = null;
    let bridgeReady = false;
    let _bgImagePath = '';
    let _bgTransparency = 75;
    let _currentLaunchDir = '';
    let _terminalRunning = false;
    var _resizeObserver = null;
    var _resizeHandler = null;
    var _contextMenuHandler = null;
    var _keyDownHandler = null;
    var _mouseDownHandler = null;
    var _useCustomTitlebar = false;
    var _isMaximized = false;
    var _maximizeSyncTimer = null;
    var _skipNextEof = { main: false, panel: false };
    var _sessionGeneration = { main: 0, panel: 0 };
    var _panelRunning = false;
    var _statusTimers = {};
    var _focusBeforeModal = null;
    var _trapHandler = null;
    var _bgType = 'none';
    var _currentColor = '#0a0a0a';
    var _currentGradient = '';
    var _bgLayer = 'behind';
    var _filePickerType = 'custom';

    function saveFocus() {
        _focusBeforeModal = document.activeElement;
    }

    function restoreFocus() {
        if (_focusBeforeModal && _focusBeforeModal.focus) {
            try { _focusBeforeModal.focus(); } catch (e) {}
            _focusBeforeModal = null;
        }
    }

    function trapFocus(container) {
        if (_trapHandler) {
            document.removeEventListener('keydown', _trapHandler, true);
            _trapHandler = null;
        }
        if (!container) return;
        var focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        setTimeout(function () { first.focus(); }, 50);
        _trapHandler = function (e) {
            if (e.key !== 'Tab') return;
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', _trapHandler, true);
    }

    function releaseFocus() {
        if (_trapHandler) {
            document.removeEventListener('keydown', _trapHandler, true);
            _trapHandler = null;
        }
        restoreFocus();
    }

    // --- Shortcut Management ---
    var DEFAULT_SHORTCUTS = {
        command_palette: 'Ctrl+P',
        settings: 'Ctrl+,'
    };

    var _shortcuts = {};

    function loadShortcuts(callback) {
        if (!window.monolithApi) {
            if (callback) callback({});
            return;
        }
        if (typeof window.monolithApi.get_shortcuts !== 'function') {
            if (callback) callback({});
            return;
        }
        window.monolithApi.get_shortcuts()
            .then(function (result) {
                try {
                    _shortcuts = (result && result.shortcuts) || {};
                } catch (e) {
                    _shortcuts = {};
                }
                // Fill in defaults for missing keys
                for (var key in DEFAULT_SHORTCUTS) {
                    if (!_shortcuts[key]) {
                        _shortcuts[key] = DEFAULT_SHORTCUTS[key];
                    }
                }
                if (callback) callback(_shortcuts);
            })
            .catch(function (e) {
                _shortcuts = {};
                for (var key in DEFAULT_SHORTCUTS) {
                    if (!_shortcuts[key]) {
                        _shortcuts[key] = DEFAULT_SHORTCUTS[key];
                    }
                }
                if (callback) callback(_shortcuts);
            });
    }

    function saveShortcuts(callback) {
        if (!window.monolithApi) {
            if (callback) callback();
            return;
        }
        if (typeof window.monolithApi.save_shortcuts !== 'function') {
            if (callback) callback();
            return;
        }
        window.monolithApi.save_shortcuts(_shortcuts)
            .then(function () {
                if (callback) callback();
            })
            .catch(function (e) {
                console.error('Failed to save shortcuts:', e);
                if (callback) callback();
            });
    }

    function getShortcut(name) {
        return _shortcuts[name] || DEFAULT_SHORTCUTS[name] || '';
    }

    function resetShortcut(name, callback) {
        if (DEFAULT_SHORTCUTS[name]) {
            _shortcuts[name] = DEFAULT_SHORTCUTS[name];
            saveShortcuts(callback);
        }
    }

    function parseShortcutString(str) {
        // Parse "Ctrl+P" into { ctrl: true, shift: false, alt: false, key: 'KeyP' }
        var parts = str.split('+');
        var result = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].trim().toLowerCase();
            if (p === 'ctrl' || p === 'control') result.ctrl = true;
            else if (p === 'shift') result.shift = true;
            else if (p === 'alt') result.alt = true;
            else if (p === 'meta' || p === 'cmd' || p === 'command') result.meta = true;
            else if (p === ',') result.key = 'Comma';
            else if (p === '.') result.key = 'Period';
            else if (p === ' ') result.key = 'Space';
            else result.key = p.toUpperCase();
        }
        return result;
    }

    function shortcutMatches(e, shortcutStr) {
        var s = parseShortcutString(shortcutStr);
        var eventKey = e.key;
        if (eventKey === ' ') eventKey = 'Space';
        else if (eventKey === ',') eventKey = 'Comma';
        else if (eventKey === '.') eventKey = 'Period';
        else if (eventKey.length === 1) eventKey = eventKey.toUpperCase();
        else eventKey = eventKey.charAt(0).toUpperCase() + eventKey.slice(1);

        return e.ctrlKey === s.ctrl &&
               e.shiftKey === s.shift &&
               e.altKey === s.alt &&
               (e.metaKey || false) === s.meta &&
               eventKey === s.key;
    }

    function formatShortcutForDisplay(str) {
        return str.replace(/\+/g, ' + ');
    }

    function renderShortcutUI() {
        for (var key in DEFAULT_SHORTCUTS) {
            var el = document.getElementById('shortcut-' + key);
            if (el) el.textContent = formatShortcutForDisplay(getShortcut(key));
        }
    }

    // --- Theme & CTA Style Management ---
    var _themeMode = 'dark';
    var _ctaButtonStyle = 'blur';
    var _wallpaperBrightness = null;

    function hexToLuminance(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    function extractColorsFromGradient(gradient) {
        return gradient.match(/#[0-9a-fA-F]{3,8}/g) || [];
    }

    function computeAverageBrightnessFromGradient(gradient) {
        var colors = extractColorsFromGradient(gradient);
        if (colors.length === 0) return null;
        var total = 0;
        for (var i = 0; i < colors.length; i++) {
            total += hexToLuminance(colors[i]);
        }
        return total / colors.length;
    }

    function applyTheme(mode) {
        _themeMode = mode;
        document.body.classList.remove('light-mode', 'adaptive-light');
        if (mode === 'light') {
            document.body.classList.add('light-mode');
        } else if (mode === 'auto' && _wallpaperBrightness !== null) {
            if (_wallpaperBrightness > 0.5) {
                document.body.classList.add('light-mode', 'adaptive-light');
            }
        }
    }

    function applyCtaStyle(style) {
        _ctaButtonStyle = style;
        document.body.classList.remove('cta-blur', 'cta-glass', 'cta-solid', 'cta-outline');
        document.body.classList.add('cta-' + style);
    }

    function analyzeWallpaperBrightness(imagePath) {
        if (!window.monolithApi) return;
        if (typeof window.monolithApi.analyze_image_brightness !== 'function') return;
        window.monolithApi.analyze_image_brightness(imagePath)
            .then(function (result) {
                _wallpaperBrightness = (typeof result === 'number' ? result : 0);
                if (_themeMode === 'auto') {
                    applyTheme('auto');
                }
            })
            .catch(function () {
                _wallpaperBrightness = 0;
            });
    }

    // --- Wait for API bridge ---
    function waitForBridge(timeoutMs, callback) {
        const start = Date.now();
        const check = () => {
            if (window.monolithApi) {
                bridgeReady = true;
                callback(true);
            } else if (Date.now() - start > timeoutMs) {
                callback(false);
            } else {
                setTimeout(check, 50);
            }
        };
        check();
    }

    // --- Landing Page ---
    var recentProjectsSection = document.getElementById('recent-projects-section');
    var recentProjectsList = document.getElementById('recent-projects-list');
    var bridgeLoading = document.getElementById('bridge-loading');
    var landingStatusText = document.getElementById('landing-status-text');
    var _recentDirs = [];
    var _bridgeReady = false;

    function updateStatusBar(text) {
        if (landingStatusText) {
            landingStatusText.textContent = text || 'Ready';
        }
    }

    function addToRecentDirectories(path) {
        if (!path) return;
        var existing = _recentDirs.indexOf(path);
        if (existing !== -1) {
            _recentDirs.splice(existing, 1);
        }
        _recentDirs.unshift(path);
        if (_recentDirs.length > 7) {
            _recentDirs = _recentDirs.slice(0, 7);
        }
        if (window.monolithApi) {
            window.monolithApi.set_recent_directories(_recentDirs).catch(function () {});
        }
        if (window.monolithApi) {
            window.monolithApi.save_last_directory(path).catch(function () {});
        }
        renderRecentDirectories();
    }

    function loadRecentDirectories() {
        if (!window.monolithApi) return;
        window.monolithApi.get_recent_directories()
            .then(function (dirs) {
                if (Array.isArray(dirs) && dirs.length > 0) {
                    _recentDirs = dirs;
                    renderRecentDirectories();
                } else {
                    window.monolithApi.get_last_directory().then(function (res) {
                        if (res && res.success && res.path) {
                            _recentDirs = [res.path];
                            renderRecentDirectories();
                        }
                    }).catch(function () {});
                }
            })
            .catch(function () {
                window.monolithApi.get_last_directory().then(function (res) {
                    if (res && res.success && res.path) {
                        _recentDirs = [res.path];
                        renderRecentDirectories();
                    }
                }).catch(function () {});
            });
    }

    function renderRecentDirectories() {
        if (!recentProjectsSection || !recentProjectsList) return;
        if (_recentDirs.length === 0) {
            recentProjectsSection.style.display = 'none';
            recentProjectsList.innerHTML = '';
            return;
        }
        recentProjectsSection.style.display = '';
        recentProjectsList.innerHTML = '';
        for (var i = 0; i < _recentDirs.length; i++) {
            (function (dirPath) {
                var item = document.createElement('div');
                item.className = 'recent-project-item';

                var icon = document.createElement('div');
                icon.className = 'recent-project-icon';
                icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
                item.appendChild(icon);

                var pathSpan = document.createElement('span');
                pathSpan.className = 'recent-project-path';
                pathSpan.textContent = dirPath;
                pathSpan.title = dirPath;
                item.appendChild(pathSpan);

                var arrow = document.createElement('div');
                arrow.className = 'recent-project-arrow';
                arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
                item.appendChild(arrow);

                item.addEventListener('click', function () {
                    showTerminal(dirPath);
                    addToRecentDirectories(dirPath);
                });
                recentProjectsList.appendChild(item);
            })(_recentDirs[i]);
        }
    }

    // Show loading indicator while bridge initializes
    if (bridgeLoading) bridgeLoading.style.display = 'flex';
    updateStatusBar('Initializing...');

    if (chooseBtn) {
        chooseBtn.addEventListener('click', () => {
            waitForBridge(3000, (ready) => {
                if (!ready) {
                    chooseBtn.querySelector('span').textContent = 'Failed to initialize — please restart the app';
                    chooseBtn.style.color = 'var(--accent-red)';
                    return;
                }
                window.monolithApi.get_file_picker_type()
                    .then(function (pickerType) {
                        _filePickerType = pickerType || 'custom';
                        if (_filePickerType === 'native') {
                            window.monolithApi.native_pick_directory()
                                .then(function (res) {
                                    if (res && res.success && res.path) {
                                        addToRecentDirectories(res.path);
                                        showTerminal(res.path);
                                    }
                                })
                                .catch(function () {});
                        } else {
                            openFilePicker({
                                id: 'opencode_dir',
                                title: 'Choose Directory',
                                mode: 'folder'
                            }).then(function (path) {
                                if (path) {
                                    addToRecentDirectories(path);
                                    showTerminal(path);
                                }
                            }).catch(function () {});
                        }
                    })
                    .catch(function () {
                        openFilePicker({
                            id: 'opencode_dir',
                            title: 'Choose Directory',
                            mode: 'folder'
                        }).then(function (path) {
                            if (path) {
                                addToRecentDirectories(path);
                                showTerminal(path);
                            }
                        }).catch(function () {});
                    });
            });
        });
    }

    function saveLastDir(path) {
        addToRecentDirectories(path);
    }

    // Load background config once bridge is ready
    waitForBridge(5000, function (ready) {
        if (ready) {
            _bridgeReady = true;
            updateStatusBar('Ready');
            loadShortcuts(function () {
                // nothing to update in status bar — shortcuts are static
            });
            var bgPromise = loadBackgroundConfig();
            var profilesPromise = loadProfiles();
            var startupPromise = loadStartupConfig();
            loadRecentDirectories();
            loadCustomTitlebarConfig();
            setupMaximizeSyncListener();
            setupTitlebarEventHandlers();
            updateMainUILabels();
            window.monolithApi.get_file_picker_type()
                .then(function (res) {
                    _filePickerType = res || 'custom';
                })
                .catch(function () {});
            Promise.all([bgPromise, profilesPromise, startupPromise]).then(function () {
                if (bridgeLoading) bridgeLoading.style.display = 'none';
            }).catch(function () {
                if (bridgeLoading) bridgeLoading.style.display = 'none';
            });
        } else {
            if (bridgeLoading) bridgeLoading.style.display = 'none';
            updateStatusBar('Bridge unavailable');
        }
    });

    let _currentViewState = 'landing';

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            showSettings();
        });
    }

    if (settingsClose) {
        settingsClose.addEventListener('click', () => {
            hideSettings();
        });
    }

    function showSettings() {
        _currentViewState = (landing && !landing.classList.contains('hidden')) ? 'landing' :
                            (terminalView && terminalView.classList.contains('active')) ? 'terminal' : 'landing';
        setCurrentView('settings');

        if (landing) landing.classList.add('hidden');
        if (terminalView) terminalView.classList.remove('active');
        if (settingsPage) settingsPage.classList.add('active');
        saveFocus();
        trapFocus(settingsPage);
        switchTab('launcher');
        loadUpdaterInfo();
    }

    function hideSettings() {
        releaseFocus();
        if (settingsPage) settingsPage.classList.remove('active');
        if (_currentViewState === 'terminal') {
            if (terminalView) terminalView.classList.add('active');
        } else {
            if (landing) landing.classList.remove('hidden');
        }
        setCurrentView(_currentViewState);
    }

    function loadUpdaterInfo() {
        if (!window.monolithApi) return;
        window.monolithApi.get_current_version()
            .then((ver) => {
                const el = document.getElementById('current-version');
                if (el) el.textContent = ver;
            });
    }

    // --- Settings Tabs ---
    var tabs = document.querySelectorAll('.settings-tab');

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var target = tab.dataset.tab;
            document.querySelectorAll('.settings-tab').forEach(function (t) { t.classList.remove('active'); });
            document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
            tab.classList.add('active');
            var panel = document.getElementById('tab-' + target);
            if (panel) panel.classList.add('active');
            loadSettingsTab(target);
        });
    });

    // --- Collapsible sections ---
    document.querySelector('.settings-content').addEventListener('click', function (e) {
        var trigger = e.target.closest('.collapsible-trigger');
        if (!trigger) return;
        var section = trigger.closest('.collapsible-section');
        if (!section) return;
        var body = section.querySelector('.collapsible-body');
        var chevron = trigger.querySelector('.collapsible-chevron');
        if (body) {
            var isHidden = body.style.display === 'none';
            body.style.display = isHidden ? '' : 'none';
            if (chevron) chevron.classList.toggle('open', isHidden);
        }
    });

    function loadSettingsTab(tabName) {
        if (!window.monolithApi) return;

        if (tabName === 'appearance') {
            loadBackgroundConfig();
            syncTitlebarToggleState();
        } else if (tabName === 'keybinds') {
            loadShortcuts(function () {
                renderShortcutUI();
            });
        } else if (tabName === 'launcher') {
            loadAdvancedSettings();
        } else if (tabName === 'profiles') {
            loadProfiles();
        } else if (tabName === 'history') {
            loadHistoryTab();
        }
    }

    // Status messages: auto-clear after 6s, clickable to dismiss
    function showStatus(id, message, isError) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = message;
        el.classList.add(isError ? 'error' : 'success', 'dismissible');

        // Clear previous timer
        if (_statusTimers[id]) { clearTimeout(_statusTimers[id]); }

        // Auto-clear after 6 seconds
        _statusTimers[id] = setTimeout(function () {
            el.textContent = '';
            el.classList.remove('error', 'success', 'dismissible');
        }, 6000);
    }

    // Click status to dismiss immediately
    ['updater-status', 'appearance-status', 'advanced-status', 'shortcuts-status', 'history-status'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', function () {
                if (_statusTimers[id]) { clearTimeout(_statusTimers[id]); }
                el.textContent = '';
                el.classList.remove('error', 'success', 'dismissible');
            });
        }
    });

    // --- Advanced Tab ---
    const checkUpdateBtn = document.getElementById('check-update-btn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', () => {
            checkUpdateBtn.disabled = true;
            showStatus('updater-status', 'Checking...', false);
            window.monolithApi.check_for_updates()
                .then((res) => {
                    checkUpdateBtn.disabled = false;
                    if (res.success) {
                        if (res.has_update) {
                            showStatus('updater-status', 'Update available: v' + res.latest_version + ' — view on GitHub to download', false);
                        } else {
                            showStatus('updater-status', 'You are on the latest version.', false);
                        }
                    } else {
                        showStatus('updater-status', res.error, true);
                    }
                })
                .catch((err) => {
                    checkUpdateBtn.disabled = false;
                    showStatus('updater-status', String(err), true);
                });
        });
    }

    // --- Appearance: Custom Background System ---

    const bgOverlay = document.getElementById('bg-overlay');
    const terminalBgOverlay = document.getElementById('terminal-bg-overlay');

    function getBackgroundStyle(config) {
        var t = parseInt(config.transparency, 10);
        if (isNaN(t)) t = 75;
        t = Math.max(0, Math.min(100, t));
        var alpha = t / 100;

        var type = config.type || 'none';

        if (type === 'image' && config.imageUrl) {
            var isDataUrl = config.imageUrl.indexOf('data:') === 0;
            var isGif = false;
            if (isDataUrl) {
                isGif = config.imageUrl.indexOf('image/gif') !== -1 || config.imageUrl.indexOf('image/GIF') !== -1;
            } else {
                isGif = config.imageUrl.toLowerCase().indexOf('.gif') !== -1 && config.imageUrl.toLowerCase().indexOf('.gif?') === -1;
            }
            var cacheBust = isDataUrl || isGif ? '' : (config.imageUrl.indexOf('?') === -1 ? '?t=' + Date.now() : '&t=' + Date.now());
            return {
                backgroundImage: 'url("' + config.imageUrl + cacheBust + '")',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                opacity: alpha,
                display: 'block',
                isGif: isGif
            };
        }

        if (type === 'color') {
            return {
                backgroundImage: 'none',
                backgroundColor: config.color || '#0a0a0a',
                opacity: alpha,
                display: 'block'
            };
        }

        if (type === 'gradient' && config.gradient) {
            return {
                backgroundImage: config.gradient,
                backgroundSize: 'cover',
                backgroundRepeat: 'no-repeat',
                opacity: alpha,
                display: 'block'
            };
        }

        return {
            backgroundImage: 'none',
            display: 'none'
        };
    }

    function computeTerminalBg(config) {
        var type = config.type || 'none';
        if (type === 'none') return '#0a0a0a';
        return 'transparent';
    }

    function shouldUseWebglRenderer(config) {
        return false;
    }

    function syncTerminalWebglRenderer(config) {
        if (!term) return;

        if (!shouldUseWebglRenderer(config)) {
            if (webglAddon) {
                try { webglAddon.dispose(); } catch (e) {}
                webglAddon = null;
                if (term.rows > 0) {
                    try { term.refresh(0, term.rows - 1); } catch (e) {}
                }
            }
            return;
        }

        if (webglAddon || typeof WebglAddon === 'undefined') return;
        try {
            webglAddon = new WebglAddon.WebglAddon();
            term.loadAddon(webglAddon);
        } catch (e) {
            webglAddon = null;
            console.warn('[Monoloth] Failed to load WebGL addon, falling back to canvas renderer:', e);
        }
    }

    function applyBackground(config) {
        if (!bgOverlay) return;
        var style = getBackgroundStyle(config);
        var isGif = style.isGif;

        // For GIFs, use an <img> element for proper animation
        var existingGif = document.getElementById('bg-gif-img');
        if (isGif) {
            bgOverlay.style.backgroundImage = 'none';
            bgOverlay.style.backgroundColor = 'transparent';
            bgOverlay.style.opacity = '1';
            bgOverlay.style.display = 'block';

            if (!existingGif) {
                var gifImg = document.createElement('img');
                gifImg.id = 'bg-gif-img';
                gifImg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:cover;object-position:center;pointer-events:none;z-index:-1;';
                document.body.appendChild(gifImg);
                existingGif = gifImg;
            }
            var isDataUrl = config.imageUrl.indexOf('data:') === 0;
            if (isDataUrl) {
                existingGif.src = config.imageUrl;
            } else {
                existingGif.src = config.imageUrl + (config.imageUrl.indexOf('?') === -1 ? '?t=' + Date.now() : '&t=' + Date.now());
            }
            existingGif.style.opacity = style.opacity !== undefined ? style.opacity : 1;
            existingGif.style.display = 'block';
        } else {
            if (existingGif) {
                existingGif.remove();
            }
            bgOverlay.style.backgroundImage = style.backgroundImage || 'none';
            if (style.backgroundSize) bgOverlay.style.backgroundSize = style.backgroundSize;
            if (style.backgroundPosition) bgOverlay.style.backgroundPosition = style.backgroundPosition;
            if (style.backgroundRepeat) bgOverlay.style.backgroundRepeat = style.backgroundRepeat;
            if (style.backgroundColor) bgOverlay.style.backgroundColor = style.backgroundColor;
            bgOverlay.style.opacity = style.opacity !== undefined ? style.opacity : 1;
            bgOverlay.style.display = style.display || 'none';
        }

        _bgType = config.type || 'none';
        _bgImagePath = (config.type === 'image' && config.image) ? config.image : '';
        _bgTransparency = config.transparency != null ? parseInt(config.transparency, 10) : 75;
        _currentColor = config.color || '#0a0a0a';
        _currentGradient = config.gradient || '';
        _bgLayer = config.bgLayer || 'behind';

        applyTerminalBg(config);
        applyTerminalOverlay(config);
    }

    function getTerminalLightTheme() {
        return {
            foreground: '#2d2d2d',
            cursor: '#333333',
            selectionBackground: '#c0c0c0',
            black: '#000000',
            red: '#6e3030',
            green: '#306030',
            yellow: '#6e6e30',
            blue: '#30306e',
            magenta: '#6e306e',
            cyan: '#306e6e',
            white: '#808080',
            brightBlack: '#505050',
            brightRed: '#904040',
            brightGreen: '#408040',
            brightYellow: '#909040',
            brightBlue: '#404090',
            brightMagenta: '#904090',
            brightCyan: '#409090',
            brightWhite: '#b0b0b0'
        };
    }

    function getTerminalDarkTheme(terminalBg) {
        return {
            foreground: '#b8b8b8',
            cursor: '#c0c0c0',
            selectionBackground: '#4a4a4a',
            red: '#b0b0b0',
            green: '#a0a0a0',
            yellow: '#c0c0c0',
            blue: '#909090',
            magenta: '#b0b0b0',
            cyan: '#a0a0a0',
            white: '#e0e0e0',
            brightBlack: '#4a4a4a',
            brightRed: '#d0d0d0',
            brightGreen: '#c0c0c0',
            brightYellow: '#e0e0e0',
            brightBlue: '#b0b0b0',
            brightMagenta: '#d0d0d0',
            brightCyan: '#c0c0c0',
            brightWhite: '#ffffff'
        };
    }

    function applyTerminalBg(config) {
        if (!term || !term.setOption) return;
        if (!config) {
            config = {
                type: _bgType,
                transparency: _bgTransparency,
                bgLayer: _bgLayer
            };
        }
        var layer = config.bgLayer || 'behind';
        var themeBg = layer === 'overlay' ? '#000000' : computeTerminalBg(config);
        var isLight = document.body.classList.contains('light-mode') || document.body.classList.contains('adaptive-light');
        try {
            var useWebgl = shouldUseWebglRenderer(config);
            if (!useWebgl) {
                syncTerminalWebglRenderer(config);
            }

            var existing = {};
            try { existing = Object.assign({}, term.getOption('theme')); } catch (e) {}
            existing.background = themeBg;

            var textTheme = isLight ? getTerminalLightTheme() : getTerminalDarkTheme(themeBg);
            existing.foreground = textTheme.foreground;
            existing.cursor = textTheme.cursor;
            existing.selectionBackground = textTheme.selectionBackground;
            existing.red = textTheme.red;
            existing.green = textTheme.green;
            existing.yellow = textTheme.yellow;
            existing.blue = textTheme.blue;
            existing.magenta = textTheme.magenta;
            existing.cyan = textTheme.cyan;
            existing.white = textTheme.white;
            existing.brightBlack = textTheme.brightBlack;
            existing.brightRed = textTheme.brightRed;
            existing.brightGreen = textTheme.brightGreen;
            existing.brightYellow = textTheme.brightYellow;
            existing.brightBlue = textTheme.brightBlue;
            existing.brightMagenta = textTheme.brightMagenta;
            existing.brightCyan = textTheme.brightCyan;
            existing.brightWhite = textTheme.brightWhite;

            if (layer === 'overlay') {
                existing.black = '#000000';
            } else if (config.type !== 'none') {
                existing.black = 'rgba(10, 10, 10, 0)';
            } else {
                existing.black = '#0a0a0a';
            }

            term.setOption('theme', existing);
            if (term.rows > 0) {
                term.refresh(0, term.rows - 1);
            }

            if (useWebgl) {
                syncTerminalWebglRenderer(config);
            }
        } catch (e) { /* ignore */ }
    }

    function applyTerminalOverlay(config) {
        if (!terminalBgOverlay) return;
        var layer = config.bgLayer || 'behind';
        if (layer === 'overlay' && config.type !== 'none') {
            var isGifOverlay = false;
            if (config.imageUrl) {
                var isDataUrlOv = config.imageUrl.indexOf('data:') === 0;
                if (isDataUrlOv) {
                    isGifOverlay = config.imageUrl.indexOf('image/gif') !== -1 || config.imageUrl.indexOf('image/GIF') !== -1;
                } else {
                    isGifOverlay = config.imageUrl.toLowerCase().indexOf('.gif') !== -1 && config.imageUrl.toLowerCase().indexOf('.gif?') === -1;
                }
            }
            if (isGifOverlay) {
                terminalBgOverlay.style.backgroundImage = 'none';
                terminalBgOverlay.style.backgroundColor = 'transparent';
                terminalBgOverlay.style.display = 'none';
                var existingGif = document.getElementById('terminal-bg-gif-img');
                if (!existingGif) {
                    var gifImg = document.createElement('img');
                    gifImg.id = 'terminal-bg-gif-img';
                    gifImg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:center;pointer-events:none;';
                    terminalView.appendChild(gifImg);
                    existingGif = gifImg;
                }
            var isDataUrlOvImg = config.imageUrl.indexOf('data:') === 0;
            if (isDataUrlOvImg) {
                existingGif.src = config.imageUrl;
            } else {
                var ovCacheBust = config.imageUrl.indexOf('?') === -1 ? '?t=' + Date.now() : '&t=' + Date.now();
                existingGif.src = config.imageUrl + ovCacheBust;
            }
                existingGif.style.opacity = config.transparency != null ? parseInt(config.transparency, 10) / 100 : 0.75;
                existingGif.style.display = 'block';
            } else {
                var existingTermGif = document.getElementById('terminal-bg-gif-img');
                if (existingTermGif) { existingTermGif.remove(); }
                var style = getBackgroundStyle(config);
                terminalBgOverlay.style.backgroundImage = style.backgroundImage || 'none';
                if (style.backgroundSize) terminalBgOverlay.style.backgroundSize = style.backgroundSize;
                if (style.backgroundPosition) terminalBgOverlay.style.backgroundPosition = style.backgroundPosition;
                if (style.backgroundRepeat) terminalBgOverlay.style.backgroundRepeat = style.backgroundRepeat;
                if (style.backgroundColor) terminalBgOverlay.style.backgroundColor = style.backgroundColor;
                terminalBgOverlay.style.opacity = style.opacity !== undefined ? style.opacity : 1;
                terminalBgOverlay.style.display = 'block';
            }
            var tc = document.getElementById('terminal-container');
            if (tc) tc.style.backgroundColor = '#000000';
        } else {
            terminalBgOverlay.style.display = 'none';
            var tc2 = document.getElementById('terminal-container');
            if (tc2) tc2.style.backgroundColor = '';
            var terminalGifCleanup = document.getElementById('terminal-bg-gif-img');
            if (terminalGifCleanup) { terminalGifCleanup.remove(); }
        }
    }

    function renderBgPreview(config) {
        var previewThumb = document.getElementById('bg-preview-thumb');
        if (!previewThumb) return;
        var placeholder = previewThumb.querySelector('.bg-preview-placeholder');
        var type = config.type || 'none';
        var existingPreviewGif = previewThumb.querySelector('.bg-preview-gif');

        if (type === 'image' && config.imageUrl) {
            var isDataUrl = config.imageUrl.indexOf('data:') === 0;
            var isGif = false;
            if (isDataUrl) {
                isGif = config.imageUrl.indexOf('image/gif') !== -1 || config.imageUrl.indexOf('image/GIF') !== -1;
            } else {
                isGif = config.imageUrl.toLowerCase().indexOf('.gif') !== -1 && config.imageUrl.toLowerCase().indexOf('.gif?') === -1;
            }
            var cacheBust = isDataUrl ? '' : (config.imageUrl.indexOf('?') === -1 ? '?t=' + Date.now() : '&t=' + Date.now());
            var imageUrl = config.imageUrl + cacheBust;

            if (isGif) {
                if (existingPreviewGif) existingPreviewGif.remove();
                var gifImg = document.createElement('img');
                gifImg.className = 'bg-preview-gif';
                gifImg.src = imageUrl;
                gifImg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;object-position:center;';
                previewThumb.style.position = 'relative';
                previewThumb.style.height = '150px';
                previewThumb.style.backgroundImage = 'none';
                previewThumb.style.backgroundColor = 'transparent';
                previewThumb.classList.add('has-image');
                previewThumb.appendChild(gifImg);
                if (placeholder) placeholder.style.display = 'none';
            } else {
                if (existingPreviewGif) existingPreviewGif.remove();
                var img = new Image();
                img.onload = function() {
                    var aspectRatio = img.height / img.width;
                    var containerWidth = previewThumb.offsetWidth;
                    var newHeight = Math.max(100, containerWidth * aspectRatio);
                    previewThumb.style.height = newHeight + 'px';
                    previewThumb.style.backgroundImage = 'url("' + imageUrl + '")';
                    previewThumb.style.backgroundSize = 'contain';
                    previewThumb.style.backgroundPosition = 'center';
                    previewThumb.style.backgroundRepeat = 'no-repeat';
                    previewThumb.style.backgroundColor = 'transparent';
                    previewThumb.classList.add('has-image');
                    if (placeholder) placeholder.style.display = 'none';
                };
                img.onerror = function() {
                    previewThumb.style.height = '100px';
                    previewThumb.style.backgroundImage = 'none';
                    previewThumb.style.backgroundColor = 'transparent';
                    previewThumb.classList.remove('has-image');
                    if (placeholder) { placeholder.textContent = 'Failed to load image'; placeholder.style.display = ''; }
                };
                img.src = imageUrl;
            }
        } else if (type === 'color') {
            previewThumb.style.height = '100px';
            previewThumb.style.backgroundImage = 'none';
            previewThumb.style.backgroundColor = config.color || '#0a0a0a';
            previewThumb.classList.add('has-image');
            if (placeholder) { placeholder.textContent = config.color || '#0a0a0a'; placeholder.style.display = ''; }
        } else if (type === 'gradient' && config.gradient) {
            previewThumb.style.height = '100px';
            previewThumb.style.backgroundImage = config.gradient;
            previewThumb.style.backgroundColor = 'transparent';
            previewThumb.classList.add('has-image');
            if (placeholder) placeholder.style.display = 'none';
        } else {
            previewThumb.style.height = '100px';
            previewThumb.style.backgroundImage = 'none';
            previewThumb.style.backgroundColor = 'transparent';
            previewThumb.classList.remove('has-image');
            if (placeholder) { placeholder.textContent = 'No background'; placeholder.style.display = ''; }
        }
    }

    function updateBgTypeUI(type) {
        var btns = document.querySelectorAll('.bg-type-btn');
        btns.forEach(function (b) {
            b.classList.toggle('active', b.dataset.type === type);
        });
        ['bg-image-options', 'bg-color-options', 'bg-gradient-options'].forEach(function (id) {
            var panel = document.getElementById(id);
            if (panel) {
                var show = (type === 'image' && id === 'bg-image-options')
                    || (type === 'color' && id === 'bg-color-options')
                    || (type === 'gradient' && id === 'bg-gradient-options');
                panel.style.display = show ? '' : 'none';
            }
        });
    }

    function loadBackgroundConfig() {
        if (!window.monolithApi) return Promise.resolve();
        if (typeof window.monolithApi.get_background_config !== 'function') {
            setTimeout(loadBackgroundConfig, 300);
            return Promise.resolve();
        }
        return window.monolithApi.get_background_config()
            .then(function (config) {
                if (!config) return;
                applyBackground(config);
                renderBgPreview(config);
                updateBgTypeUI(config.type);

                // Theme mode
                var themeMode = config.themeMode || 'dark';
                applyTheme(themeMode);
                updateThemeUI(themeMode);

                // CTA button style
                var ctaStyle = config.ctaButtonStyle || 'blur';
                applyCtaStyle(ctaStyle);
                updateCtaStyleUI(ctaStyle);

                // Background layer
                var bgLayer = config.bgLayer || 'behind';
                updateBgLayerUI(bgLayer);

                // Analyze background brightness for auto theme
                if (config.type === 'image' && config.image) {
                    analyzeWallpaperBrightness(config.image);
                } else if (config.type === 'color' && config.color) {
                    _wallpaperBrightness = hexToLuminance(config.color);
                    if (_themeMode === 'auto') {
                        applyTheme('auto');
                    }
                } else if (config.type === 'gradient' && config.gradient) {
                    _wallpaperBrightness = computeAverageBrightnessFromGradient(config.gradient);
                    if (_themeMode === 'auto') {
                        applyTheme('auto');
                    }
                } else {
                    _wallpaperBrightness = null;
                    if (_themeMode === 'auto') {
                        document.body.classList.remove('light-mode', 'adaptive-light');
                    }
                }

                var gradientBtns = document.querySelectorAll('.gradient-btn');
                gradientBtns.forEach(function (b) { b.classList.remove('active'); });
                if (config.type === 'gradient' && config.gradient) {
                    gradientBtns.forEach(function (b) {
                        if (b.dataset.value === config.gradient) {
                            b.classList.add('active');
                        }
                    });
                }

                var slider = document.getElementById('bg-transparency-slider');
                var valEl = document.getElementById('bg-transparency-value');
                var pathEl = document.getElementById('bg-image-path');
                var colorPicker = document.getElementById('bg-color-picker');
                var colorHex = document.getElementById('bg-color-hex');
                var previewThumb = document.getElementById('bg-preview-thumb');

                if (slider) slider.value = config.transparency;
                if (valEl) valEl.textContent = config.transparency + '%';
                if (pathEl) pathEl.textContent = config.image || 'None selected';
                if (colorPicker) colorPicker.value = config.color || '#0a0a0a';
                if (colorHex) colorHex.textContent = config.color || '#0a0a0a';
                if (previewThumb) previewThumb.style.opacity = (config.transparency != null ? config.transparency : 75) / 100;
            })
            .catch(function (err) {
                console.error('Failed to load background config:', err);
            });
    }

    function updateThemeUI(mode) {
        var container = document.getElementById('theme-selector');
        if (!container) return;
        var btns = container.querySelectorAll('.theme-btn');
        btns.forEach(function (b) {
            b.classList.toggle('active', b.dataset.theme === mode);
        });
    }

    function updateCtaStyleUI(style) {
        var btns = document.querySelectorAll('.cta-style-btn');
        btns.forEach(function (b) {
            b.classList.toggle('active', b.dataset.style === style);
        });
    }

    function updateBgLayerUI(layer) {
        var btns = document.querySelectorAll('.bg-layer-btn');
        btns.forEach(function (b) {
            b.classList.toggle('active', b.dataset.layer === layer);
        });
    }

    function saveAppearanceSettings(msg) {
        var image = _bgType === 'image' ? (_bgImagePath || null) : null;
        var color = _bgType === 'color' ? (_currentColor || null) : null;
        var gradient = _bgType === 'gradient' ? (_currentGradient || null) : null;
        saveBackground(_bgType, { image: image, color: color, gradient: gradient }, msg);
    }

    function saveBackground(type, extras, msg) {
        if (!window.monolithApi) return;
        var slider = document.getElementById('bg-transparency-slider');
        var transparency = slider ? parseInt(slider.value, 10) : 75;
        var args = [type, extras.image, extras.color, extras.gradient, transparency, _themeMode, _ctaButtonStyle, _bgLayer];
        window.monolithApi.set_background_config.apply(null, args)
            .then(function () {
                loadBackgroundConfig();
                if (msg) showAppearanceStatus(msg, false);
            })
            .catch(function (err) {
                console.error('Failed to save background config:', err);
                showAppearanceStatus('Failed to save: ' + err, true);
            });
    }

    function showAppearanceStatus(msg, isError) {
        var el = document.getElementById('appearance-status');
        if (!el) return;
        el.textContent = msg;
        el.classList.add(isError ? 'error' : 'success', 'dismissible');
        if (_statusTimers['appearance-status']) { clearTimeout(_statusTimers['appearance-status']); }
        _statusTimers['appearance-status'] = setTimeout(function () {
            el.textContent = '';
            el.classList.remove('error', 'success', 'dismissible');
        }, 6000);
    }

    // --- Appearance Tab Event Handlers ---

    // Theme selector
    var themeBtns = document.querySelectorAll('#theme-selector .theme-btn');
    themeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var mode = this.dataset.theme;
            applyTheme(mode);
            updateThemeUI(mode);
            saveAppearanceSettings('Theme changed.');
        });
    });

    // CTA style selector
    var ctaStyleBtns = document.querySelectorAll('.cta-style-btn');
    ctaStyleBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var style = this.dataset.style;
            applyCtaStyle(style);
            updateCtaStyleUI(style);
            saveAppearanceSettings('Button style changed.');
        });
    });

    // Background layer selector
    var bgLayerBtns = document.querySelectorAll('.bg-layer-btn');
    bgLayerBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            _bgLayer = this.dataset.layer;
            updateBgLayerUI(_bgLayer);
            saveAppearanceSettings('Background layer changed.');
        });
    });

    // Type selector
    var typeBtns = document.querySelectorAll('.bg-type-btn');
    typeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var type = this.dataset.type;
            updateBgTypeUI(type);

            var extras = { image: null, color: null, gradient: null };
            if (type === 'none') {
                saveBackground('none', { image: null, color: null, gradient: null }, 'Background cleared.');
                return;
            }
            saveBackground(type, extras, 'Background type changed.');
        });
    });

    // Image picker
    var bgPickBtn = document.getElementById('bg-pick-btn');
    if (bgPickBtn) {
        bgPickBtn.addEventListener('click', function () {
            if (!window.monolithApi) return;
            // Fetch latest picker type to avoid race condition
            window.monolithApi.get_file_picker_type()
                .then(function (pickerType) {
                    _filePickerType = pickerType || 'custom';
                    if (_filePickerType === 'native') {
                        window.monolithApi.native_pick_file('All files|*.*')
                            .then(function (res) {
                                if (res && res.success && res.path) {
                                    saveBackground('image', { image: res.path, color: null, gradient: null }, 'Background image set.');
                                }
                            })
                            .catch(function () {});
                    } else {
                        openFilePicker({
                            id: 'bg',
                            title: 'Choose Background Image',
                            mode: 'file',
                            filter: 'All files|*.*'
                        }).then(function (filePath) {
                            if (filePath) {
                                saveBackground('image', { image: filePath, color: null, gradient: null }, 'Background image set.');
                            }
                        }).catch(function () {});
                    }
                })
                .catch(function () {
                    // Fallback to custom picker if type check fails
                    openFilePicker({
                        id: 'bg',
                        title: 'Choose Background Image',
                        mode: 'file',
                        filter: 'All files|*.*'
                    }).then(function (filePath) {
                        if (filePath) {
                            saveBackground('image', { image: filePath, color: null, gradient: null }, 'Background image set.');
                        }
                    }).catch(function () {});
                });
        });
    }

    var bgClearBtn = document.getElementById('bg-clear-btn');
    if (bgClearBtn) {
        bgClearBtn.addEventListener('click', function () {
            if (!window.monolithApi) return;
            saveBackground('none', { image: null, color: null, gradient: null }, 'Background cleared.');
        });
    }

    // Color picker
    var colorPicker = document.getElementById('bg-color-picker');
    if (colorPicker) {
        colorPicker.addEventListener('input', function () {
            var hexEl = document.getElementById('bg-color-hex');
            if (hexEl) hexEl.textContent = this.value;
        });
        colorPicker.addEventListener('change', function () {
            saveBackground('color', { image: null, color: this.value, gradient: null }, 'Background color set.');
        });
    }

    // Gradient presets
    var gradientBtns = document.querySelectorAll('.gradient-btn');
    gradientBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var gradient = this.dataset.value;
            gradientBtns.forEach(function (b) { b.classList.remove('active'); });
            this.classList.add('active');
            saveBackground('gradient', { image: null, color: null, gradient: gradient }, 'Gradient applied.');
        });
        btn.style.backgroundImage = btn.dataset.value;
        if (btn.dataset.value.indexOf('radial') !== -1) {
            btn.style.backgroundSize = '100% 100%';
        } else {
            btn.style.backgroundSize = 'cover';
        }
    });

    // Transparency slider
    var bgSlider = document.getElementById('bg-transparency-slider');
    if (bgSlider) {
        bgSlider.addEventListener('input', function () {
            var valEl = document.getElementById('bg-transparency-value');
            if (valEl) valEl.textContent = this.value + '%';

            var previewThumb = document.getElementById('bg-preview-thumb');
            if (previewThumb) {
                var alpha = parseInt(this.value, 10) / 100;
                previewThumb.style.opacity = alpha;
            }
        });

        bgSlider.addEventListener('change', function () {
            if (!window.monolithApi) return;
            window.monolithApi.get_background_config()
                .then(function (config) {
                    var slider = document.getElementById('bg-transparency-slider');
                    var transparency = slider ? parseInt(slider.value, 10) : 75;
                    var args = [config.type, config.image, config.color, config.gradient, transparency, config.themeMode, config.ctaButtonStyle, config.bgLayer];
                    return window.monolithApi.set_background_config.apply(null, args);
                })
                .then(function () {
                    loadBackgroundConfig();
                    showAppearanceStatus('Transparency updated.', false);
                })
                .catch(function () {});
        });
    }

    // --- Advanced Tab ---

    function loadAdvancedSettings() {
        if (!window.monolithApi) return;
        window.monolithApi.get_file_picker_type()
            .then(function (res) {
                _filePickerType = res || 'custom';
                updatePickerTypeUI(_filePickerType);
            })
            .catch(function () {});
    }

    function updatePickerTypeUI(type) {
        var btns = document.querySelectorAll('.picker-type-btn');
        btns.forEach(function (b) {
            b.classList.toggle('active', b.dataset.type === type);
        });
    }

    function savePickerType(type) {
        if (!window.monolithApi) return;
        _filePickerType = type;
        window.monolithApi.set_file_picker_type(type)
            .then(function () {
                showAdvancedStatus('File picker type saved.', false);
            })
            .catch(function () {
                showAdvancedStatus('Failed to save.', true);
            });
    }

    function showAdvancedStatus(msg, isError) {
        var el = document.getElementById('advanced-status');
        if (!el) return;
        el.textContent = msg;
        el.classList.add(isError ? 'error' : 'success', 'dismissible');
        if (_statusTimers['advanced-status']) { clearTimeout(_statusTimers['advanced-status']); }
        _statusTimers['advanced-status'] = setTimeout(function () {
            el.textContent = '';
            el.classList.remove('error', 'success', 'dismissible');
        }, 6000);
    }

    var pickerTypeBtns = document.querySelectorAll('.picker-type-btn');
    pickerTypeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var type = this.dataset.type;
            updatePickerTypeUI(type);
            savePickerType(type);
        });
    });

    // --- Startup Command ---
    var _startupConfig = { command: 'opencode', type: 'preset' };

    function getStartupLabel() {
        if (!_startupConfig) return 'TUI';
        if (_startupConfig.type === 'custom') return 'TUI';
        var cmd = _startupConfig.command || 'opencode';
        // Capitalize first letter
        return cmd.charAt(0).toUpperCase() + cmd.slice(1);
    }

    function updateMainUILabels() {
        var label = getStartupLabel();
        var agentLabel = document.getElementById('landing-agent-label');
        if (agentLabel) agentLabel.textContent = label;
    }

    function loadStartupConfig() {
        if (!window.monolithApi) return;
        window.monolithApi.get_startup_config()
            .then(function (res) {
                _startupConfig = res || { command: 'opencode', type: 'preset' };
                updateStartupTypeUI(_startupConfig.type, _startupConfig.command);
                updateMainUILabels();
                var customInput = document.getElementById('startup-custom-input');
                if (customInput) {
                    customInput.value = _startupConfig.type === 'custom' ? _startupConfig.command : '';
                }
            })
            .catch(function () {});
    }

    function updateStartupTypeUI(type, cmd) {
        var btns = document.querySelectorAll('.startup-type-btn');
        btns.forEach(function (b) {
            var isActive = false;
            if (b.dataset.type === 'preset') {
                isActive = type === 'preset' && b.dataset.cmd === cmd;
            } else {
                isActive = type === 'custom';
            }
            b.classList.toggle('active', isActive);
        });
        var customRow = document.getElementById('startup-custom-row');
        if (customRow) {
            customRow.style.display = type === 'custom' ? 'block' : 'none';
        }
    }

    function saveStartupConfig() {
        if (!window.monolithApi) return;
        var customInput = document.getElementById('startup-custom-input');
        var cmd = _startupConfig.type === 'custom' ? (customInput ? customInput.value.trim() : '') : _startupConfig.command;
        if (_startupConfig.type === 'custom' && !cmd) {
            showStartupStatus('Please enter a custom command.', true);
            return;
        }
        window.monolithApi.set_startup_config(cmd, _startupConfig.type)
            .then(function () {
                updateMainUILabels();
                var label = getStartupLabel();
                showStartupStatus('Startup command saved: ' + label, false);
            })
            .catch(function () {
                showStartupStatus('Failed to save.', true);
            });
    }

    function showStartupStatus(msg, isError) {
        var el = document.getElementById('startup-status');
        if (!el) return;
        el.textContent = msg;
        el.className = 'startup-status' + (isError ? ' error' : ' success');
        if (_statusTimers['startup-status']) { clearTimeout(_statusTimers['startup-status']); }
        _statusTimers['startup-status'] = setTimeout(function () {
            el.textContent = '';
            el.className = 'startup-status';
        }, 6000);
    }

    var startupTypeBtns = document.querySelectorAll('.startup-type-btn');
    startupTypeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var type = this.dataset.type;
            _startupConfig.type = type;
            if (type === 'preset' && this.dataset.cmd) {
                _startupConfig.command = this.dataset.cmd;
            }
            updateStartupTypeUI(type, _startupConfig.command);
            updateMainUILabels();
            if (type === 'custom') {
                var customInput = document.getElementById('startup-custom-input');
                if (customInput) customInput.focus();
            } else {
                saveStartupConfig();
            }
        });
    });

    var startupCustomInput = document.getElementById('startup-custom-input');
    if (startupCustomInput) {
        startupCustomInput.addEventListener('change', function () {
            saveStartupConfig();
        });
    }

    // --- Secondary Commands ---
    var _secondaryCommands = [];

    function loadSecondaryCommands() {
        if (!window.monolithApi) return;
        window.monolithApi.get_secondary_commands()
            .then(function (res) {
                _secondaryCommands = (res && res.commands) || [];
                renderSecondaryCommands();
            })
            .catch(function () {});
    }

    function renderSecondaryCommands() {
        var list = document.getElementById('secondary-commands-list');
        if (!list) return;
        list.innerHTML = '';
        if (_secondaryCommands.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'secondary-cmd-empty';
            empty.textContent = 'No secondary commands configured.';
            list.appendChild(empty);
            return;
        }
        _secondaryCommands.forEach(function (cmd, idx) {
            var item = document.createElement('div');
            item.className = 'secondary-cmd-item';

            var input = document.createElement('input');
            input.type = 'text';
            input.className = 'secondary-cmd-input';
            input.value = cmd.command || '';
            input.placeholder = 'Command to run...';
            input.addEventListener('change', function () {
                _secondaryCommands[idx].command = this.value;
                saveSecondaryCommands();
            });

            var modeSelect = document.createElement('select');
            modeSelect.className = 'secondary-cmd-mode';
            var optBefore = document.createElement('option');
            optBefore.value = 'before';
            optBefore.textContent = 'Before';
            var optParallel = document.createElement('option');
            optParallel.value = 'parallel';
            optParallel.textContent = 'Parallel';
            modeSelect.appendChild(optBefore);
            modeSelect.appendChild(optParallel);
            modeSelect.value = cmd.mode || 'before';
            modeSelect.addEventListener('change', function () {
                _secondaryCommands[idx].mode = this.value;
                saveSecondaryCommands();
            });

            var toggleLabel = document.createElement('label');
            toggleLabel.className = 'secondary-cmd-toggle';
            var toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = cmd.enabled !== false;
            toggleInput.addEventListener('change', function () {
                _secondaryCommands[idx].enabled = this.checked;
                saveSecondaryCommands();
            });
            var toggleTrack = document.createElement('span');
            toggleTrack.className = 'toggle-track';
            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(toggleTrack);

            var removeBtn = document.createElement('button');
            removeBtn.className = 'secondary-cmd-remove';
            removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            removeBtn.addEventListener('click', function () {
                _secondaryCommands.splice(idx, 1);
                renderSecondaryCommands();
                saveSecondaryCommands();
            });

            item.appendChild(input);
            item.appendChild(modeSelect);
            item.appendChild(toggleLabel);
            item.appendChild(removeBtn);
            list.appendChild(item);
        });
    }

    function saveSecondaryCommands() {
        if (!window.monolithApi) return;
        window.monolithApi.set_secondary_commands(_secondaryCommands)
            .then(function () {
                showSecondaryCmdStatus('Secondary commands saved.', false);
            })
            .catch(function () {
                showSecondaryCmdStatus('Failed to save.', true);
            });
    }

    function showSecondaryCmdStatus(msg, isError) {
        var el = document.getElementById('secondary-cmd-status');
        if (!el) return;
        el.textContent = msg;
        el.className = 'secondary-cmd-status' + (isError ? ' error' : ' success');
        if (_statusTimers['secondary-cmd-status']) { clearTimeout(_statusTimers['secondary-cmd-status']); }
        _statusTimers['secondary-cmd-status'] = setTimeout(function () {
            el.textContent = '';
            el.className = 'secondary-cmd-status';
        }, 6000);
    }

    var addSecondaryCmdBtn = document.getElementById('add-secondary-cmd-btn');
    if (addSecondaryCmdBtn) {
        addSecondaryCmdBtn.addEventListener('click', function () {
            _secondaryCommands.push({ command: '', mode: 'before', enabled: true });
            renderSecondaryCommands();
            saveSecondaryCommands();
        });
    }

    // Load advanced settings on init
    loadAdvancedSettings();
    loadStartupConfig();
    loadSecondaryCommands();

    // --- Shortcuts Tab ---
    var shortcutEditMode = document.getElementById('shortcut-edit-mode');
    var shortcutEditName = document.getElementById('shortcut-edit-name');
    var shortcutEditPreview = document.getElementById('shortcut-edit-preview');
    var shortcutEditSave = document.getElementById('shortcut-edit-save');
    var shortcutEditCancel = document.getElementById('shortcut-edit-cancel');
    var shortcutEditError = document.getElementById('shortcut-edit-error');
    var _editingShortcutKey = null;
    var _editingShortcutKeys = { ctrl: false, shift: false, alt: false, meta: false, key: '' };

    // Click on current shortcut to edit
    var shortcutCurrents = document.querySelectorAll('.shortcut-current');
    shortcutCurrents.forEach(function (el) {
        el.addEventListener('click', function () {
            var key = el.id.replace('shortcut-', '');
            startEditingShortcut(key);
        });
    });

    // Reset buttons
    var resetBtns = document.querySelectorAll('.shortcut-reset-btn');
    resetBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var key = btn.dataset.key;
            resetShortcut(key, function () {
                renderShortcutUI();
                updateKbdHint();
                showShortcutsStatus('Reset to default', false);
            });
        });
    });

    function startEditingShortcut(key) {
        _editingShortcutKey = key;
        _editingShortcutKeys = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
        if (shortcutEditMode) shortcutEditMode.style.display = '';
        if (shortcutEditName) shortcutEditName.textContent = key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        if (shortcutEditPreview) shortcutEditPreview.textContent = 'Press keys...';
        if (shortcutEditError) shortcutEditError.textContent = '';
    }

    function stopEditingShortcut() {
        _editingShortcutKey = null;
        if (shortcutEditMode) shortcutEditMode.style.display = 'none';
    }

    if (shortcutEditCancel) {
        shortcutEditCancel.addEventListener('click', stopEditingShortcut);
    }

    if (shortcutEditSave) {
        shortcutEditSave.addEventListener('click', function () {
            if (!_editingShortcutKey || !_editingShortcutKeys.key) return;
            var parts = [];
            if (_editingShortcutKeys.ctrl) parts.push('Ctrl');
            if (_editingShortcutKeys.alt) parts.push('Alt');
            if (_editingShortcutKeys.shift) parts.push('Shift');
            if (_editingShortcutKeys.meta) parts.push('Meta');
            if (_editingShortcutKeys.key) parts.push(_editingShortcutKeys.key);
            if (parts.length < 2) {
                if (shortcutEditError) shortcutEditError.textContent = 'Must include at least one modifier (Ctrl/Alt/Shift)';
                return;
            }
            var newShortcut = parts.join('+');
            // Check for conflicts
            for (var k in _shortcuts) {
                if (k !== _editingShortcutKey && _shortcuts[k] === newShortcut) {
                    if (shortcutEditError) shortcutEditError.textContent = 'Conflicts with ' + k.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
                    return;
                }
            }
            _shortcuts[_editingShortcutKey] = newShortcut;
            saveShortcuts(function () {
                renderShortcutUI();
                updateKbdHint();
                stopEditingShortcut();
                showShortcutsStatus('Shortcut updated', false);
            });
        });
    }

    // Capture keys while in edit mode
    document.addEventListener('keydown', function (e) {
        if (!_editingShortcutKey || !shortcutEditMode || shortcutEditMode.style.display === 'none') return;
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') { stopEditingShortcut(); return; }

        _editingShortcutKeys.ctrl = e.ctrlKey;
        _editingShortcutKeys.shift = e.shiftKey;
        _editingShortcutKeys.alt = e.altKey;
        _editingShortcutKeys.meta = e.metaKey;

        var key = e.key;
        if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') {
            // Modifier only, don't set key yet
        } else {
            if (key === ' ') key = 'Space';
            else if (key === ',') key = 'Comma';
            else if (key === '.') key = 'Period';
            else if (key.length === 1) key = key.toUpperCase();
            else key = key.charAt(0).toUpperCase() + key.slice(1);
            _editingShortcutKeys.key = key;
        }

        // Build display string
        var parts = [];
        if (_editingShortcutKeys.ctrl) parts.push('Ctrl');
        if (_editingShortcutKeys.alt) parts.push('Alt');
        if (_editingShortcutKeys.shift) parts.push('Shift');
        if (_editingShortcutKeys.meta) parts.push('Meta');
        if (_editingShortcutKeys.key) parts.push(_editingShortcutKeys.key);
        if (shortcutEditPreview) shortcutEditPreview.textContent = parts.length > 0 ? parts.join(' + ') : 'Press keys...';

        if (shortcutEditError) shortcutEditError.textContent = '';
    }, true);

    function showShortcutsStatus(msg, isError) {
        var el = document.getElementById('shortcuts-status');
        if (!el) return;
        el.textContent = msg;
        el.className = 'shortcuts-status ' + (isError ? 'error' : 'success') + ' dismissible';
        setTimeout(function () {
            el.textContent = '';
            el.className = 'shortcuts-status';
        }, 6000);
    }

    // Click status to dismiss
    var shortcutsStatusEl = document.getElementById('shortcuts-status');
    if (shortcutsStatusEl) {
        shortcutsStatusEl.addEventListener('click', function () {
            shortcutsStatusEl.textContent = '';
            shortcutsStatusEl.className = 'shortcuts-status';
        });
    }

    // --- Show Terminal View ---
    function showTerminal(dir) {
        setCurrentView('terminal');
        _currentLaunchDir = dir;
        if (_terminalRunning && window.monolithApi) {
            window.monolithApi.terminate_terminal('main');
        }
        _terminalRunning = false;
        if (landing) landing.classList.add('hidden');
        if (settingsPage) settingsPage.classList.remove('active');
        if (terminalView) terminalView.classList.add('active');
        initTerminal(dir);
        loadBackgroundConfig();
        if (typeof window.SidebarManager !== 'undefined') {
            window.SidebarManager.show();
            setTimeout(function () {
                window.SidebarManager.restorePanelState();
            }, 200);
        }
    }

    // --- Back to Landing ---
    function cleanupTerminalDomHandlers() {
        if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }
        if (_resizeHandler) { window.removeEventListener('resize', _resizeHandler); _resizeHandler = null; }
        if (_contextMenuHandler) { terminalContainer.removeEventListener('contextmenu', _contextMenuHandler); _contextMenuHandler = null; }
    }

    function backToLanding() {
        setCurrentView('landing');
        if (typeof window.SidebarManager !== 'undefined') {
            window.SidebarManager.terminateCmdPanel();
            window.SidebarManager.hide();
        }
        if (window.monolithApi) {
            window.monolithApi.terminate_terminal('main').catch(function () {});
        }
        if (settingsPage) settingsPage.classList.remove('active');
        if (terminalView) terminalView.classList.remove('active');
        if (landing) landing.classList.remove('hidden');
        if (term) {
            try { term.dispose(); } catch (e) {}
            term = null;
            fitAddon = null;
            webglAddon = null;
        }
        terminalContainer.innerHTML = '';
        cleanupTerminalDomHandlers();
        var existingGif = document.getElementById('bg-gif-img');
        if (existingGif) existingGif.remove();
        var terminalGif = document.getElementById('terminal-bg-gif-img');
        if (terminalGif) terminalGif.remove();
        _terminalRunning = false;
        _panelRunning = false;
    }

    var terminalBackBtn = document.getElementById('terminal-back-btn');
    if (terminalBackBtn) {
        terminalBackBtn.addEventListener('click', function () {
            if (_terminalRunning) {
                showConfirm('Return to Launcher', 'Return to launcher? The current session will be terminated.')
                    .then(function () { backToLanding(); })
                    .catch(function () {});
            } else {
                backToLanding();
            }
        });
    }




    // --- Terminal Setup ---
    function initTerminal(dir) {
        if (!terminalContainer) return;

        cleanupTerminalDomHandlers();

        // Dispose existing terminal and listeners before creating a new one
        if (term) {
            try { term.dispose(); } catch (e) { console.error('Error disposing term:', e); }
            term = null;
            webglAddon = null;
        }
        if (fitAddon) {
            fitAddon = null;
        }
        terminalContainer.innerHTML = '';

        if (typeof Terminal === 'undefined') {
            terminalContainer.innerHTML = '<div style="color:#c0c0c0;padding:20px;font-family:monospace;">Error: Terminal library failed to load.</div>';
            return;
        }

        var initBgConfig = { type: _bgType, bgLayer: _bgLayer };
        var terminalBg = _bgLayer === 'overlay' ? '#000000' : computeTerminalBg(initBgConfig);
        var terminalBlack = _bgLayer === 'overlay' ? '#000000' : (_bgType !== 'none' ? 'rgba(10, 10, 10, 0)' : '#0a0a0a');
        var isLight = document.body.classList.contains('light-mode') || document.body.classList.contains('adaptive-light');
        var initTheme = isLight ? getTerminalLightTheme() : getTerminalDarkTheme();
        initTheme.background = terminalBg;
        initTheme.black = terminalBlack;
        term = new Terminal({
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
            windowsMode: true,
            macOptionIsMeta: true,
            macOptionClickForcesSelection: true,
            minimumContrastRatio: 1,
            fastScrollModifier: 'alt',
            fastScrollSensitivity: 5,
            scrollOnUserInput: true
        });

        term.open(terminalContainer);
        term.focus();

        if (typeof FitAddon !== 'undefined') {
            fitAddon = new FitAddon.FitAddon();
            term.loadAddon(fitAddon);
        }

        requestAnimationFrame(function() {
            if (fitAddon) fitAddon.fit();
            window.monolithApi.start_terminal('main', dir, true, null, term.cols, term.rows)
                .then((result) => {
                    if (!result || !result.success) {
                        term.writeln('');
                        term.writeln('Failed to start ' + getStartupLabel() + '. ' + (result && result.error ? result.error : 'Check that it is installed and in your PATH.'));
                    } else {
                        _terminalRunning = true;
                        if (result.generation) {
                            _sessionGeneration['main'] = result.generation;
                        }
                    }
                })
                .catch((err) => {
                    term.writeln('');
                    term.writeln('Error starting ' + getStartupLabel() + ': ' + err);
                });
        });

        syncTerminalWebglRenderer(initBgConfig);

        term.onScroll(function() {
            term.refresh(0, term.rows - 1);
        });

        // --- Keyboard copy/paste shortcuts ---
        term.attachCustomKeyEventHandler((e) => {
            if (e.ctrlKey && !e.shiftKey && e.code === 'KeyC' && term.hasSelection()) {
                navigator.clipboard.writeText(term.getSelection()).catch(() => {});
                term.clearSelection();
                return false;
            }
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
                if (term.hasSelection()) {
                    navigator.clipboard.writeText(term.getSelection()).catch(() => {});
                    term.clearSelection();
                }
                return false;
            }
            if ((e.ctrlKey && e.code === 'KeyV') || (e.shiftKey && e.code === 'Insert')) {
                return false;
            }
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyW') {
                if (_terminalRunning) {
                    showConfirm('Return to Launcher', 'Return to launcher? The current session will be terminated.')
                        .then(function() { backToLanding(); })
                        .catch(function() {});
                } else {
                    backToLanding();
                }
                return false;
            }
            return true;
        });

        // --- Paste: DOM event avoids clipboard permission prompt & double-paste ---
        term.element.addEventListener('paste', (e) => {
            const text = e.clipboardData.getData('text');
            if (text && window.monolithApi) {
                e.preventDefault();
                e.stopPropagation();
                try { window.monolithApi.send_input('main', text); } catch (err) {}
            }
        });

        // --- Right-click copy context menu ---
        _contextMenuHandler = function (e) {
            e.preventDefault();
            var selection = term.getSelection();
            if (selection) {
                navigator.clipboard.writeText(selection).catch(function () {});
                var indicator = document.createElement('div');
                indicator.textContent = 'Copied!';
                indicator.style.cssText = 'position:fixed;top:' + e.clientY + 'px;left:' + e.clientX + 'px;background:#4a4a4a;color:#e0e0e0;padding:4px 8px;border-radius:4px;font-size:12px;font-family:monospace;pointer-events:none;z-index:9999;';
                document.body.appendChild(indicator);
                setTimeout(function () { indicator.remove(); }, 800);
            } else {
                navigator.clipboard.readText().then(function (text) {
                    if (window.monolithApi && text) window.monolithApi.send_input(text);
                }).catch(function () {});
            }
        };
        terminalContainer.addEventListener('contextmenu', _contextMenuHandler);

        function syncSize() {
            if (!term || !fitAddon) return;
            var el = term.element || terminalContainer;
            if (!el || el.offsetParent === null) return;
            var prevCols = term.cols;
            var prevRows = term.rows;
            fitAddon.fit();
            if (window.monolithApi && (term.cols !== prevCols || term.rows !== prevRows)) {
                try {
                    window.monolithApi.resize_terminal('main', term.cols, term.rows);
                } catch (e) {}
            }
        }

        var resizeTimeout;
        var _resizeListener = function () {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(syncSize, 100);
        };
        window.addEventListener('resize', _resizeListener);
        _resizeHandler = _resizeListener;

        if (typeof ResizeObserver !== 'undefined') {
            var resizeTimeout = null;
            _resizeObserver = new ResizeObserver(function () {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(syncSize, 100);
            });
            _resizeObserver.observe(terminalContainer);
        } else {
            var pollTimer = setInterval(function () {
                if (terminalContainer.offsetWidth > 0 && terminalContainer.offsetHeight > 0) {
                    syncSize();
                    clearInterval(pollTimer);
                }
            }, 50);
            setTimeout(function () { clearInterval(pollTimer); syncSize(); }, 3000);
        }

        var firstOutput = true;
        var _exitTimer = null;
        window.writeToTerm = (data, eof, sessionId, generation) => {
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
            if (sessionId === 'main') {
                if (term) {
                    if (eof) {
                        term.write(data);
                        var exitBanner = document.createElement('div');
                        exitBanner.style.cssText = 'position:absolute;bottom:40px;left:50%;transform:translateX(-50%);background:rgba(30,30,30,0.9);color:#c0c0c0;padding:8px 16px;border-radius:6px;font-family:monospace;font-size:13px;z-index:101;border:1px solid rgba(255,255,255,0.1);backdrop-filter:blur(4px);pointer-events:auto;cursor:pointer;';
                        exitBanner.textContent = 'Session ended \u2014 returning to launcher in 5s (click to stay)';
                        if (terminalView) terminalView.appendChild(exitBanner);
                        var countdown = 5;
                        var cancelled = false;
                        exitBanner.addEventListener('click', function () {
                            cancelled = true;
                            if (exitBanner.parentNode) exitBanner.remove();
                        });
                        var countdownInterval = setInterval(function () {
                            if (cancelled) { clearInterval(countdownInterval); return; }
                            countdown--;
                            if (countdown <= 0) {
                                clearInterval(countdownInterval);
                                if (exitBanner.parentNode) exitBanner.remove();
                                backToLanding();
                            } else {
                                exitBanner.textContent = 'Session ended \u2014 returning to launcher in ' + countdown + 's (click to stay)';
                            }
                        }, 1000);
                        if (_exitTimer) { clearTimeout(_exitTimer); _exitTimer = null; }
                        _exitTimer = setTimeout(function () {
                            if (!cancelled) backToLanding();
                        }, 5000);
                        return;
                    }
                    term.write(data);
                    if (firstOutput) {
                        firstOutput = false;
                        setTimeout(syncSize, 1500);
                    }
                    if (_exitTimer) { clearTimeout(_exitTimer); _exitTimer = null; }
                    if (typeof data === 'string' && data.indexOf('[session ended]') !== -1) {
                        _exitTimer = setTimeout(function () {
                            backToLanding();
                        }, 5000);
                    }
                }
            } else if (sessionId === 'panel') {
                if (typeof window.SidebarManager !== 'undefined') {
                    if (eof) {
                        window.SidebarManager.terminateCmdPanel();
                    } else if (data) {
                        window.SidebarManager.writeToPanel(data);
                    }
                }
            }
        };

        term.onData((data) => {
            if (window.monolithApi) {
                try {
                    window.monolithApi.send_input('main', data);
                } catch (e) {}
            }
        });

        applyTerminalBg();

        term.writeln('');
        term.writeln('Monoloth Terminal');
        term.writeln('Directory: ' + dir);
        term.writeln('Starting ' + getStartupLabel() + '...');
        term.writeln('');

        if (!window.monolithApi) {
            term.writeln('Error: Bridge not available.');
            return;
        }
    }

    // --- Command Palette (Ctrl+P) ---
    var commands = [
        { id: 'back', category: 'navigation', label: 'Back to Launcher', action: function () { backToLanding(); } },
        { id: 'last-dir', category: 'navigation', label: 'Open Last Directory', action: function () {
            backToLanding();
            setTimeout(function () {
                if (window.monolithApi) {
                    window.monolithApi.get_last_directory().then(function (res) {
                        if (res && res.success && res.path) showTerminal(res.path);
                    });
                }
            }, 200);
        }},
        { id: 'settings', category: 'configuration', label: 'Settings', action: function () { showSettings(); }, shortcutKey: 'settings' },
        { id: 'appearance', category: 'configuration', label: 'Appearance Settings', action: function () { openAppearanceSettings(); } },
        { id: 'history', category: 'configuration', label: 'History', action: function () { openHistorySettings(); } },
        { id: 'profiles', category: 'configuration', label: 'Switch Profile', action: function () { openProfileSwitcher(); } },
    ];

    var paletteEl = document.createElement('div');
    paletteEl.id = 'command-palette';
    paletteEl.className = 'command-palette';
    paletteEl.innerHTML = '<div class="command-palette-overlay"></div><div class="command-palette-modal"><input type="text" id="command-palette-input" class="command-palette-input" placeholder="Type a command..." spellcheck="false"><div id="command-palette-list" class="command-palette-list"></div></div>';
    document.body.appendChild(paletteEl);

    var paletteInput = document.getElementById('command-palette-input');
    var paletteList = document.getElementById('command-palette-list');

    paletteEl.addEventListener('click', function (e) {
        if (e.target === paletteEl) {
            closePalette();
        }
    });

    function openPalette() {
        if (!paletteEl || !paletteInput || !paletteList) return;
        paletteEl.classList.add('active');
        paletteInput.value = '';
        renderCommands(commands);
        saveFocus();
        trapFocus(paletteEl);
        paletteInput.focus();
    }

    function closePalette() {
        if (!paletteEl) return;
        releaseFocus();
        paletteEl.classList.remove('active');
    }

    function renderCommands(list) {
        if (!paletteList) return;
        paletteList.innerHTML = '';
        if (list.length === 0) {
            var emptyItem = document.createElement('div');
            emptyItem.className = 'command-palette-item command-palette-empty';
            emptyItem.textContent = 'No matching commands';
            paletteList.appendChild(emptyItem);
            return;
        }

        var cmdIdx = 0;
        var categories = {};
        list.forEach(function (cmd) {
            if (!categories[cmd.category]) categories[cmd.category] = [];
            categories[cmd.category].push(cmd);
        });

        var categoryLabels = { navigation: 'NAVIGATION', configuration: 'CONFIGURATION' };

        Object.keys(categories).forEach(function (cat) {
            var header = document.createElement('div');
            header.className = 'command-palette-category';
            header.textContent = categoryLabels[cat] || cat.toUpperCase();
            paletteList.appendChild(header);

            categories[cat].forEach(function (cmd) {
                var item = document.createElement('div');
                item.className = 'command-palette-item' + (cmdIdx === 0 ? ' selected' : '');
                item.dataset.cmdIndex = cmdIdx;

                var labelSpan = document.createElement('span');
                labelSpan.textContent = cmd.label;
                item.appendChild(labelSpan);

                if (cmd.shortcutKey) {
                    var shortcutSpan = document.createElement('span');
                    shortcutSpan.className = 'command-palette-shortcut';
                    shortcutSpan.textContent = formatShortcutForDisplay(getShortcut(cmd.shortcutKey));
                    item.appendChild(shortcutSpan);
                }

                item.addEventListener('click', function () {
                    closePalette();
                    cmd.action();
                });
                paletteList.appendChild(item);
                cmdIdx++;
            });
        });
    }

    function filterCommands(query) {
        var filtered = commands.filter(function (cmd) {
            return cmd.label.toLowerCase().indexOf(query.toLowerCase()) !== -1;
        });
        renderCommands(filtered);
    }

    // Keyboard shortcuts (customizable)
    document.addEventListener('keydown', function (e) {
        // Don't trigger shortcuts while editing a shortcut
        if (_editingShortcutKey && shortcutEditMode && shortcutEditMode.style.display !== 'none') return;

        // Command palette shortcut
        if (shortcutMatches(e, getShortcut('command_palette'))) {
            e.preventDefault();
            if (paletteEl && paletteEl.classList.contains('active')) {
                closePalette();
            } else {
                openPalette();
            }
        }
        // Settings shortcut
        if (shortcutMatches(e, getShortcut('settings'))) {
            e.preventDefault();
            if (settingsPage && settingsPage.classList.contains('active')) {
                hideSettings();
            } else {
                showSettings();
            }
        }
        if (e.code === 'Escape' && paletteEl && paletteEl.classList.contains('active')) {
            closePalette();
        }
        if (e.code === 'Escape' && settingsPage && settingsPage.classList.contains('active') && !_editingShortcutKey) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            hideSettings();
        }
        if (e.code === 'Escape' && profileSwitcher && profileSwitcher.classList.contains('active')) {
            closeProfileSwitcher();
        }
        if (e.code === 'Escape' && idEl && idEl.classList.contains('active')) {
            closeDialog();
        }
        if (paletteEl && paletteEl.classList.contains('active')) {
            if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
                e.preventDefault();
                var items = paletteList.querySelectorAll('.command-palette-item');
                var sel = paletteList.querySelector('.command-palette-item.selected');
                var idx = Array.prototype.indexOf.call(items, sel);
                if (e.code === 'ArrowDown') idx = Math.min(idx + 1, items.length - 1);
                if (e.code === 'ArrowUp') idx = Math.max(idx - 1, 0);
                items.forEach(function (it) { it.classList.remove('selected'); });
                if (items[idx]) items[idx].classList.add('selected');
            }
            if (e.code === 'Enter') {
                e.preventDefault();
                var sel = paletteList.querySelector('.command-palette-item.selected');
                if (sel) { closePalette(); sel.click(); }
            }
        }
        if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
            if (settingsPage && settingsPage.classList.contains('active') && !_editingShortcutKey) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
                e.preventDefault();
                var settingsTabs = document.querySelectorAll('.settings-tab');
                var activeTab = document.querySelector('.settings-tab.active');
                var currentIdx = Array.prototype.indexOf.call(settingsTabs, activeTab);
                if (currentIdx === -1) return;
                var nextIdx = e.code === 'ArrowRight' ? Math.min(currentIdx + 1, settingsTabs.length - 1) : Math.max(currentIdx - 1, 0);
                switchTab(settingsTabs[nextIdx].dataset.tab);
            }
        }

        // Tab shortcuts (hardcoded, per spec)
        if (e.ctrlKey && window.TabManager) {
            if (e.shiftKey && (e.key === 'T' || e.key === 't')) {
                e.preventDefault();
                window.TabManager.createTab(null);
            } else if (e.shiftKey && (e.key === 'W' || e.key === 'w')) {
                e.preventDefault();
                var activeId = window.TabManager.getActiveTabId();
                if (activeId) window.TabManager.closeTab(activeId);
            } else if (e.key === 'PageUp' || e.key === 'PageDown') {
                e.preventDefault();
                if (window.monolithApi && typeof window.monolithApi.getTabsConfig === 'function') {
                    window.monolithApi.getTabsConfig().then(function (cfg) {
                        if (!cfg || !cfg.tabs || cfg.tabs.length === 0) return;
                        var id = window.TabManager.getActiveTabId();
                        var idx = -1;
                        for (var i = 0; i < cfg.tabs.length; i++) {
                            if (cfg.tabs[i].id === id) { idx = i; break; }
                        }
                        if (idx < 0) idx = 0;
                        var nextIdx = e.key === 'PageUp'
                            ? (idx - 1 + cfg.tabs.length) % cfg.tabs.length
                            : (idx + 1) % cfg.tabs.length;
                        window.TabManager.switchTab(cfg.tabs[nextIdx].id);
                    });
                }
            } else if (/^[1-9]$/.test(e.key)) {
                e.preventDefault();
                var n = parseInt(e.key, 10) - 1;
                if (window.monolithApi && typeof window.monolithApi.getTabsConfig === 'function') {
                    window.monolithApi.getTabsConfig().then(function (cfg) {
                        if (cfg && cfg.tabs && cfg.tabs[n]) {
                            window.TabManager.switchTab(cfg.tabs[n].id);
                        }
                    });
                }
            }
        }
    });

    if (paletteInput) {
        paletteInput.addEventListener('input', function () { filterCommands(this.value); });
    }

    if (paletteEl) {
        paletteEl.addEventListener('click', function (e) {
            if (e.target === paletteEl || e.target.classList.contains('command-palette-overlay')) {
                closePalette();
            }
        });
    }

    function switchTab(name) {
        var tabs = document.querySelectorAll('.settings-tab');
        var panels = document.querySelectorAll('.tab-panel');
        tabs.forEach(function (t) { t.classList.remove('active'); });
        panels.forEach(function (p) { p.classList.remove('active'); });
        var targetTab = document.querySelector('.settings-tab[data-tab="' + name + '"]');
        var targetPanel = document.getElementById('tab-' + name);
        if (targetTab) targetTab.classList.add('active');
        if (targetPanel) targetPanel.classList.add('active');
        loadSettingsTab(name);
    }

    function openAppearanceSettings() {
        showSettings();
        switchTab('appearance');
    }

    function openHistorySettings() {
        showSettings();
        switchTab('history');
    }

    // ================================================================
    // History Tab
    // ================================================================

    function loadHistoryTab() {
        if (!window.monolithApi) return;
        window.monolithApi.get_history_data()
            .then(function(res) {
                if (res.success && res.data) {
                    renderHistoryUI(res.data);
                }
            })
            .catch(function() {});
    }

    function renderHistoryUI(data) {
        // Toggle state
        var toggleContainer = document.getElementById('history-toggle');
        if (toggleContainer) {
            toggleContainer.querySelectorAll('.history-toggle-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.enabled === String(data.enabled));
            });
        }

        // Retention state
        var retentionContainer = document.getElementById('retention-selector');
        if (retentionContainer) {
            retentionContainer.querySelectorAll('.retention-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.retention === data.retention);
            });
        }

        // Ranking display
        var rankingEl = document.getElementById('history-ranking');
        if (!rankingEl) return;

        if (!data.sessions || data.sessions.length === 0) {
            rankingEl.innerHTML = '<span class="history-empty">No history data yet. Start a session to begin tracking.</span>';
            return;
        }

        // Group sessions by tool (command)
        var toolMap = {};
        var sessions = data.sessions;

        for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            var tool = s.command || s.profile || 'Unknown';
            if (!toolMap[tool]) {
                toolMap[tool] = {
                    totalSeconds: 0,
                    daily: {} // date -> seconds
                };
            }
            var startTs = parseISO(s.start_time);
            var endTs = s.end_time ? parseISO(s.end_time) : Date.now() / 1000;
            var duration = Math.max(0, endTs - startTs);
            toolMap[tool].totalSeconds += duration;

            var date = s.start_time.substring(0, 10); // YYYY-MM-DD
            if (!toolMap[tool].daily[date]) {
                toolMap[tool].daily[date] = 0;
            }
            toolMap[tool].daily[date] += duration;
        }

        // Sort tools by total time (descending)
        var sortedTools = Object.keys(toolMap).sort(function(a, b) {
            return toolMap[b].totalSeconds - toolMap[a].totalSeconds;
        });

        var html = '';

        for (var t = 0; t < sortedTools.length; t++) {
            var tool = sortedTools[t];
            var info = toolMap[tool];
            var totalStr = formatDuration(info.totalSeconds);

            html += '<div class="history-tool-card">';
            html += '<div class="history-tool-header">';
            html += '<span class="history-tool-name">' + escapeHtml(tool) + '</span>';
            html += '<span class="history-tool-total">' + totalStr + ' total</span>';
            html += '</div>';

            // Daily breakdown
            var days = Object.keys(info.daily).sort();
            if (days.length > 0) {
                html += '<div class="history-daily-breakdown">';
                for (var d = 0; d < days.length; d++) {
                    var day = days[d];
                    var dayStr = formatDuration(info.daily[day]);
                    html += '<div class="history-daily-row">';
                    html += '<span class="history-daily-date">' + day + '</span>';
                    html += '<span class="history-daily-time">' + dayStr + '</span>';
                    html += '</div>';
                }
                html += '</div>';
            }

            html += '</div>';
        }

        rankingEl.innerHTML = html;
    }

    function parseISO(iso) {
        if (!iso || iso.length < 19) return 0;
        var year = parseInt(iso.substring(0, 4), 10);
        var month = parseInt(iso.substring(5, 7), 10) - 1;
        var day = parseInt(iso.substring(8, 10), 10);
        var hour = parseInt(iso.substring(11, 13), 10);
        var min = parseInt(iso.substring(14, 16), 10);
        var sec = parseInt(iso.substring(17, 19), 10);
        return Date.UTC(year, month, day, hour, min, sec) / 1000;
    }

    function formatDuration(totalSeconds) {
        var seconds = Math.round(totalSeconds);
        if (seconds < 60) return seconds + 's';
        if (seconds < 3600) {
            var m = Math.floor(seconds / 60);
            var s = seconds % 60;
            return m + 'm ' + s + 's';
        }
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        if (h < 24) return h + 'h ' + m + 'm';
        var d = Math.floor(h / 24);
        h = h % 24;
        return d + 'd ' + h + 'h ' + m + 'm';
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ================================================================
    // Custom File / Folder Picker
    // ================================================================

    var fpEl = document.getElementById('file-picker');
    var fpTitle = document.getElementById('fp-title');
    var fpClose = document.getElementById('fp-close');
    var fpBack = document.getElementById('fp-back-btn');
    var fpForward = document.getElementById('fp-forward-btn');
    var fpUp = document.getElementById('fp-up-btn');
    var fpRefresh = document.getElementById('fp-refresh-btn');
    var fpPathBar = document.getElementById('fp-path-bar');
    var fpPathInput = document.getElementById('fp-path-input');
    var fpBreadcrumb = document.getElementById('fp-breadcrumb');
    var fpFileList = document.getElementById('fp-file-list');
    var fpEmpty = document.getElementById('fp-empty');
    var fpLoading = document.getElementById('fp-loading');
    var fpFilename = document.getElementById('fp-filename');
    var fpFilter = document.getElementById('fp-filter');
    var fpOk = document.getElementById('fp-ok-btn');
    var fpCancel = document.getElementById('fp-cancel-btn');
    var fpPreviewPane = document.getElementById('fp-preview-pane');
    var fpPreviewImg = document.getElementById('fp-preview-img');
    var fpPreviewInfo = document.getElementById('fp-preview-info');
    var fpDrivesList = document.getElementById('fp-drives-list');

    var fpState = {
        mode: 'file',
        currentPath: '',
        history: [],
        historyIndex: -1,
        selectedPath: '',
        resolve: null,
        reject: null,
        filter: '*.*',
        filterExts: [],
        _listings: {},
        pickerId: '',
    };

    var QUICK_PATHS = {
        desktop:   '%USERPROFILE%\\Desktop',
        documents: '%USERPROFILE%\\Documents',
        downloads: '%USERPROFILE%\\Downloads',
        pictures:  '%USERPROFILE%\\Pictures',
    };

    var _lastDirectories = {};
    var _pickerLastDirsLoaded = false;

    function _loadPickerLastDirs() {
        if (!window.monolithApi) return;
        if (_pickerLastDirsLoaded) return;
        _pickerLastDirsLoaded = true;
        ['bg', 'choose'].forEach(function (id) {
            window.monolithApi.get_picker_last_dir(id)
                .then(function (res) {
                    if (res && res.success && res.path) _lastDirectories[id] = res.path;
                })
                .catch(function () {});
        });
    }

    function _getLastDirectory(pickerId) {
        return _lastDirectories[pickerId] || '';
    }

    function _setLastDirectory(pickerId, path) {
        if (!path) return;
        var dir = path;
        if (path.indexOf('\\') !== -1) {
            dir = path.substring(0, path.lastIndexOf('\\'));
        } else if (path.indexOf('/') !== -1) {
            dir = path.substring(0, path.lastIndexOf('/'));
        }
        if (dir) {
            _lastDirectories[pickerId] = dir;
            if (window.monolithApi) {
                window.monolithApi.set_picker_last_dir(pickerId, dir).catch(function () {});
            }
        }
    }

    function openFilePicker(opts) {
        console.log('[Monoloth][Picker] openFilePicker called with opts:', JSON.stringify(opts));
        if (!fpEl) { console.error('[Monoloth][Picker] fpEl is null'); return Promise.reject(new Error('Picker element not found')); }
        if (!window.monolithApi) { console.error('[Monoloth][Picker] monolithApi not available'); return Promise.reject(new Error('Picker not available')); }

        _loadPickerLastDirs();

        fpState.mode = opts.mode || 'file';
        fpState.history = [];
        fpState.historyIndex = -1;
        fpState.selectedPath = '';
        fpState.filterExts = [];
        fpState._listings = {};
        fpState.pickerId = opts.id || '';

        fpTitle.textContent = opts.title || (fpState.mode === 'folder' ? 'Choose Directory' : 'Choose File');
        buildFilterSelect(opts.filter || '*.*');
        fpEl.classList.add('active');
        saveFocus();
        trapFocus(fpEl);
        fpOk.textContent = fpState.mode === 'folder' ? 'Select Folder' : 'Open';

        var startPath = opts.startPath || _getLastDirectory(fpState.pickerId) || 'C:\\';
        console.log('[Monoloth][Picker] startPath resolved to:', startPath);
        navigateToPath(startPath);

        return new Promise(function (resolve, reject) {
            fpState.resolve = resolve;
            fpState.reject = reject;
        });
    }

    function buildFilterSelect(filterStr) {
        if (!fpFilter) return;
        fpFilter.innerHTML = '';
        fpFilter.style.display = '';
        if (filterStr === '*.*' || !filterStr) {
            var opt = document.createElement('option');
            opt.value = '*.*';
            opt.textContent = 'All Files (*.*)';
            fpFilter.appendChild(opt);
            fpFilter.value = '*.*';
            fpState.filter = '*.*';
            fpState.filterExts = [];
            return;
        }
        var parts = filterStr.split('|');
        for (var i = 0; i < parts.length; i += 2) {
            var label = parts[i] || 'Files';
            var pattern = parts[i + 1] || '*.*';
            var opt = document.createElement('option');
            opt.value = pattern;
            opt.textContent = label + ' (' + pattern + ')';
            fpFilter.appendChild(opt);
        }
        if (fpFilter.options.length > 0) {
            fpFilter.selectedIndex = 0;
        } else {
            var def = document.createElement('option');
            def.value = '*.*';
            def.textContent = 'All Files (*.*)';
            fpFilter.appendChild(def);
            fpFilter.value = '*.*';
        }
        updateFilterExts();
    }

    function updateFilterExts() {
        var val = fpFilter ? fpFilter.value : '*.*';
        fpState.filter = val;
        fpState.filterExts = val === '*.*' ? [] : val.split(';').map(function (p) { return p.trim().toLowerCase(); });
    }

    function navigateToPath(path) {
        console.log('[Monoloth][Picker] navigateToPath called with path:', path);
        if (!path) { console.warn('[Monoloth][Picker] navigateToPath: empty path'); return; }
        showLoading(true);
        console.log('[Monoloth][Picker] Calling get_path_info for:', path);
        window.monolithApi.get_path_info(path).then(function (info) {
            console.log('[Monoloth][Picker] get_path_info returned:', JSON.stringify(info));
            if (!info || !info.success || !info.exists) {
                console.log('[Monoloth][Picker] Path does not exist or error:', info ? info.exists : 'null info');
                showLoading(false);
                if (!info || !info.success) {
                    showError('Access denied or network error');
                } else {
                    showError('Path not found');
                }
                return;
            }
            var target = info.isDir ? info.absolute : info.parent;
            console.log('[Monoloth][Picker] Navigating to:', target);
            doNavigate(target);
        }).catch(function (err) {
            console.error('[Monoloth][Picker] get_path_info error:', err);
            showLoading(false);
            showEmpty();
        });
    }

    function doNavigate(absPath) {
        if (!absPath) return;
        fpState.currentPath = absPath;

        if (fpState.historyIndex < fpState.history.length - 1) {
            fpState.history = fpState.history.slice(0, fpState.historyIndex + 1);
        }
        fpState.history.push(absPath);
        fpState.historyIndex = fpState.history.length - 1;
        updateNavButtons();
        loadDirectory(absPath);
    }

    function loadDirectory(path) {
        console.log('[Monoloth][Picker] loadDirectory called for:', path);
        showLoading(true);
        window.monolithApi.list_directory(path).then(function (result) {
            console.log('[Monoloth][Picker] list_directory returned:', JSON.stringify(result).substring(0, 300));
            showLoading(false);
            if (!result || !result.success) { console.warn('[Monoloth][Picker] list_directory failed'); showError('Access denied'); return; }
            if (!result.entries || result.entries.length === 0) { console.log('[Monoloth][Picker] Directory empty:', path); }
            fpState._listings[path] = result.entries;
            renderEntries(result.entries);
            renderBreadcrumb(path);
            clearPreview();
            fpState.selectedPath = '';
            fpFilename.value = '';
            fpOk.disabled = (fpState.mode !== 'folder');
        }).catch(function (err) {
            console.error('[Monoloth][Picker] list_directory error:', err);
            showLoading(false);
            showError('Access denied or network error');
        });
    }

    function renderEntries(entries) {
        if (!fpFileList) return;
        fpFileList.innerHTML = '';
        fpEmpty.style.display = 'none';

        var fe = fpState.filterExts;
        var displayed = [];
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e.isDir && fe.length > 0) {
                var match = false;
                for (var f = 0; f < fe.length; f++) {
                    if (e.name.toLowerCase().endsWith(fe[f].replace('*', ''))) { match = true; break; }
                }
                if (!match) continue;
            }
            displayed.push(e);
        }
        if (displayed.length === 0) { fpEmpty.style.display = 'flex'; return; }

        for (var j = 0; j < displayed.length; j++) {
            (function (entry) {
                var item = document.createElement('div');
                item.className = 'fp-file-item';
                item.dataset.name = entry.name;
                item.dataset.isDir = entry.isDir ? 'true' : 'false';

                var ico = getItemIcon(entry);
                var iconDiv = document.createElement('div');
                iconDiv.className = 'fp-item-icon ' + ico.cls;
                iconDiv.innerHTML = ico.svg;
                item.appendChild(iconDiv);

                var ns = document.createElement('span');
                ns.className = 'fp-item-name';
                ns.textContent = entry.name;
                item.appendChild(ns);

                var ds = document.createElement('span');
                ds.className = 'fp-item-date';
                ds.textContent = formatDate(entry.modified);
                item.appendChild(ds);

                var ss = document.createElement('span');
                ss.className = 'fp-item-size';
                ss.textContent = entry.isDir ? '\u2014' : formatSize(entry.size);
                item.appendChild(ss);

                item.addEventListener('click', function () { onItemClick(entry); });
                item.addEventListener('dblclick', function () {
                    if (entry.isDir) {
                        doNavigate(joinPath(fpState.currentPath, entry.name));
                    } else if (fpState.mode === 'file') {
                        onItemClick(entry);
                        if (fpOk && !fpOk.disabled) fpOk.click();
                    }
                });
                fpFileList.appendChild(item);
            })(displayed[j]);
        }
        loadDrives();
    }

    function getItemIcon(entry) {
        if (entry.isDir) return { cls: 'folder', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' };
        var ext = (entry.extension || '').toLowerCase();
        if ('.png.jpg.jpeg.gif.bmp.webp.svg.ico'.indexOf(ext) !== -1) return { cls: 'file-image', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' };
        if ('.js.py.html.css.json.xml.ts.jsx.tsx.yaml.yml.md.sh.bat.ps1.lua.rb.go.rs.c.cpp.h.java.kt.swift'.indexOf(ext) !== -1) return { cls: 'file-code', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>' };
        if ('.zip.rar.7z.tar.gz.bz2.xz.zst'.indexOf(ext) !== -1) return { cls: 'file-archive', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>' };
        return { cls: 'file', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' };
    }

    function joinPath(base, name) {
        return base.replace(/\\+$/, '') + '\\' + name;
    }

    function onItemClick(entry) {
        var items = fpFileList.querySelectorAll('.fp-file-item');
        var fullPath = joinPath(fpState.currentPath, entry.name);
        fpState.selectedPath = fullPath;
        for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle('selected', items[i].dataset.name === entry.name);
        }
        if (entry.isDir && fpState.mode === 'folder') {
            fpFilename.value = entry.name;
            fpOk.disabled = false;
            clearPreview();
        } else if (!entry.isDir) {
            fpFilename.value = entry.name;
            fpOk.disabled = (fpState.mode === 'folder');
            if (fpState.mode === 'file') showPreview(fullPath, entry); else clearPreview();
        } else {
            fpFilename.value = '';
            fpOk.disabled = (fpState.mode !== 'folder');
            clearPreview();
        }
    }

    function showPreview(filePath, entry) {
        if (!fpPreviewPane) return;
        var ext = (entry.extension || '').toLowerCase();
        if ('.png.jpg.jpeg.gif.bmp.webp.svg.ico'.indexOf(ext) === -1) { fpPreviewPane.style.display = 'none'; return; }
        fpPreviewPane.style.display = 'flex';
        window.monolithApi.get_file_preview(filePath).then(function (res) {
            if (res && res.success && res.dataUrl) {
                fpPreviewImg.src = res.dataUrl;
                fpPreviewImg.style.display = 'block';
                fpPreviewInfo.textContent = formatSize(entry.size) + ' | ' + ext.toUpperCase();
            } else { noPreview(); }
        }).catch(function () { noPreview(); });
        function noPreview() { fpPreviewImg.src = ''; fpPreviewImg.style.display = 'none'; fpPreviewInfo.textContent = 'Preview not available'; }
    }

    function clearPreview() {
        if (!fpPreviewPane) return;
        fpPreviewPane.style.display = 'none';
        if (fpPreviewImg) fpPreviewImg.src = '';
        if (fpPreviewInfo) fpPreviewInfo.textContent = '';
    }

    // Breadcrumb uses backslash separator to match path input
    function renderBreadcrumb(path) {
        if (!fpBreadcrumb) return;
        fpBreadcrumb.innerHTML = '';
        if (!path) return;
        if (fpPathInput) fpPathInput.value = path;
        var parts = path.split('\\').filter(Boolean);
        var acc = '';
        for (var i = 0; i < parts.length; i++) {
            if (i > 0) { var sp = document.createElement('span'); sp.className = 'fp-bc-sep'; sp.textContent = '\u203A'; fpBreadcrumb.appendChild(sp); }
            var seg = document.createElement('span');
            seg.className = 'fp-bc-segment' + (i === parts.length - 1 ? ' fp-bc-last' : '');
            seg.textContent = parts[i];
            if (i < parts.length - 1) (function (p) { seg.addEventListener('click', function (e) { e.stopPropagation(); doNavigate(p); }); })(acc + parts[i] + '\\');
            acc += parts[i] + '\\';
            fpBreadcrumb.appendChild(seg);
        }
    }

    function updateNavButtons() {
        if (fpBack) fpBack.disabled = fpState.historyIndex <= 0;
        if (fpForward) fpForward.disabled = fpState.historyIndex >= fpState.history.length - 1;
        if (fpUp) { fpUp.disabled = !fpState.currentPath || fpState.currentPath.replace(/\\+$/, '').length <= 2; }
    }

    function showLoading(s) {
        console.log('[Monoloth][Picker] showLoading:', s);
        if (!fpLoading) { console.warn('[Monoloth][Picker] fpLoading element missing'); return; }
        fpLoading.style.display = s ? 'flex' : 'none';
        if (fpFileList) fpFileList.style.display = s ? 'none' : '';
        if (fpEmpty) fpEmpty.style.display = 'none';
    }

    function showEmpty() {
        console.log('[Monoloth][Picker] showEmpty called');
        if (fpEmpty) fpEmpty.style.display = 'flex';
        if (fpEmpty) fpEmpty.querySelector('span').textContent = 'This folder is empty';
        if (fpFileList) fpFileList.innerHTML = '';
        if (fpLoading) fpLoading.style.display = 'none';
        if (fpBreadcrumb) fpBreadcrumb.innerHTML = '';
        clearPreview();
    }

    function showError(msg) {
        console.log('[Monoloth][Picker] showError called:', msg);
        if (fpEmpty) fpEmpty.style.display = 'flex';
        if (fpEmpty) fpEmpty.querySelector('span').textContent = msg;
        if (fpFileList) fpFileList.innerHTML = '';
        if (fpLoading) fpLoading.style.display = 'none';
        if (fpBreadcrumb) fpBreadcrumb.innerHTML = '';
        clearPreview();
    }

    function formatDate(ts) {
        if (!ts || ts <= 0) return '\u2014';
        var d = new Date(ts * 1000);
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[d.getMonth()] + ' ' + d.getDate().toString().padStart(2,'0') + ', ' + d.getFullYear();
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '\u2014';
        var u = ['B','KB','MB','GB','TB'];
        var i = 0;
        var s = bytes;
        while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
        return (i === 0 ? s : s.toFixed(1)) + ' ' + u[i];
    }

    function loadDrives() {
        if (!fpDrivesList || fpDrivesList.dataset.loaded) return;
        window.monolithApi.get_drives().then(function (drives) {
            if (!drives || drives.length === 0) return;
            fpDrivesList.innerHTML = '';
            for (var i = 0; i < drives.length; i++) {
                (function (d) {
                    var item = document.createElement('div');
                    item.className = 'fp-drive-item';
                    item.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> ' + d.letter + (d.label ? ' \u2014 ' + d.label : '');
                    item.addEventListener('click', function () { doNavigate(d.letter + '\\'); });
                    fpDrivesList.appendChild(item);
                })(drives[i]);
            }
            fpDrivesList.dataset.loaded = '1';
        }).catch(function () {});
    }

    // --- Event handlers ---

    if (fpClose) fpClose.addEventListener('click', function () { closePicker(null); });
    if (fpCancel) fpCancel.addEventListener('click', function () { closePicker(null); });

    if (fpOk) {
        fpOk.addEventListener('click', function () {
            var path = fpState.selectedPath;
            if (!path && fpFilename.value) path = joinPath(fpState.currentPath, fpFilename.value);
            if (!path && fpState.mode === 'folder') path = fpState.currentPath;
            if (path) closePicker(path);
        });
    }

    if (fpBack) fpBack.addEventListener('click', function () {
        if (fpState.historyIndex > 0) { fpState.historyIndex--; fpState.currentPath = fpState.history[fpState.historyIndex]; updateNavButtons(); loadDirectory(fpState.currentPath); }
    });

    if (fpForward) fpForward.addEventListener('click', function () {
        if (fpState.historyIndex < fpState.history.length - 1) { fpState.historyIndex++; fpState.currentPath = fpState.history[fpState.historyIndex]; updateNavButtons(); loadDirectory(fpState.currentPath); }
    });

    if (fpUp) fpUp.addEventListener('click', function () {
        if (!fpState.currentPath) return;
        var parent = fpState.currentPath;
        if (parent.endsWith(':')) parent += '\\';
        var p = parent.replace(/\\+$/, '');
        var idx = p.lastIndexOf('\\');
        if (idx > 0) doNavigate(p.substring(0, idx));
        else if (idx === 0) doNavigate(p.substring(0, idx + 1));
    });

    if (fpRefresh) fpRefresh.addEventListener('click', function () { if (fpState.currentPath) loadDirectory(fpState.currentPath); });
    if (fpFilter) fpFilter.addEventListener('change', function () { updateFilterExts(); if (fpState.currentPath) loadDirectory(fpState.currentPath); });

    // Path input: click on breadcrumb to edit
    if (fpPathBar && fpBreadcrumb) {
        fpBreadcrumb.addEventListener('click', function () {
            fpPathBar.classList.add('editing');
            if (fpPathInput) {
                fpPathInput.focus();
                fpPathInput.select();
            }
        });
    }

    // Path input: handle Enter key to navigate
    if (fpPathInput) {
        fpPathInput.addEventListener('keydown', function (e) {
            if (e.code === 'Enter') {
                e.preventDefault();
                var path = fpPathInput.value.trim();
                if (path) {
                    fpPathBar.classList.remove('editing');
                    navigateToPath(path);
                }
            }
            if (e.code === 'Escape') {
                e.preventDefault();
                fpPathBar.classList.remove('editing');
                if (fpState.currentPath) {
                    fpPathInput.value = fpState.currentPath;
                }
            }
        });

        fpPathInput.addEventListener('blur', function () {
            fpPathBar.classList.remove('editing');
            if (fpState.currentPath) {
                fpPathInput.value = fpState.currentPath;
            }
        });
    }

    // Filename input: Enter to navigate if absolute path, otherwise OK
    if (fpFilename) {
        fpFilename.addEventListener('keydown', function (e) {
            if (e.code === 'Enter') {
                e.preventDefault();
                var val = fpFilename.value.trim();
                if (!val) return;
                if (val.indexOf(':') !== -1 && val.indexOf('\\') !== -1) {
                    navigateToPath(val);
                } else if (fpOk && !fpOk.disabled) {
                    fpOk.click();
                }
            }
        });
    }

    // Sidebar clicks
    var sidebarItems = fpEl.querySelectorAll('.fp-sidebar-item');
    for (var si = 0; si < sidebarItems.length; si++) {
        (function (item) {
            item.addEventListener('click', function () {
                var p = item.dataset.path;
                var sidebarItems = fpEl.querySelectorAll('.fp-sidebar-item');
                for (var si2 = 0; si2 < sidebarItems.length; si2++) {
                    sidebarItems[si2].classList.remove('active');
                }
                item.classList.add('active');
                if (QUICK_PATHS[p]) {
                    window.monolithApi.get_path_info(QUICK_PATHS[p]).then(function (info) {
                        if (info && info.success && info.isDir) doNavigate(info.absolute);
                    });
                }
            });
        })(sidebarItems[si]);
    }

    if (fpEl) fpEl.addEventListener('click', function (e) {
        if (e.target === fpEl || e.target.classList.contains('fp-overlay')) closePicker(null);
    });

    // Keyboard
    document.addEventListener('keydown', function (e) {
        if (!fpEl || !fpEl.classList.contains('active')) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            if (e.code === 'Escape') { e.preventDefault(); closePicker(null); }
            return;
        }
        if (e.code === 'Escape') { e.preventDefault(); closePicker(null); return; }
        if (e.code === 'Enter') { e.preventDefault(); if (fpOk && !fpOk.disabled) fpOk.click(); return; }
        if (e.code === 'Backspace') { e.preventDefault(); if (fpUp && !fpUp.disabled) fpUp.click(); return; }
        if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
            e.preventDefault();
            var items = fpFileList.querySelectorAll('.fp-file-item');
            if (items.length === 0) return;
            var sel = fpFileList.querySelector('.fp-file-item.selected');
            var idx = -1;
            if (sel) { for (var k = 0; k < items.length; k++) { if (items[k] === sel) { idx = k; break; } } }
            idx = e.code === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx === -1 ? 0 : idx - 1, 0);
            items.forEach(function (it) { it.classList.remove('selected'); });
            items[idx].classList.add('selected');
            var en = items[idx].dataset.name;
            var entries = fpState._listings[fpState.currentPath] || [];
            for (var ek = 0; ek < entries.length; ek++) { if (entries[ek].name === en) { onItemClick(entries[ek]); break; } }
            items[idx].scrollIntoView({ block: 'nearest' });
        }
    });

    function closePicker(result) {
        if (!fpEl) return;
        releaseFocus();
        fpEl.classList.remove('active');
        fpState.selectedPath = '';
        if (fpFilename) fpFilename.value = '';
        if (fpOk) fpOk.disabled = true;
        clearPreview();
        if (fpDrivesList) delete fpDrivesList.dataset.loaded;

        if (result && fpState.pickerId) {
            _setLastDirectory(fpState.pickerId, result);
        }

        if (fpState.resolve) {
            fpState.resolve(result);
            fpState.resolve = null;
            fpState.reject = null;
        }
    }

    // ================================================================
    // Profile Management
    // ================================================================

    var _profiles = [];
    var _activeProfile = 'Default';

    function loadProfiles() {
        if (!window.monolithApi) return;
        window.monolithApi.get_profiles()
            .then(function (res) {
                if (res && res.success) {
                    _profiles = res.profiles || [];
                    _activeProfile = res.active || 'Default';
                    updateProfileUI();
                }
            })
            .catch(function () {});
    }

    function updateProfileUI() {
        var nameEl = document.getElementById('current-profile-name');
        if (nameEl) nameEl.textContent = _activeProfile;
        renderProfilesList();
        renderProfileSwitcher();
    }

    function renderProfilesList() {
        var list = document.getElementById('profiles-list');
        if (!list) return;
        list.innerHTML = '';
        _profiles.forEach(function (profile, idx) {
            var item = document.createElement('div');
            item.className = 'profile-item' + (profile.name === _activeProfile ? ' active' : '') + (profile.isDefault ? ' is-default' : '');

            var info = document.createElement('div');
            info.className = 'profile-item-info';

            var nameSpan = document.createElement('span');
            nameSpan.className = 'profile-item-name';
            nameSpan.textContent = profile.name;
            info.appendChild(nameSpan);

            var badge = document.createElement('span');
            badge.className = 'profile-item-badge';
            if (profile.isDefault) {
                badge.textContent = 'Default';
                badge.classList.add('badge-default');
            }
            if (profile.name === _activeProfile) {
                badge.textContent = 'Active';
                badge.classList.add('badge-active');
            }
            info.appendChild(badge);

            item.appendChild(info);

            var actions = document.createElement('div');
            actions.className = 'profile-item-actions';

            if (!profile.isDefault && profile.name !== _activeProfile) {
                var switchBtn = document.createElement('button');
                switchBtn.className = 'profile-action-btn profile-switch-btn';
                switchBtn.textContent = 'Switch';
                switchBtn.addEventListener('click', function () {
                    switchToProfile(profile.name);
                });
                actions.appendChild(switchBtn);

                var renameBtn = document.createElement('button');
                renameBtn.className = 'profile-action-btn profile-rename-btn';
                renameBtn.textContent = 'Rename';
                renameBtn.addEventListener('click', function () {
                    renameProfileInline(profile.name);
                });
                actions.appendChild(renameBtn);

                var deleteBtn = document.createElement('button');
                deleteBtn.className = 'profile-action-btn profile-delete-btn';
                deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
                deleteBtn.addEventListener('click', function () {
                    deleteProfileConfirm(profile.name);
                });
                actions.appendChild(deleteBtn);
            } else {
                var defaultLabel = document.createElement('span');
                defaultLabel.className = 'profile-default-label';
                defaultLabel.textContent = 'Built-in';
                actions.appendChild(defaultLabel);
            }

            item.appendChild(actions);
            list.appendChild(item);
        });
    }

    function switchToProfile(name) {
        if (!window.monolithApi) return;
        window.monolithApi.switch_profile(name)
            .then(function (res) {
                if (res && res.success) {
                    _activeProfile = name;
                    updateProfileUI();
                    if (_terminalRunning) {
                        showProfilesStatus('Profile switched \u2014 changes apply on next launch.', false);
                    } else {
                        showProfilesStatus('Switched to ' + name, false);
                    }
                    // Reload all settings from new profile
                    loadAllSettingsForProfile();
                } else {
                    showProfilesStatus(res.error || 'Failed to switch', true);
                }
            })
            .catch(function (err) {
                showProfilesStatus('Error: ' + err, true);
            });
    }

    function deleteProfileConfirm(name) {
        showConfirm('Delete Profile', 'Delete profile "' + name + '"? This cannot be undone.').then(function () {
            if (!window.monolithApi) return;
            window.monolithApi.delete_profile(name)
                .then(function (res) {
                    if (res && res.success) {
                        loadProfiles();
                        showProfilesStatus('Profile deleted', false);
                    } else {
                        showProfilesStatus(res.error || 'Failed to delete', true);
                    }
                })
                .catch(function (err) {
                    showProfilesStatus('Error: ' + err, true);
                });
        }).catch(function () {});
    }

    function renameProfileInline(oldName) {
        showPrompt('Rename Profile', 'Enter new name...', oldName).then(function (newName) {
            if (newName === oldName) return;
            if (!window.monolithApi) return;
            window.monolithApi.rename_profile(oldName, newName)
                .then(function (res) {
                    if (res && res.success) {
                        loadProfiles();
                        showProfilesStatus('Profile renamed to ' + newName, false);
                    } else {
                        showProfilesStatus(res.error || 'Failed to rename profile', true);
                    }
                })
                .catch(function (err) {
                    showProfilesStatus('Error: ' + err, true);
                });
        }).catch(function () {});
    }

    function loadAllSettingsForProfile() {
        // Reload appearance, shortcuts, startup config, etc. from the new profile
        loadBackgroundConfig();
        loadStartupConfig();
        loadSecondaryCommands();
        loadShortcuts(function () { renderShortcutUI(); updateKbdHint(); });
    }

    function showProfilesStatus(msg, isError) {
        var el = document.getElementById('profiles-status');
        if (!el) return;
        el.textContent = msg;
        el.className = 'profiles-status' + (isError ? ' error' : ' success');
        if (_statusTimers['profiles-status']) { clearTimeout(_statusTimers['profiles-status']); }
        _statusTimers['profiles-status'] = setTimeout(function () {
            el.textContent = '';
            el.className = 'profiles-status';
        }, 6000);
    }

    // --- Inline Dialog (replaces prompt/confirm) ---
    var idEl = document.getElementById('inline-dialog');
    var idTitle = document.getElementById('id-title');
    var idBody = document.getElementById('id-body');
    var idFooter = document.getElementById('id-footer');
    var idClose = document.getElementById('id-close');

    function _idResolve(v) { /* set by showers */ }
    function _idReject(e) { /* set by showers */ }

    function closeDialog(result) {
        if (!idEl) return;
        releaseFocus();
        idEl.classList.remove('active');
        if (result !== undefined) {
            _idResolve(result);
        } else {
            _idReject(new Error('cancelled'));
        }
    }

    if (idClose) {
        idClose.addEventListener('click', function () { closeDialog(); });
    }

    if (idEl) {
        idEl.addEventListener('click', function (e) {
            if (e.target === idEl || e.target.classList.contains('id-overlay')) closeDialog();
        });
    }

    function showPrompt(title, label, defaultValue) {
        return new Promise(function (resolve, reject) {
            _idResolve = resolve;
            _idReject = reject;
            if (idTitle) idTitle.textContent = title;
            if (idBody) {
                idBody.innerHTML = '<input type="text" id="id-input-field" class="id-input" placeholder="' + (label || '') + '"><div id="id-input-error" class="id-error"></div>';
                var inp = document.getElementById('id-input-field');
                if (inp && defaultValue) inp.value = defaultValue;
                setTimeout(function () { if (inp) { inp.focus(); inp.select(); } }, 50);
                var onKey = function (e) {
                    if (e.code === 'Enter') {
                        var val = inp.value.trim();
                        if (!val) return;
                        closeDialog(val);
                    }
                    if (e.code === 'Escape') closeDialog();
                };
                if (inp) inp.addEventListener('keydown', onKey);
            }
            if (idFooter) {
                idFooter.innerHTML = '<button id="id-btn-cancel-el" class="id-btn-cancel">Cancel</button><button id="id-btn-ok-el" class="id-btn-primary">OK</button>';
                var cancelBtn = document.getElementById('id-btn-cancel-el');
                var okBtn = document.getElementById('id-btn-ok-el');
                if (cancelBtn) cancelBtn.addEventListener('click', function () { closeDialog(); });
                if (okBtn) okBtn.addEventListener('click', function () {
                    var inp = document.getElementById('id-input-field');
                    var val = inp ? inp.value.trim() : '';
                    var errEl = document.getElementById('id-input-error');
                    if (!val) {
                        if (errEl) errEl.textContent = 'Please enter a value.';
                        return;
                    }
                    closeDialog(val);
                });
            }
            if (idEl) { idEl.classList.add('active'); saveFocus(); trapFocus(idEl); }
        });
    }

    // ============================================
    // CUSTOM TITLEBAR
    // ============================================

    function loadCustomTitlebarConfig() {
        if (!window.monolithApi) return;
        window.monolithApi.get_config('use_custom_titlebar')
            .then(function(val) {
                _useCustomTitlebar = val === true;
                applyCustomTitlebarUI(_useCustomTitlebar, false);
                if (_useCustomTitlebar && window.monolithApi.is_window_maximized) {
                    window.monolithApi.is_window_maximized().then(function(result) {
                        _isMaximized = result.maximized;
                        updateMaximizeIcon(_isMaximized);
                    });
                }
            });
    }

    function applyCustomTitlebarUI(enable, persist) {
        _useCustomTitlebar = enable;
        document.body.classList.toggle('custom-titlebar-active', enable);
        updateTitlebarViewState();

        var toggleContainer = document.getElementById('titlebar-toggle');
        if (toggleContainer) {
            var activeMode = enable ? 'custom' : 'native';
            toggleContainer.querySelectorAll('.titlebar-toggle-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.titlebar === activeMode);
            });
        }

        if (persist !== false && window.monolithApi) {
            window.monolithApi.toggle_custom_titlebar(enable);
        }
    }

    function updateTitlebarViewState() {
        if (!_useCustomTitlebar) return;
    }

    function syncTitlebarToggleState() {
        var toggleContainer = document.getElementById('titlebar-toggle');
        if (toggleContainer) {
            var activeMode = _useCustomTitlebar ? 'custom' : 'native';
            toggleContainer.querySelectorAll('.titlebar-toggle-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.titlebar === activeMode);
            });
        }
    }

    function setCurrentView(view) {
        document.body.dataset.currentView = view;
        if (view !== 'settings') _currentViewState = view;
        updateTitlebarViewState();
    }

    function updateMaximizeIcon(maximized) {
        // Single-state icon — always shows the maximize square
    }

    function setupMaximizeSyncListener() {
        if (window.__TAURI__ && window.__TAURI__.event) {
            window.__TAURI__.event.listen('tauri://resize', function() {
                if (!_useCustomTitlebar) return;
                if (_maximizeSyncTimer) clearTimeout(_maximizeSyncTimer);
                _maximizeSyncTimer = setTimeout(function() {
                    if (window.monolithApi && window.monolithApi.is_window_maximized) {
                        window.monolithApi.is_window_maximized().then(function(result) {
                            if (result.maximized !== _isMaximized) {
                                _isMaximized = result.maximized;
                                updateMaximizeIcon(_isMaximized);
                            }
                        });
                    }
                }, 200);
            });
        }
    }

    function setupTitlebarEventHandlers() {
        var tbBack = document.getElementById('tb-back');
        if (tbBack) {
            tbBack.addEventListener('click', function() {
                if (_terminalRunning) {
                    showConfirm('Return to Launcher', 'Return to launcher? The current session will be terminated.')
                        .then(function() { backToLanding(); })
                        .catch(function() {});
                } else {
                    backToLanding();
                }
            });
        }

        var tbRefresh = document.getElementById('tb-refresh');
        if (tbRefresh) {
            tbRefresh.addEventListener('click', function() {
                if (_currentLaunchDir) {
                    // Skip the old session's EOF event to prevent back-to-landing
                    _skipNextEof['main'] = true;
                    if (_terminalRunning && window.monolithApi) {
                        window.monolithApi.terminate().catch(function () {});
                    }
                    _terminalRunning = false;
                    initTerminal(_currentLaunchDir);
                    loadBackgroundConfig();
                }
            });
        }

        var tbMenu = document.getElementById('tb-menu');
        if (tbMenu) {
            tbMenu.addEventListener('click', function() {
                openPalette();
            });
        }

        var tbMinimize = document.getElementById('tb-minimize');
        if (tbMinimize) {
            tbMinimize.addEventListener('click', function() {
                if (window.monolithApi) window.monolithApi.minimize_window();
            });
        }

        var tbMaximize = document.getElementById('tb-maximize');
        if (tbMaximize) {
            tbMaximize.addEventListener('click', function() {
                if (window.monolithApi) {
                    window.monolithApi.toggle_maximize_window().then(function(result) {
                        _isMaximized = result.maximized;
                        updateMaximizeIcon(_isMaximized);
                    });
                }
            });
        }

        var tbClose = document.getElementById('tb-close');
        if (tbClose) {
            tbClose.addEventListener('click', function() {
                if (_terminalRunning) {
                    showConfirm('Exit Monoloth', 'A terminal session is running. Exit anyway?')
                        .then(function() { if (window.monolithApi) window.monolithApi.close_window(); })
                        .catch(function() {});
                } else {
                    if (window.monolithApi) window.monolithApi.close_window();
                }
            });
        }

        var titlebarToggle = document.getElementById('titlebar-toggle');
        if (titlebarToggle) {
            titlebarToggle.addEventListener('click', function(e) {
                var btn = e.target.closest('.titlebar-toggle-btn');
                if (!btn) return;
                var enable = btn.dataset.titlebar === 'custom';
                applyCustomTitlebarUI(enable, true);
            });
        }
    }

    function showConfirm(title, message) {
        return new Promise(function (resolve, reject) {
            _idResolve = resolve;
            _idReject = reject;
            if (idTitle) idTitle.textContent = title;
            if (idBody) {
                idBody.innerHTML = '<p>' + message + '</p>';
            }
            if (idFooter) {
                idFooter.innerHTML = '<button id="id-btn-cancel-el" class="id-btn-cancel">Cancel</button><button id="id-btn-ok-el" class="id-btn-primary">OK</button>';
                var cancelBtn = document.getElementById('id-btn-cancel-el');
                var okBtn = document.getElementById('id-btn-ok-el');
                if (cancelBtn) cancelBtn.addEventListener('click', function () { closeDialog(); });
                if (okBtn) okBtn.addEventListener('click', function () { closeDialog(true); });
            }
            if (idEl) { idEl.classList.add('active'); saveFocus(); trapFocus(idEl); }
        });
    }

    // Add profile button
    var addProfileBtn = document.getElementById('add-profile-btn');
    if (addProfileBtn) {
        addProfileBtn.addEventListener('click', function () {
            showPrompt('New Profile', 'Enter profile name...', '').then(function (name) {
                if (!window.monolithApi) return;
                var filenameRegex = /^[^\\/:\*\?"<>\|]+$/;
                if (!filenameRegex.test(name)) {
                    showProfilesStatus('Invalid characters: \\ / : * ? " < > |', true);
                    return;
                }
                window.monolithApi.create_profile(name)
                    .then(function (res) {
                        if (res && res.success) {
                            loadProfiles();
                            showProfilesStatus('Profile created', false);
                        } else {
                            showProfilesStatus(res.error || 'Failed to create', true);
                        }
                    })
                    .catch(function (err) {
                        showProfilesStatus('Error: ' + err, true);
                    });
            }).catch(function () {});
        });
    }

    // ================================================================
    // Profile Switcher Modal
    // ================================================================

    var profileSwitcher = document.getElementById('profile-switcher');
    var profileSelectorBtn = document.getElementById('profile-selector-btn');
    var psClose = document.getElementById('ps-close');
    var psBody = document.getElementById('ps-body');

    function renderProfileSwitcher() {
        if (!psBody) return;
        psBody.innerHTML = '';
        _profiles.forEach(function (profile) {
            var item = document.createElement('div');
            item.className = 'ps-item' + (profile.name === _activeProfile ? ' active' : '');
            var nameSpan = document.createElement('span');
            nameSpan.className = 'ps-item-name';
            nameSpan.textContent = profile.name;
            item.appendChild(nameSpan);
            if (profile.name === _activeProfile) {
                var checkSpan = document.createElement('span');
                checkSpan.className = 'ps-item-check';
                checkSpan.innerHTML = '&#10003;';
                item.appendChild(checkSpan);
            }
            item.addEventListener('click', function () {
                switchToProfile(profile.name);
                closeProfileSwitcher();
            });
            psBody.appendChild(item);
        });
    }

    function openProfileSwitcher() {
        if (!profileSwitcher) return;
        renderProfileSwitcher();
        profileSwitcher.classList.add('active');
        saveFocus();
        trapFocus(profileSwitcher);
    }

    function closeProfileSwitcher() {
        if (!profileSwitcher) return;
        releaseFocus();
        profileSwitcher.classList.remove('active');
    }

    if (profileSelectorBtn) {
        profileSelectorBtn.addEventListener('click', openProfileSwitcher);
    }

    if (psClose) {
        psClose.addEventListener('click', closeProfileSwitcher);
    }

    if (profileSwitcher) {
        profileSwitcher.addEventListener('click', function (e) {
            if (e.target === profileSwitcher || e.target.classList.contains('ps-overlay')) {
                closeProfileSwitcher();
            }
        });
    }

    // Load profiles on init
    loadProfiles();

    // --- History event handlers ---
    var historyToggle = document.getElementById('history-toggle');
    if (historyToggle) {
        historyToggle.addEventListener('click', function(e) {
            var btn = e.target.closest('.history-toggle-btn');
            if (!btn || !window.monolithApi) return;
            var enabled = btn.dataset.enabled === 'true';
            historyToggle.querySelectorAll('.history-toggle-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.enabled === String(enabled));
            });
            window.monolithApi.set_history_enabled(enabled);
            if (enabled) loadHistoryTab();
            else {
                var rankingEl = document.getElementById('history-ranking');
                if (rankingEl) rankingEl.innerHTML = '<span class="history-empty">History tracking is disabled. Enable to start tracking.</span>';
            }
        });
    }

    var retentionSelector = document.getElementById('retention-selector');
    if (retentionSelector) {
        retentionSelector.addEventListener('click', function(e) {
            var btn = e.target.closest('.retention-btn');
            if (!btn || !window.monolithApi) return;
            var retention = btn.dataset.retention;
            retentionSelector.querySelectorAll('.retention-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.retention === retention);
            });
            window.monolithApi.set_history_retention(retention).then(function() {
                loadHistoryTab();
            });
        });
    }

    var clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', function() {
            showConfirm('Clear History', 'Delete all history data? This cannot be undone.')
                .then(function() {
                    if (window.monolithApi) {
                        window.monolithApi.clear_history().then(function() {
                            loadHistoryTab();
                            showStatus('history-status', 'History cleared.', false);
                        });
                    }
                })
                .catch(function() {});
        });
    }

    // --- MonolothApp Facade (exposed to sidebar.js) ---
    window.MonolothApp = {
        getCurrentDir: function () { return _currentLaunchDir; },
        restartSession: function (sessionId) {
            sessionId = sessionId || 'main';
            if (sessionId === 'main') {
                if (window.TabManager && typeof window.TabManager.refreshActiveTab === 'function') {
                    return window.TabManager.refreshActiveTab();
                }
                if (_terminalRunning) {
                    _skipNextEof['main'] = true;
                    window.monolithApi.terminate_terminal('main')
                        .finally(function () { _skipNextEof['main'] = false; _terminalRunning = false; initTerminal(_currentLaunchDir); });
                } else {
                    initTerminal(_currentLaunchDir);
                }
            } else if (sessionId === 'panel') {
                if (_panelRunning) {
                    _skipNextEof['panel'] = true;
                    window.monolithApi.terminate_terminal('panel')
                        .finally(function () { _skipNextEof['panel'] = false; _panelRunning = false; if (typeof window.SidebarManager !== 'undefined') { window.SidebarManager.showCmdPanel(); window.SidebarManager.initCmdPanel(_currentLaunchDir); } });
                } else {
                    if (typeof window.SidebarManager !== 'undefined') {
                        window.SidebarManager.showCmdPanel();
                        window.SidebarManager.initCmdPanel(_currentLaunchDir);
                    }
                }
            }
        },
        setSkipNextEof: function (sessionId, val) {
            _skipNextEof[sessionId] = val;
        },
        setSessionGeneration: function (sessionId, gen) {
            _sessionGeneration[sessionId] = gen;
        },
        refitTerminals: function () {
            if (term && fitAddon) {
                fitAddon.fit();
                if (window.monolithApi) window.monolithApi.resize_terminal('main', term.cols, term.rows);
            }
        },
        isMainActive: function () { return _terminalRunning; }
    };

    // Initialize sidebar on first terminal show
    if (typeof window.SidebarManager !== 'undefined') {
        window.SidebarManager.init();
    }

    // Scan for [data-tooltip] elements after all DOM is ready
if (window.MonolothTooltip) {
                    window.MonolothTooltip.scan(document.body);
    }

})();
