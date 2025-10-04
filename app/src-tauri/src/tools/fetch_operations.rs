/**
 * Fetch Operations Tool
 * 
 * Rust implementation for HTTP fetching:
 * - fetch: Fetch content from URLs with timeout and headers support
 */

use serde_json::json;
use std::time::Duration;

#[tauri::command]
pub fn tool_fetch(
    url: String,
    method: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
    timeout: Option<u64>,
) -> Result<serde_json::Value, String> {
    // Validate URL
    if url.is_empty() {
        return Err("URL cannot be empty".to_string());
    }

    // Only allow HTTP/HTTPS protocols for security
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only HTTP and HTTPS protocols are allowed".to_string());
    }

    let method_str = method.unwrap_or_else(|| "GET".to_string()).to_uppercase();
    let timeout_secs = timeout.unwrap_or(30);

    // Build HTTP client with timeout
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .user_agent("GeminiGUI/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Build request
    let mut request_builder = match method_str.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "HEAD" => client.head(&url),
        _ => return Err(format!("Unsupported HTTP method: {}", method_str)),
    };

    // Add custom headers if provided
    if let Some(header_map) = headers {
        for (key, value) in header_map {
            request_builder = request_builder.header(key, value);
        }
    }

    // Execute request
    let start_time = std::time::Instant::now();
    let response = request_builder
        .send()
        .map_err(|e| format!("Failed to send HTTP request: {}", e))?;

    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    // Extract response data
    let status = response.status().as_u16();
    let success = response.status().is_success();
    let headers_map: std::collections::HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let content_type = headers_map
        .get("content-type")
        .cloned()
        .unwrap_or_else(|| "text/plain".to_string());

    // Get response body as text
    let body = response
        .text()
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    // Return structured result
    Ok(json!({
        "success": success,
        "status": status,
        "headers": headers_map,
        "contentType": content_type,
        "body": body,
        "bodyLength": body.len(),
        "elapsedMs": elapsed_ms,
        "url": url,
    }))
}
