import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SetupChecklist, type TripSetupState } from './SetupChecklist';

const renderAt = (setup: TripSetupState) =>
  render(
    <MockedProvider>
      <MemoryRouter initialEntries={['/trips/t1/overview']}>
        <Routes>
          <Route
            path="/trips/:tripId/overview"
            element={<SetupChecklist tripId="t1" setup={setup} started={false} />}
          />
        </Routes>
      </MemoryRouter>
    </MockedProvider>,
  );

describe('SetupChecklist', () => {
  it('lists the three steps with progress, each opening its flow from setup', () => {
    renderAt({ hasBookings: false, hasInvited: true, hasExpenses: false, hidden: false });
    expect(screen.getByRole('heading', { name: 'Get the trip ready' })).toBeInTheDocument();
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /To do: Add your bookings/ })).toHaveAttribute(
      'href',
      '/trips/t1/bookings?add&from=setup',
    );
    // done is said in words, not only shown by the check
    expect(screen.getByRole('link', { name: /Done: Invite the group/ })).toHaveAttribute(
      'href',
      '/trips/t1/members?invite&from=setup',
    );
    expect(screen.getByRole('link', { name: /Add expenses already paid/ })).toHaveAttribute(
      'href',
      '/trips/t1/expenses?add&from=setup',
    );
    expect(screen.getByRole('button', { name: /Hide setup checklist/ })).toBeInTheDocument();
  });

  it('collapses to one line when everything is done', () => {
    renderAt({ hasBookings: true, hasInvited: true, hasExpenses: true, hidden: false });
    expect(screen.getByRole('heading', { name: /You're set/ })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Done setup checklist/ })).toBeInTheDocument();
  });
});
