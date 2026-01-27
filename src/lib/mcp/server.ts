import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { AuthContext } from "./auth";
import { registerTools, handleToolCall } from "./tools";
import { registerResources, handleResourceRead } from "./resources";

export interface McpServerContext {
  clientId: string;
  sessionId?: string;
}

export function createMcpServer(auth: AuthContext, context?: McpServerContext) {
  const server = new Server(
    {
      name: "simple-tests-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = registerTools(auth);
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      return await handleToolCall(name, args || {}, auth, context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MCP Server] Tool error:`, errorMessage);
      return {
        content: [{ type: "text", text: `Tool error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = registerResources();
    return { resources };
  });

  // Handle resource reads
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    return handleResourceRead(uri, auth);
  });

  return server;
}
