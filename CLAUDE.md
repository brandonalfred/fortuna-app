# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev              # Start development server with Turbopack (localhost:3000)
bun run build        # Production build (runs migrations first)
bun run build:ci     # Production build without migrations (CI)
bun run lint         # Lint and auto-fix with Biome
bun run lint:check   # Lint without fixing (CI)
bun run lint:prisma  # Lint Prisma schema naming conventions
bun run type-check   # TypeScript type checking
bunx prisma generate # Regenerate Prisma client (required before type-check/lint after fresh install or schema changes)
```

## Tech Stack

- **Next.js 16** with App Router and React Server Components
- **React 19**
- **Bun** as package manager (use `bun install`, not npm/yarn)
- **Biome** for linting/formatting (not ESLint/Prettier)
- **Tailwind CSS v4** with `@theme inline` syntax in globals.css
- **shadcn/ui** components - add via `bunx shadcn@latest add <component>`
- **Prisma 7** with PostgreSQL (Neon serverless adapter)
- **Better Auth** for authentication (email/password, with MFA planned)
- **Claude Agent SDK** for AI-powered sports betting analysis
- **Vercel Sandbox** for secure agent code execution in production

## Code Style

Biome enforces formatting with tabs and double quotes. Run `bun run lint` to auto-fix.

## Git Workflow

When creating new features or starting new work:
1. Start from a fresh `main` branch: `git checkout main && git pull origin main`
2. Create a new feature branch: `git checkout -b feature/<description>`
3. Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, etc.

## Custom Skills

This project has custom skills in `.claude/skills/`:

### /pr - Create Pull Request
Commits changes, pushes branch, and creates a PR with standardized format.
- PR descriptions use "What" and "Why" sections only
- **No test plan section** should be included
- Title taken from commit message
- Base branch: `main`

### /draft-pr - Create Draft Pull Request
Same as `/pr` but creates a draft PR (`gh pr create --draft`).
- Use for work-in-progress PRs that aren't ready for review
- Same description format: "What" and "Why" only, no test plan

### /odds-api - Fetch Live Odds
Fetches current sports betting odds from The Odds API.

### /odds-api-historical - Historical Odds
Queries historical betting odds snapshots. Critical: always use 10:00 AM ET (15:00 UTC) as snapshot time to capture all games before any start.

### api-sports (Agent-Internal)
Player and team statistics from API-Sports.io for NBA, NFL, MLB, and NHL. Used by the agent for data-driven betting analysis - calculates hit rates, trends, and matchup performance.

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts       # SSE streaming endpoint for agent responses
│   │   └── chats/              # Chat CRUD operations
│   ├── globals.css             # Tailwind v4 theme with design tokens
│   ├── layout.tsx              # Root layout with fonts
│   └── page.tsx                # Main chat interface
├── components/
│   ├── chat/                   # Chat UI (input, messages, tool display)
│   ├── sidebar/                # Chat history sidebar
│   └── ui/                     # shadcn/ui primitives
├── hooks/
│   └── use-chat.ts             # SSE streaming and message state management
├── lib/
│   ├── agent/
│   │   ├── client.ts           # Claude Agent SDK wrapper (local + sandbox modes)
│   │   ├── system-prompt.md    # Agent persona and capabilities
│   │   └── workspace.ts        # Per-session workspace isolation
│   ├── auth/
│   │   ├── index.ts            # Better Auth server config (Prisma adapter, additionalFields)
│   │   └── client.ts           # Better Auth React client (useSession, signIn, signUp, signOut)
│   ├── prisma.ts               # Prisma client singleton with Neon adapter
│   ├── types.ts                # TypeScript types for chat/messages
│   └── validations/            # Zod schemas for API validation
└── .claude/skills/             # Agent skills loaded at runtime
```

## Agent System

The app uses the Claude Agent SDK to provide AI-powered sports betting analysis with the "Fortuna" persona.

### Dual Execution Modes

The agent runs differently based on environment:

- **Local development**: Direct SDK execution via `@anthropic-ai/claude-agent-sdk`
- **Vercel production**: Runs inside Vercel Sandbox with per-chat persistence

