# MCP Server for Test Case Repository

## Overview
Create an MCP (Model Context Protocol) server that allows AI agents to read and write test cases, folders, and test runs from this repository via HTTP.

## Architecture

```
simple-tests/
├── src/                          # Existing Next.js app
│   └── lib/db/                   # Shared DB schema
├── mcp-server/                   # NEW: MCP server
│   ├── src/
│   │   ├── index.ts              # Entry point (CLI)
│   │   ├── server.ts             # MCP server setup
│   │   ├── auth/                 # API token validation
│   │   ├── tools/                # Write operations
│   │   ├── resources/            # Read operations
│   │   └── shared/               # Re-export DB from main app
│   ├── package.json
│   └── tsconfig.json
```

**Key decision**: Separate process that shares the Drizzle schema/DB connection with the Next.js app.

## Transport

**HTTP/SSE** (primary) - For remote AI agents

- Express-based HTTP server with SSE for streaming
- Runs on configurable port (default: 3001)
- Supports `Authorization: Bearer <token>` header
- CORS configured for allowed origins

## Tools (Write Operations)

| Tool | Description | Params |
|------|-------------|--------|
| `create_folder` | Create folder | name, parentId? |
| `rename_folder` | Rename folder | id, name |
| `delete_folder` | Delete empty folder | id |
| `move_folder` | Move to new parent | id, newParentId?, order |
| `create_test_case` | Create test case | title, gherkin, folderId?, state?, priority? |
| `update_test_case` | Update test case | id, title?, gherkin?, folderId?, state? |
| `delete_test_case` | Delete test case | id |
| `create_test_run` | Create test run | name, caseIds[], description? |
| `update_test_result` | Update result | resultId, status, notes? |

## Resources (Read Operations)

| URI | Description |
|-----|-------------|
| `folders://tree` | Full folder hierarchy with counts |
| `folders://{id}` | Single folder with children |
| `test-cases://list?folderId={id}&state={state}` | List test cases |
| `test-cases://{id}` | Single test case with Gherkin |
| `test-cases://{id}/audit` | Audit history |
| `test-runs://list` | List test runs |
| `test-runs://{id}` | Single run with results |

## Authentication

**API Token System** (simpler than OAuth for programmatic access):

1. Add `api_tokens` table to schema
2. Tokens scoped to organization + permission level (read/write/admin)
3. HTTP: Token via `Authorization: Bearer <token>` header

```typescript
// New schema table
export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  organizationId: text("organization_id").references(() => organizations.id),
  userId: text("user_id").references(() => users.id),
  permissions: text("permissions").default("read"), // read | write | admin
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }),
});
```

## Implementation Steps

### Phase 1: Foundation
1. Add `api_tokens` table to schema, run migration
2. Create `mcp-server/` directory structure
3. Set up MCP server with `@modelcontextprotocol/sdk`
4. Implement auth middleware (token validation)

### Phase 2: Resources (Read)
5. Implement folder resources (tree, single)
6. Implement test case resources (list, single, audit)
7. Implement test run resources (list, single)

### Phase 3: Tools (Write)
8. Implement folder tools (CRUD)
9. Implement test case tools (CRUD)
10. Implement test run tools (create, update result)

### Phase 4: Token Management UI
11. Create `/settings/api-tokens` page
12. Add server actions for token CRUD (create, list, revoke)
13. Token display: show once on creation, then masked

### Phase 5: Polish
14. Add rate limiting middleware
15. Write integration tests
16. Document API endpoints and usage

## Usage Example (HTTP)

**Start server:**
```bash
cd mcp-server
npm run start -- --port 3001
```

**List tools:**
```bash
curl http://localhost:3001/mcp \
  -H "Authorization: Bearer st_xxxxx" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

**Call a tool:**
```bash
curl http://localhost:3001/mcp \
  -H "Authorization: Bearer st_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"create_test_case",
      "arguments":{
        "title":"User can login",
        "gherkin":"Feature: Login\n  Scenario: Valid credentials\n    Given I am on login\n    When I enter valid creds\n    Then I see dashboard",
        "state":"active"
      }
    },
    "id":1
  }'
```

## Files to Modify/Create

**Modify:**
- `src/lib/db/schema.ts` - Add apiTokens table

**Create:**
- `mcp-server/package.json`
- `mcp-server/tsconfig.json`
- `mcp-server/src/index.ts` - CLI entry point
- `mcp-server/src/server.ts` - MCP server setup
- `mcp-server/src/auth/index.ts` - Token validation
- `mcp-server/src/tools/*.ts` - Tool implementations
- `mcp-server/src/resources/*.ts` - Resource implementations
- `src/app/settings/api-tokens/page.tsx` - Token management UI

## Verification

1. Build MCP server: `cd mcp-server && npm run build`
2. Test HTTP mode: `curl http://localhost:3001/mcp -H "Authorization: Bearer test" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`
3. Test creating a test case via curl
4. Verify token management UI works

## Sub-issues

- [ ] **PLA-XX**: Add api_tokens table to schema
- [ ] **PLA-XX**: Create MCP server foundation with HTTP transport
- [ ] **PLA-XX**: Implement folder resources and tools
- [ ] **PLA-XX**: Implement test case resources and tools
- [ ] **PLA-XX**: Implement test run resources and tools
- [ ] **PLA-XX**: Build API token management UI
- [ ] **PLA-XX**: Add rate limiting and security hardening
- [ ] **PLA-XX**: Write tests and documentation
