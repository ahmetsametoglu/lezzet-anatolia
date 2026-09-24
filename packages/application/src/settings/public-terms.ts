import { SettingsService, WarehouseService, type Db } from '@lezzet/database';
import type { Country } from '@lezzet/types';
import { pricingViewerOf } from '../catalog/pricing-viewer';
import { minBasketFor } from '../cart/min-basket';
import { settingScopeOf } from '../cart/setting-scope';
import { FREE_SHIPPING_THRESHOLD_DEFAULT, FREE_SHIPPING_THRESHOLD_KEY } from '../cart/settings-keys';

/**
 * Müşteriye ilan edilen tutarların tek kapısı: bilgi sayfaları sayıları ayardan okur ki operatör değiştirdiğinde ilan eski sayıda kalmasın.
 * Kapsam yalnız kanaldan doğar, çünkü bilgi sayfasında sepet yoktur ve bölgeye bağlı bir eşiği genel kural diye ilan etmek tutmayacak
 * söz olurdu.
 */
export interface PublicDeliveryTerms {
  /** Kapıya teslimde asgari sepet (cent). */
  minBasketRouteCents: number;
  /** Kargo siparişinde asgari sepet (cent) — **0 ise alt sınır yok**, metin o hâlde cümleyi kurmaz. */
  minBasketShippingCents: number;
  /** Ücretsiz kargo eşiği (cent). */
  freeShippingCents: number;
  /** Kapıda ödemenin üst sınırı (cent) — üstünde ödeme sipariş sırasında alınır. */
  codMaxCents: number;
  /** Kargonun gidebildiği ülkeler; ayar değil veridir, ülke başına bir kargo deposu vardır ve küme depolardan türer. */
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

  const [minBasketRouteCents, minBasketShippingCents, freeShippingCents, codMaxCents, countries] =
    await Promise.all([
      minBasketFor(settings, 'route', scope),
      minBasketFor(settings, 'shipping', scope),
      settings.getNumber(FREE_SHIPPING_THRESHOLD_KEY, FREE_SHIPPING_THRESHOLD_DEFAULT, scope),
      settings.getNumber(COD_MAX_KEY, COD_MAX_DEFAULT, scope),
      new WarehouseService(db).listShippingCountries(),
    ]);

  return {
    minBasketRouteCents,
    minBasketShippingCents,
    freeShippingCents,
    codMaxCents,
    shippingCountries: countries,
  };
}
