use serde_json::Value;

#[tauri::command]
pub fn get_current_version() -> String {
    env!("CARGO_PKG_VERSION").into()
}

#[tauri::command]
pub fn check_for_updates() -> Result<Value, String> {
    let url = "https://api.github.com/repos/noahain/Monoloth/releases/latest";
    let agent = ureq::AgentBuilder::new()
        .timeout_read(std::time::Duration::from_secs(10))
        .timeout_write(std::time::Duration::from_secs(10))
        .build();
    match agent.get(url).set("User-Agent", "Monoloth-App/0.1.0").call() {
        Ok(response) => {
            let reader = response.into_reader();
            let body: Value = serde_json::from_reader(reader).map_err(|e| format!("Parse error: {}", e))?;
            let tag = body["tag_name"].as_str().unwrap_or("0.1.0");
            let current = env!("CARGO_PKG_VERSION");
            let has_update = compare_versions(tag, current) == std::cmp::Ordering::Greater;
            Ok(serde_json::json!({
                "current": current,
                "latest": tag,
                "hasUpdate": has_update,
                "url": body["html_url"].as_str().unwrap_or("")
            }))
        }
        Err(e) => Err(format!("Failed to check updates: {}", e)),
    }
}

fn compare_versions(v1: &str, v2: &str) -> std::cmp::Ordering {
    let v1_clean = v1.trim_start_matches('v');
    let v2_clean = v2.trim_start_matches('v');

    let parse_part = |s: &str| -> Option<i32> {
        s.split(|c: char| !c.is_ascii_digit())
            .next()
            .and_then(|num| num.parse().ok())
    };

    let v1_parts: Vec<i32> = v1_clean.split('.').filter_map(parse_part).collect();
    let v2_parts: Vec<i32> = v2_clean.split('.').filter_map(parse_part).collect();

    for i in 0..std::cmp::max(v1_parts.len(), v2_parts.len()) {
        let p1 = v1_parts.get(i).cloned().unwrap_or(0);
        let p2 = v2_parts.get(i).cloned().unwrap_or(0);
        if p1 != p2 {
            return p1.cmp(&p2);
        }
    }
    std::cmp::Ordering::Equal
}
