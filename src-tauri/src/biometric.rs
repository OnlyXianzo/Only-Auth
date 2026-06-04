use keyring::Entry;
use tauri::command;
use zeroize::Zeroizing;

const SERVICE: &str = "only-auth";
const BIOMETRIC_KEY_ACCOUNT: &str = "biometric-master-key";

/// Store the master key in OS keychain after successful biometric enrollment.
/// Called ONLY after Argon2id verification succeeds in the enrollment flow.
/// The key_hex is the 32-byte master key as hex — zeroized after storage.
#[command]
pub fn store_biometric_key(key_hex: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, BIOMETRIC_KEY_ACCOUNT)
        .map_err(|e| format!("Keychain init failed: {e}"))?;
    
    let result = entry.set_password(&key_hex)
        .map_err(|e| format!("Keychain store failed: {e}"));
    
    // Zeroize regardless of result
    let key = Zeroizing::new(key_hex);
    drop(key);
    
    result
}

/// Retrieve the master key from OS keychain.
/// The OS biometric gate must be passed BEFORE calling this from the frontend.
/// Returns the 32-byte master key as hex, caller must zeroize after use.
#[command]
pub fn retrieve_biometric_key() -> Result<String, String> {
    let entry = Entry::new(SERVICE, BIOMETRIC_KEY_ACCOUNT)
        .map_err(|e| format!("Keychain init failed: {e}"))?;
    
    entry.get_password()
        .map_err(|e| match e {
            keyring::Error::NoEntry => "BIOMETRIC_NOT_ENROLLED".to_string(),
            _ => format!("Keychain retrieve failed: {e}"),
        })
}

/// Delete the master key from OS keychain.
/// Called on: passphrase change, biometric disable, duress wipe.
#[command]
pub fn delete_biometric_key() -> Result<(), String> {
    let entry = Entry::new(SERVICE, BIOMETRIC_KEY_ACCOUNT)
        .map_err(|e| format!("Keychain init failed: {e}"))?;
    
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // already gone, not an error
        Err(e) => Err(format!("Keychain delete failed: {e}")),
    }
}

/// Check if a biometric-gated key exists in the keychain.
/// Does NOT perform biometric auth — just presence check.
#[command]
pub fn is_biometric_enrolled() -> bool {
    Entry::new(SERVICE, BIOMETRIC_KEY_ACCOUNT)
        .and_then(|e| e.get_password())
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_biometric_key_store_retrieve_delete() {
        let test_key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string();

        match store_biometric_key(test_key.clone()) {
            Ok(_) => {
                assert!(is_biometric_enrolled());
                let retrieved = retrieve_biometric_key().unwrap();
                assert_eq!(retrieved, test_key);

                delete_biometric_key().unwrap();
                assert!(!is_biometric_enrolled());
            }
            Err(e) => {
                println!("Keyring not available in this test environment: {}", e);
            }
        }
    }
}
