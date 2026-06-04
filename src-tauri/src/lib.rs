mod crypto;
mod storage;
mod biometrics;
mod biometric;

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
use biometrics::{
    is_biometric_supported, verify_biometric,
    store_secure_credential, get_secure_credential, delete_secure_credential
};

/// The main entry point to run the Tauri application, registering plugins,
/// handlers, and initializing the main window setup hooks.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_biometry::init())
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
            export_file,
            is_biometric_supported,
            verify_biometric,
            store_secure_credential,
            get_secure_credential,
            delete_secure_credential,
            biometric::store_biometric_key,
            biometric::retrieve_biometric_key,
            biometric::delete_biometric_key,
            biometric::is_biometric_enrolled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

