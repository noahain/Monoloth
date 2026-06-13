use std::path::PathBuf;
use std::process::Command;

mod config;
mod fs;
mod history;
mod image;
mod profile;
mod shell;
mod terminal;
mod version;
mod window;

pub use config::*;
pub use fs::*;
pub use history::*;
pub use image::*;
pub use profile::*;
pub use shell::*;
pub use terminal::*;
pub use version::*;
pub use window::*;

pub(super) fn expand_env_vars(path: &str) -> String {
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
        } else if c == '~' && !cfg!(windows) && result.is_empty() {
            if chars.peek().map_or(true, |&next| next == '/' || next == ':') {
                if let Ok(home) = std::env::var("HOME") {
                    result.push_str(&home);
                } else {
                    result.push('~');
                }
            } else {
                result.push('~');
            }
        } else {
            result.push(c);
        }
    }
    if cfg!(windows) {
        result
    } else {
        shellexpand::env_with_context_no_errors(&result, |var| std::env::var(var).ok()).into_owned()
    }
}

pub(super) fn clean_path(path: &str) -> String {
    let s = if cfg!(windows) && path.starts_with("\\\\?\\") {
        path[4..].to_string()
    } else {
        path.to_string()
    };
    if s.starts_with("UNC\\") || s.starts_with("unc\\") {
        format!("\\\\{}", &s[4..])
    } else {
        s
    }
}

pub(super) fn parse_path(path: &str) -> PathBuf {
    PathBuf::from(expand_env_vars(path))
}

pub(super) fn shell_command(command: &str) -> Command {
    if cfg!(windows) {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", command]);
        cmd
    } else {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", command]);
        cmd
    }
}
