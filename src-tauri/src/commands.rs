use crate::config::AppConfig;
use crate::history::HistoryManager;
use crate::pty::PtyManager;
use serde_json::{Map, Value};
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;
use tauri::Manager;
use tauri::State;

fn expand_env_vars(path: &str) -> String {
    let mut result = String::new();
    let mut chars = path.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let mut var_name = String::new();
            let mut found_closing = false;
            while let Some(&next) = chars.peek() {
                if next == '%' {
                    chars.next();
                    found_closing = true;
                    break;
                }
                var_name.push(next);
                chars.next();
            }
            if found_closing {
                if let Ok(val) = std::env::var(&var_name) {
                    result.push_str(&val);
                } else {
                    result.push('%');
                    result.push_str(&var_name);
                    result.push('%');
                }
            } else {
                result.push('%');
                result.push_str(&var_name);
            }
        } else {
            result.push(c);
        }
    }
    result
}

fn clean_path(path: &str) -> String {
    // Strip \\?\ prefix (Win32 long path) for cleaner display
    let s = if cfg!(windows) && path.starts_with("\\\\?\\") {
        path[4..].to_string()
    } else {
        path.to_string()
    };
    // Also handle UNC paths: \\?\UNC\server\share -> \\server\share
    if s.starts_with("UNC\\") || s.starts_with("unc\\") {
        format!("\\\\{}", &s[4..])
    } else {
        s
    }
}

pub fn resolve_and_split_shell_command(shell_override: Option<&str>, raw: &str) -> (String, Vec<String>) {
    if let Some(s) = shell_override {
        if !s.is_empty() {
            let flag = match s {
                "powershell" | "pwsh" => "-Command",
                "cmd" => "/C",
                _ => "-c",
            };
            return (s.to_string(), vec![flag.to_string(), raw.to_string()]);
        }
    }
    if cfg!(windows) {
        ("cmd".to_string(), vec!["/C".to_string(), raw.to_string()])
    } else {
        ("sh".to_string(), vec!["-c".to_string(), raw.to_string()])
    }
}

fn persist_via_app_config(
    app: &AppHandle,
    tabs: &tauri::State<crate::tabs::TabsManager>,
) -> Result<(), String> {
    let cfg = tabs.load();
    let value = serde_json::to_value(&cfg).map_err(|e| e.to_string())?;
    let app_config = app.state::<AppConfig>();
    app_config.set("tabs_config", value);
    Ok(())
}

fn resolve_profile_for_create(
    config: &tauri::State<AppConfig>,
    requested: Option<&str>,
) -> Result<(Option<String>, String, Option<String>, Vec<SecondaryLite>), String> {
    let name = requested.map(String::from)
        .or_else(|| config.get("active_profile").as_str().map(String::from))
        .unwrap_or_else(|| "Default".to_string());
    let path = crate::config::profile_path(&name);
    let data = std::fs::read_to_string(&path).map_err(|_| format!("profile not found: {name}"))?;
    let v: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    let startup = v.get("startup_command").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let shell_override = v.get("shell_override").and_then(|x| x.as_str()).map(String::from);
    let secondaries = v.get("secondary_commands")
        .and_then(|x| x.as_array())
        .map(|arr| arr.iter().filter_map(|s| serde_json::from_value::<SecondaryLite>(s.clone()).ok()).collect())
        .unwrap_or_default();
    Ok((Some(name), startup, shell_override, secondaries))
}

