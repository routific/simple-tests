#!/usr/bin/env npx tsx

import { createHash, randomBytes } from "crypto";
import { db, apiTokens, organizations, users } from "../src/shared/index.js";

async function createTestToken() {
  // Ensure local dev org and user exist
  const orgId = "local-dev-org";
  const userId = "local-dev-user";

  // Check if org exists, create if not
  const existingOrg = await db.query.organizations.findFirst({
    where: (orgs, { eq }) => eq(orgs.id, orgId),
  });

  if (!existingOrg) {
    await db.insert(organizations).values({
      id: orgId,
      name: "Local Development",
      createdAt: new Date(),
    });
    console.log("Created local-dev-org");
  }

  // Check if user exists, create if not
  const existingUser = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
  });

  if (!existingUser) {
    await db.insert(users).values({
      id: userId,
      linearUsername: "local-dev",
      email: "dev@localhost",
      name: "Local Developer",
      organizationId: orgId,
      createdAt: new Date(),
    });
    console.log("Created local-dev-user");
  }

  // Generate a new token
  const rawToken = `st_${randomBytes(24).toString("hex")}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const tokenId = `tok_${randomBytes(8).toString("hex")}`;

  await db.insert(apiTokens).values({
    id: tokenId,
    name: "Development Token",
    tokenHash,
    organizationId: orgId,
    userId: userId,
    permissions: "admin",
    createdAt: new Date(),
  });

  console.log("\n=== API Token Created ===");
  console.log(`Token ID: ${tokenId}`);
  console.log(`Token: ${rawToken}`);
  console.log("\nSave this token - it cannot be retrieved again!");
  console.log("\nUsage:");
  console.log(`  MCP_API_TOKEN=${rawToken} npm run dev -- --stdio`);
}

createTestToken()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
