import { useMutation } from '@apollo/client/react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { SelectField, TextField } from '../components/Fields';
import { graphql } from '../gql';
import { messageFromError } from '../lib/errors';

const CreateTripDocument = graphql(`
  mutation CreateTrip($input: CreateTripInput!) {
    createTrip(input: $input) {
      id
    }
  }
`);

export function CreateTripDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [create, { loading, error }] = useMutation(CreateTripDocument, {
    refetchQueries: ['Trips'],
  });
  const datesInvalid = !!startDate && !!endDate && endDate < startDate;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await create({
      variables: { input: { name, destination, startDate, endDate, currency } },
    }).catch(() => null);
    if (res?.data) navigate(`/trips/${res.data.createTrip.id}/itinerary`);
  };

  return (
    <Dialog open onClose={onClose} title="New trip">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="Trip name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lisbon with the crew"
          autoFocus
        />
        <TextField
          label="Destination"
          required
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="City, country"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Start date"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <TextField
            label="End date"
            type="date"
            required
            min={startDate || undefined}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            error={datesInvalid ? 'End date must be after the start date.' : null}
          />
        </div>
        <SelectField
          label="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {['EUR', 'USD', 'GBP', 'ILS'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </SelectField>
        {error && (
          <p role="alert" className="text-sm text-negative-ink">
            {messageFromError(error)}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || datesInvalid}>
            {loading ? 'Creating…' : 'Create trip'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
