(function () {
    'use strict';

    var api = {};
    
    function invoke(cmd, args) {
        var tauriInvoke = null;
        if (window.__TAURI__) {
            if (window.__TAURI__.core && window.__TAURI__.core.invoke) {
                tauriInvoke = window.__TAURI__.core.invoke;
            } else if (typeof window.__TAURI__.invoke === 'function') {
                tauriInvoke = window.__TAURI__.invoke;
            } else if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
                tauriInvoke = window.__TAURI_INTERNALS__.invoke;
            }
        }
        if (tauriInvoke) {
            return Promise.resolve(tauriInvoke(cmd, args || {}))
                .then(function (result) {
                    return result;
                })
                .catch(function (err) {
                    throw err;
                });
        }
        return Promise.reject('Tauri invoke not available');
    }

    function listen(event, handler) {
        var tauriListen = null;
        if (window.__TAURI__) {
            if (window.__TAURI__.event && window.__TAURI__.event.listen) {
                tauriListen = window.__TAURI__.event.listen;
            } else if (typeof window.__TAURI__.listen === 'function') {
                tauriListen = window.__TAURI__.listen;
            } else if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.listen === 'function') {
                tauriListen = window.__TAURI_INTERNALS__.listen;
            }
        }
        if (tauriListen) {
            return Promise.resolve(tauriListen(event, handler));
        }
        console.error('[TauriBridge] No listen method available');
        return Promise.reject('Tauri listen not available');
    }

    // --- Terminal ---
    api.start_terminal = function (sessionId, dir, recordHistory, shell, cols, rows) {
        cols = cols || 80;
        rows = rows || 24;
        return invoke('start_terminal', { sessionId: sessionId, directory: dir, recordHistory: recordHistory, shell: shell, cols: cols, rows: rows })
            .then(function (gen) { return { success: true, path: dir, generation: gen }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.start_opencode = async function (dir) {
        var tabId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '-' + Math.random());
        var activeProfile = await api.get_config('active_profile');
        return api.createTab(tabId, activeProfile || null, dir, 80, 24, 'terminal');
    };

    api.send_input = function (sessionId, data) {
        return invoke('send_input', { sessionId: sessionId, data: data })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.resize_terminal = function (sessionId, cols, rows) {
        return invoke('resize_terminal', { sessionId: sessionId, cols: cols, rows: rows })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.terminate_terminal = function (sessionId) {
        var sid = sessionId || 'main';
        return invoke('terminate_terminal', { sessionId: sid })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.terminate = function () {
        return api.terminate_terminal('main');
    };

    // --- Tabs (Unit E) ---
    api.getTabsConfig = function () {
        return invoke('get_tabs_config');
    };

    api.setTabsConfig = function (cfg) {
        return invoke('set_tabs_config', { cfg: cfg });
    };

    api.createTab = function (tabId, profile, dir, cols, rows, view) {
        return invoke('create_tab', { tabId: tabId, profile: profile, dir: dir, cols: cols, rows: rows, view: view || null });
    };

    api.closeTab = function (tabId, force) {
        return invoke('close_tab', { tabId: tabId, force: force || false });
    };

    api.restoreTabSessions = function () {
        return invoke('restore_tab_sessions');
    };

    api.setTabActiveView = function (tabId, view) {
        return invoke('set_tab_active_view', { tabId: tabId, view: view });
    };

    api.setActiveTab = function (tabId) {
        return invoke('set_active_tab', { tabId: tabId });
    };

    api.setTabPinned = function (tabId, pinned) {
        return invoke('set_tab_pinned', { tabId: tabId, pinned: pinned });
    };

    api.setTabColor = function (tabId, color) {
        return invoke('set_tab_color', { tabId: tabId, color: color });
    };

    api.setTabProfile = function (tabId, profile, cols, rows) {
        return invoke('set_tab_profile', { tabId: tabId, profile: profile, cols: cols, rows: rows });
    };

    api.reorderTabs = function (newOrder) {
        return invoke('reorder_tabs', { newOrder: newOrder });
    };

    api.refreshTab = function (tabId, cols, rows) {
        return invoke('refresh_tab', { tabId: tabId, cols: cols, rows: rows });
    };

    api.getProfileConfigByName = function (name) {
        return invoke('get_profile_config_by_name', { name: name });
    };

    // --- System commands ---
    api.open_in_explorer = function (path) {
        return invoke('open_in_explorer', { path: path })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.execute_background = function (command, cwd) {
        return invoke('execute_background', { command: command, cwd: cwd })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.open_external_terminal = function (command, cwd) {
        return invoke('open_external_terminal', { command: command, cwd: cwd })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    // --- File Picker ---
    api.list_directory = function (path) {
        console.log('[Monoloth][Bridge] list_directory called:', path);
        return invoke('list_directory', { path: path })
            .then(function (result) {
                console.log('[Monoloth][Bridge] list_directory returned', result ? result.length : 0, 'entries');
                return { success: true, entries: result };
            })
            .catch(function (err) {
                console.error('[Monoloth][Bridge] list_directory ERROR:', err);
                return { success: false, error: String(err) };
            });
    };

    api.get_drives = function () {
        return invoke('get_drives', {})
            .then(function (drives) { return drives; })
            .catch(function () { return []; });
    };

    api.get_path_info = function (path) {
        console.log('[Monoloth][Bridge] get_path_info called:', path);
        return invoke('get_path_info', { path: path })
            .then(function (info) {
                console.log('[Monoloth][Bridge] get_path_info result:', JSON.stringify(info));
                return info;
            })
            .catch(function (err) {
                console.error('[Monoloth][Bridge] get_path_info ERROR:', err);
                return { success: false, exists: false };
            });
    };

    // --- File Preview ---
    api.get_file_preview = function (path) {
        return invoke('get_file_preview', { path: path })
            .then(function (result) {
                if (typeof result === 'string') {
                    // Text preview
                    return { success: true, text: result };
                }
                if (result && result.Image) {
                    return { success: true, dataUrl: result.Image };
                }
                return { success: false, error: 'No preview' };
            })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.native_pick_directory = function () {
        console.log('[Monoloth][Bridge] native_pick_directory called');
        return invoke('pick_directory', {})
            .then(function (dir) {
                console.log('[Monoloth][Bridge] native_pick_directory result:', dir);
                if (dir) {
                    return { success: true, path: dir };
                }
                return { success: false, path: '' };
            })
            .catch(function (err) {
                console.error('[Monoloth][Bridge] native_pick_directory ERROR:', err);
                return { success: false, path: '', error: String(err) };
            });
    };

    api.native_pick_file = function (filter) {
        console.log('[Monoloth][Bridge] native_pick_file called with filter:', filter);
        return invoke('pick_file', { filter: filter || null })
            .then(function (file) {
                console.log('[Monoloth][Bridge] native_pick_file result:', file);
                if (file) {
                    return { success: true, path: file };
                }
                return { success: false, path: '' };
            })
            .catch(function (err) {
                console.error('[Monoloth][Bridge] native_pick_file ERROR:', err);
                return { success: false, path: '', error: String(err) };
            });
    };

    // --- Config getters/setters ---
    api.get_shortcuts = function () {
        return invoke('get_config', { key: 'shortcuts' })
            .then(function (val) { return { success: true, shortcuts: val || {} }; })
            .catch(function () { return { success: false, shortcuts: {} }; });
    };

    api.save_shortcuts = function (shortcuts) {
        return invoke('set_config', { key: 'shortcuts', value: shortcuts })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.get_last_directory = function () {
        return invoke('get_config', { key: 'last_directory' })
            .then(function (val) {
                if (val) {
                    return { success: true, path: val };
                }
                return { success: false, path: '' };
            })
            .catch(function () { return { success: false, path: '' }; });
    };

    api.save_last_directory = function (path) {
        return invoke('set_config', { key: 'last_directory', value: path })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.get_file_picker_type = function () {
        return invoke('get_config', { key: 'file_picker_type' })
            .then(function (val) { return val || 'custom'; })
            .catch(function () { return 'custom'; });
    };

    api.set_file_picker_type = function (type) {
        return invoke('set_config', { key: 'file_picker_type', value: type })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.get_picker_last_dir = function (id) {
        var key = id === 'bg' ? 'fp_last_dir_bg_image' : 'fp_last_dir_choose';
        console.log('[Monoloth][Bridge] get_picker_last_dir id:', id, '-> config key:', key);
        return invoke('get_config', { key: key })
            .then(function (val) { console.log('[Monoloth][Bridge] get_picker_last_dir result:', val); return { success: true, path: val || '' }; })
            .catch(function (err) { console.error('[Monoloth][Bridge] get_picker_last_dir error:', err); return { success: false, path: '' }; });
    };

    api.set_picker_last_dir = function (id, dir) {
        var key = id === 'bg' ? 'fp_last_dir_bg_image' : 'fp_last_dir_choose';
        console.log('[Monoloth][Bridge] set_picker_last_dir id:', id, '-> config key:', key, 'dir:', dir);
        return invoke('set_config', { key: key, value: dir })
            .then(function () { return { success: true }; })
            .catch(function (err) { console.error('[Monoloth][Bridge] set_picker_last_dir error:', err); return { success: false, error: String(err) }; });
    };

    api.get_startup_config = function () {
        return invoke('get_all_config', {})
            .then(function (all) {
                return {
                    command: all.startup_command || 'opencode',
                    type: all.startup_command_type || 'preset'
                };
            })
            .catch(function () { return { command: 'opencode', type: 'preset' }; });
    };

    api.set_startup_config = function (command, type) {
        return invoke('set_config', { key: 'startup_command', value: command })
            .then(function () {
                return invoke('set_config', { key: 'startup_command_type', value: type });
            })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.get_secondary_commands = function () {
        return invoke('get_config', { key: 'secondary_commands' })
            .then(function (val) { return { success: true, commands: val || [] }; })
            .catch(function (err) { return { success: false, commands: [], error: String(err) }; });
    };

    api.set_secondary_commands = function (cmds) {
        return invoke('set_config', { key: 'secondary_commands', value: cmds })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.get_background_config = function () {
        console.log('[Monoloth][Image] get_background_config called');
        return invoke('get_all_config', {})
            .then(function (all) {
                console.log('[Monoloth][Image] get_all_config result, bg_type:', all.bg_type, 'bg_image:', all.bg_image);
                var config = {
                    type: all.bg_type || 'none',
                    image: all.bg_image || '',
                    imageUrl: '',
                    dataUrl: '',
                    color: all.bg_color || '#0a0a0a',
                    gradient: all.bg_gradient || '',
                    transparency: all.bg_transparency != null ? all.bg_transparency : 75,
                    bgLayer: all.bg_layer || 'behind',
                    themeMode: all.theme_mode || 'dark',
                    ctaButtonStyle: all.cta_button_style || 'blur'
                };
                if (config.type === 'image' && config.image) {
                    console.log('[Monoloth][Image] Reading image as data URL for path:', config.image);
                    return invoke('read_image_as_data_url', { imagePath: config.image })
                        .then(function (dataUrl) {
                            console.log('[Monoloth][Image] read_image_as_data_url success, length:', dataUrl ? dataUrl.length : 0);
                            config.dataUrl = dataUrl;
                            config.imageUrl = dataUrl;
                            return config;
                        })
                        .catch(function (err) {
                            console.error('[Monoloth][Image] read_image_as_data_url failed:', err);
                            return config;
                        });
                }
                console.log('[Monoloth][Image] No image to load (type:', config.type, 'image:', config.image, ')');
                return config;
            })
            .catch(function (err) {
                console.error('[Monoloth][Image] get_all_config failed:', err);
                return {
                    type: 'none', image: '', imageUrl: '', dataUrl: '',
                    color: '#0a0a0a', gradient: '', transparency: 75,
                    bgLayer: 'behind', themeMode: 'dark', ctaButtonStyle: 'blur'
                };
            });
    };

    api.set_background_config = function (bg_type, image_path, color, gradient, transparency, theme_mode, cta_button_style, bg_layer) {
        console.log('[Monoloth][Image] set_background_config called with type:', bg_type, 'image:', image_path);
        var promises = [];
        if (bg_type !== undefined) promises.push(invoke('set_config', { key: 'bg_type', value: bg_type }));
        if (image_path !== undefined) {
            var imgPath = image_path || '';
            console.log('[Monoloth][Image] Saving bg_image config:', imgPath);
            promises.push(invoke('set_config', { key: 'bg_image', value: imgPath }));
            if (bg_type === 'image' && imgPath) {
                promises.push(
                    invoke('read_image_as_data_url', { imagePath: imgPath })
                        .then(function (dataUrl) {
                            console.log('[Monoloth][Image] Pre-loaded data URL, length:', dataUrl ? dataUrl.length : 0);
                            window._bgDataUrl = dataUrl;
                        })
                        .catch(function (err) { console.error('[Monoloth][Image] Pre-load data URL failed:', err); })
                );
            }
        }
        if (color !== undefined) promises.push(invoke('set_config', { key: 'bg_color', value: color }));
        if (gradient !== undefined) promises.push(invoke('set_config', { key: 'bg_gradient', value: gradient }));
        if (transparency !== undefined) promises.push(invoke('set_config', { key: 'bg_transparency', value: transparency }));
        if (theme_mode !== undefined) promises.push(invoke('set_config', { key: 'theme_mode', value: theme_mode }));
        if (cta_button_style !== undefined) promises.push(invoke('set_config', { key: 'cta_button_style', value: cta_button_style }));
        if (bg_layer !== undefined) promises.push(invoke('set_config', { key: 'bg_layer', value: bg_layer }));
        return Promise.all(promises)
            .then(function () { console.log('[Monoloth][Image] set_background_config all promises resolved'); return { success: true }; })
            .catch(function (err) { console.error('[Monoloth][Image] set_background_config error:', err); return { success: false, error: String(err) }; });
    };

    api.clear_background_image = function () {
        return invoke('set_config', { key: 'bg_image', value: '' })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.get_recent_directories = function () {
        return invoke('get_config', { key: 'recent_directories' })
            .then(function (val) { return Array.isArray(val) ? val : []; })
            .catch(function () { return []; });
    };

    api.set_recent_directories = function (dirs) {
        return invoke('set_config', { key: 'recent_directories', value: dirs })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.analyze_image_brightness = function (imagePath) {
        return invoke('analyze_image_brightness', { imagePath: imagePath })
            .then(function (val) { return { success: true, brightness: val }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.get_current_version = function () {
        return invoke('get_current_version', {})
            .then(function (version) { return version; })
            .catch(function () { return '0.1.0'; });
    };

    api.check_for_updates = function () {
        return invoke('check_for_updates', {})
            .then(function (result) {
                return {
                    success: true,
                    has_update: result.hasUpdate || false,
                    latest_version: result.latest || '0.1.0',
                    url: result.url || ''
                };
            })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    // --- Profiles ---
    api.get_profiles = function () {
        return invoke('get_profiles', {})
            .then(function (res) { return { success: true, profiles: res.profiles, active: res.active }; })
            .catch(function (err) { return { success: false, profiles: [], active: 'Default', error: String(err) }; });
    };

    api.create_profile = function (name) {
        return invoke('create_profile', { name: name })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.delete_profile = function (name) {
        return invoke('delete_profile', { name: name })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.switch_profile = function (name) {
        return invoke('switch_profile', { name: name })
            .then(function () { return { success: true, active: name }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.rename_profile = function (oldName, newName) {
        return invoke('rename_profile', { old: oldName, new: newName })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.get_profile_config = function () {
        return invoke('get_profile_config', {})
            .then(function (config) { return { success: true, config: config }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.set_profile_setting = function (key, value) {
        return invoke('set_profile_setting', { key: key, value: value })
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    // --- Generic Config Getter ---
    api.get_config = function(key) {
        return invoke('get_config', { key: key })
            .catch(function(err) { return null; });
    };

    api.set_config = function(key, value) {
        return invoke('set_config', { key: key, value: value })
            .catch(function(err) { return null; });
    };

    // --- Window Control Commands ---
    api.toggle_custom_titlebar = function(enable) {
        return invoke('toggle_custom_titlebar', { enable: enable })
            .then(function() { return { success: true }; })
            .catch(function(err) { return { success: false, error: String(err) }; });
    };
    api.minimize_window = function() {
        return invoke('minimize_window', {})
            .then(function() { return { success: true }; })
            .catch(function(err) { return { success: false, error: String(err) }; });
    };
    api.toggle_maximize_window = function() {
        return invoke('toggle_maximize_window', {})
            .then(function(m) { return { success: true, maximized: m }; })
            .catch(function(err) { return { success: false, maximized: false, error: String(err) }; });
    };
    api.close_window = function() {
        return invoke('close_window', {})
            .then(function() { return { success: true }; })
            .catch(function(err) { return { success: false, error: String(err) }; });
    };
    api.is_window_maximized = function() {
        return invoke('is_window_maximized', {})
            .then(function(m) { return { success: true, maximized: m }; })
            .catch(function(err) { return { success: false, maximized: false, error: String(err) }; });
    };

    // --- History ---
    api.get_history_data = function() {
        return invoke('get_history_data', {})
            .then(function(data) {
                return { success: true, data: data };
            })
            .catch(function(err) { return { success: false, error: String(err) }; });
    };

    api.set_history_enabled = function(enabled) {
        return invoke('set_history_enabled', { enabled: enabled })
            .then(function() { return { success: true }; })
            .catch(function(err) { return { success: false, error: String(err) }; });
    };

    api.set_history_retention = function(retention) {
        return invoke('set_history_retention', { retention: retention })
            .then(function() { return { success: true }; })
            .catch(function(err) { return { success: false, error: String(err) }; });
    };

    api.clear_history = function() {
        return invoke('clear_history', {})
            .then(function() { return { success: true }; })
            .catch(function(err) { return { success: false, error: String(err) }; });
    };

    window.monolithApi = api;
    console.log('[MonolothBridge] window.monolithApi set, methods:', Object.keys(api).length);
})();
