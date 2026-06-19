(function () {
    'use strict';

    var UI = window.MonolothUI;
    var openModal = UI.openModal;
    var closeModal = UI.closeModal;

    // ================================================================
    // Profile Management
    // ================================================================

    var _profiles = [];
    var _activeProfile = 'Default';

    function loadProfiles() {
        if (!window.monolithApi) return Promise.resolve();
        return window.monolithApi.get_profiles()
            .then(function (res) {
                if (res && res.success) {
                    _profiles = res.profiles || [];
                    _activeProfile = res.active || 'Default';
                    updateProfileUI();
                }
            })
            .catch(function () {});
    }

    function updateProfileUI() {
        var nameEl = document.getElementById('current-profile-name');
        if (nameEl) nameEl.textContent = _activeProfile;
        renderProfilesList();
        renderProfileSwitcher();
    }

    function renderProfilesList() {
        var list = document.getElementById('profiles-list');
        if (!list) return;
        if (window.MonolothTooltip) {
            window.MonolothTooltip.cleanup();
        }
        list.innerHTML = '';
        _profiles.forEach(function (profile, idx) {
            var item = document.createElement('div');
            item.className = 'profile-item' + (profile.name === _activeProfile ? ' active' : '') + (profile.isDefault ? ' is-default' : '');

            var info = document.createElement('div');
            info.className = 'profile-item-info';

            var nameSpan = document.createElement('span');
            nameSpan.className = 'profile-item-name';
            nameSpan.textContent = profile.name;
            info.appendChild(nameSpan);

            var badge = document.createElement('span');
            badge.className = 'profile-item-badge';
            if (profile.isDefault) {
                badge.textContent = 'Default';
                badge.classList.add('badge-default');
            }
            if (profile.name === _activeProfile) {
                badge.textContent = 'Active';
                badge.classList.add('badge-active');
            }
            info.appendChild(badge);

            item.appendChild(info);

            var actions = document.createElement('div');
            actions.className = 'profile-item-actions';

            if (profile.isDefault) {
                var defaultLabel = document.createElement('span');
                defaultLabel.className = 'profile-default-label';
                defaultLabel.textContent = 'Built-in';
                actions.appendChild(defaultLabel);
            } else if (profile.name === _activeProfile) {
                var activeLabel = document.createElement('span');
                activeLabel.className = 'profile-default-label';
                activeLabel.textContent = 'Active';
                actions.appendChild(activeLabel);
            } else {
                var switchBtn = document.createElement('button');
                switchBtn.className = 'profile-action-btn profile-switch-btn';
                switchBtn.textContent = 'Switch';
                switchBtn.addEventListener('click', function () {
                    switchToProfile(profile.name);
                });
                actions.appendChild(switchBtn);

                var renameBtn = document.createElement('button');
                renameBtn.className = 'profile-action-btn profile-rename-btn';
                renameBtn.textContent = 'Rename';
                renameBtn.addEventListener('click', function () {
                    renameProfileInline(profile.name);
                });
                actions.appendChild(renameBtn);

                var deleteBtn = document.createElement('button');
                deleteBtn.className = 'profile-action-btn profile-delete-btn';
                deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
                if (window.MonolothTooltip) {
                    window.MonolothTooltip.attach(deleteBtn, 'Delete this profile');
                }
                deleteBtn.addEventListener('click', function () {
                    deleteProfileConfirm(profile.name);
                });
                actions.appendChild(deleteBtn);
            }

            item.appendChild(actions);
            list.appendChild(item);
        });
    }

    function switchToProfile(name) {
        if (!window.monolithApi) return;
        window.monolithApi.switch_profile(name)
            .then(function (res) {
                if (res && res.success) {
                    _activeProfile = name;
                    updateProfileUI();
                    if (window.MonolothApp.isMainActive()) {
                        window.MonolothApp.showStatus('profiles-status', 'Profile switched \u2014 changes apply on next launch.', false);
                    } else {
                        window.MonolothApp.showStatus('profiles-status', 'Switched to ' + name, false);
                    }
                    // Reload all settings from new profile
                    window.MonolothApp.reloadProfileSettings();
                } else {
                    window.MonolothApp.showStatus('profiles-status', res.error || 'Failed to switch', true);
                }
            })
            .catch(function (err) {
                window.MonolothApp.showStatus('profiles-status', 'Error: ' + err, true);
            });
    }

    function deleteProfileConfirm(name) {
        window.MonolithDialog.showConfirm('Delete Profile', 'Delete profile "' + name + '"? This cannot be undone.', 'delete_profile').then(function () {
            if (!window.monolithApi) return;
            window.monolithApi.delete_profile(name)
                .then(function (res) {
                    if (res && res.success) {
                        loadProfiles();
                        window.MonolothApp.showStatus('profiles-status', 'Profile deleted', false);
                    } else {
                        window.MonolothApp.showStatus('profiles-status', res.error || 'Failed to delete', true);
                    }
                })
                .catch(function (err) {
                    window.MonolothApp.showStatus('profiles-status', 'Error: ' + err, true);
                });
        }).catch(function () {});
    }

    function renameProfileInline(oldName) {
        window.MonolithDialog.showPrompt('Rename Profile', 'Enter new name...', oldName).then(function (newName) {
            if (newName === oldName) return;
            if (!window.monolithApi) return;
            window.monolithApi.rename_profile(oldName, newName)
                .then(function (res) {
                    if (res && res.success) {
                        loadProfiles();
                        window.MonolothApp.showStatus('profiles-status', 'Profile renamed to ' + newName, false);
                    } else {
                        window.MonolothApp.showStatus('profiles-status', res.error || 'Failed to rename profile', true);
                    }
                })
                .catch(function (err) {
                    window.MonolothApp.showStatus('profiles-status', 'Error: ' + err, true);
                });
        }).catch(function () {});
    }

    // Add profile button
    var addProfileBtn = document.getElementById('add-profile-btn');
    if (addProfileBtn) {
        addProfileBtn.addEventListener('click', function () {
            window.MonolithDialog.showPrompt('New Profile', 'Enter profile name...', '').then(function (name) {
                if (!window.monolithApi) return;
                var filenameRegex = /^[^\\/:\*\?"<>\|]+$/;
                if (!filenameRegex.test(name)) {
                    window.MonolothApp.showStatus('profiles-status', 'Invalid characters: \\ / : * ? " < > |', true);
                    return;
                }
                window.monolithApi.create_profile(name)
                    .then(function (res) {
                        if (res && res.success) {
                            loadProfiles();
                            window.MonolothApp.showStatus('profiles-status', 'Profile created', false);
                        } else {
                            window.MonolothApp.showStatus('profiles-status', res.error || 'Failed to create', true);
                        }
                    })
                    .catch(function (err) {
                        window.MonolothApp.showStatus('profiles-status', 'Error: ' + err, true);
                    });
            }).catch(function () {});
        });
    }

    // ================================================================
    // Profile Switcher Modal
    // ================================================================

    var profileSwitcher = document.getElementById('profile-switcher');
    var profileSelectorBtn = document.getElementById('profile-selector-btn');
    var psClose = document.getElementById('ps-close');
    var psBody = document.getElementById('ps-body');

    function renderProfileSwitcher() {
        if (!psBody) return;
        psBody.innerHTML = '';
        _profiles.forEach(function (profile) {
            var item = document.createElement('div');
            item.className = 'ps-item' + (profile.name === _activeProfile ? ' active' : '');
            var nameSpan = document.createElement('span');
            nameSpan.className = 'ps-item-name';
            nameSpan.textContent = profile.name;
            item.appendChild(nameSpan);
            if (profile.name === _activeProfile) {
                var checkSpan = document.createElement('span');
                checkSpan.className = 'ps-item-check';
                checkSpan.innerHTML = '&#10003;';
                item.appendChild(checkSpan);
            }
            item.addEventListener('click', function () {
                switchToProfile(profile.name);
                closeProfileSwitcher();
            });
            psBody.appendChild(item);
        });
    }

    function openProfileSwitcher() {
        if (!profileSwitcher) return;
        renderProfileSwitcher();
        openModal(profileSwitcher);
    }

    function closeProfileSwitcher() {
        if (!profileSwitcher) return;
        closeModal(profileSwitcher);
    }

    if (profileSelectorBtn) {
        profileSelectorBtn.addEventListener('click', openProfileSwitcher);
    }

    if (psClose) {
        psClose.addEventListener('click', closeProfileSwitcher);
    }

    if (profileSwitcher) {
        profileSwitcher.addEventListener('click', function (e) {
            if (e.target === profileSwitcher || e.target.classList.contains('ps-overlay')) {
                closeProfileSwitcher();
            }
        });
    }

    window.MonolithProfiles = {
        loadProfiles: loadProfiles,
        updateProfileUI: updateProfileUI,
        switchToProfile: switchToProfile,
        deleteProfileConfirm: deleteProfileConfirm,
        renameProfileInline: renameProfileInline,
        openProfileSwitcher: openProfileSwitcher,
        closeProfileSwitcher: closeProfileSwitcher,
        isSwitcherActive: function () { return !!(profileSwitcher && profileSwitcher.classList.contains('active')); },
        getProfilesList: function () { return _profiles || []; },
        getActiveProfileName: function () { return _activeProfile || 'Default'; }
    };
})();
