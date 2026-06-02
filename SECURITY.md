# Security Policy: Only Auth

This document outlines the security architecture, threat model, non-negotiable security invariants, and vulnerability reporting procedures for Only Auth. 

Only Auth is a local-first, zero-knowledge, cryptographic vault designed to secure and manage time-based one-time password (TOTP) credentials entirely on-device. No telemetry, no cloud connectivity, and no external synchronization operations are permitted. All cryptographic boundaries must be absolute and mathematically verifiable.

---

## 1. Zero-Knowledge, Local-First Threat Model

Only Auth is engineered to operate under the assumption that the host operating system, local memory, and physical environment are potential vectors of compromise. Every engineering decision is weighed against the following four primary threat vectors:

### A. Memory-Dump Attacks (RAM Scraping)
*   **Threat:** Attackers with elevated privileges or physical access may attempt to scrape system RAM, extract secrets from swap files, or extract keys from system hibernation dumps.
*   **Mitigation:** 
    *   **Zeroization:** Every raw seed, decrypted secret, and derived key must be wrapped inside Rust `zeroize::Zeroize` memory allocators.
    *   **Immediate De-allocation:** Active memory containing cryptographic secrets or decrypted TOTP payloads is explicitly overwritten with `0x00` immediately after the TOTP token generation cycle completes.
    *   **Frontend Scrubbing:** The React 19 / TypeScript frontend aggressively clears and overrides sensitive input buffers during state transitions and modal unmounts to prevent V8 engine garbage collection delays from leaving secrets in the webview memory space.

### B. Shoulder-Surfing & Visual Disclosure
*   **Threat:** Passive visual observation of the display by unauthorized third parties or adjacent surveillance cameras in high-risk physical spaces.
*   **Mitigation:**
    *   **Instant Active Masking:** The UI applies a full blur overlay immediately when the application window loses focus. The transition window is zero milliseconds.
    *   **Ephemeral Clipboard Lifecycle:** Copying a TOTP token triggers a background timer that forcibly purges the system clipboard after exactly 30 seconds.
    *   **Redacted Standard Views:** Secret keys and seeds are never rendered in plain text within the standard UI DOM.

### C. Forced Vault Disclosure (Duress & Plausible Deniability)
*   **Threat:** Situations where the user is physically coerced or legally compelled to unlock the vault.
*   **Mitigation:**
    *   **Ghost Mode (Hidden Keys):** A cryptographic "vault-within-a-vault" layer. Accounts tagged with `hidden` or `hide` do not exist in standard DOM renders or index databases. Unlocking the hidden vault is done exclusively by entering a secondary passcode in the search bar.
    *   **Duress Triggers:** Configurable secondary PINs that silently trigger either a complete application wipe (wiping keys and SQLCipher database headers) or load a decoy empty state.
    *   **Brute-Force Rate Limiting:** A strict lockout threshold of 5 consecutive failed quick-unlock PIN attempts permanently disables PIN-based decryption, requiring the full Master Recovery Passphrase to re-initialize the key derivation path.

### D. Screen Capture, Recording & Malicious IPC Sniffing
*   **Threat:** Malicious processes running background screen recorders, screenshot utilities, or sniffing unsecured IPC payloads between the frontend webview and the native backend.
*   **Mitigation:**
    *   **OS-Level Window Protections:** Platform-native APIs (such as `SetWindowDisplayAffinity` on Windows, secure layouts on Android, and equivalent WebKit/WebView2 hooks on macOS/Linux) prevent the window from appearing in screenshots, video captures, or screen-sharing pipelines.
    *   **Secure IPC Boundary:** Unencrypted secrets are strictly prohibited from traversing the Tauri IPC bridge unless they represent the minimal required payload for the specific operational context. All inputs are strictly validated at the Rust boundary.

---

## 2. Non-Negotiable Security Invariants

All contributors must strictly adhere to the following invariants. Any Pull Request that violates these conditions will be rejected immediately.

### Cryptographic Foundation & KDF
*   **Master Key Derivation:** Master cryptographic keys must be derived from a 12, 18, or 24-word user mnemonic phrase using **Argon2id** configured with high-intensity parameters (tuned for local performance budgets while retaining strong GPU-resistance).
*   **Encrypted Storage:** All vault databases must be encrypted using **SQLCipher** utilizing **AES-256-GCM**.
*   **Master Key Backup:** The hexadecimal cryptographic master key (`oa_sk_...`) acts as the root secret at rest. It must never be written to plaintext log files, unencrypted storage, or exposed via debug interfaces.

