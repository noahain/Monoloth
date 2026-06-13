use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use log::debug;

use super::image::read_image_as_data_url;
use super::{clean_path, expand_env_vars, parse_path};

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

#[derive(serde::Serialize)]
pub enum FilePreview {
    Image(String),
    Text(String),
}

#[derive(serde::Serialize)]
pub struct DriveInfo {
    pub letter: String,
    pub label: String,
}

#[tauri::command]
pub fn get_path_info(path: String) -> PathInfo {
    let expanded = expand_env_vars(&path);
    let path_buf = PathBuf::from(&expanded);
    let absolute_raw = path_buf.canonicalize().unwrap_or_else(|_| path_buf.clone());
    let absolute_str = clean_path(&absolute_raw.to_string_lossy());
    let absolute = if PathBuf::from(&absolute_str).is_absolute() {
        absolute_str.clone()
    } else {
        std::env::current_dir()
            .map(|cwd| clean_path(&cwd.join(&absolute_str).to_string_lossy()))
            .unwrap_or(absolute_str.clone())
    };
    let parent = PathBuf::from(&absolute).parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    PathInfo {
        success: path_buf.exists(),
        exists: path_buf.exists(),
        is_dir: path_buf.is_dir(),
        is_file: path_buf.is_file(),
        absolute,
        parent,
    }
}

#[tauri::command]
pub fn pick_directory() -> Option<String> {
    debug!("pick_directory called");
    let dialog = rfd::FileDialog::new();
    if let Some(dir) = dialog.pick_folder() {
        let path = dir.to_string_lossy().to_string();
        debug!("pick_directory returned path: {}", path);
        Some(path)
    } else {
        debug!("pick_directory returned None");
        None
    }
}

#[tauri::command]
pub fn pick_file(filter: Option<String>) -> Option<String> {
    debug!("pick_file called with filter: {:?}", filter);
    let mut dialog = rfd::FileDialog::new();
    if let Some(f) = filter {
        let parts: Vec<&str> = f.split('|').collect();
        if parts.len() >= 2 {
            let label = parts[0];
            let exts: Vec<&str> = parts[1].split(';')
                .map(|s| s.trim_start_matches("*.").trim_start_matches("."))
                .collect();
            debug!("pick_file adding filter: {} -> {:?}", label, exts);
            dialog = dialog.add_filter(label, &exts);
        } else {
            let exts: Vec<&str> = f.split(',')
                .map(|s| s.trim_start_matches("*.").trim_start_matches("."))
                .collect();
            debug!("pick_file adding default filter: {:?}", exts);
            dialog = dialog.add_filter("Files", &exts);
        }
    }
    if let Some(file) = dialog.pick_file() {
        let path = file.to_string_lossy().to_string();
        debug!("pick_file returned path: {}", path);
        Some(path)
    } else {
        debug!("pick_file returned None");
        None
    }
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let expanded = expand_env_vars(&path);
    debug!("list_directory called: {} (expanded: {})", path, expanded);
    let path = PathBuf::from(&expanded);
    if !path.exists() {
        debug!("list_directory: path does not exist: {}", path.display());
        return Err("Directory not found".into());
    }
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(&path).map_err(|e| format!("Cannot read directory: {}", e))?;
    for entry in read_dir.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let meta = entry.metadata();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = if is_dir {
            0
        } else {
            meta.as_ref().map(|m| m.len()).unwrap_or(0)
        };
        let modified = meta.ok()
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
        a.is_dir.cmp(&b.is_dir).reverse().then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    debug!("list_directory returning {} entries", entries.len());
    Ok(entries)
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

#[tauri::command]
pub fn get_file_preview(path: String) -> Result<FilePreview, String> {
    let path = parse_path(&path);
    if !path.exists() || !path.is_file() {
        return Err("File not found".into());
    }

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let image_exts = ["jpg", "jpeg", "png", "gif", "bmp", "webp"];
    if ext == "svg" {
        let content = fs::read_to_string(&path).map_err(|e| format!("Cannot read file: {}", e))?;
        return Ok(FilePreview::Text(content));
    }
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
        let valid_len = match std::str::from_utf8(&bytes) {
            Ok(_) => bytes.len(),
            Err(e) => e.valid_up_to(),
        };
        let content = String::from_utf8_lossy(&bytes[..valid_len]).to_string();
        return Ok(FilePreview::Text(content));
    }

    Err("Unsupported file type".into())
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<bool, String> {
    let path_buf = parse_path(&path);
    if !path_buf.exists() {
        return Err("Path does not exist".into());
    }
    #[cfg(windows)]
    {
        if path_buf.is_dir() {
            Command::new("explorer")
                .arg(path_buf.to_string_lossy().to_string())
                .spawn()
                .map_err(|e| format!("Failed to open explorer: {}", e))?;
        } else {
            use std::os::windows::process::CommandExt;
            Command::new("explorer")
                .raw_arg(format!("/select,\"{}\"", path_buf.to_string_lossy()))
                .spawn()
                .map_err(|e| format!("Failed to open explorer: {}", e))?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        if path_buf.is_dir() {
            Command::new("open")
                .arg(path_buf.to_string_lossy().to_string())
                .spawn()
                .map_err(|e| format!("Failed to open Finder: {}", e))?;
        } else {
            Command::new("open")
                .args(["-R", &path_buf.to_string_lossy().to_string()])
                .spawn()
                .map_err(|e| format!("Failed to open Finder: {}", e))?;
        }
    }
    #[cfg(target_os = "linux")]
    {
        if path_buf.is_dir() {
            Command::new("xdg-open")
                .arg(path_buf.to_string_lossy().to_string())
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        } else {
            if let Some(parent) = path_buf.parent() {
                Command::new("xdg-open")
                    .arg(parent.to_string_lossy().to_string())
                    .spawn()
                    .map_err(|e| format!("Failed to open file manager: {}", e))?;
            }
        }
    }
    Ok(true)
}

fn format_time(time: &std::time::SystemTime) -> String {
    use std::time::SystemTime;
    let now = SystemTime::now();
    if let Ok(dur) = now.duration_since(*time) {
        let secs = dur.as_secs();
        if secs < 60 {
            return "just now".into();
        }
        let days = secs / 86400;
        if days == 0 {
            let hours = secs / 3600;
            if hours == 0 {
                let mins = secs / 60;
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
