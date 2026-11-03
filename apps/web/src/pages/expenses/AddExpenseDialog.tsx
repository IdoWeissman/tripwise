import { useMutation } from '@apollo/client/react';
import { useMemo, useState, type FormEvent } from 'react';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { SelectField, TextField } from '../../components/Fields';
import { Segmented } from '../../components/Segmented';
import type { SplitMethod } from '../../gql/graphql';
import { messageFromError } from '../../lib/errors';
import { formatMoney } from '../../lib/format';
import { centsToDecimal, equalShares, parseCents } from '../../lib/money';
import { useTrip } from '../../lib/trip';
import { AddExpenseDocument } from './queries';

const CATEGORIES = ['Food', 'Stay', 'Transport', 'Activities', 'Other'];
const METHODS: { value: SplitMethod; label: string }[] = [
  { value: 'EQUAL', label: 'Equally' },
  { value: 'PERCENT', label: 'Percent' },
  { value: 'EXACT', label: 'Exact' },
];

/** M4 · Add expense — big amount, split method, live per-person shares and validation hint. */
export function AddExpenseDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { trip, viewerId } = useTrip();
  const members = trip.members.map((m, index) => ({ ...m.user, index }));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paidById, setPaidById] = useState(viewerId);
  const [category, setCategory] = useState('Food');
  const [method, setMethod] = useState<SplitMethod>('EQUAL');
  const [included, setIncluded] = useState<Set<string>>(() => new Set(members.map((m) => m.id)));
  const [values, setValues] = useState<Record<string, string>>({});
  const [add, { loading, error }] = useMutation(AddExpenseDocument);

  const totalCents = parseCents(amount) ?? 0;
  const fmt = (cents: number) => formatMoney(cents / 100, trip.currency);

  const preview = useMemo(() => {
    if (method === 'EQUAL') {
      const ids = members.filter((m) => included.has(m.id)).map((m) => m.id);
      const shares = equalShares(totalCents, ids.length);
      const byId = new Map(ids.map((id, i) => [id, shares[i]!]));
      return {
        share: (id: string) => (byId.has(id) ? fmt(byId.get(id)!) : '—'),
        valid: ids.length > 0 && totalCents > 0,
        hint: ids.length
          ? `${fmt(shares[ids.length - 1] ?? 0)} each · ${ids.length} ${ids.length === 1 ? 'person' : 'people'}`
          : 'Choose at least one person.',
      };
    }
    const parsed = members.map((m) => parseCents(values[m.id] || '0'));
    const sum = parsed.reduce<number>((a, b) => a + (b ?? 0), 0);
    const anyInvalid = parsed.some((p) => p === null);
    if (method === 'PERCENT') {
      return {
        share: (id: string) => {
          const bp = parseCents(values[id] || '0') ?? 0;
          return bp ? fmt(Math.round((totalCents * bp) / 10000)) : '—';
        },
        valid: !anyInvalid && sum === 10000 && totalCents > 0,
        hint:
          sum === 10000
            ? 'Percentages add up to 100%'
            : `Percentages add up to ${centsToDecimal(sum).replace(/\.00$/, '')}% — need 100%`,
      };
    }
    return {
      share: () => '',
      valid: !anyInvalid && sum === totalCents && totalCents > 0,
      hint:
        sum === totalCents
          ? `Shares add up to ${fmt(totalCents)}`
          : `Shares add up to ${fmt(sum)} of ${fmt(totalCents)}`,
    };
  }, [method, members, included, values, totalCents]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const splits =
      method === 'EQUAL'
        ? members.filter((m) => included.has(m.id)).map((m) => ({ userId: m.id }))
        : members
            .filter((m) => (parseCents(values[m.id] || '0') ?? 0) > 0)
            .map((m) => ({ userId: m.id, value: values[m.id] }));
    try {
      await add({
        variables: {
          input: {
            tripId: trip.id,
            description,
            category,
            amount: centsToDecimal(totalCents),
            paidById,
            splitMethod: method,
            splits,
          },
        },
      });
      onSaved();
    } catch {
      /* rendered below */
    }
  };

  return (
    <Dialog open onClose={onClose} title="New expense" wide>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col items-center gap-1 py-2">
          <span className="text-[13px] font-semibold text-ink-muted">Amount ({trip.currency})</span>
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
            className="w-full bg-transparent text-center text-[44px] font-bold tracking-[-0.02em] tabular-nums outline-none placeholder:text-ink-muted"
            aria-invalid={amount !== '' && parseCents(amount) === null}
            autoFocus
          />
        </label>
        <TextField
          label="Description"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Dinner at Taberna da Rua"
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Paid by"
            value={paidById}
            onValueChange={setPaidById}
            options={members.map((m) => ({
              value: m.id,
              label: m.id === viewerId ? 'You' : m.name,
            }))}
          />
          <SelectField
            label="Category"
            value={category}
            onValueChange={setCategory}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
        </div>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-sm font-semibold">Split</legend>
          <Segmented
            label="Split method"
            kind="radio"
            value={method}
            onChange={setMethod}
            options={METHODS}
          />
          <ul className="flex flex-col">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex min-h-14 items-center gap-3 border-b border-surface-muted"
              >
                {method === 'EQUAL' ? (
                  <label className="flex flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-5 accent-accent"
                      checked={included.has(m.id)}
                      onChange={(e) => {
                        const next = new Set(included);
                        if (e.target.checked) next.add(m.id);
                        else next.delete(m.id);
                        setIncluded(next);
                      }}
                    />
                    <Avatar name={m.name} index={m.index} />
                    <span className="flex-1 text-[15px] font-medium">
                      {m.id === viewerId ? 'You' : m.name}
                    </span>
                  </label>
                ) : (
                  <>
                    <Avatar name={m.name} index={m.index} />
                    <span className="flex-1 text-[15px] font-medium">
                      {m.id === viewerId ? 'You' : m.name}
                    </span>
                    <label className="flex items-center gap-1.5">
                      <span className="sr-only">
                        {method === 'PERCENT' ? 'Percent' : 'Amount'} for {m.name}
                      </span>
                      <input
                        inputMode="decimal"
                        placeholder={method === 'PERCENT' ? '0' : '0.00'}
                        value={values[m.id] ?? ''}
                        onChange={(e) =>
                          setValues({ ...values, [m.id]: e.target.value.replace(',', '.') })
                        }
                        className="h-11 w-24 rounded-control border border-border-input px-2 text-right text-sm tabular-nums"
                      />
                      <span className="w-4 text-sm text-ink-muted">
                        {method === 'PERCENT' ? '%' : ''}
                      </span>
                    </label>
                  </>
                )}
                {method !== 'EXACT' && (
                  <span className="w-24 text-right text-[15px] font-semibold text-ink-secondary tabular-nums">
                    {preview.share(m.id)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p
            className={`text-[13px] ${preview.valid || totalCents === 0 ? 'text-accent-strong' : 'text-negative-ink'}`}
          >
            {preview.hint}
          </p>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-negative-ink">
            {messageFromError(error)}
          </p>
        )}
        <Button
          type="submit"
          className="h-[52px] text-base"
          disabled={loading || !preview.valid || !description.trim()}
        >
          {loading ? 'Saving…' : 'Save expense'}
        </Button>
      </form>
    </Dialog>
  );
}
