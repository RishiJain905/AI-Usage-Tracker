# Windows Installation Guide

## 1. Download the Installer

Grab the latest installer from the GitHub Releases page:

**[ai-usage-tracker-1.0.0-setup.exe](https://github.com/RishiJain905/AI-Usage-Tracker/releases/download/v1.0.0/ai-usage-tracker-1.0.0-setup.exe)** (~110 MB)

Or browse all releases at: https://github.com/RishiJain905/AI-Usage-Tracker/releases

## 2. Run the Installer

Double-click i-usage-tracker-1.0.0-setup.exe.

- You can choose the install directory (defaults to %LOCALAPPDATA%\ai-usage-tracker).
- A desktop shortcut and Start Menu entry are created automatically.
- The installer does **not** require admin privileges.

Windows SmartScreen may show a warning since the app is unsigned. Click **More info** > **Run anyway**.

## 3. Launch the App

After installation, the app launches automatically. You can also start it from:

- The desktop shortcut: **AI Usage Tracker**
- Start Menu: **AI Usage Tracker**

The app runs in the system tray. Look for the tray icon in your taskbar notification area.

## 4. Configure Your AI Tools

The proxy server starts automatically on **127.0.0.1:8765**. To start tracking AI usage, point your tools at this proxy.

### OpenAI / Anthropic / Groq / Mistral / Gemini (ChatGPT, Claude, Cursor, etc.)

Most tools support an HTTP proxy setting. Configure them to use:

`
http://127.0.0.1:8765
`

Alternatively, set the environment variable in your terminal before launching a tool:

`powershell
 = "http://127.0.0.1:8765"
 = "http://127.0.0.1:8765"
`

### Ollama (Local)

Ollama runs locally and is auto-detected by the proxy. No configuration needed as long as Ollama is running on its default port.

If you use Ollama's cloud models, set OLLAMA_HOST to route through the proxy:

`powershell
 = "http://127.0.0.1:8765"
`

### Custom Providers (GLM / MiniMax / ZhipuAI)

Go to **Settings > API Keys** in the app and enter your API key. The proxy will then route and track requests automatically.

## 5. Verify It's Working

1. Open the AI Usage Tracker dashboard from the system tray icon.
2. Make an API request through any configured tool.
3. The dashboard should show live activity on the **Overview** tab with token counts and costs.

You can also verify the proxy is running:

`powershell
curl http://127.0.0.1:8765/health
# Returns: {"status":"ok"}
`

## 6. App Data

All usage data is stored locally:

`
%APPDATA%\AI-Usage-Tracker\ai-tracker.db
`

Nothing leaves your machine. The proxy captures requests, extracts token usage from responses, and stores everything in a local SQLite database.

## Smoke Test Checklist

Use this to confirm a clean install:

- [ ] Installer runs to completion
- [ ] App launches from shortcut / Start Menu
- [ ] Main window renders the dashboard UI
- [ ] Proxy is running (curl http://127.0.0.1:8765/health returns ok)
- [ ] System tray icon is visible (check the ^ overflow area)
- [ ] Database created at %APPDATA%\AI-Usage-Tracker\ai-tracker.db
- [ ] No console errors on startup
- [ ] Right-click tray icon > **Quit** closes the app cleanly

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Proxy won't start | Check port 8765 isn't already in use. Change the port in **Settings > Proxy**. |
| API calls not tracked | Verify your tool is configured to use http://127.0.0.1:8765 as its proxy. |
| Blank dashboard | Make at least one API call through the proxy first. |
| App won't launch | Try running %LOCALAPPDATA%\ai-usage-tracker\AI Usage Tracker.exe directly. |
