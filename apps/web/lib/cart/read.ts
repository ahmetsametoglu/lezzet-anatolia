import 'server-only';
import { serviceDb } from '@lezzet/database';
import { getCartView as getCartViewFor, type CartEntry, type CartView } from '@lezzet/application';
import type { Locale } from '@lezzet/i18n';
import { getPackagesByIds } from '@/lib/storefront/packages';

/**
 * Sepet okuması (08.4) — **geçiş köprüsü** (terfi aşama 1/3'ün benimsemesi, 10.08).
 *
 * Gövde `@lezzet/application/cart/read`te; künyesi orada (niyetin neden her okumada yeniden
 * çözüldüğü, çıpalı partinin nasıl kontrol edildiği, ayar kapsamının neden checkout'la ortak
 * olduğu). Burada kalan tek şey WEB'E ÖZGÜ olan iki bağ:
 *
 * · **`db`** — paket `serviceDb`yi çağırandan alır (ortak deseni), köprü bağlar.
 * · **`bundles`** — paket çözümü kapısı (`CartBundlePort`). Kapının kendisi de artık pakette
 *   (`lib/storefront/packages` köprüsü); geçilmeseydi paket satırı sepette ENGELLİ görünürdü.
 *
 * **Neden köprüye indi.** İki nüsha da canlıydı: web sepeti buradan, mobil arka uç paketten
 * okuyordu — 394 satırlık bir kuralın iki kopyası. Ayrışması bir olasılık değil bir zaman
 * sorusuydu; 10.08'de "bu adrese hiç gelemeyen kalem asgari sepete sayılmaz" kuralı eklenirken
 * ayrışacaktı: aynı sepet webde eşiği tutmuş, telefonda tutmamış görünürdü.
 *
 * Davranışta tek fark bir OKUMA TASARRUFU: görüntüleyen (kanal + özel fiyat kimliği) pakette bir
 * kez çözülüp hem ayar kapsamına hem fiyat bağlamına veriliyor; web nüshası aynı profil satırını
 * iki kez okuyordu. Sonuç aynı, sorgu bir eksik.
 */
export function getCartView(
  locale: Locale,
  entries: readonly CartEntry[],
  opts: Omit<NonNullable<Parameters<typeof getCartViewFor>[3]>, 'bundles'> = {},
): Promise<CartView> {
  return getCartViewFor(serviceDb(), locale, entries, { ...opts, bundles: getPackagesByIds });
}
