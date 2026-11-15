export type BookingTypeName =
  'FLIGHT' | 'STAY' | 'EVENT' | 'ATTRACTION' | 'TOUR' | 'TRANSPORT' | 'DINING' | 'OTHER';

export interface SegmentDraft {
  carrier?: string | null;
  number?: string | null;
  fromCode?: string | null;
  fromName?: string | null;
  toCode?: string | null;
  toName?: string | null;
  departLocal: string;
  arriveLocal?: string | null;
  departTz?: string | null;
  arriveTz?: string | null;
}

/** A booking the importer believes it found. Nothing is saved until the user confirms. */
export interface Draft {
  type: BookingTypeName;
  title: string;
  provider?: string | null;
  confirmationCode?: string | null;
  bookingUrl?: string | null;
  startLocal?: string | null;
  endLocal?: string | null;
  timeZone?: string | null;
  location?: string | null;
  address?: string | null;
  price?: string | null;
  currency?: string | null;
  travellers?: number | null;
  notes?: string | null;
  segments: SegmentDraft[];
  /** Field names that came from the source (shown as "Read from file"). */
  fromSource: string[];
  /**
   * Field names whose value couldn't be verified against the document (the model's quote wasn't
   * found, or a sanity check failed). Shown as "Check this" in the review step.
   */
  toCheck?: string[];
}

/** Marks every non-empty field as read from the source. */
export function withProvenance(
  input: Omit<Draft, 'fromSource'> & { fromSource?: string[] },
): Draft {
  const { fromSource: _previous, toCheck = [], ...d } = input;
  const fromSource = Object.entries(d)
    .filter(
      ([k, v]) => k !== 'type' && k !== 'segments' && v !== null && v !== undefined && v !== '',
    )
    .map(([k]) => k);
  if (d.segments.length) fromSource.push('segments');
  return { ...d, fromSource, toCheck };
}
