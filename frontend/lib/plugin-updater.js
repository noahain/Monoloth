// IIFE wrapper for updater IPC.
// Lazily resolves window.__TAURI__ so it works regardless of script load timing.
(function () {
    'use strict';

    var getCore = window.MonolothUI.getCore;

    function check() {
        var core = getCore();
        if (!core) return Promise.reject(new Error('Tauri not available'));
        return core.invoke('plugin:updater|check').then(function (metadata) {
            if (!metadata) return null;
            return {
                available: true,
                version: metadata.version,
                currentVersion: metadata.currentVersion,
                notes: metadata.body != null ? String(metadata.body) : null,
                pubdate: metadata.date != null ? String(metadata.date) : null,
                downloadAndInstall: function (onEventCallback, options) {
                    var signal = options && options.signal;
                    if (signal && signal.aborted) {
                        return Promise.reject(new Error('Aborted before start'));
                    }
                    var channel = new core.Channel();
                    channel.onmessage = function (event) {
                        if (typeof onEventCallback === 'function') {
                            onEventCallback(event);
                        }
                    };
                    var onAbort = function () {
                        core.invoke('cancel_update_download').catch(function () {});
                    };
                    if (signal) {
                        signal.addEventListener('abort', onAbort, { once: true });
                    }
                    function cleanup() {
                        if (signal) signal.removeEventListener('abort', onAbort);
                    }
                    var promise = core.invoke('start_update_download', { onEvent: channel });
                    return promise.then(function () {
                        cleanup();
                    }, function (e) {
                        cleanup();
                        throw e;
                    });
                }
            };
        });
    }

    window.__TAURI_PLUGIN_UPDATER__ = { check: check };
})();
