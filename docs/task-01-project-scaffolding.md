# Task 1: Project Scaffolding

## Objective
Set up the entire project structure with Electron, Vite, React, TypeScript, and shadcn/ui.

## Prerequisites
- Node.js 18+ installed
- npm or pnpm installed

## Steps

### 1.1 Initialize Electron + Vite + React project
Use `electron-vite` to scaffold the project with React + TypeScript:

```bash
npm create @quick-start/electron@latest
```

Select:
- Project name: `ai-usage-tracker`
- Template: `React` + `TypeScript`

This creates the standard Electron + Vite + React structure:
```
ai-usage-tracker/
├── electron/
│   ├── main/          # Main process
│   ├── preload/       # Preload scripts
│   └── resources/     # Static assets for main process
├── src/               # Renderer process (React)
├── electron.vite.config.ts
├── package.json
└── tsconfig.json
```

### 1.2 Install core dependencies

```bash
# UI Framework
npm install tailwindcss @tailwindcss/vite

# shadcn/ui setup
npx shadcn@latest init

# Routing
npm install react-router-dom

# State management
npm install zustand

# Database
npm install better-sqlite3
npm install -D @types/better-sqlite3

# Proxy server
npm install http-proxy-middleware http

# Charts
npm install recharts date-fns

# Icons
npm install lucide-react

# Utilities
npm install uuid
npm install -D @types/uuid
```

### 1.3 Configure Tailwind CSS

Update `electron.vite.config.ts` to include Tailwind plugin, and set up `src/renderer/src/assets/main.css` with Tailwind directives.

### 1.4 Configure shadcn/ui

Create `components.json` with:
```json
{
  "style": "default",
  "tailwind": {
    "config": "tailwind.config.js"
  },
  "framework": "vite",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

### 1.5 Set up project directory structure

Create the full directory structure:

```
src/
├── main/                          # Electron main process
│   ├── index.ts                    # Main entry
│   ├── proxy/                      # Proxy server
│   │   ├── server.ts              # Proxy server setup
│   │   ├── providers/             # Provider-specific logic
│   │   │   ├── openai.ts
│   │   │   ├── anthropic.ts
│   │   │   ├── ollama.ts
│   │   │   ├── glm.ts
│   │   │   ├── minimax.ts
│   │   │   ├── gemini.ts
│   │   │   ├── mistral.ts
│   │   │   └── groq.ts
│   │   └── token-extractor.ts     # Extract tokens from responses
│   ├── database/                   # Database layer
│   │   ├── init.ts                # Schema initialization
│   │   ├── repository.ts          # Data access layer
│   │   └── migrations/           # Schema migrations
│   ├── cost/                       # Cost calculation
│   │   ├── pricing.ts             # Model pricing data
│   │   └── calculator.ts         # Cost calculation logic
│   ├── tray.ts                    # System tray
│   └── ipc/                       # IPC handlers
│       └── handlers.ts
├── preload/
│   └── index.ts                    # Preload with exposed APIs
└── renderer/                       # React app
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── components/
        │   ├── ui/                 # shadcn components
        │   ├── layout/            # App layout
        │   │   ├── AppLayout.tsx
        │   │   ├── Sidebar.tsx
        │   │   └── Header.tsx
        │   ├── dashboard/          # Dashboard views
        │   │   ├── Overview.tsx
        │   │   ├── ByProvider.tsx
        │   │   ├── ByModel.tsx
        │   │   ├── ByTime.tsx
        │   │   └── CostView.tsx
        │   ├── charts/             # Chart components
        │   │   ├── TokenChart.tsx
        │   │   ├── CostChart.tsx
        │   │   └── UsageTimeline.tsx
        │   └── settings/          # Settings views
        │       ├── GeneralSettings.tsx
        │       ├── ProviderConfig.tsx
        │       └── ApiKeyManager.tsx
        ├── hooks/                  # Custom React hooks
        │   ├── useUsageData.ts
        │   └── useSettings.ts
        ├── stores/                 # Zustand stores
        │   ├── usageStore.ts
        │   └── settingsStore.ts
        ├── lib/                    # Utilities
        │   └── utils.ts
        └── types/                  # TypeScript types
            ├── provider.ts
            ├── usage.ts
            └── settings.ts
```

### 1.6 Configure TypeScript paths

Update `tsconfig.json` to add path aliases:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/renderer/src/*"],
      "@main/*": ["./src/main/*"],
      "@preload/*": ["./src/preload/*"]
    }
  }
}
```

### 1.7 Set up basic Electron main process

Configure main process to:
- Create a browser window with React dev tools in development
- Load the Vite dev server in dev mode, built files in production
- Set proper window dimensions (1200x800 default)

### 1.8 Set up basic React renderer

Create minimal `App.tsx` with React Router and a placeholder home page.

### 1.9 Add dev scripts

Update `package.json` scripts:
```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "postinstall": "electron-builder install-app-deps"
  }
}
```

## Verification
- `npm run dev` launches Electron window with React app
- Hot module replacement works for renderer changes
- shadcn/ui button component renders correctly
- Tailwind CSS utility classes work in components
- No TypeScript compilation errors

## Estimated Time
2-3 hours
