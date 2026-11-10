import { describe, expect, it } from 'vitest';
import { setupSnippet, TOKEN_PLACEHOLDER } from './mcp';

const url = 'https://tripwise.example/mcp';
const token = 'tw_pat_' + 'a'.repeat(32);

describe('MCP setup snippets', () => {
  it('builds a Claude Code command', () => {
    const cmd = setupSnippet('claude-code', url, token);
    expect(cmd).toContain(`claude mcp add --transport http tripwise ${url}`);
    expect(cmd).toContain(`--header "Authorization: Bearer ${token}"`);
  });

  it('builds valid JSON configs for Claude Desktop and Cursor', () => {
    const desktop = JSON.parse(setupSnippet('claude-desktop', url, token));
    expect(desktop.mcpServers.tripwise.args).toContain(url);
    expect(desktop.mcpServers.tripwise.env.AUTH).toBe(`Bearer ${token}`);
    const cursor = JSON.parse(setupSnippet('cursor', url, token));
    expect(cursor.mcpServers.tripwise).toEqual({
      url,
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  it('shows a placeholder until a token exists', () => {
    expect(setupSnippet('cursor', url)).toContain(TOKEN_PLACEHOLDER);
  });
});
