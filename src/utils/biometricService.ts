import { checkStatus, authenticate } from '@choochmeque/tauri-plugin-biometry-api';
import { invoke } from '@tauri-apps/api/core';

export type BiometricStatus =
  | 'available'
  | 'not_enrolled'     // no biometric key stored yet
  | 'unavailable'      // OS has no biometric hardware/config
  | 'not_supported';   // Linux — no OS biometric API

export interface BiometricCheckResult {
  status: BiometricStatus;
  biometryType?: string;
}

/**
 * Check whether biometric unlock is available AND enrolled on this device.
 * Call this on app startup to decide which unlock UI to show.
 */
export async function checkBiometricStatus(): Promise<BiometricCheckResult> {
  try {
    const status = await checkStatus();

    if (!status.isAvailable) {
      return { status: 'unavailable' };
    }

    const enrolled = await invoke<boolean>('is_biometric_enrolled');
    if (!enrolled) {
      return { status: 'not_enrolled', biometryType: String(status.biometryType) };
    }

    return { status: 'available', biometryType: String(status.biometryType) };
  } catch (err: unknown) {
    // Linux or platform with no biometric support throws here
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not supported') || msg.includes('unavailable')) {
      return { status: 'not_supported' };
    }
    return { status: 'unavailable' };
  }
}

/**
 * Attempt biometric unlock. Returns the master key hex on success.
 * Caller MUST zeroize the returned string after deriving the vault key.
 * Returns null on failure/cancel.
 */
export async function attemptBiometricUnlock(): Promise<string | null> {
  try {
    await authenticate('Unlock Only Auth');
    // OS returned success — now retrieve the key from keychain
    const masterKeyHex = await invoke<string>('retrieve_biometric_key');

    if (masterKeyHex === 'BIOMETRIC_NOT_ENROLLED') {
      return null;
    }

    return masterKeyHex;
  } catch {
    return null; // user cancelled or auth failed
  }
}

/**
 * Enroll biometric: store the master key in OS keychain after a successful
 * passphrase unlock. Call this ONLY when the caller has just verified the
 * passphrase via Argon2id and has the master key in hand.
 */
export async function enrollBiometric(masterKeyHex: string): Promise<boolean> {
  try {
    await invoke('store_biometric_key', { keyHex: masterKeyHex });
    return true;
  } catch {
    return false;
  }
}

/**
 * Revoke biometric enrollment. Call on: passphrase change, user opt-out, duress wipe.
 */
export async function revokeBiometric(): Promise<void> {
  await invoke('delete_biometric_key').catch(() => {
    // best-effort — log but don't throw
  });
}
