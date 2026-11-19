import { describe, it, expect } from 'vitest';
import { addDecimal, exact6, truncate } from '../src/utils/money';

// Balances are exact decimal strings from chain data. Display truncates and never rounds up.
describe('exact money formatting', () => {
  it('truncates instead of rounding up', () => {
    expect(truncate('19.996669725', 2)).toBe('19.99');
    expect(truncate('0.999999', 2)).toBe('0.99');
    expect(truncate('20.0', 2)).toBe('20.00');
    expect(truncate('5', 2)).toBe('5.00');
  });
  it('shows up to 6 decimals, trims zeros, keeps at least 2', () => {
    expect(exact6('19.996669725')).toBe('19.996669');
    expect(exact6('20.0')).toBe('20.00');
    expect(exact6('0.5')).toBe('0.50');
    expect(exact6('0.003300')).toBe('0.0033');
    expect(exact6('0.0000004')).toBe('0.00');
    expect(exact6('1234567.123456789')).toBe('1234567.123456');
  });
  it('adds wallet and reserve exactly (no float error)', () => {
    expect(addDecimal('0.1', '0.2')).toBe('0.3');
    expect(addDecimal('19.996669725', '0.99')).toBe('20.986669725');
    expect(addDecimal('0', '0')).toBe('0.0');
    expect(addDecimal('1000000000.000001', '0.000001')).toBe('1000000000.000002');
  });
  it('a balance just under a dollar never displays as a dollar', () => {
    expect(truncate(addDecimal('0.5', '0.499999'), 2)).toBe('0.99');
  });
});
