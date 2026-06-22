use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use log::warn;
use parking_lot::Mutex;

pub const MIN_WINDOW_WIDTH: i64 = 200;
pub const MIN_WINDOW_HEIGHT: i64 = 150;
pub const MAX_WINDOW_DIMENSION: i64 = 10000;
pub const MIN_WINDOW_POSITION: i64 = -10000;
pub const MAX_WINDOW_POSITION: i64 = 100000;
pub const WINDOW_MINIMIZED_SENTINEL: i64 = -32000;

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

pub fn validate_profile_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Profile name cannot be empty".into());
    }
    if name.len() > 128 {
        return Err("Profile name too long (max 128 characters)".into());
    }
    if name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || name.contains(':')
        || name.contains('\0')
    {
        return Err("Profile name contains invalid characters".into());
    }
    // Reject Windows reserved names
    let upper = name.to_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4",
                     "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2",
                     "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
    if reserved.contains(&upper.as_str()) {
        return Err("Profile name is a reserved system name".into());
    }
    // Allow only alphanumeric, space, hyphen, underscore
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == ' ' || c == '-' || c == '_') {
        return Err("Profile name can only contain letters, numbers, spaces, hyphens, and underscores".into());
    }
    Ok(())
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
        "settings": "Ctrl+,",
        "toggle_sidebar": "Ctrl+B",
        "cmd_panel": "Ctrl+J",
        "clear_terminal": "Ctrl+K",
        "switch_profile": "Ctrl+Shift+P",
        "back_to_launcher": "Ctrl+Shift+W",
        "new_main_tab": "Ctrl+T",
        "new_panel_tab": "Ctrl+Shift+T"
    })).unwrap());
    m.insert("theme_mode".into(), Value::String("dark".into()));
    m.insert("cta_button_style".into(), Value::String("blur".into()));
    m.insert("file_picker_type".into(), Value::String("native".into()));
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
    m.insert("persistMainTabs".into(), Value::Bool(true));
    m.insert("mainTabs".into(), Value::Array(vec![]));
    m.insert("mainTabActive".into(), Value::String("".into()));
    m.insert("tabBarPosition".into(), Value::String("titlebar".into()));
    m
}

fn sanitize_window_state(map: &mut Map<String, Value>) {
    if let Some(w) = map.get("window_width").and_then(|v| v.as_i64()) {
        if w < MIN_WINDOW_WIDTH || w > MAX_WINDOW_DIMENSION {
            map.remove("window_width");
        }
    }
    if let Some(h) = map.get("window_height").and_then(|v| v.as_i64()) {
        if h < MIN_WINDOW_HEIGHT || h > MAX_WINDOW_DIMENSION {
            map.remove("window_height");
        }
    }
    if let Some(x) = map.get("window_x").and_then(|v| v.as_i64()) {
        if x < MIN_WINDOW_POSITION || x > MAX_WINDOW_POSITION {
            map.remove("window_x");
        }
    }
    if let Some(y) = map.get("window_y").and_then(|v| v.as_i64()) {
        if y < MIN_WINDOW_POSITION || y > MAX_WINDOW_POSITION {
            map.remove("window_y");
        }
    }
}

const GLOBAL_KEYS: &[&str] = &[
    "active_profile", "last_directory", "window_width", "window_height",
    "window_maximized", "fp_last_dir_bg_image", "fp_last_dir_choose",
    "use_custom_titlebar", "window_x", "window_y",
    "cmdPanelHeight", "panelShell", "cmdPanelOpen", "sidebar_config",
    "recent_directories", "confirm_dialog_prefs",
    "persistMainTabs", "mainTabs", "mainTabActive", "tabBarPosition",
];

fn is_global_key(key: &str) -> bool {
    GLOBAL_KEYS.contains(&key)
}

fn load_json(path: &Path) -> Map<String, Value> {
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(Value::Object(map)) = serde_json::from_str(&content) {
            return map;
        }
    }
    Map::new()
}

/// Public wrapper around load_json for use by profile commands.
pub fn load_json_pub(path: &Path) -> Map<String, Value> {
    load_json(path)
}

