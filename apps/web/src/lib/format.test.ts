import { describe, expect, it } from 'vitest';
import { formatDateRange, formatMoney } from './format';

describe('format', () => {
  it('formats a same-month range with an en dash', () => {
    expect(formatDateRange('2027-05-14', '2027-05-19')).toBe('May 14 – 19');
  });
  it('formats a cross-month range', () => {
    expect(formatDateRange('2027-05-30', '2027-06-02')).toBe('May 30 – Jun 2');
  });
  it('formats signed money with a real minus sign', () => {
    expect(formatMoney(42.1, 'EUR', true)).toBe('+€42.10');
    expect(formatMoney(-64.2, 'EUR', true)).toBe('−€64.20');
  });
});
