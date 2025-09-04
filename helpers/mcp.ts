/**
 * Utility functions for MCP (Model Context Protocol) responses
 * Simplifies returning text responses from MCP tools
 */

export interface McpTextResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  [key: string]: unknown;
}

/**
 * Returns an error response for MCP tools
 */
export function mcpError(message: string): McpTextResponse {
  return {
    content: [{ type: "text", text: `❌ ${message}` }],
  };
}

/**
 * Returns a success response for MCP tools
 */
export function mcpSuccess(message: string): McpTextResponse {
  return {
    content: [{ type: "text", text: message }],
  };
}

/**
 * Returns an info response for MCP tools
 */
export function mcpInfo(message: string): McpTextResponse {
  return {
    content: [{ type: "text", text: `🔍 ${message}` }],
  };
}

/**
 * Returns a multi-part response for MCP tools
 */
export function mcpMultiple(messages: string[]): McpTextResponse {
  return {
    content: messages.map(text => ({ type: "text", text })),
  };
}
