use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use zeroize::Zeroize;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce
};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultAccount {
    pub id: String,
    pub name: String,
    pub email: String,
    pub secret: String,
    pub notes: String,
    pub category: String,
    pub is_pinned: bool,
    pub logo_type: String,
    pub color: Option<String>,
    pub tags: Option<Vec<String>>,
    pub created_at: String,
    pub digits: Option<u32>,
    pub period: Option<u64>,
    pub algorithm: Option<String>,
    pub next_rotation_date: Option<String>,
}

fn get_storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_data_dir().map_err(|_| "Failed to get app data directory".to_string())?;
    
    // Ensure the directory exists
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    
    path.push("vault_accounts.json");
    Ok(path)
}

#[tauri::command]
pub fn load_vault_data(app: AppHandle) -> Result<Vec<VaultAccount>, String> {
    let path = get_storage_path(&app)?;
    
    if !path.exists() {
        return Ok(Vec::new());
    }
    
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let accounts: Vec<VaultAccount> = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    
    Ok(accounts)
}

#[tauri::command]
pub fn save_vault_data(app: AppHandle, mut accounts: Vec<VaultAccount>) -> Result<(), String> {
    let path = get_storage_path(&app)?;
    
    let mut json_data = serde_json::to_string(&accounts).map_err(|e| e.to_string())?;
    
    fs::write(&path, &json_data).map_err(|e| e.to_string())?;
    
    // Explicit memory zeroing routine for the serialized buffer
    json_data.zeroize();
    
    // Also zero out the secrets in the accounts array we received in memory
    for acc in &mut accounts {
        acc.secret.zeroize();
    }
    
    Ok(())
}

#[tauri::command]
pub fn write_audit_log(app: AppHandle, event: String, key_hex: Option<String>) -> Result<(), String> {
    let path = app.path().app_data_dir().map_err(|_| "Failed to get app data directory".to_string())?;
    
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let log_line = format!("{}|{}", timestamp, event);

    if let Some(kh) = key_hex {
        // Enclave is unlocked. Let's write to the encrypted log file directly.
        let key_bytes = data_encoding::HEXLOWER.decode(kh.as_bytes()).map_err(|e| e.to_string())?;
        if key_bytes.len() != 32 {
            return Err("Invalid log key length".to_string());
        }

        // We also want to flush any pending plain failed attempts from disk
        let mut pending_lines = Vec::new();
        let mut failed_path = path.clone();
        failed_path.push("failed_attempts.json");
        if failed_path.exists() {
            if let Ok(data) = fs::read_to_string(&failed_path) {
                if let Ok(list) = serde_json::from_str::<Vec<String>>(&data) {
                    pending_lines = list;
                }
            }
            let _ = fs::remove_file(&failed_path);
        }

        // Encrypt the log lines and append to encrypted log file
        let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
        
        let mut enc_path = path.clone();
        enc_path.push("audit_trail.enc");
        
        // Open file in append mode or read/write
        let mut logs = Vec::new();
        if enc_path.exists() {
            if let Ok(existing_bytes) = fs::read(&enc_path) {
                logs = existing_bytes;
            }
        }

        // Encrypt each line and write it
        for line in pending_lines.into_iter().chain(std::iter::once(log_line)) {
            use rand::RngCore;
            let mut nonce_bytes = [0u8; 12];
            rand::thread_rng().fill_bytes(&mut nonce_bytes);
            let nonce = Nonce::from_slice(&nonce_bytes);
            
            if let Ok(ciphertext) = cipher.encrypt(nonce, line.as_bytes()) {
                // Save format: NONCE_HEX:CIPHERTEXT_HEX\n
                let formatted = format!(
                    "{}:{}\n",
                    data_encoding::HEXLOWER.encode(&nonce_bytes),
                    data_encoding::HEXLOWER.encode(&ciphertext)
                );
                logs.extend_from_slice(formatted.as_bytes());
            }
        }
        
        fs::write(&enc_path, &logs).map_err(|e| e.to_string())?;
    } else {
        // Vault is locked. Write event to plain temporary queue.
        let mut failed_path = path.clone();
        failed_path.push("failed_attempts.json");
        
        let mut list = Vec::new();
        if failed_path.exists() {
            if let Ok(data) = fs::read_to_string(&failed_path) {
                if let Ok(existing) = serde_json::from_str::<Vec<String>>(&data) {
                    list = existing;
                }
            }
        }
        list.push(log_line);
        let serialized = serde_json::to_string(&list).map_err(|e| e.to_string())?;
        fs::write(&failed_path, &serialized).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn read_audit_logs(app: AppHandle, key_hex: String) -> Result<Vec<String>, String> {
    let mut path = app.path().app_data_dir().map_err(|_| "Failed to get app data directory".to_string())?;
    path.push("audit_trail.enc");

    if !path.exists() {
        return Ok(Vec::new());
    }

    let key_bytes = data_encoding::HEXLOWER.decode(key_hex.as_bytes()).map_err(|e| e.to_string())?;
    if key_bytes.len() != 32 {
        return Err("Invalid log key length".to_string());
    }

    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() != 2 {
            continue;
        }

        if let Ok(nonce_bytes) = data_encoding::HEXLOWER.decode(parts[0].as_bytes()) {
            if let Ok(ciphertext) = data_encoding::HEXLOWER.decode(parts[1].as_bytes()) {
                let nonce = Nonce::from_slice(&nonce_bytes);
                if let Ok(decrypted_bytes) = cipher.decrypt(nonce, ciphertext.as_slice()) {
                    if let Ok(decrypted_str) = String::from_utf8(decrypted_bytes) {
                        results.push(decrypted_str);
                    }
                }
            }
        }
    }

    Ok(results)
}

