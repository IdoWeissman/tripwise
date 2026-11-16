import { graphql } from '../../gql';
import type { DayPlansQuery, ItineraryQuery } from '../../gql/graphql';

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
        bookings {
          id
          type
          title
          provider
          startLocal
          endLocal
          confirmationCode
          missingFields
          place {
            id
            lat
            lng
          }
          segments {
            id
            number
            fromCode
            toCode
            departLocal
            arriveLocal
          }
        }
        stay {
          night
          nights
          isCheckIn
          isCheckOut
          booking {
            id
            title
            startLocal
            endLocal
            place {
              id
              lat
              lng
            }
          }
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
    durationMinutes
    costPerPerson
    createdBy {
      id
      name
    }
    booking {
      id
      type
      confirmationCode
      place {
        id
        lat
        lng
      }
    }
    place {
      id
      lat
      lng
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

/** Day plans load after the board, so the board never waits on travel times or opening hours. */
export const DayPlansDocument = graphql(`
  query DayPlans($id: ID!) {
    trip(id: $id) {
      id
      pace
      getAround
      days {
        id
        plan {
          ...DayPlanFields
        }
      }
    }
  }

  fragment DayPlanFields on DayPlan {
    stops {
      activity {
        id
        title
        startTime
        durationMinutes
        booking {
          id
        }
      }
      start
      end
      durationMinutes
      durationEstimated
      travel {
        ...Leg
      }
    }
    issues {
      kind
      message
      activityId
      blocking
    }
    travelMinutes
    startTime
    endTime
    backToStay {
      ...Leg
    }
    travelEstimated
    freeFrom
    freeUntil
  }

  fragment Leg on TravelLeg {
    minutes
    mode
    estimated
  }
`);

export const DayArrangementDocument = graphql(`
  query DayArrangement($tripId: ID!, $dayId: ID!) {
    trip(id: $tripId) {
      id
      day(id: $dayId) {
        id
        arrangement {
          better
          savedMinutes
          reason
          plan {
            ...DayPlanFields
          }
        }
      }
    }
  }
`);

export const ArrangeDayDocument = graphql(`
  mutation ArrangeDay($dayId: ID!) {
    arrangeDay(dayId: $dayId) {
      id
    }
  }
`);

export const SetActivityTimingDocument = graphql(`
  mutation SetActivityTiming($activityId: ID!, $startTime: String, $durationMinutes: Int) {
    setActivityTiming(
      activityId: $activityId
      startTime: $startTime
      durationMinutes: $durationMinutes
    ) {
      id
      startTime
      durationMinutes
    }
  }
`);

export const UpdateTripPlanningDocument = graphql(`
  mutation UpdateTripPlanning($tripId: ID!, $pace: Pace!, $getAround: GetAround!) {
    updateTripPlanning(tripId: $tripId, pace: $pace, getAround: $getAround) {
      id
      pace
      getAround
    }
  }
`);

export type DayPlan = NonNullable<DayPlansQuery['trip']>['days'][number]['plan'];
export type Day = NonNullable<ItineraryQuery['trip']>['days'][number];
export type ItineraryActivity = Day['activities'][number];
export const UNPLANNED = 'unplanned';
