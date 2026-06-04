use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;

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

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<bool, String> {
    let path_buf = parse_path(&path);
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
