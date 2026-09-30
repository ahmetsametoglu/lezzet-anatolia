import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('adın ilk iki sözcüğünün baş harfleri, dilin büyük harf kuralıyla', () => {
    expect(initialsOf('Claire Anne Weber', null, 'fr')).toBe('CA');
    expect(initialsOf('irmak işık', null, 'tr')).toBe('İİ');
  });

  it('adsız hesapta e-postanın ilk harfi, o da yoksa soru işareti; yuvarlak boş kalmaz', () => {
    expect(initialsOf('  ', 'ayse@example.com', 'tr')).toBe('A');
    expect(initialsOf('', null, 'de')).toBe('?');
  });
});
