import { useApolloClient, useMutation } from '@apollo/client/react';
import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { TextAreaField } from '../../components/Fields';
import { CloseIcon, UploadIcon } from '../../components/Icons';
import { useToast } from '../../components/Toast';
import type { BookingSource } from '../../gql/graphql';
import { messageFromError } from '../../lib/errors';
import {
  ACCEPT,
  BOOKING_TYPES,
  fileExt,
  SOURCE_LABEL,
  uploadBookingFile,
  type BookingDraft,
} from '../../lib/bookings';
import { useTrip } from '../../lib/trip';
import { BookingForm } from './BookingForm';
import { formProblems, formStateFrom, toBookingInput, type BookingFormState } from './formState';
import { CreateBookingDocument, DeleteAttachmentDocument, ParseTextDocument } from './queries';

interface FileItem {
  key: string;
  name: string;
  ext: string;
  status: 'reading' | 'done' | 'error';
  message: string;
  attachmentId?: string;
}

interface ReviewItem {
  key: string;
  form: BookingFormState;
  source: BookingSource;
  sourceName: string | null;
  attachmentId: string | null;
}

let seq = 0;
const nextKey = () => `k${++seq}`;

/** What the importer found, in words: "Found 2 flights · 4 passengers". */
function foundLabel(drafts: BookingDraft[], kind: string) {
  if (drafts.length === 0) {
    return kind === 'IMAGE'
      ? 'Saved as a photo — add the details'
      : 'No booking found — add the details';
  }
  const counts = new Map<string, number>();
  for (const d of drafts) counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
  const parts = [...counts].map(([type, n]) => {
    const label = BOOKING_TYPES[type as BookingDraft['type']].label.toLowerCase();
    return `${n} ${label}${n === 1 ? '' : 's'}`;
  });
  const people = drafts[0]?.travellers;
  return `Found ${parts.join(', ')}${people ? ` · ${people} people` : ''}`;
}

