mod commands;
mod sidecar;
mod tray;

use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .manage(sidecar::SidecarState::default())
        .setup(|app| {
            // Create system tray
            tray::create_tray(app.handle())?;

            // Start sidecar (non-fatal if it fails — e.g., in dev without binary)
            if let Err(e) = sidecar::start_sidecar(app.handle()) {
                eprintln!("[greenseer] Failed to start sidecar: {}", e);
            }

            // Register autostart
            let autostart = app.handle().autolaunch();
            if !autostart.is_enabled().unwrap_or(false) {
                let _ = autostart.enable();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_sidecar_port,
            commands::is_sidecar_ready,
            commands::store_credential,
            commands::get_credential,
            commands::delete_credential,
            commands::store_and_push_credential,
            commands::push_keys_to_sidecar,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
