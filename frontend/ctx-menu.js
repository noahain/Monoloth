(function () {
    'use strict';

    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('contextmenu', function (e) {
            var t = e.target;
            if (t && t.nodeType === 1) {
                var tag = t.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
            }
            var sel = window.getSelection && window.getSelection().toString();
            if (sel && sel.length > 0) return;
            e.preventDefault();
        }, true);
    }

    var CTX_ICONS = {
        folder: '<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        open: '<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
        copy: '<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        x: '<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        plus: '<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        pencil: '<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
        profile: '<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    };

    function shortcutHtml(key) {
        var sc = window.MonolithShortcuts && window.MonolithShortcuts.getShortcut;
        if (!sc) return '';
        var s = sc.call(window.MonolithShortcuts, key);
        if (!s) return '';
        return '<kbd class="ctx-shortcut">' + s.replace(/\+/g, ' + ') + '</kbd>';
    }

    function attachMenuDismissers(menu) {
        setTimeout(function () {
            var dismiss = function (e) {
                if (!menu.contains(e.target) && menu.parentNode) {
                    menu.remove();
                    document.removeEventListener('click', dismiss);
                    document.removeEventListener('keydown', keyDismiss);
                }
            };
            var keyDismiss = function (e) {
                if (e.key === 'Escape' && menu.parentNode) {
                    menu.remove();
                    document.removeEventListener('click', dismiss);
                    document.removeEventListener('keydown', keyDismiss);
                }
            };
            document.addEventListener('click', dismiss);
            document.addEventListener('keydown', keyDismiss);
        }, 0);
    }

    function createContextMenu(x, y, items) {
        var existing = document.querySelector('.ctx-menu');
        if (existing) existing.remove();
        var html = '';
        items.forEach(function (it) {
            if (it.divider) { html += '<div class="ctx-menu-divider"></div>'; return; }
            var icon = it.icon ? (CTX_ICONS[it.icon] || '') : '';
            var shortcut = it.shortcutHtml || '';
            var dangerCls = it.danger ? ' danger' : '';
            html += '<div class="ctx-item' + dangerCls + '" data-action="' + it.action + '">' + icon + '<span class="ctx-label">' + it.label + '</span>' + shortcut + '</div>';
        });
        var menu = document.createElement('div');
        menu.className = 'ctx-menu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.innerHTML = html;
        menu.addEventListener('click', function (e) {
            var t = e.target.closest('.ctx-item');
            if (!t) return;
            var a = t.getAttribute('data-action');
            menu.remove();
            for (var i = 0; i < items.length; i++) {
                if (items[i].action === a && items[i].onSelect) { items[i].onSelect(); break; }
            }
        });
        document.body.appendChild(menu);
        attachMenuDismissers(menu);
        return menu;
    }

    window.MonolithCtxMenu = {
        icons: CTX_ICONS,
        shortcutHtml: shortcutHtml,
        createContextMenu: createContextMenu,
        attachMenuDismissers: attachMenuDismissers
    };
})();
