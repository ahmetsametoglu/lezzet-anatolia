import { describe, expect, it } from 'vitest';
import { isLocalHost, isLocalUrl } from './host';

// Yerel olmayan bir adres yerel sayılırsa (geliştirme kapıları canlıda açılır) kırmızıya döner.
describe('yerel adres', () => {
  it('yalnız yerel makinenin adları yerel; benzeyen alan adı ve okunamayan adres değil', () => {
    expect(isLocalUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isLocalUrl('http://localhost:3000')).toBe(true);
    expect(isLocalUrl('http://[::1]:3000')).toBe(true);
    expect(isLocalHost('localhost:3000')).toBe(true);
    expect(isLocalUrl('https://ornek.supabase.co')).toBe(false);
    expect(isLocalUrl('https://localhost.lezzetanatolie.com')).toBe(false);
    expect(isLocalUrl(undefined)).toBe(false);
    expect(isLocalUrl('bozuk adres')).toBe(false);
  });
});
