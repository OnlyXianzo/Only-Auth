# Application Features

Only Auth provides a comprehensive set of security and organizational tools
designed for professional credential management.

<!-- prettier-ignore -->
> [!WARNING]
> These features are in a very early beta state. You may encounter errors or
> unexpected behavior as we continue to refine the implementation.

## Security and Privacy

The application includes several advanced mechanisms to protect your vault in
high-risk scenarios.

### Hidden Keys

Hidden Keys (formerly Ghost Mode) allows you to create an invisible vault layer.
You can tag accounts as `hidden` to exclude them from standard views.

- **Invisible Operation:** Accounts tagged as `hidden` do not appear in lists
  or search results by default.
- **Secure Unlocking:** You can only reveal Hidden Keys by entering a specific
  passcode directly into the dashboard search bar.
- **Automatic Resealing:** The hidden vault layer automatically reseals when
  the application loses focus or you navigate away from the dashboard.

### Duress Mechanisms

The system provides protections for situations where you may be forced to
unlock your device.

- **Duress PIN:** You can configure a secondary PIN that triggers a silent
  wipe of the vault or displays a decoy empty state.
- **Lockout Policy:** The system enforces a lockout after 5 consecutive
  incorrect PIN attempts, requiring your master recovery phrase to reset.

### Privacy Protections

The interface includes built-in safeguards to prevent accidental data leaks.

- **Anti-Screenshot:** Native hooks block unauthorized screen captures of the
  vault content.
- **Active Masking:** The UI applies a clinical blur overlay whenever the
  application window loses focus.
- **Clipboard Management:** The system automatically clears copied TOTP codes
  from your clipboard after 30 seconds.

## Organization and UX

Only Auth combines high-security features with a professional, streamlined
user experience.

- **Dynamic Tagging:** You can categorize and filter your accounts using
  customizable tags instead of traditional folders.
- **Clinical UI:** The interface uses glassmorphism and micro-animations to
  provide a clear, responsive, and professional experience.
- **Unified Generation:** The Rust backend generates all visible TOTP codes
  in a single pass, ensuring zero UI lag and accurate synchronization.
- **Seamless Migration:** You can import existing data from Google
  Authenticator, Bitwarden, Ente Auth, and Microsoft Authenticator.
