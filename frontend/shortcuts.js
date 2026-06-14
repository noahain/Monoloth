(function () {
    'use strict';

    function normalizeKeyName(key) {
        if (key === ' ') return 'Space';
        if (key === ',') return 'Comma';
        if (key === '.') return 'Period';
        if (key === '+') return 'Plus';
        if (key.length === 1) return key.toUpperCase();
        return key.charAt(0).toUpperCase() + key.slice(1);
    }

    // --- Shortcut Management ---
    var DEFAULT_SHORTCUTS = {
        command_palette: 'Ctrl+P',
        settings: 'Ctrl+,',
        toggle_sidebar: 'Ctrl+B',
        cmd_panel: 'Ctrl+J',
        clear_terminal: 'Ctrl+K',
        switch_profile: 'Ctrl+Shift+P',
        back_to_launcher: 'Ctrl+Shift+W'
    };

    var _shortcuts = {};

    function loadShortcuts(callback) {
        if (!window.monolithApi) {
            if (callback) callback({});
            return;
        }
        if (typeof window.monolithApi.get_shortcuts !== 'function') {
            if (callback) callback({});
            return;
        }
        window.monolithApi.get_shortcuts()
            .then(function (result) {
                try {
                    _shortcuts = (result && result.shortcuts) || {};
                } catch (e) {
                    _shortcuts = {};
                }
                // Fill in defaults for missing keys
                for (var key in DEFAULT_SHORTCUTS) {
                    if (!_shortcuts[key]) {
                        _shortcuts[key] = DEFAULT_SHORTCUTS[key];
                    }
                }
                if (callback) callback(_shortcuts);
            })
            .catch(function (e) {
                _shortcuts = {};
                for (var key in DEFAULT_SHORTCUTS) {
                    if (!_shortcuts[key]) {
                        _shortcuts[key] = DEFAULT_SHORTCUTS[key];
                    }
                }
                if (callback) callback(_shortcuts);
            });
    }

    function saveShortcuts(callback) {
        if (!window.monolithApi) {
            if (callback) callback();
            return;
        }
        if (typeof window.monolithApi.save_shortcuts !== 'function') {
            if (callback) callback();
            return;
        }
        window.monolithApi.save_shortcuts(_shortcuts)
            .then(function () {
                if (callback) callback();
            })
            .catch(function (e) {
                console.error('Failed to save shortcuts:', e);
                if (callback) callback();
            });
    }

    function getShortcut(name) {
        return _shortcuts[name] || DEFAULT_SHORTCUTS[name] || '';
    }

    function resetShortcut(name, callback) {
        if (DEFAULT_SHORTCUTS[name]) {
            _shortcuts[name] = DEFAULT_SHORTCUTS[name];
            saveShortcuts(callback);
        }
    }

    function parseShortcutString(str) {
        var keyOverride = '';
        if (str.indexOf('++') !== -1) {
            keyOverride = 'Plus';
            str = str.replace(/\+\+/g, '+');
        }
        var parts = str.split('+');
        var result = { ctrl: false, shift: false, alt: false, meta: false, key: keyOverride };
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].trim().toLowerCase();
            if (!p) continue;
            if (p === 'ctrl' || p === 'control') result.ctrl = true;
            else if (p === 'shift') result.shift = true;
            else if (p === 'alt') result.alt = true;
            else if (p === 'meta' || p === 'cmd' || p === 'command') result.meta = true;
            else if (p === ',') result.key = 'Comma';
            else if (p === '.') result.key = 'Period';
            else if (p === ' ') result.key = 'Space';
            else if (p === '+' || p === 'plus') result.key = 'Plus';
            else result.key = p.toUpperCase();
        }
        return result;
    }

    function shortcutMatches(e, shortcutStr) {
        var s = parseShortcutString(shortcutStr);
        var eventKey = normalizeKeyName(e.key);

        return e.ctrlKey === s.ctrl &&
               e.shiftKey === s.shift &&
               e.altKey === s.alt &&
               (e.metaKey || false) === s.meta &&
               eventKey.toLowerCase() === s.key.toLowerCase();
    }

    function renderShortcutUI() {
        for (var key in DEFAULT_SHORTCUTS) {
            var el = document.getElementById('shortcut-' + key);
            if (el) el.textContent = getShortcut(key).replace(/\+/g, ' + ');
        }
    }

    function renderShortcutHint(el, shortcut, suffix) {
        if (!el) return;
        el.textContent = '';
        var parts = shortcut.split('+');
        for (var i = 0; i < parts.length; i++) {
            if (i > 0) el.appendChild(document.createTextNode('+'));
            var kbd = document.createElement('kbd');
            kbd.textContent = parts[i].trim();
            el.appendChild(kbd);
        }
        if (suffix) el.appendChild(document.createTextNode(' ' + suffix));
    }

    function updateKbdHint() {
        var cmds = getShortcut('command_palette');
        var settings = getShortcut('settings');

        var cmdsEl = document.getElementById('landing-shortcut-commands');
        if (cmdsEl) {
            renderShortcutHint(cmdsEl, cmds, 'Commands');
        }

        var settingsEl = document.getElementById('landing-shortcut-settings');
        if (settingsEl) {
            renderShortcutHint(settingsEl, settings, 'Settings');
        }

        var settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            if (window.MonolothTooltip) {
                window.MonolothTooltip.detach(settingsBtn);
            }
            var newTip = 'Settings (' + settings.replace(/\+/g, ' + ') + ')';
            settingsBtn.setAttribute('data-tooltip', newTip);
            settingsBtn.setAttribute('aria-label', 'Open ' + newTip);
            if (window.MonolothTooltip) {
                window.MonolothTooltip.attach(settingsBtn, newTip);
            }
        }

        var tbMenu = document.getElementById('tb-menu');
        if (tbMenu) {
            if (window.MonolothTooltip) {
                window.MonolothTooltip.detach(tbMenu);
            }
            var menuTip = 'Command Palette (' + cmds.replace(/\+/g, ' + ') + ')';
            tbMenu.setAttribute('data-tooltip', menuTip);
            tbMenu.setAttribute('aria-label', menuTip);
            if (window.MonolothTooltip) {
                window.MonolothTooltip.attach(tbMenu, menuTip);
            }
        }
    }

    function setShortcut(key, value, cb) { _shortcuts[key] = value; saveShortcuts(cb); }

    function getAllShortcuts() { return _shortcuts; }

    window.MonolithShortcuts = {
        DEFAULT_SHORTCUTS: DEFAULT_SHORTCUTS,
        normalizeKeyName: normalizeKeyName,
        loadShortcuts: loadShortcuts,
        saveShortcuts: saveShortcuts,
        getShortcut: getShortcut,
        resetShortcut: resetShortcut,
        parseShortcutString: parseShortcutString,
        shortcutMatches: shortcutMatches,
        renderShortcutUI: renderShortcutUI,
        renderShortcutHint: renderShortcutHint,
        updateKbdHint: updateKbdHint,
        setShortcut: setShortcut,
        getAllShortcuts: getAllShortcuts
    };
})();
