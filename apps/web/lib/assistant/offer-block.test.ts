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

describe('batchOfferBlock — düğmenin engeli ve sebebi', () => {
  it('DLC geçmiş partide engel VAR ve sebebi imhayı söyler', () => {
    const block = batchOfferBlock({ offerPriceCents: 686, dateType: 'DLC', expiryDate: iso(-6) });
    expect(block).toContain('satılamaz');
  });

  it('yasak, geçerli bir fiyat girilmiş olsa bile önce gelir', () => {
    // Sıra önemli: fiyat doğruyken engelin kalkması, yasağı fiyata bağlamak olurdu.
    expect(batchOfferBlock({ offerPriceCents: 1200, dateType: 'DLC', expiryDate: iso(-1) })).not.toBeNull();
  });

  it('DDM geçmiş partide engel YOK — karar operatörün', () => {
    expect(batchOfferBlock({ offerPriceCents: 686, dateType: 'DDM', expiryDate: iso(-30) })).toBeNull();
  });

  it('fiyat girilmemişse engel var; sıfır ve negatif de yazılamaz', () => {
    expect(batchOfferBlock({ offerPriceCents: null, dateType: 'DDM', expiryDate: iso(5) })).toBe('Teklif fiyatı girilmeli');
    expect(batchOfferBlock({ offerPriceCents: 0, dateType: 'DDM', expiryDate: iso(5) })).toContain('sıfırdan büyük');
    expect(batchOfferBlock({ offerPriceCents: -1, dateType: 'DDM', expiryDate: iso(5) })).toContain('sıfırdan büyük');
  });

  it('MALİYETİN ALTINDA fiyat engel DEĞİLDİR — zararına satmak bir karardır', () => {
    // Ekran zararı cümleyle söyler (gövdedeki "0,64 € zarar" satırı), yolu kapatmaz.
    expect(batchOfferBlock({ offerPriceCents: 1, dateType: 'DDM', expiryDate: iso(10) })).toBeNull();
  });
});
