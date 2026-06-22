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

fn is_valid_window_position(x: i32, y: i32) -> bool {
    (x as i64) > WINDOW_MINIMIZED_SENTINEL
        && (y as i64) > WINDOW_MINIMIZED_SENTINEL
        && (x as i64) >= MIN_WINDOW_POSITION
        && (y as i64) >= MIN_WINDOW_POSITION
        && (x as i64) <= MAX_WINDOW_POSITION
        && (y as i64) <= MAX_WINDOW_POSITION
}

fn setup_window(app: &mut tauri::App, cfg: &AppConfig) -> Result<tauri::WebviewWindow, String> {
    let width = cfg.get("window_width").as_i64().unwrap_or(1200) as u32;
    let height = cfg.get("window_height").as_i64().unwrap_or(700) as u32;
    let maximized = cfg.get("window_maximized").as_bool().unwrap_or(false);
    let use_custom_titlebar = cfg.get("use_custom_titlebar").as_bool().unwrap_or(true);
    let is_wayland = std::env::var("WAYLAND_DISPLAY").is_ok();

    let window = app.get_webview_window("main").unwrap();

    // Wayland clients cannot set/query absolute window position
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

    Ok(window)
}

struct WindowStateHandler {
    cfg: AppConfig,
    pty: PtyManager,
    history: HistoryManager,
    window: tauri::WebviewWindow,
    is_wayland: bool,
    last_size_save: parking_lot::Mutex<std::time::Instant>,
    last_pos_save: parking_lot::Mutex<std::time::Instant>,
}

impl WindowStateHandler {
    fn handle(&self, event: &tauri::WindowEvent) {
        match event {
            tauri::WindowEvent::Resized(size) => self.on_resized(*size),
            tauri::WindowEvent::Moved(pos) => self.on_moved(*pos),
            tauri::WindowEvent::CloseRequested { .. } => self.on_close_requested(),
            _ => {}
        }
    }

    fn on_resized(&self, size: tauri::PhysicalSize<u32>) {
        if size.width >= MIN_WINDOW_WIDTH as u32 && size.height >= MIN_WINDOW_HEIGHT as u32
            && (size.width as i64) <= MAX_WINDOW_DIMENSION
            && (size.height as i64) <= MAX_WINDOW_DIMENSION
        {
            let is_minimized = self.window.is_minimized().unwrap_or(false);
            if is_minimized {
                return;
            }
            let is_max = self.window.is_maximized().unwrap_or(false);
            let was_max = self.cfg.get("window_maximized").as_bool().unwrap_or(false);
            if is_max != was_max {
                self.cfg.set_window_maximized(is_max);
            }
            if !is_max {
                let mut last = self.last_size_save.lock();
                let now = std::time::Instant::now();
                if now.duration_since(*last) > std::time::Duration::from_millis(500) {
                    *last = now;
                    drop(last);
                    self.cfg.set_window_size(size.width, size.height);
                    if !self.is_wayland {
                        if let Ok(pos) = self.window.outer_position() {
                            if is_valid_window_position(pos.x, pos.y) {
                                self.cfg.set_window_position(pos.x, pos.y);
                            }
                        }
                    }
                }
            }
        }
    }

    fn on_moved(&self, pos: tauri::PhysicalPosition<i32>) {
        if self.window.is_minimized().unwrap_or(false) {
            return;
        }
        if self.is_wayland {
            return;
        }
        if !is_valid_window_position(pos.x, pos.y) {
            return;
        }
        if !self.window.is_maximized().unwrap_or(false) {
            let mut last = self.last_pos_save.lock();
            let now = std::time::Instant::now();
            if now.duration_since(*last) > std::time::Duration::from_millis(500) {
                *last = now;
                drop(last);
                self.cfg.set_window_position(pos.x, pos.y);
            }
        }
    }

    fn on_close_requested(&self) {
        let is_max = self.window.is_maximized().unwrap_or(false);
        if !is_max {
            let is_minimized = self.window.is_minimized().unwrap_or(false);
            if !is_minimized {
                if !self.is_wayland {
                    if let Ok(pos) = self.window.outer_position() {
                        if is_valid_window_position(pos.x, pos.y) {
                            self.cfg.set_window_position(pos.x, pos.y);
                        }
                    }
                }
                if let Ok(size) = self.window.inner_size() {
                    if size.width >= MIN_WINDOW_WIDTH as u32
                        && size.height >= MIN_WINDOW_HEIGHT as u32
                        && (size.width as i64) <= MAX_WINDOW_DIMENSION
                        && (size.height as i64) <= MAX_WINDOW_DIMENSION
                    {
                        self.cfg.set_window_size(size.width, size.height);
                    }
                }
            }
        }
        self.cfg.set_window_maximized(is_max);

        self.history.session_end();
        self.history.session_end_all_main_tabs();
        self.history.session_end_by_id("panel");
        self.history.session_end_all_panel_tabs();
        self.pty.terminate_all();
    }
}

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

            let cfg = app.state::<AppConfig>().inner().clone();
            let is_wayland = std::env::var("WAYLAND_DISPLAY").is_ok();
            let window = setup_window(app, &cfg)?;

            let handler = WindowStateHandler {
                cfg,
                pty: app.state::<PtyManager>().inner().clone(),
                history: app.state::<HistoryManager>().inner().clone(),
                window: window.clone(),
                is_wayland,
                last_size_save: parking_lot::Mutex::new(std::time::Instant::now()),
                last_pos_save: parking_lot::Mutex::new(std::time::Instant::now()),
            };

            window.on_window_event(move |event| handler.handle(event));

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
