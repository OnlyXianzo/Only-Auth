import React, { useState, useEffect, useRef, FormEvent, ChangeEvent, useCallback } from 'react';
import {
  Lock, Shield, Search, Plus, LockOpen, Briefcase,
  Edit3, Copy, Trash2, Pin, Check, X, ShieldCheck,
  Settings as SettingsIcon, RefreshCw, LogOut, AlertTriangle,
  Fingerprint, Download, Upload, Info, Camera, Layers, Key,
  ChevronRight, Mail, Eye, EyeOff, Menu, ZoomIn, ZoomOut,
  HelpCircle, Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import StarfieldBackground from './components/StarfieldBackground';
import { Account, AppSettings } from './types';
import {
  formatCode, formatFocusedCode,
  SERVICE_COLORS, getSecurityStrength,
  generateBatchTOTP, validateBase32, generateNewSecret,
  loadVaultData, saveVaultData,
  argon2idHash, argon2idVerify, secureCompare,
  encryptBackup, decryptBackup, writeAuditLog, readAuditLogs,
  setWindowScreenshotProtection, encryptMetadata, decryptMetadata, BatchInput
} from './utils';

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

function randomWord(): string {
  return BIP39_WORDS[Math.floor(Math.random() * BIP39_WORDS.length)];
}

function generatePassphrase(wordCount: 12 | 18 | 24): string[] {
  return Array.from({ length: wordCount }, () => randomWord());
}

function generateMasterKey(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createAuthCredential(enteredInput: string, type: 'pin' | 'passphrase' | 'masterKey' | 'duress', action?: 'wipe' | 'fake') {
  const hash = await argon2idHash(enteredInput);
  const keyMaterial = await sha256(enteredInput + "OnlyAuthMetadataDerivationSalt2026");
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

// ─── Brand Logo Component with SVG/PNG Try-and-Fallback ───────────────────────
interface BrandLogoProps {
  name: string;
  logoType: string;
  className?: string;
}

function BrandLogo({ name, logoType, className = "w-10 h-10 text-xs" }: BrandLogoProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [failedSvg, setFailedSvg] = useState(false);
  const [failedPng, setFailedPng] = useState(false);

  useEffect(() => {
    setFailedSvg(false);
    setFailedPng(false);
    if (!logoType || logoType === 'custom') {
      setImgSrc(null);
    } else {
      setImgSrc(`/brands/${logoType}.svg`);
    }
  }, [logoType]);

  const handleError = () => {
    if (!failedSvg) {
      setFailedSvg(true);
      setImgSrc(`/brands/${logoType}.png`);
    } else if (!failedPng) {
      setFailedPng(true);
      setImgSrc(null);
    }
  };

  const abbreviation = getLogoAbbreviation(name, logoType);
  const colors = getServiceColors(logoType);

  if (imgSrc) {
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
};

// Helper for Bitwarden URI parsing
function extractSecretFromURI(uri: string): string | null {
  if (!uri) return null;
  const match = uri.match(/[?&]secret=([A-Z2-7]+)/i);
  if (match && match[1]) return match[1].toUpperCase();
  if (/^[A-Z2-7]{8,}$/i.test(uri.trim())) return uri.trim().toUpperCase();
  return null;
}

// ─── Toast Notification System ──────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info';
interface Toast { id: string; message: string; type: ToastType; }

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = (message: string, type: ToastType = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3800);
  };
  // ── Persistent state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isAccountsLoaded, setIsAccountsLoaded] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('onlyauth_settings_v3');
    if (saved) { try { const p = JSON.parse(saved); if (p && typeof p === 'object') return { ...DEFAULT_SETTINGS, ...p }; } catch {} }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    const bootData = async () => {
      const saved = await loadVaultData();
      setAccounts(saved);
      setIsAccountsLoaded(true);
      // Enable native desktop screenshot/capture prevention
      await setWindowScreenshotProtection(true);
    };
    bootData();
  }, []);

  useEffect(() => { 
    if (isAccountsLoaded) {
      saveVaultData(accounts);
    }
  }, [accounts, isAccountsLoaded]);
  useEffect(() => { localStorage.setItem('onlyauth_settings_v3', JSON.stringify(settings)); }, [settings]);

  // ── Auth state
  const isFirstRun = !settings.passphraseHash;
  const [isLocked, setIsLocked] = useState(true);

  // ── Mobile Responsive & UX State Variables
  const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState<boolean>(false);
  const [isCreatingNewTagInModal, setIsCreatingNewTagInModal] = useState<boolean>(false);
  const [newTagNameInModal, setNewTagNameInModal] = useState<string>('');

  // ── Blur Protection & Inactivity Auto-Lock States
  const [isWindowBlurred, setIsWindowBlurred] = useState<boolean>(false);
  const [isFakeVaultActive, setIsFakeVaultActive] = useState<boolean>(false);
  const [backupPassword, setBackupPassword] = useState<string>('');
  const [importBackupData, setImportBackupData] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<string[]>([]);
  const [decryptedLogKeyHex, setDecryptedLogKeyHex] = useState<string>('');
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
    } catch {}
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
      showToast(`Isolated Compartment initialized. Type passcode in the search bar to unlock.`, 'success');
    } catch (err) {
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
  const [showSetupKey, setShowSetupKey] = useState(false);

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

  // Check biometrics support
  useEffect(() => {
    if (window.PublicKeyCredential && window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(r => setBiometricsSupported(r))
        .catch(() => setBiometricsSupported(false));
    }
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

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    // Tauri-native focus change listener wrapping
    let unlistenBlur: any;
    let unlistenFocus: any;
    const setupTauriListeners = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        unlistenBlur = await win.onBlur(handleBlur);
        unlistenFocus = await win.onFocus(handleFocus);
      } catch {}
    };
    setupTauriListeners();

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
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
  const [secondsRemaining, setSecondsRemaining] = useState(30);
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
  const [verificationInput, setVerificationInput] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'save' | 'delete' | 'update-passphrase' | 'update-pin' | 'update-masterkey'; data?: any } | null>(null);
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
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const formSecretRef = useRef<string>('');

  // Sync the ref whenever formSecret state changes — survives modal transitions
  useEffect(() => { formSecretRef.current = formSecret; }, [formSecret]);
  
  // Icon Picker state
  const [showIconPicker, setShowIconPicker] = useState(false);

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
      setTimeout(() => setIsTransitioning(false), 50);
    }
  }, [isTransitioning]);

  // ── MEMORY SCRUBBING & RAM CLEARDOWN ──
  // Scrub views/modals secrets whenever active views, lock states, or modals toggle
  useEffect(() => {
    return () => {
      setUnlockInput("");
      setVerificationInput("");
      setFormSecret("");
    };
  }, [activeTag, isLocked, isAddModalOpen, setupStep]);

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

  // ── Timer
  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const interval = settings.autoRenewInterval || 60;
      setSecondsRemaining(interval - (now % interval));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [settings.autoRenewInterval]);

  // ── Batched TOTP codes from Rust backend
  const [totpCodes, setTotpCodes] = useState<Record<string, string>>({});
  const [totpLoading, setTotpLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    const updateTokens = async () => {
      const allAccounts = accounts.filter(a => a.secret && a.secret.trim() !== '');
      if (allAccounts.length === 0) {
        if (isCurrent) { setTotpCodes({}); setTotpLoading(false); }
        return;
      }
      const batchPayload: BatchInput[] = allAccounts.map(acc => ({
        id: acc.id,
        secret: acc.secret,
        digits: acc.digits ?? 6,
        period: acc.period ?? 30,
        algorithm: acc.algorithm || 'SHA1',
      }));
      const freshCodes = await generateBatchTOTP(batchPayload);
      if (isCurrent) {
        setTotpCodes(freshCodes);
        setTotpLoading(false);
      }
    };
    updateTokens();
    return () => { isCurrent = false; };
  }, [secondsRemaining, accounts]);

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
              const keyMaterial = await sha256(input + "OnlyAuthMetadataDerivationSalt2026");
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
        if (settings.duressPassphraseHash && await argon2idVerify(settings.duressPassphraseHash, input)) {
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
        const cred = await createAuthCredential(input, matchedType === 'duress' ? 'duress' : matchedType, matchedType === 'duress' ? duressAction || 'fake' : undefined);
        const currentHashes = settings.authHashes || [];
        const currentMetadata = settings.authMetadata || {};
        
        upgradedSettings = {
          authHashes: [...currentHashes, cred.hash],
          authMetadata: { ...currentMetadata, [cred.hash]: cred.encMeta }
        };
      }

      if (matchedType === 'duress') {
        await writeAuditLog(`DURESS AUTHENTICATION ENCOUNTERED (${method.toUpperCase()})`, undefined);
        safeTransition(() => {
          if (duressAction === 'wipe') {
            setAccounts(prev => prev.map(a => {
              const isHidden = a.category.toLowerCase() === 'hide' || a.category.toLowerCase() === 'hidden';
              return isHidden ? { ...a, secret: '••••••••', category: 'personal' } : a;
            }));
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
        const derivedKeyHex = await sha256(input + "OnlyAuthAuditLogSalt2026");
        setDecryptedLogKeyHex(derivedKeyHex);
        await writeAuditLog(`Vault unlocked successfully (${matchedType})`, derivedKeyHex);

        safeTransition(() => {
          setIsLocked(false);
          setUnlockError('');
          setUnlockInput('');
          setSettings(prev => ({ 
            ...prev, 
            ...upgradedSettings, 
            pinAttempts: 0 
          }));
        });
      }
      return true;
    } else {
      // FAILED MATCH!
      const nextAttempts = settings.pinAttempts + 1;
      const delayMs = Math.min(1000 * Math.pow(2, nextAttempts - 1), 16000);
      await new Promise(r => setTimeout(r, delayMs));

      await writeAuditLog(`Failed ${method} unlock attempt. Count: ${nextAttempts}`, undefined);

      safeTransition(() => {
        setSettings(prev => ({ ...prev, pinAttempts: nextAttempts }));
        if (method === 'pin' && nextAttempts >= 5) {
          setUnlockError('PIN locked out due to 5 failed attempts. Master passphrase required.');
          setUnlockMethod('passphrase');
        } else {
          setUnlockError(`Incorrect ${method}. Attempt ${nextAttempts}.`);
        }
        setUnlockInput('');
      });
      return false;
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
  }, [isLocked, settings.forceSearchOnStartup]);

  // ── PIN auto-submission
  useEffect(() => {
    if (isLocked && unlockMethod === 'pin' && unlockInput.length === 4) {
      const triggerUnlock = async () => {
        await verifyAndUnlock(unlockInput, 'pin');
      };
      triggerUnlock();
    }
  }, [unlockInput, unlockMethod, isLocked, settings.authHashes, settings.pinHash, settings.duressPinHash]);

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
    setSetupStep('reveal-keys');
  });

  const handleRevealContinue = () => safeTransition(() => {
    setSetupStep('set-pin');
  });

  const handleFinishSetup = async (skipPin = false) => {
    const phrase = setupWords.join(' ');
    if (!skipPin && setupPin.trim().length >= 4) {
      if (setupPin !== setupPinConfirm) {
        setSetupPinError("PINs don't match.");
        return;
      }
    }

    // 1. Create credentials for Zero-Knowledge multi-hash array
    const passphraseCred = await createAuthCredential(phrase, 'passphrase');
    const masterKeyCred = await createAuthCredential(setupMasterKey, 'masterKey');

    const hashes = [passphraseCred.hash, masterKeyCred.hash];
    const metadata = {
      [passphraseCred.hash]: passphraseCred.encMeta,
      [masterKeyCred.hash]: masterKeyCred.encMeta
    };

    if (!skipPin && setupPin.trim().length >= 4) {
      const pinCred = await createAuthCredential(setupPin.trim(), 'pin');
      hashes.push(pinCred.hash);
      metadata[pinCred.hash] = pinCred.encMeta;
    }

    const derivedKeyHex = await sha256(phrase + "OnlyAuthAuditLogSalt2026");
    setDecryptedLogKeyHex(derivedKeyHex);
    await writeAuditLog('Vault setup completed with hardened Argon2id KDF', derivedKeyHex);

    safeTransition(() => {
      setSettings(prev => ({ 
        ...prev, 
        authHashes: hashes, 
        authMetadata: metadata,
        passphraseHash: '', // Clear legacy hashes
        masterKeyHash: '',
        pinHash: '',
        pinAttempts: 0 
      }));
      setIsLocked(false);
      // Clean up sensitive setup memories
      setSetupWords([]);
      setSetupMasterKey("");
      setSetupPin("");
      setSetupPinConfirm("");
    });
  };

  // ── Trigger biometrics automatically if active
  useEffect(() => {
    if (isLocked && settings.appLockEnabled && settings.appLockMethod === 'biometrics' && unlockMethod === 'biometrics') {
      const timer = setTimeout(() => {
        handleBiometricUnlock();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLocked, settings.appLockEnabled, settings.appLockMethod, unlockMethod]);

  // ── Unlock handlers
  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    const input = unlockInput.trim();
    if (!input) return;
    await verifyAndUnlock(input, unlockMethod === 'pin' ? 'pin' : 'passphrase');
  };

  const handleBiometricUnlock = async () => {
    setUnlockError('');
    try {
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          timeout: 60000,
          userVerification: 'required',
          rpId: window.location.hostname || 'localhost',
        }
      } as CredentialRequestOptions);
      if (credential) {
        safeTransition(() => {
          setIsLocked(false);
          if (settings.pinAttempts > 0) {
            setSettings(prev => ({ ...prev, pinAttempts: 0 }));
          }
        });
      } else {
        setUnlockError('Biometric verification failed. Falling back to PIN.');
        setUnlockMethod('pin');
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setUnlockError('Biometric denied or cancelled. Falling back to PIN.');
      } else {
        setUnlockError('Biometrics not available. Falling back to PIN.');
      }
      setUnlockMethod('pin');
    }
  };

  // ── Account CRUD
  const openAddModal = () => safeTransition(() => {
    setEditingAccount(null);
    setFormName(''); setFormEmail(''); setFormSecret(''); setShowSecret(false);
    formSecretRef.current = '';
    setFormNotes(''); setFormCategory(activeTag === 'all' ? 'personal' : activeTag);
    setFormIsPinned(false); setFormLogoType('custom'); setFormTagsString('');
    setFormDigits(6); setFormPeriod(30); setFormAlgorithm('SHA1');
    setShowIconPicker(false);
    setIsAddModalOpen(true);
  });

  const openEditModal = (account: Account) => safeTransition(() => {
    setEditingAccount(account);
    setFormName(account.name); setFormEmail(account.email); setFormSecret('••••••••'); setShowSecret(false);
    formSecretRef.current = account.secret;
    setFormNotes(account.notes); setFormCategory(account.category);
    setFormIsPinned(account.isPinned); setFormLogoType(account.logoType);
    setFormTagsString(account.tags?.join(', ') || '');
    setFormDigits(account.digits || 6);
    setFormPeriod(account.period || 30);
    setFormAlgorithm(account.algorithm || 'SHA1');
    setShowIconPicker(false);
    setIsAddModalOpen(true);
  });

  const handleGenerateSecret = async () => {
    const secret = await generateNewSecret();
    if (secret) setFormSecret(secret);
  };

  const handleToggleFormSecretVisibility = () => {
    if (showSecret) {
      if (editingAccount) {
        setFormSecret('••••••••');
      }
      setShowSecret(false);
    } else {
      if (editingAccount) {
        setFormSecret(editingAccount.secret || formSecretRef.current);
      }
      setShowSecret(true);
    }
  };

  const triggerVerifyAction = (type: 'save' | 'delete' | 'update-passphrase' | 'update-pin' | 'update-masterkey' | 'update-partition-settings' | 'disable-partition', data?: any) => safeTransition(() => {
    setPendingAction({ type, data });
    setVerificationInput('');
    setVerificationError('');
    setIsVerificationModalOpen(true);
  });

  const handleConfirmVerification = async (e: FormEvent) => {
    e.preventDefault();
    const input = verificationInput.trim();
    const hash = await sha256(input);
    const valid = hash === settings.passphraseHash || hash === settings.masterKeyHash;
    if (valid) {
      safeTransition(() => {
        if (pendingAction?.type === 'save') {
          saveAccountConfirmed();
        } else if (pendingAction?.type === 'delete') {
          deleteAccountConfirmed(pendingAction.data);
        } else if (pendingAction?.type === 'update-passphrase') {
          sha256(pendingAction.data.newPassphrase).then(newHash => {
            setSettings(prev => ({ ...prev, passphraseHash: newHash }));
            setNewPassphraseWords([]);
            showToast('Passphrase updated. Use your new passphrase to unlock.', 'success');
          });
        } else if (pendingAction?.type === 'update-pin') {
          sha256(pendingAction.data.newPin).then(newHash => {
            setSettings(prev => ({ ...prev, pinHash: newHash, pinAttempts: 0 }));
            setNewPinField('');
            setNewPinConfirm('');
            showToast('PIN updated successfully.', 'success');
          });
        } else if (pendingAction?.type === 'update-masterkey') {
          sha256(pendingAction.data.newKey).then(newHash => {
            setSettings(prev => ({ ...prev, masterKeyHash: newHash }));
            setNewMasterKeyField('');
            showToast('Master Key updated successfully.', 'success');
          });
        } else if (pendingAction?.type === 'update-partition-settings') {
          const { method, passcode } = pendingAction.data;
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
      setVerificationError('Incorrect current passphrase or master key.');
    }
  };

  const saveAccountConfirmed = () => {
    const parsedTags = formTagsString.split(',').map(t => t.trim()).filter(Boolean);
    let resolvedSecret = formSecret || formSecretRef.current;
    if (resolvedSecret === '••••••••' && editingAccount) {
      resolvedSecret = editingAccount.secret;
    }
    const sanitizedSecret = resolvedSecret.trim().toUpperCase();
    if (editingAccount) {
      const updated = accounts.map(acc => acc.id === editingAccount.id
        ? { 
            ...acc, name: formName, email: formEmail, secret: sanitizedSecret, notes: formNotes, 
            category: formCategory, isPinned: formIsPinned, logoType: formLogoType, tags: parsedTags,
            digits: formDigits, period: formPeriod, algorithm: formAlgorithm
          }
        : acc
      );
      setAccounts(updated);
      saveVaultData(updated);
    } else {
      const newAcc: Account = {
        id: `acc-${Date.now()}`, name: formName, email: formEmail, secret: sanitizedSecret,
        notes: formNotes || `2FA account for ${formName}`, category: formCategory,
        isPinned: formIsPinned, logoType: formLogoType, tags: parsedTags,
        createdAt: new Date().toISOString(),
        digits: formDigits,
        period: formPeriod,
        algorithm: formAlgorithm
      };
      const updated = [newAcc, ...accounts];
      setAccounts(updated);
      setFocusedAccountId(newAcc.id);
      saveVaultData(updated);
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

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, isPinned: !a.isPinned } : a));
  };

  // ── Camera
  const startCameraScan = async () => {
    setIsCameraActive(true);
    setCameraStatus('Requesting camera...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setCameraStatus('Point camera at the QR code.');
    } catch {
      setCameraStatus('No camera found. Use sample key below.');
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
    if (!confirm(`Remove tag "${tag}"? Accounts will move to "personal".`)) return;
    setAccounts(prev => prev.map(a => a.category === tag ? { ...a, category: 'personal' } : a));
    setSettings(prev => ({ ...prev, customTags: prev.customTags.filter(t => t !== tag) }));
    if (activeTag === tag) setActiveTag('all');
  };

  // ── Security keys
  const registerSecurityKey = (e: FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    const key = { id: `key-${Date.now()}`, name: newKeyName, keyType: 'FIDO2 WebAuthn', addedAt: new Date().toISOString() };
    setSettings(prev => ({ ...prev, securityKeys: [...prev.securityKeys, key] }));
    setNewKeyName(''); setIsAddingHardwareKey(false);
  };
  const deleteSecurityKey = (id: string) => {
    setSettings(prev => ({ ...prev, securityKeys: prev.securityKeys.filter(k => k.id !== id) }));
  };

  // ── Backup / Import & Export
  const handleDownloadBackup = () => {
    const blob = new Blob([JSON.stringify({ accounts, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `OnlyAuth_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setSettings(prev => ({ ...prev, lastBackupDate: new Date().toISOString() }));
  };

  const handleUploadBackup = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        safeTransition(() => {
          if (parsed?.accounts) setAccounts(parsed.accounts);
          if (parsed?.settings) setSettings(prev => ({ ...DEFAULT_SETTINGS, ...prev, ...parsed.settings }));
          showToast('Vault backup restored successfully.', 'success');
        });
      } catch { showToast('Invalid backup file. Check the format and try again.', 'error'); }
    };
    reader.readAsText(file);
  };

  // Ente Auth Parser
  const handleImportEnteJSON = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const accountsList = Array.isArray(data) ? data : (data.accounts || []);
        if (!Array.isArray(accountsList)) throw new Error("Invalid format");
        
        const imported: Account[] = [];
        accountsList.forEach((item: any) => {
          const secret = item.secret || item.key;
          const name = item.issuer || item.name || 'Ente Imported';
          const email = item.label || item.username || item.email || '';
          if (secret) {
            imported.push({
              id: `acc-ente-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              name,
              email,
              secret: secret.trim().toUpperCase(),
              notes: item.notes || `Imported from Ente Auth JSON`,
              category: 'personal',
              isPinned: false,
              logoType: 'custom',
              createdAt: new Date().toISOString()
            });
          }
        });
        
        if (imported.length === 0) {
          showToast('No valid TOTP secrets found in Ente JSON.', 'error');
          return;
        }
        
        safeTransition(() => {
          setAccounts(prev => [...imported, ...prev]);
          showToast(`Imported ${imported.length} account${imported.length !== 1 ? 's' : ''} from Ente Auth.`, 'success');
        });
      } catch { showToast('Failed to parse Ente JSON. Ensure it is fully decrypted.', 'error'); }
    };
    reader.readAsText(file);
  };

  // Bitwarden Parser
  const handleImportBitwardenJSON = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const items = data.items || [];
        if (!Array.isArray(items)) throw new Error("Invalid format");
        
        const imported: Account[] = [];
        items.forEach((item: any) => {
          const login = item.login;
          if (login && login.totp) {
            const secret = extractSecretFromURI(login.totp);
            if (secret) {
              imported.push({
                id: `acc-bw-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                name: item.name || 'Bitwarden Imported',
                email: login.username || '',
                secret,
                notes: item.notes || `Imported from Bitwarden login item`,
                category: 'personal',
                isPinned: false,
                logoType: 'custom',
                createdAt: new Date().toISOString()
              });
            }
          }
        });
        
        if (imported.length === 0) {
          showToast('No login items with valid TOTP secrets found.', 'error');
          return;
        }
        
        safeTransition(() => {
          setAccounts(prev => [...imported, ...prev]);
          showToast(`Imported ${imported.length} account${imported.length !== 1 ? 's' : ''} from Bitwarden.`, 'success');
        });
      } catch { showToast('Failed to parse Bitwarden JSON. Ensure it is a valid decrypted export.', 'error'); }
    };
    reader.readAsText(file);
  };

  // ── Passphrase / PIN / Master Key updates (current passphrase verification required)
  const handleRegeneratePassphrase = async () => {
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
    setTimeout(() => setCopyFeedbackMap(prev => ({ ...prev, [id]: false })), 1500);

    // Schedule automatic clearing of clipboard after 30 seconds
    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text === code) {
          await navigator.clipboard.writeText('');
          showToast('Clipboard cleared for security.', 'info');
        }
      } catch {
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
    const q = msg.toLowerCase();
    let reply = 'Navigate to Settings to update your passphrase or PIN. All data stays local on your device.';
    if (q.includes('totp') || q.includes('how')) reply = 'TOTP generates a 6-digit code every 30 seconds using a shared secret and the current time via HMAC-SHA1.';
    else if (q.includes('passphrase') || q.includes('recover')) reply = 'Your passphrase is used to unlock the vault and restore access. Store it offline in a safe place.';
    else if (q.includes('backup') || q.includes('import') || q.includes('export')) reply = 'Go to Settings → Import & Export to import third-party credentials or download a JSON vault backup.';
    else if (q.includes('pin')) reply = 'Set a PIN in Settings for faster daily unlocking. Your passphrase remains the master recovery method.';
    else if (q.includes('biometric')) reply = 'Biometric unlock uses your device\'s platform authenticator (Face ID / fingerprint) via WebAuthn.';
    setTimeout(() => setChatMessages(prev => [...prev, { sender: 'system', text: reply, time }]), 700);
  };

  // ── Computed
  const c = settings.compactMode;
  const visibleAccounts = accounts.filter(acc => {
    const isHidden = acc.category.toLowerCase() === 'hide' || acc.category.toLowerCase() === 'hidden';
    return isHiddenVaultActive || !isHidden;
  });
  const filteredAccounts = visibleAccounts.filter(acc => {
    const matchesTag = activeTag === 'all' || acc.category === activeTag;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || acc.name.toLowerCase().includes(q) || acc.email.toLowerCase().includes(q) || (acc.tags?.some(t => t.toLowerCase().includes(q)));
    return matchesTag && matchesSearch;
  });
  const focusedAccount = visibleAccounts.find(a => a.id === focusedAccountId) || visibleAccounts[0] || null;
  const focusedCode = focusedAccount ? (totpCodes[focusedAccount.id] || '------') : '------';
  const focusedCodeFormatted = formatFocusedCode(focusedCode);
  const passkeyStrength = getSecurityStrength(settings.passphraseHash || 'default');
  const isVaultTab = !['security', 'settings', 'support'].includes(activeTag);

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
                    className={`py-4 rounded-2xl border text-center transition-all ${setupWordCount === n ? 'border-[#00dce5] bg-[#00dce5]/10 text-white' : 'border-white/10 bg-white/5 text-[#c4c5d9] hover:border-white/20'}`}>
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
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#00dce5] to-transparent" />

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
                    <div key={i} className="word-cell">
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
                  <div className="bg-[#0e0e0e] border border-white/10 rounded-xl p-3 font-mono text-xs text-[#00dce5] break-all">
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

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={setupSaved} onChange={e => setSetupSaved(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 text-[#00dce5] focus:ring-[#00dce5] bg-transparent" />
                <span className="text-xs text-[#c4c5d9] leading-relaxed">I have saved my passphrase and master key in a secure offline location.</span>
              </label>

              <button onClick={handleRevealContinue} disabled={!setupSaved}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed">
                Continue →
              </button>
            </motion.div>
          )}

          {setupStep === 'set-pin' && (
            <motion.div key="pin" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md mx-4 glass-panel rounded-3xl p-8 flex flex-col gap-6 relative overflow-hidden z-10">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#2d5bff] to-transparent" />
              <div className="text-center space-y-2">
                <h2 className="font-display text-2xl font-semibold text-white">Set a Quick PIN</h2>
                <p className="text-sm text-[#c4c5d9] leading-relaxed">Optional — use for faster daily unlock. Your passphrase remains the master recovery method.</p>
              </div>
              <div className="space-y-3">
                <input type="password" value={setupPin} onChange={e => setSetupPin(e.target.value)} placeholder="PIN (min 4 digits)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00dce5]/50 transition-all" />
                <input type="password" value={setupPinConfirm} onChange={e => setSetupPinConfirm(e.target.value)} placeholder="Confirm PIN"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00dce5]/50 transition-all" />
                {setupPinError && <p className="text-xs text-red-400">{setupPinError}</p>}
              </div>
              <button onClick={() => handleFinishSetup(false)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white font-semibold text-sm hover:opacity-90 transition-opacity">
                Set PIN & Enter Vault →
              </button>
              <button onClick={() => handleFinishSetup(true)} className="text-xs text-[#8e90a2] hover:text-white text-center transition-colors">
                Skip for now
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── LOCK SCREEN ───────────────────────────────────────────────────────────
  if (isLocked) {
    const isPinLocked = settings.pinAttempts >= 5;
    return (
      <div className="relative min-h-screen w-full flex items-center justify-center select-none text-[#e5e2e1] overflow-hidden">
        <StarfieldBackground speed={0.2} />
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          className="w-full max-w-sm mx-4 glass-panel rounded-3xl p-8 flex flex-col items-center gap-6 relative overflow-hidden z-10">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#2d5bff] to-transparent" />

          <div className="w-16 h-16 rounded-2xl bg-[#2d5bff]/10 border border-[#2d5bff]/30 flex items-center justify-center">
            <Lock className="w-7 h-7 text-[#b8c3ff]" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold text-white">Unlock Vault</h1>
            <p className="text-sm text-[#c4c5d9] mt-1">Only Auth</p>
          </div>

          {/* Method tabs - only visible if App Lock is enabled and NOT locked out */}
          {settings.appLockEnabled && !isPinLocked && (settings.pinHash || (biometricsSupported && settings.appLockMethod === 'biometrics')) && (
            <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-full">
              {(['pin', 'biometrics'] as const).map(method => {
                if (method === 'pin' && !settings.pinHash) return null;
                if (method === 'biometrics' && (!biometricsSupported || settings.appLockMethod !== 'biometrics')) return null;
                return (
                  <button key={method} type="button" onClick={() => { setUnlockMethod(method); setUnlockError(''); setUnlockInput(''); }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${unlockMethod === method ? 'bg-white/10 text-white' : 'text-[#8e90a2] hover:text-white'}`}>
                    {method === 'biometrics' ? '⬡ Bio' : 'PIN'}
                  </button>
                );
              })}
            </div>
          )}

          {unlockMethod === 'biometrics' ? (
            <div className="w-full flex flex-col items-center gap-4">
              <button onClick={handleBiometricUnlock}
                className="w-20 h-20 rounded-full bg-[#2d5bff]/10 border-2 border-[#2d5bff]/30 hover:border-[#00dce5]/60 hover:bg-[#00dce5]/10 transition-all flex items-center justify-center group">
                <Fingerprint className="w-8 h-8 text-[#b8c3ff] group-hover:text-[#00dce5] transition-colors" />
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
                    maxLength={4}
                    value={unlockInput}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').substring(0, 4);
                      setUnlockInput(val);
                    }}
                    autoFocus
                    className="absolute inset-0 opacity-0 cursor-default z-10 w-full h-8"
                    placeholder="PIN"
                  />
                  {/* 4 Circles Display */}
                  <div onClick={() => pinInputRef.current?.focus()} className="flex gap-4 py-2 cursor-pointer relative z-20">
                    {Array.from({ length: 4 }).map((_, idx) => {
                      const isFilled = unlockInput.length > idx;
                      return (
                        <div
                          key={idx}
                          className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                            isFilled
                              ? 'bg-[#00dce5] border-[#00dce5] scale-110'
                              : 'bg-transparent border-white/20'
                          }`}
                        />
                      );
                    })}
                  </div>
                  
                  {/* Visual Numeric Keypad for Touch/Mobile */}
                  <div className="grid grid-cols-3 gap-3 w-full max-w-[220px] mx-auto mt-2 relative z-20">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          if (unlockInput.length < 4) {
                            setUnlockInput(prev => prev + num);
                          }
                        }}
                        className="w-11 h-11 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-sm font-semibold text-white flex items-center justify-center mx-auto"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setUnlockInput('')}
                      className="w-11 h-11 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-[8px] font-bold text-[#8e90a2] hover:text-white flex items-center justify-center mx-auto"
                    >
                      CLEAR
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (unlockInput.length < 4) {
                          setUnlockInput(prev => prev + '0');
                        }
                      }}
                      className="w-11 h-11 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-sm font-semibold text-white flex items-center justify-center mx-auto"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnlockInput(prev => prev.slice(0, -1))}
                      className="w-11 h-11 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all text-xs font-bold text-[#8e90a2] hover:text-white flex items-center justify-center mx-auto"
                    >
                      ⌫
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative w-full">
                  <input
                    type={showUnlockInput ? 'text' : 'password'}
                    value={unlockInput}
                    onChange={e => setUnlockInput(e.target.value)}
                    autoFocus
                    placeholder="Enter your passphrase / master key"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00dce5]/50 focus:ring-1 focus:ring-[#00dce5]/20 transition-all pr-10"
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
              
              <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-[#2d5bff] to-[#8B5CF6] text-white font-semibold text-sm hover:opacity-90 transition-opacity">
                Unlock →
              </button>
            </form>
          )}

          {unlockError && unlockMethod !== 'passphrase' && (
            <button onClick={() => { setUnlockMethod('passphrase'); setUnlockError(''); }} className="text-xs text-[#00dce5] hover:underline">
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
            <div className="w-16 h-16 rounded-2xl bg-[#00dce5]/10 border border-[#00dce5]/20 flex items-center justify-center animate-pulse">
              <Shield className="w-8 h-8 text-[#00dce5]" />
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
              <div className="w-7 h-7 rounded-lg bg-[#00dce5]/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-[#00dce5]" />
              </div>
              <span className="font-display font-semibold text-base text-white tracking-tight">Only Auth</span>
            </div>
          )}
          <button onClick={() => setSidebarCollapsed(v => !v)}
            className={`w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-[#c4c5d9] hover:text-white transition-colors ${sidebarCollapsed ? 'mx-auto' : ''}`}>
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
                    isActive ? `bg-white/5 text-white ${isHiddenVaultActive ? 'border-amber-500 text-amber-400 font-semibold' : 'border-[#00dce5] text-white font-semibold'}` : 'border-transparent text-[#c4c5d9] hover:bg-white/5 hover:text-white'
                  } ${sidebarCollapsed ? 'justify-center px-0 border-l-0 rounded-full w-10 h-10 mx-auto' : ''}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="capitalize flex-1 text-left truncate">{tag === 'all' ? 'All' : tag}</span>
                      {count > 0 && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${isActive ? `${isHiddenVaultActive ? 'bg-amber-500 text-black font-bold' : 'bg-[#00dce5] text-black font-bold'}` : 'bg-white/10 text-[#8e90a2]'}`}>
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
                    isActive ? 'bg-white/5 text-white border-[#00dce5] font-semibold' : 'border-transparent text-[#c4c5d9] hover:bg-white/5 hover:text-white'
                  } ${sidebarCollapsed ? 'justify-center px-0 border-l-0 rounded-full w-10 h-10 mx-auto' : ''}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span>{tab.label}</span>}
                </button>
              );
            })()}

            {/* Import - Top-level sibling button */}
            <button onClick={() => safeTransition(() => { setActiveTag('settings'); setSettingsSubTab('import-export'); setMobileDrawerOpen(false); })}
              className={`flex items-center gap-3 rounded-r-full px-3 py-2.5 text-xs transition-all duration-150 ease-out border-l-[3px] ${
                activeTag === 'settings' && settingsSubTab === 'import-export' ? 'bg-white/5 text-white border-[#00dce5] font-semibold' : 'border-transparent text-[#c4c5d9] hover:bg-white/5 hover:text-white'
              } ${sidebarCollapsed ? 'justify-center px-0 border-l-0 rounded-full w-10 h-10 mx-auto' : ''}`}
              title={sidebarCollapsed ? "Import" : undefined}>
              <Upload className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Import</span>}
            </button>

            {/* Export - Top-level sibling button */}
            <button onClick={() => safeTransition(() => { setActiveTag('settings'); setSettingsSubTab('import-export'); setMobileDrawerOpen(false); })}
              className={`flex items-center gap-3 rounded-r-full px-3 py-2.5 text-xs transition-all duration-150 ease-out border-l-[3px] ${
                activeTag === 'settings' && settingsSubTab === 'import-export' ? 'bg-white/5 text-white border-[#00dce5] font-semibold' : 'border-transparent text-[#c4c5d9] hover:bg-white/5 hover:text-white'
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
                <button key={tab.value} onClick={() => safeTransition(() => { setActiveTag(tab.value); setMobileDrawerOpen(false); })}
                  className={`flex items-center gap-3 rounded-r-full px-3 py-2.5 text-xs transition-all duration-150 ease-out border-l-[3px] ${
                    isActive ? 'bg-white/5 text-white border-[#00dce5] font-semibold' : 'border-transparent text-[#c4c5d9] hover:bg-white/5 hover:text-white'
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
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2d5bff] to-[#8B5CF6] flex items-center justify-center text-white font-semibold text-xs shrink-0">
                  {(settings.devAccountName || 'Dev Account').trim().split(/\s+/).map(n => n[0] || '').join('').substring(0, 2).toUpperCase() || 'DA'}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-white text-xs font-semibold truncate">{settings.devAccountName || 'Dev Account'}</h4>
                  <p className="text-[9px] text-[#00dce5] uppercase tracking-wider font-semibold truncate h-[13px] flex items-center">
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
            className="absolute top-0 right-0 w-[4px] h-full cursor-col-resize hover:bg-[#00dce5]/50 active:bg-[#00dce5] transition-colors z-50"
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
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-[#00dce5]/40 focus:ring-1 focus:ring-[#00dce5]/20 transition-all placeholder-[#8e90a2]"
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
                      className="w-48 md:w-60 bg-white/5 border border-white/10 rounded-full py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-[#00dce5]/40 focus:ring-1 focus:ring-[#00dce5]/20 transition-all placeholder-[#8e90a2]" />
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
                  title={c ? 'Normal view' : 'Compact view'}
                  className="w-9 h-9 rounded-full glass-panel flex items-center justify-center text-[#c4c5d9] hover:text-white transition-colors cursor-pointer">
                  {c ? <ZoomIn className="w-4 h-4" /> : <ZoomOut className="w-4 h-4" />}
                </button>

                {/* Add account button — desktop only */}
                {isVaultTab && (
                  <button onClick={openAddModal}
                    className="hidden sm:flex w-9 h-9 rounded-full bg-[#00dce5] text-black items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all duration-150 ease-out cursor-pointer">
                    <Plus className="w-5 h-5 stroke-[3px]" />
                  </button>
                )}
              </div>
            </>
          )}
        </header>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto ${c ? 'p-4 md:p-6' : 'p-4 md:p-8'}`}>
          <AnimatePresence mode="wait">

            {/* ── VAULT VIEW ─────────────────────────────────────────────── */}
            {isVaultTab && (
              <motion.div key="vault" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`flex flex-col ${settings.accountListPlacement === 'right' ? 'xl:flex-row' : ''} ${c ? 'gap-4 md:gap-6' : 'gap-6 md:gap-8'}`}>

                {/* Left: Focus card + Pinned */}
                <div className={`flex-1 flex flex-col ${c ? 'gap-4' : 'gap-6'} min-w-0`}>
                  
                  {/* Vault Unsealed Neon Amber Banner */}
                  {isHiddenVaultActive && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      className="border border-amber-500/40 bg-amber-950/10 rounded-2xl p-3.5 flex items-center justify-between transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center border border-amber-500/25">
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
                    <div className={`glass-panel-accent rounded-3xl relative overflow-hidden focus-card-transition group border-l-4 ${isHiddenVaultActive ? 'border-l-amber-500' : 'border-l-[#00dce5]'}`}
                      style={{ padding: c ? '1.25rem' : '2rem' }}>
                      <div className={`card-bg-blur ${isHiddenVaultActive ? 'bg-amber-500/10' : 'bg-[#00dce5]/10'}`} />

                      <div className="flex justify-between items-start relative z-10">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="shadow-xl shrink-0">
                            <BrandLogo name={focusedAccount.name} logoType={focusedAccount.logoType} className={`${c ? 'w-10 h-10 text-sm' : 'w-14 h-14 text-lg'}`} />
                          </div>
                          <div className="min-w-0">
                            <h2 className={`font-display font-semibold text-white truncate leading-tight ${c ? 'text-base' : 'text-xl md:text-2xl'}`}>{focusedAccount.name}</h2>
                            <p className="text-xs text-[#c4c5d9] truncate mt-0.5">{focusedAccount.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={e => handleTogglePin(focusedAccount.id, e)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${focusedAccount.isPinned ? 'bg-[#00dce5]/10 border-[#00dce5]/40 text-[#00dce5]' : 'bg-white/5 border-white/10 text-[#c4c5d9] hover:text-white'}`}>
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
                      <div className={`flex flex-col items-center justify-center relative z-10 ${c ? 'py-5' : 'py-8'}`}>
                        {focusedAccount.secret && focusedAccount.secret.trim() !== "" ? (
                          <>
                            <motion.div key={focusedCode} initial={{ opacity: 0.7, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                              onClick={() => handleCopyCode(focusedAccount.id, focusedCode)}
                              className={`font-display font-bold text-white flex items-center gap-4 tracking-[0.1em] cursor-pointer hover:text-[#00dce5] transition-colors select-none ${c ? 'text-4xl md:text-5xl' : 'text-5xl md:text-6xl'}`}
                              title="Click to copy">
                              <span className={totpCodes[focusedAccount?.id ?? ''] ? '' : 'animate-pulse opacity-50'}>{focusedCodeFormatted.first}</span>
                              <span className="w-2.5 h-2.5 bg-white/20 rounded-full shrink-0" />
                              <span className={totpCodes[focusedAccount?.id ?? ''] ? '' : 'animate-pulse opacity-50'}>{focusedCodeFormatted.second}</span>
                            </motion.div>

                            {copyFeedbackMap[focusedAccount.id] && (
                              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                className="mt-3 text-xs font-semibold text-[#00dce5] flex items-center gap-1.5 bg-[#00dce5]/10 px-3 py-1 rounded-full border border-[#00dce5]/20">
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
                      <div className={`flex flex-col gap-3 border-t border-white/5 ${c ? 'pt-3' : 'pt-4'} relative z-10`}>
                        {!c && focusedAccount.notes && (
                          <p className="text-xs text-[#c4c5d9] leading-relaxed italic">{focusedAccount.notes}</p>
                        )}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#8e90a2]">Refreshes in <span className="font-mono text-white font-semibold">{secondsRemaining}s</span></span>
                          {focusedAccount.secret && focusedAccount.secret.trim() !== "" && (
                            <button onClick={() => handleCopyCode(focusedAccount.id, focusedCode)}
                              className="flex items-center gap-1 text-[#00dce5] hover:text-white transition-colors">
                              <Copy className="w-3.5 h-3.5" /> <span>Copy Code</span>
                            </button>
                          )}
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full progress-bar-inner bg-[#00dce5]" style={{ width: `${(secondsRemaining / (settings.autoRenewInterval || 60)) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="glass-panel rounded-3xl p-10 text-center flex flex-col items-center gap-4 text-[#8e90a2]">
                      <Lock className="w-10 h-10 text-white/10" />
                      <p className="text-sm">No accounts in "{activeTag === 'all' ? 'All' : activeTag}" yet.</p>
                      <button onClick={openAddModal} className="text-[#00dce5] text-xs font-semibold hover:underline">Add Account</button>
                    </div>
                  )}

                   {/* Pinned accounts */}
                  {visibleAccounts.filter(a => a.isPinned).length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-[#8e90a2]">Pinned Accounts</p>
                      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                        {visibleAccounts.filter(a => a.isPinned).map(acc => {
                          const pCode = totpCodes[acc.id] || '------';
                          const isSelected = focusedAccountId === acc.id;
                          return (
                            <div key={acc.id} onClick={() => setFocusedAccountId(acc.id)}
                              className={`glass-panel ${c ? 'min-w-[200px] p-3' : 'min-w-[240px] p-4'} rounded-2xl flex flex-col gap-3 cursor-pointer hover:bg-white/5 transition-all shrink-0 ${isSelected ? (isHiddenVaultActive ? 'border border-amber-500/50' : 'border border-[#00dce5]/40') : ''}`}>
                              <div className="flex items-center gap-2">
                                <div className="shrink-0">
                                  <BrandLogo name={acc.name} logoType={acc.logoType} className={`${c ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-xs'}`} />
                                </div>
                                <h4 className="font-semibold text-white text-xs truncate">{acc.name}</h4>
                              </div>
                              <div className="flex justify-between items-center">
                                {acc.secret && acc.secret.trim() !== "" ? (
                                  <>
                                    <span className={`font-mono font-semibold text-white ${c ? 'text-base' : 'text-xl'} ${totpCodes[acc.id] ? '' : 'animate-pulse opacity-50'}`}>{formatCode(pCode)}</span>
                                    <button onClick={e => { e.stopPropagation(); handleCopyCode(acc.id, pCode); }}
                                      className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-[#c4c5d9] hover:text-[#00dce5]">
                                      {copyFeedbackMap[acc.id] ? <Check className="w-3.5 h-3.5 text-[#00dce5]" /> : <Copy className="w-3 h-3" />}
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
                  )}
                </div>

                {/* Right: Account list */}
                <div className={`flex flex-col gap-3 shrink-0 ${settings.accountListPlacement === 'right' ? 'w-full xl:w-96' : 'w-full'}`}>
                  <div className="flex justify-between items-center">
                    <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-[#8e90a2]">Account List</p>
                    <span className="text-[9px] font-mono text-[#8e90a2]">{filteredAccounts.length} accounts</span>
                  </div>
                  <div className={`grid gap-${c ? '1.5' : '3'} ${settings.accountListPlacement === 'right' ? 'grid-cols-1 max-h-[75vh] overflow-y-auto pr-0.5' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                    {filteredAccounts.length > 0 ? filteredAccounts.map(acc => {
                      const isFocused = focusedAccountId === acc.id;
                      const aCode = totpCodes[acc.id] || '------';
                      return (
                        <motion.div key={acc.id} onClick={() => setFocusedAccountId(acc.id)}
                          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.1, ease: "easeOut" }}
                          className={`glass-panel ${c ? 'rounded-xl p-2.5' : 'rounded-2xl p-4'} flex items-center justify-between cursor-pointer transition-all duration-150 ease-out group border-l-[3px] ${
                            isFocused
                              ? `${isHiddenVaultActive ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-[#00dce5] bg-white/5'} border-t-transparent border-r-transparent border-b-transparent`
                              : `border-l-transparent border-t-white/8 border-r-white/8 border-b-white/8 ${isHiddenVaultActive ? 'hover:border-l-amber-500/60' : 'hover:border-l-[#00dce5]/60'} hover:border-t-transparent hover:border-r-transparent hover:border-b-transparent hover:bg-white/5`
                          }`}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="shrink-0">
                              <BrandLogo name={acc.name} logoType={acc.logoType} className={`${c ? 'w-8 h-8 text-xs' : 'w-11 h-11 text-xs'}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <h4 className={`font-semibold text-white truncate ${c ? 'text-[10px]' : 'text-xs'}`}>{acc.name}</h4>
                                {acc.isPinned && <Pin className="w-2.5 h-2.5 text-[#00dce5]/60 shrink-0 fill-current" />}
                              </div>
                              {!c && <p className="text-[10px] text-[#8e90a2] truncate mt-0.5">{acc.email}</p>}
                            </div>
                          </div>
                          {acc.secret && acc.secret.trim() !== "" ? (
                            <div className="code-hover-target ml-3 shrink-0" onClick={e => { e.stopPropagation(); handleCopyCode(acc.id, aCode); }}>
                              <span className={`original-code font-mono font-semibold text-white group-hover:text-[#00dce5] transition-colors ${c ? 'text-xs' : 'text-sm'} ${totpCodes[acc.id] ? '' : 'animate-pulse opacity-50'}`}>{formatCode(aCode)}</span>
                              <span className="hover-text text-[9px] text-[#00dce5] font-bold font-sans uppercase">
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
                    <p className="text-xs text-[#c4c5d9] leading-relaxed">Analysis of your vault's passphrase strength, backup status, and active hardware keys.</p>
                  </div>
                  <div className="w-28 h-28 rounded-full border-4 border-[#434656] relative flex flex-col items-center justify-center shrink-0">
                    <div className="absolute inset-0 rounded-full border-4 border-dashed border-[#00dce5]/30" />
                    <span className="text-3xl font-mono font-bold text-[#00dce5]">92%</span>
                    <span className="text-[9px] uppercase font-bold text-[#8e90a2] tracking-wider mt-0.5">Strong</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { icon: Download, label: 'Backup', status: 'Stable', statusColor: 'text-green-400', desc: 'Offline backup keeps your seeds safe without cloud sync.', info: `Last: ${new Date(settings.lastBackupDate).toLocaleDateString()}`, infoColor: 'text-[#00dce5]' },
                    { icon: Key, label: 'Passphrase Strength', status: passkeyStrength.label, statusColor: passkeyStrength.color, desc: 'Entropy calculated from your passphrase complexity.', info: `Score: ${passkeyStrength.score}/100`, infoColor: 'text-white' },
                    { icon: Fingerprint, label: 'Locking', status: 'Active', statusColor: 'text-green-400', desc: 'Vault locks instantly and requires passphrase, PIN, or biometrics.', info: settings.appLockEnabled ? 'App Lock Enabled' : 'App Lock Disabled', infoColor: settings.appLockEnabled ? 'text-green-400' : 'text-amber-400' },
                  ].map((card, i) => (
                    <div key={i} className="glass-panel p-5 rounded-2xl border border-white/8">
                      <div className="flex justify-between items-start mb-3">
                        <div className="w-9 h-9 rounded-lg bg-[#00dce5]/5 border border-[#00dce5]/20 flex items-center justify-center text-[#00dce5]">
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
                      className="text-xs bg-[#00dce5]/10 text-[#00dce5] hover:bg-[#00dce5]/20 px-3 py-1.5 rounded-lg border border-[#00dce5]/20 font-semibold transition-all">
                      Register Key
                    </button>
                  </div>
                  {isAddingHardwareKey && (
                    <form onSubmit={registerSecurityKey} className="flex gap-3 mb-4 p-3 rounded-xl bg-white/[0.02] border border-[#00dce5]/20 animate-fade-in">
                      <input type="text" required value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="e.g. YubiKey 5C"
                        className="flex-1 bg-[#1c1b1b] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00dce5]/50" />
                      <button type="submit" className="text-xs bg-[#00dce5] text-black px-4 py-2 rounded-lg font-semibold">Add</button>
                      <button type="button" onClick={() => setIsAddingHardwareKey(false)} className="text-xs text-[#8e90a2] hover:text-white px-3 py-2">Cancel</button>
                    </form>
                  )}
                  <div className="space-y-2.5">
                    {settings.securityKeys.length > 0 ? settings.securityKeys.map(key => (
                      <div key={key.id} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/8 rounded-xl hover:border-white/12 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#00dce5]/5 border border-[#00dce5]/15 flex items-center justify-center text-[#00dce5]">
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
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${settings.duressAction === 'fake' ? 'bg-[#00dce5]/10 border-[#00dce5] text-white' : 'bg-transparent border-white/10 text-[#8e90a2] hover:border-white/20'}`}
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
                        <span className="text-[10px] font-mono text-[#00dce5]">{settings.duressPinHash ? 'PIN Fortified' : 'Not Configured'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDuressSetup(true)}
                        className="w-full py-2 px-4 rounded-lg bg-[#00dce5]/10 text-[#00dce5] hover:bg-[#00dce5]/20 border border-[#00dce5]/20 font-semibold text-xs transition-all"
                      >
                        {settings.duressPinHash ? 'Change Duress PIN' : 'Configure Duress PIN'}
                      </button>
                      {settings.duressPinHash && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Remove Duress PIN?')) {
                              setSettings(prev => ({ 
                                ...prev, 
                                duressPinHash: '', 
                                duressPassphraseHash: '',
                                authHashes: [],
                                authMetadata: {}
                              }));
                              showToast('Duress PIN removed.', 'info');
                            }
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
                        } catch {
                          showToast('Failed to decrypt audit logs.', 'error');
                        }
                      }}
                      className="text-xs bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg text-[#00dce5] font-semibold transition-all flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3" /> Fetch Logs
                    </button>
                  </div>

                  <div className="bg-[#0b0a0a] rounded-xl border border-white/5 max-h-48 overflow-y-auto font-mono text-[10px] p-4 space-y-1.5 custom-scrollbar">
                    {auditLogs.length > 0 ? (
                      [...auditLogs].reverse().map((log, i) => {
                        const parts = log.split('|');
                        const time = new Date(parseInt(parts[0], 10) * 1000).toLocaleString();
                        const isAlert = log.includes('DURESS') || log.includes('Failed');
                        return (
                          <div key={i} className={`flex items-start justify-between py-1 border-b border-white/3 last:border-0 ${isAlert ? 'text-red-400' : 'text-neutral-400'}`}>
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
                    <h3 className="font-display text-base font-semibold text-white">Layout</h3>

                    {/* Compact mode */}
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/8">
                      <div>
                        <p className="text-sm font-semibold text-white">Compact Mode</p>
                        <p className="text-xs text-[#8e90a2] mt-0.5">Smaller rows — fit more accounts on screen</p>
                      </div>
                      <button onClick={() => setSettings(prev => ({ ...prev, compactMode: !prev.compactMode }))}
                        className={`relative w-10 h-6 rounded-full transition-colors ${settings.compactMode ? 'bg-[#00dce5]' : 'bg-white/10'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.compactMode ? 'left-5' : 'left-1'}`} />
                      </button>
                    </div>

                    {/* Force Search on Startup */}
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/8">
                      <div>
                        <p className="text-sm font-semibold text-white">Focus Search on Startup</p>
                        <p className="text-xs text-[#8e90a2] mt-0.5">Automatically focus search bar on startup or vault unlock</p>
                      </div>
                      <button onClick={() => setSettings(prev => ({ ...prev, forceSearchOnStartup: !prev.forceSearchOnStartup }))}
                        className={`relative w-10 h-6 rounded-full transition-colors ${settings.forceSearchOnStartup ? 'bg-[#00dce5]' : 'bg-white/10'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.forceSearchOnStartup ? 'left-5' : 'left-1'}`} />
                      </button>
                    </div>

                    {/* Account list placement */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-[#8e90a2]">Account List Position</label>
                      <div className="grid grid-cols-2 gap-3">
                        {(['right', 'bottom'] as const).map(pos => (
                          <button key={pos} onClick={() => setSettings(prev => ({ ...prev, accountListPlacement: pos }))}
                            className={`p-4 rounded-xl border text-left transition-all ${settings.accountListPlacement === pos ? 'border-[#00dce5]/50 bg-[#00dce5]/5 text-white' : 'border-white/10 bg-white/5 text-[#8e90a2] hover:text-white'}`}>
                            <div className="font-semibold text-xs uppercase mb-1">{pos === 'right' ? 'Right Sidebar' : 'Below Card'}</div>
                            <div className="text-[10px] text-[#8e90a2]">{pos === 'right' ? 'Side-by-side on wide screens' : 'Stacked layout with wider grid'}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {settingsSubTab === 'profile' && (
                  <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-6">
                    <h3 className="font-display text-base font-semibold text-white">Profile & Perks</h3>

                    <div className="space-y-4">
                      {/* Name input */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-[#8e90a2]">Dev Account Name</label>
                        <input
                          type="text"
                          value={settings.devAccountName}
                          onChange={e => setSettings(prev => ({ ...prev, devAccountName: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#00dce5]/50 focus:ring-1 focus:ring-[#00dce5]/20 transition-all"
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
                              ? 'border-white/10 focus:border-[#00dce5]/50 focus:ring-[#00dce5]/20' 
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
                          <span className="text-[10px] font-mono text-[#00dce5]">{sidebarWidth}px</span>
                        </div>
                        <input
                          type="range"
                          min="180"
                          max="450"
                          value={sidebarWidth}
                          onChange={e => setSidebarWidth(parseInt(e.target.value, 10))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#00dce5]"
                        />
                      </div>
                    </div>

                    {/* GitHub Contributor Loop (Emotional Message) */}
                    <div className="pt-4 border-t border-white/5 space-y-4">
                      <div className="p-4 bg-gradient-to-br from-neutral-900 to-black rounded-2xl border border-white/5 relative overflow-hidden flex flex-col gap-3">
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00dce5]/40 to-transparent" />
                        <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <svg className="w-4 h-4 text-[#00dce5]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                          Support Privacy & Security
                        </h4>
                        
                        <p className="text-xs text-[#c4c5d9] leading-relaxed">
                          Only Auth is a 100% open-source, local-first product built on transparency, safety, and mutual trust. We don't track you, run servers, or monetize your data. 
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
                                : 'bg-[#00dce5] hover:opacity-95 text-black hover:scale-[1.02]'
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
                    <h3 className="font-display text-base font-semibold text-white">Change Passphrase</h3>
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
                            <div key={i} className="word-cell">
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
                          <div className="bg-[#0e0e0e] border border-white/10 rounded-xl p-3 font-mono text-xs text-[#00dce5] break-all select-all">
                            {newMasterKeyField}
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={handleSaveNewMasterKeySubmit}
                              className="px-4 py-2.5 text-xs bg-[#00dce5] text-black font-semibold rounded-xl hover:opacity-90 transition-opacity">
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
                      <form onSubmit={handleUpdatePinSubmit} className="space-y-3 max-w-xs">
                        <input type="password" value={newPinField} onChange={e => setNewPinField(e.target.value)} placeholder="New PIN (min 4 digits)"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00dce5]/50 transition-all" />
                        <input type="password" value={newPinConfirm} onChange={e => setNewPinConfirm(e.target.value)} placeholder="Confirm PIN"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00dce5]/50 transition-all" />
                        <button type="submit" className="px-5 py-2.5 text-xs bg-white/10 text-white font-semibold rounded-xl hover:bg-white/15 transition-all border border-white/10">Update PIN</button>
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
                              <Tag className="w-3.5 h-3.5 text-[#00dce5]" />
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
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00dce5]/50 transition-all placeholder-[#8e90a2]" />
                        <button type="submit" className="px-4 py-2.5 bg-[#00dce5] text-black text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity">Add Tag</button>
                      </form>
                    </div>
                  </div>
                )}

                {settingsSubTab === 'import-export' && (
                  <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-6">
                    <div>
                      <h3 className="font-display text-base font-semibold text-white">Import & Export</h3>
                      <p className="text-xs text-[#8e90a2] mt-0.5">Import credentials from other vaults, or download your Only Auth backup file.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Import card */}
                      <div className="glass-panel p-5 rounded-xl border border-white/8 space-y-4">
                        <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5 text-[#00dce5]" /> Import Accounts
                        </h4>
                        <p className="text-[11px] text-[#8e90a2] leading-relaxed">
                          Import credentials from a decrypted backup file. Supports Only Auth, Ente Auth, and Bitwarden formats.
                        </p>
                        
                        <div className="space-y-2">
                          {/* Only Auth Import */}
                          <div className="relative">
                            <input type="file" accept=".json" onChange={handleUploadBackup} className="hidden" id="onlyauth-import-input" />
                            <label htmlFor="onlyauth-import-input"
                              className="w-full h-10 px-4 rounded-xl border border-white/10 hover:bg-white/5 transition-all text-xs font-semibold flex items-center justify-between text-white cursor-pointer">
                              <span>Only Auth JSON Backup</span>
                              <ChevronRight className="w-3.5 h-3.5 text-[#8e90a2]" />
                            </label>
                          </div>

                          {/* Ente Auth Import */}
                          <div className="relative">
                            <input type="file" accept=".json" onChange={handleImportEnteJSON} className="hidden" id="ente-import-input" />
                            <label htmlFor="ente-import-input"
                              className="w-full h-10 px-4 rounded-xl border border-white/10 hover:bg-white/5 transition-all text-xs font-semibold flex items-center justify-between text-white cursor-pointer">
                              <span>Ente Auth Decrypted JSON</span>
                              <ChevronRight className="w-3.5 h-3.5 text-[#8e90a2]" />
                            </label>
                          </div>

                          {/* Bitwarden Import */}
                          <div className="relative">
                            <input type="file" accept=".json" onChange={handleImportBitwardenJSON} className="hidden" id="bw-import-input" />
                            <label htmlFor="bw-import-input"
                              className="w-full h-10 px-4 rounded-xl border border-white/10 hover:bg-white/5 transition-all text-xs font-semibold flex items-center justify-between text-white cursor-pointer">
                              <span>Bitwarden Decrypted JSON</span>
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
                            className="w-full bg-[#1c1b1b]/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00dce5]/60 transition-all placeholder-[#8e90a2]"
                          />
                          <div className="relative">
                            <input type="file" accept=".sealed,.txt,.json" onChange={async (e) => {
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
                                  const parsed = JSON.parse(decrypted);
                                  safeTransition(() => {
                                    if (parsed?.accounts) setAccounts(parsed.accounts);
                                    if (parsed?.settings) setSettings(prev => ({ ...DEFAULT_SETTINGS, ...prev, ...parsed.settings }));
                                    showToast('Integrity seal verified. Backup restored successfully.', 'success');
                                    setBackupPassword('');
                                  });
                                } catch (err: any) {
                                  showToast(err.message || 'Verification failed. Tampering detected or wrong password.', 'error');
                                }
                              };
                              reader.readAsText(file);
                            }} className="hidden" id="sealed-import-input" />
                            <label htmlFor="sealed-import-input"
                              className="w-full h-10 px-4 rounded-xl border border-[#00dce5]/20 bg-[#00dce5]/5 hover:bg-[#00dce5]/10 transition-all text-xs font-semibold flex items-center justify-between text-[#00dce5] cursor-pointer">
                              <span>Select & Verify Sealed Backup</span>
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Export card */}
                      <div className="glass-panel p-5 rounded-xl border border-white/8 space-y-4">
                        <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Download className="w-3.5 h-3.5 text-[#00dce5]" /> Export & Resets
                        </h4>
                        <p className="text-[11px] text-[#8e90a2] leading-relaxed">
                          Export your encrypted Only Auth vault or reset your configuration. Keep your backups offline!
                        </p>

                        <div className="space-y-2.5">
                          <button onClick={handleDownloadBackup}
                            className="w-full h-10 px-4 rounded-xl bg-[#00dce5] text-black hover:opacity-90 transition-all text-xs font-semibold flex items-center justify-between">
                            <span>Download Only Auth Backup</span>
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button onClick={() => { if (confirm('WARNING: This will permanently delete ALL accounts from your vault. This action cannot be undone. Continue?')) { setAccounts([]); } }}
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
                            className="w-full bg-[#1c1b1b]/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00dce5]/60 transition-all placeholder-[#8e90a2]"
                          />
                          <button
                            onClick={async () => {
                              if (!backupPassword) {
                                showToast('Please create a backup password first.', 'error');
                                return;
                              }
                              try {
                                const raw = JSON.stringify({ accounts, settings });
                                const encrypted = await encryptBackup(raw, backupPassword);
                                const blob = new Blob([encrypted], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `OnlyAuth_Sealed_Backup_${new Date().toISOString().slice(0, 10)}.sealed`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                showToast('Encrypted backup with Integrity Seal generated.', 'success');
                                setBackupPassword('');
                                setSettings(prev => ({ ...prev, lastBackupDate: new Date().toISOString() }));
                              } catch {
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
                    <h3 className="font-display text-base font-semibold text-white">Hardware Settings</h3>
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
                    <h3 className="font-display text-base font-semibold text-white">App Lock Settings</h3>
                    
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/8">
                      <div>
                        <p className="text-sm font-semibold text-white">Enable App Lock</p>
                        <p className="text-xs text-[#8e90a2] mt-0.5">Use a secondary fast unlock method on startup</p>
                      </div>
                      <button onClick={() => setSettings(prev => ({ ...prev, appLockEnabled: !prev.appLockEnabled }))}
                        className={`relative w-10 h-6 rounded-full transition-colors ${settings.appLockEnabled ? 'bg-[#00dce5]' : 'bg-white/10'}`}>
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
                                onClick={() => setSettings(prev => ({ ...prev, appLockMethod: option.id }))}
                                className={`w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between ${
                                  isSelected ? 'border-[#00dce5]/50 bg-[#00dce5]/5 text-white' : 'border-white/10 bg-white/5 text-[#8e90a2] hover:text-white'
                                }`}>
                                <div>
                                  <div className="font-semibold text-xs">{option.label}</div>
                                  <div className="text-[10px] text-[#8e90a2] mt-0.5">{option.desc}</div>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-[#00dce5]" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── SUPPORT ────────────────────────────────────────────────── */}
            {activeTag === 'support' && (
              <motion.div key="support" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl space-y-6 animate-fade-in">
                <div className="glass-panel p-6 rounded-2xl border border-white/8 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#00dce5]/10 border border-[#00dce5]/20 flex items-center justify-center text-[#00dce5]">
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
                      <button onClick={() => setSupportSuccess(false)} className="text-xs text-[#00dce5] underline font-semibold mt-1">Send another</button>
                    </div>
                  ) : (
                    <form onSubmit={handleSendSupport} className="space-y-3 pt-1">
                      <input type="text" required value={supportSubject} onChange={e => setSupportSubject(e.target.value)} placeholder="Subject"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#00dce5]/50 transition-all" />
                      <textarea required rows={4} value={supportMessage} onChange={e => setSupportMessage(e.target.value)} placeholder="Describe your issue..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#00dce5]/50 transition-all" />
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
                      <div key={i} className={m.sender === 'user' ? 'text-white text-right' : 'text-[#00dce5]'}>
                        <span className="text-[9px] opacity-40 mr-1">{m.time}</span>
                        <strong>{m.sender === 'user' ? 'You: ' : 'Only Auth: '}</strong>
                        <span>{m.text}</span>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendCommand} className="flex gap-2">
                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask a question..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00dce5]/50 transition-all" />
                    <button type="submit" className="text-xs bg-[#00dce5] text-black px-4 py-2 rounded-xl font-semibold">Ask</button>
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
            className="sm:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#00dce5] text-black flex items-center justify-center shadow-[0_4px_20px_rgba(0,220,229,0.3)] hover:scale-110 active:scale-95 transition-all duration-150 ease-out z-40 cursor-pointer"
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

                {/* Brand icons selection popover */}
                {showIconPicker && (
                  <div className="absolute top-24 z-20 w-64 bg-[#1c1b1b] border border-white/10 rounded-2xl p-3 shadow-2xl grid grid-cols-4 gap-2 animate-fade-in">
                    {([
                      { id: 'custom', name: 'Generic' },
                      { id: 'google', name: 'Google' },
                      { id: 'aws', name: 'AWS' },
                      { id: 'github', name: 'GitHub' },
                      { id: 'discord', name: 'Discord' },
                      { id: 'slack', name: 'Slack' },
                      { id: 'proton', name: 'Proton' },
                      { id: 'stripe', name: 'Stripe' }
                    ] as const).map(b => (
                      <button key={b.id} type="button"
                        onClick={() => {
                          setFormLogoType(b.id);
                          setShowIconPicker(false);
                        }}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all hover:bg-white/5 ${
                          formLogoType === b.id ? 'border-[#00dce5] bg-[#00dce5]/5' : 'border-transparent'
                        }`}>
                        <div className="w-8 h-8 flex items-center justify-center rounded-lg">
                          <BrandLogo name="AB" logoType={b.id} className="w-6 h-6 text-[10px]" />
                        </div>
                        <span className="text-[8px] text-[#c4c5d9] font-medium truncate w-full text-center">{b.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* QR Camera */}
              <div className="mb-5">
                {isCameraActive ? (
                  <div className="space-y-3 bg-black/50 p-4 rounded-2xl border border-[#00dce5]/30">
                    <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-[#0e0e0e] border border-white/10 flex flex-col items-center justify-center">
                      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 border-[5px] border-[#00dce5]/25 m-8 rounded-lg pointer-events-none border-dashed" />
                      <Camera className="w-7 h-7 text-[#00dce5] relative z-10" />
                      <p className="text-xs text-white relative z-10 mt-2 font-mono bg-black/60 px-3 py-1 rounded">{cameraStatus}</p>
                    </div>
                    <div className="flex gap-2 justify-center">
                      <button type="button" onClick={injectScannedQRResult}
                        className="text-xs bg-[#00dce5] text-black font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5">
                        Use Sample Key
                      </button>
                      <button type="button" onClick={stopCameraScan} className="text-xs bg-white/10 text-white px-4 py-2 rounded-xl">Stop</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={startCameraScan}
                    className="w-full py-3 rounded-xl bg-[#00dce5]/5 border border-[#00dce5]/20 hover:border-[#00dce5]/40 text-xs text-[#00dce5] flex items-center justify-center gap-2 font-semibold transition-all">
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
                    <input type="text" required value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. GitHub"
                      className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00dce5]/60 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-semibold text-[#8e90a2]">Account</label>
                    <input type="text" required value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="e.g. user@example.com"
                      className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00dce5]/60 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-semibold text-[#8e90a2] flex justify-between">
                    <span>Secret</span>
                    <button type="button" onClick={handleGenerateSecret} className="text-[#00dce5] hover:underline">Generate</button>
                  </label>
                  <div className="relative">
                    <input type={showSecret ? "text" : "password"} required value={formSecret} onChange={e => setFormSecret(e.target.value)} placeholder="e.g. JBSWY3DPEHPK3PXP"
                      className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-xs text-white font-mono uppercase focus:outline-none focus:border-[#00dce5]/60 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]" />
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
                      className="w-full bg-[#1c1b1b] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00dce5]/60 transition-all">
                      {settings.customTags
                        .filter(t => t.toLowerCase() !== 'hide' && t.toLowerCase() !== 'hidden')
                        .concat(isHiddenVaultActive ? ['hidden'] : [])
                        .map(t => <option key={t} value={t} className="bg-[#1c1b1b] text-white">{t}</option>)}
                      <option value="__NEW_TAG__" className="text-[#00dce5] font-semibold">+ Add New Tag...</option>
                    </select>
                    {isCreatingNewTagInModal && (
                      <div className="mt-2 flex gap-2 animate-fade-in">
                        <input
                          type="text"
                          value={newTagNameInModal}
                          onChange={e => setNewTagNameInModal(e.target.value)}
                          placeholder="New tag..."
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-[10px] text-white focus:outline-none focus:border-[#00dce5]/60 focus:bg-white/[0.08] transition-all"
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
                          className="px-2.5 py-1.5 bg-[#00dce5] text-black text-[9px] font-bold rounded-lg hover:opacity-90 transition-opacity"
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
                      className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00dce5]/60 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]" />
                  </div>
                </div>

                {/* Advanced Cryptographic Settings Grid */}
                <div className="grid grid-cols-3 gap-3 bg-white/5 p-3.5 rounded-xl border border-white/8">
                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase font-bold text-[#8e90a2] tracking-wider block">Algorithm</label>
                    <select
                      value={formAlgorithm}
                      onChange={e => setFormAlgorithm(e.target.value as any)}
                      className="w-full bg-[#1c1b1b] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-[#00dce5]/60"
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
                      className="w-full bg-[#1c1b1b] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-[#00dce5]/60"
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
                      className="w-full bg-[#1c1b1b] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-[#00dce5]/60"
                    >
                      <option value={6}>6 Digits (Default)</option>
                      <option value={8}>8 Digits</option>
                    </select>
                  </div>
                </div>

                <textarea rows={2} value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Notes (optional)"
                  className="w-full bg-gradient-to-br from-white/[0.03] to-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00dce5]/60 focus:bg-white/[0.08] transition-all placeholder-[#8e90a2]" />

                <label className="flex items-center gap-2.5 bg-white/5 p-3 rounded-xl border border-white/8 cursor-pointer">
                  <input type="checkbox" checked={formIsPinned} onChange={e => setFormIsPinned(e.target.checked)} className="rounded border-white/20 text-[#00dce5] focus:ring-[#00dce5] bg-transparent" />
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
              className="w-full max-w-sm glass-panel rounded-2xl p-6 border border-[#00dce5]/20 relative">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#00dce5] to-transparent" />
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-[#00dce5]/10 border border-[#00dce5]/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-[#00dce5]" />
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
                } catch {
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
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00dce5]/50 transition-all placeholder-[#8e90a2] font-mono text-center tracking-widest text-lg"
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
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00dce5]/50 transition-all placeholder-[#8e90a2] font-mono text-center tracking-widest text-lg"
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
              className="w-full max-w-sm glass-panel rounded-2xl p-6 border border-[#00dce5]/20">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-[#00dce5] shrink-0" />
                <h3 className="font-display font-semibold text-white text-base">Verify Identity</h3>
              </div>
              <p className="text-xs text-[#c4c5d9] mb-4 leading-relaxed">Enter your master passphrase or master key to authorize this action.</p>
              <form onSubmit={handleConfirmVerification} className="space-y-3">
                <div className="relative">
                  <input type={showVerificationInput ? 'text' : 'password'} required autoFocus
                    value={verificationInput} onChange={e => setVerificationInput(e.target.value)}
                    placeholder="Master passphrase or master key"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00dce5]/50 transition-all pr-10" />
                  <button type="button" onClick={() => setShowVerificationInput(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8e90a2] hover:text-white transition-colors">
                    {showVerificationInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {verificationError && <p className="text-xs text-red-400 font-mono">{verificationError}</p>}
                <div className="flex gap-2 justify-end pt-1 border-t border-white/8">
                  <button type="button" onClick={() => { setIsVerificationModalOpen(false); setPendingAction(null); }} className="px-3 py-1.5 text-xs text-[#8e90a2] hover:text-white font-semibold">Cancel</button>
                  <button type="submit" className="px-5 py-1.5 text-xs bg-[#00dce5] text-black font-semibold rounded-lg hover:opacity-90 transition-opacity">Confirm</button>
                </div>
              </form>
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
                toast.type === 'success' ? 'bg-emerald-400' : toast.type === 'error' ? 'bg-red-400' : 'bg-[#00dce5]'
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
