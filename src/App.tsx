import React, { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { 
  Lock, 
  Shield, 
  Search, 
  Bell, 
  Plus, 
  LockOpen, 
  Briefcase, 
  HelpCircle, 
  Edit3, 
  Copy, 
  Trash2, 
  Pin, 
  Check, 
  X, 
  TrendingUp, 
  ShieldCheck, 
  Settings as SettingsIcon,
  RefreshCw,
  LogOut,
  AlertTriangle,
  Fingerprint,
  Download,
  Upload,
  Info,
  ExternalLink,
  LockKeyhole,
  Camera,
  Layers,
  Key,
  Flame,
  Award,
  ChevronRight,
  Sparkles,
  Mail,
  User,
  Eye,
  EyeOff,
  UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import StarfieldBackground from './components/StarfieldBackground';
import { Account, AppSettings } from './types';
import { 
  generateTOTPCode, 
  formatCode, 
  formatFocusedCode, 
  SERVICE_COLORS, 
  INITIAL_ACCOUNTS, 
  getSecurityStrength 
} from './utils';

// Default Master Code
const DEFAULT_PASSCODE = '1234';

export default function App() {
  // --- Persistent Storage State ---
  const [accounts, setAccounts] = useState<Account[]>(() => {
    const saved = localStorage.getItem('onlyauth_accounts_v2');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved); 
        if (parsed && Array.isArray(parsed)) return parsed;
      } catch (e) { console.error(e); }
    }
    return INITIAL_ACCOUNTS;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('onlyauth_settings_v2');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved); 
        if (parsed && parsed.masterPin) return parsed;
      } catch (e) { console.error(e); }
    }
    return { 
      masterPin: DEFAULT_PASSCODE, 
      autoRenewInterval: 30,
      accountListPlacement: 'right',
      lastBackupDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
      customVaults: ['personal', 'work', 'finance', 'social'],
      securityKeys: [
        { id: 'key-1', name: 'Primary YubiKey 5C', keyType: 'FIDO2 / WebAuthn', addedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }
      ]
    };
  });

  // Save to localStorage whenever accounts or settings change
  useEffect(() => {
    localStorage.setItem('onlyauth_accounts_v2', JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem('onlyauth_settings_v2', JSON.stringify(settings));
  }, [settings]);

  // --- App View State ---
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [passcodeError, setPasscodeError] = useState<string>('');
  
  // Dynamic Tab matches selected static or custom vaults
  const [activeTab, setActiveTab] = useState<string>('personal');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [focusedAccountId, setFocusedAccountId] = useState<string>(() => {
    return INITIAL_ACCOUNTS[0]?.id || '';
  });

  // Countdown timer for TOTP codes
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30);
  
  // Modals & Popups state
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const [copyFeedbackMap, setCopyFeedbackMap] = useState<Record<string, boolean>>({});

  // PASSCODE PROTECTION MODAL STATE (For modifying sensitive codes)
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState<boolean>(false);
  const [verificationPass, setVerificationPass] = useState<string>('');
  const [verificationError, setVerificationError] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<{ type: 'save' | 'delete', data?: any } | null>(null);

  // Form Fields for Add/Edit
  const [formName, setFormName] = useState<string>('');
  const [formEmail, setFormEmail] = useState<string>('');
  const [formSecret, setFormSecret] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('personal');
  const [formIsPinned, setFormIsPinned] = useState<boolean>(false);
  const [formLogoType, setFormLogoType] = useState<Account['logoType']>('custom');
  const [formTagsString, setFormTagsString] = useState<string>('production, basic');

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [newPinField, setNewPinField] = useState<string>('');
  const [chatInput, setChatInput] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'system'; text: string; time: string }>>([
    { sender: 'system', text: 'Secured terminal diagnostics helper activated. Ask me anything about hardware tokens, offline encryption vaults, or passphrase strength check parameters.', time: '18:57' }
  ]);

  // Custom Vault creation state
  const [newVaultName, setNewVaultName] = useState<string>('');
  const [isAddingVault, setIsAddingVault] = useState<boolean>(false);

  // Camera importing simulation
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraStatus, setCameraStatus] = useState<string>('Initializing lens access...');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Hardware Security keys state
  const [newKeyName, setNewKeyName] = useState<string>('');
  const [isAddingHardwareKey, setIsAddingHardwareKey] = useState<boolean>(false);

  // Support Agent state
  const [supportEmailInput, setSupportEmailInput] = useState<string>('user@example.com');
  const [supportMessage, setSupportMessage] = useState<string>('');
  const [supportSubject, setSupportSubject] = useState<string>('Hardware-bound OTP credential recovery');
  const [isSupportSending, setIsSupportSending] = useState<boolean>(false);
  const [supportSuccess, setSupportSuccess] = useState<boolean>(false);

  // Time-tick to regenerate organic TOTP values every tick interval
  useEffect(() => {
    const updateTime = () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const remaining = 30 - (nowSeconds % 30);
      setSecondsRemaining(remaining);
    };

    updateTime();
    const intervalId = setInterval(updateTime, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Set default focus account if deleted or missing
  useEffect(() => {
    if (accounts.length > 0) {
      const exists = accounts.some(a => a.id === focusedAccountId);
      if (!exists) {
        setFocusedAccountId(accounts[0].id);
      }
    }
  }, [accounts, focusedAccountId]);

  // Sync Form when Editing triggers
  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setFormName(account.name);
    setFormEmail(account.email);
    setFormSecret(account.secret);
    setFormNotes(account.notes);
    setFormCategory(account.category);
    setFormIsPinned(account.isPinned);
    setFormLogoType(account.logoType);
    setFormTagsString(account.tags ? account.tags.join(', ') : 'production, core');
    setIsAddModalOpen(true);
  };

  const openAddModal = () => {
    setEditingAccount(null);
    setFormName('');
    setFormEmail('');
    setFormSecret('');
    setFormNotes('');
    setFormCategory(settings.customVaults.includes(activeTab) ? activeTab : 'personal');
    setFormIsPinned(false);
    setFormLogoType('custom');
    setFormTagsString('production');
    setIsAddModalOpen(true);
  };

  // Generate a premium Base32-compliant random secret key
  const handleGenerateSecret = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormSecret(result);
  };

  // Safe handler verifying PIN whenever trying to Save/Delete
  const triggerVerifyAction = (type: 'save' | 'delete', data?: any) => {
    setPendingAction({ type, data });
    setVerificationPass('');
    setVerificationError('');
    setIsVerificationModalOpen(true);
  };

  const handleConfirmVerification = (e: FormEvent) => {
    e.preventDefault();
    if (verificationPass === settings.masterPin) {
      // Passcode checks out! Perform the pending task securely
      if (pendingAction) {
        if (pendingAction.type === 'save') {
          saveAccountConfirmed();
        } else if (pendingAction.type === 'delete') {
          deleteAccountConfirmed(pendingAction.data);
        }
      }
      setIsVerificationModalOpen(false);
      setPendingAction(null);
    } else {
      setVerificationError('Master passcode verification failed. Access denied to modify credentials.');
    }
  };

  // Save logic after verification matches
  const saveAccountConfirmed = () => {
    const parsedTags = formTagsString
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (editingAccount) {
      // Update account key
      const updated = accounts.map(acc => {
        if (acc.id === editingAccount.id) {
          return {
            ...acc,
            name: formName,
            email: formEmail,
            secret: formSecret,
            notes: formNotes,
            category: formCategory,
            isPinned: formIsPinned,
            logoType: formLogoType,
            tags: parsedTags
          };
        }
        return acc;
      });
      setAccounts(updated);
    } else {
      // Add new key
      const newAcc: Account = {
        id: `acc-${Date.now()}`,
        name: formName,
        email: formEmail,
        secret: formSecret,
        notes: formNotes || `Encrypted MFA credentials for ${formName}`,
        category: formCategory,
        isPinned: formIsPinned,
        logoType: formLogoType,
        tags: parsedTags,
        createdAt: new Date().toISOString()
      };
      setAccounts([newAcc, ...accounts]);
      setFocusedAccountId(newAcc.id);
    }

    setIsAddModalOpen(false);
    setEditingAccount(null);
  };

  // Delete logic after passcode passed
  const deleteAccountConfirmed = (id: string) => {
    const filtered = accounts.filter(acc => acc.id !== id);
    setAccounts(filtered);
    setIsAddModalOpen(false);
    setEditingAccount(null);
    if (focusedAccountId === id && filtered.length > 0) {
      setFocusedAccountId(filtered[0].id);
    }
  };

  // Pin/Unpin trigger option directly
  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = accounts.map(acc => {
      if (acc.id === id) {
        return { ...acc, isPinned: !acc.isPinned };
      }
      return acc;
    });
    setAccounts(updated);
  };

  // Camera scanned simulation or real hook
  const startCameraScan = async () => {
    setIsCameraActive(true);
    setCameraStatus('Requesting hardware frame access...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraStatus('Lens active. Point scanner at standard Only Auth QR code.');
    } catch (err) {
      setCameraStatus('No camera stream detected. Click "Inject Simulated Key" below to scan sample card instantly.');
    }
  };

  const stopCameraScan = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setIsCameraActive(false);
  };

  const injectScannedQRResult = () => {
    // Generate simulated QR Scan Base32 components
    const mockNames = ['Google Cloud Admin', 'Kraken Exchange Ledger', 'Dev-Cluster Docker Auth', 'Vercel Deploy Key', 'Supercell Admin Console'];
    const mockLogos: Array<Account['logoType']> = ['google', 'aws', 'custom', 'custom', 'slack'];
    const idx = Math.floor(Math.random() * mockNames.length);
    
    setFormName(mockNames[idx]);
    setFormEmail('cyber-operator@secure-layer.net');
    
    // Generate secure secret key
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    for (let i = 0; i < 16; i++) {
       result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormSecret(result);
    setFormLogoType(mockLogos[idx]);
    setFormNotes(`Imported via Camera QR scanner stream on ${new Date().toLocaleDateString()}`);
    setFormTagsString('camera-scanned, critical');
    
    stopCameraScan();
  };

  // Hardware Security Key registration simulation
  const registerNewSecurityKey = (e: FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    const newKey = {
      id: `key-${Date.now()}`,
      name: newKeyName,
      keyType: 'FIDO2 WebAuthn Token',
      addedAt: new Date().toISOString()
    };

    setSettings(prev => ({
      ...prev,
      securityKeys: [...prev.securityKeys, newKey]
    }));
    setNewKeyName('');
    setIsAddingHardwareKey(false);
  };

  const deleteHardwareKey = (id: string) => {
    setSettings(prev => ({
      ...prev,
      securityKeys: prev.securityKeys.filter(k => k.id !== id)
    }));
  };

  // Vault creator
  const createCustomVault = (e: FormEvent) => {
    e.preventDefault();
    const sanitizedInput = newVaultName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!sanitizedInput) return;
    
    if (settings.customVaults.includes(sanitizedInput)) {
      alert('This vault already exists.');
      return;
    }

    setSettings(prev => ({
      ...prev,
      customVaults: [...prev.customVaults, sanitizedInput]
    }));
    setNewVaultName('');
    setIsAddingVault(false);
    setActiveTab(sanitizedInput);
  };

  const deleteCustomVault = (vault: string) => {
    if (['personal', 'work'].includes(vault)) {
      alert('Default vaults cannot be deleted.');
      return;
    }
    if (confirm(`Are you sure you want to remove the ${vault} vault categorization? Accounts will be reassigned to "personal".`)) {
      // Reassign accounts inside deleted vault
      const reassigned = accounts.map(acc => {
        if (acc.category === vault) {
          return { ...acc, category: 'personal' };
        }
        return acc;
      });
      setAccounts(reassigned);

      setSettings(prev => ({
        ...prev,
        customVaults: prev.customVaults.filter(v => v !== vault)
      }));
      setActiveTab('personal');
    }
  };

  // Download key dump backup
  const handleDownloadBackup = () => {
    const backupData = JSON.stringify({ accounts, settings }, null, 2);
    const blob = new Blob([backupData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OnlyAuth_Sophisticated_Backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Record last backup timestamp
    setSettings(prev => ({
      ...prev,
      lastBackupDate: new Date().toISOString()
    }));
  };

  const getLogoAbbreviation = (name: string, logoType: string) => {
    if (logoType && logoType !== 'custom') {
      if (logoType === 'slack') return 'SL';
      return logoType.substring(0, 2).toUpperCase();
    }
    if (!name) return '??';
    const split = name.trim().split(/\s+/);
    if (split.length > 1) {
      return (split[0][0] + (split[1][0] || '')).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleUpdatePin = (e: FormEvent) => {
    e.preventDefault();
    if (newPinField.trim().length < 4) {
      alert('Master PIN lock must feel secure. Provide at least 4 alphanumeric digits.');
      return;
    }
    setSettings(prev => ({
      ...prev,
      masterPin: newPinField.trim()
    }));
    setNewPinField('');
    alert('Security Gate Master passcode updated successfully.');
  };

  const handleUploadBackup = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.accounts)) {
            setAccounts(parsed.accounts);
          }
          if (parsed.settings && parsed.settings.masterPin) {
            setSettings(parsed.settings);
          }
          alert('Successfully restored Only Auth credentials and vault layouts from standard backup payload!');
        } else {
          alert('Invalid backup matrix payload. Verify structure.');
        }
      } catch (err) {
        alert('Could not decode JSON payload: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const handleResetDefaults = () => {
    if (confirm('Revert all accounts to standard sandbox defaults? Current custom keys will be removed from local cache memory.')) {
      setAccounts(INITIAL_ACCOUNTS);
      alert('Vault state successfully reset back to sample values.');
    }
  };

  const handleSendCommand = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput.trim();
    const timeStr = new Date().toTimeString().slice(0, 5);
    const newMsgs = [...chatMessages, { sender: 'user' as const, text: userMsg, time: timeStr }];
    setChatMessages(newMsgs);
    setChatInput('');

    // Generate responsive bot support answer
    let botResponse = "To fortify your key security sequence, navigate to Settings & Lay-out and change the active Master PIN code. Only Auth uses 100% offline Javascript generation.";
    const query = userMsg.toLowerCase();
    if (query.includes('totp') || query.includes('how work') || query.includes('algorithm')) {
      botResponse = "TOTP (Time-based One-time Password) derives dynamic 6 digit alphanumeric hashes synchronously every 30s block using HMAC-SHA1 algorithms mixed with your secret seed keys.";
    } else if (query.includes('camera') || query.includes('scan') || query.includes('qr')) {
      botResponse = "Under Add Seed, click 'sensor scan'. Point your device's camera stream at any compliant 2FA barcode format, or click simulated bypass to auto-generate seeds.";
    } else if (query.includes('pin') || query.includes('passcode') || query.includes('lock')) {
      botResponse = "Your active master passcode configuration is handled locally in your browser. If you lose this 4-digit token, you can import diagnostic backups at any time.";
    } else if (query.includes('backup') || query.includes('safe') || query.includes('cloud')) {
      botResponse = "Only Auth is a 100% local, safe zero-trust vault. Download your encrypted backup files to secure seeds offline. No database sync is used to prevent leaks.";
    } else if (query.includes('yubikey') || query.includes('fido') || query.includes('hardware')) {
      botResponse = "Hardware key integrations bind credentials to physical WebAuthn authenticators. Click Register in Security Check to bind a FIDO2 token descriptor.";
    }

    setTimeout(() => {
      setChatMessages(prev => [...prev, { sender: 'system' as const, text: botResponse, time: timeStr }]);
    }, 700);
  };

  // Copy helper
  const handleCopyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopyFeedbackMap(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopyFeedbackMap(prev => ({ ...prev, [id]: false }));
    }, 1500);
  };

  // Trigger simulated support ticket dispatch to user email
  const handleSendSupportTicket = (e: FormEvent) => {
    e.preventDefault();
    if (!supportMessage.trim()) return;

    setIsSupportSending(true);
    setTimeout(() => {
      setIsSupportSending(false);
      setSupportSuccess(true);
      setSupportMessage('');
      // Log notification
      alert(`Cryptographic support dispatch successfully sent to: ${supportEmailInput}`);
    }, 1500);
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcodeInput === settings.masterPin) {
      setIsLocked(false);
      setPasscodeError('');
      setPasscodeInput('');
    } else {
      setPasscodeError('Access denied. Invalid cryptographic master passcode.');
      setPasscodeInput('');
    }
  };

  const handleKeyPress = (num: string) => {
    setPasscodeError('');
    if (passcodeInput.length < 8) {
      setPasscodeInput(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    setPasscodeInput(prev => prev.slice(0, -1));
  };

  // Check overall passkey strength
  const passkeyStrength = getSecurityStrength(settings.masterPin);

  // Accounts filtering logic
  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = 
      acc.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      acc.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (acc.tags && acc.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))) ||
      acc.notes.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Categorize dynamic vaults
    return matchesSearch && acc.category === activeTab;
  });

  const focusedAccount = accounts.find(acc => acc.id === focusedAccountId) || accounts[0] || null;
  const focusedCode = focusedAccount ? generateTOTPCode(focusedAccount.secret, settings.autoRenewInterval) : '000000';
  const focusedCodeFormatted = formatFocusedCode(focusedCode);

  return (
    <div className="relative min-h-screen w-full flex select-none text-[#eaeaea] font-sans antialiased overflow-hidden">
      {/* 1. Starfield Experience */}
      <StarfieldBackground speed={isLocked ? 0.2 : 0.8} />

      {/* 2. Entrance Screen - Vault Decrypt PIN Lock */}
      <AnimatePresence mode="wait">
        {isLocked ? (
          <motion.div
            key="lock-screen"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20, filter: 'blur(15px)' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-3xl"
          >
            <div className="absolute top-8 left-8 flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-mono tracking-widest text-[#888] uppercase select-none">Only Auth Vault System</span>
            </div>

            <div className="w-full max-w-md glass-panel p-8 rounded-3xl flex flex-col items-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C5A059] to-transparent" />
              
              <div className="w-20 h-20 rounded-full flex items-center justify-center bg-[#C5A059]/10 border border-[#C5A059]/20 relative mb-6 shadow-inner">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-1.5 border border-dashed border-[#C5A059]/10 rounded-full"
                />
                <Lock className="w-6 h-6 text-[#C5A059]" />
              </div>

              <h2 className="text-3xl font-display font-medium text-white tracking-tight text-center mb-1">Decrypt Vault Keys</h2>
              <p className="text-xs text-[#888] text-center mb-6 max-w-xs leading-relaxed">
                Provide your master passcode sequence to unlock standard cryptographic seeds.
                <span className="block mt-2 font-mono text-[#C5A059] text-[11px] bg-[#C5A059]/5 px-3 py-1 rounded-full border border-[#C5A059]/10">Default Passcode: {DEFAULT_PASSCODE}</span>
              </p>

              <form onSubmit={handleUnlock} className="w-full flex flex-col gap-6">
                {/* Simulated dynamic dial-pad status indicators */}
                <div className="flex justify-center gap-3.5 py-1">
                  {[0, 1, 2, 3].map((index) => {
                    const hasValue = passcodeInput.length > index;
                    return (
                      <motion.div 
                        key={index} 
                        animate={{ 
                          scale: hasValue ? 1.25 : 1,
                          backgroundColor: hasValue ? '#C5A059' : 'rgba(255, 255, 255, 0.05)' 
                        }}
                        className="w-3.5 h-3.5 rounded-full border border-white/5 transition-colors duration-150"
                      />
                    );
                  })}
                </div>

                {passcodeError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-300 bg-red-950/20 border border-red-900/30 rounded-xl p-3 flex items-start gap-2.5"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                    <span className="leading-relaxed">{passcodeError}</span>
                  </motion.div>
                )}

                {/* Classic Dial sequence keypad */}
                <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto w-full pt-1">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleKeyPress(num)}
                      className="h-14 rounded-2xl bg-white/5 border border-white/5 text-xl font-medium text-white hover:bg-white/10 hover:border-[#C5A059]/40 hover:text-[#C5A059] transition-all duration-150 flex items-center justify-center font-mono"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="h-14 rounded-2xl bg-white/5 border border-white/5 text-xs font-semibold text-[#888] hover:bg-white/10 hover:text-white transition-all duration-150 flex items-center justify-center"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeyPress('0')}
                    className="h-14 rounded-2xl bg-white/5 border border-white/5 text-xl font-medium text-white hover:bg-white/10 hover:text-[#C5A059] transition-all duration-150 flex items-center justify-center font-mono"
                  >
                    0
                  </button>
                  <button
                    type="submit"
                    className="h-14 rounded-2xl bg-[#C5A059] text-black font-semibold text-xs uppercase tracking-wider hover:bg-[#b08b47] transition-all duration-150 flex items-center justify-center shadow-[0_0_20px_rgba(197,160,89,0.25)]"
                  >
                    Enter
                  </button>
                </div>
              </form>

              {/* Secure simulated touch bio lock link option */}
              <div className="mt-8 pt-5 border-t border-white/5 w-full flex items-center justify-center">
                <button 
                  type="button"
                  onClick={() => {
                    setPasscodeInput(settings.masterPin);
                  }}
                  className="flex items-center gap-2 text-xs text-[#C5A059] hover:text-white transition-colors duration-200"
                >
                  <Fingerprint className="w-5 h-5 shrink-0" />
                  <span>Simulated Biometric Bypass</span>
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <div key="loaded-frame" className="w-full min-h-screen flex text-[#eaeaea] animate-fade-in">
            
            {/* 3. Navigation Sidebar */}
            <aside 
              className={`fixed inset-y-0 left-0 z-50 flex flex-col h-full bg-[#121212]/80 backdrop-blur-3xl border-r border-[#222] transition-all duration-300 ${
                sidebarCollapsed ? 'w-20' : 'w-80'
              } hidden md:flex`}
            >
              {/* Sidebar Header */}
              <div className="h-20 px-6 flex items-center justify-between shrink-0 border-b border-[#222]">
                <div className={`flex items-center gap-3 transition-all duration-300 ${sidebarCollapsed ? 'opacity-0 scale-75 w-0 overflow-hidden' : 'opacity-100'}`}>
                  <div className="w-8 h-8 rounded-lg bg-[#C5A059]/10 border border-[#C5A059]/20 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-[#C5A059]" />
                  </div>
                  <span className="font-display font-medium text-lg tracking-tight text-white whitespace-nowrap">Only Auth</span>
                </div>
                
                <button 
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-[#888] hover:text-white transition-colors bg-white/[0.02] border border-[#222]"
                >
                  <span className="text-xs">{sidebarCollapsed ? '→' : '←'}</span>
                </button>
              </div>

              {/* Sidebar Tabs Links & Custom dynamic Vault list */}
              <div className="flex-1 overflow-y-auto py-6 px-4 space-y-4">
                
                {/* Static Vault categories header */}
                <div className={`text-[10px] font-semibold text-[#888] uppercase tracking-[0.2em] mb-2 px-2 transition-all ${sidebarCollapsed ? 'opacity-0 scale-75 h-0 overflow-hidden' : 'opacity-100'}`}>
                  Storage Vaults
                </div>

                <div className="space-y-1.5">
                  {settings.customVaults.map(vault => {
                    const isTabActive = activeTab === vault;
                    const count = accounts.filter(a => a.category === vault).length;
                    
                    return (
                      <div key={vault} className="flex items-center justify-between group">
                        <button
                          onClick={() => setActiveTab(vault)}
                          className={`flex-1 flex items-center justify-between rounded-lg px-4 py-3 text-xs tracking-wide transition-all ${
                            isTabActive 
                              ? 'bg-[#C5A059]/10 text-white font-semibold border-l-2 border-[#C5A059] pl-3' 
                              : 'text-[#888] hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {vault === 'personal' ? (
                              <LockOpen className="w-4 h-4 shrink-0" />
                            ) : vault === 'work' ? (
                              <Briefcase className="w-4 h-4 shrink-0" />
                            ) : (
                              <Layers className="w-4 h-4 shrink-0 text-[#C5A059]/80" />
                            )}
                            <span className={`capitalize truncate transition-all ${sidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
                              {vault}
                            </span>
                          </div>
                          
                          {!sidebarCollapsed && count > 0 && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${isTabActive ? 'bg-[#C5A059] text-black font-semibold' : 'bg-[#222] text-[#888]'}`}>
                              {count}
                            </span>
                          )}
                        </button>

                        {/* Delete Vault Option on custom vaults */}
                        {!['personal', 'work'].includes(vault) && !sidebarCollapsed && (
                          <button 
                            onClick={() => deleteCustomVault(vault)}
                            className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:text-red-300 transition-opacity ml-1"
                            title="Delete custom vault categorization"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Adding Custom Vault trigger */}
                {!sidebarCollapsed && (
                  <div className="pt-2">
                    {isAddingVault ? (
                      <form onSubmit={createCustomVault} className="space-y-2 bg-[#121212] p-2.5 rounded-xl border border-[#222]">
                        <input 
                          type="text" 
                          required
                          value={newVaultName}
                          onChange={(e) => setNewVaultName(e.target.value)}
                          placeholder="Vault name..."
                          className="w-full bg-[#080808] border border-[#222] rounded-lg p-2 text-xs focus:outline-none focus:border-[#C5A059] text-white"
                        />
                        <div className="flex gap-2.5">
                          <button type="submit" className="text-[10px] bg-[#C5A059] text-black font-semibold px-2 py-1 rounded">Create</button>
                          <button type="button" onClick={() => setIsAddingVault(false)} className="text-[10px] text-[#888] hover:text-white px-2 py-1">Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <button 
                        onClick={() => setIsAddingVault(true)}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/[0.02] border border-dashed border-[#222] text-[11px] text-[#888] hover:text-[#C5A059] hover:border-[#C5A059]/40 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Custom Vault</span>
                      </button>
                    )}
                  </div>
                )}

                {/* General administrative tabs selection block */}
                <div className="pt-4 mt-4 border-t border-[#222] space-y-1.5">
                  {[
                    { value: 'security', label: 'Security Check', icon: ShieldCheck },
                    { value: 'settings', label: 'Settings & Lay-out', icon: SettingsIcon },
                    { value: 'support', label: 'Support Concierge', icon: HelpCircle }
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isTabActive = activeTab === tab.value;
                    return (
                      <button
                        key={tab.value}
                        onClick={() => setActiveTab(tab.value)}
                        className={`w-full flex items-center gap-3.5 rounded-lg px-4 py-3 text-xs tracking-wide transition-all ${
                          isTabActive 
                            ? 'bg-[#C5A059]/10 text-white font-semibold border-l-2 border-[#C5A059] pl-3' 
                            : 'text-[#888] hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className={`truncate transition-all ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                          {tab.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

              </div>

              {/* Sidebar bottom user trigger */}
              <div className="p-4 mt-auto border-t border-[#222] bg-white/[0.01]">
                <div className="p-3.5 rounded-2xl bg-[#121212] border border-[#222] flex flex-col gap-3.5">
                  <div className={`flex items-center gap-3.5 ${sidebarCollapsed ? 'justify-center' : ''}`}>
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#C5A059] to-amber-700 flex items-center justify-center text-black font-semibold shrink-0">
                      DA
                    </div>
                    {!sidebarCollapsed && (
                      <div className="min-w-0">
                        <h4 className="text-white text-xs font-semibold truncate">Dev Account</h4>
                        <p className="text-[10px] text-accent uppercase tracking-wider font-semibold">Fortified Vault</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setIsLocked(true)}
                    className="w-full py-2.5 bg-red-950/20 hover:bg-red-950/40 border border-red-500/10 hover:border-red-500/30 text-xs font-semibold text-red-400 hover:text-red-300 rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    {!sidebarCollapsed && <span>Lock Vault Keys</span>}
                  </button>
                </div>
              </div>
            </aside>

            {/* 4. Main Panel Layout */}
            <main className={`flex-1 flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-80'} h-screen overflow-hidden`}>
              
              {/* Header Container */}
              <header className="w-full h-20 px-6 md:px-10 flex items-center justify-between border-b border-[#222] shrink-0 relative z-20">
                <div className="flex items-center gap-4">
                  <h1 className="font-display font-medium text-3xl text-white tracking-tight capitalize leading-none pt-1">
                    {activeTab}
                  </h1>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-[#121212] border border-[#222] text-[#888] tracking-widest font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059] animate-pulse" />
                    <span>SECURE TERMINAL</span>
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {/* Global filter inputs */}
                  {!['security', 'settings', 'support'].includes(activeTab) && (
                    <div className="relative hidden md:block">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#888]" />
                      <input 
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search keys or tags..."
                        className="w-60 bg-[#121212] border border-[#222] rounded-full py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-[#C5A059] transition-all placeholder-[#888]"
                      />
                    </div>
                  )}

                  <button 
                    onClick={openAddModal}
                    className="h-10 px-4 rounded-lg bg-transparent border border-[#C5A059] text-[#C5A059] hover:bg-[#C5A059]/10 transition-all font-semibold uppercase tracking-wider text-xs flex items-center gap-2 shadow-[0_0_15px_rgba(197,160,89,0.05)]"
                  >
                    <Plus className="w-4 h-4 shrink-0 stroke-[3px]" />
                    <span>New Key Seed</span>
                  </button>
                </div>
              </header>

              {/* Central Pages Hub Container */}
              <div className="flex-1 overflow-y-auto p-6 md:p-10">
                
                {activeTab !== 'security' && activeTab !== 'settings' && activeTab !== 'support' ? (
                  /* VAULT MAIN VIEW PANEL GRID layout placement config dynamic switcher checks */
                  <div className={`flex flex-col ${settings.accountListPlacement === 'right' ? 'xl:flex-row' : 'flex-col'} gap-10 items-stretch`}>
                    
                    {/* Left/Upper Screen section: Focus TOTP generation Card */}
                    <div className="flex-1 space-y-8 min-w-0">
                      
                      {focusedAccount ? (
                        /* Beautiful animated gold highlight focused card */
                        <div className="glass-panel-accent rounded-3xl p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden transition-all duration-300 w-full hover:shadow-[0_0_40px_rgba(197,160,89,0.06)] border border-[#C5A059]/30">
                          
                          <div className="flex justify-between items-start w-full relative z-10">
                            <div className="flex items-center gap-4.5 min-w-0">
                              <div className="w-14 h-14 bg-[#121212] rounded-xl flex items-center justify-center border border-[#C5A059]/20 font-display font-semibold text-lg text-[#C5A059] shadow-inner shrink-0 scale-hover">
                                {focusedAccount.logoType === 'github' ? 'G' : focusedAccount.logoType === 'google' ? 'G' : focusedAccount.logoType === 'aws' ? 'A' : getLogoAbbreviation(focusedAccount.name, focusedAccount.logoType)}
                              </div>
                              <div className="min-w-0">
                                <h2 className="font-display font-medium text-[#eaeaea] text-xl md:text-2xl truncate leading-tight tracking-tight">
                                  {focusedAccount.name}
                                </h2>
                                <p className="text-xs text-[#888] truncate mt-1">
                                  {focusedAccount.email}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Trigger pin status */}
                              <button 
                                onClick={(e) => handleTogglePin(focusedAccount.id, e)}
                                className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-150 ${
                                  focusedAccount.isPinned 
                                    ? 'bg-[#C5A059]/10 border-[#C5A059] text-[#C5A059]' 
                                    : 'bg-white/[0.02] border-[#222] text-[#888] hover:text-white'
                                }`}
                                title={focusedAccount.isPinned ? 'Unpin from quick axis' : 'Pin to quick axis'}
                              >
                                <Pin className="w-4 h-4" />
                              </button>

                              <button 
                                onClick={() => openEditModal(focusedAccount)}
                                className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.02] border border-[#222] hover:bg-white/5 text-[#888] hover:text-[#C5A059] transition-all duration-150"
                                title="Edit Seed Details"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              <button 
                                onClick={() => triggerVerifyAction('delete', focusedAccount.id)}
                                className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-950/20 border border-red-500/10 hover:bg-red-950/40 hover:border-red-500/30 text-red-400 transition-all duration-150"
                                title="Discard Seed permanently"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Central code reader screen display digits */}
                          <div className="flex flex-col items-center justify-center py-8 relative z-10">
                            <motion.div 
                              key={focusedCode}
                              initial={{ opacity: 0.8, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="font-display font-medium text-5xl md:text-6xl text-white flex items-center gap-5 tracking-widest cursor-pointer group hover:text-[#C5A059] transition-colors"
                              onClick={() => handleCopyCode(focusedAccount.id, focusedCode)}
                              title="Click code block to copy"
                            >
                              <span>{focusedCodeFormatted.first}</span>
                              <span className="w-2.5 h-2.5 bg-[#C5A059]/40 rounded-full animate-pulse shrink-0" />
                              <span>{focusedCodeFormatted.second}</span>
                            </motion.div>

                            {/* Tags labels displays */}
                            {focusedAccount.tags && focusedAccount.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-5 justify-center max-w-sm">
                                {focusedAccount.tags.map(tag => (
                                  <span key={tag} className="text-[9px] font-mono tracking-wider font-semibold uppercase bg-[#C5A059]/5 px-2.5 py-0.5 rounded text-[#C5A059] border border-[#C5A059]/10">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Copy notifier dynamic state bubble pop overlay */}
                            {copyFeedbackMap[focusedAccount.id] && (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-4 text-xs font-semibold text-[#C5A059] flex items-center gap-1.5 bg-[#C5A059]/10 px-3.5 py-1 rounded-full border border-[#C5A059]/20"
                              >
                                <Check className="w-3.5 h-3.5 text-[#C5A059]" />
                                <span>Copied Hardware Token!</span>
                              </motion.div>
                            )}
                          </div>

                          {/* Notes/Metadata card bottom details container */}
                          <div className="flex flex-col gap-4 border-t border-[#222]/30 pt-4 mt-auto">
                            <div className="flex flex-col gap-1">
                              <p className="text-[10px] tracking-wider uppercase font-semibold text-[#888]">Metadata Details</p>
                              <p className="text-xs text-[#888] leading-relaxed italic pr-6 focus-notes pb-2">
                                {focusedAccount.notes || 'Encrypted baseline vault entry. No supplementary data logs stored.'}
                              </p>
                            </div>

                            <div className="flex items-center justify-between text-xs border-t border-white/[0.03] pt-3">
                              <span className="text-[#888]">
                                Regenerating secret rotation cycle in <span className="font-mono text-white font-semibold">{secondsRemaining}s</span>
                              </span>
                              <button 
                                onClick={() => handleCopyCode(focusedAccount.id, focusedCode)}
                                className="text-xs text-[#C5A059] hover:underline flex items-center gap-1 hover:text-white"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Static Token</span>
                              </button>
                            </div>

                            {/* Progressive dynamic gold timer line */}
                            <div className="h-[2px] bg-white/5 rounded-full overflow-hidden w-full relative">
                              <div 
                                className="h-full progress-bar-inner bg-[#C5A059] shadow-[0_0_10px_rgba(197,160,89,0.3)]"
                                style={{ width: `${(secondsRemaining / 30) * 100}%` }}
                              />
                            </div>
                          </div>

                        </div>
                      ) : (
                        <div className="glass-panel p-10 text-center rounded-2xl flex flex-col items-center justify-center text-[#888] space-y-4">
                          <Lock className="w-12 h-12 text-[#222]" />
                          <p className="text-sm font-light">No credentials initialized inside the active "{activeTab}" partition yet.</p>
                          <button onClick={openAddModal} className="text-[#C5A059] underline font-semibold text-xs uppercase tracking-wider">Initialize Key Seed</button>
                        </div>
                      )}

                      {/* Quick horizontal pinned scroller inside Vault view */}
                      {accounts.filter(a => a.isPinned).length > 0 && (
                        <div className="space-y-4 pt-2">
                          <div className="flex items-center gap-2">
                            <Pin className="w-3.5 h-3.5 text-[#C5A059]" />
                            <h3 className="text-[10px] tracking-widest uppercase font-semibold text-[#888]">Quick Link Pinned Matrix</h3>
                          </div>
                          
                          <div className="flex gap-4 overflow-x-auto pb-2.5 no-scrollbar scroll-smooth">
                            {accounts.filter(a => a.isPinned).map(acc => {
                              const pCode = generateTOTPCode(acc.secret, settings.autoRenewInterval);
                              const pCodeFormatted = formatCode(pCode);
                              const isSelected = focusedAccountId === acc.id;
                              
                              return (
                                <div 
                                  key={acc.id}
                                  onClick={() => setFocusedAccountId(acc.id)}
                                  className={`glass-panel min-w-[250px] max-w-[270px] rounded-xl p-4 flex flex-col gap-4.5 cursor-pointer transition-all duration-300 shrink-0 ${
                                    isSelected 
                                      ? 'border-[#C5A059] bg-[#C5A059]/5 scale-[1.01]' 
                                      : 'hover:bg-white/5 hover:border-[#333]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-3 w-full">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-9 h-9 rounded-lg bg-white/5 border border-[#222] flex items-center justify-center text-[#C5A059] font-bold text-xs shrink-0 font-mono">
                                        {acc.logoType === 'google' ? 'G' : acc.logoType === 'aws' ? 'A' : getLogoAbbreviation(acc.name, acc.logoType)}
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className="font-semibold text-white text-xs truncate leading-tight">{acc.name}</h4>
                                        <p className="text-[10px] text-[#888] truncate mt-0.5">{acc.email}</p>
                                      </div>
                                    </div>
                                    <button 
                                      onClick={(e) => handleTogglePin(acc.id, e)}
                                      className="text-[#C5A059] hover:text-white transition-colors"
                                      title="Unpin account"
                                    >
                                      <Pin className="w-3.5 h-3.5 fill-current" />
                                    </button>
                                  </div>

                                  <div className="flex justify-between items-end gap-2 text-white">
                                    <span className="font-mono text-xl font-bold tracking-widest leading-none text-[#eaeaea]">{pCodeFormatted}</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCopyCode(acc.id, pCode);
                                      }}
                                      className="w-8 h-8 rounded-lg bg-white/5 border border-[#222] hover:bg-white/10 flex items-center justify-center text-[#888] hover:text-[#C5A059]"
                                    >
                                      {copyFeedbackMap[acc.id] ? <Check className="w-4 h-4 text-[#C5A059]" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    </div>

                    {/* Standard Right/Lower layout selector matching layout options settings toggled easily */}
                    <div className={`flex flex-col gap-4 shrink-0 ${settings.accountListPlacement === 'right' ? 'w-full xl:w-96' : 'w-full'}`}>
                      <div className="flex justify-between items-center mb-1">
                        <h3 className="text-[10px] tracking-widest uppercase font-semibold text-[#888]">Account List Row Matrix</h3>
                        <span className="text-[10px] font-mono text-[#888]">
                          {filteredAccounts.length} match records available
                        </span>
                      </div>

                      {/* Flex grid containing vertical account rows list with smooth active gold edge border highlighting */}
                      <div className={`grid gap-3.5 ${settings.accountListPlacement === 'right' ? 'grid-cols-1 max-h-[85vh] overflow-y-auto pr-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                        {filteredAccounts.length > 0 ? (
                          filteredAccounts.map(acc => {
                            const isFocused = focusedAccountId === acc.id;
                            const isCopied = copyFeedbackMap[acc.id];
                            const aCode = generateTOTPCode(acc.secret, settings.autoRenewInterval);
                            const formattedSeedCode = formatCode(aCode);
                            
                            return (
                              <motion.div
                                key={acc.id}
                                onClick={() => setFocusedAccountId(acc.id)}
                                whileHover={{ scale: 1.015 }}
                                whileTap={{ scale: 0.99 }}
                                className={`rounded-xl p-4 flex items-center justify-between border cursor-pointer transition-all duration-200 group relative ${
                                  isFocused 
                                    ? 'bg-[#121212] border-[#C5A059] shadow-[0_0_15px_rgba(197,160,89,0.06)]' 
                                    : 'bg-[#121212] border-[#222] hover:border-[#333]'
                                }`}
                              >
                                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                  {/* Initials mapping */}
                                  <div className={`w-10 h-10 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center shrink-0 font-bold text-xs text-[#C5A059]`}>
                                    {getLogoAbbreviation(acc.name, acc.logoType)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 justify-start">
                                      <h4 className="font-semibold text-white text-xs truncate leading-snug">{acc.name}</h4>
                                      {acc.isPinned && <Pin className="w-3 h-3 text-[#C5A059]/60 shrink-0 fill-current" />}
                                    </div>
                                    <p className="text-[10px] text-[#888] truncate mt-0.5">{acc.email}</p>
                                  </div>
                                </div>

                                {/* Custom copy overlay indicator triggers */}
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyCode(acc.id, aCode);
                                  }}
                                  className="ml-4 shrink-0 relative w-20 h-10 flex items-center justify-end font-mono"
                                  title="Quick Copy code"
                                >
                                  {/* Code shown by default */}
                                  <div className="group-hover:opacity-0 transition-opacity duration-150 text-right">
                                    <span className="text-xs font-semibold text-white tracking-widest font-mono">
                                      {formattedSeedCode}
                                    </span>
                                  </div>

                                  {/* Copy interaction box when hovered */}
                                  <div className="absolute inset-0 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                    <span className="text-[9px] font-semibold text-[#C5A059] flex items-center gap-1 bg-[#C5A059]/10 px-2 py-1 rounded border border-[#C5A059]/20 font-sans uppercase">
                                      {isCopied ? <Check className="w-3.5 h-3.5 text-[#C5A059]" /> : <Copy className="w-3 h-3" />}
                                      <span>{isCopied ? 'COPIED' : 'COPY'}</span>
                                    </span>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })
                        ) : (
                          <div className="glass-panel p-8 text-center text-xs text-[#888] rounded-xl font-light col-span-full">
                            No account seed matches this vault partition query.
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                ) : activeTab === 'security' ? (
                  /* HIGH FIDELITY SECURITY AUDIT SCREEN PANEL */
                  <div className="max-w-4xl space-y-8 animate-fade-in">
                    
                    {/* Master audit percentage status */}
                    <div className="glass-panel rounded-3xl p-6 md:p-8 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 border border-[#222]">
                      <div className="absolute inset-0 bg-[#C5A059]/5 filter blur-3xl pointer-events-none -z-10" />
                      
                      <div className="space-y-3.5 max-w-lg">
                        <span className="text-[10px] tracking-wider uppercase font-semibold text-[#888] font-mono">Vault Strength Analysis</span>
                        <h2 className="text-3xl font-display font-medium text-white tracking-tight">Active Defensive Safeguards</h2>
                        <p className="text-xs text-[#888] leading-relaxed">
                          We parse the integrity of local seeds, backup frequency patterns, and cryptographic keys mapped dynamically inside sandbox variables to estimate your security baseline.
                        </p>
                      </div>

                      {/* Security gauge wheel simulation */}
                      <div className="w-32 h-32 rounded-full border-4 border-[#222] relative flex flex-col items-center justify-center text-center p-2">
                        <div className="absolute inset-0 rounded-full border-4 border-dashed border-[#C5A059]/40" />
                        <span className="text-3xl font-mono font-bold text-[#C5A059]">92%</span>
                        <span className="text-[9px] uppercase font-bold text-[#888] tracking-wider mt-1">Fortified</span>
                      </div>
                    </div>

                    {/* Security checklist table */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* 1. Last Backup Rating widget */}
                      <div className="glass-panel p-6 rounded-2xl border border-[#222]">
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-9 h-9 rounded-lg bg-[#C5A059]/5 flex items-center justify-center text-[#C5A059] border border-[#C5A059]/20">
                            <Download className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] uppercase font-semibold text-green-400">Stable</span>
                        </div>
                        <h3 className="text-sm font-semibold text-white mb-2">Internal Vault Backups</h3>
                        <p className="text-xs text-[#888] leading-relaxed mb-4">
                          Secure offline backup matrix maintains recovery potential without utilizing cloud triggers.
                        </p>
                        <div className="text-[11px] font-mono text-[#C5A059] bg-[#C5A059]/5 p-2 rounded border border-[#C5A059]/10">
                          Last backup: {new Date(settings.lastBackupDate).toLocaleDateString()}
                        </div>
                      </div>

                      {/* 2. PIN Phase Passcode Strength widget */}
                      <div className="glass-panel p-6 rounded-2xl border border-[#222]">
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-9 h-9 rounded-lg bg-[#C5A059]/5 flex items-center justify-center text-[#C5A059] border border-[#C5A059]/20">
                            <LockKeyhole className="w-4 h-4" />
                          </div>
                          <span className={`text-[10px] uppercase font-semibold ${passkeyStrength.score > 60 ? 'text-green-400' : 'text-orange-400'}`}>
                            {passkeyStrength.label}
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-white mb-2">Master Code Strength</h3>
                        <p className="text-xs text-[#888] leading-relaxed mb-4">
                          Entropy rate calculated directly from character distribution of your active PIN locks.
                        </p>
                        <div className="text-[11px] font-mono text-white bg-[#1a1a1a] p-2 rounded border border-[#222]">
                          System Rating: {passkeyStrength.score} / 100 pts
                        </div>
                      </div>

                      {/* 3. Locking techniques widget */}
                      <div className="glass-panel p-6 rounded-2xl border border-[#222]">
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-9 h-9 rounded-lg bg-[#C5A059]/5 flex items-center justify-center text-[#C5A059] border border-[#C5A059]/20">
                            <Fingerprint className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] uppercase font-semibold text-accent">Active WebAuthn</span>
                        </div>
                        <h3 className="text-sm font-semibold text-white mb-2">Vault Locking Tech</h3>
                        <p className="text-xs text-[#888] leading-relaxed mb-4">
                          Only Auth locks state inside standard sandbox iframe parameters instantly when clicked.
                        </p>
                        <div className="text-[11px] font-mono text-green-400 bg-green-950/20 p-2 rounded border border-green-500/10">
                          Hardware Biometrics Enabled
                        </div>
                      </div>

                    </div>

                    {/* Integrated hardware security keys list container */}
                    <div className="glass-panel rounded-2xl p-6 md:p-8 border border-[#222]">
                      <div className="flex justify-between items-center mb-6">
                        <div className="space-y-1">
                          <h3 className="text-lg font-display text-white">FIDO2 / WebAuthn Hardware Keys</h3>
                          <p className="text-xs text-[#888]">Register custom physical security tokens as secondary vault decryption gates.</p>
                        </div>
                        
                        <button 
                          onClick={() => setIsAddingHardwareKey(!isAddingHardwareKey)}
                          className="text-xs bg-[#C5A059]/10 text-[#C5A059] hover:bg-[#C5A059]/20 px-3.5 py-1.5 rounded-lg border border-[#C5A059]/20 transition-all font-semibold"
                        >
                          Register Security Key
                        </button>
                      </div>

                      {/* Token listing */}
                      <div className="space-y-3">
                        {isAddingHardwareKey && (
                          <form onSubmit={registerNewSecurityKey} className="flex gap-4 p-4 rounded-xl bg-white/[0.01] border border-[#C5A059]/20 animate-fade-in items-end">
                            <div className="flex-1 space-y-1.5">
                              <label className="text-[10px] uppercase font-semibold text-[#888]">Security Key Token Label</label>
                              <input 
                                type="text"
                                required 
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                placeholder="E.g., Back-up SoloKey FIDO2"
                                className="w-full bg-[#121212] border border-[#222] rounded-lg p-2.5 text-xs text-white uppercase focus:outline-none focus:border-[#C5A059]"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button type="submit" className="text-xs bg-[#C5A059] text-black px-4 py-2.5 rounded-lg font-semibold">Confirm Registration</button>
                              <button type="button" onClick={() => setIsAddingHardwareKey(false)} className="text-xs text-[#888] px-4 py-2.5 rounded-lg hover:text-white">Cancel</button>
                            </div>
                          </form>
                        )}

                        {settings.securityKeys.length > 0 ? (
                          settings.securityKeys.map(key => (
                            <div key={key.id} className="flex items-center justify-between p-4 bg-white/[0.01] border border-[#222] rounded-xl hover:border-[#333] transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded bg-[#C5A059]/5 border border-[#C5A059]/10 flex items-center justify-center text-[#C5A059]">
                                  <Key className="w-4.5 h-4.5 shrink-0" />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-semibold text-white leading-tight">{key.name}</h4>
                                  <p className="text-[10px] text-[#888] mt-1">FIDO2 Token • Registered on {new Date(key.addedAt).toLocaleDateString()}</p>
                                </div>
                              </div>

                              <button 
                                onClick={() => deleteHardwareKey(key.id)}
                                className="p-2 bg-red-950/20 text-red-400 hover:text-red-300 rounded border border-red-500/10 hover:border-red-500/30 text-xs font-semibold transition-colors"
                              >
                                Deregister Key
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="p-6 text-center text-xs text-[#888] bg-[#121212] rounded-xl border border-dashed border-[#222]">
                            No registered hardware security keys detected.
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                ) : activeTab === 'settings' ? (
                  /* SYSTEM SETTINGS SCREEN PANEL WITH CUSTOM LAYOUT OPTION */
                  <div className="max-w-3xl space-y-8 animate-fade-in">
                    
                    {/* Theme and Layout config section */}
                    <div className="glass-panel rounded-2xl p-6 md:p-8 border border-[#222] space-y-6">
                      <h3 className="text-lg font-display text-white">Dynamic Matrix Lay-out Configurations</h3>
                      
                      {/* Active placement selection option layout toggle */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-[#888]">Account List Location Placement</label>
                        <p className="text-xs text-[#888] leading-relaxed pb-2">Toggle the overall screen allocation topology for your TOTP key database checklist.</p>
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            onClick={() => setSettings(prev => ({ ...prev, accountListPlacement: 'right' }))}
                            className={`p-4 rounded-xl border text-left transition-all ${
                              settings.accountListPlacement === 'right' 
                                ? 'border-[#C5A059] bg-[#C5A059]/5 text-white' 
                                : 'border-[#222] bg-[#121212] text-[#888] hover:text-white'
                            }`}
                          >
                            <div className="font-semibold text-xs uppercase mb-1">Right Column Panel Sidebar</div>
                            <div className="text-[10px] text-[#888]">Perfect layout for desktop screens, presenting focused TOTP codes alongside the main account rows.</div>
                          </button>

                          <button
                            onClick={() => setSettings(prev => ({ ...prev, accountListPlacement: 'bottom' }))}
                            className={`p-4 rounded-xl border text-left transition-all ${
                              settings.accountListPlacement === 'bottom' 
                                ? 'border-[#C5A059] bg-[#C5A059]/5 text-white' 
                                : 'border-[#222] bg-[#121212] text-[#888] hover:text-white'
                            }`}
                          >
                            <div className="font-semibold text-xs uppercase mb-1">Row Matrix Below Focus Card</div>
                            <div className="text-[10px] text-[#888]">Generous spacing distribution stretching accounts below into wider screen grids.</div>
                          </button>
                        </div>
                      </div>

                    </div>

                    {/* Master passphrases config widget */}
                    <div className="glass-panel rounded-2xl p-6 md:p-8 border border-[#222] space-y-6">
                      <h3 className="text-lg font-display text-white">Vault Security & PIN Access Code</h3>
                      <p className="text-xs text-[#888] leading-relaxed">Update the offline sequence required to unlock your authenticator vault and bypass cryptographic decrypt processes.</p>
                      
                      <form onSubmit={handleUpdatePin} className="space-y-4 max-w-sm">
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-semibold text-[#888]">New Alphanumeric PIN Lock</label>
                          <input 
                            type="password"
                            required
                            minLength={4}
                            value={newPinField}
                            onChange={(e) => setNewPinField(e.target.value)}
                            placeholder="E.g., 5678"
                            className="w-full bg-[#121212] border border-[#222] rounded-lg p-3 text-sm focus:outline-none focus:border-[#C5A059]"
                          />
                        </div>
                        <button 
                          type="submit"
                          className="px-4 py-2.5 text-xs bg-[#C5A059] text-black font-semibold uppercase tracking-wider rounded-lg hover:bg-[#b08b47] transition-colors"
                        >
                          Modify Vault PIN
                        </button>
                      </form>
                    </div>

                    {/* Offline backups management widget containing Restore upload triggers */}
                    <div className="glass-panel rounded-2xl p-6 md:p-8 border border-[#222] space-y-6">
                      <h3 className="text-lg font-display text-white">Cryptographic Data Back-up Ledger</h3>
                      <p className="text-xs text-[#888]">Extract keys data immediately into local, decrypted JSON backup packets. Only Auth never stores your seeds in external server nodes.</p>
                      
                      <div className="flex flex-wrap gap-4 pt-1">
                        <button 
                          onClick={handleDownloadBackup}
                          className="h-10 px-4 rounded-xl bg-[#C5A059] text-black hover:scale-105 active:scale-95 transition-all text-xs font-semibold flex items-center gap-2 uppercase tracking-wide shadow-[0_0_15px_rgba(197,160,89,0.2)]"
                        >
                          <Download className="w-4 h-4 shrink-0" />
                          <span>Download Backup JSON</span>
                        </button>

                        <div className="relative">
                          <input 
                            type="file" 
                            accept=".json"
                            onChange={handleUploadBackup}
                            className="hidden" 
                            id="backup-upload-input" 
                          />
                          <label 
                            htmlFor="backup-upload-input"
                            className="h-10 px-4 rounded-xl border border-[#222] hover:bg-white/5 transition-all text-xs font-semibold flex items-center gap-2 uppercase tracking-wide text-white cursor-pointer"
                          >
                            <Upload className="w-4 h-4 shrink-0 text-[#C5A059]" />
                            <span>Upload Restore Ledger</span>
                          </label>
                        </div>

                        <button 
                          onClick={handleResetDefaults}
                          className="h-10 px-4 rounded-xl border border-dotted border-red-500/20 hover:border-red-500/40 hover:bg-red-950/10 text-red-400 transition-all text-xs font-semibold flex items-center gap-2 uppercase"
                        >
                          <span>Reset Default Sample Keys</span>
                        </button>
                      </div>
                    </div>

                  </div>
                ) : (
                  /* CONCIERGE CUSTOM INBOX EMAIL DIAL IN SUPPORT PANEL */
                  <div className="max-w-2xl space-y-8 animate-fade-in">
                    
                    <div className="glass-panel p-6 md:p-8 rounded-2xl border border-[#222] space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#C5A059]/5 border border-[#C5A059]/20 flex items-center justify-center text-[#C5A059]">
                          <Mail className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-display text-white">Dynamic Concierge Support Ticket</h3>
                      </div>

                      <p className="text-xs text-[#888] leading-relaxed">
                        Need help with credential sync, migrating Base32 codes, or offline vault management? Dispatch an encrypted report to our diagnostic inbox securely.
                      </p>

                      <div className="p-3 bg-[#C5A059]/5 rounded-xl border border-[#C5A059]/10 text-xs text-[#C5A059] flex items-center gap-2">
                        <UserCheck className="w-4 h-4 shrink-0" />
                        <span>Registered Diagnostics Target Email: <strong>user@example.com</strong></span>
                      </div>

                      {supportSuccess ? (
                        <div className="p-6 text-center bg-green-950/10 border border-green-500/10 rounded-xl space-y-3">
                          <Check className="w-8 h-8 text-green-400 mx-auto" />
                          <h4 className="font-semibold text-white text-sm">Dispatched Cryptographic Diagnostic Packet</h4>
                          <p className="text-xs text-[#888] max-w-sm mx-auto leading-relaxed">Your message has been converted to an offline help token and sent to user@example.com. We typically respond within 2 rotation steps.</p>
                          <button onClick={() => setSupportSuccess(false)} className="text-xs text-[#C5A059] underline font-semibold mt-2">Send another query</button>
                        </div>
                      ) : (
                        <form onSubmit={handleSendSupportTicket} className="space-y-4 pt-2">
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] uppercase font-semibold text-[#888]">Destination Target Address</label>
                              <input 
                                type="email"
                                required 
                                disabled
                                value={supportEmailInput}
                                onChange={(e) => setSupportEmailInput(e.target.value)}
                                className="w-full bg-[#080808] border border-[#222] rounded-lg p-2.5 text-xs text-[#888] focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] uppercase font-semibold text-[#888]">Subject Topic</label>
                              <input 
                                type="text"
                                required 
                                value={supportSubject}
                                onChange={(e) => setSupportSubject(e.target.value)}
                                placeholder="E.g. Hardware key recovery"
                                className="w-full bg-[#121212] border border-[#222] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase font-semibold text-[#888]">Cryptographic Report Message payload</label>
                            <textarea 
                              required 
                              rows={5}
                              value={supportMessage}
                              onChange={(e) => setSupportMessage(e.target.value)}
                              placeholder="Please describe the authentication issue. Enter base entropy constraints... (No secrets should be posted here directly)"
                              className="w-full bg-[#121212] border border-[#222] rounded-lg p-3 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                            />
                          </div>

                          <button 
                            type="submit" 
                            disabled={isSupportSending}
                            className="w-full py-3 bg-[#C5A059] text-black hover:bg-[#b08b47] transition-all font-semibold uppercase tracking-wider text-xs rounded-lg flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(197,160,89,0.2)] disabled:opacity-50"
                          >
                            {isSupportSending ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                                <span>Encoding Secure Packet...</span>
                              </>
                            ) : (
                              <>
                                <Mail className="w-4 h-4 shrink-0" />
                                <span>Transmit Secured Ticket</span>
                              </>
                            )}
                          </button>

                        </form>
                      )}
                    </div>

                    {/* Diagnostics terminal logs */}
                    <div className="glass-panel p-5 rounded-xl border border-[#222] space-y-3">
                      <h4 className="text-xs uppercase tracking-widest text-[#888] font-semibold">Active Concierge Diagnosis Assistant</h4>
                      <form onSubmit={handleSendCommand} className="flex gap-2.5">
                        <input 
                          type="text" 
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Type security query (e.g., 'What is TOTP?')" 
                          className="flex-grow bg-[#121212] border border-[#222] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                        />
                        <button type="submit" className="text-xs bg-[#C5A059] text-black px-4 py-2.5 rounded-lg font-semibold uppercase tracking-wider">Ask</button>
                      </form>
                      <div className="h-40 overflow-y-auto space-y-3 bg-[#080808] p-3.5 rounded-lg border border-[#222] font-mono text-[11px] text-[#888]">
                        {chatMessages.map((m, i) => (
                          <div key={i} className={m.sender === 'user' ? 'text-white text-right' : 'text-[#C5A059]'}>
                            <span className="text-[9px] opacity-40 mr-1.5">{m.time}</span>
                            <strong>{m.sender === 'user' ? 'Operator: ' : 'Only Auth AI: '}</strong>
                            <span>{m.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                )}

              </div>
            </main>

            {/* --- MODAL 1: ADD / EDIT CREDENTIAL WITH CAMERA SCANNING PRESET --- */}
            <AnimatePresence>
              {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-2xl glass-panel rounded-3xl p-6 md:p-8 relative overflow-hidden border border-[#222] max-h-[90vh] overflow-y-auto"
                  >
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-display text-white">
                        {editingAccount ? 'Modify Encrypted credential Seed' : 'Generate New cryptographic login Seed'}
                      </h3>
                      <button 
                        onClick={() => {
                          setIsAddModalOpen(false);
                          stopCameraScan();
                        }}
                        className="w-8 h-8 rounded-lg bg-white/5 border border-[#222] hover:bg-white/10 flex items-center justify-center text-[#888] hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Integrated Simulated Camera / QR Code scanner */}
                    <div className="mb-6">
                      {isCameraActive ? (
                        <div className="space-y-4 bg-black p-4 rounded-2xl border border-[#C5A059]/40">
                          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-zinc-900 border border-[#222] flex flex-col items-center justify-center text-center">
                            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
                            <div className="absolute inset-0 border-[6px] border-[#C5A059]/30 m-8 rounded-lg pointer-events-none border-dashed animate-pulse" />
                            <Camera className="w-8 h-8 text-[#C5A059] relative z-10 animate-bounce" />
                            <p className="text-xs text-white relative z-10 mt-2 font-mono bg-black/60 px-3 py-1 rounded">{cameraStatus}</p>
                          </div>
                          
                          <div className="flex gap-2.5 justify-center">
                            <button 
                              type="button" 
                              onClick={injectScannedQRResult}
                              className="text-xs bg-[#C5A059] text-black font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Inject Simulated Key</span>
                            </button>
                            <button 
                              type="button" 
                              onClick={stopCameraScan}
                              className="text-xs bg-[#222] text-white px-4 py-2 rounded-lg"
                            >
                              Stop Scan
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button 
                          type="button"
                          onClick={startCameraScan}
                          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#C5A059]/15 to-transparent border border-[#C5A059]/25 hover:border-[#C5A059]/50 hover:from-[#C5A059]/20 transition-all text-xs text-[#C5A059] text-center flex items-center justify-center gap-2 font-semibold"
                        >
                          <Camera className="w-4 h-4 text-[#C5A059]" />
                          <span>Import OTP Secret Key using simulated Camera QR Scanner</span>
                        </button>
                      )}
                    </div>

                    {/* Custom Add form */}
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        // Trigger secure master passphrase passcode prompt before save!
                        triggerVerifyAction('save');
                      }} 
                      className="space-y-4"
                    >
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-semibold text-[#888]">Service Account Name</label>
                          <input 
                            type="text" 
                            required
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            placeholder="E.g., Discord (Main), GCP Root, Stripe"
                            className="w-full bg-[#121212] border border-[#222] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-semibold text-[#888]">Username or Email Address</label>
                          <input 
                            type="text" 
                            required
                            value={formEmail}
                            onChange={(e) => setFormEmail(e.target.value)}
                            placeholder="E.g., finance-dept@corporation.io"
                            className="w-full bg-[#121212] border border-[#222] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-semibold text-[#888] flex justify-between">
                          <span>Base32 Secret Seed Key</span>
                          <button 
                            type="button" 
                            onClick={handleGenerateSecret}
                            className="text-[9px] text-[#C5A059] hover:underline"
                          >
                            Generate Random Secret
                          </button>
                        </label>
                        <input 
                          type="text" 
                          required
                          value={formSecret}
                          onChange={(e) => setFormSecret(e.target.value)}
                          placeholder="E.g., JBSWY3DPEHPK3PXP"
                          className="w-full bg-[#121212] border border-[#222] rounded-lg p-2.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-[#C5A059]"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-semibold text-[#888]">Categorization Vault Target</label>
                          <select 
                            value={formCategory}
                            onChange={(e) => setFormCategory(e.target.value)}
                            className="w-full bg-[#121212] border border-[#222] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                          >
                            {settings.customVaults.map(v => (
                              <option key={v} value={v}>{v.toUpperCase()}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-semibold text-[#888]">Visual Logo Badge Shape</label>
                          <select 
                            value={formLogoType}
                            onChange={(e) => setFormLogoType(e.target.value as any)}
                            className="w-full bg-[#121212] border border-[#222] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                          >
                            <option value="custom">Generic Initial Character</option>
                            <option value="google">Google Space (G)</option>
                            <option value="aws">AWS Console (A)</option>
                            <option value="github">GitHub Host (G)</option>
                            <option value="discord">Discord Main (D)</option>
                            <option value="slack">Slack Workspace (SL)</option>
                            <option value="proton">Proton System (P)</option>
                            <option value="stripe">Stripe Ledger (S)</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-semibold text-[#888]">Custom tags (Comma split)</label>
                          <input 
                            type="text" 
                            value={formTagsString}
                            onChange={(e) => setFormTagsString(e.target.value)}
                            placeholder="E.g. production, finance"
                            className="w-full bg-[#121212] border border-[#222] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-semibold text-[#888]">Supplementary metadata description / Notes</label>
                        <textarea 
                          rows={2}
                          value={formNotes}
                          onChange={(e) => setFormNotes(e.target.value)}
                          placeholder="Primary production account core infrastructure description..."
                          className="w-full bg-[#121212] border border-[#222] rounded-lg p-2.5 text-xs text-white focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-3 bg-[#121212] p-3 rounded-xl border border-[#222]">
                        <input 
                          type="checkbox" 
                          id="formIsPinned"
                          checked={formIsPinned}
                          onChange={(e) => setFormIsPinned(e.target.checked)}
                          className="rounded text-[#C5A059] focus:ring-[#C5A059]"
                        />
                        <label htmlFor="formIsPinned" className="text-xs text-[#888] font-semibold cursor-pointer">
                          Include within quick-axis pinned horizontal matrix scroll pool
                        </label>
                      </div>

                      <div className="flex gap-3 justify-end pt-2 border-t border-[#222]">
                        <button 
                          type="button" 
                          onClick={() => {
                            setIsAddModalOpen(false);
                            stopCameraScan();
                          }} 
                          className="px-4 py-2.5 text-xs text-[#888] font-semibold hover:text-white"
                        >
                          Discard draft
                        </button>
                        <button 
                          type="submit" 
                          className="px-6 py-2.5 text-xs bg-[#C5A059] text-black font-semibold uppercase tracking-wider rounded-lg hover:bg-[#b08b47] transition-all"
                        >
                          {editingAccount ? 'Verify & Commit Changes' : 'Verify & Add Key Seed'}
                        </button>
                      </div>

                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* --- MODAL 2: SECURE MASTER PASSCODE CONFIRMATION (Before modifying keys) --- */}
            <AnimatePresence>
              {isVerificationModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="w-full max-w-sm glass-panel rounded-2xl p-6 border border-[#C5A059]/30"
                  >
                    <div className="flex items-center gap-3 mb-4 text-[#C5A059]">
                      <Shield className="w-5 h-5 shrink-0" />
                      <h3 className="font-display font-medium text-white text-base">Verify Security Passcode</h3>
                    </div>

                    <p className="text-xs text-[#888] mb-4 leading-relaxed">
                      You are executing a cryptographic modification request. Verify your master passcode to authorize transaction logs.
                    </p>

                    <form onSubmit={handleConfirmVerification} className="space-y-4.5">
                      <input 
                        type="password"
                        required
                        autoFocus
                        value={verificationPass}
                        onChange={(e) => setVerificationPass(e.target.value)}
                        placeholder="Master Passcode (Default: 1234)"
                        className="w-full bg-[#121212] border border-[#222] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#C5A059]"
                      />

                      {verificationError && (
                        <p className="text-[10px] text-red-400 font-mono italic">{verificationError}</p>
                      )}

                      <div className="flex gap-2 justify-end pt-2 border-t border-[#222]/30">
                        <button 
                          type="button" 
                          onClick={() => {
                            setIsVerificationModalOpen(false);
                            setPendingAction(null);
                          }}
                          className="px-3 py-1.5 text-xs text-[#888] hover:text-white"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit"
                          className="px-4 py-1.5 text-xs bg-[#C5A059] text-black font-semibold uppercase rounded"
                        >
                          Confirm Action
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
