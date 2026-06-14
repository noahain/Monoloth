(function () {
    'use strict';

    var UI = window.MonolothUI;
    var openModal = UI.openModal;
    var closeModal = UI.closeModal;

    // --- Command Palette (Ctrl+P) ---
    var _paletteState = { subPalette: null, parentCommands: null, selectedIndex: 0 };

    var _paletteIcons = {
        folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        'folder-open': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M2 10h20"/></svg>',
        'arrow-left': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
        copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        menu: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
        terminal: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
        trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
        gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        palette: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
        clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        'chevron-left': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'
    };

    var commands = [
        { id: 'open-dir', icon: 'folder-open', label: 'Open Directory', group: 'nav', action: { type: 'sub-palette', id: 'directory-search' } },
        { id: 'last-dir', icon: 'folder', label: 'Open Last Directory', group: 'nav', action: function () {
            window.MonolothApp.backToLanding();
            setTimeout(function () {
                if (window.monolithApi) {
                    window.monolithApi.get_last_directory().then(function (res) {
                        if (res && res.success && res.path) window.MonolothApp.showTerminal(res.path);
                    });
                }
            }, 200);
        }},
        { id: 'back', icon: 'arrow-left', label: 'Back to Launcher', group: 'nav', shortcutKey: 'back_to_launcher', action: function () { window.MonolothApp.backToLanding(); } },
        { id: 'copy-path', icon: 'copy', label: 'Copy Current Path', group: 'nav', action: function () {
            if (window.SidebarManager) {
                var dir = (window.MonolothApp && window.MonolothApp.getCurrentDir) ? window.MonolothApp.getCurrentDir() : '';
                if (dir) window.MonolothApp.copyToClipboard(dir);
            }
        }},
        { id: 'toggle-sidebar', icon: 'menu', label: 'Toggle Sidebar', group: 'actions', shortcutKey: 'toggle_sidebar', action: function () {
            if (typeof window.SidebarManager !== 'undefined') window.SidebarManager.toggleSidebar();
        }},
        { id: 'cmd-panel', icon: 'terminal', label: 'CMD Panel', group: 'actions', shortcutKey: 'cmd_panel', action: function () {
            if (typeof window.SidebarManager !== 'undefined') window.SidebarManager.toggleCmdPanel();
        }},
        { id: 'clear-term', icon: 'trash', label: 'Clear Terminal', group: 'actions', shortcutKey: 'clear_terminal', action: function () { window.MonolothApp.clearTerminal(); }},
        { id: 'settings', icon: 'gear', label: 'Settings', group: 'config', shortcutKey: 'settings', action: function () { window.MonolothApp.showSettings(); } },
        { id: 'appearance', icon: 'palette', label: 'Appearance Settings', group: 'config', action: function () { window.MonolothApp.showSettings(); window.MonolothApp.switchTab('appearance'); } },
        { id: 'history', icon: 'clock', label: 'History', group: 'config', action: function () { window.MonolothApp.showSettings(); window.MonolothApp.switchTab('history'); } },
        { id: 'profiles', icon: 'user', label: 'Switch Profile', group: 'config', shortcutKey: 'switch_profile', action: function () { window.MonolothApp.openProfileSwitcher(); } },
    ];

    var _subPalettes = {
        'directory-search': {
            render: function (query) {
                var items = [];
                if (window.monolithApi && window.monolithApi.get_last_directory) {
                    items.push({ id: 'open-last', icon: 'folder', label: 'Open Last Directory', action: function () {
                        window.monolithApi.get_last_directory().then(function (res) {
                            if (res && res.success && res.path) window.MonolothApp.showTerminal(res.path);
                        });
                    }});
                }
                items.push({ id: 'browse', icon: 'folder-open', label: 'Browse...', action: function () {
                    window.MonolothApp.backToLanding();
                    setTimeout(function () {
                        var chooseBtn = document.getElementById('choose-dir-btn');
                        if (chooseBtn) chooseBtn.click();
                    }, 200);
                }});
                if (query) {
                    items = items.filter(function (item) {
                        return item.label.toLowerCase().indexOf(query.toLowerCase()) !== -1;
                    });
                }
                return items;
            },
            placeholder: 'Open directory...',
            backLabel: 'Back'
        }
    };
    var paletteEl = document.createElement('div');
    paletteEl.id = 'command-palette';
    paletteEl.className = 'command-palette';
    paletteEl.innerHTML = '<div class="command-palette-overlay"></div>' +
        '<div class="command-palette-modal" role="dialog" aria-modal="true" aria-label="Command palette">' +
        '<input type="text" id="command-palette-input" class="command-palette-input" placeholder="Type a command..." spellcheck="false" aria-label="Search commands" autocomplete="off">' +
        '<div id="command-palette-list" class="command-palette-list" role="listbox"></div>' +
        '<div class="command-palette-hint">Press <kbd>Esc</kbd> to close</div>' +
        '</div>';
    document.body.appendChild(paletteEl);

    var paletteInput = document.getElementById('command-palette-input');
    var paletteList = document.getElementById('command-palette-list');

    function openPalette() {
        if (!paletteEl || !paletteInput || !paletteList) return;
        paletteInput.value = '';
        _paletteState.subPalette = null;
        _paletteState.parentCommands = null;
        paletteInput.placeholder = 'Type a command...';
        renderPaletteCommands(commands);
        openModal(paletteEl);
        paletteInput.focus();
    }

    function closePalette() {
        if (!paletteEl) return;
        _paletteState.subPalette = null;
        _paletteState.parentCommands = null;
        closeModal(paletteEl);
    }

    function enterSubPalette(subId, query) {
        var sub = _subPalettes[subId];
        if (!sub) return;
        _paletteState.subPalette = subId;
        _paletteState.parentCommands = commands;
        paletteInput.placeholder = sub.placeholder || 'Type to search...';
        paletteInput.value = '';
        var items = sub.render(query || '');
        renderPaletteCommands(items, true);
        paletteInput.focus();
    }

    function exitSubPalette() {
        if (!_paletteState.subPalette) return false;
        _paletteState.subPalette = null;
        paletteInput.placeholder = 'Type a command...';
        paletteInput.value = '';
        renderPaletteCommands(commands);
        return true;
    }

    function renderPaletteCommands(list, isSub) {
        if (!paletteList) return;
        paletteList.innerHTML = '';
        if (list.length === 0) {
            var emptyItem = document.createElement('div');
            emptyItem.className = 'command-palette-item command-palette-empty';
            emptyItem.textContent = 'No matching commands';
            paletteList.appendChild(emptyItem);
            return;
        }

        var groupLabels = { nav: 'NAVIGATION', actions: 'ACTIONS', config: 'CONFIGURATION' };
        var lastGroup = null;
        var cmdIdx = 0;

        if (isSub && _subPalettes[_paletteState.subPalette]) {
            var backItem = document.createElement('div');
            backItem.className = 'command-palette-item command-palette-back';
            backItem.dataset.cmdIndex = 'back';
            var backIcon = document.createElement('span');
            backIcon.className = 'command-palette-icon';
            backIcon.innerHTML = _paletteIcons['chevron-left'] || '';
            backItem.appendChild(backIcon);
            var backLabel = document.createElement('span');
            backLabel.className = 'command-palette-label';
            backLabel.textContent = _subPalettes[_paletteState.subPalette].backLabel || 'Back';
            backItem.appendChild(backLabel);
            backItem.addEventListener('click', function () {
                exitSubPalette();
            });
            paletteList.appendChild(backItem);
            var sep = document.createElement('div');
            sep.className = 'command-palette-separator';
            paletteList.appendChild(sep);
        }

        list.forEach(function (cmd) {
            if (!isSub && cmd.group !== lastGroup) {
                if (lastGroup !== null) {
                    var sep = document.createElement('div');
                    sep.className = 'command-palette-separator';
                    paletteList.appendChild(sep);
                }
                var header = document.createElement('div');
                header.className = 'command-palette-category';
                header.textContent = groupLabels[cmd.group] || (cmd.group || '').toUpperCase();
                paletteList.appendChild(header);
                lastGroup = cmd.group;
            }

            var item = document.createElement('div');
            item.className = 'command-palette-item' + (cmdIdx === 0 ? ' selected' : '');
            item.dataset.cmdIndex = cmdIdx;
            item.id = 'palette-item-' + cmdIdx;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', cmdIdx === 0 ? 'true' : 'false');

            var iconSpan = document.createElement('span');
            iconSpan.className = 'command-palette-icon';
            iconSpan.innerHTML = _paletteIcons[cmd.icon] || '';
            item.appendChild(iconSpan);

            var labelSpan = document.createElement('span');
            labelSpan.className = 'command-palette-label';
            labelSpan.textContent = cmd.label;
            item.appendChild(labelSpan);

            if (cmd.shortcutKey) {
                var shortcutStr = window.MonolithShortcuts.getShortcut(cmd.shortcutKey).replace(/\+/g, ' + ');
                if (shortcutStr) {
                    var shortcutSpan = document.createElement('span');
                    shortcutSpan.className = 'command-palette-shortcut';
                    shortcutSpan.textContent = shortcutStr;
                    item.appendChild(shortcutSpan);
                }
            }

            var cmdData = cmd;
            item.addEventListener('click', function () {
                executePaletteItem(cmdData);
            });
            paletteList.appendChild(item);
            cmdIdx++;
        });
    }

    function executePaletteItem(cmd) {
        if (!cmd) return;
        if (cmd.action && cmd.action.type === 'sub-palette') {
            enterSubPalette(cmd.action.id, '');
            return;
        }
        closePalette();
        if (typeof cmd.action === 'function') cmd.action();
    }

    function filterPaletteCommands(query) {
        if (_paletteState.subPalette) {
            var sub = _subPalettes[_paletteState.subPalette];
            if (sub) {
                var items = sub.render(query);
                renderPaletteCommands(items, true);
                return;
            }
        }
        if (!query) {
            renderPaletteCommands(commands);
            return;
        }
        var filtered = commands.filter(function (cmd) {
            return cmd.label.toLowerCase().indexOf(query.toLowerCase()) !== -1;
        });
        renderPaletteCommands(filtered);
    }

    function updatePaletteSelection(items, idx) {
        if (!items || !items.length) return;
        items.forEach(function (it) {
            it.classList.remove('selected');
            it.setAttribute('aria-selected', 'false');
        });
        if (items[idx]) {
            items[idx].classList.add('selected');
            items[idx].setAttribute('aria-selected', 'true');
            items[idx].scrollIntoView({ block: 'nearest' });
        }
        _paletteState.selectedIndex = idx;
    }

    // Palette navigation (arrow/enter/backspace) — extracted from app.js's
    // shared keydown handler. Called by app.js only when the palette is active.
    function handleNav(e) {
        if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
            e.preventDefault();
            var items = paletteList.querySelectorAll('.command-palette-item');
            var sel = paletteList.querySelector('.command-palette-item.selected');
            var idx = Array.prototype.indexOf.call(items, sel);
            if (e.code === 'ArrowDown') idx = Math.min(idx + 1, items.length - 1);
            if (e.code === 'ArrowUp') idx = Math.max(idx - 1, 0);
            updatePaletteSelection(items, idx);
        }
        if (e.code === 'Enter') {
            e.preventDefault();
            var sel = paletteList.querySelector('.command-palette-item.selected');
            if (sel) sel.click();
        }
        if (e.code === 'Backspace' && !paletteInput.value && _paletteState.subPalette) {
            e.preventDefault();
            exitSubPalette();
        }
    }

    if (paletteInput) {
        paletteInput.addEventListener('input', function () { filterPaletteCommands(this.value); });
    }

    if (paletteEl) {
        paletteEl.addEventListener('click', function (e) {
            if (e.target === paletteEl || e.target.classList.contains('command-palette-overlay')) {
                closePalette();
            }
        });
    }

    window.MonolithPalette = {
        open: openPalette,
        close: closePalette,
        isActive: function () { return !!(paletteEl && paletteEl.classList.contains('active')); },
        isSubActive: function () { return !!_paletteState.subPalette; },
        exitSub: exitSubPalette,
        filter: filterPaletteCommands,
        handleNav: handleNav
    };
})();
