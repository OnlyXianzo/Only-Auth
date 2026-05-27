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
}

export interface AppSettings {
  passphraseHash: string;       // SHA-256 of passphrase
  masterKeyHash: string;        // SHA-256 of 256-bit master key
  pinHash: string;              // SHA-256 of PIN (empty string if not set)
  autoRenewInterval: number;
  accountListPlacement: 'right' | 'bottom';
  lastBackupDate: string;
  customTags: string[];         // user-defined tags shown in sidebar
  securityKeys: Array<{ id: string; name: string; keyType: string; addedAt: string }>;
  compactMode: boolean;
  appLockEnabled: boolean;
  appLockMethod: 'biometrics' | 'pin' | 'passphrase';
  pinAttempts: number;
  forceSearchOnStartup: boolean;
  devAccountName: string;
  devAccountTag: string;
  githubContributor: boolean;
}

