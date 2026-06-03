use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use parking_lot::Mutex;

fn appdata_dir() -> PathBuf {
    std::env::var("APPDATA")
        .map(|s| PathBuf::from(s).join("Monoloth"))
        .unwrap_or_else(|_| dirs::config_dir().unwrap_or_default().join("Monoloth"))
}

pub fn config_dir() -> PathBuf {
    appdata_dir()
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn profiles_dir() -> PathBuf {
    config_dir().join("profiles")
}

pub fn profile_path(name: &str) -> PathBuf {
    profiles_dir().join(format!("{}.json", name))
}

fn defaults() -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("last_directory".into(), Value::String("".into()));
    m.insert("window_width".into(), Value::Number(1200.into()));
    m.insert("window_height".into(), Value::Number(700.into()));
    m.insert("window_maximized".into(), Value::Bool(false));
    m.insert("bg_type".into(), Value::String("none".into()));
    m.insert("bg_image".into(), Value::String("".into()));
    m.insert("bg_color".into(), Value::String("#0a0a0a".into()));
    m.insert("bg_gradient".into(), Value::String("linear-gradient(135deg, #667eea 0%, #764ba2 100%)".into()));
    m.insert("bg_transparency".into(), Value::Number(75.into()));
    m.insert("bg_layer".into(), Value::String("behind".into()));
    m.insert("shortcuts".into(), serde_json::to_value(serde_json::json!({
        "command_palette": "Ctrl+P",
        "settings": "Ctrl+,"
    })).unwrap());
    m.insert("theme_mode".into(), Value::String("dark".into()));
    m.insert("cta_button_style".into(), Value::String("blur".into()));
    m.insert("file_picker_type".into(), Value::String("custom".into()));
    m.insert("fp_last_dir_bg_image".into(), Value::String("".into()));
    m.insert("fp_last_dir_choose".into(), Value::String("".into()));
    m.insert("startup_command".into(), Value::String("opencode".into()));
    m.insert("startup_command_type".into(), Value::String("preset".into()));
    m.insert("secondary_commands".into(), Value::Array(vec![]));
    m.insert("active_profile".into(), Value::String("Default".into()));
    m.insert("use_custom_titlebar".into(), Value::Bool(true));
    m.insert("window_x".into(), Value::Null);
    m.insert("window_y".into(), Value::Null);
    m.insert("cmdPanelHeight".into(), Value::Number(200.into()));
    m.insert("panelShell".into(), Value::String("cmd".into()));
    m.insert("tabs_config".into(), serde_json::to_value(serde_json::json!({
        "enabled": true,
        "position": "top",
        "activeTabId": null,
        "tabs": []
    })).unwrap());
    m
}

fn global_keys() -> Vec<&'static str> {
    vec![
        "active_profile", "last_directory", "window_width", "window_height",
        "window_maximized", "fp_last_dir_bg_image", "fp_last_dir_choose",
        "use_custom_titlebar", "window_x", "window_y",
        "cmdPanelHeight", "panelShell", "tabs_config",
        "tabs_state", "sidebar_config",
    ]
}

fn is_global_key(key: &str) -> bool {
    global_keys().contains(&key)
}

fn load_json(path: &Path) -> Map<String, Value> {
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(Value::Object(map)) = serde_json::from_str(&content) {
            return map;
        }
    }
    Map::new()
}

fn save_json(path: &Path, map: &Map<String, Value>) {
    if let Some(parent) = path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            eprintln!("[Monoloth] Failed to create config dir: {}", e);
            return;
        }
    }
    match serde_json::to_string_pretty(&Value::Object(map.clone())) {
        Ok(json) => {
            let tmp_path = path.with_extension(".tmp");
            if let Err(e) = fs::write(&tmp_path, &json) {
                eprintln!("[Monoloth] Failed to write config {}: {}", path.display(), e);
                return;
            }
            if let Err(e) = fs::rename(&tmp_path, path) {
                eprintln!("[Monoloth] Failed to rename config {}: {}", path.display(), e);
            }
        }
        Err(e) => eprintln!("[Monoloth] Failed to serialize config: {}", e),
    }
}

