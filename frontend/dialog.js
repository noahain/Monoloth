(function () {
    'use strict';

    var UI = window.MonolothUI;
    var openModal = UI.openModal;
    var closeModal = UI.closeModal;
    var escapeHtml = UI.escapeHtml;

    var _confirmPrefs = {};

    // --- Inline Dialog (replaces prompt/confirm) ---
    var idEl = document.getElementById('inline-dialog');
    var idTitle = document.getElementById('id-title');
    var idBody = document.getElementById('id-body');
    var idFooter = document.getElementById('id-footer');
    var idClose = document.getElementById('id-close');

    // Per-dialog resolvers so overlapping shows don't strand earlier promises.
    var _dialogStack = [];

    function finishTop(result) {
        var top = _dialogStack.pop();
        if (!top) return;
        if (result !== undefined) {
            top.resolve(result);
        } else {
            top.reject(new Error('cancelled'));
        }
    }

    function closeDialog(result) {
        if (!idEl) return;
        if (_dialogStack.length === 0) return;
        closeModal(idEl);
        finishTop(result);
    }

    if (idClose) {
        idClose.addEventListener('click', function () { closeDialog(); });
    }

    if (idEl) {
        idEl.addEventListener('click', function (e) {
            if (e.target === idEl || e.target.classList.contains('id-overlay')) closeDialog();
        });
    }

    function showPrompt(title, label, defaultValue) {
        return new Promise(function (resolve, reject) {
            _dialogStack.push({ resolve: resolve, reject: reject });
            if (idTitle) idTitle.textContent = title;
            if (idBody) {
                idBody.innerHTML = '<input type="text" id="id-input-field" class="id-input"><div id="id-input-error" class="id-error"></div>';
                var inp = document.getElementById('id-input-field');
                if (inp) inp.setAttribute('placeholder', label || '');
                if (inp && defaultValue) inp.value = defaultValue;
                setTimeout(function () { if (inp) { inp.focus(); inp.select(); } }, 50);
                var onKey = function (e) {
                    if (e.code === 'Enter') {
                        var val = inp.value.trim();
                        if (!val) return;
                        closeDialog(val);
                    }
                    if (e.code === 'Escape') closeDialog();
                };
                if (inp) inp.addEventListener('keydown', onKey);
            }
            if (idFooter) {
                idFooter.innerHTML = '<button id="id-btn-cancel-el" class="id-btn-cancel">Cancel</button><button id="id-btn-ok-el" class="id-btn-primary">OK</button>';
                var cancelBtn = document.getElementById('id-btn-cancel-el');
                var okBtn = document.getElementById('id-btn-ok-el');
                if (cancelBtn) cancelBtn.addEventListener('click', function () { closeDialog(); });
                if (okBtn) okBtn.addEventListener('click', function () {
                    var inp = document.getElementById('id-input-field');
                    var val = inp ? inp.value.trim() : '';
                    var errEl = document.getElementById('id-input-error');
                    if (!val) {
                        if (errEl) errEl.textContent = 'Please enter a value.';
                        return;
                    }
                    closeDialog(val);
                });
            }
            openModal(idEl);
        });
    }

    function showConfirm(title, message, skipKey) {
        if (skipKey && _confirmPrefs && _confirmPrefs[skipKey] === true) {
            return Promise.resolve(true);
        }
        return new Promise(function (resolve, reject) {
            _dialogStack.push({ resolve: resolve, reject: reject });
            if (idTitle) idTitle.textContent = title;
            if (idBody) {
                if (skipKey) {
                    idBody.innerHTML = '<p>' + escapeHtml(message) + '</p>' +
                        '<label class="id-skip">' +
                        '<input type="checkbox" id="id-skip-cb-el">' +
                        '<span class="id-skip-label">Don\'t ask again</span>' +
                        '</label>';
                } else {
                    idBody.innerHTML = '<p>' + escapeHtml(message) + '</p>';
                }
            }
            if (idFooter) {
                idFooter.innerHTML = '<button id="id-btn-cancel-el" class="id-btn-cancel">Cancel</button><button id="id-btn-ok-el" class="id-btn-primary">OK</button>';
                var cancelBtn = document.getElementById('id-btn-cancel-el');
                var okBtn = document.getElementById('id-btn-ok-el');
                if (cancelBtn) cancelBtn.addEventListener('click', function () { closeDialog(); });
                if (okBtn) okBtn.addEventListener('click', function () {
                    if (skipKey) {
                        var cb = document.getElementById('id-skip-cb-el');
                        if (cb && cb.checked) setConfirmPref(skipKey, true);
                    }
                    closeDialog(true);
                });
            }
            openModal(idEl);
        });
    }

    function confirmBackToLauncher() {
        return showConfirm('Return to Launcher', 'Return to launcher? The current session will be terminated.', 'return_to_launcher');
    }

    function loadConfirmPrefs() {
        if (!window.monolithApi) { _confirmPrefs = {}; return; }
        window.monolithApi.get_config('confirm_dialog_prefs')
            .then(function (val) { _confirmPrefs = (val && typeof val === 'object') ? val : {}; })
            .catch(function () { _confirmPrefs = {}; });
    }

    function setConfirmPref(key, value) {
        if (!_confirmPrefs || typeof _confirmPrefs !== 'object') _confirmPrefs = {};
        _confirmPrefs[key] = value;
        if (window.monolithApi) {
            window.monolithApi.set_config('confirm_dialog_prefs', _confirmPrefs).catch(function () {});
        }
    }

    function isDialogActive() {
        return !!(idEl && idEl.classList.contains('active'));
    }

    window.MonolithDialog = {
        showPrompt: showPrompt,
        showConfirm: showConfirm,
        confirmBackToLauncher: confirmBackToLauncher,
        closeDialog: closeDialog,
        loadConfirmPrefs: loadConfirmPrefs,
        setConfirmPref: setConfirmPref,
        isDialogActive: isDialogActive
    };
})();
