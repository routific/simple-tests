# SimpleTests

A lightweight, fast test case management app built to replace Testmo. Designed for teams who need a simple way to maintain a repository of Gherkin BDD test cases and coordinate manual test runs for releases.

## Why SimpleTests?

Testmo is powerful but overkill for teams that primarily need:
- A repository of described test cases (Gherkin BDD scenarios)
- A way to organize test runs for release coordination
- Simple pass/fail tracking with notes

SimpleTests delivers these core features with a fast, lightweight interface that feels quick and responsive.

## Architecture Overview

### Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Framework** | Next.js 14 (App Router) | Server components for fast initial loads, server actions for mutations, file-based routing |
| **Database** | SQLite via Turso | Free tier, edge-compatible, zero cold starts. Falls back to local SQLite for development |
| **ORM** | Drizzle | Type-safe, lightweight, excellent DX with TypeScript |
| **Auth** | Auth.js (NextAuth v5) | Simple Google SSO integration, session management |
| **Styling** | Tailwind CSS | Utility-first, fast iteration, small bundle size |
| **Deployment** | Vercel | Free tier, automatic deployments, edge functions |

### Data Model

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   users     │     │   folders   │     │ test_cases  │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ id (pk)     │     │ id (pk)     │     │ id (pk)     │
│ email       │     │ name        │     │ legacy_id   │
│ name        │     │ parent_id   │◄────│ folder_id   │
│ avatar      │     │ order       │     │ title       │
│ created_at  │     └─────────────┘     │ gherkin     │
└─────────────┘                         │ template    │
       │                                │ state       │
       │                                │ priority    │
       │                                │ created_at  │
       │                                │ updated_at  │
       │                                │ created_by  │◄─┐
       │                                │ updated_by  │◄─┤
       │                                └─────────────┘  │
       │                                                 │
       │     ┌─────────────┐     ┌──────────────────┐   │
       │     │  test_runs  │     │ test_run_results │   │
       │     ├─────────────┤     ├──────────────────┤   │
       │     │ id (pk)     │◄────│ test_run_id      │   │
       │     │ name        │     │ test_case_id     │───┘
       │     │ description │     │ status           │
       └────►│ created_by  │     │ notes            │
             │ status      │     │ executed_at      │
             │ created_at  │     │ executed_by      │
             └─────────────┘     └──────────────────┘
```

**Key relationships:**
- **Folders** support nested hierarchy via `parent_id` self-reference
- **Test cases** belong to a folder and track who created/updated them
- **Test runs** are collections of test cases with execution status
- **Test run results** track pass/fail status and notes for each case in a run

### Application Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with sidebar
│   ├── page.tsx                 # Dashboard
│   ├── cases/
│   │   ├── page.tsx             # Test case list with folder tree
│   │   ├── [id]/page.tsx        # View/edit single case
│   │   ├── new/page.tsx         # Create new case
│   │   └── actions.ts           # Server actions (save, delete)
│   ├── runs/
│   │   ├── page.tsx             # Test runs list
│   │   ├── [id]/page.tsx        # Run execution view
│   │   ├── new/page.tsx         # Create new run
│   │   └── actions.ts           # Server actions
│   ├── import/page.tsx          # Import instructions
│   └── api/auth/[...nextauth]/  # Auth.js route handler
│
├── components/
│   ├── sidebar.tsx              # Navigation sidebar
│   ├── folder-tree.tsx          # Expandable folder hierarchy
│   ├── test-case-list.tsx       # Searchable case list
│   ├── test-case-editor.tsx     # Case edit form
│   ├── gherkin-editor.tsx       # Gherkin textarea with highlighting
│   ├── create-run-form.tsx      # Run creation with case selection
│   ├── run-executor.tsx         # Run execution UI
│   └── auth-provider.tsx        # Session provider wrapper
│
├── lib/
│   ├── db/
│   │   ├── schema.ts            # Drizzle schema definitions
│   │   └── index.ts             # Database connection
│   ├── auth.ts                  # Auth.js configuration
│   └── utils.ts                 # Utility functions (cn)
│
└── scripts/
    └── import-testmo.ts         # CSV import script
```

### Key Design Decisions

#### 1. Server Components by Default
All pages are server components that fetch data directly from the database. This means:
- Fast initial page loads (no client-side data fetching waterfall)
- Automatic caching and revalidation
- Smaller JavaScript bundles

