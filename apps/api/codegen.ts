import type { CodegenConfig } from '@graphql-codegen/cli';

const prisma = '../../generated/prisma/client.js';
const models = '../models.js';

const config: CodegenConfig = {
  schema: 'schema.graphql',
  generates: {
    'src/graphql/__generated__/resolvers-types.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        useTypeImports: true,
        enumsAsTypes: true,
        useIndexSignature: true,
        contextType: '../context.js#Context',
        scalars: { DateTime: 'Date', Date: 'Date' },
        mappers: {
          User: `${prisma}#User as UserModel`,
          Trip: `${prisma}#Trip as TripModel`,
          TripMember: `${prisma}#TripMember as TripMemberModel`,
          Day: `${prisma}#Day as DayModel`,
          Activity: `${prisma}#Activity as ActivityModel`,
          Expense: `${models}#ExpenseModel`,
          ExpenseSplit: `${models}#ExpenseSplitModel`,
          Balance: `${models}#BalanceModel`,
          Settlement: `${models}#SettlementModel`,
          ExpenseSummary: `${models}#ExpenseSummaryModel`,
          ProposalCounts: `${models}#ProposalCountsModel`,
          Booking: `${models}#BookingModel`,
          BookingSegment: `${prisma}#BookingSegment as BookingSegmentModel`,
          Attachment: `${prisma}#Attachment as AttachmentModel`,
          UpNext: `${models}#UpNextModel`,
          AgendaItem: `${models}#AgendaItemModel`,
          StayNight: `${models}#StayNightModel`,
          Reminder: `${models}#ReminderModel`,
          ReminderPreferences: `${prisma}#ReminderPreference as ReminderPreferencesModel`,
          BookingDraft: `${models}#BookingDraftModel`,
          SegmentDraft: `${models}#SegmentDraftModel`,
        },
      },
    },
  },
};

export default config;
