# Only Auth (Under Development)

A local-first, zero-knowledge TOTP/2FA authenticator and credential manager. Built with Tauri v2, React 19, TypeScript, and SQLCipher encryption. All data stays on your device -- no cloud dependencies, no telemetry, no accounts.

> This project is under active development. The frontend TOTP engine, vault management, and import pipeline are functional. Native SQLCipher integration and P2P sync are in progress.

## Features

- **TOTP Code Generation** -- Real-time 6-digit codes using HMAC-SHA1 with 30-second rolling windows. Batched cryptographic engine runs in the Rust backend.
- **Passphrase & Master Key Vault** -- Crypto-wallet-grade mnemonic entropy scheme (12/18/24 words) with a 256-bit hexadecimal master key derived via Argon2id.
- **PIN & Biometric Unlock** -- Optional quick-unlock PIN (4-8 digits) or platform WebAuthn (Face ID / fingerprint). PIN lockout after 5 failed attempts forces passphrase re-entry.
- **Tag-Based Organization** -- Accounts organized by tags (Personal, Work, Finance, Social) instead of separate vaults. Custom tags managed in Settings.
- **Ghost Vault Mode** -- A hidden, passphrase-gated vault layer accessible only through a search-bar trigger. Accounts tagged as "hidden" are invisible until the correct passcode is entered.
- **Import Pipeline** -- Built-in parsers for Google Authenticator migration URIs, Ente Auth JSON exports, and Bitwarden JSON exports.
- **Backup & Restore** -- Single-file encrypted JSON snapshot of the entire vault. Decryptable only with the original passphrase or master key.
- **Compact Mode** -- Density toggle for power users who prefer tighter spacing and smaller fonts.
- **Dark Theme** -- Deep obsidian glassmorphism interface with vibrant cobalt and electric purple accents. High-contrast typography using Geist (display) and Inter (body).
- **Cross-Platform** -- Desktop (Windows, macOS, Linux) via Tauri v2 native webview. The frontend can also be bundled as a web extension (Manifest V3).

## Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | UI shell, TOTP generation, account CRUD, import pipeline | Done |
| 2 | Native SQLCipher + Argon2id in Rust backend, vault persistence | In progress |
| 3 | Camera QR scanner, Google Authenticator migration protobuf parser | Pending |
| 4 | P2P Wi-Fi sync via mDNS + mTLS 1.3 (Syncthing-inspired) | Pending |
| 5 | Hardware key wrapping, reproducible builds, audit logging | Pending |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Tauri v2 (Rust) |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4 |
| Animation | Motion |
| Icons | Lucide React (SVG only, zero icon libraries) |
| Encryption | SQLCipher (AES-256-CBC + HMAC), Argon2id KDF (pending native Rust integration) |
| TOTP Engine | Custom Rust crate with zeroize memory scrubbing |
| Sync | P2P mDNS + mTLS 1.3 (Syncthing-inspired, pending) |

## Security Architecture

Only Auth operates under Kerckhoffs's Principle -- the system remains secure even if everything about it, except the key, is public knowledge.

- **Data at Rest:** All secrets encrypted via SQLCipher (256-bit AES). No plaintext secrets touch persistent disk.
- **Key Derivation:** Argon2id (64MB memory, 3 iterations, 4 threads) derives the database encryption key from the user's passphrase. A unique 16-byte salt is generated per vault.
- **Memory Lifecycle:** Decrypted secrets exist in RAM only during TOTP computation. The Rust backend uses zeroize to scrub memory buffers immediately after code generation.
- **Auto-Lock:** A background grace timer locks the vault after 5 minutes of inactivity. Shorter grace period (30-45s) on window blur for paste-session convenience.
- **Screen Protection:** OS-level screenshot blocking via native flags (FLAG_SECURE on Android, SetWindowDisplayAffinity on Windows).

## Getting Started

### Prerequisites

- Bun (runtime and package manager)
- Rust toolchain (for Tauri v2 compilation)

### Development

```bash
# Install dependencies
bun install

# Start the Vite development server (web-only preview)
bun run dev

# Full Tauri desktop build
bunx tauri dev
```

### Production Build

```bash
bun run build
bunx tauri build
```

## Project Structure

```
src/                  React frontend
  App.tsx             Main application component
  components/         Reusable UI components
  types.ts            TypeScript interfaces (Account, AppSettings)
  utils.ts            TOTP engine, vault persistence, helpers
src-tauri/            Rust backend (Tauri v2)
  src/                Rust source with IPC commands, SQLCipher bindings, crypto
  tauri.conf.json     Tauri window and bundle configuration
Plan/                 Architecture documents and specifications
```

## Importing from Other Apps

Only Auth supports importing from:
- **Bitwarden:** Export as JSON, import via Settings > Import & Export > Bitwarden JSON
- **Ente Auth:** Export as decrypted JSON, import via Settings > Import & Export > Ente Auth JSON
- **Google Authenticator:** Scan the migration QR code or paste the `otpauth-migration://` URI

## License

MIT