(function () {
    'use strict';

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderInto(container, tabId) {
        var tab = window.TabManager && window.TabManager.state().tabs.find(function (t) { return t.id === tabId; });
        if (!tab) {
            console.error('[simplified-landing] no tab for', tabId);
            return;
        }
        var profile = tab.profile || 'Default';
        container.innerHTML = ''
            + '<div class="simplified-landing-inner">'
            + '  <div class="sl-header">'
            + '    <button class="sl-profile-btn" id="sl-profile-btn-' + escapeHtml(tabId) + '">'
            + '      <span class="sl-profile-name">' + escapeHtml(profile) + '</span>'
            + '      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>'
            + '    </button>'
            + '  </div>'
            + '  <div class="sl-actions">'
            + '    <button class="sl-choose-dir" id="sl-choose-' + escapeHtml(tabId) + '">'
            + '      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
            + '      <span>Choose Project Directory</span>'
            + '    </button>'
            + '    <button class="sl-open-last" id="sl-open-last-' + escapeHtml(tabId) + '" data-tooltip="Uses the last directory opened in any tab">'
            + '      <span>Open Terminal in Last Directory</span>'
            + '    </button>'
            + '  </div>'
            + '  <div class="sl-hint">'
            + '    <kbd>Ctrl</kbd>+<kbd>P</kbd> Commands &nbsp;&middot;&nbsp; <kbd>Ctrl</kbd>+<kbd>,</kbd> Settings'
            + '  </div>'
            + '</div>';

        var profileBtn = document.getElementById('sl-profile-btn-' + tabId);
        if (profileBtn) {
            profileBtn.addEventListener('click', function () {
                if (typeof window.openProfileSwitcher === 'function') {
                    window.openProfileSwitcher('tab', tabId);
                }
            });
        }
        var chooseBtn = document.getElementById('sl-choose-' + tabId);
        if (chooseBtn) chooseBtn.addEventListener('click', function () { chooseDirectory(tabId); });
        var openLastBtn = document.getElementById('sl-open-last-' + tabId);
        if (openLastBtn) openLastBtn.addEventListener('click', function () { openLastDirectory(tabId); });
    }

    function chooseDirectory(tabId) {
        if (!window.monolithApi || !window.monolithApi.pick_directory) return;
        window.monolithApi.pick_directory()
            .then(function (res) {
                if (res && res.path) {
                    if (window.monolithApi.save_last_directory) {
                        window.monolithApi.save_last_directory(res.path);
                    }
                    if (window.TabManager && window.TabManager.initTabTerminal) {
                        window.TabManager.initTabTerminal(tabId, res.path);
                    }
                }
            })
            .catch(function (e) { console.error('[simplified-landing] pick_directory failed', e); });
    }

    function openLastDirectory(tabId) {
        if (!window.monolithApi || !window.monolithApi.get_last_directory) return;
        window.monolithApi.get_last_directory()
            .then(function (res) {
                if (res && res.path) {
                    if (window.TabManager && window.TabManager.initTabTerminal) {
                        window.TabManager.initTabTerminal(tabId, res.path);
                    }
                } else {
                    chooseDirectory(tabId);
                }
            })
            .catch(function () { chooseDirectory(tabId); });
    }

    window.simplifiedLanding = { renderInto: renderInto };
})();
