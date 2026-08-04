import { describe, expect, it } from 'vitest';
import { customersUrl, parseCustomersUrl, toCustomerFilters } from './customers-url';

/**
 * URL sözleşmesi saf mantıktır (DB yok) → birim test. Önemi bu ekranda iki katlı: süzgeçlerin HEPSİ
 * sunucuda uygulanıyor (`UserProfileService.list`) ve liste SAYFALANIYOR — yani ikinci sayfayı
 * çeken action aynı adresi yeniden ayrıştırıyor (`loadMoreCustomersAction(window.location.search)`).
 * Ayrıştırma yanlışsa hata vermez: liste ilk sayfada bir ölçütle, ikinci sayfada başkasıyla dolar.
 *
 * Asıl kilitlediğimiz değişmez: **`mc` yalnız pazarlama kümesinde yaşar.** Analitik ekranı buraya
 * `?scope=marketing&mc=email` diye köprü kuruyor (`ANALYTICS §6`); kanal başka bir daraltmaya
 * sızarsa operatör göremediği bir süzgeci arkasında sürükler.
 */

describe('parseCustomersUrl', () => {
  it('boş parametrelerde varsayılana düşer', () => {
    expect(parseCustomersUrl({})).toEqual({ q: '', type: 'all', scope: 'all', mc: 'any' });
  });

  it('tanınmayan değerleri sessizce varsayılana çevirir (bozuk link ekranı kırmaz)', () => {
    const s = parseCustomersUrl({ scope: 'hepsi', type: 'kurumsal', mc: 'sms' });
    expect(s).toEqual({ q: '', type: 'all', scope: 'all', mc: 'any' });
  });

  it('pazarlama kümesinde kanalı okur', () => {
    expect(parseCustomersUrl({ scope: 'marketing', mc: 'whatsapp' }).mc).toBe('whatsapp');
  });

  it('BAŞKA bir kümede gelen kanalı YOK SAYAR — süzgeç görünmediği yerde yaşamaz', () => {
    expect(parseCustomersUrl({ scope: 'draft', mc: 'email' }).mc).toBe('any');
  });

  it('arama teriminin kenar boşluklarını atar', () => {
    expect(parseCustomersUrl({ q: '  0388  ' }).q).toBe('0388');
  });
});

describe('customersUrl', () => {
  it('varsayılan durumda parametre YAZMAZ (temiz adres)', () => {
    expect(customersUrl(parseCustomersUrl({}))).toBe('/operations/customers');
  });

  it('kanalı yalnız pazarlama kümesinde yazar', () => {
    expect(customersUrl({ q: '', type: 'all', scope: 'marketing', mc: 'email' })).toBe('/operations/customers?scope=marketing&mc=email');
    // Kümeden çıkıldığında kanal adreste KALMAZ — durumda kalmış olsa bile.
    expect(customersUrl({ q: '', type: 'all', scope: 'credit', mc: 'email' })).toBe('/operations/customers?scope=credit');
  });

  it('kanal "tümü" ise yazılmaz (varsayılan)', () => {
    expect(customersUrl({ q: '', type: 'all', scope: 'marketing', mc: 'any' })).toBe('/operations/customers?scope=marketing');
  });

  it('gidiş-dönüş kayıpsız', () => {
    const url = customersUrl({ q: 'bosphore', type: 'company', scope: 'marketing', mc: 'whatsapp' });
    const params = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
    expect(parseCustomersUrl(params)).toEqual({ q: 'bosphore', type: 'company', scope: 'marketing', mc: 'whatsapp' });
  });
});

describe('toCustomerFilters', () => {
  it('pazarlama kümesinde kanalı servise geçirir', () => {
    expect(toCustomerFilters({ q: '', type: 'all', scope: 'marketing', mc: 'email' })).toEqual({
      query: undefined,
      type: undefined,
      isDraft: undefined,
      creditEnabled: undefined,
      b2bPending: undefined,
      marketingConsent: 'email',
    });
  });

  it('başka kümede izin süzgeci HİÇ geçilmez — `any` bile değil', () => {
    // Fark önemli: `any` "izinlilerden herhangi biri" demek, `undefined` "izne hiç bakma" demek.
    // İkisi karışsaydı "Vadeli" çipi sessizce izinsiz müşterileri eler ve liste eksik dönerdi.
    expect(toCustomerFilters({ q: '', type: 'all', scope: 'credit', mc: 'email' }).marketingConsent).toBeUndefined();
  });
});
