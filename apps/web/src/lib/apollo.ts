import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { Kind, OperationTypeNode } from 'graphql';
import { createClient } from 'graphql-ws';

const httpLink = new HttpLink({ uri: '/graphql', credentials: 'include' });

const wsLink = new GraphQLWsLink(
  createClient({
    url: () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/graphql`,
    lazy: true,
    retryAttempts: Infinity,
  }),
);

const link = ApolloLink.split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return (
      def.kind === Kind.OPERATION_DEFINITION && def.operation === OperationTypeNode.SUBSCRIPTION
    );
  },
  wsLink,
  httpLink,
);

export const apolloClient = new ApolloClient({ link, cache: new InMemoryCache() });
