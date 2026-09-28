import { describe, expect, it } from 'vitest';
import { companyIdentifiers } from './company';

describe('companyIdentifiers', () => {
  it('ikisi varsa şablonla, biri varsa yalnız o, hiçbiri yoksa satır yok', () => {
    const template = 'SIRET {siret} · TVA {vat}';
    expect(companyIdentifiers({ siret: '123', vatNumber: 'FR99' }, template)).toBe('SIRET 123 · TVA FR99');
    expect(companyIdentifiers({ siret: null, vatNumber: 'FR99' }, template)).toBe('FR99');
    expect(companyIdentifiers({ siret: '123', vatNumber: null }, template)).toBe('123');
    expect(companyIdentifiers({ siret: undefined, vatNumber: null }, template)).toBeNull();
  });
});