Client components (`"use client"`) are only used where interactivity is required:
- Form inputs and state management
- Session status display
- Interactive folder tree expansion

#### 2. Server Actions for Mutations
Instead of API routes, we use Next.js server actions for all data mutations:
```typescript
// src/app/cases/actions.ts
"use server";

export async function saveTestCase(input: SaveTestCaseInput) {
  await db.update(testCases).set({...}).where(...);
  revalidatePath("/cases");
}
```

Benefits:
- Type-safe from client to server
- Automatic form handling with `useTransition`
- No need for separate API layer

#### 3. Local-First Development
The app defaults to a local SQLite database (`file:local.db`) when Turso credentials aren't configured. This enables:
- Zero-config local development
- Instant setup for new contributors
- Offline development capability

#### 4. Gherkin as Plain Text
Rather than using a complex structured format for test scenarios, we store Gherkin as plain text. This:
- Preserves the original format from Testmo
- Allows flexible editing without schema constraints
- Enables easy copy/paste of scenarios

Syntax highlighting is applied client-side for display.

#### 5. Flat Import, Nested Display
The Testmo import creates folders as a flat list (all at root level). The folder tree component builds the visual hierarchy dynamically. This approach:
- Simplifies the import process
- Allows manual reorganization later
- Avoids complex parent-child resolution during import

## Features

### Test Case Repository
- **Folder tree sidebar** - expandable/collapsible hierarchy
- **Search and filter** - by title, state
- **Gherkin editor** - plain text with syntax highlighting
- **State management** - Active, Draft, Retired, Rejected

### Test Runs
- **Create runs** - name, select cases by folder or individually
- **Execute runs** - step through cases, mark Pass/Fail/Blocked/Skipped
- **Add notes** - capture observations during testing
- **Progress tracking** - visual progress bar, status counts

### Dashboard
- Quick stats (total cases, active cases, folders, runs)
- Recent test runs with results summary
- Quick links to common actions

## Data Migration

The import script (`npm run import`) handles Testmo CSV exports:

1. **Parses CSV** with proper handling of multi-line Gherkin content
2. **Decodes HTML entities** (Testmo exports `&lt;` as `<`, etc.)
3. **Strips HTML formatting** (removes `<pre><code>` wrappers)
4. **Creates folders** from the Folder column
5. **Maps states and templates** to internal values
6. **Preserves legacy IDs** for reference

```bash
npm run import ./testmo-export-repository-1.csv
```

## Getting Started

### Local Development (No External Services)

```bash
# Install dependencies
npm install

# Create local database
npm run db:push

# Import test cases (optional)
npm run import ./your-export.csv

# Start dev server
npm run dev
```

The app runs at http://localhost:3000 with a local SQLite database.

### Production Setup

1. **Create Turso database**
   ```bash
   turso db create simple-tests
   turso db tokens create simple-tests
   ```

2. **Configure Google OAuth** at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

3. **Set environment variables**
   ```env
   TURSO_DATABASE_URL=libsql://your-db.turso.io
   TURSO_AUTH_TOKEN=your-token
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   AUTH_SECRET=generate-with-openssl-rand-base64-32
   ```

4. **Deploy to Vercel**
   ```bash
   vercel
   ```

## Future Considerations

### Potential Enhancements
- **Linear integration** - link test cases to issues, auto-create bugs on failure
- **Keyboard shortcuts** - vim-style navigation
- **Bulk operations** - move/archive multiple cases
- **Test templates** - create cases from templates
- **History tracking** - audit log of changes
- **Export functionality** - generate reports, CSV export

### What's Intentionally Omitted
- Complex permissions/roles (everyone is equal)
- Environment-specific results (just pass/fail)
- Automated test integration (focus on manual testing)
- Rich text editing (plain Gherkin is sufficient)

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/db/schema.ts` | Database schema (Drizzle) |
| `src/lib/auth.ts` | Auth.js configuration |
| `src/app/cases/actions.ts` | Test case mutations |
| `src/app/runs/actions.ts` | Test run mutations |
| `scripts/import-testmo.ts` | CSV import script |
| `drizzle.config.ts` | Database migration config |

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run db:push      # Push schema to database
npm run db:studio    # Open Drizzle Studio (database UI)
npm run import       # Import Testmo CSV
```
