use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

fn history_path() -> PathBuf {
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
}

struct HistoryInner {
    data: HistoryData,
    active_session: Option<ActiveSession>,
}

struct ActiveSession {
    profile: String,
    command: String,
    directory: String,
    start_time: String,
}

impl HistoryManager {
    pub fn new() -> Self {
        let path = history_path();
        let mut data = if path.exists() {
            let loaded = load_json(&path);
            if loaded.enabled {
                // Purge on load to clean up expired entries
                let mgr = Self {
                    inner: Arc::new(Mutex::new(HistoryInner {
                        data: loaded,
                        active_session: None,
                    })),
                };
                let mut inner = mgr.inner.lock();
                mgr.purge_inner(&mut inner);
                save_json(&history_path(), &inner.data);
                inner.data.clone()
            } else {
                loaded
            }
        } else {
            HistoryData::default()
        };
        data.sessions = data.sessions.into_iter().collect();
        Self {
            inner: Arc::new(Mutex::new(HistoryInner {
                data,
                active_session: None,
            })),
        }
    }

    pub fn session_start(&self, profile: &str, command: &str, directory: &str) {
        let mut inner = self.inner.lock();
        if !inner.data.enabled {
            return;
        }
        if inner.active_session.is_some() {
            return;
        }
        self.session_end_inner(&mut inner);
        inner.active_session = Some(ActiveSession {
            profile: profile.to_string(),
            command: command.to_string(),
            directory: directory.to_string(),
            start_time: iso_now(),
        });
    }

    pub fn session_end(&self) {
        let mut inner = self.inner.lock();
        self.session_end_inner(&mut inner);
    }

    fn session_end_inner(&self, inner: &mut HistoryInner) {
        if let Some(active) = inner.active_session.take() {
            inner.data.sessions.push(SessionEntry {
                profile: active.profile,
                command: active.command,
                start_time: active.start_time,
                end_time: Some(iso_now()),
                directory: active.directory,
            });
            self.purge_inner(inner);
            save_json(&history_path(), &inner.data);
        }
    }

    fn purge_inner(&self, inner: &mut HistoryInner) {
        let retention_days: Option<i64> = match inner.data.retention.as_str() {
            "7d" => Some(7),
            "30d" => Some(30),
            _ => None,
        };

        if let Some(days) = retention_days {
            let now = epoch_seconds();
            let cutoff = now - days * 86400;
            inner.data.sessions.retain(|s| {
                parse_iso_to_epoch(&s.start_time)
                    .map(|ts| ts >= cutoff)
                    .unwrap_or(true)
            });
        }
    }

    pub fn get_data(&self) -> HistoryData {
        let inner = self.inner.lock();
        // Purge before returning
        let mut data = inner.data.clone();
        let retention_days: Option<i64> = match data.retention.as_str() {
            "7d" => Some(7),
            "30d" => Some(30),
            _ => None,
        };
        if let Some(days) = retention_days {
            let now = epoch_seconds();
            let cutoff = now - days * 86400;
            data.sessions.retain(|s| {
                parse_iso_to_epoch(&s.start_time)
                    .map(|ts| ts >= cutoff)
                    .unwrap_or(true)
            });
        }
        data
    }

    pub fn set_enabled(&self, enabled: bool) {
        let mut inner = self.inner.lock();
        inner.data.enabled = enabled;
        if !enabled {
            inner.active_session = None;
        }
        save_json(&history_path(), &inner.data);
    }

    pub fn set_retention(&self, retention: &str) {
        let mut inner = self.inner.lock();
        inner.data.retention = retention.to_string();
        self.purge_inner(&mut inner);
        save_json(&history_path(), &inner.data);
    }

    pub fn clear_history(&self) {
        let mut inner = self.inner.lock();
        inner.data.sessions.clear();
        inner.active_session = None;
        save_json(&history_path(), &inner.data);
    }
}

fn iso_now() -> String {
    let secs = epoch_seconds();
    epoch_to_iso(secs)
}

fn epoch_seconds() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
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
    let year: i64 = s[0..4].parse().map_err(|_| ())?;
    let month: i64 = s[5..7].parse().map_err(|_| ())?;
    let day: i64 = s[8..10].parse().map_err(|_| ())?;
    let hour: i64 = s[11..13].parse().map_err(|_| ())?;
    let min: i64 = s[14..16].parse().map_err(|_| ())?;
    let sec: i64 = s[17..19].parse().map_err(|_| ())?;

    let mut days = 0i64;
    for y in 1970..year {
        days += if is_leap(y) { 366 } else { 365 };
    }
    let dims: [i64; 12] = if is_leap(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    for m in 0..(month - 1) as usize {
        days += dims[m];
    }
    days += day - 1;
    Ok(days * 86400 + hour * 3600 + min * 60 + sec)
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
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
            eprintln!("[Monoloth] Failed to create history dir: {}", e);
            return;
        }
    }
    match serde_json::to_string_pretty(data) {
        Ok(json) => {
            let tmp_path = path.with_extension(".tmp");
            if let Err(e) = fs::write(&tmp_path, &json) {
                eprintln!(
                    "[Monoloth] Failed to write history {}: {}",
                    path.display(),
                    e
                );
                return;
            }
            if let Err(e) = fs::rename(&tmp_path, path) {
                eprintln!(
                    "[Monoloth] Failed to rename history {}: {}",
                    path.display(),
                    e
                );
            }
        }
        Err(e) => eprintln!("[Monoloth] Failed to serialize history: {}", e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn test_session_start_is_idempotent() {
        let _lock = TEST_LOCK.lock().unwrap();
        let manager = HistoryManager::new();
        manager.session_start("Default", "opencode", "C:\\proj1");
        manager.session_start("Default", "opencode", "C:\\proj2");
        manager.session_end();
        let data = manager.get_data();
        let last = data.sessions.last().expect("session should be recorded");
        assert_eq!(last.directory, "C:\\proj1");
    }
}
