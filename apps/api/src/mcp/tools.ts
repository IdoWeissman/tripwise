import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/**
 * Runs one GraphQL operation as the token's user. Every tool goes through the same schema,
 * resolvers and `requireTripRole` checks as the web app, so an assistant can never do more
 * than its user could in the browser.
 */
export type RunGraphQL = <T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<T>;

/** A GraphQL error the assistant should see (bad input, no access, not found). */
export class ToolError extends Error {}

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const id = (what: string) => z.string().describe(`${what} id (from list_trips / get_trip)`);
const tripId = id('Trip');
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'Use "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"');
const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'A decimal string such as "45" or "45.50"')
  .describe('Decimal string, e.g. "45.50"');

const BOOKING_TYPES = [
  'FLIGHT',
  'STAY',
  'EVENT',
  'ATTRACTION',
  'TOUR',
  'TRANSPORT',
  'DINING',
  'OTHER',
] as const;

export interface TripwiseTool {
  name: string;
  title: string;
  description: string;
  /** Zod shape of the arguments (MCP turns it into JSON Schema; the assistant validates with it). */
  inputSchema: z.ZodRawShape;
  annotations: ToolAnnotations;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

// --- GraphQL selections. Member emails are deliberately never selected. ---

const BOOKING_SUMMARY = `id type status title provider startLocal endLocal timeZone location price currency missingFields`;
const BOOKING_FULL = `${BOOKING_SUMMARY} confirmationCode bookingUrl address travellers notes source
  segments { carrier number fromCode fromName toCode toName departLocal arriveLocal departTz arriveTz }
  attachments { fileName mimeType }
  createdBy { name }`;
const ACTIVITY = `id title description location startTime costPerPerson status voteCount viewerHasVoted createdBy { name }`;

interface Member {
  role: string;
  user: { id: string; name: string };
}
interface TripBasics {
  trip: {
    id: string;
    currency: string;
    timeZone: string;
    members: Member[];
    days: { id: string; date: string }[];
  } | null;
}

/**
 * Every Tripwise tool, bound to one user. Shared by the MCP server and the in-app assistant,
 * so both answer from the same queries and obey the same role checks.
 */
export function defineTools(gql: RunGraphQL, viewerId: string): TripwiseTool[] {
  const tools: TripwiseTool[] = [];
  function add<S extends z.ZodRawShape>(
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema?: S;
      annotations: ToolAnnotations;
    },
    run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
  ) {
    tools.push({
      name,
      ...config,
      inputSchema: config.inputSchema ?? {},
      run: run as TripwiseTool['run'],
    });
  }

  /** Members and days, used to turn names and dates into ids. */
  async function basics(id: string) {
    const { trip } = await gql<TripBasics>(
      `query($id: ID!) { trip(id: $id) { id currency timeZone members { role user { id name } } days { id date } } }`,
      { id },
    );
    if (!trip)
      throw new ToolError('Trip not found. Call list_trips to see the trips you can open.');
    return trip;
  }

  function dayId(trip: NonNullable<TripBasics['trip']>, date: string | undefined) {
    if (!date) return undefined;
    const day = trip.days.find((d) => d.date.slice(0, 10) === date);
    if (!day)
      throw new ToolError(
        `${date} is not one of the trip's days (${trip.days[0]?.date.slice(0, 10)} to ${trip.days.at(-1)?.date.slice(0, 10)}).`,
      );
    return day.id;
  }

  function memberId(trip: NonNullable<TripBasics['trip']>, who: string) {
    const needle = who.trim().toLowerCase();
    if (needle === 'me') return viewerId;
    const exact = trip.members.filter(
      (m) => m.user.id === who || m.user.name.toLowerCase() === needle,
    );
    const matches = exact.length
      ? exact
      : trip.members.filter((m) => m.user.name.toLowerCase().startsWith(needle));
    if (matches.length !== 1)
      throw new ToolError(
        `${matches.length ? 'Several members match' : 'No member matches'} "${who}". Members: ${trip.members.map((m) => m.user.name).join(', ')}.`,
      );
    return matches[0]!.user.id;
  }

  // ---------------------------------------------------------------- read tools

  add(
    'list_trips',
    {
      title: 'List trips',
      description:
        "Lists the user's trips with dates, destination, their role and the members. Start here to get trip ids.",
      annotations: READ,
    },
    async () =>
      gql(
        `{ trips { id name destination startDate endDate currency timeZone myRole members { role user { name } } } }`,
      ),
  );

