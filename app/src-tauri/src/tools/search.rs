/**
 * Search Tools
 * 
 * Rust implementation for search operations:
 * - search_files: Search for files by glob pattern
 */

use glob::glob;

#[tauri::command]
pub fn tool_search_files(path: String, pattern: String) -> Result<Vec<String>, String> {
    // Construct the full search pattern
    let search_pattern = if path.ends_with('/') || path.ends_with('\\') {
        format!("{}{}", path, pattern)
    } else {
        format!("{}/{}", path, pattern)
    };
    
    let mut results = Vec::new();
    
    for entry in glob(&search_pattern)
        .map_err(|e| format!("Invalid glob pattern '{}': {}", search_pattern, e))? 
    {
        match entry {
            Ok(path) => {
                results.push(path.display().to_string());
            },
            Err(e) => {
                eprintln!("Error reading glob entry: {}", e);
                // Continue processing other entries
            }
        }
    }
    
    Ok(results)
}
