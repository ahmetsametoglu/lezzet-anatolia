import { z } from 'zod';
import { CountryEnum } from '../primitives/enums.schema';

/**
 * İLAN EDİLEN TESLİMAT TUTARLARI — mobil `GET /api/v1/delivery-terms` ucunun sözleşmesi (18.08).
 *
 * ── NEDEN BİR UÇ, NEDEN SÖZLÜKTE DURMUYOR ───────────────────────────────────
 * Kargo ücreti, ücretsiz kargo eşiği, asgari sepet ve kapıda ödeme tavanı `settings` satırıdır;
 * operatör Ayarlar'dan değiştirir. Bugüne kadar bu sayılar bilgi metinlerinin İÇİNE yazılıydı
 * ("Kargo ücreti 7,90 €'dur ve 60 € üzeri siparişlerde alınmaz") — yani sözlükte donmuştu. Ayar
 * değiştiği gün sepet yeni sayıyı keser, yasal sayfa eski sayıyı ilan etmeye devam ederdi.
 *
 * ── SEPET ZARFININ TUTARLARIYLA KARIŞTIRILMAZ ───────────────────────────────
 * `CartViewSchema` de `freeShippingCents`/`minBasketCents` taşıyor ama o BİR SEPETİN kapsamıdır
 * (bölge, depo, ülke satırları konuşur). Bu uç sepet bilmez: bilgi sayfasında anlatılan **genel
 * kuraldır** ve kapsamı yalnız kanaldan doğar (`readPublicDeliveryTerms` künyesi).
 *
 * ── ASGARİ SEPET İKİ ALAN ───────────────────────────────────────────────────
 * Kargo siparişinin asgari sepeti yoktur (kullanıcı kararı 10.08 · `min-basket.ts`). Tek alana
 * indirilseydi metin hangi yola hangi sınırın geçerli olduğunu uydurmak zorunda kalırdı — nitekim
 * eski yasal metin *"her iki gönderim yolunda da geçerlidir"* diyordu ve bu yanlıştı.
 */
export const DeliveryTermsSchema = z.object({
  /** Kapıya teslimde asgari sepet (cent). */
  minBasketRouteCents: z.number().int().nonnegative(),
  /** Kargo siparişinde asgari sepet (cent) — **0 ise alt sınır yok**; ekran o hâlde cümleyi kurmaz. */
  minBasketShippingCents: z.number().int().nonnegative(),
  /** Ücretsiz kargo eşiği (cent). */
  freeShippingCents: z.number().int().nonnegative(),
  /** Kargo ücreti (cent). */
  shippingFeeCents: z.number().int().nonnegative(),
  /** Kapıda ödemenin üst sınırı (cent) — üstünde ödeme sipariş sırasında alınır. */
  codMaxCents: z.number().int().nonnegative(),
  /**
   * Kargonun gidebildiği ülkeler — ayar değil VERİ (ülke başına bir kargo deposu). Metne elle
   * yazılıydı ve iki yüzey iki farklı şey söylüyordu; artık depolardan türüyor.
   *
   * **Boş olabilir**: hiç kargo deposu yoksa bölge dışına satış da yok. Ekran o hâlde kargo
   * cümlesini hiç kurmaz — "hiçbir yere" diye yazmaz, susar.
   */
  shippingCountries: z.array(CountryEnum),
});

export type DeliveryTerms = z.infer<typeof DeliveryTermsSchema>;
