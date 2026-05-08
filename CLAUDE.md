# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Guidelines

**Think before coding.** State assumptions explicitly. When uncertain, present multiple interpretations rather than silently choosing one. If something is confusing, stop and name it.

**Simplicity first.** Minimum code that solves the problem. No speculative features, no abstractions for one-off code, no unrequested configurability, no error handling for impossible states. If 200 lines could be 50, rewrite.

**Surgical changes.** Touch only what you must. Don't "improve" adjacent code, comments, or formatting. Match existing style even when it differs from preference. Remove only imports/variables that *your* changes made unused — leave pre-existing dead code unless asked. Every changed line should trace directly to the request.

**Goal-driven.** Convert tasks into verifiable goals. "Fix the bug" → write a reproduction test first. "Refactor X" → tests pass before and after. For multi-step work, define verification checks for each step.

## Commands

```bash
npm run dev              # Start Vite dev server (port 3000), proxies /api to Express:3100
npm run build            # Production build to dist/
npm run lint             # TypeScript type-check (tsc --noEmit)
npm run electron:dev     # Run Electron app pointing at local dist/
npm run electron:build   # Build + package Windows portable .exe
```

The backend Express server (port 3100) must be started separately:

```bash
node server/src/index.js          # or: npx tsx server/src/index.js
```

## Architecture

**Frontend** (`src/`): React 19 SPA with TypeScript, Vite, Tailwind CSS v4. Single-file App.tsx uses a state-machine pattern with three views: `welcome` → `exam` → `result`. All UI state (questions, mistakes, favorites, subjects) is loaded from the API on mount — there is no localStorage data persistence.

- `src/services/api.ts`: Typed API client wrapping `fetch` with JWT auto-attachment and 401 expiry handling. All backend calls go through named API objects (`authApi`, `questionApi`, `subjectApi`, `practiceApi`, `syncApi`).
- `src/hooks/useAuth.ts`: Auth hook managing login/register/logout/role-switching, verification codes via EmailJS, and JWT token lifecycle.
- `src/types.ts`: Core types (`Question`, `Subject`, `MistakeRecord`, `AISettings`) and constants (`DEFAULT_SUBJECTS`, `SUBJECT_ICONS`).
- `src/utils/examScoring.ts`: Answer correctness checking for single/multiple/programming question types.
- `src/services/geminiService.ts` / `fileService.ts`: AI question generation and Word/PDF import.

**Backend** (`server/`): Express + MySQL (mysql2/promise). JWT auth with bcrypt password hashing.

- `server/src/index.js`: App entry — loads `.env`, sets up CORS (allowlisted origins), mounts all route modules under `/api/*`, serves `dist/` as static files with SPA fallback, runs on port 3100.
- `server/src/db.js`: MySQL connection pool (utf8mb4, 10 connections).
- `server/src/middleware/auth.js`: JWT sign/verify and `authMiddleware` (required for most routes). `adminMiddleware` also allows teachers.
- `server/src/routes/`: auth, questions, subjects, practice, sync, invite-codes, students, ai.
- `server/migrations/`: Numbered SQL migration files (`001_initial_schema.sql` through `007_user_ai_settings.sql`).

**Database** (MySQL): Core tables — `users` (admin/teacher/student/independent roles), `subjects` (with share_scope none/all/students), `questions` (JSON options/answer columns), `mistake_records`, `favorites`, `invite_codes`, `subject_subscriptions`, `subject_student_access`.

**Other targets**:
- `electron/main.cjs`: Electron wrapper that loads `dist/index.html` (packaged or dev mode).
- `chrome-extension/`: Companion browser extension (manifest.json, popup, background script).
- `android/`: Capacitor-based Android app.

## Environment

Copy `.env.example` to `server/.env` and configure `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` (≥16 chars, ≥32 in production). AI keys (GEMINI_API_KEY, DEEPSEEK_API_KEY, etc.) are embedded at build time via `vite.config.ts` `define` — in production builds they are stripped to empty strings.

## Key conventions

- Terminal commands must use native Bash / Shell, never PowerShell.
- The `@/` import alias resolves to project root (configured in both `vite.config.ts` and `tsconfig.json`).
- Backend uses `.js` extension with ES modules (`"type": "module"` in package.json) but uses CommonJS `require` in `electron/main.cjs` and `ecosystem.config.cjs`.
- Question types: `single`, `multiple`, `programming`. Answers are stored as JSON in the database.
- Subject IDs use string keys (e.g., `chinese`, `math`, `custom_<timestamp>`).
- The frontend `questionBank.ts` contains a hardcoded initial question bank used as a fallback/seed.
