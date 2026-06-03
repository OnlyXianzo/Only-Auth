mod crypto;
mod storage;

use tauri::Manager;
use crypto::{
    validate_base32, generate_secret, generate_totp_batch, 
    argon2id_hash, argon2id_verify, secure_compare, 
    encrypt_backup, decrypt_backup, set_window_screenshot_protection,
    encrypt_metadata, decrypt_metadata,
    validate_import_payload,
};
use storage::{
    load_vault_data, save_vault_data,
    write_audit_log, read_audit_logs, export_file
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_content_protected(true);
            }
            Ok(())
        })
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
            decrypt_metadata,
            validate_import_payload,
            export_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

