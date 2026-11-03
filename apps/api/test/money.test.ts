import { describe, expect, it } from 'vitest';
import {
  computeBalances,
  computeShares,
  fromCents,
  MoneyError,
  settleUp,
  toCents,
} from '../src/lib/money.js';

describe('toCents / fromCents', () => {
  it('parses and formats decimal strings', () => {
    expect(toCents('184')).toBe(18400);
    expect(toCents('12.5')).toBe(1250);
    expect(toCents('-0.07')).toBe(-7);
    expect(fromCents(4210)).toBe('42.10');
    expect(fromCents(-6420)).toBe('-64.20');
    expect(fromCents(5)).toBe('0.05');
  });
  it('rejects bad input', () => {
    expect(() => toCents('1.234')).toThrow(MoneyError);
    expect(() => toCents('abc')).toThrow(MoneyError);
  });
});

describe('computeShares', () => {
  const people = ['a', 'b', 'c'].map((userId) => ({ userId }));

  it('splits equally and hands out leftover cents deterministically', () => {
    const shares = computeShares(10000, 'EQUAL', people);
    expect(shares.map((s) => s.cents)).toEqual([3334, 3333, 3333]);
  });

  it('splits by percent and always sums to the total', () => {
    const shares = computeShares(18400, 'PERCENT', [
      { userId: 'a', value: '25' },
      { userId: 'b', value: '25' },
      { userId: 'c', value: '50' },
    ]);
    expect(shares.map((s) => s.cents)).toEqual([4600, 4600, 9200]);
    const odd = computeShares(1000, 'PERCENT', [
      { userId: 'a', value: '33.33' },
      { userId: 'b', value: '33.33' },
      { userId: 'c', value: '33.34' },
    ]);
    expect(odd.reduce((s, x) => s + x.cents, 0)).toBe(1000);
  });

  it('validates percentages and exact amounts', () => {
    expect(() =>
      computeShares(1000, 'PERCENT', [
        { userId: 'a', value: '50' },
        { userId: 'b', value: '40' },
      ]),
    ).toThrow('100%');
    expect(() =>
      computeShares(1000, 'EXACT', [
        { userId: 'a', value: '5.00' },
        { userId: 'b', value: '4.00' },
      ]),
    ).toThrow('not 10.00');
  });
});

describe('balances & settle up', () => {
  it('nets to zero and settles in at most n-1 payments', () => {
    const members = ['ido', 'maya', 'noa', 'daniel'];
    const balances = computeBalances(
      [
        {
          paidById: 'maya',
          amountCents: 43840,
          shares: computeShares(
            43840,
            'EQUAL',
            members.map((userId) => ({ userId })),
          ),
        },
        {
          paidById: 'ido',
          amountCents: 36210,
          shares: computeShares(
            36210,
            'EQUAL',
            members.map((userId) => ({ userId })),
          ),
        },
        {
          paidById: 'daniel',
          amountCents: 25580,
          shares: computeShares(
            25580,
            'EQUAL',
            members.map((userId) => ({ userId })),
          ),
        },
        {
          paidById: 'noa',
          amountCents: 22370,
          shares: computeShares(
            22370,
            'EQUAL',
            members.map((userId) => ({ userId })),
          ),
        },
      ],
      members,
    );
    expect([...balances.values()].reduce((a, b) => a + b, 0)).toBe(0);
    expect(balances.get('maya')).toBeGreaterThan(0);
    expect(balances.get('noa')).toBeLessThan(0);

    const transfers = settleUp(balances);
    expect(transfers.length).toBeLessThanOrEqual(members.length - 1);
    const after = new Map(balances);
    for (const t of transfers) {
      after.set(t.fromId, after.get(t.fromId)! + t.cents);
      after.set(t.toId, after.get(t.toId)! - t.cents);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
  });
});
