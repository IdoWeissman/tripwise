import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SignInPage } from './SignInPage';

describe('SignInPage', () => {
  it('renders the form and the demo-account entry (design rule)', () => {
    render(
      <MockedProvider>
        <MemoryRouter>
          <SignInPage />
        </MemoryRouter>
      </MockedProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Explore with the demo account' }),
    ).toBeInTheDocument();
  });
});
