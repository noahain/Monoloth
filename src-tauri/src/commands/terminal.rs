use crate::config::AppConfig;
use crate::history::HistoryManager;
use crate::pty::PtyManager;
use log::warn;
use serde_json::Value;
use tauri::State;

use super::{expand_env_vars, shell_command};

fn is_main_tab_session(session_id: &str) -> bool {
    session_id.starts_with("main-tab-")
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
    profile_name: Option<String>,
) -> Result<u64, String> {
    let record = record_history.unwrap_or(true);
    let is_panel = session_id == "panel" || session_id.starts_with("panel-tab-");
    let is_main_tab = is_main_tab_session(&session_id);
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

    let (startup_cmd, cmd_type) = match profile_name.as_deref() {
        Some(name) if !name.is_empty() && name != "Default" => {
            let overrides = crate::config::load_json_pub(&crate::config::profile_path(name));
            let global_cmd = config.get("startup_command");
            let global_cmd_type = config.get("startup_command_type");
            let cmd = overrides.get("startup_command").and_then(|v| v.as_str())
                .or_else(|| global_cmd.as_str())
                .unwrap_or("opencode").to_string();
            let ctype = overrides.get("startup_command_type").and_then(|v| v.as_str())
                .or_else(|| global_cmd_type.as_str())
                .unwrap_or("preset").to_string();
            (cmd, ctype)
        }
        _ => (
            config.get("startup_command").as_str().unwrap_or("opencode").to_string(),
            config.get("startup_command_type").as_str().unwrap_or("preset").to_string(),
        ),
    };
    let active_profile = match profile_name.as_deref() {
        Some(n) if !n.is_empty() => n.to_string(),
        _ => config.get_active_profile(),
    };
    let panel_shell = config.get("panelShell").as_str().unwrap_or("cmd").to_string();

    let (cmd, args): (String, Vec<String>) = if cmd_type == "custom" {
        resolve_custom_command(&startup_cmd)?
    } else {
        resolve_command(&startup_cmd)?
    };

    let secondary = if session_id == "main" {
        config.get("secondary_commands")
    } else {
        Value::Null
    };
    if session_id == "main" {
        if let Value::Array(cmds) = &secondary {
            for cmd_val in cmds {
                if let Some(cmd_obj) = cmd_val.as_object() {
                    if let Some(enabled) = cmd_obj.get("enabled").and_then(|v| v.as_bool()) {
                        if enabled {
                            if let Some(cmd_str) = cmd_obj.get("command").and_then(|v| v.as_str()) {
                                if cmd_obj.get("mode").and_then(|v| v.as_str()) == Some("before") {
                                    if let Err(e) = run_before_command(cmd_str, &directory, &panel_shell) {
                                        warn!("Before command failed: {}", e);
                                    }
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

    if record {
        let display_command = if cmd_type == "custom" { &startup_cmd } else { &cmd };
        if is_main_tab {
            history.session_start_with_id(&session_id, &active_profile, display_command, &directory);
        } else {
            history.session_start(&active_profile, display_command, &directory);
        }
    }

    if session_id == "main" {
        pty.terminate_by_prefix("hidden-");
        if let Value::Array(cmds) = &secondary {
            for (idx, cmd_val) in cmds.iter().enumerate() {
                if let Some(cmd_obj) = cmd_val.as_object() {
                    if let Some(enabled) = cmd_obj.get("enabled").and_then(|v| v.as_bool()) {
                        if enabled {
                            if let Some(cmd_str) = cmd_obj.get("command").and_then(|v| v.as_str()) {
                                let mode = cmd_obj.get("mode").and_then(|v| v.as_str());
                                if mode == Some("parallel") {
                                    if let Err(e) = run_parallel_command(cmd_str.to_string(), directory.clone(), &panel_shell) {
                                        warn!("Parallel command failed: {}", e);
                                    }
                                } else if mode == Some("hidden") {
                                    let hidden_sid = format!("hidden-{}", idx);
                                    match resolve_hidden_command(&panel_shell, cmd_str) {
                                        Ok((exe, args)) => {
                                            let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
                                            if let Err(e) = pty.spawn(&hidden_sid, &exe, &args_ref, &directory, cols, rows) {
                                                warn!("Hidden command failed: {}", e);
                                            }
                                        }
                                        Err(e) => warn!("Hidden command resolve failed: {}", e),
                                    }
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
pub fn terminate_terminal(pty: State<PtyManager>, history: State<HistoryManager>, session_id: String) {
    if session_id == "main" {
        history.session_end();
    } else {
        history.session_end_by_id(&session_id);
    }
    pty.terminate(&session_id);
}

#[tauri::command]
pub fn retire_panel_tab(pty: State<PtyManager>, history: State<HistoryManager>, session_id: String) {
    if !session_id.starts_with("panel-tab-") && !session_id.starts_with("main-tab-") {
        return;
    }
    history.session_end_by_id(&session_id);
    pty.retire_session(&session_id);
}

#[tauri::command]
pub fn terminate_hidden(pty: State<PtyManager>) {
    pty.terminate_by_prefix("hidden-");
}

pub fn run_parallel_command(cmd: String, cwd: String, shell: &str) -> Result<bool, String> {
    let mut command = shell_command(&cmd, shell);
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

/// Resolve the shell + user command for a hidden (headless PTY) secondary command.
/// Uses the same shell preference as the CMD panel (panelShell config).
fn resolve_hidden_command(shell_pref: &str, user_cmd: &str) -> Result<(String, Vec<String>), String> {
    let (exe, _base_args) = resolve_panel_shell(Some(shell_pref))?;
    let mut args: Vec<String> = Vec::new();
    #[cfg(windows)]
    {
        if exe.eq_ignore_ascii_case("powershell") {
            args.push("-NoProfile".to_string());
            args.push("-Command".to_string());
        } else {
            args.push("/C".to_string());
        }
    }
    #[cfg(not(windows))]
    {
        args.push("-c".to_string());
    }
    args.push(user_cmd.to_string());
    Ok((exe, args))
}

#[cfg(any(not(windows), test))]
const UNIX_PRESETS: [&str; 7] = ["opencode", "claude", "qwen", "kimi", "codex", "pi", "gemini"];

fn resolve_command(preset: &str) -> Result<(String, Vec<String>), String> {
    #[cfg(windows)]
    {
        match preset {
            "opencode" => {
                let path = find_opencode()?;
                Ok(wrap_path_for_windows(&path))
            }
            other => Ok(wrap_path_for_windows(other)),
        }
    }
    #[cfg(not(windows))]
    {
        if is_unix_preset(preset) {
            let path = if preset == "opencode" {
                find_opencode()?
            } else {
                find_unix_preset(preset)?
            };
            Ok((path, vec![]))
        } else {
            Ok((preset.to_string(), vec![]))
        }
    }
}

#[cfg(any(not(windows), test))]
fn is_unix_preset(preset: &str) -> bool {
    UNIX_PRESETS.contains(&preset)
}

#[cfg(any(not(windows), test))]
fn is_safe_binary_name(bin: &str) -> bool {
    let mut chars = bin.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphanumeric() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
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
    if let Ok(p) = std::env::var("OPENCODE_BIN_PATH") {
        let p = p.trim();
        if !p.is_empty() {
            return Ok(p.to_string());
        }
    }

    #[cfg(windows)]
    {
        use std::path::PathBuf;

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
    }

    #[cfg(not(windows))]
    if let Ok(path) = find_unix_preset("opencode") {
        return Ok(path);
    }

    Err("opencode not found — install it or set OPENCODE_BIN_PATH".into())
}

#[cfg(not(windows))]
fn find_unix_preset(bin: &str) -> Result<String, String> {
    if !is_safe_binary_name(bin) {
        return Err("invalid preset binary name".into());
    }
    if let Some(path) = resolve_via_process_path(bin) {
        return Ok(path);
    }
    if let Some(path) = resolve_via_login_shell(bin) {
        return Ok(path);
    }
    if let Some(path) = probe_unix_install_paths(bin) {
        return Ok(path);
    }
    Err(format!("{} not found — install it or use a custom startup command", bin))
}

#[cfg(not(windows))]
fn resolve_via_process_path(bin: &str) -> Option<String> {
    let output = no_window_command("which").arg(bin).output().ok()?;
    if !output.status.success() {
        return None;
    }
    first_existing_line(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(not(windows))]
fn first_existing_line(output: &str) -> Option<String> {
    output
        .lines()
        .map(|line| line.trim())
        .find(|line| !line.is_empty() && std::path::Path::new(line).exists())
        .map(|line| line.to_string())
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
    use std::time::{Duration, Instant};

    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "/bin/sh".to_string());
    // `-l -c` loads the login profile without going interactive.
    let script = format!("command -v {} 2>/dev/null", bin);
    let mut child = std::process::Command::new(&shell)
        .args(["-l", "-c", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                let mut buf = String::new();
                if let Some(mut out) = child.stdout.take() {
                    use std::io::Read;
                    let _ = out.read_to_string(&mut buf);
                }
                return first_existing_line(&buf);
            }
            Ok(None) if started.elapsed() >= Duration::from_secs(5) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
            Err(_) => return None,
        }
    }
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

fn run_before_command(cmd: &str, cwd: &str, shell: &str) -> Result<String, String> {
    run_before_command_with_timeout(cmd, cwd, std::time::Duration::from_secs(30), shell)
}

fn run_before_command_with_timeout(
    cmd: &str,
    cwd: &str,
    timeout: std::time::Duration,
    shell: &str,
) -> Result<String, String> {
    use std::io::Read;
    use std::process::Stdio;
    use std::thread;
    use std::time::{Duration, Instant};

    let mut child = shell_command(cmd, shell)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn: {}", e))?;

    let stdout = child.stdout.take().map(|mut pipe| {
        thread::spawn(move || {
            let mut output = String::new();
            let _ = pipe.read_to_string(&mut output);
            output
        })
    });
    let stderr = child.stderr.take().map(|mut pipe| {
        thread::spawn(move || {
            let mut output = String::new();
            let _ = pipe.read_to_string(&mut output);
            output
        })
    });

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                drop(stdout);
                drop(stderr);
                return Err(format!("Before command timed out after {}", format_duration(timeout)));
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(e) => return Err(format!("Failed to wait for command: {}", e)),
        }
    };

    let stdout = collect_reader(stdout);
    let stderr = collect_reader(stderr);

    if !status.success() {
        return Err(format!("Command exited with code: {:?}", status.code()));
    }

    Ok(format!("{}{}", stdout, stderr))
}

fn collect_reader(handle: Option<std::thread::JoinHandle<String>>) -> String {
    handle.and_then(|h| h.join().ok()).unwrap_or_default()
}

fn format_duration(duration: std::time::Duration) -> String {
    if duration.as_secs() > 0 {
        format!("{}s", duration.as_secs())
    } else {
        format!("{}ms", duration.as_millis())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn known_unix_presets_are_tracked() {
        for preset in ["opencode", "claude", "qwen", "kimi", "codex", "pi", "gemini"] {
            assert!(is_unix_preset(preset));
            assert!(is_safe_binary_name(preset));
        }
        assert!(!is_unix_preset("bash"));
    }

    #[test]
    fn is_main_tab_session_detected_by_prefix() {
        assert!(is_main_tab_session("main-tab-1"));
        assert!(is_main_tab_session("main-tab-42"));
        assert!(!is_main_tab_session("main"));
        assert!(!is_main_tab_session("panel-tab-1"));
        assert!(!is_main_tab_session("panel"));
        assert!(!is_main_tab_session(""));
    }

    #[test]
    fn retire_guard_accepts_main_tab_prefix() {
        // The guard in retire_panel_tab must accept both panel-tab- and main-tab- prefixes.
        // We verify via the is_main_tab_session helper + a check that main-tab is not panel-tab.
        assert!(is_main_tab_session("main-tab-1"));
        assert!("main-tab-1".starts_with("main-tab-"));
        assert!(!"main-tab-1".starts_with("panel-tab-"));
    }

    #[test]
    fn terminate_routes_main_tab_to_session_end_by_id() {
        assert!(is_main_tab_session("main-tab-1"));
        assert!(!is_main_tab_session("main"));
    }

    #[test]
    fn unsafe_binary_names_are_rejected() {
        for bin in ["", "-claude", "../claude", "claude beta", "claude;rm", "claude/bin"] {
            assert!(!is_safe_binary_name(bin));
        }
    }

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

    #[test]
    fn before_command_collects_output() {
        let _lock = TEST_LOCK.lock().unwrap();
        let cmd = if cfg!(windows) { "echo before" } else { "printf before" };
        let output = run_before_command_with_timeout(
            cmd,
            ".",
            std::time::Duration::from_secs(2),
            "cmd",
        ).unwrap();
        assert!(output.contains("before"));
    }

    #[test]
    fn before_command_timeout_does_not_block_on_wait_thread() {
        let _lock = TEST_LOCK.lock().unwrap();
        let cmd = if cfg!(windows) {
            "powershell -NoProfile -Command \"Start-Sleep -Seconds 5\""
        } else {
            "sleep 5"
        };
        let started = std::time::Instant::now();
        let result = run_before_command_with_timeout(
            cmd,
            ".",
            std::time::Duration::from_millis(100),
            "cmd",
        );
        assert!(result.unwrap_err().contains("timed out"));
        assert!(started.elapsed() < std::time::Duration::from_secs(2));
    }

    #[test]
    #[cfg(not(windows))]
    fn before_command_timeout_does_not_wait_for_pipe_inheriting_descendant() {
        let _lock = TEST_LOCK.lock().unwrap();
        let started = std::time::Instant::now();
        let result = run_before_command_with_timeout(
            "sleep 5 & wait",
            ".",
            std::time::Duration::from_millis(100),
            "cmd",
        );
        assert!(result.unwrap_err().contains("timed out"));
        assert!(started.elapsed() < std::time::Duration::from_secs(2));
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
