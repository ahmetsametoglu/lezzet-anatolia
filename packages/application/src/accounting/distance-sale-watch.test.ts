import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from '@lezzet/database';
import { mustDelete, settingsSnapshot } from '@lezzet/database/testing';
import { DISTANCE_SALE_SETTINGS } from '@lezzet/domain-core';
import { watchDistanceSaleThreshold } from './distance-sale-watch';

/**
 * Eşik turu 2099'da koşar: o yılın siparişi yoktur, toplam yalnız açılış ayarından gelir ve haber anahtarı gerçek yılların haberine
 * değmez. Hizalama sayaçla verilir, çünkü gerçeği paylaşılan veritabanındaki bütün otomatik fiyatları yazardı.
 */
const db = serviceDb();
const settings = settingsSnapshot(db);
const YIL = 2099;
const now = new Date(`${YIL}-06-15T10:00:00Z`);

afterAll(async () => {
  await settings.restore();
  await mustDelete(db, 'notification', (q) =>
    q.eq('kind', 'distance_sale_threshold').like('dedupe_key', `distance-sale-threshold:${YIL}%`),
  );
});

/** Yılın toplamı eşiğin yüzdesi olarak; eşik 10 000 €, uyarılar %80 ve %95. */
async function toplam(yuzde: number): Promise<void> {
  await settings.override(DISTANCE_SALE_SETTINGS.thresholdCents.key, 1_000_000);
  await settings.override(DISTANCE_SALE_SETTINGS.firstWarningPercent.key, 80);
  await settings.override(DISTANCE_SALE_SETTINGS.secondWarningPercent.key, 95);
  await settings.override(DISTANCE_SALE_SETTINGS.openingYear.key, YIL);
  await settings.override(DISTANCE_SALE_SETTINGS.openingCents.key, yuzde * 10_000);
  await settings.override(DISTANCE_SALE_SETTINGS.openingPreviousCents.key, 0);
}

async function haberSayisi(seviye: 'first' | 'second' | 'exceeded'): Promise<number> {
  const { data, error } = await db
    .from('notification')
    .select('id')
    .eq('kind', 'distance_sale_threshold')
    .eq('dedupe_key', `distance-sale-threshold:${YIL}:${seviye}`);
  if (error) throw error;
  return data.length;
}

const hizalamasiz = async () => ({ changes: [], truncated: false });

describe('uzaktan satış eşiği turu', () => {
  // Tur her gün yeniden haber yazarsa ya da seviye yükselince yenisini duyurmazsa kırmızıya döner.
  it('ulaşılan seviye yönetime ve muhasebeye bir kez haber olur, yükselen seviye ayrıca duyurulur', async () => {
    const tur = { previous: { destinationTaxation: false }, now, reprice: hizalamasiz };
    await toplam(85);
    expect(await watchDistanceSaleThreshold(db, tur)).toMatchObject({ warning: 'first', destinationTaxation: false });
    const alici = await haberSayisi('first');
    expect(alici).toBeGreaterThan(0);

    await watchDistanceSaleThreshold(db, tur);
    expect(await haberSayisi('first')).toBe(alici);

    await toplam(110);
    expect(await watchDistanceSaleThreshold(db, tur)).toMatchObject({ warning: 'exceeded', destinationTaxation: true });
    expect(await haberSayisi('exceeded')).toBe(alici);
    expect(await haberSayisi('second')).toBe(0);
  });

  // Vergilendirme değişince otomatik fiyatlar hizalanmazsa ya da her tur kataloğu yeniden yazarsa kırmızıya döner.
  it('vergilendirme önceki turdan bu yana değiştiyse fiyatlar hizalanır, değişmediyse dokunulmaz; önceki tur yoksa hizalanır', async () => {
    let hizalama = 0;
    const reprice = async () => {
      hizalama += 1;
      return { changes: [{}, {}], truncated: false };
    };
    await toplam(85);
    expect(await watchDistanceSaleThreshold(db, { previous: { destinationTaxation: false }, now, reprice })).toMatchObject({ repriced: 0 });
    expect(hizalama).toBe(0);

    await toplam(110);
    expect(await watchDistanceSaleThreshold(db, { previous: { destinationTaxation: false }, now, reprice })).toMatchObject({ repriced: 2 });
    expect(hizalama).toBe(1);
    await watchDistanceSaleThreshold(db, { previous: { destinationTaxation: true }, now, reprice });
    expect(hizalama).toBe(1);
    await watchDistanceSaleThreshold(db, { previous: null, now, reprice });
    expect(hizalama).toBe(2);
  });
});
