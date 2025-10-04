// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Modern Tool System - Modular Architecture
mod tools;

//本プロジェクトでは主にRustを一切(登録以外)使わず, Tsxとtsのみで完結させます。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            tools::tool_fetch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
