//! Projects subsystem managing folder workspaces, directory scanning, and persistence.
//!
//! Hey there! Welcome to the projects manager for Dybuk.
//! In Dybuk, a "Project" is simply a folder on your computer that contains
//! your notes, documentation, or encrypted vaults (.md, .markdown, .dybuk).
//! This file is responsible for:
//! 1. Asking your OS for a folder through a native directory picker dialog.
//! 2. Recursively scanning that folder for markdown and dybuk files while safely
//!    ignoring heavy folders like node_modules, .git, and target.
//! 3. Saving the list of open projects to a lightweight JSON file (`projects.json`)
//!    so when you reopen Dybuk tomorrow, all your projects are still right here waiting!

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Maximum directory traversal depth to avoid getting stuck in deeply nested loops.
const MAX_SCAN_DEPTH: usize = 10;

/// Maximum number of files to index per project to keep memory and UI performance lightning fast.
const MAX_PROJECT_FILES: usize = 1000;

/// Represents a single Markdown or Dybuk vault file discovered inside a project folder.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectFileEntry {
    /// The full, absolute path on your hard drive (e.g., "C:\Users\You\Notes\idea.dybuk").
    pub path: String,
    /// Just the file name with its extension (e.g., "idea.dybuk").
    pub name: String,
    /// Path relative to the project root with normalized forward slashes (e.g., "subfolder/idea.dybuk").
    /// This makes it super easy and clean to display in the UI!
    pub relative_path: String,
    /// Tells us whether this is an encrypted vault (`true`) or a standard markdown file (`false`).
    pub is_dybuk: bool,
}

/// Represents an entire project folder opened by the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEntry {
    /// The absolute path of the root directory of this project.
    pub path: String,
    /// The user-friendly name of the project (usually the name of the folder itself).
    pub name: String,
    /// All the markdown and dybuk files found within this project.
    pub files: Vec<ProjectFileEntry>,
}

/// Lightweight container used to serialize the list of open project paths to `projects.json`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectsStore {
    /// A list of absolute directory paths that the user has opened as projects.
    pub projects: Vec<String>,
}

/// Helper function to locate where `projects.json` is stored on the user's computer.
/// We store this in the app's dedicated data directory (e.g., AppData on Windows,
/// Application Support on macOS, or .config on Linux).
fn get_projects_store_path(app: &AppHandle) -> PathBuf {
    let base_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    base_dir.join("projects.json")
}

/// Reads the `projects.json` file from disk. If the file doesn't exist yet or has
/// invalid content, we gracefully fall back to an empty project list so the app never crashes!
fn load_projects_store(store_path: &Path) -> ProjectsStore {
    if !store_path.exists() {
        return ProjectsStore::default();
    }

    match fs::read_to_string(store_path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => ProjectsStore::default(),
    }
}

/// Writes the current list of project paths back to `projects.json` on disk.
/// We use pretty printing so it's easy for developers to inspect if needed.
fn save_projects_store(store_path: &Path, store: &ProjectsStore) -> Result<(), String> {
    // Ensure the parent directory (e.g., AppData/Dybuk) exists before saving
    if let Some(parent) = store_path.parent() {
        if !parent.exists() {
            let _ = fs::create_dir_all(parent);
        }
    }

    let serialized = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize projects store: {}", e))?;

    fs::write(store_path, serialized)
        .map_err(|e| format!("Failed to write projects store file: {}", e))?;

    Ok(())
}

/// Checks if a file path ends with `.dybuk` (case-insensitive).
fn is_dybuk_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("dybuk"))
        .unwrap_or(false)
}

/// Checks if a file path ends with `.md` or `.markdown` (case-insensitive).
fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

/// Helper function that lists folder names we should NEVER scan into.
/// For example, `node_modules` can contain tens of thousands of files, and `.git`
/// contains git internals. Skipping these ensures our app stays fast and responsive!
fn is_ignored_directory(dir_name: &str) -> bool {
    let lower = dir_name.to_lowercase();
    // Ignore any hidden directory starting with a dot (like .git, .vscode, .obsidian)
    if lower.starts_with('.') {
        return true;
    }

    // Ignore known heavy development folders
    matches!(
        lower.as_str(),
        "node_modules" | "target" | "dist" | "build" | "out" | "vendor" | "__pycache__" | "temp" | "tmp"
    )
}

/// Recursively scans a directory for Markdown and Dybuk files.
///
/// Parameters:
/// - `root_dir`: The base project directory (used to compute relative paths).
/// - `current_dir`: The directory we are currently inspecting.
/// - `depth`: How deep we currently are from the root (0 = root itself).
/// - `files`: The accumulator list where all found files will be stored.
fn scan_directory_recursive(
    root_dir: &Path,
    current_dir: &Path,
    depth: usize,
    files: &mut Vec<ProjectFileEntry>,
) {
    // Safety guard 1: Don't exceed maximum depth
    if depth > MAX_SCAN_DEPTH {
        return;
    }

    // Safety guard 2: Don't index too many files in one project
    if files.len() >= MAX_PROJECT_FILES {
        return;
    }

    // Try reading entries in the current directory
    let entries = match fs::read_dir(current_dir) {
        Ok(e) => e,
        Err(_) => return, // Permission denied or missing directory; simply skip
    };

    // Collect and sort directory entries for deterministic scan order
    let mut dir_entries: Vec<PathBuf> = entries
        .filter_map(|res| res.ok().map(|e| e.path()))
        .collect();
    dir_entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

    for path in dir_entries {
        if files.len() >= MAX_PROJECT_FILES {
            break;
        }

        if path.is_dir() {
            // Check if this subfolder should be skipped
            if let Some(folder_name) = path.file_name().and_then(|n| n.to_str()) {
                if !is_ignored_directory(folder_name) {
                    // Recurse into valid child folder
                    scan_directory_recursive(root_dir, &path, depth + 1, files);
                }
            }
        } else if path.is_file() {
            let is_dybuk = is_dybuk_file(&path);
            let is_md = is_markdown_file(&path);

            // We only care about Markdown files and Dybuk encrypted vaults
            if is_dybuk || is_md {
                let file_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Untitled")
                    .to_string();

                // Compute clean relative path with forward slashes: e.g. "docs/guide.md"
                let relative = path
                    .strip_prefix(root_dir)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| file_name.clone());

                files.push(ProjectFileEntry {
                    path: path.to_string_lossy().to_string(),
                    name: file_name,
                    relative_path: relative,
                    is_dybuk,
                });
            }
        }
    }
}

