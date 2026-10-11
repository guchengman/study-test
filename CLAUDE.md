# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev (Vite, port 3000, proxies /api -> Express:3100)
npm run dev

# Backend dev (Express, port 3100, hot reload via node --watch)
cd server && npm run dev

# TypeScript type-check
npm run lint

# Unit tests (vitest; scoring engine has 28 green cases)
npm test

# Regenerate cross-target scoring artifacts from the SSOT (also runs automatically as `prebuild`)
npm run sync:scoring

# Refresh bundled Tesseract OCR assets into public/tesseract/
npm run setup:tesseract

# Production build to dist/
npm run build

# Electron
npm run electron:dev    # Run app pointing at local dist/
npm run electron:build  # Build + package Windows portable .exe

# Database migrations (automated runner, applies server/migrations/*.sql in order)
cd server && npm run migrate          # apply pending migrations (auto-baselines an existing DB)
npm run migrate:status                # show applied / pending
# First time adopting on an already-initialized DB, baseline without re-executing:
node src/migrate.js --baseline
```

## Architecture

**Single-page app (React 19 + TypeScript + Vite + Tailwind CSS v4)** with a three-view state machine: `welcome` → `exam` → `result`.

### State management

`AppProvider` in `context/AppContext` composes 5 custom hooks. Their return values are merged into one context consumed by all components:

```
AppProvider
├── useAuth()            — login/register/logout, JWT lifecycle, role switching, EmailJS verification
├── useToast()           — simple toast notification state
├── useUIState()         — modal visibility, user management UI, search/export state
├── useQuestionBank()    — questions, subjects, mistakes, favorites, data loading from API
└── useExam()            — exam session state, timer, answers, scoring, mistake tracking
```

All UI data (questions, subjects, mistake records, favorites) is loaded from the API on mount — no localStorage persistence beyond the JWT token.

Note: `src/hooks/` actually contains 7 hooks. `useFormalExam` (called directly by `FormalExamPage`) and `useBackPrevention` (called directly by `AppLayout`) are intentionally **not** merged into AppContext.

### Frontend structure (`src/`)
- `services/api.ts` — Typed `ApiClient` wrapping `fetch` with JWT auto-attachment and 401 handling. Exports 9 named API objects: `authApi`, `questionApi`, `subjectApi`, `practiceApi`, `syncApi`, `uploadApi`, `inviteCodeApi`, `studentApi`, `healthApi`. The formal-exam client lives separately in `services/examApi.ts`.
- `services/api.mappers.ts` — Dual-track type mapping layer: network DTOs (snake_case) → domain types; components only ever see domain types.
- `App.tsx` — React Router routes, all 5 pages code-split via `React.lazy` (AppLayout shell renders first): `<AppLayout>` wrapper with `/` (HomePage), `/exam` (ExamPage), `/result` (ResultPage), `/formal-exam` (FormalExamPage 正式考试), `/exams/manage` (ExamManagePage 组卷管理).
- `components/app/AppLayout.tsx` — Main orchestrator rendering header, footer, all modals (Login, Import, Help, Settings, Subject management, Student management, etc.), and `<Outlet />` for pages.
- `pages/` — Thin components that pull from context and delegate to screen-level component files.
- `components/app/` — Screen components: `WelcomeScreen.tsx`, `ExamScreen.tsx`, `ResultScreen.tsx`, `FormalExamScreen.tsx`, `FormalResultScreen.tsx`, `AppHeader.tsx`. Also `components/ui/` shared primitives (Button/EmptyState/Spinner/VirtualList), `components/exam/ExamForm.tsx`, and `components/import/` (ImportModal split by format).
- `types.ts` — Core types (`Question`, `Subject`, `MistakeRecord`, `AISettings`), default subjects, icon categories, smart subject name suggestions.

### Question types & scoring

Three question types stored in `questions` table with JSON columns for `options` and `answer`:
- `single` — single-choice (option letter or text match)
- `multiple` — multiple-choice (sorted comparison against answer array; supports label-to-text mapping)
- `programming` — code answer (whitespace-normalized, quote-normalized string comparison)

**Single source of truth (SSOT)**: `src/shared/scoring/index.ts` (pure functions `isAnswerCorrect`, `gradeQuestion`, `scoreByIndices`, `correctOptionIndices`, `formatTime`). `src/utils/examScoring.ts` is a compatibility shell that only re-exports — never copy logic into it. For formal exams, `gradeQuestion` does **not** auto-score programming questions (`is_correct=null`, `needs_manual=true`, manual review required).

`npm run sync:scoring` (hooked as `prebuild`, via esbuild in `scripts/build-scoring.mjs`) generates two artifacts: `server/src/utils/examScoring.generated.js` (ESM) and `chrome-extension/scoring.js` (IIFE, exposes global `StudyScoring`). ⚠️ Known tech debt: `server/src/routes/exams.js` currently imports the hand-written copy `server/src/utils/examScoring.js`, not the generated file — keep both in sync manually until unified.

### Backend (`server/`)

Express + MySQL (mysql2/promise pool, 10 connections, utf8mb4). ES modules (`"type": "module"`).

- `server/src/index.js` — App entry: loads `.env`, CORS (whitelist read from `ALLOWED_ORIGINS`, comma-separated; empty = same-origin only), mounts routes under `/api/*`, serves `dist/` as static files with SPA fallback, `/api/health` probe endpoint, Baidu OCR proxy `POST /api/ocr/baidu` (auth + rate limit 30/15min), `TRUST_PROXY` switch, and a production startup check enforcing `JWT_SECRET` ≥16 chars.
- `server/src/db.js` — Connection pool (reads DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME from env).
- `server/src/middleware/auth.js` — JWT sign/verify (default expiry 7d, env `JWT_EXPIRES_IN`), `authMiddleware` (required for most routes; users with `status≠active` get 403), `adminMiddleware` (admin + teacher).
- `server/src/routes/auth.js` — Register/login, user management, password reset, role conversion, visit counter, rate limiting on auth endpoints.
- `server/src/routes/questions.js` — CRUD with visibility scoping (own questions + shared subscriptions).
- `server/src/routes/subjects.js` — CRUD with sharing (none/all/students), subscriptions, student access control.
- `server/src/routes/practice.js` — Mistake records, favorites, study stats.
- `server/src/routes/sync.js` — Data migration/export (questions, mistakes, favorites, subjects).
- `server/src/routes/students.js` — Teacher's student management (approve/reject/remove).
- `server/src/routes/upload.js` — Image upload endpoint; `/api/uploads/` static files are served **behind `authMiddleware`** (images require login).
- `server/src/routes/exams.js` — 正式考试模块，13 endpoints：试卷 CRUD、`/available`、`/start`（复用未超时的 in_progress attempt）、`/submit`、`/attempts/:id`、`/:id/analysis`、`/:id/attempts`、`/:id/sweep`（超时收割）；programming 题不自动判分（needs_manual）。对应前端路由 `/formal-exam`、`/exams/manage`。
- `server/src/routes/ai.js` — Server-side Gemini proxy `POST /api/ai/gemini/generate` (authMiddleware + rate limiting).
- `server/src/routes/invite-codes.js` — `GET/POST/DELETE /api/invite-codes` invite code management.

### Database (MySQL)

12 tables, migrations `001_initial_schema.sql` through `010_exams.sql`:

| Table | Key columns |
|---|---|
| `users` | role (admin/teacher/student/independent), status (active/pending), teacher_id FK |
| `subjects` | id (string key), share_scope (none/all/students), created_by FK |
| `questions` | type (single/multiple/programming), options JSON, answer JSON, subject_id FK, created_by FK |
| `mistake_records` | user_id+question_id unique, consecutive_correct (3 = mastered, auto-removed) |
| `favorites` | user_id+question_id unique |
| `study_stats` | study time tracking |
| `invite_codes` | type (registration/subject), scope, max_uses |
| `subject_subscriptions` | user_id+subject_id unique, status (pending/approved/rejected) |
| `subject_student_access` | white-list for student-only shared subjects |
| `visit_counter` | singleton row |
| `exams` | 试卷定义：question_set JSON, total_points, duration_minutes, start/end_time, pass_score, status (draft/published/closed) |
| `exam_attempts` | 答卷：status (in_progress/submitted/auto_submitted), deadline (server-side timer), answers/details JSON. **No UNIQUE(exam_id,user_id)** — multiple attempts allowed, highest score counts |

### Subject sharing model

Three levels controlled by `share_scope` on the subjects table:
- `none` — private (creator only)
- `students` — visible to creator's students (teacher-student relationship), optional student white-list via `subject_student_access`
- `all` — any user can subscribe via invitation code (creates `subject_subscriptions` row, auto-approved)

### User roles

- `admin` — full access, can manage all users/subjects
- `teacher` — can create subjects, manage students, share subjects
- `student` — bound to a teacher, sees teacher's shared subjects
- `independent` — self-managed, no teacher binding

## Environment

Copy `server/.env.example` to `server/.env`. Required: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` (≥16 chars — enforced at startup in production; ≥32 recommended). Optional: `PORT` (default 3100), `ALLOWED_ORIGINS` (comma-separated CORS whitelist, empty = same-origin only), `TRUST_PROXY=1` behind reverse proxy, `JWT_EXPIRES_IN` (default 7d). AI keys (`GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, etc.) are compile-time injected via `vite.config.ts` `define` — in production builds they're stripped to empty strings (users input keys in-app or go through the server-side `/api/ai` proxy).

## Key conventions

- Terminal commands use native Bash / Shell, not PowerShell.
- `@/` import alias resolves to project **root** (e.g., `@/src/types`, `@/server/src/db.js`), configured in both `vite.config.ts` and `tsconfig.json`.
- Backend uses `.js` extension with ES modules; exceptions: `electron/main.cjs` and `ecosystem.config.cjs` (CommonJS).
- Subject IDs use string keys (default: `chinese`, `math`, `english`, `python`; custom: `custom_<timestamp>`).
- Migration system: numbered `server/migrations/NNN_*.sql` files applied in order by the automated runner `server/src/migrate.js` (tracks applied state in `schema_migrations`). Legacy ad-hoc runners (`run-00X.js`) are archived under `server/migrations/archive/`. To add a migration, drop a new `NNN_name.sql` into `server/migrations/`; it is applied automatically on next deploy.

## Other targets

- `electron/main.cjs` — Electron wrapper, loads `dist/index.html` (packaged or dev mode). Node integration disabled, context isolation on.
- `chrome-extension/` — Companion browser extension (MV3: manifest.json, popup, background script). `host_permissions` is limited to `https://xiaoyue.shop` / `https://www.xiaoyue.shop` — local dev testing requires editing the manifest. `scoring.js` is a **build artifact** (see Question types & scoring); never hand-edit it.
- `android/` — Capacitor-based Android app.
- `scripts/setup/install.sh` — One-click deployment script with optional flags (`--no-prompt`, `--db-host`, etc.). Other ops scripts live under `scripts/` (`deploy/`, `db/`, `db/fix/`, `data/`, `test/`, `utils/`, `config/`); server-side operational/diagnostic scripts live under `server/scripts/`.
- `start-app.bat` — Interactive one-click launcher at the repo **root** (menu: full dev / frontend-only / backend-only / production build). It resolves paths relative to its own location via `%~dp0`, so it must stay at the repo root; do not move it into `scripts/`.
- `ecosystem.config.cjs` — Portable PM2 **two-app** config for self-hosted deploys: `study-quiz-frontend` (Vite preview on :5173) + `study-quiz-backend` (:3100), paths derived from `__dirname` (cross-platform). ⚠️ The production server does **not** use it — `deploy.yml` manages a single pm2 app named `study-server`; don't start both (port conflict).
- `.github/workflows/deploy.yml` — GitHub Actions deployment on each push to main: `npm ci` (root + server) → build → rsync `dist/` + `server/src/` + `server/migrations/` (`--delete`) → write `server/.env` (NODE_ENV/TRUST_PROXY=1/JWT/DB/BAIDU/DEEPSEEK, chmod 600) → `npm ci --production` → `node src/migrate.js` → `pm2 restart study-server` → nginx reload → `/api/health` probe. Supports `workflow_dispatch` with `skip_build`.
