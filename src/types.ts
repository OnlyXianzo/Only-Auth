export interface Account {
  id: string;
  name: string;
  email: string;
  secret: string;
  notes: string;
  category: string; // tag-based category e.g. 'personal', 'work', 'finance'
  isPinned: boolean;
  logoType: 'github' | 'discord' | 'google' | 'aws' | 'slack' | 'proton' | 'stripe' | 'custom';
  color?: string;
  tags?: string[];
  createdAt: string;
  digits?: number;    // TOTP digit count (default 6)
  period?: number;    // TOTP period in seconds (default 30)
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512';  // HMAC algorithm
  nextRotationDate?: string;  // YYYY-MM-DD rotation reminder
}

export interface HiddenVaultSettings {
  isEnabled: boolean;
  hash: string;                  // SHA-256 hash or blind state hash of hidden vault PIN/passcode
  method: 'pin' | 'biometrics' | 'passphrase';
}

export interface AppSettings {
  passphraseHash?: string;       // SHA-256 of passphrase (legacy, migrated on boot/unlock)
  masterKeyHash?: string;        // SHA-256 of 256-bit master key (legacy)
  pinHash?: string;              // SHA-256 of PIN (legacy)
  authHashes?: string[];         // Zero-Knowledge flat array of all authorized hashes (Argon2id)
  authMetadata?: Record<string, string>; // Maps each Argon2id hash to its AES-encrypted action metadata payload
  autoRenewInterval: number;
  accountListPlacement: 'right' | 'bottom';
  lastBackupDate: string;
  lastModifiedDate?: string;     // tracks last time accounts list was modified
  timeOffsetSeconds?: number;    // Clock-drift calibration offset in seconds
  customTags: string[];         // user-defined tags shown in sidebar
  securityKeys: Array<{ id: string; name: string; keyType: string; addedAt: string }>;
  compactMode: boolean;
  appLockEnabled: boolean;
  appLockMethod: 'biometrics' | 'pin' | 'passphrase';
  pinAttempts: number;
  forceSearchOnStartup: boolean;
  githubContributor: boolean;
  hiddenVaultSettings: HiddenVaultSettings;
  devAccountName?: string;
  devAccountTag?: string;
  duressPinHash?: string;
  duressPassphraseHash?: string;
  duressAction?: 'wipe' | 'fake';
  autoLockTimeout?: number;
  instantLockOnBlur?: boolean;
  screenshotProtection?: boolean;
}



