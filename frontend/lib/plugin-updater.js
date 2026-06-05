// IIFE wrapper replacing the broken ESM vendored updater plugin.
// Monoloth's frontend has no build step, so we use window.__TAURI__.core directly.
(function () {
    'use strict';

    if (!window.__TAURI__ || !window.__TAURI__.core || !window.__TAURI__.core.invoke) {
        return;
    }

    var core = window.__TAURI__.core;

    function check() {
        return core.invoke('plugin:updater|check').then(function (metadata) {
            if (!metadata) return null;
            return {
                available: true,
                version: metadata.version,
                currentVersion: metadata.currentVersion,
                notes: metadata.body != null ? String(metadata.body) : null,
                pubdate: metadata.date != null ? String(metadata.date) : null,
                downloadAndInstall: function (onEventCallback) {
                    var channel = new core.Channel();
                    if (typeof onEventCallback === 'function') {
                        channel.onmessage = onEventCallback;
                    }
                    return core.invoke('plugin:updater|download_and_install', {
                        rid: metadata.rid,
                        onEvent: channel
                    });
                }
            };
        });
    }

    window.__TAURI_PLUGIN_UPDATER__ = { check: check };
})();
