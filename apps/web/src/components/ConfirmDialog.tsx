import { Button } from './Button';
import { Dialog } from './Dialog';

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Destructive actions always ask first — design rules §1.5. */
export function ConfirmDialog({ title, body, confirmLabel, busy, onConfirm, onClose }: Props) {
  return (
    <Dialog open onClose={onClose} title={title}>
      <p className="text-sm text-ink-secondary">{body}</p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="bg-negative-ink text-white hover:bg-negative"
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
