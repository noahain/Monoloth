// IIFE wrapper for process IPC.
// Lazily resolves window.__TAURI__ so it works regardless of script load timing.
(function () {
    'use strict';

    function getCore() {
        return window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke
            ? window.__TAURI__.core
            : null;
    }

    function exit(code) {
        var core = getCore();
        if (!core) return Promise.reject(new Error('Tauri not available'));
        return core.invoke('plugin:process|exit', { code: code || 0 });
    }

    function relaunch() {
        var core = getCore();
        if (!core) return Promise.reject(new Error('Tauri not available'));
        return core.invoke('plugin:process|restart');
    }

    window.__TAURI_PLUGIN_PROCESS__ = { relaunch: relaunch, exit: exit };
})();
