//! Desktop shell for Prompt Converter: reuses the web frontend, adds a global hotkey that toggles a
//! compact always-on-top quick-convert window, a tray icon (show / quick / autostart / quit), and
//! native HTTP so provider CORS rules don't apply.
use std::sync::Mutex;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const DEFAULT_HOTKEY: &str = "CommandOrControl+Shift+Space";
const HOTKEY_FILE: &str = "hotkey.txt";

struct AppState {
    hotkey: Mutex<String>,
    autostart_item: Mutex<Option<CheckMenuItem<tauri::Wry>>>,
}

fn quick_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window("quick") {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, "quick", WebviewUrl::App("index.html#quick".into()))
        .title("Quick Convert · 快速转换")
        .inner_size(600.0, 440.0)
        .min_inner_size(420.0, 300.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .visible(false)
        .center()
        .build()?;
    let handle = w.clone();
    w.on_window_event(move |e| {
        if let WindowEvent::CloseRequested { api, .. } = e {
            api.prevent_close();
            let _ = handle.hide();
        }
    });
    Ok(w)
}

fn toggle_quick(app: &AppHandle) {
    let Ok(w) = quick_window(app) else { return };
    if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) {
        let _ = w.hide();
    } else {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_always_on_top(true);
        let _ = w.set_focus();
        let _ = w.emit_to("quick", "quick-shown", ());
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn hotkey_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(HOTKEY_FILE))
}

fn register_hotkey(app: &AppHandle, accel: &str) -> Result<(), String> {
    let sc: Shortcut = accel.parse().map_err(|e| format!("invalid shortcut: {e}"))?;
    let gs = app.global_shortcut();
    let state = app.state::<AppState>();
    let mut cur = state.hotkey.lock().unwrap();
    if !cur.is_empty() {
        if let Ok(old) = cur.parse::<Shortcut>() {
            let _ = gs.unregister(old);
        }
    }
    if let Err(e) = gs.register(sc) {
        // Try to restore the previous one so the user isn't left without a hotkey.
        if let Ok(old) = cur.parse::<Shortcut>() {
            let _ = gs.register(old);
        }
        return Err(e.to_string());
    }
    *cur = accel.to_string();
    Ok(())
}

#[tauri::command]
fn set_hotkey(app: AppHandle, accel: String) -> Result<(), String> {
    register_hotkey(&app, &accel)?;
    if let Some(p) = hotkey_path(&app) {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(p, &accel);
    }
    Ok(())
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let al = app.autolaunch();
    if enabled { al.enable() } else { al.disable() }.map_err(|e| e.to_string())?;
    if let Some(item) = app.state::<AppState>().autostart_item.lock().unwrap().as_ref() {
        let _ = item.set_checked(enabled);
    }
    Ok(())
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    apply_autostart(&app, enabled)
}

#[tauri::command]
fn hide_quick(app: AppHandle) {
    if let Some(w) = app.get_webview_window("quick") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn show_main(app: AppHandle) {
    hide_quick(app.clone());
    show_main_window(&app);
}

/// Hide the quick window, give focus back to the previous app, then send Ctrl/⌘+V.
#[tauri::command]
async fn paste_back(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("quick") {
        let _ = w.hide();
    }
    std::thread::sleep(std::time::Duration::from_millis(180));
    std::thread::spawn(|| -> Result<(), String> {
        use enigo::{Direction, Enigo, Key, Keyboard, Settings};
        let mut e = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
        #[cfg(target_os = "macos")]
        let modifier = Key::Meta;
        #[cfg(not(target_os = "macos"))]
        let modifier = Key::Control;
        e.key(modifier, Direction::Press).map_err(|e| e.to_string())?;
        e.key(Key::Unicode('v'), Direction::Click).map_err(|e| e.to_string())?;
        e.key(modifier, Direction::Release).map_err(|e| e.to_string())?;
        Ok(())
    })
    .join()
    .map_err(|_| "paste thread panicked".to_string())?
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| e.to_string())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let zh = !sys_locale_is_en();
    let show = MenuItem::with_id(app, "show", if zh { "显示主窗口" } else { "Show window" }, true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick", if zh { "快速转换" } else { "Quick convert" }, true, None::<&str>)?;
    let auto_on = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(app, "autostart", if zh { "开机自启动" } else { "Launch at login" }, true, auto_on, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", if zh { "退出" } else { "Quit" }, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &quick, &sep, &autostart, &sep2, &quit])?;
    *app.state::<AppState>().autostart_item.lock().unwrap() = Some(autostart.clone());

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Prompt Converter · 提示词转换器")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, ev| match ev.id().as_ref() {
            "show" => show_main_window(app),
            "quick" => toggle_quick(app),
            "autostart" => {
                let want = !app.autolaunch().is_enabled().unwrap_or(false);
                let _ = apply_autostart(app, want);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn sys_locale_is_en() -> bool {
    let l = std::env::var("LANG").or_else(|_| std::env::var("LC_ALL")).unwrap_or_default().to_lowercase();
    !l.is_empty() && !l.starts_with("zh")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app)))
        .plugin(
            // Remember window size/position (but never auto-show the hidden quick window).
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all() & !tauri_plugin_window_state::StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _sc, ev| {
                    if ev.state() == ShortcutState::Pressed {
                        toggle_quick(app);
                    }
                })
                .build(),
        )
        .manage(AppState { hotkey: Mutex::new(String::new()), autostart_item: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![set_hotkey, get_autostart, set_autostart, hide_quick, show_main, write_text_file, paste_back])
        .setup(|app| {
            let handle = app.handle().clone();
            let saved = hotkey_path(&handle)
                .and_then(|p| std::fs::read_to_string(p).ok())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| DEFAULT_HOTKEY.to_string());
            if let Err(e) = register_hotkey(&handle, &saved) {
                eprintln!("[prompt-converter] hotkey {saved} failed: {e}; falling back to default");
                let _ = register_hotkey(&handle, DEFAULT_HOTKEY);
            }
            if let Err(e) = build_tray(&handle) {
                eprintln!("[prompt-converter] tray unavailable: {e}");
            }
            quick_window(&handle)?; // pre-create (hidden) so the hotkey opens instantly
            let main = app.get_webview_window("main").expect("main window");
            if std::env::args().any(|a| a == "--hidden") {
                let _ = main.hide(); // launched at login: stay in the tray
            }
            let m2 = main.clone();
            main.on_window_event(move |e| {
                // Closing the main window keeps the app running in the tray (quit from the tray menu).
                if let WindowEvent::CloseRequested { api, .. } = e {
                    api.prevent_close();
                    let _ = m2.hide();
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Prompt Converter");
}
