(function () {
    'use strict';

    if (!window.__TAURI_PLUGIN_UPDATER__ || !window.__TAURI_PLUGIN_PROCESS__) {
        return;
    }

    var UPDATER = window.__TAURI_PLUGIN_UPDATER__;
    var PROCESS = window.__TAURI_PLUGIN_PROCESS__;

    var STALL_TIMEOUT_MS = 2 * 60 * 1000;

    var state = {
        current: 'IDLE',
        update: null,
        downloaded: 0,
        total: 0,
        lastProgressAt: 0,
        stallTimer: null,
        abortController: null,
        mounted: null
    };

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

    window.MonolothUpdater = {
        _state: state,
        _classifyError: classifyError,
        _touchProgress: touchProgress,
        _clearStallTimer: clearStallTimer
    };
})();
