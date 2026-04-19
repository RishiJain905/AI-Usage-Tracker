# Task 11: System Tray & Background Operation

## Objective
Add system tray support so the proxy can run in the background without the main window open. The app should minimize to tray and continue tracking usage.

## Steps

### 11.1 Create system tray icon

File: `src/main/tray.ts`

```typescript
import { Tray, Menu, nativeImage } from 'electron';

export function createTray(): Tray {
  const icon = nativeImage.createFromPath('resources/tray-icon.png');
  const tray = new Tray(icon);

  tray.setToolTip('AI Usage Tracker');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'AI Usage Tracker', enabled: false },
    { type: 'separator' },
    { label: 'Today: 1.2M tokens | $4.25', enabled: false },   // AGGREGATE total across all models
    { type: 'separator' },
    { label: 'Top models today:', enabled: false },
    { label: '  GPT-4o: 320K tok', enabled: false },             // Per-model quick view
    { label: '  Claude 3.5: 240K tok', enabled: false },
    { label: '  Llama 3.1: 100K tok', enabled: false },
    { type: 'separator' },
    { label: 'This Week: 4.5M tokens | $85.20', enabled: false },// Weekly aggregate
    { label: 'All Time: 12.8M tokens | $1,205.80', enabled: false }, // All-time aggregate
    { type: 'separator' },
    { label: 'Show Dashboard', click: () => showWindow() },
    { label: 'Proxy Status: Running', enabled: false },
    { label: 'Stop Proxy', click: () => stopProxy() },
    { label: 'Start Proxy', click: () => startProxy() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  return tray;
}
```

### 11.2 Design tray icon asset

Create a simple tray icon:
- 16x16 and 32x32 PNG for Windows
- Template icon for macOS (monochrome, auto-adapts to dark/light menu bar)
- Simple design: token/counter icon or "AT" (AI Tracker) monogram
- Use green dot overlay when proxy is active, red when stopped

### 11.3 Implement minimize-to-tray behavior

File: `src/main/index.ts`

```typescript
// Prevent default close — minimize to tray instead
mainWindow.on('close', (event) => {
  if (!app.isQuitting) {
    event.preventDefault();
    mainWindow.hide();
  }
});

// Show window when clicking tray icon
tray.on('click', () => {
  mainWindow.show();
  mainWindow.focus();
});
```

### 11.4 Run proxy without window

The proxy server must continue running when the main window is hidden:
- Proxy server runs in the main Electron process (not the renderer)
- Closing the window does NOT stop the proxy
- Proxy only stops on full app quit (from tray menu)
- Show proxy status in tray tooltip and context menu

### 11.5 Add tray notification support

Show native OS notifications for important events:
- Proxy started/stopped
- Budget threshold reached (e.g., "You've used 80% of your monthly budget")
- Provider connection error
- First request of the day (summary notification)

```typescript
import { Notification } from 'electron';

function showNotification(title: string, body: string) {
  new Notification({ title, body, icon: 'resources/notification-icon.png' }).show();
}
```

### 11.6 Update tray menu dynamically

The tray context menu should update in real-time:
- **Today's aggregate token count and cost** (sum across ALL models)
- **Top 3 models today** with individual token counts (per-model visibility)
- **This week's aggregate total** and **all-time aggregate total**
- Proxy status (running/stopped with color indicator)
- Enable/disable "Stop Proxy" vs "Start Proxy" based on current state

Refresh the menu every 30 seconds or on usage updates.

### 11.7 Add auto-launch on startup (optional)

File: `src/main/auto-launch.ts`

Use `app.setLoginItemSettings()` to allow users to auto-start on login:
- Setting in General Settings: "Start on system boot"
- When enabled: minimize to tray on launch (don't show window)

```typescript
import { app } from 'electron';

function setAutoLaunch(enabled: boolean) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,  // Start minimized to tray
  });
}
```

### 11.8 Handle single instance lock

Prevent multiple instances of the app:

```typescript
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    mainWindow.show();
    mainWindow.focus();
  });
}
```

### 11.9 Add keyboard shortcuts

Global shortcuts (work even when app is focused elsewhere):
- `Ctrl+Shift+A` — Show/hide the app window
- `Ctrl+Shift+P` — Toggle proxy on/off

App-level shortcuts (when window is focused):
- `Ctrl+1-5` — Switch between dashboard tabs
- `Ctrl+,` — Open settings
- `Ctrl+R` — Refresh data
- `Ctrl+F` — Focus search in history view

## Verification
- Tray icon appears in system tray on launch
- Closing window minimizes to tray (app keeps running)
- Clicking tray icon restores window
- Proxy continues running when window is hidden
- Tray menu shows **today's aggregate stats** (all models combined)
- Tray menu shows **top 3 models** with per-model token counts
- Tray menu shows **weekly and all-time aggregate totals**
- Notifications fire for budget thresholds
- Single instance lock prevents duplicate app
- Keyboard shortcuts work globally and in-app
- Auto-launch setting works (if implemented)

## Dependencies
- Task 2 (Proxy Server Core)
- Task 6 (Dashboard UI Foundation)

## Estimated Time
2-3 hours
