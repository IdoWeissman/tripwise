import { useMutation } from '@apollo/client/react';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { TextField, TimeInputField } from '../../components/Fields';
import { messageFromError } from '../../lib/errors';
import { AddActivityDocument, ItineraryDocument } from './queries';

interface Props {
  tripId: string;
  dayId: string | null;
  dayLabel: string;
  onClose: () => void;
}

export function AddActivityDialog({ tripId, dayId, dayLabel, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [location, setLocation] = useState('');
  const [cost, setCost] = useState('');
  const [add, { loading, error }] = useMutation(AddActivityDocument, {
    refetchQueries: [{ query: ItineraryDocument, variables: { id: tripId } }],
    awaitRefetchQueries: true,
    onCompleted: onClose,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void add({
      variables: {
        input: {
          tripId,
          dayId,
          title,
          startTime: startTime || null,
          location: location || null,
          costPerPerson: cost || null,
          scheduleNow: true,
        },
      },
    }).catch(() => {});
  };

  return (
    <Dialog open onClose={onClose} title={`Add activity · ${dayLabel}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="Title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Fado night"
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <TimeInputField label="Time" value={startTime} onChange={setStartTime} />
          <TextField
            label="Cost pp"
            inputMode="decimal"
            placeholder="0.00"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>
        <TextField
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Neighbourhood or address"
        />
        {error && (
          <p role="alert" className="text-sm text-negative-ink">
            {messageFromError(error)}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !title.trim()}>
            {loading ? 'Adding…' : 'Add to itinerary'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
