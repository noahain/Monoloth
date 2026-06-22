use std::process::Command;

use super::expand_env_vars;
use super::shell_command;

#[tauri::command]
pub fn execute_background(command: String, cwd: String) -> Result<bool, String> {
    let expanded_cwd = expand_env_vars(&cwd);
    shell_command(&command, "cmd")
        .current_dir(&expanded_cwd)
        .spawn()
        .map_err(|e| format!("Failed to spawn: {}", e))?;
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
        if command.trim().is_empty() {
            Command::new("open")
                .args(["-a", "Terminal", &expanded_cwd])
                .spawn()
                .map_err(|e| format!("Failed to open terminal: {}", e))?;
        } else {
            // Terminal.app can't take a command argument directly; drive it via
            // AppleScript. Build the shell line first, then escape it for the
            // AppleScript double-quoted string literal (\\ and " only).
            let shell_line = format!("cd {} && {}", shell_single_quote(&expanded_cwd), command);
            let as_escaped = shell_line.replace('\\', "\\\\").replace('"', "\\\"");
            let script = format!("tell application \"Terminal\" to do script \"{}\"", as_escaped);
            Command::new("osascript")
                .args(["-e", &script])
                .spawn()
                .map_err(|e| format!("Failed to open terminal: {}", e))?;
        }
    }
    #[cfg(target_os = "linux")]
    {
        let term = std::env::var("TERMINAL").unwrap_or_else(|_| "x-terminal-emulator".to_string());
        let mut cmd = Command::new(&term);
        cmd.current_dir(&expanded_cwd);
        if !command.trim().is_empty() {
            // ponytail: terminal emulators disagree on the run-a-command flag.
            // `-e` is honored by x-terminal-emulator, xterm, konsole, and most
            // others; gnome-terminal dropped it for `--`. Ceiling: gnome-terminal
            // users should set $TERMINAL to a compatible emulator. `exec $SHELL`
            // keeps the window open after the command exits.
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
            let inner = format!("{}; exec {}", command, shell);
            cmd.args(["-e", "sh", "-c", &inner]);
        }
        cmd.spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }
    Ok(true)
}

/// Wrap a string in single quotes for safe use in a POSIX shell command,
/// escaping any embedded single quotes via the `'\''` idiom.
#[cfg(not(windows))]
fn shell_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
