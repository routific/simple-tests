# SimpleTests

A lightweight, fast test case management app with integration to Linear. Designed for teams who need a simple way to maintain a repository of Gherkin BDD test cases and coordinate manual test runs for releases.

<img width="1726" height="986" alt="image" src="https://github.com/user-attachments/assets/e7539c18-3803-4c46-93da-ed4f980a063e" />


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
| **Auth** | Auth.js (NextAuth v5) + Linear OAuth | Organization-scoped access via Linear workspace |
| **Styling** | Tailwind CSS | Utility-first, fast iteration, small bundle size |
| **Deployment** | Vercel | Free tier, automatic deployments, edge functions |

### Data Model

```
┌─────────────────┐
│  organizations  │
├─────────────────┤
│ id (pk)         │◄─────────────────────────────────────────────┐
│ name            │                                              │
│ logo_url        │                                              │
│ created_at      │                                              │
└─────────────────┘                                              │
                                                                 │
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     users       │     │     folders     │     │   test_cases    │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (pk)         │     │ id (pk)         │     │ id (pk)         │
│ linear_username │     │ name            │     │ legacy_id       │
│ email           │     │ parent_id       │◄────│ folder_id       │
│ name            │     │ order           │     │ title           │
│ avatar          │     │ organization_id │─────│ template        │
│ organization_id │─┐   └─────────────────┘     │ state           │
│ created_at      │ │                           │ priority        │
└─────────────────┘ │                           │ order           │
       │            │                           │ organization_id │───┐
       │            │                           │ created_at      │   │
       │            │                           │ updated_at      │   │
       │            │                           │ created_by      │◄──┤
       │            │                           │ updated_by      │◄──┤
       │            │                           └─────────────────┘   │
       │            │                                   │             │
       │            │                           ┌───────┴───────┐     │
       │            │                           │   scenarios   │     │
       │            │                           ├───────────────┤     │
       │            │                           │ id (pk)       │     │
       │            │                           │ test_case_id  │     │
       │            │                           │ title         │     │
       │            │                           │ gherkin       │     │
       │            │                           │ order         │     │
       │            │                           └───────────────┘     │
       │            │                                                 │
       │            │   ┌─────────────────────┐                       │
       │            │   │ test_case_audit_log │                       │
       │            │   ├─────────────────────┤                       │
       │            │   │ id (pk)             │                       │
       │            │   │ test_case_id        │───────────────────────┤
       │            │   │ user_id             │◄──────────────────────┤
       │            │   │ action              │                       │
       │            │   │ changes (json)      │                       │
       │            │   │ previous_values     │                       │
       │            │   │ new_values          │                       │
       │            │   │ created_at          │                       │
       │            │   └─────────────────────┘                       │
       │            │                                                 │
       │            │   ┌─────────────────┐                           │
       │            │   │    releases     │                           │
       │            │   ├─────────────────┤                           │
       │            │   │ id (pk)         │◄──────────┐               │
       │            │   │ name            │           │               │
       │            │   │ organization_id │───────────┼───────────────┤
       │            │   │ status          │           │               │
       │            │   │ created_at      │           │               │
       │            │   │ created_by      │◄──────────┼───────────────┤
       │            │   └─────────────────┘           │               │
       │            │                                 │               │
       │            │   ┌─────────────────────┐   ┌───┴──────────────┐│
       │            │   │     test_runs       │   │test_run_results  ││
       │            │   ├─────────────────────┤   ├──────────────────┤│
       │            │   │ id (pk)             │◄──│ test_run_id      ││
       │            └──►│ organization_id     │   │ scenario_id      │┘
       │                │ name                │   │ status           │
       │                │ release_id          │───│ notes            │
       └───────────────►│ created_by          │   │ executed_at      │
                        │ status              │   │ executed_by      │
                        │ linear_project_id   │   └──────────────────┘
                        │ linear_project_name │
                        │ linear_milestone_id │
                        │ linear_milestone_name│
                        │ linear_issue_id     │
                        │ linear_issue_identifier│
                        │ linear_issue_title  │
                        │ created_at          │
                        └─────────────────────┘
```

