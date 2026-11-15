import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookingForm } from './BookingForm';
import { formStateFrom } from './formState';

describe('BookingForm provenance badges', () => {
  it('tags verified fields "Read from file" and unverified ones "Check this"', () => {
    const value = formStateFrom(
      {
        type: 'STAY',
        title: 'Example Suites',
        confirmationCode: 'QX-4471',
        price: '100.00',
        currency: 'USD',
        fromSource: ['title', 'confirmationCode', 'price', 'currency'],
        toCheck: ['price'],
      },
      'USD',
    );
    render(<BookingForm value={value} onChange={() => {}} showProvenance tripTimeZone="UTC" />);
    const tag = (label: string) =>
      screen.getByText(label, { selector: 'label' }).parentElement!.textContent;
    expect(tag('Confirmation code')).toContain('Read from file');
    expect(tag('Price')).toContain('Check this');
    expect(tag('Price')).not.toContain('Read from file');
  });
});
