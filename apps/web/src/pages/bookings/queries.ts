import { graphql } from '../../gql';
import type { BookingDetailQuery, BookingsQuery } from '../../gql/graphql';

export const BookingsDocument = graphql(`
  query Bookings($id: ID!) {
    trip(id: $id) {
      id
      bookings {
        ...BookingSummary
      }
    }
  }

  fragment BookingSummary on Booking {
    id
    type
    status
    title
    provider
    confirmationCode
    bookingUrl
    startLocal
    endLocal
    price
    currency
    travellers
    missingFields
    segments {
      id
      number
      fromCode
      fromName
      toCode
      toName
      departLocal
      arriveLocal
    }
    attachments {
      id
    }
  }
`);

export const BookingDetailDocument = graphql(`
  query BookingDetail($id: ID!, $bookingId: ID!) {
    trip(id: $id) {
      id
      booking(id: $bookingId) {
        id
        type
        status
        source
        title
        provider
        confirmationCode
        bookingUrl
        startsAt
        endsAt
        startLocal
        endLocal
        timeZone
        location
        address
        price
        currency
        travellers
        notes
        missingFields
        createdAt
        createdBy {
          id
          name
        }
        segments {
          id
          position
          carrier
          number
          fromCode
          fromName
          toCode
          toName
          departsAt
          arrivesAt
          departLocal
          arriveLocal
          departTz
          arriveTz
        }
        attachments {
          id
          fileName
          mimeType
          sizeBytes
          url
          uploadedBy {
            id
            name
          }
        }
      }
      reminders(limit: 50) {
        key
        kind
        title
        body
        fireAt
        booking {
          id
        }
      }
    }
  }
`);

export const CreateBookingDocument = graphql(`
  mutation CreateBooking(
    $tripId: ID!
    $input: BookingInput!
    $source: BookingSource
    $attachmentIds: [ID!]
  ) {
    createBooking(tripId: $tripId, input: $input, source: $source, attachmentIds: $attachmentIds) {
      id
    }
  }
`);

export const UpdateBookingDocument = graphql(`
  mutation UpdateBooking($id: ID!, $input: BookingInput!) {
    updateBooking(id: $id, input: $input) {
      id
      status
    }
  }
`);

export const DeleteBookingDocument = graphql(`
  mutation DeleteBooking($id: ID!) {
    deleteBooking(id: $id)
  }
`);

export const DeleteAttachmentDocument = graphql(`
  mutation DeleteAttachment($id: ID!) {
    deleteAttachment(id: $id)
  }
`);

export const AttachToBookingDocument = graphql(`
  mutation AttachToBooking($attachmentId: ID!, $bookingId: ID) {
    attachToBooking(attachmentId: $attachmentId, bookingId: $bookingId) {
      id
    }
  }
`);

export const ParseTextDocument = graphql(`
  mutation ParseBookingText($tripId: ID!, $text: String!) {
    parseBookingText(tripId: $tripId, text: $text) {
      type
      title
      provider
      confirmationCode
      bookingUrl
      startLocal
      endLocal
      timeZone
      location
      address
      price
      currency
      travellers
      fromSource
      source
      segments {
        carrier
        number
        fromCode
        fromName
        toCode
        toName
        departLocal
        arriveLocal
        departTz
        arriveTz
      }
    }
  }
`);

export type BookingSummary = NonNullable<BookingsQuery['trip']>['bookings'][number];
export type BookingFull = NonNullable<NonNullable<BookingDetailQuery['trip']>['booking']>;
