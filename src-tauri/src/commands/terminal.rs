use crate::config::AppConfig;
use crate::history::HistoryManager;
use crate::pty::PtyManager;
use serde_json::Value;
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use tauri::State;

use super::{expand_env_vars, shell_command};

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
) -> Result<u64, String> {
    let record = record_history.unwrap_or(true);
    let is_panel = session_id == "panel" || session_id.starts_with("panel-tab-");
    let directory = expand_env_vars(&directory);

    if is_panel {
        let shell_exe = match shell.as_deref().unwrap_or("cmd") {
            "powershell" | "pwsh" => "powershell",
            _ => "cmd",
        };
        let (cmd, args) = resolve_command(shell_exe)?;
        let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let gen = pty.spawn(&session_id, &cmd, &args_str, &directory, cols, rows)?;

        let active_profile = config.get_active_profile();
        if record {
            history.session_start_with_id(&session_id, &active_profile, &format!("[Panel] {}", shell_exe), &directory);
        }
        return Ok(gen);
    }

    let startup_cmd = config.get("startup_command").as_str().unwrap_or("opencode").to_string();
    let cmd_type = config.get("startup_command_type").as_str().unwrap_or("preset").to_string();
    let active_profile = config.get_active_profile();

    let (cmd, args): (String, Vec<String>) = if cmd_type == "custom" {
        resolve_custom_command(&startup_cmd)?
    } else {
        resolve_command(&startup_cmd)?
    };

    let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let gen = pty.spawn(&session_id, &cmd, &args_str, &directory, cols, rows)?;

    if record {
        let display_command = if cmd_type == "custom" { &startup_cmd } else { &cmd };
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
                                        if let Err(e) = run_before_command(cmd_str, &directory) {
                                            eprintln!("[Monoloth] Before command failed: {}", e);
                                        }
                                    }
                                    Some("parallel") => {
                                        if let Err(e) = run_parallel_command(cmd_str.to_string(), directory.clone()) {
                                            eprintln!("[Monoloth] Parallel command failed: {}", e);
                                        }
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

    Ok(gen)
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
    } else {
        history.session_end_by_id(&sid);
    }
    pty.terminate(&sid);
}

#[tauri::command]
pub fn run_parallel_command(cmd: String, cwd: String) -> Result<bool, String> {
    let mut command = shell_command(&cmd);
    command.current_dir(&cwd);
    if cfg!(windows) {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;
        command.creation_flags(CREATE_NEW_CONSOLE);
    }
    command
        .spawn()
        .map_err(|e| format!("Failed to spawn: {}", e))?;
    Ok(true)
}

fn resolve_command(preset: &str) -> Result<(String, Vec<String>), String> {
    match preset {
        "opencode" => {
            let path = find_opencode()?;
            Ok(wrap_path_for_windows(&path))
        }
        other => Ok(wrap_path_for_windows(other)),
    }
}

fn wrap_path_for_windows(path: &str) -> (String, Vec<String>) {
    if cfg!(windows) {
        // Only wrap in cmd /C for bare names that need PATHEXT resolution.
        // Don't wrap known shells or absolute paths, as cmd /C breaks their
        // TTY detection, colors, and PSReadline support.
        let is_shell = path.eq_ignore_ascii_case("powershell")
            || path.eq_ignore_ascii_case("pwsh")
            || path.eq_ignore_ascii_case("cmd");
        let is_path = path.contains('/') || path.contains('\\');
        if is_shell || is_path {
            (path.to_string(), vec![])
        } else {
            ("cmd".into(), vec!["/C".into(), path.to_string()])
        }
    } else {
        (path.to_string(), vec![])
    }
}

fn resolve_custom_command(cmd_line: &str) -> Result<(String, Vec<String>), String> {
    let trimmed = cmd_line.trim();
    if trimmed.is_empty() {
        return Err("Empty command".into());
    }

    if cfg!(windows) {
        // On Windows, pass the raw command line to cmd /C without splitting.
        // shlex implements POSIX shell lexing where \ is an escape character,
        // which mangles Windows backslash paths (e.g., C:\Users\name\script.bat).
        let args: Vec<String> = vec!["/C".to_string(), trimmed.to_string()];
        return Ok(("cmd".into(), args));
    }

    let parts = shlex::split(trimmed).ok_or_else(|| "Failed to parse command line".to_string())?;
    if parts.is_empty() {
        return Err("Empty command".into());
    }
    let exe = &parts[0];
    Ok((exe.to_string(), parts[1..].to_vec()))
}

