# Architecture specification

Only Auth is a local-first, zero-knowledge cryptographic vault designed for
time-based one-time password (TOTP) management. The system architecture
prioritizes data ownership, memory safety, and cryptographic rigor.

<!-- prettier-ignore -->
> [!WARNING]
> This architecture is under active development and may change as we address
> early beta feedback and resolve ongoing implementation errors.

## System overview

The application uses a dual-layer architecture that separates the reactive
frontend from the native cryptographic backend.

- **Native backend:** Tauri v2 (Rust) manages the filesystem, cryptography, and
  hardware integration.
- **Reactive frontend:** React 19 and TypeScript provide a high-performance,
  clinical user interface.
- **Encrypted storage:** SQLCipher provides a secure SQLite container with
  AES-256-GCM encryption for all stored credentials.

## Cryptographic foundation

The security model relies on a user-derived master key to unlock the encrypted
vault.

- **Key derivation:** The system uses Argon2id to derive a 256-bit master key
  from your mnemonic passphrase.
- **Entropy scheme:** You can choose between 12, 18, or 24-word mnemonic phrases
  during setup, providing up to 256 bits of entropy.
- **Master key backup:** The system generates a hexadecimal master key
  (`oa_sk_...`) that serves as a direct cryptographic backup for your
  passphrase.

## Memory safety

The application implements strict memory lifecycle management to prevent
sensitive data from lingering in system RAM.

- **Rust zeroization:** The backend wraps all raw seeds and decoded secrets in
  zeroing allocators. The system overwrites this memory with `0x00`
  immediately after generating a TOTP code.
- **Frontend scrubbing:** The React layer clears sensitive input buffers during
  view transitions and modal unmounts.
- **IPC security:** The Inter-Process Communication (IPC) bridge ensures that
  unencrypted secrets are only passed between layers when absolutely necessary.

## Plausible deniability and duress

The database design and execution pipelines support operations under forced
disclosure scenarios.

- **Ghost Mode separation:** Accounts tagged with `hidden` or `hide` are
  completely excluded from standard database queries and index caches. The
  frontend never renders these elements in the standard DOM, preventing visual
  cues or search timing side-channels.
- **Atomic duress wipe:** When you enter a duress PIN, the application triggers
  an immediate deletion sequence. The backend overwrites SQLCipher key headers
  with random bytes before removing the files from the filesystem.

## Platform integration

Only Auth leverages Tauri v2 to integrate with native host security features
while maintaining a minimal resource footprint.

- **Native webview:** The app uses the host's native webview engine (WebKit or
  WebView2), reducing memory usage compared to Electron.
- **Window protections:** The system hooks into OS-level APIs to prevent screen
  recording and automatically masks the window content when it loses focus.
- **Secure storage:** Where available, the system utilizes platform-specific
  keychains to further secure the derived master key.
