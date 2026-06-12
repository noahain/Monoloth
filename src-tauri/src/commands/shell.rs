use std::process::Command;

use super::expand_env_vars;

#[tauri::command]
pub fn execute_background(command: String, cwd: String) -> Result<bool, String> {
    let expanded_cwd = expand_env_vars(&cwd);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("cmd")
            .args(["/C", &command])
            .current_dir(&expanded_cwd)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to spawn: {}", e))?;
    }
    #[cfg(not(windows))]
    {
        use super::shell_command;
        shell_command(&command)
            .current_dir(&expanded_cwd)
            .spawn()
            .map_err(|e| format!("Failed to spawn: {}", e))?;
    }
    Ok(true)
}

#[tauri::command]
pub fn open_external_terminal(command: String, cwd: String) -> Result<bool, String> {
    let expanded_cwd = expand_env_vars(&cwd);
    #[cfg(windows)]
    {
        let escaped = command.replace('"', "\"\"");
        let inner = format!("start \"\" cmd.exe /K \"{}\"", escaped);
        use std::os::windows::process::CommandExt;
        Command::new("cmd")
            .arg("/C")
            .raw_arg(&inner)
            .current_dir(&expanded_cwd)
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Terminal", &expanded_cwd])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        let term = std::env::var("TERMINAL").unwrap_or_else(|_| "x-terminal-emulator".to_string());
        Command::new(&term)
            .current_dir(&expanded_cwd)
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }
    Ok(true)
}