fn find_opencode() -> Result<String, String> {
    if let Ok(p) = std::env::var("OPENCODE_BIN_PATH") {
        let p = p.trim();
        if !p.is_empty() {
            return Ok(p.to_string());
        }
    }

    if cfg!(windows) {
        if let Ok(output) = Command::new("where").arg("opencode").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout);
                if let Some(first) = path.lines().next() {
                    let trimmed = first.trim().to_string();
                    return Ok(trimmed);
                }
            }
        }

        let npm_paths = [
            "C:\\Program Files\\nodejs\\opencode.cmd",
            "C:\\Program Files\\nodejs\\opencode.exe",
        ];
        for p in &npm_paths {
            if PathBuf::from(p).exists() {
                return Ok(p.to_string());
            }
        }

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

        if let Ok(output) = Command::new("cmd").args(["/C", "yarn", "global", "bin"]).output() {
            if output.status.success() {
                let bin_dir = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let cmd_path = format!("{}\\opencode.cmd", bin_dir);
                if PathBuf::from(&cmd_path).exists() {
                    return Ok(cmd_path);
                }
            }
        }
    } else {
        if let Ok(output) = Command::new("which").arg("opencode").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout);
                if let Some(first) = path.lines().next() {
                    return Ok(first.trim().to_string());
                }
            }
        }
    }

    Err("opencode not found — install it or set OPENCODE_BIN_PATH".into())
}

