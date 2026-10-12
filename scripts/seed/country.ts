import { PriceService, ProductService, ProductVatRateService } from '@lezzet/database';
import { tabloDolu, type Db, type VaryantRef } from './shared';

// ── Ülke pazarı ──────────────────────────────────────────────────────────────────────────────────
// Almanya'daki tüketiciye yalnız Almanya oranı girilmiş ürün satılır; beslemede ürünlerin çoğu oranlıdır, iki ürün bilerek oransız kalır
// ki "satışta değil" hâli de görünsün. Oranlar uydurmadır (gıda %7, öteki %19), gerçek oranı operatör girer.

/** Oransız bırakılan aktif ürün sayısı; "Almanya oranı eksik" süzgecinin ve satılmama hâlinin örneği. */
const ORANSIZ_URUN = 2;
/** Almanya fiyatı alan boy sayısı ve fiyatın genel fiyattan farkı; ülke satırı ekranda genel fiyattan ayırt edilsin. */
const ALMANYA_FIYATLI_BOY = 2;
const ALMANYA_FARKI_CENTS = 50;

export async function seedCountryMarket(db: Db, varyantlar: readonly VaryantRef[]): Promise<void> {
  if (await tabloDolu(db, 'product_vat_rate')) {
    console.log('▸ ülke oranları zaten dolu — atlandı');
    return;
  }
  console.log('▸ ÜLKE PAZARI seed');

  // Ürün başına ilk boy; oran ürünün, fiyat boyundur.
  const ilkBoy = new Map<string, VaryantRef>();
  for (const v of varyantlar) if (v.status === 'active' && !ilkBoy.has(v.productId)) ilkBoy.set(v.productId, v);
  const prices = new PriceService(db);
  const liste = await prices.findListPricesMap(
    [...ilkBoy.values()].map((v) => v.id),
    'b2c',
  );
  const fiyatli = [...ilkBoy.values()].filter((v) => liste.get(v.id)?.general);
  const oranli = fiyatli.slice(0, Math.max(0, fiyatli.length - ORANSIZ_URUN));

  const rates = new ProductVatRateService(db);
  for (const v of oranli) await rates.set({ productId: v.productId, country: 'DE', vatRate: v.vatRate === 5.5 ? 7 : 19 });

  // Almanya fiyatı elle fiyatlanan üründe durur, çünkü otomatik fiyatlı ürünün ülke satırını hizalama yeniden yazar.
  const elle = new Set(
    (await new ProductService(db).listByIds(oranli.map((v) => v.productId))).filter((p) => !p.autoPrice).map((p) => p.id),
  );
  const almanyaFiyatli = oranli.filter((v) => elle.has(v.productId)).slice(0, ALMANYA_FIYATLI_BOY);
  for (const v of almanyaFiyatli) {
    const genel = liste.get(v.id)?.general;
    if (!genel) continue;
    await prices.setPrice({ variantId: v.id, channel: 'b2c', country: 'DE', amountCents: genel.amountCents + ALMANYA_FARKI_CENTS });
  }

  const yedi = oranli.filter((v) => v.vatRate === 5.5).length;
  console.log(
    `✓ ülke pazarı: Almanya oranı ${oranli.length} üründe (%7 · ${yedi}, %19 · ${oranli.length - yedi}) · ${fiyatli.length - oranli.length} ürün oransız · Almanya fiyatı ${almanyaFiyatli.length} boyda`,
  );
}