  add(
    'get_trip',
    {
      title: 'Trip overview',
      description:
        "One trip at a glance: dates, members, days, what's up next, upcoming reminders, proposal counts and spending summary.",
      inputSchema: { tripId },
      annotations: READ,
    },
    async ({ tripId }) => {
      const { trip } = await gql<{ trip: unknown }>(
        `query($id: ID!) { trip(id: $id) {
          id name destination startDate endDate currency timeZone voteThreshold myRole
          members { role user { name } }
          days { date }
          upNext { startsAt booking { ${BOOKING_SUMMARY} } segment { carrier number fromCode toCode departLocal } }
          reminders(limit: 5) { title body fireAt }
          proposalCounts { proposed scheduled declined }
          bookingStats { total needsDetails }
          expenseSummary { total viewerPaid viewerBalance expenseCount }
        } }`,
        { id: tripId },
      );
      if (!trip) throw new ToolError('Trip not found.');
      return trip;
    },
  );

  add(
    'get_itinerary',
    {
      title: 'Itinerary',
      description:
        'The day-by-day plan: bookings, check-ins/outs and scheduled activities in time order. Pass a date for one day, or omit it for the whole trip.',
      inputSchema: {
        tripId,
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('One trip day, "YYYY-MM-DD"'),
      },
      annotations: READ,
    },
    async ({ tripId, date }) => {
      const trip = await basics(tripId);
      const days = date ? [{ id: dayId(trip, date)!, date }] : trip.days;
      const out = [];
      for (const day of days) {
        const { trip: t } = await gql<{ trip: { agenda: unknown[] } }>(
          `query($id: ID!, $day: ID!) { trip(id: $id) { agenda(dayId: $day) {
            kind time title subtitle booking { id type } activity { id }
          } } }`,
          { id: tripId, day: day.id },
        );
        out.push({ date: day.date.slice(0, 10), items: t.agenda });
      }
      return { timeZone: trip.timeZone, days: out };
    },
  );

  add(
    'list_bookings',
    {
      title: 'List bookings',
      description:
        'Flights, stays, tickets, tours, restaurants and transport saved on the trip. `missingFields` lists details still to fill in.',
      inputSchema: { tripId, type: z.enum(BOOKING_TYPES).optional().describe('Only this type') },
      annotations: READ,
    },
    async ({ tripId, type }) => {
      const { trip } = await gql<{ trip: { bookings: { type: string }[] } | null }>(
        `query($id: ID!) { trip(id: $id) { bookings { ${BOOKING_SUMMARY} } } }`,
        { id: tripId },
      );
      if (!trip) throw new ToolError('Trip not found.');
      return type ? trip.bookings.filter((b) => b.type === type) : trip.bookings;
    },
  );

  add(
    'get_booking',
    {
      title: 'Booking details',
      description:
        'Everything about one booking: confirmation code, legs, address, travellers, notes and attached document names.',
      inputSchema: { tripId, bookingId: id('Booking') },
      annotations: READ,
    },
    async ({ tripId, bookingId }) => {
      const { trip } = await gql<{ trip: { booking: unknown } | null }>(
        `query($id: ID!, $b: ID!) { trip(id: $id) { booking(id: $b) { ${BOOKING_FULL} } } }`,
        { id: tripId, b: bookingId },
      );
      if (!trip?.booking) throw new ToolError('Booking not found on this trip.');
      return trip.booking;
    },
  );

  add(
    'list_proposals',
    {
      title: 'List proposals',
      description:
        "Activity ideas the group is voting on, with vote counts and whether the user voted. A proposal is scheduled once it reaches the trip's vote threshold.",
      inputSchema: {
        tripId,
        status: z.enum(['PROPOSED', 'SCHEDULED', 'DECLINED']).default('PROPOSED'),
      },
      annotations: READ,
    },
    async ({ tripId, status }) => {
      const { trip } = await gql<{ trip: unknown }>(
        `query($id: ID!, $s: ActivityStatus) { trip(id: $id) { voteThreshold proposals(status: $s) { ${ACTIVITY} } } }`,
        { id: tripId, s: status },
      );
      if (!trip) throw new ToolError('Trip not found.');
      return trip;
    },
  );

