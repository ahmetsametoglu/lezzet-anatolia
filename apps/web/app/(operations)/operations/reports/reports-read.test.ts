import { describe, expect, it } from 'vitest';
import type { OssSummaryLine } from '@lezzet/domain-core';
import { vatLineCountry } from './reports-read';

const oss = (country: 'DE', vatRate: number, netCents: number, vatCents: number): OssSummaryLine => ({
  year: 2026,
  quarter: 4,
  country,
  vatRate,
  netCents,
  vatCents,
});

// Oran satırı yalnız tümüyle tek ülkenin varış KDV'siyse etiketlenir; oranla etiketlemek Fransız satışıyla karışan satırı "Almanya" diye yazardı.
describe('vatLineCountry', () => {
  it("satırın tamamı Almanya'nın OSS satırıysa ülke Almanya'dır", () => {
    expect(vatLineCountry({ rate: 7, netCents: 139_000, vatCents: 9_730 }, [oss('DE', 7, 139_000, 9_730)])).toBe('DE');
  });

  it('satırda satıcının satışı da varsa etiket yoktur', () => {
    expect(vatLineCountry({ rate: 7, netCents: 150_000, vatCents: 10_500 }, [oss('DE', 7, 139_000, 9_730)])).toBeNull();
    expect(vatLineCountry({ rate: 20, netCents: 86_000, vatCents: 17_200 }, [oss('DE', 7, 139_000, 9_730)])).toBeNull();
  });
});
