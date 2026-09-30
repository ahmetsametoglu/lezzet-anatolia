import { describe, expect, it } from 'vitest';
import { signedInText } from './signed-in';

describe('signedInText', () => {
  it('e-postayı cümleye yazar', () => {
    expect(signedInText('claire@example.fr', 'fr')).toBe('Vous continuez en tant que claire@example.fr');
  });

  it('e-posta boşsa yer tutucu ekrana çıkmaz, kimliksiz cümle yazılır', () => {
    expect(signedInText('  ', 'tr')).toBe('Hesabınızla devam ediyorsunuz');
    expect(signedInText(null, 'de')).toBe('Angemeldet');
  });
});