#[derive(Clone)]
pub struct AppConfig {
    inner: Arc<Mutex<ConfigInner>>,
}

struct ConfigInner {
    global: Map<String, Value>,
    profile_overrides: Map<String, Value>,
    active_profile: String,
}

impl AppConfig {
    /// Returns a clone of self (cheap — wraps Arc).
    #[allow(dead_code)]
    pub fn inner(&self) -> Self {
        self.clone()
    }

    pub fn new() -> Self {
        let global_path = config_path();
        let global = if global_path.exists() {
            let mut map = load_json(&global_path);
            // Merge with defaults
            let defs = defaults();
            for (k, v) in defs {
                map.entry(k).or_insert(v);
            }
            map
        } else {
            defaults()
        };

        let active_profile = global
            .get("active_profile")
            .and_then(|v| v.as_str())
            .unwrap_or("Default")
            .to_string();

        let profile_overrides = if active_profile != "Default" {
            load_json(&profile_path(&active_profile))
        } else {
            Map::new()
        };

        Self {
            inner: Arc::new(Mutex::new(ConfigInner {
                global,
                profile_overrides,
                active_profile,
            })),
        }
    }

    pub fn get(&self, key: &str) -> Value {
        let inner = self.inner.lock();
        if is_global_key(key) {
            inner.global.get(key).cloned().unwrap_or(Value::Null)
        } else {
            inner
                .profile_overrides
                .get(key)
                .cloned()
                .or_else(|| inner.global.get(key).cloned())
                .unwrap_or(Value::Null)
        }
    }

    pub fn set(&self, key: &str, value: Value) {
        let mut inner = self.inner.lock();
        if is_global_key(key) || inner.active_profile == "Default" {
            inner.global.insert(key.to_string(), value.clone());
            save_json(&config_path(), &inner.global);
        } else {
            inner.profile_overrides.insert(key.to_string(), value.clone());
            save_json(&profile_path(&inner.active_profile), &inner.profile_overrides);
        }
    }

    pub fn get_all(&self) -> Map<String, Value> {
        let inner = self.inner.lock();
        let mut result = inner.global.clone();
        if inner.active_profile != "Default" {
            for (k, v) in &inner.profile_overrides {
                result.insert(k.clone(), v.clone());
            }
        }
        result
    }

    #[allow(dead_code)]
    pub fn get_active_profile(&self) -> String {
        self.inner.lock().active_profile.clone()
    }

    pub fn switch_profile(&self, name: &str) {
        let mut inner = self.inner.lock();
        inner.active_profile = name.to_string();
        inner.global.insert("active_profile".into(), Value::String(name.to_string()));
        save_json(&config_path(), &inner.global);
        inner.profile_overrides = if name != "Default" {
            load_json(&profile_path(name))
        } else {
            Map::new()
        };
    }