#[derive(serde::Deserialize)]
struct SecondaryLite {
    #[allow(dead_code)] pub name: String,
    pub command: String,
    #[serde(default)] #[allow(dead_code)] pub enabled: bool,
    #[serde(default, rename = "showIconInTab")] pub show_icon_in_tab: bool,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
pub struct SecondaryCommand {
    pub command: String,
    pub mode: String,
    pub enabled: bool,
}

#[derive(serde::Serialize)]
pub struct DirEntry {
    pub name: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    pub size: u64,
    pub modified: String,
    pub extension: String,
}

#[derive(serde::Serialize)]
pub struct PathInfo {
    pub success: bool,
    pub exists: bool,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    #[serde(rename = "isFile")]
    pub is_file: bool,
    pub absolute: String,
    pub parent: String,
}

#[tauri::command]
pub fn get_path_info(path: String) -> PathInfo {
    let expanded = expand_env_vars(&path);
    eprintln!("[Monoloth][Rust] get_path_info called: {} (expanded: {})", path, expanded);
    let path_buf = PathBuf::from(&expanded);
    let absolute_raw = path_buf.canonicalize().unwrap_or_else(|_| { eprintln!("[Monoloth][Rust] get_path_info: canonicalize failed for {}", expanded); path_buf.clone() });
    let absolute_str = clean_path(&absolute_raw.to_string_lossy());
    let parent = PathBuf::from(&absolute_str).parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    let result = PathInfo {
        success: true,
        exists: path_buf.exists(),
        is_dir: path_buf.is_dir(),
        is_file: path_buf.is_file(),
        absolute: absolute_str,
        parent,
    };
    eprintln!("[Monoloth][Rust] get_path_info result: exists={}, is_dir={}, absolute={}", result.exists, result.is_dir, result.absolute);
    result
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
pub fn pick_directory() -> Option<String> {
    eprintln!("[Monoloth][Rust] pick_directory called (rfd FileDialog)");
    let dialog = rfd::FileDialog::new();
    eprintln!("[Monoloth][Rust] pick_directory: dialog created, calling pick_folder...");
    if let Some(dir) = dialog.pick_folder() {
        let path = dir.to_string_lossy().to_string();
        eprintln!("[Monoloth][Rust] pick_directory returned path: {}", path);
        Some(path)
    } else {
        eprintln!("[Monoloth][Rust] pick_directory returned None (user cancelled or dialog failed)");
        None
    }
}

#[tauri::command]
pub fn pick_file(filter: Option<String>) -> Option<String> {
    eprintln!("[Monoloth][Rust] pick_file called with filter: {:?}", filter);
    let mut dialog = rfd::FileDialog::new();
    if let Some(f) = filter {
        let parts: Vec<&str> = f.split('|').collect();
        if parts.len() >= 2 {
            let label = parts[0];
            let exts: Vec<&str> = parts[1].split(';').collect();
            eprintln!("[Monoloth][Rust] pick_file adding filter: {} -> {:?}", label, exts);
            dialog = dialog.add_filter(label, &exts);
        } else {
            let exts: Vec<&str> = f.split(',').collect();
            eprintln!("[Monoloth][Rust] pick_file adding default filter: {:?}", exts);
            dialog = dialog.add_filter("Files", &exts);
        }
    }
    eprintln!("[Monoloth][Rust] pick_file calling pick_file...");
    if let Some(file) = dialog.pick_file() {
        let path = file.to_string_lossy().to_string();
        eprintln!("[Monoloth][Rust] pick_file returned path: {}", path);
        Some(path)
    } else {
        eprintln!("[Monoloth][Rust] pick_file returned None (user cancelled or dialog failed)");
        None
    }
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let expanded = expand_env_vars(&path);
    eprintln!("[Monoloth][Rust] list_directory called: {} (expanded: {})", path, expanded);
    let path = PathBuf::from(&expanded);
    if !path.exists() {
        eprintln!("[Monoloth][Rust] list_directory: path does not exist: {}", path.display());
        return Err("Directory not found".into());
    }
    eprintln!("[Monoloth][Rust] list_directory: path exists, reading entries...");
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(&path).map_err(|e| format!("Cannot read directory: {}", e))?;
    for entry in read_dir.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
            let size = if is_dir {
                0
            } else {
                entry.metadata().map(|m| m.len()).unwrap_or(0)
            };
            let modified = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| format_time(&t))
                .unwrap_or_default();

            let extension = PathBuf::from(&name)
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();

            entries.push(DirEntry {
                name,
                is_dir,
                size,
                modified,
                extension,
            });
        }

    entries.sort_by(|a, b| {
        a.is_dir.cmp(&b.is_dir).reverse().then(a.name.cmp(&b.name))
    });

    eprintln!("[Monoloth][Rust] list_directory returning {} entries", entries.len());
    Ok(entries)
}

fn format_time(time: &std::time::SystemTime) -> String {
    use std::time::SystemTime;
    let now = SystemTime::now();
    if let Ok(dur) = now.duration_since(*time) {
        let days = dur.as_secs() / 86400;
        if days == 0 {
            let hours = dur.as_secs() / 3600;
            if hours == 0 {
                let mins = dur.as_secs() / 60;
                format!("{}m ago", mins)
            } else {
                format!("{}h ago", hours)
            }
        } else if days < 365 {
            format!("{}d ago", days)
        } else {
            format!("{}y ago", days / 365)
        }
    } else {
        "just now".into()
    }
}

#[derive(serde::Serialize)]
pub struct DriveInfo {
    pub letter: String,
    pub label: String,
}

#[tauri::command]
pub fn get_drives() -> Vec<DriveInfo> {
    #[cfg(windows)]
    {
        let mut drives = Vec::new();
        let drives_mask = unsafe { winapi::um::fileapi::GetLogicalDrives() };
        if drives_mask == 0 {
            return drives;
        }
        for i in 0..26 {
            if drives_mask & (1 << i) != 0 {
                let letter = (b'A' + i as u8) as char;
                let letter_str = format!("{}:", letter);
                let label = get_volume_label(&letter_str).unwrap_or_default();
                drives.push(DriveInfo {
                    letter: letter_str,
                    label,
                });
            }
        }
        drives
    }
    #[cfg(not(windows))]
    {
        vec![DriveInfo {
            letter: "/".into(),
            label: "Root".into(),
        }]
    }
}

