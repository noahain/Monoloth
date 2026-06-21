(function () {
    'use strict';

    const landing = document.getElementById('landing');
    const terminalView = document.getElementById('terminal-view');
    const settingsPage = document.getElementById('settings-page');
    const chooseBtn = document.getElementById('choose-dir-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsClose = document.getElementById('settings-close');
    const terminalContainer = document.getElementById('terminal');

    let _bgImagePath = '';
    let _bgTransparency = 75;
    let _currentLaunchDir = '';
    var _keyDownHandler = null;
    var _mouseDownHandler = null;
    var _useCustomTitlebar = true;
    var _isMaximized = false;
    var _maximizeSyncTimer = null;
    var _panelRunning = false;
    var _statusTimers = {};
    var _bgType = 'none';
    var _currentColor = '#0a0a0a';
    var _currentGradient = '';
    var _bgLayer = 'behind';
    var _launchToken = 0;
    var _editingProfile = null;

    function isGifUrl(url) {
        if (!url) return false;
        if (url.indexOf('data:') === 0) return url.indexOf('data:image/gif') === 0;
        return /\.gif($|\?)/i.test(url);
    }

    function cacheBustParam(url) {
        return (url.indexOf('?') === -1 ? '?t=' : '&t=') + Date.now();
    }

    function copyToClipboard(text) { navigator.clipboard.writeText(text).catch(function () {}); }

    var UI = window.MonolothUI;
    var saveFocus = UI.saveFocus;
    var restoreFocus = UI.restoreFocus;
    var trapFocus = UI.trapFocus;
    var releaseFocus = UI.releaseFocus;
    var escapeHtml = UI.escapeHtml;
    var forceReflow = UI.forceReflow;
    var silent = UI.silent;
    var openModal = UI.openModal;
    var closeModal = UI.closeModal;

    // Theme & CTA Style Management moved to theme.js (window.MonolithTheme)

    // --- Wait for API bridge ---
    function waitForBridge(timeoutMs, callback) {
        const start = Date.now();
        const check = () => {
            if (window.monolithApi) {
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
        if (!landingStatusText) return;
        // Idle ("Ready") shows nothing: hide the label and its trailing
        // separator so only meaningful states (Initializing, errors) appear.
        var idle = !text || text === 'Ready';
        landingStatusText.textContent = idle ? '' : text;
        landingStatusText.style.display = idle ? 'none' : '';
        var sep = landingStatusText.nextElementSibling;
        if (sep && sep.classList.contains('landing-status-sep')) {
            sep.style.display = idle ? 'none' : '';
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
            window.monolithApi.save_last_directory(path).catch(function () {});
        }
        renderRecentDirectories();
    }

    function loadRecentDirectories() {
        if (!window.monolithApi) return;
        function fallbackToLastDirectory() {
            window.monolithApi.get_last_directory().then(function (res) {
                if (res && res.success && res.path) {
                    _recentDirs = [res.path];
                    renderRecentDirectories();
                }
            }).catch(function () {});
        }
        window.monolithApi.get_recent_directories()
            .then(function (dirs) {
                if (Array.isArray(dirs) && dirs.length > 0) {
                    _recentDirs = dirs.slice(0, 7);
                    renderRecentDirectories();
                } else {
                    fallbackToLastDirectory();
                }
            })
            .catch(fallbackToLastDirectory);
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
        _recentDirs.forEach(function (dirPath) {
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
                addToRecentDirectories(dirPath);
                showTerminal(dirPath);
            });
            recentProjectsList.appendChild(item);
        });
    }

    // Show loading indicator while bridge initializes
    if (bridgeLoading) bridgeLoading.style.display = 'flex';
    updateStatusBar('Initializing...');

    if (chooseBtn) {
        chooseBtn.addEventListener('click', () => {
            waitForBridge(3000, (ready) => {
                if (!ready) {
                    chooseBtn.querySelector('span').textContent = 'Failed to initialize Ã¢â‚¬â€ please restart the app';
                    chooseBtn.style.color = 'var(--accent-red)';
                    return;
                }
                window.MonolithFilePicker.pickPath({ id: 'opencode_dir', title: 'Choose Directory', mode: 'folder' })
                    .then(function (path) {
                        if (!path) return;
                        addToRecentDirectories(path);
                        showTerminal(path);
                    });
            });
        });
    }

    // Load background config once bridge is ready
    waitForBridge(5000, function (ready) {
        if (ready) {
            _bridgeReady = true;
            window.MonolithDialog.loadConfirmPrefs();
            updateStatusBar('Ready');
            window.MonolithShortcuts.loadShortcuts(function () {
                window.MonolithShortcuts.updateKbdHint();
            });
            var bgPromise = loadBackgroundConfig();
            var profilesPromise = window.MonolithProfiles.loadProfiles();
            var startupPromise = loadStartupConfig();
            loadRecentDirectories();
            loadCustomTitlebarConfig();
            setupMaximizeSyncListener();
            setupTitlebarEventHandlers();
            updateMainUILabels();
            window.monolithApi.get_windows_pty_info()
                .then(function (info) {
                    if (window.MonolithTerminal) window.MonolithTerminal.setWindowsPtyInfo(info);
                    window.__monolithWindowsPty = info || null;
                })
                .catch(function () {});
            Promise.all([bgPromise, profilesPromise, startupPromise]).then(function () {
                if (bridgeLoading) bridgeLoading.style.display = 'none';
                if (window.__monolithReady) {
                    window.__monolithReady.config = true;
                    if (window.__monolithReveal) window.__monolithReveal();
                }
            }).catch(function () {
                if (bridgeLoading) bridgeLoading.style.display = 'none';
                if (window.__monolithReady) {
                    window.__monolithReady.config = true;
                    if (window.__monolithReveal) window.__monolithReveal();
                }
            });
        } else {
            if (bridgeLoading) bridgeLoading.style.display = 'none';
            updateStatusBar('Bridge unavailable');
            if (window.__monolithReady) {
                window.__monolithReady.config = true;
                if (window.__monolithReveal) window.__monolithReveal();
            }
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
        if (_currentViewState !== 'landing' && _currentViewState !== 'terminal') {
            _currentViewState = (landing && !landing.classList.contains('hidden')) ? 'landing' : 'terminal';
        }
        setCurrentView('settings');

        if (landing) landing.classList.add('hidden');
        if (terminalView) {
            terminalView.classList.remove('active');
            terminalView.classList.remove('anim-enter');
        }
        if (settingsPage) {
            settingsPage.classList.remove('anim-exit');
            settingsPage.classList.add('active');
        }
        saveFocus();
        trapFocus(settingsPage);
        switchTab('startup');
        loadUpdaterInfo();
    }

    function hideSettings() {
        releaseFocus();
        if (settingsPage) {
            settingsPage.classList.add('anim-exit');
            setTimeout(function () {
                settingsPage.classList.remove('active', 'anim-exit');
            }, 150);
        }
        if (_currentViewState === 'terminal') {
            setTimeout(function () {
                if (terminalView) {
                    terminalView.classList.add('active');
                    terminalView.classList.add('anim-enter');
                    terminalView.addEventListener('animationend', function handler() {
                        terminalView.classList.remove('anim-enter');
                        terminalView.removeEventListener('animationend', handler);
                    });
                }
                if (window.MonolothApp && window.MonolothApp.refitTerminals) {
                    window.MonolothApp.refitTerminals();
                }
            }, 160);
        } else {
            setTimeout(function () {
                if (landing) {
                    landing.classList.remove('hidden');
                    landing.classList.add('anim-enter');
                    landing.addEventListener('animationend', function handler() {
                        landing.classList.remove('anim-enter');
                        landing.removeEventListener('animationend', handler);
                    });
                }
            }, 160);
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
            switchTab(tab.dataset.tab);
        });
    });

    // --- Collapsible sections ---
    var settingsContent = document.querySelector('.settings-content');
    if (settingsContent) settingsContent.addEventListener('click', function (e) {
        var trigger = e.target.closest('.collapsible-trigger');
        if (!trigger) return;
        var section = trigger.closest('.collapsible-section');
        if (!section) return;
        var body = section.querySelector('.collapsible-body');
        var chevron = trigger.querySelector('.collapsible-chevron');
        if (body) {
            var isHidden = body.style.display === 'none';
            if (isHidden) {
                // Expanding
                body.style.display = '';
                body.style.maxHeight = body.scrollHeight + 'px';
                body.style.opacity = '1';
                body.classList.remove('anim-collapse');
                body.classList.add('anim-expand');
                if (chevron) chevron.classList.add('open');
                // Clean up after transition
                var onEnd = function () {
                    body.style.maxHeight = '';
                    body.removeEventListener('transitionend', onEnd);
                };
                body.addEventListener('transitionend', onEnd);
            } else {
                // Collapsing
                body.style.maxHeight = body.scrollHeight + 'px';
                body.offsetHeight; // force reflow
                body.style.maxHeight = '0';
                body.style.opacity = '0';
                body.classList.remove('anim-expand');
                body.classList.add('anim-collapse');
                if (chevron) chevron.classList.remove('open');
                var onEndCollapse = function () {
                    body.style.display = 'none';
                    body.style.maxHeight = '';
                    body.style.opacity = '';
                    body.removeEventListener('transitionend', onEndCollapse);
                };
                body.addEventListener('transitionend', onEndCollapse);
            }
        }
    });

    function loadSettingsTab(tabName) {
        if (!window.monolithApi) return;

        if (tabName === 'appearance') {
            loadBackgroundConfig();
            syncTitlebarToggleState();
        } else if (tabName === 'keybinds') {
            window.MonolithShortcuts.loadShortcuts(function () {
                window.MonolithShortcuts.renderShortcutUI();
            });
        } else if (tabName === 'startup') {
            window.MonolithFilePicker.loadFilePickerConfig();
            loadStartupConfig();
            loadSecondaryCommands();
        } else if (tabName === 'profiles') {
            window.MonolithProfiles.loadProfiles();
        } else if (tabName === 'history') {
            loadHistoryTab();
        } else if (tabName === 'sidebar') {
            if (window.SidebarManager && window.SidebarManager.renderSettingsTab) {
                window.SidebarManager.renderSettingsTab();
            }
        }
    }

    // Status messages: auto-clear after 6s, clickable to dismiss
    function showStatus(id, message, isError) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = message;
        el.classList.remove('anim-enter', 'anim-exit');
        void el.offsetWidth; // reflow
        el.classList.add(isError ? 'error' : 'success', 'dismissible', 'anim-enter');

        // Clear previous timer
        if (_statusTimers[id]) { clearTimeout(_statusTimers[id]); }

        // Auto-clear after 6 seconds
        _statusTimers[id] = setTimeout(function () {
            el.classList.remove('anim-enter');
            el.classList.add('anim-exit');
            setTimeout(function () {
                el.textContent = '';
                el.classList.remove('error', 'success', 'dismissible', 'anim-exit');
            }, 300);
        }, 6000);
    }

    if (window.MonolithFilePicker && window.MonolithFilePicker.setStatusReporter) {
        window.MonolithFilePicker.setStatusReporter(showStatus);
    }

    // Click status to dismiss immediately
    document.body.addEventListener('click', function (e) {
        var el = e.target;
        if (!el.id || !el.id.endsWith('-status')) return;
        if (_statusTimers[el.id]) { clearTimeout(_statusTimers[el.id]); }
        el.classList.remove('anim-enter');
        el.classList.add('anim-exit');
        setTimeout(function () {
            el.textContent = '';
            el.classList.remove('error', 'success', 'dismissible', 'anim-exit');
        }, 300);
    });

    // --- Advanced Tab ---
    const checkUpdateBtn = document.getElementById('check-update-btn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', function () {
            if (window.MonolothUpdater && typeof window.MonolothUpdater.checkFromFooter === 'function') {
                window.MonolothUpdater.checkFromFooter();
            }
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
            var isGif = isGifUrl(config.imageUrl);
            var isDataUrl = config.imageUrl.indexOf('data:') === 0;
            var cacheBust = (isDataUrl || isGif) ? '' : cacheBustParam(config.imageUrl);
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

    // getTerminalLightTheme / getTerminalDarkTheme moved to theme.js (window.MonolithTheme)

    function applyTerminalBg(config) {
        var term = window.MonolithTerminal && window.MonolithTerminal.getTerm();
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
            var existing = {};
            try { existing = Object.assign({}, term.getOption('theme')); } catch (e) {}
            existing.background = themeBg;

            var textTheme = isLight ? window.MonolithTheme.getTerminalLightTheme() : window.MonolithTheme.getTerminalDarkTheme();
            Object.assign(existing, textTheme);

            if (layer === 'overlay') {
                existing.black = '#000000';
            } else if (config.type !== 'none') {
                existing.black = 'rgba(10, 10, 10, 0)';
            } else {
                existing.black = '#0a0a0a';
            }

            term.setOption('theme', existing);
        } catch (e) { /* ignore */ }
    }

    function applyProfileBackground(appearance) {
        if (!appearance) return;
        var config = {
            type: appearance.bg_type || 'none',
            image: appearance.bg_image || '',
            imageUrl: '',
            dataUrl: '',
            color: appearance.bg_color || '#0a0a0a',
            gradient: appearance.bg_gradient || '',
            transparency: appearance.bg_transparency != null ? appearance.bg_transparency : 75,
            bgLayer: appearance.bg_layer || 'behind'
        };
        var applyNow = function () {
            applyBackground(config);
            if (config.type === 'image' && config.image) {
                window.MonolithTheme.setWallpaperBrightness(null);
                window.MonolithTheme.analyzeWallpaperBrightness(config.image);
            } else if (config.type === 'color' && config.color) {
                window.MonolithTheme.setWallpaperBrightness(window.MonolithTheme.hexToLuminance(config.color));
            } else if (config.type === 'gradient' && config.gradient) {
                window.MonolithTheme.setWallpaperBrightness(window.MonolithTheme.computeAverageBrightnessFromGradient(config.gradient));
            } else {
                window.MonolithTheme.setWallpaperBrightness(null);
            }
        };
        if (config.type === 'image' && config.image) {
            var core = window.__TAURI__ && window.__TAURI__.core;
            if (core && typeof core.invoke === 'function') {
                core.invoke('read_image_as_data_url', { imagePath: config.image })
                    .then(function (dataUrl) {
                        config.dataUrl = dataUrl;
                        config.imageUrl = dataUrl;
                        applyNow();
                    })
                    .catch(function () { applyNow(); });
            } else {
                applyNow();
            }
        } else {
            applyNow();
        }
    }

    function applyTerminalOverlay(config) {
        if (!terminalBgOverlay) return;
        var layer = config.bgLayer || 'behind';
        if (layer === 'overlay' && config.type !== 'none') {
            var isGifOverlay = false;
            if (config.imageUrl) {
                isGifOverlay = isGifUrl(config.imageUrl);
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
            var host = document.getElementById('main-tab-host');
            if (host) host.style.backgroundColor = '#000000';
        } else {
            terminalBgOverlay.style.display = 'none';
            var tc2 = document.getElementById('main-tab-host');
            if (tc2) tc2.style.backgroundColor = '';
            var terminalGifCleanup = document.getElementById('terminal-bg-gif-img');
            if (terminalGifCleanup) { terminalGifCleanup.remove(); }
        }
    }

    var _bgPreviewToken = 0;
    function renderBgPreview(config) {
        var previewThumb = document.getElementById('bg-preview-thumb');
        if (!previewThumb) return;
        var placeholder = previewThumb.querySelector('.bg-preview-placeholder');
        var type = config.type || 'none';
        var existingPreviewGif = previewThumb.querySelector('.bg-preview-gif');
        var myToken = ++_bgPreviewToken;

        if (type === 'image' && config.imageUrl) {
            var isGif = isGifUrl(config.imageUrl);
            var isDataUrl = config.imageUrl.indexOf('data:') === 0;
            var cacheBust = isDataUrl ? '' : cacheBustParam(config.imageUrl);
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
                    if (myToken !== _bgPreviewToken) return;
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
                    if (myToken !== _bgPreviewToken) return;
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
            if (placeholder) { placeholder.style.display = 'none'; }
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
        var bgDependent = document.querySelectorAll('.bg-dependent');
        bgDependent.forEach(function (el) {
            el.style.display = type !== 'none' ? '' : 'none';
        });
    }

    var _loadBackgroundConfigRetries = 0;
    function loadBackgroundConfig() {
        if (!window.monolithApi) return Promise.resolve();
        if (typeof window.monolithApi.get_background_config !== 'function') {
            if (_loadBackgroundConfigRetries < 10) {
                _loadBackgroundConfigRetries++;
                setTimeout(loadBackgroundConfig, 300);
            }
            return Promise.resolve();
        }
        _loadBackgroundConfigRetries = 0;
        var configPromise = _editingProfile
            ? window.monolithApi.get_background_config_for_profile(_editingProfile)
            : window.monolithApi.get_background_config();
        return configPromise
            .then(function (config) {
                if (!config) return;
                applyBackground(config);
                renderBgPreview(config);
                updateBgTypeUI(config.type);

                // Theme mode
                var themeMode = config.themeMode || 'dark';
                window.MonolithTheme.applyTheme(themeMode);
                updateThemeUI(themeMode);

                // CTA button style
                var ctaStyle = config.ctaButtonStyle || 'blur';
                window.MonolithTheme.applyCtaStyle(ctaStyle);
                updateCtaStyleUI(ctaStyle);

                // Background layer
                var bgLayer = config.bgLayer || 'behind';
                updateBgLayerUI(bgLayer);

                // Analyze background brightness for auto theme
                if (config.type === 'image' && config.image) {
                    // Clear stale brightness (from a previous color/gradient) until the
                    // new image analysis finishes; otherwise auto theme may briefly apply
                    // against a brightness that no longer matches the wallpaper.
                    window.MonolithTheme.setWallpaperBrightness(null);
                    if (window.MonolithTheme.getThemeMode() === 'auto') {
                        document.body.classList.remove('light-mode', 'adaptive-light');
                    }
                    window.MonolithTheme.analyzeWallpaperBrightness(config.image);
                } else if (config.type === 'color' && config.color) {
                    window.MonolithTheme.setWallpaperBrightness(window.MonolithTheme.hexToLuminance(config.color));
                    if (window.MonolithTheme.getThemeMode() === 'auto') {
                        window.MonolithTheme.applyTheme('auto');
                    }
                } else if (config.type === 'gradient' && config.gradient) {
                    window.MonolithTheme.setWallpaperBrightness(window.MonolithTheme.computeAverageBrightnessFromGradient(config.gradient));
                    if (window.MonolithTheme.getThemeMode() === 'auto') {
                        window.MonolithTheme.applyTheme('auto');
                    }
                } else {
                    window.MonolithTheme.setWallpaperBrightness(null);
                    if (window.MonolithTheme.getThemeMode() === 'auto') {
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
        var image = _bgType === 'image' ? (_bgImagePath || undefined) : undefined;
        var color = _bgType === 'color' ? (_currentColor || undefined) : undefined;
        var gradient = _bgType === 'gradient' ? (_currentGradient || undefined) : undefined;
        saveBackground(_bgType, { image: image, color: color, gradient: gradient }, msg);
    }

    function saveBackground(type, extras, msg) {
        if (!window.monolithApi) return;
        var slider = document.getElementById('bg-transparency-slider');
        var transparency = slider ? parseInt(slider.value, 10) : 75;
        var args = [type, extras.image, extras.color, extras.gradient, transparency, window.MonolithTheme.getThemeMode(), window.MonolithTheme.getCtaStyle(), _bgLayer, _editingProfile];
        window.monolithApi.set_background_config.apply(null, args)
            .then(function (result) {
                if (result && result.success === false) {
                    showStatus('appearance-status', 'Failed to save: ' + (result.error || 'Unknown error'), true);
                    return;
                }
                loadBackgroundConfig();
                if (msg) showStatus('appearance-status', msg, false);
            })
            .catch(function (err) {
                console.error('Failed to save background config:', err);
                showStatus('appearance-status', 'Failed to save: ' + err, true);
            });
    }

    // --- Appearance Tab Event Handlers ---

    // Theme selector
    var themeBtns = document.querySelectorAll('#theme-selector .theme-btn');
    themeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var mode = this.dataset.theme;
            window.MonolithTheme.applyTheme(mode);
            updateThemeUI(mode);
            saveAppearanceSettings('Theme changed.');
        });
    });

    // CTA style selector
    var ctaStyleBtns = document.querySelectorAll('.cta-style-btn');
    ctaStyleBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var style = this.dataset.style;
            window.MonolithTheme.applyCtaStyle(style);
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

            if (type === 'none') {
                saveBackground('none', { image: null, color: null, gradient: null }, 'Background cleared.');
                return;
            }
            var extras = {
                image: _bgImagePath || null,
                color: _currentColor || null,
                gradient: _currentGradient || null
            };
            saveBackground(type, extras, 'Background type changed.');
        });
    });

    // Image picker
    var bgPickBtn = document.getElementById('bg-pick-btn');
    if (bgPickBtn) {
        bgPickBtn.addEventListener('click', function () {
            window.MonolithFilePicker.pickPath({ id: 'bg', title: 'Choose Background Image', mode: 'file', filter: null })
                .then(function (filePath) {
                    if (!filePath) return;
                    saveBackground('image', { image: filePath, color: null, gradient: null }, 'Background image set.');
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
            _bgTransparency = parseInt(this.value, 10);
            saveAppearanceSettings('Transparency updated.');
        });
    }

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
        if (!window.monolithApi) return Promise.resolve();
        return window.monolithApi.get_startup_config(_editingProfile)
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
            showStatus('startup-status', 'Please enter a custom command.', true);
            return;
        }
        window.monolithApi.set_startup_config(cmd, _startupConfig.type, _editingProfile)
            .then(function () {
                updateMainUILabels();
                var label = getStartupLabel();
                showStatus('startup-status', 'Startup command saved: ' + label, false);
            })
            .catch(function () {
                showStatus('startup-status', 'Failed to save.', true);
            });
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
        window.monolithApi.get_secondary_commands(_editingProfile)
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
            var optHidden = document.createElement('option');
            optHidden.value = 'hidden';
            optHidden.textContent = 'Hidden';
            modeSelect.appendChild(optBefore);
            modeSelect.appendChild(optParallel);
            modeSelect.appendChild(optHidden);
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
            if (window.MonolothTooltip) {
                window.MonolothTooltip.attach(removeBtn, 'Remove this command');
            }
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
        window.monolithApi.set_secondary_commands(_secondaryCommands, _editingProfile)
            .then(function () {
                showStatus('secondary-cmd-status', 'Secondary commands saved.', false);
            })
            .catch(function () {
                showStatus('secondary-cmd-status', 'Failed to save.', true);
            });
    }

    var addSecondaryCmdBtn = document.getElementById('add-secondary-cmd-btn');
    if (addSecondaryCmdBtn) {
        addSecondaryCmdBtn.addEventListener('click', function () {
            _secondaryCommands.push({ command: '', mode: 'before', enabled: true });
            renderSecondaryCommands();
            saveSecondaryCommands();
        });
    }

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
            window.MonolithShortcuts.resetShortcut(key, function () {
                window.MonolithShortcuts.renderShortcutUI();
                window.MonolithShortcuts.updateKbdHint();
                showShortcutsStatus('Reset to default', false);
            });
        });
    });

    function startEditingShortcut(key) {
        _editingShortcutKey = key;
        _editingShortcutKeys = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
        if (shortcutEditMode) {
            shortcutEditMode.style.display = '';
            shortcutEditMode.style.animation = 'tabFadeIn 0.2s ease';
        }
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
            var allShortcuts = window.MonolithShortcuts.getAllShortcuts();
            for (var k in allShortcuts) {
                if (k !== _editingShortcutKey && allShortcuts[k] === newShortcut) {
                    if (shortcutEditError) shortcutEditError.textContent = 'Conflicts with ' + k.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
                    return;
                }
            }
            window.MonolithShortcuts.setShortcut(_editingShortcutKey, newShortcut, function () {
                window.MonolithShortcuts.renderShortcutUI();
                window.MonolithShortcuts.updateKbdHint();
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
            _editingShortcutKeys.key = window.MonolithShortcuts.normalizeKeyName(key);
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
        showStatus('shortcuts-status', msg, isError);
    }

    // Click status to dismiss

    // --- Show Terminal View ---
    function showTerminal(dir) {
        var launchToken = ++_launchToken;
        setCurrentView('terminal');
        _currentLaunchDir = dir;
        // Dispose any existing main tabs (fresh launch).
        window.MonolithTerminal.dispose();
        if (landing) landing.classList.add('hidden');
        if (settingsPage) {
            settingsPage.classList.remove('active');
            settingsPage.classList.remove('anim-exit');
        }
        if (terminalView) {
            terminalView.classList.add('active');
            terminalView.classList.remove('anim-exit');
            terminalView.classList.add('anim-enter');
            terminalView.addEventListener('animationend', function handler() {
                terminalView.classList.remove('anim-enter');
                terminalView.removeEventListener('animationend', handler);
            });
        }
        // Create a fresh tab with the chosen directory.
        window.MonolithTerminal.initTerminal(dir);
        var bgConfigReady = loadBackgroundConfig();
        if (typeof window.SidebarManager !== 'undefined') {
            window.SidebarManager.show();
            Promise.resolve(bgConfigReady).then(function () {
                window.SidebarManager.restorePanelState();
            });
        }
    }

    // --- Back to Landing ---
    function backToLanding() {
        setCurrentView('landing');
        _editingProfile = null;
        loadStartupConfig();
        // Close all panel tabs (unchanged).
        if (typeof window.SidebarManager !== 'undefined') {
            if (typeof window.SidebarManager.getAllTabs === 'function') {
                var tabsSnap = window.SidebarManager.getAllTabs().slice();
                tabsSnap.forEach(function (t) { window.SidebarManager.closeTab(t.id, true); });
            }
            window.SidebarManager.hideCmdPanel(false);
        }
        // Dispose all main tabs (terminates PTYs + disposes xterms).
        window.MonolithTerminal.dispose();
        if (settingsPage) {
            settingsPage.classList.remove('active');
            settingsPage.classList.remove('anim-exit');
        }
        if (terminalView) {
            terminalView.classList.add('anim-exit');
            setTimeout(function () {
                terminalView.classList.remove('active', 'anim-exit');
            }, 200);
        }
        if (landing) {
            landing.classList.remove('hidden');
            landing.classList.add('anim-enter');
            landing.addEventListener('animationend', function handler() {
                landing.classList.remove('anim-enter');
                landing.removeEventListener('animationend', handler);
            });
        }
        var existingGif = document.getElementById('bg-gif-img');
        if (existingGif) existingGif.remove();
        var terminalGif = document.getElementById('terminal-bg-gif-img');
        if (terminalGif) terminalGif.remove();
        window.MonolithTerminal.setRunning(false);
        _panelRunning = false;
        loadBackgroundConfig();
    }

    var terminalBackBtn = document.getElementById('terminal-back-btn');
    if (terminalBackBtn) {
        terminalBackBtn.addEventListener('click', function () {
            if (window.MonolithTerminal.anyRunning()) {
                window.MonolithDialog.confirmBackToLauncher()
                    .then(function () { backToLanding(); })
                    .catch(function () {});
            } else {
                backToLanding();
            }
        });
    }


    // buildTerminalWindowsOptions + initTerminal moved to terminal.js (window.MonolithTerminal)


    function isTypingInMainTerminalOrInput() {
        var el = document.activeElement;
        if (!el) return false;
        var isXtermHelper = el.classList && el.classList.contains('xterm-helper-textarea');
        var inMainTerm = isXtermHelper && !el.closest('#cmd-panel');
        var inTextField = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !isXtermHelper;
        return inMainTerm || inTextField;
    }

    document.addEventListener('keydown', function (e) {
        if (_editingShortcutKey && shortcutEditMode && shortcutEditMode.style.display !== 'none') return;
        if (window.MonolithFilePicker && window.MonolithFilePicker.isActive()) return;

        if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('command_palette'))) {
            e.preventDefault();
            if (window.MonolithPalette.isActive()) {
                window.MonolithPalette.close();
            } else {
                window.MonolithPalette.open();
            }
        }
        if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('settings'))) {
            e.preventDefault();
            if (settingsPage && settingsPage.classList.contains('active')) {
                hideSettings();
            } else {
                showSettings();
            }
        }
        if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('toggle_sidebar'))) {
            e.preventDefault();
            if (typeof window.SidebarManager !== 'undefined') window.SidebarManager.toggleSidebar();
        }
        if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('cmd_panel'))) {
            e.preventDefault();
            if (typeof window.SidebarManager !== 'undefined') window.SidebarManager.toggleCmdPanel();
        }
        if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('new_main_tab'))) {
            // Only create main tabs when the terminal view is active.
            var isTermView = document.getElementById('terminal-view');
            if (!isTermView || !isTermView.classList.contains('active')) return;
            if (isTypingInMainTerminalOrInput()) return;
            e.preventDefault();
            // Open the file picker + profile picker flow (shared with the + button).
            if (typeof window.MonolithTerminal !== 'undefined' && typeof window.MonolithTerminal.promptNewTab === 'function') {
                window.MonolithTerminal.promptNewTab();
            }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 'w') {
            if (typeof window.SidebarManager !== 'undefined' && window.SidebarManager.isPanelOpen() && window.SidebarManager.getTabCount() > 0) {
                if (isTypingInMainTerminalOrInput()) return;
                e.preventDefault();
                var activeTab = window.SidebarManager.getActiveTab();
                if (activeTab) window.SidebarManager.closeTab(activeTab.id);
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
            if (typeof window.SidebarManager !== 'undefined' && window.SidebarManager.getTabCount() > 1) {
                if (isTypingInMainTerminalOrInput()) return;
                e.preventDefault();
                var tabsA = window.SidebarManager.getAllTabs();
                var activeTabA = window.SidebarManager.getActiveTab();
                if (activeTabA) {
                    var idxA = tabsA.indexOf(activeTabA);
                    var nextIdx = e.shiftKey
                        ? (idxA - 1 + tabsA.length) % tabsA.length
                        : (idxA + 1) % tabsA.length;
                    window.SidebarManager.activateTab(tabsA[nextIdx].id);
                }
            }
        }
        if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
            if (typeof window.SidebarManager !== 'undefined') {
                if (isTypingInMainTerminalOrInput()) return;
                e.preventDefault();
                var tabIndex = parseInt(e.key, 10) - 1;
                var tabsB = window.SidebarManager.getAllTabs();
                if (tabsB[tabIndex]) window.SidebarManager.activateTab(tabsB[tabIndex].id);
            }
        }
        if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('clear_terminal'))) {
            e.preventDefault();
            var _ct = window.MonolithTerminal.getTerm();
            if (_ct) _ct.clear();
        }
        if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('switch_profile'))) {
            e.preventDefault();
            window.MonolithProfiles.openProfileSwitcher();
        }
        if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('back_to_launcher'))) {
            e.preventDefault();
            if (window.MonolithTerminal.isRunning()) {
                window.MonolithDialog.confirmBackToLauncher()
                    .then(function() { backToLanding(); })
                    .catch(function() {});
            } else {
                backToLanding();
            }
        }
        if (e.code === 'Escape' && window.MonolithDialog.isDialogActive()) {
            window.MonolithDialog.closeDialog();
            return;
        }
        if (e.code === 'Escape' && window.MonolithProfiles.isSwitcherActive()) {
            window.MonolithProfiles.closeProfileSwitcher();
            return;
        }
        if (e.code === 'Escape' && window.MonolithPalette.isActive()) {
            if (window.MonolithPalette.isSubActive()) {
                window.MonolithPalette.exitSub();
            } else {
                window.MonolithPalette.close();
            }
            return;
        }
        if (e.code === 'Escape' && settingsPage && settingsPage.classList.contains('active') && !_editingShortcutKey) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            hideSettings();
            return;
        }
        if (window.MonolithPalette.isActive()) {
            window.MonolithPalette.handleNav(e);
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
    });

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

            var d = new Date(startTs * 1000);
            var date = d.getFullYear() + '-' +
                       String(d.getMonth() + 1).padStart(2, '0') + '-' +
                       String(d.getDate()).padStart(2, '0');
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
        if (!iso) return 0;
        var t = new Date(iso).getTime();
        if (isNaN(t)) return 0;
        return t / 1000;
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
                    }).catch(function () {});
                }
            })
            .catch(function () {});
    }

    function applyCustomTitlebarUI(enable, persist) {
        _useCustomTitlebar = enable;
        document.body.classList.toggle('custom-titlebar-active', enable);

        var toggleContainer = document.getElementById('titlebar-toggle');
        if (toggleContainer) {
            var activeMode = enable ? 'custom' : 'native';
            toggleContainer.querySelectorAll('.titlebar-toggle-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.titlebar === activeMode);
            });
        }

        if (persist !== false && window.monolithApi) {
            window.monolithApi.toggle_custom_titlebar(enable).catch(function () {});
        }

        if (window.SidebarManager && window.SidebarManager.applyTabBarPosition) {
            window.SidebarManager.applyTabBarPosition();
        }
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
                if (window.MonolithTerminal.isRunning()) {
                    window.MonolithDialog.confirmBackToLauncher()
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
                    var tab = window.MonolithTerminal.getActiveTab();
                    if (!tab) return;
                    window.MonolithTerminal.incrementSessionGeneration(tab.sessionId);
                    window.MonolithTerminal.setSkipNextEof(tab.sessionId, true);
                    var terminatePromise = (tab.running && window.monolithApi)
                        ? window.monolithApi.terminate_terminal(tab.sessionId)
                        : Promise.resolve();
                    terminatePromise.finally(function () {
                        window.MonolithTerminal.setSkipNextEof(tab.sessionId, false);
                        tab.running = false;
                        // Re-init the xterm for this tab (dispose + recreate).
                        if (tab.term) { try { tab.term.dispose(); } catch (e) {} tab.term = null; }
                        if (tab.fitAddon) { try { tab.fitAddon.dispose(); } catch (e) {} tab.fitAddon = null; }
                        tab.termDiv.innerHTML = '';
                        tab.firstOutput = true;
                        tab.busy = false;
                        window.MonolithTerminal.hideTabExitBanner(tab);
                        window.MonolithTerminal.initTabXterm(tab);
                        loadBackgroundConfig();
                    });
                }
            });
        }

        var tbMenu = document.getElementById('tb-menu');
        if (tbMenu) {
            tbMenu.addEventListener('click', function() {
                window.MonolithPalette.open();
            });
        }

        var tbMinimize = document.getElementById('tb-minimize');
        if (tbMinimize) {
            tbMinimize.addEventListener('click', function() {
                if (window.monolithApi) window.monolithApi.minimize_window().catch(function () {});
            });
        }

        var tbMaximize = document.getElementById('tb-maximize');
        if (tbMaximize) {
            tbMaximize.addEventListener('click', function() {
                if (window.monolithApi) {
                    window.monolithApi.toggle_maximize_window().then(function(result) {
                        _isMaximized = result.maximized;
                    });
                }
            });
        }

        var tbClose = document.getElementById('tb-close');
        if (tbClose) {
            tbClose.addEventListener('click', function() {
                if (window.MonolithTerminal.anyRunning()) {
                    window.MonolithDialog.showConfirm('Exit Monoloth', 'A terminal session is running. Exit anyway?', 'exit_monoloth')
                        .then(function() { if (window.monolithApi) window.monolithApi.close_window(); })
                        .catch(function() {});
                } else {
                    if (window.monolithApi) window.monolithApi.close_window().catch(function () {});
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

    // Add profile button â€” moved to profiles.js (window.MonolithProfiles)

    // Load profiles on init
    window.MonolithProfiles.loadProfiles();

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
            window.monolithApi.set_history_enabled(enabled).catch(function () {});
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
            window.MonolithDialog.showConfirm('Clear History', 'Delete all history data? This cannot be undone.', 'clear_history')
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
        getStartupLabel: function () { return getStartupLabel(); },
        getBgState: function () { return { type: _bgType, layer: _bgLayer, transparency: _bgTransparency }; },
        computeTerminalBg: function (cfg) { return computeTerminalBg(cfg); },
        applyTerminalBg: function (cfg) { applyTerminalBg(cfg); },
        applyProfileBackground: function (appearance) { applyProfileBackground(appearance); },
        setEditingProfile: function (name) { _editingProfile = name || null; },
        getEditingProfile: function () { return _editingProfile; },
        showConfirm: function (t, m, k) { return window.MonolithDialog.showConfirm(t, m, k); },
        restartSession: function (sessionId) {
            sessionId = sessionId || 'main';
            if (sessionId === 'main' || sessionId.startsWith('main-tab-')) {
                var tab = window.MonolithTerminal.getTabBySessionId(sessionId);
                if (!tab) {
                    // Fallback: if no exact match for 'main', use active tab.
                    if (sessionId === 'main') tab = window.MonolithTerminal.getActiveTab();
                    if (!tab) return;
                }
                window.MonolithTerminal.incrementSessionGeneration(tab.sessionId);
                if (tab.running) {
                    window.MonolithTerminal.setSkipNextEof(tab.sessionId, true);
                    window.monolithApi.terminate_terminal(tab.sessionId)
                        .catch(function () {})
                        .finally(function () {
                            window.MonolithTerminal.setSkipNextEof(tab.sessionId, false);
                            tab.running = false;
                            if (tab.term) { try { tab.term.dispose(); } catch (e) {} tab.term = null; }
                            if (tab.fitAddon) { try { tab.fitAddon.dispose(); } catch (e) {} tab.fitAddon = null; }
                            tab.termDiv.innerHTML = '';
                            tab.firstOutput = true;
                            tab.busy = false;
                            window.MonolithTerminal.hideTabExitBanner(tab);
                            window.MonolithTerminal.initTabXterm(tab);
                        });
                } else {
                    if (tab.term) { try { tab.term.dispose(); } catch (e) {} tab.term = null; }
                    if (tab.fitAddon) { try { tab.fitAddon.dispose(); } catch (e) {} tab.fitAddon = null; }
                    tab.termDiv.innerHTML = '';
                    tab.firstOutput = true;
                    window.MonolithTerminal.hideTabExitBanner(tab);
                    window.MonolithTerminal.initTabXterm(tab);
                }
            } else if (sessionId.startsWith('panel-tab-')) {
                if (typeof window.SidebarManager === 'undefined' || typeof window.SidebarManager.getTab !== 'function') return;
                var tabId = sessionId.replace('panel-', '');
                var tab = window.SidebarManager.getTab(tabId);
                if (!tab) return;
                window.MonolithTerminal.incrementSessionGeneration(sessionId);
                window.MonolithTerminal.setSkipNextEof(sessionId, true);
                var restartPromise = window.monolithApi
                    ? window.monolithApi.terminate_terminal(sessionId).catch(function () {})
                    : Promise.resolve();
                restartPromise.finally(function () {
                    window.MonolithTerminal.setSkipNextEof(sessionId, false);
                    tab = window.SidebarManager.getTab(tabId);
                    if (!tab) return;
                    if (tab.term) {
                        try { tab.term.dispose(); } catch (e) {}
                        try { tab.fitAddon.dispose(); } catch (e) {}
                        tab.term = null;
                        tab.fitAddon = null;
                    }
                    tab.running = false;
                    tab.busy = false;
                    tab.generation = null;
                    tab.closing = false;
                    if (window.MonolithTerminal.hasSkipNextEof(sessionId)) {
                        window.MonolithTerminal.deleteSkipNextEof(sessionId);
                    }
                    var terminalDiv = tab.container.querySelector('.cmd-panel-tab-terminal');
                    if (terminalDiv) terminalDiv.innerHTML = '';
                    window.SidebarManager.hideTabExitBanner(tab);
                    if (window.SidebarManager.getActiveTabId() === tabId) {
                        window.SidebarManager.initTabXterm(tab);
                    }
                });
            } else if (sessionId === 'panel') {
                if (_panelRunning) {
                    window.MonolithTerminal.incrementSessionGeneration('panel');
                    window.MonolithTerminal.setSkipNextEof('panel', true);
                    window.monolithApi.terminate_terminal('panel')
                        .catch(function () {})
                        .finally(function () { window.MonolithTerminal.setSkipNextEof('panel', false); _panelRunning = false; if (typeof window.SidebarManager !== 'undefined' && typeof window.SidebarManager.createTab === 'function') { window.SidebarManager.showCmdPanel(); window.SidebarManager.createTab(null, true, _currentLaunchDir); } });
                } else {
                    if (typeof window.SidebarManager !== 'undefined' && typeof window.SidebarManager.createTab === 'function') {
                        window.SidebarManager.showCmdPanel();
                        window.SidebarManager.createTab(null, true, _currentLaunchDir);
                    }
                }
            }

        },
        setSkipNextEof: function (sessionId, val) {
            window.MonolithTerminal.setSkipNextEof(sessionId, val);
        },
        setSessionGeneration: function (sessionId, gen) {
            window.MonolithTerminal.setSessionGeneration(sessionId, gen);
        },
        refitTerminals: function () {
            window.MonolithTerminal.refit();
            if (typeof window.SidebarManager !== 'undefined' && typeof window.SidebarManager.refitActiveTab === 'function') {
                window.SidebarManager.refitActiveTab();
            }
        },
        isMainActive: function () { return window.MonolithTerminal.anyRunning(); },
        switchTab: switchTab,
        backToLanding: function () { backToLanding(); },
        showTerminal: function (dir) { showTerminal(dir); },
        showSettings: function () { showSettings(); },
        clearTerminal: function () { var t = window.MonolithTerminal.getTerm(); if (t) t.clear(); },
        copyToClipboard: function (t) { copyToClipboard(t); },
        openProfileSwitcher: function () { window.MonolithProfiles.openProfileSwitcher(); },
        showStatus: function (id, msg, isError) { showStatus(id, msg, isError); },
        addToRecentDirectories: function (path) { addToRecentDirectories(path); },
        reloadProfileSettings: function () {
            loadBackgroundConfig();
            loadStartupConfig();
            loadSecondaryCommands();
            window.MonolithShortcuts.loadShortcuts(function () { window.MonolithShortcuts.renderShortcutUI(); window.MonolithShortcuts.updateKbdHint(); });
        },
        reloadStartupConfig: function () {
            loadStartupConfig();
        }
    };

    // Auto-check for updates (silent on failure, see MonolothUpdater.init)
    if (window.MonolothUpdater && typeof window.MonolothUpdater.init === 'function') {
        window.MonolothUpdater.init();
    }

    // Scan for [data-tooltip] elements after all DOM is ready
    if (window.MonolothTooltip) {
        window.MonolothTooltip.scan(document.body);
    }

})();
