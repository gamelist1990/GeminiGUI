/**
 * Directory Operations Tools
 * 
 * Rust implementation for directory operations:
 * - list_directory: List directory contents
 * - create_directory: Create a new directory
 */

use std::fs;
use std::path::Path;

#[tauri::command]
pub fn tool_list_directory(path: String, recursive: bool) -> Result<Vec<String>, String> {
    let dir_path = Path::new(&path);
    
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }
    
    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }
    
    let mut results = Vec::new();
    
    if recursive {
        list_dir_recursive(dir_path, dir_path, &mut results)
            .map_err(|e| format!("Failed to list directory recursively: {}", e))?;
    } else {
        for entry in fs::read_dir(dir_path)
            .map_err(|e| format!("Failed to read directory '{}': {}", path, e))? 
        {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let file_name = entry.file_name().to_string_lossy().to_string();
            
            // Add trailing slash for directories
            if entry.path().is_dir() {
                results.push(format!("{}/", file_name));
            } else {
                results.push(file_name);
            }
        }
    }
    
    Ok(results)
}

fn list_dir_recursive(
    dir: &Path,
    base: &Path,
    results: &mut Vec<String>
) -> std::io::Result<()> {
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let relative = path.strip_prefix(base)
                .unwrap_or(&path)
                .display()
                .to_string();
            
            // Add trailing slash for directories
            if path.is_dir() {
                results.push(format!("{}/", relative));
                list_dir_recursive(&path, base, results)?;
            } else {
                results.push(relative);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn tool_create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory '{}': {}", path, e))
}
