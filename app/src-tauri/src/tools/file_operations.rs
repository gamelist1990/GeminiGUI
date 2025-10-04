/**
 * File Operations Tools
 * 
 * Rust implementation for file operations:
 * - read_file: Read file contents
 * - write_file: Write content to file
 * - delete_file: Delete a file
 * - move_file: Move or rename a file
 */

use std::fs;
use std::path::Path;

#[tauri::command]
pub fn tool_read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

#[tauri::command]
pub fn tool_write_file(path: String, content: String) -> Result<(), String> {
    // Create parent directories if they don't exist
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }
    
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

#[tauri::command]
pub fn tool_delete_file(path: String) -> Result<(), String> {
    let file_path = Path::new(&path);
    
    if file_path.is_file() {
        fs::remove_file(file_path)
            .map_err(|e| format!("Failed to delete file '{}': {}", path, e))
    } else if file_path.is_dir() {
        fs::remove_dir_all(file_path)
            .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))
    } else {
        Err(format!("Path does not exist: {}", path))
    }
}

#[tauri::command]
pub fn tool_move_file(source: String, destination: String) -> Result<(), String> {
    // Create parent directories for destination if they don't exist
    if let Some(parent) = Path::new(&destination).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create destination parent directories: {}", e))?;
    }
    
    fs::rename(&source, &destination)
        .map_err(|e| format!("Failed to move file from '{}' to '{}': {}", source, destination, e))
}
