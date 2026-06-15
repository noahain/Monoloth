use crate::config::AppConfig;
use crate::history::HistoryManager;
use crate::pty::PtyManager;
use log::warn;
use serde_json::Value;
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
        let (cmd, args) = resolve_panel_shell(shell.as_deref())?;
        let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let gen = pty.spawn(&session_id, &cmd, &args_str, &directory, cols, rows)?;

        let active_profile = config.get_active_profile();
        if record {
            history.session_start_with_id(&session_id, &active_profile, &format!("[Panel] {}", cmd), &directory);
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
                                            warn!("Before command failed: {}", e);
                                        }
                                    }
                                    Some("parallel") => {
                                        if let Err(e) = run_parallel_command(cmd_str.to_string(), directory.clone()) {
                                            warn!("Parallel command failed: {}", e);
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
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;
        command.creation_flags(CREATE_NEW_CONSOLE);
    }
    command
        .spawn()
        .map_err(|e| format!("Failed to spawn: {}", e))?;
    Ok(true)
}

/// Resolve the executable + args for the secondary CMD panel.
///
/// On Windows the frontend offers cmd / powershell. On Unix those executables
/// don't exist, so we ignore the requested shell and launch the user's login
/// shell (`$SHELL`), falling back to bash then sh.
fn resolve_panel_shell(requested: Option<&str>) -> Result<(String, Vec<String>), String> {
    if cfg!(windows) {
        let shell_exe = match requested.unwrap_or("cmd") {
            "powershell" | "pwsh" => "powershell",
            _ => "cmd",
        };
        resolve_command(shell_exe)
    } else {
        let shell = std::env::var("SHELL")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| {
                if std::path::Path::new("/bin/bash").exists() {
                    "/bin/bash".to_string()
                } else {
                    "/bin/sh".to_string()
                }
            });
        Ok((shell, vec![]))
    }
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

/// Pick the best spawnable executable from `where`-style output (one path per line).
///
/// npm global installs create three sibling files: an extensionless POSIX shell
/// script (`opencode`), plus `opencode.cmd` and `opencode.ps1`. `where` lists the
/// extensionless file first, but Windows `CreateProcessW` cannot execute it and
/// fails with "%1 is not a valid Win32 application" (os error 193). Prefer a line
/// whose extension is in the PATHEXT-style executable set; fall back to the first line.
fn pick_windows_executable(where_output: &str) -> Option<String> {
    let lines: Vec<String> = where_output
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    if lines.is_empty() {
        return None;
    }
    const EXEC_EXTS: [&str; 4] = [".cmd", ".exe", ".bat", ".com"];
    lines
        .iter()
        .find(|l| {
            let lower = l.to_ascii_lowercase();
            EXEC_EXTS.iter().any(|ext| lower.ends_with(ext))
        })
        .or_else(|| lines.first())
        .cloned()
}

/// Build a `Command` that never allocates/flashes a console window.
///
/// In release builds the app runs under the `windows` subsystem (no console).
/// Spawning a child console process then forces Windows to allocate a fresh
/// conhost.exe per child, which costs ~1-2s and flashes a window. Setting
/// CREATE_NO_WINDOW avoids that. Debug builds run under the console subsystem
/// so the difference is invisible there — which is why this only froze release.
fn no_window_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn find_opencode() -> Result<String, String> {
    use std::path::PathBuf;
    if let Ok(p) = std::env::var("OPENCODE_BIN_PATH") {
        let p = p.trim();
        if !p.is_empty() {
            return Ok(p.to_string());
        }
    }

    if cfg!(windows) {
        if let Ok(output) = no_window_command("where").arg("opencode").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout);
                if let Some(best) = pick_windows_executable(&path) {
                    return Ok(best);
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

        if let Ok(output) = no_window_command("cmd")
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

        if let Ok(output) = no_window_command("cmd").args(["/C", "yarn", "global", "bin"]).output() {
            if output.status.success() {
                let bin_dir = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let cmd_path = format!("{}\\opencode.cmd", bin_dir);
                if PathBuf::from(&cmd_path).exists() {
                    return Ok(cmd_path);
                }
            }
        }
    } else {
        // 1. Try `which` against the process PATH (works when launched from a shell).
        if let Ok(output) = no_window_command("which").arg("opencode").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout);
                if let Some(first) = path.lines().next() {
                    let p = first.trim();
                    if !p.is_empty() {
                        return Ok(p.to_string());
                    }
                }
            }
        }

        // 2. GUI launchers (dock, .desktop, Finder) start with a minimal PATH that
        //    omits the user's shell-profile additions (~/.local/bin, /usr/local/bin,
        //    ~/.opencode/bin, brew, npm/bun globals, ...). Ask the user's login shell
        //    to resolve opencode using its full profile PATH.
        if let Some(path) = resolve_via_login_shell("opencode") {
            return Ok(path);
        }

        // 3. Fall back to probing common absolute install locations.
        if let Some(path) = probe_unix_install_paths("opencode") {
            return Ok(path);
        }
    }

    Err("opencode not found — install it or set OPENCODE_BIN_PATH".into())
}

