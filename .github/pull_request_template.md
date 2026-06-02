## Description

### Why
<!-- Clarify the exact architectural necessity, threat context, or bug reproduction scenario prompting this change. Avoid vague summaries. -->

### What
<!-- Provide a clinical, technical breakdown of the changes introduced by this pull request. List modified modules, changed IPC handles, or altered state lifecycles. -->

---

## Pull Request Classification

Please select the single most applicable type for this PR:

- [ ] **feat**: A new capability or native hook (requires security invariant check)
- [ ] **fix**: A bug fix (especially memory leak, logic error, or visual mask issue)
- [ ] **refactor**: Code reorganization with zero behavior changes
- [ ] **perf**: Optimizations directly targeting memory zeroization speed or KDF latency
- [ ] **docs**: Technical documentation updates (e.g., in `/Docs` or code comments)
- [ ] **chore**: Auxiliary changes (dependencies, build system, CI/CD)

---

## Strict Security Invariants Checklist

You must review and check all items below. If an item is not applicable to your PR, mark it as `[x]` and write "N/A" with a brief justification in the clinical description. Violations of any invariant will result in an immediate PR rejection.

### 1. Memory Sanitization & Zeroization
- [ ] **Zeroize Allocators (Rust):** All newly introduced raw seeds, decoded secrets, KDF-derived keys, and intermediate cryptographic buffers are wrapped in `zeroize::Zeroize` allocators or safe wrappers.
- [ ] **Immediate Active Scrubbing:** Memory blocks housing sensitive seeds or keys are explicitly overwritten with `0x00` immediately after the TOTP token generation cycle or cryptographic operation finishes.
- [ ] **React State Purging (Frontend):** All React/TypeScript component states, form inputs, and DOM ref buffers containing passwords, PINs, or seeds are aggressively cleared and overwritten with `""` upon view transitions, modal unmounts, or successful form submissions.

### 2. Storage & Cryptography
- [ ] **SQLCipher & AES-256-GCM:** Any changes to storage layers verify that database buffers remain encrypted using SQLCipher with AES-256-GCM. No unencrypted fallback mechanisms are introduced.
- [ ] **Argon2id Integrity:** Key derivation routines remain strictly memory-hard. Parameter changes (if any) are documented, benchmarked, and audited to resist GPU brute-force attacks.
- [ ] **Secret Exposure Prevention:** The mnemonic passphrase, derived master key, or `oa_sk_...` hex master key are never exposed via standard console logs, remote telemetry (which is prohibited), IPC payloads, or plain-text files.

### 3. Tauri IPC Bridge Security
- [ ] **Minimally Viable Payloads:** Plaintext keys, decrypted mnemonics, or master seeds never traverse the Tauri IPC boundary. Only the absolute minimum operational payload (e.g., the computed 6-digit or 8-digit TOTP string valid for the current window) is passed.
- [ ] **Input Validation Boundary:** The Rust backend treats all arguments received via Tauri commands as highly untrusted. Inputs are validated for length, structure, and character safety strictly at the Rust boundary before being passed to native code.

### 4. Plausible Deniability (Ghost Mode)
- [ ] **UI Visibility Isolation:** Accounts tagged as `hidden` or `hide` do not appear in the standard React DOM, indexing arrays, or search caches unless Ghost Mode is actively unlocked.
- [ ] **Search Bar Access Handle:** Access to hidden vault elements is gated strictly behind the dashboard search bar passcode matching algorithm.
- [ ] **Instant Auto-Seal:** The hidden vault is immediately sealed (clearing decrypted RAM and resetting frontend state) upon window focus loss, navigation away from the dashboard, or modification of the active search string.

### 5. Duress System Invariants
- [ ] **Panic Verification:** Changes to the PIN authentication flow have been verified to not interfere with Duress triggers. The Duress PIN correctly triggers either a silent cryptographic wipe of SQLCipher database headers or loads the decoy vault.
- [ ] **Brute-Force Lockout:** Five consecutive incorrect PIN submissions permanently disable the quick-unlock PIN pathway. Only the full Master Recovery Passphrase can re-enable the PIN authorization module.

### 6. OS & Display Protection Hooks
- [ ] **Screenshot Blockers:** Native window display affinity hooks (`SetWindowDisplayAffinity` or platform-native equivalent hooks) have been verified to successfully block screenshots, system-level recording, and screen sharing.
- [ ] **Instant Masking Overlay:** When the application window loses system focus, a clinical blur overlay is immediately applied to the entire webview viewport with zero milliseconds of delay.

---

## Local Verification Steps

Please describe the precise steps you performed to verify this change. Include copy-pasted terminal outputs or log metrics where relevant.

### 1. Build Verification
Ensure your local environment builds successfully using `bun`:
```bash
bun run build && bun test
```
*   **Result Output:**
    ```text
    [Paste your successful build and test outputs here]
    ```

### 2. Rust Core Verification
Verify that Rust command-line tests and Cargo audits pass:
```bash
cd src-tauri
cargo test
cargo clippy -- -D warnings
```
*   **Result Output:**
    ```text
    [Paste your cargo test and clippy outputs here]
    ```

### 3. Manual Security Testing Protocol
<!-- Describe how you manually tested the security implications of this PR (e.g., verifying focus blur on window focus loss, verifying clipboard auto-clear after 30 seconds, verifying hidden accounts vanish on search clear). -->
*   **Action performed:**
*   **Observed behavior:**
