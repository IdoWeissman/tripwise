import { graphql } from '../gql';

export const MeDocument = graphql(`
  query Me {
    me {
      id
      name
      email
    }
  }
`);
