use parking_lot::Mutex;
use portable_pty::{CommandBuilder, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, OnceLock};
use std::thread;
use tauri::Emitter;
use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PtyOutput {
    data: String,
    eof: bool,
    session_id: String,
    generation: u64,
}

struct PtySession {
    writer: Box<dyn Write + Send>,
    resizer: Option<Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>>,
    child: Box<dyn portable_pty::ChildKiller + Send>,
    read_thread: Option<thread::JoinHandle<()>>,
}

#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    app_handle: OnceLock<tauri::AppHandle>,
    session_generation: Arc<Mutex<HashMap<String, u64>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            app_handle: OnceLock::new(),
            session_generation: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set_app_handle(&self, handle: tauri::AppHandle) {
        let _ = self.app_handle.set(handle);
    }

    pub fn spawn(&self, session_id: &str, command: &str, args: &[&str], cwd: &str, cols: u16, rows: u16) -> Result<u64, String> {
        self.terminate(session_id);

        let pty_system = portable_pty::NativePtySystem::default();
        let pair = pty_system
            .openpty(portable_pty::PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let mut cmd = CommandBuilder::new(command);
        for arg in args {
            cmd.arg(arg);
        }
        cmd.cwd(cwd);
        cmd.env("COLUMNS", cols.to_string());
        cmd.env("LINES", rows.to_string());

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get writer: {}", e))?;

        let gen = {
            let mut gens = self.session_generation.lock();
            let g = gens.entry(session_id.to_string()).or_insert(0);
            *g += 1;
            *g
        };

        let app_ref = self.app_handle.clone();
        let sid = session_id.to_string();
        let read_handle = thread::spawn(move || {
            Self::read_loop(app_ref, reader, sid, gen);
        });

        let session = PtySession {
            writer,
            resizer: Some(Arc::new(Mutex::new(pair.master))),
            child,
            read_thread: Some(read_handle),
        };

        self.sessions.lock().insert(session_id.to_string(), session);

        Ok(gen)
    }

    fn read_loop(
        app_handle: OnceLock<tauri::AppHandle>,
        mut reader: Box<dyn std::io::Read + Send>,
        session_id: String,
        generation: u64,
    ) {
        let mut buf = [0u8; 8192];
        let mut leftover = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    if !leftover.is_empty() {
                        let output = String::from_utf8_lossy(&leftover).to_string();
                        leftover.clear();
                        if let Some(handle) = app_handle.get() {
                            let _ = handle.emit(
                                "pty-output",
                                PtyOutput {
                                    data: output,
                                    eof: false,
                                    session_id: session_id.clone(),
                                    generation,
                                },
                            );
                        }
                    }
                    if let Some(handle) = app_handle.get() {
                        let _ = handle.emit(
                            "pty-output",
                            PtyOutput {
                                data: String::new(),
                                eof: true,
                                session_id: session_id.clone(),
                                generation,
                            },
                        );
                    }
                    break;
                }
                Ok(n) => {
                    let mut data = Vec::with_capacity(leftover.len() + n);
                    data.append(&mut leftover);
                    data.extend_from_slice(&buf[..n]);

                    let mut emit_buf = Vec::new();
                    let mut current = data.as_slice();
                    loop {
                        match std::str::from_utf8(current) {
                            Ok(s) => {
                                emit_buf.extend_from_slice(s.as_bytes());
                                break;
                            }
                            Err(e) => {
                                let valid_up_to = e.valid_up_to();
                                if valid_up_to > 0 {
                                    emit_buf.extend_from_slice(&current[..valid_up_to]);
                                }
                                if let Some(error_len) = e.error_len() {
                                    emit_buf.extend_from_slice("�".as_bytes());
                                    current = &current[valid_up_to + error_len..];
                                } else {
                                    leftover = current[valid_up_to..].to_vec();
                                    break;
                                }
                            }
                        }
                    }

                    if !emit_buf.is_empty() {
                        let output = String::from_utf8_lossy(&emit_buf).to_string();
                        if let Some(handle) = app_handle.get() {
                            let _ = handle.emit(
                                "pty-output",
                                PtyOutput {
                                    data: output,
                                    eof: false,
                                    session_id: session_id.clone(),
                                    generation,
                                },
                            );
                        }
                    }
                }
                Err(_) => {
                    if !leftover.is_empty() {
                        let output = String::from_utf8_lossy(&leftover).to_string();
                        leftover.clear();
                        if let Some(handle) = app_handle.get() {
                            let _ = handle.emit(
                                "pty-output",
                                PtyOutput {
                                    data: output,
                                    eof: false,
                                    session_id: session_id.clone(),
                                    generation,
                                },
                            );
                        }
                    }
                    if let Some(handle) = app_handle.get() {
                        let _ = handle.emit(
                            "pty-output",
                            PtyOutput {
                                data: String::new(),
                                eof: true,
                                session_id: session_id.clone(),
                                generation,
                            },
                        );
                    }
                    break;
                }
            }
        }
    }

    pub fn write_input(&self, session_id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("No PTY session: {}", session_id))?;
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write: {}", e))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush: {}", e))?;
        Ok(())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let resizer = {
            let sessions = self.sessions.lock();
            sessions
                .get(session_id)
                .and_then(|s| s.resizer.clone())
                .ok_or_else(|| format!("No PTY session: {}", session_id))?
        };
        let resizer = resizer.lock();
        resizer
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize: {}", e))
    }

    pub fn terminate(&self, session_id: &str) {
        let session = {
            let mut sessions = self.sessions.lock();
            sessions.remove(session_id)
        };

        if let Some(mut s) = session {
            let _ = s.child.kill();

            drop(s.writer);
            drop(s.resizer.take());

            if let Some(_handle) = s.read_thread.take() {
            }
        }
    }

    pub fn terminate_all(&self) {
        let all_sessions: Vec<String> = {
            self.sessions.lock().keys().cloned().collect()
        };
        for sid in all_sessions {
            self.terminate(&sid);
        }
    }
}
