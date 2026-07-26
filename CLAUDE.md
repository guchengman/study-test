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

### Frontend structure (`src/`)
- `services/api.ts` — Typed `ApiClient` wrapping `fetch` with JWT auto-attachment and 401 handling. Exports named API objects: `authApi`, `questionApi`, `subjectApi`, `practiceApi`, `syncApi`, `uploadApi`.
- `App.tsx` — React Router routes: `<AppLayout>` wrapper with `/` (HomePage), `/exam` (ExamPage), `/result` (ResultPage), `/formal-exam` (FormalExamPage 正式考试), `/exams/manage` (ExamManagePage 组卷管理).
- `components/app/AppLayout.tsx` — Main orchestrator rendering header, footer, all modals (Login, Import, Help, Settings, Subject management, Student management, etc.), and `<Outlet />` for pages.
- `pages/` — Thin components that pull from context and delegate to screen-level component files.
- `components/app/` — Screen components: `WelcomeScreen.tsx`, `ExamScreen.tsx`, `ResultScreen.tsx`, `AppHeader.tsx`.
- `types.ts` — Core types (`Question`, `Subject`, `MistakeRecord`, `AISettings`), default subjects, icon categories, smart subject name suggestions.

### Question types & scoring

Three question types stored in `questions` table with JSON columns for `options` and `answer`:
- `single` — single-choice (option letter or text match)
- `multiple` — multiple-choice (sorted comparison against answer array; supports label-to-text mapping)
- `programming` — code answer (whitespace-normalized, quote-normalized string comparison)

Scoring logic in `src/utils/examScoring.ts` (pure function `isAnswerCorrect`, no React dependency).

### Backend (`server/`)

Express + MySQL (mysql2/promise pool, 10 connections, utf8mb4). ES modules (`"type": "module"`).

- `server/src/index.js` — App entry: loads `.env`, CORS (allowlisted origins), mounts routes under `/api/*`, serves `dist/` as static files with SPA fallback, Baidu OCR proxy.
- `server/src/db.js` — Connection pool (reads DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME from env).
- `server/src/middleware/auth.js` — JWT sign/verify, `authMiddleware` (required for most routes), `adminMiddleware` (admin + teacher).
- `server/src/routes/auth.js` — Register/login, user management, password reset, role conversion, visit counter, rate limiting on auth endpoints.
- `server/src/routes/questions.js` — CRUD with visibility scoping (own questions + shared subscriptions).
- `server/src/routes/subjects.js` — CRUD with sharing (none/all/students), subscriptions, student access control.
- `server/src/routes/practice.js` — Mistake records, favorites, study stats.
- `server/src/routes/sync.js` — Data migration/export (questions, mistakes, favorites, subjects).
- `server/src/routes/students.js` — Teacher's student management (approve/reject/remove).
- `server/src/routes/upload.js` — Image upload endpoint, serves `/api/uploads/` as static files.
- `server/src/routes/exams.js` — 正式考试模块：试卷 CRUD、开始/提交作答、历史与成绩分析（对应前端路由 `/formal-exam`、`/exams/manage`）。

### Database (MySQL)

10 tables in `001_initial_schema.sql` through `009_add_help_read.sql`:

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

Copy `.env.example` to `server/.env`. Required: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` (≥16 chars, ≥32 in production). AI keys (`GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, etc.) are compile-time injected via `vite.config.ts` `define` — in production builds they're stripped to empty strings (users input keys in-app or go through the server-side `/api/ai` proxy).

## Key conventions

- Terminal commands use native Bash / Shell, not PowerShell.
- `@/` import alias resolves to project **root** (e.g., `@/src/types`, `@/server/src/db.js`), configured in both `vite.config.ts` and `tsconfig.json`.
- Backend uses `.js` extension with ES modules; exceptions: `electron/main.cjs` and `ecosystem.config.cjs` (CommonJS).
- Subject IDs use string keys (default: `chinese`, `math`, `english`, `python`; custom: `custom_<timestamp>`).
- Migration system: numbered `server/migrations/NNN_*.sql` files applied in order by the automated runner `server/src/migrate.js` (tracks applied state in `schema_migrations`). Legacy ad-hoc runners (`run-00X.js`) are archived under `server/migrations/archive/`. To add a migration, drop a new `NNN_name.sql` into `server/migrations/`; it is applied automatically on next deploy.

## Other targets

- `electron/main.cjs` — Electron wrapper, loads `dist/index.html` (packaged or dev mode). Node integration disabled, context isolation on.
- `chrome-extension/` — Companion browser extension (manifest.json, popup, background script).
- `android/` — Capacitor-based Android app.
- `scripts/setup/install.sh` — One-click deployment script with optional flags (`--no-prompt`, `--db-host`, etc.). Other ops scripts live under `scripts/` (`deploy/`, `db/`, `db/fix/`, `data/`, `test/`, `utils/`, `config/`); server-side operational/diagnostic scripts live under `server/scripts/`.
- `start-app.bat` — Interactive one-click launcher at the repo **root** (menu: full dev / frontend-only / backend-only / production build). It resolves paths relative to its own location via `%~dp0`, so it must stay at the repo root; do not move it into `scripts/`.
- `.github/workflows/deploy.yml` — GitHub Actions deployment; on each push it runs `npm ci`, builds, rsyncs `dist/` + `server/src/`, applies DB migrations (`node src/migrate.js`), then `pm2 restart`.
