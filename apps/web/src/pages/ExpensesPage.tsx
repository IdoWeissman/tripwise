import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { PageHeader, StatTile } from '../components/Bits';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ArrowRightIcon, CheckIcon, PlusIcon, TrashIcon } from '../components/Icons';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { messageFromError } from '../lib/errors';
import { formatMoney, toNumber } from '../lib/format';
import { useMemberIndexOf, useTrip } from '../lib/trip';
import { AddExpenseDialog } from './expenses/AddExpenseDialog';
import {
  AddExpenseDocument,
  DeleteExpenseDocument,
  ExpensesDocument,
  type ExpenseRow,
} from './expenses/queries';

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export function ExpensesPage() {
  const { trip, viewerId, canEdit, isOwner } = useTrip();
  const avatarIndex = useMemberIndexOf();
  const toast = useToast();
  // ?add opens the dialog, so Today (and others) can link straight to it.
  const [params, setParams] = useSearchParams();
  const adding = params.has('add');
  const setAdding = (open: boolean) => setParams(open ? { add: '' } : {}, { replace: !open });
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);
  const { data, loading, error, refetch } = useQuery(ExpensesDocument, {
    variables: { id: trip.id },
  });
  const [record, { loading: recording }] = useMutation(AddExpenseDocument);
  const [remove, { loading: removing }] = useMutation(DeleteExpenseDocument);

  const money = (decimal: string, signed = false) =>
    formatMoney(toNumber(decimal), trip.currency, signed);
  const name = (u: { id: string; name: string }) => (u.id === viewerId ? 'You' : u.name);

  const header = (
    <PageHeader
      title="Expenses"
      subtitle={`All amounts in ${trip.currency} · split equally unless noted`}
      actions={
        canEdit && (
          <Button onClick={() => setAdding(true)}>
            <PlusIcon />
            Add expense
          </Button>
        )
      }
    />
  );

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[100px]" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (error || !data?.trip)
    return <ErrorState message="We couldn't load expenses." onRetry={() => void refetch()} />;

  const t = data.trip;
  const balance = toNumber(t.expenseSummary.viewerBalance);
  const maxAbs = Math.max(1, ...t.balances.map((b) => Math.abs(toNumber(b.amount))));
  const canDelete = (e: ExpenseRow) => canEdit && (isOwner || e.paidBy.id === viewerId);

  const markPaid = async (s: (typeof t.settlements)[number]) => {
    try {
      await record({
        variables: {
          input: {
            tripId: trip.id,
            description: `${s.from.name} paid ${s.to.name}`,
            category: 'Settlement',
            amount: s.amount,
            paidById: s.from.id,
            splitMethod: 'EXACT',
            splits: [{ userId: s.to.id, value: s.amount }],
          },
        },
      });
      await refetch();
      toast(`Recorded: ${s.from.name} paid ${s.to.name} ${money(s.amount)}.`);
    } catch (err) {
      toast(messageFromError(err), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <StatTile label="Trip total" value={money(t.expenseSummary.total)} />
        <StatTile label="You paid" value={money(t.expenseSummary.viewerPaid)} />
        <div className="order-first col-span-2 md:order-none md:col-span-1">
          <StatTile
            label="Your balance"
            value={money(t.expenseSummary.viewerBalance, true)}
            tone={balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'default'}
          >
            <span className="text-sm font-semibold">
              {balance > 0 ? 'owed to you' : balance < 0 ? 'you owe' : 'all square'}
            </span>
          </StatTile>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section
          aria-label="Expense list"
          className="min-w-0 flex-[999_1_460px] rounded-card border border-border bg-surface py-2"
        >
          <div className="flex items-center justify-between px-5 py-3">
            <h2 className="text-[17px] font-bold">Expenses</h2>
            <span className="text-[13px] text-ink-muted">
              {t.expenseSummary.expenseCount} total
            </span>
          </div>
          {t.expenses.length === 0 ? (
            <div className="px-5 pb-4">
              <EmptyState
                title="No expenses yet"
                body="Log the first one and Tripwise will keep track of who owes whom."
              />
            </div>
          ) : (
            <>
              <ul className="flex flex-col md:hidden">
                {t.expenses.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 border-t border-surface-muted px-4 py-3"
                  >
                    <Avatar name={e.paidBy.name} index={avatarIndex(e.paidBy.id)} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className={`text-sm font-semibold ${e.isSettlement ? 'text-ink-secondary' : ''}`}
                      >
                        {e.description}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {name(e.paidBy)} paid · {DATE.format(new Date(e.spentAt))}
                      </span>
                    </span>
                    <span className="text-sm font-bold figures">{money(e.amount)}</span>
                    {canDelete(e) && (
                      <button
                        type="button"
                        aria-label={`Delete ${e.description}`}
                        onClick={() => setDeleting(e)}
                        className="-mr-2 flex size-11 items-center justify-center rounded-control text-ink-muted hover:text-negative-ink"
                      >
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="relative hidden overflow-x-auto md:block">
                <table className="w-full min-w-[540px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-ink-muted">
                      <th scope="col" className="px-5 py-2.5 font-semibold">
                        Expense
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        Paid by
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                        Amount
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                        Your share
                      </th>
                      <th scope="col" className="w-14 px-3 py-2.5">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.expenses.map((e) => (
                      <tr key={e.id} className="border-t border-surface-muted">
                        <td className="px-5 py-3.5">
                          <span className="flex flex-col gap-0.5">
                            <span
                              className={`font-semibold ${e.isSettlement ? 'text-ink-secondary' : ''}`}
                            >
                              {e.description}
                            </span>
                            <span className="text-[13px] text-ink-muted">
                              {DATE.format(new Date(e.spentAt))} · {e.category}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="flex items-center gap-2">
                            <Avatar
                              name={e.paidBy.name}
                              index={avatarIndex(e.paidBy.id)}
                              size="sm"
                            />
                            {name(e.paidBy)}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right font-semibold figures">
                          {money(e.amount)}
                        </td>
                        <td className="px-3 py-3.5 text-right text-ink-secondary figures">
                          {toNumber(e.viewerShare) ? money(e.viewerShare) : '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          {canDelete(e) && (
                            <button
                              type="button"
                              aria-label={`Delete ${e.description}`}
                              onClick={() => setDeleting(e)}
                              className="flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-negative-ink"
                            >
                              <TrashIcon size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <div className="order-first flex flex-[1_1_320px] flex-col gap-6 md:order-none">
          <section
            aria-label="Settle up"
            className="flex flex-col gap-3.5 rounded-card border border-border bg-surface p-5"
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-[17px] font-bold">Settle up</h2>
              <p className="text-[13px] text-ink-muted">
                {t.settlements.length === 0
                  ? 'Everyone is square.'
                  : `${t.settlements.length} ${t.settlements.length === 1 ? 'payment clears' : 'payments clear'} every balance.`}
              </p>
            </div>
            {t.settlements.map((s) => {
              const involvesMe = s.from.id === viewerId || s.to.id === viewerId;
              return (
                <div
                  key={`${s.from.id}-${s.to.id}`}
                  className={`flex flex-col gap-2.5 rounded-card p-3 ${involvesMe ? 'bg-money-tint' : 'bg-bg'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Avatar name={s.from.name} index={avatarIndex(s.from.id)} size="sm" />
                      <ArrowRightIcon size={16} className="text-ink-muted" />
                      <Avatar name={s.to.name} index={avatarIndex(s.to.id)} size="sm" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      {name(s.from)} {s.from.id === viewerId ? 'pay' : 'pays'}{' '}
                      {s.to.id === viewerId ? 'you' : s.to.name}
                    </span>
                    <span className="text-[15px] font-bold figures">{money(s.amount)}</span>
                  </div>
                  {canEdit && (involvesMe || isOwner) && (
                    <Button
                      variant="secondary"
                      className="min-h-11 self-end px-3.5 text-sm"
                      disabled={recording}
                      onClick={() => void markPaid(s)}
                    >
                      <CheckIcon size={16} />
                      Mark {money(s.amount)} paid
                    </Button>
                  )}
                </div>
              );
            })}
          </section>

          <section
            aria-label="Balances"
            className="flex flex-col gap-3.5 rounded-card border border-border bg-surface p-5"
          >
            <h2 className="text-[17px] font-bold">Balances</h2>
            {t.balances.map((b) => {
              const v = toNumber(b.amount);
              const w = `${Math.round((Math.abs(v) / maxAbs) * 100)}%`;
              return (
                <div
                  key={b.user.id}
                  className="grid grid-cols-[92px_minmax(0,1fr)_96px] items-center gap-2.5 text-sm"
                >
                  <span className="truncate font-semibold">
                    {b.user.id === viewerId ? `${b.user.name} (you)` : b.user.name}
                  </span>
                  <div aria-hidden="true" className="flex h-2.5">
                    <div className="flex flex-1 justify-end border-r border-border-input">
                      <div
                        className="rounded-l-full bg-negative"
                        style={{ width: v < 0 ? w : '0%' }}
                      />
                    </div>
                    <div className="flex flex-1">
                      <div
                        className="rounded-r-full bg-money"
                        style={{ width: v > 0 ? w : '0%' }}
                      />
                    </div>
                  </div>
                  <span
                    className={`text-right font-bold figures ${v >= 0 ? 'text-money' : 'text-negative-ink'}`}
                  >
                    {money(b.amount, true)}
                  </span>
                </div>
              );
            })}
          </section>
        </div>
      </div>

      {adding && (
        <AddExpenseDialog
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void refetch();
            toast('Expense added.');
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete expense?"
          body={`“${deleting.description}” (${money(deleting.amount)}) will be removed and balances recalculated.`}
          confirmLabel="Delete"
          busy={removing}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await remove({ variables: { id: deleting.id } });
              setDeleting(null);
              await refetch();
            } catch (err) {
              toast(messageFromError(err), 'error');
            }
          }}
        />
      )}
    </div>
  );
}
