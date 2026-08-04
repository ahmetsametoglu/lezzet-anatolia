import { describe, expect, it } from 'vitest';
import {
  monthLabel,
  monthOf,
  monthRange,
  parseReportsUrl,
  previousMonth,
  reportsUrl,
  selectableMonths,
  type ReportsUrlState,
} from './reports-url';

// Raporlar URL sözleşmesi — DB'siz, saf. Ay aritmetiği burada çünkü **takvim sessizce yanılır**:
// yanlış hesaplanan bir ay sonu, o ayın son gününde kesilmiş bir ciro olarak görünür ve rapor
// hata vermez.

const NOW = new Date('2026-08-04T10:00:00.000Z');
const DEFAULTS: ReportsUrlState = { tab: 'urun', ym: '2026-08', cmp: false };

describe('parseReportsUrl', () => {
  it('boş parametrede bu ayı ve ilk sekmeyi verir', () => {
    expect(parseReportsUrl({}, NOW)).toEqual(DEFAULTS);
  });

  it('bozuk ayı sessizce bu aya düşürür', () => {
    // Elle düzenlenmiş ya da eskimiş bir adres, boş bir hata sayfası yerine bu ayın raporunu açar.
    expect(parseReportsUrl({ ym: '2026-13' }, NOW).ym).toBe('2026-08');
    expect(parseReportsUrl({ ym: 'temmuz' }, NOW).ym).toBe('2026-08');
    expect(parseReportsUrl({ ym: '2026-00' }, NOW).ym).toBe('2026-08');
  });

  it('geçerli değerleri okur', () => {
    expect(parseReportsUrl({ tab: 'sirket', ym: '2026-07', cmp: '1' }, NOW)).toEqual({
      tab: 'sirket',
      ym: '2026-07',
      cmp: true,
    });
  });

  it('tanınmayan sekmeyi varsayılana düşürür', () => {
    expect(parseReportsUrl({ tab: 'uydurma' }, NOW).tab).toBe('urun');
  });
});

describe('reportsUrl', () => {
  it('varsayılanları adrese YAZMAZ', () => {
    expect(reportsUrl(DEFAULTS, NOW)).toBe('/operations/reports');
  });

  it('gidiş-dönüş kayıpsız', () => {
    const state: ReportsUrlState = { tab: 'export', ym: '2026-05', cmp: true };
    const query = reportsUrl(state, NOW).split('?')[1] ?? '';
    expect(parseReportsUrl(Object.fromEntries(new URLSearchParams(query)), NOW)).toEqual(state);
  });
});

describe('monthRange', () => {
  it('31 günlük ayı doğru kapatır', () => {
    expect(monthRange('2026-07')).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('30 günlük ayı doğru kapatır', () => {
    expect(monthRange('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('ŞUBAT — normal yıl 28 gün', () => {
    expect(monthRange('2026-02').to).toBe('2026-02-28');
  });

  it('ŞUBAT — artık yıl 29 gün', () => {
    // Elle 28 yazılsaydı artık yılın 29 Şubat'ındaki satışlar her dört yılda bir sessizce düşerdi.
    expect(monthRange('2028-02').to).toBe('2028-02-29');
  });
});

describe('previousMonth', () => {
  it('ay içinde bir geri gider', () => {
    expect(previousMonth('2026-08')).toBe('2026-07');
  });

  it('YIL SINIRINI geçer', () => {
    // Ocak'ın öncesi geçen yılın aralığıdır; naif bir `month - 1` burada `2026-00` üretirdi.
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});

describe('selectableMonths', () => {
  it('bu aydan geriye gider, İLERİ GİTMEZ', () => {
    // Gelecek ayın raporu boş çıkar ve boş bir rapor, veri olmadığını değil işin kötü gittiğini
    // düşündürür.
    const months = selectableMonths(NOW, 3);
    expect(months).toEqual(['2026-08', '2026-07', '2026-06']);
  });

  it('ilk eleman her zaman bu aydır', () => {
    expect(selectableMonths(NOW)[0]).toBe(monthOf(NOW));
  });
});

describe('monthLabel', () => {
  it('ayı Türkçe adıyla yazar', () => {
    expect(monthLabel('2026-08')).toBe('Ağustos 2026');
    expect(monthLabel('2026-01')).toBe('Ocak 2026');
    expect(monthLabel('2025-12')).toBe('Aralık 2025');
  });
});
