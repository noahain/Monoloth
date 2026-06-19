(function () {
    'use strict';

    var UI = window.MonolothUI;
    var openModal = UI.openModal;
    var closeModal = UI.closeModal;

    // Status reporter is injected by app.js (which owns the showStatus helper
    // and its timer state). Falls back to a no-op until wired.
    var _statusReporter = function () {};
    function setStatusReporter(fn) {
        if (typeof fn === 'function') _statusReporter = fn;
    }
    function showStatus(id, message, isError) { _statusReporter(id, message, isError); }

    var _filePickerType = 'native';

    // --- File Picker config (settings UI) ---

    function loadFilePickerConfig() {
        if (!window.monolithApi) return;
        window.monolithApi.get_file_picker_type()
            .then(function (res) {
                _filePickerType = res || 'native';
                updatePickerTypeUI(_filePickerType);
            })
            .catch(function () {});
    }

    function updatePickerTypeUI(type) {
        var btns = document.querySelectorAll('.picker-type-btn');
        btns.forEach(function (b) {
            b.classList.toggle('active', b.dataset.type === type);
        });
    }

    function savePickerType(type) {
        if (!window.monolithApi) return;
        _filePickerType = type;
        window.monolithApi.set_file_picker_type(type)
            .then(function () {
                showStatus('file-picker-status', 'File picker type saved.', false);
            })
            .catch(function () {
                showStatus('file-picker-status', 'Failed to save.', true);
            });
    }

    function getPickerType() { return _filePickerType; }

    var pickerTypeBtns = document.querySelectorAll('.picker-type-btn');
    pickerTypeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var type = this.dataset.type;
            updatePickerTypeUI(type);
            savePickerType(type);
        });
    });

    // ================================================================
    // Custom File / Folder Picker
    // ================================================================

    var fpEl = document.getElementById('file-picker');
    var fpTitle = document.getElementById('fp-title');
    var fpClose = document.getElementById('fp-close');
    var fpBack = document.getElementById('fp-back-btn');
    var fpForward = document.getElementById('fp-forward-btn');
    var fpUp = document.getElementById('fp-up-btn');
    var fpRefresh = document.getElementById('fp-refresh-btn');
    var fpPathBar = document.getElementById('fp-path-bar');
    var fpPathInput = document.getElementById('fp-path-input');
    var fpBreadcrumb = document.getElementById('fp-breadcrumb');
    var fpFileList = document.getElementById('fp-file-list');
    var fpEmpty = document.getElementById('fp-empty');
    var fpLoading = document.getElementById('fp-loading');
    var fpFilename = document.getElementById('fp-filename');
    var fpFilter = document.getElementById('fp-filter');
    var fpOk = document.getElementById('fp-ok-btn');
    var fpCancel = document.getElementById('fp-cancel-btn');
    var fpPreviewPane = document.getElementById('fp-preview-pane');
    var fpPreviewImg = document.getElementById('fp-preview-img');
    var fpPreviewInfo = document.getElementById('fp-preview-info');
    var fpDrivesList = document.getElementById('fp-drives-list');

    var fpState = {
        mode: 'file',
        currentPath: '',
        history: [],
        historyIndex: -1,
        selectedPath: '',
        resolve: null,
        reject: null,
        filter: '*.*',
        filterExts: [],
        _listings: {},
        _navToken: 0,
        pickerId: '',
    };

    function isWindows() {
        return UI && typeof UI.isWindows === 'function' && UI.isWindows();
    }

    function getHomePath() {
        return isWindows() ? '%USERPROFILE%' : '~';
    }

    var QUICK_PATHS = {
        desktop:   joinPath(getHomePath(), 'Desktop'),
        documents: joinPath(getHomePath(), 'Documents'),
        downloads: joinPath(getHomePath(), 'Downloads'),
        pictures:  joinPath(getHomePath(), 'Pictures'),
    };

    var _lastDirectories = {};
    var _pickerLastDirsLoaded = false;

    function _loadPickerLastDirs() {
        if (!window.monolithApi) return;
        if (_pickerLastDirsLoaded) return;
        _pickerLastDirsLoaded = true;
        ['bg', 'choose'].forEach(function (id) {
            window.monolithApi.get_picker_last_dir(id)
                .then(function (res) {
                    if (res && res.success && res.path) _lastDirectories[id] = res.path;
                })
                .catch(function () {});
        });
    }

    function _getLastDirectory(pickerId) {
        return _lastDirectories[pickerId] || '';
    }

    function _setLastDirectory(pickerId, path) {
        if (!path) return;
        var dir = path;
        if (path.indexOf('\\') !== -1) {
            dir = path.substring(0, path.lastIndexOf('\\'));
        } else if (path.indexOf('/') !== -1) {
            dir = path.substring(0, path.lastIndexOf('/'));
        }
        if (dir) {
            _lastDirectories[pickerId] = dir;
            if (window.monolithApi) {
                window.monolithApi.set_picker_last_dir(pickerId, dir).catch(function () {});
            }
        }
    }

    function pickPath(opts) {
        if (!window.monolithApi) return Promise.resolve(null);
        var customPicker = function () {
            return openFilePicker({
                id: opts.id,
                title: opts.title,
                mode: opts.mode,
                filter: opts.filter
            }).catch(function () { return null; });
        };
        return window.monolithApi.get_file_picker_type()
            .then(function (pickerType) {
                _filePickerType = pickerType || 'native';
                if (_filePickerType === 'native') {
                    var nativeMethod = opts.mode === 'file' ? 'native_pick_file' : 'native_pick_directory';
                    return window.monolithApi[nativeMethod](opts.filter)
                        .then(function (res) { return (res && res.success && res.path) ? res.path : null; })
                        .catch(function () { return null; });
                }
                return customPicker();
            })
            .catch(customPicker);
    }

    function openFilePicker(opts) {
        if (!fpEl) { console.error('[Monoloth][Picker] fpEl is null'); return Promise.reject(new Error('Picker element not found')); }
        if (!window.monolithApi) { console.error('[Monoloth][Picker] monolithApi not available'); return Promise.reject(new Error('Picker not available')); }
        if (fpState.resolve) { return Promise.reject(new Error('Picker already open')); }

        _loadPickerLastDirs();

        fpState.mode = opts.mode || 'file';
        fpState.history = [];
        fpState.historyIndex = -1;
        fpState.selectedPath = '';
        fpState.filterExts = [];
        fpState._listings = {};
        fpState._navToken++;
        fpState.pickerId = opts.id || '';

        fpTitle.textContent = opts.title || (fpState.mode === 'folder' ? 'Choose Directory' : 'Choose File');
        buildFilterSelect(opts.filter || '*.*');
        openModal(fpEl);
        fpOk.textContent = fpState.mode === 'folder' ? 'Select Folder' : 'Open';

        var startPath = opts.startPath || _getLastDirectory(fpState.pickerId) || (isWindows() ? 'C:\\' : '/');
        navigateToPath(startPath);

        return new Promise(function (resolve, reject) {
            fpState.resolve = resolve;
            fpState.reject = reject;
        });
    }

    function buildFilterSelect(filterStr) {
        if (!fpFilter) return;
        fpFilter.innerHTML = '';
        fpFilter.style.display = '';
        if (filterStr === '*.*' || !filterStr) {
            var opt = document.createElement('option');
            opt.value = '*.*';
            opt.textContent = 'All Files (*.*)';
            fpFilter.appendChild(opt);
            fpFilter.value = '*.*';
            fpState.filter = '*.*';
            fpState.filterExts = [];
            return;
        }
        var parts = filterStr.split('|');
        for (var i = 0; i < parts.length; i += 2) {
            var label = parts[i] || 'Files';
            var pattern = parts[i + 1] || '*.*';
            var opt = document.createElement('option');
            opt.value = pattern;
            opt.textContent = label + ' (' + pattern + ')';
            fpFilter.appendChild(opt);
        }
        if (fpFilter.options.length > 0) {
            fpFilter.selectedIndex = 0;
        } else {
            var def = document.createElement('option');
            def.value = '*.*';
            def.textContent = 'All Files (*.*)';
            fpFilter.appendChild(def);
            fpFilter.value = '*.*';
        }
        updateFilterExts();
    }

    function updateFilterExts() {
        var val = fpFilter ? fpFilter.value : '*.*';
        fpState.filter = val;
        fpState.filterExts = val === '*.*' ? [] : val.split(';').map(function (p) { return p.trim().toLowerCase(); });
    }

    function navigateToPath(path) {
        if (!path) { console.warn('[Monoloth][Picker] navigateToPath: empty path'); return; }
        var token = ++fpState._navToken;
        showLoading(true);
        window.monolithApi.get_path_info(path).then(function (info) {
            if (token !== fpState._navToken) return;
            if (!info || !info.success || !info.exists) {
                showLoading(false);
                if (!info || !info.success) {
                    showError('Access denied or network error');
                } else {
                    showError('Path not found');
                }
                return;
            }
            var target = info.isDir ? info.absolute : info.parent;
            doNavigate(target, token);
        }).catch(function (err) {
            if (token !== fpState._navToken) return;
            console.error('[Monoloth][Picker] get_path_info error:', err);
            showLoading(false);
            showEmpty();
        });
    }

    function doNavigate(absPath, token) {
        if (!absPath) return;
        if (token == null) token = ++fpState._navToken;
        if (token !== fpState._navToken) return;
        fpState.currentPath = absPath;

        if (fpState.historyIndex < fpState.history.length - 1) {
            fpState.history = fpState.history.slice(0, fpState.historyIndex + 1);
        }
        fpState.history.push(absPath);
        fpState.historyIndex = fpState.history.length - 1;
        updateNavButtons();
        loadDirectory(absPath, token);
    }

    function loadDirectory(path, token) {
        if (token == null) token = fpState._navToken;
        showLoading(true);
        window.monolithApi.list_directory(path).then(function (result) {
            if (token !== fpState._navToken || path !== fpState.currentPath) return;
            showLoading(false);
            if (!result || !result.success) { console.warn('[Monoloth][Picker] list_directory failed'); showError('Access denied'); return; }
            fpState._listings[path] = result.entries;
            renderEntries(result.entries);
            renderBreadcrumb(path);
            clearPreview();
            fpState.selectedPath = '';
            fpFilename.value = '';
            fpOk.disabled = (fpState.mode !== 'folder');
        }).catch(function (err) {
            if (token !== fpState._navToken || path !== fpState.currentPath) return;
            console.error('[Monoloth][Picker] list_directory error:', err);
            showLoading(false);
            showError('Access denied or network error');
        });
    }

    function renderEntries(entries) {
        if (!fpFileList) return;
        fpFileList.innerHTML = '';
        fpEmpty.style.display = 'none';

        var fe = fpState.filterExts;
        var displayed = [];
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e.isDir && fe.length > 0) {
                var match = false;
                for (var f = 0; f < fe.length; f++) {
                    if (e.name.toLowerCase().endsWith(fe[f].replace('*', ''))) { match = true; break; }
                }
                if (!match) continue;
            }
            displayed.push(e);
        }
        if (displayed.length === 0) { fpEmpty.style.display = 'flex'; return; }

        displayed.forEach(function (entry) {
            var item = document.createElement('div');
            item.className = 'fp-file-item';
            item.dataset.name = entry.name;
            item.dataset.isDir = entry.isDir ? 'true' : 'false';

            var ico = getItemIcon(entry);
            var iconDiv = document.createElement('div');
            iconDiv.className = 'fp-item-icon ' + ico.cls;
            iconDiv.innerHTML = ico.svg;
            item.appendChild(iconDiv);

            var ns = document.createElement('span');
            ns.className = 'fp-item-name';
            ns.textContent = entry.name;
            item.appendChild(ns);

            var ds = document.createElement('span');
            ds.className = 'fp-item-date';
            ds.textContent = formatDate(entry.modified);
            item.appendChild(ds);

            var ss = document.createElement('span');
            ss.className = 'fp-item-size';
            ss.textContent = entry.isDir ? '\u2014' : formatSize(entry.size);
            item.appendChild(ss);

            item.addEventListener('click', function () { onItemClick(entry); });
            item.addEventListener('dblclick', function () {
                if (entry.isDir) {
                    doNavigate(joinPath(fpState.currentPath, entry.name));
                } else if (fpState.mode === 'file') {
                    onItemClick(entry);
                    if (fpOk && !fpOk.disabled) fpOk.click();
                }
            });
            fpFileList.appendChild(item);
        });
        loadDrives();
    }

    var FILE_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
    var FILE_CODE_EXTS = ['.js', '.py', '.html', '.css', '.json', '.xml', '.ts', '.jsx', '.tsx', '.yaml', '.yml', '.md', '.sh', '.bat', '.ps1', '.lua', '.rb', '.go', '.rs', '.c', '.cpp', '.h', '.java', '.kt', '.swift'];
    var FILE_ARCHIVE_EXTS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.zst'];

    function getItemIcon(entry) {
        if (entry.isDir) return { cls: 'folder', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' };
        var ext = (entry.extension || '').toLowerCase();
        if (FILE_IMAGE_EXTS.indexOf(ext) !== -1) return { cls: 'file-image', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' };
        if (FILE_CODE_EXTS.indexOf(ext) !== -1) return { cls: 'file-code', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>' };
        if (FILE_ARCHIVE_EXTS.indexOf(ext) !== -1) return { cls: 'file-archive', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>' };
        return { cls: 'file', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' };
    }

    function joinPath(base, name) {
        var windows = isWindows();
        var sep = windows ? '\\' : '/';
        if (!windows && base === '/') return '/' + name.replace(/^\/+/, '');
        var trailing = windows ? /[\\/]+$/ : /\/+$/;
        return base.replace(trailing, '') + sep + name.replace(windows ? /^[\\/]+/ : /^\/+/, '');
    }

    function isWindowsPath(path) {
        return /^[A-Za-z]:/.test(path) || path.indexOf('\\') !== -1;
    }

    function isRootPath(path) {
        if (!path) return true;
        var p = path.trim();
        return p === '/' || /^[A-Za-z]:[\\/]*$/.test(p);
    }

    function getParentPath(path) {
        if (!path || isRootPath(path)) return '';
        if (isWindowsPath(path)) {
            var winPath = path.replace(/\//g, '\\').replace(/\\+$/, '');
            var winIdx = winPath.lastIndexOf('\\');
            if (winIdx === -1) return '';
            var winParent = winPath.substring(0, winIdx);
            if (/^[A-Za-z]:$/.test(winParent)) winParent += '\\';
            return winParent;
        }
        var unixPath = path.replace(/\/+$/, '');
        var unixIdx = unixPath.lastIndexOf('/');
        if (unixIdx > 0) return unixPath.substring(0, unixIdx);
        if (unixIdx === 0) return '/';
        return '';
    }

    function appendPathPart(base, part, windows) {
        var sep = windows ? '\\' : '/';
        if (!base) return part;
        if (!windows && base === '/') return '/' + part;
        return base.replace(windows ? /[\\/]+$/ : /\/+$/, '') + sep + part;
    }

    function splitPathForBreadcrumb(path) {
        if (isWindowsPath(path)) {
            var normalized = path.replace(/\//g, '\\');
            var match = normalized.match(/^([A-Za-z]:)\\*/);
            var root = match ? match[1] + '\\' : '';
            var rest = match ? normalized.substring(match[0].length) : normalized;
            return { windows: true, root: root, parts: rest.split('\\').filter(Boolean) };
        }
        var absolute = path.charAt(0) === '/';
        var unixRest = absolute ? path.replace(/^\/+/, '') : path;
        return { windows: false, root: absolute ? '/' : '', parts: unixRest.split('/').filter(Boolean) };
    }

    function isAbsoluteInputPath(path) {
        return path.charAt(0) === '/' || path.charAt(0) === '~' || /^[A-Za-z]:[\\/]/.test(path) || (path.indexOf(':') !== -1 && path.indexOf('\\') !== -1);
    }

    function onItemClick(entry) {
        var items = fpFileList.querySelectorAll('.fp-file-item');
        var fullPath = joinPath(fpState.currentPath, entry.name);
        fpState.selectedPath = fullPath;
        for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle('selected', items[i].dataset.name === entry.name);
        }
        if (entry.isDir && fpState.mode === 'folder') {
            fpFilename.value = entry.name;
            fpOk.disabled = false;
            clearPreview();
        } else if (!entry.isDir) {
            fpFilename.value = entry.name;
            fpOk.disabled = (fpState.mode === 'folder');
            if (fpState.mode === 'file') showPreview(fullPath, entry); else clearPreview();
        } else {
            fpFilename.value = '';
            fpOk.disabled = (fpState.mode !== 'folder');
            clearPreview();
        }
    }

    function showPreview(filePath, entry) {
        if (!fpPreviewPane) return;
        var ext = (entry.extension || '').toLowerCase();
        if (FILE_IMAGE_EXTS.indexOf(ext) === -1) {
            fpPreviewPane.style.display = 'none';
            fpPreviewPane.classList.remove('anim-enter');
            return;
        }
        fpPreviewPane.style.display = 'flex';
        fpPreviewPane.classList.remove('anim-enter');
        void fpPreviewPane.offsetWidth;
        fpPreviewPane.classList.add('anim-enter');
        // Reset image opacity for fade-in
        if (fpPreviewImg) fpPreviewImg.classList.remove('loaded');
        var token = fpState._navToken;
        window.monolithApi.get_file_preview(filePath).then(function (res) {
            if (token !== fpState._navToken || fpState.selectedPath !== filePath) return;
            if (res && res.success && res.dataUrl) {
                fpPreviewImg.src = res.dataUrl;
                fpPreviewImg.style.display = 'block';
                // Fade in image after load
                fpPreviewImg.onload = function () { fpPreviewImg.classList.add('loaded'); };
                fpPreviewInfo.textContent = formatSize(entry.size) + ' | ' + ext.toUpperCase();
            } else { noPreview(); }
        }).catch(function () {
            if (token !== fpState._navToken || fpState.selectedPath !== filePath) return;
            noPreview();
        });
        function noPreview() { fpPreviewImg.src = ''; fpPreviewImg.style.display = 'none'; fpPreviewInfo.textContent = 'Preview not available'; }
    }

    function clearPreview() {
        if (!fpPreviewPane) return;
        fpPreviewPane.style.display = 'none';
        fpPreviewPane.classList.remove('anim-enter');
        if (fpPreviewImg) { fpPreviewImg.src = ''; fpPreviewImg.classList.remove('loaded'); }
        if (fpPreviewInfo) fpPreviewInfo.textContent = '';
    }

    function renderBreadcrumb(path) {
        if (!fpBreadcrumb) return;
        fpBreadcrumb.innerHTML = '';
        if (!path) return;
        if (fpPathInput) fpPathInput.value = path;
        var parsed = splitPathForBreadcrumb(path);
        var acc = parsed.root;
        var hasSegment = false;
        function addSep() {
            var sp = document.createElement('span');
            sp.className = 'fp-bc-sep';
            sp.textContent = '\u203A';
            fpBreadcrumb.appendChild(sp);
        }
        function addSegment(label, clickPath, isLast) {
            if (hasSegment) addSep();
            var seg = document.createElement('span');
            seg.className = 'fp-bc-segment' + (isLast ? ' fp-bc-last' : '');
            seg.textContent = label;
            if (!isLast) seg.addEventListener('click', function (e) { e.stopPropagation(); doNavigate(clickPath); });
            fpBreadcrumb.appendChild(seg);
            hasSegment = true;
        }
        if (parsed.root) {
            addSegment(parsed.windows ? parsed.root.replace(/\\+$/, '') : '/', parsed.root, parsed.parts.length === 0);
        }
        parsed.parts.forEach(function (p, i) {
            acc = appendPathPart(acc, p, parsed.windows);
            addSegment(p, acc, i === parsed.parts.length - 1);
        });
    }

    function updateNavButtons() {
        if (fpBack) fpBack.disabled = fpState.historyIndex <= 0;
        if (fpForward) fpForward.disabled = fpState.historyIndex >= fpState.history.length - 1;
        if (fpUp) fpUp.disabled = !fpState.currentPath || isRootPath(fpState.currentPath);
    }

    function showLoading(s) {
        if (!fpLoading) { console.warn('[Monoloth][Picker] fpLoading element missing'); return; }
        fpLoading.style.display = s ? 'flex' : 'none';
        if (fpFileList) fpFileList.style.display = s ? 'none' : '';
        if (fpEmpty) fpEmpty.style.display = 'none';
    }

    function showEmpty() {
        if (fpEmpty) fpEmpty.style.display = 'flex';
        if (fpEmpty) fpEmpty.querySelector('span').textContent = 'This folder is empty';
        if (fpFileList) fpFileList.innerHTML = '';
        if (fpLoading) fpLoading.style.display = 'none';
        if (fpBreadcrumb) fpBreadcrumb.innerHTML = '';
        clearPreview();
    }

    function showError(msg) {
        if (fpEmpty) fpEmpty.style.display = 'flex';
        if (fpEmpty) fpEmpty.querySelector('span').textContent = msg;
        if (fpFileList) fpFileList.innerHTML = '';
        if (fpLoading) fpLoading.style.display = 'none';
        if (fpBreadcrumb) fpBreadcrumb.innerHTML = '';
        clearPreview();
    }

    function formatDate(value) {
        if (value === null || value === undefined || value === '') return '\u2014';
        if (typeof value === 'number' && value > 0) {
            return new Date(value * 1000).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
        }
        if (typeof value === 'string') {
            // Backend now returns relative strings like "3d ago", "5h ago", "12m ago", "just now".
            // Display them as-is; only fall back to Date parsing if it looks like an ISO timestamp.
            if (/^\d+(\.\d+)?$/.test(value)) {
                var n = Number(value);
                if (n > 0) return new Date(n * 1000).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
                return '\u2014';
            }
            if (/^(\d{4}-\d{2}-\d{2}|just now|\d+[smhd] ago|\d+y ago)/i.test(value)) {
                return value;
            }
        }
        return '\u2014';
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '\u2014';
        var u = ['B','KB','MB','GB','TB'];
        var i = 0;
        var s = bytes;
        while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
        return (i === 0 ? s : s.toFixed(1)) + ' ' + u[i];
    }

    function loadDrives() {
        if (!fpDrivesList || fpDrivesList.dataset.loaded) return;
        window.monolithApi.get_drives().then(function (drives) {
            if (!drives || drives.length === 0) return;
            fpDrivesList.innerHTML = '';
            drives.forEach(function (d) {
                var item = document.createElement('div');
                item.className = 'fp-drive-item';
                var icon = document.createElement('span');
                icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
                item.appendChild(icon);
                item.appendChild(document.createTextNode(' ' + d.letter + (d.label ? ' \u2014 ' + d.label : '')));
                item.addEventListener('click', function () { doNavigate(isWindowsPath(d.letter) ? d.letter + '\\' : d.letter); });
                fpDrivesList.appendChild(item);
            });
            fpDrivesList.dataset.loaded = '1';
        }).catch(function () {});
    }

    // --- Event handlers ---

    if (fpClose) fpClose.addEventListener('click', function () { closePicker(null); });
    if (fpCancel) fpCancel.addEventListener('click', function () { closePicker(null); });

    if (fpOk) {
        fpOk.addEventListener('click', function () {
            var path = fpState.selectedPath;
            if (!path && fpFilename.value) path = joinPath(fpState.currentPath, fpFilename.value);
            if (!path && fpState.mode === 'folder') path = fpState.currentPath;
            if (path) closePicker(path);
        });
    }

    if (fpBack) fpBack.addEventListener('click', function () {
        if (fpState.historyIndex > 0) { fpState.historyIndex--; fpState.currentPath = fpState.history[fpState.historyIndex]; updateNavButtons(); loadDirectory(fpState.currentPath); }
    });

    if (fpForward) fpForward.addEventListener('click', function () {
        if (fpState.historyIndex < fpState.history.length - 1) { fpState.historyIndex++; fpState.currentPath = fpState.history[fpState.historyIndex]; updateNavButtons(); loadDirectory(fpState.currentPath); }
    });

    if (fpUp) fpUp.addEventListener('click', function () {
        if (!fpState.currentPath) return;
        var result = getParentPath(fpState.currentPath);
        doNavigate(result);
    });

    if (fpRefresh) fpRefresh.addEventListener('click', function () { if (fpState.currentPath) loadDirectory(fpState.currentPath); });
    if (fpFilter) fpFilter.addEventListener('change', function () { updateFilterExts(); if (fpState.currentPath) loadDirectory(fpState.currentPath); });

    // Path input: click on breadcrumb to edit
    if (fpPathBar && fpBreadcrumb) {
        fpBreadcrumb.addEventListener('click', function () {
            fpPathBar.classList.add('editing');
            if (fpPathInput) {
                fpPathInput.focus();
                fpPathInput.select();
            }
        });
    }

    // Path input: handle Enter key to navigate
    if (fpPathInput) {
        fpPathInput.addEventListener('keydown', function (e) {
            if (e.code === 'Enter') {
                e.preventDefault();
                var path = fpPathInput.value.trim();
                if (path) {
                    fpPathBar.classList.remove('editing');
                    navigateToPath(path);
                }
            }
            if (e.code === 'Escape') {
                e.preventDefault();
                fpPathBar.classList.remove('editing');
                if (fpState.currentPath) {
                    fpPathInput.value = fpState.currentPath;
                }
            }
        });

        fpPathInput.addEventListener('blur', function () {
            fpPathBar.classList.remove('editing');
            if (fpState.currentPath) {
                fpPathInput.value = fpState.currentPath;
            }
        });
    }

    // Filename input: Enter to navigate if absolute path, otherwise OK
    if (fpFilename) {
        fpFilename.addEventListener('keydown', function (e) {
            if (e.code === 'Enter') {
                e.preventDefault();
                var val = fpFilename.value.trim();
                if (!val) return;
                if (isAbsoluteInputPath(val)) {
                    navigateToPath(val);
                } else if (fpOk && !fpOk.disabled) {
                    fpOk.click();
                }
            }
        });
    }

    // Sidebar clicks
    var sidebarItems = fpEl.querySelectorAll('.fp-sidebar-item');
    sidebarItems.forEach(function (item) {
        item.addEventListener('click', function () {
            var p = item.dataset.path;
            var sidebarItems = fpEl.querySelectorAll('.fp-sidebar-item');
            for (var si2 = 0; si2 < sidebarItems.length; si2++) {
                sidebarItems[si2].classList.remove('active');
            }
            item.classList.add('active');
            if (QUICK_PATHS[p]) {
                var token = ++fpState._navToken;
                window.monolithApi.get_path_info(QUICK_PATHS[p]).then(function (info) {
                    if (token === fpState._navToken && info && info.success && info.isDir) doNavigate(info.absolute, token);
                });
            }
        });
    });

    if (fpEl) fpEl.addEventListener('click', function (e) {
        if (e.target === fpEl || e.target.classList.contains('fp-overlay')) closePicker(null);
    });

    // Keyboard
    document.addEventListener('keydown', function (e) {
        if (!fpEl || !fpEl.classList.contains('active')) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            if (e.code === 'Escape') { e.preventDefault(); closePicker(null); }
            return;
        }
        if (e.code === 'Escape') { e.preventDefault(); closePicker(null); return; }
        if (e.code === 'Enter') { e.preventDefault(); if (fpOk && !fpOk.disabled) fpOk.click(); return; }
        if (e.code === 'Backspace') { e.preventDefault(); if (fpUp && !fpUp.disabled) fpUp.click(); return; }
        if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
            e.preventDefault();
            var items = fpFileList.querySelectorAll('.fp-file-item');
            if (items.length === 0) return;
            var sel = fpFileList.querySelector('.fp-file-item.selected');
            var idx = -1;
            if (sel) { for (var k = 0; k < items.length; k++) { if (items[k] === sel) { idx = k; break; } } }
            idx = e.code === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx === -1 ? 0 : idx - 1, 0);
            items.forEach(function (it) { it.classList.remove('selected'); });
            items[idx].classList.add('selected');
            var en = items[idx].dataset.name;
            var entries = fpState._listings[fpState.currentPath] || [];
            for (var ek = 0; ek < entries.length; ek++) { if (entries[ek].name === en) { onItemClick(entries[ek]); break; } }
            items[idx].scrollIntoView({ block: 'nearest' });
        }
    });

    function closePicker(result) {
        if (!fpEl) return;
        fpState._navToken++;
        closeModal(fpEl);
        fpState.selectedPath = '';
        if (fpFilename) fpFilename.value = '';
        if (fpOk) fpOk.disabled = true;
        clearPreview();
        if (fpDrivesList) delete fpDrivesList.dataset.loaded;

        if (result && fpState.pickerId) {
            _setLastDirectory(fpState.pickerId, result);
        }

        if (fpState.resolve) {
            fpState.resolve(result);
            fpState.resolve = null;
            fpState.reject = null;
        }
    }

    window.MonolithFilePicker = {
        pickPath: pickPath,
        loadFilePickerConfig: loadFilePickerConfig,
        updatePickerTypeUI: updatePickerTypeUI,
        savePickerType: savePickerType,
        getPickerType: getPickerType,
        setStatusReporter: setStatusReporter,
        joinPath: joinPath,
        isActive: function () { return fpEl && fpEl.classList.contains('active'); }
    };
})();
