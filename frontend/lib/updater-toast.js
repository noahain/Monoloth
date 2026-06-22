(function () {
    'use strict';

    var STALL_TIMEOUT_MS = 2 * 60 * 1000;
    var CHECK_TIMEOUT_MS = 10000;

    var getCore = window.MonolothUI.getCore;

    var state = {
        current: 'IDLE',
        update: null,
        downloaded: 0,
        total: 0,
        lastProgressAt: 0,
        stallTimer: null,
        abortController: null,
        mounted: null,
        cancelled: false
    };
    var _autoCheckToken = 0;

    function classifyError(e) {
        var msg = String((e && e.message) || e);
        if (/signature|verify/i.test(msg))                       return 'SIGNATURE';
        if (/rate.?limit|403/i.test(msg))                        return 'RATE_LIMIT';
        if (/not.?found|404/i.test(msg))                         return 'NOT_FOUND';
        if (/network|fetch|timeout|tls|dns/i.test(msg))         return 'NETWORK';
        if (/permission|access.?denied/i.test(msg))              return 'PERMISSION';
        if (/another.?instance|file.?in.?use/i.test(msg))        return 'IN_USE';
        return 'UNKNOWN';
    }

    function clearStallTimer() {
        if (state.stallTimer) {
            clearTimeout(state.stallTimer);
            state.stallTimer = null;
        }
    }

    function armStallTimer() {
        clearStallTimer();
        state.stallTimer = setTimeout(function () {
            if (state.current === 'DOWNLOADING' || state.current === 'MINI_PILL') {
                window.MonolothUpdater.handleStall();
            }
        }, STALL_TIMEOUT_MS);
    }

    function touchProgress() {
        state.lastProgressAt = Date.now();
        armStallTimer();
    }

    function ensureContainer() {
        var c = document.getElementById('monolith-updater-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'monolith-updater-container';
            document.body.appendChild(c);
        }
        return c;
    }

    function buildToastHtml(update) {
        return ''
            + '<div class="update-toast" data-version="' + esc(update.version || '') + '">'
            +   '<div class="update-toast-header">'
            +     '<span class="update-toast-title">Update available</span>'
            +     '<button class="update-toast-close" aria-label="Dismiss">&times;</button>'
            +   '</div>'
            +   '<div class="update-toast-body">'
            +     '<p>Version <strong>v' + esc(update.version || '?') + '</strong> is ready to install.</p>'
            +     '<div class="update-toast-actions">'
            +       '<button class="update-toast-update btn-primary">Update</button>'
            +       '<button class="update-toast-cancel" hidden>Cancel</button>'
            +     '</div>'
            +     '<div class="update-toast-progress" hidden>'
            +       '<div class="update-toast-progress-bar"><div class="update-toast-progress-fill"></div></div>'
            +       '<span class="update-toast-progress-text">Downloading&hellip;</span>'
            +     '</div>'
            +     '<div class="update-toast-error" hidden></div>'
            +   '</div>'
            + '</div>';
    }

    function buildPillHtml(update) {
        return ''
            + '<div class="update-pill" data-version="' + esc(update.version || '') + '">'
            +   '<span class="update-pill-label">Updating v' + esc(update.version || '?') + '&hellip;</span>'
            +   '<button class="update-pill-restart btn-primary" hidden>Restart</button>'
            +   '<button class="update-pill-open" aria-label="Open">&hellip;</button>'
            +   '<button class="update-pill-close" aria-label="Dismiss">&times;</button>'
            + '</div>';
    }

    function esc(s) { return MonolothUI.escapeHtml(s); }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function setProgress(el, done, total) {
        var fill = el.querySelector('.update-toast-progress-fill');
        var text = el.querySelector('.update-toast-progress-text');
        if (total > 0) {
            var pct = Math.min(100, Math.round((done / total) * 100));
            if (pct === 0 && done > 0) pct = 1;
            if (fill) { fill.style.width = pct + '%'; fill.classList.remove('indeterminate'); }
            if (text) text.textContent = 'Downloading… ' + pct + '%';
        } else {
            if (fill) { fill.style.width = ''; fill.classList.add('indeterminate'); }
            if (text) {
                if (done > 0) {
                    text.textContent = 'Downloading… ' + formatBytes(done);
                } else {
                    text.textContent = 'Downloading…';
                }
            }
        }
    }

    function showErrorInToast(el, errorClass) {
        var errorEl = el.querySelector('.update-toast-error');
        var progressEl = el.querySelector('.update-toast-progress');
        var actionsEl = el.querySelector('.update-toast-actions');
        if (progressEl) progressEl.hidden = true;
        if (actionsEl) actionsEl.hidden = true;
        if (!errorEl) return;
        var copy = {
            SIGNATURE:  { title: 'Update verification failed', body: 'The downloaded file may have been tampered with. Please report this at github.com/noahain/Monoloth/issues. Do not install.' },
            RATE_LIMIT: { title: 'GitHub rate limit hit',       body: 'Try again in about an hour.' },
            NOT_FOUND:  { title: 'Release not found',            body: 'The repo may have moved or this version is no longer available.' },
            NETWORK:    { title: "Couldn't reach GitHub",        body: 'Check your connection and retry.' },
            PERMISSION: { title: "Couldn't install update",      body: 'Try closing other Monoloth instances, or run as administrator.' },
            IN_USE:     { title: 'Update file in use',           body: 'Close all running Monoloth instances and click Retry.' },
            UNKNOWN:    { title: 'Update failed',                body: 'See console for details. Click Retry to try again.' }
        }[errorClass] || { title: 'Update failed', body: 'Click Retry to try again.' };
        errorEl.innerHTML = ''
            + '<p class="update-toast-error-title"><strong>' + esc(copy.title) + '</strong></p>'
            + '<p>' + esc(copy.body) + '</p>'
            + '<div class="update-toast-actions">'
            +   '<button class="update-toast-retry btn-primary">Retry</button>'
            +   '<button class="update-toast-close">Dismiss</button>'
            + '</div>';
        errorEl.hidden = false;

        var retryBtn = errorEl.querySelector('.update-toast-retry');
        var closeBtn = errorEl.querySelector('.update-toast-close');
        if (retryBtn) retryBtn.addEventListener('click', function () { startDownload(); });
        if (closeBtn) closeBtn.addEventListener('click', removeMounted);
    }

    function removeMounted() {
        clearStallTimer();
        if (state.abortController) {
            try { state.abortController.abort(); } catch (_) {}
            state.abortController = null;
        }
        if (state.mounted && state.mounted.parentNode) {
            state.mounted.parentNode.removeChild(state.mounted);
        }
        state.mounted = null;
    }

    function cancelDownload() {
        clearStallTimer();
        if (state.abortController) {
            try { state.abortController.abort(); } catch (_) {}
            state.abortController = null;
        }
        state.downloaded = 0;
        state.total = 0;
        state.cancelled = true;
        state.current = 'AVAILABLE';

        if (state.mounted && state.mounted.classList.contains('update-toast')) {
            var progress = state.mounted.querySelector('.update-toast-progress');
            if (progress) progress.hidden = true;
            var actions = state.mounted.querySelector('.update-toast-actions');
            if (actions) {
                actions.hidden = false;
                var updateBtn = actions.querySelector('.update-toast-update');
                var cancelBtn = actions.querySelector('.update-toast-cancel');
                if (updateBtn) updateBtn.hidden = false;
                if (cancelBtn) cancelBtn.hidden = true;
            }
            setProgress(state.mounted, 0, 0);
        }
    }

    function mountToast(update) {
        if (state.mounted && state.mounted.classList.contains('update-toast')
            && state.mounted.getAttribute('data-version') === update.version) {
            return state.mounted;
        }
        removeMounted();
        var c = ensureContainer();
        c.insertAdjacentHTML('beforeend', buildToastHtml(update));
        var el = c.querySelector('.update-toast');
        state.mounted = el;
        state.current = 'AVAILABLE';
        state.update = update;
        wireToastEvents(el);
        return el;
    }

    function mountPill(update) {
        if (state.mounted && state.mounted.classList.contains('update-pill')
            && state.mounted.getAttribute('data-version') === update.version) {
            return state.mounted;
        }
        removeMounted();
        var c = ensureContainer();
        c.insertAdjacentHTML('beforeend', buildPillHtml(update));
        var el = c.querySelector('.update-pill');
        state.mounted = el;
        state.current = 'MINI_PILL';
        state.update = update;
        wirePillEvents(el);
        return el;
    }

    function wireToastEvents(el) {
        var closeBtn = el.querySelector('.update-toast-close');
        var updateBtn = el.querySelector('.update-toast-update');
        var cancelBtn = el.querySelector('.update-toast-cancel');
        if (closeBtn) closeBtn.addEventListener('click', removeMounted);
        if (updateBtn) updateBtn.addEventListener('click', function () { startDownload(); });
        if (cancelBtn) cancelBtn.addEventListener('click', function () { cancelDownload(); });
    }

    function wirePillEvents(el) {
        var closeBtn = el.querySelector('.update-pill-close');
        var openBtn = el.querySelector('.update-pill-open');
        var restartBtn = el.querySelector('.update-pill-restart');
        if (closeBtn) closeBtn.addEventListener('click', removeMounted);
        if (openBtn) openBtn.addEventListener('click', function () { mountToast(state.update); });
        if (restartBtn) restartBtn.addEventListener('click', function () { relaunch(); });
    }

    function setState(newState, data) {
        state.current = newState;
        if (!state.mounted) return;
        if (newState === 'DOWNLOADING' || newState === 'MINI_PILL') {
            if (data && data.done != null) state.downloaded = data.done;
            if (data && data.total != null) state.total = data.total;
        if (state.mounted.classList.contains('update-toast')) {
            var progress = state.mounted.querySelector('.update-toast-progress');
            if (progress) progress.hidden = false;
            var actions = state.mounted.querySelector('.update-toast-actions');
            if (actions) {
                actions.hidden = false;
                var updateBtn = actions.querySelector('.update-toast-update');
                var cancelBtn = actions.querySelector('.update-toast-cancel');
                if (updateBtn) updateBtn.hidden = true;
                if (cancelBtn) cancelBtn.hidden = false;
            }
            setProgress(state.mounted, state.downloaded, state.total);
        } else if (state.mounted.classList.contains('update-pill')) {
                var label = state.mounted.querySelector('.update-pill-label');
                if (label) label.textContent = 'Downloading v' + (state.update.version || '?') + '… ' + Math.round((state.downloaded / Math.max(1, state.total)) * 100) + '%';
            }
        } else if (newState === 'READY') {
            clearStallTimer();
            if (state.mounted.classList.contains('update-toast')) {
                var progress = state.mounted.querySelector('.update-toast-progress');
                var actions = state.mounted.querySelector('.update-toast-actions');
                if (progress) progress.hidden = true;
                if (actions) {
                    actions.innerHTML = '<button class="update-toast-restart btn-primary">Restart now</button>';
                    actions.hidden = false;
                    var restartBtn = state.mounted.querySelector('.update-toast-restart');
                    if (restartBtn) restartBtn.addEventListener('click', function () { relaunch(); });
                }
            } else if (state.mounted.classList.contains('update-pill')) {
                var pillLabel = state.mounted.querySelector('.update-pill-label');
                var pillRestart = state.mounted.querySelector('.update-pill-restart');
                if (pillLabel) pillLabel.textContent = 'v' + (state.update.version || '?') + ' ready';
                if (pillRestart) pillRestart.hidden = false;
            }
        } else if (newState === 'ERROR') {
            clearStallTimer();
            showErrorInToast(state.mounted, (data && data.errorClass) || 'UNKNOWN');
        }
    }

    function relaunch() {
        var process = window.__TAURI_PLUGIN_PROCESS__ || null;
        if (process && typeof process.relaunch === 'function') {
            process.relaunch();
        } else {
            var core = getCore();
            if (core) {
                core.invoke('plugin:process|restart');
                return;
            }
            console.error('Cannot relaunch: tauri-plugin-process not available');
        }
    }

    function startDownload() {
        if (!state.update) return;
        state.cancelled = false;
        state.abortController = new AbortController();
        state.downloaded = 0;
        state.total = 0;
        setState('DOWNLOADING', { done: 0, total: 0 });
        touchProgress();
        state.update.downloadAndInstall(function (event) {
            if (state.cancelled) return;
            if (event.event === 'started') {
                setState('DOWNLOADING', { done: 0, total: event.data.contentLength || 0 });
                touchProgress();
            } else if (event.event === 'progress') {
                setState('DOWNLOADING', { done: state.downloaded + (event.data.chunkLength || 0), total: state.total });
                touchProgress();
            } else if (event.event === 'finished') {
                setState('READY');
            }
        }, { signal: state.abortController.signal }).catch(function (e) {
            if (state.cancelled) return;
            console.warn('Update download failed:', e && e.message);
            if (state.mounted && state.mounted.classList.contains('update-toast')) {
                setState('ERROR', { errorClass: classifyError(e) });
            }
        });
    }

    function init() {
        tryCheck(1);
    }

    function tryCheck(retriesLeft) {
        var checkToken = ++_autoCheckToken;
        var timeoutId = setTimeout(function () {
            if (checkToken !== _autoCheckToken) return;
            console.warn('Auto-update check timed out');
            _autoCheckToken++;
            if (retriesLeft > 0) {
                setTimeout(function () { tryCheck(retriesLeft - 1); }, 5000);
            }
        }, CHECK_TIMEOUT_MS);

        try {
            var updater = window.__TAURI_PLUGIN_UPDATER__ || null;
            if (!updater) {
                clearTimeout(timeoutId);
                return;
            }
            updater.check().then(function (update) {
                if (checkToken !== _autoCheckToken) return;
                clearTimeout(timeoutId);
                if (update && update.available) {
                    mountToast(update);
                }
            }).catch(function (e) {
                if (checkToken !== _autoCheckToken) return;
                clearTimeout(timeoutId);
                console.warn('Auto-update check failed:', e && e.message);
                if (retriesLeft > 0) {
                    _autoCheckToken++;
                    setTimeout(function () { tryCheck(retriesLeft - 1); }, 5000);
                }
            });
        } catch (e) {
            if (checkToken !== _autoCheckToken) return;
            clearTimeout(timeoutId);
            console.warn('Auto-update check threw:', e && e.message);
            if (retriesLeft > 0) {
                _autoCheckToken++;
                setTimeout(function () { tryCheck(retriesLeft - 1); }, 5000);
            }
        }
    }

    function setStatusText(status, msg, isError) {
        if (window.MonolothApp && typeof window.MonolothApp.showStatus === 'function') {
            window.MonolothApp.showStatus('updater-status', msg, isError);
            return;
        }
        if (status) status.textContent = msg;
    }

    function checkFromFooter() {
        var btn = document.getElementById('check-update-btn');
        var status = document.getElementById('updater-status');
        if (btn) btn.disabled = true;
        setStatusText(status, 'Checking…', false);
        var updater = window.__TAURI_PLUGIN_UPDATER__ || null;
        if (!updater) {
            if (btn) btn.disabled = false;
            setStatusText(status, 'Updater not available', true);
            return;
        }
        var settled = false;
        var timeoutId = setTimeout(function () {
            if (settled) return;
            settled = true;
            if (btn) btn.disabled = false;
            setStatusText(status, 'Update check timed out.', true);
        }, CHECK_TIMEOUT_MS);
        updater.check().then(function (update) {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            if (btn) btn.disabled = false;
            if (update && update.available) {
                mountToast(update);
                setStatusText(status, 'Update available: v' + (update.version || '?'), false);
            } else {
                setStatusText(status, 'You are on the latest version.', false);
            }
        }).catch(function (e) {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            if (btn) btn.disabled = false;
            var msg = (e && e.message) || String(e);
            setStatusText(status, msg, true);
        });
    }

    window.MonolothUpdater = {
        _state: state,
        _classifyError: classifyError,
        _touchProgress: touchProgress,
        _clearStallTimer: clearStallTimer,
        _setCheckTimeoutForTest: function (ms) { CHECK_TIMEOUT_MS = ms; },
        mountToast: mountToast,
        mountPill: mountPill,
        removeMounted: removeMounted,
        setState: setState,
        startDownload: startDownload,
        relaunch: relaunch,
        init: init,
        checkFromFooter: checkFromFooter,
        handleStall: function () {
            clearStallTimer();
            if (state.mounted) {
                var copy = { title: 'Download seems stuck', body: 'Click Cancel to stop, or Retry to try again.' };
                if (state.mounted.classList.contains('update-toast')) {
                    var errorEl = state.mounted.querySelector('.update-toast-error');
                    var progressEl = state.mounted.querySelector('.update-toast-progress');
                    var actionsEl = state.mounted.querySelector('.update-toast-actions');
                    if (progressEl) progressEl.hidden = true;
                    if (actionsEl) actionsEl.hidden = true;
                    if (errorEl) {
                        errorEl.innerHTML = ''
                            + '<p class="update-toast-error-title"><strong>' + esc(copy.title) + '</strong></p>'
                            + '<p>' + esc(copy.body) + '</p>'
                            + '<div class="update-toast-actions">'
                            +   '<button class="update-toast-retry btn-primary">Retry</button>'
                            +   '<button class="update-toast-cancel">Cancel</button>'
                            + '</div>';
                        errorEl.hidden = false;
                        var retryBtn = errorEl.querySelector('.update-toast-retry');
                        var cancelBtn = errorEl.querySelector('.update-toast-cancel');
                        if (retryBtn) retryBtn.addEventListener('click', function () { startDownload(); });
                        if (cancelBtn) cancelBtn.addEventListener('click', function () {
                            if (state.abortController) { try { state.abortController.abort(); } catch (_) {} }
                            removeMounted();
                        });
                    }
                }
            }
        }
    };
})();