/// Ask the user's login shell to resolve a binary using its full profile PATH.
/// GUI-launched apps on Linux/macOS don't inherit shell-profile PATH additions,
/// so `which` against the process PATH often misses user installs.
///
/// Bounded by a 5s timeout: a misconfigured/slow shell profile (e.g. a `.zshrc`
/// that hangs) must not stall terminal startup. On timeout the child is killed
/// and we fall through to absolute-path probing.
#[cfg(not(windows))]
fn resolve_via_login_shell(bin: &str) -> Option<String> {
    use std::process::Stdio;
    use std::sync::mpsc;
    use std::time::Duration;

    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "/bin/sh".to_string());
    // `-l -c` loads the login profile without going interactive (avoids hangs).
    let script = format!("command -v {} 2>/dev/null", bin);
    let mut child = std::process::Command::new(&shell)
        .args(["-l", "-c", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let (tx, rx) = mpsc::channel();
    let stdout = child.stdout.take();
    std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(mut out) = stdout {
            use std::io::Read;
            let _ = out.read_to_string(&mut buf);
        }
        let status = child.wait();
        let _ = tx.send((status, buf));
    });

    match rx.recv_timeout(Duration::from_secs(5)) {
        Ok((Ok(status), buf)) if status.success() => {
            let first = buf.lines().next()?.trim();
            if first.is_empty() || !std::path::Path::new(first).exists() {
                return None;
            }
            Some(first.to_string())
        }
        // Non-success exit, collection error, timeout, or panic: give up and let
        // the caller fall through to path probing. The orphaned shell (on timeout)
        // exits on its own once it finishes sourcing the profile.
        _ => None,
    }
}

#[cfg(windows)]
fn resolve_via_login_shell(_bin: &str) -> Option<String> {
    None
}

/// Probe common absolute install locations for a binary on Linux/macOS.
#[cfg(not(windows))]
fn probe_unix_install_paths(bin: &str) -> Option<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{}/.opencode/bin/{}", home, bin),
        format!("{}/.local/bin/{}", home, bin),
        format!("{}/.npm-global/bin/{}", home, bin),
        format!("{}/.bun/bin/{}", home, bin),
        format!("{}/.cargo/bin/{}", home, bin),
        format!("{}/.yarn/bin/{}", home, bin),
        format!("/usr/local/bin/{}", bin),
        format!("/opt/homebrew/bin/{}", bin),
        format!("/usr/bin/{}", bin),
    ];
    candidates
        .into_iter()
        .find(|p| std::path::Path::new(p).exists())
}

#[cfg(windows)]
fn probe_unix_install_paths(_bin: &str) -> Option<String> {
    None
}

fn run_before_command(cmd: &str, cwd: &str) -> Result<String, String> {
    use std::process::Stdio;
    use std::sync::mpsc;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    let child = shell_command(cmd)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn: {}", e))?;

    let shared_child = Arc::new(Mutex::new(Some(child)));
    let thread_child = shared_child.clone();

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut guard = thread_child.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(child) = guard.take() {
            let result = child.wait_with_output();
            let _ = tx.send(result);
        }
    });

    match rx.recv_timeout(Duration::from_secs(30)) {
        Ok(Ok(output)) => {
            if !output.status.success() {
                return Err(format!("Command exited with code: {:?}", output.status.code()));
            }
            Ok(format!("{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)))
        }
        Ok(Err(e)) => Err(format!("Failed to collect output: {}", e)),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            let mut guard = shared_child.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
            Err("Before command timed out after 30s".into())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            Err("Before command thread panicked".into())
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

    // pick_windows_executable tests — the root-cause fix for the npm extensionless
    // shell script. `where opencode` lists the extensionless POSIX script first;
    // CreateProcessW can't run it (os error 193). We must prefer the .cmd/.exe sibling.

    #[test]
    fn pick_exec_prefers_cmd_over_extensionless() {
        let output = "C:\\Users\\GamerZ\\AppData\\Roaming\\npm\\opencode\r\nC:\\Users\\GamerZ\\AppData\\Roaming\\npm\\opencode.cmd\r\n";
        let picked = pick_windows_executable(output).unwrap();
        assert_eq!(picked, "C:\\Users\\GamerZ\\AppData\\Roaming\\npm\\opencode.cmd");
    }

    #[test]
    fn pick_exec_prefers_exe() {
        let output = "C:\\bin\\opencode\r\nC:\\bin\\opencode.exe\r\n";
        let picked = pick_windows_executable(output).unwrap();
        assert_eq!(picked, "C:\\bin\\opencode.exe");
    }

    #[test]
    fn pick_exec_falls_back_to_first_when_no_exec_ext() {
        let output = "C:\\some\\opencode\r\n";
        let picked = pick_windows_executable(output).unwrap();
        assert_eq!(picked, "C:\\some\\opencode");
    }

    #[test]
    fn pick_exec_empty_returns_none() {
        assert_eq!(pick_windows_executable("   \r\n  \r\n"), None);
    }

    #[test]
    fn pick_exec_single_cmd_line() {
        let picked = pick_windows_executable("C:\\bin\\opencode.cmd").unwrap();
        assert_eq!(picked, "C:\\bin\\opencode.cmd");
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
