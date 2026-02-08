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
bun install          # Run when type-check fails with "Cannot find module" errors for installed packages
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
- **Zustand** for client state management (vanilla stores + React providers)
- **React Query** (`@tanstack/react-query`) for server state/data fetching
- **Claude Agent SDK** for AI-powered sports betting analysis
- **Vercel Sandbox** for secure agent code execution in production

## Code Style

Biome enforces formatting with tabs and double quotes. Run `bun run lint` to auto-fix.

Always use **Lucide React** icons (`lucide-react`) — never use raw HTML entities (e.g. `&times;`) or other icon libraries for UI icons.

**Routing:** Never use `window.history.replaceState()` for navigation in Next.js App Router — it desynchronizes the browser URL from Next.js's internal router state. Always use `router.replace()` or `router.push()` from `next/navigation`.

## Git Workflow

When creating new features or starting new work:
1. Start from a fresh `main` branch: `git checkout main && git pull origin main`
2. Create a new feature branch: `git checkout -b feature/<description>`
3. Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, etc.

## Build Cost Awareness

Every `git push` to `main` triggers a Vercel production build (~2 min, $0.126/min overage). Preview deployments are disabled for non-main branches to save build minutes.
- To create a preview deployment manually: `vercel deploy`
- Automatic builds only happen on merge to `main`

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
│   ├── (chat)/                    # Chat route group (shared layout with sidebar)
│   │   ├── layout.tsx             # Chat layout: QueryProvider → SessionProvider → ChatStoreProvider
│   │   ├── new/page.tsx           # New chat page
│   │   └── chat/[id]/page.tsx     # Existing chat page (by ID)
│   ├── auth/                      # Auth pages (signin, signup)
│   ├── api/
│   │   ├── chat/route.ts         # SSE streaming endpoint for agent responses
│   │   └── chats/                # Chat CRUD operations
│   ├── globals.css               # Tailwind v4 theme with design tokens
│   └── layout.tsx                # Root layout with fonts
├── components/
│   ├── chat/                     # Chat UI (input, messages, tool display)
│   ├── sidebar/                  # Chat history sidebar
│   └── ui/                      # shadcn/ui primitives
├── hooks/
│   ├── use-chat.ts              # SSE streaming and message state management
│   ├── use-chat-actions.ts      # Unified hook combining chat + queue store selectors
│   └── use-chat-query.ts        # React Query wrapper for chat data fetching
├── stores/
│   ├── chat-store.ts            # Zustand vanilla store: messages, streaming, SSE event processing
│   └── queue-store.ts           # Zustand store: message queue with localStorage persistence
├── providers/
│   └── chat-store-provider.tsx  # React provider wrapping Zustand stores, manages chat lifecycle
├── lib/
│   ├── agent/
│   │   ├── client.ts            # Claude Agent SDK wrapper (local + sandbox modes)
│   │   ├── system-prompt.md     # Agent persona and capabilities
│   │   └── workspace.ts        # Per-session workspace isolation
│   ├── auth/
│   │   ├── index.ts             # Better Auth server config (Prisma adapter, additionalFields)
│   │   ├── client.ts           # Better Auth React client (useSession, signIn, signUp, signOut)
│   │   └── session-context.tsx  # SessionProvider wrapping Better Auth's useSession via React Context
│   ├── prisma.ts               # Prisma client singleton with Neon adapter
│   ├── types.ts                # TypeScript types for chat/messages
│   ├── segments.ts             # Reconstructs message segments from DB columns for history loading
│   ├── sse.ts                  # parseSSEStream() async generator + deduplication
│   ├── api.ts                  # API helpers (unauthorized, notFound, getAuthenticatedUser)
│   └── validations/            # Zod schemas for API validation
├── middleware.ts                # Route protection via Better Auth session cookies
└── .claude/skills/             # Agent skills loaded at runtime
```

### State Management Pattern

Client state uses **Zustand vanilla stores** (not React Context for state):
- `chat-store.ts` — core chat state (messages, streaming status, error handling, SSE event dispatch)
- `queue-store.ts` — message queue with `zustand/middleware` `persist` for localStorage durability
- `chat-store-provider.tsx` — bridges Zustand stores into React, manages lifecycle and cross-store subscriptions

The stores use callback patterns (`onChatCreated`, `onStreamComplete`) for navigation side effects, keeping stores framework-agnostic.

### Provider Hierarchy

The `(chat)/layout.tsx` wraps children in: `QueryProvider → SessionProvider → ChatStoreProvider`

## Agent System

The app uses the Claude Agent SDK to provide AI-powered sports betting analysis with the "Fortuna" persona.

### Dual Execution Modes

The agent runs differently based on environment:

- **Local development**: Direct SDK execution via `@anthropic-ai/claude-agent-sdk`
- **Vercel production**: Runs inside Vercel Sandbox with per-chat persistence

### Sandbox Security Model

Each chat gets its own ephemeral Vercel Sandbox instance (5-hour timeout). Sandboxes are:
- **Isolated**: One sandbox per chat, no cross-chat access
- **Ephemeral**: Destroyed after timeout or on error, no persistent state between sessions
- **Credential-scoped**: API keys (`ODDS_API_KEY`, `API_SPORTS_KEY`, `WEBSHARE_PROXY_URL`) are written to the sandbox filesystem (`.agent-env.sh`) so bash commands can access them. This is an accepted trade-off — the sandbox is short-lived and per-user. The keys are for sports data APIs, not infrastructure credentials.
- **Snapshot-backed**: When `AGENT_SANDBOX_SNAPSHOT_ID` is set, sandboxes boot from a pre-built snapshot with Python packages and tools pre-installed. A quick-verify step ensures critical packages (nba_api, etc.) are present even if the snapshot is stale.

### Key Components

| File | Purpose |
|------|---------|
| `src/lib/agent/client.ts` | SDK wrapper, handles both local and sandbox streaming |
| `src/lib/agent/workspace.ts` | Creates isolated workspace per session |
| `src/lib/agent/system-prompt.md` | Agent persona and security rules |
| `src/app/api/chat/route.ts` | SSE streaming endpoint with conversation history |
| `src/stores/chat-store.ts` | Zustand store: SSE event processing, message state |
| `src/hooks/use-chat-actions.ts` | Unified hook combining store selectors for components |

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
| `turn_complete` | `{}` | Tool call cycle complete |
| `status` | `{ stage, message }` | Sandbox initialization progress |
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
| `WEBSHARE_PROXY_URL` | Rotating residential proxy for NBA.com API access |
| `AGENT_SANDBOX_SNAPSHOT_ID` | Optional Vercel Sandbox snapshot for faster cold starts |
| `DATABASE_URL_UNPOOLED` | Direct (non-pooled) DB connection, used by migration verification script |

**Vercel env var gotcha:** When setting env vars via `vercel env add` with pipe input, use `printf` instead of `echo` to avoid a trailing newline being stored as part of the value. For example:

```bash
# Correct — no trailing newline
printf "my-value" | vercel env add MY_VAR production

