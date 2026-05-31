# Only Auth

Only Auth is a local-first, zero-knowledge 2FA and TOTP authenticator designed for
professionals who prioritize security and privacy. You maintain complete control
over your authentication data, which never leaves your device.

<!-- prettier-ignore -->
> [!WARNING]
> This application is in a very early beta phase (v0.1.x). It is under active
> development, and we are currently resolving a high volume of errors daily.
> We do not recommend using this for critical production credentials until the
> v1.0 release. Use at your own risk.

## Why Only Auth?

Only Auth provides a secure alternative to cloud-based authenticators by
ensuring your secrets remain local and encrypted.

- **Complete Data Ownership:** You own your data. The application operates
  without any external data transmission or cloud dependencies.
- **Cryptographic Integrity:** The system uses high-end encryption primitives
  implemented in Rust to secure your vault.
- **Zero Telemetry:** The application does not collect analytics, behavioral
  tracking, or any form of telemetry.
- **Offline Reliability:** You can access your authentication codes anytime,
  anywhere, without an internet connection.

## Security Architecture

The application implements multiple layers of defense to protect your sensitive
information.

- **Argon2id Key Derivation:** The system derives your master encryption key
  using memory-hard Argon2id parameters to resist brute-force attacks.
- **AES-256-GCM Encryption:** All data at rest is secured using industry-
  standard AES-256-GCM encryption within a SQLCipher database.
- **Memory Security:** The Rust backend utilizes zeroizing allocators to
  ensure secrets are scrubbed from system RAM immediately after use.
- **Display Protections:** The interface applies clinical blur masks when the
  window loses focus and prevents unauthorized screen captures.

## Features

Only Auth includes specialized security tools designed for high-risk
environments.

- **Hidden Keys:** You can create a secondary vault layer for sensitive
  accounts that remains invisible during standard operation.
- **Duress Mechanisms:** The system supports a duress PIN to trigger a silent
  vault wipe or switch to a decoy state.
- **Dynamic Tagging:** You can organize your accounts using a flexible tagging
  system instead of rigid folders.
- **Universal Import:** You can migrate seamlessly from Google Authenticator,
  Microsoft Authenticator, Bitwarden, and Ente Auth.

## Getting Started

### System Requirements

- **Windows:** 10 or later (x64)
- **Linux:** Ubuntu 20.04+ or equivalent (x64)
- **macOS:** 11 or later (Intel/Apple Silicon)
- **Android:** 8.0 or later

### Installation

You can download the latest beta release for your platform from the [Releases
page](https://github.com/OnlyXianzo/Only-Auth/releases).

### Development Setup

To set up a local development environment, ensure you have Bun, the Rust
toolchain, and Git installed.

```bash
# Clone the repository
git clone https://github.com/OnlyXianzo/Only-Auth.git
cd Only-Auth

# Install dependencies
bun install

# Launch the development server
bun run dev

# Start the Tauri development application
bunx tauri dev
```

## Documentation

- **[Architecture Specification](Docs/ARCHITECTURE.md)**: Technical design and
  threat models.
- **[Feature Guide](Docs/FEATURES.md)**: Detailed documentation of application
  capabilities.
- **[Security & Specialized Secrets](Docs/SECRET.md)**: Detailed documentation
  on Hidden Keys, duress systems, and memory safety.

## Contributing

We welcome contributions to improve security, performance, and documentation.
Please review our contributing guidelines before submitting a pull request.

## License

This project is licensed under the MIT License.
