import { SettingsService, WarehouseService, type Db } from '@lezzet/database';
import type { Country } from '@lezzet/types';
import { pricingViewerOf } from '../catalog/pricing-viewer';
import { minBasketFor } from '../cart/min-basket';
import { settingScopeOf } from '../cart/setting-scope';
import {
  FREE_SHIPPING_THRESHOLD_DEFAULT,
  FREE_SHIPPING_THRESHOLD_KEY,
  SHIPPING_FEE_DEFAULT,
  SHIPPING_FEE_KEY,
} from '../cart/settings-keys';

/**
 * **MÜŞTERİYE İLAN EDİLEN TUTARLAR** — bilgi sayfalarının okuduğu tek kapı (18.08 · kullanıcı kararı).
 *
 * Sepet ve checkout bu ayarları zaten okuyordu; ilan eden metinler okumuyordu. Yasal "Teslimat ve
 * iade" sayfası, SSS ve posta kodu notu sayıları CÜMLENİN İÇİNE yazmıştı: *"Kargo ücreti 7,90 €'dur
 * ve 60 € üzeri siparişlerde alınmaz"*. İkisi de `settings` satırıdır ve operatör Ayarlar'dan
 * değiştirebilir — değiştirdiği gün sepet yeni sayıyı keser, bu üç metin eski sayıyı ilan etmeye
 * devam ederdi. Kimse fark etmezdi çünkü metin bir hesap yapmıyor, sadece yazıyor.
 *
 * ── NEDEN AYRI BİR KAPI, NEDEN SEPETİN OKUMASI DEĞİL ────────────────────────
 * Sepetin okuması bir SEPETİN kapsamıdır: bölge, depo, ülke satırları da konuşur. Bilgi sayfasında
 * sepet yok — orada anlatılan **genel kuraldır**. Kapsam bu yüzden yalnız KANALDAN doğuyor
 * (`settingScopeOf(viewer, {})`): B2B müşterisi kendi şartını okur, ziyaretçi perakende kuralını.
 * Bölge satırı olan bir eşiği "genel kural" diye ilan etmek, o bölgede olmayan müşteriye tutmayacak
 * bir söz vermek olurdu.
 *
 * ── ASGARİ SEPET İKİ DEĞER, ÇÜNKÜ İKİ KURAL VAR ────────────────────────────
 * `min-basket.ts` künyesi (kullanıcı kararı 10.08): **kargo siparişinin asgari sepeti yoktur** —
 * alt sınır aracın tura çıkması için konan lojistik bir tabandır, kargoda araç çıkmaz. Yasal metin
 * bugüne kadar *"her iki gönderim yolunda da geçerlidir"* diyordu ve bu KODUN SÖYLEDİĞİNİN TERSİYDİ.
 * İki değer ayrı taşınıyor ki metin hangisini yazacağını uydurmasın.
 */
export interface PublicDeliveryTerms {
  /** Kapıya teslimde asgari sepet (cent). */
  minBasketRouteCents: number;
  /** Kargo siparişinde asgari sepet (cent) — **0 ise alt sınır yok**, metin o hâlde cümleyi kurmaz. */
  minBasketShippingCents: number;
  /** Ücretsiz kargo eşiği (cent). */
  freeShippingCents: number;
  /** Kargo ücreti (cent). */
  shippingFeeCents: number;
  /** Kapıda ödemenin üst sınırı (cent) — üstünde ödeme sipariş sırasında alınır. */
  codMaxCents: number;
  /**
   * Kargonun gidebildiği ülkeler — *"nereye gönderiyoruz"* cümlesinin konusu.
   *
   * **Bir AYAR değil, VERİ** (`listShippingCountries` künyesi): ülke başına bir kargo deposu vardır
   * ve küme o depolardan türer. Metne elle yazılıydı, iki yüzey iki farklı şey söylüyordu.
   */
  shippingCountries: Country[];
}

/** Kapıda ödemenin üst sınırı (cent). Checkout'ta kapı, bilgi sayfasında ilan. */
export const COD_MAX_KEY = 'cod_max_cents';

/** Kapıda ödeme üst sınırının varsayılanı (cent) — ayar satırı yoksa geçerli. */
export const COD_MAX_DEFAULT = 50_000;

/**
 * Bilgi sayfalarının okuduğu tutarlar. `customerId` verilirse kapsamın kanal ekseni müşterinin
 * kendi kanalından çıkar — onaylı bir toptancı SSS'te kendi şartını okur, perakendeninkini değil.
 */
export async function readPublicDeliveryTerms(db: Db, customerId: string | null = null): Promise<PublicDeliveryTerms> {
  const settings = new SettingsService(db);
  const viewer = await pricingViewerOf(db, customerId);
  const scope = settingScopeOf(viewer, {});

  const [minBasketRouteCents, minBasketShippingCents, freeShippingCents, shippingFeeCents, codMaxCents, countries] =
    await Promise.all([
      minBasketFor(settings, 'route', scope),
      minBasketFor(settings, 'shipping', scope),
      settings.getNumber(FREE_SHIPPING_THRESHOLD_KEY, FREE_SHIPPING_THRESHOLD_DEFAULT, scope),
      settings.getNumber(SHIPPING_FEE_KEY, SHIPPING_FEE_DEFAULT, scope),
      settings.getNumber(COD_MAX_KEY, COD_MAX_DEFAULT, scope),
      new WarehouseService(db).listShippingCountries(),
    ]);

  return {
    minBasketRouteCents,
    minBasketShippingCents,
    freeShippingCents,
    shippingFeeCents,
    codMaxCents,
    shippingCountries: countries,
  };
}
