import { describe, expect, it } from 'vitest';
import {
  cutoffBelongsToPreviousDay,
  deliveryRunWindow,
  findZoneForPostalCode,
  isInRoute,
  upcomingDeliveryDates,
} from './delivery-days';

// Posta kodu artık (ülke, kod) ikilisi (DOMAIN §17): `67000` iki ülkede de geçerli.
const fr = (postalCode: string) => ({ country: 'FR' as const, postalCode });
const de = (postalCode: string) => ({ country: 'DE' as const, postalCode });

const ZONES = [
  { id: 'z1', postalCodes: [fr('67000'), fr('67100')], weekdays: [2, 5], isActive: true },
  { id: 'z2', postalCodes: [de('77694')], weekdays: [3], isActive: true }, // Kehl (DE) — sınır ötesi
  { id: 'z3', postalCodes: [fr('68000')], weekdays: [1], isActive: false }, // kapatılmış bölge
];

describe('rota içi mi (07.2)', () => {
  it('posta kodu aktif bölgeye düşerse rota içidir', () => {
    expect(findZoneForPostalCode(fr('67000'), ZONES)?.id).toBe('z1');
    expect(isInRoute(fr('67100'), ZONES)).toBe(true);
  });

  it('Alman posta kodu da bir bölgeye dahil edilebilir (ADR-002)', () => {
    expect(findZoneForPostalCode(de('77694'), ZONES)?.id).toBe('z2');
  });

  it('kapatılmış bölge rota SAYILMAZ — kargoya düşer', () => {
    expect(findZoneForPostalCode(fr('68000'), ZONES)).toBeNull();
    expect(isInRoute(fr('68000'), ZONES)).toBe(false);
  });

  it('hiçbir bölgeye düşmeyen adres kargodur', () => {
    expect(isInRoute(fr('75001'), ZONES)).toBe(false);
  });

  it('biçim farkı kimlik ayırmaz: "67 000" ile "67000" aynı yer', () => {
    expect(findZoneForPostalCode(fr('67 000'), ZONES)?.id).toBe('z1');
  });

  it('ÜLKE kimliğin parçasıdır — aynı kod başka ülkede aynı bölge değildir', () => {
    // 67000 Almanya'da da geçerli bir koddur; FR bölgesine yazılmış olması onu kapsamaz.
    expect(findZoneForPostalCode(de('67000'), ZONES)).toBeNull();
  });
});

describe('teslimat günleri ve kesim saati', () => {
  // 2026-07-27 Pazartesi. Bölge günleri: Salı(2) ve Cuma(5).
  const pazartesiSabah = new Date(2026, 6, 27, 9, 0);

  it('yaklaşan somut tarihler en yakından sıralanır', () => {
    const days = upcomingDeliveryDates({ weekdays: [2, 5], now: pazartesiSabah, cutoffTime: '16:00' });
    expect(days).toEqual(['2026-07-28', '2026-07-31', '2026-08-04']); // Salı, Cuma, Salı
  });

  it('BUGÜN teslimat günüyse ve kesim saati geçmediyse aday olur', () => {
    const saliSabah = new Date(2026, 6, 28, 9, 0); // Salı 09:00
    expect(upcomingDeliveryDates({ weekdays: [2], now: saliSabah, cutoffTime: '16:00' })[0]).toBe('2026-07-28');
  });

  it('kesim saatinden SONRA gelen sipariş bugüne yazılmaz — sonraki güne kayar', () => {
    const saliAksam = new Date(2026, 6, 28, 17, 0); // Salı 17:00, kesim 16:00
    expect(upcomingDeliveryDates({ weekdays: [2], now: saliAksam, cutoffTime: '16:00' })[0]).toBe('2026-08-04');
  });

  it('tam kesim saatinde gelen sipariş de kaçırmış sayılır (sınır dâhil)', () => {
    const tamKesim = new Date(2026, 6, 28, 16, 0);
    expect(upcomingDeliveryDates({ weekdays: [2], now: tamKesim, cutoffTime: '16:00' })[0]).toBe('2026-08-04');
  });

  it('kaç tarih önerileceği parametrik; tek günlü bölgede seçim çıkmaz', () => {
    const tek = upcomingDeliveryDates({ weekdays: [5], now: pazartesiSabah, count: 1 });
    expect(tek).toHaveLength(1); // çağıran: tek tarih varsa gösterilir, seçim sunulmaz
  });

  it('bölgenin teslimat günü yoksa tarih üretilmez', () => {
    expect(upcomingDeliveryDates({ weekdays: [], now: pazartesiSabah })).toEqual([]);
  });

  it('bozuk kesim saati akışı kilitlemez — kesim uygulanmaz', () => {
    const saliAksam = new Date(2026, 6, 28, 17, 0);
    expect(upcomingDeliveryDates({ weekdays: [2], now: saliAksam, cutoffTime: 'bozuk' })[0]).toBe('2026-07-28');
  });

  it('Pazar (ISO 7) doğru eşleşir — 0/7 karışıklığı yok', () => {
    const cumartesi = new Date(2026, 7, 1, 9, 0); // 2026-08-01 Cumartesi
    expect(upcomingDeliveryDates({ weekdays: [7], now: cumartesi, count: 1 })[0]).toBe('2026-08-02'); // Pazar
  });
});

