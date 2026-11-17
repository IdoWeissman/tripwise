import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { SlidersIcon } from '../../components/Icons';
import { Segmented } from '../../components/Segmented';
import { useToast } from '../../components/Toast';
import type { GetAround, Pace } from '../../gql/graphql';
import { messageFromError } from '../../lib/errors';
import { GET_AROUND, PACES, getAroundLabel, paceLabel } from './planText';
import { UpdateTripPlanningDocument } from './queries';

/**
 * "Balanced pace · Walk & transit": the trip's planning settings (rules §2 · 03 Pace). The day
 * checks and "Arrange this day" follow them. Editors change them; everyone sees them.
 */
export function PlanningSettings({
  tripId,
  pace,
  getAround,
  canEdit,
  onChanged,
  compact = false,
}: {
  tripId: string;
  pace: Pace;
  getAround: GetAround;
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
  /** Phones: just the pace, so the toolbar stays one row; the full setting is read out. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const full = `${paceLabel(pace)} pace · ${getAroundLabel(getAround)}`;
  return (
    <>
      <Button
        variant="secondary"
        className={`min-w-0 text-sm ${compact ? 'px-3!' : 'px-4'}`}
        onClick={() => setOpen(true)}
        aria-label={`Day planning: ${full}. ${canEdit ? 'Change' : 'See'} how days are planned`}
      >
        <SlidersIcon size={16} className="shrink-0" />
        <span className="truncate">{compact ? `${paceLabel(pace)} pace` : full}</span>
      </Button>
      {open && (
        <SettingsDialog
          tripId={tripId}
          pace={pace}
          getAround={getAround}
          canEdit={canEdit}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function SettingsDialog({
  tripId,
  canEdit,
  onClose,
  onChanged,
  ...initial
}: {
  tripId: string;
  pace: Pace;
  getAround: GetAround;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [pace, setPace] = useState(initial.pace);
  const [getAround, setGetAround] = useState(initial.getAround);
  const [save, { loading }] = useMutation(UpdateTripPlanningDocument);
  const detail = PACES.find((p) => p.value === pace)!.detail;

  const submit = async () => {
    try {
      await save({ variables: { tripId, pace, getAround } });
      await onChanged();
      onClose();
    } catch (err) {
      toast(messageFromError(err, "Couldn't save the planning settings."), 'error');
    }
  };

  return (
    <Dialog open onClose={onClose} title="Day planning">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-ink-secondary">
          The day checks and “Arrange this day” follow these for the whole trip.
        </p>
        <fieldset className="flex flex-col gap-2" disabled={!canEdit}>
          <legend className="mb-2 text-sm font-bold">Pace</legend>
          <Segmented
            kind="radio"
            label="Pace"
            value={pace}
            onChange={canEdit ? setPace : () => undefined}
            options={PACES.map(({ value, label }) => ({ value, label }))}
          />
          <p className="text-meta text-ink-muted figures">{detail}</p>
        </fieldset>
        <fieldset className="flex flex-col gap-2" disabled={!canEdit}>
          <legend className="mb-2 text-sm font-bold">Getting around</legend>
          <Segmented
            kind="radio"
            label="Getting around"
            value={getAround}
            onChange={canEdit ? setGetAround : () => undefined}
            options={GET_AROUND}
          />
        </fieldset>
        {canEdit ? (
          <Button type="submit" disabled={loading} className="self-start">
            {loading ? 'Saving…' : 'Save'}
          </Button>
        ) : (
          <p className="text-meta text-ink-muted">Only editors and owners can change these.</p>
        )}
      </form>
    </Dialog>
  );
}
