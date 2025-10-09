// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Modern Tool System - Modular Architecture
mod tools;

// Agent System - Autonomous AI operation
mod agent;

use std::sync::Arc;
use tauri::Manager;

//本プロジェクトでは主にRustを一切(登録以外)使わず, Tsxとtsのみで完結させます。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize agent state manager
    let agent_state = Arc::new(agent::AgentStateManager::new());

    tauri::Builder::default()
        .manage(agent_state)
        // If ENABLE_DEVTOOLS env var is set, open the main window devtools on startup
        .setup(|app| {
            if std::env::var("ENABLE_DEVTOOLS").is_ok() {
                if let Some(window) = app.get_webview_window("main") {
                    // Best-effort: try to open devtools for the main window
                    let _ = window.open_devtools();
                }
            }

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            // File operations
            tools::tool_read_file,
            tools::tool_write_file,
            tools::tool_delete_file,
            tools::tool_move_file,
            // Directory operations
            tools::tool_list_directory,
            tools::tool_create_directory,
            // Search operations
            tools::tool_search_files,
            // Command operations
            tools::tool_run_command,
            // File check operations
            tools::tool_file_check,
            // Diff operations
            tools::tool_apply_diff,
            // Fetch operations
            tools::tool_fetch,
            // Agent operations
            agent::agent_update_task_progress,
            agent::agent_send_user_message,
            agent::agent_get_task_progress,
            agent::agent_get_user_messages,
            agent::agent_clear_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
