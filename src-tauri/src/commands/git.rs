use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const ALLOWED: &[&str] = &["status", "log", "diff", "show", "rev-parse"];
const STDOUT_CAP: u64 = 1_048_576;
const STDERR_CAP: u64 = 65_536;
const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, serde::Serialize)]
pub struct GitOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

fn read_capped<R: Read>(reader: R, cap: u64) -> String {
    let mut buf = Vec::new();
    let _ = reader.take(cap + 1).read_to_end(&mut buf);
    if buf.len() as u64 > cap {
        buf.truncate(cap as usize);
    }
    String::from_utf8_lossy(&buf).into_owned()
}

#[tauri::command]
pub fn run_git(cwd: String, args: Vec<String>) -> Result<GitOutput, String> {
    let sub = args.first().ok_or_else(|| "no git subcommand given".to_string())?;
    if !ALLOWED.contains(&sub.as_str()) {
        return Err("unsupported git subcommand".to_string());
    }

    let mut command = Command::new("git");
    command
        .args(&args)
        .current_dir(&cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    let stdout_handle = child.stdout.take().map(|out| std::thread::spawn(move || read_capped(out, STDOUT_CAP)));
    let stderr_handle = child.stderr.take().map(|err| std::thread::spawn(move || read_capped(err, STDERR_CAP)));

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {}
            Err(e) => return Err(format!("Failed to wait for git: {}", e)),
        }
        if started.elapsed() > TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err("git command timed out".to_string());
        }
        std::thread::sleep(Duration::from_millis(25));
    };

    let stdout = stdout_handle.map(|h| h.join().unwrap_or_default()).unwrap_or_default();
    let stderr = stderr_handle.map(|h| h.join().unwrap_or_default()).unwrap_or_default();

    Ok(GitOutput {
        code: status.code().unwrap_or(-1),
        stdout,
        stderr,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_repo(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("monoloth-git-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(&dir)
            .status()
            .unwrap();
        dir
    }

    #[test]
    fn rejects_mutating_subcommands() {
        for sub in ["push", "reset", "clean", "branch", "remote"] {
            let err = run_git(".".into(), vec![sub.to_string()]).unwrap_err();
            assert_eq!(err, "unsupported git subcommand");
        }
    }

    #[test]
    fn accepts_status_in_a_repo() {
        let dir = temp_repo("status");
        let out = run_git(dir.to_string_lossy().into(), vec!["status".into()]).unwrap();
        assert_eq!(out.code, 0);
        assert!(out.stdout.contains("On branch") || out.stdout.contains("No commits"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
