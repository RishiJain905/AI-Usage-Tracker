# Task 10: Settings & Configuration UI

## Objective
Build the settings pages for configuring providers, API keys, proxy settings, and app preferences.

## Settings Layout

```
┌──────────────────────────────────────────────────────┐
│  Settings                                             │
├─────────┬────────────────────────────────────────────┤
│ General │                                            │
│Providers│  General Settings                          │
│API Keys │                                            │
│ About   │  Proxy Configuration                      │
│         │  ┌──────────────────────────────────────┐ │
│         │  │  Port: [8765          ]              │ │
│         │  │  Auto-start: [✓] Start proxy on launch│ │
│         │  │  Status: ● Running on port 8765      │ │
│         │  │  [Start] [Stop] [Restart]             │ │
│         │  └──────────────────────────────────────┘ │
│         │                                            │
│         │  Display                                  │
│         │  ┌──────────────────────────────────────┐ │
│         │  │  Theme: [Light ▼]                    │ │
│         │  │  Currency: [USD ▼]                   │ │
│         │  │  Number format: [1,234 ▼]            │ │
│         │  └──────────────────────────────────────┘ │
│         │                                            │
│         │  Budget                                   │
│         │  ┌──────────────────────────────────────┐ │
│         │  │  Monthly budget: [$200.00]            │ │
│         │  │  Alert at: [80%]                      │ │
│         │  └──────────────────────────────────────┘ │
│         │                                            │
│         │  Data Retention                           │
│         │  ┌──────────────────────────────────────┐ │
│         │  │  Keep logs for: [90 days ▼]          │ │
│         │  │  [Clear All Data] (dangerous)         │ │
│         │  └──────────────────────────────────────┘ │
└─────────┴────────────────────────────────────────────┘
```

## Steps

### 10.1 Build general settings page

File: `src/renderer/src/components/settings/GeneralSettings.tsx`

Sections:
1. **Proxy Configuration**
   - Port number input (with validation: 1024-65535)
   - Auto-start toggle (start proxy when app launches)
   - Status indicator and control buttons (Start/Stop/Restart)
   - Test connectivity button

2. **Display Preferences**
   - Theme: Light / Dark / System
   - Currency: USD, EUR, GBP, CNY, JPY
   - Number format: 1,234 vs 1.234 vs 1 234
   - Date format: MM/DD/YYYY vs DD/MM/YYYY

3. **Budget Settings**
   - Monthly budget input (number, in selected currency)
   - Alert threshold slider (50-100%)
   - Enable/disable budget notifications

4. **Data Retention**
   - Retention period dropdown (30/60/90/180/365 days / forever)
   - Auto-cleanup toggle
   - "Clear All Data" button with confirmation dialog

### 10.2 Build provider configuration page

File: `src/renderer/src/components/settings/ProviderConfig.tsx`

```
┌──────────────────────────────────────────────────────┐
│  Provider Configuration                               │
│                                                       │
│  ┌──────────────────────────────────────────────────┐│
│  │ ● OpenAI     [Enabled ✎]  [Test Connection]     ││
│  │   Base URL: https://api.openai.com              ││
│  │   API Key: sk-...****                           ││
│  │   Custom pricing: [Configure]                   ││
│  ├──────────────────────────────────────────────────┤│
│  │ ● Anthropic  [Enabled ✎]  [Test Connection]     ││
│  │   Base URL: https://api.anthropic.com           ││
│  │   API Key: sk-ant-...****                      ││
│  ├──────────────────────────────────────────────────┤│
│  │ ● Ollama     [Enabled ✎]  [Test Connection]     ││
│  │   Mode: [Local ▼] (Local / Cloud)              ││
│  │   Local URL:  http://localhost:11434             ││
│  │   Cloud URL:  https://ollama.com/v1             ││
│  │   API Key: (required for cloud mode)            ││
│  │   Cloud pricing: [Configure]                    ││
│  ├──────────────────────────────────────────────────┤│
│  │ ○ Gemini     [Disabled ✎]                      ││
│  │ ...                                             ││
│  └──────────────────────────────────────────────────┘│
│                                                       │
│  [+ Add Custom Provider]                              │
└──────────────────────────────────────────────────────┘
```

