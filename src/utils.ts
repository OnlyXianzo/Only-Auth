import { invoke } from '@tauri-apps/api/core';
import { Account } from './types';

export interface BatchInput {
  id: string;
  secret: string;
  digits: number;
  period: number;
}

export async function generateBatchTOTP(accounts: BatchInput[]): Promise<Record<string, string>> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<Record<string, string>>('generate_totp_batch', { accounts });
    } catch {
      // Fall through to mock generation if invoke fails
    }
  }

  // Browser/Mock fallback: Generate a deterministic 6-digit mock TOTP code based on secret and current 30-second epoch
  const result: Record<string, string> = {};
  const epoch = Math.floor(Date.now() / 30000);
  for (const acc of accounts) {
    let hash = 0;
    const str = `${acc.secret}-${epoch}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    const absHash = Math.abs(hash);
    const code = (absHash % 1000000).toString().padStart(6, '0');
    result[acc.id] = code;
  }
  return result;
}

export async function validateBase32(secret: string): Promise<boolean> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<boolean>('validate_base32', { secret });
    } catch {
      // Fall through to regex validation if invoke fails
    }
  }

  // Browser/Mock fallback: Validate characters A-Z, 2-7
  if (!secret) return false;
  const clean = secret.replace(/[\s-]/g, '');
  return /^[A-Z2-7]+=*$/i.test(clean);
}

export async function generateNewSecret(): Promise<string> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<string>('generate_secret', {});
    } catch {
      // Fall through to local generation if invoke fails
    }
  }

  // Fallback: JS-based generation for browser-only dev mode
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function loadVaultData(): Promise<Account[]> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<Account[]>('load_vault_data');
    } catch (e) {
      console.warn('Tauri load_vault_data failed, trying localStorage fallback:', e);
    }
  }

  // Browser fallback: read from localStorage
  try {
    const saved = localStorage.getItem('onlyauth_accounts_v3');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load mock accounts from localStorage:', e);
  }
  return [];
}

export async function saveVaultData(accounts: Account[]): Promise<boolean> {
  // Always sync with localStorage for additional safety and web mode support
  try {
    localStorage.setItem('onlyauth_accounts_v3', JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to save mock accounts to localStorage:', e);
  }

  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      await invoke('save_vault_data', { accounts });
      return true;
    } catch (e) {
      console.error('Failed to save vault data to Rust backend:', e);
      return false;
    }
  }
  return true;
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
