use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

pub struct SidecarState {
    pub child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
    pub port: Mutex<u16>,
    pub ready: Mutex<bool>,
    pub secret: String,
}

impl Default for SidecarState {
    fn default() -> Self {
        use rand::Rng;
        let secret: String = rand::rng()
            .sample_iter(&rand::distr::Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();

        Self {
            child: Mutex::new(None),
            port: Mutex::new(11434),
            ready: Mutex::new(false),
            secret,
        }
    }
}

pub fn start_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;

    let db_path = app_data_dir.join("greenseer.db");
    let db_url = format!("file:{}", db_path.display());

    let secret = &app.state::<SidecarState>().secret;

    // Get or generate a persistent encryption key for data at rest
    let encryption_key = get_or_create_encryption_key();

    let mut sidecar_command = app
        .shell()
        .sidecar("greenseer-sidecar")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?
        .env("DATABASE_URL", &db_url)
        .env("SIDECAR_PORT", "11434")
        .env("SIDECAR_SECRET", secret);

    if let Some(ref ek) = encryption_key {
        sidecar_command = sidecar_command.env("ENCRYPTION_KEY", ek);
    }

    let state = app.state::<SidecarState>();

    let (mut rx, child) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    *state.child.lock().unwrap() = Some(child);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    if line_str.starts_with("SIDECAR_READY:") {
                        if let Ok(port) = line_str
                            .trim_start_matches("SIDECAR_READY:")
                            .trim()
                            .parse::<u16>()
                        {
                            let state = app_handle.state::<SidecarState>();
                            *state.port.lock().unwrap() = port;
                            *state.ready.lock().unwrap() = true;
                            let _ = app_handle.emit("sidecar-ready", port);

                            // Auto-push any stored API keys to the sidecar
                            let secret = state.secret.clone();
                            let push_port = port;
                            tokio::spawn(async move {
                                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                                let _ = push_keys(push_port, &secret).await;
                            });
                        }
                    }
                    println!("[sidecar] {}", line_str);
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[sidecar:err] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(status) => {
                    eprintln!("[sidecar] terminated with status: {:?}", status);
                    let state = app_handle.state::<SidecarState>();
                    *state.ready.lock().unwrap() = false;
                    // Auto-restart after brief delay
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    let _ = start_sidecar(&app_handle);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

pub fn stop_sidecar(app: &tauri::AppHandle) {
    let state = app.state::<SidecarState>();
    if let Some(child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
    }
    *state.ready.lock().unwrap() = false;
}

async fn push_keys(port: u16, secret: &str) -> Result<(), String> {
    let anthropic = get_key("anthropic_api_key");
    let adzuna_id = get_key("adzuna_app_id");
    let adzuna_key = get_key("adzuna_api_key");

    // Only push if at least one key exists
    if anthropic.is_none() && adzuna_id.is_none() && adzuna_key.is_none() {
        return Ok(());
    }

    let mut payload = serde_json::Map::new();
    if let Some(k) = anthropic {
        payload.insert("anthropicKey".into(), serde_json::Value::String(k));
    }
    if let Some(k) = adzuna_id {
        payload.insert("adzunaAppId".into(), serde_json::Value::String(k));
    }
    if let Some(k) = adzuna_key {
        payload.insert("adzunaKey".into(), serde_json::Value::String(k));
    }

    let client = reqwest::Client::new();
    client
        .post(format!("http://127.0.0.1:{}/api/internal/keys", port))
        .header("Content-Type", "application/json")
        .header("x-sidecar-secret", secret)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("push_keys failed: {}", e))?;

    println!("[greenseer] Pushed API keys to sidecar");
    Ok(())
}

fn get_key(service: &str) -> Option<String> {
    keyring::Entry::new("com.greenseer.app", service)
        .ok()
        .and_then(|e| e.get_password().ok())
}

/// Get or create a persistent encryption key stored in the OS keychain.
/// Returns a 64-char hex string (32 bytes) suitable for AES-256.
fn get_or_create_encryption_key() -> Option<String> {
    let entry = match keyring::Entry::new("com.greenseer.app", "encryption_key") {
        Ok(e) => e,
        Err(_) => return None,
    };

    // Try to read existing key
    if let Ok(key) = entry.get_password() {
        if key.len() == 64 {
            return Some(key);
        }
    }

    // Generate a new key
    use rand::Rng;
    let key_bytes: Vec<u8> = (0..32).map(|_| rand::rng().random::<u8>()).collect();
    let hex_key: String = key_bytes.iter().map(|b| format!("{:02x}", b)).collect();

    match entry.set_password(&hex_key) {
        Ok(_) => {
            println!("[greenseer] Generated new encryption key and stored in keychain");
            Some(hex_key)
        }
        Err(e) => {
            eprintln!("[greenseer] Failed to store encryption key: {}", e);
            None
        }
    }
}
