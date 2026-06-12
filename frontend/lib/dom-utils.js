(function () {
    'use strict';

    var _focusBeforeModal = null;
    var _trapHandler = null;

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
    }

    function forceReflow(el) {
        if (!el) return;
        void el.offsetWidth;
    }

    function saveFocus() {
        _focusBeforeModal = document.activeElement;
    }

    function restoreFocus() {
        if (_focusBeforeModal && _focusBeforeModal.focus) {
            try { _focusBeforeModal.focus(); } catch (e) {}
            _focusBeforeModal = null;
        }
    }

    function trapFocus(container) {
        if (_trapHandler) {
            document.removeEventListener('keydown', _trapHandler, true);
            _trapHandler = null;
        }
        if (!container) return;
        var allFocusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        var focusable = Array.from(allFocusable).filter(function (el) { return el.offsetParent !== null; });
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        setTimeout(function () { first.focus(); }, 50);
        _trapHandler = function (e) {
            if (e.key !== 'Tab') return;
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', _trapHandler, true);
    }

    function releaseFocus() {
        if (_trapHandler) {
            document.removeEventListener('keydown', _trapHandler, true);
            _trapHandler = null;
        }
        restoreFocus();
    }

    var ANIM_EXIT_MS = 150;
    var ANIM_COLLAPSE_MS = 300;

    function openModal(el) {
        if (!el) return;
        el.classList.remove('anim-exit');
        forceReflow(el);
        el.classList.add('active');
        saveFocus();
        trapFocus(el);
    }

    function closeModal(el) {
        if (!el) return;
        releaseFocus();
        el.classList.add('anim-exit');
        setTimeout(function () {
            el.classList.remove('active', 'anim-exit');
        }, ANIM_EXIT_MS);
    }

    function debounce(fn, ms) {
        var timer = null;
        return function () {
            var args = arguments;
            var ctx = this;
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
        };
    }

    function silent(promise) {
        if (!promise || typeof promise.catch !== 'function') return promise;
        return promise.catch(function () {});
    }

    function waitFor(predicate, timeoutMs, intervalMs) {
        return new Promise(function (resolve) {
            var start = Date.now();
            (function check() {
                if (predicate()) return resolve(true);
                if (Date.now() - start > timeoutMs) return resolve(false);
                setTimeout(check, intervalMs || 50);
            })();
        });
    }

    function setActiveButtonGroup(container, predicate) {
        if (!container) return;
        var btns = container.querySelectorAll('button');
        btns.forEach(function (b) { b.classList.toggle('active', predicate(b)); });
    }

    function togglePanelExitBanner(banner, show, onClick) {
        if (!banner) return;
        if (show) {
            banner.style.display = '';
            banner.classList.remove('anim-exit');
            banner.classList.add('anim-enter');
            if (onClick) banner.onclick = onClick;
        } else {
            banner.classList.remove('anim-enter');
            banner.classList.add('anim-exit');
            setTimeout(function () {
                banner.style.display = 'none';
                banner.classList.remove('anim-exit');
            }, ANIM_EXIT_MS);
            banner.onclick = null;
        }
    }

    window.MonolothUI = {
        escapeHtml: escapeHtml,
        forceReflow: forceReflow,
        saveFocus: saveFocus,
        restoreFocus: restoreFocus,
        trapFocus: trapFocus,
        releaseFocus: releaseFocus,
        openModal: openModal,
        closeModal: closeModal,
        debounce: debounce,
        silent: silent,
        waitFor: waitFor,
        setActiveButtonGroup: setActiveButtonGroup,
        togglePanelExitBanner: togglePanelExitBanner,
        ANIM_EXIT_MS: ANIM_EXIT_MS,
        ANIM_COLLAPSE_MS: ANIM_COLLAPSE_MS
    };
})();
