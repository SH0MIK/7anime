# 7Anime (7ANIME_NEW)

Next-generation anime discovery, tracking, and streaming platform built with a high-performance modern monorepo architecture.

## Monorepo Architecture

```text
E:\7ANIME_NEW\
├── frontend/             # React 19 + TypeScript + Vite + Tailwind CSS + Zustand
├── backend/              # Node.js + TypeScript + Express + Multi-Source Resolver
├── shared/               # Shared TypeScript domain contracts & types
├── docs/                 # System architecture, research, and QA verification logs
├── .env.example          # Sanitized environment configuration template
└── package.json          # Root monorepo workspace orchestration
```

## Quick Start

### 1. Setup Environment
```bash
# Copy example environment configuration
cp backend/.env.example backend/.env
# Edit backend/.env with your verified provider credentials
```

### 2. Development
```bash
# Run backend server (Port 5000)
npm run dev:backend

# Run frontend dev server with API proxy (Port 5173)
npm run dev:frontend
```

### 3. Production Build & Verification
```bash
# Build both frontend and backend
npm run build

# Preview production frontend
npm run preview:frontend
```

## Safety & Boundaries
* Legacy production project (`E:\7ANIME_CODEX`) remains protected in strict READ-ONLY mode.
* Reference repository (`E:\ani.pm-main`) remains protected in strict READ-ONLY mode.
* Zero secrets in code; all provider credentials reside exclusively in server-side environment variables.
