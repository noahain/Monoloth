use crate::history::HistoryManager;
use tauri::State;

#[tauri::command]
pub fn get_history_data(history: State<HistoryManager>) -> serde_json::Value {
    let data = history.get_data();
    serde_json::to_value(data).unwrap_or(serde_json::json!({
        "enabled": true,
        "retention": "30d",
        "sessions": []
    }))
}

#[tauri::command]
pub fn set_history_enabled(history: State<HistoryManager>, enabled: bool) {
    history.set_enabled(enabled);
}

#[tauri::command]
pub fn set_history_retention(history: State<HistoryManager>, retention: String) {
    history.set_retention(&retention);
}

#[tauri::command]
pub fn clear_history(history: State<HistoryManager>) {
    history.clear_history();
}
