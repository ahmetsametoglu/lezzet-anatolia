import { describe, expect, it } from 'vitest';
import { ipv6Prefix } from './session-key';

/**
 * IPv6 önek kırpması (denetim P3, 04.08).
 *
 * **Kimlik riski değil, OTURUM GÜRÜLTÜSÜ:** aynı adres iki farklı yazımla gelirse iki anahtar
 * üretilir, aynı ziyaretçi iki oturum sayılır ve dönüşüm oranı sessizce düşer. Hata vermez.
 */
describe('ipv6Prefix', () => {
  it('ilk 48 biti tutar — tartışmanın kararı "son 80 bit atılır"', () => {
    expect(ipv6Prefix('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:db8:85a3');
  });

  it('`::` SIKIŞTIRIK gösterim açılır — aynı adres tek anahtar üretir', () => {
    // Açmadan kırpsaydık `2001:db8::1` → "2001:db8:" ve uzun yazımı "2001:db8:0" olurdu.
    expect(ipv6Prefix('2001:db8::1')).toBe(ipv6Prefix('2001:0db8:0000:0000:0000:0000:0000:0001'));
  });

  it('baştaki sıfırlar normalleştirilir — `0db8` ile `db8` aynı adrestir', () => {
    expect(ipv6Prefix('2001:0db8:0000::1')).toBe(ipv6Prefix('2001:db8:0::1'));
  });

  it('kısa ve sınır hâller çökmez', () => {
    expect(ipv6Prefix('::1')).toBe('0:0:0');
    expect(ipv6Prefix('fe80::')).toBe('fe80:0:0');
  });
});
