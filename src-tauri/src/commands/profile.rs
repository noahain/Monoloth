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

#[tauri::command]
pub fn get_profile_appearance(config: State<AppConfig>, profile_name: String) -> Result<serde_json::Value, String> {
    let appearance_keys = [
        "theme_mode", "cta_button_style",
        "bg_type", "bg_image", "bg_color", "bg_gradient", "bg_transparency", "bg_layer",
    ];
    if profile_name == "Default" || !crate::config::profile_path(&profile_name).exists() {
        let mut result = serde_json::Map::new();
        for key in &appearance_keys {
            result.insert(key.to_string(), config.get(key));
        }
        return Ok(serde_json::Value::Object(result));
    }
    let overrides = crate::config::load_json_pub(&crate::config::profile_path(&profile_name));
    let mut result = serde_json::Map::new();
    for key in &appearance_keys {
        let val = overrides.get(*key).cloned()
            .unwrap_or_else(|| config.get(key));
        result.insert(key.to_string(), val);
    }
    Ok(serde_json::Value::Object(result))
}
