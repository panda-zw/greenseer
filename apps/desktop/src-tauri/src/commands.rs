use tauri::command;

#[command]
pub async fn get_sidecar_port(
    state: tauri::State<'_, crate::sidecar::SidecarState>,
) -> Result<u16, String> {
    Ok(*state.port.lock().unwrap())
}

#[command]
pub async fn is_sidecar_ready(
    state: tauri::State<'_, crate::sidecar::SidecarState>,
) -> Result<bool, String> {
    Ok(*state.ready.lock().unwrap())
}

#[command]
pub async fn store_credential(service: String, key: String) -> Result<(), String> {
    keyring::Entry::new("com.greenseer.app", &service)
        .map_err(|e| e.to_string())?
        .set_password(&key)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_credential(service: String) -> Result<Option<String>, String> {
    match keyring::Entry::new("com.greenseer.app", &service)
        .map_err(|e| e.to_string())?
        .get_password()
    {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[command]
pub async fn delete_credential(service: String) -> Result<(), String> {
    match keyring::Entry::new("com.greenseer.app", &service)
        .map_err(|e| e.to_string())?
        .delete_credential()
    {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Store a credential AND push all keys to the running sidecar
#[command]
pub async fn store_and_push_credential(
    service: String,
    key: String,
    state: tauri::State<'_, crate::sidecar::SidecarState>,
) -> Result<(), String> {
    // Store in keychain
    keyring::Entry::new("com.greenseer.app", &service)
        .map_err(|e| e.to_string())?
        .set_password(&key)
        .map_err(|e| e.to_string())?;

    // Push all keys to sidecar
    push_keys_to_sidecar_inner(&state).await
}

/// Push all stored keys from keychain to sidecar
#[command]
pub async fn push_keys_to_sidecar(
    state: tauri::State<'_, crate::sidecar::SidecarState>,
) -> Result<(), String> {
    push_keys_to_sidecar_inner(&state).await
}

async fn push_keys_to_sidecar_inner(
    state: &crate::sidecar::SidecarState,
) -> Result<(), String> {
    let port = *state.port.lock().unwrap();
    let secret = &state.secret;
    let ready = *state.ready.lock().unwrap();

    if !ready {
        return Err("Sidecar not ready".into());
    }

    // Read keys from keychain
    let anthropic_key = get_key_from_keychain("anthropic_api_key");
    let adzuna_app_id = get_key_from_keychain("adzuna_app_id");
    let adzuna_key = get_key_from_keychain("adzuna_api_key");

    // Build JSON payload safely using serde_json
    let mut payload = serde_json::Map::new();
    if let Some(k) = anthropic_key {
        payload.insert("anthropicKey".into(), serde_json::Value::String(k));
    }
    if let Some(k) = adzuna_app_id {
        payload.insert("adzunaAppId".into(), serde_json::Value::String(k));
    }
    if let Some(k) = adzuna_key {
        payload.insert("adzunaKey".into(), serde_json::Value::String(k));
    }
    let body = serde_json::to_string(&payload).map_err(|e| e.to_string())?;

    // POST to sidecar
    let url = format!("http://127.0.0.1:{}/api/internal/keys", port);
    let client = reqwest::Client::new();
    client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("x-sidecar-secret", secret.as_str())
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Failed to push keys: {}", e))?;

    Ok(())
}

fn get_key_from_keychain(service: &str) -> Option<String> {
    keyring::Entry::new("com.greenseer.app", service)
        .ok()
        .and_then(|entry| entry.get_password().ok())
}
