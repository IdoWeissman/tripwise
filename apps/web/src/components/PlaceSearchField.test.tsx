import { MockedProvider } from '@apollo/client/testing/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlaceSearchField } from './PlaceSearchField';

const place = {
  __typename: 'PlaceMatch' as const,
  googlePlaceId: 'ChIJtest',
  name: 'Example Market',
  address: 'Av. Exemplo 1',
  kind: 'Market',
};

describe('PlaceSearchField', () => {
  it('is a plain text field when place search is off', () => {
    render(
      <MockedProvider>
        <PlaceSearchField
          tripId="t"
          label="What"
          value=""
          onChange={() => {}}
          place={null}
          onPick={() => {}}
          enabled={false}
        />
      </MockedProvider>,
    );
    expect(screen.getByLabelText('What')).not.toHaveAttribute('role', 'combobox');
    expect(screen.queryByText(/Type a place/)).toBeNull();
  });

  it('shows the attached place and removes it', () => {
    const onPick = vi.fn();
    render(
      <MockedProvider>
        <PlaceSearchField
          tripId="t"
          label="What"
          value="Example Market"
          onChange={() => {}}
          place={place}
          onPick={onPick}
          enabled
        />
      </MockedProvider>,
    );
    expect(screen.getByRole('combobox', { name: 'What' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove place Example Market' }));
    expect(onPick).toHaveBeenCalledWith(null);
  });
});
