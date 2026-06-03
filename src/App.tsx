import React, { useState, useEffect, useRef, useMemo, FormEvent, ChangeEvent, useCallback } from 'react';
import {
  Lock, Shield, Search, Plus, LockOpen, Briefcase,
  Edit3, Copy, Trash2, Pin, Check, X, ShieldCheck,
  Settings as SettingsIcon, RefreshCw, LogOut, AlertTriangle,
  Fingerprint, Download, Upload, Camera, Layers, Key, Keyboard,
  ChevronRight, Mail, Eye, EyeOff, Menu, ZoomIn, ZoomOut,
  HelpCircle, Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import StarfieldBackground from './components/StarfieldBackground';
import { Account, AppSettings } from './types';
import {
  formatCode, formatFocusedCode,
  SERVICE_COLORS, getSecurityStrength,
  generateBatchTOTP, generateNewSecret,
  loadVaultData, saveVaultData,
  argon2idHash, argon2idVerify,
  encryptBackup, decryptBackup, writeAuditLog, readAuditLogs,
  setWindowScreenshotProtection, encryptMetadata, decryptMetadata, exportFile
} from './utils';
import {
  exportPurifiedJSON, exportPlainTextURI, exportHTML,
  buildSealedPayload, parseSealedPayload,
  parseOnlyAuthJSON, parseOTPAuthBatch,
} from './utils/exportEngine';

// ─── BIP-39 Mini Wordlist (256 common words for demo — real apps use full 2048) ───
const BIP39_WORDS = [
  'abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse',
  'access','accident','account','accuse','achieve','acid','acoustic','acquire','across','act',
  'action','actor','actress','actual','adapt','add','addict','address','adjust','admit',
  'adult','advance','advice','aerobic','afford','afraid','again','age','agent','agree',
  'ahead','aim','air','airport','aisle','alarm','album','alcohol','alert','alien',
  'all','alley','allow','almost','alone','alpha','already','also','alter','always',
  'amateur','amazing','among','amount','amused','analyst','anchor','ancient','anger','angle',
  'animal','ankle','announce','annual','another','answer','antenna','antique','anxiety','apart',
  'april','arch','arctic','area','arena','argue','arm','armor','army','around',
  'arrange','arrest','arrive','arrow','art','artefact','artist','artwork','ask','aspect',
  'assault','asset','assist','assume','asthma','athlete','atom','attack','attend','attitude',
  'attract','auction','audit','august','aunt','author','auto','autumn','average','avocado',
  'avoid','awake','aware','away','awesome','awful','awkward','axis','baby','balance',
  'bamboo','banana','banner','barely','bargain','barrel','base','basic','basket','battle',
  'beach','bean','beauty','become','beef','before','begin','behave','behind','believe',
  'below','belt','bench','benefit','best','betray','better','between','beyond','bicycle',
  'bird','birth','bitter','black','blade','blame','blanket','blast','bleak','bless',
  'blind','blood','blossom','blouse','blue','blur','blush','board','boat','body',
  'boil','bomb','bone','book','boost','border','boring','borrow','boss','bottom',
  'bounce','brain','brand','brave','breeze','brick','bridge','brief','bright','bring',
  'brisk','broccoli','broken','bronze','brown','brush','bubble','buddy','budget','buffalo',
  'build','bulb','burden','burger','burst','bus','business','busy','butter','buyer',
  'buzz','cabbage','cabin','cable','cactus','cage','cake','call','calm','camera',
  'camp','canal','cancel','candy','cannon','canvas','canyon','capable','capital','captain',
  'carbon','card','cargo','carpet','carry','cart','case','cash','casino','castle',
  'casual','cat','catalog','catch','category','cause','cave','ceiling','celery','cement',
];

/** Returns a random BIP39 word from the mini wordlist */
function randomWord(): string {
  return BIP39_WORDS[Math.floor(Math.random() * BIP39_WORDS.length)];
}

/** Generates a passphrase composed of N random BIP39 words */
function generatePassphrase(wordCount: 12 | 18 | 24): string[] {
  return Array.from({ length: wordCount }, () => randomWord());
}

/** Generates a cryptographically random 256-bit master key as a hex string */
function generateMasterKey(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Computes the SHA-256 hex digest of the given text */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Creates a zero-knowledge auth credential — argon2id hash + encrypted metadata */
async function createAuthCredential(enteredInput: string, type: 'pin' | 'passphrase' | 'masterKey' | 'duress', action?: 'wipe' | 'fake') {
  const hash = await argon2idHash(enteredInput);
  const keyMaterial = await sha256(`${enteredInput}OnlyAuthMetadataDerivationSalt2026`);
  const payload = JSON.stringify(action ? { type, action } : { type });
  const encMeta = await encryptMetadata(payload, keyMaterial);
  return { hash, encMeta };
}

// ─── Logo abbreviation helper ───────────────────────────────────────────────
function getLogoAbbreviation(name: string, logoType: string): string {
  if (logoType && logoType !== 'custom') {
    if (logoType === 'slack') return 'SL';
    return logoType.substring(0, 2).toUpperCase();
  }
  if (!name) return '??';
  const split = name.trim().split(/\s+/);
  if (split.length > 1) return (split[0][0] + (split[1][0] || '')).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

// ─── Service color helper ────────────────────────────────────────────────────
function getServiceColors(logoType: string) {
  return SERVICE_COLORS[logoType] || SERVICE_COLORS['custom'];
}

const isRotationDue = (dateStr?: string) => {
  if (!dateStr) return false;
  const targetDate = new Date(dateStr);
  if (isNaN(targetDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  return today >= targetDate;
};


// ─── Brand Catalog auto-recognition ───────────────────────────────────────────
let _brandCatalog: Array<{ title: string; slug?: string; altNames?: string[]; hex?: string }> | null = null;

// Common service aliases not in the catalog JSON
const EXTRA_ALIASES = [
  { title: 'Gmail', slug: 'google', altNames: ['gmail', 'google mail', 'google workspace'] },
  { title: 'YouTube', slug: 'youtube', altNames: ['youtube', 'yt'] },
  { title: 'GitHub', slug: 'github', altNames: ['github', 'gh', 'git hub'] },
  { title: 'Discord', slug: 'discord', altNames: ['discord'] },
  { title: 'Slack', slug: 'slack', altNames: ['slack'] },
  { title: 'AWS', slug: 'amazon', altNames: ['aws', 'amazon web services', 'amazon aws'] },
  { title: 'Stripe', slug: 'stripe', altNames: ['stripe'] },
  { title: 'Proton', slug: 'proton', altNames: ['proton', 'protonmail', 'proton mail', 'proton vpn'] },
  { title: 'Cloudflare', slug: 'cloudflare', altNames: ['cloudflare', 'cf'] },
  { title: 'Vercel', slug: 'vercel', altNames: ['vercel'] },
  { title: 'Microsoft', slug: 'microsoft', altNames: ['microsoft', 'ms', 'azure', 'office 365', 'office365', 'outlook', 'hotmail', 'live'] },
  { title: 'Apple', slug: 'apple', altNames: ['apple', 'icloud', 'apple id'] },
  { title: 'Twitter', slug: 'twitter', altNames: ['twitter', 'x', 'x.com'] },
  { title: 'Facebook', slug: 'facebook', altNames: ['facebook', 'fb', 'meta'] },
  { title: 'Instagram', slug: 'instagram', altNames: ['instagram', 'ig'] },
  { title: 'LinkedIn', slug: 'linkedin', altNames: ['linkedin'] },
  { title: 'Dropbox', slug: 'dropbox', altNames: ['dropbox'] },
  { title: 'Notion', slug: 'notion', altNames: ['notion'] },
  { title: 'Figma', slug: 'figma', altNames: ['figma'] },
  { title: 'Shopify', slug: 'shopify', altNames: ['shopify'] },
  { title: 'Binance', slug: 'binance_exchange', altNames: ['binance'] },
  { title: 'Coinbase', slug: 'coinbase', altNames: ['coinbase'] },
  { title: 'GitLab', slug: 'gitlab', altNames: ['gitlab'] },
  { title: 'Bitbucket', slug: 'bitbucket', altNames: ['bitbucket'] },
  { title: 'Heroku', slug: 'heroku', altNames: ['heroku'] },
  { title: 'DigitalOcean', slug: 'digitalocean', altNames: ['digitalocean', 'digital ocean', 'do'] },
  { title: 'Netlify', slug: 'netlify', altNames: ['netlify'] },
  { title: 'Twilio', slug: 'twilio', altNames: ['twilio'] },
  { title: 'Bitwarden', slug: 'bitwarden', altNames: ['bitwarden'] },
  { title: 'NPM', slug: 'npm', altNames: ['npm', 'node package manager'] },
];

/** Loads the brand icon catalog from the server (fetched once, then cached) */
async function loadBrandCatalog(): Promise<typeof _brandCatalog> {
  if (_brandCatalog) return _brandCatalog;
  try {
    const res = await fetch('/brands/_data/custom-icons.json');
    const data = await res.json();
    _brandCatalog = [...EXTRA_ALIASES, ...(data.icons || [])];
  } catch (err) { console.warn(err);
    _brandCatalog = [...EXTRA_ALIASES];
  }
  return _brandCatalog;
}

/** Returns all catalog slugs that have matching SVG files (for picker browsing) */
function searchBrandCatalog(query: string): Array<{ slug: string; title: string }> {
  if (!_brandCatalog) return [];
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];
  const results: Array<{ slug: string; title: string; score: number }> = [];
  const seen = new Set<string>();
  for (const entry of _brandCatalog) {
    const slug = entry.slug || entry.title.toLowerCase().replace(/\s+/g, '_');
    if (seen.has(slug)) continue;
    const titleL = entry.title.toLowerCase();
    const altL = entry.altNames?.map(a => a.toLowerCase()) ?? [];
    let score = 0;
    if (slug === normalizedQuery || titleL === normalizedQuery || altL.includes(normalizedQuery)) score = 100;
    else if (slug.startsWith(normalizedQuery) || titleL.startsWith(normalizedQuery) || altL.some(a => a.startsWith(normalizedQuery))) score = 80;
    else if (slug.includes(normalizedQuery) || titleL.includes(normalizedQuery) || altL.some(a => a.includes(normalizedQuery))) score = 50;
    if (score > 0) {
      results.push({ slug, title: entry.title, score });
      seen.add(slug);
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 24).map(({ slug, title }) => ({ slug, title }));
}

/** Matches a user-provided input string to the closest brand in the catalog (exact → prefix → substring) */
function matchBrandFromCatalog(input: string): { slug: string; hex?: string } | null {
  if (!input || !_brandCatalog) return null;
  const lower = input.toLowerCase();
  // Pass 1: exact match on slug, title, or altNames (highest precision)
  for (const entry of _brandCatalog) {
    const slug = entry.slug || entry.title.toLowerCase().replace(/\s+/g, '_');
    if (slug === lower) return { slug, hex: entry.hex };
    if (entry.title.toLowerCase() === lower) return { slug, hex: entry.hex };
    if (entry.altNames?.some(a => a.toLowerCase() === lower)) return { slug, hex: entry.hex };
  }
  // Pass 2: word-starts-with match (e.g. "git" → "github" but not "gmail" → "gmx")
  for (const entry of _brandCatalog) {
    const slug = entry.slug || entry.title.toLowerCase().replace(/\s+/g, '_');
    if (slug.startsWith(lower) || entry.title.toLowerCase().startsWith(lower)) return { slug, hex: entry.hex };
    if (entry.altNames?.some(a => a.toLowerCase().startsWith(lower))) return { slug, hex: entry.hex };
  }
  // Pass 3: substring (lowest priority — only if nothing better found)
  for (const entry of _brandCatalog) {
    const slug = entry.slug || entry.title.toLowerCase().replace(/\s+/g, '_');
    if (slug.includes(lower) || entry.title.toLowerCase().includes(lower)) return { slug, hex: entry.hex };
  }
  return null;
}

// ─── Brand Logo Component with SVG Try-and-Fallback ─────────────────────────
interface BrandLogoProps {
  name: string;
  logoType?: string;
  className?: string;
}

/** Renders a brand logo — loads SVG from the icon catalog with a letter abbreviation fallback */
function BrandLogo({ name, logoType, className = "w-10 h-10 text-xs" }: BrandLogoProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [failedSvg, setFailedSvg] = useState(false);

  useEffect(() => {
    setFailedSvg(false);
    const resolvedType = logoType || 'custom';
    if (resolvedType === 'custom') {
      setImgSrc(null);
      return;
    }
    setImgSrc(`/brands/icons/${resolvedType}.svg`);
  }, [logoType]);

  const handleError = () => {
    setFailedSvg(true);
    setImgSrc(null);
  };

  const abbreviation = getLogoAbbreviation(name, logoType || 'custom');
  const colors = getServiceColors(logoType || 'custom');

  if (imgSrc && !failedSvg) {
    return (
      <img
        src={imgSrc}
        alt={name}
        onError={handleError}
        className={`${className} object-contain rounded-xl`}
      />
    );
  }

  return (
    <div className={`${className} ${colors.bg} ${colors.border} border flex items-center justify-center ${colors.text} font-bold rounded-xl`}>
      {abbreviation}
    </div>
  );
}

// ─── Default settings ────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
  passphraseHash: '',
  masterKeyHash: '',
  pinHash: '',
  authHashes: [],
  authMetadata: {},
  autoRenewInterval: 60,
  accountListPlacement: 'right',
  lastBackupDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  customTags: ['personal', 'work', 'finance', 'social'],
  securityKeys: [
    { id: 'key-1', name: 'Primary YubiKey 5C', keyType: 'FIDO2 / WebAuthn', addedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }
  ],
  compactMode: false,
  appLockEnabled: true,
  appLockMethod: 'passphrase',
  pinAttempts: 0,
  pinLength: 0,
  forceSearchOnStartup: false,
  devAccountName: 'Dev Account',
  devAccountTag: 'Premium',
  githubContributor: false,
  hiddenVaultSettings: { isEnabled: false, hash: '', method: 'pin' },
  duressPinHash: '',
  duressPassphraseHash: '',
  duressAction: 'fake',
  autoLockTimeout: 300,
  instantLockOnBlur: false,
  screenshotProtection: true,
  appThemeAccent: 'cyan',
};

// Helper for Bitwarden URI parsing
// ─── Toast Notification System ──────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info';
interface Toast { id: string; message: string; type: ToastType; }

interface MockSecurityKey {
  id: string;
  name: string;
  keyType: string;
  addedAt: string;
}

interface MockFIDO2Credential {
  id: string;
  type: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports: string[];
  };
}

// ─── FIDO2 / WebAuthn Mock Registration Subcomponent ───
function WebAuthnRegFlow({ keyName, onCancel, onComplete }: { keyName: string; onCancel: () => void; onComplete: (key: MockSecurityKey) => void }) {
  const [step, setStep] = useState<'detecting' | 'touch' | 'generated'>('detecting');
  const [progress, setProgress] = useState(0);
  const [mockCred, setMockCred] = useState<MockFIDO2Credential | null>(null);

  useEffect(() => {
    if (step === 'detecting') {
      const interval = setInterval(() => {
        setProgress(p => {
          if (p >= 100) {
            clearInterval(interval);
            setStep('touch');
            return 100;
          }
          return p + 10;
        });
      }, 200);
      return () => clearInterval(interval);
    }
    return;
  }, [step]);

  const handleTouchKey = () => {
    const randomId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const randomPublicKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    setMockCred({
      id: `mock-fido2-${randomId}`,
      type: 'public-key',
      rawId: btoa(randomId),
      response: {
        clientDataJSON: btoa(JSON.stringify({
          type: 'webauthn.create',
          challenge: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
          origin: window.location.origin
        })),
        attestationObject: btoa(`attestation-mock-obj-${randomPublicKey}`),
        transports: ['usb', 'nfc']
      }
    });
    setStep('generated');
  };

  if (step === 'detecting') {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-2">
        <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
          <div className="bg-[var(--color-accent)] h-full transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-[#c4c5d9] animate-pulse">Requesting navigator.credentials.create()...</p>
        <p className="text-[10px] text-[#8e90a2]">Insert your security key into a USB port now.</p>
        <button type="button" onClick={onCancel} className="mt-2 text-xs text-[#8e90a2] hover:text-white transition-colors">Cancel</button>
      </div>
    );
  }

  if (step === 'touch') {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-2 animate-fade-in">
        <p className="text-xs text-white font-semibold">Security key detected!</p>
        <button
          type="button"
          onClick={handleTouchKey}
          className="w-16 h-16 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)] flex items-center justify-center cursor-pointer hover:bg-[var(--color-accent)]/20 animate-pulse active:scale-95 transition-all text-white font-bold"
        >
          TOUCH
        </button>
        <p className="text-[10px] text-[#c4c5d9]">Touch the flashing sensor on your key to authorize.</p>
        <button type="button" onClick={onCancel} className="mt-1 text-xs text-[#8e90a2] hover:text-white transition-colors">Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <div className="p-3 bg-black/40 border border-white/5 rounded-xl text-left space-y-1.5 font-mono text-[9px] text-green-400 overflow-x-auto max-h-[140px] select-text scrollbar-thin">
        <p className="text-white border-b border-white/10 pb-1 font-bold">✓ Credentials Created</p>
        <p>id: {mockCred?.id.substring(0, 20)}...</p>
        <p>type: {mockCred?.type}</p>
        <p>rawId: {mockCred?.rawId.substring(0, 16)}...</p>
        <div className="text-zinc-400 pt-1">response: &#123;</div>
        <p className="pl-3 text-zinc-500">clientDataJSON: "{mockCred?.response.clientDataJSON.substring(0, 24)}..."</p>
        <p className="pl-3 text-zinc-500">attestationObject: "{mockCred?.response.attestationObject.substring(0, 24)}..."</p>
        <div className="text-zinc-400">&#125;</div>
      </div>
      <p className="text-xs text-[#c4c5d9] text-center">FIDO2 key registered with client signature.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2 text-xs text-[#8e90a2] hover:text-white font-semibold border border-white/10 rounded-xl">Discard</button>
        <button
          type="button"
          onClick={() => {
            if (mockCred) {
              onComplete({
                id: mockCred.id,
                name: keyName,
                keyType: 'FIDO2 / WebAuthn Mock',
                addedAt: new Date().toISOString()
              });
            }
          }}
          className="flex-1 py-2 text-xs bg-[var(--color-accent)] text-black font-semibold rounded-xl hover:opacity-90 transition-opacity"
        >
          Save Key
        </button>
      </div>
    </div>
  );
}

// ─── FIDO2 / WebAuthn Mock Authentication Subcomponent ───
function WebAuthnAuthFlow({ onCancel, onComplete }: { onCancel: () => void; onComplete: () => void }) {
  const [step, setStep] = useState<'detecting' | 'touch' | 'success'>('detecting');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (step === 'detecting') {
      const interval = setInterval(() => {
        setProgress(p => {
          if (p >= 100) {
            clearInterval(interval);
            setStep('touch');
            return 100;
          }
          return p + 10;
        });
      }, 200);
      return () => clearInterval(interval);
    }
    return;
  }, [step]);

  const handleTouchKey = () => {
    setStep('success');
    setTimeout(() => {
      onComplete();
    }, 1000);
  };

  if (step === 'detecting') {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-2">
        <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
          <div className="bg-[var(--color-accent)] h-full transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-[#c4c5d9] animate-pulse">Requesting navigator.credentials.get()...</p>
        <p className="text-[10px] text-[#8e90a2]">Locating registered FIDO2 security credentials.</p>
        <button type="button" onClick={onCancel} className="mt-2 text-xs text-[#8e90a2] hover:text-white transition-colors">Cancel</button>
      </div>
    );
  }

  if (step === 'touch') {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-2 animate-fade-in">
        <p className="text-xs text-white font-semibold">Security key responsive!</p>
        <button
          type="button"
          onClick={handleTouchKey}
          className="w-16 h-16 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)] flex items-center justify-center cursor-pointer hover:bg-[var(--color-accent)]/20 animate-pulse active:scale-95 transition-all text-white font-bold"
        >
          TOUCH
        </button>
        <p className="text-[10px] text-[#c4c5d9]">Touch the sensor to verify challenge signature.</p>
        <button type="button" onClick={onCancel} className="mt-1 text-xs text-[#8e90a2] hover:text-white transition-colors">Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4 animate-fade-in text-center">
      <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
        <Check className="w-5 h-5 animate-pulse" />
      </div>
      <p className="text-xs text-emerald-400 font-semibold font-mono">Signature Verified!</p>
      <p className="text-[10px] text-[#8e90a2]">Unlocking vault...</p>
    </div>
  );
}

// ─── Biometrics Mock Authentication Subcomponent ───
function BiometricsFlow({ onCancel, onComplete }: { onCancel: () => void; onComplete: () => void }) {
  const [step, setStep] = useState<'scanning' | 'ready' | 'success'>('scanning');

  useEffect(() => {
    const timer = setTimeout(() => {
      setStep('ready');
    }, 1500); // Pulse scan line for 1.5s
    return () => clearTimeout(timer);
  }, []);

  const handleTapScanner = () => {
    setStep('success');
    setTimeout(() => {
      onComplete();
    }, 1000);
  };

  if (step === 'scanning') {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-4">
        <div className="relative w-20 h-20 flex items-center justify-center">
          <Fingerprint className="w-12 h-12 text-[var(--color-accent)] animate-pulse" />
          <div className="absolute inset-0 border-2 border-dashed border-[var(--color-accent)]/30 rounded-full animate-spin" style={{ animationDuration: '4s' }} />
        </div>
        <p className="text-xs text-[#c4c5d9] animate-pulse">Initializing hardware biometric engine...</p>
        <button type="button" onClick={onCancel} className="mt-2 text-xs text-[#8e90a2] hover:text-white transition-colors">Cancel</button>
      </div>
    );
  }

  if (step === 'ready') {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-4 animate-fade-in">
        <button
          type="button"
          onClick={handleTapScanner}
          className="relative w-20 h-20 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)] flex items-center justify-center cursor-pointer hover:bg-[var(--color-accent)]/20 animate-bounce active:scale-95 transition-all text-[var(--color-accent)]"
        >
          <Fingerprint className="w-10 h-10" />
        </button>
        <p className="text-xs text-white font-semibold">Ready to verify.</p>
        <p className="text-[10px] text-[#c4c5d9]">Tap the scanner above to complete biometric verification.</p>
        <button type="button" onClick={onCancel} className="mt-1 text-xs text-[#8e90a2] hover:text-white transition-colors">Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4 animate-fade-in text-center">
      <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-pulse">
        <Check className="w-5 h-5" />
      </div>
      <p className="text-xs text-emerald-400 font-semibold font-mono">Biometrics Authenticated!</p>
      <p className="text-[10px] text-[#8e90a2]">Access granted.</p>
    </div>
  );
}


