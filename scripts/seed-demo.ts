/**
 * Seed script for demo mode.
 * Creates realistic sample data for a fictional "CloudSync" file sync/sharing SaaS.
 *
 * Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/seed-demo.ts
 * Or locally: npx tsx scripts/seed-demo.ts (uses local.db)
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import {
  organizations,
  users,
  folders,
  testCases,
  scenarios,
  releases,
  testRuns,
  testRunResults,
} from "../src/lib/db/schema";

const DEMO_ORG_ID = "demo-org-001";
const DEMO_USER_ID = "demo-user-001";
const DEMO_USER_2_ID = "demo-user-002";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client);

async function seed() {
  console.log("Seeding demo data...");

  // Clean existing demo data (reverse dependency order, raw SQL for subquery deletes)
  console.log("Cleaning existing demo data...");
  await client.execute({ sql: `DELETE FROM test_run_results WHERE test_run_id IN (SELECT id FROM test_runs WHERE organization_id = ?)`, args: [DEMO_ORG_ID] });
  await client.execute({ sql: `DELETE FROM test_result_history WHERE result_id NOT IN (SELECT id FROM test_run_results)`, args: [] });
  await client.execute({ sql: `DELETE FROM undo_stack WHERE organization_id = ?`, args: [DEMO_ORG_ID] });
  await client.execute({ sql: `DELETE FROM test_case_audit_log WHERE test_case_id IN (SELECT id FROM test_cases WHERE organization_id = ?)`, args: [DEMO_ORG_ID] });
  await client.execute({ sql: `DELETE FROM test_case_linear_issues WHERE test_case_id IN (SELECT id FROM test_cases WHERE organization_id = ?)`, args: [DEMO_ORG_ID] });
  await client.execute({ sql: `DELETE FROM scenarios WHERE test_case_id IN (SELECT id FROM test_cases WHERE organization_id = ?)`, args: [DEMO_ORG_ID] });
  await db.delete(testRuns).where(eq(testRuns.organizationId, DEMO_ORG_ID));
  await db.delete(releases).where(eq(releases.organizationId, DEMO_ORG_ID));
  await db.delete(testCases).where(eq(testCases.organizationId, DEMO_ORG_ID));
  await db.delete(folders).where(eq(folders.organizationId, DEMO_ORG_ID));
  await client.execute({ sql: `DELETE FROM api_tokens WHERE organization_id = ?`, args: [DEMO_ORG_ID] });
  await db.delete(users).where(eq(users.organizationId, DEMO_ORG_ID));
  await db.delete(organizations).where(eq(organizations.id, DEMO_ORG_ID));

  // 1. Organization
  console.log("Creating organization...");
  await db.insert(organizations).values({
    id: DEMO_ORG_ID,
    name: "CloudSync",
    urlKey: "cloudsync",
    logoUrl: undefined,
  });

  // 2. Users
  console.log("Creating users...");
  await db.insert(users).values([
    {
      id: DEMO_USER_ID,
      linearUsername: "demo-user",
      email: "alex@cloudsync.example",
      name: "Alex Chen",
      avatar: undefined,
      organizationId: DEMO_ORG_ID,
    },
    {
      id: DEMO_USER_2_ID,
      linearUsername: "jordan-qa",
      email: "jordan@cloudsync.example",
      name: "Jordan Lee",
      avatar: undefined,
      organizationId: DEMO_ORG_ID,
    },
  ]);

  // 3. Folders
  console.log("Creating folders...");
  const folderData = [
    { name: "File Management", order: 0 },
    { name: "Sharing & Permissions", order: 1 },
    { name: "Search & Discovery", order: 2 },
    { name: "Sync Engine", order: 3 },
    { name: "Notifications & Activity", order: 4 },
  ];

  const insertedFolders = await db
    .insert(folders)
    .values(folderData.map((f) => ({ ...f, organizationId: DEMO_ORG_ID })))
    .returning({ id: folders.id, name: folders.name });

  const folderMap = new Map(insertedFolders.map((f) => [f.name, f.id]));

  // 4. Test Cases with Scenarios
  console.log("Creating test cases and scenarios...");

  const testCaseData = [
    // File Management
    {
      title: "File Upload",
      folderId: folderMap.get("File Management")!,
      state: "active" as const,
      priority: "high" as const,
      createdBy: DEMO_USER_ID,
      scenarios: [
        {
          title: "Upload single file under 100MB",
          gherkin: `Given the user is on the file manager page
And the current folder is "Documents"
When the user clicks the upload button
And selects a 50MB PDF file
Then the upload progress bar should appear
And the file should appear in the file list within 30 seconds
And the file size should display as "50 MB"`,
        },
        {
          title: "Upload multiple files via drag and drop",
          gherkin: `Given the user is on the file manager page
When the user drags 5 files onto the drop zone
Then all 5 upload progress bars should appear
And each file should show individual progress
And all files should appear in the list when complete`,
        },
        {
          title: "Reject file exceeding size limit",
          gherkin: `Given the organization has a 500MB file size limit
When the user tries to upload a 600MB file
Then an error message should display "File exceeds the 500MB size limit"
And the file should not be uploaded`,
        },
      ],
    },
    {
      title: "File Download",
      folderId: folderMap.get("File Management")!,
      state: "active" as const,
      priority: "normal" as const,
      createdBy: DEMO_USER_ID,
      scenarios: [
        {
          title: "Download single file",
          gherkin: `Given the user is viewing a file "quarterly-report.xlsx"
When the user clicks the download button
Then the browser should start downloading the file
And the file should match the original upload checksum`,
        },
        {
          title: "Download folder as ZIP",
          gherkin: `Given the folder "Project Assets" contains 12 files totaling 200MB
When the user selects "Download as ZIP"
Then a ZIP archive should be generated server-side
And the download should start within 10 seconds
And the ZIP should contain all 12 files with correct folder structure`,
        },
      ],
    },
    {
      title: "Bulk File Operations",
      folderId: folderMap.get("File Management")!,
      state: "active" as const,
      priority: "critical" as const,
      createdBy: DEMO_USER_2_ID,
      scenarios: [
        {
          title: "Bulk move files between folders",
          gherkin: `Given the user selects 8 files in "Inbox" folder
When the user chooses "Move to" and selects "Archive"
Then all 8 files should move to the "Archive" folder
And the "Inbox" folder should no longer contain those files
And the activity log should show the bulk move operation`,
        },
        {
          title: "Bulk delete with confirmation",
          gherkin: `Given the user selects 5 files
When the user clicks "Delete selected"
Then a confirmation dialog should appear with the count "5 files"
When the user confirms the deletion
Then all 5 files should move to the trash
And a toast notification should show "5 files moved to trash" with an undo option`,
        },
      ],
    },

    // Sharing & Permissions
    {
      title: "Public Link Sharing",
      folderId: folderMap.get("Sharing & Permissions")!,
      state: "active" as const,
      priority: "high" as const,
      createdBy: DEMO_USER_ID,
      scenarios: [
        {
          title: "Generate shareable link with expiry",
          gherkin: `Given the user right-clicks on "design-mockup.fig"
When the user selects "Share" and sets expiry to "7 days"
Then a shareable URL should be generated
And the link should show "Expires in 7 days"
And the link settings should default to "View only"`,
        },
        {
          title: "Password-protect shared link",
          gherkin: `Given the user has generated a shareable link
When the user enables "Require password"
And enters password "SecureShare2024"
Then the link should require password entry before viewing
And the password hint should not be stored in plaintext`,
        },
        {
          title: "Revoke shared link",
          gherkin: `Given a file has an active shared link accessed by 3 people
When the file owner clicks "Revoke link"
Then the shared link should immediately stop working
And existing viewers should see "This link has been revoked"`,
        },
      ],
    },
    {
      title: "Team Folder Permissions",
      folderId: folderMap.get("Sharing & Permissions")!,
      state: "active" as const,
      priority: "normal" as const,
      createdBy: DEMO_USER_2_ID,
      scenarios: [
        {
          title: "Set folder-level read-only access",
          gherkin: `Given the admin is on the "Engineering" team folder settings
When the admin sets "Design Team" role to "Viewer"
Then Design Team members should be able to view files
But Design Team members should not be able to upload, edit, or delete files`,
        },
        {
          title: "Inherit parent folder permissions",
          gherkin: `Given "Project Alpha" folder grants "Editor" access to the team
When a subfolder "Sprint 5" is created inside "Project Alpha"
Then "Sprint 5" should inherit the "Editor" permission
And the permission should show as "Inherited from Project Alpha"`,
        },
      ],
    },
    {
      title: "Guest Access",
      folderId: folderMap.get("Sharing & Permissions")!,
      state: "draft" as const,
      priority: "normal" as const,
      createdBy: DEMO_USER_ID,
      scenarios: [
        {
          title: "Invite external guest via email",
          gherkin: `Given the user is on a shared folder
When the user invites "contractor@external.com" as a guest
Then the guest should receive an email invitation
And the guest should only see the specific shared folder
And the guest should not appear in the organization member list`,
        },
        {
          title: "Guest access audit trail",
          gherkin: `Given a guest has accessed a shared folder
When the admin views the audit log
Then all guest file views and downloads should be logged
And the log should show the guest's IP address and timestamp`,
        },
      ],
    },

    // Search & Discovery
    {
      title: "Full-Text File Search",
      folderId: folderMap.get("Search & Discovery")!,
      state: "active" as const,
      priority: "normal" as const,
      createdBy: DEMO_USER_2_ID,
      scenarios: [
        {
          title: "Search file contents across supported formats",
          gherkin: `Given the workspace contains PDFs, DOCX, and TXT files
When the user searches for "quarterly revenue"
Then results should include files containing that phrase
And results should show a preview snippet with highlighted matches
And results should be ranked by relevance`,
        },
        {
          title: "Filter search by file type and date",
          gherkin: `Given the user has searched for "budget"
When the user filters by type "Spreadsheet" and date "Last 30 days"
Then only .xlsx and .csv files from the last 30 days should appear
And the active filters should be visible as removable chips`,
        },
      ],
    },
    {
      title: "File Tagging",
      folderId: folderMap.get("Search & Discovery")!,
      state: "active" as const,
      priority: "normal" as const,
      createdBy: DEMO_USER_ID,
      scenarios: [
        {
          title: "Add and remove tags from files",
          gherkin: `Given the user is viewing "architecture-diagram.png"
When the user adds tags "engineering" and "v2-design"
Then both tags should appear on the file
When the user removes the "v2-design" tag
Then only "engineering" should remain`,
        },
        {
          title: "Browse files by tag",
          gherkin: `Given multiple files are tagged with "client-deliverable"
When the user clicks the "client-deliverable" tag in the tag browser
Then all files with that tag should be listed
And the count should match the tag badge number`,
        },
      ],
    },
    {
      title: "Recent Files Dashboard",
      folderId: folderMap.get("Search & Discovery")!,
      state: "upcoming" as const,
      priority: "normal" as const,
      createdBy: DEMO_USER_ID,
      scenarios: [
        {
          title: "Show recently accessed files",
          gherkin: `Given the user has opened 5 files today
When the user navigates to the dashboard
Then the "Recent" section should show those 5 files in reverse chronological order
And each entry should show the last accessed timestamp`,
        },
        {
          title: "Quick access pinned files",
          gherkin: `Given the user has pinned 3 files to quick access
When the user opens the dashboard
Then the pinned files should appear in the "Quick Access" section
And the pin order should be customizable via drag and drop`,
        },
      ],
    },

    // Sync Engine
    {
      title: "Conflict Resolution",
      folderId: folderMap.get("Sync Engine")!,
      state: "active" as const,
      priority: "critical" as const,
      createdBy: DEMO_USER_2_ID,
      scenarios: [
        {
          title: "Detect concurrent edits on same file",
          gherkin: `Given User A and User B both have "report.docx" open
When User A saves changes to paragraph 3
And User B saves changes to paragraph 7 simultaneously
Then the system should detect a conflict
And prompt User B with a merge dialog showing both versions`,
        },
        {
          title: "Auto-merge non-overlapping changes",
          gherkin: `Given User A edits the header of "shared-doc.md"
And User B edits the footer of "shared-doc.md"
When both save within the same sync cycle
Then the system should auto-merge without conflict
And both changes should be preserved in the final version`,
        },
        {
          title: "Create conflict copy when merge fails",
          gherkin: `Given two users edit the same paragraph simultaneously
When the auto-merge algorithm cannot resolve the conflict
Then the system should create a conflict copy named "report (conflict - Jordan).docx"
And both versions should be preserved
And the file owner should be notified`,
        },
      ],
    },
    {
      title: "Offline Mode",
      folderId: folderMap.get("Sync Engine")!,
      state: "active" as const,
      priority: "high" as const,
      createdBy: DEMO_USER_ID,
      scenarios: [
        {
          title: "Mark files for offline access",
          gherkin: `Given the user marks the "Travel Docs" folder for offline access
Then the system should download all files in the folder
And a sync status icon should show download progress
And the files should be accessible without internet connection`,
        },
        {
          title: "Sync changes when reconnecting",
          gherkin: `Given the user edited 3 files while offline
When the device reconnects to the internet
Then the sync engine should detect pending changes
And upload the 3 modified files in the background
And show a notification "3 files synced successfully"`,
        },
      ],
    },
    {
      title: "Delta Sync Performance",
      folderId: folderMap.get("Sync Engine")!,
      state: "active" as const,
      priority: "normal" as const,
      createdBy: DEMO_USER_2_ID,
      scenarios: [
        {
          title: "Only transfer changed blocks",
          gherkin: `Given a 100MB file has a 50KB change in the middle
When the file syncs to the server
Then only the changed block (approximately 50KB) should be transferred
And the sync should complete in under 2 seconds on broadband`,
        },
        {
          title: "Resume interrupted sync",
          gherkin: `Given a 500MB file upload is 60% complete
When the network connection drops and reconnects
Then the upload should resume from the 60% mark
And the total transferred data should not exceed 500MB + overhead`,
        },
      ],
    },

    // Notifications & Activity
    {
      title: "Activity Feed",
      folderId: folderMap.get("Notifications & Activity")!,
      state: "active" as const,
      priority: "normal" as const,
      createdBy: DEMO_USER_ID,
      scenarios: [
        {
          title: "Display real-time activity in shared folders",
          gherkin: `Given the user is viewing a shared team folder
When a team member uploads a new file
Then the activity feed should show the upload event within 5 seconds
And the event should include the user avatar, file name, and timestamp`,
        },
        {
          title: "Filter activity by event type",
          gherkin: `Given the activity feed shows 50 events
When the user filters by "Uploads only"
Then only upload events should be displayed
And the filter should persist during the session`,
        },
      ],
    },
    {
      title: "Email Notification Preferences",
      folderId: folderMap.get("Notifications & Activity")!,
      state: "draft" as const,
      priority: "normal" as const,
      createdBy: DEMO_USER_2_ID,
      scenarios: [
        {
          title: "Configure per-folder notification settings",
          gherkin: `Given the user opens notification settings for "Client Projects" folder
When the user sets notifications to "Daily digest"
Then changes in that folder should be batched into a daily email
And the email should arrive at 9 AM in the user's timezone`,
        },
        {
          title: "Mute notifications for specific folders",
          gherkin: `Given the user mutes notifications for "Archive" folder
When files are added or modified in "Archive"
Then the user should not receive any notifications
And the muted status should show in the folder settings`,
        },
      ],
    },
  ];

  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  for (let i = 0; i < testCaseData.length; i++) {
    const tc = testCaseData[i];
    const inserted = await db
      .insert(testCases)
      .values({
        title: tc.title,
        folderId: tc.folderId,
        order: i,
        template: "bdd_feature",
        state: tc.state,
        priority: tc.priority,
        organizationId: DEMO_ORG_ID,
        createdBy: tc.createdBy,
        updatedBy: tc.createdBy,
        createdAt: daysAgo(30 - i),
        updatedAt: daysAgo(Math.max(0, 15 - i)),
      })
      .returning({ id: testCases.id });

    const testCaseId = inserted[0].id;

    for (let j = 0; j < tc.scenarios.length; j++) {
      await db.insert(scenarios).values({
        testCaseId,
        title: tc.scenarios[j].title,
        gherkin: tc.scenarios[j].gherkin,
        order: j,
        createdAt: daysAgo(30 - i),
        updatedAt: daysAgo(Math.max(0, 15 - i)),
      });
    }
  }

  // 5. Releases
  console.log("Creating releases...");
  const releaseData = [
    { name: "v2.3.0 - Search Improvements", status: "completed" as const, createdAt: daysAgo(45) },
    { name: "v2.4.0 - Sync Engine Overhaul", status: "active" as const, createdAt: daysAgo(14) },
    { name: "v2.5.0 - Notifications Revamp", status: "active" as const, createdAt: daysAgo(3) },
  ];

  const insertedReleases = await db
    .insert(releases)
    .values(
      releaseData.map((r) => ({
        name: r.name,
        organizationId: DEMO_ORG_ID,
        status: r.status,
        createdBy: DEMO_USER_ID,
        createdAt: r.createdAt,
      }))
    )
    .returning({ id: releases.id, name: releases.name });

  const releaseMap = new Map(insertedReleases.map((r) => [r.name, r.id]));

  // 6. Get all scenario IDs grouped by test case folder for creating runs
  const allScenarios = await db
    .select({
      id: scenarios.id,
      title: scenarios.title,
      gherkin: scenarios.gherkin,
      testCaseId: scenarios.testCaseId,
    })
    .from(scenarios)
    .innerJoin(testCases, eq(scenarios.testCaseId, testCases.id))
    .where(eq(testCases.organizationId, DEMO_ORG_ID));

  const allTestCasesDb = await db
    .select({ id: testCases.id, title: testCases.title, folderId: testCases.folderId })
    .from(testCases)
    .where(eq(testCases.organizationId, DEMO_ORG_ID));

  const testCaseMap = new Map(allTestCasesDb.map((tc) => [tc.id, tc]));

  // Group scenarios by folder for picking subsets for runs
  const scenariosByFolder = new Map<number, typeof allScenarios>();
  for (const s of allScenarios) {
    const tc = testCaseMap.get(s.testCaseId);
    if (!tc?.folderId) continue;
    const list = scenariosByFolder.get(tc.folderId) || [];
    list.push(s);
    scenariosByFolder.set(tc.folderId, list);
  }

  // 7. Test Runs
  console.log("Creating test runs...");

  const searchFolderId = folderMap.get("Search & Discovery")!;
  const syncFolderId = folderMap.get("Sync Engine")!;
  const notifFolderId = folderMap.get("Notifications & Activity")!;
  const fileFolderId = folderMap.get("File Management")!;

  const searchScenarios = scenariosByFolder.get(searchFolderId) || [];
  const syncScenarios = scenariosByFolder.get(syncFolderId) || [];
  const notifScenarios = scenariosByFolder.get(notifFolderId) || [];
  const fileScenarios = scenariosByFolder.get(fileFolderId) || [];

  type RunDef = {
    name: string;
    releaseId: number;
    environment: "sandbox" | "dev" | "staging" | "prod";
    status: "in_progress" | "completed";
    createdBy: string;
    createdAt: Date;
    scenarioList: typeof allScenarios;
    results: ("passed" | "failed" | "blocked" | "pending" | "skipped")[];
    notes: (string | null)[];
  };

  const runDefs: RunDef[] = [
    // Release 1 (completed) - Search tests
    {
      name: "Search Feature Regression",
      releaseId: releaseMap.get("v2.3.0 - Search Improvements")!,
      environment: "staging",
      status: "completed",
      createdBy: DEMO_USER_2_ID,
      createdAt: daysAgo(35),
      scenarioList: searchScenarios.slice(0, 6),
      results: ["passed", "passed", "passed", "passed", "passed", "passed"],
      notes: [null, null, null, null, null, null],
    },
    {
      name: "Search Feature Smoke Test",
      releaseId: releaseMap.get("v2.3.0 - Search Improvements")!,
      environment: "prod",
      status: "completed",
      createdBy: DEMO_USER_ID,
      createdAt: daysAgo(30),
      scenarioList: searchScenarios.slice(0, 4),
      results: ["passed", "passed", "passed", "passed"],
      notes: [null, null, null, null],
    },

    // Release 2 (active) - Sync tests
    {
      name: "Sync Engine - Happy Path",
      releaseId: releaseMap.get("v2.4.0 - Sync Engine Overhaul")!,
      environment: "dev",
      status: "completed",
      createdBy: DEMO_USER_2_ID,
      createdAt: daysAgo(10),
      scenarioList: syncScenarios,
      results: ["passed", "passed", "passed", "failed", "passed", "blocked", "passed"],
      notes: [
        null,
        null,
        null,
        "Timeout on large file conflict detection - investigating batch processing threshold. Fails consistently with files >200MB.",
        null,
        "Blocked by failed conflict resolution test - offline sync depends on this.",
        null,
      ],
    },
    {
      name: "Sync Engine - Edge Cases",
      releaseId: releaseMap.get("v2.4.0 - Sync Engine Overhaul")!,
      environment: "staging",
      status: "in_progress",
      createdBy: DEMO_USER_ID,
      createdAt: daysAgo(5),
      scenarioList: syncScenarios.slice(0, 5),
      results: ["passed", "passed", "failed", "pending", "pending"],
      notes: [
        null,
        null,
        "Conflict copy naming collision when user has special characters in display name. Needs sanitization.",
        null,
        null,
      ],
    },
    {
      name: "File Operations Regression",
      releaseId: releaseMap.get("v2.4.0 - Sync Engine Overhaul")!,
      environment: "staging",
      status: "in_progress",
      createdBy: DEMO_USER_2_ID,
      createdAt: daysAgo(3),
      scenarioList: fileScenarios,
      results: ["passed", "passed", "passed", "skipped", "blocked", "pending", "pending"],
      notes: [
        null,
        null,
        null,
        "Skipped - drag and drop not testable in headless CI, verified manually.",
        "Blocked by missing staging S3 credentials for large file tests.",
        null,
        null,
      ],
    },

    // Release 3 (active) - Notifications
    {
      name: "Notifications MVP",
      releaseId: releaseMap.get("v2.5.0 - Notifications Revamp")!,
      environment: "dev",
      status: "in_progress",
      createdBy: DEMO_USER_ID,
      createdAt: daysAgo(1),
      scenarioList: notifScenarios,
      results: ["passed", "pending", "pending", "pending"],
      notes: [null, null, null, null],
    },
  ];

  for (const run of runDefs) {
    const scenariosForRun = run.scenarioList.slice(0, run.results.length);

    const insertedRun = await db
      .insert(testRuns)
      .values({
        name: run.name,
        releaseId: run.releaseId,
        organizationId: DEMO_ORG_ID,
        environment: run.environment,
        status: run.status,
        createdBy: run.createdBy,
        createdAt: run.createdAt,
      })
      .returning({ id: testRuns.id });

    const runId = insertedRun[0].id;

    for (let i = 0; i < scenariosForRun.length; i++) {
      const s = scenariosForRun[i];
      const tc = testCaseMap.get(s.testCaseId);
      const status = run.results[i];
      const isPending = status === "pending";

      await db.insert(testRunResults).values({
        testRunId: runId,
        scenarioId: s.id,
        status,
        notes: run.notes[i] || null,
        executedAt: isPending ? null : new Date(run.createdAt.getTime() + (i + 1) * 3600000),
        executedBy: isPending ? null : run.createdBy,
        scenarioTitleSnapshot: s.title,
        scenarioGherkinSnapshot: s.gherkin,
        testCaseTitleSnapshot: tc?.title || "Unknown",
      });
    }
  }

  console.log("Demo data seeded successfully!");
  console.log(`  Organization: CloudSync (${DEMO_ORG_ID})`);
  console.log(`  Users: 2`);
  console.log(`  Folders: ${folderData.length}`);
  console.log(`  Test Cases: ${testCaseData.length}`);
  console.log(`  Scenarios: ${testCaseData.reduce((sum, tc) => sum + tc.scenarios.length, 0)}`);
  console.log(`  Releases: ${releaseData.length}`);
  console.log(`  Test Runs: ${runDefs.length}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Failed to seed demo data:", err);
  process.exit(1);
});
