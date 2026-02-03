# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev              # Start development server with Turbopack (localhost:3000)
bun run build        # Production build
bun run lint         # Lint and auto-fix with Biome
bun run lint:check   # Lint without fixing (CI)
bun run lint:prisma  # Lint Prisma schema
bun run type-check   # TypeScript type checking
```

## Tech Stack

- **Next.js 16** with App Router and React Server Components
- **React 19**
- **Bun** as package manager (use `bun install`, not npm/yarn)
- **Biome** for linting/formatting (not ESLint/Prettier)
- **Tailwind CSS v4** with `@theme inline` syntax in globals.css
- **shadcn/ui** components - add via `bunx shadcn@latest add <component>`
- **Prisma 7** with PostgreSQL for database
- **Claude Agent SDK** for AI-powered sports betting analysis

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

## Architecture

- `src/app/` - Next.js App Router pages and layouts
- `src/app/api/chat/` - SSE streaming endpoint for agent responses
- `src/app/api/chats/` - Chat CRUD operations
- `src/components/chat/` - Chat UI components (input, messages, tool display)
- `src/components/sidebar/` - Chat history sidebar
- `src/components/ui/` - shadcn/ui primitives
- `src/hooks/` - React hooks (useChat for streaming)
- `src/lib/agent/` - Claude Agent SDK wrapper and session management
- `src/lib/validations/` - Zod schemas for API validation

## Agent System

The app uses the Claude Agent SDK to provide AI-powered sports betting analysis.

**Key files:**
- `src/lib/agent/client.ts` - Agent SDK wrapper with streaming, uses `claude-opus-4-5-20251101` model
- `src/lib/agent/workspace.ts` - Per-session workspace management
- `src/app/api/chat/route.ts` - SSE streaming endpoint
- `src/hooks/use-chat.ts` - React hook for SSE streaming and message state

**Agent capabilities:**
- Web search for real-time sports data
- The Odds API integration for betting odds (via bash curl)
- Code execution for analysis scripts
- File operations within sandboxed workspace
- Extended thinking with `maxThinkingTokens: 10000`

**SSE Event Types:**
- `init` - Chat ID and session ID
- `delta` - Text streaming chunks
- `thinking` - Extended thinking content
- `tool_use` - Tool execution events
- `result` - Completion with cost/duration
- `done` - Stream completion

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `CLAUDE_CODE_OAUTH_TOKEN` - Claude Agent SDK OAuth token (Max subscription)
- `ODDS_API_KEY` - The Odds API key for betting odds data
- `WORKSPACE_ROOT` - Root directory for agent workspaces (default: ./workspace)

## Path Aliases

Use `@/` for imports from `src/` (e.g., `@/components/ui/button`, `@/lib/utils`).

## Prisma 7

**Schema conventions:**
- Use camelCase for field names in code
- Add `@map("snake_case")` for database columns
- Add `@@map("table_name")` for table names
- Run `bun run lint:prisma` to verify naming conventions

**Database models:**
- `Chat` - Stores chat sessions with unique `sessionId`
- `Message` - Stores messages with `role`, `content`, and optional `toolName`/`toolInput`

**Commands:**
```bash
bunx prisma migrate dev --name <migration_name>  # Create and apply migration
bunx prisma db push                              # Sync schema without migration (dev only)
bunx prisma generate                             # Regenerate Prisma client
```

## Design System

The app uses a "Refined Intelligence" design aesthetic with:
- Neutral graphite backgrounds (#141416, #1c1c1f)
- Muted teal accents (#4a9e9e)
- Instrument Serif for headings, Geist for body text
- Subtle animations and transitions

See `src/app/globals.css` for the full color palette and design tokens.
