import { Account } from './types';

/**
 * Generates a deterministic 6-digit code based on a secret string and the current time block.
 * This mimics an authentic TOTP algorithm like Google Authenticator without requiring external crypto packages.
 */
export function generateTOTPCode(secret: string, interval = 30): string {
  if (!secret) return '000000';
  
  // Calculate current 30s epoch chunk
  const epoch = Math.floor(Date.now() / (interval * 1000));
  
  // Simple deterministic hash matching
  let hash = 0;
  const combinedStr = secret + String(epoch);
  
  for (let i = 0; i < combinedStr.length; i++) {
    const char = combinedStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  
  // Derive a key between 100000 and 999999
  const baseNum = Math.abs(hash) % 900000 + 100000;
  return String(baseNum);
}

/**
 * Helper to split a 6-digit code with space or bullet like "552 109"
 */
export function formatCode(code: string): string {
  if (code.length !== 6) return code;
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/**
 * Formats code specifically with an elegant middle bullet for the Focused 2FA Card: "998 • 641"
 */
export function formatFocusedCode(code: string): { first: string; second: string } {
  if (code.length !== 6) return { first: '000', second: '000' };
  return {
    first: code.slice(0, 3),
    second: code.slice(3)
  };
}

/**
 * Custom color pairings for standard logos or services
 */
export const SERVICE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  github: { bg: 'bg-zinc-800/20', text: 'text-zinc-200', border: 'border-zinc-700/35' },
  google: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  discord: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  aws: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  slack: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  proton: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  stripe: { bg: 'bg-blue-600/10', text: 'text-blue-500', border: 'border-blue-600/20' },
  custom: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20' },
};

/**
 * Pre-populate with realistic mock accounts matching the screenshot exactly
 */
export const INITIAL_ACCOUNTS: Account[] = [
  {
    id: 'github-acc',
    name: 'GitHub',
    email: 'developer@onlyauth.com',
    secret: 'GITHUB_SEC_2026_PRODUCTION',
    notes: 'Primary production account for core infrastructure projects and repositories.',
    category: 'personal',
    isPinned: false, // In layout, it is shown in "Focused" slot, not pinned scroll but we can focus it. 
    logoType: 'github',
    createdAt: new Date().toISOString()
  },
  {
    id: 'google-acc',
    name: 'Google Workspace',
    email: 'cloud-admin@onlyauth.com',
    secret: 'GOOGLE_WORK_SPACE_SECRET_KEY',
    notes: 'Enterprise console credentials for workspace sync, billing managers and directory management.',
    category: 'work',
    isPinned: true,
    logoType: 'google',
    createdAt: new Date().toISOString()
  },
  {
    id: 'aws-acc',
    name: 'AWS Root',
    email: 'root-security@onlyauth.com',
    secret: 'AWS_ROOT_MFA_VAULT_KEY',
    notes: 'Absolute administrator permission secret. Secure rotation cycle is active.',
    category: 'work',
    isPinned: true,
    logoType: 'aws',
    createdAt: new Date().toISOString()
  },
  {
    id: 'discord-acc',
    name: 'Discord (Main)',
    email: 'gamer@onlyauth.com',
    secret: 'DISCORD_MOCK_SECRET_GAMER',
    notes: 'Main communication credentials for general technology channels, project servers, and dev feeds.',
    category: 'personal',
    isPinned: false,
    logoType: 'discord',
    createdAt: new Date().toISOString()
  },
  {
    id: 'stripe-acc',
    name: 'Stripe Dashboard Extra Long Name Example',
    email: 'finance-dept-long-email@verylargecorporation.io',
    secret: 'STRIPE_MOCK_SECRET_FINANCE',
    notes: 'Merchant ledger authentication portal. Restrict access strictly with this hardware-separated OTP.',
    category: 'work',
    isPinned: false,
    logoType: 'stripe',
    createdAt: new Date().toISOString()
  },
  {
    id: 'slack-acc',
    name: 'Slack Workspace',
    email: 'dev-team@workspace.com',
    secret: 'SLACK_MOCK_SECRET_TEAM',
    notes: 'Developer hub communications login.',
    category: 'work',
    isPinned: false,
    logoType: 'slack',
    createdAt: new Date().toISOString()
  },
  {
    id: 'proton-acc',
    name: 'ProtonMail',
    email: 'secure@proton.me',
    secret: 'PROTONMAIL_MOCK_SECRET_SECURE',
    notes: 'Encrypted message board secondary administrative routing key.',
    category: 'personal',
    isPinned: false,
    logoType: 'proton',
    createdAt: new Date().toISOString()
  }
];

/**
 * Checks security rating of a Secret Key
 */
export function getSecurityStrength(secret: string): { score: number; label: string; color: string } {
  if (!secret) return { score: 10, label: 'Dangerously Weak', color: 'text-red-500' };
  
  let score = 30;
  if (secret.length > 8) score += 20;
  if (secret.length > 14) score += 30;
  if (/[A-Z]/.test(secret)) score += 10;
  if (/[0-9]/.test(secret)) score += 10;
  
  if (score < 40) return { score, label: 'Weak (Risk)', color: 'text-orange-500' };
  if (score < 80) return { score, label: 'Good (Secure)', color: 'text-blue-400' };
  return { score: Math.min(score, 100), label: 'Fortified (High Security)', color: 'text-accent' };
}
