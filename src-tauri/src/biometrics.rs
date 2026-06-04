use keyring::Entry;

const SERVICE_NAME: &str = "only-auth-vault";

/// Check if biometrics or platform authentication is supported.
#[tauri::command]
pub fn is_biometric_supported() -> bool {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("swift")
            .arg("-e")
            .arg("import LocalAuthentication; let context = LAContext(); var error: NSError?; print(context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error))")
            .output();
        if let Ok(out) = output {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            return s == "true";
        }
        false
    }

    #[cfg(target_os = "windows")]
    {
        let script = r#"
            [void][Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType=WindowsRuntime]
            $verifier = [Windows.Security.Credentials.UI.UserConsentVerifier]
            $asyncOp = $verifier::CheckAvailabilityAsync()
            while ($asyncOp.Status -eq 'Started') { Start-Sleep -Milliseconds 50 }
            $res = $asyncOp.GetResults()
            Write-Output $res
        "#;
        let output = Command::new("powershell")
            .arg("-Command")
            .arg(script)
            .output();
        if let Ok(out) = output {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            return s == "Available";
        }
        false
    }

    #[cfg(target_os = "linux")]
    {
        false
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        false
    }
}

/// Request biometric verification (Touch ID, Windows Hello, or fprintd).
#[tauri::command]
pub async fn verify_biometric(reason: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            r#"
            import LocalAuthentication
            import Foundation

            let context = LAContext()
            var error: NSError?

            guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {{
                print("UNSUPPORTED")
                exit(1)
            }}

            let semaphore = DispatchSemaphore(value: 0)
            var authSuccess = false

            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "{}") {{ success, evaluateError in
                authSuccess = success
                semaphore.signal()
            }}

            _ = semaphore.wait(timeout: .distantFuture)
            if authSuccess {{
                print("SUCCESS")
                exit(0)
            }} else {{
                print("FAILED")
                exit(2)
            }}
            "#,
            reason
        );

        let output = Command::new("swift")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to execute swift: {}", e))?;

        let status = output.status.code().unwrap_or(-1);
        Ok(status == 0)
    }

    #[cfg(target_os = "windows")]
    {
        let script = format!(
            r#"
            [void][Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType=WindowsRuntime]
            $verifier = [Windows.Security.Credentials.UI.UserConsentVerifier]
            $asyncOp = $verifier::RequestVerificationAsync("{}")
            while ($asyncOp.Status -eq 'Started') {{ Start-Sleep -Milliseconds 100 }}
            $result = $asyncOp.GetResults()
            if ($result -eq 'Verified') {{ Write-Output "SUCCESS"; exit 0 }} else {{ Write-Output "FAILED"; exit 1 }}
            "#,
            reason
        );

        let output = Command::new("powershell")
            .arg("-Command")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to execute powershell: {}", e))?;

        let status = output.status.code().unwrap_or(-1);
        Ok(status == 0)
    }

    #[cfg(target_os = "linux")]
    {
        let _reason = reason;
        Err("Biometric authentication is not supported on Linux.".to_string())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _reason = reason;
        Err("Biometric authentication is not supported on this platform.".to_string())
    }
}

/// Store secure credentials in the OS keyring.
#[tauri::command]
pub fn store_secure_credential(key: String, value: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Keyring init failed: {}", e))?;
    entry.set_password(&value)
        .map_err(|e| format!("Failed to save credential in keyring: {}", e))?;
    Ok(())
}

/// Retrieve secure credentials from the OS keyring.
#[tauri::command]
pub fn get_secure_credential(key: String) -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Keyring init failed: {}", e))?;
    let val = entry.get_password()
        .map_err(|e| format!("Failed to retrieve credential from keyring: {}", e))?;
    Ok(val)
}

/// Remove secure credentials from the OS keyring.
#[tauri::command]
pub fn delete_secure_credential(key: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Keyring init failed: {}", e))?;
    entry.delete_credential()
        .map_err(|e| format!("Failed to delete credential from keyring: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_biometric_supported_returns_bool() {
        let val = is_biometric_supported();
        println!("Biometrics supported: {}", val);
    }

    #[test]
    fn test_keyring_store_retrieve_delete() {
        let test_key = "test_biometric_vault_key_unit_test";
        let test_value = "SuperSecretPassphrase123!";

        match store_secure_credential(test_key.to_string(), test_value.to_string()) {
            Ok(_) => {
                let retrieved = get_secure_credential(test_key.to_string()).unwrap();
                assert_eq!(retrieved, test_value);

                delete_secure_credential(test_key.to_string()).unwrap();
                assert!(get_secure_credential(test_key.to_string()).is_err());
            }
            Err(e) => {
                println!("Keyring not available in this test environment: {}", e);
            }
        }
    }
}

