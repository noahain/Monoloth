#[tauri::command]
pub fn get_current_version() -> String {
    env!("CARGO_PKG_VERSION").into()
}

/// Windows PTY compatibility info for xterm.js `windowsPty` option.
/// `portable-pty`'s `NativePtySystem` uses ConPTY on Windows, so the backend is
/// always "conpty". The build number drives xterm.js reflow heuristics: reflow is
/// only safe on ConPTY build >= 21376, so the real build must be reported rather
/// than hardcoded (Win10 users need the older heuristics to avoid corruption).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsPtyInfo {
    pub backend: String,
    pub build_number: u32,
}

#[tauri::command]
pub fn get_windows_pty_info() -> Option<WindowsPtyInfo> {
    #[cfg(windows)]
    {
        let build = read_windows_build_number();
        build.map(|build_number| WindowsPtyInfo {
            backend: "conpty".into(),
            build_number,
        })
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[cfg(windows)]
fn read_windows_build_number() -> Option<u32> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        .ok()?;
    // CurrentBuildNumber is a REG_SZ (string) like "26200".
    let build: String = key.get_value("CurrentBuildNumber").ok()?;
    build.trim().parse::<u32>().ok()
}
