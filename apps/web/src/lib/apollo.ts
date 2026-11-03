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

export const apolloClient = new ApolloClient({
  link,
  cache: new InMemoryCache(),
  defaultOptions: {
    // Apollo Client 4 defaults this to true, which flips `loading` back on for every
    // background refetch (live events, refetchQueries) and makes screens flash their
    // skeletons. Refetches should update the UI silently — design rules §1.8.
    watchQuery: { notifyOnNetworkStatusChange: false },
  },
});
