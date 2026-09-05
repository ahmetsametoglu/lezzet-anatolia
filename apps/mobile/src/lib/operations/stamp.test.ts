import { agoOf, dateLabelOf, dayGroupLabelOf, stampOf, timeOf, turkishUpper } from './stamp';

/*
  DAMGA YARDIMCILARI — üç biçim, tek kaynak.

  Testin taşıdığı asıl iddia BİÇİM DEĞİL TUTARLILIK: `timeOf` 30.08'de gün sonu ekranı için
  eklendi ve `stampOf` zaten aynı saati yazıyordu. İkisi ayrı hesaplarsa bir gün biri 24 saatlik,
  öteki 12 saatlik olur ve aynı olay iki ekranda iki saatle görünür — bunu typecheck göremez.

  SAAT DİLİMİ SABİTLENMEDİ: yardımcılar bilerek CİHAZIN yerel saatini yazıyor (personelin "17:42"
  dediği saat kendi saatidir), dolayısıyla testler de mutlak bir değer değil, İLİŞKİ ölçüyor.
*/

const ISO = '2026-08-26T15:42:00.000Z';

describe('timeOf', () => {
  it('yalnız saat:dakika yazar — gün BAŞLIKTA olduğu için tekrarlanmaz', () => {
    expect(timeOf(ISO)).toMatch(/^\d{2}:\d{2}$/u);
  });

  it('tam damganın saat kısmıyla AYNI — iki biçim ayrışmaz', () => {
    expect(stampOf(ISO).endsWith(timeOf(ISO))).toBe(true);
  });

  it('saat ve dakika iki haneye doldurulur (gece yarısı "0:5" diye yazılmaz)', () => {
    const [hours, minutes] = timeOf('2026-08-26T00:05:00.000Z').split(':');
    expect(hours).toHaveLength(2);
    expect(minutes).toHaveLength(2);
  });
});

describe('dateLabelOf', () => {
  it('ISO günü Türkçe ay adıyla yazar', () => {
    expect(dateLabelOf('2026-08-28')).toBe('28 Ağustos');
  });

  /* UYDURMA GÜN ADI YAZILMAZ (CLAUDE §1: ölçülemeyen değer varsayılan değildir) — biçim
     tanınmazsa üstbaşlık kuyruksuz kalır. */
  it('biçim tanınmazsa null döner', () => {
    expect(dateLabelOf('28.08.2026')).toBeNull();
    expect(dateLabelOf('2026-13-01')).toBeNull();
  });
});

/*
  GÖRELİ ZAMAN — evi 05.09'da buraya geldi (`notification-map.ts`ten). Bildirim satırı artık MUTLAK
  saat yazıyor; tek tüketici yönetim hub'ının "son hareket" künyesi kaldı ve bir biçimleyicinin
  evi, onu kullanmayan bir çeviri katmanı olamaz.
*/
describe('agoOf', () => {
  const NOW = new Date('2026-08-26T12:00:00Z');

  it('dakika altı "şimdi"; dk → sa → g eşikleri', () => {
    expect(agoOf('2026-08-26T11:59:40Z', NOW)).toBe('şimdi');
    expect(agoOf('2026-08-26T11:51:00Z', NOW)).toBe('9 dk');
    expect(agoOf('2026-08-26T09:00:00Z', NOW)).toBe('3 sa');
    expect(agoOf('2026-08-23T12:00:00Z', NOW)).toBe('3 g');
  });
});

describe('turkishUpper', () => {
  /* `toUpperCase` yereli bilmez: "Nisan" → "NISAN" (noktasız I). Tasarımın kendi şablonu bu tuzağa
     düşüp rozette "YÖNETIM" yazıyor; kod onu kopyalamıyor — sapma bilinçli. */
  it('noktalı i büyürken noktalı kalır, ı noktasız büyür', () => {
    expect(turkishUpper('Yönetim')).toBe('YÖNETİM');
    expect('Yönetim'.toUpperCase()).not.toBe(turkishUpper('Yönetim'));
    expect(turkishUpper('Kırmızı')).toBe('KIRMIZI');
  });
});

describe('dayGroupLabelOf', () => {
  /* Gün anahtarı CİHAZIN yerel takviminden kesilir. Test de yerel kurulur (`new Date(y, m, d, h)`):
     UTC dizesiyle yazılsaydı test, koştuğu makinenin saat diliminde bir gün kayabilirdi — ölçtüğü
     kuralın ta kendisine yakalanırdı. */
  const NOW = new Date(2026, 8, 5, 14, 0);

  it('bugün ve dün adlarıyla; öteki günler tarihle', () => {
    expect(dayGroupLabelOf(new Date(2026, 8, 5, 8, 42).toISOString(), NOW)).toBe('BUGÜN');
    expect(dayGroupLabelOf(new Date(2026, 8, 4, 23, 30).toISOString(), NOW)).toBe('DÜN');
    expect(dayGroupLabelOf(new Date(2026, 8, 3, 10, 0).toISOString(), NOW)).toBe('3 EYLÜL');
  });

  it('BAŞKA YILDA yıl da yazılır — okunmamış personel satırı hiç süpürülmüyor, kuyrukta bir yıl önceki satır durabilir', () => {
    expect(dayGroupLabelOf(new Date(2025, 8, 3, 10, 0).toISOString(), NOW)).toBe('3 EYLÜL 2025');
  });

  it('gece yarısına yakın saat günü KAYDIRMAZ — kesim yerel, UTC değil', () => {
    /* Fransa'da yaz saatiyle 22:00'den sonra `toISOString()` ertesi güne geçer; gece vardiyasındaki
       personel "bugün"ü dünde görürdü (`day-tag.ts` dersi). */
    const gecYerel = new Date(2026, 8, 5, 23, 30);
    expect(dayGroupLabelOf(gecYerel.toISOString(), new Date(2026, 8, 5, 23, 45))).toBe('BUGÜN');
  });
});
