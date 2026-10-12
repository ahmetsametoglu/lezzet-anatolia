import { describe, expect, it } from 'vitest';
import { canNegotiatePrice } from './negotiation';

describe('canNegotiatePrice', () => {
  it('yalnız yönetici rolü pazarlık yazar; saha rolleri tek başına yazamaz', () => {
    expect(canNegotiatePrice(['admin'])).toBe(true);
    expect(canNegotiatePrice(['courier', 'admin'])).toBe(true);
    expect(canNegotiatePrice(['courier'])).toBe(false);
    expect(canNegotiatePrice(['warehouse'])).toBe(false);
    expect(canNegotiatePrice(['accounting'])).toBe(false);
  });
});
