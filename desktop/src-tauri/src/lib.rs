//! Core runner for Dybuk Desktop application

pub mod main_content;
pub mod sidebar;
pub mod titlebar;

use std::sync::Mutex;
use dybuk::SessionStore;
pub use sidebar::commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        session_store: Mutex::new(SessionStore::new()),
    };

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Titlebar Window Actions
            titlebar::actions::minimize_window,
            titlebar::actions::toggle_maximize_window,
            titlebar::actions::is_window_maximized,
            titlebar::actions::close_window,
            titlebar::actions::start_dragging,
            // Titlebar Menu Actions
            titlebar::menu::open_external_url,
            titlebar::menu::open_documentation,
            titlebar::menu::open_report_bug,
            titlebar::menu::open_follow_creator,
            titlebar::menu::open_repository,
            titlebar::menu::exit_application,
            // Document & Sidebar Actions
            sidebar::commands::list_documents,
            sidebar::commands::create_document_cmd,
            sidebar::commands::read_document,
            sidebar::commands::save_document,
            sidebar::commands::lock_vault,
            sidebar::commands::check_vault_unlocked,
            sidebar::commands::get_default_documents_dir,
            sidebar::commands::remove_recent_cmd,
            // Markdown WYSIWYG Actions
            main_content::markdown::render_markdown,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
