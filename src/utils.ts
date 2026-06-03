import { invoke } from '@tauri-apps/api/core';
import { Account } from './types';

export interface BatchInput {
  id: string;
  secret: string;
  digits: number;
  period: number;
  algorithm?: string;
}

// ─── RFC 6238-compliant base32 decoder ────────────────────────────────────────
function base32Decode(encoded: string): Uint8Array {
  const cleaned = encoded.replace(/[\s-=]/g, '').toUpperCase();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let bitCount = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    bits = (bits << 5) | idx;
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bits >> bitCount) & 0xFF);
      bits &= (1 << bitCount) - 1;
    }
  }
  return new Uint8Array(bytes);
}

// ─── RFC 6238 TOTP via Web Crypto API (browser fallback) ──────────────────────
async function rfc6238TOTP(secret: string, digits: number, period: number, algorithm: string, timeOffsetSeconds: number = 0): Promise<string> {
  const keyBytes = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000) + timeOffsetSeconds;
  const counter = Math.floor(now / period);
  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  view.setBigUint64(0, BigInt(counter));

  const hashAlgo = algorithm === 'SHA256' ? 'SHA-256' : algorithm === 'SHA512' ? 'SHA-512' : 'SHA-1';
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: hashAlgo }, false, ['sign']);
  const hmacRaw = await crypto.subtle.sign('HMAC', cryptoKey, counterBuf);
  const hmac = new Uint8Array(hmacRaw);

  const offset = hmac[hmac.length - 1] & 0x0F;
  const binary = ((hmac[offset] & 0x7F) << 24) | ((hmac[offset + 1] & 0xFF) << 16) | ((hmac[offset + 2] & 0xFF) << 8) | (hmac[offset + 3] & 0xFF);
  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

export async function generateBatchTOTP(accounts: BatchInput[], timeOffsetSeconds: number = 0): Promise<Record<string, string>> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<Record<string, string>>('generate_totp_batch', { accounts, timeOffset: timeOffsetSeconds });
    } catch {
      // Fall through to RFC 6238 generation if invoke fails
    }
  }

  // RFC 6238-compliant browser fallback using Web Crypto API
  const result: Record<string, string> = {};
  for (const acc of accounts) {
    try {
      const code = await rfc6238TOTP(acc.secret, acc.digits || 6, acc.period || 30, acc.algorithm || 'SHA1', timeOffsetSeconds);
      result[acc.id] = code;
    } catch {
      result[acc.id] = '------';
    }
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
      console.error('Tauri load_vault_data failed:', e);
      return [];
    }
  }

  // Browser fallback: ONLY read from localStorage in mock browser environment (non-Tauri)
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

export async function saveVaultData(accounts: Account[], keyHex?: string): Promise<boolean> {
  // If keyHex is provided, GCM-encrypt the notes of accounts before serializing
  const accountsToSave = keyHex 
    ? await Promise.all(accounts.map(async acc => {
        if (acc.notes && acc.notes.trim() !== '') {
          try {
            const encryptedNotes = await encryptMetadata(acc.notes, keyHex);
            return { ...acc, notes: encryptedNotes };
          } catch {
            return acc;
          }
        }
        return acc;
      }))
    : accounts;

  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      await invoke('save_vault_data', { accounts: accountsToSave });
      // In Tauri mode, we do NOT save to localStorage to prevent plaintext secret exposure at rest
      return true;
    } catch (e) {
      console.error('Failed to save vault data to Rust backend:', e);
      return false;
    }
  }

  // Browser fallback: ONLY save to localStorage in mock browser environment (non-Tauri)
  try {
    localStorage.setItem('onlyauth_accounts_v3', JSON.stringify(accountsToSave));
    return true;
  } catch (e) {
    console.error('Failed to save mock accounts to localStorage:', e);
    return false;
  }
}

/**
 * Helper to split a TOTP code with a space — handles 6, 7, and 8 digit codes.
 * 6-digit: "552 109"  7-digit: "552 1094"  8-digit: "5521 0942"
 */
