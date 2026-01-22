import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { parse } from "csv-parse/sync";
import * as he from "he";
import * as fs from "fs";
import * as path from "path";
import * as schema from "../src/lib/db/schema";

// Load environment variables
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  });
}

const dbUrl = process.env.TURSO_DATABASE_URL || "file:local.db";
const isLocal = dbUrl === "file:local.db" || !process.env.TURSO_DATABASE_URL;

const client = createClient({
  url: dbUrl,
  authToken: isLocal ? undefined : process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

interface TestmoRow {
  "Case ID": string;
  Case: string;
  "Created at": string;
  Folder: string;
  "Scenarios (Step)": string;
  State: string;
}

// Define nested folder structure
// Format: [name, parentPath | null]
type FolderNode = {
  name: string;
  children?: FolderNode[];
};

const folderStructure: FolderNode[] = [
  {
    name: "V3 Web App",
    children: [
      {
        name: "Account Management",
        children: [
          { name: "Signup" },
          { name: "Authentication" },
          { name: "Password Reset" },
          { name: "Account Settings" },
          { name: "Join Company" },
        ],
      },
      {
        name: "Order Management",
        children: [
          {
            name: "Adding Orders",
            children: [
              {
                name: "CSV Upload",
                children: [
                  { name: "Mapping uploaded data" },
                  { name: "Managing errors in uploaded data" },
                  { name: "Supported order data" },
                ],
              },
              { name: "Order Form" },
            ],
          },
          {
            name: "Viewing Orders",
            children: [
              { name: "View Order Details" },
              { name: "Viewing Orders on Map" },
            ],
          },
          { name: "Searching Orders" },
          {
            name: "Editing Orders",
            children: [{ name: "Batch editing orders" }],
          },
          { name: "Deleting Orders" },
          { name: "Reviewing Address Issues" },
          { name: "Roles / Permissions" },
        ],
      },
      {
        name: "Route Management",
        children: [
          { name: "Scheduling" },
          { name: "Changing Dates" },
          { name: "Adding Routes" },
          { name: "Viewing Routes" },
          { name: "Modifying Routes" },
          { name: "Deleting Routes" },
          { name: "Assigning Drivers" },
          { name: "Publishing Routes" },
          { name: "Route Template Management" },
          { name: "Roles / Permissions" },
        ],
      },
      { name: "Customer Management" },
      {
        name: "Driver Management",
        children: [
          { name: "Roles / Permissions" },
          { name: "Tracking Driver Location" },
        ],
      },
      {
        name: "Customer Notifications",
        children: [
          { name: "Customer Notification Settings" },
          { name: "Delivery Scheduled Notification" },
          { name: "Driver on the Way Notification" },
          { name: "Delivery Completed Notification" },
          { name: "Delivery Missed Notification" },
        ],
      },
      {
        name: "Workspace Management",
        children: [{ name: "Roles / Permisisons" }],
      },
      {
        name: "Organization Management",
        children: [
          { name: "Managing Teammates" },
          { name: "Default Settings" },
          { name: "Display Settings" },
          { name: "Roles / Permissions" },
          { name: "Route Optimization Settings" },
          { name: "Integrations Management" },
        ],
      },
      { name: "Data Export" },
      {
        name: "API Integrations",
        children: [
          { name: "Optimizing Routes (/optimize endpoint)" },
          { name: "Orders" },
          { name: "Publish" },
          { name: "Webhooks" },
          { name: "Routes" },
        ],
      },
      {
        name: "Routific Admin",
        children: [
          { name: "Debugging User's Organizations" },
          { name: "Create User" },
          { name: "Feature flags Management" },
        ],
      },
      { name: "V2 > V3 Opt-in Flow" },
      {
        name: "Billing",
        children: [{ name: "Roles / Permissions" }],
      },
      {
        name: "Support",
        children: [{ name: "Maintenance" }],
      },
      {
        name: "View Insights",
        children: [{ name: "View Details By Driver" }],
      },
      { name: "Marked for deletion" },
    ],
  },
  {
    name: "V3 Mobile App",
    children: [
      { name: "Sign up" },
      { name: "Authentication" },
      { name: "Receive routes and route updates" },
      { name: "Inspect Route" },
      { name: "Navigate to Stop" },
      { name: "Complete orders" },
      { name: "Complete Stops" },
      {
        name: "Manage Proof of Delivery (POD)",
        children: [
          { name: "Manage photos" },
          { name: "Manage notes to dispatcher" },
          { name: "Manage signature" },
          { name: "Scan package barcodes" },
        ],
      },
      { name: "Manage account" },
      { name: "Join a company" },
      { name: "Update the app" },
    ],
  },
];

// Map CSV folder names to their target folder path
// Key: CSV folder name, Value: full path in hierarchy (array of folder names from root to leaf)
const csvFolderMapping: Record<string, string[]> = {
  // Account Management
  Signup: ["V3 Web App", "Account Management", "Signup"],
  Authentication: ["V3 Web App", "Account Management", "Authentication"],
  "Password Reset": ["V3 Web App", "Account Management", "Password Reset"],
  "Account Settings": ["V3 Web App", "Account Management", "Account Settings"],
  "Join Company": ["V3 Web App", "Account Management", "Join Company"],
  "Account Management": ["V3 Web App", "Account Management"],

  // Order Management - Adding Orders
  "CSV Upload": ["V3 Web App", "Order Management", "Adding Orders", "CSV Upload"],
  "File Upload": ["V3 Web App", "Order Management", "Adding Orders", "CSV Upload"],
  "Column Mapping": ["V3 Web App", "Order Management", "Adding Orders", "CSV Upload", "Mapping uploaded data"],
  "Fields Mapping": ["V3 Web App", "Order Management", "Adding Orders", "CSV Upload", "Mapping uploaded data"],
  "Mapping uploaded data": ["V3 Web App", "Order Management", "Adding Orders", "CSV Upload", "Mapping uploaded data"],
  "Managing errors in uploaded data": ["V3 Web App", "Order Management", "Adding Orders", "CSV Upload", "Managing errors in uploaded data"],
  "Inline Edit Errors": ["V3 Web App", "Order Management", "Adding Orders", "CSV Upload", "Managing errors in uploaded data"],
  "View Errors": ["V3 Web App", "Order Management", "Adding Orders", "CSV Upload", "Managing errors in uploaded data"],
  "Supported order data": ["V3 Web App", "Order Management", "Adding Orders", "CSV Upload", "Supported order data"],
  "Order Form": ["V3 Web App", "Order Management", "Adding Orders", "Order Form"],
  "Adding Orders": ["V3 Web App", "Order Management", "Adding Orders"],

  // Order Management - Viewing Orders
  "View Order Details": ["V3 Web App", "Order Management", "Viewing Orders", "View Order Details"],
  "Viewing Orders on Map": ["V3 Web App", "Order Management", "Viewing Orders", "Viewing Orders on Map"],
  "Viewing Orders": ["V3 Web App", "Order Management", "Viewing Orders"],

  // Order Management - Other
  "Searching Orders": ["V3 Web App", "Order Management", "Searching Orders"],
  "Editing Orders": ["V3 Web App", "Order Management", "Editing Orders"],
  "Batch editing orders": ["V3 Web App", "Order Management", "Editing Orders", "Batch editing orders"],
  "Bulk Edit": ["V3 Web App", "Order Management", "Editing Orders", "Batch editing orders"],
  "Deleting Orders": ["V3 Web App", "Order Management", "Deleting Orders"],
  "Bulk Delete": ["V3 Web App", "Order Management", "Deleting Orders"],
  "Reviewing Address Issues": ["V3 Web App", "Order Management", "Reviewing Address Issues"],
  "Questionable and Invalid Addresses": ["V3 Web App", "Order Management", "Reviewing Address Issues"],
  "Smart Address": ["V3 Web App", "Order Management", "Reviewing Address Issues"],
  "Geocoder": ["V3 Web App", "Order Management", "Reviewing Address Issues"],
  "Order Management": ["V3 Web App", "Order Management"],

  // Route Management
  "Scheduling": ["V3 Web App", "Route Management", "Scheduling"],
  "Scheduling orders to routes": ["V3 Web App", "Route Management", "Scheduling"],
  "Scheduling orders with constraints": ["V3 Web App", "Route Management", "Scheduling"],
  "Schedule Order": ["V3 Web App", "Route Management", "Scheduling"],
  "Scheduling Preview": ["V3 Web App", "Route Management", "Scheduling"],
  "Scheduling / Optimization Actions": ["V3 Web App", "Route Management", "Scheduling"],
  "Scheduling Requested analytics": ["V3 Web App", "Route Management", "Scheduling"],
  "Schedule new orders with best-insert": ["V3 Web App", "Route Management", "Scheduling"],
  "Unscheduling orders": ["V3 Web App", "Route Management", "Scheduling"],
  "Unschedule a Stop": ["V3 Web App", "Route Management", "Scheduling"],
  "Changing Dates": ["V3 Web App", "Route Management", "Changing Dates"],
  "Reschedule Order": ["V3 Web App", "Route Management", "Changing Dates"],
  "Adding Routes": ["V3 Web App", "Route Management", "Adding Routes"],
  "Viewing Routes": ["V3 Web App", "Route Management", "Viewing Routes"],
  "View and Inspect Routes": ["V3 Web App", "Route Management", "Viewing Routes"],
  "Viewing Routes on Map": ["V3 Web App", "Route Management", "Viewing Routes"],
  "Viewing routes on a timeline": ["V3 Web App", "Route Management", "Viewing Routes"],
  "Viewing routes on a list": ["V3 Web App", "Route Management", "Viewing Routes"],
  "Route Timeline": ["V3 Web App", "Route Management", "Viewing Routes"],
  "Timeline View is Selected": ["V3 Web App", "Route Management", "Viewing Routes"],
  "Timeline View is not Selected": ["V3 Web App", "Route Management", "Viewing Routes"],
  "Timeline view is selected": ["V3 Web App", "Route Management", "Viewing Routes"],
  "Modifying Routes": ["V3 Web App", "Route Management", "Modifying Routes"],
  "Re-Assign a Scheduled Stop": ["V3 Web App", "Route Management", "Modifying Routes"],
  "Re-order a Scheduled Stop": ["V3 Web App", "Route Management", "Modifying Routes"],
  "Assign an Unscheduled Stop": ["V3 Web App", "Route Management", "Modifying Routes"],
  "Moving stops within route": ["V3 Web App", "Route Management", "Modifying Routes"],
  "Moving stops across routes": ["V3 Web App", "Route Management", "Modifying Routes"],
  "Modifying Schedule for Live Routes": ["V3 Web App", "Route Management", "Modifying Routes"],
  "Deleting Routes": ["V3 Web App", "Route Management", "Deleting Routes"],
  "Delete Route": ["V3 Web App", "Route Management", "Deleting Routes"],
  "Deleting Stops": ["V3 Web App", "Route Management", "Deleting Routes"],
  "Assigning Drivers": ["V3 Web App", "Route Management", "Assigning Drivers"],
  "Assign driver to Route": ["V3 Web App", "Route Management", "Assigning Drivers"],
  "Publishing Routes": ["V3 Web App", "Route Management", "Publishing Routes"],
  "Route Template Management": ["V3 Web App", "Route Management", "Route Template Management"],
  "Route Templates": ["V3 Web App", "Route Management", "Route Template Management"],

  // Customer Management
  "Customer Management": ["V3 Web App", "Customer Management"],
  "Customer Profiles": ["V3 Web App", "Customer Management"],

  // Driver Management
  "Driver Management": ["V3 Web App", "Driver Management"],
  "Tracking Driver Location": ["V3 Web App", "Driver Management", "Tracking Driver Location"],
  "Live Tracking": ["V3 Web App", "Driver Management", "Tracking Driver Location"],
  "Tracking Route Progress": ["V3 Web App", "Driver Management", "Tracking Driver Location"],

  // Customer Notifications
  "Customer Notifications": ["V3 Web App", "Customer Notifications"],
  "Customer Notification Settings": ["V3 Web App", "Customer Notifications", "Customer Notification Settings"],
  "Delivery Scheduled Notification": ["V3 Web App", "Customer Notifications", "Delivery Scheduled Notification"],
  "Driver on the Way Notification": ["V3 Web App", "Customer Notifications", "Driver on the Way Notification"],
  "Delivery Completed Notification": ["V3 Web App", "Customer Notifications", "Delivery Completed Notification"],
  "Delivery Missed Notification": ["V3 Web App", "Customer Notifications", "Delivery Missed Notification"],

  // Workspace Management
  "Workspace Management": ["V3 Web App", "Workspace Management"],
  "Roles / Permisisons": ["V3 Web App", "Workspace Management", "Roles / Permisisons"],

  // Organization Management
  "Organization Management": ["V3 Web App", "Organization Management"],
  "Managing Teammates": ["V3 Web App", "Organization Management", "Managing Teammates"],
  "Members Page": ["V3 Web App", "Organization Management", "Managing Teammates"],
  "Default Settings": ["V3 Web App", "Organization Management", "Default Settings"],
  "Display Settings": ["V3 Web App", "Organization Management", "Display Settings"],
  "Route Optimization Settings": ["V3 Web App", "Organization Management", "Route Optimization Settings"],
  "Optimization Preferences": ["V3 Web App", "Organization Management", "Route Optimization Settings"],
  "Integrations Management": ["V3 Web App", "Organization Management", "Integrations Management"],

  // Data Export
  "Data Export": ["V3 Web App", "Data Export"],

  // API Integrations
  "API Integrations": ["V3 Web App", "API Integrations"],
  "API Integration": ["V3 Web App", "API Integrations"],
  "API": ["V3 Web App", "API Integrations"],
  "[RT-828] API": ["V3 Web App", "API Integrations"],
  "Optimizing Routes (/optimize endpoint)": ["V3 Web App", "API Integrations", "Optimizing Routes (/optimize endpoint)"],
  "Optimize a route": ["V3 Web App", "API Integrations", "Optimizing Routes (/optimize endpoint)"],
  "Orders": ["V3 Web App", "API Integrations", "Orders"],
  "Publish": ["V3 Web App", "API Integrations", "Publish"],
  "Webhooks": ["V3 Web App", "API Integrations", "Webhooks"],
  "Routes": ["V3 Web App", "API Integrations", "Routes"],

  // Routific Admin
  "Routific Admin": ["V3 Web App", "Routific Admin"],
  "Debugging User's Organizations": ["V3 Web App", "Routific Admin", "Debugging User's Organizations"],
  "Create User": ["V3 Web App", "Routific Admin", "Create User"],
  "Creating Users and Organizations": ["V3 Web App", "Routific Admin", "Create User"],
  "Feature flags Management": ["V3 Web App", "Routific Admin", "Feature flags Management"],
  "Feature Flag": ["V3 Web App", "Routific Admin", "Feature flags Management"],

  // V2 > V3 Opt-in Flow
  "V2 > V3 Opt-in Flow": ["V3 Web App", "V2 > V3 Opt-in Flow"],
  "V2 > V3 Sync": ["V3 Web App", "V2 > V3 Opt-in Flow"],

  // Billing
  "Billing": ["V3 Web App", "Billing"],
  "Plan Upgrade": ["V3 Web App", "Billing"],

  // Support
  "Support": ["V3 Web App", "Support"],
  "Maintenance": ["V3 Web App", "Support", "Maintenance"],

  // View Insights
  "View Insights": ["V3 Web App", "View Insights"],
  "View Details By Driver": ["V3 Web App", "View Insights", "View Details By Driver"],
  "Aggregate Route Stats": ["V3 Web App", "View Insights"],
  "Viewing total stats across scheduled routes": ["V3 Web App", "View Insights"],

  // Marked for deletion
  "Marked for deletion": ["V3 Web App", "Marked for deletion"],

  // Roles / Permissions (generic - map to Order Management by default)
  "Roles / Permissions": ["V3 Web App", "Order Management", "Roles / Permissions"],
  "Roles and Permissions": ["V3 Web App", "Order Management", "Roles / Permissions"],
  "[RT-972] Authorization": ["V3 Web App", "Order Management", "Roles / Permissions"],

  // V3 Mobile App
  "Sign up": ["V3 Mobile App", "Sign up"],
  "Receive routes and route updates": ["V3 Mobile App", "Receive routes and route updates"],
  "Inspect Route": ["V3 Mobile App", "Inspect Route"],
  "Navigate to Stop": ["V3 Mobile App", "Navigate to Stop"],
  "Complete orders": ["V3 Mobile App", "Complete orders"],
  "Complete Stops": ["V3 Mobile App", "Complete Stops"],
  "Manage photos": ["V3 Mobile App", "Manage Proof of Delivery (POD)", "Manage photos"],
  "Manage notes to dispatcher": ["V3 Mobile App", "Manage Proof of Delivery (POD)", "Manage notes to dispatcher"],
  "Manage signature": ["V3 Mobile App", "Manage Proof of Delivery (POD)", "Manage signature"],
  "Scan package barcodes": ["V3 Mobile App", "Manage Proof of Delivery (POD)", "Scan package barcodes"],
  "Manage account": ["V3 Mobile App", "Manage account"],
  "Join a company": ["V3 Mobile App", "Join a company"],
  "Update the app": ["V3 Mobile App", "Update the app"],
  "V2 Driver App": ["V3 Mobile App"],
  "Delivery Tracking App": ["V3 Mobile App"],

  // UI-related items -> map to V3 Web App root or specific areas
  "Map Interactions": ["V3 Web App", "Order Management", "Viewing Orders", "Viewing Orders on Map"],
  "Map Panning": ["V3 Web App", "Order Management", "Viewing Orders", "Viewing Orders on Map"],
  "Zoom": ["V3 Web App", "Order Management", "Viewing Orders", "Viewing Orders on Map"],
  "Hover": ["V3 Web App"],
  "Hover Interactions": ["V3 Web App"],
  "Mouse Click": ["V3 Web App"],
  "Mouse Hover": ["V3 Web App"],
  "Keyboard Press": ["V3 Web App"],
  "Drag": ["V3 Web App"],
  "Select Interactions": ["V3 Web App"],
  "Bulk Select": ["V3 Web App"],
  "Multi Select - List and Timeline view": ["V3 Web App"],
  "UI Controls": ["V3 Web App"],
  "UI Layout": ["V3 Web App"],
  "Resize Panel": ["V3 Web App"],
  "Stack Controls": ["V3 Web App"],
  "View Controller": ["V3 Web App"],
  "View Transitions": ["V3 Web App"],
  "Unscheduled Stops Panel": ["V3 Web App", "Route Management", "Viewing Routes"],
  "Unscheduled": ["V3 Web App", "Route Management", "Viewing Routes"],

  // Project-related -> Route Management
  "Project Management": ["V3 Web App", "Route Management"],
  "Project Schedule by Date": ["V3 Web App", "Route Management", "Scheduling"],
  "Existing Project": ["V3 Web App", "Route Management"],
  "New Project": ["V3 Web App", "Route Management"],
  "Synced Project Updates": ["V3 Web App", "Route Management"],
  "Search for a Route": ["V3 Web App", "Route Management", "Viewing Routes"],
  "Searching in a Project": ["V3 Web App", "Route Management", "Viewing Routes"],
  "Route Settings": ["V3 Web App", "Route Management"],
  "Route ETA accuracy": ["V3 Web App", "Route Management"],
  "No Routes": ["V3 Web App", "Route Management"],
  "Routes  Only - No Stops": ["V3 Web App", "Route Management"],
  "Routes and Stops": ["V3 Web App", "Route Management"],
  "V2 Synced Routes": ["V3 Web App", "Route Management"],
  "V3 Native Routes": ["V3 Web App", "Route Management"],

  // Other specific mappings
  "Undo/Redo changes": ["V3 Web App"],
  "Navigation": ["V3 Web App"],
  "General": ["V3 Web App"],
  "Example Cases": ["V3 Web App"],
  "CoreTest Cases": ["V3 Web App"],
  "Error Handling": ["V3 Web App"],
  "Failure Handling": ["V3 Web App"],
  "Monitoring": ["V3 Web App"],
  "Tracking Analytics Events": ["V3 Web App"],
  "Phone Number": ["V3 Web App", "Account Management"],
  "Logo": ["V3 Web App", "Organization Management", "Display Settings"],
  "Custom Fields": ["V3 Web App", "Organization Management"],
  "Auto-tagging": ["V3 Web App", "Order Management"],
  "Ordering Priority": ["V3 Web App", "Order Management"],
  "Orders Confirmation": ["V3 Web App", "Order Management"],
  "Orders Selection": ["V3 Web App", "Order Management"],
  "Upload Orders": ["V3 Web App", "Order Management", "Adding Orders"],
  "Delimiter Tests": ["V3 Web App", "Order Management", "Adding Orders", "CSV Upload"],
  "Creating Stops": ["V3 Web App", "Order Management", "Adding Orders"],
  "Create a single stop": ["V3 Web App", "Order Management", "Adding Orders"],
  "Create multiple stops (via spreadsheet)": ["V3 Web App", "Order Management", "Adding Orders", "CSV Upload"],
  "Capacity Digest": ["V3 Web App", "Route Management"],
  "Working Time Digest": ["V3 Web App", "Route Management"],
  "Clustering": ["V3 Web App", "Route Management"],
  "Conflict resolution": ["V3 Web App", "Route Management"],
  "Adjust optimization preference": ["V3 Web App", "Organization Management", "Route Optimization Settings"],
  "Respect optimization preferences": ["V3 Web App", "Organization Management", "Route Optimization Settings"],
  "Integration tests for shouldReoptimizeScenario": ["V3 Web App", "Route Management"],
  "Post dispatch": ["V3 Web App", "Route Management", "Publishing Routes"],
  "Post-dispatch": ["V3 Web App", "Route Management", "Publishing Routes"],
  "Post-publish": ["V3 Web App", "Route Management", "Publishing Routes"],
  "Pre-publish": ["V3 Web App", "Route Management", "Publishing Routes"],
  "Initial Sync on V2 Publish": ["V3 Web App", "Route Management", "Publishing Routes"],
  "User Service": ["V3 Web App", "Account Management"],
  "Update Password": ["V3 Web App", "Account Management", "Password Reset"],
  "Authentication / Installation": ["V3 Mobile App", "Authentication"],
  "Authentication and access": ["V3 Web App", "Account Management", "Authentication"],
};

function extractScenarios(html: string): { title: string; gherkin: string }[] {
  if (!html) return [];

  const scenarios: { title: string; gherkin: string }[] = [];

  // Split by <pre><code> blocks
  const blocks = html.split(/<pre><code[^>]*>/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const endIndex = block.indexOf("</code></pre>");
    if (endIndex === -1) continue;

    let gherkin = block.substring(0, endIndex);

    // Decode HTML entities
    gherkin = he.decode(gherkin);

    // Clean up whitespace
    gherkin = gherkin.replace(/\r\n/g, "\n").trim();

    // Extract scenario title from first line that starts with "Scenario:"
    const lines = gherkin.split("\n");
    let title = "Untitled Scenario";

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("Scenario:") || trimmedLine.startsWith("Scenario Outline:")) {
        title = trimmedLine.replace(/^Scenario( Outline)?:\s*/, "").trim();
        break;
      }
    }

    if (gherkin) {
      scenarios.push({ title, gherkin });
    }
  }

  return scenarios;
}

