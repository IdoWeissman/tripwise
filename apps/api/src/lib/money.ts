/**
 * Money helpers. All arithmetic happens in integer cents — never floats.
 * Values cross the API boundary as decimal strings ("184.00").
 */

const MONEY_RE = /^-?\d{1,10}(\.\d{1,2})?$/;

export class MoneyError extends Error {}

export function toCents(value: string): number {
  const v = value.trim();
  if (!MONEY_RE.test(v)) throw new MoneyError(`"${value}" is not a valid amount.`);
  const negative = v.startsWith('-');
  const [whole = '0', frac = ''] = v.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return negative ? -cents : cents;
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Prisma Decimal (or anything with toFixed) → cents. */
export const decimalToCents = (d: { toFixed(dp: number): string }) => toCents(d.toFixed(2));

export type SplitMethod = 'EQUAL' | 'PERCENT' | 'EXACT';

export interface SplitRequest {
  userId: string;
  value?: string | null;
}

export interface Share {
  userId: string;
  cents: number;
}

/** Distributes `total` according to `weights`, using largest remainders so shares sum exactly. */
function apportion(total: number, userIds: string[], weights: number[]): Share[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / weightSum);
  const shares = raw.map(Math.floor);
  let remainder = total - shares.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    shares[i]! += 1;
    remainder -= 1;
  }
  return userIds.map((userId, i) => ({ userId, cents: shares[i]! }));
}

/** Turns a split request into exact per-person cents. Throws MoneyError with a user-facing message. */
export function computeShares(
  totalCents: number,
  method: SplitMethod,
  splits: SplitRequest[],
): Share[] {
  if (totalCents <= 0) throw new MoneyError('Amount must be greater than zero.');
  const ids = splits.map((s) => s.userId);
  if (ids.length === 0) throw new MoneyError('Choose at least one person to split with.');
  if (new Set(ids).size !== ids.length) throw new MoneyError('Each person can appear only once.');

  switch (method) {
    case 'EQUAL':
      return apportion(
        totalCents,
        ids,
        ids.map(() => 1),
      );

    case 'PERCENT': {
      // percent with up to 2 decimals → basis points
      const bps = splits.map((s) => toCents(s.value ?? '0'));
      if (bps.some((b) => b < 0)) throw new MoneyError('Percentages cannot be negative.');
      if (bps.reduce((a, b) => a + b, 0) !== 10_000) {
        throw new MoneyError('Percentages must add up to 100%.');
      }
      return apportion(totalCents, ids, bps);
    }

    case 'EXACT': {
      const shares = splits.map((s) => ({ userId: s.userId, cents: toCents(s.value ?? '0') }));
      if (shares.some((s) => s.cents < 0)) throw new MoneyError('Shares cannot be negative.');
      const sum = shares.reduce((a, s) => a + s.cents, 0);
      if (sum !== totalCents) {
        throw new MoneyError(`Shares add up to ${fromCents(sum)}, not ${fromCents(totalCents)}.`);
      }
      return shares;
    }
  }
}

export interface LedgerExpense {
  paidById: string;
  amountCents: number;
  shares: Share[];
}

/** Net balance per user: what they paid minus what they owe. Positive = owed to them. */
export function computeBalances(
  expenses: LedgerExpense[],
  memberIds: string[],
): Map<string, number> {
  const balances = new Map(memberIds.map((id) => [id, 0]));
  for (const e of expenses) {
    balances.set(e.paidById, (balances.get(e.paidById) ?? 0) + e.amountCents);
    for (const s of e.shares) balances.set(s.userId, (balances.get(s.userId) ?? 0) - s.cents);
  }
  return balances;
}

export interface Transfer {
  fromId: string;
  toId: string;
  cents: number;
}

/**
 * Greedy settle-up: repeatedly pays the largest creditor from the largest debtor.
 * Produces at most n-1 payments (optimal minimisation is NP-hard; this is the standard heuristic).
 */
export function settleUp(balances: Map<string, number>): Transfer[] {
  const creditors = [...balances].filter(([, c]) => c > 0).map(([id, c]) => ({ id, c }));
  const debtors = [...balances].filter(([, c]) => c < 0).map(([id, c]) => ({ id, c: -c }));
  const byAmount = (a: { c: number; id: string }, b: { c: number; id: string }) =>
    b.c - a.c || a.id.localeCompare(b.id);
  const transfers: Transfer[] = [];

  while (creditors.length && debtors.length) {
    creditors.sort(byAmount);
    debtors.sort(byAmount);
    const cr = creditors[0]!;
    const db = debtors[0]!;
    const cents = Math.min(cr.c, db.c);
    transfers.push({ fromId: db.id, toId: cr.id, cents });
    cr.c -= cents;
    db.c -= cents;
    if (cr.c === 0) creditors.shift();
    if (db.c === 0) debtors.shift();
  }
  return transfers;
}
