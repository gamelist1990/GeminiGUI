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
    
    // Set UTF-8 encoding
    cmd.args(&[
        "-NoProfile",
        "-NoLogo",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        &format!("[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; {}", 
                 args.as_ref()
                     .and_then(|a| a.first())
                     .unwrap_or(&String::new()))
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
