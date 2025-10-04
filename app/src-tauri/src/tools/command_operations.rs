/**
 * Command Execution Tools
 * 
 * Rust implementation for command execution:
 * - run_command: Execute PowerShell commands with UTF-8 encoding
 */

use std::process::Command;

#[tauri::command]
pub fn tool_run_command(
    command: String,
    args: Option<Vec<String>>,
    working_dir: Option<String>,
) -> Result<serde_json::Value, String> {
    // Validate command is PowerShell for security
    if !command.to_lowercase().contains("powershell.exe") && !command.eq("powershell") {
        return Err(format!("Only PowerShell commands are allowed for security reasons"));
    }

    let mut cmd = Command::new("powershell.exe");
    
    // Build command string from args
    let command_str = if let Some(arg_list) = args.as_ref() {
        if arg_list.is_empty() {
            String::new()
        } else {
            // Join all args into a single command string
            arg_list.join(" ")
        }
    } else {
        String::new()
    };
    
    // Set UTF-8 encoding and execute command
    cmd.args(&[
        "-NoProfile",
        "-NoLogo",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        &format!("[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; {}", command_str)
    ]);

    // Set working directory if provided
    if let Some(dir) = working_dir {
        cmd.current_dir(&dir);
    }

    // Execute command
    let output = cmd.output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    // Convert output to UTF-8 strings
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().unwrap_or(-1);

    // Return structured result
    Ok(serde_json::json!({
        "stdout": stdout,
        "stderr": stderr,
        "exitCode": exit_code,
        "success": output.status.success()
    }))
}
