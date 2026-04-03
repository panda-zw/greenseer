# Greenseer

Automated international job search agent. Scrapes jobs from multiple sources, uses AI to verify visa sponsorship eligibility, matches against your CV, generates country-formatted application documents, and tracks your applications — all from a single desktop app.

## Features

- **Multi-source job scraping** — Adzuna API, LinkedIn, and Seek (AU/NZ)
- **AI-powered visa analysis** — Verifies visa sponsorship likelihood per country using Claude
- **CV matching** — Scores jobs against your CV with matched/missing skills breakdown
- **Known sponsors database** — 400+ hardcoded sponsors + UK Home Office register import (~50,000)
- **Document generation** — Country-formatted CVs and cover letters with multiple templates
- **Application tracker** — Kanban board to manage your pipeline
- **Structured CV editor** — Edit your CV with sections, bullet points, and AI assistance
- **DOCX/PDF export** — Download generated documents in multiple formats
- **Dark/light mode** — Zinc-themed UI with theme toggle

## Architecture

Three processes communicating via localhost:

```
Tauri (Rust)          NestJS Sidecar           React Frontend
├── System tray       ├── Job scraping          ├── Shadcn/ui
├── Window mgmt       ├── AI analysis           ├── TanStack Query
├── OS keychain       ├── Document gen          ├── React Router
├── Sidecar mgmt      ├── SQLite (Prisma)       └── Vite
└── Notifications     └── localhost:11434
```

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri v2 (Rust) |
| Backend | NestJS, Prisma, SQLite |
| Frontend | React 19, TypeScript, Tailwind CSS, Shadcn/ui |
| AI | Claude API (Anthropic) |
| Scraping | Playwright (LinkedIn), HTTP (Seek, Adzuna) |
| Monorepo | pnpm workspaces |

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **Rust** >= 1.75 (for Tauri)
- **Anthropic API key** (for AI features)
- **Adzuna API credentials** (optional, for Adzuna job search)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/panda-zw/greenseer.git
cd greenseer
pnpm install
```

### 2. Configure environment

```bash
cp apps/sidecar/.env.example apps/sidecar/.env
```

Edit `apps/sidecar/.env` with your API keys:

```env
ANTHROPIC_API_KEY=sk-ant-xxxxx
ADZUNA_APP_ID=your_app_id
ADZUNA_API_KEY=your_api_key
ENCRYPTION_KEY=  # Optional: generate with node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Set up the database

```bash
cd apps/sidecar
npx prisma db push
```

### 4. Run in development

```bash
# Terminal 1: Start the sidecar
cd apps/sidecar
pnpm dev

# Terminal 2: Start the Tauri desktop app
cd apps/desktop
pnpm tauri dev
```

Or run the sidecar standalone (without Tauri) for frontend-only development:

```bash
# Terminal 1
cd apps/sidecar && pnpm dev

# Terminal 2
cd apps/desktop && pnpm dev
```

Then open `http://localhost:1420` in your browser.

## Project Structure

```
greenseer/
├── apps/
│   ├── desktop/           # Tauri v2 + React frontend
│   │   ├── src/           # React app (pages, components, hooks)
│   │   └── src-tauri/     # Rust core (tray, sidecar, commands)
│   └── sidecar/           # NestJS backend
│       ├── src/           # Modules: scraper, ai, jobs, cv, documents, tracker
│       └── prisma/        # Database schema
├── packages/
│   └── shared/            # Shared TypeScript types
├── LICENSE
└── README.md
```

## Supported Countries

Australia, Canada, Germany, Ireland, Japan, Netherlands, New Zealand, Singapore, United Kingdom, United States

Each country has specific visa sponsorship verification prompts and CV formatting rules.

## Security

- API keys are stored in the OS keychain (macOS Keychain / Windows Credential Manager) in production
- Sidecar communication is authenticated with a per-session secret
- Sensitive data (CV text, generated documents) is encrypted at rest with AES-256-GCM
- Content Security Policy restricts webview connections
- File uploads are size-limited and MIME-type filtered
- See [SECURITY.md](SECURITY.md) for vulnerability reporting

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
