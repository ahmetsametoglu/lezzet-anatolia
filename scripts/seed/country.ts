import { PriceService, ProductService, ProductVatRateService } from '@lezzet/database';
import { tabloDolu, type Db, type VaryantRef } from './shared';

// ── Ülke pazarı ──────────────────────────────────────────────────────────────────────────────────
// Almanya'daki tüketiciye yalnız Almanya oranı girilmiş ürün satılır; besleme birkaç ürüne oran verir ki satılan ve satılmayan ürün
// ekranda yan yana görünsün. Oranlar uydurmadır (gıda %7, hazır tüketim %19), gerçek oranı operatör girer.

/** Almanya oranı alan gıda ürünü sayısı; kalanlar "Almanya oranı eksik" süzgecinin örneğidir. */
const GIDA_SAYISI = 5;
/** Almanya fiyatının genel fiyattan farkı; ülke satırı ekranda genel fiyattan ayırt edilsin. */
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

  const gida = fiyatli.filter((v) => v.vatRate === 5.5).slice(0, GIDA_SAYISI);
  const hazir = fiyatli.filter((v) => v.vatRate !== 5.5).slice(0, 1);
  const rates = new ProductVatRateService(db);
  for (const v of gida) await rates.set({ productId: v.productId, country: 'DE', vatRate: 7 });
  for (const v of hazir) await rates.set({ productId: v.productId, country: 'DE', vatRate: 19 });

  // Almanya fiyatı elle fiyatlanan üründe durur, çünkü otomatik fiyatlı ürünün ülke satırını hizalama yeniden yazar.
  const elle = new Set((await new ProductService(db).listByIds(gida.map((v) => v.productId))).filter((p) => !p.autoPrice).map((p) => p.id));
  const almanyaFiyatli = gida.find((v) => elle.has(v.productId));
  const genel = almanyaFiyatli ? liste.get(almanyaFiyatli.id)?.general : null;
  if (almanyaFiyatli && genel) {
    await prices.setPrice({
      variantId: almanyaFiyatli.id,
      channel: 'b2c',
      country: 'DE',
      amountCents: genel.amountCents + ALMANYA_FARKI_CENTS,
    });
  }
  console.log(
    `✓ ülke pazarı: Almanya oranı ${gida.length} üründe %7, ${hazir.length} üründe %19 · Almanya fiyatı ${almanyaFiyatli ? `1 boyda (${almanyaFiyatli.ad})` : 'yok (elle fiyatlı oranlı ürün yok)'}`,
  );
}
