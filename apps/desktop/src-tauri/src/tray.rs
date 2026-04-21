use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

/// Source bytes for the tray icon. Embedded at compile time so the rendered
/// app never has to read from disk and the icon survives app relocation.
const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/128x128.png");

/// Build a rounded-corner RGBA image for the tray from the bundled app icon.
///
/// We apply a quarter-circle alpha mask to each of the four corners with a
/// 1-pixel anti-aliased falloff so the curve doesn't look jagged at the
/// smaller sizes the OS scales the tray icon down to.
fn rounded_tray_icon() -> Result<Image<'static>, image::ImageError> {
    let img = image::load_from_memory(TRAY_ICON_BYTES)?.to_rgba8();
    let (w, h) = (img.width(), img.height());

    // ~22% corner radius — matches the curvature of macOS Big Sur+ app icons
    // and reads as "rounded" rather than "circular" at tray sizes.
    let radius = (w.min(h) as f32 * 0.22).round();
    let radius_sq = radius * radius;

    let mut out = img;
    for y in 0..h {
        for x in 0..w {
            // Distance from the pixel to the nearest interior corner center.
            let (cx, cy) = corner_center(x, y, w, h, radius);
            let Some((cx, cy)) = (match (cx, cy) {
                (Some(cx), Some(cy)) => Some((cx, cy)),
                _ => None,
            }) else {
                continue; // Pixel is in the straight-edge region — leave alone.
            };

            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let dist_sq = dx * dx + dy * dy;

            if dist_sq <= radius_sq {
                continue; // Inside the rounded region — keep original alpha.
            }

            // Anti-aliased 1px falloff ring just outside the radius.
            let dist = dist_sq.sqrt();
            let edge = dist - radius;
            let pixel = out.get_pixel_mut(x, y);
            if edge >= 1.0 {
                pixel[3] = 0;
            } else {
                let factor = 1.0 - edge; // 0..1
                pixel[3] = (pixel[3] as f32 * factor).round().clamp(0.0, 255.0) as u8;
            }
        }
    }

    Ok(Image::new_owned(out.into_raw(), w, h))
}

/// If the pixel is in one of the four corner quadrants, returns the center of
/// that corner's rounding circle. Otherwise returns `(None, None)` meaning the
/// pixel is in the straight edge region and should not be masked.
fn corner_center(x: u32, y: u32, w: u32, h: u32, radius: f32) -> (Option<f32>, Option<f32>) {
    let r = radius as u32;
    let cx = if x < r {
        Some(r as f32)
    } else if x >= w - r {
        Some((w - r) as f32)
    } else {
        None
    };
    let cy = if y < r {
        Some(r as f32)
    } else if y >= h - r {
        Some((h - r) as f32)
    } else {
        None
    };
    (cx, cy)
}

pub fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Greenseer", true, None::<&str>)?;
    let scrape = MenuItem::with_id(app, "scrape_now", "Run Scrape Now", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause Scraping", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open, &scrape, &pause, &quit])?;

    // Fall back to the square default icon if rounding fails for any reason —
    // the app should always start with *some* tray icon.
    let tray_icon = rounded_tray_icon().unwrap_or_else(|err| {
        eprintln!("Failed to build rounded tray icon, using default: {err}");
        app.default_window_icon().unwrap().clone()
    });

    TrayIconBuilder::new()
        .icon(tray_icon)
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
