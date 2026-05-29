# Only Auth

> **Status: Under Development.** This application is currently in an active development phase. Cross-device stability and cryptographic edge-case testing are ongoing. Use in production environments is at your own risk until a stable 1.0 release is announced.

Only Auth is a local-first, zero-knowledge 2FA/TOTP authenticator and credential manager designed for extreme privacy and performance. Built with Tauri v2, React 19, TypeScript, and a high-security Rust cryptographic backend, it ensures that your sensitive data never leaves your device.

## Overview

Only Auth rejects centralized cloud synchronization in favor of complete client-side data ownership. The architecture is engineered for a low memory footprint, zero telemetry, and maximum security on all hardware tiers, including low-specification systems.

## Key Features

### Security and Privacy
*   **Hardened Key Derivation:** Utilizes Argon2id for deriving master encryption keys from user passphrases, configured to resist GPU-accelerated brute-force attacks.
*   **Memory Safety:** Employs strict memory lifecycle management with Rust-based zeroization, ensuring that unencrypted secrets are immediately scrubbed from system RAM after use.
*   **Ghost Mode (Hidden Vault):** Supports a secondary, hidden vault layer for plausible deniability, accessible only via specific search-bar triggers.
*   **Panic and Duress Mechanisms:** Includes specialized PINs for triggering silent vault wipes or transitioning to fake empty states in high-risk scenarios.
*   **Anti-Screenshot and Privacy Masking:** Prevents unauthorized screen captures and automatically obscures the interface when the application window loses focus.
*   **Asymmetric Audit Logging:** Maintains a zero-knowledge, append-only activity log encrypted with a local public key, readable only by the authenticated user.

### Organization and UX
*   **Dynamic Tagging System:** Flexible account categorization replacing traditional folder structures.
*   **Clinical UI/UX:** A high-end, obsidian-themed interface with neon accents and glassmorphism, optimized for professional use.
*   **Batch TOTP Generation:** A high-performance Rust bridge that generates codes for all active accounts in a single pass to eliminate lag.
*   **Comprehensive Import Pipeline:** Dedicated support for migrating from Bitwarden, Ente Auth, and Google Authenticator.

## Architecture

Only Auth utilizes a dual-layer architecture to balance performance and security.

### Core Technology Stack
*   **Native Shell:** Tauri v2 (Rust)
*   **UI Framework:** React 19, TypeScript, Vite
*   **Styling:** Tailwind CSS v4
*   **Animation:** Motion
*   **Cryptographic Primitives:** totp-rs, argon2, aes-gcm, zeroize

### Security Model
The system operates under Kerckhoffs's Principle, remaining secure even if its implementation details are known, provided the master key remains confidential. Data is protected at rest using AES-256 encryption and in transit (during local sync) using mutual TLS 1.3.

## Getting Started

### Prerequisites
*   Bun (JavaScript runtime and package manager)
*   Rust toolchain (for Tauri v2 compilation)

### Development
```bash
# Install dependencies
bun install

# Start the Vite development server (web preview)
bun run dev

# Launch the Tauri desktop application in development mode
bunx tauri dev
```

### Production Build
```bash
# Build the frontend and compile the native application
bun run build
bunx tauri build
```

## Documentation
Detailed technical information is available in the following documents:
*   [Architecture Specification](Docs/ARCHITECTURE.md)
*   [Feature Guide](Docs/FEATURES.md)
*   [Security and Safety Features](SECRET.md)

## License
This project is licensed under the MIT License.
