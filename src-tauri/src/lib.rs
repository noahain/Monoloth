mod commands;
mod config;
mod history;
mod pty;

use tauri::ipc::Channel;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::{oneshot, Mutex};

use config::{AppConfig, MAX_WINDOW_DIMENSION, MAX_WINDOW_POSITION, MIN_WINDOW_HEIGHT, MIN_WINDOW_POSITION, MIN_WINDOW_WIDTH, WINDOW_MINIMIZED_SENTINEL};
use history::HistoryManager;
use pty::PtyManager;

#[derive(Default)]
pub struct CancelDownloadState {
    sender: Mutex<Option<oneshot::Sender<()>>>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum DownloadEvent {
    Started { content_length: Option<u64> },
    Progress { chunk_length: usize },
    Finished,
}

#[tauri::command]
async fn start_update_download(
    app: tauri::AppHandle,
    on_event: Channel<DownloadEvent>,
    state: tauri::State<'_, CancelDownloadState>,
) -> Result<(), String> {
    let updater = app.updater().map_err(|e| format!("{}", e))?;
    let update = updater.check().await.map_err(|e| format!("{}", e))?;

    let Some(update) = update else {
        return Err("No update available".to_string());
    };

    let (tx, rx) = oneshot::channel();
    *state.sender.lock().await = Some(tx);

    let on_event_for_finished = on_event.clone();
    let mut started = false;
    let on_progress = move |downloaded: usize, total: Option<u64>| {
        if !started {
            let _ = on_event.send(DownloadEvent::Started { content_length: total });
            started = true;
        }
        let _ = on_event.send(DownloadEvent::Progress { chunk_length: downloaded });
    };
    let on_finished = move || {
        let _ = on_event_for_finished.send(DownloadEvent::Finished);
    };

    let result: Result<(), tauri_plugin_updater::Error> = tokio::select! {
        res = update.download_and_install(on_progress, on_finished) => res,
        _ = rx => {
            return Err("Download cancelled".to_string());
        }
    };

    *state.sender.lock().await = None;
    result.map_err(|e: tauri_plugin_updater::Error| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn cancel_update_download(
    state: tauri::State<'_, CancelDownloadState>,
) -> Result<(), String> {
    if let Some(tx) = state.sender.lock().await.take() {
        let _ = tx.send(());
    }
    Ok(())
}

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            let pty = app.state::<PtyManager>();
            pty.set_app_handle(app.handle().clone());

            // Restore window size and position from config
            let cfg: AppConfig = app.state::<AppConfig>().inner().clone();
            let width = cfg.get("window_width").as_i64().unwrap_or(1200) as u32;
            let height = cfg.get("window_height").as_i64().unwrap_or(700) as u32;
            let maximized = cfg.get("window_maximized").as_bool().unwrap_or(false);
            let use_custom_titlebar = cfg.get("use_custom_titlebar").as_bool().unwrap_or(true);

            let window = app.get_webview_window("main").unwrap();

            // Wayland clients cannot set/query absolute window position
            let is_wayland = std::env::var("WAYLAND_DISPLAY").is_ok();

            // Restore position if saved (skip on Wayland — compositor owns placement)
            if !is_wayland {
                if let (Some(x), Some(y)) = (
                    cfg.get("window_x").as_i64(),
                    cfg.get("window_y").as_i64(),
                ) {
                    window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                        x: x as i32,
                        y: y as i32,
                    })).ok();
                }
            }

            window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height })).ok();
            if maximized {
                window.maximize().ok();
            }
            window.show().ok();

            // decorations: false is set statically in tauri.conf.json to avoid Linux bug
            // #11856 where set_decorations(false) before show() breaks drag regions.
            // Only flip to native decorations if user disabled custom titlebar.
            if !use_custom_titlebar {
                window.set_decorations(true).ok();
            }

            // Save window state on resize / move / close
            let cfg_for_events = cfg.clone();
            let pty_clone = pty_for_close;
            let last_size_save = std::sync::Arc::new(parking_lot::Mutex::new(std::time::Instant::now()));
            let last_pos_save = std::sync::Arc::new(parking_lot::Mutex::new(std::time::Instant::now()));
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::Resized(size) => {
                        if size.width >= MIN_WINDOW_WIDTH as u32 && size.height >= MIN_WINDOW_HEIGHT as u32
                            && (size.width as i64) <= MAX_WINDOW_DIMENSION
                            && (size.height as i64) <= MAX_WINDOW_DIMENSION
                        {
                            let is_minimized = window_clone.is_minimized().unwrap_or(false);
                            if is_minimized {
                                return;
                            }
                            let is_max = window_clone.is_maximized().unwrap_or(false);
                            let was_max = cfg_for_events.get("window_maximized").as_bool().unwrap_or(false);
                            if is_max != was_max {
                                cfg_for_events.set_window_maximized(is_max);
                            }
                            if !is_max {
                                let mut last = last_size_save.lock();
                                let now = std::time::Instant::now();
                                if now.duration_since(*last) > std::time::Duration::from_millis(500) {
                                    *last = now;
                                    drop(last);
                                    cfg_for_events.set_window_size(size.width, size.height);
                                    if !is_wayland {
                                        if let Ok(pos) = window_clone.outer_position() {
                                            if (pos.x as i64) > WINDOW_MINIMIZED_SENTINEL
                                                && (pos.y as i64) > WINDOW_MINIMIZED_SENTINEL
                                                && (pos.x as i64) >= MIN_WINDOW_POSITION
                                                && (pos.y as i64) >= MIN_WINDOW_POSITION
                                                && (pos.x as i64) <= MAX_WINDOW_POSITION
                                                && (pos.y as i64) <= MAX_WINDOW_POSITION
                                            {
                                                cfg_for_events.set_window_position(pos.x, pos.y);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    tauri::WindowEvent::Moved(pos) => {
                        if window_clone.is_minimized().unwrap_or(false) {
                            return;
                        }
                        if is_wayland {
                            return;
                        }
                        if pos.x <= WINDOW_MINIMIZED_SENTINEL as i32 || pos.y <= WINDOW_MINIMIZED_SENTINEL as i32 {
                            return;
                        }
                        if (pos.x as i64) < MIN_WINDOW_POSITION
                            || (pos.y as i64) < MIN_WINDOW_POSITION
                            || (pos.x as i64) > MAX_WINDOW_POSITION
                            || (pos.y as i64) > MAX_WINDOW_POSITION
                        {
                            return;
                        }
                        if !window_clone.is_maximized().unwrap_or(false) {
                            let mut last = last_pos_save.lock();
                            let now = std::time::Instant::now();
                            if now.duration_since(*last) > std::time::Duration::from_millis(500) {
                                *last = now;
                                drop(last);
                                cfg_for_events.set_window_position(pos.x, pos.y);
                            }
                        }
                    }
                    tauri::WindowEvent::CloseRequested { .. } => {
                        let is_max = window_clone.is_maximized().unwrap_or(false);
                        if !is_max {
                            let is_minimized = window_clone.is_minimized().unwrap_or(false);
                            if !is_minimized {
                                if !is_wayland {
                                    if let Ok(pos) = window_clone.outer_position() {
                                        if (pos.x as i64) > WINDOW_MINIMIZED_SENTINEL
                                            && (pos.y as i64) > WINDOW_MINIMIZED_SENTINEL
                                            && (pos.x as i64) >= MIN_WINDOW_POSITION
                                            && (pos.y as i64) >= MIN_WINDOW_POSITION
                                            && (pos.x as i64) <= MAX_WINDOW_POSITION
                                            && (pos.y as i64) <= MAX_WINDOW_POSITION
                                        {
                                            cfg_for_events.set_window_position(pos.x, pos.y);
                                        }
                                    }
                                }
                                if let Ok(size) = window_clone.inner_size() {
                                    if size.width >= MIN_WINDOW_WIDTH as u32
                                        && size.height >= MIN_WINDOW_HEIGHT as u32
                                        && (size.width as i64) <= MAX_WINDOW_DIMENSION
                                        && (size.height as i64) <= MAX_WINDOW_DIMENSION
                                    {
                                        cfg_for_events.set_window_size(size.width, size.height);
                                    }
                                }
                            }
                        }
                        cfg_for_events.set_window_maximized(is_max);

                        history_for_close.session_end();
                        history_for_close.session_end_all_main_tabs();
                        history_for_close.session_end_by_id("panel");
                        history_for_close.session_end_all_panel_tabs();
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
        .manage(CancelDownloadState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::set_config,
            commands::get_all_config,
            commands::get_all_config_for_profile,
            commands::set_many_config,
            commands::pick_directory,
            commands::pick_file,
            commands::list_directory,
            commands::get_drives,
            commands::get_path_info,
            commands::get_file_preview,
            commands::start_terminal,
            commands::send_input,
            commands::resize_terminal,
            commands::terminate_terminal,
            commands::retire_panel_tab,
            commands::retire_panel_tabs_for_main_tab,
            commands::terminate_hidden,
            commands::get_current_version,
            commands::get_windows_pty_info,
            commands::analyze_image_brightness,
            commands::read_image_as_data_url,
            commands::get_profiles,
            commands::create_profile,
            commands::delete_profile,
            commands::switch_profile,
            commands::rename_profile,
            commands::get_profile_config,
            commands::set_profile_setting,
            commands::get_profile_appearance,
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
            start_update_download,
            cancel_update_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
