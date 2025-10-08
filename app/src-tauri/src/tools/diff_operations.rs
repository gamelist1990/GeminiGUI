/**
 * Diff Application Tools
 * 
 * Rust implementation for applying diffs to files:
 * - apply_diff: Apply unified diff format to a file
 */

use std::fs;
use std::path::Path;

#[allow(dead_code)]
#[derive(serde::Deserialize)]
pub struct DiffHunk {
    old_start: usize,
    old_count: usize,
    new_start: usize,
    new_count: usize,
    lines: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct ApplyDiffResult {
    success: bool,
    message: String,
    lines_changed: usize,
    lines_added: usize,
    lines_removed: usize,
}

#[tauri::command]
pub fn tool_apply_diff(
    path: String,
    diff_content: String,
) -> Result<ApplyDiffResult, String> {
    let file_path = Path::new(&path);
    
    // Check if file exists
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    // Read original file content
    let original_content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let mut original_lines: Vec<String> = original_content.lines().map(|s| s.to_string()).collect();

    // Parse diff content (simplified unified diff format)
    let diff_lines: Vec<&str> = diff_content.lines().collect();
    
    let mut lines_added = 0;
    let mut lines_removed = 0;
    let mut current_line = 0;

    let mut i = 0;
    while i < diff_lines.len() {
        let line = diff_lines[i];
        
        // Parse hunk header (e.g., @@ -1,3 +1,4 @@)
        if line.starts_with("@@") {
            if let Some(hunk_info) = parse_hunk_header(line) {
                current_line = hunk_info.0 - 1; // Convert to 0-based index
            }
            i += 1;
            continue;
        }

        // Process diff lines
        if line.starts_with("-") && !line.starts_with("---") {
            // Remove line
            if current_line < original_lines.len() {
                original_lines.remove(current_line);
                lines_removed += 1;
            }
        } else if line.starts_with("+") && !line.starts_with("+++") {
            // Add line
            let new_line = line[1..].to_string();
            original_lines.insert(current_line, new_line);
            lines_added += 1;
            current_line += 1;
        } else if line.starts_with(" ") {
            // Context line (no change)
            current_line += 1;
        } else if line.starts_with("---") || line.starts_with("+++") {
            // File headers, skip
        }
        
        i += 1;
    }

    // Write modified content back to file
    let new_content = original_lines.join("\n");
    fs::write(&path, new_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    let lines_changed = lines_added + lines_removed;

    Ok(ApplyDiffResult {
        success: true,
        message: format!("Successfully applied diff to {}", path),
        lines_changed,
        lines_added,
        lines_removed,
    })
}

// Parse unified diff hunk header
// Format: @@ -old_start,old_count +new_start,new_count @@
fn parse_hunk_header(line: &str) -> Option<(usize, usize, usize, usize)> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 3 {
        return None;
    }

    // Parse old range (-old_start,old_count)
    let old_part = parts[1].trim_start_matches('-');
    let old_parts: Vec<&str> = old_part.split(',').collect();
    let old_start = old_parts.get(0)?.parse::<usize>().ok()?;
    let old_count = old_parts.get(1).and_then(|s| s.parse::<usize>().ok()).unwrap_or(1);

    // Parse new range (+new_start,new_count)
    let new_part = parts[2].trim_start_matches('+');
    let new_parts: Vec<&str> = new_part.split(',').collect();
    let new_start = new_parts.get(0)?.parse::<usize>().ok()?;
    let new_count = new_parts.get(1).and_then(|s| s.parse::<usize>().ok()).unwrap_or(1);

    Some((old_start, old_count, new_start, new_count))
}