/** Add booking: upload / paste → review → save. Design canvas "Add booking" + "Review bookings". */
export function AddBookingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { trip } = useTrip();
  const client = useApolloClient();
  const toast = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'collect' | 'review'>('collect');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parse, { loading: parsing }] = useMutation(ParseTextDocument);
  const [create] = useMutation(CreateBookingDocument);
  const [deleteAttachment] = useMutation(DeleteAttachmentDocument);

  const reset = () => {
    setStep('collect');
    setFiles([]);
    setItems([]);
    setCurrent(0);
    setPasteOpen(false);
    setPasteText('');
  };

  const toItems = (
    drafts: BookingDraft[],
    source: BookingSource,
    sourceName: string | null,
    attachmentId: string | null,
  ) =>
    drafts.map<ReviewItem>((d, i) => ({
      key: nextKey(),
      form: formStateFrom(d, trip.currency),
      source,
      sourceName,
      // One file can hold several bookings; the document is attached to the first.
      attachmentId: i === 0 ? attachmentId : null,
    }));

  async function addFiles(list: FileList | File[]) {
    const picked = [...list];
    const entries = picked.map<FileItem>((f) => ({
      key: nextKey(),
      name: f.name,
      ext: fileExt(f.name, f.type),
      status: 'reading',
      message: 'Reading…',
    }));
    setFiles((prev) => [...prev, ...entries]);
    await Promise.all(
      picked.map(async (file, i) => {
        const key = entries[i]!.key;
        try {
          const res = await uploadBookingFile(trip.id, file);
          const drafts = res.drafts.length
            ? res.drafts
            : [
                {
                  type: 'OTHER',
                  title: file.name.replace(/\.[^.]+$/, ''),
                  segments: [],
                  fromSource: [],
                  source: res.kind,
                } as BookingDraft,
              ];
          setItems((prev) => [...prev, ...toItems(drafts, res.kind, file.name, res.attachment.id)]);
          setFiles((prev) =>
            prev.map((f) =>
              f.key === key
                ? {
                    ...f,
                    status: 'done',
                    message: foundLabel(res.drafts, res.kind),
                    attachmentId: res.attachment.id,
                  }
                : f,
            ),
          );
        } catch (err) {
          setFiles((prev) =>
            prev.map((f) =>
              f.key === key ? { ...f, status: 'error', message: messageFromError(err) } : f,
            ),
          );
        }
      }),
    );
  }

  async function readPasted() {
    try {
      const { data } = await parse({ variables: { tripId: trip.id, text: pasteText } });
      const drafts = (data?.parseBookingText ?? []).map(
        (d) => ({ ...d, segments: d.segments ?? [] }) as BookingDraft,
      );
      if (drafts.length === 0) {
        toast("We couldn't find a booking in that text. You can enter it manually.", 'error');
        return;
      }
      setItems((prev) => [...prev, ...toItems(drafts, 'TEXT', 'Pasted email', null)]);
      setFiles((prev) => [
        ...prev,
        {
          key: nextKey(),
          name: 'Pasted email text',
          ext: 'TEXT',
          status: 'done',
          message: foundLabel(drafts, 'TEXT'),
        },
      ]);
      setPasteText('');
      setPasteOpen(false);
    } catch (err) {
      toast(messageFromError(err), 'error');
    }
  }

  function removeFile(f: FileItem) {
    setFiles((prev) => prev.filter((x) => x.key !== f.key));
    if (f.attachmentId) {
      setItems((prev) =>
        prev.filter((it) => it.attachmentId !== f.attachmentId && it.sourceName !== f.name),
      );
      void deleteAttachment({ variables: { id: f.attachmentId } }).catch(() => undefined);
    }
  }

  function enterManually() {
    setItems((prev) => [
      ...prev,
      {
        key: nextKey(),
        form: formStateFrom({ type: 'FLIGHT', title: '' }, trip.currency),
        source: 'MANUAL',
        sourceName: null,
        attachmentId: null,
      },
    ]);
    setCurrent(items.length);
    setStep('review');
  }

  /** Closing without saving removes the files we uploaded for this dialog. */
  function cancel() {
    for (const f of files)
      if (f.attachmentId)
        void deleteAttachment({ variables: { id: f.attachmentId } }).catch(() => undefined);
    reset();
    onClose();
  }

  async function saveAll() {
    setSaving(true);
    const ids: string[] = [];
    try {
      for (const it of items) {
        const { data } = await create({
          variables: {
            tripId: trip.id,
            input: toBookingInput(it.form),
            source: it.source,
            attachmentIds: it.attachmentId ? [it.attachmentId] : [],
          },
        });
        if (data?.createBooking.id) ids.push(data.createBooking.id);
      }
      await client.refetchQueries({ include: 'active' });
      toast(ids.length === 1 ? 'Booking added' : `${ids.length} bookings added`);
      reset();
      onClose();
      if (ids.length === 1) void navigate(`/trips/${trip.id}/bookings/${ids[0]}`);
    } catch (err) {
      // Keep what wasn't saved so nothing is lost.
      setItems((prev) => prev.slice(ids.length));
      setCurrent(0);
      toast(messageFromError(err, "Some bookings couldn't be saved. Please try again."), 'error');
      if (ids.length) await client.refetchQueries({ include: 'active' });
    } finally {
      setSaving(false);
    }
  }

  const reading = files.some((f) => f.status === 'reading');
  const problems = items.map((it) => formProblems(it.form));
  const blocked = problems.filter((p) => p.includes('title')).length;
  const incomplete = problems.filter((p) => p.length > 0).length;
  const cur = items[current];

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  };

  const footer =
    'sticky -bottom-5 -mx-5 -mb-5 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4';

  return (
    <Dialog
      open={open}
      onClose={cancel}
      title={step === 'collect' ? 'Add booking' : 'Review bookings'}
      wide={step === 'collect'}
      extraWide={step === 'review'}
    >
      {step === 'collect' ? (
        <div className="flex flex-col gap-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-card border-[1.5px] border-dashed px-5 py-8 text-center ${
              dragging
                ? 'border-accent bg-accent-tint'
                : 'border-border-input bg-bg hover:bg-surface-muted'
            }`}
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent-tint text-accent">
              <UploadIcon size={22} />
            </span>
            <span className="text-[15px] font-semibold">
              Drop confirmation emails, PDFs or screenshots
            </span>
            <span className="text-[13px] text-ink-muted">
              or <span className="font-semibold text-accent">choose files</span> · PDF, EML, PNG,
              JPG · up to 15 MB each
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              aria-expanded={pasteOpen}
              onClick={() => setPasteOpen((v) => !v)}
            >
              Paste email text
            </Button>
            <Button
              variant="secondary"
              className="sm:hidden"
              onClick={() => cameraRef.current?.click()}
            >
              Take a photo
            </Button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <Button variant="ghost" onClick={enterManually}>
              Enter manually
            </Button>
          </div>

          {pasteOpen && (
            <div className="flex flex-col gap-3">
              <TextAreaField
                label="Confirmation email"
                rows={5}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the whole email, including the booking reference"
              />
              <Button
                variant="secondary"
                className="self-start"
                disabled={pasteText.trim().length < 20 || parsing}
                onClick={() => void readPasted()}
              >
                {parsing ? 'Reading…' : 'Read text'}
              </Button>
            </div>
          )}

          {files.length > 0 && (
            <ul aria-label="Files" className="flex flex-col gap-2">
              {files.map((f) => (
                <li
                  key={f.key}
                  className="flex items-center gap-3 rounded-[14px] border border-border p-3"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-[42px] w-[34px] shrink-0 items-center justify-center rounded-chip bg-surface-muted text-[10px] font-bold text-ink-secondary"
                  >
                    {f.ext}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold">{f.name}</span>
                    <span
                      role={f.status === 'error' ? 'alert' : undefined}
                      className={`text-xs font-semibold ${
                        f.status === 'error'
                          ? 'text-negative-ink'
                          : f.status === 'reading'
                            ? 'text-ink-muted'
                            : f.message.startsWith('Found')
                              ? 'text-accent-strong'
                              : 'text-attention-ink'
                      }`}
                    >
                      {f.message}
                    </span>
                  </span>
                  {f.status !== 'reading' && (
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => removeFile(f)}
                      className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted"
                    >
                      <CloseIcon size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[13px] text-ink-muted">
            Files are private to this trip. Tripwise reads the booking details airlines and hotels
            include in their emails and PDFs; you check everything before it's saved.
          </p>

          <div className={footer}>
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            <Button disabled={items.length === 0 || reading} onClick={() => setStep('review')}>
              {reading
                ? 'Reading…'
                : items.length === 0
                  ? 'Review bookings'
                  : `Review ${items.length} booking${items.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-ink-muted">
            Check what we read before it's added to the trip.
          </p>
          <div className="flex flex-col gap-5 md:flex-row">
            <nav
              aria-label="Found bookings"
              className="flex shrink-0 gap-2 overflow-x-auto md:w-[240px] md:flex-col md:overflow-visible"
            >
              {items.map((it, i) => {
                const t = BOOKING_TYPES[it.form.type];
                const p = problems[i]!;
                return (
                  <button
                    key={it.key}
                    type="button"
                    aria-current={i === current ? 'true' : undefined}
                    onClick={() => setCurrent(i)}
                    className={`flex min-h-14 min-w-[200px] items-center gap-3 rounded-[14px] border px-3 py-2 text-left md:min-w-0 ${
                      i === current
                        ? 'border-accent bg-accent-tint'
                        : 'border-border bg-surface hover:bg-surface-muted'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-9 shrink-0 items-center justify-center rounded-[9px] text-[9px] font-bold ${t.chip}`}
                    >
                      {t.code}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">
                        {it.form.title || 'Untitled booking'}
                      </span>
                      <span
                        className={`text-xs font-semibold ${p.length ? 'text-attention-ink' : 'text-accent-strong'}`}
                      >
                        {p.length ? `Needs ${p.join(' and ')}` : 'Ready'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>

            {cur && (
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-bg px-4 py-3">
                  <span className="text-sm text-ink-secondary">
                    {SOURCE_LABEL[cur.source]}
                    {cur.sourceName ? ` · ${cur.sourceName}` : ''}
                  </span>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setItems((prev) => prev.filter((x) => x.key !== cur.key));
                      setCurrent((c) => Math.max(0, Math.min(c, items.length - 2)));
                    }}
                  >
                    Remove
                  </Button>
                </div>
                <BookingForm
                  value={cur.form}
                  onChange={(form) =>
                    setItems((prev) => prev.map((x) => (x.key === cur.key ? { ...x, form } : x)))
                  }
                  showProvenance={cur.source !== 'MANUAL'}
                  tripTimeZone={trip.timeZone}
                />
              </div>
            )}
            {!cur && (
              <p className="flex-1 text-sm text-ink-muted">
                Nothing left to review. Go back to add a file.
              </p>
            )}
          </div>

          <div className={footer}>
            <span className="text-sm text-ink-muted" aria-live="polite">
              {blocked
                ? `${blocked} need${blocked === 1 ? 's' : ''} a title`
                : incomplete
                  ? `${items.length - incomplete} ready · ${incomplete} can be finished later`
                  : `${items.length} ready`}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setStep('collect')}>
                Back
              </Button>
              <Button
                disabled={saving || items.length === 0 || blocked > 0}
                onClick={() => void saveAll()}
              >
                {saving
                  ? 'Saving…'
                  : `Save ${items.length} booking${items.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
