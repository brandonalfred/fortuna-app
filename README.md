# Fortuna

[![CI](https://github.com/brandonalfred/fortuna-app/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/brandonalfred/fortuna-app/actions/workflows/ci.yml)

AI-powered sports betting analysis assistant built with the Claude Agent SDK.

## Features

- Real-time odds fetching from The Odds API
- Historical odds analysis for line movement tracking
- Web search for team stats, injuries, and news
- Extended thinking for complex analysis
- Sandboxed code execution for custom analysis scripts
- Persistent chat history with PostgreSQL

## Tech Stack

- **Next.js 16** with App Router and React 19
- **Claude Agent SDK** with Opus 4.5 model
- **Tailwind CSS v4** + shadcn/ui
- **Prisma 7** with Neon PostgreSQL
- **Vercel Sandbox** for secure agent execution

## Getting Started

1. Install dependencies:
   ```bash
   bun install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Add your CLAUDE_CODE_OAUTH_TOKEN and ODDS_API_KEY
   ```

3. Start the Prisma dev server (in a separate terminal):
   ```bash
   bunx prisma dev --port 5434
   ```

4. Run database migrations:
   ```bash
   bunx prisma migrate dev
   ```

5. Start the development server:
   ```bash
   bun dev
   ```

Open [http://localhost:3000](http://localhost:3000) to start chatting with Fortuna.

## Development

```bash
bun dev           # Start dev server with Turbopack
bun run lint      # Lint and auto-fix
bun run type-check # TypeScript checking
bun run build     # Production build
```

## Architecture

The app streams agent responses via Server-Sent Events (SSE). In development, the Claude Agent SDK runs locally. In production on Vercel, agents run inside isolated sandboxes with per-chat persistence.

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.