/// Scans an entire project directory and builds a full `ProjectEntry` object.
fn build_project_entry(project_path: &Path) -> Option<ProjectEntry> {
    if !project_path.exists() || !project_path.is_dir() {
        return None;
    }

    // Determine the project name from the folder's name (e.g. "MyProject")
    let folder_name = project_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Project")
        .to_string();

    let mut files = Vec::new();
    // Recursively collect all matching files starting at depth 0
    scan_directory_recursive(project_path, project_path, 0, &mut files);

    // Sort files alphabetically by relative path so they look beautiful and neat in the sidebar!
    files.sort_by(|a, b| a.relative_path.to_lowercase().cmp(&b.relative_path.to_lowercase()));

    Some(ProjectEntry {
        path: project_path.to_string_lossy().to_string(),
        name: folder_name,
        files,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// TAURI COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

/// Opens the native OS directory picker dialog, allowing the user to choose a folder.
/// Once selected, the folder is saved to `projects.json`, scanned for files, and returned.
#[tauri::command]
pub async fn open_project_picker(app: AppHandle) -> Result<Option<ProjectEntry>, String> {
    // Show native folder picker asynchronously
    let picked = rfd::AsyncFileDialog::new()
        .set_title("Open Project Folder")
        .pick_folder()
        .await;

    if let Some(folder) = picked {
        let folder_path = folder.path().to_path_buf();
        let path_str = folder_path.to_string_lossy().to_string();

        // Save to projects store so it persists across app reboots
        let store_path = get_projects_store_path(&app);
        let mut store = load_projects_store(&store_path);

        // Avoid duplicate paths in store
        if !store.projects.iter().any(|p| p.eq_ignore_ascii_case(&path_str)) {
            store.projects.push(path_str);
            let _ = save_projects_store(&store_path, &store);
        }

        // Build and return the project entry
        if let Some(project) = build_project_entry(&folder_path) {
            Ok(Some(project))
        } else {
            Err("Failed to index selected project folder".to_string())
        }
    } else {
        // User cancelled the folder picker dialog
        Ok(None)
    }
}

/// Adds a project directory by path, saves it to `projects.json`, and returns the scanned entry.
#[tauri::command]
pub async fn add_project(app: AppHandle, path: String) -> Result<ProjectEntry, String> {
    let folder_path = PathBuf::from(&path);
    if !folder_path.exists() || !folder_path.is_dir() {
        return Err("The specified folder does not exist or is not a directory".to_string());
    }

    let store_path = get_projects_store_path(&app);
    let mut store = load_projects_store(&store_path);

    if !store.projects.iter().any(|p| p.eq_ignore_ascii_case(&path)) {
        store.projects.push(path.clone());
        save_projects_store(&store_path, &store)?;
    }

    build_project_entry(&folder_path).ok_or_else(|| "Failed to index project folder".to_string())
}

/// Lists all saved projects, scanning their current files on disk.
/// If any project directory was deleted or moved, it is automatically pruned from `projects.json`.
#[tauri::command]
pub async fn list_projects(app: AppHandle) -> Result<Vec<ProjectEntry>, String> {
    let store_path = get_projects_store_path(&app);
    let mut store = load_projects_store(&store_path);

    let mut project_entries = Vec::new();
    let mut valid_paths = Vec::new();
    let mut seen_paths = HashSet::new();

    for path_str in &store.projects {
        let path = PathBuf::from(path_str);
        if path.exists() && path.is_dir() {
            let normalized = path.to_string_lossy().to_string();
            if seen_paths.insert(normalized.to_lowercase()) {
                if let Some(entry) = build_project_entry(&path) {
                    project_entries.push(entry);
                    valid_paths.push(normalized);
                }
            }
        }
    }

    // If any invalid or duplicate paths were removed, update projects.json on disk
    if valid_paths != store.projects {
        store.projects = valid_paths;
        let _ = save_projects_store(&store_path, &store);
    }

    Ok(project_entries)
}

/// Removes a project from the sidebar and deletes its record from `projects.json`.
/// Note: This only removes the project from Dybuk's sidebar; it does NOT delete any files on disk!
#[tauri::command]
pub async fn remove_project(app: AppHandle, path: String) -> Result<(), String> {
    let store_path = get_projects_store_path(&app);
    let mut store = load_projects_store(&store_path);

    // Filter out the project we want to remove
    let initial_count = store.projects.len();
    store.projects.retain(|p| !p.eq_ignore_ascii_case(&path));

    if store.projects.len() != initial_count {
        save_projects_store(&store_path, &store)?;
    }

    Ok(())
}