// ─── Account Footer Subcomponent ─────────────────────────────────────────────
function AccountFooter({ focusedAccount, compact, focusedCode, handleCopyCode }: { focusedAccount: any, compact: boolean, focusedCode: string, handleCopyCode: (id: string, code: string) => void }) {
  const accountPeriod = focusedAccount.period || 30;
  const [accountSecondsRemaining, setAccountSecondsRemaining] = useState(accountPeriod - (Math.floor(Date.now() / 1000) % accountPeriod));

  useEffect(() => {
    const id = setInterval(() => {
      setAccountSecondsRemaining(accountPeriod - (Math.floor(Date.now() / 1000) % accountPeriod));
    }, 1000);
    return () => clearInterval(id);
  }, [accountPeriod]);

  return (
    <div className={`flex flex-col gap-3 border-t border-white/5 ${compact ? 'pt-3' : 'pt-4'} relative z-10`}>
      {!compact && focusedAccount.notes && (
        <p className="text-xs text-[#c4c5d9] leading-relaxed italic">{focusedAccount.notes}</p>
      )}
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#8e90a2]">Refreshes in <span className="font-mono text-white font-semibold">{accountSecondsRemaining}s</span></span>
        {focusedAccount.secret && focusedAccount.secret.trim() !== "" && (
          <button onClick={() => handleCopyCode(focusedAccount.id, focusedCode)}
            className="flex items-center gap-1 text-[var(--color-accent)] hover:text-white transition-colors">
            <Copy className="w-3.5 h-3.5" /> <span>Copy Code</span>
          </button>
        )}
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full progress-bar-inner bg-[var(--color-accent)]" style={{ width: `${(accountSecondsRemaining / accountPeriod) * 100}%` }} />
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = (message: string, type: ToastType = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 3800);
  };
  // ── Persistent state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isAccountsLoaded, setIsAccountsLoaded] = useState(false);
  const [decryptedLogKeyHex, setDecryptedLogKeyHex] = useState<string>('');

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('onlyauth_settings_v3');
    if (saved) { try { const parsed = JSON.parse(saved); if (parsed && typeof parsed === 'object') return { ...DEFAULT_SETTINGS, ...parsed }; } catch (err) { console.debug(err);  /* invalid saved settings */ } }
    return DEFAULT_SETTINGS;
  });

  // ── WebAuthn & Biometrics Simulator States
  const [isWebAuthnRegistering, setIsWebAuthnRegistering] = useState(false);
  const [isWebAuthnAuthenticating, setIsWebAuthnAuthenticating] = useState(false);
  const [webAuthnRegKeyName, setWebAuthnRegKeyName] = useState('');
  const [isBiometricSimulating, setIsBiometricSimulating] = useState(false);

  useEffect(() => {
    const bootData = async () => {
      const saved = await loadVaultData();
      setAccounts(saved);
      setIsAccountsLoaded(true);
    };
    bootData();
  }, []);

  useEffect(() => {
    const applyScreenshotProtection = async () => {
      const protect = settings.screenshotProtection !== false;
      const res = await setWindowScreenshotProtection(protect);
      if (protect && !res.success && res.warning) {
        showToast(res.warning, 'info');
      }
    };
    applyScreenshotProtection();
  }, [settings.screenshotProtection]);

  useEffect(() => { 
    if (isAccountsLoaded) {
      saveVaultData(accounts, decryptedLogKeyHex);
      if (accounts.length > 0) {
        setSettings(prev => ({ ...prev, lastModifiedDate: new Date().toISOString() }));
      }
    }
  }, [accounts, isAccountsLoaded, decryptedLogKeyHex]);
  useEffect(() => { localStorage.setItem('onlyauth_settings_v3', JSON.stringify(settings)); }, [settings]);

  // ── Auth state
  const isFirstRun = (!settings.authHashes || settings.authHashes.length === 0) && !settings.passphraseHash;
  const [isLocked, setIsLocked] = useState(true);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    if (isLocked) {
      setIsFakeVaultActive(false);
      setIsHiddenVaultActive(false);
      setDecryptedLogKeyHex('');
    }
  }, [isLocked]);

  // ── Mobile Responsive & UX State Variables
  const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState<boolean>(false);
  const [isCreatingNewTagInModal, setIsCreatingNewTagInModal] = useState<boolean>(false);
  const [newTagNameInModal, setNewTagNameInModal] = useState<string>('');

  // ── Blur Protection & Inactivity Auto-Lock States
  const [isWindowBlurred, setIsWindowBlurred] = useState<boolean>(false);
  const [isFakeVaultActive, setIsFakeVaultActive] = useState<boolean>(false);
  const [backupPassword, setBackupPassword] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<string[]>([]);
  const [showDuressSetup, setShowDuressSetup] = useState<boolean>(false);
  const [duressSetupPin, setDuressSetupPin] = useState<string>('');
  const [duressSetupConfirm, setDuressSetupConfirm] = useState<string>('');
  const [duressSetupError, setDuressSetupError] = useState<string>('');

  // ── Isolated Compartment (Stealth Hidden Keys) State Variables
  const [isHiddenVaultActive, setIsHiddenVaultActive] = useState<boolean>(false);
  const [showHiddenSetupModal, setShowHiddenSetupModal] = useState<boolean>(false);
  const [hiddenVaultSetupMethod, setHiddenVaultSetupMethod] = useState<'pin' | 'passphrase'>('pin');
  const [hiddenVaultSetupInput, setHiddenVaultSetupInput] = useState<string>('');
  const [hiddenVaultSetupConfirm, setHiddenVaultSetupConfirm] = useState<string>('');
  const [hiddenVaultSetupError, setHiddenVaultSetupError] = useState<string>('');

  // ── Partition Settings Panel states
  const [partitionMethod, setPartitionMethod] = useState<'pin' | 'passphrase'>('pin');
  const [partitionInput, setPartitionInput] = useState<string>('');
  const [partitionConfirm, setPartitionConfirm] = useState<string>('');
  const [partitionError, setPartitionError] = useState<string>('');

  // ── Mock Tauri Invoke cryptographic boundary
  const verifyHiddenCredentials = async (input: string): Promise<boolean> => {
    // Mock Tauri invoke fallback if tauri is not available
    try {
      if ((window as any).__TAURI__) {
        return await (window as any).__TAURI__.invoke('verify_hidden_credentials', { input });
      }
    } catch (err) { console.debug(err);  /* Tauri unavailable, use browser fallback */ }
    // Fallback mock logic for web environment:
    // If no hash is set, default secret is "9999" (PIN) or the master passphrase/key hash matching
    if (!settings.hiddenVaultSettings?.hash) {
      const fallbackHash = await sha256("9999");
      const hash = await sha256(input);
      return hash === fallbackHash || hash === settings.passphraseHash || hash === settings.masterKeyHash;
    }
    const hash = await sha256(input);
    return hash === settings.hiddenVaultSettings.hash || hash === settings.passphraseHash || hash === settings.masterKeyHash;
  };

  const handleSetupHiddenVault = async (e: FormEvent) => {
    e.preventDefault();
    setHiddenVaultSetupError('');
    
    if (!hiddenVaultSetupInput.trim()) {
      setHiddenVaultSetupError('Input cannot be empty.');
      return;
    }
    if (hiddenVaultSetupInput !== hiddenVaultSetupConfirm) {
      setHiddenVaultSetupError('Credentials do not match.');
      return;
    }
    if (hiddenVaultSetupMethod === 'pin' && !/^\d{4,8}$/.test(hiddenVaultSetupInput)) {
      setHiddenVaultSetupError('PIN must be between 4 and 8 digits.');
      return;
    }

    try {
      const hash = await sha256(hiddenVaultSetupInput.trim());
      setSettings(prev => ({
        ...prev,
        hiddenVaultSettings: { isEnabled: true, hash, method: hiddenVaultSetupMethod },
        customTags: prev.customTags.includes('hidden') ? prev.customTags : [...prev.customTags, 'hidden']
      }));
      setShowHiddenSetupModal(false);
      showToast('Isolated Compartment initialized. Type passcode in the search bar to unlock.', 'success');
    } catch (_err) {
      setHiddenVaultSetupError('An error occurred during hashing.');
    }
  };

  // Setup flow
  type SetupStep = 'choose-words' | 'reveal-keys' | 'set-pin';
  const [setupStep, setSetupStep] = useState<SetupStep>('choose-words');
  const [setupWordCount, setSetupWordCount] = useState<12 | 18 | 24>(12);
  const [setupWords, setSetupWords] = useState<string[]>([]);
  const [setupMasterKey, setSetupMasterKey] = useState('');
  const [setupSaved, setSetupSaved] = useState(false);
  const [setupPin, setSetupPin] = useState('');
  const [setupPinConfirm, setSetupPinConfirm] = useState('');
  const [setupPinError, setSetupPinError] = useState('');
  const [setupPinPhase, setSetupPinPhase] = useState<'enter' | 'confirm'>('enter');
  const [showSetupKey, setShowSetupKey] = useState(false);
  const [quizIndices, setQuizIndices] = useState<number[]>([]);
  const [quizInputs, setQuizInputs] = useState<string[]>(['', '', '']);
  const [quizError, setQuizError] = useState<string>('');

  // Unlock
  type UnlockMethod = 'passphrase' | 'pin' | 'biometrics';
  const [unlockMethod, setUnlockMethod] = useState<UnlockMethod>(() => {
    if (!settings.appLockEnabled) {
      return 'passphrase';
    }
    if (settings.appLockMethod === 'biometrics') {
      return 'biometrics';
    }
    if (settings.pinHash && settings.pinAttempts < 5) {
      return 'pin';
    }
    return 'passphrase';
  });
  const [unlockInput, setUnlockInput] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [showUnlockInput, setShowUnlockInput] = useState(false);
  const [biometricsSupported, setBiometricsSupported] = useState(false);
  const [showVisualKeypad, setShowVisualKeypad] = useState(false);
  const [isMobileScreen, setIsMobileScreen] = useState(false);

  const accent = settings.appThemeAccent || 'cyan';
  const accentHex = {
    cyan: '#00dce5',
    amber: '#f59e0b',
    emerald: '#10b981',
    purple: '#8b5cf6',
    crimson: '#e11d48'
  }[accent] || '#00dce5';

  const accentText = {
    cyan: 'text-[var(--color-accent)]',
    amber: 'text-amber-500',
    emerald: 'text-emerald-500',
    purple: 'text-purple-500',
    crimson: 'text-rose-500'
  }[accent] || 'text-[var(--color-accent)]';

  const accentBg = {
    cyan: 'bg-[var(--color-accent)]',
    amber: 'bg-amber-500',
    emerald: 'bg-emerald-500',
    purple: 'bg-purple-500',
    crimson: 'bg-rose-500'
  }[accent] || 'bg-[var(--color-accent)]';

  const accentBorder = {
    cyan: 'border-[var(--color-accent)]',
    amber: 'border-amber-500',
    emerald: 'border-emerald-500',
    purple: 'border-purple-500',
    crimson: 'border-rose-500'
  }[accent] || 'border-[var(--color-accent)]';

  useEffect(() => {
    const root = document.documentElement;
    const themes = {
      cyan: { hex: '#00dce5', rgb: '0, 220, 229' },
      amber: { hex: '#f59e0b', rgb: '245, 158, 11' },
      emerald: { hex: '#10b981', rgb: '16, 185, 129' },
      purple: { hex: '#8b5cf6', rgb: '139, 92, 246' },
      crimson: { hex: '#e11d48', rgb: '225, 29, 72' }
    };
    const theme = themes[accent] || themes.cyan;
    root.style.setProperty('--color-accent', theme.hex);
    root.style.setProperty('--color-accent-rgb', theme.rgb);
    root.style.setProperty('--theme-accent', theme.hex);
  }, [accent]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 640);
      if (window.innerWidth < 768) {
        setSidebarCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check biometrics support
  useEffect(() => {
    setBiometricsSupported(true);
  }, []);

  // ── Auto-Lock on Inactivity + Window Blur Security effects
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (isLocked) return;

    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('mousedown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);

    // Run a high-frequency checker for custom auto-lock interval
    const checker = setInterval(() => {
      const timeoutSec = settings.autoLockTimeout ?? 300;
      if (timeoutSec <= 0) return; // "Never" option

      const elapsed = (Date.now() - lastActivityRef.current) / 1000;
      if (elapsed >= timeoutSec) {
        safeTransition(() => {
          setIsLocked(true);
          setIsFakeVaultActive(false);
          setIsHiddenVaultActive(false);
          setDecryptedLogKeyHex('');
          showToast('Vault auto-locked due to inactivity.', 'info');
        });
      }
    }, 2000);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('mousedown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      clearInterval(checker);
    };
  }, [isLocked, settings.autoLockTimeout]);

  // Window Focus/Blur Handling
  useEffect(() => {
    const handleBlur = () => {
      setIsWindowBlurred(true);
      if (!isLocked && settings.instantLockOnBlur) {
        safeTransition(() => {
          setIsLocked(true);
          setIsFakeVaultActive(false);
          setIsHiddenVaultActive(false);
          setDecryptedLogKeyHex('');
          showToast('Vault auto-locked on window blur.', 'info');
        });
      }
    };

    const handleFocus = () => {
      setIsWindowBlurred(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setIsWindowBlurred(true);
      } else {
        setIsWindowBlurred(false);
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Tauri-native focus change listener wrapping
    let unlistenBlur: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;
    const setupTauriListeners = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow() as any;
        unlistenBlur = await win.onBlur(handleBlur);
        unlistenFocus = await win.onFocus(handleFocus);
      } catch (err) { console.debug(err);  /* not in Tauri environment */ }
    };
    setupTauriListeners();

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (unlistenBlur) unlistenBlur();
      if (unlistenFocus) unlistenFocus();
    };
  }, [isLocked, settings.instantLockOnBlur]);

  // ── App state
  const [activeTag, setActiveTag] = useState<string>('all');
  useEffect(() => {
    if (settings.hiddenVaultSettings) {
      setPartitionMethod(settings.hiddenVaultSettings.method === 'passphrase' ? 'passphrase' : 'pin');
    }
  }, [settings.hiddenVaultSettings, activeTag]);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedAccountId, setFocusedAccountId] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('onlyauth_sidebar_width');
    return saved ? parseInt(saved, 10) : 288;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isThanksActive, setIsThanksActive] = useState(false);

  useEffect(() => {
    localStorage.setItem('onlyauth_sidebar_width', sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const doDrag = (e: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(450, e.clientX));
      setSidebarWidth(newWidth);
    };
    const stopDrag = () => {
      setIsResizing(false);
    };
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
    return () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };
  }, [isResizing]);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [copyFeedbackMap, setCopyFeedbackMap] = useState<Record<string, boolean>>({});
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [verificationInput, setVerificationInput] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'save' | 'delete' | 'update-passphrase' | 'update-pin' | 'update-masterkey' | 'update-partition-settings' | 'disable-partition' | 'settings-unlock' | 'export'; data?: unknown } | null>(null);

  const [showVerificationInput, setShowVerificationInput] = useState(false);

  // Add/Edit form
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formSecret, setFormSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [formNotes, setFormNotes] = useState('');
  const [formCategory, setFormCategory] = useState('personal');
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [formLogoType, setFormLogoType] = useState<Account['logoType']>('custom');
  const [formTagsString, setFormTagsString] = useState('');
  const [formDigits, setFormDigits] = useState<number>(6);
  const [formPeriod, setFormPeriod] = useState<number>(30);
  const [formAlgorithm, setFormAlgorithm] = useState<'SHA1' | 'SHA256' | 'SHA512'>('SHA1');
  const [formNextRotationDate, setFormNextRotationDate] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const formSecretRef = useRef<string>('');
  const isVerifyingRef = useRef(false);
  const passphraseInputRef = useRef<HTMLInputElement>(null);
  const iconSearchInputRef = useRef<HTMLInputElement>(null);
  const verificationInputRef = useRef<HTMLInputElement>(null);

  // Sync the ref whenever formSecret state changes — survives modal transitions
  useEffect(() => { formSecretRef.current = formSecret; }, [formSecret]);

  // DeepSource JS-0757: ref-based autoFocus replacements
  useEffect(() => {
    if (setupStep === 'set-pin') {
      document.getElementById('setup-pin-hidden')?.focus();
    }
  }, [setupStep, setupPinPhase]);

  useEffect(() => {
    if (!isLocked) return;
    pinInputRef.current?.focus();
  }, [isLocked, unlockMethod]);

  useEffect(() => {
    if (!isLocked || unlockMethod !== 'passphrase') return;
    passphraseInputRef.current?.focus();
  }, [isLocked, unlockMethod]);

  useEffect(() => {
    if (!isMobileSearchExpanded) return;
    searchInputRef.current?.focus();
  }, [isMobileSearchExpanded]);

  // Icon Picker state
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconSearchQuery, setIconSearchQuery] = useState('');
  const [iconSearchResults, setIconSearchResults] = useState<Array<{ slug: string; title: string }>>([]);
  const [isSettingsUnlocked, setIsSettingsUnlocked] = useState(false);
  const [pendingExportFormat, setPendingExportFormat] = useState<'purified-json' | 'plain-text' | 'html' | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Focus refs for modals and drawers
  useEffect(() => {
    if (!showIconPicker) return;
    iconSearchInputRef.current?.focus();
  }, [showIconPicker]);

  useEffect(() => {
    if (!isVerificationModalOpen) return;
    verificationInputRef.current?.focus();
  }, [isVerificationModalOpen]);

  // Settings sub-states
  const [settingsSubTab, setSettingsSubTab] = useState<'layout' | 'profile' | 'passphrase' | 'tags' | 'import-export' | 'hardware' | 'app-lock'>('layout');
  const [newTagName, setNewTagName] = useState('');
  const [newPinField, setNewPinField] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [newPassphraseWords, setNewPassphraseWords] = useState<string[]>([]);
  const [newMasterKeyField, setNewMasterKeyField] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [isAddingHardwareKey, setIsAddingHardwareKey] = useState(false);

  // Transition safety
  const [isTransitioning, setIsTransitioning] = useState(false);
  const safeTransition = useCallback((fn: () => void) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    try {
      fn();
    } finally {
      setTimeout(() => { setIsTransitioning(false); }, 50);
    }
  }, [isTransitioning]);

  // ── MEMORY SCRUBBING & RAM CLEARDOWN ──
  // Scrub views/modals secrets on lock, close, or tag/setup transitions
  useEffect(() => {
    if (!isAddModalOpen) {
      setFormSecret("");
    }
  }, [isAddModalOpen]);

  useEffect(() => {
    if (isLocked) {
      setUnlockInput("");
      setVerificationInput("");
      setFormSecret("");
      setIsSettingsUnlocked(false);
    }
  }, [isLocked]);

  useEffect(() => {
    setUnlockInput("");
    setVerificationInput("");
    setFormSecret("");
  }, [activeTag, setupStep]);

  // Scrub settings input buffers when settings sub-tab changes
  useEffect(() => {
    return () => {
      setNewPassphraseWords([]);
      setNewPinField("");
      setNewPinConfirm("");
      setNewMasterKeyField("");
    };
  }, [settingsSubTab, activeTag]);

  // Zero out setup secrets immediately when setup is complete and isFirstRun transitions to false
  useEffect(() => {
    return () => {
      setSetupWords([]);
      setSetupMasterKey("");
      setSetupPin("");
      setSetupPinConfirm("");
    };
  }, [isFirstRun]);

  // ── Load brand catalog for icon auto-recognition
  useEffect(() => { loadBrandCatalog(); }, []);

  // Global unmount scrubbing
  useEffect(() => {
    return () => {
      setSetupWords([]);
      setSetupMasterKey("");
      setSetupPin("");
      setSetupPinConfirm("");
      setUnlockInput("");
      setVerificationInput("");
      setNewPassphraseWords([]);
      setNewPinField("");
      setNewPinConfirm("");
      setNewMasterKeyField("");
      setFormSecret("");
    };
  }, []);

  // ── Batched TOTP codes from Rust backend
  const [totpCodes, setTotpCodes] = useState<Record<string, string>>({});

  // ⚡ Perf: totpEpoch only changes when the TOTP time window rolls over (every ~30s),
  // This eliminates batch crypto operations per period.
  // Uses the minimum period across all accounts to ensure the fastest-rotating code
  // triggers a refresh in time.
  const [totpEpoch, setTotpEpoch] = useState(() => {
    const minPeriod = accounts.length > 0
      ? Math.min(...accounts.map(a => a.period || 30))
      : 30;
    const now = Math.floor(Date.now() / 1000) + (settings.timeOffsetSeconds || 0);
    return Math.floor(now / minPeriod);
  });

  useEffect(() => {
    const minPeriod = accounts.length > 0
      ? Math.min(...accounts.map(a => a.period || 30))
      : 30;

    // Check every second to see if epoch needs updating
    const id = setInterval(() => {
      const now = Math.floor(Date.now() / 1000) + (settings.timeOffsetSeconds || 0);
      const newEpoch = Math.floor(now / minPeriod);
      setTotpEpoch(prev => (prev !== newEpoch ? newEpoch : prev));
    }, 1000);

    return () => clearInterval(id);
  }, [accounts, settings.timeOffsetSeconds]);

  useEffect(() => {
    let isCurrent = true;
    const updateTokens = async () => {
      const allAccounts = accounts.filter(a => a.secret && a.secret.trim() !== '');
      if (allAccounts.length === 0) {
        if (isCurrent) { setTotpCodes({}); }
        return;
      }
      const batchPayload = allAccounts.map(acc => ({
        id: acc.id,
        secret: acc.secret,
        digits: acc.digits ?? 6,
        period: acc.period ?? 30,
        algorithm: acc.algorithm || 'SHA1',
      }));
      const freshCodes = await generateBatchTOTP(batchPayload, settings.timeOffsetSeconds || 0);
      if (isCurrent) {
        setTotpCodes(freshCodes);
      }
    };
    updateTokens();
    return () => { isCurrent = false; };
  }, [totpEpoch, accounts]);

  // ── Focus guard
  useEffect(() => {
    const visAccs = accounts.filter(acc => {
      const isHidden = acc.category.toLowerCase() === 'hide' || acc.category.toLowerCase() === 'hidden';
      return isHiddenVaultActive || !isHidden;
    });
    if (visAccs.length > 0 && !visAccs.some(a => a.id === focusedAccountId)) {
      setFocusedAccountId(visAccs[0].id);
    }
  }, [accounts, focusedAccountId, isHiddenVaultActive]);

  // ── Ghost Mode Search Trigger
  useEffect(() => {
    if (!searchQuery) return;
    let active = true;
    const checkQuery = async () => {
      const match = await verifyHiddenCredentials(searchQuery);
      if (match && active) {
        setIsHiddenVaultActive(true);
        setSearchQuery('');
      }
    };
    checkQuery();
    return () => {
      active = false;
    };
  }, [searchQuery]);

  useEffect(() => {
    // Reset hidden vault when activeTag changes or search query is modified from empty
    if (isHiddenVaultActive) {
      if (searchQuery !== '') {
        setIsHiddenVaultActive(false);
      }
    }
  }, [searchQuery, isHiddenVaultActive]);

  useEffect(() => {
    setIsHiddenVaultActive(false);
  }, [activeTag]);

  // Scrub hidden vault setup inputs when setup modal closes/changes
  useEffect(() => {
    return () => {
      setHiddenVaultSetupInput("");
      setHiddenVaultSetupConfirm("");
      setHiddenVaultSetupError("");
    };
  }, [showHiddenSetupModal]);

  const verifyAndUnlock = async (input: string, method: 'pin' | 'passphrase') => {
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setIsUnlocking(true);
    try {
      let matchedHash: string | null = null;
      let matchedType: 'pin' | 'passphrase' | 'masterKey' | 'duress' | null = null;
      let duressAction: 'wipe' | 'fake' | null = null;

      // 1. Verify against Zero-Knowledge multihash array if populated
      if (settings.authHashes && settings.authHashes.length > 0) {
        for (const hash of settings.authHashes) {
          const matched = await argon2idVerify(hash, input);
          if (matched) {
            matchedHash = hash;
            const encMeta = settings.authMetadata?.[hash];
            if (encMeta) {
              try {
                const keyMaterial = await sha256(`${input}OnlyAuthMetadataDerivationSalt2026`);
                const decrypted = await decryptMetadata(encMeta, keyMaterial);
                const meta = JSON.parse(decrypted);
                matchedType = meta.type;
                if (meta.type === 'duress') {
                  duressAction = meta.action;
                }
              } catch (e) {
                console.error("Failed to decrypt auth metadata:", e);
              }
            }
            break;
          }
        }
      }

      // 2. Backward compatibility fallback
      if (!matchedHash) {
        if (method === 'pin') {
          if (settings.duressPinHash && settings.duressPinHash !== 'fortified' && await argon2idVerify(settings.duressPinHash, input)) {
            matchedHash = settings.duressPinHash;
            matchedType = 'duress';
            duressAction = settings.duressAction || 'fake';
          } else if (settings.pinHash && await argon2idVerify(settings.pinHash, input)) {
            matchedHash = settings.pinHash;
            matchedType = 'pin';
          }
        } else {
          if (settings.duressPinHash && settings.duressPinHash !== 'fortified' && await argon2idVerify(settings.duressPinHash, input)) {
            matchedHash = settings.duressPinHash;
            matchedType = 'duress';
            duressAction = settings.duressAction || 'fake';
          } else if (settings.duressPassphraseHash && await argon2idVerify(settings.duressPassphraseHash, input)) {
            matchedHash = settings.duressPassphraseHash;
            matchedType = 'duress';
            duressAction = settings.duressAction || 'fake';
          } else if (settings.passphraseHash && await argon2idVerify(settings.passphraseHash, input)) {
            matchedHash = settings.passphraseHash;
            matchedType = 'passphrase';
          } else if (settings.masterKeyHash && await argon2idVerify(settings.masterKeyHash, input)) {
            matchedHash = settings.masterKeyHash;
            matchedType = 'masterKey';
          }
        }
      }

      if (matchedHash && matchedType) {
        // SUCCESSFUL MATCH!
        
        // Dynamic inline migration to Zero-Knowledge schema if needed
        let upgradedSettings: Partial<AppSettings> = {};
        if (!settings.authHashes || !settings.authHashes.includes(matchedHash)) {
          const cred = matchedType === 'duress'
            ? await createAuthCredential(input, 'duress', duressAction || 'fake')
            : await createAuthCredential(input, matchedType);
          const currentHashes = settings.authHashes || [];
          const currentMetadata = settings.authMetadata || {};
          
          upgradedSettings = {
            authHashes: [...currentHashes, cred.hash],
            authMetadata: { ...currentMetadata, [cred.hash]: cred.encMeta }
          };
        }

        if (matchedType === 'duress') {
          await writeAuditLog(`DURESS AUTHENTICATION ENCOUNTERED (${method.toUpperCase()})`);
          safeTransition(() => {
            if (duressAction === 'wipe') {
              setAccounts(prev => prev.map(a => ({ ...a, secret: '••••••••' })));
              showToast('Vault unlocked.', 'success');
            } else {
              setIsFakeVaultActive(true);
            }
            setIsLocked(false);
            setUnlockError('');
            setUnlockInput('');
            if (Object.keys(upgradedSettings).length > 0) {
              setSettings(prev => ({ ...prev, ...upgradedSettings }));
            }
          });
        } else {
          const derivedKeyHex = await sha256(`${input}OnlyAuthAuditLogSalt2026`);
          setDecryptedLogKeyHex(derivedKeyHex);
          await writeAuditLog(`Vault unlocked successfully (${matchedType})`, derivedKeyHex);

          // Notes are stored as plaintext — no decryption needed on unlock
          const decryptedAccounts = accounts;

          safeTransition(() => {
            setAccounts(decryptedAccounts);
            setIsLocked(false);
            setUnlockError('');
            setUnlockInput('');
            setSettings(prev => {
              const updates: Partial<AppSettings> = { ...upgradedSettings, pinAttempts: 0 };
              if (matchedType === 'pin' && matchedHash && prev.pinHash !== matchedHash) {
                updates.pinHash = matchedHash;
              }
              return {
                ...prev,
                ...updates
              };
            });
          });
        }
        return true;
      } else {
        // FAILED MATCH!
        const nextAttempts = settings.pinAttempts + 1;

        // Exponential delay only for PIN attempts (prevent brute-force)
        if (method === 'pin') {
          const delayMs = Math.min(1000 * Math.pow(2, nextAttempts - 1), 16000);
          await new Promise(r => setTimeout(r, delayMs));
        }

        await writeAuditLog(`Failed ${method} unlock attempt. Count: ${nextAttempts}`);

        safeTransition(() => {
          if (method === 'pin' && nextAttempts >= 5) {
            const oldPinHash = settings.pinHash;
            let nextHashes = [...(settings.authHashes || [])];
            const nextMetadata = oldPinHash
              ? Object.fromEntries(
                  Object.entries(settings.authMetadata || {}).filter(([key]) => key !== oldPinHash)
                )
              : { ...(settings.authMetadata || {}) };
            if (oldPinHash) {
              nextHashes = nextHashes.filter(h => h !== oldPinHash);
            }

            setSettings(prev => ({
              ...prev,
              pinHash: '',
              pinLength: 0,
              pinAttempts: nextAttempts,
              authHashes: nextHashes,
              authMetadata: nextMetadata,
              appLockEnabled: false
            }));

            setUnlockError('PIN destroyed and locked out due to 5 failed attempts. Master passphrase required.');
            setUnlockMethod('passphrase');
          } else {
            setSettings(prev => ({ ...prev, pinAttempts: nextAttempts }));
            setUnlockError(`Incorrect ${method}. Attempt ${nextAttempts}.`);
          }
          setUnlockInput('');
        });
        return false;
      }
    } finally {
      isVerifyingRef.current = false;
      setIsUnlocking(false);
    }
  };

  // ── Auto-search on startup focus
  useEffect(() => {
    if (!isLocked && settings.forceSearchOnStartup) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
    return;
  }, [isLocked, settings.forceSearchOnStartup]);

  // ── PIN auto-submission has been removed in favor of explicit Unlock confirmation button

  // ── Recurrent Gratitude Micro-Animation
  useEffect(() => {
    if (!settings.githubContributor) return;
    const interval = setInterval(() => {
      setIsThanksActive(true);
      setTimeout(() => {
        setIsThanksActive(false);
      }, 1500); // show for 1.5 seconds
    }, 15000); // trigger every 15 seconds
    return () => clearInterval(interval);
  }, [settings.githubContributor]);

  // ── Setup: generate keys
  const handleChooseWords = () => safeTransition(() => {
    const words = generatePassphrase(setupWordCount);
    const key = generateMasterKey();
    setSetupWords(words);
    setSetupMasterKey(key);
    
    // Pick 3 random distinct word indices
    const indices: number[] = [];
    while (indices.length < 3) {
      const idx = Math.floor(Math.random() * setupWordCount);
      if (!indices.includes(idx)) indices.push(idx);
    }
    indices.sort((a, b) => a - b);
    setQuizIndices(indices);
    setQuizInputs(['', '', '']);
    setQuizError('');
    setSetupSaved(false);
    
    setSetupStep('reveal-keys');
  });

  const handleRevealContinue = () => safeTransition(() => {
    // Validate verification inputs
    const isCorrect = quizIndices.every((wordIdx, quizIdx) => {
      const userInput = quizInputs[quizIdx].trim().toLowerCase();
      const actualWord = setupWords[wordIdx].toLowerCase();
      return userInput === actualWord;
    });
    
    if (!isCorrect) {
      setQuizError("Verification failed. Please check the words you wrote down.");
      return;
    }
    
    setSetupStep('set-pin');
    setSetupPin('');
    setSetupPinConfirm('');
    setSetupPinError('');
    setSetupPinPhase('enter');
  });

  const handleFinishSetup = async (skipPin = false) => {
    const phrase = setupWords.join(' ');
    if (!skipPin && setupPin.trim().length >= 4) {
      if (setupPin !== setupPinConfirm) {
        setSetupPinError("PINs don't match.");
        return;
      }
    }

    setIsGeneratingKey(true);
    try {
      // 1. Create credentials for Zero-Knowledge multi-hash array
      const passphraseCred = await createAuthCredential(phrase, 'passphrase');
      const masterKeyCred = await createAuthCredential(setupMasterKey, 'masterKey');

      const hashes = [passphraseCred.hash, masterKeyCred.hash];
      const metadata = {
        [passphraseCred.hash]: passphraseCred.encMeta,
        [masterKeyCred.hash]: masterKeyCred.encMeta
      };

      let setupPinHash = '';
      if (!skipPin && setupPin.trim().length >= 4) {
        const pinCred = await createAuthCredential(setupPin.trim(), 'pin');
        hashes.push(pinCred.hash);
        metadata[pinCred.hash] = pinCred.encMeta;
        setupPinHash = pinCred.hash;
      }

      const derivedKeyHex = await sha256(`${phrase}OnlyAuthAuditLogSalt2026`);
      setDecryptedLogKeyHex(derivedKeyHex);
      await writeAuditLog('Vault setup completed with hardened Argon2id KDF', derivedKeyHex);

      safeTransition(() => {
        setSettings(prev => ({ 
          ...prev, 
          authHashes: hashes, 
          authMetadata: metadata,
          passphraseHash: '', // Clear legacy hashes
          masterKeyHash: '',
          pinHash: setupPinHash,
          pinLength: skipPin ? 0 : setupPin.trim().length,
          pinAttempts: 0 
        }));
        setIsLocked(false);
        // Clean up sensitive setup memories
        setSetupWords([]);
        setSetupMasterKey("");
        setSetupPin("");
        setSetupPinConfirm("");
      });
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // ── Trigger biometrics automatically if active
  useEffect(() => {
    if (isLocked && settings.appLockEnabled && settings.appLockMethod === 'biometrics' && unlockMethod === 'biometrics') {
      const timer = setTimeout(() => {
        handleBiometricUnlock();
      }, 500);
      return () => clearTimeout(timer);
    }
    return;
  }, [isLocked, settings.appLockEnabled, settings.appLockMethod, unlockMethod]);

  // ── Unlock handlers
  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    const input = unlockInput.trim();
    if (!input) return;
    await verifyAndUnlock(input, unlockMethod === 'pin' ? 'pin' : 'passphrase');
  };

  const handleBiometricUnlock = () => {
    setUnlockError('');
    setIsBiometricSimulating(true);
  };

  const handleHardwareUnlock = () => {
    setIsWebAuthnAuthenticating(true);
  };

  // ── Account CRUD
  const openAddModal = () => safeTransition(() => {
    setEditingAccount(null);
    setFormName(''); setFormEmail(''); setFormSecret(''); setShowSecret(false);
    formSecretRef.current = '';
    setFormNotes(''); setFormCategory(activeTag === 'all' ? 'personal' : activeTag);
    setFormIsPinned(false); setFormLogoType('custom'); setFormTagsString('');
    setFormDigits(6); setFormPeriod(30); setFormAlgorithm('SHA1');
    setFormNextRotationDate('');
    setShowIconPicker(false);
    setIsAddModalOpen(true);
  });

  const openEditModal = (account: Account) => safeTransition(() => {
    setEditingAccount(account);
    setFormName(account.name); setFormEmail(account.email); setFormSecret(account.secret); setShowSecret(false);
    formSecretRef.current = account.secret;
    setFormNotes(account.notes); setFormCategory(account.category);
    setFormIsPinned(account.isPinned); setFormLogoType(account.logoType);
    setFormTagsString(account.tags?.join(', ') || '');
    setFormDigits(account.digits || 6);
    setFormPeriod(account.period || 30);
    setFormAlgorithm(account.algorithm || 'SHA1');
    setFormNextRotationDate(account.nextRotationDate || '');
    setShowIconPicker(false);
    setIsAddModalOpen(true);
  });

  const handleGenerateSecret = async () => {
    const secret = await generateNewSecret();
    if (secret) setFormSecret(secret);
  };

  const handleToggleFormSecretVisibility = () => {
    setShowSecret(prev => !prev);
  };

  const triggerVerifyAction = (type: 'save' | 'delete' | 'update-passphrase' | 'update-pin' | 'update-masterkey' | 'update-partition-settings' | 'disable-partition' | 'settings-unlock' | 'export', data?: unknown) => safeTransition(() => {
    setPendingAction({ type, data });
    setVerificationInput('');
    setVerificationError('');
    setIsVerificationModalOpen(true);
  });

  const saveAccountConfirmed = () => {
    const parsedTags = formTagsString.split(',').map(t => t.trim()).filter(Boolean);
    const resolvedSecret = formSecret || formSecretRef.current;
    const sanitizedSecret = resolvedSecret.trim().toUpperCase();
    if (editingAccount) {
      const updated = accounts.map(acc => acc.id === editingAccount.id
        ? { 
            ...acc, name: formName, email: formEmail, secret: sanitizedSecret, notes: formNotes, 
            category: formCategory, isPinned: formIsPinned, logoType: formLogoType, tags: parsedTags,
            digits: formDigits, period: formPeriod, algorithm: formAlgorithm,
            nextRotationDate: formNextRotationDate || undefined
          }
        : acc
      );
      setAccounts(updated);
      saveVaultData(updated, decryptedLogKeyHex);
    } else {
      const newAcc: Account = {
        id: `acc-${Date.now()}`, name: formName, email: formEmail, secret: sanitizedSecret,
        notes: formNotes || `2FA account for ${formName}`, category: formCategory,
        isPinned: formIsPinned, logoType: formLogoType, tags: parsedTags,
        createdAt: new Date().toISOString(),
        digits: formDigits,
        period: formPeriod,
        algorithm: formAlgorithm,
        nextRotationDate: formNextRotationDate || undefined
      };
      const updated = [newAcc, ...accounts];
      setAccounts(updated);
      setFocusedAccountId(newAcc.id);
      saveVaultData(updated, decryptedLogKeyHex);
    }
    setIsAddModalOpen(false);
    setEditingAccount(null);
    formSecretRef.current = '';
  };

  const deleteAccountConfirmed = (id: string) => safeTransition(() => {
    const filtered = accounts.filter(a => a.id !== id);
    setAccounts(filtered);
    setIsAddModalOpen(false);
    setEditingAccount(null);
    if (focusedAccountId === id && filtered.length > 0) setFocusedAccountId(filtered[0].id);
  });

  const handleConfirmVerification = async (e: FormEvent) => {
    e.preventDefault();
    const input = verificationInput.trim();
    const valid = await (async () => {
      // 1. Check Argon2id authHashes (primary)
      if (settings.authHashes && settings.authHashes.length > 0) {
        for (const hash of settings.authHashes) {
          if (await argon2idVerify(hash, input)) return true;
        }
      }
      // 2. Legacy fallback checks (with PIN support)
      const hash = await sha256(input);
      if (settings.pinHash && hash === settings.pinHash) return true;
      if (settings.passphraseHash && hash === settings.passphraseHash) return true;
      if (settings.masterKeyHash && hash === settings.masterKeyHash) return true;
      return false;
    })();
    if (valid) {
      safeTransition(() => {
        if (pendingAction?.type === 'settings-unlock') {
          setIsSettingsUnlocked(true);
          setActiveTag('settings');
        } else if (pendingAction?.type === 'export') {
          const fmt = pendingAction.data as 'purified-json' | 'plain-text' | 'html';
          doExport(fmt);
        } else if (pendingAction?.type === 'save') {
          saveAccountConfirmed();
        } else if (pendingAction?.type === 'delete') {
          deleteAccountConfirmed(pendingAction.data as string);
        } else if (pendingAction?.type === 'update-passphrase') {
          const passphraseData = pendingAction.data as { newPassphrase: string };
          sha256(`${passphraseData.newPassphrase}OnlyAuthAuditLogSalt2026`).then(async newKeyHex => {
            await saveVaultData(accounts, newKeyHex);
            setDecryptedLogKeyHex(newKeyHex);
            const newHash = await sha256(passphraseData.newPassphrase);
            setSettings(prev => ({ ...prev, passphraseHash: newHash }));
            setNewPassphraseWords([]);
            showToast('Passphrase updated. Use your new passphrase to unlock.', 'success');
          });
        } else if (pendingAction?.type === 'update-pin') {
          const pinData = pendingAction.data as { newPin: string };
          const newPin = pinData.newPin;
          sha256(`${newPin}OnlyAuthAuditLogSalt2026`).then(async newKeyHex => {
            await saveVaultData(accounts, newKeyHex);
            setDecryptedLogKeyHex(newKeyHex);
            
            try {
              const pinCred = await createAuthCredential(newPin, 'pin');
              const oldPinHash = settings.pinHash;
              const currentHashes = (settings.authHashes || []).filter(h => h !== oldPinHash);
              let currentMetadata = { ...settings.authMetadata };
              if (oldPinHash) {
                currentMetadata = Object.fromEntries(
                  Object.entries(currentMetadata).filter(([k]) => k !== oldPinHash)
                );
              }

              setSettings(prev => ({
                ...prev,
                authHashes: [...currentHashes, pinCred.hash],
                authMetadata: { ...currentMetadata, [pinCred.hash]: pinCred.encMeta },
                pinHash: pinCred.hash,
                pinLength: newPin.length,
                pinAttempts: 0
              }));
              
              setNewPinField('');
              setNewPinConfirm('');
              showToast('PIN updated successfully.', 'success');
            } catch (err) {
              console.warn('Failed to compute PIN hash:', err);
              showToast('Failed to compute secure PIN hash.', 'error');
            }
          });
        } else if (pendingAction?.type === 'update-masterkey') {
          const keyData = pendingAction.data as { newKey: string };
          sha256(`${keyData.newKey}OnlyAuthAuditLogSalt2026`).then(async newKeyHex => {
            await saveVaultData(accounts, newKeyHex);
            setDecryptedLogKeyHex(newKeyHex);
            const newHash = await sha256(keyData.newKey);
            setSettings(prev => ({ ...prev, masterKeyHash: newHash }));
            setNewMasterKeyField('');
            showToast('Master Key updated successfully.', 'success');
          });
        } else if (pendingAction?.type === 'update-partition-settings') {
          const partitionData = pendingAction.data as { method: 'pin' | 'biometrics' | 'passphrase'; passcode: string };
          const { method, passcode } = partitionData;
          sha256(passcode).then(newHash => {
            setSettings(prev => ({
              ...prev,
              hiddenVaultSettings: { isEnabled: true, hash: newHash, method },
              customTags: prev.customTags.includes('hidden') ? prev.customTags : [...prev.customTags, 'hidden']
            }));
            showToast('Vault Partition settings updated.', 'success');
          });
        } else if (pendingAction?.type === 'disable-partition') {
          setAccounts(prev => prev.map(a => a.category === 'hidden' ? { ...a, category: 'personal' } : a));
          setSettings(prev => ({
            ...prev,
            hiddenVaultSettings: { isEnabled: false, hash: '', method: 'pin' },
            customTags: prev.customTags.filter(t => t !== 'hidden')
          }));
          setIsHiddenVaultActive(false);
          setActiveTag('all');
          showToast('Vault Partition disabled. Hidden accounts moved to Personal.', 'info');
        }
        setIsVerificationModalOpen(false);
        setPendingAction(null);
      });
    } else {
      setVerificationError('Incorrect passphrase, master key, or PIN.');
    }
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, isPinned: !a.isPinned } : a));
  };

  // ── Camera
  const startCameraScan = async () => {
    setIsCameraActive(true);
    setCameraStatus('Requesting camera...');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('SecureContextError');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setCameraStatus('Point camera at the QR code.');
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === 'SecureContextError') {
          setCameraStatus('Security Error: Camera requires an HTTPS connection or localhost context.');
        } else if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setCameraStatus('Permission Denied: Please grant camera access in browser or settings.');
        } else {
          setCameraStatus('No camera found or access failed. Please upload a QR code image.');
        }
      } else {
        setCameraStatus('No camera found or access failed. Please upload a QR code image.');
      }
    }
  };
  const stopCameraScan = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setIsCameraActive(false);
  };
  const injectScannedQRResult = async () => {
    const names = ['Google Cloud', 'GitHub Actions', 'Stripe API', 'Vercel Deploy', 'AWS Console'];
    const logos: Account['logoType'][] = ['google', 'github', 'stripe', 'custom', 'aws'];
    const idx = Math.floor(Math.random() * names.length);
    setFormName(names[idx]); setFormEmail('admin@example.com');
    const secret = await generateNewSecret();
    setFormSecret(secret);
    setFormLogoType(logos[idx]);
    setFormNotes(`Imported via QR scan on ${new Date().toLocaleDateString()}`);
    setFormTagsString('scanned');
    stopCameraScan();
  };

  // ── Tag management
  const createTag = (e: FormEvent) => {
    e.preventDefault();
    const tag = newTagName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!tag) return;
    if (tag === 'hide' || tag === 'hidden') {
      setShowHiddenSetupModal(true);
      setNewTagName('');
      return;
    }
    if (settings.customTags.includes(tag)) return;
    setSettings(prev => ({ ...prev, customTags: [...prev.customTags, tag] }));
    setNewTagName('');
  };
  const deleteTag = (tag: string) => {
    if (['personal', 'work'].includes(tag)) return;
    setConfirmModal({
      title: 'Remove Tag',
      message: `Remove tag "${tag}"? Accounts will move to "personal".`,
      onConfirm: () => {
        setAccounts(prev => prev.map(a => a.category === tag ? { ...a, category: 'personal' } : a));
        setSettings(prev => ({ ...prev, customTags: prev.customTags.filter(t => t !== tag) }));
        if (activeTag === tag) setActiveTag('all');
      }
    });
  };

  // ── Security keys
  const registerSecurityKey = (e: FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setWebAuthnRegKeyName(newKeyName.trim());
    setIsWebAuthnRegistering(true);
    setNewKeyName('');
    setIsAddingHardwareKey(false);
  };
  const deleteSecurityKey = (id: string) => {
    setSettings(prev => ({ ...prev, securityKeys: prev.securityKeys.filter(k => k.id !== id) }));
  };

  // ── Backup / Import & Export
  const triggerExport = (format: 'purified-json' | 'plain-text' | 'html') => {
    setPendingExportFormat(format);
    setIsExportModalOpen(true);
  };

  const doExport = async (format: 'purified-json' | 'plain-text' | 'html') => {
    const extMap = { 'purified-json': '.json', 'plain-text': '.txt', 'html': '.html' };
    const labelMap = { 'purified-json': 'Purified JSON', 'plain-text': 'Plain Text URIs', 'html': 'HTML' };
    const contentMap = {
      'purified-json': () => exportPurifiedJSON(accounts, settings),
      'plain-text': () => exportPlainTextURI(accounts),
      'html': () => exportHTML(accounts),
    };
    const content = contentMap[format]();
    const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);

    if (isTauri) {
      try {
        const filename = `OnlyAuth_Export_${format}_${new Date().toISOString().slice(0, 10)}${extMap[format]}`;
        const savedPath = await exportFile(filename, content);
        setSettings(prev => ({ ...prev, lastBackupDate: new Date().toISOString() }));
        showToast(`Export saved successfully to: ${savedPath}`, 'success');
      } catch (e) {
        if (e === 'Save cancelled') {
          showToast('Export cancelled.', 'info');
        } else {
          const err = e as { message?: string } | null;
          showToast(`Native export failed: ${err?.message || String(e)}`, 'error');
        }
      }
    } else {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `OnlyAuth_Export_${format}_${new Date().toISOString().slice(0, 10)}${extMap[format]}`;
      document.body.appendChild(downloadLink); downloadLink.click(); document.body.removeChild(downloadLink);
      setSettings(prev => ({ ...prev, lastBackupDate: new Date().toISOString() }));
      showToast(`${labelMap[format]} export downloaded.`, 'success');
    }
  };

  const handleImportOnlyAuth = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const result = parseOnlyAuthJSON(ev.target?.result as string);
        if (result.accounts.length === 0) {
          showToast(result.warnings[0] || 'No accounts found.', 'error');
          return;
        }
        safeTransition(() => {
          setAccounts(prev => [...result.accounts, ...prev]);
          showToast(`Imported ${result.accounts.length} account${result.accounts.length !== 1 ? 's' : ''} from Only Auth JSON.`, 'success');
        });
      } catch (err) { console.warn(err);  showToast('Invalid backup file. Check the format and try again.', 'error'); }
    };
    reader.readAsText(file);
  };

  // (Ente Auth, Bitwarden, Google Auth JSON import removed — use universal otpauth:// URI import instead)

  // ── Passphrase / PIN / Master Key updates (current passphrase verification required)
  const handleRegeneratePassphrase = () => {
    const words = generatePassphrase(12);
    setNewPassphraseWords(words);
  };
  const handleSaveNewPassphraseSubmit = () => {
    if (newPassphraseWords.length === 0) return;
    triggerVerifyAction('update-passphrase', { newPassphrase: newPassphraseWords.join(' ') });
  };

  const handleUpdatePinSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newPinField.length < 4) { showToast('PIN must be at least 4 characters.', 'error'); return; }
    if (newPinField !== newPinConfirm) { showToast("PINs don't match. Please re-enter.", 'error'); return; }
    triggerVerifyAction('update-pin', { newPin: newPinField });
  };

  const handleRegenerateMasterKey = () => {
    const key = generateMasterKey();
    setNewMasterKeyField(key);
  };
  const handleSaveNewMasterKeySubmit = () => {
    if (!newMasterKeyField) return;
    triggerVerifyAction('update-masterkey', { newKey: newMasterKeyField });
  };

  // ── Copy
  const handleCopyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopyFeedbackMap(prev => ({ ...prev, [id]: true }));
    showToast('TOTP Code copied. Zero clipboard residue in 30s.', 'success');
    setTimeout(() => { setCopyFeedbackMap(prev => ({ ...prev, [id]: false })); }, 1500);

    // Schedule automatic clearing of clipboard after 30 seconds
    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text === code) {
          await navigator.clipboard.writeText('');
          showToast('Clipboard cleared for security.', 'info');
        }
      } catch (err) { console.warn(err);
        // Fallback overwrite if clipboard read permissions are blocked by browser security
        await navigator.clipboard.writeText('');
      }
    }, 30000);
  };

  // ── Support
  const [supportEmail] = useState('user@example.com');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [isSupportSending, setIsSupportSending] = useState(false);
  const [supportSuccess, setSupportSuccess] = useState(false);

  const handleSendSupport = (e: FormEvent) => {
    e.preventDefault();
    if (!supportMessage.trim()) return;
    setIsSupportSending(true);
    setTimeout(() => { setIsSupportSending(false); setSupportSuccess(true); setSupportMessage(''); }, 1500);
  };

  // ── Chat
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'system'; text: string; time: string }>>([
    { sender: 'system', text: 'Ask me anything about 2FA, account recovery, or how to use Only Auth.', time: '00:00' }
  ]);

  const handleSendCommand = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    const time = new Date().toTimeString().slice(0, 5);
    setChatMessages(prev => [...prev, { sender: 'user', text: msg, time }]);
    setChatInput('');
    const normalizedMsg = msg.toLowerCase();
    let reply = 'Navigate to Settings to update your passphrase or PIN. All data stays local on your device.';
    if (normalizedMsg.includes('totp') || normalizedMsg.includes('how')) reply = 'TOTP generates a 6-digit code every 30 seconds using a shared secret and the current time via HMAC-SHA1.';
    else if (normalizedMsg.includes('passphrase') || normalizedMsg.includes('recover')) reply = 'Your passphrase is used to unlock the vault and restore access. Store it offline in a safe place.';
    else if (normalizedMsg.includes('backup') || normalizedMsg.includes('import') || normalizedMsg.includes('export')) reply = 'Go to Settings → Import & Export to import third-party credentials or download a JSON vault backup.';
    else if (normalizedMsg.includes('pin')) reply = 'Set a PIN in Settings for faster daily unlocking. Your passphrase remains the master recovery method.';
    else if (normalizedMsg.includes('biometric')) reply = 'Biometric unlock uses your device\'s platform authenticator (Face ID / fingerprint) via WebAuthn.';
    setTimeout(() => { setChatMessages(prev => [...prev, { sender: 'system', text: reply, time }]); }, 700);
  };

  // ── Computed (memoized to avoid redundant O(n) filtering on re-render)
  const compact = settings.compactMode;

  // ⚡ Perf: visibleAccounts only changes when accounts/vault state change
  const visibleAccounts = useMemo(() => {
    if (isFakeVaultActive) return [];
    return accounts.filter(acc => {
      const isHidden = acc.category.toLowerCase() === 'hide' || acc.category.toLowerCase() === 'hidden';
      return isHiddenVaultActive || !isHidden;
    });
  }, [accounts, isFakeVaultActive, isHiddenVaultActive]);

  // ⚡ Perf: filteredAccounts only changes when visible accounts, tag, or search change
  const filteredAccounts = useMemo(() => {
    return visibleAccounts.filter(acc => {
      const matchesTag = activeTag === 'all' || acc.category === activeTag;
      const query = searchQuery.toLowerCase();
      const matchesSearch = !query || acc.name.toLowerCase().includes(query) || acc.email.toLowerCase().includes(query) || (acc.tags?.some(t => t.toLowerCase().includes(query)));
      return matchesTag && matchesSearch;
    });
  }, [visibleAccounts, activeTag, searchQuery]);

  // ⚡ Perf: pinnedAccounts eliminates duplicate .filter(a => a.isPinned) in JSX render path
  const pinnedAccounts = useMemo(() => {
    return visibleAccounts.filter(a => a.isPinned);
  }, [visibleAccounts]);

  const focusedAccount = visibleAccounts.find(a => a.id === focusedAccountId) || visibleAccounts[0] || null;
  const focusedCode = focusedAccount ? (totpCodes[focusedAccount.id] || '------') : '------';
  const focusedCodeFormatted = formatFocusedCode(focusedCode);
  const passkeyStrength = getSecurityStrength(settings.authHashes && settings.authHashes.length > 0 ? 'fortified_passphrase_length_etc' : (settings.passphraseHash || 'default'));
  const isVaultTab = !['security', 'settings', 'support'].includes(activeTag);


  if (isGeneratingKey) {
    return (
      <div className="relative min-h-screen w-full flex items-center justify-center select-none text-[#e5e2e1] overflow-hidden">
        <StarfieldBackground speed={0.1} />
        <div className="w-full max-w-md mx-4 glass-panel rounded-3xl p-8 flex flex-col items-center gap-6 relative overflow-hidden z-10 animate-pulse">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent" />
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Shield className="w-7 h-7 text-white/40" />
          </div>
          <div className="text-center space-y-2 w-full">
            <div className="h-6 bg-white/10 rounded-md w-3/4 mx-auto" />
            <div className="h-4 bg-white/5 rounded-md w-5/6 mx-auto" />
            <div className="h-4 bg-white/5 rounded-md w-2/3 mx-auto" />
          </div>
          <div className="w-full space-y-3">
            <div className="h-10 bg-white/5 rounded-xl w-full" />
            <div className="h-10 bg-white/5 rounded-xl w-full" />
            <div className="h-12 bg-white/10 rounded-xl w-full mt-4" />
          </div>
          <div className="text-xs text-[#8e90a2] text-center font-mono">
            Deriving keys using Argon2id (Hardened)...
          </div>
        </div>
      </div>
    );
  }

  // ── SETUP SCREEN ─────────────────────────────────────────────────────────
  if (isFirstRun) {
    return (
      <div className="relative min-h-screen w-full flex items-center justify-center select-none text-[#e5e2e1] overflow-hidden">
        <StarfieldBackground speed={0.3} />
        <AnimatePresence mode="wait">
          {setupStep === 'choose-words' && (
            <motion.div key="choose" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md mx-4 glass-panel rounded-3xl p-8 flex flex-col items-center gap-6 relative overflow-hidden z-10">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#2d5bff] to-transparent" />
              <div className="w-16 h-16 rounded-2xl bg-[#2d5bff]/10 border border-[#2d5bff]/30 flex items-center justify-center">
                <Shield className="w-7 h-7 text-[#b8c3ff]" />
              </div>
              <div className="text-center space-y-2">
                <h1 className="font-display text-2xl font-semibold text-white">Welcome to Only Auth</h1>
                <p className="text-sm text-[#c4c5d9] leading-relaxed">Set up your vault. Choose the number of recovery words for your passphrase.</p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full">
                {([12, 18, 24] as const).map(n => (
                  <button key={n} onClick={() => setSetupWordCount(n)}
                    className={`py-4 rounded-2xl border text-center transition-all ${setupWordCount === n ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-white' : 'border-white/10 bg-white/5 text-[#c4c5d9] hover:border-white/20'}`}>
                    <span className="block text-2xl font-display font-semibold">{n}</span>
                    <span className="block text-[10px] uppercase tracking-widest mt-1 text-[#c4c5d9]">words</span>
                  </button>
                ))}
              </div>
              <div className="text-xs text-[#8e90a2] text-center">
                {setupWordCount === 12 ? 'Standard recovery — great for most users' : setupWordCount === 18 ? 'Enhanced recovery — recommended' : 'Maximum security — hardest to brute-force'}
              </div>
              <button onClick={handleChooseWords}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white font-semibold text-sm hover:opacity-90 transition-opacity">
                Generate My Passphrase →
              </button>
            </motion.div>
          )}

          {setupStep === 'reveal-keys' && (
            <motion.div key="reveal" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-xl mx-4 glass-panel rounded-3xl p-8 flex flex-col gap-6 relative overflow-hidden z-10 max-h-[90vh] overflow-y-auto">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent" />

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-white">Save These Now</h2>
                  <p className="text-xs text-[#c4c5d9]">They will never be shown again.</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-[#c4c5d9] mb-3">Your {setupWordCount}-Word Passphrase</p>
                <div className="grid grid-cols-3 gap-2">
                  {setupWords.map((word, i) => (
                    <div key={`word-${word}`} className="word-cell">
                      <span className="word-index">{i + 1}.</span>
                      <span>{word}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => navigator.clipboard.writeText(setupWords.join(' '))}
                  className="mt-3 w-full py-2 rounded-xl border border-white/10 bg-white/5 text-xs text-[#c4c5d9] hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-2">
                  <Copy className="w-3.5 h-3.5" /> Copy Passphrase
                </button>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-[#c4c5d9] mb-3">Master Key (256-bit)</p>
                <div className="relative">
                  <div className="bg-[#0e0e0e] border border-white/10 rounded-xl p-3 font-mono text-xs text-[var(--color-accent)] break-all">
                    {showSetupKey ? setupMasterKey : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                  </div>
                  <button onClick={() => setShowSetupKey(v => !v)} className="absolute top-2.5 right-3 text-[#8e90a2] hover:text-white transition-colors">
                    {showSetupKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={() => navigator.clipboard.writeText(setupMasterKey)}
                  className="mt-2 w-full py-2 rounded-xl border border-white/10 bg-white/5 text-xs text-[#c4c5d9] hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-2">
                  <Copy className="w-3.5 h-3.5" /> Copy Master Key
                </button>
              </div>

              {/* Mnemonic Passphrase Verification Quiz */}
              <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/8 w-full text-left">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--color-accent)]">Passphrase Backup Quiz</p>
                <p className="text-[11px] text-[#8e90a2]">Verify you saved your passphrase. Type the corresponding words below:</p>
                <div className="grid grid-cols-3 gap-2">
                  {quizIndices.map((wordIdx, quizIdx) => (
                    <div key={wordIdx} className="space-y-1">
                      <label className="text-[10px] text-[#8e90a2] block">Word #{wordIdx + 1}</label>
                      <input
                        type="text"
                        value={quizInputs[quizIdx]}
                        onChange={e => {
                          const updated = [...quizInputs];
                          updated[quizIdx] = e.target.value;
                          setQuizInputs(updated);
                        }}
                        placeholder={`Word ${wordIdx + 1}`}
                        className="w-full bg-[#0c0c0e] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[var(--color-accent)] transition-all font-mono"
                      />
                    </div>
                  ))}
                </div>
                {quizError && <p className="text-[10px] font-mono text-red-400 mt-1">{quizError}</p>}
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={setupSaved} onChange={e => setSetupSaved(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 text-[var(--color-accent)] focus:ring-[var(--color-accent)] bg-transparent" />
                <span className="text-xs text-[#c4c5d9] leading-relaxed">I have saved my passphrase and master key in a secure offline location.</span>
              </label>

              <button onClick={handleRevealContinue} disabled={!setupSaved || quizInputs.some(w => !w.trim())}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white font-semibold text-sm hover:opacity-90 transition-opacity">
                Continue →
              </button>
            </motion.div>
          )}

          {setupStep === 'set-pin' && (
            <motion.div key="pin" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm mx-4 glass-panel rounded-3xl p-8 flex flex-col items-center gap-6 relative overflow-hidden z-10">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#2d5bff] to-transparent" />
              <div className="text-center space-y-2">
                <h2 className="font-display text-2xl font-semibold text-white">
                  {setupPinPhase === 'enter' ? 'Set a Quick PIN' : 'Confirm Your PIN'}
                </h2>
                <p className="text-sm text-[#c4c5d9] leading-relaxed">
                  {setupPinPhase === 'enter'
                    ? 'Optional — use for faster daily unlock.'
                    : 'Re-enter your PIN to confirm.'}
                </p>
              </div>

              {/* Hidden input for keyboard capture */}
              <input
                id="setup-pin-hidden"
                type="password"
                pattern="\d*"
                inputMode="numeric"
                maxLength={8}
                value={setupPinPhase === 'enter' ? setupPin : setupPinConfirm}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').substring(0, 8);
                  if (setupPinPhase === 'enter') {
                    setSetupPin(val);
                  } else {
                    setSetupPinConfirm(val);
                  }
                  setSetupPinError('');
                }}
                className="absolute inset-0 opacity-0 cursor-default z-10 w-full h-8"
              />

              {/* PIN Dot Display */}
              <div className="flex gap-4 py-2 cursor-pointer relative z-20" onClick={() => {
                const hidden = document.querySelector<HTMLInputElement>('#setup-pin-hidden');
                hidden?.focus();
              }}>
                {Array.from({ length: setupPinPhase === 'enter' ? 8 : setupPin.length }).map((_, idx) => {
                  const currentPin = setupPinPhase === 'enter' ? setupPin : setupPinConfirm;
                  const isFilled = currentPin.length > idx;
                  return (
                    <motion.div
                      key={`setup-pin-dot-${idx}`}
                      initial={{ scale: 0.8 }}
                      animate={{
                        scale: isFilled ? 1.1 : 1,
                        backgroundColor: isFilled ? 'rgba(var(--color-accent-rgb), 1)' : 'rgba(255,255,255,0.08)',
                        borderColor: isFilled ? 'rgba(var(--color-accent-rgb), 1)' : 'rgba(255,255,255,0.15)',
                      }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${
                        isFilled ? 'scale-110' : ''
                      }`}
                    />
                  );
                })}
              </div>

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-3 w-full max-w-[220px] mx-auto relative z-20">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button key={num} type="button"
                    onClick={() => {
                      const hidden = document.querySelector<HTMLInputElement>('#setup-pin-hidden');
                      if (setupPinPhase === 'enter' && setupPin.length < 8) {
                        setSetupPin(prev => `${prev}${num}`);
                      } else if (setupPinPhase === 'confirm' && setupPinConfirm.length < setupPin.length) {
                        setSetupPinConfirm(prev => `${prev}${num}`);
                      }
                      hidden?.focus();
                    }}
                    className="w-12 h-12 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-base font-semibold text-white flex items-center justify-center mx-auto">
                    {num}
                  </button>
                ))}
                <button type="button"
                  onClick={() => {
                    if (setupPinPhase === 'enter') {
                      setSetupPin('');
                    } else {
                      setSetupPinConfirm('');
                    }
                  }}
                  className="w-12 h-12 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-[9px] font-bold text-[#8e90a2] hover:text-white flex items-center justify-center mx-auto">
                  CLEAR
                </button>
                <button type="button"
                  onClick={() => {
                    const hidden = document.querySelector<HTMLInputElement>('#setup-pin-hidden');
                    if (setupPinPhase === 'enter' && setupPin.length < 8) {
                      setSetupPin(prev => `${prev}0`);
                    } else if (setupPinPhase === 'confirm' && setupPinConfirm.length < setupPin.length) {
                      setSetupPinConfirm(prev => `${prev}0`);
                    }
                    hidden?.focus();
                  }}
                  className="w-12 h-12 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-base font-semibold text-white flex items-center justify-center mx-auto">
                  0
                </button>
                <button type="button"
                  onClick={() => {
                    if (setupPinPhase === 'enter') {
                      setSetupPin(prev => prev.slice(0, -1));
                    } else {
                      setSetupPinConfirm(prev => prev.slice(0, -1));
                    }
                  }}
                  className="w-12 h-12 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-xs font-bold text-[#8e90a2] hover:text-white flex items-center justify-center mx-auto">
                  ⌫
                </button>
              </div>

              {/* Back to enter phase */}
              {setupPinPhase === 'confirm' && (
                <button type="button" onClick={() => {
                  setSetupPinPhase('enter');
                  setSetupPin('');
                  setSetupPinConfirm('');
                  setSetupPinError('');
                }} className="text-[10px] text-[#8e90a2] hover:text-white transition-colors">
                  ← Re-enter PIN
                </button>
              )}

              {setupPinError && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-400">{setupPinError}</motion.p>
              )}

              <div className="flex flex-col items-center gap-3 w-full relative z-20">
                {setupPinPhase === 'enter' ? (
                  <>
                    <button
                      type="button"
                      disabled={setupPin.length < 4}
                      onClick={() => setSetupPinPhase('confirm')}
                      className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                        setupPin.length < 4
                          ? 'bg-white/5 text-white/40 cursor-not-allowed border border-white/5'
                          : 'bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white hover:opacity-90 active:scale-95'
                      }`}
                    >
                      Next →
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFinishSetup(true)}
                      className="text-xs text-[#8e90a2] hover:text-white transition-colors"
                    >
                      Skip PIN
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={setupPinConfirm.length < setupPin.length}
                      onClick={() => handleFinishSetup(false)}
                      className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                        setupPinConfirm.length < setupPin.length
                          ? 'bg-white/5 text-white/40 cursor-not-allowed border border-white/5'
                          : 'bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white hover:opacity-90 active:scale-95'
                      }`}
                    >
                      Set PIN & Enter Vault →
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSetupPinPhase('enter');
                        setSetupPin('');
                        setSetupPinConfirm('');
                        setSetupPinError('');
                      }}
                      className="text-xs text-[#8e90a2] hover:text-white transition-colors"
                    >
                      ← Back
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── LOCK SCREEN ───────────────────────────────────────────────────────────
  if (isLocked) {
    if (isUnlocking) {
      return (
        <div className="relative min-h-screen w-full flex items-center justify-center select-none text-[#e5e2e1] overflow-hidden">
          <StarfieldBackground speed={0.1} />
          <div className="w-full max-w-sm mx-4 glass-panel rounded-3xl p-8 pb-10 flex flex-col items-center gap-6 relative overflow-hidden z-10 animate-pulse">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent" />
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Lock className="w-7 h-7 text-white/40" />
            </div>
            <div className="text-center space-y-2 w-full">
              <div className="h-6 bg-white/10 rounded-md w-1/2 mx-auto" />
              <div className="h-4 bg-white/5 rounded-md w-3/4 mx-auto" />
            </div>
            <div className="w-full space-y-4">
              <div className="h-10 bg-white/5 rounded-xl w-full" />
              <div className="h-12 bg-white/10 rounded-xl w-full mt-4" />
            </div>
            <div className="text-xs text-[#8e90a2] text-center font-mono">
              Verifying credentials via Argon2id...
            </div>
          </div>
        </div>
      );
    }
    const isPinLocked = settings.pinAttempts >= 5;
    return (
      <div className="relative min-h-screen w-full flex items-center justify-center select-none text-[#e5e2e1] overflow-hidden">
        <StarfieldBackground speed={0.2} />
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          className="w-full max-w-sm mx-4 glass-panel rounded-3xl p-8 pb-10 flex flex-col items-center gap-6 relative overflow-hidden z-10">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#2d5bff] to-transparent" />

          {/* Floating Keypad Toggle Button for Tablet/Desktop */}
          {unlockMethod === 'pin' && !isMobileScreen && (
            <button
              type="button"
              onClick={() => setShowVisualKeypad(prev => !prev)}
              className={`absolute bottom-4 left-4 p-2 rounded-xl transition-all duration-200 z-30 ${
                showVisualKeypad 
                  ? `${accentBg}/10 border ${accentBorder}/30 ${accentText}` 
                  : 'bg-white/5 border border-white/10 text-[#8e90a2] hover:text-white hover:bg-white/10'
              }`}
              title="Toggle Numeric Keypad"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          )}

          <div className="w-16 h-16 rounded-2xl bg-[#2d5bff]/10 border border-[#2d5bff]/30 flex items-center justify-center">
            <Lock className="w-7 h-7 text-[#b8c3ff]" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold text-white">Unlock Vault</h1>
            <p className="text-sm text-[#c4c5d9] mt-1">
              {unlockMethod === 'pin' ? 'Enter Your Pin' : 'Only Auth'}
            </p>
          </div>

          {/* Method tabs - only visible if App Lock is enabled and NOT locked out */}
          {settings.appLockEnabled && !isPinLocked && (settings.pinHash || (biometricsSupported && settings.appLockMethod === 'biometrics') || settings.securityKeys.length > 0) && (
            <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-full">
              {['pin', 'biometrics', 'hardware'].map(method => {
                if (method === 'pin' && !settings.pinHash) return null;
                if (method === 'biometrics' && (!biometricsSupported || settings.appLockMethod !== 'biometrics')) return null;
                if (method === 'hardware' && settings.securityKeys.length === 0) return null;
                return (
                  <button key={method} type="button" onClick={() => { setUnlockMethod(method as 'pin' | 'passphrase'); setUnlockError(''); setUnlockInput(''); }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${unlockMethod === method ? 'bg-white/10 text-white' : 'text-[#8e90a2] hover:text-white'}`}>
                    {method === 'biometrics' ? '⬡ Bio' : method === 'hardware' ? 'FIDO2 Key' : 'Keypad'}
                  </button>
                );
              })}
            </div>
          )}

          {unlockMethod === 'hardware' ? (
            <div className="w-full flex flex-col items-center gap-4 relative z-20 animate-pulse">
              <button type="button" onClick={handleHardwareUnlock}
                className="w-20 h-20 rounded-full bg-[var(--color-accent)]/10 border-2 border-[var(--color-accent)]/30 hover:border-[var(--color-accent)]/60 hover:bg-[var(--color-accent)]/10 transition-all flex items-center justify-center group cursor-pointer">
                <Key className="w-8 h-8 text-[var(--color-accent)] group-hover:scale-110 transition-transform" />
              </button>
              <p className="text-xs text-[#8e90a2] text-center">
                Touch key to verify FIDO2 / WebAuthn credentials
              </p>
            </div>
          ) : unlockMethod === 'biometrics' ? (
            <div className="w-full flex flex-col items-center gap-4 relative z-20 animate-pulse">
              <button type="button" onClick={handleBiometricUnlock}
                className="w-20 h-20 rounded-full bg-[#2d5bff]/10 border-2 border-[#2d5bff]/30 hover:border-[var(--color-accent)]/60 hover:bg-[var(--color-accent)]/10 transition-all flex items-center justify-center group cursor-pointer">
                <Fingerprint className="w-8 h-8 text-[#b8c3ff] group-hover:text-[var(--color-accent)] transition-colors" />
              </button>
              <p className="text-xs text-[#8e90a2] text-center">
                {biometricsSupported ? 'Tap to authenticate with your device biometrics' : 'Biometrics not available on this device'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleUnlock} className="w-full space-y-4 flex flex-col items-center">
              {unlockMethod === 'pin' ? (
                <div className="flex flex-col items-center gap-4 w-full relative">
                  {/* Hidden Input for physical keyboard capture */}
                  <input
                    ref={pinInputRef}
                    type="password"
                    pattern="\d*"
                    maxLength={8}
                    value={unlockInput}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').substring(0, 8);
                      setUnlockInput(val);
                    }}
                    className="absolute inset-0 opacity-0 cursor-default z-10 w-full h-8"
                    placeholder="PIN"
                  />
                  {/* Circles Display */}
                  <div onClick={() => pinInputRef.current?.focus()} className="flex gap-4 py-2 cursor-pointer relative z-20">
                    {Array.from({ length: settings.pinLength || 8 }).map((_, idx) => {
                      const isFilled = unlockInput.length > idx;
                      return (
                        <motion.div
                          key={`unlock-pin-dot-${idx}`}
                          initial={{ scale: 0.8 }}
                          animate={{
                            scale: isFilled ? 1.1 : 1,
                            backgroundColor: isFilled ? accentHex : 'rgba(255,255,255,0.08)',
                            borderColor: isFilled ? accentHex : 'rgba(255,255,255,0.15)',
                          }}
                          transition={{ duration: 0.15, ease: 'easeOut' }}
                          className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${
                            isFilled ? 'scale-110' : ''
                          }`}
                        />
                      );
                    })}
                  </div>
                  
                  {/* Visual Numeric Keypad for Touch/Mobile */}
                  {(isMobileScreen || showVisualKeypad) && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="grid grid-cols-3 gap-3 w-full max-w-[220px] mx-auto mt-2 relative z-20 overflow-hidden"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button key={num} type="button"
                          onClick={() => {
                            if (unlockInput.length < 8) {
                              setUnlockInput(prev => `${prev}${num}`);
                            }
                          }}
                          className="w-12 h-12 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-base font-semibold text-white flex items-center justify-center mx-auto">
                          {num}
                        </button>
                      ))}
                      <button type="button"
                        onClick={() => setUnlockInput('')}
                        className="w-12 h-12 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-[9px] font-bold text-[#8e90a2] hover:text-white flex items-center justify-center mx-auto">
                        CLEAR
                      </button>
                      <button type="button"
                        onClick={() => {
                          if (unlockInput.length < 8) {
                            setUnlockInput(prev => `${prev}0`);
                          }
                        }}
                        className="w-12 h-12 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-base font-semibold text-white flex items-center justify-center mx-auto">
                        0
                      </button>
                      <button type="button"
                        onClick={() => setUnlockInput(prev => prev.slice(0, -1))}
                        className="w-12 h-12 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-xs font-bold text-[#8e90a2] hover:text-white flex items-center justify-center mx-auto">
                        ⌫
                      </button>
                    </motion.div>
                  )}
                </div>
              ) : (
                <div className="relative w-full">
                  <input
                    ref={passphraseInputRef}
                    type={showUnlockInput ? 'text' : 'password'}
                    value={unlockInput}
                    onChange={e => setUnlockInput(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter your passphrase / master key"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/25 focus:bg-white/[0.07] transition-all duration-200 pr-10"
                  />
                  <button type="button" onClick={() => setShowUnlockInput(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8e90a2] hover:text-white transition-colors">
                    {showUnlockInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              )}

              {unlockError && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded-xl p-3 flex items-center gap-2 w-full">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {unlockError}
                </motion.div>
              )}
              
              <button type="submit" disabled={unlockMethod === 'pin' && unlockInput.length < 4} className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
                unlockMethod === 'pin' && unlockInput.length < 4
                  ? 'bg-white/5 text-white/40 border border-white/5 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white hover:opacity-90 hover:-translate-y-0.5 active:scale-[0.98]'
              }`}>
                Unlock →
              </button>
            </form>
          )}

          {unlockError && unlockMethod !== 'passphrase' && (
            <button onClick={() => { setUnlockMethod('passphrase'); setUnlockError(''); }} className="text-xs text-[var(--color-accent)] hover:underline">
              Use passphrase instead
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  // ── MAIN APP ──────────────────────────────────────────────────────────────
  const sidebarTabs = [
    { value: 'security', label: 'Security', icon: ShieldCheck },
    { value: 'settings', label: 'Settings', icon: SettingsIcon },
    { value: 'support', label: 'Support', icon: HelpCircle },
  ];

  const handleSettingsClick = () => {
    if (isSettingsUnlocked) {
      setActiveTag('settings');
    } else {
      triggerVerifyAction('settings-unlock');
    }
  };

  return (
    <div className={`relative min-h-screen w-full flex select-none text-[#e5e2e1] font-sans antialiased overflow-hidden ${isTransitioning ? 'pointer-events-none opacity-90' : ''}`}
      style={{
        '--sidebar-width': sidebarCollapsed ? '72px' : `${sidebarWidth}px`
      } as React.CSSProperties}>
      <StarfieldBackground speed={0.8} />

      {/* ── WINDOW BLUR SECURITY SHIELD OVERLAY ── */}
      <AnimatePresence>
        {isWindowBlurred && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-[24px] flex flex-col items-center justify-center gap-4 text-center select-none cursor-default"
          >
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center animate-pulse">
              <Shield className="w-8 h-8 text-[var(--color-accent)]" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">Vault Security Shield</h2>
              <p className="text-xs text-[#8e90a2]">Screen protection active. Re-focus to resume.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile drawer backdrop */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileDrawerOpen(false)}
            className="fixed inset-0 z-40 drawer-backdrop md:hidden" />
        )}
      </AnimatePresence>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col h-full bg-black/30 backdrop-blur-[32px] border-r ${isHiddenVaultActive ? 'border-amber-500/20' : 'border-white/5 shadow-2xl'} w-[var(--sidebar-width)]
        ${isResizing ? '' : 'transition-all duration-300'}
        ${mobileDrawerOpen ? 'translate-x-0 !w-72' : '-translate-x-full md:translate-x-0'}`}>

        {/* Sidebar header */}
        <div className="h-16 px-4 flex items-center justify-between shrink-0 border-b border-white/5">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--color-accent)]/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-[var(--color-accent)]" />
              </div>
              <span className="font-display font-semibold text-base text-white tracking-tight">Only Auth</span>
            </div>
          )}
          <button onClick={() => setSidebarCollapsed(v => !v)}
            className={`hidden md:flex w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-[#c4c5d9] hover:text-white transition-colors ${sidebarCollapsed ? 'mx-auto' : ''}`}>
            <ChevronRight className={`w-4 h-4 transition-transform ${sidebarCollapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {/* Scrollable tag list */}
        <div className="flex-1 overflow-y-auto py-4 px-2 flex flex-col gap-1 min-h-0">
          {!sidebarCollapsed && (
            <p className="text-[9px] uppercase tracking-[0.2em] font-semibold text-[#8e90a2] px-3 mb-1">Tags</p>
          )}

          {/* All */}
          {['all', ...settings.customTags]
            .filter(tag => tag.toLowerCase() !== 'hide' && tag.toLowerCase() !== 'hidden')
            .map(tag => {
              const isActive = activeTag === tag;
              const count = tag === 'all' ? visibleAccounts.length : visibleAccounts.filter(a => a.category === tag).length;
              const Icon = tag === 'all' ? Layers : tag === 'work' ? Briefcase : tag === 'personal' ? LockOpen : Tag;
              return (
                <button key={tag} onClick={() => safeTransition(() => { setActiveTag(tag); setMobileDrawerOpen(false); })}
                  className={`flex items-center gap-3 rounded-r-full px-3 py-2.5 text-xs transition-all duration-150 ease-out border-l-[3px] ${
                    isActive ? `bg-white/5 text-white ${isHiddenVaultActive ? 'border-amber-500 text-amber-400 font-semibold' : 'border-[var(--color-accent)] text-white font-semibold'}` : 'border-transparent text-[#c4c5d9] hover:bg-white/5 hover:text-white'
                  } ${sidebarCollapsed ? 'justify-center px-0 border-l-0 rounded-full w-10 h-10 mx-auto' : ''}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="capitalize flex-1 text-left truncate">{tag === 'all' ? 'All' : tag}</span>
                      {count > 0 && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${isActive ? `${isHiddenVaultActive ? 'bg-amber-500 text-black font-bold' : 'bg-[var(--color-accent)] text-black font-bold'}` : 'bg-white/10 text-[#8e90a2]'}`}>
                          {count}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}

          {/* Static nav divider */}
          <div className="mt-3 pt-3 border-t border-white/5 flex flex-col gap-1">
            {/* Hidden Keys (only when unsealed) */}
            {isHiddenVaultActive && (
              <button onClick={() => safeTransition(() => { setActiveTag('hidden-keys'); setMobileDrawerOpen(false); })}
                className={`flex items-center gap-3 rounded-r-full px-3 py-2.5 text-xs transition-all duration-150 ease-out border-l-[3px] ${
                  activeTag === 'hidden-keys'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500 font-semibold'
                    : 'border-transparent text-amber-400 hover:bg-amber-500/5'
                } ${sidebarCollapsed ? 'justify-center px-0 border-l-0 rounded-full w-10 h-10 mx-auto' : ''}`}
                title={sidebarCollapsed ? "Hidden Keys" : undefined}>
                <Key className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && <span>Hidden Keys</span>}
              </button>
            )}

            {/* Security */}
            {(() => {
              const tab = sidebarTabs[0];
              const Icon = tab.icon;
              const isActive = activeTag === tab.value;
              return (
                <button onClick={() => safeTransition(() => { setActiveTag(tab.value); setMobileDrawerOpen(false); })}
                  className={`flex items-center gap-3 rounded-r-full px-3 py-2.5 text-xs transition-all duration-150 ease-out border-l-[3px] ${
                    isActive ? 'bg-white/5 text-white border-[var(--color-accent)] font-semibold' : 'border-transparent text-[#c4c5d9] hover:bg-white/5 hover:text-white'
                  } ${sidebarCollapsed ? 'justify-center px-0 border-l-0 rounded-full w-10 h-10 mx-auto' : ''}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span>{tab.label}</span>}
                </button>
              );
            })()}

            {/* Import - Top-level sibling button */}
            <button onClick={() => safeTransition(() => { setActiveTag('settings'); setSettingsSubTab('import-export'); setMobileDrawerOpen(false); })}
              className={`flex items-center gap-3 rounded-r-full px-3 py-2.5 text-xs transition-all duration-150 ease-out border-l-[3px] ${
                activeTag === 'settings' && settingsSubTab === 'import-export' ? 'bg-white/5 text-white border-[var(--color-accent)] font-semibold' : 'border-transparent text-[#c4c5d9] hover:bg-white/5 hover:text-white'
              } ${sidebarCollapsed ? 'justify-center px-0 border-l-0 rounded-full w-10 h-10 mx-auto' : ''}`}
              title={sidebarCollapsed ? "Import" : undefined}>
              <Upload className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Import</span>}
            </button>

            {/* Export - Top-level sibling button */}
            <button onClick={() => safeTransition(() => { setActiveTag('settings'); setSettingsSubTab('import-export'); setMobileDrawerOpen(false); })}
              className={`flex items-center gap-3 rounded-r-full px-3 py-2.5 text-xs transition-all duration-150 ease-out border-l-[3px] ${
                activeTag === 'settings' && settingsSubTab === 'import-export' ? 'bg-white/5 text-white border-[var(--color-accent)] font-semibold' : 'border-transparent text-[#c4c5d9] hover:bg-white/5 hover:text-white'
              } ${sidebarCollapsed ? 'justify-center px-0 border-l-0 rounded-full w-10 h-10 mx-auto' : ''}`}
              title={sidebarCollapsed ? "Export" : undefined}>
              <Download className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Export</span>}
            </button>

            {/* Settings & Support */}
            {sidebarTabs.slice(1).map(tab => {
              const Icon = tab.icon;
              const isActive = activeTag === tab.value;
              return (
                <button key={tab.value} onClick={tab.value === 'settings' ? handleSettingsClick : () => safeTransition(() => { setActiveTag(tab.value); setMobileDrawerOpen(false); })}
                  className={`flex items-center gap-3 rounded-r-full px-3 py-2.5 text-xs transition-all duration-150 ease-out border-l-[3px] ${
                    isActive ? 'bg-white/5 text-white border-[var(--color-accent)] font-semibold' : 'border-transparent text-[#c4c5d9] hover:bg-white/5 hover:text-white'
                  } ${sidebarCollapsed ? 'justify-center px-0 border-l-0 rounded-full w-10 h-10 mx-auto' : ''}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span>{tab.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* User card */}
        <div className="p-3 border-t border-white/5 shrink-0">
          <div className="glass-panel p-3 rounded-2xl flex flex-col gap-2.5">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5 mobile-avatar-left">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2d5bff] to-[#8B5CF6] flex items-center justify-center text-white font-semibold text-xs shrink-0">
                  {(settings.devAccountName || 'Dev Account').trim().split(/\s+/).map(n => n[0] || '').join('').substring(0, 2).toUpperCase() || 'DA'}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-white text-xs font-semibold truncate">{settings.devAccountName || 'Dev Account'}</h4>
                  <p className="text-[9px] text-[var(--color-accent)] uppercase tracking-wider font-semibold truncate h-[13px] flex items-center">
                    <span className="transition-all duration-300">
                      {isThanksActive ? 'Thanks for contri..' : (settings.devAccountTag || 'Premium')}
                    </span>
                  </p>
                </div>
              </div>
            )}
            <button onClick={() => safeTransition(() => setIsLocked(true))}
              className={`w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs font-semibold text-[#c4c5d9] hover:text-white rounded-xl transition-all flex items-center justify-center gap-2 ${sidebarCollapsed ? 'w-10 h-10 rounded-full p-0' : ''}`}>
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              {!sidebarCollapsed && <span>Lock Vault</span>}
            </button>
          </div>
        </div>

        {/* Drag resize handle */}
        {!sidebarCollapsed && (
          <div
            onMouseDown={() => setIsResizing(true)}
            className="absolute top-0 right-0 w-[4px] h-full cursor-col-resize hover:bg-[var(--color-accent)]/50 active:bg-[var(--color-accent)] transition-colors z-50"
          />
        )}
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────────────────── */}
      <main className={`flex-1 flex flex-col h-screen overflow-hidden md:ml-[var(--sidebar-width)] ${isResizing ? '' : 'transition-all duration-300'}`}>

        {/* Header */}
        <header className="w-full h-16 px-4 md:px-8 flex items-center justify-between border-b border-white/5 shrink-0 relative z-20 gap-3">
          {isMobileSearchExpanded ? (
            <div className="flex-1 flex items-center gap-2.5 h-full animate-fade-in px-1">
              <button onClick={() => { setIsMobileSearchExpanded(false); setSearchQuery(''); }}
                className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-[#c4c5d9] hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8e90a2]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search accounts..."
                  className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:bg-white/[0.07] transition-all duration-200 placeholder-white/30"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                {/* Mobile hamburger */}
                <button onClick={() => setMobileDrawerOpen(true)} className="md:hidden w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-[#c4c5d9] hover:text-white transition-colors">
                  <Menu className="w-5 h-5" />
                </button>
                <h1 className="font-display font-semibold text-lg md:text-xl text-white capitalize leading-none">
                  {activeTag === 'all' ? 'Dashboard' : activeTag === 'security' ? 'Security' : activeTag === 'settings' ? 'Settings' : activeTag === 'support' ? 'Support' : activeTag === 'hidden-keys' ? 'Hidden Keys' : activeTag}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                {/* Search — desktop view */}
                {isVaultTab && (
                  <div className="relative hidden sm:block">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8e90a2]" />
                    <input ref={searchInputRef} type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search accounts..."
                      className="w-48 md:w-60 bg-white/5 border border-white/10 rounded-full py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:w-56 md:focus:w-72 focus:bg-white/[0.07] transition-all duration-200 placeholder-white/30" />
                  </div>
                )}

                {/* Mobile search button */}
                {isVaultTab && (
                  <button onClick={() => setIsMobileSearchExpanded(true)}
                    className="sm:hidden w-9 h-9 rounded-full glass-panel flex items-center justify-center text-[#c4c5d9] hover:text-white transition-colors cursor-pointer">
                    <Search className="w-4 h-4" />
                  </button>
                )}

                {/* Compact toggle */}
                <button onClick={() => setSettings(prev => ({ ...prev, compactMode: !prev.compactMode }))}
                  title={compact ? 'Normal view' : 'Compact view'}
                  className="w-9 h-9 rounded-full glass-panel flex items-center justify-center text-[#c4c5d9] hover:text-white transition-colors cursor-pointer">
                  {compact ? <ZoomIn className="w-4 h-4" /> : <ZoomOut className="w-4 h-4" />}
                </button>

                {/* Add account button — desktop only */}
                {isVaultTab && (
                  <button onClick={openAddModal}
                    className="hidden sm:flex w-9 h-9 rounded-full bg-[var(--color-accent)] text-black items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all duration-150 ease-out cursor-pointer">
                    <Plus className="w-5 h-5 stroke-[3px]" />
                  </button>
                )}
              </div>
            </>
          )}
        </header>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto ${compact ? 'p-4 md:p-6' : 'p-4 md:p-8'}`} style={{ overflowX: 'visible' }}>
          <AnimatePresence mode="wait">

            {/* ── VAULT VIEW ─────────────────────────────────────────────── */}
            {isVaultTab && (
              <motion.div key="vault" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`flex flex-col ${settings.accountListPlacement === 'right' ? 'xl:flex-row' : ''} ${compact ? 'gap-4 md:gap-6' : 'gap-6 md:gap-8'}`}>

                {/* Left: Focus card + Pinned */}
                <div className={`flex-1 flex flex-col ${compact ? 'gap-4' : 'gap-6'} min-w-0`}>
                  
                  {/* Vault Unsealed Neon Amber Banner */}
                  {isHiddenVaultActive && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      className="border border-amber-500/40 bg-amber-950/10 rounded-2xl p-3.5 flex items-center justify-between transition-all shadow-[0_0_20px_-6px_rgba(251,191,36,0.2)]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center border border-amber-500/25 relative">
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <LockOpen className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-[0.15em] font-display">Isolated Compartment Active</p>
                          <p className="text-[10px] text-amber-500/70 mt-0.5">Isolated keys revealed. Change tags or clear search to seal.</p>
                        </div>
                      </div>
                      <button onClick={() => setIsHiddenVaultActive(false)} className="text-amber-600 hover:text-amber-400 transition-colors p-1 rounded-lg hover:bg-amber-500/10">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}

                  {focusedAccount ? (
                    <div className={`glass-panel-accent rounded-3xl relative overflow-hidden focus-card-transition group border-l-4 ${isHiddenVaultActive ? 'border-l-amber-500 shadow-[4px_0_20px_-6px_rgba(251,191,36,0.25)]' : 'border-l-[var(--color-accent)] shadow-[4px_0_20px_-6px_rgba(var(--color-accent-rgb),0.25)]'}`}
                      style={{ padding: compact ? '1.25rem' : '2rem' }}>
                      <div className={`card-bg-blur ${isHiddenVaultActive ? 'bg-amber-500/10' : 'bg-[var(--color-accent)]/10'}`} />

                      <div className="flex justify-between items-start relative z-10">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="shadow-xl shrink-0">
                            <BrandLogo name={focusedAccount.name} logoType={focusedAccount.logoType} className={`${compact ? 'w-10 h-10 text-sm' : 'w-14 h-14 text-lg'}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h2 className={`font-display font-semibold text-white truncate leading-tight ${compact ? 'text-base' : 'text-xl md:text-2xl'}`}>{focusedAccount.name}</h2>
                              {focusedAccount.nextRotationDate && isRotationDue(focusedAccount.nextRotationDate) && (
                                <span className="flex items-center gap-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 tracking-wider">
                                  ROTATION OVERDUE
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#c4c5d9] truncate mt-0.5">{focusedAccount.email}</p>
                            {focusedAccount.nextRotationDate && (
                              <p className="text-[10px] text-[#8e90a2] mt-1">
                                Rotation scheduled: <span className="text-white font-medium">{focusedAccount.nextRotationDate}</span>
                                {isRotationDue(focusedAccount.nextRotationDate) && <span className="text-amber-500 ml-1.5 font-semibold">⚠️ Action required</span>}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={e => handleTogglePin(focusedAccount.id, e)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${focusedAccount.isPinned ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/40 text-[var(--color-accent)]' : 'bg-white/5 border-white/10 text-[#c4c5d9] hover:text-white'}`}>
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openEditModal(focusedAccount)}
                            className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[#c4c5d9] hover:text-white flex items-center justify-center transition-all">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => triggerVerifyAction('delete', focusedAccount.id)}
                            className="w-8 h-8 rounded-lg bg-red-950/20 border border-red-500/20 hover:bg-red-950/40 text-red-400 flex items-center justify-center transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Code display */}
                      <div className={`flex flex-col items-center justify-center relative z-10 ${compact ? 'py-5' : 'py-8'}`}>
                        {focusedAccount.secret && focusedAccount.secret.trim() !== "" ? (
                          <>
                            <motion.div key={focusedCode} initial={{ opacity: 0.7, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                              onClick={() => handleCopyCode(focusedAccount.id, focusedCode)}
                              className={`font-mono font-bold text-white flex items-center gap-4 cursor-pointer hover:text-[var(--color-accent)] transition-colors select-none tabular-nums ${compact ? 'text-4xl md:text-5xl' : 'text-5xl md:text-6xl'}`}
                              style={{ letterSpacing: '0.15em', textShadow: totpCodes[focusedAccount?.id ?? ''] ? '0 0 20px oklch(0.82 0.12 196 / 0.4)' : 'none' }}
                              title="Click to copy">
                              <span className={totpCodes[focusedAccount?.id ?? ''] ? '' : 'animate-pulse opacity-50'}>{focusedCodeFormatted.first}</span>
                              <span className="w-2.5 h-2.5 bg-white/20 rounded-full shrink-0" />
                              <span className={totpCodes[focusedAccount?.id ?? ''] ? '' : 'animate-pulse opacity-50'}>{focusedCodeFormatted.second}</span>
                            </motion.div>

                            {copyFeedbackMap[focusedAccount.id] && (
                              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                className="mt-3 text-xs font-semibold text-[var(--color-accent)] flex items-center gap-1.5 bg-[var(--color-accent)]/10 px-3 py-1 rounded-full border border-[var(--color-accent)]/20">
                                <Check className="w-3.5 h-3.5" /> Copied!
                              </motion.div>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-amber-500 py-2 select-none">
                            <AlertTriangle className="w-8 h-8 text-amber-500 animate-pulse" />
                            <span className="text-sm font-semibold tracking-wider uppercase font-display">No Secret Set</span>
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <AccountFooter
                        focusedAccount={focusedAccount}
                        compact={compact}
                        focusedCode={focusedCode}
                        handleCopyCode={handleCopyCode}
                      />
                    </div>
                  ) : (
                    <div className="glass-panel rounded-3xl p-10 text-center flex flex-col items-center gap-4 text-[#8e90a2]">
                      <Lock className="w-10 h-10 text-white/10" />
                      <p className="text-sm">No accounts in "{activeTag === 'all' ? 'All' : activeTag}" yet.</p>
                      <button onClick={openAddModal} className="text-[var(--color-accent)] text-xs font-semibold hover:underline">Add Account</button>
                    </div>
                  )}

                   {/* Pinned accounts */}
                  {pinnedAccounts.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-[#8e90a2]">Pinned Accounts</p>
                      <div className="relative">
                        {/* Fade mask on the right so the 4th+ card softly disappears */}
                        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 z-10"
                          style={{ background: 'linear-gradient(to right, transparent, #050505)' }} />
                        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar" style={{ paddingBottom: '12px', paddingTop: '12px' }}>
                        {pinnedAccounts.map(acc => {
                          const pCode = totpCodes[acc.id] || '------';
                          const isSelected = focusedAccountId === acc.id;
                          return (
                            <div key={acc.id} onClick={() => setFocusedAccountId(acc.id)}
                              className={`glass-panel ${compact ? 'min-w-[200px] p-3' : 'min-w-[240px] p-4'} rounded-2xl flex flex-col gap-3 cursor-pointer transition-all duration-200 ease-out hover:bg-white/5 hover:border-white/10 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99] shrink-0 hover:relative hover:z-20 ${
                                isSelected ? (isHiddenVaultActive ? 'bg-amber-500/5 ring-1 ring-amber-500/20' : 'bg-white/5 ring-1 ring-white/10') : ''
                              }`}>
                              <div className="flex items-center gap-2">
                                <div className="shrink-0">
                                  <BrandLogo name={acc.name} logoType={acc.logoType} className={`${compact ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-xs'}`} />
                                </div>
                                <h4 className="font-semibold text-white text-xs truncate">{acc.name}</h4>
                              </div>
                              <div className="flex justify-between items-center">
                                {acc.secret && acc.secret.trim() !== "" ? (
                                  <>
                                    <span className={`font-mono font-semibold tabular-nums tracking-widest text-white ${compact ? 'text-base' : 'text-xl'} ${totpCodes[acc.id] ? '' : 'animate-pulse opacity-50'}`} style={{ letterSpacing: '0.15em' }}>{formatCode(pCode)}</span>
                                    <button onClick={e => { e.stopPropagation(); handleCopyCode(acc.id, pCode); }}
                                      className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-[#c4c5d9] hover:text-[var(--color-accent)]">
                                      {copyFeedbackMap[acc.id] ? <Check className="w-3.5 h-3.5 text-[var(--color-accent)]" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-xs font-semibold text-amber-500 uppercase tracking-wider font-display">No Secret</span>
                                    <div className="w-7 h-7 flex items-center justify-center text-amber-500/60">
                                      <AlertTriangle className="w-4 h-4" />
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Account list */}
                <div className={`flex flex-col gap-3 shrink-0 ${settings.accountListPlacement === 'right' ? 'w-full xl:w-96' : 'w-full'}`}>
                  <div className="flex justify-between items-center">
                    <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-[#8e90a2]">Account List</p>
                    <span className="text-[9px] font-mono text-[#8e90a2]">{filteredAccounts.length} accounts</span>
                  </div>
                  <div className={`grid gap-${compact ? '1.5' : '3'} ${settings.accountListPlacement === 'right' ? 'grid-cols-1 max-h-[75vh] overflow-y-auto overflow-x-visible pr-0.5' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}
                    style={{ paddingTop: '8px', paddingBottom: '8px', paddingLeft: '16px', paddingRight: '16px' }}>
                    {filteredAccounts.length > 0 ? filteredAccounts.map(acc => {
                      const isFocused = focusedAccountId === acc.id;
                      const aCode = totpCodes[acc.id] || '------';
                      return (
                        <motion.div key={acc.id} onClick={() => setFocusedAccountId(acc.id)}
                          whileHover={{ scale: 1.005, y: -1 }} whileTap={{ scale: 0.99 }} transition={{ duration: 0.15, ease: "easeOut" }}
                          className={`glass-panel ${compact ? 'rounded-xl p-2.5' : 'rounded-2xl p-4'} flex items-center justify-between cursor-pointer transition-all duration-200 ease-out group border border-transparent hover:relative hover:z-20 ${
                            isFocused
                              ? `${isHiddenVaultActive ? 'bg-amber-500/5 ring-1 ring-amber-500/20' : 'bg-white/5 ring-1 ring-white/10'}`
                              : 'hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg'
                          }`}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="shrink-0">
                              <BrandLogo name={acc.name} logoType={acc.logoType} className={`${compact ? 'w-8 h-8 text-xs' : 'w-11 h-11 text-xs'}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1 flex-wrap">
                                <h4 className={`font-semibold text-white truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>{acc.name}</h4>
                                {acc.isPinned && <Pin className="w-2.5 h-2.5 text-[var(--color-accent)]/60 shrink-0 fill-current" />}
                                {acc.nextRotationDate && isRotationDue(acc.nextRotationDate) && (
                                  <span className="flex items-center gap-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 tracking-wider">
                                    ROTATE
                                  </span>
                                )}
                              </div>
                              {!compact && <p className="text-[10px] text-[#8e90a2] truncate mt-0.5">{acc.email}</p>}
                            </div>
                          </div>
                          {acc.secret && acc.secret.trim() !== "" ? (
                            <div className="code-hover-target ml-3 shrink-0" onClick={e => { e.stopPropagation(); handleCopyCode(acc.id, aCode); }}>
                              <span className={`original-code font-mono font-semibold tabular-nums tracking-widest text-white group-hover:text-[var(--color-accent)] transition-colors ${compact ? 'text-xs' : 'text-sm'} ${totpCodes[acc.id] ? '' : 'animate-pulse opacity-50'}`} style={{ letterSpacing: '0.12em' }}>{formatCode(aCode)}</span>
                              <span className="hover-text text-[9px] text-[var(--color-accent)] font-bold font-sans uppercase">
                                {copyFeedbackMap[acc.id] ? '✓' : 'COPY'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 ml-3 shrink-0 text-amber-500 font-semibold" onClick={e => e.stopPropagation()}>
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span className="text-[10px] uppercase tracking-wider font-display font-semibold">Missing Secret</span>
                            </div>
                          )}
                        </motion.div>
                      );
                    }) : (
                      <div className="glass-panel rounded-xl p-6 text-center text-xs text-[#8e90a2] col-span-full">No accounts match this filter.</div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── HIDDEN KEYS (Vault Partition) ───────────────────────────── */}
            {activeTag === 'hidden-keys' && (
              <motion.div key="hidden-keys" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl space-y-6 animate-fade-in">
                <div className="border border-amber-500/25 bg-amber-950/10 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
                  <div className="space-y-2 flex-1">
                    <span className="text-[9px] uppercase tracking-widest font-semibold text-amber-400">Stealth Enclave</span>
                    <h2 className="font-display text-2xl font-semibold text-white">Hidden Keys Management</h2>
                    <p className="text-xs text-amber-500/70 leading-relaxed">
                      Configure your isolated compartment passcode. This partition remains completely invisible until unsealed via the dashboard search entry.
                    </p>
                  </div>
                  <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Key className="w-8 h-8 text-amber-400" />
                  </div>
                </div>

                {/* Settings Form */}
                <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-5">
                  <h3 className="font-display text-base font-semibold text-white">Partition Settings</h3>
                  <p className="text-xs text-[#8e90a2]">Customize how you unlock your isolated tag compartment. Master passphrase or key verification is required to commit changes.</p>
                  
                  {partitionError && (
                    <p className="text-xs text-red-400 font-semibold">{partitionError}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {(['pin', 'passphrase'] as const).map(method => (
                      <button key={method} type="button" onClick={() => {
                        setPartitionMethod(method);
                        setPartitionInput('');
                        setPartitionConfirm('');
                        setPartitionError('');
                      }}
                        className={`py-2.5 px-3 rounded-xl border text-xs uppercase font-bold tracking-wider text-center transition-all ${
                          partitionMethod === method ? 'border-amber-500/60 bg-amber-500/10 text-white' : 'border-white/10 bg-white/5 text-[#c4c5d9] hover:border-white/20'
                        }`}>
                        {method}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={(e) => {
                    e.preventDefault();
                    setPartitionError('');
                    if (!partitionInput.trim()) {
                      setPartitionError('Passcode cannot be empty.');
                      return;
                    }
                    if (partitionInput !== partitionConfirm) {
                      setPartitionError('Passcodes do not match.');
                      return;
                    }
                    if (partitionMethod === 'pin' && !/^\d{4,8}$/.test(partitionInput)) {
                      setPartitionError('PIN must be between 4 and 8 digits.');
                      return;
                    }
                    triggerVerifyAction('update-partition-settings', { method: partitionMethod, passcode: partitionInput.trim() });
                  }} className="space-y-4 max-w-md">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">
                        {partitionMethod === 'pin' ? 'Secret PIN (digits only)' : 'Secret Passphrase'}
                      </label>
                      <input
                        type={partitionMethod === 'pin' ? 'text' : 'password'}
                        required
                        pattern={partitionMethod === 'pin' ? '\\d*' : undefined}
                        maxLength={partitionMethod === 'pin' ? 8 : undefined}
                        value={partitionInput}
                        onChange={e => setPartitionInput(e.target.value)}
                        placeholder={partitionMethod === 'pin' ? 'e.g. 9999' : 'e.g. correct horse battery staple'}
                        className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-all placeholder-[#8e90a2]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">Confirm Passcode</label>
                      <input
                        type={partitionMethod === 'pin' ? 'text' : 'password'}
                        required
                        value={partitionConfirm}
                        onChange={e => setPartitionConfirm(e.target.value)}
                        placeholder="Re-enter passcode"
                        className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-all placeholder-[#8e90a2]"
                      />
                    </div>
                    <button type="submit" className="px-5 py-2.5 text-xs bg-amber-500 text-black font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer">
                      Save Partition Passcode
                    </button>
                  </form>

                  {/* Deactivation Area */}
                  <div className="border-t border-white/8 pt-5 space-y-3">
                    <h4 className="text-sm font-semibold text-white">Disable Isolated Compartment</h4>
                    <p className="text-xs text-[#8e90a2]">Deactivate the isolated compartment. All hidden accounts will be returned to your default Personal tag and all partition passcode configurations will be safely wiped.</p>
                    <button
                      onClick={() => triggerVerifyAction('disable-partition')}
                      className="px-4 py-2.5 text-xs bg-red-950/20 text-red-400 border border-red-500/20 rounded-xl font-semibold hover:bg-red-950/40 transition-all active:scale-[0.98] cursor-pointer">
                      Disable Isolated Compartment
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── SECURITY ───────────────────────────────────────────────── */}
            {activeTag === 'security' && (
              <motion.div key="security" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl space-y-6 animate-fade-in">
                <div className="glass-panel rounded-3xl p-6 md:p-8 border border-white/8 flex flex-col md:flex-row items-center gap-6">
                  <div className="space-y-2 flex-1">
                    <span className="text-[9px] uppercase tracking-widest font-semibold text-[#8e90a2]">Security Score</span>
                    <h2 className="font-display text-2xl font-semibold text-white">Security Overview</h2>
                    <p className="text-xs text-[#c4c5d9] leading-relaxed">Analysis of your vault&apos;s passphrase strength, backup status, and active hardware keys.</p>
                  </div>
                  <div className="w-28 h-28 rounded-full border-4 border-[#434656] relative flex flex-col items-center justify-center shrink-0">
                    <div className="absolute inset-0 rounded-full border-4 border-dashed border-[var(--color-accent)]/30" />
                    <span className="text-3xl font-mono font-bold text-[var(--color-accent)]">92%</span>
                    <span className="text-[9px] uppercase font-bold text-[#8e90a2] tracking-wider mt-0.5">Strong</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { icon: Download, label: 'Backup', status: 'Stable', statusColor: 'text-green-400', desc: 'Offline backup keeps your seeds safe without cloud sync.', info: `Last: ${new Date(settings.lastBackupDate).toLocaleDateString()}`, infoColor: 'text-[var(--color-accent)]' },
                    { icon: Key, label: 'Passphrase Strength', status: passkeyStrength.label, statusColor: passkeyStrength.color, desc: 'Entropy calculated from your passphrase complexity.', info: `Score: ${passkeyStrength.score}/100`, infoColor: 'text-white' },
                    { icon: Fingerprint, label: 'Locking', status: 'Active', statusColor: 'text-green-400', desc: 'Vault locks instantly and requires passphrase, PIN, or biometrics.', info: settings.appLockEnabled ? 'App Lock Enabled' : 'App Lock Disabled', infoColor: settings.appLockEnabled ? 'text-green-400' : 'text-amber-400' },
                  ].map((card) => (
                    <div key={card.label} className="glass-panel p-5 rounded-2xl border border-white/8">
                      <div className="flex justify-between items-start mb-3">
                        <div className="w-9 h-9 rounded-lg bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)]">
                          <card.icon className="w-4 h-4" />
                        </div>
                        <span className={`text-[9px] uppercase font-semibold ${card.statusColor}`}>{card.status}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-1.5">{card.label}</h3>
                      <p className="text-xs text-[#8e90a2] leading-relaxed mb-3">{card.desc}</p>
                      <div className={`text-[10px] font-mono ${card.infoColor} bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/8`}>{card.info}</div>
                    </div>
                  ))}
                </div>

                {/* Hardware keys */}
                <div className="glass-panel rounded-2xl p-6 border border-white/8">
                  <div className="flex justify-between items-center mb-5">
                    <div>
                      <h3 className="font-display text-base font-semibold text-white">Hardware Keys</h3>
                      <p className="text-xs text-[#8e90a2] mt-0.5">Register physical security tokens for two-factor access.</p>
                    </div>
                    <button onClick={() => setIsAddingHardwareKey(v => !v)}
                      className="text-xs bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 px-3 py-1.5 rounded-lg border border-[var(--color-accent)]/20 font-semibold transition-all">
                      Register Key
                    </button>
                  </div>
                  {isAddingHardwareKey && (
                    <form onSubmit={registerSecurityKey} className="flex gap-3 mb-4 p-3 rounded-xl bg-white/[0.02] border border-[var(--color-accent)]/20 animate-fade-in">
                      <input type="text" required value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="e.g. YubiKey 5C"
                        className="flex-1 bg-[#1c1b1b] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/50" />
                      <button type="submit" className="text-xs bg-[var(--color-accent)] text-black px-4 py-2 rounded-lg font-semibold">Add</button>
                      <button type="button" onClick={() => setIsAddingHardwareKey(false)} className="text-xs text-[#8e90a2] hover:text-white px-3 py-2">Cancel</button>
                    </form>
                  )}
                  <div className="space-y-2.5">
                    {settings.securityKeys.length > 0 ? settings.securityKeys.map(key => (
                      <div key={key.id} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/8 rounded-xl hover:border-white/12 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/15 flex items-center justify-center text-[var(--color-accent)]">
                            <Key className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-white">{key.name}</h4>
                            <p className="text-[10px] text-[#8e90a2]">FIDO2 • Added {new Date(key.addedAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <button onClick={() => deleteSecurityKey(key.id)}
                          className="p-2 bg-red-950/20 text-red-400 hover:text-red-300 rounded-lg border border-red-500/10 hover:border-red-500/30 text-xs font-semibold transition-colors">
                          Remove
                        </button>
                      </div>
                    )) : (
                      <div className="p-5 text-center text-xs text-[#8e90a2] border border-dashed border-white/8 rounded-xl">No hardware keys registered.</div>
                    )}
                  </div>
                </div>

                {/* ── PANIC / DURESS MODE SETTINGS ── */}
                <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-4">
                  <div>
                    <h3 className="font-display text-base font-semibold text-white">Panic / Duress Mode</h3>
                    <p className="text-xs text-[#8e90a2] mt-0.5">When forced to unlock under pressure, entering a secondary Duress PIN triggers a silent emergency response.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Action toggle */}
                    <div className="bg-white/5 p-4 rounded-xl border border-white/8 space-y-2">
                      <label className="text-[10px] uppercase font-bold text-[#8e90a2] tracking-wider">Duress Lockout Action</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, duressAction: 'fake' }))}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${settings.duressAction === 'fake' ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)] text-white' : 'bg-transparent border-white/10 text-[#8e90a2] hover:border-white/20'}`}
                        >
                          Show Fake Vault
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, duressAction: 'wipe' }))}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${settings.duressAction === 'wipe' ? 'bg-red-950/20 border-red-500/40 text-red-300' : 'bg-transparent border-white/10 text-[#8e90a2] hover:border-white/20'}`}
                        >
                          Scrub Stealth
                        </button>
                      </div>
                      <p className="text-[10px] text-[#8e90a2] leading-relaxed mt-1">
                        {settings.duressAction === 'fake' 
                          ? 'Unlocks a simulated fake empty vault with zero user accounts.' 
                          : 'Silently and permanently wipes all accounts in the Stealth Isolated Compartment.'}
                      </p>
                    </div>

                    {/* PIN setup */}
                    <div className="bg-white/5 p-4 rounded-xl border border-white/8 space-y-2 flex flex-col justify-between">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] uppercase font-bold text-[#8e90a2] tracking-wider">Duress PIN Setup</label>
                        <span className="text-[10px] font-mono text-[var(--color-accent)]">{settings.duressPinHash ? 'PIN Fortified' : 'Not Configured'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDuressSetup(true)}
                        className="w-full py-2 px-4 rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/20 font-semibold text-xs transition-all"
                      >
                        {settings.duressPinHash ? 'Change Duress PIN' : 'Configure Duress PIN'}
                      </button>
                      {settings.duressPinHash && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmModal({
                              title: 'Remove Duress PIN',
                              message: 'Are you sure you want to remove the Duress PIN?',
                              onConfirm: () => {
                                setSettings(prev => ({
                                  ...prev,
                                  duressPinHash: '',
                                  duressPassphraseHash: '',
                                  authHashes: [],
                                  authMetadata: {}
                                }));
                                showToast('Duress PIN removed.', 'info');
                              }
                            });
                          }}
                          className="w-full mt-1.5 py-1 text-[10px] text-red-400 hover:text-red-300 font-semibold text-center transition-colors"
                        >
                          Disable Duress PIN
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── LOCAL AUDIT TRAIL LOGS ── */}
                <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-display text-base font-semibold text-white">Local Activity Audit Trail</h3>
                      <p className="text-xs text-[#8e90a2] mt-0.5">Offline, zero-knowledge, append-only encrypted tamper logs tracking access attempts.</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const logs = await readAuditLogs(decryptedLogKeyHex);
                          setAuditLogs(logs);
                          showToast('Tamper logs loaded successfully.', 'success');
                        } catch (err) { console.warn(err);
                          showToast('Failed to decrypt audit logs.', 'error');
                        }
                      }}
                      className="text-xs bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg text-[var(--color-accent)] font-semibold transition-all flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3" /> Fetch Logs
                    </button>
                  </div>

                  <div className="bg-[#0b0a0a] rounded-xl border border-white/5 max-h-48 overflow-y-auto font-mono text-[10px] p-4 space-y-1.5 custom-scrollbar">
                    {auditLogs.length > 0 ? (
                      [...auditLogs].reverse().map(log => {
                        const parts = log.split('|');
                        const time = new Date(parseInt(parts[0], 10) * 1000).toLocaleString();
                        const isAlert = log.includes('DURESS') || log.includes('Failed');
                        return (
                          <div key={parts[0]} className={`flex items-start justify-between py-1 border-b border-white/3 last:border-0 ${isAlert ? 'text-red-400' : 'text-neutral-400'}`}>
                            <span className="shrink-0 text-white/40 mr-4">{time}</span>
                            <span className="flex-1 break-all text-right">{parts[1]}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center text-[#8e90a2] py-4">Click "Fetch Logs" to view the encrypted trail.</div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── SETTINGS ───────────────────────────────────────────────── */}
            {activeTag === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl space-y-6 animate-fade-in">
                {/* Sub-tabs */}
                <div className="flex gap-1 bg-white/5 rounded-xl p-1 overflow-x-auto whitespace-nowrap no-scrollbar select-none">
                  {([
                    { value: 'layout', label: 'Layout' },
                    { value: 'profile', label: 'Profile & Perks' },
                    { value: 'passphrase', label: 'Passphrase' },
                    { value: 'tags', label: 'Tags' },
                    { value: 'import-export', label: 'Import & Export' },
                    { value: 'hardware', label: 'Hardware' },
                    { value: 'app-lock', label: 'App Lock' }
                  ] as const).map(tab => (
                    <button key={tab.value} onClick={() => safeTransition(() => setSettingsSubTab(tab.value))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${settingsSubTab === tab.value ? 'bg-white/10 text-white' : 'text-[#8e90a2] hover:text-white'}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {settingsSubTab === 'layout' && (
                  <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-5">
                    <h3 className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">Layout</h3>

                    {/* Compact mode */}
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/8">
                      <div>
                        <p className="text-sm font-semibold text-white">Compact Mode</p>
                        <p className="text-xs text-[#8e90a2] mt-0.5">Smaller rows — fit more accounts on screen</p>
                      </div>
                      <button onClick={() => setSettings(prev => ({ ...prev, compactMode: !prev.compactMode }))}
                        className={`relative w-10 h-6 rounded-full transition-colors ${settings.compactMode ? 'bg-[var(--color-accent)]' : 'bg-white/10'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.compactMode ? 'left-5' : 'left-1'}`} />
                      </button>
                    </div>

                    {/* Clock-Drift Calibration */}
                    <div className="space-y-3 p-4 bg-white/5 rounded-xl border border-white/8 text-left">
                      <div>
                        <p className="text-sm font-semibold text-white">Clock-Drift Calibration</p>
                        <p className="text-xs text-[#8e90a2] mt-0.5">TOTP requires perfectly synced system clocks. Calibrate your clock offset if 2FA codes are failing.</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="-300"
                          max="300"
                          value={settings.timeOffsetSeconds || 0}
                          onChange={e => setSettings(prev => ({ ...prev, timeOffsetSeconds: parseInt(e.target.value) }))}
                          className="flex-1 accent-[var(--color-accent)] h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-xs font-mono text-white min-w-[50px] text-right">
                          {(settings.timeOffsetSeconds || 0) > 0 ? `+${settings.timeOffsetSeconds}` : settings.timeOffsetSeconds}s
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {[-60, -30, 0, 30, 60].map(val => (
                          <button
                            key={val}
                            onClick={() => setSettings(prev => ({ ...prev, timeOffsetSeconds: val }))}
                            className={`px-3 py-1 rounded-lg text-[10px] font-mono border transition-all ${
                              settings.timeOffsetSeconds === val
                                ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)] text-[var(--color-accent)]'
                                : 'bg-white/5 border-white/10 text-[#8e90a2] hover:text-white'
                            }`}
                          >
                            {val > 0 ? `+${val}` : val}s
                          </button>
                        ))}
                        <button
                          onClick={async () => {
                            try {
                              const start = Date.now();
                              const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                              const data = await res.json();
                              const serverTime = Math.floor(new Date(data.utc_datetime).getTime() / 1000);
                              const clientTime = Math.floor(start / 1000);
                              const offset = serverTime - clientTime;
                              setSettings(prev => ({ ...prev, timeOffsetSeconds: offset }));
                              showToast(`Clock Drift Synced. Calculated Offset: ${offset}s`, 'success');
                            } catch (err) { console.warn(err);
                              showToast('Failed to sync time online. Using manual calibration.', 'error');
                            }
                          }}
                          className="px-3 py-1 ml-auto bg-[var(--color-accent)] text-black font-semibold rounded-lg text-[10px] hover:opacity-90 transition-all"
                        >
                          Auto Sync
                        </button>
                      </div>
                    </div>

                    {/* Force Search on Startup */}
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/8">
                      <div>
                        <p className="text-sm font-semibold text-white">Focus Search on Startup</p>
                        <p className="text-xs text-[#8e90a2] mt-0.5">Automatically focus search bar on startup or vault unlock</p>
                      </div>
                      <button onClick={() => setSettings(prev => ({ ...prev, forceSearchOnStartup: !prev.forceSearchOnStartup }))}
                        className={`relative w-10 h-6 rounded-full transition-colors ${settings.forceSearchOnStartup ? 'bg-[var(--color-accent)]' : 'bg-white/10'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.forceSearchOnStartup ? 'left-5' : 'left-1'}`} />
                      </button>
                    </div>

                    {/* Account list placement */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-[#8e90a2]">Account List Position</label>
                      <div className="grid grid-cols-2 gap-3">
                        {(['right', 'bottom'] as const).map(pos => (
                          <button key={pos} onClick={() => setSettings(prev => ({ ...prev, accountListPlacement: pos }))}
                            className={`p-4 rounded-xl border text-left transition-all ${settings.accountListPlacement === pos ? `${accentBorder}/50 ${accentBg}/5 text-white` : 'border-white/10 bg-white/5 text-[#8e90a2] hover:text-white'}`}>
                            <div className="font-semibold text-xs uppercase mb-1">{pos === 'right' ? 'Right Sidebar' : 'Below Card'}</div>
                            <div className="text-[10px] text-[#8e90a2]">{pos === 'right' ? 'Side-by-side on wide screens' : 'Stacked layout with wider grid'}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Select App Theme Accent */}
                    <div className="space-y-2 border-t border-white/8 pt-4">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-[#8e90a2]">App Theme Accent</label>
                      <div className="grid grid-cols-5 gap-2">
                        {([
                          { id: 'cyan', label: 'Cyan', bg: 'bg-[var(--color-accent)]' },
                          { id: 'amber', label: 'Amber', bg: 'bg-amber-500' },
                          { id: 'emerald', label: 'Emerald', bg: 'bg-emerald-500' },
                          { id: 'purple', label: 'Purple', bg: 'bg-purple-500' },
                          { id: 'crimson', label: 'Crimson', bg: 'bg-rose-500' }
                        ] as const).map(theme => {
                          const isSelected = (settings.appThemeAccent || 'cyan') === theme.id;
                          return (
                            <button key={theme.id} type="button" onClick={() => setSettings(prev => ({ ...prev, appThemeAccent: theme.id }))}
                              className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 hover:scale-105 active:scale-95 duration-150 ${
                                isSelected ? 'border-white/40 bg-white/5 text-white' : 'border-white/10 bg-white/0 text-[#8e90a2] hover:text-white'
                              }`}
                              title={theme.label}
                            >
                              <div className={`w-3.5 h-3.5 rounded-full ${theme.bg}`} />
                              <span className="text-[9px] font-semibold">{theme.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Auto-Lock Timeout Dropdown */}
                    <div className="space-y-2 border-t border-white/8 pt-4">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-[#8e90a2]">Auto-Lock Timeout</label>
                      <select
                        value={settings.autoLockTimeout ?? 300}
                        onChange={e => setSettings(prev => ({ ...prev, autoLockTimeout: parseInt(e.target.value) }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-white/30 transition-all font-semibold"
                      >
                        <option value={30} className="bg-[#111] text-white">30 Seconds</option>
                        <option value={60} className="bg-[#111] text-white">1 Minute</option>
                        <option value={300} className="bg-[#111] text-white">5 Minutes</option>
                        <option value={900} className="bg-[#111] text-white">15 Minutes</option>
                        <option value={1800} className="bg-[#111] text-white">30 Minutes</option>
                        <option value={3600} className="bg-[#111] text-white">1 Hour</option>
                        <option value={0} className="bg-[#111] text-white">Never Lock</option>
                      </select>
                    </div>
                  </div>
                )}

                {settingsSubTab === 'profile' && (
                  <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-6">
                    <h3 className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">Profile & Perks</h3>

                    <div className="space-y-4">
                      {/* Name input */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-[#8e90a2]">Dev Account Name</label>
                        <input
                          type="text"
                          value={settings.devAccountName}
                          onChange={e => setSettings(prev => ({ ...prev, devAccountName: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/20 transition-all"
                          placeholder="Dev Account"
                        />
                      </div>

                      {/* Custom Tag input */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-[#8e90a2]">Custom Premium Tag</label>
                        <input
                          type="text"
                          value={settings.devAccountTag}
                          disabled={!settings.githubContributor}
                          onChange={e => setSettings(prev => ({ ...prev, devAccountTag: e.target.value }))}
                          className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 transition-all ${
                            settings.githubContributor 
                              ? 'border-white/10 focus:border-[var(--color-accent)]/50 focus:ring-[var(--color-accent)]/20' 
                              : 'border-white/5 text-neutral-500 cursor-not-allowed opacity-50'
                          }`}
                          placeholder={settings.githubContributor ? "Premium" : "Star repo to unlock custom tags!"}
                        />
                        {!settings.githubContributor && (
                          <p className="text-[10px] text-amber-400/80">🔒 Star or donate on GitHub to unlock custom profile tags.</p>
                        )}
                      </div>

                      {/* Sliding Sidebar setting */}
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] uppercase tracking-wider font-semibold text-[#8e90a2]">Sidebar Panel Width</label>
                          <span className="text-[10px] font-mono text-[var(--color-accent)]">{sidebarWidth}px</span>
                        </div>
                        <input
                          type="range"
                          min="180"
                          max="450"
                          value={sidebarWidth}
                          onChange={e => setSidebarWidth(parseInt(e.target.value, 10))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[var(--color-accent)]"
                        />
                      </div>
                    </div>

                    {/* GitHub Contributor Loop (Emotional Message) */}
                    <div className="pt-4 border-t border-white/5 space-y-4">
                      <div className="p-4 bg-gradient-to-br from-neutral-900 to-black rounded-2xl border border-white/5 relative overflow-hidden flex flex-col gap-3">
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--color-accent)]/40 to-transparent" />
                        <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <svg className="w-4 h-4 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                          Support Privacy & Security
                        </h4>
                        
                        <p className="text-xs text-[#c4c5d9] leading-relaxed">
                          Only Auth is a 100% open-source, local-first product built on transparency, safety, and mutual trust. We don&apos;t track you, run servers, or monetize your data. 
                        </p>
                        <p className="text-xs text-[#c4c5d9] leading-relaxed italic">
                          "Every GitHub star, feedback contribution, or small donation keeps privacy accessible to everyone. Have you supported Only Auth by starring the repository or contributing to our community?"
                        </p>

                        <div className="flex gap-2.5 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSettings(prev => ({ ...prev, githubContributor: true }));
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                              settings.githubContributor 
                                ? 'bg-green-500/10 border border-green-500/30 text-green-400 cursor-default' 
                                : 'bg-[var(--color-accent)] hover:opacity-95 text-black hover:scale-[1.02]'
                            }`}
                          >
                            {settings.githubContributor ? '✓ Unlocked Premium!' : 'Yes, I have starred / donated!'}
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              window.open('https://github.com/OnlyXianzo/Only-Auth', '_blank');
                            }}
                            className="px-4 py-2 rounded-xl border border-white/10 hover:border-white/20 text-xs text-[#c4c5d9] hover:text-white transition-all hover:bg-white/5"
                          >
                            Not yet (Open Repository ↗)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {settingsSubTab === 'passphrase' && (
                  <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-5">
                    <h3 className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">Change Passphrase</h3>
                    <p className="text-xs text-[#8e90a2]">Generate a new recovery passphrase or rotate master key. Verification of current passphrase required.</p>

                    {newPassphraseWords.length === 0 ? (
                      <button onClick={handleRegeneratePassphrase}
                        className="w-full py-3 rounded-xl border border-white/10 bg-white/5 text-sm text-[#c4c5d9] hover:text-white hover:border-white/20 font-semibold transition-all flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4" /> Generate New Passphrase
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                          {newPassphraseWords.map((word, i) => (
                    <div key={`word-${word}`} className="word-cell">
                              <span className="word-index">{i + 1}.</span>
                              <span>{word}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-3">
                          <button onClick={handleSaveNewPassphraseSubmit}
                            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white text-xs font-semibold">
                            Authorize & Save New Passphrase
                          </button>
                          <button onClick={() => setNewPassphraseWords([])} className="px-4 py-2.5 rounded-xl text-xs text-[#8e90a2] hover:text-white border border-white/10">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="border-t border-white/8 pt-5 space-y-3">
                      <h4 className="text-sm font-semibold text-white">Rotate Master Key</h4>
                      <p className="text-xs text-[#8e90a2]">Regenerate your 256-bit cryptographic master key.</p>
                      {newMasterKeyField ? (
                        <div className="space-y-3">
                          <div className="bg-[#0e0e0e] border border-white/10 rounded-xl p-3 font-mono text-xs text-[var(--color-accent)] break-all select-all">
                            {newMasterKeyField}
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={handleSaveNewMasterKeySubmit}
                              className="px-4 py-2.5 text-xs bg-[var(--color-accent)] text-black font-semibold rounded-xl hover:opacity-90 transition-opacity">
                              Authorize & Save Master Key
                            </button>
                            <button type="button" onClick={() => setNewMasterKeyField("")} className="px-4 py-2.5 text-xs border border-white/10 text-white rounded-xl">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={handleRegenerateMasterKey}
                          className="px-4 py-2 text-xs bg-white/5 border border-white/10 text-white font-semibold rounded-xl hover:bg-white/10">
                          Regenerate Master Key
                        </button>
                      )}
                    </div>

                    <div className="border-t border-white/8 pt-5 space-y-3">
                      <h4 className="text-sm font-semibold text-white">Change PIN</h4>
                      <p className="text-[10px] text-[#8e90a2]">Set a 4-8 digit PIN for faster daily unlock. Current passphrase verification required.</p>
                      <form onSubmit={handleUpdatePinSubmit} className="flex flex-wrap gap-3 items-end">
                        <div className="relative flex-1 min-w-[160px]">
                          <input type="password" value={newPinField} onChange={e => setNewPinField(e.target.value)}
                            placeholder="New PIN (4-8 digits)"
                            pattern="\d*"
                            inputMode="numeric"
                            maxLength={8}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-accent)]/50 transition-all placeholder-[#8e90a2] font-mono tracking-widest" />
                        </div>
                        <div className="relative flex-1 min-w-[160px]">
                          <input type="password" value={newPinConfirm} onChange={e => setNewPinConfirm(e.target.value)}
                            placeholder="Confirm PIN"
                            pattern="\d*"
                            inputMode="numeric"
                            maxLength={8}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-accent)]/50 transition-all placeholder-[#8e90a2] font-mono tracking-widest" />
                        </div>
                        <button type="submit" className="px-5 py-2.5 text-xs bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-semibold rounded-xl hover:bg-[var(--color-accent)]/20 transition-all border border-[var(--color-accent)]/20 shrink-0">Update PIN</button>
                      </form>
                    </div>
                  </div>
                )}

                {settingsSubTab === 'tags' && (
                  <div className="space-y-4">
                    <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-5">
                      <h3 className="font-display text-base font-semibold text-white">Tags</h3>
                      <p className="text-xs text-[#8e90a2]">Tags are used to filter and organize your accounts. Create custom tags and assign them when adding accounts.</p>
                      <div className="space-y-2">
                        {settings.customTags.filter(tag => tag.toLowerCase() !== 'hide' && tag.toLowerCase() !== 'hidden').map(tag => (
                          <div key={tag} className="flex items-center justify-between px-4 py-2.5 bg-white/5 border border-white/8 rounded-xl">
                            <div className="flex items-center gap-2.5">
                              <Tag className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                              <span className="text-sm text-white capitalize">{tag}</span>
                              <span className="text-[9px] font-mono text-[#8e90a2]">{accounts.filter(a => a.category === tag).length} accounts</span>
                            </div>
                            {!['personal', 'work'].includes(tag) && (
                              <button onClick={() => deleteTag(tag)} className="text-[#8e90a2] hover:text-red-400 transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <form onSubmit={createTag} className="flex gap-2.5">
                        <input type="text" value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Enter new tag name..."
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-accent)]/50 transition-all placeholder-[#8e90a2]" />
                        <button type="submit" className="px-4 py-2.5 bg-[var(--color-accent)] text-black text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity">Add Tag</button>
                      </form>
                    </div>
                  </div>
                )}

                {settingsSubTab === 'import-export' && (
                  <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-6">
                    <div>
                      <h3 className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">Import & Export</h3>
                      <p className="text-xs text-[#8e90a2] mt-0.5">Import credentials from other vaults, or download your Only Auth backup file.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Import card */}
                      <div className="glass-panel p-5 rounded-xl border border-white/8 space-y-4">
                        <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5 text-[var(--color-accent)]" /> Import Accounts
                        </h4>
                        <p className="text-[11px] text-[#8e90a2] leading-relaxed">
                          Import credentials from a decrypted backup file. Supports Only Auth, Ente Auth, and Bitwarden formats.
                        </p>
                        
                        <div className="space-y-2">
                          {/* Only Auth JSON Import (preserves settings) */}
                          <div className="relative">
                            <input type="file" accept=".json" onChange={handleImportOnlyAuth} className="hidden" id="onlyauth-import-input" />
                            <label htmlFor="onlyauth-import-input"
                              className="w-full h-10 px-4 rounded-xl border border-white/10 hover:bg-white/5 transition-all text-xs font-semibold flex items-center justify-between text-white cursor-pointer">
                              <span>Only Auth JSON Backup</span>
                              <ChevronRight className="w-3.5 h-3.5 text-[#8e90a2]" />
                            </label>
                          </div>

                          {/* Universal otpauth:// URI Import (Ente, Bitwarden, Google Auth, etc.) */}
                          <div className="relative">
                            <input type="file" accept=".txt,.uri" onChange={(e) => {
                              const file = e.target.files?.[0]; if (!file) return;
                              const reader = new FileReader();
                              reader.onload = ev => {
                                try {
                                  const result = parseOTPAuthBatch(ev.target?.result as string);
                                  if (result.accounts.length === 0) {
                                    showToast(result.warnings[0] || 'No valid URIs found.', 'error');
                                    return;
                                  }
                                  safeTransition(() => {
                                    setAccounts(prev => [...result.accounts, ...prev]);
                                    showToast(`Imported ${result.accounts.length} account${result.accounts.length !== 1 ? 's' : ''} from otpauth URIs.`, 'success');
                                  });
                                } catch (err) { console.warn(err);  showToast('Failed to parse URI file.', 'error'); }
                              };
                              reader.readAsText(file);
                            }} className="hidden" id="uri-import-input" />
                            <label htmlFor="uri-import-input"
                              className="w-full h-10 px-4 rounded-xl border border-white/10 hover:bg-white/5 transition-all text-xs font-semibold flex items-center justify-between text-white cursor-pointer">
                              <span>otpauth:// URI List (.txt)</span>
                              <ChevronRight className="w-3.5 h-3.5 text-[#8e90a2]" />
                            </label>
                          </div>
                        </div>
                        
                        {/* Integrity Sealed Backup Import */}
                        <div className="space-y-2 pt-2.5 border-t border-white/5">
                          <label className="text-[10px] uppercase font-bold text-[#8e90a2] tracking-wider block">Restore Sealed Backup</label>
                          <input
                            type="password"
                            value={backupPassword}
                            onChange={e => setBackupPassword(e.target.value)}
                            placeholder="Enter backup password..."
                            className="w-full bg-[#1c1b1b]/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/60 transition-all placeholder-[#8e90a2]"
                          />
                          <div className="relative">
                            <input type="file" accept=".sealed,.txt,.json" onChange={(e) => {
                              const file = e.target.files?.[0]; if (!file) return;
                              if (!backupPassword) {
                                showToast('Please enter the backup password first.', 'error');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = async ev => {
                                try {
                                  const payload = ev.target?.result as string;
                                  const decrypted = await decryptBackup(payload.trim(), backupPassword);
                                  const { accounts: parsedAccounts } = parseSealedPayload(decrypted);
                                  safeTransition(() => {
                                    if (parsedAccounts.length > 0) setAccounts(prev => [...parsedAccounts, ...prev]);
                                    showToast('Integrity seal verified. Accounts restored (credential hashes stripped).', 'success');
                                    setBackupPassword('');
                                  });
                                } catch (err) {
                                  const error = err as { message?: string } | null;
                                  showToast(error?.message || 'Verification failed. Tampering detected or wrong password.', 'error');
                                }
                              };
                              reader.readAsText(file);
                            }} className="hidden" id="sealed-import-input" />
                            <label htmlFor="sealed-import-input"
                              className="w-full h-10 px-4 rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 hover:bg-[var(--color-accent)]/10 transition-all text-xs font-semibold flex items-center justify-between text-[var(--color-accent)] cursor-pointer">
                              <span>Select & Verify Sealed Backup</span>
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Export card */}
                      <div className="glass-panel p-5 rounded-xl border border-white/8 space-y-4">
                        <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Download className="w-3.5 h-3.5 text-[var(--color-accent)]" /> Export & Resets
                        </h4>
                        <p className="text-[11px] text-[#8e90a2] leading-relaxed">
                          Export your encrypted Only Auth vault or reset your configuration. Keep your backups offline!
                        </p>

                        <div className="space-y-2.5">
                          <button onClick={() => triggerExport('purified-json')}
                            className="w-full h-10 px-4 rounded-xl bg-[var(--color-accent)] text-black hover:opacity-90 transition-all text-xs font-semibold flex items-center justify-between">
                            <span>Export Purified JSON (incl. settings)</span>
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button onClick={() => triggerExport('plain-text')}
                            className="w-full h-10 px-4 rounded-xl border border-white/10 hover:bg-white/5 transition-all text-xs font-semibold flex items-center justify-between text-white">
                            <span>Export URI Matrix (.txt)</span>
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button onClick={() => triggerExport('html')}
                            className="w-full h-10 px-4 rounded-xl border border-white/10 hover:bg-white/5 transition-all text-xs font-semibold flex items-center justify-between text-white">
                            <span>Export HTML Index + QR Codes</span>
                            <Download className="w-3.5 h-3.5" />
                          </button>

                           <button onClick={() => {
                            setConfirmModal({
                              title: 'Factory Reset Vault',
                              message: 'WARNING: This will permanently delete ALL accounts from your vault. This action cannot be undone. Continue?',
                              onConfirm: () => {
                                setAccounts([]);
                                saveVaultData([], decryptedLogKeyHex);
                                showToast('Vault has been successfully reset to empty.', 'info');
                              }
                            });
                          }}
                            className="w-full h-10 px-4 rounded-xl border border-red-500/20 hover:border-red-500/40 hover:bg-red-950/10 text-red-400 transition-all text-xs font-semibold flex items-center justify-between">
                            <span>Factory Reset Vault</span>
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        
                        {/* Encrypted Export with Integrity Seal */}
                        <div className="space-y-2 pt-2.5 border-t border-white/5">
                          <label className="text-[10px] uppercase font-bold text-[#8e90a2] tracking-wider block">Generate Sealed Export</label>
                          <input
                            type="password"
                            value={backupPassword}
                            onChange={e => setBackupPassword(e.target.value)}
                            placeholder="Create backup password..."
                            className="w-full bg-[#1c1b1b]/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/60 transition-all placeholder-[#8e90a2]"
                          />
                          <button
                            onClick={async () => {
                              if (!backupPassword) {
                                showToast('Please create a backup password first.', 'error');
                                return;
                              }
                              try {
                                const raw = buildSealedPayload(accounts, settings);
                                const encrypted = await encryptBackup(raw, backupPassword);
                                const blob = new Blob([encrypted], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const downloadLink = document.createElement('a');
                                downloadLink.href = url;
                                downloadLink.download = `OnlyAuth_Sealed_Backup_${new Date().toISOString().slice(0, 10)}.sealed`;
                                document.body.appendChild(downloadLink);
                                downloadLink.click();
                                document.body.removeChild(downloadLink);
                                showToast('Encrypted backup with Integrity Seal generated.', 'success');
                                setBackupPassword('');
                                setSettings(prev => ({ ...prev, lastBackupDate: new Date().toISOString() }));
                              } catch (err) { console.warn(err);
                                showToast('Backup encryption failed.', 'error');
                              }
                            }}
                            className="w-full h-10 px-4 rounded-xl bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white hover:opacity-90 transition-all text-xs font-semibold flex items-center justify-between"
                          >
                            <span>Download Sealed Backup</span>
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        
                        <div className="text-[10px] font-mono text-[#8e90a2] bg-white/5 px-3 py-2 rounded-lg border border-white/8">
                          Last backup: {new Date(settings.lastBackupDate).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {settingsSubTab === 'hardware' && (
                  <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-5">
                    <h3 className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">Hardware Settings</h3>
                    <p className="text-xs text-[#8e90a2]">Manage hardware keys registered in the security overview tab.</p>
                    <div className="space-y-2.5">
                      {settings.securityKeys.map(k => (
                        <div key={k.id} className="flex justify-between items-center p-3 bg-white/5 border border-white/8 rounded-xl">
                          <div>
                            <p className="text-xs font-semibold text-white">{k.name}</p>
                            <p className="text-[10px] text-[#8e90a2] mt-0.5">{k.keyType} • Registered {new Date(k.addedAt).toLocaleDateString()}</p>
                          </div>
                          <button onClick={() => deleteSecurityKey(k.id)} className="text-xs text-red-400 hover:text-red-300 font-semibold px-2 py-1 rounded bg-red-950/20 border border-red-900/10">
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {settingsSubTab === 'app-lock' && (
                  <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-5">
                    <h3 className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">App Lock Settings</h3>
                    
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/8">
                      <div>
                        <p className="text-sm font-semibold text-white">Enable App Lock</p>
                        <p className="text-xs text-[#8e90a2] mt-0.5">Use a secondary fast unlock method on startup</p>
                      </div>
                      <button onClick={() => setSettings(prev => ({ ...prev, appLockEnabled: !prev.appLockEnabled }))}
                        className={`relative w-10 h-6 rounded-full transition-colors ${settings.appLockEnabled ? 'bg-[var(--color-accent)]' : 'bg-white/10'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.appLockEnabled ? 'left-5' : 'left-1'}`} />
                      </button>
                    </div>

                    {settings.appLockEnabled && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-[#c4c5d9]">Select Primary Unlock Method</p>
                        <div className="space-y-2">
                          {([
                            { id: 'biometrics', label: 'Device lock (Biometrics)', desc: 'Unlock with fingerprint or face recognition' },
                            { id: 'pin', label: 'Pin lock', desc: 'Unlock using a numeric PIN' },
                            { id: 'passphrase', label: 'Password (Passphrase)', desc: 'Unlock with your recovery phrase or master key' }
                          ] as const).map(option => {
                            const isSelected = settings.appLockMethod === option.id;
                            return (
                              <button key={option.id}
                                onClick={() => {
                                  if (option.id === 'pin' && !settings.pinHash) {
                                    showToast('Please set up a PIN in the section below first.', 'error');
                                    return;
                                  }
                                  setSettings(prev => ({ ...prev, appLockMethod: option.id }));
                                }}
                                className={`w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between ${
                                  isSelected ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/5 text-white' : 'border-white/10 bg-white/5 text-[#8e90a2] hover:text-white'
                                }`}>
                                <div>
                                  <div className="font-semibold text-xs">{option.label}</div>
                                  <div className="text-[10px] text-[#8e90a2] mt-0.5">{option.desc}</div>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-[var(--color-accent)]" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Screenshot Protection Toggle */}
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/8">
                      <div>
                        <p className="text-sm font-semibold text-white">Prevent Screenshots</p>
                        <p className="text-xs text-[#8e90a2] mt-0.5">Protect vault by disabling native screenshots & video capture</p>
                      </div>
                      <button onClick={() => setSettings(prev => ({ ...prev, screenshotProtection: !prev.screenshotProtection }))}
                        className={`relative w-10 h-6 rounded-full transition-colors ${settings.screenshotProtection !== false ? 'bg-[var(--color-accent)]' : 'bg-white/10'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.screenshotProtection !== false ? 'left-5' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── SUPPORT ────────────────────────────────────────────────── */}
            {activeTag === 'support' && (
              <motion.div key="support" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl space-y-6 animate-fade-in">
                <div className="glass-panel p-6 rounded-2xl border border-white/8 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)]">
                      <Mail className="w-5 h-5" />
                    </div>
                    <h3 className="font-display text-base font-semibold text-white">Contact Support</h3>
                  </div>
                  <p className="text-xs text-[#c4c5d9] leading-relaxed">Need help with account recovery, QR scanning, or backup restore? Send us a message.</p>
                  {supportSuccess ? (
                    <div className="p-6 text-center bg-green-950/10 border border-green-500/15 rounded-2xl space-y-2">
                      <Check className="w-7 h-7 text-green-400 mx-auto" />
                      <h4 className="font-semibold text-white text-sm">Message Sent</h4>
                      <p className="text-xs text-[#8e90a2]">Sent to {supportEmail}. We'll get back to you soon.</p>
                      <button onClick={() => setSupportSuccess(false)} className="text-xs text-[var(--color-accent)] underline font-semibold mt-1">Send another</button>
                    </div>
                  ) : (
                    <form onSubmit={handleSendSupport} className="space-y-3 pt-1">
                      <input type="text" required value={supportSubject} onChange={e => setSupportSubject(e.target.value)} placeholder="Subject"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/50 transition-all" />
                      <textarea required rows={4} value={supportMessage} onChange={e => setSupportMessage(e.target.value)} placeholder="Describe your issue..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/50 transition-all" />
                      <button type="submit" disabled={isSupportSending}
                        className="w-full py-3 bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white font-semibold text-xs rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50">
                        {isSupportSending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending...</> : <><Mail className="w-4 h-4" /> Send Message</>}
                      </button>
                    </form>
                  )}
                </div>

                {/* Chat assistant */}
                <div className="glass-panel p-5 rounded-2xl border border-white/8 space-y-3">
                  <h4 className="text-xs uppercase tracking-widest text-[#8e90a2] font-semibold">Help Assistant</h4>
                  <div className="h-36 overflow-y-auto space-y-2.5 bg-black/30 p-3 rounded-xl border border-white/8 font-mono text-[11px] text-[#8e90a2]">
                    {chatMessages.map((m, i) => (
                      <div key={`msg-${m.sender}-${m.time}-${m.text}`} className={m.sender === 'user' ? 'text-white text-right' : 'text-[var(--color-accent)]'}>
                        <span className="text-[9px] opacity-40 mr-1">{m.time}</span>
                        <strong>{m.sender === 'user' ? 'You: ' : 'Only Auth: '}</strong>
                        <span>{m.text}</span>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendCommand} className="flex gap-2">
                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask a question..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/50 transition-all" />
                    <button type="submit" className="text-xs bg-[var(--color-accent)] text-black px-4 py-2 rounded-xl font-semibold">Ask</button>
                  </form>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Floating Add Account button for small screens */}
        {isVaultTab && (
          <button
            onClick={openAddModal}
            className="sm:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[var(--color-accent)] text-black flex items-center justify-center shadow-[0_4px_20px_rgba(0,220,229,0.3)] hover:scale-110 active:scale-95 transition-all duration-150 ease-out z-40 cursor-pointer"
            aria-label="Add account"
          >
            <Plus className="w-7 h-7 stroke-[3px]" />
          </button>
        )}
      </main>

      {/* ── ADD / EDIT MODAL ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl glass-panel rounded-3xl p-6 border border-white/8 max-h-[90vh] overflow-y-auto relative">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-display text-lg font-semibold text-white">{editingAccount ? 'Edit Account' : 'Add Account'}</h3>
                <button onClick={() => { setIsAddModalOpen(false); stopCameraScan(); }} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-[#c4c5d9] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Large Brand Icon Preview at the top with circular White Edit Pencil overlay */}
              <div className="flex flex-col items-center justify-center mb-6 relative">
                <div className="relative cursor-pointer group" onClick={() => setShowIconPicker(true)}>
                  <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl relative overflow-hidden">
                    <BrandLogo name={formName || "New Account"} logoType={formLogoType} className="w-14 h-14 text-2xl" />
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setShowIconPicker(v => !v); }}
                    className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-white text-black border border-white flex items-center justify-center shadow-lg hover:scale-105 transition-all">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-[10px] uppercase font-bold text-[#8e90a2] mt-2">Select Brand Icon</span>

                {/* Brand icons selection popover — searchable full library */}
                {showIconPicker && (
                  <div className="absolute top-24 z-20 w-72 bg-[#161616] border border-white/10 rounded-2xl shadow-2xl animate-fade-in flex flex-col" style={{ maxHeight: '340px' }}>
                    {/* Search header */}
                    <div className="p-3 border-b border-white/8 flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-[#8e90a2] shrink-0" />
                      <input
                        ref={iconSearchInputRef}
                        type="text"
                        placeholder="Search 490+ icons..."
                        value={iconSearchQuery}
                        onChange={e => {
                          const value = e.target.value;
                          setIconSearchQuery(value);
                          setIconSearchResults(searchBrandCatalog(value));
                        }}
                        className="flex-1 bg-transparent text-xs text-white placeholder-[#8e90a2] focus:outline-none"
                      />
                      {iconSearchQuery && (
                        <button type="button" onClick={() => { setIconSearchQuery(''); setIconSearchResults([]); }}
                          className="text-[#8e90a2] hover:text-white transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Results grid */}
                    <div className="overflow-y-auto p-2 flex-1">
                      {iconSearchQuery.trim() === '' ? (
                        // Default quick-picks when no search
                        <>
                          <p className="text-[9px] uppercase tracking-widest text-[#8e90a2] px-1 pb-1.5">Quick picks</p>
                          <div className="grid grid-cols-5 gap-1.5">
                            {(['custom','google','github','discord','slack','proton','stripe','amazon','microsoft','cloudflare','vercel','apple','twitter','facebook','notion'] as const).map(id => (
                              <button key={id} type="button"
                                onClick={() => { setFormLogoType(id); setShowIconPicker(false); setIconSearchQuery(''); }}
                                className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all hover:bg-white/5 ${
                                  formLogoType === id ? 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/5' : 'border-transparent'
                                }`}>
                                <div className="w-8 h-8 flex items-center justify-center rounded-lg">
                                  <BrandLogo name={id} logoType={id} className="w-6 h-6 text-[9px]" />
                                </div>
                                <span className="text-[7px] text-[#c4c5d9] font-medium truncate w-full text-center capitalize">{id}</span>
                              </button>
                            ))}
                          </div>
                          <p className="text-[9px] text-[#8e90a2] px-1 pt-2 pb-0.5">Type to search all 490+ icons</p>
                        </>
                      ) : iconSearchResults.length === 0 ? (
                        <div className="py-6 text-center">
                          <p className="text-xs text-[#8e90a2]">No icons found for &ldquo;{iconSearchQuery}&rdquo;</p>
                          <button type="button" onClick={() => { setFormLogoType('custom'); setShowIconPicker(false); setIconSearchQuery(''); }}
                            className="mt-2 text-[10px] text-[var(--color-accent)] hover:underline">Use generic icon</button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-5 gap-1.5">
                          {iconSearchResults.map(({ slug, title }) => (
                            <button key={slug} type="button"
                              onClick={() => { setFormLogoType(slug); setShowIconPicker(false); setIconSearchQuery(''); }}
                              title={title}
                              className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all hover:bg-white/5 ${
                                formLogoType === slug ? 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/5' : 'border-transparent'
                              }`}>
                              <div className="w-8 h-8 flex items-center justify-center rounded-lg">
                                <BrandLogo name={title} logoType={slug} className="w-6 h-6 text-[9px]" />
                              </div>
                              <span className="text-[7px] text-[#c4c5d9] font-medium truncate w-full text-center">{title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* QR Camera */}
              <div className="mb-5">
                {isCameraActive ? (
                  <div className="space-y-3 bg-black/50 p-4 rounded-2xl border border-[var(--color-accent)]/30">
                    <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-[#0e0e0e] border border-white/10 flex flex-col items-center justify-center">
                      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 border-[5px] border-[var(--color-accent)]/25 m-8 rounded-lg pointer-events-none border-dashed" />
                      <Camera className="w-7 h-7 text-[var(--color-accent)] relative z-10" />
                      <p className="text-xs text-white relative z-10 mt-2 font-mono bg-black/60 px-3 py-1 rounded">{cameraStatus}</p>
                    </div>
                    <div className="flex gap-2 justify-center">
                      <button type="button" onClick={injectScannedQRResult}
                        className="text-xs bg-[var(--color-accent)] text-black font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5">
                        Use Sample Key
                      </button>
                      <button type="button" onClick={stopCameraScan} className="text-xs bg-white/10 text-white px-4 py-2 rounded-xl">Stop</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={startCameraScan}
                    className="w-full py-3 rounded-xl bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/20 hover:border-[var(--color-accent)]/40 text-xs text-[var(--color-accent)] flex items-center justify-center gap-2 font-semibold transition-all">
                    <Camera className="w-4 h-4" /> Scan QR Code
                  </button>
                )}
              </div>

              <form onSubmit={e => {
                e.preventDefault();
                if (editingAccount) {
                  // Verification REQUIRED for EDITING
                  triggerVerifyAction('save');
                } else {
                  // Direct save, NO verification for ADDING
                  saveAccountConfirmed();
                }
              }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">Issuer</label>
                    <input type="text" required value={formName} onChange={e => {
  const val = e.target.value;
  setFormName(val);
  if (val?.trim()) {
    const match = matchBrandFromCatalog(val.trim());
    if (match) setFormLogoType(match.slug);
  }
}} placeholder="e.g. GitHub"
                      className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/60 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">Account</label>
                    <input type="text" required value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="e.g. user@example.com"
                      className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/60 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-semibold text-[#8e90a2] flex justify-between">
                    <span>Secret</span>
                    <button type="button" onClick={handleGenerateSecret} className="text-[var(--color-accent)] hover:underline">Generate</button>
                  </label>
                  <div className="relative">
                    <input type={showSecret ? "text" : "password"} required value={formSecret} onChange={e => setFormSecret(e.target.value)} placeholder="e.g. JBSWY3DPEHPK3PXP"
                      className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-xs text-white font-mono uppercase focus:outline-none focus:border-[var(--color-accent)]/60 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]" />
                    <button type="button" onClick={handleToggleFormSecretVisibility} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8e90a2] hover:text-white transition-colors">
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">Tag</label>
                    <select value={formCategory} onChange={e => {
                      const val = e.target.value;
                      if (val === '__NEW_TAG__') {
                        setIsCreatingNewTagInModal(true);
                        setNewTagNameInModal('');
                      } else {
                        setFormCategory(val);
                        setIsCreatingNewTagInModal(false);
                      }
                    }}
                      className="w-full bg-[#1c1b1b] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/60 transition-all">
                      {settings.customTags
                        .filter(t => t.toLowerCase() !== 'hide' && t.toLowerCase() !== 'hidden')
                        .concat(isHiddenVaultActive ? ['hidden'] : [])
                        .map(t => <option key={t} value={t} className="bg-[#1c1b1b] text-white">{t}</option>)}
                      <option value="__NEW_TAG__" className="text-[var(--color-accent)] font-semibold">+ Add New Tag...</option>
                    </select>
                    {isCreatingNewTagInModal && (
                      <div className="mt-2 flex gap-2 animate-fade-in">
                        <input
                          type="text"
                          value={newTagNameInModal}
                          onChange={e => setNewTagNameInModal(e.target.value)}
                          placeholder="New tag..."
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-[10px] text-white focus:outline-none focus:border-[var(--color-accent)]/60 focus:bg-white/[0.08] transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const tag = newTagNameInModal.trim().toLowerCase();
                            if (!tag) return;
                            if (tag === 'hide' || tag === 'hidden') return;
                            if (settings.customTags.includes(tag)) {
                              setFormCategory(tag);
                              setIsCreatingNewTagInModal(false);
                              return;
                            }
                            setSettings(prev => ({ ...prev, customTags: [...prev.customTags, tag] }));
                            setFormCategory(tag);
                            setIsCreatingNewTagInModal(false);
                            showToast(`Tag "${tag}" created.`, 'success');
                          }}
                          className="px-2.5 py-1.5 bg-[var(--color-accent)] text-black text-[9px] font-bold rounded-lg hover:opacity-90 transition-opacity"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingNewTagInModal(false);
                            setFormCategory('personal');
                          }}
                          className="px-2.5 py-1.5 bg-white/10 text-white text-[9px] font-semibold rounded-lg hover:bg-white/15 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">Labels</label>
                    <input type="text" value={formTagsString} onChange={e => setFormTagsString(e.target.value)} placeholder="prod, core"
                      className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/60 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]" />
                  </div>
                </div>

                {/* Advanced Cryptographic Settings Grid */}
                <div className="grid grid-cols-3 gap-3 bg-white/5 p-3.5 rounded-xl border border-white/8">
                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase font-bold text-[#8e90a2] tracking-wider block">Algorithm</label>
                    <select
                      value={formAlgorithm}
                      onChange={e => setFormAlgorithm(e.target.value as 'SHA1' | 'SHA256' | 'SHA512')}
                      className="w-full bg-[#1c1b1b] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/60"
                    >
                      <option value="SHA1">SHA-1 (Default)</option>
                      <option value="SHA256">SHA-256</option>
                      <option value="SHA512">SHA-512</option>
                    </select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase font-bold text-[#8e90a2] tracking-wider block">Period</label>
                    <select
                      value={formPeriod}
                      onChange={e => setFormPeriod(parseInt(e.target.value, 10))}
                      className="w-full bg-[#1c1b1b] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/60"
                    >
                      <option value={30}>30s (Default)</option>
                      <option value={60}>60s</option>
                    </select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase font-bold text-[#8e90a2] tracking-wider block">Digits</label>
                    <select
                      value={formDigits}
                      onChange={e => setFormDigits(parseInt(e.target.value, 10))}
                      className="w-full bg-[#1c1b1b] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/60"
                    >
                      <option value={6}>6 Digits (Default)</option>
                      <option value={8}>8 Digits</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">Key Rotation Reminder Date</label>
                  <input type="date" value={formNextRotationDate} onChange={e => setFormNextRotationDate(e.target.value)}
                    className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/60 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]" />
                </div>

                <textarea rows={2} value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Notes (optional)"
                  className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/60 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]" />

                <label className="flex items-center gap-2.5 bg-white/5 p-3 rounded-xl border border-white/8 cursor-pointer">
                  <input type="checkbox" checked={formIsPinned} onChange={e => setFormIsPinned(e.target.checked)} className="rounded border-white/20 text-[var(--color-accent)] focus:ring-[var(--color-accent)] bg-transparent" />
                  <span className="text-xs text-[#c4c5d9]">Pin this account for quick access</span>
                </label>

                <div className="flex gap-3 justify-end pt-1 border-t border-white/8">
                  <button type="button" onClick={() => { setIsAddModalOpen(false); stopCameraScan(); }} className="px-4 py-2.5 text-xs text-[#8e90a2] hover:text-white font-semibold">Cancel</button>
                  {editingAccount && (
                    <button type="button" onClick={() => triggerVerifyAction('delete', editingAccount.id)}
                      className="px-4 py-2.5 text-xs bg-red-950/20 text-red-400 border border-red-500/20 rounded-xl font-semibold hover:bg-red-950/40 transition-all">
                      Delete
                    </button>
                  )}
                  <button type="submit" className="px-5 py-2.5 text-xs bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-150 ease-out">
                    {editingAccount ? 'Save Changes' : 'Add Account'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── GHOST MODE HIDDEN VAULT SETUP MODAL ───────────────────────── */}
      <AnimatePresence>
        {showHiddenSetupModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md glass-panel rounded-2xl p-6 border border-amber-500/20 relative">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-white text-base">Setup Ghost Vault</h3>
                  <p className="text-[10px] text-[#8e90a2] tracking-wider uppercase font-mono">Secure Hidden Compartment</p>
                </div>
              </div>

              <p className="text-xs text-[#c4c5d9] mb-5 leading-relaxed">
                Ghost Mode creates an invisible category. Entering your custom passcode directly into the dashboard search bar instantly unseals these hidden accounts.
              </p>

              {/* Method Selector */}
              <div className="grid grid-cols-3 gap-2.5 mb-5">
                {(['pin', 'passphrase', 'biometrics'] as const).map(method => (
                  <button key={method} type="button" onClick={() => {
                    setHiddenVaultSetupMethod(method);
                    setHiddenVaultSetupInput('');
                    setHiddenVaultSetupConfirm('');
                    setHiddenVaultSetupError('');
                  }}
                    className={`py-2 px-1 rounded-xl border text-[10px] uppercase font-bold tracking-wider text-center transition-all ${
                      hiddenVaultSetupMethod === method ? 'border-amber-500/60 bg-amber-500/10 text-white' : 'border-white/10 bg-white/5 text-[#c4c5d9] hover:border-white/20'
                    }`}>
                    {method}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSetupHiddenVault} className="space-y-4">
                {hiddenVaultSetupMethod !== 'biometrics' ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">
                        {hiddenVaultSetupMethod === 'pin' ? 'Secret PIN' : 'Custom Passphrase'}
                      </label>
                      <input
                        type={hiddenVaultSetupMethod === 'pin' ? 'text' : 'password'}
                        required
                        pattern={hiddenVaultSetupMethod === 'pin' ? '\\d*' : undefined}
                        maxLength={hiddenVaultSetupMethod === 'pin' ? 8 : undefined}
                        value={hiddenVaultSetupInput}
                        onChange={e => setHiddenVaultSetupInput(e.target.value)}
                        placeholder={hiddenVaultSetupMethod === 'pin' ? 'e.g. 9999' : 'e.g. correct horse battery staple'}
                        className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">
                        Confirm {hiddenVaultSetupMethod === 'pin' ? 'PIN' : 'Passphrase'}
                      </label>
                      <input
                        type={hiddenVaultSetupMethod === 'pin' ? 'text' : 'password'}
                        required
                        pattern={hiddenVaultSetupMethod === 'pin' ? '\\d*' : undefined}
                        maxLength={hiddenVaultSetupMethod === 'pin' ? 8 : undefined}
                        value={hiddenVaultSetupConfirm}
                        onChange={e => setHiddenVaultSetupConfirm(e.target.value)}
                        placeholder={hiddenVaultSetupMethod === 'pin' ? 'Re-enter PIN' : 'Re-enter Passphrase'}
                        className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]"
                      />
                    </div>
                  </>
                ) : (
                  <div className="p-4 bg-white/5 border border-white/8 rounded-2xl text-center space-y-3">
                    <Fingerprint className="w-8 h-8 text-amber-400 mx-auto animate-pulse" />
                    <p className="text-[11px] text-[#c4c5d9] leading-relaxed">
                      Initialize with platform security lock. Your device fingerprint or system lock will verify credentials seamlessly.
                    </p>
                  </div>
                )}

                {hiddenVaultSetupError && (
                  <p className="text-xs text-red-400 font-mono bg-red-950/20 border border-red-500/20 px-3 py-1.5 rounded-lg">
                    {hiddenVaultSetupError}
                  </p>
                )}

                <div className="flex gap-3 justify-end pt-2 border-t border-white/8">
                  <button type="button" onClick={() => setShowHiddenSetupModal(false)}
                    className="px-4 py-2.5 text-xs text-[#8e90a2] hover:text-white font-semibold">
                    Cancel
                  </button>
                  <button type="submit"
                    className="px-5 py-2.5 text-xs bg-gradient-to-r from-amber-600 to-amber-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity">
                    {hiddenVaultSetupMethod === 'biometrics' ? 'Register & Setup' : 'Complete Setup'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PANIC / DURESS MODE SETUP MODAL ── */}
      <AnimatePresence>
        {showDuressSetup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel rounded-2xl p-6 border border-[var(--color-accent)]/20 relative">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent" />
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-[var(--color-accent)]" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-white text-base">Setup Duress PIN</h3>
                  <p className="text-[10px] text-[#8e90a2] tracking-wider uppercase font-mono">Emergency Silent Response</p>
                </div>
              </div>

              <p className="text-xs text-[#c4c5d9] mb-5 leading-relaxed">
                Configure a secondary 4-digit PIN. Entering this PIN at the lock screen triggers your chosen emergency action silently.
              </p>

              <form onSubmit={async (e) => {
                e.preventDefault();
                setDuressSetupError('');
                if (duressSetupPin.length < 4 || !/^\d+$/.test(duressSetupPin)) {
                  setDuressSetupError('PIN must be at least 4 digits (numbers only).');
                  return;
                }
                if (duressSetupPin !== duressSetupConfirm) {
                  setDuressSetupError("PINs don't match.");
                  return;
                }
                try {
                  const cred = await createAuthCredential(duressSetupPin, 'duress', settings.duressAction || 'fake');
                  const currentHashes = settings.authHashes || [];
                  const currentMetadata = settings.authMetadata || {};

                  setSettings(prev => ({ 
                    ...prev, 
                    authHashes: [...currentHashes, cred.hash],
                    authMetadata: { ...currentMetadata, [cred.hash]: cred.encMeta },
                    duressPinHash: 'fortified'
                  }));
                  setShowDuressSetup(false);
                  setDuressSetupPin('');
                  setDuressSetupConfirm('');
                  showToast('Duress PIN configured successfully.', 'success');
                } catch (err) { console.warn(err);
                  setDuressSetupError('Error deriving secure Argon2id hash.');
                }
              }} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">New Duress PIN</label>
                  <input
                    type="password"
                    pattern="\d*"
                    maxLength={8}
                    required
                    value={duressSetupPin}
                    onChange={e => setDuressSetupPin(e.target.value)}
                    placeholder="Enter 4-8 digit PIN"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/50 transition-all placeholder-[#8e90a2] font-mono text-center tracking-widest text-lg"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">Confirm PIN</label>
                  <input
                    type="password"
                    pattern="\d*"
                    maxLength={8}
                    required
                    value={duressSetupConfirm}
                    onChange={e => setDuressSetupConfirm(e.target.value)}
                    placeholder="Re-enter PIN"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/50 transition-all placeholder-[#8e90a2] font-mono text-center tracking-widest text-lg"
                  />
                </div>

                {duressSetupError && (
                  <p className="text-xs text-red-400 font-mono bg-red-950/20 border border-red-500/20 px-3 py-1.5 rounded-lg">
                    {duressSetupError}
                  </p>
                )}

                <div className="flex gap-3 justify-end pt-2 border-t border-white/8">
                  <button type="button" onClick={() => {
                    setShowDuressSetup(false);
                    setDuressSetupPin('');
                    setDuressSetupConfirm('');
                    setDuressSetupError('');
                  }} className="px-4 py-2.5 text-xs text-[#8e90a2] hover:text-white font-semibold">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-2.5 text-xs bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white font-semibold rounded-xl hover:opacity-90 transition-opacity">
                    Set Duress PIN
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── VERIFY MODAL ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isVerificationModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel rounded-2xl p-6 border border-[var(--color-accent)]/20">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
                <h3 className="font-display font-semibold text-white text-base">Verify Identity</h3>
              </div>
              <p className="text-xs text-[#c4c5d9] mb-4 leading-relaxed">Enter your master passphrase or master key to authorize this action.</p>
              <form onSubmit={handleConfirmVerification} className="space-y-3">
                <div className="relative">
                  <input ref={verificationInputRef} type={showVerificationInput ? 'text' : 'password'} required
                    value={verificationInput} onChange={e => setVerificationInput(e.target.value)}
                    placeholder="Master passphrase or master key"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--color-accent)]/50 transition-all pr-10" />
                  <button type="button" onClick={() => setShowVerificationInput(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8e90a2] hover:text-white transition-colors">
                    {showVerificationInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {verificationError && <p className="text-xs text-red-400 font-mono">{verificationError}</p>}
                <div className="flex gap-2 justify-end pt-1 border-t border-white/8">
                  <button type="button" onClick={() => { setIsVerificationModalOpen(false); setPendingAction(null); }} className="px-3 py-1.5 text-xs text-[#8e90a2] hover:text-white font-semibold">Cancel</button>
                  <button type="submit" className="px-5 py-1.5 text-xs bg-[var(--color-accent)] text-black font-semibold rounded-lg hover:opacity-90 transition-opacity">Confirm</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── CUSTOM CONFIRMATION MODAL ────────────────────────────────────── */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel rounded-2xl p-6 border border-white/5 space-y-4">
              <h3 className="font-display font-semibold text-white text-base">{confirmModal.title}</h3>
              <p className="text-xs text-[#c4c5d9] leading-relaxed">{confirmModal.message}</p>
              <div className="flex gap-3 justify-end pt-2 border-t border-white/8">
                <button onClick={() => setConfirmModal(null)} className="px-3 py-1.5 text-xs text-[#8e90a2] hover:text-white font-semibold">Cancel</button>
                <button onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }} className="px-3 py-1.5 text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg transition-colors">Confirm</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── EXPORT CONFIRMATION MODAL ────────────────────────────────────── */}
      <AnimatePresence>
        {isExportModalOpen && pendingExportFormat && (
          <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md glass-panel rounded-2xl p-6 border border-white/8">
              <div className="flex items-center gap-3 mb-4">
                <Download className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
                <h3 className="font-display font-semibold text-white text-base">Confirm Export</h3>
              </div>

              <div className="space-y-3 mb-5">
                <p className="text-xs text-[#c4c5d9] leading-relaxed">
                  You are about to export <span className="text-white font-semibold">{accounts.length}</span> account{accounts.length !== 1 ? 's' : ''} as a <span className="text-[var(--color-accent)] font-semibold">{pendingExportFormat === 'purified-json' ? 'Purified JSON' : pendingExportFormat === 'plain-text' ? 'URI Matrix (.txt)' : 'HTML Index'}</span> file.
                </p>

                <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-2">
                  <div className="flex justify-between text-xs"><span className="text-[#8e90a2]">Format</span><span className="text-white font-mono">{pendingExportFormat}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-[#8e90a2]">Accounts</span><span className="text-white font-mono">{accounts.length}</span></div>
                  {pendingExportFormat === 'purified-json' && (
                    <div className="flex justify-between text-xs"><span className="text-[#8e90a2]">Settings included</span><span className="text-white font-mono">Yes (hashes stripped)</span></div>
                  )}
                  {pendingExportFormat === 'html' && (
                    <div className="flex justify-between text-xs"><span className="text-[#8e90a2]">QR codes</span><span className="text-white font-mono">1 per account</span></div>
                  )}
                </div>

                <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-3">
                  <p className="text-[11px] text-amber-400/90 leading-relaxed">
                    <strong>⚠ Disclosure:</strong> This file contains plaintext TOTP secrets. Anyone with access can generate valid 2FA codes for your accounts. Keep it encrypted, transfer via secure channels only, and delete immediately after use. Only Auth does not store your export data.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-1 border-t border-white/8">
                <button type="button" onClick={() => { setIsExportModalOpen(false); setPendingExportFormat(null); }}
                  className="px-3 py-1.5 text-xs text-[#8e90a2] hover:text-white font-semibold">Cancel</button>
                <button type="button" onClick={() => {
                  setIsExportModalOpen(false);
                  triggerVerifyAction('export', pendingExportFormat);
                }} className="px-5 py-1.5 text-xs bg-[var(--color-accent)] text-black font-semibold rounded-lg hover:opacity-90 transition-opacity">
                  Continue & Verify
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MOCK WEBAUTHN / FIDO2 HARDWARE KEY REGISTRATION MODAL ── */}
      <AnimatePresence>
        {isWebAuthnRegistering && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel rounded-3xl p-6 border border-[var(--color-accent)]/20 flex flex-col items-center gap-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent" />
              
              <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)]">
                <Key className="w-6 h-6 animate-bounce" />
              </div>
              
              <div className="text-center space-y-1">
                <h3 className="font-display font-semibold text-white text-base">FIDO2 Hardware Key</h3>
                <p className="text-[10px] text-[#8e90a2] tracking-wider uppercase font-mono">WebAuthn Enrollment Simulator</p>
              </div>

              <div className="w-full space-y-4">
                <WebAuthnRegFlow 
                  keyName={webAuthnRegKeyName} 
                  onCancel={() => {
                    setIsWebAuthnRegistering(false);
                    setWebAuthnRegKeyName('');
                  }}
                  onComplete={(newKey: any) => {
                    setSettings(prev => ({ ...prev, securityKeys: [...prev.securityKeys, newKey] }));
                    setIsWebAuthnRegistering(false);
                    setWebAuthnRegKeyName('');
                    showToast(`Hardware Key "${newKey.name}" enrolled successfully.`, 'success');
                  }}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MOCK WEBAUTHN / FIDO2 HARDWARE KEY AUTHENTICATION MODAL ── */}
      <AnimatePresence>
        {isWebAuthnAuthenticating && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel rounded-3xl p-6 border border-[var(--color-accent)]/20 flex flex-col items-center gap-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent" />
              
              <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)]">
                <Key className="w-6 h-6 animate-pulse" />
              </div>
              
              <div className="text-center space-y-1">
                <h3 className="font-display font-semibold text-white text-base">FIDO2 Key Authentication</h3>
                <p className="text-[10px] text-[#8e90a2] tracking-wider uppercase font-mono">WebAuthn Verification Simulator</p>
              </div>

              <div className="w-full space-y-4">
                <WebAuthnAuthFlow 
                  onCancel={() => setIsWebAuthnAuthenticating(false)}
                  onComplete={() => {
                    setIsWebAuthnAuthenticating(false);
                    safeTransition(() => {
                      setIsLocked(false);
                      if (settings.pinAttempts > 0) {
                        setSettings(prev => ({ ...prev, pinAttempts: 0 }));
                      }
                    });
                    showToast('Vault successfully unlocked via FIDO2 Security Key.', 'success');
                  }}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MOCK BIOMETRIC SIMULATION MODAL ── */}
      <AnimatePresence>
        {isBiometricSimulating && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel rounded-3xl p-6 border border-[var(--color-accent)]/20 flex flex-col items-center gap-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent" />
              
              <div className="text-center space-y-1">
                <h3 className="font-display font-semibold text-white text-base">Biometric Verification</h3>
                <p className="text-[10px] text-[#8e90a2] tracking-wider uppercase font-mono">Mock Device Authenticator</p>
              </div>

              <div className="w-full space-y-4">
                <BiometricsFlow 
                  onCancel={() => setIsBiometricSimulating(false)}
                  onComplete={() => {
                    setIsBiometricSimulating(false);
                    safeTransition(() => {
                      setIsLocked(false);
                      if (settings.pinAttempts > 0) {
                        setSettings(prev => ({ ...prev, pinAttempts: 0 }));
                      }
                    });
                    showToast('Vault successfully unlocked via Biometrics.', 'success');
                  }}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* ── CONFIRM MODAL ── */}
      <AnimatePresence>
        {confirmModal?.isOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-[#0a0a0a] rounded-3xl p-6 border border-white/5 flex flex-col items-center gap-5 relative overflow-hidden">
              <div className="text-center space-y-2">
                <h3 className="font-display font-semibold text-white text-base">Confirm Action</h3>
                <p className="text-xs text-[#8e90a2] leading-relaxed">{confirmModal.message}</p>
              </div>
              <div className="flex gap-3 w-full mt-2">
                <button type="button" onClick={() => setConfirmModal(null)}
                  className="flex-1 py-2 text-xs font-semibold text-[#8e90a2] hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={confirmModal.onConfirm}
                  className="flex-1 py-2 text-xs font-semibold text-black bg-[var(--color-accent)] hover:opacity-90 rounded-xl transition-opacity">
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── TOAST NOTIFICATIONS ──────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl max-w-[320px] ${
                toast.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/30'
                  : toast.type === 'error'
                  ? 'bg-red-950/60 border-red-500/30'
                  : 'bg-[#0a0a0a]/80 border-white/10'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                toast.type === 'success' ? 'bg-emerald-400' : toast.type === 'error' ? 'bg-red-400' : 'bg-[var(--color-accent)]'
              }`} />
              <p className={`text-xs leading-relaxed ${
                toast.type === 'success' ? 'text-emerald-100' : toast.type === 'error' ? 'text-red-200' : 'text-[#c4c5d9]'
              }`}>{toast.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