# Wrong — echo adds a trailing \n that gets stored in the value
echo "my-value" | vercel env add MY_VAR production
```

The Vercel Sandbox API does exact-match on snapshot IDs, so a trailing `\n` causes 404s. The code trims `AGENT_SANDBOX_SNAPSHOT_ID` defensively, but other env vars may not be as forgiving.

## Middleware

`src/middleware.ts` handles route protection using `better-auth/cookies` `getSessionCookie()`. Unauthenticated users are redirected to `/auth/signin`. Excludes `/api/auth`, `_next/static`, `_next/image`, and `favicon.ico`.

## Testing

No test suite exists yet. If adding tests, conventions will need to be established from scratch.

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
- `Chat` - Chat sessions with `sessionId` (agent session), optional `sandboxId` (Vercel Sandbox), and optional `agentSessionId` (SDK session resume)
- `Message` - Messages with `role`, `content`, optional `thinking`, and tool metadata

**Important:** After a fresh `bun install` or any schema change, run `bunx prisma generate` before `bun run type-check` or `bun run lint:check` — the generated Prisma client is not committed and must be regenerated locally.

**Troubleshooting type-check failures:** If `bun run type-check` fails with `TS2307: Cannot find module` errors for packages that should be installed (e.g., `zustand`, `@tanstack/react-query`), run `bun install` first to restore missing dependencies from the lockfile.

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

**Migration immutability:** Never modify a migration file after it has been applied to any database. Prisma stores a SHA-256 checksum of each migration file — any edit (even whitespace) causes a checksum mismatch that blocks `prisma migrate dev`. If a migration needs changes, create a new migration instead. If a checksum mismatch has already occurred, fix it by updating the `_prisma_migrations` table:

```bash
shasum -a 256 prisma/migrations/<migration_name>/migration.sql
# Then in psql:
UPDATE _prisma_migrations SET checksum = '<new_sha256>' WHERE migration_name = '<migration_name>';
```

**Always use Prisma CLI to create migrations** — never manually create migration directories or SQL files. Use `bunx prisma migrate dev --create-only --name <name>` to generate the migration, review the SQL, then apply with `bunx prisma migrate dev`.

## Design System

The app uses a "Refined Intelligence" design aesthetic with:
- Neutral graphite backgrounds (#141416, #1c1c1f)
- Muted teal accents (#4a9e9e)
- Instrument Serif for headings, Geist for body text
- Subtle animations and transitions

See `src/app/globals.css` for the full color palette and design tokens.
