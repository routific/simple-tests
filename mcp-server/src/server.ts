import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AuthContext } from "./auth/index.js";

// Import tools
import { registerFolderTools, handleFolderTool } from "./tools/folders.js";
import { registerTestCaseTools, handleTestCaseTool } from "./tools/test-cases.js";
import { registerTestRunTools, handleTestRunTool } from "./tools/test-runs.js";

// Import resources
import { registerFolderResources, handleFolderResource } from "./resources/folders.js";
import { registerTestCaseResources, handleTestCaseResource } from "./resources/test-cases.js";
import { registerTestRunResources, handleTestRunResource } from "./resources/test-runs.js";

export function createMcpServer(auth: AuthContext) {
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
    const tools = [
      ...registerFolderTools(auth),
      ...registerTestCaseTools(auth),
      ...registerTestRunTools(auth),
    ];
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      console.error(`[MCP Server] Tool call: ${name}`, JSON.stringify(args || {}).slice(0, 200));

      // Folder tools
      if (name.startsWith("create_folder") || name.startsWith("rename_folder") ||
          name.startsWith("delete_folder") || name.startsWith("move_folder")) {
        return await handleFolderTool(name, args || {}, auth);
      }

      // Test case tools
      if (name.startsWith("create_test_case") || name.startsWith("update_test_case") ||
          name.startsWith("delete_test_case") || name.startsWith("link_linear_issue") ||
          name.startsWith("unlink_linear_issue") || name.startsWith("get_linked_issues")) {
        return await handleTestCaseTool(name, args || {}, auth);
      }

      // Test run tools
      if (name.startsWith("create_test_run") || name.startsWith("update_test_result")) {
        return await handleTestRunTool(name, args || {}, auth);
      }

      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[MCP Server] Tool error:`, errorMessage, errorStack);
      return {
        content: [{ type: "text", text: `Tool error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = [
      ...registerFolderResources(),
      ...registerTestCaseResources(),
      ...registerTestRunResources(),
    ];
    return { resources };
  });

  // Handle resource reads
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    // Folder resources
    if (uri.startsWith("folders://")) {
      return handleFolderResource(uri, auth);
    }

    // Test case resources
    if (uri.startsWith("test-cases://")) {
      return handleTestCaseResource(uri, auth);
    }

    // Test run resources
    if (uri.startsWith("test-runs://")) {
      return handleTestRunResource(uri, auth);
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  return server;
}

export async function runStdioServer(auth: AuthContext) {
  const server = createMcpServer(auth);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP server running on stdio");
}
