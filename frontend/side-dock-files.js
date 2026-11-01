(function () {
    'use strict';

    var UI = window.MonolothUI;
    var escapeHtml = UI.escapeHtml;

    var root = null;
    var states = new Map();
    var activeId = null;
    var activeRoot = '';

    function stateFor(mainTabId) {
        if (!states.has(mainTabId)) {
            states.set(mainTabId, {
                expanded: new Set(),
                children: new Map(),
                openFile: null,
                scrollTop: 0
            });
        }
        return states.get(mainTabId);
    }

    function api() {
        return window.monolithApi;
    }

    function joinPath(dir, name) {
        return dir.replace(/[\\/]+$/, '') + '/' + name;
    }

    function renderBreadcrumb(dir) {
        var parts = dir.replace(/\\/g, '/').split('/').filter(Boolean);
        return '<div class="side-dock-breadcrumb">' + parts.map(function (part, index) {
            return '<span class="side-dock-crumb" data-index="' + index + '">' + escapeHtml(part) + '</span>';
        }).join('<span class="side-dock-crumb-sep">/</span>') + '</div>';
    }

    function entriesFor(state, dir) {
        if (state.children.has(dir)) return Promise.resolve(state.children.get(dir));
        return api().list_directory(dir).then(function (result) {
            if (result && result.success === false) {
                throw new Error(result.error || 'Failed to list directory');
            }
            var entries = (result && result.entries) || [];
            state.children.set(dir, entries);
            return entries;
        });
    }

    function rowHtml(entry, path, state, depth) {
        var isOpen = entry.isDir && state.expanded.has(path);
        return '<div class="side-dock-row' + (entry.isDir ? ' is-dir' : '') + '" data-path="' + escapeHtml(path) + '" data-dir="' + (entry.isDir ? '1' : '0') + '" style="padding-left:' + (10 + depth * 14) + 'px">' +
            '<span class="side-dock-row-name">' + (entry.isDir ? (isOpen ? '\u25BE ' : '\u25B8 ') : '') + escapeHtml(entry.name) + '</span>' +
            '</div>';
    }

    function renderDir(state, dir, depth) {
        return entriesFor(state, dir).then(function (entries) {
            return Promise.all(entries.map(function (entry) {
                var path = joinPath(dir, entry.name);
                var row = rowHtml(entry, path, state, depth);
                if (!entry.isDir || !state.expanded.has(path)) return row;
                return renderDir(state, path, depth + 1).then(function (children) {
                    return row + children;
                }).catch(function (err) {
                    return row + '<div class="side-dock-error" style="padding-left:' + (10 + (depth + 1) * 14) + 'px">' + escapeHtml(String(err)) + '<button class="side-dock-retry">Retry</button></div>';
                });
            })).then(function (parts) { return parts.join(''); });
        });
    }

    function renderTree(dir, state) {
        return renderDir(state, dir, 0).then(function (html) {
            root.innerHTML = renderBreadcrumb(dir) + '<div class="side-dock-tree">' + (html || '<div class="side-dock-empty">Empty folder</div>') + '</div>';
            var tree = root.querySelector('.side-dock-tree');
            if (tree) tree.scrollTop = state.scrollTop;
        }).catch(function (err) {
            root.innerHTML = '<div class="side-dock-error">' + escapeHtml(String(err)) + '<button class="side-dock-retry">Retry</button></div>';
        });
    }

    function activate(mainTabId, dir) {
        activeId = mainTabId;
        activeRoot = dir;
        var state = stateFor(mainTabId);
        if (state.root && state.root !== dir) {
            state.children.clear();
            state.expanded.clear();
        }
        state.root = dir;
        if (state.openFile && window.MonolithSideDockEditor) {
            return window.MonolithSideDockEditor.restore(mainTabId);
        }
        return renderTree(dir, state);
    }

    function mount(container) {
        root = container;
        root.addEventListener('click', function (event) {
            var retry = event.target.closest('.side-dock-retry');
            if (retry) {
                activate(activeId, activeRoot);
                return;
            }
            var row = event.target.closest('.side-dock-row');
            if (!row) return;
            var path = row.getAttribute('data-path');
            var isDir = row.getAttribute('data-dir') === '1';
            var state = stateFor(activeId);
            var tree = root.querySelector('.side-dock-tree');
            state.scrollTop = tree ? tree.scrollTop : 0;
            if (isDir) {
                if (state.expanded.has(path)) state.expanded.delete(path);
                else state.expanded.add(path);
                renderTree(activeRoot, state);
            } else {
                openFile(path);
            }
        });
        root.addEventListener('contextmenu', function (event) {
            var row = event.target.closest('.side-dock-row');
            if (!row) return;
            event.preventDefault();
            showRowMenu(row.getAttribute('data-path'), row.getAttribute('data-dir') === '1', event);
        });
    }

    function openFile(path) {
        if (window.MonolithSideDockEditor && typeof window.MonolithSideDockEditor.open === 'function') {
            window.MonolithSideDockEditor.open(activeId, activeRoot, path);
        }
    }

    function showRowMenu(path, isDir, event) {
        var name = path.replace(/\\/g, '/').split('/').pop();
        window.MonolithCtxMenu.createContextMenu(event.clientX, event.clientY, [
            { label: 'Rename', action: 'rename', onSelect: function () { renameRow(path, name); } },
            { label: 'Delete', action: 'delete', danger: true, onSelect: function () { deleteRow(path, isDir); } }
        ]);
    }

    function isCancel(err) {
        return err && err.message === 'cancelled';
    }

    function showError(title, err) {
        window.MonolithDialog.showConfirm(title, String(err), null).catch(function () {});
    }

    function refreshActive() {
        var state = stateFor(activeId);
        state.children.clear();
        return renderTree(activeRoot, state);
    }

    function renameRow(path, currentName) {
        window.MonolithDialog.showPrompt('Rename', 'New name', currentName).then(function (next) {
            if (!next || next === currentName) return;
            return api().rename_path(path, next).then(function () {
                return refreshActive();
            }).catch(function (err) {
                showError('Rename failed', err);
            });
        }).catch(function (err) {
            if (!isCancel(err)) showError('Rename failed', err);
        });
    }

    function deleteRow(path, isDir) {
        window.MonolithDialog.showConfirm(
            'Delete ' + (isDir ? 'folder' : 'file'),
            'Permanently delete ' + path + '? This cannot be undone.',
            'delete_path'
        ).then(function () {
            return api().delete_path(path).then(function () {
                return refreshActive();
            }).catch(function (err) {
                showError('Delete failed', err);
            });
        }).catch(function (err) {
            if (!isCancel(err)) showError('Delete failed', err);
        });
    }

    function hasDirty(mainTabId) {
        if (mainTabId === undefined) {
            var any = false;
            states.forEach(function (state) { if (state.openFile && state.openFile.dirty) any = true; });
            return any;
        }
        var state = states.get(mainTabId);
        return !!(state && state.openFile && state.openFile.dirty);
    }

    function saveActive(mainTabId) {
        return window.MonolithSideDockEditor
            ? window.MonolithSideDockEditor.save(mainTabId)
            : Promise.resolve(false);
    }

    function discardActive(mainTabId) {
        var state = states.get(mainTabId);
        if (state && state.openFile) state.openFile.dirty = false;
    }

    function dispose(mainTabId) {
        states.delete(mainTabId);
        if (window.MonolithSideDockEditor && typeof window.MonolithSideDockEditor.dispose === 'function') {
            window.MonolithSideDockEditor.dispose(mainTabId);
        }
    }

    window.MonolithSideDockFiles = {
        mount: mount,
        activate: activate,
        hasDirty: hasDirty,
        saveActive: saveActive,
        discardActive: discardActive,
        dispose: dispose,
        stateFor: stateFor
    };
})();
