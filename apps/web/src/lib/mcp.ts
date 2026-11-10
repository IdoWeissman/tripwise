export type McpClient = 'claude-code' | 'claude-desktop' | 'cursor';

export const TOKEN_PLACEHOLDER = '<your token>';

/** Setup snippet per MCP client. The token is filled in right after it's created. */
export function setupSnippet(client: McpClient, url: string, token = TOKEN_PLACEHOLDER): string {
  switch (client) {
    case 'claude-code':
      return `claude mcp add --transport http tripwise ${url} \\\n  --header "Authorization: Bearer ${token}"`;
    case 'claude-desktop':
      // Claude Desktop's config file starts local servers, so mcp-remote bridges to our HTTP endpoint.
      return JSON.stringify(
        {
          mcpServers: {
            tripwise: {
              command: 'npx',
              args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${AUTH}'],
              env: { AUTH: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      );
    case 'cursor':
      return JSON.stringify(
        { mcpServers: { tripwise: { url, headers: { Authorization: `Bearer ${token}` } } } },
        null,
        2,
      );
  }
}
