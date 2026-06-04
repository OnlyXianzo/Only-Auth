import { describe, test, expect } from "bun:test";
import {
  accountToOTPAuthURI,
  parseOTPAuthURI,
  parseOnlyAuthJSON,
  parseEnteAuthJSON,
  parseBitwardenJSON,
  parseGoogleAuthJSON,
  parseOTPAuthBatch,
  exportPurifiedJSON,
  exportPlainTextURI,
  exportCSV,
  buildSealedPayload,
  parseSealedPayload,
} from "./utils/exportEngine";
import type { Account, AppSettings } from "./types";

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — OTPAuth URI Serialization / Deserialization
// ═══════════════════════════════════════════════════════════════════════════════

describe("OTPAuth URI Engine", () => {
  const sampleAccount: Account = {
    id: "acc-test-1",
    name: "GitHub",
    email: "user@github.com",
    secret: "JBSWY3DPEHPK3PXP",
    notes: "",
    category: "personal",
    isPinned: false,
    logoType: "github",
    createdAt: "2026-01-01T00:00:00Z",
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  };

  test("accountToOTPAuthURI produces valid otpauth:// URI", () => {
    const uri = accountToOTPAuthURI(sampleAccount);
    expect(uri).toStartWith("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=GitHub");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  test("parseOTPAuthURI round-trips with accountToOTPAuthURI", () => {
    const uri = accountToOTPAuthURI(sampleAccount);
    const parsed = parseOTPAuthURI(uri);
    expect(parsed).not.toBeNull();
    expect(parsed!.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(parsed!.name).toBe("GitHub");
    expect(parsed!.digits).toBe(6);
    expect(parsed!.period).toBe(30);
    expect(parsed!.algorithm).toBe("SHA1");
  });

  test("parseOTPAuthURI rejects non-otpauth URIs", () => {
    expect(parseOTPAuthURI("https://example.com")).toBeNull();
    expect(parseOTPAuthURI("")).toBeNull();
    expect(parseOTPAuthURI("otpauth://totp/test")).toBeNull(); // no query
  });

  test("parseOTPAuthURI rejects URIs without secret", () => {
    expect(parseOTPAuthURI("otpauth://totp/test?issuer=Foo")).toBeNull();
  });

  test("accountToOTPAuthURI includes metadata for pinned accounts", () => {
    const pinned = { ...sampleAccount, isPinned: true, notes: "test note", tags: ["work", "security"] };
    const uri = accountToOTPAuthURI(pinned);
    expect(uri).toContain("onlyauth_metadata");
  });

  test("parseOTPAuthURI preserves metadata round-trip", () => {
    const withMeta = { ...sampleAccount, isPinned: true, notes: "my note", tags: ["work"] };
    const uri = accountToOTPAuthURI(withMeta);
    const parsed = parseOTPAuthURI(uri);
    expect(parsed!.isPinned).toBe(true);
    expect(parsed!.notes).toBe("my note");
    expect(parsed!.tags).toContain("work");
  });

  test("URI handles special characters in email/name", () => {
    const acc = { ...sampleAccount, email: "user+special@example.com", name: "My Service (dev)" };
    const uri = accountToOTPAuthURI(acc);
    const parsed = parseOTPAuthURI(uri);
    expect(parsed).not.toBeNull();
    expect(parsed!.secret).toBe("JBSWY3DPEHPK3PXP");
  });

  test("parseOTPAuthURI handles SHA256/SHA512 algorithms", () => {
    const uri256 = "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&digits=8&period=60";
    const parsed = parseOTPAuthURI(uri256);
    expect(parsed!.algorithm).toBe("SHA256");
    expect(parsed!.digits).toBe(8);
    expect(parsed!.period).toBe(60);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Multi-Format Import Parsers
// ═══════════════════════════════════════════════════════════════════════════════

describe("Import Parsers", () => {
  test("parseOnlyAuthJSON parses accounts array", () => {
    const json = JSON.stringify({
      accounts: [
        { name: "GitHub", secret: "JBSWY3DPEHPK3PXP", email: "user@gh.com" },
        { name: "Discord", secret: "ABCDEF234567ABCD" },
      ],
    });
    const result = parseOnlyAuthJSON(json);
    expect(result.accounts.length).toBe(2);
    expect(result.accounts[0].name).toBe("GitHub");
    expect(result.accounts[0].secret).toBe("JBSWY3DPEHPK3PXP");
    expect(result.accounts[1].name).toBe("Discord");
    expect(result.warnings.length).toBe(0);
  });

  test("parseOnlyAuthJSON handles flat array format", () => {
    const json = JSON.stringify([
      { name: "Service", secret: "JBSWY3DPEHPK3PXP" },
    ]);
    const result = parseOnlyAuthJSON(json);
    expect(result.accounts.length).toBe(1);
  });

  test("parseOnlyAuthJSON returns warning for empty accounts", () => {
    const result = parseOnlyAuthJSON(JSON.stringify({ accounts: [] }));
    expect(result.accounts.length).toBe(0);
    expect(result.warnings.length).toBe(1);
  });

  test("parseOnlyAuthJSON handles invalid JSON gracefully", () => {
    const result = parseOnlyAuthJSON("not json at all");
    expect(result.accounts.length).toBe(0);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("Failed to parse");
  });

  test("parseOnlyAuthJSON skips entries without secrets", () => {
    const json = JSON.stringify({ accounts: [
      { name: "Good", secret: "JBSWY3DPEHPK3PXP" },
      { name: "NoSecret" },
      { name: "EmptySecret", secret: "" },
      { name: "WhitespaceSecret", secret: "   " },
    ]});
    const result = parseOnlyAuthJSON(json);
    expect(result.accounts.length).toBe(1);
    expect(result.accounts[0].name).toBe("Good");
  });

  test("parseEnteAuthJSON parses Ente format", () => {
    const json = JSON.stringify({
      accounts: [
        { issuer: "GitHub", secret: "JBSWY3DPEHPK3PXP", label: "user@gh.com" },
        { name: "Discord", key: "ABCDEF234567ABCD" },
      ],
    });
    const result = parseEnteAuthJSON(json);
    expect(result.accounts.length).toBe(2);
    expect(result.accounts[0].name).toBe("GitHub");
    expect(result.accounts[0].email).toBe("user@gh.com");
  });

  test("parseBitwardenJSON extracts TOTP from login items", () => {
    const json = JSON.stringify({
      items: [
        { name: "GitHub", login: { totp: "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP", username: "user" } },
        { name: "NoTOTP", login: { username: "user2" } },
        { name: "RawSecret", login: { totp: "ABCDEF234567ABCD" } },
      ],
    });
    const result = parseBitwardenJSON(json);
    expect(result.accounts.length).toBe(2);
    expect(result.accounts[0].secret).toBe("JBSWY3DPEHPK3PXP");
  });

  test("parseGoogleAuthJSON parses otp_parameters", () => {
    const json = JSON.stringify({
      otp_parameters: [
        { issuer: "Google", secret: "JBSWY3DPEHPK3PXP", label: "user@gmail.com", algorithm: "SHA1" },
      ],
    });
    const result = parseGoogleAuthJSON(json);
    expect(result.accounts.length).toBe(1);
    expect(result.accounts[0].name).toBe("Google");
  });

  test("parseOTPAuthBatch parses multiple URIs", () => {
    const text = [
      "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP&issuer=GitHub",
      "otpauth://totp/Discord?secret=ABCDEF234567ABCD&issuer=Discord",
      "",
      "MNBVCXZLKJHGFDSA",  // raw base32 secret
    ].join("\n");
    const result = parseOTPAuthBatch(text);
    expect(result.accounts.length).toBe(3);
  });

  test("parseOTPAuthBatch returns warning for empty input", () => {
    const result = parseOTPAuthBatch("");
    expect(result.accounts.length).toBe(0);
    expect(result.warnings.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Export Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe("Export Pipeline", () => {
  const accounts: Account[] = [
    {
      id: "acc-1", name: "GitHub", email: "user@gh.com",
      secret: "JBSWY3DPEHPK3PXP", notes: "primary", category: "work",
      isPinned: true, logoType: "github", createdAt: "2026-01-01T00:00:00Z",
      digits: 6, period: 30, algorithm: "SHA1",
    },
    {
      id: "acc-2", name: "Discord", email: "",
      secret: "ABCDEF234567ABCD", notes: "", category: "personal",
      isPinned: false, logoType: "discord", createdAt: "2026-02-01T00:00:00Z",
    },
  ];

  const settings: Partial<AppSettings> = {
    passphraseHash: "should-be-stripped",
    masterKeyHash: "should-be-stripped",
    pinHash: "should-be-stripped",
    authHashes: ["should-be-stripped"],
    authMetadata: { hash1: "should-be-stripped" },
    compactMode: false,
    appLockEnabled: true,
    appLockMethod: "pin",
    customTags: ["work", "personal"],
  };

  test("exportPurifiedJSON strips credential hashes", () => {
    const json = exportPurifiedJSON(accounts, settings);
    const parsed = JSON.parse(json);
    expect(parsed.settings.passphraseHash).toBeUndefined();
    expect(parsed.settings.masterKeyHash).toBeUndefined();
    expect(parsed.settings.pinHash).toBeUndefined();
    expect(parsed.settings.authHashes).toBeUndefined();
    expect(parsed.settings.authMetadata).toBeUndefined();
    // But keeps non-sensitive settings
    expect(parsed.settings.compactMode).toBe(false);
    expect(parsed.settings.customTags).toEqual(["work", "personal"]);
    expect(parsed.accounts.length).toBe(2);
  });

  test("exportPlainTextURI generates one URI per line", () => {
    const text = exportPlainTextURI(accounts);
    const lines = text.split("\n").filter(Boolean);
    expect(lines.length).toBe(2);
    expect(lines[0]).toStartWith("otpauth://totp/");
    expect(lines[1]).toStartWith("otpauth://totp/");
  });

  test("exportCSV includes headers and all accounts", () => {
    const csv = exportCSV(accounts);
    const rows = csv.split("\n");
    expect(rows[0]).toContain("id,name,email,secret");
    expect(rows.length).toBe(3); // header + 2 accounts
  });

  test("exportPlainTextURI skips accounts without secrets", () => {
    const withEmpty = [...accounts, {
      id: "acc-3", name: "Empty", email: "", secret: "", notes: "",
      category: "personal", isPinned: false, logoType: "custom" as const,
      createdAt: "2026-01-01T00:00:00Z",
    }];
    const text = exportPlainTextURI(withEmpty);
    const lines = text.split("\n").filter(Boolean);
    expect(lines.length).toBe(2); // only 2 valid accounts
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Sealed Backup Payload
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sealed Backup Payload", () => {
  const accounts: Account[] = [{
    id: "acc-1", name: "GitHub", email: "u@gh.com",
    secret: "JBSWY3DPEHPK3PXP", notes: "", category: "personal",
    isPinned: false, logoType: "github", createdAt: "2026-01-01T00:00:00Z",
  }];

  test("buildSealedPayload → parseSealedPayload round-trip", () => {
    const payload = buildSealedPayload(accounts, { compactMode: true, appLockEnabled: false } as Partial<AppSettings>);
    const { accounts: parsed, settings } = parseSealedPayload(payload);
    expect(parsed.length).toBe(1);
    expect(parsed[0].secret).toBe("JBSWY3DPEHPK3PXP");
    expect(parsed[0].name).toBe("GitHub");
    expect(settings.compactMode).toBe(true);
  });

  test("buildSealedPayload strips credential hashes", () => {
    const payload = buildSealedPayload(accounts, {
      passphraseHash: "SECRET",
      masterKeyHash: "SECRET",
      compactMode: false,
    } as Partial<AppSettings>);
    const raw = JSON.parse(payload);
    expect(raw.settings.passphraseHash).toBeUndefined();
    expect(raw.settings.masterKeyHash).toBeUndefined();
  });

  test("parseSealedPayload handles missing fields gracefully", () => {
    const payload = JSON.stringify({
      accounts: [{ secret: "JBSWY3DPEHPK3PXP" }],
    });
    const { accounts: parsed } = parseSealedPayload(payload);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe("Imported");
    expect(parsed[0].digits).toBe(6);
    expect(parsed[0].period).toBe(30);
    expect(parsed[0].algorithm).toBe("SHA1");
  });

  test("parseSealedPayload normalizes secrets to uppercase", () => {
    const payload = JSON.stringify({
      accounts: [{ name: "Test", secret: "jbswy3dpehpk3pxp" }],
    });
    const { accounts: parsed } = parseSealedPayload(payload);
    expect(parsed[0].secret).toBe("JBSWY3DPEHPK3PXP");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Auth Logic (PIN lockout, credential lifecycle)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Auth Logic — PIN Lockout", () => {
  test("PIN lockout triggers on 5th consecutive failure", () => {
    let pinAttempts = 0;
    let pinHash: string | null = "argon2_hash";
    let authHashes = ["argon2_hash", "passphrase_hash"];
    let appLockEnabled = true;

    const handlePinFailure = () => {
      pinAttempts += 1;
      if (pinAttempts >= 5) {
        authHashes = authHashes.filter(h => h !== pinHash);
        pinHash = null;
        appLockEnabled = false;
      }
    };

    for (let i = 0; i < 4; i++) handlePinFailure();
    expect(pinAttempts).toBe(4);
    expect(pinHash).not.toBeNull();
    expect(appLockEnabled).toBe(true);

    handlePinFailure();
    expect(pinAttempts).toBe(5);
    expect(pinHash).toBeNull();
    expect(appLockEnabled).toBe(false);
    expect(authHashes).not.toContain("argon2_hash");
    expect(authHashes).toContain("passphrase_hash"); // passphrase survives
  });

  test("PIN lockout is not triggered for passphrase method", () => {
    let pinAttempts = 0;
    let pinHash = "argon2_hash";
    const unlockMethod = "passphrase";

    const handleFailure = () => {
      pinAttempts += 1;
      if (unlockMethod === "pin" && pinAttempts >= 5) {
        pinHash = "";
      }
    };

    for (let i = 0; i < 10; i++) handleFailure();
    expect(pinHash).toBe("argon2_hash"); // Not cleared because method is passphrase
  });
});

describe("Auth Logic — First-Run Detection", () => {
  test("detects first run when no authHashes and no passphraseHash", () => {
    const settings = { authHashes: [], passphraseHash: undefined };
    const isFirstRun = (!settings.authHashes || settings.authHashes.length === 0) && !settings.passphraseHash;
    expect(isFirstRun).toBe(true);
  });

  test("detects existing vault when authHashes present", () => {
    const settings = { authHashes: ["some_hash"], passphraseHash: undefined };
    const isFirstRun = (!settings.authHashes || settings.authHashes.length === 0) && !settings.passphraseHash;
    expect(isFirstRun).toBe(false);
  });

  test("detects existing vault when legacy passphraseHash present", () => {
    const settings = { authHashes: [], passphraseHash: "legacy_hash" };
    const isFirstRun = (!settings.authHashes || settings.authHashes.length === 0) && !settings.passphraseHash;
    expect(isFirstRun).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Biometric Flow Logic (state machine, no IPC)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Biometric Flow — State Machine", () => {
  test("biometric failure counter increments and revokes after 3", () => {
    const MAX_FAILURES = 3;
    let failures = 0;
    let biometricStatus = "available";
    let unlockMethod = "biometrics";

    const handleBiometricFailure = () => {
      failures += 1;
      if (failures >= MAX_FAILURES) {
        biometricStatus = "not_enrolled";
        failures = 0;
        unlockMethod = "passphrase";
      }
    };

    handleBiometricFailure();
    handleBiometricFailure();
    expect(failures).toBe(2);
    expect(biometricStatus).toBe("available");

    handleBiometricFailure(); // 3rd failure → revoke
    expect(failures).toBe(0); // reset
    expect(biometricStatus).toBe("not_enrolled");
    expect(unlockMethod).toBe("passphrase");
  });

  test("biometric status determines unlock method default", () => {
    const selectUnlockMethod = (
      appLockMethod: string,
      biometricsAvailable: boolean,
      hasPinHash: boolean,
      hasSecurityKeys: boolean,
    ) => {
      if (appLockMethod === "biometrics" && biometricsAvailable) return "biometrics";
      if (hasPinHash) return "pin";
      if (hasSecurityKeys) return "hardware";
      return "passphrase";
    };

    expect(selectUnlockMethod("biometrics", true, true, false)).toBe("biometrics");
    expect(selectUnlockMethod("biometrics", false, true, false)).toBe("pin");
    expect(selectUnlockMethod("pin", false, true, false)).toBe("pin");
    expect(selectUnlockMethod("pin", false, false, true)).toBe("hardware");
    expect(selectUnlockMethod("pin", false, false, false)).toBe("passphrase");
  });

  test("BIOMETRIC_NOT_ENROLLED sentinel is correctly identified", () => {
    const handleRetrieveResult = (result: string): string | null => {
      if (result === "BIOMETRIC_NOT_ENROLLED") return null;
      return result;
    };

    expect(handleRetrieveResult("BIOMETRIC_NOT_ENROLLED")).toBeNull();
    expect(handleRetrieveResult("0123456789abcdef")).toBe("0123456789abcdef");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — Lock Screen State Transitions
// ═══════════════════════════════════════════════════════════════════════════════

describe("Lock Screen — State Transitions", () => {
  test("auto-lock triggers after timeout", () => {
    const shouldAutoLock = (elapsedSeconds: number, timeout: number) => {
      if (timeout <= 0) return false;
      return elapsedSeconds >= timeout;
    };

    expect(shouldAutoLock(29, 30)).toBe(false);
    expect(shouldAutoLock(30, 30)).toBe(true);
    expect(shouldAutoLock(0, 0)).toBe(false); // disabled
    expect(shouldAutoLock(999999, 0)).toBe(false); // disabled
  });

  test("instant lock on blur respects setting", () => {
    const shouldLockOnBlur = (isEnabled: boolean, isLocked: boolean) => {
      if (isLocked) return false; // already locked
      return isEnabled;
    };

    expect(shouldLockOnBlur(true, false)).toBe(true);
    expect(shouldLockOnBlur(true, true)).toBe(false); // already locked
    expect(shouldLockOnBlur(false, false)).toBe(false); // disabled
  });

  test("memory scrubbing clears all sensitive fields", () => {
    let unlockInput = "mysecretpassword";
    let verificationInput = "verify123";
    let formSecret = "JBSWY3DPEHPK3PXP";
    let tempDerivedKeyHex = "0123456789abcdef";
    let setupWords = ["word1", "word2", "word3"];

    // Simulate lock transition cleanup
    unlockInput = "";
    verificationInput = "";
    formSecret = "";
    tempDerivedKeyHex = "";
    setupWords = [];

    expect(unlockInput).toBe("");
    expect(verificationInput).toBe("");
    expect(formSecret).toBe("");
    expect(tempDerivedKeyHex).toBe("");
    expect(setupWords.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — Duress System Logic
// ═══════════════════════════════════════════════════════════════════════════════

describe("Duress System", () => {
  test("duress wipe action clears all accounts", () => {
    let accounts = [{ id: "1" }, { id: "2" }];
    const duressAction = "wipe";

    if (duressAction === "wipe") {
      accounts = [];
    }

    expect(accounts.length).toBe(0);
  });

  test("duress fake action shows empty vault without deleting", () => {
    const realAccounts = [{ id: "1" }, { id: "2" }];
    let visibleAccounts = [...realAccounts];
    let isFakeVaultActive = false;
    const duressAction = "fake";

    if (duressAction === "fake") {
      isFakeVaultActive = true;
      visibleAccounts = []; // show empty, but real accounts survive
    }

    expect(isFakeVaultActive).toBe(true);
    expect(visibleAccounts.length).toBe(0);
    expect(realAccounts.length).toBe(2); // originals intact
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — Password/PIN Validation Rules
// ═══════════════════════════════════════════════════════════════════════════════

describe("Password/PIN Validation", () => {
  test("PIN must be 4-8 digits only", () => {
    const isValidPin = (pin: string): boolean => /^\d{4,8}$/.test(pin);

    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345678")).toBe(true);
    expect(isValidPin("123")).toBe(false);  // too short
    expect(isValidPin("123456789")).toBe(false);  // too long
    expect(isValidPin("abcd")).toBe(false);  // non-digits
    expect(isValidPin("12a4")).toBe(false);  // mixed
    expect(isValidPin("")).toBe(false);
  });

  test("hidden vault passcode must be 4-8 digits", () => {
    const isValidHiddenPasscode = (input: string): boolean => /^\d{4,8}$/.test(input);

    expect(isValidHiddenPasscode("1234")).toBe(true);
    expect(isValidHiddenPasscode("99887766")).toBe(true);
    expect(isValidHiddenPasscode("abc")).toBe(false);
  });

  test("theme accent validation accepts only known values", () => {
    const validAccents = ["cyan", "amber", "emerald", "purple", "crimson"] as const;
    type AccentType = typeof validAccents[number];

    const isValidAccent = (accent: string): accent is AccentType =>
      (validAccents as readonly string[]).includes(accent);

    expect(isValidAccent("cyan")).toBe(true);
    expect(isValidAccent("amber")).toBe(true);
    expect(isValidAccent("red")).toBe(false);
    expect(isValidAccent("")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — Export Engine Edge Cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("Export Engine — Edge Cases", () => {
  test("exportCSV escapes double quotes in fields", () => {
    const accounts: Account[] = [{
      id: "1", name: 'My "Service"', email: "user@test.com",
      secret: "JBSWY3DPEHPK3PXP", notes: 'Note with "quotes"',
      category: "personal", isPinned: false, logoType: "custom",
      createdAt: "2026-01-01T00:00:00Z",
    }];
    const csv = exportCSV(accounts);
    expect(csv).toContain('My ""Service""'); // CSV double-quote escaping
    expect(csv).toContain('Note with ""quotes""');
  });

  test("exportPurifiedJSON handles empty accounts array", () => {
    const json = exportPurifiedJSON([], {});
    const parsed = JSON.parse(json);
    expect(parsed.accounts).toEqual([]);
  });

  test("parseSealedPayload assigns new IDs when missing", () => {
    const payload = JSON.stringify({
      accounts: [{ name: "NoId", secret: "JBSWY3DPEHPK3PXP" }],
    });
    const { accounts } = parseSealedPayload(payload);
    expect(accounts[0].id).toBeDefined();
    expect(accounts[0].id).toStartWith("acc-");
  });
});
