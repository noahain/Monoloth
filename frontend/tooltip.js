(function () {
    'use strict';

    var _tooltipEl = null;
    var _tooltipTimer = null;
    var _removeTimer = null;
    var _tooltipTarget = null;
    var _lastX = 0;
    var _lastY = 0;
    var _activeEls = [];

    function getEl() {
        if (!_tooltipEl) {
            _tooltipEl = document.createElement('div');
            _tooltipEl.className = 'monoloth-tooltip';
        }
        return _tooltipEl;
    }

    function position(e) {
        var x = e ? e.clientX + 14 : _lastX + 14;
        var y = e ? e.clientY + 10 : _lastY + 10;
        var tt = getEl();
        var w = tt.offsetWidth;
        var h = tt.offsetHeight;
        if (x + w > window.innerWidth - 8) x = window.innerWidth - w - 8;
        if (y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
        tt.style.left = x + 'px';
        tt.style.top = y + 'px';
    }

    function show(e, text) {
        if (_removeTimer) { clearTimeout(_removeTimer); _removeTimer = null; }
        _lastX = e.clientX;
        _lastY = e.clientY;
        var tt = getEl();
        tt.textContent = text;
        if (!tt.parentNode) {
            document.body.appendChild(tt);
        }
        _tooltipTarget = e.currentTarget;
        _tooltipTimer = setTimeout(function () {
            if (!_tooltipTarget) return;
            position(null);
            // Force reflow so the new left/top commit before .visible activates the position transition
            void tt.offsetWidth;
            tt.classList.add('visible');
        }, 500);
    }

    function move(e) {
        _lastX = e.clientX;
        _lastY = e.clientY;
        var tt = getEl();
        if (tt.classList.contains('visible')) {
            position(e);
        }
    }

    function hide() {
        if (_tooltipTimer) { clearTimeout(_tooltipTimer); _tooltipTimer = null; }
        if (_removeTimer) { clearTimeout(_removeTimer); _removeTimer = null; }
        _tooltipTarget = null;
        if (_tooltipEl) {
            _tooltipEl.classList.remove('visible');
            // Wait for exit transition before removing from DOM
            var el = _tooltipEl;
            _removeTimer = setTimeout(function () {
                _removeTimer = null;
                if (el.parentNode && !el.classList.contains('visible')) {
                    el.parentNode.removeChild(el);
                }
            }, 120);
        }
    }

    function clearTimer() {
        if (_tooltipTimer) { clearTimeout(_tooltipTimer); _tooltipTimer = null; }
        _tooltipTarget = null;
    }

    function attach(el, text) {
        if (el.hasAttribute('title')) {
            el.removeAttribute('title');
        }
        el.dataset.tooltip = text;

        var onMouseEnter = function (e) {
            clearTimer();
            show(e, text);
        };
        var onMouseLeave = function () {
            clearTimer();
            hide();
        };
        var onMouseMove = function (e) {
            move(e);
        };

        el.addEventListener('mouseenter', onMouseEnter);
        el.addEventListener('mouseleave', onMouseLeave);
        el.addEventListener('mousemove', onMouseMove);

        _activeEls.push({ el: el, enter: onMouseEnter, leave: onMouseLeave, move: onMouseMove });
    }

    function detach(el) {
        for (var i = _activeEls.length - 1; i >= 0; i--) {
            if (_activeEls[i].el === el) {
                el.removeEventListener('mouseenter', _activeEls[i].enter);
                el.removeEventListener('mouseleave', _activeEls[i].leave);
                el.removeEventListener('mousemove', _activeEls[i].move);
                _activeEls.splice(i, 1);
            }
        }
        el.removeAttribute('data-tooltip');
    }

    function isAttached(el) {
        for (var i = 0; i < _activeEls.length; i++) {
            if (_activeEls[i].el === el) return true;
        }
        return false;
    }

    function scan(container) {
        var els = (container || document).querySelectorAll('[data-tooltip]');
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (isAttached(el)) continue;
            if (el.hasAttribute('title')) {
                el.removeAttribute('title');
            }
            attach(el, el.getAttribute('data-tooltip'));
        }
    }

    function init() {
        getEl();
        scan(document);
    }

    function cleanup() {
        for (var i = _activeEls.length - 1; i >= 0; i--) {
            if (!document.body.contains(_activeEls[i].el)) {
                var entry = _activeEls[i];
                entry.el.removeEventListener('mouseenter', entry.enter);
                entry.el.removeEventListener('mouseleave', entry.leave);
                entry.el.removeEventListener('mousemove', entry.move);
                _activeEls.splice(i, 1);
            }
        }
    }

    window.MonolothTooltip = {
        init: init,
        attach: attach,
        detach: detach,
        scan: scan,
        show: show,
        hide: hide,
        move: move,
        cleanup: cleanup
    };
})();
