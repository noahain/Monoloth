use std::sync::Arc;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TabPosition {
    Top,
    Bottom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabsConfig {
    pub enabled: bool,
    pub position: TabPosition,
    pub active_tab_id: Option<String>,
    pub tabs: Vec<Tab>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    pub id: String,
    pub profile: Option<String>,
    pub pinned: bool,
    pub color: Option<String>,
    pub active_view: String,
    pub dir: Option<String>,
    pub secondary_count: usize,
}

impl Default for TabsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            position: TabPosition::Top,
            active_tab_id: None,
            tabs: Vec::new(),
        }
    }
}

pub struct TabsManager {
    inner: Arc<Mutex<TabsConfig>>,
}

impl Default for TabsManager {
    fn default() -> Self {
        Self { inner: Arc::new(Mutex::new(TabsConfig::default())) }
    }
}

impl Clone for TabsManager {
    fn clone(&self) -> Self {
        Self { inner: Arc::clone(&self.inner) }
    }
}

impl TabsManager {
    pub fn load(&self) -> TabsConfig {
        self.inner.lock().clone()
    }

    pub fn replace(&self, new_cfg: TabsConfig) {
        *self.inner.lock() = new_cfg;
    }

    pub fn add_tab(&self, tab: Tab) -> Result<Tab, String> {
        validate_tab_id(&tab.id)?;
        if let Some(c) = &tab.color {
            validate_color(c)?;
        }
        let mut inner = self.inner.lock();
        if inner.tabs.len() >= 16 {
            return Err("max 16 tabs".to_string());
        }
        if inner.tabs.iter().any(|t| t.id == tab.id) {
            return Err(format!("duplicate id: {}", tab.id));
        }
        inner.tabs.push(tab.clone());
        Ok(tab)
    }

    pub fn remove_tab(&self, tab_id: &str) -> Result<Tab, String> {
        let mut inner = self.inner.lock();
        let pos = inner.tabs.iter().position(|t| t.id == tab_id)
            .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
        let removed = inner.tabs.remove(pos);
        if inner.active_tab_id.as_deref() == Some(tab_id) {
            inner.active_tab_id = inner.tabs.first().map(|t| t.id.clone());
        }
        Ok(removed)
    }

    pub fn reorder(&self, new_order: Vec<String>) -> Result<(), String> {
        let mut inner = self.inner.lock();
        if new_order.len() != inner.tabs.len() {
            return Err(format!("reorder length {} != tabs length {}", new_order.len(), inner.tabs.len()));
        }
        let mut new_tabs = Vec::with_capacity(inner.tabs.len());
        for id in &new_order {
            let t = inner.tabs.iter().find(|t| &t.id == id)
                .ok_or_else(|| format!("unknown tab id: {id}"))?
                .clone();
            new_tabs.push(t);
        }
        inner.tabs = new_tabs;
        Ok(())
    }

    pub fn set_pinned(&self, tab_id: &str, pinned: bool) -> Result<(), String> {
        let mut inner = self.inner.lock();
        let t = inner.tabs.iter_mut().find(|t| t.id == tab_id)
            .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
        t.pinned = pinned;
        Ok(())
    }

    pub fn set_color(&self, tab_id: &str, color: Option<String>) -> Result<(), String> {
        if let Some(c) = &color {
            validate_color(c)?;
        }
        let mut inner = self.inner.lock();
        let t = inner.tabs.iter_mut().find(|t| t.id == tab_id)
            .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
        t.color = color;
        Ok(())
    }

    pub fn set_profile(&self, tab_id: &str, profile: Option<String>, secondary_count: usize) -> Result<(), String> {
        let mut inner = self.inner.lock();
        let t = inner.tabs.iter_mut().find(|t| t.id == tab_id)
            .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
        t.profile = profile;
        t.secondary_count = secondary_count;
        Ok(())
    }

    pub fn set_active_view(&self, tab_id: &str, view: String) -> Result<(), String> {
        let mut inner = self.inner.lock();
        let t = inner.tabs.iter().find(|t| t.id == tab_id)
            .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
        validate_active_view(t, &view)?;
        let t = inner.tabs.iter_mut().find(|t| t.id == tab_id).unwrap();
        t.active_view = view;
        Ok(())
    }