  add(
    'get_expenses',
    {
      title: 'Expenses and balances',
      description:
        'Shared spending: totals, each member’s balance (positive = the group owes them), suggested settle-up payments and the expense list (newest first).',
      inputSchema: {
        tripId,
        limit: z.number().int().min(1).max(200).default(50).describe('Max expenses to list'),
      },
      annotations: READ,
    },
    async ({ tripId, limit }) => {
      const { trip } = await gql<{ trip: { currency: string; expenses: unknown[] } | null }>(
        `query($id: ID!) { trip(id: $id) {
          currency
          expenseSummary { total viewerPaid viewerBalance expenseCount }
          balances { user { name } amount }
          settlements { from { name } to { name } amount }
          expenses { id description category amount spentAt paidBy { name } viewerShare isSettlement }
        } }`,
        { id: tripId },
      );
      if (!trip) throw new ToolError('Trip not found.');
      return { ...trip, expenses: trip.expenses.slice(0, limit) };
    },
  );

  // ---------------------------------------------------------------- safe writes (no deletes)

  const segment = z.object({
    carrier: z.string().optional(),
    number: z.string().optional().describe('Flight or train number, e.g. "TP 1357"'),
    fromCode: z.string().optional().describe('IATA / station code'),
    fromName: z.string().optional(),
    toCode: z.string().optional(),
    toName: z.string().optional(),
    departLocal: localDateTime.describe('Local departure "YYYY-MM-DDTHH:mm"'),
    arriveLocal: localDateTime.optional(),
    departTz: z.string().optional().describe('IANA zone, defaults to the booking zone'),
    arriveTz: z.string().optional(),
  });

  add(
    'add_booking',
    {
      title: 'Add a booking',
      description:
        "Saves a booking the user already made (flight, hotel, ticket, tour, restaurant, transport). Times are local wall-clock times in the booking's zone (defaults to the trip's). Needs editor access.",
      inputSchema: {
        tripId,
        type: z.enum(BOOKING_TYPES),
        title: z.string().min(1).describe('Short title: "Tel Aviv ⇄ Lisbon", hotel or venue name'),
        provider: z.string().optional(),
        confirmationCode: z.string().optional(),
        startLocal: localDateTime.optional(),
        endLocal: localDateTime.optional(),
        timeZone: z.string().optional(),
        location: z.string().optional(),
        address: z.string().optional(),
        price: money.optional().describe('Total paid, decimal string'),
        currency: z.string().length(3).optional().describe('ISO code, e.g. "EUR"'),
        travellers: z.number().int().min(1).max(99).optional(),
        bookingUrl: z.string().url().optional(),
        notes: z.string().max(2000).optional(),
        segments: z.array(segment).max(12).optional().describe('Legs, for flights and trains'),
      },
      annotations: WRITE,
    },
    async ({ tripId, ...input }) => {
      const { createBooking } = await gql<{ createBooking: unknown }>(
        `mutation($t: ID!, $i: BookingInput!) { createBooking(tripId: $t, input: $i, source: MANUAL) { ${BOOKING_SUMMARY} } }`,
        { t: tripId, i: input },
      );
      return { saved: createBooking };
    },
  );