**Key relationships:**
- **Organizations** - Linear workspaces that scope all data (multi-tenant)
- **Users** - Authenticated via Linear OAuth, belong to an organization
- **Folders** - Support nested hierarchy via `parent_id` self-reference, scoped by org
- **Test cases** - Belong to a folder, track who created/updated them, with full audit log
- **Scenarios** - Multiple Gherkin scenarios per test case, ordered within the case
- **Releases** - Logical groupings for organizing test runs (e.g., "v2.0", "Sprint 15")
- **Test runs** - Collections of scenarios to execute, optionally linked to a release and Linear project/milestone/issue
- **Test run results** - Track pass/fail status and notes for each scenario in a run
- **Audit log** - Records all changes to test cases with field-level diffs
- **Undo stack** - Enables undo/redo for folder and scenario operations

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
│   │   └── actions.ts           # Server actions (save, delete, audit)
│   ├── folders/
│   │   └── actions.ts           # Folder management (create, rename, delete, move)
│   ├── runs/
│   │   ├── page.tsx             # Test runs list grouped by release
│   │   ├── [id]/page.tsx        # Run execution view
│   │   ├── new/page.tsx         # Create new run
│   │   ├── runs-list.tsx        # Runs list component with release grouping
│   │   └── actions.ts           # Server actions (create, update, add/remove scenarios)
│   ├── releases/
│   │   └── actions.ts           # Release management actions
│   ├── import/page.tsx          # Import instructions
│   ├── api/
│   │   ├── auth/[...nextauth]/  # Auth.js route handler
│   │   ├── repository/          # Import/export endpoints
│   │   └── linear/              # Linear API endpoints
│   │       ├── projects/        # Fetch Linear projects
│   │       ├── milestones/      # Fetch Linear milestones
│   │       └── issues/          # Search Linear issues
│
├── components/
│   ├── ui/                      # Reusable UI components
│   │   ├── button.tsx           # Button variants
│   │   ├── input.tsx            # Form inputs
│   │   ├── card.tsx             # Card containers
│   │   ├── badge.tsx            # Status badges
│   │   ├── modal.tsx            # Modal dialogs
│   │   ├── slide-panel.tsx      # Slide-in panels
│   │   ├── resizable-panel.tsx  # Drag-to-resize panels
│   │   └── theme-toggle.tsx     # Dark mode toggle
│   ├── sidebar.tsx              # Collapsible navigation sidebar
│   ├── folder-tree.tsx          # Drag-and-drop folder hierarchy
│   ├── folder-panel.tsx         # Resizable folder sidebar
│   ├── folder-picker.tsx        # Nested folder selection dropdown
│   ├── test-cases-view.tsx      # Test case list with bulk actions
│   ├── gherkin-editor.tsx       # Gherkin textarea with syntax highlighting
│   ├── create-run-form.tsx      # Run creation with Linear integration
│   ├── run-executor.tsx         # Run execution UI with edit support
│   └── release-picker.tsx       # Release selection with inline creation
│
├── lib/
│   ├── db/
│   │   ├── schema.ts            # Drizzle schema definitions
│   │   └── index.ts             # Database connection
│   ├── auth.ts                  # Auth.js + Linear OAuth configuration
│   ├── linear.ts                # Linear API client
│   ├── folders.ts               # Folder tree utilities
│   └── utils.ts                 # Utility functions (cn)
│
└── scripts/
    └── import-testmo.ts         # CSV import script
```

### Key Design Decisions

#### 1. Organization-Scoped Data (Multi-Tenant)
All data is scoped by Linear organization ID. When a user signs in via Linear:
- Their organization is automatically detected
- They can only see data belonging to their organization
- No cross-organization data leakage is possible

#### 2. Server Components by Default
All pages are server components that fetch data directly from the database. This means:
- Fast initial page loads (no client-side data fetching waterfall)
- Automatic caching and revalidation
- Smaller JavaScript bundles

Client components (`"use client"`) are only used where interactivity is required:
- Form inputs and state management
- Drag-and-drop interactions
- Theme toggle
- Modal and panel state

#### 3. Server Actions for Mutations
Instead of API routes, we use Next.js server actions for all data mutations:
```typescript
// src/app/cases/actions.ts
"use server";

