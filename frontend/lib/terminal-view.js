(function () {
    'use strict';

    function buildWindowsOptions() {
        var info = window.__monolithWindowsPty;
        if (info && info.backend && typeof info.buildNumber === 'number') {
            return { windowsPty: { backend: info.backend, buildNumber: info.buildNumber } };
        }
        return {};
    }

    window.MonolithTerminalView = {
        create: function (opts) {
            var termDiv = opts.terminalDiv;
            if (!termDiv || typeof Terminal === 'undefined') return Promise.resolve(null);

            var defaults = {
                allowTransparency: opts.allowTransparency !== false,
                theme: opts.theme || {},
                fontFamily: '"Cascadia Mono", "Consolas", "Lucida Console", "Courier New", monospace',
                fontSize: opts.fontSize || 14,
                cursorBlink: true,
                cursorStyle: 'block',
                scrollback: 2000,
                smoothScrollDuration: 0,
                scrollOnUserInput: true,
                scrollSensitivity: 1,
                allowProposedApi: true,
                minimumContrastRatio: 1,
                fastScrollModifier: 'alt',
                fastScrollSensitivity: 5
            };

            var termOptions = Object.assign({}, defaults, opts.extraTermOptions || {});
            Object.assign(termOptions, buildWindowsOptions());

            var term = new Terminal(termOptions);
            var fitAddon = (typeof FitAddon !== 'undefined') ? new FitAddon.FitAddon() : null;
            if (fitAddon) term.loadAddon(fitAddon);
            term.open(termDiv);

            if (opts.startLabel) {
                term.writeln('');
                term.writeln('Monoloth Terminal');
                if (opts.dir) term.writeln('Directory: ' + (opts.dir || ''));
                term.writeln('Starting ' + opts.startLabel + '...');
                term.writeln('');
            }

            if (opts.customKeyHandler) {
                term.attachCustomKeyEventHandler(opts.customKeyHandler);
            }

            if (opts.pasteHandler) {
                term.element.addEventListener('paste', opts.pasteHandler);
            }

            if (opts.contextMenuHandler) {
                termDiv.addEventListener('contextmenu', opts.contextMenuHandler);
            }

            if (opts.onData) {
                term.onData(opts.onData);
            } else {
                term.onData(function (data) {
                    if (window.monolithApi && opts.sessionId) {
                        window.monolithApi.send_input(opts.sessionId, data).catch(function () {});
                    }
                    if (data.indexOf('\r') !== -1) {
                        if (opts.busyOnEnter === 'delayed') {
                            if (opts._busyTimer) clearTimeout(opts._busyTimer);
                            opts._busyTimer = setTimeout(function () {
                                opts._busyTimer = null;
                                if (opts.onBusyChange) opts.onBusyChange(true);
                            }, 500);
                        } else {
                            if (opts.onBusyChange) opts.onBusyChange(true);
                        }
                    }
                });
            }

            if (opts.focus !== false) term.focus();

            var refs = { term: term, fitAddon: fitAddon };
            if (opts.onTermCreated) opts.onTermCreated(refs);

            if (!window.monolithApi) {
                term.writeln('Error: Bridge not available.');
                return Promise.resolve(refs);
            }

            return new Promise(function (resolve) {
                if (!fitAddon) { resolve({ cols: term.cols || 80, rows: term.rows || 24 }); return; }
                var attempts = 0;
                var prevDims = null;
                function tryFit() {
                    if (opts.abortCheck && opts.abortCheck()) { resolve(null); return; }
                    try { fitAddon.fit(); } catch (e) {}
                    var dims;
                    try { dims = fitAddon.proposeDimensions(); } catch (e) {}
                    if (dims && dims.cols > 0 && dims.rows > 0) {
                        if (prevDims && prevDims.cols === dims.cols && prevDims.rows === dims.rows) {
                            resolve(dims);
                            return;
                        }
                        prevDims = { cols: dims.cols, rows: dims.rows };
                    }
                    if (++attempts > 30) { resolve(prevDims || { cols: term.cols || 80, rows: term.rows || 24 }); return; }
                    requestAnimationFrame(tryFit);
                }
                tryFit();
            }).then(function (dims) {
                if (opts.abortCheck && opts.abortCheck()) return refs;
                var cols = dims ? dims.cols : (term.cols || 80);
                var rows = dims ? dims.rows : (term.rows || 24);
                return opts.startPty(cols, rows).then(function (result) {
                    if (opts.abortCheck && opts.abortCheck()) {
                        if (result && result.success && window.monolithApi) {
                            window.monolithApi.terminate_terminal(opts.sessionId).catch(function () {});
                        }
                        return refs;
                    }
                    if (opts.onPtyResult) opts.onPtyResult(result);
                    return refs;
                });
            }).catch(function (err) {
                if (opts.abortCheck && opts.abortCheck()) return refs;
                if (opts.onPtyError) opts.onPtyError(err);
                return refs;
            });
        },

        disposeTerminals: function (tab) {
            if (tab.term) {
                try { tab.term.dispose(); } catch (e) {}
                tab.term = null;
            }
            if (tab.fitAddon) {
                try { tab.fitAddon.dispose(); } catch (e) {}
                tab.fitAddon = null;
            }
        },

        resetTabSurface: function (tab, terminalSelector) {
            this.disposeTerminals(tab);
            var termDiv = tab.container ? tab.container.querySelector(terminalSelector) : null;
            if (termDiv) termDiv.innerHTML = '';
            tab.busy = false;
            tab.firstOutput = true;
            tab.running = false;
        }
    };
})();
