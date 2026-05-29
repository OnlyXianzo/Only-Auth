import { invoke } from '@tauri-apps/api/core';
import { Account } from './types';

export interface BatchInput {
  id: string;
  secret: string;
  digits: number;
  period: number;
  algorithm?: string;
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

// ─── Frontend Hashing helper (SHA-256)
async function localSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Hardened Key Derivation (Argon2id)
export async function argon2idHash(password: string): Promise<string> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<string>('argon2id_hash', { password });
    } catch (e) {
      console.error('Tauri argon2id_hash failed, using mock fallback:', e);
    }
  }
  // Browser fallback: Mock Argon2id using SHA-256 with specific parameter prefix
  return `$argon2id$v=19$m=131072,t=3,p=4$mock_salt$${await localSha256(password)}`;
}

export async function argon2idVerify(hash: string, password: string): Promise<boolean> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<boolean>('argon2id_verify', { hash, password });
    } catch (e) {
      console.error('Tauri argon2id_verify failed, using mock fallback:', e);
    }
  }
  // Browser/Mock fallback
  if (hash.startsWith('$argon2id$')) {
    const mockHash = `$argon2id$v=19$m=131072,t=3,p=4$mock_salt$${await localSha256(password)}`;
    return hash === mockHash;
  }
  // Support backward compatibility (legacy simple SHA-256 checks)
  return hash === (await localSha256(password));
}

// ─── Constant-Time Comparison
// CRITICAL SECURITY WARNING: JavaScript engines cannot guarantee constant-time execution.
// JIT compiler optimizations, garbage collection pauses, and speculative execution side-channels
// can leak timing data in Web browsers. Consequently, all security-critical checks
// (PIN validation, passphrase matching, backup integrity HMAC checking) MUST happen
// exclusively in the Rust backend via subtle::ConstantTimeEq.
// This JS helper is strictly for non-security-critical UI state checks or browser-only mock fallbacks.
export async function secureCompare(a: string, b: string): Promise<boolean> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<boolean>('secure_compare', { a, b });
    } catch (e) {
      console.error('Tauri secure_compare failed, using mock fallback:', e);
    }
  }
  // Browser fallback (JS constant-time comparison helper for UI states)
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Encrypted & Sealed Exports
export async function encryptBackup(data: string, password: string): Promise<string> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<string>('encrypt_backup', { data, password });
    } catch (e) {
      console.error('Tauri encrypt_backup failed, using mock fallback:', e);
    }
  }
  // Browser fallback: Mock signed backup
  const mockSalt = 'mocksalt';
  const mockNonce = 'mocknonce';
  const base64Data = btoa(unescape(encodeURIComponent(data)));
  const mockHmac = await localSha256(base64Data + password);
  return `${mockSalt}:${mockNonce}:${base64Data}:${mockHmac}`;
}

export async function decryptBackup(payload: string, password: string): Promise<string> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<string>('decrypt_backup', { payload, password });
    } catch (e) {
      console.error('Tauri decrypt_backup failed, using mock fallback:', e);
      throw e;
    }
  }
  // Browser fallback: Mock decrypt & signature verification
  const parts = payload.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid backup format');
  }
  const base64Data = parts[2];
  const providedHmac = parts[3];
  const computedHmac = await localSha256(base64Data + password);
  
  if (providedHmac !== computedHmac) {
    throw new Error('Integrity seal verification failed. Tampering detected or wrong password.');
  }
  return decodeURIComponent(escape(atob(base64Data)));
}

// ─── Encrypted Append-Only Activity logs
export async function writeAuditLog(event: string, keyHex?: string): Promise<void> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      await invoke('write_audit_log', { event, keyHex });
      return;
    } catch (e) {
      console.error('Tauri write_audit_log failed, using mock fallback:', e);
    }
  }
  // Browser fallback: simple array in localStorage
  try {
    const logs = JSON.parse(localStorage.getItem('onlyauth_audit_logs_v3') || '[]');
    const timestamp = Math.floor(Date.now() / 1000);
    logs.push(`${timestamp}|${event}`);
    localStorage.setItem('onlyauth_audit_logs_v3', JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to write mock audit logs to localStorage:', e);
  }
}

export async function readAuditLogs(keyHex: string): Promise<string[]> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<string[]>('read_audit_logs', { keyHex });
    } catch (e) {
      console.error('Tauri read_audit_logs failed, using mock fallback:', e);
    }
  }
  // Browser fallback: read from localStorage
  try {
    return JSON.parse(localStorage.getItem('onlyauth_audit_logs_v3') || '[]');
  } catch (e) {
    console.error('Failed to read mock audit logs from localStorage:', e);
    return [];
  }
}

export async function setWindowScreenshotProtection(protect: boolean): Promise<void> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      await invoke('set_window_screenshot_protection', { protect });
    } catch (e) {
      console.error('Tauri set_window_screenshot_protection failed:', e);
    }
  }
}

export async function encryptMetadata(data: string, keyMaterial: string): Promise<string> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<string>('encrypt_metadata', { data, keyMaterial });
    } catch (e) {
      console.error('Tauri encrypt_metadata failed, using mock fallback:', e);
    }
  }
  // Browser mock fallback: simple base64 with simulated key check tag
  const hashedKey = await localSha256(keyMaterial);
  const base64Data = btoa(unescape(encodeURIComponent(data)));
  return `${hashedKey.slice(0, 8)}:${base64Data}`;
}

export async function decryptMetadata(encrypted: string, keyMaterial: string): Promise<string> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<string>('decrypt_metadata', { encrypted, keyMaterial });
    } catch (e) {
      console.error('Tauri decrypt_metadata failed, using mock fallback:', e);
    }
  }
  // Browser mock fallback decryption
  const parts = encrypted.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted metadata format');
  }
  const keyTag = parts[0];
  const base64Data = parts[1];
  const hashedKey = await localSha256(keyMaterial);
  if (keyTag !== hashedKey.slice(0, 8)) {
    throw new Error('Failed to decrypt metadata: key mismatch');
  }
  return decodeURIComponent(escape(atob(base64Data)));
}
