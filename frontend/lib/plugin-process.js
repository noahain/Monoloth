// IIFE wrapper replacing the broken ESM vendored process plugin.
// Monoloth's frontend has no build step, so we use window.__TAURI__.core directly.
(function () {
    'use strict';

    if (!window.__TAURI__ || !window.__TAURI__.core || !window.__TAURI__.core.invoke) {
        return;
    }

    var core = window.__TAURI__.core;

    function exit(code) {
        return core.invoke('plugin:process|exit', { code: code || 0 });
    }

    function relaunch() {
        return core.invoke('plugin:process|restart');
    }

    window.__TAURI_PLUGIN_PROCESS__ = { relaunch: relaunch, exit: exit };
})();
