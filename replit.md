# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo (React Native) with WebView, biometric auth, push notifications

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── doklad-ai/          # Expo React Native mobile app
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `artifacts/doklad-ai` (`@workspace/doklad-ai`)

Expo React Native mobile app for Doklad.ai — an accounting/invoicing web application wrapper.

- **WebView**: Loads `https://doklad.ai` in a native WebView with pull-to-refresh, back navigation, error handling, origin-restricted navigation
- **Document Scanner**: Camera-based receipt/invoice scanning via `expo-camera`, with gallery import, base64 encoding, and bridge injection to WebView
- **JS Bridge**: Typed message protocol (`lib/bridge.ts`) for native↔web communication; web→native: `OPEN_SCANNER`, `OPEN_CAMERA`, `PICK_FILE`, `START_DICTATION`, `STOP_DICTATION`, `OPEN_SETTINGS`; native→web: `FILE_PICKED`, `FILE_PICK_CANCELLED`, `DICTATION_RESULT`, `DICTATION_ERROR`, `BIOMETRIC_STATUS`, `NOTIFICATION_TOKEN`, `APP_READY`; uses `window.dispatchEvent(MessageEvent)` for delivery
- **OPEN_CAMERA**: Opens camera via `expo-image-picker.launchCameraAsync`, returns base64 photo as `FILE_PICKED`
- **PICK_FILE**: Opens document picker via `expo-document-picker`, supports images + PDF, returns base64 as `FILE_PICKED`
- **START_DICTATION**: Speech-to-text via `@react-native-voice/voice` (requires dev build), sends interim + final results as `DICTATION_RESULT`
- **Native Settings**: Settings screen with biometric toggle, notification status, privacy/terms links, app version
- **Offline Mode**: NetInfo-based connectivity detection, branded offline screen, auto-reload on reconnect
- **Biometric auth**: Face ID / Touch ID via `expo-local-authentication`, managed by `context/AuthContext.tsx`
- **Push notifications**: Via `expo-notifications`, managed by `context/NotificationContext.tsx`
- **Splash screen**: Custom branded splash with blue (#1A56DB) background
- **App icon**: Custom generated icon at `assets/images/icon.png`
- **EAS Build**: Configured via `eas.json` with development, preview, and production profiles
- **Bundle IDs**: `ai.doklad.app` (iOS & Android)
- **Security**: WebView origin allowlist (`doklad.ai`, `www.doklad.ai`, `app.doklad.ai`); external URLs open in system browser; bridge messages only sent/received on trusted pages
- **Permissions**: iOS: NSFaceIDUsageDescription, NSCameraUsageDescription, NSPhotoLibraryUsageDescription, NSSpeechRecognitionUsageDescription, NSMicrophoneUsageDescription (bilingual EN/CZ); Android: USE_BIOMETRIC, USE_FINGERPRINT, CAMERA, RECORD_AUDIO, RECEIVE_BOOT_COMPLETED

Key files:
- `app/index.tsx` — Main entry, shows lock screen or WebView based on auth state
- `components/WebViewScreen.tsx` — WebView with bridge message handler (camera, file picker, dictation, scanner, settings), offline handling
- `components/DocumentScanner.tsx` — Camera scanner with gallery import and image preview/confirm flow
- `components/SettingsScreen.tsx` — Native settings (biometric, notifications, legal links, version)
- `components/OfflineScreen.tsx` — Branded offline screen with retry
- `components/BiometricLockScreen.tsx` — Biometric authentication screen
- `context/AuthContext.tsx` — Biometric auth state management
- `context/NotificationContext.tsx` — Push notification registration and handling
- `context/NetworkContext.tsx` — Network connectivity state and URL tracking
- `lib/bridge.ts` — Typed message protocol for WebView↔native communication
- `eas.json` — EAS Build configuration for Android & iOS

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
