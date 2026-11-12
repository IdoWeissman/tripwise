import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import {
  AlertIcon,
  ChevronLeftIcon,
  CopyIcon,
  ExternalIcon,
  PinIcon,
  PlusIcon,
  TrashIcon,
} from '../components/Icons';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { messageFromError } from '../lib/errors';
import {
  ACCEPT,
  BOOKING_TYPES,
  bookingPrice,
  directions,
  dayShift,
  duration,
  fileExt,
  fileSize,
  localDayLong,
  localDayTime,
  localTime,
  SOURCE_LABEL,
  uploadBookingFile,
  type BookingDraft,
} from '../lib/bookings';
import { formatRelative } from '../lib/format';
import { useTrip } from '../lib/trip';
import { BookingForm } from './bookings/BookingForm';
import {
  formProblems,
  formStateFrom,
  toBookingInput,
  type BookingFormState,
} from './bookings/formState';
import {
  AttachToBookingDocument,
  BookingDetailDocument,
  DeleteAttachmentDocument,
  DeleteBookingDocument,
  UpdateBookingDocument,
  type BookingFull,
} from './bookings/queries';

const card = 'rounded-card border border-border bg-surface';

/** Booking detail — design canvas "Booking detail" (desktop) and M5 (mobile) / rules §2 · 09. */
export function BookingDetailPage() {
  const { bookingId = '' } = useParams();
  const { trip, canEdit } = useTrip();
  const { data, loading, error, refetch } = useQuery(BookingDetailDocument, {
    variables: { id: trip.id, bookingId },
  });

  const back = (
    <Link
      to=".."
      relative="path"
      className="flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold no-underline"
    >
      <ChevronLeftIcon size={16} />
      All bookings
    </Link>
  );

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true">
        {back}
        <Skeleton className="h-10 w-72" />
        <div className="flex flex-wrap gap-6">
          <Skeleton className="h-64 flex-[2_1_420px]" />
          <Skeleton className="h-64 flex-[1_1_280px]" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <ErrorState message="We couldn't load this booking." onRetry={() => void refetch()} />
      </div>
    );
  }
  const booking = data?.trip?.booking;
  if (!booking) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <EmptyState
          title="Booking not found"
          body="It may have been deleted by someone on the trip."
        />
      </div>
    );
  }
  const reminders = (data.trip?.reminders ?? []).filter((r) => r.booking.id === booking.id);
  return <BookingDetail booking={booking} reminders={reminders} canEdit={canEdit} back={back} />;
}

interface DetailProps {
  booking: BookingFull;
  reminders: { key: string; title: string; body: string; fireAt: string }[];
  canEdit: boolean;
  back: React.ReactNode;
}

