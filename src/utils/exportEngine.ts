import { Account, AppSettings } from '../types';
import { generateQR } from './qrcode';

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
  const purified = accounts.map(({ id: _id, ...rest }) => ({
    ...rest,
    id: _id,
  }));
  const payload: ExportPayload = {
    accounts: purified,
    settings: stripCredentialHashes(settings),
  };
  return JSON.stringify(payload, null, 2);
}

export function exportCSV(accounts: Account[]): string {
  const headers = ['id', 'name', 'email', 'secret', 'notes', 'category', 'isPinned', 'logoType', 'digits', 'period', 'algorithm'];
  const csvRows = [headers.join(',')];
  for (const acc of accounts) {
    const values = [
      acc.id,
      `"${(acc.name || '').replace(/"/g, '""')}"`,
      `"${(acc.email || '').replace(/"/g, '""')}"`,
      acc.secret,
      `"${(acc.notes || '').replace(/"/g, '""')}"`,
      acc.category,
      acc.isPinned ? 'true' : 'false',
      acc.logoType,
      acc.digits || 6,
      acc.period || 30,
      acc.algorithm || 'SHA1'
    ];
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
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
    .map((a, idx) => {
      const label = encodeURIComponent(a.email || a.name);
      const uri = accountToOTPAuthURI(a);
      const qrSvg = generateQR(uri, 4);
      const displayName = a.email ? `${escHtml(a.email)}` : escHtml(a.name);
      const displayLabel = a.email ? escHtml(a.name) : '';
      return `
    <div class="card">
      <div class="card-header">
        <div class="identity">
          <span class="account-label">${displayName}</span>
          ${displayLabel ? `<span class="account-issuer">${displayLabel}</span>` : ''}
        </div>
        <div class="type-badge">TOTP</div>
      </div>
      <div class="card-body">
        <div class="details">
          <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">totp</span></div>
          <div class="detail-row"><span class="detail-label">Algorithm</span><span class="detail-value">${escHtml((a.algorithm || 'SHA1').toLowerCase())}</span></div>
          <div class="detail-row"><span class="detail-label">Digits</span><span class="detail-value">${a.digits || 6}</span></div>
          <div class="detail-row"><span class="detail-label">Period</span><span class="detail-value">${a.period || 30}s</span></div>
          <div class="detail-row secret-row"><span class="detail-label">Secret</span><span class="detail-value secret-value">${escHtml(a.secret)}</span></div>
          <div class="detail-row uri-row"><span class="detail-label">URI</span><span class="detail-value uri-value">${escHtml(uri)}</span></div>
        </div>
        <div class="qr-section">
          ${qrSvg}
        </div>
      </div>
    </div>`;
    })
    .join('\n');

  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Only Auth — OTP Data Export</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0c0c0e; color: #e5e2e1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Mono', 'Fira Code', monospace; padding: 1.5rem; }
.container { max-width: 860px; margin: 0 auto; }
.header-section { text-align: center; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 1.5rem; margin-bottom: 2rem; }
.header-brand { font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.2em; color: #8e90a2; }
.header-title { font-size: 1.25rem; font-weight: 600; color: #00dce5; margin-top: 0.25rem; }
.header-sub { font-size: 0.7rem; color: #8e90a2; margin-top: 0.5rem; line-height: 1.6; }
.header-date { font-size: 0.65rem; color: #555; margin-top: 0.75rem; }
.card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 1.25rem; margin-bottom: 1rem; }
.card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
.account-label { font-size: 0.9rem; font-weight: 600; color: #fff; }
.account-issuer { font-size: 0.7rem; color: #8e90a2; display: block; margin-top: 0.15rem; }
.type-badge { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.1em; padding: 0.25rem 0.6rem; background: rgba(0,220,229,0.08); border: 1px solid rgba(0,220,229,0.2); border-radius: 6px; color: #00dce5; font-weight: 600; }
.card-body { display: flex; gap: 1.5rem; align-items: flex-start; }
.details { flex: 1; min-width: 0; }
.detail-row { display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.detail-row:last-of-type { border-bottom: none; }
.detail-label { font-size: 0.65rem; color: #8e90a2; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
.detail-value { font-size: 0.7rem; color: #e5e2e1; font-weight: 500; }
.secret-value { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.6rem; color: #00dce5; word-break: break-all; max-width: 280px; text-align: right; }
.uri-value { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.55rem; color: #555; word-break: break-all; max-width: 280px; text-align: right; }
.qr-section { flex-shrink: 0; }
.qr-section svg { width: 96px; height: 96px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); display: block; }
.footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; }
.footer-warn { font-size: 0.6rem; color: #8e90a2; line-height: 1.6; }
@media (max-width: 640px) { .card-body { flex-direction: column; align-items: center; } .details { width: 100%; } }
</style>
</head>
<body>
<div class="container">
<div class="header-section">
<p class="header-brand">Only Auth by The Only</p>
<p style="font-size:0.6rem;color:#666;margin-top:0.15rem;"><a href="https://github.com/OnlyXianzo/Only-Auth" target="_blank" style="color:#8e90a2;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg> github.com/OnlyXianzo/Only-Auth</a></p>
<h1 class="header-title">Only Auth — OTP Data Export</h1>
<p class="header-date">${dateStr}</p>
</div>
${rows}
<div class="footer">
<p class="footer-warn">This file contains sensitive two-factor authentication secrets.<br>Keep it encrypted and offline. Delete immediately after use.<br>Generated by Only Auth — ${accounts.length} account${accounts.length !== 1 ? 's' : ''}</p>
</div>
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
    const accounts = (parsed.accounts || []).map((a: any) => ({
    id: a.id || createAccountId(),
    name: a.name || 'Imported',
    email: a.email || '',
    secret: (a.secret || '').toUpperCase(),
    notes: a.notes || '',
    category: a.category || 'personal',
    isPinned: Boolean(a.isPinned),
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
    isPinned: Boolean(item.isPinned),
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