fn run_before_command(cmd: &str, cwd: &str) -> Result<String, String> {
    use std::process::Stdio;

    let mut child = shell_command(cmd)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn: {}", e))?;

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
                    let _ = child.wait();
                    return Err("Before command timed out after 30s".into());
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(e) => return Err(format!("Failed to wait: {}", e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    #[cfg(windows)]
    fn wrap_bare_name_uses_cmd_c() {
        let _lock = TEST_LOCK.lock().unwrap();
        let (cmd, args) = wrap_path_for_windows("opencode");
        assert_eq!(cmd, "cmd");
        assert_eq!(args, vec!["/C".to_string(), "opencode".to_string()]);
    }

    #[test]
    #[cfg(windows)]
    fn wrap_cmd_path_does_not_wrap() {
        let _lock = TEST_LOCK.lock().unwrap();
        let (cmd, args) = wrap_path_for_windows(r"C:\Users\foo\npm\opencode.cmd");
        assert_eq!(cmd, r"C:\Users\foo\npm\opencode.cmd");
        assert!(args.is_empty());
    }

    #[test]
    #[cfg(windows)]
    fn wrap_exe_path_does_not_wrap() {
        let _lock = TEST_LOCK.lock().unwrap();
        let (cmd, args) = wrap_path_for_windows(r"C:\Program Files\opencode\opencode.exe");
        assert_eq!(cmd, r"C:\Program Files\opencode\opencode.exe");
        assert!(args.is_empty());
    }

    #[test]
    #[cfg(windows)]
    fn wrap_powershell_does_not_wrap() {
        let _lock = TEST_LOCK.lock().unwrap();
        let (cmd, args) = wrap_path_for_windows("powershell");
        assert_eq!(cmd, "powershell");
        assert!(args.is_empty());
    }

    #[test]
    #[cfg(windows)]
    fn wrap_pwsh_does_not_wrap() {
        let _lock = TEST_LOCK.lock().unwrap();
        let (cmd, args) = wrap_path_for_windows("pwsh");
        assert_eq!(cmd, "pwsh");
        assert!(args.is_empty());
    }

    #[test]
    fn resolve_opencode_preset_finds_path() {
        let _lock = TEST_LOCK.lock().unwrap();
        let sentinel = r"C:\monoloth_test_sentinel\opencode.exe";
        std::env::set_var("OPENCODE_BIN_PATH", sentinel);
        let (cmd, args) = resolve_command("opencode").unwrap();
        // Paths should not be wrapped in cmd /C
        assert_eq!(cmd, sentinel);
        assert!(args.is_empty());
        std::env::remove_var("OPENCODE_BIN_PATH");
    }

    #[test]
    fn opencode_bin_path_overrides_where() {
        let _lock = TEST_LOCK.lock().unwrap();
        let sentinel = r"C:\monoloth_test_sentinel\opencode.exe";
        std::env::set_var("OPENCODE_BIN_PATH", sentinel);
        let result = find_opencode().unwrap();
        assert_eq!(result, sentinel);
        std::env::remove_var("OPENCODE_BIN_PATH");
    }

    #[test]
    fn opencode_bin_path_empty_falls_through() {
        let _lock = TEST_LOCK.lock().unwrap();
        std::env::set_var("OPENCODE_BIN_PATH", "   ");
        let result = find_opencode();
        let _ = result;
        std::env::remove_var("OPENCODE_BIN_PATH");
    }

    // resolve_custom_command tests — mirror the v2.0.1 fix for resolve_command:
    // on Windows, the full command (exe + args) must be wrapped in cmd /C so that
    // Windows' PATHEXT resolution handles extensionless npm scripts (e.g. claude,
    // codex) instead of portable-pty's search_path picking the extensionless file
    // and failing with CreateProcessW error 193.

    #[test]
    #[cfg(windows)]
    fn resolve_custom_bare_name_wraps_in_cmd_c() {
        let (cmd, args) = resolve_custom_command("claude").unwrap();
        assert_eq!(cmd, "cmd");
        assert_eq!(args, vec!["/C".to_string(), "claude".to_string()]);
    }

    #[test]
    #[cfg(windows)]
    fn resolve_custom_cmd_path_wraps_in_cmd_c() {
        let (cmd, args) = resolve_custom_command("C:/Users/foo/npm/claude.cmd").unwrap();
        assert_eq!(cmd, "cmd");
        assert_eq!(args, vec!["/C".to_string(), "C:/Users/foo/npm/claude.cmd".to_string()]);
    }

    #[test]
    #[cfg(windows)]
    fn resolve_custom_exe_path_wraps_in_cmd_c() {
        let (cmd, args) = resolve_custom_command(r#""C:/Program Files/claude/claude.exe""#).unwrap();
        assert_eq!(cmd, "cmd");
        assert_eq!(
            args,
            vec!["/C".to_string(), r#""C:/Program Files/claude/claude.exe""#.to_string()]
        );
    }

    #[test]
    #[cfg(windows)]
    fn resolve_custom_bat_path_wraps_in_cmd_c() {
        let (cmd, args) = resolve_custom_command("C:/tools/start.bat").unwrap();
        assert_eq!(cmd, "cmd");
        assert_eq!(args, vec!["/C".to_string(), "C:/tools/start.bat".to_string()]);
    }

    #[test]
    #[cfg(windows)]
    fn resolve_custom_with_args_wraps_in_cmd_c() {
        let (cmd, args) = resolve_custom_command("claude --model sonnet --verbose").unwrap();
        assert_eq!(cmd, "cmd");
        assert_eq!(
            args,
            vec!["/C".to_string(), "claude --model sonnet --verbose".to_string()]
        );
    }

    #[test]
    #[cfg(windows)]
    fn resolve_custom_with_quoted_arg_wraps_in_cmd_c() {
        let (cmd, args) = resolve_custom_command(r#"claude --prompt "hello world""#).unwrap();
        assert_eq!(cmd, "cmd");
        assert_eq!(
            args,
            vec!["/C".to_string(), r#"claude --prompt "hello world""#.to_string()]
        );
    }

    #[test]
    #[cfg(windows)]
    fn resolve_custom_path_with_space_wraps_in_cmd_c() {
        let (cmd, args) = resolve_custom_command(r#""C:/Program Files/My Tool/run.exe" --flag"#).unwrap();
        assert_eq!(cmd, "cmd");
        assert_eq!(
            args,
            vec!["/C".to_string(), r#""C:/Program Files/My Tool/run.exe" --flag"#.to_string()]
        );
    }

    #[test]
    #[cfg(not(windows))]
    fn resolve_custom_no_wrap_on_non_windows() {
        let (cmd, args) = resolve_custom_command("claude --version").unwrap();
        assert_eq!(cmd, "claude");
        assert_eq!(args, vec!["--version".to_string()]);
    }

    #[test]
    fn resolve_custom_empty_returns_err() {
        let result = resolve_custom_command("");
        assert!(result.is_err());
    }

    #[test]
    fn resolve_custom_only_whitespace_returns_err() {
        let result = resolve_custom_command("   ");
        assert!(result.is_err());
    }
}
