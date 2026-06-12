use crate::config::AppConfig;
use tauri::Manager;
use tauri::State;

#[tauri::command]
pub fn toggle_custom_titlebar(app: tauri::AppHandle, config: State<AppConfig>, enable: bool) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    if enable {
        if let Ok(pos) = window.outer_position() {
            let x = pos.x as i64;
            let y = pos.y as i64;
            if x > crate::config::WINDOW_MINIMIZED_SENTINEL && y > crate::config::WINDOW_MINIMIZED_SENTINEL {
                config.set_window_position(pos.x, pos.y);
            }
        }
    }
    window.set_decorations(!enable).ok();
    config.set("use_custom_titlebar", serde_json::Value::Bool(enable));
    Ok(())
}

#[tauri::command]
pub fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    window.minimize().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_maximize_window(app: tauri::AppHandle, config: State<AppConfig>) -> Result<bool, String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
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
        if let (Some(w), Some(h)) = (
            config.get("window_width").as_i64(),
            config.get("window_height").as_i64()
        ) {
            window.set_size(tauri::Size::Physical(
                tauri::PhysicalSize { width: w as u32, height: h as u32 }
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
pub fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    window.close().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn is_window_maximized(app: tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}
