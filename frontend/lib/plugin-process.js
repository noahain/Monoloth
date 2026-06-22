// IIFE wrapper for process IPC.
// Lazily resolves window.__TAURI__ so it works regardless of script load timing.
(function () {
    'use strict';

    var getCore = window.MonolothUI.getCore;

    function relaunch() {
        var core = getCore();
        if (!core) return Promise.reject(new Error('Tauri not available'));
        return core.invoke('plugin:process|restart');
    }

    window.__TAURI_PLUGIN_PROCESS__ = { relaunch: relaunch };
})();
