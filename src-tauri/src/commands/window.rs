use crate::config::AppConfig;
use tauri::Manager;
use tauri::State;

#[tauri::command]
pub fn toggle_custom_titlebar(app: tauri::AppHandle, config: State<AppConfig>, enable: bool) {
    let window = app.get_webview_window("main").unwrap();
    if enable {
        if let Ok(pos) = window.outer_position() {
            config.set_window_position(pos.x, pos.y);
        }
    }
    window.set_decorations(!enable).ok();
    config.set("use_custom_titlebar", serde_json::Value::Bool(enable));
}

#[tauri::command]
pub fn minimize_window(app: tauri::AppHandle) {
    app.get_webview_window("main").unwrap().minimize().ok();
}

#[tauri::command]
pub fn toggle_maximize_window(app: tauri::AppHandle, config: State<AppConfig>) -> Result<bool, String> {
    let window = app.get_webview_window("main").unwrap();
    let maximized = window.is_maximized().unwrap_or(false);
    if maximized {
        window.unmaximize().map_err(|e| e.to_string())?;
        if let (Some(x), Some(y)) = (
            config.get("window_x").as_i64(),
            config.get("window_y").as_i64()
        ) {
            window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition { x: x as i32, y: y as i32 }
            )).ok();
        }
        config.set_window_maximized(false);
    } else {
        if let Ok(pos) = window.outer_position() {
            config.set_window_position(pos.x, pos.y);
        }
        window.maximize().map_err(|e| e.to_string())?;
        config.set_window_maximized(true);
    }
    Ok(!maximized)
}

#[tauri::command]
pub fn close_window(app: tauri::AppHandle) {
    app.get_webview_window("main").unwrap().close().ok();
}

#[tauri::command]
pub fn is_window_maximized(app: tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}
