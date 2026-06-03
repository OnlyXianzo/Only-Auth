# Application features

Only Auth provides a comprehensive set of security and organizational tools
designed for professional credential management.

<!-- prettier-ignore -->
> [!WARNING]
> These features are in a very early beta state. You may encounter errors or
> unexpected behavior as we continue to refine the implementation.

## Security and privacy

The application includes several advanced mechanisms to protect your vault in
high-risk scenarios.

### Ghost Mode (hidden vault)

Ghost Mode (Hidden Vault) lets you create an invisible vault partition for
plausible deniability under forced disclosure.

- **Invisible operation:** Accounts tagged with `hidden` or `hide` do not
  appear in your standard dashboard list or search queries.
- **Search bar unlock:** You reveal the hidden partition by typing your
  secondary passcode directly into the dashboard search bar.
- **Automatic resealing:** The hidden partition automatically seals itself if
  you change the search query, navigate to another page, or lose window focus.

### Duress mechanisms

The application implements built-in protections to safeguard your data during
physical coercion.

- **Duress PIN:** You can configure a secondary PIN that silently wipes the
  cryptographic keys and database or opens a decoy empty vault.
- **Lockout threshold:** Entering an incorrect PIN 5 consecutive times
  permanently disables PIN-based quick-unlock, requiring your Master Recovery
  Passphrase to restore access.

### Privacy protections

Only Auth protects your credentials against visual snooping, screen recording,
and clipboard leaks during daily use.

- **Screen capture block:** Native OS-level integrations prevent screenshots
  and video recordings of the application window.
- **Focus masking:** The application applies a clinical blur overlay
  immediately when the window loses focus, blocking shoulder-surfing.
- **Clipboard clearing:** The system automatically deletes copied TOTP codes
  from the clipboard after 30 seconds.

## Organization and UX

Only Auth combines high-security features with a professional, streamlined
user experience.

- **Dynamic tagging:** You organize accounts using flexible, customizable tags
  instead of rigid directory structures.
- **Minimalist interface:** The UI utilizes sub-pixel hairline accents, clean
  typography, and responsive micro-animations to support efficient
  interaction.
- **Unified generation:** The native backend calculates all active TOTP codes
  in a single operation, keeping display rendering synchronized and lag-free.
- **Credential import:** You can migrate existing accounts from Google
  Authenticator, Bitwarden, Ente Auth, and Microsoft Authenticator.
