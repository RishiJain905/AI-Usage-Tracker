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
│  │   Base URL: http://localhost:11434              ││
│  │   (No API key required)                         ││
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
- Edit base URL (useful for proxies/self-hosted endpoints)
- Configure API key (links to API Key Manager)
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
│  │  (No API key required for local models)         ││
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

### 10.4 Implement API key encryption

Use Electron's `safeStorage` API to encrypt API keys at rest:

```typescript
// In main process
import { safeStorage } from 'electron';

function encryptKey(key: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(key).toString('base64');
  }
  // Fallback: base64 encoding (not secure, but better than plaintext)
  return Buffer.from(key).toString('base64');
}

function decryptKey(encrypted: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }
  return Buffer.from(encrypted, 'base64').toString();
}
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