#[cfg(windows)]
fn get_volume_label(drive: &str) -> Option<String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    let drive_path: Vec<u16> = OsStr::new(&format!("{}\\", drive))
        .encode_wide()
        .chain(Some(0))
        .collect();
    let mut buf = [0u16; 261];
    let result = unsafe {
        winapi::um::fileapi::GetVolumeInformationW(
            drive_path.as_ptr(),
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0,
        )
    };
    if result != 0 {
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..len]))
    } else {
        None
    }
}

#[tauri::command]
pub fn get_file_preview(path: String) -> Result<FilePreview, String> {
    let expanded = expand_env_vars(&path);
    let path = PathBuf::from(&expanded);
    if !path.exists() || !path.is_file() {
        return Err("File not found".into());
    }

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let image_exts = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"];
    if !ext.is_empty() && image_exts.contains(&ext.as_str()) {
        let data_url = read_image_as_data_url(path.to_string_lossy().to_string())?;
        return Ok(FilePreview::Image(data_url));
    }

    let text_exts = [
        "txt", "md", "json", "toml", "yaml", "yml", "js", "ts", "tsx", "jsx",
        "py", "rs", "go", "css", "html", "xml", "csv", "sh", "bat", "ps1",
        "cfg", "ini", "conf", "log",
    ];
    if ext.is_empty() || text_exts.contains(&ext.as_str()) {
        let file = fs::File::open(&path).map_err(|e| format!("Cannot open file: {}", e))?;
        let mut bytes = Vec::new();
        let mut limited = file.take(4096);
        limited.read_to_end(&mut bytes).map_err(|e| format!("Cannot read file: {}", e))?;
        let content = String::from_utf8_lossy(&bytes).to_string();
        return Ok(FilePreview::Text(content));
    }

    Err("Unsupported file type".into())
}

#[derive(serde::Serialize)]
pub enum FilePreview {
    Image(String),
    Text(String),
}

