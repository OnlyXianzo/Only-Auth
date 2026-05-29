mod crypto;
mod storage;

use crypto::{
    validate_base32, generate_secret, generate_totp_batch, 
    argon2id_hash, argon2id_verify, secure_compare, 
    encrypt_backup, decrypt_backup, set_window_screenshot_protection,
    encrypt_metadata, decrypt_metadata
};
use storage::{
    load_vault_data, save_vault_data,
    write_audit_log, read_audit_logs
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            validate_base32,
            generate_secret,
            generate_totp_batch,
            load_vault_data,
            save_vault_data,
            argon2id_hash,
            argon2id_verify,
            secure_compare,
            encrypt_backup,
            decrypt_backup,
            write_audit_log,
            read_audit_logs,
            set_window_screenshot_protection,
            encrypt_metadata,
            decrypt_metadata
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
