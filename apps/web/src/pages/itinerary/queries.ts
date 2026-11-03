import { graphql } from '../../gql';
import type { ItineraryQuery } from '../../gql/graphql';

export const ItineraryDocument = graphql(`
  query Itinerary($id: ID!) {
    trip(id: $id) {
      id
      currency
      days {
        id
        date
        position
        activities {
          ...ItineraryActivity
        }
      }
      unplannedActivities {
        ...ItineraryActivity
      }
    }
  }

  fragment ItineraryActivity on Activity {
    id
    title
    location
    startTime
    costPerPerson
    createdBy {
      id
      name
    }
  }
`);

export const MoveActivityDocument = graphql(`
  mutation MoveActivity($input: MoveActivityInput!) {
    moveActivity(input: $input) {
      id
      position
    }
  }
`);

export const AddActivityDocument = graphql(`
  mutation AddActivity($input: ProposeActivityInput!) {
    proposeActivity(input: $input) {
      id
    }
  }
`);

export type Day = NonNullable<ItineraryQuery['trip']>['days'][number];
export type ItineraryActivity = Day['activities'][number];
export const UNPLANNED = 'unplanned';
