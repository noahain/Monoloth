use crate::config::AppConfig;
use serde_json::{Map, Value};
use tauri::State;

pub fn validate_background_entry(key: &str, value: &Value) -> Result<(), String> {
    match key {
        "bg_type" => {
            let v = value.as_str().ok_or("bg_type must be a string")?;
            if !["none", "image", "color", "gradient"].contains(&v) {
                return Err(format!("Invalid bg_type: {}", v));
            }
        }
        "theme_mode" => {
            let v = value.as_str().ok_or("theme_mode must be a string")?;
            if !["dark", "light", "auto"].contains(&v) {
                return Err(format!("Invalid theme_mode: {}", v));
            }
        }
        "cta_button_style" => {
            let v = value.as_str().ok_or("cta_button_style must be a string")?;
            if !["blur", "glass", "solid", "outline"].contains(&v) {
                return Err(format!("Invalid cta_button_style: {}", v));
            }
        }
        "bg_layer" => {
            let v = value.as_str().ok_or("bg_layer must be a string")?;
            if !["behind", "overlay"].contains(&v) {
                return Err(format!("Invalid bg_layer: {}", v));
            }
        }
        "bg_transparency" => {
            let n = value.as_f64().ok_or("bg_transparency must be a number")?;
            if n.is_nan() || n < 0.0 || n > 100.0 {
                return Err("bg_transparency must be between 0 and 100".into());
            }
        }
        "bg_image" | "bg_color" | "bg_gradient" => {
            if value.as_str().is_none() {
                return Err(format!("{} must be a string", key));
            }
        }
        _ => {}
    }
    Ok(())
}

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
pub fn set_many_config(config: State<AppConfig>, entries: Map<String, Value>) -> Result<(), String> {
    for (key, value) in &entries {
        if key.starts_with("bg_") || key == "theme_mode" || key == "cta_button_style" {
            validate_background_entry(key, value)?;
        }
    }
    let pairs: Vec<(&str, Value)> = entries
        .iter()
        .map(|(k, v)| (k.as_str(), v.clone()))
        .collect();
    config.set_many(&pairs);
    Ok(())
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
) -> Result<(), String> {
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

    for (key, value) in &entries {
        validate_background_entry(key, value)?;
    }

    let pairs: Vec<(&str, Value)> = entries.iter().map(|(k, v)| (k.as_str(), v.clone())).collect();
    config.set_many(&pairs);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_bg_type_valid() {
        for v in ["none", "image", "color", "gradient"] {
            assert!(validate_background_entry("bg_type", &Value::String(v.into())).is_ok());
        }
    }

    #[test]
    fn test_validate_bg_type_invalid() {
        assert!(validate_background_entry("bg_type", &Value::String("evil".into())).is_err());
        assert!(validate_background_entry("bg_type", &Value::Number(42.into())).is_err());
    }

    #[test]
    fn test_validate_theme_mode_valid() {
        for v in ["dark", "light", "auto"] {
            assert!(validate_background_entry("theme_mode", &Value::String(v.into())).is_ok());
        }
    }

    #[test]
    fn test_validate_theme_mode_invalid() {
        assert!(validate_background_entry("theme_mode", &Value::String("hacker".into())).is_err());
    }

    #[test]
    fn test_validate_cta_button_style_valid() {
        for v in ["blur", "glass", "solid", "outline"] {
            assert!(validate_background_entry("cta_button_style", &Value::String(v.into())).is_ok());
        }
    }

    #[test]
    fn test_validate_cta_button_style_invalid() {
        assert!(validate_background_entry("cta_button_style", &Value::String("invisible".into())).is_err());
    }

    #[test]
    fn test_validate_bg_layer_valid() {
        for v in ["behind", "overlay"] {
            assert!(validate_background_entry("bg_layer", &Value::String(v.into())).is_ok());
        }
    }

    #[test]
    fn test_validate_bg_layer_invalid() {
        assert!(validate_background_entry("bg_layer", &Value::String("front".into())).is_err());
    }

    #[test]
    fn test_validate_bg_transparency_valid() {
        assert!(validate_background_entry("bg_transparency", &Value::Number(0.into())).is_ok());
        assert!(validate_background_entry("bg_transparency", &Value::Number(50.into())).is_ok());
        assert!(validate_background_entry("bg_transparency", &Value::Number(100.into())).is_ok());
    }

    #[test]
    fn test_validate_bg_transparency_invalid() {
        assert!(validate_background_entry("bg_transparency", &Value::Number((-1).into())).is_err());
        assert!(validate_background_entry("bg_transparency", &Value::Number(101.into())).is_err());
        assert!(validate_background_entry("bg_transparency", &Value::String("50".into())).is_err());
    }

    #[test]
    fn test_validate_non_bg_key_passes() {
        assert!(validate_background_entry("startup_command", &Value::String("opencode".into())).is_ok());
        assert!(validate_background_entry("window_width", &Value::Number(1200.into())).is_ok());
    }
}
