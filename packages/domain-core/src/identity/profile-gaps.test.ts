import { describe, expect, it } from 'vitest';
import { isNameMissing } from './profile-gaps';

describe('künye boşluğu', () => {
  // Ad yerine e-posta yazılmış hesap "adı var" sayılırsa ödeme ekranı adı hiç sormaz ve kurye kartına e-posta düşer.
  it('boş ad da, ad yerine yazılmış e-posta da eksik sayılır; gerçek ad eksik değildir', () => {
    expect(isNameMissing({ name: '  ', email: 'claire@example.fr' })).toBe(true);
    expect(isNameMissing({ name: 'Claire@Example.fr', email: 'claire@example.fr' })).toBe(true);
    expect(isNameMissing({ name: 'Claire Weber', email: 'claire@example.fr' })).toBe(false);
  });
});
