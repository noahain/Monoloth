(function () {
    'use strict';

    var escapeHtml = window.MonolothUI.escapeHtml;
    var MAX_BYTES = 2097152;
    var MODES = {
        js: 'javascript', jsx: 'javascript', ts: 'javascript', tsx: 'javascript',
        json: 'javascript', py: 'python', rs: 'rust', md: 'markdown',
        sh: 'shell', bash: 'shell', c: 'clike', h: 'clike', cpp: 'clike', hpp: 'clike'
    };
    var loaded = { core: false, modes: {} };
    var instances = new Map();
    var root = document.getElementById('side-dock-files');

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var el = document.createElement('script');
            el.src = src;
            el.onload = resolve;
            el.onerror = function () { reject(new Error('Failed to load ' + src)); };
            document.head.appendChild(el);
        });
    }

    function loadCss(href) {
        if (document.querySelector('link[href="' + href + '"]')) return;
        var el = document.createElement('link');
        el.rel = 'stylesheet';
        el.href = href;
        document.head.appendChild(el);
    }

    function ensureCore() {
        if (loaded.core) return Promise.resolve();
        loadCss('lib/codemirror.css');
        return loadScript('lib/codemirror.js').then(function () { loaded.core = true; });
    }

    function ensureMode(ext) {
        var mode = MODES[ext];
        if (!mode || loaded.modes[mode]) return Promise.resolve();
        return loadScript('lib/cm-modes/' + mode + '.js').then(function () {
            loaded.modes[mode] = true;
        });
    }

    function extOf(path) {
        var name = path.replace(/\\/g, '/').split('/').pop();
        return name.indexOf('.') === -1 ? '' : name.split('.').pop().toLowerCase();
    }

    function open(mainTabId, dir, path) {
        var files = window.MonolithSideDockFiles;
        var state = files.stateFor(mainTabId);
        var previous = state.openFile;

        var proceed = function () {
            return window.monolithApi.read_text_file(path, MAX_BYTES).then(function (file) {
                return ensureCore().then(function () { return ensureMode(extOf(path)); }).then(function () {
                    state.openFile = { path: path, dirty: false, readOnly: !!file.truncated, content: file.content };
                    renderEditor(mainTabId, state);
                });
            }).catch(function (err) {
                state.openFile = null;
                window.MonolithDialog.showConfirm('Cannot open file', String(err), 'open_file_failed').catch(function () {});
            });
        };

        if (previous && previous.dirty) {
            return window.MonolithDialog.showChoice('Unsaved changes', ['Save', 'Discard', 'Cancel']).then(function (choice) {
                if (choice === 2) return;
                if (choice === 0) return save(mainTabId).then(function (ok) { if (ok) return proceed(); });
                previous.dirty = false;
                return proceed();
            });
        }
        return proceed();
    }

    function save(mainTabId) {
        var state = window.MonolithSideDockFiles.stateFor(mainTabId);
        var file = state.openFile;
        if (!file || file.readOnly) return Promise.resolve(false);
        var instance = instances.get(mainTabId);
        var content = instance ? instance.getValue() : file.content;
        return window.monolithApi.write_text_file(file.path, content).then(function () {
            file.content = content;
            file.dirty = false;
            updateHeader(state);
            return true;
        }).catch(function (err) {
            window.MonolithDialog.showConfirm('Save failed', String(err), 'save_failed').catch(function () {});
            return false;
        });
    }

    function renderEditor(mainTabId, state) {
        var file = state.openFile;
        var container = root;

        var cm = instances.get(mainTabId);
        if (cm) {
            var wrapper = cm.getWrapperElement();
            if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        }

        container.innerHTML =
            '<div class="side-dock-editor-header">' +
                '<button class="side-dock-back">&#8592; Back</button>' +
                '<span class="side-dock-editor-name">' + escapeHtml(file.path.split(/[\\/]/).pop()) + '</span>' +
                '<span class="side-dock-dirty"></span>' +
                '<button class="side-dock-save">Save</button>' +
            '</div>' +
            (file.readOnly ? '<div class="side-dock-readonly">Read-only: file is truncated or not valid UTF-8</div>' : '') +
            '<div class="side-dock-editor"></div>';

        var host = container.querySelector('.side-dock-editor');
        if (!cm) {
            var textarea = document.createElement('textarea');
            host.appendChild(textarea);
            cm = window.CodeMirror.fromTextArea(textarea, {
                mode: MODES[extOf(file.path)] || null,
                lineNumbers: true,
                lineWrapping: false,
                readOnly: file.readOnly
            });
            instances.set(mainTabId, cm);
            cm.on('change', function () {
                var current = window.MonolithSideDockFiles.stateFor(mainTabId);
                if (!current.openFile) return;
                current.openFile.dirty = true;
                updateHeader(current);
            });
            cm.setOption('extraKeys', { 'Ctrl-S': function () { save(mainTabId); } });
        } else {
            host.appendChild(cm.getWrapperElement());
            cm.setOption('mode', MODES[extOf(file.path)] || null);
            cm.setOption('readOnly', file.readOnly);
        }

        cm.setValue(file.content);
        cm.clearHistory();
        file.dirty = false;

        container.querySelector('.side-dock-back').addEventListener('click', function () { back(mainTabId); });
        container.querySelector('.side-dock-save').addEventListener('click', function () { save(mainTabId); });
        updateHeader(state);
    }

    function updateHeader(state) {
        var dirty = root.querySelector('.side-dock-dirty');
        if (dirty) dirty.textContent = state.openFile && state.openFile.dirty ? '\u25CF' : '';
    }

    function back(mainTabId) {
        var state = window.MonolithSideDockFiles.stateFor(mainTabId);
        if (!state.openFile) return Promise.resolve();
        if (!state.openFile.dirty) {
            state.openFile = null;
            return window.MonolithSideDockFiles.activate(mainTabId, state.root);
        }
        return window.MonolithDialog.showChoice('Unsaved changes', ['Save', 'Discard', 'Cancel']).then(function (choice) {
            if (choice === 2) return;
            if (choice === 0) return save(mainTabId).then(function (ok) { if (ok) return back(mainTabId); });
            state.openFile.dirty = false;
            state.openFile = null;
            return window.MonolithSideDockFiles.activate(mainTabId, state.root);
        });
    }

    function dispose(mainTabId) {
        var instance = instances.get(mainTabId);
        if (instance) {
            var wrapper = instance.getWrapperElement();
            if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
            instances.delete(mainTabId);
        }
    }

    function restore(mainTabId) {
        var state = window.MonolithSideDockFiles.stateFor(mainTabId);
        if (!state.openFile) return Promise.resolve();
        return ensureCore().then(function () {
            return ensureMode(extOf(state.openFile.path));
        }).then(function () {
            renderEditor(mainTabId, state);
        });
    }

    window.MonolithSideDockEditor = {
        open: open,
        save: save,
        back: back,
        restore: restore,
        dispose: dispose
    };
})();
