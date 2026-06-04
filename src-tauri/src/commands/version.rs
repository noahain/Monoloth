#[tauri::command]
pub fn get_current_version() -> String {
    env!("CARGO_PKG_VERSION").into()
}
