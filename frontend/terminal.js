(function () {
    'use strict';

    // --- Terminal Session Core (extracted from app.js) ---
    // Depends on: window.MonolithTheme, window.MonolithShortcuts, window.MonolothApp
    // (background hub + clipboard + startup label + backToLanding stay in app.js
    //  and are reached through the MonolothApp facade). Behavior-preserving move.

    const terminalContainer = document.getElementById('terminal');
    const terminalView = document.getElementById('terminal-view');

    let term = null;
    let fitAddon = null;
    let webglAddon = null;
    // Windows PTY compat info ({ backend, buildNumber }) fetched once at startup.
    // Drives xterm.js's windowsPty option so reflow heuristics match the real
    // ConPTY build. null until loaded or on non-Windows.
    var _windowsPtyInfo = null;
    var _resizeObserver = null;
    var _resizeHandler = null;
    var _contextMenuHandler = null;
    var _skipNextEof = {};  // Session-ID-keyed
    var _sessionGeneration = { main: 0 };  // Session-ID-keyed; tab sessions added dynamically
    var _terminalRunning = false;

    // Builds the xterm.js windows option from cached PTY info. Prefers the modern
    // windowsPty descriptor (correct reflow heuristics per ConPTY build); falls
    // back to nothing when info is unavailable. Returns an object to spread into
    // the Terminal config. Shared with sidebar.js via window.__monolithTermWinOpts.
    function buildTerminalWindowsOptions() {
        var info = window.__monolithWindowsPty || _windowsPtyInfo;
        if (info && info.backend && typeof info.buildNumber === 'number') {
            return { windowsPty: { backend: info.backend, buildNumber: info.buildNumber } };
        }
        return {};
    }
    window.__monolithTermWinOpts = buildTerminalWindowsOptions;

    function cleanupTerminalDomHandlers() {
        if (_resizeTimer) { clearTimeout(_resizeTimer); _resizeTimer = null; }
        if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }
        if (_resizeHandler) { window.removeEventListener('resize', _resizeHandler); _resizeHandler = null; }
        if (_contextMenuHandler) { terminalContainer.removeEventListener('contextmenu', _contextMenuHandler); _contextMenuHandler = null; }
    }

    // Teardown the main terminal (moved from backToLanding's term-teardown block).
    function dispose() {
        if (term) {
            try { term.dispose(); } catch (e) {}
            term = null;
            fitAddon = null;
            webglAddon = null;
        }
        if (terminalContainer) terminalContainer.innerHTML = '';
        cleanupTerminalDomHandlers();
    }

    // Coalesced resize machinery (shared by window-resize, ResizeObserver, the
    // refitTerminals facade, and the first-output settle). Hoisted to module
    // level so every trigger funnels through ONE debounce timer — multiple
    // separate timers previously let resize events race and push mismatched
    // sizes to ConPTY faster than the child app could repaint.
    var _resizeTimer = null;

    // Apply a single resize. Order matters: resize the PTY FIRST so the child
    // app's SIGWINCH-driven redraw targets the final dimensions, THEN resize
    // xterm to match. We deliberately do NOT force term.refresh() afterwards:
    // xterm re-renders on resize, and forcing a refresh paints the transitional
    // (half-reflowed) buffer. Diff-based TUI apps (opencode, vim) in the
    // alternate-screen buffer only repaint the cells they think changed, so any
    // garbage painted into the transitional frame is never overwritten — that
    // is the source of the "frozen edges + random middle characters" corruption.
    function applyResize() {
        if (!term || !fitAddon) return;
        var el = term.element || terminalContainer;
        if (!el || el.offsetParent === null) return;
        var dims;
        try { dims = fitAddon.proposeDimensions(); } catch (e) { return; }
        if (!dims || isNaN(dims.cols) || isNaN(dims.rows)) return;
        if (dims.cols === term.cols && dims.rows === term.rows) return;
        if (window.monolithApi) {
            try { window.monolithApi.resize_terminal('main', dims.cols, dims.rows); } catch (e) {}
        }
        try { term.resize(dims.cols, dims.rows); } catch (e) {}
    }

    // Debounced entry point for high-frequency triggers. The delay gives ConPTY
    // time to acknowledge and the child app time to repaint before the next one.
    function scheduleResize() {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(applyResize, 120);
    }

    // Public "fit now" used by the refitTerminals facade (view-enter, panel
    // toggle). applyResize is idempotent (early-returns when dimensions are
    // unchanged), so an immediate call here cannot conflict with a debounced
    // observer call that lands later with the same target size.
    function refit() {
        applyResize();
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
        term = new Terminal(termOptions);

        term.open(terminalContainer);
        term.focus();

        if (typeof FitAddon !== 'undefined') {
            fitAddon = new FitAddon.FitAddon();
            term.loadAddon(fitAddon);
        }

        requestAnimationFrame(function() {
            if (fitAddon) fitAddon.fit();
            if (window.monolithApi) {
                window.monolithApi.start_terminal('main', dir, true, null, term.cols, term.rows)
                    .then((result) => {
                        if (!result || !result.success) {
                            term.writeln('');
                            term.writeln('Failed to start ' + window.MonolothApp.getStartupLabel() + '. ' + (result && result.error ? result.error : 'Check that it is installed and in your PATH.'));
                        } else {
                            _terminalRunning = true;
                            if (result.generation) {
                                _sessionGeneration['main'] = result.generation;
                            }
                        }
                    })
                    .catch((err) => {
                        term.writeln('');
                        term.writeln('Error starting ' + window.MonolothApp.getStartupLabel() + ': ' + err);
                    });
            }
        });

        // --- Keyboard copy/paste shortcuts ---
        term.attachCustomKeyEventHandler((e) => {
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
            if ((e.ctrlKey && e.code === 'KeyV') || (e.shiftKey && e.code === 'Insert')) {
                return false;
            }
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyW') {
                return false;
            }
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('command_palette'))) {
                return false;
            }
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('settings'))) {
                return false;
            }
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('toggle_sidebar'))) {
                return false;
            }
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('cmd_panel'))) {
                return false;
            }
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('clear_terminal'))) {
                return false;
            }
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('switch_profile'))) {
                return false;
            }
            if (window.MonolithShortcuts.shortcutMatches(e, window.MonolithShortcuts.getShortcut('back_to_launcher'))) {
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
                        window.monolithApi.send_input('main', text).catch(function () {});
                    }
                }).catch(function () {});
            }
        };
        terminalContainer.addEventListener('contextmenu', _contextMenuHandler);

        function syncSize() {
            applyResize();
        }

        var _resizeListener = function () {
            scheduleResize();
        };
        window.addEventListener('resize', _resizeListener);
        _resizeHandler = _resizeListener;

        _resizeObserver = new ResizeObserver(function () {
            scheduleResize();
        });
        _resizeObserver.observe(terminalContainer);

        var firstOutput = true;
        var _exitCountdownInterval = null;
        var _exitBanner = null;

        function startSessionExitCountdown() {
            _terminalRunning = false;
            if (_exitCountdownInterval) { clearInterval(_exitCountdownInterval); _exitCountdownInterval = null; }
            if (_exitBanner && _exitBanner.parentNode) _exitBanner.remove();
            var exitBanner = document.createElement('div');
            exitBanner.className = 'session-exit-banner';
            exitBanner.style.cssText = 'position:absolute;bottom:40px;left:50%;transform:translateX(-50%);background:rgba(30,30,30,0.9);color:#c0c0c0;padding:8px 16px;border-radius:6px;font-family:monospace;font-size:13px;z-index:101;border:1px solid rgba(255,255,255,0.1);backdrop-filter:blur(4px);pointer-events:auto;cursor:pointer;';
            exitBanner.textContent = 'Session ended \u2014 returning to launcher in 5s (click to stay)';
            if (terminalView) terminalView.appendChild(exitBanner);
            _exitBanner = exitBanner;
            var countdown = 5;
            exitBanner.addEventListener('click', function () {
                if (_exitCountdownInterval) { clearInterval(_exitCountdownInterval); _exitCountdownInterval = null; }
                if (exitBanner.parentNode) exitBanner.remove();
            });
            _exitCountdownInterval = setInterval(function () {
                countdown--;
                if (countdown <= 0) {
                    clearInterval(_exitCountdownInterval);
                    _exitCountdownInterval = null;
                    if (exitBanner.parentNode) exitBanner.remove();
                    window.MonolothApp.backToLanding();
                } else {
                    exitBanner.textContent = 'Session ended \u2014 returning to launcher in ' + countdown + 's (click to stay)';
                }
            }, 1000);
        }

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
                        startSessionExitCountdown();
                        return;
                    }
                    term.write(data);
                    if (firstOutput) {
                        firstOutput = false;
                        setTimeout(syncSize, 1500);
                    }
                    if (typeof data === 'string' && data.indexOf('[session ended]') !== -1) {
                        startSessionExitCountdown();
                    }
                }
            } else if (sessionId.startsWith('panel-tab-')) {
                var tabId = sessionId.replace('panel-', '');
                if (typeof window.SidebarManager !== 'undefined' && window.SidebarManager.writeToTab) {
                    window.SidebarManager.writeToTab(tabId, data, eof);
                }
            } else if (sessionId === 'panel') {
                if (typeof window.SidebarManager !== 'undefined' && window.SidebarManager.writeToPanel) {
                    window.SidebarManager.writeToPanel(data, eof);
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

        window.MonolothApp.applyTerminalBg();

        term.writeln('');
        term.writeln('Monoloth Terminal');
        term.writeln('Directory: ' + dir);
        term.writeln('Starting ' + window.MonolothApp.getStartupLabel() + '...');
        term.writeln('');

        if (!window.monolithApi) {
            term.writeln('Error: Bridge not available.');
            return;
        }
    }

    window.MonolithTerminal = {
        initTerminal: initTerminal,
        getTerm: function () { return term; },
        refit: refit,
        dispose: dispose,
        setSkipNextEof: function (sessionId, val) { _skipNextEof[sessionId] = val; },
        setSessionGeneration: function (sessionId, gen) { _sessionGeneration[sessionId] = gen; },
        // Generation/skip helpers used by showTerminal/restartSession which stay in app.js.
        incrementSessionGeneration: function (sessionId) {
            _sessionGeneration[sessionId] = (_sessionGeneration[sessionId] || 0) + 1;
        },
        deleteSessionGeneration: function (sessionId) { delete _sessionGeneration[sessionId]; },
        hasSkipNextEof: function (sessionId) { return _skipNextEof[sessionId] !== undefined; },
        deleteSkipNextEof: function (sessionId) { delete _skipNextEof[sessionId]; },
        isRunning: function () { return _terminalRunning; },
        setRunning: function (v) { _terminalRunning = v; },
        setWindowsPtyInfo: function (info) { _windowsPtyInfo = info || null; }
    };
})();
