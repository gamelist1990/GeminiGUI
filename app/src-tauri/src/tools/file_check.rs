/**
 * File Checking Tools
 * 
 * Rust implementation for file validation:
 * - file_check: Check file for syntax errors, linting issues, etc.
 */

use std::fs;
use std::path::Path;

#[derive(serde::Serialize)]
pub struct FileCheckResult {
    valid: bool,
    errors: Vec<String>,
    warnings: Vec<String>,
    file_type: String,
    line_count: usize,
    encoding: String,
}

#[tauri::command]
pub fn tool_file_check(path: String) -> Result<FileCheckResult, String> {
    let file_path = Path::new(&path);
    
    // Check if file exists
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    // Check if it's a file
    if !file_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    // Read file content
    let content = fs::read(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Detect encoding
    let encoding = if content.starts_with(&[0xEF, 0xBB, 0xBF]) {
        "UTF-8 BOM".to_string()
    } else if is_valid_utf8(&content) {
        "UTF-8".to_string()
    } else {
        "Unknown/Binary".to_string()
    };

    // Try to read as text
    let text = String::from_utf8_lossy(&content);
    let lines: Vec<&str> = text.lines().collect();
    let line_count = lines.len();

    // Determine file type
    let extension = file_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    
    let file_type = match extension {
        "rs" => "Rust",
        "ts" | "tsx" => "TypeScript",
        "js" | "jsx" => "JavaScript",
        "json" => "JSON",
        "toml" => "TOML",
        "md" => "Markdown",
        "txt" => "Text",
        _ => "Unknown",
    };

    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // Basic validation based on file type
    match extension {
        "json" => {
            // Check JSON syntax
            if let Err(e) = serde_json::from_str::<serde_json::Value>(&text) {
                errors.push(format!("Invalid JSON syntax: {}", e));
            }
        }
        "toml" => {
            // Check TOML syntax
            if let Err(e) = toml::from_str::<toml::Value>(&text) {
                errors.push(format!("Invalid TOML syntax: {}", e));
            }
        }
        "ts" | "tsx" | "js" | "jsx" => {
            // Check for common issues
            if text.contains("console.log") {
                warnings.push("Found console.log statement".to_string());
            }
            if text.contains("debugger") {
                warnings.push("Found debugger statement".to_string());
            }
            // Check for unbalanced braces (simple check)
            let open_braces = text.matches('{').count();
            let close_braces = text.matches('}').count();
            if open_braces != close_braces {
                errors.push(format!("Unbalanced braces: {} open, {} close", open_braces, close_braces));
            }
        }
        _ => {}
    }

    // Check for trailing whitespace
    let trailing_whitespace_lines: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, line)| line.ends_with(' ') || line.ends_with('\t'))
        .map(|(i, _)| i + 1)
        .collect();
    
    if !trailing_whitespace_lines.is_empty() && trailing_whitespace_lines.len() < 10 {
        warnings.push(format!("Trailing whitespace on lines: {:?}", trailing_whitespace_lines));
    }

    // Check for very long lines
    let long_lines: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, line)| line.len() > 120)
        .map(|(i, _)| i + 1)
        .collect();
    
    if !long_lines.is_empty() && long_lines.len() < 10 {
        warnings.push(format!("Lines longer than 120 characters: {:?}", long_lines));
    }

    Ok(FileCheckResult {
        valid: errors.is_empty(),
        errors,
        warnings,
        file_type: file_type.to_string(),
        line_count,
        encoding,
    })
}

// Helper function to check if bytes are valid UTF-8
fn is_valid_utf8(bytes: &[u8]) -> bool {
    String::from_utf8(bytes.to_vec()).is_ok()
}
