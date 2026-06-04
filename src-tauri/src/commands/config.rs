use crate::config::AppConfig;
use serde_json::{Map, Value};
use tauri::State;

#[tauri::command]
pub fn get_config(config: State<AppConfig>, key: String) -> Value {
    config.get(&key)
}

#[tauri::command]
pub fn set_config(config: State<AppConfig>, key: String, value: Value) {
    config.set(&key, value);
}

#[tauri::command]
pub fn get_all_config(config: State<AppConfig>) -> Map<String, Value> {
    config.get_all()
}

#[tauri::command]
pub fn set_background_config(
    config: State<AppConfig>,
    bg_type: String,
    bg_image: Option<String>,
    bg_color: Option<String>,
    bg_gradient: Option<String>,
    bg_transparency: Option<f64>,
    theme_mode: Option<String>,
    cta_button_style: Option<String>,
    bg_layer: Option<String>,
) {
    config.set("bg_type", Value::String(bg_type));
    if let Some(v) = bg_image { config.set("bg_image", Value::String(v)); }
    if let Some(v) = bg_color { config.set("bg_color", Value::String(v)); }
    if let Some(v) = bg_gradient { config.set("bg_gradient", Value::String(v)); }
    if let Some(v) = bg_transparency {
        let clamped = v.max(0.0).min(100.0);
        config.set("bg_transparency", Value::Number(serde_json::Number::from_f64(clamped).unwrap_or(100.into())));
    }
    if let Some(v) = theme_mode { config.set("theme_mode", Value::String(v)); }
    if let Some(v) = cta_button_style { config.set("cta_button_style", Value::String(v)); }
    if let Some(v) = bg_layer { config.set("bg_layer", Value::String(v)); }
}