### Memory & State Sanitization
*   **Rust Memory Wrapping:** All raw secret keys, decrypted database buffers, and seed bytes must implement the `Zeroize` trait. Standard `Drop` behavior is insufficient. Memory must be zeroed explicitly after use.
*   **Frontend Input Sanitization:** React state holding passwords, PINs, or seeds must be overwritten with blank values (`""`) upon form submission, modal closure, or route navigation.
*   **Unencrypted IPC Restraints:** The Tauri IPC bridge must never transmit plaintext master keys or raw database seeds. Only the minimum necessary payload (e.g., individual calculated TOTP strings with a 30-second expiry) may traverse the bridge.

### Ghost Mode (Hidden Vault) Plausible Deniability
*   **Zero Leakage:** Hidden accounts must never be queried or cached when standard vaults are loaded. The presence of hidden vault entries must be undetectable through timing analysis or DOM querying.
*   **Auto-Sealing:** The hidden vault must instantly seal (relinquishing decrypted cache and clearing memory) upon application focus loss, navigation away from the active screen, or modifications to the active search query.

### Duress System Integrity
*   **Atomic Wipe:** When a Duress PIN is triggered for destruction, the app must immediately execute a secure deletion of the key databases, overwriting the cryptographic headers before deleting the database file.
*   **Hard Lockout:** The failed PIN counter must be maintained in a secure, non-volatile state. Once 5 failed attempts occur, the quick-unlock PIN path must be rendered cryptographically inert.

### Display and Host Integrations
*   **Screenshot Blockers:** Window protection flags must be verified to initialize successfully on startup. If the operating system rejects native screenshot protections, the application must warn the user and refuse to display high-sensitivity keys.
*   **Zero-Delay Blur:** The blur mask must cover the entire viewport, preventing any single pixel of credentials from being visible in OS task switchers or preview thumbnails.

---

## 3. Vulnerability Disclosure Policy

We take security issues extremely seriously and welcome reports from independent security researchers. 

### Reporting Channel
If you discover a vulnerability in Only Auth, please report it immediately via PGP-encrypted email:

*   **Email Vector:** `security@onlyauth.local`
*   **Encryption Requirement:** All vulnerability reports **MUST** be encrypted using our dedicated PGP Public Key. Reports submitted in plaintext will be ignored to prevent interception of sensitive exploit vectors.
*   **PGP Fingerprint (Reference):** Please verify the fingerprint via official channels prior to transmission.

### Submission Guidelines
To expedite triage, please ensure your report contains the following details:
1.  **Vulnerability Type:** (e.g., Memory Leak, Cryptographic Bypass, Privilege Escalation).
2.  **Affected Component:** (e.g., Rust Core, IPC Bridge, React Frontend).
3.  **Proof of Concept (PoC):** Detailed, step-by-step instructions to reproduce the vulnerability. Where applicable, include a minimalist exploit script or payload.
4.  **Impact Analysis:** An objective technical assessment of how the vulnerability affects the zero-knowledge threat model.

### Coordinated Disclosure Timeline
We operate under a coordinated disclosure policy:
*   **Initial Triage:** Within **48 hours** of receipt, we will acknowledge the report and verify the vulnerability.
*   **Remediation Phase:** We aim to produce a verified cryptographic patch within **30 days** for standard vulnerabilities, and **7 days** for critical exploits.
*   **Coordinated Release:** Once a patch is distributed, we will coordinate public disclosure with the reporting researcher, recognizing their contribution in our changelog and security advisories.

We request that you do not publish, share, or disclose details of the vulnerability to third parties or the public until our coordinated disclosure process is complete.

---

## 4. Security Audit & Build Verification

To guarantee build integrity:
*   **No Unvetted Dependencies:** Every dependency added to `Cargo.toml` or `package.json` must be manually audited for malicious code, network traffic, or telemetry.
*   **Deterministic Builds:** The build pipeline enforces strict cargo audits and subresource integrity checks.
*   **Local Cryptographic Verification:** All local testing must run `bun run build && bun test` to ensure that build scripts and unit tests execute successfully without failing assertions.
