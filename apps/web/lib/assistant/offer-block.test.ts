import { describe, expect, it } from 'vitest';
import { batchOfferBlock, offerBlockedByExpiry } from './offer-block';

/**
 * Fırsat kararının YASAKLARI (26.08 · gövde turunun bulgusu).
 *
 * Sınanan şey bir görünüm değil bir SÖZ: *"ekranın 'satılamaz' dediği yerde düğme de kapalıdır."*
 * Bu söz bir tur boyunca tutulmuyordu — gövde doğru uyarıyor, düğme açık duruyordu ve basan
 * `must_discard` hatası alıyordu. Testler o boşluğu kilitliyor.
 *
 * Tarihler ÇALIŞMA ANINA GÖRE üretiliyor, sabit yazılmıyor: sabit bir "geçmiş tarih" bir gün
 * gelecekte kalır ve test sessizce anlamsızlaşır.
 */

const gun = 86_400_000;
const iso = (offsetGun: number) => new Date(Date.now() + offsetGun * gun).toISOString().slice(0, 10);

describe('offerBlockedByExpiry — yasak motorun kelimesi', () => {
  it('DLC geçmişse YASAK', () => {
    expect(offerBlockedByExpiry('DLC', iso(-1))).toBe(true);
  });

  it('DDM geçmişse yasak DEĞİL — kalite düşer, mal satılabilir', () => {
    expect(offerBlockedByExpiry('DDM', iso(-30))).toBe(false);
  });

  it('tarih gelecekteyse hiçbir tipte yasak yok', () => {
    expect(offerBlockedByExpiry('DLC', iso(5))).toBe(false);
    expect(offerBlockedByExpiry('DDM', iso(5))).toBe(false);
  });

  it('tarih tipi BİLİNMİYORSA yasak uydurulmaz', () => {
    // Ölçülemeyen bir yasak, uydurma bir yasaktır (CLAUDE §1). Ters yön de somut: "DLC olabilir"
    // diye kesmek, satılabilir bir DDM partisini imhaya yollardı.
    expect(offerBlockedByExpiry(null, iso(-1))).toBe(false);
    expect(offerBlockedByExpiry(undefined, iso(-1))).toBe(false);
  });
});

describe('batchOfferBlock — düğmeyi YALNIZ yazılamayacak değer kapatır', () => {
  it('fiyat girilmemişse engel var; sıfır ve negatif de yazılamaz', () => {
    expect(batchOfferBlock({ offerPriceCents: null })).toBe('Teklif fiyatı girilmeli');
    expect(batchOfferBlock({ offerPriceCents: 0 })).toContain('sıfırdan büyük');
    expect(batchOfferBlock({ offerPriceCents: -1 })).toContain('sıfırdan büyük');
  });

  it('MALİYETİN ALTINDA fiyat engel DEĞİLDİR — zararına satmak bir karardır', () => {
    // Ekran zararı cümleyle söyler (gövdedeki "0,64 € zarar" satırı), yolu kapatmaz.
    expect(batchOfferBlock({ offerPriceCents: 1 })).toBeNull();
  });

  it('geçerli fiyat engelsizdir', () => {
    expect(batchOfferBlock({ offerPriceCents: 686 })).toBeNull();
  });
});

/**
 * ── YASAK ≠ ENGEL (kullanıcı kuralı 26.08) ──────────────────────────────────
 *
 * `offerBlockedByExpiry` bir GERÇEĞİ söylüyor ve ekran onu kırmızı bir satırla yazıyor; ama
 * düğmeyi KAPATMIYOR. Bir tur boyunca kapatıyordu ve kural tersine çevrildi:
 *
 *   *"Yanlış bir tespitte bulunup da o butonu kapatırsan daha büyük bir hataya sebep verirsin."*
 *
 * Bu test o ayrımı kilitliyor: yasak doğru hesaplanmaya devam etmeli (üstteki describe), ama
 * engele DÖNÜŞMEMELİ. İkisi bir gün yeniden birleşirse burası kırmızıya döner.
 */
describe('yasak düğmeyi kapatmaz', () => {
  it('DLC geçmiş partide yasak VAR ama geçerli fiyatla engel YOK', () => {
    expect(offerBlockedByExpiry('DLC', iso(-6))).toBe(true);
    expect(batchOfferBlock({ offerPriceCents: 686 })).toBeNull();
  });
});
