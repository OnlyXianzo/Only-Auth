# Architecture Specification

Only Auth is a local-first, zero-knowledge cryptographic vault designed for
TOTP management. The system architecture prioritizes data ownership, memory
safety, and cryptographic rigor.

<!-- prettier-ignore -->
> [!WARNING]
> This architecture is under active development and may change as we address
> early beta feedback and resolve ongoing implementation errors.

## System Overview

The application uses a dual-layer architecture that separates the reactive
frontend from the native cryptographic backend.

- **Native Backend:** Tauri v2 (Rust) manages the filesystem, cryptography, and
  hardware integration.
- **Reactive Frontend:** React 19 and TypeScript provide a high-performance,
  clinical user interface.
- **Encrypted Storage:** SQLCipher provides a secure SQLite container with
  AES-256-GCM encryption for all stored credentials.

## Cryptographic Foundation

The security model relies on a user-derived master key to unlock the encrypted
vault.

- **Key Derivation (KDF):** The system uses Argon2id to derive a 256-bit master
  key from your mnemonic passphrase.
- **Entropy Scheme:** You can choose between 12, 18, or 24-word mnemonic phrases
  during setup, providing up to 256 bits of entropy.
- **Master Key Override:** The system generates a hexadecimal Master Key
  (`oa_sk_...`) that serves as a direct cryptographic backup for your
  passphrase.

## Memory Safety

The application implements strict memory lifecycle management to prevent
sensitive data from lingering in system RAM.

- **Rust Zeroization:** The backend wraps all raw seeds and decoded secrets in
  zeroing allocators. The system overwrites this memory with `0x00`
  immediately after generating a TOTP code.
- **Frontend Scrubbing:** The React layer clears sensitive input buffers during
  view transitions and modal unmounts.
- **IPC Security:** The Inter-Process Communication (IPC) bridge ensures that
  unencrypted secrets are only passed between layers when absolutely necessary.

## Platform Integration

Only Auth leverages Tauri v2 to integrate with native host security features
while maintaining a minimal resource footprint.

- **Native Webview:** The app uses the host's native webview engine (WebKit or
  WebView2), reducing memory usage compared to Electron.
- **Window Protections:** The system hooks into OS-level APIs to prevent screen
  recording and automatically masks the window content when it loses focus.
- **Secure Storage:** Where available, the system utilizes platform-specific
  keychains to further secure the derived master key.
