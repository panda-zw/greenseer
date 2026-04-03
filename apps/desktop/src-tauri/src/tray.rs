use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

pub fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Greenseer", true, None::<&str>)?;
    let scrape = MenuItem::with_id(app, "scrape_now", "Run Scrape Now", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause Scraping", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open, &scrape, &pause, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "scrape_now" => {
                let _ = app.emit("scrape-now", ());
            }
            "pause" => {
                let _ = app.emit("toggle-pause", ());
            }
            "quit" => {
                crate::sidecar::stop_sidecar(app);
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
