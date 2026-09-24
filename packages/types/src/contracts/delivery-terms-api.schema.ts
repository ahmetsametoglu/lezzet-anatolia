import { z } from 'zod';
import { CountryEnum } from '../primitives/enums.schema';

/**
 * İlan edilen teslimat tutarları, mobil `GET /api/v1/delivery-terms` ucunun sözleşmesi: tutarlar ayar satırıdır ve sözlüğe yazılsa ayar
 * değiştiği gün yasal sayfa eski sayıyı ilan ederdi. Sepetin tutarlarıyla karışmaz, çünkü burada anlatılan genel kuraldır ve kapsamı
 * kanaldan doğar.
 */
export const DeliveryTermsSchema = z.object({
  /** Kapıya teslimde asgari sepet (cent). */
  minBasketRouteCents: z.number().int().nonnegative(),
  /** Kargo siparişinde asgari sepet (cent) — **0 ise alt sınır yok**; ekran o hâlde cümleyi kurmaz. */
  minBasketShippingCents: z.number().int().nonnegative(),
  /** Ücretsiz kargo eşiği (cent). */
  freeShippingCents: z.number().int().nonnegative(),
  /** Kapıda ödemenin üst sınırı (cent) — üstünde ödeme sipariş sırasında alınır. */
  codMaxCents: z.number().int().nonnegative(),
  /**
   * Kargonun gidebildiği ülkeler; ayar değil veridir ve depolardan türer. Boş olabilir: hiç kargo deposu yoksa ekran kargo cümlesini
   * kurmaz.
   */
  shippingCountries: z.array(CountryEnum),
});

export type DeliveryTerms = z.infer<typeof DeliveryTermsSchema>;