#[tauri::command]
pub fn start_terminal(
    pty: State<PtyManager>,
    config: State<AppConfig>,
    history: State<HistoryManager>,
    session_id: String,
    directory: String,
    record_history: Option<bool>,
    shell: Option<String>,
    cols: u16,
    rows: u16,
    profile: Option<String>,
) -> Result<u64, String> {
    let record = record_history.unwrap_or(true);
    let is_panel = session_id == "panel" || session_id.ends_with("__panel");

    if is_panel {
        let shell_exe = match shell.as_deref().unwrap_or("cmd") {
            "powershell" | "pwsh" => "powershell",
            _ => "cmd",
        };
        let (cmd, args) = resolve_command(shell_exe)?;
        let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let gen = pty.spawn(&session_id, &cmd, &args_str, &expand_env_vars(&directory), cols, rows)?;

        let active_profile = config.get_active_profile();
        if record {
            history.session_start(&active_profile, &format!("[Panel] {}", shell_exe), &directory);
        }
        return Ok(gen);
    }

    let profile_name = profile.as_deref().unwrap_or("Default");
    let get = |key: &str| config.get_for_profile(profile_name, key);
    let startup_cmd = get("startup_command").as_str().unwrap_or("opencode").to_string();
    let cmd_type = get("startup_command_type").as_str().unwrap_or("preset").to_string();
    let active_profile = profile_name.to_string();

    let directory = expand_env_vars(&directory);

    let (cmd, args): (String, Vec<String>) = if cmd_type == "custom" {
        resolve_custom_command(&startup_cmd)?
    } else {
        resolve_command(&startup_cmd)?
    };

    if record {
        let display_command = if cmd_type == "custom" { &startup_cmd } else { &startup_cmd };
        history.session_start(&active_profile, display_command, &directory);
    }

    if session_id == "main" {
        let secondary = config.get("secondary_commands");
        if let Value::Array(cmds) = &secondary {
            for cmd_val in cmds {
                if let Some(cmd_obj) = cmd_val.as_object() {
                    if let Some(enabled) = cmd_obj.get("enabled").and_then(|v| v.as_bool()) {
                        if enabled {
                            if let Some(cmd_str) = cmd_obj.get("command").and_then(|v| v.as_str()) {
                                match cmd_obj.get("mode").and_then(|v| v.as_str()) {
                                    Some("before") => {
                                        let _ = run_before_command(cmd_str, &directory);
                                    }
                                    Some("parallel") => {
                                        let _ = run_parallel_command(cmd_str.to_string(), directory.clone());
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let gen = pty.spawn(&session_id, &cmd, &args_str, &directory, cols, rows)?;

    Ok(gen)
}

fn resolve_command(preset: &str) -> Result<(String, Vec<String>), String> {
    match preset {
        "opencode" => {
            let path = find_opencode()?;
            if cfg!(windows) && path.ends_with(".cmd") {
                Ok(("cmd".into(), vec!["/C".into(), path]))
            } else {
                Ok((path, vec![]))
            }
        }
        other => {
            // On Windows, wrap preset commands in cmd /C since they may be .cmd files
            if cfg!(windows) {
                Ok(("cmd".into(), vec!["/C".into(), other.to_string()]))
            } else {
                Ok((other.to_string(), vec![]))
            }
        }
    }
}

fn resolve_custom_command(cmd_line: &str) -> Result<(String, Vec<String>), String> {
    let parts = shlex::split(cmd_line).ok_or_else(|| "Failed to parse command line".to_string())?;
    if parts.is_empty() {
        return Err("Empty command".into());
    }
    let exe = &parts[0];

    if cfg!(windows) && (exe.ends_with(".cmd") || exe.ends_with(".bat")) {
        let args: Vec<String> = std::iter::once("/C".to_string())
            .chain(std::iter::once(exe.to_string()))
            .chain(parts[1..].iter().cloned())
            .collect();
        return Ok(("cmd".into(), args));
    }

    Ok((exe.to_string(), parts[1..].to_vec()))
}

fn find_opencode() -> Result<String, String> {
    // Try `where opencode` first
    if let Ok(output) = Command::new("where").arg("opencode").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout);
            if let Some(first) = path.lines().next() {
                let trimmed = first.trim().to_string();
                // If it's a .cmd, return as-is (caller wraps with cmd /C)
                return Ok(trimmed);
            }
        }
    }

    // Check npm global paths
    let npm_paths = [
        "C:\\Program Files\\nodejs\\opencode.cmd",
        "C:\\Program Files\\nodejs\\opencode.exe",
    ];
    for p in &npm_paths {
        if PathBuf::from(p).exists() {
            return Ok(p.to_string());
        }
    }

    // Try npm prefix -g
    if let Ok(output) = Command::new("cmd")
        .args(["/C", "npm", "prefix", "-g"])
        .output()
    {
        if output.status.success() {
            let prefix = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let cmd_path = format!("{}\\opencode.cmd", prefix);
            if PathBuf::from(&cmd_path).exists() {
                return Ok(cmd_path);
            }
            let exe_path = format!("{}\\opencode.exe", prefix);
            if PathBuf::from(&exe_path).exists() {
                return Ok(exe_path);
            }
        }
    }

    // Try yarn global bin
    if let Ok(output) = Command::new("cmd").args(["/C", "yarn", "global", "bin"]).output() {
        if output.status.success() {
            let bin_dir = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let cmd_path = format!("{}\\opencode.cmd", bin_dir);
            if PathBuf::from(&cmd_path).exists() {
                return Ok(cmd_path);
            }
        }
    }

    // Fallback: try running opencode directly (might be in PATH as .exe)
    Ok("opencode".into())
}

fn run_before_command(cmd: &str, cwd: &str) -> Result<String, String> {
    let child = if cfg!(windows) {
        Command::new("cmd")
            .args(["/C", cmd])
            .current_dir(cwd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
    } else {
        Command::new("sh")
            .args(["-c", cmd])
            .current_dir(cwd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
    };

    let mut child = match child {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to spawn: {}", e)),
    };

    // Take stdout/stderr before the polling loop to prevent pipe buffer deadlock.
    // If the child writes more than the OS pipe buffer (4-64KB) and we don't
    // read, the child blocks on write and try_wait() never returns Some.
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let out_thread = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(mut out) = stdout {
            let _ = out.read_to_string(&mut buf);
        }
        buf
    });
    let err_thread = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(mut err) = stderr {
            let _ = err.read_to_string(&mut buf);
        }
        buf
    });

    let timeout = std::time::Duration::from_secs(30);
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = out_thread.join().unwrap_or_default();
                let stderr = err_thread.join().unwrap_or_default();
                if !status.success() {
                    return Err(format!("Command exited with code: {:?}", status.code()));
                }
                return Ok(format!("{}{}", stdout, stderr));
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    return Err("Before command timed out after 30s".into());
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(e) => return Err(format!("Failed to wait: {}", e)),
        }
    }
}

#[tauri::command]
pub fn run_parallel_command(cmd: String, cwd: String) -> Result<bool, String> {
    if cfg!(windows) {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;
        Command::new("cmd")
            .args(["/C", &cmd])
            .current_dir(&cwd)
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map_err(|e| format!("Failed to spawn: {}", e))?;
    } else {
        Command::new("sh")
            .args(["-c", &cmd])
            .current_dir(&cwd)
            .spawn()
            .map_err(|e| format!("Failed to spawn: {}", e))?;
    }
    Ok(true)
}

#[tauri::command]
pub fn send_input(pty: State<PtyManager>, session_id: String, data: String) -> Result<(), String> {
    pty.write_input(&session_id, &data)
}

#[tauri::command]
pub fn resize_terminal(pty: State<PtyManager>, session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    pty.resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn terminate_terminal(pty: State<PtyManager>, history: State<HistoryManager>, session_id: Option<String>) {
    let sid = session_id.unwrap_or_else(|| "main".to_string());
    if sid == "main" {
        history.session_end();
        // Also terminate the panel session if active, to prevent stale
        // pty-output events from interfering with a new session.
        pty.terminate("panel");
    }
    pty.terminate(&sid);
}

#[tauri::command]
pub fn end_history_session(history: State<HistoryManager>) {
    history.session_end();
}

#[tauri::command]
pub fn record_history_activity(
    history: State<HistoryManager>,
    activity_type: String,
    payload: serde_json::Value,
) {
    history.record_activity(&activity_type, payload);
}

#[tauri::command]
pub fn terminate_tab_sessions(pty: State<PtyManager>, tab_id: String) {
    pty.terminate_tab(&tab_id);
}

#[tauri::command]
pub fn get_current_version() -> String {
    env!("CARGO_PKG_VERSION").into()
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

#[tauri::command]
pub fn read_image_as_data_url(image_path: String) -> Result<String, String> {
    let expanded = expand_env_vars(&image_path);
    eprintln!("[Monoloth][Rust] read_image_as_data_url called: {} (expanded: {})", image_path, expanded);
    let path = PathBuf::from(&expanded);
    if !path.exists() {
        eprintln!("[Monoloth][Rust] read_image_as_data_url: file not found");
        return Err("Image file not found".into());
    }
    eprintln!("[Monoloth][Rust] read_image_as_data_url: file exists, reading...");
    let bytes = fs::read(&path).map_err(|e| format!("Cannot read file: {}", e))?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mime_type = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    };
    let encoded = base64_encode(&bytes);
    Ok(format!("data:{};base64,{}", mime_type, encoded))
}

fn base64_encode(bytes: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

#[tauri::command]
pub fn analyze_image_brightness(image_path: String) -> Result<f64, String> {
    let expanded = expand_env_vars(&image_path);
    let img = image::open(&expanded).map_err(|e| format!("Cannot open image: {}", e))?;
    let thumb = img.thumbnail(64, 64);
    let rgba = thumb.to_rgba8();

    let mut total: u64 = 0;
    let mut count: u64 = 0;

    for pixel in rgba.pixels() {
        let r = pixel[0] as u64;
        let g = pixel[1] as u64;
        let b = pixel[2] as u64;
        let luminance = (299 * r + 587 * g + 114 * b) / 1000;
        total += luminance;
        count += 1;
    }

    if count == 0 {
        return Ok(0.0);
    }

    Ok(total as f64 / count as f64 / 255.0)
}

#[tauri::command]
pub fn get_profiles(config: State<AppConfig>) -> Value {
    let profiles = config.list_profiles();
    let active = config.get_active_profile();
    serde_json::json!({
        "profiles": profiles,
        "active": active
    })
}

#[tauri::command]
pub fn create_profile(config: State<AppConfig>, name: String) {
    config.create_profile(&name);
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
    config.set("bg_type", Value::String(bg_type));
    if let Some(v) = bg_image { config.set("bg_image", Value::String(v)); }
    if let Some(v) = bg_color { config.set("bg_color", Value::String(v)); }
    if let Some(v) = bg_gradient { config.set("bg_gradient", Value::String(v)); }
    if let Some(v) = bg_transparency {
        let clamped = v.max(0.0).min(100.0);
        config.set("bg_transparency", Value::Number(serde_json::Number::from_f64(clamped).unwrap_or(100.into())));
    }
    if let Some(v) = theme_mode { config.set("theme_mode", Value::String(v)); }
    if let Some(v) = cta_button_style { config.set("cta_button_style", Value::String(v)); }
    if let Some(v) = bg_layer { config.set("bg_layer", Value::String(v)); }
}

#[tauri::command]
pub fn delete_profile(config: State<AppConfig>, name: String) {
    config.delete_profile(&name);
}

#[tauri::command]
pub fn switch_profile(config: State<AppConfig>, name: String) {
    config.switch_profile(&name);
}

#[tauri::command]
pub fn rename_profile(config: State<AppConfig>, old: String, new: String) -> Result<bool, String> {
    config.rename_profile(&old, &new)?;
    Ok(true)
}

#[tauri::command]
pub fn get_profile_config(config: State<AppConfig>) -> Map<String, Value> {
    config.get_all()
}

#[tauri::command]
pub fn set_profile_setting(config: State<AppConfig>, key: String, value: Value) {
    config.set(&key, value);
}

#[tauri::command]
pub fn toggle_custom_titlebar(app: tauri::AppHandle, config: State<AppConfig>, enable: bool) {
    let window = app.get_webview_window("main").unwrap();
    if enable {
        if let Ok(pos) = window.outer_position() {
            config.set("window_x", serde_json::Value::Number(pos.x.into()));
            config.set("window_y", serde_json::Value::Number(pos.y.into()));
        }
    }
    window.set_decorations(!enable).ok();
    config.set("use_custom_titlebar", Value::Bool(enable));
}

#[tauri::command]
pub fn minimize_window(app: tauri::AppHandle) {
    app.get_webview_window("main").unwrap().minimize().ok();
}

#[tauri::command]
pub fn toggle_maximize_window(app: tauri::AppHandle, config: State<AppConfig>) -> Result<bool, String> {
    let window = app.get_webview_window("main").unwrap();
    let maximized = window.is_maximized().unwrap_or(false);
    if maximized {
        window.unmaximize().map_err(|e| e.to_string())?;
        if let (Some(x), Some(y)) = (
            config.get("window_x").as_i64(),
            config.get("window_y").as_i64()
        ) {
            window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition { x: x as i32, y: y as i32 }
            )).ok();
        }
        config.set("window_maximized", Value::Bool(false));
    } else {
        if let Ok(pos) = window.outer_position() {
            config.set("window_x", serde_json::Value::Number(pos.x.into()));
            config.set("window_y", serde_json::Value::Number(pos.y.into()));
        }
        window.maximize().map_err(|e| e.to_string())?;
        config.set("window_maximized", Value::Bool(true));
    }
    Ok(!maximized)
}

#[tauri::command]
pub fn close_window(app: tauri::AppHandle) {
    app.get_webview_window("main").unwrap().close().ok();
}

#[tauri::command]
pub fn is_window_maximized(app: tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}

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

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<bool, String> {
    let expanded = expand_env_vars(&path);
    let path_buf = PathBuf::from(&expanded);
    if !path_buf.exists() {
        return Err("Path does not exist".into());
    }
    if path_buf.is_dir() {
        Command::new("explorer")
            .arg(path_buf.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    } else {
        Command::new("explorer")
            .args([
                "/select,",
                &path_buf.to_string_lossy().to_string(),
            ])
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    Ok(true)
}

#[tauri::command]
pub fn execute_background(command: String, cwd: String) -> Result<bool, String> {
    let expanded_cwd = expand_env_vars(&cwd);
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    Command::new("cmd")
        .args(["/C", &command])
        .current_dir(&expanded_cwd)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to spawn: {}", e))?;
    Ok(true)
}

#[tauri::command]
pub fn open_external_terminal(command: String, cwd: String) -> Result<bool, String> {
    let expanded_cwd = expand_env_vars(&cwd);
    let escaped = command.replace('"', "^\"");
    let inner = format!("start \"\" cmd.exe /K \"{}\"", escaped);
    use std::os::windows::process::CommandExt;
    Command::new("cmd")
        .arg("/C")
        .raw_arg(&inner)
        .current_dir(&expanded_cwd)
        .spawn()
        .map_err(|e| format!("Failed to open terminal: {}", e))?;
    Ok(true)
}

// ===== Tabs commands (Unit C) =====

#[tauri::command]
pub fn get_tabs_config(tabs: tauri::State<crate::tabs::TabsManager>) -> crate::tabs::TabsConfig {
    tabs.load()
}

#[tauri::command]
pub fn set_tabs_config(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    cfg: crate::tabs::TabsConfig,
) -> Result<(), String> {
    if cfg.tabs.len() > 16 {
        return Err("max 16 tabs".into());
    }
    for t in &cfg.tabs {
        crate::tabs::validate_tab_id(&t.id)?;
        if let Some(c) = &t.color {
            crate::tabs::validate_color(c)?;
        }
        crate::tabs::validate_active_view(t, &t.active_view)?;
    }
    tabs.replace(cfg);
    persist_via_app_config(&app, &tabs)
}

#[tauri::command]
pub fn create_tab(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
    tab_id: String,
    profile: Option<String>,
    dir: Option<String>,
    cols: u16,
    rows: u16,
    view: Option<String>,
) -> Result<(crate::tabs::Tab, Vec<(String, u64)>), String> {
    crate::tabs::validate_tab_id(&tab_id)?;
    let view_value = view.as_deref().unwrap_or("terminal");
    if view_value != "terminal" && view_value != "landing" {
        return Err(format!("invalid view: {view_value}"));
    }

    if view_value == "landing" {
        let tab = crate::tabs::Tab {
            id: tab_id.clone(),
            profile: None,
            pinned: false,
            color: None,
            active_view: "primary".into(),
            dir: None,
            secondary_count: 0,
            view: "landing".into(),
        };
        tabs.add_tab(tab.clone())?;
        persist_via_app_config(&app, &tabs)?;
        return Ok((tab, Vec::new()));
    }

    let (prof_name, startup_command, shell_override, secondaries) =
        resolve_profile_for_create(&config, profile.as_deref())?;
    let cwd = dir.clone()
        .or_else(|| config.get("last_directory").as_str().map(String::from))
        .unwrap_or_else(|| ".".to_string());
    let (shell, args) = resolve_and_split_shell_command(shell_override.as_deref(), &startup_command);
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let mut spawned: Vec<(String, u64)> = Vec::new();
    let primary_gen = pty.spawn(&tab_id, &shell, &args_ref, &cwd, cols, rows)?;
    spawned.push((tab_id.clone(), primary_gen));
    let _ = history.session_start(&prof_name.clone().unwrap_or_else(|| "Default".to_string()), &startup_command, &cwd);

    let mut secondary_count = 0usize;
    for sec in secondaries {
        if !sec.show_icon_in_tab { continue; }
        let sid = format!("{tab_id}__sec{secondary_count}");
        let (s, a) = resolve_and_split_shell_command(shell_override.as_deref(), &sec.command);
        let a_ref: Vec<&str> = a.iter().map(|s| s.as_str()).collect();
        match pty.spawn(&sid, &s, &a_ref, &cwd, cols, rows) {
            Ok(g) => {
                spawned.push((sid, g));
                let _ = history.session_start(&prof_name.clone().unwrap_or_else(|| "Default".to_string()), &sec.command, &cwd);
            }
            Err(e) => {
                for (killed_sid, _) in spawned.drain(..) {
                    let _ = pty.terminate(&killed_sid);
                }
                return Err(e);
            }
        }
        secondary_count += 1;
    }

    let tab = crate::tabs::Tab {
        id: tab_id.clone(),
        profile: prof_name,
        pinned: false,
        color: None,
        active_view: "primary".into(),
        dir,
        secondary_count,
        view: "terminal".into(),
    };

    if let Err(e) = tabs.add_tab(tab.clone()) {
        for (killed_sid, _) in spawned.drain(..) {
            let _ = pty.terminate(&killed_sid);
        }
        return Err(e);
    }

    persist_via_app_config(&app, &tabs)?;

    Ok((tab, spawned))
}

#[tauri::command]
pub fn close_tab(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    tab_id: String,
    force: bool,
) -> Result<(), String> {
    let tab = {
        let inner = tabs.load();
        inner.tabs.iter().find(|t| t.id == tab_id).cloned()
    };
    let tab = tab.ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
    if tab.pinned && !force {
        return Err("tab is pinned".into());
    }

    let sids = tabs.session_ids_for_tab(&tab_id)
        .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
    for sid in &sids {
        pty.terminate(sid);
    }
    history.session_end();
    tabs.remove_tab(&tab_id)?;
    tabs.close_tab_creates_default_if_empty(&tab_id);
    persist_via_app_config(&app, &tabs)?;
    Ok(())
}

#[tauri::command]
pub fn restore_tab_sessions(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
) -> Result<(Vec<crate::tabs::Tab>, Vec<(String, u64)>), String> {
    let cfg = tabs.load();
    let mut out_tabs = Vec::new();
    let mut out_sessions: Vec<(String, u64)> = Vec::new();
    for tab in &cfg.tabs {
        if tab.view == "landing" {
            out_tabs.push(tab.clone());
            continue;
        }
        let cols: u16 = 80;
        let rows: u16 = 24;
        let cwd = tab.dir.clone()
            .or_else(|| config.get("last_directory").as_str().map(String::from))
            .unwrap_or_else(|| ".".to_string());
        let (prof_name, startup, shell_override, secondaries) = if let Some(p) = &tab.profile {
            let path = crate::config::profile_path(p);
            match std::fs::read_to_string(&path)
                .ok()
                .and_then(|d| serde_json::from_str::<serde_json::Value>(&d).ok())
            {
                Some(v) => {
                    let s = v.get("startup_command").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let sh = v.get("shell_override").and_then(|x| x.as_str()).map(String::from);
                    let secs = v.get("secondary_commands")
                        .and_then(|x| x.as_array())
                        .map(|arr| arr.iter().filter_map(|x| serde_json::from_value::<SecondaryLite>(x.clone()).ok()).collect())
                        .unwrap_or_default();
                    (Some(p.clone()), s, sh, secs)
                }
                None => (None, String::new(), None, Vec::new()),
            }
        } else {
            (None, String::new(), None, Vec::new())
        };

        let (shell, args) = resolve_and_split_shell_command(shell_override.as_deref(), &startup);
        let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        if let Ok(gen) = pty.spawn(&tab.id, &shell, &args_ref, &cwd, cols, rows) {
            out_sessions.push((tab.id.clone(), gen));
            let _ = history.session_start(&prof_name.clone().unwrap_or_else(|| "Default".to_string()), &startup, &cwd);
        }
        let mut i = 0usize;
        for sec in secondaries.iter().take(tab.secondary_count) {
            if !sec.show_icon_in_tab { continue; }
            let sid = format!("{tab_id}__sec{i}", tab_id = tab.id);
            let (s, a) = resolve_and_split_shell_command(shell_override.as_deref(), &sec.command);
            let a_ref: Vec<&str> = a.iter().map(|s| s.as_str()).collect();
            if let Ok(gen) = pty.spawn(&sid, &s, &a_ref, &cwd, cols, rows) {
                out_sessions.push((sid, gen));
                let _ = history.session_start(&prof_name.clone().unwrap_or_else(|| "Default".to_string()), &sec.command, &cwd);
            }
            i += 1;
        }
        let _ = prof_name;
        out_tabs.push(tab.clone());
    }
    let _ = app;
    Ok((out_tabs, out_sessions))
}

#[tauri::command]
pub fn set_tab_active_view(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    tab_id: String,
    view: String,
) -> Result<(), String> {
    tabs.set_active_view(&tab_id, view)?;
    persist_via_app_config(&app, &tabs)
}

#[tauri::command]
pub fn set_active_tab(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    tab_id: String,
) -> Result<(), String> {
    let cfg = tabs.load();
    if !cfg.tabs.iter().any(|t| t.id == tab_id) {
        return Err(format!("unknown tab id: {tab_id}"));
    }
    tabs.set_active_tab_id(Some(tab_id));
    persist_via_app_config(&app, &tabs)
}

#[tauri::command]
pub fn set_tab_pinned(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    tab_id: String,
    pinned: bool,
) -> Result<(), String> {
    tabs.set_pinned(&tab_id, pinned)?;
    persist_via_app_config(&app, &tabs)
}

#[tauri::command]
pub fn set_tab_color(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    tab_id: String,
    color: Option<String>,
) -> Result<(), String> {
    tabs.set_color(&tab_id, color)?;
    persist_via_app_config(&app, &tabs)
}

#[tauri::command]
pub fn set_tab_profile(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
    tab_id: String,
    profile: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(crate::tabs::Tab, Vec<(String, u64)>), String> {
    let tab = {
        let inner = tabs.load();
        inner.tabs.iter().find(|t| t.id == tab_id).cloned()
    };
    let tab = tab.ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
    if let Some(sids) = tabs.session_ids_for_tab(&tab_id) {
        for sid in &sids {
            pty.terminate(sid);
        }
    }
    history.session_end();
    let (prof_name, startup, shell_override, secondaries) = resolve_profile_for_create(&config, profile.as_deref())?;
    let cwd = tab.dir.clone()
        .or_else(|| config.get("last_directory").as_str().map(String::from))
        .unwrap_or_else(|| ".".to_string());
    let (shell, args) = resolve_and_split_shell_command(shell_override.as_deref(), &startup);
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let mut spawned: Vec<(String, u64)> = Vec::new();
    if let Ok(g) = pty.spawn(&tab_id, &shell, &args_ref, &cwd, cols, rows) {
        spawned.push((tab_id.clone(), g));
        let _ = history.session_start(&prof_name.clone().unwrap_or_else(|| "Default".to_string()), &startup, &cwd);
    }
    let mut secondary_count = 0usize;
    for sec in secondaries {
        if !sec.show_icon_in_tab { continue; }
        let sid = format!("{tab_id}__sec{secondary_count}");
        let (s, a) = resolve_and_split_shell_command(shell_override.as_deref(), &sec.command);
        let a_ref: Vec<&str> = a.iter().map(|s| s.as_str()).collect();
        if let Ok(g) = pty.spawn(&sid, &s, &a_ref, &cwd, cols, rows) {
            spawned.push((sid, g));
            let _ = history.session_start(&prof_name.clone().unwrap_or_else(|| "Default".to_string()), &sec.command, &cwd);
        }
        secondary_count += 1;
    }
    tabs.set_profile(&tab_id, prof_name, secondary_count)?;
    persist_via_app_config(&app, &tabs)?;
    let updated = tabs.load().tabs.iter().find(|t| t.id == tab_id).cloned().unwrap();
    Ok((updated, spawned))
}

#[tauri::command]
pub fn reorder_tabs(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    new_order: Vec<String>,
) -> Result<(), String> {
    tabs.reorder(new_order)?;
    persist_via_app_config(&app, &tabs)
}

#[tauri::command]
pub async fn refresh_tab(
    app: AppHandle,
    tabs: tauri::State<'_, crate::tabs::TabsManager>,
    pty: tauri::State<'_, PtyManager>,
    history: tauri::State<'_, HistoryManager>,
    config: tauri::State<'_, AppConfig>,
    tab_id: String,
    cols: u16,
    rows: u16,
) -> Result<(crate::tabs::Tab, Vec<(String, u64)>), String> {
    set_tab_profile(
        app,
        tabs,
        pty,
        history,
        config,
        tab_id,
        None,
        cols,
        rows,
    )
}

#[tauri::command]
pub fn get_profile_config_by_name(
    config: tauri::State<AppConfig>,
    name: String,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let _ = config;
    let path = crate::config::profile_path(&name);
    let data = std::fs::read_to_string(&path).map_err(|_| format!("profile not found: {name}"))?;
    let v: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    match v {
        serde_json::Value::Object(m) => Ok(m),
        _ => Err("profile is not a JSON object".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_and_split_shell_command_uses_cmd_on_windows() {
        let (shell, args) = resolve_and_split_shell_command(None, "echo hello");
        assert_eq!(shell, "cmd");
        assert!(args.windows(2).any(|w| w == ["/C", "echo hello"]));
    }

    #[test]
    fn resolve_and_split_uses_override_when_provided() {
        let (shell, args) = resolve_and_split_shell_command(Some("pwsh"), "Get-Process");
        assert_eq!(shell, "pwsh");
        assert_eq!(args, vec!["-Command", "Get-Process"]);
    }

    #[test]
    fn resolve_and_split_handles_unparseable_as_raw() {
        let (_, args) = resolve_and_split_shell_command(None, "'unbalanced");
        // When shlex fails, the raw command is passed as a single arg
        assert_eq!(args.last().unwrap(), "'unbalanced");
    }
}