    pub fn set_active_tab_id(&self, tab_id: Option<String>) {
        self.inner.lock().active_tab_id = tab_id;
    }

    pub fn close_tab_creates_default_if_empty(&self, _removed_id: &str) {
        let mut inner = self.inner.lock();
        if inner.tabs.is_empty() {
            inner.tabs.push(make_default_tab());
        }
    }

    pub fn session_ids_for_tab(&self, tab_id: &str) -> Option<Vec<String>> {
        let inner = self.inner.lock();
        let tab = inner.tabs.iter().find(|t| t.id == tab_id)?;
        let mut sids = Vec::with_capacity(1 + tab.secondary_count);
        sids.push(tab.id.clone());
        for i in 0..tab.secondary_count {
            sids.push(format!("{tab_id}__sec{i}"));
        }
        Some(sids)
    }
}

pub fn make_default_tab() -> Tab {
    Tab {
        id: uuid_v4(),
        profile: None,
        pinned: false,
        color: None,
        active_view: "primary".into(),
        dir: None,
        secondary_count: 0,
    }
}

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (nanos & 0xFFFFFFFF) as u32,
        ((nanos >> 32) & 0xFFFF) as u16,
        ((nanos >> 48) & 0xFFF) as u16,
        0x8000 | ((nanos >> 60) & 0x3FFF) as u16,
        (nanos as u128).wrapping_mul(0x9E3779B97F4A7C15) & 0xFFFFFFFFFFFF)
}

const UUID_V4_REGEX: &str = r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

pub fn validate_tab_id(id: &str) -> Result<(), String> {
    if id == "main" || id == "panel" {
        return Err(format!("invalid tab id (reserved name): {id}"));
    }
    if id.contains("__") {
        return Err(format!("invalid tab id (contains reserved delimiter): {id}"));
    }
    if !regex::Regex::new(UUID_V4_REGEX).expect("hardcoded regex").is_match(id) {
        return Err(format!("invalid tab id (not UUID v4): {id}"));
    }
    Ok(())
}

pub fn validate_color(c: &str) -> Result<(), String> {
    if c.len() != 7 || !c.starts_with('#') || !c[1..].chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(format!("invalid color (expected #RRGGBB): {c}"));
    }
    Ok(())
}

