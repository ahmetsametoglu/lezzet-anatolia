import { describe, expect, it } from 'vitest';
import { applicableVatRate, sellableIn, type ProductVatRates } from './vat-rate';

/** Lokum: Fransa %20, Almanya %7 — iki oran birbirinden türetilemez. */
const LOKUM: ProductVatRates = { vatRate: 20, countryRates: [{ country: 'DE', vatRate: 7 }] };
const ORANSIZ: ProductVatRates = { vatRate: 5.5, countryRates: [] };

describe('uygulanan oran', () => {
  it('oran ülkesi satıcınınkiyse ürünün kendi oranı', () => {
    expect(applicableVatRate('FR', LOKUM)).toBe(20);
  });

  it('oran ülkesi Almanya ise Almanya satırı — Fransız oranı yerine geçmez', () => {
    expect(applicableVatRate('DE', LOKUM)).toBe(7);
  });

  it('ters yüklemede (oran ülkesi yok) sıfır', () => {
    expect(applicableVatRate(null, LOKUM)).toBe(0);
  });

  it('Almanya oranı girilmemişse bilinmiyor — sıfır ya da Fransız oranı uydurulmaz', () => {
    expect(applicableVatRate('DE', ORANSIZ)).toBeNull();
  });
});

describe('ülkede satılabilirlik', () => {
  it("Almanya oranı olmayan ürün Almanya'daki tüketiciye satılmaz", () => {
    expect(sellableIn({ country: 'DE', channel: 'b2c', countryRates: ORANSIZ.countryRates })).toBe(false);
    expect(sellableIn({ country: 'DE', channel: 'b2c', countryRates: LOKUM.countryRates })).toBe(true);
  });

  it('işletme satışında Almanya oranı aranmaz', () => {
    expect(sellableIn({ country: 'DE', channel: 'b2b', countryRates: [] })).toBe(true);
  });

  it("Fransa'da oran satırı aranmaz — ürünün kendi oranı Fransa'nındır", () => {
    expect(sellableIn({ country: 'FR', channel: 'b2c', countryRates: [] })).toBe(true);
  });
});
