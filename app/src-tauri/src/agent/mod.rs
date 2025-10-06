/// Agent-specific tools for autonomous AI operation
/// 
/// These tools allow the AI to communicate progress and updates to users
/// in a structured, async manner compatible with both Gemini and OpenAI backends.

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

/// Message type for agent communications
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentMessageType {
    Info,
    Success,
    Warning,
    Error,
}

/// Task progress update structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskProgress {
    pub markdown_content: String,
    pub timestamp: i64,
}

/// User message structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMessage {
    pub message: String,
    pub message_type: AgentMessageType,
    pub timestamp: i64,
}

/// Agent state manager for tracking progress across async operations
pub struct AgentStateManager {
    task_progress: Arc<Mutex<HashMap<String, TaskProgress>>>,
    user_messages: Arc<Mutex<HashMap<String, Vec<UserMessage>>>>,
}

impl AgentStateManager {
    pub fn new() -> Self {
        Self {
            task_progress: Arc::new(Mutex::new(HashMap::new())),
            user_messages: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Update task progress for a session
    pub fn update_task_progress(&self, session_id: String, markdown_content: String) -> Result<TaskProgress, String> {
        let progress = TaskProgress {
            markdown_content,
            timestamp: chrono::Utc::now().timestamp_millis(),
        };

        let mut map = self.task_progress.lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;
        
        map.insert(session_id, progress.clone());
        Ok(progress)
    }

    /// Get current task progress for a session
    pub fn get_task_progress(&self, session_id: &str) -> Option<TaskProgress> {
        self.task_progress.lock().ok()
            .and_then(|map| map.get(session_id).cloned())
    }

    /// Send a user message
    pub fn send_user_message(&self, session_id: String, message: String, message_type: AgentMessageType) -> Result<UserMessage, String> {
        let user_msg = UserMessage {
            message,
            message_type,
            timestamp: chrono::Utc::now().timestamp_millis(),
        };

        let mut map = self.user_messages.lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;
        
        map.entry(session_id)
            .or_insert_with(Vec::new)
            .push(user_msg.clone());
        
        Ok(user_msg)
    }

    /// Get all user messages for a session
    pub fn get_user_messages(&self, session_id: &str) -> Vec<UserMessage> {
        self.user_messages.lock().ok()
            .and_then(|map| map.get(session_id).cloned())
            .unwrap_or_default()
    }

    /// Clear session data (called when session ends)
    pub fn clear_session(&self, session_id: &str) {
        if let Ok(mut progress_map) = self.task_progress.lock() {
            progress_map.remove(session_id);
        }
        if let Ok(mut messages_map) = self.user_messages.lock() {
            messages_map.remove(session_id);
        }
    }
}

/// Tauri command to update task progress
#[tauri::command]
pub async fn agent_update_task_progress(
    session_id: String,
    markdown_content: String,
    state: tauri::State<'_, Arc<AgentStateManager>>,
) -> Result<TaskProgress, String> {
    state.update_task_progress(session_id, markdown_content)
}

/// Tauri command to send user message
#[tauri::command]
pub async fn agent_send_user_message(
    session_id: String,
    message: String,
    message_type: String,
    state: tauri::State<'_, Arc<AgentStateManager>>,
) -> Result<UserMessage, String> {
    let msg_type = match message_type.to_lowercase().as_str() {
        "info" => AgentMessageType::Info,
        "success" => AgentMessageType::Success,
        "warning" => AgentMessageType::Warning,
        "error" => AgentMessageType::Error,
        _ => return Err(format!("Invalid message type: {}", message_type)),
    };

    state.send_user_message(session_id, message, msg_type)
}

/// Tauri command to get current task progress
#[tauri::command]
pub async fn agent_get_task_progress(
    session_id: String,
    state: tauri::State<'_, Arc<AgentStateManager>>,
) -> Result<Option<TaskProgress>, String> {
    Ok(state.get_task_progress(&session_id))
}

/// Tauri command to get user messages
#[tauri::command]
pub async fn agent_get_user_messages(
    session_id: String,
    state: tauri::State<'_, Arc<AgentStateManager>>,
) -> Result<Vec<UserMessage>, String> {
    Ok(state.get_user_messages(&session_id))
}

/// Tauri command to clear session data
#[tauri::command]
pub async fn agent_clear_session(
    session_id: String,
    state: tauri::State<'_, Arc<AgentStateManager>>,
) -> Result<(), String> {
    state.clear_session(&session_id);
    Ok(())
}