export function formatCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 7) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

/**
 * Formats code with an elegant middle bullet for the Focused 2FA Card.
 * 6-digit: "998" • "641"   7-digit: "998" • "6410"   8-digit: "9986" • "4108"
 */
export function formatFocusedCode(code: string): { first: string; second: string } {
  if (code.length === 6) return { first: code.slice(0, 3), second: code.slice(3) };
  if (code.length === 7) return { first: code.slice(0, 3), second: code.slice(3) };
  if (code.length === 8) return { first: code.slice(0, 4), second: code.slice(4) };
  // Fallback: split roughly in half
  const mid = Math.ceil(code.length / 2);
  return { first: code.slice(0, mid), second: code.slice(mid) };
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

export async function validateImportPayload(payload: string): Promise<{ accounts: any[]; warnings: string[] }> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<{ accounts: any[]; warnings: string[] }>('validate_import_payload', { payload });
    } catch (e) {
      console.warn('Tauri validate_import_payload failed:', e);
    }
  }
  // Browser fallback: strip credential hashes locally
  try {
    const parsed = JSON.parse(payload);
    const warnings: string[] = [];
    const sensitiveKeys = ['passphraseHash', 'masterKeyHash', 'pinHash', 'authHashes', 'authMetadata', 'duressPinHash', 'duressPassphraseHash'];
    if (parsed?.settings) {
      parsed.settings = Object.fromEntries(
        Object.entries(parsed.settings).filter(([key]) => {
          if (sensitiveKeys.includes(key)) {
            warnings.push(`Stripped sensitive setting: ${key}`);
            return false;
          }
          return true;
        })
      );
    }
    return { accounts: parsed?.accounts || [], warnings };
  } catch {
    return { accounts: [], warnings: ['Invalid JSON payload'] };
  }
}

export async function setWindowScreenshotProtection(
  protect: boolean
): Promise<{ success: boolean; warning?: string }> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (!isTauri) {
    return { success: false, warning: 'Not running in Tauri environment' };
  }
  try {
    await invoke('set_window_screenshot_protection', { protect });
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, warning: msg };
  }
}

async function deriveAesKey(keyMaterial: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const rawKey = encoder.encode(keyMaterial);
  const hashedKey = await crypto.subtle.digest('SHA-256', rawKey);
  return await crypto.subtle.importKey(
    'raw',
    hashedKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMetadata(data: string, keyMaterial: string): Promise<string> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<string>('encrypt_metadata', { data, keyMaterial });
    } catch (e) {
      console.error('Tauri encrypt_metadata failed, using fallback:', e);
    }
  }
  // Cryptographically secure Web Crypto fallback (AES-256-GCM)
  try {
    const key = await deriveAesKey(keyMaterial);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );
    
    // Format: hex_iv:hex_ciphertext
    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    const cipherHex = Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${ivHex}:${cipherHex}`;
  } catch (e) {
    console.error('Web Crypto fallback encryption failed:', e);
    throw new Error('Encryption failed');
  }
}

export async function decryptMetadata(encrypted: string, keyMaterial: string): Promise<string> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    try {
      return await invoke<string>('decrypt_metadata', { encrypted, keyMaterial });
    } catch (e) {
      console.error('Tauri decrypt_metadata failed, using fallback:', e);
    }
  }
  // Cryptographically secure Web Crypto fallback decryption (AES-256-GCM)
  try {
    const parts = encrypted.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted metadata format');
    }
    const ivHex = parts[0];
    const cipherHex = parts[1];
    
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const ciphertext = new Uint8Array(cipherHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    
    const key = await deriveAesKey(keyMaterial);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (e) {
    console.error('Web Crypto fallback decryption failed:', e);
    throw new Error('Failed to decrypt metadata: key mismatch or corrupted data');
  }
}

export async function exportFile(filename: string, content: string): Promise<string> {
  const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
  if (isTauri) {
    return await invoke<string>('export_file', { filename, content });
  }
  throw new Error('Tauri context unavailable');
}

