import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, ShippingBoxService, WarehouseService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { ShippingQuote } from '@lezzet/sendcloud';
import { quoteShipping } from './quote';
import type { ShippingRateProvider } from './port';
import { providerStub } from './provider.testkit';

/**
 * KARGO TEKLİFİ — TEK KAPI (07.12).
 *
 * Sınanan beş değişmez:
 *   1. Ölçüsüz kalem teklifi DURDURUR — tahmin edilmiş bir ölçü tarifeye girer.
 *   2. Kutusuz depo teklif üretemez — uydurulmuş kutu da tarifeye girer.
 *   3. ⚠ ÇOK KUTULU sipariş yalnız ÇOK KOLİ DESTEKLEYEN seçenekleri görür. Canlı ölçümde
 *      (28.08) seçeneklerin yalnız 10/17'si destekliyordu ve en ucuz ikisi desteklemiyordu:
 *      süzgeç olmasa müşteri en ucuzu seçer, etiket satın alma anında reddedilir ve sipariş
 *      SEVK EDİLEMEZ kalırdı.
 *   4. Sağlayıcı düşünce teklif YOK ama yol kapanmaz — çağıran sabit tarifeye DÜŞTÜĞÜNÜ bilir.
 *   5. Fiyatsız seçenek listede durmaz.
 */
const db = serviceDb();
const stamp = Date.now();
const warehouseIds: string[] = [];
const productIds: string[] = [];
const categoryIds: string[] = [];
let warehouseId: string;
let olculuId: string;
let olcusuzId: string;

/** Sahte sağlayıcı — test AĞA ÇIKMAZ; dönen liste testin kendi kurgusudur. */
function fakeProvider(options: ShippingQuote[], opts: { throws?: boolean } = {}): ShippingRateProvider & { parcels: number[] } {
  const parcels: number[] = [];
  // Bu dosyanın konusu TEKLİF — portun ötekileri çağrılırsa test yanlış yazılmış demektir.
  return {
    ...providerStub({
      quote: async (args) => {
        parcels.push(args.parcels.length);
        if (opts.throws) throw new Error('sağlayıcı düştü');
        return options;
      },
    }),
    parcels,
  };
}

const secenek = (over: Partial<ShippingQuote> = {}): ShippingQuote => ({
  code: 'x:standard',
  carrierCode: 'x',
  carrierName: 'X',
  name: 'Standart',
  priceCents: 990,
  currency: 'EUR',
  leadTimeHours: 48,
  lastMile: 'home_delivery',
  signature: false,
  tracked: true,
  ecoDelivery: false,
  multicollo: true,
  ...over,
});

beforeAll(async () => {
  const wh = await createTestWarehouse(db, { label: 'KRG' });
  warehouseId = wh.id;
  warehouseIds.push(wh.id);
  // Deponun adresi ZORUNLU: gönderici olmadan tarife sorulamaz.
  await new WarehouseService(db).update({ id: wh.id, address: { line1: 'Test sok. 1', postalCode: '67000', city: 'Strasbourg' } });

  const cat = await new CategoryService(db).create({ name: { tr: `Kargo teklifi ${stamp}` } });
  categoryIds.push(cat.id);

  const { variants } = await new ProductService(db).create({
    name: { tr: `Teklif ürünü ${stamp}` },
    categoryId: cat.id,
    variants: [
      { label: { tr: 'ölçülü' }, packedWeightG: 500, packedLengthMm: 140, packedWidthMm: 90, packedHeightMm: 60 },
      { label: { tr: 'ölçüsüz' } },
    ],
  });
  productIds.push(variants[0]!.productId);
  olculuId = variants[0]!.id;
  olcusuzId = variants[1]!.id;
});

afterAll(async () => {
  await purgeTestData(db, { productIds, categoryIds, warehouseIds });
});

async function kutuEkle(over: { maxContentG?: number | null } = {}): Promise<string> {
  const row = await new ShippingBoxService(db).insert({
    warehouseId,
    name: `Teklif kutusu ${stamp}-${Math.round(Math.random() * 1e6)}`,
    lengthMm: 300,
    widthMm: 200,
    heightMm: 150,
    tareG: 130,
    maxContentG: over.maxContentG === undefined ? 10_000 : over.maxContentG,
  });
  return row.id;
}

const paris = { countryCode: 'FR', postalCode: '75001', city: 'Paris' };

