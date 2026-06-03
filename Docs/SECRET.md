# Security and safety features

This document details the advanced safety mechanisms integrated into Only Auth
to protect your most sensitive data in high-risk environments.

## Ghost Mode (hidden vault)

Ghost Mode is a specialized vault partitioning mechanism providing plausible
deniability. It allows you to maintain secondary accounts that remain
completely hidden under standard operating conditions.

### What it is

Ghost Mode is a "vault within a vault" designed for plausible deniability.
It lets you keep a set of accounts completely invisible during standard
operation.

### Who it is for

This feature is intended for journalists, activists, or security professionals
who may be forced to reveal their primary vault but need to keep certain
critical credentials hidden.

### How to access

To set up and access Ghost Mode, follow these steps:

1. On the **Settings** page, select the **Tags** menu.
2. Create a tag named `hidden` or `hide`.
3. When prompted, configure a secondary passcode (PIN, passphrase, or master
   key).
4. Assign sensitive accounts to the newly created tag to hide them from the
   dashboard.
5. Type your secondary passcode directly into the dashboard **search bar** to
   reveal the hidden accounts.
6. Change the search query, navigate away, or unfocus the window to
   automatically reseal the partition.

## Duress and panic systems

The application incorporates emergency controls to handle forced disclosure
scenarios and automated brute-force defense.

### Duress PIN or passphrase

In high-pressure situations where you are forced to unlock the application,
you can enter a pre-configured duress PIN.

- **Wipe trigger:** Entering the duress PIN silently deletes the key databases
  and overwrites the SQLCipher headers on disk.
- **Decoy trigger:** Entering the duress PIN opens a pre-configured fake empty
  vault, presenting no visible accounts.

### PIN lockout and anti-brute force

To prevent unauthorized access via PIN guessing, Only Auth enforces a strict
lockout policy.

- **Lockout trigger:** The quick-unlock PIN is permanently disabled after 5
  consecutive incorrect attempts.
- **Recovery method:** You must enter the full Master Recovery Passphrase to
  restore access and configure a new PIN.

## Operational privacy

Only Auth enforces device-level visual and memory protection measures during
active user sessions.

- **Window protection:** The application utilizes platform-native APIs to
  prevent its window from appearing in screenshots, video recordings, or
  screen shares.
- **Focus masking:** The UI immediately applies a clinical blur overlay when
  the window loses active focus, preventing shoulder-surfing.
- **Memory scrubbing:** The backend zeroizes all sensitive secrets in RAM
  immediately after TOTP token generation.