  add(
    'import_booking_text',
    {
      title: 'Import a confirmation',
      description:
        "Reads a pasted confirmation email or text with Tripwise's importer and returns the bookings it found. Nothing is saved unless `save` is true — show the user the result first.",
      inputSchema: {
        tripId,
        text: z.string().min(20).max(50_000).describe('The confirmation text'),
        save: z.boolean().default(false).describe('Save the bookings that were found'),
      },
      annotations: { ...WRITE, idempotentHint: false },
    },
    async ({ tripId, text, save }) => {
      const { parseBookingText: drafts } = await gql<{
        parseBookingText: (Record<string, unknown> & { source: string })[];
      }>(
        `mutation($t: ID!, $x: String!) { parseBookingText(tripId: $t, text: $x) {
          type title provider confirmationCode bookingUrl startLocal endLocal timeZone location address
          price currency travellers notes source
          segments { carrier number fromCode fromName toCode toName departLocal arriveLocal departTz arriveTz }
        } }`,
        { t: tripId, x: text },
      );
      if (!save || drafts.length === 0) return { saved: false, found: drafts };
      const saved = [];
      for (const { source, ...draft } of drafts) {
        const input = Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== null));
        const res = await gql<{ createBooking: unknown }>(
          `mutation($t: ID!, $i: BookingInput!, $s: BookingSource) { createBooking(tripId: $t, input: $i, source: $s) { ${BOOKING_SUMMARY} } }`,
          { t: tripId, i: input, s: source },
        );
        saved.push(res.createBooking);
      }
      return { saved: true, bookings: saved };
    },
  );

  add(
    'propose_activity',
    {
      title: 'Propose an activity',
      description:
        "Suggests an activity for the group to vote on (it doesn't go on the itinerary until enough members vote for it). Optionally pin a day and time.",
      inputSchema: {
        tripId,
        title: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
        location: z.string().max(200).optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Trip day "YYYY-MM-DD"'),
        startTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional()
          .describe('Local "HH:mm"'),
        costPerPerson: money.optional(),
      },
      annotations: WRITE,
    },
    async ({ tripId, date, ...rest }) => {
      const trip = await basics(tripId);
      const { proposeActivity } = await gql<{ proposeActivity: unknown }>(
        `mutation($i: ProposeActivityInput!) { proposeActivity(input: $i) { ${ACTIVITY} } }`,
        { i: { tripId, ...rest, dayId: dayId(trip, date), scheduleNow: false } },
      );
      return { proposed: proposeActivity };
    },
  );

  add(
    'vote',
    {
      title: 'Vote on a proposal',
      description:
        "Sets the user's vote on a proposed activity. Safe to repeat: voting twice doesn't undo the vote. Use `vote: false` to withdraw it.",
      inputSchema: {
        tripId,
        activityId: id('Activity (from list_proposals)'),
        vote: z.boolean().default(true),
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ tripId, activityId, vote }) => {
      const { trip } = await gql<{
        trip: { proposals: { id: string; viewerHasVoted: boolean }[] } | null;
      }>(
        `query($id: ID!) { trip(id: $id) { proposals(status: PROPOSED) { id viewerHasVoted } } }`,
        {
          id: tripId,
        },
      );
      if (!trip) throw new ToolError('Trip not found.');
      const current = trip.proposals.find((p) => p.id === activityId);
      if (!current)
        throw new ToolError(
          'That activity is not an open proposal on this trip (it may be scheduled already).',
        );
      if (current.viewerHasVoted === vote) return { changed: false, viewerHasVoted: vote };
      const { toggleVote } = await gql<{ toggleVote: unknown }>(
        `mutation($a: ID!) { toggleVote(activityId: $a) { ${ACTIVITY} } }`,
        { a: activityId },
      );
      return { changed: true, activity: toggleVote };
    },
  );

  add(
    'add_expense',
    {
      title: 'Add an expense',
      description:
        'Records a shared expense split equally. The payer defaults to the user ("me"); the split defaults to every member. Members can be given by name. Needs editor access.',
      inputSchema: {
        tripId,
        description: z.string().min(1).max(200),
        amount: money,
        category: z.string().max(40).optional().describe('e.g. Food, Transport, Stay, Activities'),
        paidBy: z.string().default('me').describe('Member name or "me"'),
        splitBetween: z
          .array(z.string())
          .min(1)
          .optional()
          .describe('Member names (or "me"); omit to split between everyone'),
        spentAt: z.string().datetime({ offset: true }).optional(),
      },
      annotations: WRITE,
    },
    async ({ tripId, description, amount, category, paidBy, splitBetween, spentAt }) => {
      const trip = await basics(tripId);
      const ids = splitBetween
        ? [...new Set(splitBetween.map((who) => memberId(trip, who)))]
        : trip.members.map((m) => m.user.id);
      const { addExpense } = await gql<{ addExpense: unknown }>(
        `mutation($i: AddExpenseInput!) { addExpense(input: $i) {
          id description category amount spentAt paidBy { name } splits { user { name } amount }
        } }`,
        {
          i: {
            tripId,
            description,
            amount,
            category,
            paidById: memberId(trip, paidBy),
            splitMethod: 'EQUAL',
            splits: ids.map((userId) => ({ userId })),
            spentAt,
          },
        },
      );
      return { added: addExpense, currency: trip.currency };
    },
  );
  return tools;
}

const json = (data: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

/** Registers the tools on an MCP server. Expected failures become tool errors, not protocol errors. */
export function registerTools(server: McpServer, gql: RunGraphQL, viewerId: string): void {
  for (const t of defineTools(gql, viewerId)) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: t.annotations,
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        try {
          return json(await t.run(args));
        } catch (err) {
          if (err instanceof ToolError)
            return { isError: true, content: [{ type: 'text', text: err.message }] };
          throw err;
        }
      },
    );
  }
}
