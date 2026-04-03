# Contributing to Greenseer

Thanks for your interest in contributing! This guide covers how to get set up, submit changes, and report issues.

## Development Setup

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Rust >= 1.75 (install via [rustup](https://rustup.rs/))
- Tauri CLI: `cargo install tauri-cli --version "^2"`

### First-time setup

```bash
git clone https://github.com/panda-zw/greenseer.git
cd greenseer
pnpm install

# Set up the sidecar environment
cp apps/sidecar/.env.example apps/sidecar/.env
# Edit .env with your API keys

# Generate Prisma client
cd apps/sidecar
npx prisma generate
npx prisma db push
```

### Running locally

```bash
# Sidecar (NestJS backend)
cd apps/sidecar && pnpm dev

# Desktop app (Tauri + React)
cd apps/desktop && pnpm tauri dev

# Or frontend only (no Tauri, opens in browser)
cd apps/desktop && pnpm dev
```

### Type checking

```bash
# Frontend
cd apps/desktop && npx tsc --noEmit

# Sidecar
cd apps/sidecar && npx tsc --noEmit

# Rust
cd apps/desktop/src-tauri && cargo check
```

## Making Changes

### Branch naming

- `feat/short-description` for new features
- `fix/short-description` for bug fixes
- `docs/short-description` for documentation
- `refactor/short-description` for refactoring

### Commit messages

Use concise, descriptive commit messages:

```
feat: add batch job re-analysis from feed
fix: resolve horizontal overflow in job list at narrow widths
docs: add setup instructions for Linux
```

### Pull request process

1. Fork the repository and create your branch from `main`
2. Make your changes with clear, focused commits
3. Ensure TypeScript compiles with no errors (frontend + sidecar)
4. Ensure Rust compiles with `cargo check`
5. Test your changes manually in the desktop app
6. Open a PR with a clear description of what changed and why

### Code style

- TypeScript: follow the existing patterns (no explicit return types on React components, minimal comments)
- Rust: `cargo fmt` before committing
- CSS: Tailwind utility classes, match existing sizing/spacing conventions
- Components: Shadcn/ui with Zinc theme — no custom shadows, use border-based separation

### What makes a good PR

- Focused on a single concern
- Doesn't include unrelated changes
- Includes before/after screenshots for UI changes
- Describes the "why", not just the "what"

## Reporting Bugs

Open an issue with:

1. What you expected to happen
2. What actually happened
3. Steps to reproduce
4. Your OS and app version
5. Screenshots if applicable

## Requesting Features

Open an issue describing:

1. The problem you're trying to solve
2. Your proposed solution (if any)
3. Alternatives you've considered

## Project Structure

| Directory | What it does |
|-----------|-------------|
| `apps/desktop/src/` | React frontend (pages, components, hooks) |
| `apps/desktop/src-tauri/` | Rust core (system tray, sidecar lifecycle, keychain) |
| `apps/sidecar/src/` | NestJS backend (scraping, AI, documents, tracker) |
| `packages/shared/` | TypeScript types shared between frontend and sidecar |

## Security

If you discover a security vulnerability, please follow the process in [SECURITY.md](SECURITY.md). Do **not** open a public issue for security bugs.
