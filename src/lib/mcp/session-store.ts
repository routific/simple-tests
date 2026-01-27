import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { AuthContext } from "./auth";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

// Custom transport interface with message handler
export interface McpTransport {
  start(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  close(): Promise<void>;
  handleIncomingMessage(message: JSONRPCMessage): void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
}

interface McpSession {
  id: string;
  server: Server;
  auth: AuthContext;
  transport: McpTransport | null;
  createdAt: Date;
  lastActivity: Date;
}

// Use globalThis to persist sessions across hot reloads in development
// For production multi-instance deployments, use Redis or similar
const globalForMcp = globalThis as unknown as {
  mcpSessions: Map<string, McpSession> | undefined;
};

const existingMap = globalForMcp.mcpSessions;
const sessions = existingMap ?? new Map<string, McpSession>();

console.log(`[MCP Session] Module loaded, existing map: ${existingMap ? "yes" : "no"}, sessions: ${sessions.size}`);

if (process.env.NODE_ENV !== "production") {
  globalForMcp.mcpSessions = sessions;
}

// Clean up old sessions periodically
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    const entries = Array.from(sessions.entries());
    for (const [id, session] of entries) {
      if (now - session.lastActivity.getTime() > SESSION_TIMEOUT_MS) {
        session.transport?.close();
        sessions.delete(id);
      }
    }
  }, 60 * 1000); // Check every minute
}

export function createSession(id: string, server: Server, auth: AuthContext): McpSession {
  const session: McpSession = {
    id,
    server,
    auth,
    transport: null,
    createdAt: new Date(),
    lastActivity: new Date(),
  };
  sessions.set(id, session);
  console.log(`[MCP Session] Created session ${id}, total sessions: ${sessions.size}`);
  return session;
}

export function getSession(id: string): McpSession | undefined {
  console.log(`[MCP Session] Looking up session ${id}, available sessions: ${Array.from(sessions.keys()).join(", ") || "none"}`);
  const session = sessions.get(id);
  if (session) {
    session.lastActivity = new Date();
    console.log(`[MCP Session] Found session ${id}`);
  } else {
    console.log(`[MCP Session] Session ${id} not found`);
  }
  return session;
}

export function deleteSession(id: string): void {
  const session = sessions.get(id);
  if (session) {
    session.transport?.close();
    sessions.delete(id);
  }
}

export function setSessionTransport(id: string, transport: McpTransport): void {
  const session = sessions.get(id);
  if (session) {
    session.transport = transport;
  }
}
