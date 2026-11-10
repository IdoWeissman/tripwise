import { describe, expect, it } from 'vitest';
import {
  createSseParser,
  describeSuggestion,
  parseBlocks,
  parseInline,
  type AssistantEvent,
} from './assistant';

describe('assistant answers', () => {
  it('finds bold text and citations', () => {
    expect(parseInline('Flight **TP 1394** leaves 06:10 [S1][S2].')).toEqual([
      { kind: 'text', text: 'Flight ' },
      { kind: 'bold', text: 'TP 1394' },
      { kind: 'text', text: ' leaves 06:10 ' },
      { kind: 'cite', id: 'S1' },
      { kind: 'cite', id: 'S2' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('turns paragraphs and bullets into blocks', () => {
    expect(
      parseBlocks('Two payments:\n- Noa pays Maya\n- Daniel pays Ido\n\nThat settles it.'),
    ).toEqual([
      { kind: 'p', text: 'Two payments:' },
      { kind: 'ul', items: ['Noa pays Maya', 'Daniel pays Ido'] },
      { kind: 'p', text: 'That settles it.' },
    ]);
  });

  it('parses server-sent events split across chunks', () => {
    const got: AssistantEvent[] = [];
    const feed = createSseParser((e) => got.push(e));
    feed('data: {"type":"text","te');
    feed('xt":"Hi"}\n\ndata: {"type":"done","inputTokens":1,"outputTokens":2}\n\n');
    expect(got).toEqual([
      { type: 'text', text: 'Hi' },
      { type: 'done', inputTokens: 1, outputTokens: 2 },
    ]);
  });

  it('summarises suggestion cards', () => {
    const card = describeSuggestion(
      {
        id: 'c',
        tool: 'add_expense',
        args: { description: 'Coffee', amount: '9.00', paidBy: 'me' },
      },
      'EUR',
    );
    expect(card).toEqual({
      title: 'Add expense',
      lines: ['Coffee · €9.00', 'Paid by you · split equally with everyone'],
    });
  });
});
