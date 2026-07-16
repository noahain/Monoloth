use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use log::warn;

fn default_history_path() -> PathBuf {
    crate::config::config_dir().join("history.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEntry {
    pub profile: String,
    pub command: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub directory: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryData {
    pub enabled: bool,
    pub retention: String,
    pub sessions: Vec<SessionEntry>,
}

impl Default for HistoryData {
    fn default() -> Self {
        Self {
            enabled: true,
            retention: "30d".to_string(),
            sessions: Vec::new(),
        }
    }
}

#[derive(Clone)]
pub struct HistoryManager {
    inner: Arc<Mutex<HistoryInner>>,
    path: PathBuf,
}

struct HistoryInner {
    data: HistoryData,
    active_sessions: HashMap<String, ActiveSession>,
}

struct ActiveSession {
    profile: String,
    command: String,
    directory: String,
    start_time: String,
}

impl HistoryManager {
    pub fn new() -> Self {
        Self::new_with_path(default_history_path())
    }

    pub fn new_with_path(path: PathBuf) -> Self {
        let data = if path.exists() {
            let mut data = load_json(&path);
            apply_retention(&mut data.sessions, &data.retention.clone());
            save_json(&path, &data);
            data
        } else {
            HistoryData::default()
        };
        Self {
            inner: Arc::new(Mutex::new(HistoryInner {
                data,
                active_sessions: HashMap::new(),
            })),
            path,
        }
    }

    pub fn session_start(&self, profile: &str, command: &str, directory: &str) {
        let mut inner = self.inner.lock();
        if !inner.data.enabled {
            return;
        }
        let session_id = "main".to_string();
        if let Some(active) = inner.active_sessions.remove(&session_id) {
            inner.data.sessions.push(SessionEntry {
                profile: active.profile,
                command: active.command,
                start_time: active.start_time,
                end_time: Some(iso_now()),
                directory: active.directory,
            });
            self.purge_inner(&mut inner);
            save_json(&self.path, &inner.data);
        }
        inner.active_sessions.insert(session_id, ActiveSession {
            profile: profile.to_string(),
            command: command.to_string(),
            directory: directory.to_string(),
            start_time: iso_now(),
        });
    }

    pub fn session_start_with_id(&self, session_id: &str, profile: &str, command: &str, directory: &str) {
        let mut inner = self.inner.lock();
        if !inner.data.enabled {
            return;
        }
        if let Some(active) = inner.active_sessions.remove(session_id) {
            inner.data.sessions.push(SessionEntry {
                profile: active.profile,
                command: active.command,
                start_time: active.start_time,
                end_time: Some(iso_now()),
                directory: active.directory,
            });
            self.purge_inner(&mut inner);
            save_json(&self.path, &inner.data);
        }
        inner.active_sessions.insert(session_id.to_string(), ActiveSession {
            profile: profile.to_string(),
            command: command.to_string(),
            directory: directory.to_string(),
            start_time: iso_now(),
        });
    }

    pub fn session_end(&self) {
        let mut inner = self.inner.lock();
        let session_id = "main";
        if let Some(active) = inner.active_sessions.remove(session_id) {
            inner.data.sessions.push(SessionEntry {
                profile: active.profile,
                command: active.command,
                start_time: active.start_time,
                end_time: Some(iso_now()),
                directory: active.directory,
            });
            self.purge_inner(&mut inner);
            save_json(&self.path, &inner.data);
        }
    }

    pub fn session_end_by_id(&self, session_id: &str) {
        let mut inner = self.inner.lock();
        if let Some(active) = inner.active_sessions.remove(session_id) {
            inner.data.sessions.push(SessionEntry {
                profile: active.profile,
                command: active.command,
                start_time: active.start_time,
                end_time: Some(iso_now()),
                directory: active.directory,
            });
            self.purge_inner(&mut inner);
            save_json(&self.path, &inner.data);
        }
    }

    pub fn session_end_all_panel_tabs(&self) {
        let mut inner = self.inner.lock();
        let keys: Vec<String> = inner.active_sessions
            .keys()
            .filter(|k| k.starts_with("panel-") || k.as_str() == "panel")
            .cloned()
            .collect();
        for key in &keys {
            if let Some(active) = inner.active_sessions.remove(key) {
                inner.data.sessions.push(SessionEntry {
                    profile: active.profile,
                    command: active.command,
                    start_time: active.start_time,
                    end_time: Some(iso_now()),
                    directory: active.directory,
                });
            }
        }
        if !keys.is_empty() {
            self.purge_inner(&mut inner);
            save_json(&self.path, &inner.data);
        }
    }

    pub fn session_end_by_prefix(&self, prefix: &str) {
        let mut inner = self.inner.lock();
        let keys: Vec<String> = inner.active_sessions
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect();
        for key in &keys {
            if let Some(active) = inner.active_sessions.remove(key) {
                inner.data.sessions.push(SessionEntry {
                    profile: active.profile,
                    command: active.command,
                    start_time: active.start_time,
                    end_time: Some(iso_now()),
                    directory: active.directory,
                });
            }
        }
        if !keys.is_empty() {
            self.purge_inner(&mut inner);
            save_json(&self.path, &inner.data);
        }
    }

    pub fn session_end_all_main_tabs(&self) {
        self.session_end_by_prefix("main-tab-");
    }

    fn purge_inner(&self, inner: &mut HistoryInner) {
        let retention = inner.data.retention.clone();
        apply_retention(&mut inner.data.sessions, &retention);
    }

    pub fn get_data(&self) -> HistoryData {
        let inner = self.inner.lock();
        let mut data = inner.data.clone();
        if data.enabled {
            for (_, active) in &inner.active_sessions {
                data.sessions.push(SessionEntry {
                    profile: active.profile.clone(),
                    command: active.command.clone(),
                    start_time: active.start_time.clone(),
                    end_time: None,
                    directory: active.directory.clone(),
                });
            }
        }
        apply_retention(&mut data.sessions, &data.retention);
        data
    }

    pub fn set_enabled(&self, enabled: bool) {
        let mut inner = self.inner.lock();
        inner.data.enabled = enabled;
        if !enabled {
            let now = iso_now();
            let drained: Vec<ActiveSession> = inner.active_sessions.drain().map(|(_, a)| a).collect();
            for active in drained {
                inner.data.sessions.push(SessionEntry {
                    profile: active.profile,
                    command: active.command,
                    start_time: active.start_time,
                    end_time: Some(now.clone()),
                    directory: active.directory,
                });
            }
        }
        save_json(&self.path, &inner.data);
    }

    pub fn set_retention(&self, retention: &str) {
        let mut inner = self.inner.lock();
        inner.data.retention = retention.to_string();
        self.purge_inner(&mut inner);
        save_json(&self.path, &inner.data);
    }

    pub fn clear_history(&self) {
        let mut inner = self.inner.lock();
        inner.data.sessions.clear();
        inner.active_sessions.clear();
        save_json(&self.path, &inner.data);
    }

    #[cfg(test)]
    pub fn inject_session_for_test(&self, entry: SessionEntry) {
        let mut inner = self.inner.lock();
        inner.data.sessions.push(entry);
        save_json(&self.path, &inner.data);
    }
}

fn iso_now() -> String {
    let secs = epoch_seconds();
    epoch_to_iso(secs)
}

fn epoch_seconds() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn is_valid_retention(retention: &str) -> bool {
    matches!(retention, "7d" | "30d" | "forever")
}

fn retention_days(retention: &str) -> Option<i64> {
    let days = match retention {
        "7d" => Some(7),
        "30d" => Some(30),
        "90d" => Some(90),
        _ => {
            if retention.ends_with('d') && retention.len() > 1 {
                retention[..retention.len() - 1].parse::<i64>().ok()
            } else {
                None
            }
        }
    };
    // Reject absurd values up front (signed i64 max / 86400 ~= 1e14 years; cap at 100y).
    days.filter(|d| *d > 0 && *d <= 36500)
}

fn apply_retention(sessions: &mut Vec<SessionEntry>, retention: &str) {
    let Some(days) = retention_days(retention) else {
        return;
    };
    let now = epoch_seconds();
    let day_secs = days.saturating_mul(86400);
    let Some(cutoff) = now.checked_sub(day_secs) else {
        return;
    };
    sessions.retain(|s| {
        let ts = s.end_time.as_ref()
            .and_then(|t| parse_iso_to_epoch(t).ok())
            .or_else(|| parse_iso_to_epoch(&s.start_time).ok());
        match ts {
            Some(t) => t >= cutoff,
            None => true,
        }
    });
}

fn epoch_to_iso(secs: i64) -> String {
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    let mut year: i64 = 1970;
    let mut remaining_days = days_since_epoch;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }

    let days_in_months: [i64; 12] = if is_leap(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut month = 1;
    for dim in days_in_months {
        if remaining_days < dim {
            break;
        }
        remaining_days -= dim;
        month += 1;
    }

    let day = remaining_days + 1;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

fn parse_iso_to_epoch(s: &str) -> Result<i64, ()> {
    if s.len() < 20 {
        return Err(());
    }
    if !s.is_ascii() {
        return Err(());
    }
    let bytes = s.as_bytes();
    let year: i64 = std::str::from_utf8(&bytes[0..4]).map_err(|_| ())?.parse().map_err(|_| ())?;
    let month: i64 = std::str::from_utf8(&bytes[5..7]).map_err(|_| ())?.parse().map_err(|_| ())?;
    let day: i64 = std::str::from_utf8(&bytes[8..10]).map_err(|_| ())?.parse().map_err(|_| ())?;
    let hour: i64 = std::str::from_utf8(&bytes[11..13]).map_err(|_| ())?.parse().map_err(|_| ())?;
    let min: i64 = std::str::from_utf8(&bytes[14..16]).map_err(|_| ())?.parse().map_err(|_| ())?;
    let sec: i64 = std::str::from_utf8(&bytes[17..19]).map_err(|_| ())?.parse().map_err(|_| ())?;

    if month < 1 || month > 12 {
        return Err(());
    }
    if hour > 23 || min > 59 || sec > 59 {
        return Err(());
    }

    let mut days = 0i64;
    if year < 1970 {
        return Err(());
    }
    for y in 1970..year {
        days += if is_leap(y) { 366 } else { 365 };
    }
    let dims: [i64; 12] = if is_leap(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    if day < 1 || day > dims[(month - 1) as usize] {
        return Err(());
    }
    for m in 0..(month - 1) as usize {
        days += dims[m];
    }
    days += day - 1;
    Ok(days * 86400 + hour * 3600 + min * 60 + sec)
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_mgr() -> (HistoryManager, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "monoloth_hist_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("history.json");
        (HistoryManager::new_with_path(path), dir)
    }

    #[test]
    fn parse_iso_rejects_multibyte_input_without_panic() {
        let multibyte = "ééé-12-12T12:00:00Z";
        assert!(parse_iso_to_epoch(multibyte).is_err());
    }

    #[test]
    fn parse_iso_rejects_short_input() {
        assert!(parse_iso_to_epoch("").is_err());
        assert!(parse_iso_to_epoch("2024").is_err());
        assert!(parse_iso_to_epoch("2024-01-01").is_err());
    }

    #[test]
    fn parse_iso_handles_valid_timestamp() {
        let s = "2024-06-15T12:30:45Z";
        let t = parse_iso_to_epoch(s).expect("valid ISO should parse");
        assert!(t > 1_700_000_000 && t < 1_750_000_000);
    }

    #[test]
    fn parse_iso_rejects_pre_1970() {
        assert!(parse_iso_to_epoch("1969-12-31T23:59:59Z").is_err());
    }

    #[test]
    fn retention_days_rejects_absurd_values() {
        assert_eq!(retention_days("7d"), Some(7));
        assert_eq!(retention_days("30d"), Some(30));
        assert_eq!(retention_days("100d"), Some(100));
        assert_eq!(retention_days("100000d"), None);
        assert_eq!(retention_days("0d"), None);
        assert_eq!(retention_days("d"), None);
        assert_eq!(retention_days("forever"), None);
    }

    #[test]
    fn apply_retention_handles_huge_days_without_overflow() {
        let mut sessions = vec![SessionEntry {
            profile: "p".into(),
            command: "c".into(),
            start_time: "2024-01-01T00:00:00Z".into(),
            end_time: None,
            directory: "d".into(),
        }];
        apply_retention(&mut sessions, "9999999999d");
        assert_eq!(sessions.len(), 1, "unparseable retention must not drop sessions");
    }

    #[test]
    fn apply_retention_keeps_unparseable_timestamps() {
        let mut sessions = vec![SessionEntry {
            profile: "p".into(),
            command: "c".into(),
            start_time: "not-a-valid-iso-timestamp".into(),
            end_time: None,
            directory: "/dir-unparseable".into(),
        }];
        apply_retention(&mut sessions, "30d");
        assert_eq!(sessions.len(), 1, "unparseable timestamps must not be deleted");
    }

    #[test]
    fn session_end_all_main_tabs_ends_only_main_tab_prefixed_sessions() {
        let (mgr, dir) = test_mgr();
        mgr.session_start_with_id("main-tab-1", "p", "c1", "/dir-main-tab-1");
        mgr.session_start_with_id("main-tab-2", "p", "c2", "/dir-main-tab-2");
        mgr.session_start_with_id("panel-tab-1", "p", "c3", "/dir-panel-tab-1");
        mgr.session_start_with_id("main", "p", "c4", "/dir-main");

        mgr.session_end_all_main_tabs();

        let data = mgr.get_data();
        let main_tab_ended: Vec<_> = data.sessions.iter()
            .filter(|s| s.directory == "/dir-main-tab-1" || s.directory == "/dir-main-tab-2")
            .collect();
        assert_eq!(main_tab_ended.len(), 2, "both main-tab-* sessions should have ended");
        assert!(main_tab_ended.iter().all(|s| s.end_time.is_some()), "main-tab-* sessions must have end_time");

        let main_ended: Vec<_> = data.sessions.iter()
            .filter(|s| s.directory == "/dir-main" && s.end_time.is_some())
            .collect();
        assert!(main_ended.is_empty(), "\"main\" session should NOT be ended by session_end_all_main_tabs");

        let panel_ended: Vec<_> = data.sessions.iter()
            .filter(|s| s.directory == "/dir-panel-tab-1" && s.end_time.is_some())
            .collect();
        assert!(panel_ended.is_empty(), "panel-tab-* sessions should NOT be ended by session_end_all_main_tabs");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn session_start_overwrite_persists_to_disk() {
        let (mgr, dir) = test_mgr();
        let path = dir.join("history.json");
        mgr.session_start("p1", "c1", "/dir-overwrite-test-a");
        mgr.session_start("p2", "c2", "/dir-overwrite-test-b");
        drop(mgr);

        let mgr2 = HistoryManager::new_with_path(path);
        let data = mgr2.get_data();
        let a_found = data.sessions.iter().any(|s| s.directory == "/dir-overwrite-test-a");
        assert!(a_found, "overwritten session must persist to disk across restart");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_enabled_false_flushes_active_sessions() {
        let (mgr, dir) = test_mgr();
        mgr.session_start("p1", "c1", "/dir-flush-test");
        mgr.set_enabled(false);

        let data = mgr.get_data();
        let found = data.sessions.iter().any(|s| s.directory == "/dir-flush-test");
        assert!(found, "active session must be flushed to data.sessions when disabled");
        assert!(!data.enabled, "history should be disabled");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn get_data_includes_active_sessions() {
        let (mgr, dir) = test_mgr();
        mgr.session_start("p1", "c1", "/dir-active-test");

        let data = mgr.get_data();
        let found = data.sessions.iter().any(|s| s.directory == "/dir-active-test");
        assert!(found, "active session must appear in get_data() result");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn session_end_all_panel_tabs_includes_original_panel() {
        let (mgr, dir) = test_mgr();
        mgr.session_start_with_id("panel", "p", "c", "/dir-panel-original");
        mgr.session_start_with_id("panel-tab-1", "p", "c", "/dir-panel-tab-1");
        mgr.session_start_with_id("main-tab-1", "p", "c", "/dir-panel-test-main-tab-1");

        mgr.session_end_all_panel_tabs();

        let data = mgr.get_data();
        let panel_ended = data.sessions.iter().any(|s| s.directory == "/dir-panel-original" && s.end_time.is_some());
        let panel_tab_ended = data.sessions.iter().any(|s| s.directory == "/dir-panel-tab-1" && s.end_time.is_some());
        let main_tab_ended = data.sessions.iter().any(|s| s.directory == "/dir-panel-test-main-tab-1" && s.end_time.is_some());

        assert!(panel_ended, "original 'panel' session must be ended");
        assert!(panel_tab_ended, "'panel-tab-1' session must be ended");
        assert!(!main_tab_ended, "main-tab-1 session must NOT be ended by session_end_all_panel_tabs");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_history_uses_isolated_path_not_appdata() {
        let (mgr, dir) = test_mgr();
        let path = dir.join("history.json");
        mgr.session_start("p", "opencode", "/isolated-dir-marker");
        mgr.session_end();

        assert!(path.exists(), "history must be written to the injected path");
        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(raw.contains("/isolated-dir-marker"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn session_start_overwrite_applies_retention() {
        let (mgr, dir) = test_mgr();
        mgr.set_retention("7d");

        mgr.inject_session_for_test(SessionEntry {
            profile: "p".into(),
            command: "old".into(),
            start_time: "2000-01-01T00:00:00Z".into(),
            end_time: Some("2000-01-01T01:00:00Z".into()),
            directory: "/ancient".into(),
        });

        mgr.session_start("p", "new", "/now");
        mgr.session_start("p", "newer", "/now2");

        let data = mgr.get_data();
        assert!(
            !data.sessions.iter().any(|s| s.directory == "/ancient"),
            "overwrite must purge expired sessions"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn retention_validator_matches_ui() {
        assert!(is_valid_retention("7d"));
        assert!(is_valid_retention("30d"));
        assert!(is_valid_retention("forever"));
        assert!(!is_valid_retention("90d"));
        assert!(!is_valid_retention(""));
        assert!(!is_valid_retention("100d"));
    }
}

fn load_json(path: &Path) -> HistoryData {
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(data) = serde_json::from_str(&content) {
            return data;
        }
    }
    HistoryData::default()
}

fn save_json(path: &Path, data: &HistoryData) {
    if let Some(parent) = path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            warn!("[Monoloth] Failed to create history dir: {}", e);
            return;
        }
    }
    match serde_json::to_string_pretty(data) {
        Ok(json) => {
            let file_name = path.file_name().unwrap_or_default();
            let tmp_path = path.with_file_name(format!("{}.tmp", file_name.to_string_lossy()));
            if let Err(e) = fs::write(&tmp_path, &json) {
                warn!(
                    "[Monoloth] Failed to write history {}: {}",
                    path.display(),
                    e
                );
                return;
            }
            if let Err(e) = fs::rename(&tmp_path, path) {
                warn!(
                    "[Monoloth] Failed to rename history {}: {}",
                    path.display(),
                    e
                );
            }
        }
        Err(e) => warn!("[Monoloth] Failed to serialize history: {}", e),
    }
}
