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
            return Promise.resolve(tauriInvoke(cmd, args || {}));
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

    // callApi: invoke a command and wrap the result in { success: true, ...transform(result) }
    // or { success: false, error: String(err) } on rejection.
    // The optional `transform` receives the raw result and returns an object of extra fields.
    function callApi(cmd, args, transform) {
        return invoke(cmd, args || {}).then(function (result) {
            var response = { success: true };
            if (transform) {
                var extra = transform(result);
                if (extra && typeof extra === 'object') Object.assign(response, extra);
            }
            return response;
        }).catch(function (err) {
            return { success: false, error: String(err) };
        });
    }

    // callApiValue: invoke a command and return the raw result, with a fallback on error.
    function callApiValue(cmd, args, fallback) {
        return invoke(cmd, args || {}).catch(function () { return fallback; });
    }

    // --- Terminal ---
    api.start_terminal = function (sessionId, dir, recordHistory, shell, cols, rows) {
        cols = cols || 80;
        rows = rows || 24;
        return callApi('start_terminal', {
            sessionId: sessionId,
            directory: dir,
            recordHistory: recordHistory,
            shell: shell,
            cols: cols,
            rows: rows
        }, function (gen) { return { generation: gen }; });
    };

    api.start_opencode = function (dir) {
        return api.start_terminal('main', dir, true, null, null, null);
    };

    api.send_input = function (sessionId, data) {
        return callApi('send_input', { sessionId: sessionId, data: data });
    };

    api.resize_terminal = function (sessionId, cols, rows) {
        return callApi('resize_terminal', { sessionId: sessionId, cols: cols, rows: rows });
    };

    api.terminate_terminal = function (sessionId) {
        return callApi('terminate_terminal', { sessionId: sessionId || 'main' });
    };

    api.terminate = function () {
        return api.terminate_terminal('main');
    };

    // --- System commands ---
    api.open_in_explorer = function (path) {
        return callApi('open_in_explorer', { path: path });
    };

    api.execute_background = function (command, cwd) {
        return callApi('execute_background', { command: command, cwd: cwd });
    };

    api.open_external_terminal = function (command, cwd) {
        return callApi('open_external_terminal', { command: command, cwd: cwd });
    };

    // --- File Picker ---
    api.list_directory = function (path) {
        return callApi('list_directory', { path: path }, function (entries) { return { entries: entries }; });
    };

    api.get_drives = function () {
        return callApiValue('get_drives', {}, []);
    };

    api.get_path_info = function (path) {
        return callApiValue('get_path_info', { path: path }, { success: false, exists: false });
    };

    // --- File Preview ---
    api.get_file_preview = function (path) {
        return invoke('get_file_preview', { path: path }).then(function (result) {
            if (result && result.Text) {
                return { success: true, text: result.Text };
            }
            if (result && result.Image) {
                return { success: true, dataUrl: result.Image };
            }
            return { success: false, error: 'No preview' };
        }).catch(function (err) {
            return { success: false, error: String(err) };
        });
    };

    api.native_pick_directory = function () {
        return invoke('pick_directory', {}).then(function (dir) {
            if (dir) return { success: true, path: dir };
            return { success: false, path: '' };
        }).catch(function (err) {
            return { success: false, path: '', error: String(err) };
        });
    };

    api.native_pick_file = function (filter) {
        return invoke('pick_file', { filter: filter || null }).then(function (file) {
            if (file) return { success: true, path: file };
            return { success: false, path: '' };
        }).catch(function (err) {
            return { success: false, path: '', error: String(err) };
        });
    };

    // --- Config getters/setters ---
    api.get_shortcuts = function () {
        return callApi('get_config', { key: 'shortcuts' }, function (val) { return { shortcuts: val || {} }; });
    };

    api.save_shortcuts = function (shortcuts) {
        return callApi('set_config', { key: 'shortcuts', value: shortcuts });
    };

    api.get_last_directory = function () {
        return callApi('get_config', { key: 'last_directory' }, function (val) {
            return val ? { path: val } : { path: '' };
        });
    };

    api.save_last_directory = function (path) {
        return callApi('set_config', { key: 'last_directory', value: path });
    };

    api.get_file_picker_type = function () {
        return callApiValue('get_config', { key: 'file_picker_type' }, 'custom');
    };

    api.set_file_picker_type = function (type) {
        return callApi('set_config', { key: 'file_picker_type', value: type });
    };

    var PICKER_DIR_KEYS = { bg: 'fp_last_dir_bg_image', choose: 'fp_last_dir_choose' };
    function pickerDirKey(id) { return PICKER_DIR_KEYS[id] || 'fp_last_dir_choose'; }

    api.get_picker_last_dir = function (id) {
        return callApi('get_config', { key: pickerDirKey(id) }, function (val) { return { path: val || '' }; });
    };

    api.set_picker_last_dir = function (id, dir) {
        return callApi('set_config', { key: pickerDirKey(id), value: dir });
    };

    api.get_startup_config = function () {
        return invoke('get_all_config', {}).then(function (all) {
            return {
                command: all.startup_command || 'opencode',
                type: all.startup_command_type || 'preset'
            };
        }).catch(function () {
            return { command: 'opencode', type: 'preset' };
        });
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
        return callApi('get_config', { key: 'secondary_commands' }, function (val) { return { commands: val || [] }; });
    };

    api.set_secondary_commands = function (cmds) {
        return callApi('set_config', { key: 'secondary_commands', value: cmds });
    };

    api.get_background_config = function () {
        return invoke('get_all_config', {}).then(function (all) {
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
                return invoke('read_image_as_data_url', { imagePath: config.image })
                    .then(function (dataUrl) {
                        config.dataUrl = dataUrl;
                        config.imageUrl = dataUrl;
                        return config;
                    })
                    .catch(function () { return config; });
            }
            return config;
        }).catch(function () {
            return {
                type: 'none', image: '', imageUrl: '', dataUrl: '',
                color: '#0a0a0a', gradient: '', transparency: 75,
                bgLayer: 'behind', themeMode: 'dark', ctaButtonStyle: 'blur'
            };
        });
    };

    api.set_background_config = function (bg_type, image_path, color, gradient, transparency, theme_mode, cta_button_style, bg_layer) {
        var promises = [];
        if (bg_type !== undefined) promises.push(invoke('set_config', { key: 'bg_type', value: bg_type }));
        if (image_path !== undefined) {
            var imgPath = image_path || '';
            promises.push(invoke('set_config', { key: 'bg_image', value: imgPath }));
            if (bg_type === 'image' && imgPath) {
                promises.push(
                    invoke('read_image_as_data_url', { imagePath: imgPath })
                        .then(function (dataUrl) { window._bgDataUrl = dataUrl; })
                        .catch(function () {})
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
            .then(function () { return { success: true }; })
            .catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.clear_background_image = function () {
        return callApi('set_config', { key: 'bg_image', value: '' });
    };

    api.get_recent_directories = function () {
        return callApiValue('get_config', { key: 'recent_directories' }, [])
            .then(function (val) { return Array.isArray(val) ? val : []; });
    };

    api.set_recent_directories = function (dirs) {
        return callApi('set_config', { key: 'recent_directories', value: dirs });
    };

    api.analyze_image_brightness = function (imagePath) {
        return callApi('analyze_image_brightness', { imagePath: imagePath }, function (val) {
            return { brightness: val };
        });
    };

    api.get_current_version = function () {
        return callApiValue('get_current_version', {}, '2.0.0');
    };

    // --- Profiles ---
    api.get_profiles = function () {
        return invoke('get_profiles', {}).then(function (res) {
            return { success: true, profiles: res.profiles, active: res.active };
        }).catch(function (err) {
            return { success: false, profiles: [], active: 'Default', error: String(err) };
        });
    };

    api.create_profile = function (name) {
        return callApi('create_profile', { name: name });
    };

    api.delete_profile = function (name) {
        return callApi('delete_profile', { name: name });
    };

    api.switch_profile = function (name) {
        return callApi('switch_profile', { name: name }, function () { return { active: name }; });
    };

    api.rename_profile = function (oldName, newName) {
        return callApi('rename_profile', { old: oldName, new: newName });
    };

    api.get_profile_config = function () {
        return callApi('get_profile_config', {}, function (config) { return { config: config }; });
    };

    api.set_profile_setting = function (key, value) {
        return callApi('set_profile_setting', { key: key, value: value });
    };

    // --- PTY Output Events ---
    function setupPtyListener() {
        listen('pty-output', function (event) {
            var payload = event.payload;
            var sessionId = payload.sessionId || 'main';
            var generation = payload.generation || 0;
            if (payload.eof) {
                if (window.writeToTerm) window.writeToTerm('\r\n\x1b[90m[Process exited]\x1b[0m\r\n', true, sessionId, generation);
                return;
            }
            if (window.writeToTerm) {
                window.writeToTerm(payload.data, false, sessionId, generation);
            }
        }).catch(function (e) {
            console.error('Failed to set up PTY listener:', e);
        });
    }

    // --- Generic Config Getter ---
    api.get_config = function (key) {
        return callApiValue('get_config', { key: key }, null);
    };

    api.set_config = function (key, value) {
        return callApiValue('set_config', { key: key, value: value }, null);
    };

    // --- Window Control Commands ---
    function windowCommand(cmd, transform) {
        return invoke(cmd, {}).then(function (result) {
            var response = { success: true };
            if (transform) Object.assign(response, transform(result));
            return response;
        }).catch(function (err) {
            var response = { success: false, error: String(err) };
            if (transform) Object.assign(response, transform(null));
            return response;
        });
    }

    api.toggle_custom_titlebar = function (enable) {
        return callApi('toggle_custom_titlebar', { enable: enable });
    };
    api.minimize_window = function () { return callApi('minimize_window', {}); };
    api.toggle_maximize_window = function () {
        return windowCommand('toggle_maximize_window', function (m) { return { maximized: !!m }; });
    };
    api.close_window = function () { return callApi('close_window', {}); };
    api.is_window_maximized = function () {
        return windowCommand('is_window_maximized', function (m) { return { maximized: !!m }; });
    };

    // --- History ---
    api.get_history_data = function () {
        return invoke('get_history_data', {}).then(function (data) {
            return { success: true, data: data };
        }).catch(function (err) { return { success: false, error: String(err) }; });
    };

    api.set_history_enabled = function (enabled) {
        return callApi('set_history_enabled', { enabled: enabled });
    };

    api.set_history_retention = function (retention) {
        return callApi('set_history_retention', { retention: retention });
    };

    api.clear_history = function () {
        return callApi('clear_history', {});
    };

    window.monolithApi = api;
    console.log('[MonolothBridge] window.monolithApi set, methods:', Object.keys(api).length);

    if (window.__TAURI__) {
        setupPtyListener();
    } else {
        var checkTauri = setInterval(function () {
            if (window.__TAURI__) {
                clearInterval(checkTauri);
                setupPtyListener();
            }
        }, 50);
        setTimeout(function () { clearInterval(checkTauri); }, 10000);
    }
})();
