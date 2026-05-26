export interface Account {
  id: string;
  name: string;
  email: string;
  secret: string;
  notes: string;
  category: string; // Dynamic vaults support (e.g. 'personal', 'work', 'finance', 'gaming' etc.)
  isPinned: boolean;
  logoType: 'github' | 'discord' | 'google' | 'aws' | 'slack' | 'proton' | 'stripe' | 'custom';
  color?: string;
  tags?: string[];
  createdAt: string;
}

export interface AppSettings {
  masterPin: string;
  autoRenewInterval: number; // in seconds
  accountListPlacement: 'right' | 'bottom'; // layout setting
  lastBackupDate: string; // iso string or 'Never'
  customVaults: string[]; // list of available vaults
  securityKeys: Array<{ id: string; name: string; keyType: string; addedAt: string }>;
}
