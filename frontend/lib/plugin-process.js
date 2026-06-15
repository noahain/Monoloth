// IIFE wrapper for process IPC.
// Lazily resolves window.__TAURI__ so it works regardless of script load timing.
(function () {
    'use strict';

    function getCore() {
        var candidates = [window.__TAURI_CORE__, window.__TAURI__ && window.__TAURI__.core, window.__TAURI_INTERNALS__];
        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i] && typeof candidates[i].invoke === 'function') {
                window.__TAURI_CORE__ = candidates[i];
                return candidates[i];
            }
        }
        return null;
    }

    function relaunch() {
        var core = getCore();
        if (!core) return Promise.reject(new Error('Tauri not available'));
        return core.invoke('plugin:process|restart');
    }

    window.__TAURI_PLUGIN_PROCESS__ = { relaunch: relaunch };
})();
