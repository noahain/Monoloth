mod commands;
mod config;
mod history;
mod pty;

use config::AppConfig;
use history::HistoryManager;
use pty::PtyManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_config = AppConfig::new();
    let history_manager = HistoryManager::new();
    let pty_manager = PtyManager::new();
    let pty_for_close = pty_manager.clone();
    let history_for_close = history_manager.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let pty = app.state::<PtyManager>();
            pty.set_app_handle(app.handle().clone());

            // Restore window size and position from config
            let cfg: AppConfig = app.state::<AppConfig>().inner().clone();
            let width = cfg.get("window_width").as_i64().unwrap_or(1200) as u32;
            let height = cfg.get("window_height").as_i64().unwrap_or(700) as u32;
            let maximized = cfg.get("window_maximized").as_bool().unwrap_or(false);
            let use_custom_titlebar = cfg.get("use_custom_titlebar").as_bool().unwrap_or(true);

            let window = app.get_webview_window("main").unwrap();

            // Restore position if saved
            if let (Some(x), Some(y)) = (
                cfg.get("window_x").as_i64(),
                cfg.get("window_y").as_i64(),
            ) {
                window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: x as i32,
                    y: y as i32,
                })).ok();
            }

            window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height })).ok();
            window.set_decorations(!use_custom_titlebar).ok();
            if maximized {
                window.maximize().ok();
            }
            window.show().ok();

            // Save window state on resize / move / close
            let cfg_for_events = cfg.clone();
            let pty_clone = pty_for_close;
            let last_size_save = std::sync::Arc::new(parking_lot::Mutex::new(std::time::Instant::now()));
            let last_pos_save = std::sync::Arc::new(parking_lot::Mutex::new(std::time::Instant::now()));
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::Resized(size) => {
                        if size.width > 0 && size.height > 0 {
                            let is_max = window_clone.is_maximized().unwrap_or(false);
                            let was_max = cfg_for_events.get("window_maximized").as_bool().unwrap_or(false);
                            if is_max != was_max {
                                cfg_for_events.set("window_maximized", serde_json::Value::Bool(is_max));
                            }
                            if !is_max {
                                let mut last = last_size_save.lock();
                                let now = std::time::Instant::now();
                                if now.duration_since(*last) > std::time::Duration::from_millis(500) {
                                    *last = now;
                                    drop(last);
                                    cfg_for_events.set("window_width", serde_json::Value::Number(size.width.into()));
                                    cfg_for_events.set("window_height", serde_json::Value::Number(size.height.into()));
                                    if let Ok(pos) = window_clone.outer_position() {
                                        cfg_for_events.set("window_x", serde_json::Value::Number(pos.x.into()));
                                        cfg_for_events.set("window_y", serde_json::Value::Number(pos.y.into()));
                                    }
                                }
                            }
                        }
                    }
                    tauri::WindowEvent::Moved(pos) => {
                        if !window_clone.is_maximized().unwrap_or(false) {
                            let mut last = last_pos_save.lock();
                            let now = std::time::Instant::now();
                            if now.duration_since(*last) > std::time::Duration::from_millis(500) {
                                *last = now;
                                drop(last);
                                cfg_for_events.set("window_x", serde_json::Value::Number(pos.x.into()));
                                cfg_for_events.set("window_y", serde_json::Value::Number(pos.y.into()));
                            }
                        }
                    }
                    tauri::WindowEvent::CloseRequested { .. } => {
                        // Save final window state before closing, in case the
                        // last resize/move was within the 500ms throttle window.
                        if let Ok(pos) = window_clone.outer_position() {
                            cfg_for_events.set("window_x", serde_json::Value::Number(pos.x.into()));
                            cfg_for_events.set("window_y", serde_json::Value::Number(pos.y.into()));
                        }
                        if let Ok(size) = window_clone.outer_size() {
                            cfg_for_events.set("window_width", serde_json::Value::Number(size.width.into()));
                            cfg_for_events.set("window_height", serde_json::Value::Number(size.height.into()));
                        }
                        cfg_for_events.set("window_maximized", serde_json::Value::Bool(window_clone.is_maximized().unwrap_or(false)));

                        history_for_close.session_end();
                        pty_clone.terminate_all();
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .manage(app_config)
        .manage(history_manager)
        .manage(pty_manager)
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::set_config,
            commands::get_all_config,
            commands::pick_directory,
            commands::pick_file,
            commands::list_directory,
            commands::get_drives,
            commands::get_path_info,
            commands::get_file_preview,
            commands::start_terminal,
            commands::run_parallel_command,
            commands::send_input,
            commands::resize_terminal,
            commands::terminate_terminal,
            commands::get_current_version,
            commands::check_for_updates,
            commands::analyze_image_brightness,
            commands::read_image_as_data_url,
            commands::get_profiles,
            commands::create_profile,
            commands::delete_profile,
            commands::switch_profile,
            commands::rename_profile,
            commands::get_profile_config,
            commands::set_profile_setting,
            commands::set_background_config,
            commands::toggle_custom_titlebar,
            commands::minimize_window,
            commands::toggle_maximize_window,
            commands::close_window,
            commands::is_window_maximized,
            commands::get_history_data,
            commands::set_history_enabled,
            commands::set_history_retention,
            commands::clear_history,
            commands::open_in_explorer,
            commands::execute_background,
            commands::open_external_terminal,
            commands::end_history_session,
            commands::record_history_activity,
            commands::terminate_tab_sessions,
            commands::get_profile_config_by_name,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
