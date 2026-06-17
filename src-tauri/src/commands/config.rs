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
pub fn set_many_config(config: State<AppConfig>, entries: Map<String, Value>) {
    let pairs: Vec<(&str, Value)> = entries
        .iter()
        .map(|(k, v)| (k.as_str(), v.clone()))
        .collect();
    config.set_many(&pairs);
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
    let mut entries: Map<String, Value> = Map::new();
    entries.insert("bg_type".into(), Value::String(bg_type));
    if let Some(v) = bg_image { entries.insert("bg_image".into(), Value::String(v)); }
    if let Some(v) = bg_color { entries.insert("bg_color".into(), Value::String(v)); }
    if let Some(v) = bg_gradient { entries.insert("bg_gradient".into(), Value::String(v)); }
    if let Some(v) = bg_transparency {
        if !v.is_nan() {
            let clamped = v.max(0.0).min(100.0).round() as i64;
            entries.insert("bg_transparency".into(), Value::Number(clamped.into()));
        }
    }
    if let Some(v) = theme_mode { entries.insert("theme_mode".into(), Value::String(v)); }
    if let Some(v) = cta_button_style { entries.insert("cta_button_style".into(), Value::String(v)); }
    if let Some(v) = bg_layer { entries.insert("bg_layer".into(), Value::String(v)); }
    let pairs: Vec<(&str, Value)> = entries.iter().map(|(k, v)| (k.as_str(), v.clone())).collect();
    config.set_many(&pairs);
}