    pub fn list_profiles(&self) -> Vec<HashMap<String, Value>> {
        let mut profiles = vec![HashMap::from([
            ("name".to_string(), Value::String("Default".into())),
            ("isDefault".to_string(), Value::Bool(true)),
        ])];

        if let Ok(entries) = fs::read_dir(profiles_dir()) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("json")).unwrap_or(false) {
                    if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                        profiles.push(HashMap::from([
                            ("name".to_string(), Value::String(name.into())),
                            ("isDefault".to_string(), Value::Bool(false)),
                        ]));
                    }
                }
            }
        }
        profiles
    }

    pub fn create_profile(&self, name: &str) {
        if name == "Default" {
            return;
        }
        let dir = profiles_dir();
        let _ = fs::create_dir_all(&dir);
        save_json(&profile_path(name), &Map::new());
    }

    pub fn delete_profile(&self, name: &str) {
        if name == "Default" {
            return;
        }
        let path = profile_path(name);
        let _ = fs::remove_file(&path);
        let mut inner = self.inner.lock();
        if inner.active_profile == name {
            inner.active_profile = "Default".to_string();
            inner.global.insert("active_profile".into(), Value::String("Default".into()));
            save_json(&config_path(), &inner.global);
            inner.profile_overrides = Map::new();
        }
    }

    pub fn rename_profile(&self, old: &str, new: &str) -> Result<(), String> {
        let old_path = profile_path(old);
        let new_path = profile_path(new);
        if old_path.exists() {
            fs::rename(&old_path, &new_path)
                .map_err(|e| format!("Failed to rename profile: {}", e))?;
        }
        let mut inner = self.inner.lock();
        if inner.active_profile == old {
            inner.active_profile = new.to_string();
            inner.global.insert("active_profile".into(), Value::String(new.to_string()));
            save_json(&config_path(), &inner.global);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn setup_test_env() -> (PathBuf, std::sync::MutexGuard<'static, ()>) {
        let lock = TEST_LOCK.lock().unwrap();
        let test_dir = std::env::temp_dir().join("monoloth_test_config");
        let _ = fs::remove_dir_all(&test_dir);
        fs::create_dir_all(&test_dir).unwrap();
        std::env::set_var("APPDATA", test_dir.to_str().unwrap());
        (test_dir, lock)
    }

    fn cleanup_test_env(dir: &Path) {
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn test_defaults_load() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        assert_eq!(config.get("bg_type").as_str().unwrap(), "none");
        assert_eq!(config.get("theme_mode").as_str().unwrap(), "dark");
        assert_eq!(config.get("file_picker_type").as_str().unwrap(), "custom");
        assert_eq!(config.get("window_width").as_i64().unwrap(), 1200);
        assert_eq!(config.get("window_height").as_i64().unwrap(), 700);
        assert_eq!(config.get("active_profile").as_str().unwrap(), "Default");
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_set_get_roundtrip() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.set("bg_type", Value::String("gradient".into()));
        assert_eq!(config.get("bg_type").as_str().unwrap(), "gradient");
        config.set("bg_transparency", Value::Number(50.into()));
        assert_eq!(config.get("bg_transparency").as_i64().unwrap(), 50);
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_global_keys_always_global() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.set("last_directory", Value::String("C:\\test".into()));
        assert_eq!(config.get("last_directory").as_str().unwrap(), "C:\\test");
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_profile_create_and_switch() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.create_profile("TestProfile");
        config.switch_profile("TestProfile");
        assert_eq!(config.get("active_profile").as_str().unwrap(), "TestProfile");
        config.switch_profile("Default");
        assert_eq!(config.get("active_profile").as_str().unwrap(), "Default");
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_get_all_returns_merged_config() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.set("bg_type", Value::String("color".into()));
        config.set("bg_color", Value::String("#ff0000".into()));
        let all = config.get_all();
        assert_eq!(all["bg_type"].as_str().unwrap(), "color");
        assert_eq!(all["bg_color"].as_str().unwrap(), "#ff0000");
        assert!(all.contains_key("startup_command"));
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_profile_rename_updates_active() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.create_profile("OldName");
        config.switch_profile("OldName");
        assert_eq!(config.get("active_profile").as_str().unwrap(), "OldName");
        assert!(config.rename_profile("OldName", "NewName").is_ok());
        assert_eq!(config.get("active_profile").as_str().unwrap(), "NewName");
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn tabs_config_in_global_keys() {
        assert!(is_global_key("tabs_config"));
    }

    #[test]
    fn tabs_config_default_seeded_on_first_load() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        let tabs = config.get("tabs_config");
        assert_eq!(tabs["enabled"].as_bool().unwrap(), true);
        assert_eq!(tabs["position"].as_str().unwrap(), "top");
        assert!(tabs["activeTabId"].is_null());
        assert!(tabs["tabs"].as_array().unwrap().is_empty());
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_tabs_state_is_global() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.create_profile("OtherProfile");
        config.switch_profile("OtherProfile");
        config.set("tabs_state", Value::String("test-value".into()));
        let global = load_json(&config_path());
        assert_eq!(global.get("tabs_state").and_then(|v| v.as_str()), Some("test-value"));
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_sidebar_config_is_global() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.create_profile("OtherProfile");
        config.switch_profile("OtherProfile");
        config.set("sidebar_config", Value::String("test-value".into()));
        let global = load_json(&config_path());
        assert_eq!(global.get("sidebar_config").and_then(|v| v.as_str()), Some("test-value"));
        cleanup_test_env(&test_dir);
    }
}
