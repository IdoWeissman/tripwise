import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon } from './Icons';
import { PortalContainerContext } from './PortalContainer';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Full-screen sheet on phones, centered card from `sm` up. */
  wide?: boolean;
  /** Two-pane flows (e.g. reviewing imported bookings). */
  extraWide?: boolean;
}

/** Native <dialog>: focus trapping, Esc and backdrop come from the browser. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
  extraWide = false,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [container, setContainer] = useState<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open]);

  return (
    <dialog
      ref={(el) => {
        ref.current = el;
        setContainer(el);
      }}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={`m-0 h-full max-h-none w-full max-w-none bg-surface p-0 text-ink backdrop:bg-ink/40 sm:m-auto sm:h-fit sm:max-h-[90vh] sm:overflow-hidden sm:rounded-card sm:border sm:border-border ${
        extraWide ? 'sm:max-w-[1000px]' : wide ? 'sm:max-w-[560px]' : 'sm:max-w-[440px]'
      }`}
    >
      {open && (
        <PortalContainerContext.Provider value={container}>
          {/* Phones: full-height sheet. From sm: as tall as the content, capped at 90vh minus the 2px border so the dialog itself never scrolls; only the body does. */}
          <div className="flex h-full flex-col sm:h-auto sm:max-h-[calc(90vh-2px)]">
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="text-[17px] font-bold">{title}</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex size-11 items-center justify-center rounded-control text-ink-secondary hover:bg-surface-muted"
              >
                <CloseIcon />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          </div>
        </PortalContainerContext.Provider>
      )}
    </dialog>
  );
}
