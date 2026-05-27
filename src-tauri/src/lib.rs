use std::collections::HashMap;
use zeroize::Zeroize;

#[derive(serde::Deserialize)]
pub struct BatchInput {
    pub id: String,
    pub secret: String,
    pub digits: u32,
    pub period: u64,
}

fn clean_secret(secret: &str) -> String {
    secret.replace([' ', '-', '\n', '\r'], "").to_uppercase()
}

#[tauri::command]
pub fn validate_base32(secret: String) -> Result<bool, String> {
    let cleaned = clean_secret(&secret);
    match data_encoding::BASE32_NOPAD.decode(cleaned.as_bytes()) {
        Ok(mut bytes) => {
            bytes.zeroize();
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub fn generate_secret() -> String {
    let secret = totp_rs::Secret::generate_secret();
    secret.to_encoded().to_string()
}

#[tauri::command]
pub fn generate_totp_batch(accounts: Vec<BatchInput>) -> Result<HashMap<String, String>, String> {
    let mut results = HashMap::new();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();

    for account in accounts {
        let cleaned = clean_secret(&account.secret);
        match data_encoding::BASE32_NOPAD.decode(cleaned.as_bytes()) {
            Ok(mut secret_bytes) => {
                let totp_res = totp_rs::TOTP::new(
                    totp_rs::Algorithm::SHA1,
                    account.digits as usize,
                    1,
                    account.period,
                    secret_bytes.clone(),
                    None,
                    "".to_string(),
                );
                
                match totp_res {
                    Ok(totp) => {
                        let code = totp.generate(now);
                        results.insert(account.id, code);
                    }
                    Err(_) => {
                        results.insert(account.id, "------".to_string());
                    }
                }
                
                secret_bytes.zeroize();
            }
            Err(_) => {
                results.insert(account.id, "------".to_string());
            }
        }
    }
    
    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![validate_base32, generate_secret, generate_totp_batch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_base32_valid() {
        assert_eq!(validate_base32("JBSWY3DPEHPK3PXP".to_string()).unwrap(), true);
    }

    #[test]
    fn test_validate_base32_invalid() {
        assert_eq!(validate_base32("NOT_VALID_!!!!".to_string()).unwrap(), false);
    }

    #[test]
    fn test_generate_secret() {
        let secret = generate_secret();
        assert!(!secret.is_empty());
        assert_eq!(validate_base32(secret).unwrap(), true);
    }

    #[test]
    fn test_totp_generation_rfc6238() {
        let secret = b"12345678901234567890";
        let totp = totp_rs::TOTP::new(
            totp_rs::Algorithm::SHA1,
            8,
            1,
            30,
            secret.to_vec(),
            None,
            "".to_string(),
        ).unwrap();
        let code = totp.generate(59);
        assert_eq!(code, "94287082");
    }
}