Features:
- Enable/disable each provider
- Edit base URL (useful for proxies/self-hosted endpoints, **especially Ollama cloud instances**)
- Configure API key (links to API Key Manager)
- **Ollama-specific**: "Mode" dropdown (Local / Cloud) — Local uses `http://localhost:11434` (no auth, no cost); Cloud uses `https://ollama.com/v1` (requires API key, supports per-token pricing). The provider auto-detects response format: local uses `prompt_eval_count`/`eval_count`, cloud uses OpenAI-compatible `usage.prompt_tokens`/`completion_tokens`.
- **"Proxy Injects Key" toggle** per provider: When ON, the proxy strips any `Authorization` header from the client and injects the stored API key instead. When OFF (default), the proxy passes the client's auth header through unchanged.
- Test connection button (sends minimal request to verify connectivity)
- Custom pricing configuration per provider/model
- "Add Custom Provider" for providers not built-in

### 10.3 Build API key manager

File: `src/renderer/src/components/settings/ApiKeyManager.tsx`

```
┌──────────────────────────────────────────────────────┐
│  API Key Manager                                      │
│                                                       │
│  ┌──────────────────────────────────────────────────┐│
│  │  OpenAI                                         ││
│  │  Key: sk-proj-...7f3d        [Show] [Edit] [✕] ││
│  │  Last validated: 2 hours ago  ✓ Valid           ││
│  ├──────────────────────────────────────────────────┤│
│  │  Anthropic                                      ││
│  │  Key: sk-ant-...2a1b          [Show] [Edit] [✕] ││
│  │  Last validated: 1 day ago    ✓ Valid           ││
│  ├──────────────────────────────────────────────────┤│
│  │  Gemini                                         ││
│  │  Key: AIza...5k2m            [Show] [Edit] [✕] ││
│  │  Last validated: Never       ⚠ Not tested       ││
│  ├──────────────────────────────────────────────────┤│
│  │  Ollama                                         ││
│  │  Local: No key required                        ││
│  │  Cloud: ol-...4d2e            [Show] [Edit] [✕] ││
│  │  Last validated: 1 hour ago   ✓ Valid (cloud)  ││
│  └──────────────────────────────────────────────────┘│
│                                                       │
│  [+ Add API Key]                                      │
└──────────────────────────────────────────────────────┘
```

Features:
- List all API keys (masked by default: `sk-...****`)
- Show/hide toggle for each key
- Add new key (dropdown to select provider, then input field)
- Edit existing key
- Delete key (with confirmation)
- Validate key (sends test request)
- Keys are stored encrypted in the database (using `safeStorage` API)

**How stored API keys are used — two paths:**

1. **Test Connection / Validation**: The stored key is used to send a minimal request to the provider to verify the key is valid and the endpoint is reachable. This powers the "Test Connection" button on each provider.

2. **Proxy injection mode (optional)**: By default, client apps send their own API key in the `Authorization` header, and the proxy just passes it through. However, the user can enable **"Proxy Injects Key"** mode per provider. When enabled, the client sends requests to the proxy WITHOUT an API key, and the proxy injects the stored key before forwarding. This is useful for:
   - Centralized key management (change key in one place instead of every client)
   - Preventing API keys from being stored in multiple client apps
   - Sharing a single API key across multiple tools

   **WARNING**: When proxy injection is enabled, clients must NOT include their own `Authorization` header (the proxy strips and replaces it). Document this clearly in the UI.

All cloud providers require an API key stored in the tracker. Local-only providers (like Ollama in local mode) do not.

### 10.4 Implement API key encryption

Use Electron's `safeStorage` API to encrypt API keys at rest:

```typescript
// In main process
import { safeStorage } from 'electron';

function encryptKey(key: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    // CRITICAL: Do NOT fall back to base64 — that is encoding, not encryption.
    // A plaintext base64 value in the SQLite DB is readable by anyone with file access.
    // Instead, refuse to store keys and show a user-facing error:
    throw new Error(
      'Secure storage is not available on this device. ' +
      'API keys cannot be safely stored. Ensure OS keychain is available ' +
      '(Windows: DPAPI, macOS: Keychain, Linux: Secret Service/libsecret).'
    );
  }
  return safeStorage.encryptString(key).toString('base64');
}

function decryptKey(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is not available. Cannot decrypt API keys.');
  }
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}
```

