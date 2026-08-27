//! Window action commands: minimize, maximize, close, and window dragging.

use tauri::WebviewWindow;

/// Minimizes the active application window.
#[tauri::command]
pub async fn minimize_window(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

/// Toggles between maximized and restored window states.
#[tauri::command]
pub async fn toggle_maximize_window(window: WebviewWindow) -> Result<bool, String> {
    let is_max = window.is_maximized().unwrap_or(false);
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

/// Checks if the application window is currently maximized.
#[tauri::command]
pub async fn is_window_maximized(window: WebviewWindow) -> Result<bool, String> {
    Ok(window.is_maximized().unwrap_or(false))
}

/// Closes the active application window.
#[tauri::command]
pub async fn close_window(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

/// Begins native window dragging when the user holds down the mouse button on the titlebar.
#[tauri::command]
pub async fn start_dragging(window: WebviewWindow) -> Result<(), String> {
    let _ = window.start_dragging();
    Ok(())
}