function BookingDetail({ booking: b, reminders, canEdit, back }: DetailProps) {
  const { trip, viewerId } = useTrip();
  const client = useApolloClient();
  const toast = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [leg, setLeg] = useState(0);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<BookingFormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removingDoc, setRemovingDoc] = useState<BookingFull['attachments'][number] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [update, { loading: saving }] = useMutation(UpdateBookingDocument);
  const [remove, { loading: deleting }] = useMutation(DeleteBookingDocument);
  const [attach] = useMutation(AttachToBookingDocument);
  const [deleteAttachment, { loading: deletingDoc }] = useMutation(DeleteAttachmentDocument);

  const t = BOOKING_TYPES[b.type];
  const segments = b.segments;
  const seg = segments[Math.min(leg, segments.length - 1)];
  const price = bookingPrice(b.price, b.currency);
  const manageLabel =
    b.type === 'FLIGHT'
      ? 'Manage on airline site'
      : b.type === 'STAY'
        ? 'Manage reservation'
        : 'Open on provider site';
  const legLabel = (i: number) =>
    segments.length === 2 ? (i === 0 ? 'Outbound' : 'Return') : `Leg ${i + 1}`;
  const subtitle = [t.label, b.provider].filter(Boolean).join(' · ');
  // Flights and trains: to the departure airport/station of the leg on screen.
  const route = directions(b, seg);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(b.confirmationCode ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Copy failed — select the code and copy it manually.', 'error');
    }
  }

  async function addDocuments(files: File[]) {
    setUploading(true);
    try {
      for (const file of files) {
        const res = await uploadBookingFile(trip.id, file);
        await attach({ variables: { attachmentId: res.attachment.id, bookingId: b.id } });
      }
      await client.refetchQueries({ include: 'active' });
      toast(files.length === 1 ? 'Document attached' : `${files.length} documents attached`);
    } catch (err) {
      toast(messageFromError(err), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await update({ variables: { id: b.id, input: toBookingInput(editing) } });
      await client.refetchQueries({ include: 'active' });
      setEditing(null);
      toast('Booking updated');
    } catch (err) {
      toast(messageFromError(err), 'error');
    }
  }

  const startEditing = () =>
    setEditing(
      formStateFrom(
        { ...(b as unknown as Partial<BookingDraft>), type: b.type, title: b.title },
        trip.currency,
      ),
    );

  return (
    <div className="flex flex-col gap-5">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className={`flex size-12 shrink-0 items-center justify-center rounded-card text-xs font-bold tracking-[0.04em] ${t.chip}`}
          >
            {t.code}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-[26px] font-extrabold tracking-[-0.02em] md:text-[34px]">
              {b.title}
            </h1>
            <p className="text-sm text-ink-muted">{subtitle}</p>
          </div>
        </div>
        {b.confirmationCode && (
          <section aria-label="Confirmation code" className={`${card} w-full px-4 py-3 md:hidden`}>
            <ConfirmationCode
              code={b.confirmationCode}
              copied={copied}
              onCopy={() => void copyCode()}
            />
          </section>
        )}
        <div className="flex flex-wrap gap-3">
          {canEdit && (
            <Button variant="secondary" onClick={startEditing}>
              Edit
            </Button>
          )}
          {route && (
            <a
              href={route.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-input bg-surface px-5 text-[15px] font-semibold text-ink no-underline hover:bg-surface-muted hover:text-ink"
            >
              <PinIcon size={16} />
              {route.label}
            </a>
          )}
          {b.bookingUrl && (
            <a
              href={b.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-sign px-5 text-[15px] font-semibold text-white no-underline hover:bg-sign-raised hover:text-white"
            >
              {manageLabel}
              <ExternalIcon size={16} />
            </a>
          )}
        </div>
      </div>

      {b.missingFields.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-card border border-attention bg-tint-orange px-4 py-3.5"
        >
          <AlertIcon size={20} className="shrink-0 text-attention-ink" />
          <span className="min-w-0 flex-1 text-sm">
            Missing {b.missingFields.join(' and ')}, so it can't show on the itinerary yet.
          </span>
          {canEdit && (
            <Button variant="secondary" onClick={startEditing}>
              Add details
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-6">
        {/* Main column: schedule */}
        <div className="flex min-w-0 flex-[2_1_420px] flex-col gap-4">
          {segments.length > 1 && (
            <div
              role="tablist"
              aria-label="Legs"
              className="grid grid-flow-col gap-1 rounded-card bg-surface-muted p-1"
            >
              {segments.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === leg}
                  onClick={() => setLeg(i)}
                  className={`min-h-11 rounded-control text-sm ${i === leg ? 'bg-surface font-semibold shadow-segment' : 'font-medium text-ink-secondary'}`}
                >
                  {legLabel(i)}
                </button>
              ))}
            </div>
          )}

          {seg ? (
            <section
              aria-label={segments.length > 1 ? legLabel(leg) : 'Schedule'}
              className={`${card} flex flex-col gap-5 px-5 py-5 md:px-6`}
            >
              <span className="text-xs font-bold tracking-[0.04em] text-accent-strong uppercase">
                {[localDayLong(seg.departLocal), seg.number].filter(Boolean).join(' · ')}
              </span>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[30px] font-bold figures">
                    {localTime(seg.departLocal) ?? '—'}
                  </span>
                  <span className="truncate text-sm font-semibold">
                    {seg.fromCode ?? seg.fromName ?? 'From'}
                  </span>
                  {seg.fromCode && seg.fromName && (
                    <span className="truncate text-xs text-ink-muted">{seg.fromName}</span>
                  )}
                </span>
                <span className="flex flex-col items-center gap-1 text-xs font-semibold text-ink-muted">
                  <span aria-hidden="true" className="h-px w-16 bg-border-input sm:w-24" />
                  {seg.arrivesAt && duration(seg.departsAt, seg.arrivesAt)}
                </span>
                <span className="flex min-w-0 flex-col text-right">
                  <span className="text-[30px] font-bold figures">
                    {localTime(seg.arriveLocal) ?? '—'}
                    <span className="text-base">{dayShift(seg.departLocal, seg.arriveLocal)}</span>
                  </span>
                  <span className="truncate text-sm font-semibold">
                    {seg.toCode ?? seg.toName ?? 'To'}
                  </span>
                  {seg.toCode && seg.toName && (
                    <span className="truncate text-xs text-ink-muted">{seg.toName}</span>
                  )}
                </span>
              </div>
              {seg.departTz && seg.arriveTz && seg.departTz !== seg.arriveTz && (
                <p className="text-xs text-ink-muted">
                  Times are local: departure in {seg.departTz}, arrival in {seg.arriveTz}.
                </p>
              )}
            </section>
          ) : (
            <section
              aria-label="Schedule"
              className={`${card} grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 p-5`}
            >
              <Fact
                label={b.type === 'STAY' ? 'Check-in' : 'Starts'}
                value={localDayTime(b.startLocal) ?? 'Not set'}
              />
              {(b.endLocal || b.type === 'STAY') && (
                <Fact
                  label={b.type === 'STAY' ? 'Check-out' : 'Ends'}
                  value={localDayTime(b.endLocal) ?? 'Not set'}
                />
              )}
              {b.location && <Fact label="Where" value={b.location} />}
            </section>
          )}

          {(b.address || b.notes) && (
            <section aria-label="Notes" className={`${card} flex flex-col gap-3 p-5`}>
              {b.address && (
                <p className="text-sm">
                  <span className="font-semibold">Address</span>
                  <br />
                  {b.address}
                  <br />
                  <a
                    href={
                      directions({ type: b.type, location: b.location, address: b.address })!.url
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 font-semibold"
                  >
                    <PinIcon size={14} />
                    Get directions
                  </a>
                </p>
              )}
              {b.notes && (
                <p className="text-sm whitespace-pre-line text-ink-secondary">{b.notes}</p>
              )}
            </section>
          )}
        </div>

        {/* Side column: confirmation, documents, reminders */}
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          <section aria-labelledby="bk-conf" className={`${card} flex flex-col gap-3.5 p-5`}>
            <h2 id="bk-conf" className="sr-only">
              Confirmation
            </h2>
            {/* On phones the code sits under the title instead (see above). */}
            <div className={b.confirmationCode ? 'hidden md:block' : undefined}>
              <ConfirmationCode
                code={b.confirmationCode}
                copied={copied}
                onCopy={() => void copyCode()}
              />
            </div>
            <dl
              className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm ${b.confirmationCode ? 'md:border-t md:border-surface-muted md:pt-3.5' : 'border-t border-surface-muted pt-3.5'}`}
            >
              {b.travellers ? (
                <DlRow k={b.type === 'FLIGHT' ? 'Passengers' : 'People'} v={String(b.travellers)} />
              ) : null}
              {price && <DlRow k="Price" v={price} />}
              <DlRow
                k="Status"
                v={
                  b.missingFields.length
                    ? 'Needs details'
                    : b.status === 'CANCELLED'
                      ? 'Cancelled'
                      : 'Confirmed'
                }
              />
              <DlRow
                k="Added"
                v={`${b.createdBy.id === viewerId ? 'You' : b.createdBy.name} · ${formatRelative(b.createdAt)}`}
              />
              <DlRow k="Source" v={SOURCE_LABEL[b.source]} />
            </dl>
          </section>

          <section aria-labelledby="bk-docs" className={`${card} flex flex-col gap-3 p-5`}>
            <h2 id="bk-docs" className="text-[17px] font-bold">
              Documents
            </h2>
            {b.attachments.length === 0 && <p className="text-sm text-ink-muted">No files yet.</p>}
            {b.attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-9 shrink-0 items-center justify-center rounded-chip bg-attention text-xs font-bold text-attention-ink"
                >
                  {fileExt(a.fileName, a.mimeType)}
                </span>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-ink no-underline"
                >
                  <span className="truncate text-sm font-semibold">{a.fileName}</span>
                  <span className="text-xs text-ink-muted">{fileSize(a.sizeBytes)} · open</span>
                </a>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Delete ${a.fileName}`}
                    onClick={() => setRemovingDoc(a)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-negative-ink"
                  >
                    <TrashIcon size={16} />
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-border-input text-sm font-semibold text-ink-secondary hover:bg-surface-muted disabled:opacity-60"
                >
                  <PlusIcon size={16} />
                  {uploading
                    ? 'Uploading…'
                    : b.type === 'FLIGHT'
                      ? 'Attach boarding passes'
                      : 'Attach a document'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    // Copy first: clearing the input below empties the live FileList.
                    const picked = [...(e.target.files ?? [])];
                    if (picked.length) void addDocuments(picked);
                    e.target.value = '';
                  }}
                />
              </>
            )}
          </section>

          <section aria-labelledby="bk-rem" className={`${card} flex flex-col gap-1 p-5`}>
            <h2 id="bk-rem" className="mb-1.5 text-[17px] font-bold">
              Reminders
            </h2>
            {reminders.length === 0 ? (
              <p className="text-sm text-ink-muted">No upcoming reminders for this booking.</p>
            ) : (
              reminders.map((r) => (
                <div
                  key={r.key}
                  className="flex flex-col border-t border-surface-muted py-2.5 first-of-type:border-t-0"
                >
                  <span className="text-sm font-semibold">{r.title}</span>
                  <span className="text-xs text-ink-muted">
                    {new Intl.DateTimeFormat('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hourCycle: 'h23',
                      timeZone:
                        b.timeZone && !/^[+-]/.test(b.timeZone) ? b.timeZone : trip.timeZone,
                    }).format(new Date(r.fireAt))}{' '}
                    · {r.body}
                  </span>
                </div>
              ))
            )}
            <Link
              to="../?calendar"
              relative="path"
              className="mt-1 flex min-h-11 items-center text-sm font-semibold"
            >
              Reminder settings
            </Link>
          </section>

          {canEdit && (
            <Button
              variant="destructive"
              className="self-start"
              onClick={() => setConfirmDelete(true)}
            >
              <TrashIcon size={16} />
              Delete booking
            </Button>
          )}
        </div>
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit booking" wide>
        {editing && (
          <div className="flex flex-col">
            <BookingForm value={editing} onChange={setEditing} tripTimeZone={trip.timeZone} />
            <div className="sticky -bottom-5 -mx-5 -mb-5 mt-6 flex justify-end gap-2 border-t border-border bg-surface px-5 py-4">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                disabled={saving || formProblems(editing).includes('title')}
                onClick={() => void saveEdit()}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${b.title}?`}
          body="The booking and its documents are removed for everyone on the trip."
          confirmLabel="Delete booking"
          busy={deleting}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() =>
            void remove({ variables: { id: b.id } })
              .then(async () => {
                client.cache.evict({
                  id: client.cache.identify({ __typename: 'Booking', id: b.id }),
                });
                client.cache.gc();
                await client.refetchQueries({ include: ['TripShell'] });
                toast('Booking deleted');
                void navigate(`/trips/${trip.id}/bookings`, { replace: true });
              })
              .catch((err: unknown) => toast(messageFromError(err), 'error'))
          }
        />
      )}

      {removingDoc && (
        <ConfirmDialog
          title={`Delete ${removingDoc.fileName}?`}
          body="The file is removed from this booking for everyone on the trip."
          confirmLabel="Delete file"
          busy={deletingDoc}
          onClose={() => setRemovingDoc(null)}
          onConfirm={() =>
            void deleteAttachment({ variables: { id: removingDoc.id } })
              .then(async () => {
                await client.refetchQueries({ include: 'active' });
                setRemovingDoc(null);
                toast('File deleted');
              })
              .catch((err: unknown) => toast(messageFromError(err), 'error'))
          }
        />
      )}
    </div>
  );
}

/** The code people show at a counter: large, monospaced, one tap to copy. */
function ConfirmationCode({
  code,
  copied,
  onCopy,
}: {
  code: string | null | undefined;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-ink-muted">Confirmation</span>
        <span
          className={`font-mono font-bold break-all ${(code?.length ?? 0) > 10 ? 'text-lg tracking-[0.04em]' : 'text-2xl tracking-[0.1em]'}`}
        >
          {code ?? '—'}
        </span>
      </span>
      {code && (
        <Button variant="secondary" onClick={onCopy}>
          <CopyIcon size={16} />
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col rounded-control bg-bg px-3 py-2.5">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </span>
  );
}

function DlRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-ink-muted">{k}</dt>
      <dd className="m-0 text-right font-semibold">{v}</dd>
    </>
  );
}
