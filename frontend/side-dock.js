(function () {
    'use strict';

    var dock = document.getElementById('side-dock');
    var viewsEl = document.getElementById('side-dock-views');
    var closeBtn = document.getElementById('side-dock-close');
    var resizeHandle = document.getElementById('side-dock-resize-handle');
    var containers = {
        files: document.getElementById('side-dock-files'),
        git: document.getElementById('side-dock-git')
    };

    var groups = new Map();
    var activeId = null;
    var isOpen = false;
    var width = 340;
    var mounted = { files: false, git: false };
    var saveTimer = null;

    function clampWidth(value) {
        var max = Math.min(window.innerWidth * 0.6, 900);
        return Math.max(220, Math.min(value, max));
    }

    function groupFor(mainTabId, dir) {
        if (!groups.has(mainTabId)) {
            groups.set(mainTabId, { root: dir || '', view: 'files' });
        }
        var group = groups.get(mainTabId);
        if (dir) group.root = dir;
        return group;
    }

    function moduleFor(name) {
        return name === 'git' ? window.MonolithSideDockGit : window.MonolithSideDockFiles;
    }

    function mount(name) {
        if (mounted[name]) return;
        var mod = moduleFor(name);
        if (!mod || typeof mod.mount !== 'function') return;
        mod.mount(containers[name]);
        mounted[name] = true;
    }

    function render() {
        if (!activeId) return;
        var group = groups.get(activeId);
        if (!group) return;
        Object.keys(containers).forEach(function (name) {
            if (containers[name]) {
                containers[name].classList.toggle('active', name === group.view);
            }
        });
        if (viewsEl) {
            viewsEl.querySelectorAll('[data-view]').forEach(function (btn) {
                btn.classList.toggle('active', btn.getAttribute('data-view') === group.view);
            });
        }
        mount(group.view);
        var mod = moduleFor(group.view);
        if (mod && typeof mod.activate === 'function') {
            mod.activate(activeId, group.root);
        }
    }

    function applyWidth() {
        width = clampWidth(width);
        dock.style.setProperty('--side-dock-width', width + 'px');
        if (window.MonolothApp && typeof window.MonolothApp.refitTerminals === 'function') {
            window.MonolothApp.refitTerminals();
        }
    }

    function persist(key, value) {
        if (window.monolithApi && typeof window.monolithApi.set_config === 'function') {
            window.monolithApi.set_config(key, value).catch(function () {});
        }
    }

    function persistWidthSoon() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            saveTimer = null;
            persist('sideDockWidth', width);
        }, 300);
    }

    function setOpen(next) {
        isOpen = next;
        dock.classList.toggle('open', isOpen);
        persist('sideDockOpen', isOpen);
        if (window.SidebarManager && typeof window.SidebarManager.syncSideDockButton === 'function') {
            window.SidebarManager.syncSideDockButton();
        }
        if (isOpen) {
            applyWidth();
            render();
        }
    }

    function open() {
        if (!activeId) {
            var id = window.SidebarManager && typeof window.SidebarManager.getActiveMainTabId === 'function'
                ? window.SidebarManager.getActiveMainTabId()
                : null;
            var dir = window.SidebarManager && typeof window.SidebarManager.getActiveMainTabDir === 'function'
                ? window.SidebarManager.getActiveMainTabDir()
                : (window.MonolothApp && window.MonolothApp.getCurrentDir ? window.MonolothApp.getCurrentDir() : '');
            if (id) groupFor(id, dir);
            activeId = id;
        }
        setOpen(true);
    }

    function close() {
        if (hasDirty(activeId)) {
            return window.MonolithDialog.showChoice('Unsaved changes', ['Save', 'Discard', 'Cancel'])
                .then(function (choice) {
                    if (choice === 2) return false;
                    if (choice === 0) {
                        return window.MonolithSideDockFiles.saveActive(activeId).then(function (ok) {
                            if (!ok) return false;
                            setOpen(false);
                            return true;
                        });
                    }
                    window.MonolithSideDockFiles.discardActive(activeId);
                    setOpen(false);
                    return true;
                });
        }
        setOpen(false);
        return Promise.resolve(true);
    }

    function toggle() {
        return isOpen ? close() : (open(), Promise.resolve(true));
    }

    function showView(name) {
        if (name !== 'files' && name !== 'git') return;
        if (!activeId) {
            open();
            if (!activeId) return;
        }
        groups.get(activeId).view = name;
        render();
    }

    function onMainTabChange(mainTabId, dir) {
        if (!mainTabId) return;
        groupFor(mainTabId, dir);
        activeId = mainTabId;
        if (isOpen) render();
    }

    function disposeGroup(mainTabId) {
        if (!groups.has(mainTabId)) return;
        var files = window.MonolithSideDockFiles;
        var git = window.MonolithSideDockGit;
        if (files && typeof files.dispose === 'function') files.dispose(mainTabId);
        if (git && typeof git.dispose === 'function') git.dispose(mainTabId);
        groups.delete(mainTabId);
        if (activeId === mainTabId) activeId = null;
    }

    function disposeAll() {
        Array.from(groups.keys()).forEach(disposeGroup);
    }

    function hasDirty(mainTabId) {
        var files = window.MonolithSideDockFiles;
        if (!files || typeof files.hasDirty !== 'function') return false;
        return files.hasDirty(mainTabId);
    }

    function getGroupRoot(mainTabId) {
        var group = groups.get(mainTabId);
        return group ? group.root : null;
    }

    function loadPersistedState() {
        if (!window.monolithApi || typeof window.monolithApi.get_config !== 'function') return;
        window.monolithApi.get_config('sideDockWidth').then(function (value) {
            if (typeof value === 'number' && isFinite(value)) {
                width = value;
                if (isOpen) applyWidth();
            }
        }).catch(function () {});
        window.monolithApi.get_config('sideDockOpen').then(function (value) {
            if (value === true) open();
        }).catch(function () {});
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', function () { close(); });
    }

    if (viewsEl) {
        viewsEl.addEventListener('click', function (event) {
            var btn = event.target.closest('[data-view]');
            if (btn) showView(btn.getAttribute('data-view'));
        });
    }

    if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', function (event) {
            event.preventDefault();
            var startX = event.clientX;
            var startWidth = width;

            function onMove(e) {
                width = clampWidth(startWidth + (startX - e.clientX));
                dock.style.setProperty('--side-dock-width', width + 'px');
            }

            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                applyWidth();
                persistWidthSoon();
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    window.MonolithSideDock = {
        open: open,
        close: close,
        toggle: toggle,
        isOpen: function () { return isOpen; },
        showView: showView,
        onMainTabChange: onMainTabChange,
        disposeGroup: disposeGroup,
        disposeAll: disposeAll,
        hasDirty: hasDirty,
        getGroupRoot: getGroupRoot
    };

    loadPersistedState();
})();