pub fn validate_active_view(tab: &Tab, view: &str) -> Result<(), String> {
    if view == "primary" {
        return Ok(());
    }
    if let Some(rest) = view.strip_prefix("secondary:") {
        if let Ok(n) = rest.parse::<usize>() {
            if n < tab.secondary_count {
                return Ok(());
            }
            return Err(format!("secondary index {n} >= secondary_count {}", tab.secondary_count));
        }
    }
    Err(format!("invalid active_view: {view}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_tab(id: &str, secondary_count: usize) -> Tab {
        Tab {
            id: id.into(),
            profile: None,
            pinned: false,
            color: None,
            active_view: "primary".into(),
            dir: None,
            secondary_count,
        }
    }

    #[test]
    fn validate_tab_id_accepts_strict_uuid_v4() {
        let valid = "550e8400-e29b-41d4-a716-446655440000";
        assert!(validate_tab_id(valid).is_ok());

        assert!(validate_tab_id("550e8400-e29b-41d4-a716-44665544000").is_err());
        assert!(validate_tab_id("not-a-uuid").is_err());
        assert!(validate_tab_id("").is_err());
        assert!(validate_tab_id("main").is_err());
        assert!(validate_tab_id("panel").is_err());
        assert!(validate_tab_id("abc__def").is_err());
        assert!(validate_tab_id("550e8400-e29b-41d4-c716-446655440000").is_err());
    }

    #[test]
    fn validate_color_accepts_hex() {
        assert!(validate_color("#ff5555").is_ok());
        assert!(validate_color("#000000").is_ok());
        assert!(validate_color("#FFFFFF").is_ok());
        assert!(validate_color("#fff").is_err());
        assert!(validate_color("ff5555").is_err());
        assert!(validate_color("#ff555g").is_err());
    }

    #[test]
    fn validate_active_view_against_secondary_count() {
        let tab = make_tab("550e8400-e29b-41d4-a716-446655440000", 2);
        assert!(validate_active_view(&tab, "primary").is_ok());
        assert!(validate_active_view(&tab, "secondary:0").is_ok());
        assert!(validate_active_view(&tab, "secondary:1").is_ok());
        assert!(validate_active_view(&tab, "secondary:2").is_err());
        assert!(validate_active_view(&tab, "primary:0").is_err());
        assert!(validate_active_view(&tab, "").is_err());
    }

    #[test]
    fn add_tab_enforces_max_16() {
        let m = TabsManager::default();
        for i in 0..16 {
            let id = format!("550e8400-e29b-41d4-a716-4466554{:05x}", i);
            assert!(m.add_tab(make_tab(&id, 0)).is_ok());
        }
        let overflow = "550e8400-e29b-41d4-a716-446655440010".to_string();
        assert!(m.add_tab(make_tab(&overflow, 0)).is_err());
    }

    #[test]
    fn add_tab_enforces_unique_id() {
        let m = TabsManager::default();
        let id = "550e8400-e29b-41d4-a716-446655440000".to_string();
        assert!(m.add_tab(make_tab(&id, 0)).is_ok());
        assert!(m.add_tab(make_tab(&id, 0)).is_err());
    }

    #[test]
    fn session_ids_for_tab_returns_primary_and_secondaries() {
        let m = TabsManager::default();
        let id = "550e8400-e29b-41d4-a716-446655440000";
        m.add_tab(make_tab(id, 3)).unwrap();
        let sids = m.session_ids_for_tab(id).unwrap();
        assert_eq!(sids, vec![
            id.to_string(),
            format!("{id}__sec0"),
            format!("{id}__sec1"),
            format!("{id}__sec2"),
        ]);
    }

    #[test]
    fn session_ids_for_tab_returns_none_for_unknown_id() {
        let m = TabsManager::default();
        assert!(m.session_ids_for_tab("550e8400-e29b-41d4-a716-446655440000").is_none());
    }

    #[test]
    fn remove_tab_clears_active_if_was_active() {
        let m = TabsManager::default();
        let id1 = "550e8400-e29b-41d4-a716-446655440001";
        let id2 = "550e8400-e29b-41d4-a716-446655440002";
        m.add_tab(make_tab(id1, 0)).unwrap();
        m.add_tab(make_tab(id2, 0)).unwrap();
        m.set_active_tab_id(Some(id1.to_string()));
        m.remove_tab(id1).unwrap();
        let cfg = m.load();
        assert_eq!(cfg.active_tab_id, Some(id2.to_string()));
    }

    #[test]
    fn close_tab_auto_creates_default_when_empty() {
        let m = TabsManager::default();
        let id = "550e8400-e29b-41d4-a716-446655440000";
        m.add_tab(make_tab(id, 0)).unwrap();
        m.remove_tab(id).unwrap();
        m.close_tab_creates_default_if_empty(id);
        let cfg = m.load();
        assert_eq!(cfg.tabs.len(), 1);
        assert_ne!(cfg.tabs[0].id, id);
    }

    #[test]
    fn round_trip_serialization_via_camel_case() {
        let cfg = TabsConfig {
            enabled: true,
            position: TabPosition::Bottom,
            active_tab_id: Some("550e8400-e29b-41d4-a716-446655440000".into()),
            tabs: vec![make_tab("550e8400-e29b-41d4-a716-446655440000", 2)],
        };
        let value = serde_json::to_value(&cfg).unwrap();
        assert_eq!(value["enabled"], true);
        assert_eq!(value["position"], "bottom");
        assert_eq!(value["activeTabId"], "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(value["tabs"][0]["secondaryCount"], 2);
        let back: TabsConfig = serde_json::from_value(value).unwrap();
        assert_eq!(back.position, TabPosition::Bottom);
        assert_eq!(back.tabs[0].secondary_count, 2);
    }
}
