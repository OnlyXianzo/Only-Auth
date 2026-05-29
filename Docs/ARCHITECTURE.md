# Only Auth Architecture Specification

Only Auth is engineered as a local-first, zero-knowledge cryptographic vault for 2FA/TOTP management. The system is designed to provide high-security authentication without reliance on centralized cloud services, prioritizing data ownership and privacy.

## System Overview

The application utilizes a dual-layer architecture consisting of a native cryptographic backend and a reactive frontend.

### Core Tech Stack
*   **Backend:** Tauri v2 (Rust)
*   **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
*   **Storage:** SQLCipher (SQLite with AES-256-GCM row-level encryption)

## Security Layers

### 1. Key Derivation Function (KDF)
Only Auth employs Argon2id for deriving the master encryption key from the user's passphrase.
*   **Memory Cost:** 128 MB
*   **Time Cost:** 3 iterations
*   **Parallelism:** 4 threads
This configuration is optimized to resist GPU-accelerated brute-force attacks while maintaining performance on modern desktop hardware.

### 2. Memory Safety and Scrubbing
To prevent secrets from lingering in system RAM, Only Auth implements strict memory lifecycle management:
*   **Rust Zeroization:** All raw cryptographic seeds and decoded Base32 secrets are wrapped in zeroing allocators. The memory space is explicitly overwritten with `0x00` immediately after a TOTP code is generated.
*   **Frontend Transitions:** Sensitive state variables in the React frontend (e.g., input buffers for passphrases and secrets) are manually scrubbed during view transitions and modal unmounts.
*   **Safe Transitions:** Interactive state changes are wrapped in thread stabilizers to prevent concurrent rendering crashes within the WebKit environment.

### 3. Asymmetric Audit Logging
The system maintains a zero-knowledge append-only activity log:
*   **Encryption:** Events are encrypted using a local public key stored on disk.
*   **Access:** The matching private key is itself encrypted using a key derived from the user's master passphrase. Logs can only be decrypted and read after a successful vault unlock.

## Platform Integration

By leveraging Tauri v2, Only Auth utilizes the host operating system's native Webview (Webkit on macOS/Linux, WebView2 on Windows). This results in a significantly reduced memory footprint compared to Electron-based alternatives and allows for deep integration with system-level security features such as native window blur masking and display affinity protections.