export async function saveTestCase(input: SaveTestCaseInput) {
  const session = await getSessionWithOrg();
  if (!session) return { error: "Unauthorized" };

  // All mutations include organization scoping
  await db.update(testCases)
    .set({...})
    .where(and(
      eq(testCases.id, input.id),
      eq(testCases.organizationId, session.user.organizationId)
    ));

  // Audit log is automatically created
  revalidatePath("/cases");
}
```

#### 4. Audit Logging
Every change to a test case is logged with:
- Who made the change (Linear username)
- What action was taken (created/updated/deleted)
- Field-level diffs showing old vs new values
- Timestamp

#### 5. Local-First Development
The app defaults to a local SQLite database (`file:local.db`) when Turso credentials aren't configured. This enables:
- Zero-config local development
- Instant setup for new contributors
- Offline development capability

#### 6. Gherkin as Plain Text
Rather than using a complex structured format for test scenarios, we store Gherkin as plain text. This:
- Preserves the original format from Testmo
- Allows flexible editing without schema constraints
- Enables easy copy/paste of scenarios

Syntax highlighting is applied client-side with semantic colors:
- Keywords (Feature, Scenario) in purple
- Steps (Given, When, Then) in blue
- Tags (@tag) in cyan
- Comments (#) in muted gray
- Tables (|) in green
- Placeholders (<param>) in orange

#### 7. Multi-Scenario Test Cases
Test cases can contain multiple scenarios, each with their own Gherkin content. This allows:
- Grouping related scenarios under a single test case
- Individual scenario selection when creating test runs
- Better organization for complex features

## Features

### Modern UI
- **Dark mode** - Toggle between light and dark themes
- **Collapsible sidebar** - Expand/collapse navigation for more screen space
- **Resizable panels** - Drag to resize the folder tree width
- **Slide-in panels** - View and edit test cases without leaving the list
- **Modal dialogs** - Create new cases with folder context
- **Responsive design** - Adapts to different screen sizes

### Test Case Repository
- **Folder tree sidebar** - Expandable/collapsible hierarchy with drag-and-drop
- **Nested folder view** - View test cases from parent folder and all descendants
- **Drag-and-drop organization** - Move folders and test cases between folders
- **Right-click context menu** - Rename, delete, or add subfolders
- **Search and filter** - By title, state (active, draft, retired, rejected)
- **Bulk operations** - Select multiple cases to move, change state, delete, or create run
- **Undo/redo** - Revert folder and scenario changes with keyboard shortcuts (Cmd+Z, Cmd+Shift+Z)
- **Gherkin editor** - Plain text with live syntax highlighting
- **Multi-scenario support** - Multiple scenarios per test case
- **State management** - Active, Draft, Retired, Rejected
- **Audit history** - See who changed what and when

### Test Runs
- **Create runs** - Name, select cases/scenarios by folder or individually
- **Releases** - Group runs by release (e.g., "v2.0", "Sprint 15")
- **Edit runs** - Update name, release, add/remove scenarios after creation
- **Linear integration** - Link to projects, milestones, and issues
- **Execute runs** - Step through scenarios, mark Pass/Fail/Blocked/Skipped
- **Add notes** - Capture observations during testing
- **Progress tracking** - Visual progress bar, status counts

### Dashboard
- Quick stats (total cases, active cases, folders, runs)
- Recent test runs with results summary
- Quick links to common actions

### Linear Integration
- **OAuth authentication** - Sign in with your Linear account
- **Organization scoping** - Data isolated by Linear workspace
- **Project linking** - Associate test runs with Linear projects
- **Milestone tracking** - Link runs to project milestones
- **Issue attachment** - Connect runs to specific Linear issues

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

### Prerequisites
- Node.js 18+
- A Linear account and workspace

### Local Development

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

The app runs at http://localhost:3000.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TURSO_DATABASE_URL` | Yes | Turso database URL |
| `TURSO_AUTH_TOKEN` | Yes | Turso authentication token |
| `LINEAR_CLIENT_ID` | Yes | Linear OAuth application client ID |
| `LINEAR_CLIENT_SECRET` | Yes | Linear OAuth application client secret |
| `AUTH_SECRET` | Yes | NextAuth.js secret (generate with `openssl rand -base64 32`) |

## Security

- **Organization isolation** - All data is scoped by Linear organization ID
- **Server-side validation** - All mutations verify organization membership
- **No cross-tenant access** - Users can only see data from their own organization
- **OAuth-only auth** - No password storage, delegated to Linear

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/db/schema.ts` | Database schema (Drizzle) |
| `src/lib/auth.ts` | Auth.js + Linear OAuth configuration |
| `src/lib/linear.ts` | Linear API client |
| `src/app/cases/actions.ts` | Test case mutations with audit logging |
| `src/app/folders/actions.ts` | Folder management mutations |
| `src/app/runs/actions.ts` | Test run mutations (create, update, add/remove scenarios) |
| `src/app/releases/actions.ts` | Release management mutations |
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
