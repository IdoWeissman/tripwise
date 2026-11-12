import { useMutation } from '@apollo/client/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { DateInputField, SelectField, TextField } from '../../components/Fields';
import { graphql } from '../../gql';
import { messageFromError } from '../../lib/errors';

const CreateTripDocument = graphql(`
  mutation CreateTrip($input: CreateTripInput!) {
    createTrip(input: $input) {
      id
    }
  }
`);

const CURRENCIES = [
  { value: 'EUR', label: 'EUR · Euro' },
  { value: 'USD', label: 'USD · US dollar' },
  { value: 'GBP', label: 'GBP · British pound' },
  { value: 'ILS', label: 'ILS · Israeli shekel' },
];

/**
 * The trip fields, validation and create call — shared by the New trip dialog and /welcome.
 * `actions` renders the buttons; the submit button must be `type="submit"`.
 */
export function TripForm({
  onCreated,
  actions,
}: {
  onCreated: (tripId: string) => void;
  actions: (state: { loading: boolean; disabled: boolean }) => ReactNode;
}) {
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
    // A failed create keeps everything typed; the error shows below the fields.
    const res = await create({
      variables: { input: { name, destination, startDate, endDate, currency } },
    }).catch(() => null);
    if (res?.data) onCreated(res.data.createTrip.id);
  };

  return (
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
        <DateInputField label="Start date" value={startDate} onChange={setStartDate} />
        <DateInputField
          label="End date"
          min={startDate || undefined}
          value={endDate}
          onChange={setEndDate}
          error={datesInvalid ? 'End date must be after the start date.' : null}
        />
      </div>
      <SelectField
        label="Currency"
        value={currency}
        onValueChange={setCurrency}
        options={CURRENCIES}
      />
      {error && (
        <p role="alert" className="text-sm text-negative-ink">
          {messageFromError(error)}
        </p>
      )}
      {actions({ loading, disabled: loading || datesInvalid || !startDate || !endDate })}
    </form>
  );
}
