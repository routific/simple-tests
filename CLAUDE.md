# CLAUDE.md

Guidelines for Claude Code when working on this project.

## After Completing Work

1. **Commit your changes** when a task is complete. Use descriptive commit messages that explain the "why" not just the "what".

2. **Update README.md** if you've made significant changes:
   - New features or capabilities
   - New API endpoints or routes
   - Changes to the data model
   - New environment variables
   - New commands or scripts

3. **Update the changelog** in `src/components/keyboard-shortcuts-provider.tsx` for user-facing changes. The changelog is displayed in the version info modal (CMD+SHIFT+I). Add entries to the `CHANGELOG` array with:
   - `version`: Git commit SHA (short form)
   - `date`: Date in YYYY-MM-DD format
   - `changes`: Array of bullet points describing changes

## Project Structure

- **Next.js App Router** - Pages in `src/app/`, server components by default
- **Server Actions** - Mutations in `actions.ts` files, not API routes
- **Drizzle ORM** - Schema in `src/lib/db/schema.ts`
- **Linear OAuth** - Authentication via Linear, organization-scoped data
- **MCP Server** - Model Context Protocol implementation in `src/lib/mcp/`

## Key Patterns

- All data is organization-scoped via `organizationId`
- Use `getSessionWithOrg()` to get authenticated session with org context
- Client components marked with `"use client"` only when interactivity needed
- Keyboard shortcuts managed via `KeyboardShortcutsProvider`

## Testing Changes

```bash
npm run dev          # Start dev server
npm run build        # Check for build errors
npx tsc --noEmit     # Type check without building
```

## Database

```bash
npm run db:push      # Push schema changes
npm run db:studio    # Open Drizzle Studio
```

For production (Turso), run migrations via SQL directly. Check schema.ts for table definitions.
