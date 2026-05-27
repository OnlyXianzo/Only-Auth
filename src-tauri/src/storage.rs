use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use zeroize::Zeroize;

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
