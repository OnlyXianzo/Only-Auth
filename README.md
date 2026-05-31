# Only Auth

A local-first, zero-knowledge authenticator for professionals who refuse to compromise on security and privacy.

---

## Overview

Only Auth is a desktop authenticator and credential manager built for organizations and individuals who require absolute control over sensitive authentication data. Unlike cloud-based alternatives, Only Auth keeps all credentials on your device with zero external data transmission.

**Core Principle:** Your data, your device, your control.

---

## Why Only Auth?

### For Security-First Organizations
- **Zero Trust Architecture:** No cloud dependencies, no third-party access to authentication tokens
- **Cryptographic Auditability:** Full transparency into security mechanisms using open-source Rust implementation
- **Compliance Ready:** Supports isolated credential storage for regulated industries (finance, healthcare, government)
- **Incident Response:** Complete data ownership enables immediate credential rotation without vendor delays

### For Individual Users
- **True Privacy:** No analytics, telemetry, or behavioral tracking
- **Offline-First:** Works completely without internet connectivity
- **Hardware Efficient:** Optimized for minimal resource consumption across all platforms
- **Open Source:** Full transparency and community-driven security audits

---

## Security Architecture

Only Auth implements multi-layered security by default:

### Encryption & Key Management
- **AES-256-GCM** for all data at rest
- **Argon2id** key derivation with GPU-resistant parameters
- **Memory Zeroization:** Secrets are cryptographically erased from RAM immediately after use using Rust-based lifecycle management

### Advanced Features
- **Ghost Mode:** Secondary hidden vault with plausible deniability
- **Duress Mechanisms:** Emergency vault wipe or decoy mode activation via specialized PIN
- **Anti-Forensics:** Screenshot prevention and automatic interface masking on window blur
- **Asymmetric Audit Logging:** Append-only activity log encrypted with user's public key

### Attack Surface Reduction
- **Local-Only Processing:** No network exposure for credential operations
- **No Third-Party SDKs:** Eliminates supply-chain attack vectors
- **Hardware Isolation:** Leverages OS-level credential storage when available

---

## Technical Specifications

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Native Runtime** | Tauri v2 + Rust | Type safety and memory safety |
| **UI Framework** | React 19 + TypeScript | Modern developer experience |
| **Cryptography** | Rust (argon2, aes-gcm, zeroize) | Hardened crypto implementation |
| **Styling** | Tailwind CSS v4 | Minimal footprint, professional design |
| **Platform Support** | Windows, Linux, macOS, Android | Desktop-first with mobile expansion |

---

## Feature Comparison

| Feature | Only Auth | Google Auth | Microsoft Auth | Bitwarden | 1Password |
|---------|-----------|-----------|----------|-----------|----------|
| **Local-First** | ✓ | ✗ | ✗ | ✓ | ✓ |
| **Zero Knowledge** | ✓ | ✗ | ✗ | ✓ | ✓ |
| **Ghost Mode** | ✓ | ✗ | ✗ | ✗ | ✗ |
| **Duress Mechanism** | ✓ | ✗ | ✗ | ✗ | ✗ |
| **Open Source** | ✓ | ✗ | ✗ | ✓ | ✗ |
| **No Cloud Sync Required** | ✓ | ✗ | ✗ | ✗ | ✗ |
| **Anti-Screenshot** | ✓ | ✗ | ✗ | ✗ | ✓ |

---

## Supported Import Sources

Seamlessly migrate from existing authenticators:
- Google Authenticator (otpauth:// URI format)
- Microsoft Authenticator
- Bitwarden Authenticator
- Ente Auth
- Custom otpauth:// URIs

All imports preserve your destination device credentials—your authentication secrets never transit through Only Auth's systems.

---

## Getting Started

### System Requirements
- **Windows:** 10 or later (x64)
- **Linux:** Ubuntu 20.04+ or equivalent (x64)
- **macOS:** 11 or later (Intel/Apple Silicon)
- **Android:** 8.0 or later

### Installation

Download the latest release for your platform from the [Releases page](https://github.com/OnlyXianzo/Only-Auth/releases).

### Development Setup

**Prerequisites:**
- Bun (JavaScript runtime and package manager)
- Rust toolchain (Tauri v2 compilation)
- Git

**Development Environment:**
```bash
# Clone repository
git clone https://github.com/OnlyXianzo/Only-Auth.git
cd Only-Auth

# Install dependencies
bun install

# Launch development server
bun run dev

# Start Tauri development application
bunx tauri dev
```

**Production Build:**
```bash
# Build frontend and compile native application
bun run build
bunx tauri build

# Output artifacts:
# - Windows: src-tauri/target/release/bundle/nsis/
# - Linux: src-tauri/target/release/bundle/deb/
# - macOS: src-tauri/target/release/bundle/dmg/
# - Android: src-tauri/gen/android/app/build/outputs/apk/
```

---

## Documentation

- **[Architecture Specification](Docs/ARCHITECTURE.md)** - Technical system design and threat model
- **[Feature Guide](Docs/FEATURES.md)** - Detailed feature documentation
- **[Security & Safety](SECRET.md)** - Security implementation and best practices

---

## Security Considerations

### Before Using in Production
1. Audit this codebase or request a security review
2. Test credential recovery procedures
3. Verify platform-specific security features on your target OS
4. Review the threat model in the Architecture Specification

### Responsible Disclosure
Security vulnerabilities should be reported privately to the maintainers. Please do not file public issues for security-sensitive topics.

---

## Contributing

Contributions are welcome. Areas of particular interest:
- Security audits and cryptographic reviews
- Cross-platform testing
- Performance optimization
- Documentation improvements
- Translation support

---

## License

MIT License - See LICENSE file for details.

---

## Project Status

**Development Stage:** Beta (v0.1.x)

Current focus areas:
- Cross-device stability testing
- Cryptographic edge-case validation
- Platform-specific security integration
- Performance optimization

Not recommended for critical production use until v1.0 release. Users accept responsibility for data loss or security incidents during beta phase.

---

## Technology Stack Attribution

This project leverages exceptional open-source projects:
- [Tauri](https://tauri.app/) - Desktop application framework
- [React](https://react.dev/) - UI library
- [Rust Cryptography](https://rust-lang.org/) - Cryptographic implementation
- [TOTP-rs](https://github.com/mpalmer/rust-totp) - TOTP generation
