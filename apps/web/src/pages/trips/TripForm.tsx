import { useMutation } from '@apollo/client/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { DateInputField, SelectField, TextField } from '../../components/Fields';
import { PlaceField, type PlaceOption } from '../../components/PlaceField';
import { graphql } from '../../gql';
import { currencyOptions } from '../../lib/currencies';
import { messageFromError } from '../../lib/errors';

const CreateTripDocument = graphql(`
  mutation CreateTrip($input: CreateTripInput!) {
    createTrip(input: $input) {
      id
    }
  }
`);

const CURRENCIES = currencyOptions();

/** "Japan Time" for Asia/Tokyo — the zone people know, not its database id. */
const zoneName = (timeZone: string) => {
  try {
    const part = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
};

/** The viewer's own zone — the best guess when the destination is free text. */
const viewerZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

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
  // The picked place (zone + currency); typing over its name drops it back to free text.
  const [place, setPlace] = useState<PlaceOption | null>(null);
  const [currencyNote, setCurrencyNote] = useState<string | null>(null);

  const pickPlace = (p: PlaceOption) => {
    setDestination(p.destination);
    setPlace(p);
    if (p.currency) {
      setCurrency(p.currency);
      setCurrencyNote(`Set from ${p.country} — change it if you'll pay in something else.`);
    }
  };
  const [create, { loading, error }] = useMutation(CreateTripDocument, {
    refetchQueries: ['Trips'],
  });
  const datesInvalid = !!startDate && !!endDate && endDate < startDate;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // A failed create keeps everything typed; the error shows below the fields.
    const res = await create({
      variables: {
        input: {
          name,
          destination,
          startDate,
          endDate,
          currency,
          // a picked place knows its zone; free text falls back to the organiser's own
          timeZone: place?.timeZone ?? viewerZone(),
        },
      },
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
      <PlaceField
        label="Destination"
        required
        value={destination}
        onChange={(text) => {
          setDestination(text);
          if (place && text !== place.destination) setPlace(null);
        }}
        onPick={pickPlace}
        placeholder="City or country"
        hint={place ? `Times on this trip use ${zoneName(place.timeZone)}.` : undefined}
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
        onValueChange={(c) => {
          setCurrency(c);
          setCurrencyNote(null);
        }}
        options={CURRENCIES}
        hint={currencyNote ?? undefined}
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