/**
 * **Sefer hâlâ sipariş kabul ediyor mu** (17.10 — komşu daveti).
 *
 * Ayrı bir kural DEĞİL, yukarıdaki kesim kuralının tekil hâli; testler bunu ÇİVİLİYOR: `deliveryRunWindow`
 * ile `upcomingDeliveryDates` ayrışırsa davet müşteriye "bu sefere yetişirsin" der ama checkout o
 * günü listesinde hiç göstermez — ve fark yalnız kesim saati civarında görünür, yani neredeyse
 * hiç fark edilmez.
 */
describe('sefer penceresi (komşu daveti)', () => {
  const saliSabah = new Date(2026, 6, 28, 9, 0); // 2026-07-28 Salı 09:00, kesim 16:00

  it('gelecek günün seferi açıktır', () => {
    expect(deliveryRunWindow({ deliveryDate: '2026-07-31', now: saliSabah, cutoffTime: '16:00' })).toBe('open');
  });

  it('BUGÜNÜN seferi kesim saatinden önce açık, sonra kapalı', () => {
    expect(deliveryRunWindow({ deliveryDate: '2026-07-28', now: saliSabah, cutoffTime: '16:00' })).toBe('open');
    const saliAksam = new Date(2026, 6, 28, 17, 0);
    expect(deliveryRunWindow({ deliveryDate: '2026-07-28', now: saliAksam, cutoffTime: '16:00' })).toBe('cutoff_passed');
  });

  it('tam kesim saatinde kapalıdır — `upcomingDeliveryDates` ile AYNI sınır', () => {
    const tamKesim = new Date(2026, 6, 28, 16, 0);
    expect(deliveryRunWindow({ deliveryDate: '2026-07-28', now: tamKesim, cutoffTime: '16:00' })).toBe('cutoff_passed');
    // Aynı an, aynı gün: tarih listesi de bugünü atlıyor. İki kuralın tek olduğunun kanıtı.
    expect(upcomingDeliveryDates({ weekdays: [2], now: tamKesim, cutoffTime: '16:00' })[0]).not.toBe('2026-07-28');
  });

  it('geçmiş gün `past` — "geç kaldın" ile "o gün geçti" ayrı cümlelerdir', () => {
    expect(deliveryRunWindow({ deliveryDate: '2026-07-27', now: saliSabah, cutoffTime: '16:00' })).toBe('past');
  });

  it('bozuk/eksik kesim saati pencereyi KİLİTLEMEZ — bugün açık kalır', () => {
    const saliAksam = new Date(2026, 6, 28, 17, 0);
    expect(deliveryRunWindow({ deliveryDate: '2026-07-28', now: saliAksam, cutoffTime: 'bozuk' })).toBe('open');
    expect(deliveryRunWindow({ deliveryDate: '2026-07-28', now: saliAksam })).toBe('open');
  });
});

