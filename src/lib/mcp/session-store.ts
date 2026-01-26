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

// In-memory session store (for single-instance deployments)
// For multi-instance deployments, use Redis or similar
const sessions = new Map<string, McpSession>();

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
  return session;
}

export function getSession(id: string): McpSession | undefined {
  const session = sessions.get(id);
  if (session) {
    session.lastActivity = new Date();
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