### Key Components

| File | Purpose |
|------|---------|
| `src/lib/agent/client.ts` | SDK wrapper, handles both local and sandbox streaming |
| `src/lib/agent/workspace.ts` | Creates isolated workspace per session |
| `src/lib/agent/system-prompt.md` | Agent persona and security rules |
| `src/app/api/chat/route.ts` | SSE streaming endpoint with conversation history |
| `src/hooks/use-chat.ts` | React hook for SSE parsing and state |

### Agent Capabilities

- Web search for real-time sports data
- The Odds API integration (live and historical odds via skills)
- Code execution for analysis scripts
- File operations within sandboxed workspace
- Adaptive thinking (Opus 4.6 default)
- Model: `claude-opus-4-6`

### SSE Event Protocol

| Event | Payload | Description |
|-------|---------|-------------|
| `init` | `{ chatId, sessionId }` | Chat initialized |
| `delta` | `{ text }` | Text streaming chunk |
| `thinking` | `{ thinking }` | Extended thinking content |
| `tool_use` | `{ name, input }` | Tool execution |
| `result` | `{ cost_usd, duration_ms }` | Completion metrics |
| `done` | `{ chatId, sessionId }` | Stream complete |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (Prisma format) |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Agent SDK OAuth token (Max subscription) |
| `ODDS_API_KEY` | The Odds API key for betting odds |
| `API_SPORTS_KEY` | API-Sports.io key for player/team statistics |
| `WORKSPACE_ROOT` | Agent workspace root (default: `./workspace`) |
| `BETTER_AUTH_SECRET` | Secret key for Better Auth session signing |
| `BETTER_AUTH_URL` | Base URL of the app (e.g., `http://localhost:3000`) |
| `AGENT_SANDBOX_SNAPSHOT_ID` | Optional Vercel Sandbox snapshot for faster cold starts |

## Path Aliases

Use `@/` for imports from `src/` (e.g., `@/components/ui/button`, `@/lib/utils`).

## Prisma 7

**Schema conventions:**
- Use camelCase for field names in code
- Add `@map("snake_case")` for database columns
- Add `@@map("table_name")` for table names
- Run `bun run lint:prisma` to verify naming conventions

**Database models:**
- `User` - Users with email, name, firstName, lastName, phoneNumber, emailVerified
- `Session` - Database sessions with token, expiry, IP address, user agent
- `Account` - Auth provider accounts (email/password stored here)
- `Verification` - Email verification tokens
- `Chat` - Chat sessions with `sessionId` (agent session) and optional `sandboxId` (Vercel Sandbox)
- `Message` - Messages with `role`, `content`, optional `thinking`, and tool metadata

**Important:** After a fresh `bun install` or any schema change, run `bunx prisma generate` before `bun run type-check` or `bun run lint:check` — the generated Prisma client is not committed and must be regenerated locally.

**Migration requirement:** Every change to `prisma/schema.prisma` MUST include a corresponding migration file. The build runs `prisma migrate deploy` which only applies existing migrations — without a migration file, schema changes will not reach the database. Use `vercel env pull .env --environment preview` to get database credentials, then:

```bash
bunx prisma migrate dev --create-only --name <name>    # Generate migration SQL
bunx prisma migrate dev                                 # Apply migration
bunx prisma generate                                    # Regenerate client
```

**Local Development:**

Uses Prisma's PGlite. Start the dev server before running migrations:

```bash
bunx prisma dev --port 5434              # Run in separate terminal
bunx prisma migrate dev --name <name>    # Create and apply migration
bunx prisma generate                     # Regenerate client after schema changes
```

**Important:** Never use `db push` for production-bound changes - it doesn't create migration files.

## Design System

The app uses a "Refined Intelligence" design aesthetic with:
- Neutral graphite backgrounds (#141416, #1c1c1f)
- Muted teal accents (#4a9e9e)
- Instrument Serif for headings, Geist for body text
- Subtle animations and transitions

See `src/app/globals.css` for the full color palette and design tokens.
