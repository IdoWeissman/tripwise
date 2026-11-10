import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen } from '@testing-library/react';
import { GraphQLError } from 'graphql';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TripShellDocument } from '../lib/trip';
import { TripLayout } from './TripLayout';

const TRIP_ID = '00000000-0000-0000-0000-000000000000';

function renderWith(code: string) {
  const mocks = [
    {
      request: { query: TripShellDocument, variables: { id: TRIP_ID } },
      result: { errors: [new GraphQLError('nope', { extensions: { code } })] },
    },
  ];
  render(
    <MockedProvider mocks={mocks}>
      <MemoryRouter initialEntries={[`/trips/${TRIP_ID}/expenses`]}>
        <Routes>
          <Route path="/trips/:tripId" element={<TripLayout />}>
            <Route path="expenses" element={<p>expenses</p>} />
          </Route>
          <Route path="/sign-in" element={<h1>Welcome back</h1>} />
        </Routes>
      </MemoryRouter>
    </MockedProvider>,
  );
}

describe('TripLayout access errors', () => {
  it('shows "Trip not found" (not sign-in) when the viewer has no access', async () => {
    renderWith('FORBIDDEN');
    expect(await screen.findByText('Trip not found')).toBeInTheDocument();
    expect(screen.queryByText('Welcome back')).not.toBeInTheDocument();
  });

  it('sends signed-out viewers to sign-in', async () => {
    renderWith('UNAUTHENTICATED');
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
  });
});
