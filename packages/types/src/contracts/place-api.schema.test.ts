import { describe, expect, it } from 'vitest';
import { PlaceResolutionSchema } from './place-api.schema';

/**
 * Yer çözüm SÖZLEŞMESİNİN kendi kuralları — DB'siz, saf `parse` davranışı.
 *
 * Sınanan sözler: **depo kimliği zarfa sızmaz** (19.9 güvenlik sınırı — uç `parse` ile süzer,
 * buradaki iddia o süzgecin kendisi), dört hâl ayrık tanınır, `ambiguous` en az iki seçenek taşır
 * (tek seçenekli bir "belirsizlik" belirsizlik değildir).
 *
 * Import GÖRELİ: şema `contracts/index.ts`ten henüz ihraç edilmiyor (satırı ana şerit ekleyecek).
 */

describe('PlaceResolutionSchema', () => {
  it('çözülmüş yer, saklanacak anahtarı (ülke + normalize kod) taşır; depo kimliği SIZMAZ', () => {
    const parsed = PlaceResolutionSchema.parse({
      kind: 'resolved',
      place: {
        country: 'FR',
        postalCode: '67000',
        placeName: 'Strasbourg',
        places: ['Strasbourg'],
        inRoute: true,
        // Motorun cevabında var, sözleşmede BİLEREK yok — istemci depo bilmez (19.9).
        warehouseId: 'c0ffee00-0000-4000-8000-000000000001',
        zoneId: 'c0ffee00-0000-4000-8000-000000000002',
      },
    });
    if (parsed.kind !== 'resolved') throw new Error('resolved bekleniyordu');
    expect(parsed.place).not.toHaveProperty('warehouseId');
    expect(parsed.place).not.toHaveProperty('zoneId');
    expect(parsed.place).toEqual({ country: 'FR', postalCode: '67000', placeName: 'Strasbourg', places: ['Strasbourg'], inRoute: true });
  });

  it('çok yerleşimli kodda ad NULL olabilir — yanlış ad, eksik addan kötüdür (19.17)', () => {
    const parsed = PlaceResolutionSchema.parse({
      kind: 'resolved',
      place: { country: 'FR', postalCode: '67800', placeName: null, places: ['Bischheim', 'Hœnheim'], inRoute: false },
    });
    if (parsed.kind !== 'resolved') throw new Error('resolved bekleniyordu');
    expect(parsed.place.placeName).toBeNull();
    expect(parsed.place.inRoute).toBe(false);
  });

  it('belirsizlik en az İKİ seçenek ister — tek adaylı hâl belirsizlik değildir', () => {
    const option = (country: 'FR' | 'DE') => ({
      country,
      postalCode: '67240',
      placeName: null,
      places: ['Bischwiller', 'Gries'],
      inRoute: country === 'FR',
    });
    expect(PlaceResolutionSchema.safeParse({ kind: 'ambiguous', options: [option('FR'), option('DE')] }).success).toBe(true);
    expect(PlaceResolutionSchema.safeParse({ kind: 'ambiguous', options: [option('FR')] }).success).toBe(false);
  });

  it('unknown yalın; unresolved sebep taşır ve sebep kümesi kapalı', () => {
    expect(PlaceResolutionSchema.safeParse({ kind: 'unknown' }).success).toBe(true);
    expect(PlaceResolutionSchema.safeParse({ kind: 'unresolved', reason: 'no_shipping_warehouse' }).success).toBe(true);
    expect(PlaceResolutionSchema.safeParse({ kind: 'unresolved', reason: 'ambiguous_zone' }).success).toBe(true);
    expect(PlaceResolutionSchema.safeParse({ kind: 'unresolved', reason: 'because' }).success).toBe(false);
    expect(PlaceResolutionSchema.safeParse({ kind: 'lost' }).success).toBe(false);
  });
});
