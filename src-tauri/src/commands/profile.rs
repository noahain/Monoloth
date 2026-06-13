use crate::config::AppConfig;
use serde_json::{Map, Value};
use tauri::State;

#[tauri::command]
pub fn get_profiles(config: State<AppConfig>) -> Value {
    let profiles = config.list_profiles();
    let active = config.get_active_profile();
    serde_json::json!({
        "profiles": profiles,
        "active": active
    })
}

#[tauri::command]
pub fn create_profile(config: State<AppConfig>, name: String) -> Result<bool, String> {
    config.create_profile(&name)?;
    Ok(true)
}

#[tauri::command]
pub fn delete_profile(config: State<AppConfig>, name: String) -> Result<bool, String> {
    config.delete_profile(&name)?;
    Ok(true)
}

#[tauri::command]
pub fn switch_profile(config: State<AppConfig>, name: String) -> Result<bool, String> {
    config.switch_profile(&name)?;
    Ok(true)
}

#[tauri::command]
pub fn rename_profile(config: State<AppConfig>, old: String, new: String) -> Result<bool, String> {
    config.rename_profile(&old, &new)?;
    Ok(true)
}

#[tauri::command]
pub fn get_profile_config(config: State<AppConfig>) -> Map<String, Value> {
    config.get_all()
}

#[tauri::command]
pub fn set_profile_setting(config: State<AppConfig>, key: String, value: Value) {
    config.set(&key, value);
}
