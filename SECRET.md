# Security and Safety Features

This document details the advanced safety mechanisms integrated into Only Auth to protect your most sensitive data in high-risk environments.

## Ghost Mode (Hidden Vault)

### What it is
Ghost Mode is a specialized "vault within a vault" designed for plausible deniability. It allows you to maintain a set of accounts that are completely invisible during normal operation.

### Who it is for
This feature is intended for journalists, activists, or security professionals who may be forced to reveal their primary vault but need to keep certain critical credentials hidden.

### How to Access
1.  **Creation:** To create a hidden vault, go to the Tags settings and create a tag named `hidden` or `hide`. You will be prompted to set a secondary passcode (PIN, passphrase, or master key).
2.  **Assignment:** Assign sensitive accounts to this `hidden` tag. They will immediately vanish from your main dashboard and all lists.
3.  **Unlocking:** To reveal these accounts, type your hidden vault passcode directly into the dashboard's **Search Bar**.
4.  **Auto-Seal:** The vault will automatically re-seal the moment you navigate away, search for something else, or the application window loses focus.

## Duress and Panic Systems

### Duress PIN/Passphrase
In high-pressure situations where you are forced to unlock the application, you can enter a pre-configured **Duress PIN**.
*   **Wipe Action:** Silently triggers a complete wipe of the application's local database and settings.
*   **Fake Vault Action:** Opens a pre-configured "fake" empty vault, making it appear as if you have no accounts.

### PIN Lockout (Anti-Brute Force)
To prevent unauthorized access via PIN guessing, Only Auth enforces a strict lockout policy:
*   **5 Failed Attempts:** After 5 consecutive incorrect PIN entries, the quick-unlock PIN is permanently disabled.
*   **Recovery:** Access can only be restored using your full **Master Recovery Passphrase**. Once restored, you must configure a new PIN.

## Operational Privacy

*   **Window Protection:** The application utilizes platform-native APIs to prevent its window from appearing in screenshots, video recordings, or screen shares.
*   **Focus Masking:** When the application window is not active, it is immediately obscured by a blur overlay to prevent shoulder-surfing.
*   **Memory Scrubbing:** All secret data is strictly scrubbed from system RAM using Rust's `zeroize` protocols immediately after use, ensuring no trace is left for memory-dumping tools.
