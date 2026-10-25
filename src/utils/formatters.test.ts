import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  getNextStatus,
  getStatusLabel,
} from './formatters';

describe('formatCurrency', () => {
  it('formats with two decimals and the given symbol', () => {
    expect(formatCurrency(12.5, '€')).toBe('€12.50');
    expect(formatCurrency(0, '$')).toBe('$0.00');
  });

  it('defaults to the euro symbol', () => {
    expect(formatCurrency(3)).toBe('€3.00');
  });
});

describe('order status helpers', () => {
  it('walks the happy path to completed', () => {
    expect(getNextStatus('new')).toBe('confirmed');
    expect(getNextStatus('confirmed')).toBe('preparing');
    expect(getNextStatus('preparing')).toBe('ready');
    expect(getNextStatus('ready')).toBe('out_for_delivery');
    expect(getNextStatus('out_for_delivery')).toBe('completed');
  });

  it('has no next status for terminal states', () => {
    expect(getNextStatus('completed')).toBeNull();
    expect(getNextStatus('cancelled')).toBeNull();
  });

  it('has a human-readable label for every status', () => {
    expect(getStatusLabel('out_for_delivery')).toBe('Out for Delivery');
    expect(getStatusLabel('cancelled')).toBe('Cancelled');
  });
});
