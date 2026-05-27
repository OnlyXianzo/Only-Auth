import { invoke } from '@tauri-apps/api/core';
import { Account } from './types';

export interface BatchInput {
  id: string;
  secret: string;
  digits: number;
  period: number;
}

export async function generateBatchTOTP(accounts: BatchInput[]): Promise<Record<string, string>> {
  try {
    return await invoke<Record<string, string>>('generate_totp_batch', { accounts });
  } catch {
    return {};
  }
}

export async function validateBase32(secret: string): Promise<boolean> {
  try {
    return await invoke<boolean>('validate_base32', { secret });
  } catch {
    return false;
  }
}

export async function generateNewSecret(): Promise<string> {
  try {
    return await invoke<string>('generate_secret', {});
  } catch {
    // Fallback: JS-based generation for browser-only dev mode
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
}

export async function loadVaultData(): Promise<Account[]> {
  try {
    return await invoke<Account[]>('load_vault_data');
  } catch (e) {
    console.error('Failed to load vault data:', e);
    return [];
  }
}

export async function saveVaultData(accounts: Account[]): Promise<boolean> {
  try {
    await invoke('save_vault_data', { accounts });
    return true;
  } catch (e) {
    console.error('Failed to save vault data:', e);
    return false;
  }
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