/**
 * **KESİM HANGİ GÜNÜN SAATİ** (19.x · kullanıcı kuralı 17.08) — kural yazılmıştı, **nöbeti yoktu**.
 *
 * Görev satırındaki kayıt aynen şuydu: *"Yeni dalın birim nöbeti yok: mevcut testler
 * `prepCutoffTime` geçmediği için eski dalda kalıyor (1374/1374 yeşil ama yeni kural sınanmadı)."*
 * Yani paket yeşildi ve hiçbir şey kanıtlamıyordu — yeni dal hiç koşmuyordu. Bu blok o borcu kapatıyor.
 *
 * ── SINANAN ŞEY BİR SAAT DEĞİL, BİR GÜN KAYMASI ─────────────────────────────
 * Kural yanlış çalışırsa arıza sessizdir ve **bir gün** büyüklüğündedir: müşteriye yetişemeyeceği
 * bir tarih gösterilir, sipariş o güne yazılır, araç çoktan çıkmıştır. Ekran hata vermez.
 */
describe('kesim ÖNCEKİ günün saati mi (hazırlık kapanışına göre)', () => {
  it('kesim hazırlıktan SONRAYSA önceki günün saatidir', () => {
    // 16:00'da gelen sipariş 11:00'da kapanan hazırlığa yetişemez → bu güne teslim için kapanış dün.
    expect(cutoffBelongsToPreviousDay('16:00', '11:00')).toBe(true);
  });

  it('kesim hazırlıktan ÖNCEYSE aynı günün saatidir', () => {
    expect(cutoffBelongsToPreviousDay('10:00', '11:00')).toBe(false);
  });

  it('EŞİTSE aynı gün — "sonra" kesin eşitsizliktir (kullanıcı onayı 17.08)', () => {
    /* Sınırın hangi tarafa düştüğü bir tercih değil, kullanıcının verdiği karar. Ters yazılsaydı
       kesimi hazırlıkla aynı saate kuran her bölge sessizce bir gün geriye kayardı. */
    expect(cutoffBelongsToPreviousDay('11:00', '11:00')).toBe(false);
  });

  it('biri EKSİKSE kural uygulanmaz — yarım veriyle gün kaydırılmaz', () => {
    expect(cutoffBelongsToPreviousDay('16:00', undefined)).toBe(false);
    expect(cutoffBelongsToPreviousDay(undefined, '11:00')).toBe(false);
  });

  it('BOZUK saat de kuralı uygulatmaz — akış kilitlenmez, eski davranış sürer', () => {
    expect(cutoffBelongsToPreviousDay('abc', '11:00')).toBe(false);
    expect(cutoffBelongsToPreviousDay('25:00', '11:00')).toBe(false);
  });
});

describe('önceki gün kuralı TARİH LİSTESİNE yansıyor', () => {
  // Bölge yalnız Salı(2) teslim ediyor. Kesim 16:00, hazırlık 11:00 → kesim ÖNCEKİ günün saati.
  const KURULUM = { weekdays: [2], cutoffTime: '16:00', prepCutoffTime: '11:00' } as const;

  it('Pazartesi 15:00 — Salı hâlâ açık (bugünün kesimi henüz gelmedi)', () => {
    const pazartesi15 = new Date(2026, 6, 27, 15, 0);
    expect(upcomingDeliveryDates({ ...KURULUM, now: pazartesi15 })[0]).toBe('2026-07-28');
  });

  it('Pazartesi 17:00 — Salı KAPANDI, en erken gün sonraki Salı', () => {
    // Künyedeki örneğin aynısı: kesim geçince taban öbür güne çıkar (`startOffset` 2).
    const pazartesi17 = new Date(2026, 6, 27, 17, 0);
    expect(upcomingDeliveryDates({ ...KURULUM, now: pazartesi17 })[0]).toBe('2026-08-04');
  });

  it('BUGÜN teslimat günü olsa ve saat erken olsa bile aday DEĞİLDİR', () => {
    /* Eski dalın tam tersi ve borcun asıl sebebi: `prepCutoffTime` verilmediğinde Salı 09:00'da
       bugün aday olur (yukarıdaki blok bunu zaten çiviliyor). Önceki gün kuralında ise bugünün
       kesimi DÜN kapandığı için saat kaç olursa olsun bugün listeye giremez. */
    const sali09 = new Date(2026, 6, 28, 9, 0);
    expect(upcomingDeliveryDates({ ...KURULUM, now: sali09 })[0]).toBe('2026-08-04');
    // Aynı an, kural olmadan: bugün aday. Fark tek başına `prepCutoffTime`tan doğuyor.
    expect(upcomingDeliveryDates({ weekdays: [2], cutoffTime: '16:00', now: sali09 })[0]).toBe('2026-07-28');
  });
});
