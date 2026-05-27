mod crypto;
mod storage;

use crypto::{validate_base32, generate_secret, generate_totp_batch};
use storage::{load_vault_data, save_vault_data};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            validate_base32,
            generate_secret,
            generate_totp_batch,
            load_vault_data,
            save_vault_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
