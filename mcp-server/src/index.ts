#!/usr/bin/env node

import { validateToken, getTokenFromEnv, extractBearerToken } from "./auth/index.js";
import { runStdioServer, createMcpServer } from "./server.js";
import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const args = process.argv.slice(2);

function printUsage() {
  console.log(`
Simple Tests MCP Server

Usage:
  simple-tests-mcp [options]

Options:
  --stdio           Run in STDIO mode (default)
  --http            Run as HTTP server with SSE
  --port <number>   Port for HTTP server (default: 3001)
  --help            Show this help message

Environment Variables:
  MCP_API_TOKEN     API token for authentication (required for STDIO mode)
  TURSO_DATABASE_URL    Database URL (default: file:local.db)
  TURSO_AUTH_TOKEN      Database auth token (for remote Turso)

Examples:
  # STDIO mode (for Claude Desktop)
  MCP_API_TOKEN=st_xxxxx simple-tests-mcp --stdio

  # HTTP mode
  simple-tests-mcp --http --port 3001
`);
}

async function main() {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const isHttp = args.includes("--http");
  const portIndex = args.indexOf("--port");
  const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3001;

  if (isHttp) {
    await runHttpServer(port);
  } else {
    await runStdioMode();
  }
}

async function runStdioMode() {
  const token = getTokenFromEnv();

  if (!token) {
    console.error("Error: MCP_API_TOKEN environment variable is required");
    process.exit(1);
  }

  const auth = await validateToken(token);

  if (!auth) {
    console.error("Error: Invalid or expired API token");
    process.exit(1);
  }

  await runStdioServer(auth);
}

async function runHttpServer(port: number) {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  // CORS
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // Health check
  app.get("/health", (req, res) => {
    res.json({ status: "ok", version: "1.0.0" });
  });

  // Store active transports
  const transports = new Map<string, SSEServerTransport>();

  // SSE endpoint for MCP
  app.get("/sse", async (req, res) => {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: "Authorization header required" });
    }

    const auth = await validateToken(token);

    if (!auth) {
      return res.status(401).json({ error: "Invalid or expired API token" });
    }

    const transport = new SSEServerTransport("/messages", res);
    const server = createMcpServer(auth);

    const sessionId = crypto.randomUUID();
    transports.set(sessionId, transport);

    res.on("close", () => {
      transports.delete(sessionId);
    });

    await server.connect(transport);
  });

  // Messages endpoint for client-to-server communication
  app.post("/messages", async (req, res) => {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: "Authorization header required" });
    }

    const auth = await validateToken(token);

    if (!auth) {
      return res.status(401).json({ error: "Invalid or expired API token" });
    }

    // Find transport for this session (simplified - in production use session IDs)
    const sessionId = req.headers["x-session-id"] as string;
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  });

  app.listen(port, () => {
    console.log(`MCP HTTP server listening on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`SSE endpoint: http://localhost:${port}/sse`);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
