import type { CodegenConfig } from '@graphql-codegen/cli';

const prisma = '../../generated/prisma/client.js';

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
        },
      },
    },
  },
};

export default config;