function mapState(state: string): "active" | "draft" | "retired" | "rejected" {
  const normalized = state?.toLowerCase() || "";
  if (normalized === "active") return "active";
  if (normalized === "draft") return "draft";
  if (normalized === "retired") return "retired";
  if (normalized === "rejected") return "rejected";
  return "active";
}

async function createFolderStructure(
  nodes: FolderNode[],
  parentId: number | null,
  folderPathToId: Map<string, number>,
  currentPath: string[] = []
): Promise<void> {
  let order = 0;
  for (const node of nodes) {
    const path = [...currentPath, node.name];
    const pathKey = path.join(" > ");

    const result = await db
      .insert(schema.folders)
      .values({
        name: node.name,
        parentId,
        order: order++,
      })
      .returning({ id: schema.folders.id });

    const folderId = result[0].id;
    folderPathToId.set(pathKey, folderId);

    if (node.children) {
      await createFolderStructure(node.children, folderId, folderPathToId, path);
    }
  }
}

async function importTestmo(csvPath: string) {
  console.log(`Reading CSV from: ${csvPath}`);

  let csvContent = fs.readFileSync(csvPath, "utf-8");
  // Remove UTF-8 BOM if present
  if (csvContent.charCodeAt(0) === 0xfeff) {
    csvContent = csvContent.slice(1);
  }
  const records: TestmoRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`Found ${records.length} test cases to import`);

  // Create folder structure and get path -> ID mapping
  const folderPathToId = new Map<string, number>();
  console.log("Creating folder structure...");
  await createFolderStructure(folderStructure, null, folderPathToId);
  console.log(`Created ${folderPathToId.size} folders`);

  // Build CSV folder name -> folder ID mapping
  const csvFolderToId = new Map<string, number>();
  for (const [csvFolder, pathArray] of Object.entries(csvFolderMapping)) {
    const pathKey = pathArray.join(" > ");
    const folderId = folderPathToId.get(pathKey);
    if (folderId) {
      csvFolderToId.set(csvFolder, folderId);
    }
  }

  // Track unmapped folders
  const unmappedFolders = new Set<string>();

  // Import test cases
  let importedCases = 0;
  let importedScenarios = 0;
  let skipped = 0;

  for (const row of records) {
    try {
      const title = row.Case?.trim();
      if (!title) {
        skipped++;
        continue;
      }

      const csvFolder = row.Folder?.trim() || "";
      let folderId = csvFolderToId.get(csvFolder);

      if (!folderId && csvFolder) {
        unmappedFolders.add(csvFolder);
        // Default to V3 Web App root
        folderId = folderPathToId.get("V3 Web App");
      }

      // Create test case
      const testCaseResult = await db
        .insert(schema.testCases)
        .values({
          legacyId: row["Case ID"] || null,
          title,
          folderId: folderId || null,
          template: "bdd_feature",
          state: mapState(row.State || ""),
          priority: "normal",
          createdAt: row["Created at"] ? new Date(row["Created at"]) : new Date(),
          updatedAt: row["Created at"] ? new Date(row["Created at"]) : new Date(),
        })
        .returning({ id: schema.testCases.id });

      const testCaseId = testCaseResult[0].id;

      // Parse and create scenarios
      const scenarios = extractScenarios(row["Scenarios (Step)"] || "");

      if (scenarios.length === 0) {
        // Create a default empty scenario if none found
        await db.insert(schema.scenarios).values({
          testCaseId,
          title: "Default Scenario",
          gherkin: "",
          order: 0,
        });
        importedScenarios++;
      } else {
        for (let i = 0; i < scenarios.length; i++) {
          await db.insert(schema.scenarios).values({
            testCaseId,
            title: scenarios[i].title,
            gherkin: scenarios[i].gherkin,
            order: i,
          });
          importedScenarios++;
        }
      }

      importedCases++;

      if (importedCases % 100 === 0) {
        console.log(`Imported ${importedCases} test cases, ${importedScenarios} scenarios...`);
      }
    } catch (error) {
      console.error(`Failed to import case: ${row.Case}`, error);
      skipped++;
    }
  }

  console.log(`\nImport complete!`);
  console.log(`- Imported: ${importedCases} test cases`);
  console.log(`- Imported: ${importedScenarios} scenarios`);
  console.log(`- Skipped: ${skipped} test cases`);
  console.log(`- Folders: ${folderPathToId.size}`);

  if (unmappedFolders.size > 0) {
    console.log(`\nWarning: ${unmappedFolders.size} unmapped folders (placed in V3 Web App root):`);
    Array.from(unmappedFolders)
      .sort()
      .forEach((f) => console.log(`  - ${f}`));
  }
}

// Get CSV path from command line or use default
const csvPath = process.argv[2] || "./Testmo repository dump - Jan 22 '26 - abridged.csv";
const absolutePath = path.resolve(csvPath);

if (!fs.existsSync(absolutePath)) {
  console.error(`CSV file not found: ${absolutePath}`);
  process.exit(1);
}

importTestmo(absolutePath)
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Import failed:", error);
    process.exit(1);
  });
