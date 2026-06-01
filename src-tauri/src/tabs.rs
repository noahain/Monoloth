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
}
