// IIFE wrapper for process IPC.
// Lazily resolves window.__TAURI__ so it works regardless of script load timing.
(function () {
    'use strict';

    function relaunch() {
        var core = window.__TAURI_CORE__;
        if (!core) return Promise.reject(new Error('Tauri not available'));
        return core.invoke('plugin:process|restart');
    }

    window.__TAURI_PLUGIN_PROCESS__ = { relaunch: relaunch };
})();
