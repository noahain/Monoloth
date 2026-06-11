// IIFE wrapper for updater IPC.
// Lazily resolves window.__TAURI__ so it works regardless of script load timing.
(function () {
    'use strict';

    function getCore() {
        return window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke
            ? window.__TAURI__.core
            : null;
    }

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
                downloadAndInstall: function (onEventCallback) {
                    var channel = null;
                    if (typeof core.Channel === 'function') {
                        channel = new core.Channel();
                        if (typeof onEventCallback === 'function') {
                            channel.onmessage = onEventCallback;
                        }
                    }
                    var args = { rid: metadata.rid };
                    if (channel) args.onEvent = channel;
                    return core.invoke('plugin:updater|download_and_install', args).then(function () {
                        if (!channel && typeof onEventCallback === 'function') {
                            onEventCallback({ event: 'Finished', data: {} });
                        }
                    });
                }
            };
        });
    }

    window.__TAURI_PLUGIN_UPDATER__ = { check: check };
})();
