import { Account, AppSettings } from '../types';

// ─── Type Definitions ──────────────────────────────────────────────────────────
export interface ExportPayload {
  accounts: Account[];
  settings: Partial<AppSettings>;
}

export interface ImportResult {
  accounts: Account[];
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — otpauth:// URI Engine
// ═══════════════════════════════════════════════════════════════════════════════

export function accountToOTPAuthURI(acc: Account): string {
  const label = encodeURIComponent(acc.email || acc.name);
  const issuer = encodeURIComponent(acc.name);
  const params = new URLSearchParams();
  params.set('secret', acc.secret);
  params.set('issuer', acc.name);
  params.set('algorithm', acc.algorithm || 'SHA1');
  params.set('digits', String(acc.digits || 6));
  params.set('period', String(acc.period || 30));

  const meta: Record<string, string> = {};
  if (acc.isPinned) meta.pinned = '1';
  if (acc.notes) meta.note = acc.notes;
  if (acc.tags?.length) meta.tags = acc.tags.join(',');
  if (acc.category && acc.category !== 'personal') meta.cat = acc.category;
  if (acc.logoType && acc.logoType !== 'custom') meta.icon = acc.logoType;
  if (Object.keys(meta).length > 0) {
    params.set('onlyauth_metadata', encodeURIComponent(JSON.stringify(meta)));
  }

  return `otpauth://totp/${label}?${params.toString()}`;
}

export function parseOTPAuthURI(uri: string): Partial<Account> | null {
  if (!uri.startsWith('otpauth://')) return null;
  try {
    const qIdx = uri.indexOf('?');
    if (qIdx === -1) return null;
    const labelPart = uri.substring('otpauth://totp/'.length, qIdx);
    const label = decodeURIComponent(labelPart);
    const params = new URLSearchParams(uri.substring(qIdx));

    const secret = params.get('secret')?.toUpperCase() || '';
    if (!secret) return null;

    const issuer = params.get('issuer') || label;

    const account: Partial<Account> = {
      name: issuer,
      email: label,
      secret,
      digits: parseInt(params.get('digits') || '6', 10) as 6 | 8,
      period: parseInt(params.get('period') || '30', 10),
      algorithm: (params.get('algorithm') || 'SHA1') as 'SHA1' | 'SHA256' | 'SHA512',
      isPinned: false,
      category: 'personal',
      logoType: 'custom' as Account['logoType'],
      tags: [],
    };

    const metaRaw = params.get('onlyauth_metadata');
    if (metaRaw) {
      try {
        const meta = JSON.parse(decodeURIComponent(metaRaw));
        if (meta.pinned === '1') account.isPinned = true;
        if (meta.note) account.notes = meta.note;
        if (meta.tags) account.tags = meta.tags.split(',').filter(Boolean);
        if (meta.cat) account.category = meta.cat;
        if (meta.icon) account.logoType = meta.icon;
      } catch { /* ignore corrupt metadata */ }
    }

    return account;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Multi-Format Export Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExportFormats {
  plainText: string;
  purifiedJSON: string;
  html: string;
}

function createAccountId(): string {
  return `acc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

function stripCredentialHashes(settings: Partial<AppSettings>): Partial<AppSettings> {
  const clean = { ...settings };
  delete clean.passphraseHash;
  delete clean.masterKeyHash;
  delete clean.pinHash;
  delete clean.authHashes;
  delete clean.authMetadata;
  delete clean.duressPinHash;
  delete clean.duressPassphraseHash;
  return clean;
}

export function exportPurifiedJSON(accounts: Account[], settings: Partial<AppSettings>): string {
  const purified: Account[] = accounts.map(({ id: _id, ...rest }) => ({
    ...rest,
    id: _id,
  }));
  return JSON.stringify({ accounts: purified, settings: stripCredentialHashes(settings) }, null, 2);
}

export function exportPlainTextURI(accounts: Account[]): string {
  return accounts
    .filter(a => a.secret?.trim())
    .map(a => accountToOTPAuthURI(a))
    .join('\n');
}

export function exportHTML(accounts: Account[]): string {
  const rows = accounts
    .filter(a => a.secret?.trim())
    .map(a => {
      const uri = accountToOTPAuthURI(a);
      return `
    <div class="entry">
      <div class="header">
        <span class="issuer">${escHtml(a.name)}</span>
        <span class="email">${escHtml(a.email)}</span>
      </div>
      <div class="secret">${a.secret}</div>
      <div class="meta">${a.digits || 6} digits &middot; ${a.period || 30}s &middot; ${a.algorithm || 'SHA1'}</div>
      <div class="uri">${escHtml(uri)}</div>
    </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Only Auth — Exported Vault</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0a0a0a; color: #e5e2e1; font-family: 'SF Mono', 'Fira Code', monospace; padding: 2rem; }
.container { max-width: 720px; margin: 0 auto; }
h1 { font-size: 1.25rem; color: #00dce5; margin-bottom: 0.25rem; }
.sub { color: #8e90a2; font-size: 0.75rem; margin-bottom: 2rem; }
.entry { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.issuer { font-weight: 700; color: #fff; font-size: 0.875rem; }
.email { color: #8e90a2; font-size: 0.75rem; }
.secret { font-size: 0.75rem; color: #00dce5; word-break: break-all; margin-bottom: 0.25rem; }
.meta { font-size: 0.625rem; color: #8e90a2; }
.uri { font-size: 0.625rem; color: #555; word-break: break-all; margin-top: 0.25rem; padding-top: 0.25rem; border-top: 1px solid rgba(255,255,255,0.05); }
.stats { margin-top: 1.5rem; font-size: 0.75rem; color: #8e90a2; text-align: center; }
</style>
</head>
<body>
<div class="container">
<h1>Only Auth &mdash; Exported Vault</h1>
<p class="sub">${accounts.length} account${accounts.length !== 1 ? 's' : ''} &middot; Generated ${new Date().toISOString().slice(0, 10)}</p>
${rows}
<div class="stats">Securely delete this file after use. Treat all secrets as sensitive.</div>
</div>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Sealed Backup (frontend assembly)
// ═══════════════════════════════════════════════════════════════════════════════

export function buildSealedPayload(accounts: Account[], settings: Partial<AppSettings>): string {
  const sanitized: ExportPayload = {
    accounts,
    settings: stripCredentialHashes(settings),
  };
  return JSON.stringify(sanitized);
}

export function parseSealedPayload(json: string): { accounts: Account[]; settings: Partial<AppSettings> } {
  const parsed = JSON.parse(json);
  const accounts: Account[] = (parsed.accounts || []).map((a: any) => ({
    id: a.id || createAccountId(),
    name: a.name || 'Imported',
    email: a.email || '',
    secret: (a.secret || '').toUpperCase(),
    notes: a.notes || '',
    category: a.category || 'personal',
    isPinned: !!a.isPinned,
    logoType: a.logoType || 'custom',
    color: a.color,
    tags: a.tags || [],
    createdAt: a.createdAt || new Date().toISOString(),
    digits: a.digits ?? 6,
    period: a.period ?? 30,
    algorithm: a.algorithm || 'SHA1',
    nextRotationDate: a.nextRotationDate,
  }));

  const settings = stripCredentialHashes(parsed.settings || {});
  return { accounts, settings };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Multi-Platform Ingestion Parsers
// ═══════════════════════════════════════════════════════════════════════════════

function importAccountBase(item: {
  name?: string;
  secret?: string;
  email?: string;
  notes?: string;
  category?: string;
  isPinned?: boolean;
  logoType?: string;
  tags?: string[];
  digits?: number;
  period?: number;
  algorithm?: string;
}): Account | null {
  if (!item.secret?.trim()) return null;
  return {
    id: createAccountId(),
    name: item.name || 'Imported',
    email: item.email || '',
    secret: item.secret.trim().toUpperCase(),
    notes: item.notes || '',
    category: item.category || 'personal',
    isPinned: !!item.isPinned,
    logoType: (item.logoType || 'custom') as Account['logoType'],
    tags: item.tags || [],
    createdAt: new Date().toISOString(),
    digits: item.digits ?? 6,
    period: item.period ?? 30,
    algorithm: (item.algorithm || 'SHA1') as Account['algorithm'],
  };
}

export function parseOnlyAuthJSON(json: string): ImportResult {
  const warnings: string[] = [];
  try {
    const data = JSON.parse(json);
    let rawAccounts: any[] = [];
    if (Array.isArray(data)) rawAccounts = data;
    else if (data.accounts && Array.isArray(data.accounts)) rawAccounts = data.accounts;
    else throw new Error('Unrecognized Only Auth JSON structure');

    const accounts: Account[] = [];
    for (const item of rawAccounts) {
      const acc = importAccountBase({
        name: item.name,
        secret: item.secret,
        email: item.email,
        notes: item.notes,
        category: item.category,
        isPinned: item.isPinned,
        logoType: item.logoType,
        tags: item.tags,
        digits: item.digits,
        period: item.period,
        algorithm: item.algorithm,
      });
      if (acc) accounts.push(acc);
    }

    if (accounts.length === 0) warnings.push('No valid TOTP accounts found in Only Auth JSON.');
    return { accounts, warnings };
  } catch (e: any) {
    return { accounts: [], warnings: [`Failed to parse Only Auth JSON: ${e.message}`] };
  }
}

export function parseEnteAuthJSON(json: string): ImportResult {
  const warnings: string[] = [];
  try {
    const data = JSON.parse(json);
    const rawAccounts = Array.isArray(data) ? data : data.accounts || [];
    if (!Array.isArray(rawAccounts)) throw new Error('Ente JSON has no accounts array');

    const accounts: Account[] = [];
    for (const item of rawAccounts) {
      const secret = item.secret || item.key;
      if (!secret) continue;
      const acc = importAccountBase({
        name: item.issuer || item.name,
        secret,
        email: item.label || item.username || item.email,
        notes: item.notes,
      });
      if (acc) {
        acc.digits = item.digits ?? 6;
        acc.period = item.period ?? 30;
        acc.algorithm = item.algorithm || 'SHA1';
        accounts.push(acc);
      }
    }

    if (accounts.length === 0) warnings.push('No valid TOTP secrets found in Ente Auth JSON.');
    return { accounts, warnings };
  } catch (e: any) {
    return { accounts: [], warnings: [`Failed to parse Ente Auth JSON: ${e.message}`] };
  }
}

export function parseBitwardenJSON(json: string): ImportResult {
  const warnings: string[] = [];
  try {
    const data = JSON.parse(json);
    const items = data.items || [];
    if (!Array.isArray(items)) throw new Error('Bitwarden JSON has no items array');

    const accounts: Account[] = [];
    for (const item of items) {
      const login = item.login;
      if (!login?.totp) continue;
      const secret = extractSecretFromURI(login.totp);
      if (!secret) continue;
      const acc = importAccountBase({
        name: item.name || item.collectionIds?.[0],
        secret,
        email: login.username,
        notes: item.notes,
      });
      if (acc) accounts.push(acc);
    }

    if (accounts.length === 0) warnings.push('No login items with valid TOTP secrets found in Bitwarden JSON.');
    return { accounts, warnings };
  } catch (e: any) {
    return { accounts: [], warnings: [`Failed to parse Bitwarden JSON: ${e.message}`] };
  }
}

export function parseGoogleAuthJSON(json: string): ImportResult {
  const warnings: string[] = [];
  try {
    const data = JSON.parse(json);
    const rawAccounts = data.otp_parameters || [];
    if (!Array.isArray(rawAccounts)) throw new Error('Google Auth JSON has no otp_parameters array');

    const accounts: Account[] = [];
    for (const item of rawAccounts) {
      const secret = item.secret;
      if (!secret) continue;
      const acc = importAccountBase({
        name: item.issuer || item.name || item.label,
        secret,
        email: item.label || item.email || '',
        algorithm: item.algorithm || 'SHA1',
        digits: item.digits || 6,
        period: item.period || 30,
      });
      if (acc) accounts.push(acc);
    }

    if (accounts.length === 0) warnings.push('No valid TOTP parameters found in Google Auth JSON.');
    return { accounts, warnings };
  } catch (e: any) {
    return { accounts: [], warnings: [`Failed to parse Google Authenticator JSON: ${e.message}`] };
  }
}

export function parseOTPAuthBatch(text: string): ImportResult {
  const warnings: string[] = [];
  const accounts: Account[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('otpauth://')) {
      const parsed = parseOTPAuthURI(line);
      if (parsed) {
        const acc = importAccountBase({
          name: parsed.name,
          secret: parsed.secret,
          email: parsed.email,
          notes: parsed.notes,
          isPinned: parsed.isPinned,
          category: parsed.category,
          logoType: parsed.logoType,
          tags: parsed.tags,
          digits: parsed.digits,
          period: parsed.period,
          algorithm: parsed.algorithm,
        });
        if (acc) accounts.push(acc);
      }
    } else if (/^[A-Z2-7]{8,}$/i.test(line)) {
      const acc = importAccountBase({ secret: line });
      if (acc) accounts.push(acc);
    }
  }

  if (accounts.length === 0) warnings.push('No valid otpauth:// URIs or raw secrets found.');
  return { accounts, warnings };
}

function extractSecretFromURI(uri: string): string | null {
  if (!uri) return null;
  const match = uri.match(/[?&]secret=([A-Z2-7]+)/i);
  if (match?.[1]) return match[1].toUpperCase();
  if (/^[A-Z2-7]{8,}$/i.test(uri.trim())) return uri.trim().toUpperCase();
  return null;
}