fn save_json(path: &Path, map: &Map<String, Value>) {
    if let Some(parent) = path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            warn!("Failed to create config dir: {}", e);
            return;
        }
    }
    match serde_json::to_string_pretty(map) {
        Ok(json) => {
            let file_name = path.file_name().unwrap_or_default();
            let tmp_path = path.with_file_name(format!("{}.tmp", file_name.to_string_lossy()));
            if let Err(e) = fs::write(&tmp_path, &json) {
                warn!("Failed to write config {}: {}", path.display(), e);
                return;
            }
            if let Err(e) = fs::rename(&tmp_path, path) {
                warn!("Failed to rename config {}: {}", path.display(), e);
            }
        }
        Err(e) => warn!("Failed to serialize config: {}", e),
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
    pub fn new() -> Self {
        let global_path = config_path();
        let global = if global_path.exists() {
            let mut map = load_json(&global_path);
            sanitize_window_state(&mut map);
            let defs = defaults();
            for (k, v) in defs {
                map.entry(k).or_insert(v);
            }
            // Deep-merge: ensure new shortcut keys exist in the saved shortcuts object.
            if let Some(Value::Object(saved_shortcuts)) = map.get_mut("shortcuts") {
                let default_shortcuts = defaults().get("shortcuts").cloned();
                if let Some(Value::Object(def)) = default_shortcuts {
                    for (sk, sv) in def {
                        saved_shortcuts.entry(sk).or_insert(sv);
                    }
                }
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
        self.set_many(&[(key, value)]);
    }

    pub fn set_many(&self, pairs: &[(&str, Value)]) {
        let mut inner = self.inner.lock();
        let mut save_global = false;
        let mut save_profile = false;
        for (key, value) in pairs {
            if is_global_key(key) || inner.active_profile == "Default" {
                inner.global.insert(key.to_string(), value.clone());
                save_global = true;
            } else {
                inner.profile_overrides.insert(key.to_string(), value.clone());
                save_profile = true;
            }
        }
        if save_global {
            save_json(&config_path(), &inner.global);
        }
        if save_profile {
            save_json(&profile_path(&inner.active_profile), &inner.profile_overrides);
        }
    }

    pub fn get_all(&self) -> Map<String, Value> {
        let inner = self.inner.lock();
        let mut result = inner.global.clone();
        if inner.active_profile != "Default" {
            for (k, v) in &inner.profile_overrides {
                if is_global_key(k) {
                    continue;
                }
                result.insert(k.clone(), v.clone());
            }
        }
        result
    }

    /// Read merged config for a specific profile without switching the active profile.
    /// Global keys always come from the global config; non-global keys are overlaid
    /// from the named profile's override file. "Default" returns global-only config.
    pub fn get_all_for_profile(&self, profile_name: &str) -> Map<String, Value> {
        let inner = self.inner.lock();
        let mut result = inner.global.clone();
        if profile_name != "Default" {
            let overrides = load_json(&profile_path(profile_name));
            for (k, v) in &overrides {
                if is_global_key(k) {
                    continue;
                }
                result.insert(k.clone(), v.clone());
            }
        }
        result
    }

    /// Write a single key to a specific profile's file without switching the active
    /// profile. Global keys always go to the global config. "Default" writes to global.
    pub fn set_for_profile(&self, key: &str, value: Value, profile_name: &str) {
        if is_global_key(key) || profile_name == "Default" {
            let mut inner = self.inner.lock();
            inner.global.insert(key.to_string(), value);
            save_json(&config_path(), &inner.global);
        } else {
            let path = profile_path(profile_name);
            let mut overrides = load_json(&path);
            overrides.insert(key.to_string(), value);
            save_json(&path, &overrides);
        }
    }

    #[allow(dead_code)]
    pub fn get_active_profile(&self) -> String {
        self.inner.lock().active_profile.clone()
    }

    pub fn switch_profile(&self, name: &str) -> Result<(), String> {
        if name != "Default" {
            validate_profile_name(name)?;
            let path = profile_path(name);
            if !path.exists() {
                return Err("Profile does not exist".into());
            }
        }
        let mut inner = self.inner.lock();
        inner.active_profile = name.to_string();
        inner.global.insert("active_profile".into(), Value::String(name.to_string()));
        save_json(&config_path(), &inner.global);
        inner.profile_overrides = if name != "Default" {
            load_json(&profile_path(name))
        } else {
            Map::new()
        };
        Ok(())
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
                        if name.eq_ignore_ascii_case("Default") {
                            continue;
                        }
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

    pub fn create_profile(&self, name: &str) -> Result<(), String> {
        if name == "Default" {
            return Err("Cannot create the Default profile".into());
        }
        validate_profile_name(name)?;
        let path = profile_path(name);
        if path.exists() {
            return Err("Profile already exists".into());
        }
        let dir = profiles_dir();
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create profiles dir: {}", e))?;
        save_json(&path, &Map::new());
        Ok(())
    }

    pub fn delete_profile(&self, name: &str) -> Result<(), String> {
        if name == "Default" {
            return Err("Cannot delete the Default profile".into());
        }
        validate_profile_name(name)?;
        let path = profile_path(name);
        fs::remove_file(&path).map_err(|e| format!("Failed to delete profile: {}", e))?;
        let mut inner = self.inner.lock();
        if inner.active_profile == name {
            inner.active_profile = "Default".to_string();
            inner.global.insert("active_profile".into(), Value::String("Default".into()));
            save_json(&config_path(), &inner.global);
            inner.profile_overrides = Map::new();
        }
        Ok(())
    }

    pub fn rename_profile(&self, old: &str, new: &str) -> Result<(), String> {
        if old == "Default" || new == "Default" {
            return Err("Cannot rename to or from the Default profile".into());
        }
        validate_profile_name(old)?;
        validate_profile_name(new)?;
        let old_path = profile_path(old);
        let new_path = profile_path(new);
        if !old_path.exists() {
            return Err("Source profile does not exist".into());
        }
        if new_path.exists() {
            return Err("A profile with that name already exists".into());
        }
        fs::rename(&old_path, &new_path)
            .map_err(|e| format!("Failed to rename profile: {}", e))?;
        let mut inner = self.inner.lock();
        if inner.active_profile == old {
            inner.active_profile = new.to_string();
            inner.global.insert("active_profile".into(), Value::String(new.to_string()));
            save_json(&config_path(), &inner.global);
        }
        Ok(())
    }

    pub fn set_window_position(&self, x: i32, y: i32) {
        self.set_many(&[
            ("window_x", Value::Number(x.into())),
            ("window_y", Value::Number(y.into())),
        ]);
    }

    pub fn set_window_size(&self, width: u32, height: u32) {
        self.set_many(&[
            ("window_width", Value::Number(width.into())),
            ("window_height", Value::Number(height.into())),
        ]);
    }

    pub fn set_window_maximized(&self, max: bool) {
        self.set("window_maximized", Value::Bool(max));
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
        assert_eq!(config.get("file_picker_type").as_str().unwrap(), "native");
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
        config.create_profile("ProfileA").unwrap();
        config.switch_profile("ProfileA").unwrap();
        config.set("recent_directories", serde_json::json!(["C:\\test"]));
        config.set("cmdPanelOpen", Value::Bool(true));
        config.switch_profile("Default").unwrap();
        assert_eq!(config.get("recent_directories").as_array().unwrap().len(), 1);
        assert_eq!(config.get("cmdPanelOpen").as_bool().unwrap(), true);
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_profile_create_and_switch() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.create_profile("TestProfile").unwrap();
        config.switch_profile("TestProfile").unwrap();
        assert_eq!(config.get("active_profile").as_str().unwrap(), "TestProfile");
        config.switch_profile("Default").unwrap();
        assert_eq!(config.get("active_profile").as_str().unwrap(), "Default");
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_profile_name_too_long() {
        let long_name = "A".repeat(129);
        assert!(validate_profile_name(&long_name).is_err());
        let max_name = "A".repeat(128);
        assert!(validate_profile_name(&max_name).is_ok());
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
        config.create_profile("OldName").unwrap();
        config.switch_profile("OldName").unwrap();
        assert_eq!(config.get("active_profile").as_str().unwrap(), "OldName");
        assert!(config.rename_profile("OldName", "NewName").is_ok());
        assert_eq!(config.get("active_profile").as_str().unwrap(), "NewName");
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_delete_profile_removes_file_before_mutating_state() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.create_profile("Throwaway").unwrap();
        config.switch_profile("Throwaway").unwrap();
        // Mark the profile with a custom override so we can detect partial state.
        config.set("bg_type", Value::String("color".into()));

        let path = profile_path("Throwaway");
        assert!(path.exists(), "profile file must exist before delete");

        config.delete_profile("Throwaway").unwrap();

        // File must be gone even if the active-profile switch failed downstream.
        assert!(!path.exists(), "profile file must be removed on delete");
        assert_eq!(config.get("active_profile").as_str().unwrap(), "Default");
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_get_all_skips_global_keys_for_active_profile() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.create_profile("TestProfile").unwrap();
        config.switch_profile("TestProfile").unwrap();
        // Stash a global-looking key inside the profile overrides (only possible
        // if an external writer corrupted it, but we still must not let it leak).
        let corrupted_path = profile_path("TestProfile");
        let mut overrides = std::collections::HashMap::new();
        overrides.insert("last_directory".to_string(), Value::String("C:\\spoofed".into()));
        overrides.insert("bg_type".to_string(), Value::String("image".into()));
        let json = serde_json::to_string(&overrides).unwrap();
        std::fs::write(&corrupted_path, json).unwrap();

        // Reload the active profile from disk to pick up the corruption.
        config.switch_profile("Default").unwrap();
        config.switch_profile("TestProfile").unwrap();

        let all = config.get_all();
        // Global keys from the profile must not appear in get_all() output
        // — the global map's value should win.
        assert_eq!(
            all.get("last_directory").and_then(|v| v.as_str()).unwrap_or(""),
            "",
            "global key must not be overridden by profile file"
        );
        // Non-global keys from the profile must still overlay.
        assert_eq!(all["bg_type"].as_str().unwrap(), "image");
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_corrupted_window_state_is_sanitized_on_load() {
        let (test_dir, _lock) = setup_test_env();

        let mut map = serde_json::Map::new();
        map.insert("window_width".into(), serde_json::Value::Number(144.into()));
        map.insert("window_height".into(), serde_json::Value::Number(19.into()));
        map.insert("window_x".into(), serde_json::Value::Number((-32000).into()));
        map.insert("window_y".into(), serde_json::Value::Number((-32000).into()));
        map.insert("window_maximized".into(), serde_json::Value::Bool(false));
        save_json(&config_path(), &map);

        let config = AppConfig::new();

        assert_eq!(config.get("window_width").as_i64().unwrap(), 1200);
        assert_eq!(config.get("window_height").as_i64().unwrap(), 700);
        assert!(config.get("window_x").is_null());
        assert!(config.get("window_y").is_null());

        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_shortcut_keys_deep_merged_into_existing_config() {
        let (test_dir, _lock) = setup_test_env();

        // Simulate an older user config that lacks the new shortcut keys
        // AND has a customized Ctrl+P shortcut that the migration must preserve.
        let mut existing = serde_json::Map::new();
        existing.insert("active_profile".into(), Value::String("Default".into()));
        existing.insert(
            "shortcuts".into(),
            serde_json::json!({
                "command_palette": "Ctrl+Alt+P",
                "settings": "Ctrl+,",
                "toggle_sidebar": "Ctrl+B",
                "cmd_panel": "Ctrl+J",
                "clear_terminal": "Ctrl+K",
                "switch_profile": "Ctrl+Shift+P",
                "back_to_launcher": "Ctrl+Shift+W"
            }),
        );
        save_json(&config_path(), &existing);

        let config = AppConfig::new();
        let merged = config.get("shortcuts");
        let obj = merged.as_object().expect("shortcuts must be an object");

        // The customized shortcut must survive the migration.
        assert_eq!(obj.get("command_palette").and_then(|v| v.as_str()), Some("Ctrl+Alt+P"));
        // The two new keys must be present with their defaults.
        assert_eq!(obj.get("new_main_tab").and_then(|v| v.as_str()), Some("Ctrl+T"));
        assert_eq!(obj.get("new_panel_tab").and_then(|v| v.as_str()), Some("Ctrl+Shift+T"));
        // Pre-existing keys must be untouched.
        assert_eq!(obj.get("settings").and_then(|v| v.as_str()), Some("Ctrl+,"));
        assert_eq!(obj.get("back_to_launcher").and_then(|v| v.as_str()), Some("Ctrl+Shift+W"));

        cleanup_test_env(&test_dir);
    }
}
