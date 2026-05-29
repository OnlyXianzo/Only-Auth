# Only Auth Features

Only Auth provides a comprehensive suite of tools for secure 2FA management, combining high-end security with a premium user experience.

## Security and Privacy Features

### 1. Ghost Mode (Hidden Vault)
Ghost Mode allows users to create a secondary, hidden vault layer. By naming a tag `hidden` or `hide`, the system establishes a separate encrypted enclave.
*   **Invisible by Default:** Accounts in the hidden vault are excluded from all standard lists and search results.
*   **Search-Based Unlocking:** The vault is only unsealed by typing a specific passcode directly into the dashboard search bar.
*   **Auto-Reseal:** The hidden vault instantly re-seals upon focus loss or navigation.

### 2. Panic and Duress Mechanisms
*   **Duress PIN:** A secondary PIN that, when entered, can trigger a silent "wipe" of the vault or transition to a "fake" empty state, providing plausible deniability in high-risk situations.
*   **Failed Attempt Lockout:** After 5 consecutive incorrect PIN attempts, the system locks out quick access and requires the master recovery passphrase to reset security credentials.

### 3. Privacy Protections
*   **Anti-Screenshot:** Platform-native hooks prevent unauthorized screen captures of the application window.
*   **Active Blur Masking:** The UI automatically applies a clinical blur overlay when the application window loses focus.
*   **Clipboard Auto-Wipe:** Copied TOTP codes are automatically cleared from the system clipboard after 30 seconds, accompanied by a countdown notification.

## Organization and UX

### 1. Dynamic Tagging System
Only Auth replaces complex folder structures with a flexible tagging system. Accounts can be categorized, filtered, and searched based on custom labels like "Personal", "Work", or "Finance".

### 2. Premium Clinical UI
The interface follows a "Clinical" design aesthetic, utilizing sub-pixel neon accents, organic glassmorphism, and micro-animations to provide a professional, bespoke feel.
*   **Brand Logo Engine:** Automatically fetches and displays brand logos for recognized services, falling back to stylish initials for custom entries.
*   **Batch TOTP Generation:** A unified Rust bridge generates codes for all visible accounts in a single pass, ensuring zero lag and optimal performance.

### 3. Import and Export
Only Auth supports seamless migration with dedicated parsers for:
*   Encrypted and Decrypted JSON backups.
*   Ente Auth JSON imports.
*   Bitwarden JSON exports (parsing `otpauth://` URIs).
*   HMAC-sealed AES-GCM local backups.