**How `safeStorage` works:**
- **Windows**: Uses DPAPI (Data Protection API) — tied to the Windows user account. Other users on the same machine cannot decrypt.
- **macOS**: Uses Keychain — tied to the user's login keychain.
- **Linux**: Uses libsecret/Secret Service — depends on a keyring daemon (GNOME Keyring, KDE Wallet). If unavailable, `safeStorage.isEncryptionAvailable()` returns `false`.

**Security guarantees:**
- The SQLite DB file (`ai-tracker.db`) contains encrypted blobs in the `api_keys` table. Even if someone copies the DB file, they cannot decrypt the keys without access to the OS keychain.
- API keys are ONLY decrypted in the main process (Node.js). They are NEVER sent to the renderer process via IPC.
- The renderer can only see: key ID, provider, masked preview (`sk-...****`), validation status, and last-validated date.

**Key never crosses to renderer:**
```typescript
// In IPC handler — the renderer NEVER sees the actual key
ipcMain.handle('get-api-keys', () => {
  const keys = repository.getApiKeyMetadata(); // Returns only: id, providerId, maskedPreview, isValid, lastValidatedAt
  return keys; // NO encrypted_key, NO decrypted value
});

// Validate key — done entirely in main process
ipcMain.handle('test-api-key', async (_event, { providerId, keyId }) => {
  const encryptedKey = repository.getEncryptedKey(keyId);
  const decryptedKey = decryptKey(encryptedKey); // Only in main process
  const result = await testProviderConnection(providerId, decryptedKey);
  return { valid: result.success, error: result.error }; // Only return status
});
```

### 10.5 Build custom pricing editor

File: `src/renderer/src/components/settings/PricingEditor.tsx`

- Table of all models with their current pricing
- Inline editing of input/output price per million tokens
- Reset to defaults button
- "Fetch latest pricing" button (future: pull from provider docs)
- Highlight models with custom (non-default) pricing

### 10.6 Build add custom provider dialog

File: `src/renderer/src/components/settings/AddProviderDialog.tsx`

Modal form for adding a custom provider:
- Provider name
- Base URL
- Authentication type: Bearer token / API key header / URL parameter / None
- Auth header name (e.g., "x-api-key")
- Response format: OpenAI-compatible / Custom
- Usage field path (JSON path to extract token usage)

### 10.7 Build about page

File: `src/renderer/src/components/settings/About.tsx`

- App name and version
- Electron and Node.js versions
- Database path and size
- License information
- Links: GitHub repo, documentation
- "Check for updates" button
- "Open data directory" button

### 10.8 Wire settings to main process

Connect all settings UI to IPC handlers:
- Save settings → `update-settings` IPC → write to SQLite + reload proxy if needed
- Test connection → `test-api-key` IPC → send minimal request, return ok/error
- Proxy control → `toggle-proxy` IPC → start/stop proxy server
- Clear data → `clear-data` IPC → delete usage logs with confirmation

### 10.9 Add settings validation

Validate all inputs before saving:
- Port: valid range, not in use
- URLs: valid format, reachable
- API keys: valid format for each provider
- Budget: positive number
- All fields: required fields not empty

Show inline validation errors with red borders and error messages.

## Verification
- General settings page shows all configuration options
- Theme, currency, and format changes apply immediately
- Proxy can be started/stopped from settings
- Provider list shows all built-in providers
- API keys can be added, edited, deleted, and validated
- Keys are stored encrypted (verify in database)
- Custom provider can be added with custom fields
- Pricing can be overridden per model
- Settings persist across app restarts
- Invalid inputs show inline validation errors
- "Clear All Data" requires confirmation

## Dependencies
- Task 4 (SQLite Schema & Data Layer)
- Task 6 (Dashboard UI Foundation)

## Estimated Time
4-5 hours
