import { describe, expect, it } from 'vitest';
import { runAssistant, type AssistantEvent } from '../src/assistant/agent.js';
import type { TripwiseTool } from '../src/mcp/tools.js';

/** A Messages API stream: an (optionally empty) text block, then a tool call or an answer. */
function stream(blocks: ({ type: 'text'; text: string } | { type: 'tool_use'; name: string })[]) {
  const frames: unknown[] = [{ type: 'message_start', message: { usage: { input_tokens: 10 } } }];
  blocks.forEach((b, index) => {
    if (b.type === 'text') {
      frames.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' },
      });
      if (b.text)
        frames.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: b.text },
        });
    } else {
      frames.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: `tu_${index}`, name: b.name, input: {} },
      });
      frames.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: '{}' },
      });
    }
    frames.push({ type: 'content_block_stop', index });
  });
  const toolUse = blocks.some((b) => b.type === 'tool_use');
  frames.push({
    type: 'message_delta',
    delta: { stop_reason: toolUse ? 'tool_use' : 'end_turn' },
    usage: { output_tokens: 5 },
  });
  return new Response(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join(''));
}

const tool = (name: string): TripwiseTool => ({
  name,
  title: name,
  description: name,
  inputSchema: {},
  annotations: {},
  run: async () => ({ ok: true }),
});
const TOOLS = [
  'get_trip',
  'get_itinerary',
  'list_bookings',
  'get_booking',
  'list_proposals',
  'get_expenses',
  'add_booking',
  'propose_activity',
  'add_expense',
].map(tool);

/** Rejects requests the real API rejects: any empty or whitespace-only text block. */
function strictApi(script: Response[]) {
  const bodies: { messages: { role: string; content: unknown }[] }[] = [];
  const fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body));
    bodies.push(body);
    for (const m of body.messages) {
      const blocks =
        typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
      for (const b of blocks)
        if (b.type === 'text' && !String(b.text).trim())
          return new Response(
            JSON.stringify({
              type: 'error',
              error: {
                type: 'invalid_request_error',
                message: 'messages: text content blocks must be non-empty',
              },
            }),
            { status: 400 },
          );
    }
    return script.shift()!;
  }) as typeof globalThis.fetch;
  return { fetch, bodies };
}

const run = (
  fetch: typeof globalThis.fetch,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
) => {
  const events: AssistantEvent[] = [];
  return runAssistant({
    apiKey: 'k',
    model: 'm',
    fetch,
    trip: {
      id: 't',
      name: 'Trip',
      timeZone: 'UTC',
      today: '2027-03-01',
      viewerName: 'Dana',
      role: 'OWNER',
    },
    tools: TOOLS,
    search: async () => [],
    history,
    question: 'Suggest some attractions we could add, with name, price and a little info',
    emit: (e) => events.push(e),
  }).then(() => events);
};

describe('assistant agent loop', () => {
  it('drops the empty text block Claude streams before a tool call', async () => {
    const api = strictApi([
      stream([
        { type: 'text', text: '' },
        { type: 'tool_use', name: 'get_trip' },
      ]),
      stream([{ type: 'text', text: 'Here are three ideas.' }]),
    ]);
    const events = await run(api.fetch);
    expect(
      events
        .filter((e) => e.type === 'text')
        .map((e) => (e as { text: string }).text)
        .join(''),
    ).toBe('Here are three ideas.');
    // The tool call was replayed without the empty block.
    expect(api.bodies[1]!.messages.at(-2)).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'get_trip', input: {} }],
    });
  });

  it('skips empty turns in the chat history', async () => {
    const api = strictApi([stream([{ type: 'text', text: 'Sure.' }])]);
    await run(api.fetch, [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: '   ' },
    ]);
    expect(api.bodies[0]!.messages.map((m) => m.content)).toEqual([
      'Hi',
      'Suggest some attractions we could add, with name, price and a little info',
    ]);
  });
});