describe('quoteShipping — ön koşullar', () => {
  it('KUTUSUZ depo teklif üretemez — uydurulmuş kutu tarifeye girerdi', async () => {
    const p = fakeProvider([secenek()]);
    const sonuc = await quoteShipping(db, p, { warehouseId, to: paris, items: [{ variantId: olculuId, qty: 1 }] });
    expect(sonuc.status).toBe('no_box');
    // Sağlayıcıya HİÇ gidilmedi: eksik girdiyle ağa çıkmak boşuna bir tur.
    expect(p.parcels).toHaveLength(0);
  });

  it('ÖLÇÜSÜZ kalem teklifi durdurur ve hangi varyant olduğunu söyler', async () => {
    await kutuEkle();
    const p = fakeProvider([secenek()]);
    const sonuc = await quoteShipping(db, p, {
      warehouseId,
      to: paris,
      items: [{ variantId: olculuId, qty: 1 }, { variantId: olcusuzId, qty: 1 }],
    });
    expect(sonuc).toMatchObject({ status: 'unmeasured', variantIds: [olcusuzId] });
    expect(p.parcels).toHaveLength(0);
  });

  it('boş sepet sağlayıcıya gitmez', async () => {
    const p = fakeProvider([secenek()]);
    const sonuc = await quoteShipping(db, p, { warehouseId, to: paris, items: [] });
    expect(sonuc).toMatchObject({ status: 'ok', parcelCount: 0 });
    expect(p.parcels).toHaveLength(0);
  });
});

describe('quoteShipping — teklif', () => {
  it('tek kutuda TÜM seçenekler döner, ucuzdan pahalıya', async () => {
    const p = fakeProvider([secenek({ code: 'pahalı', priceCents: 1500 }), secenek({ code: 'ucuz', priceCents: 490, multicollo: false })]);
    const sonuc = await quoteShipping(db, p, { warehouseId, to: paris, items: [{ variantId: olculuId, qty: 1 }] });
    expect(sonuc.status).toBe('ok');
    expect(sonuc.status === 'ok' && sonuc.options.map((o) => o.code)).toEqual(['ucuz', 'pahalı']);
    expect(sonuc.status === 'ok' && sonuc.parcelCount).toBe(1);
    // Sağlayıcıya TEK koli gitti.
    expect(p.parcels).toEqual([1]);
  });

  it('⚠ ÇOK KUTULU siparişte çok koli DESTEKLEMEYEN seçenek listeden düşer', async () => {
    // Küçük tavanlı kutu: iki paket iki kutuya bölünür.
    await new ShippingBoxService(db).insert({
      warehouseId,
      name: `Dar kutu ${stamp}`,
      lengthMm: 300,
      widthMm: 200,
      heightMm: 150,
      tareG: 100,
      maxContentG: 600,
    });
    // Var olan geniş kutuları kapat ki plan dar kutuyu kullansın.
    const svc = new ShippingBoxService(db);
    for (const b of await svc.listForWarehouse(warehouseId)) {
      if (!b.name.startsWith(`Dar kutu ${stamp}`)) await svc.setActive(b.id, false);
    }

    const p = fakeProvider([
      secenek({ code: 'ucuz-tek-koli', priceCents: 490, multicollo: false }),
      secenek({ code: 'pahalı-çok-koli', priceCents: 1500, multicollo: true }),
    ]);
    const sonuc = await quoteShipping(db, p, { warehouseId, to: paris, items: [{ variantId: olculuId, qty: 2 }] });

    expect(sonuc.status === 'ok' && sonuc.parcelCount).toBe(2);
    // En ucuz seçenek düştü ÇÜNKÜ çok koli desteklemiyor — müşteriye gösterilseydi etiket
    // satın alma anında reddedilir, sipariş sevk edilemez kalırdı.
    expect(sonuc.status === 'ok' && sonuc.options.map((o) => o.code)).toEqual(['pahalı-çok-koli']);
    expect(p.parcels).toEqual([2]);
  });

  it('FİYATSIZ seçenek listede durmaz — tutarı olmayan satır cevaplanamayacak bir soru sorar', async () => {
    const p = fakeProvider([secenek({ code: 'fiyatsız', priceCents: null }), secenek({ code: 'fiyatlı' })]);
    const sonuc = await quoteShipping(db, p, { warehouseId, to: paris, items: [{ variantId: olculuId, qty: 1 }] });
    expect(sonuc.status === 'ok' && sonuc.options.map((o) => o.code)).toEqual(['fiyatlı']);
  });

  it('sağlayıcı düşerse teklif YOK ama yol kapanmaz — çağıran düştüğünü BİLİR', async () => {
    const p = fakeProvider([], { throws: true });
    const sonuc = await quoteShipping(db, p, { warehouseId, to: paris, items: [{ variantId: olculuId, qty: 1 }] });
    expect(sonuc).toMatchObject({ status: 'provider_error' });
  });
});
