import { percentOf } from '@lezzet/helper';

/**
 * Liste fiyatına göre indirim — SAF karar, DB'siz.
 *
 * "Kaça satıyorum" ile "listeden ne kadar indirdim" AYNI kararın iki yazımıdır ve ekranlarda ikisi
 * yan yana durur (teklif fiyatı, paket fiyatı, müşteriye özel fiyat). Formül üç ayrı yerde
 * yazılmıştı; yuvarlaması birinde `round`, ötekinde `floor`'du — aynı %10, iki ekranda iki farklı
 * kuruş demekti. Tek tanım burada yaşar.
 *
 * **Taban aynı olmalı:** ikisi de kanalın kendi tabanındadır (b2c KDV dahil, b2b hariç). Yüzde
 * hesabında KDV sadeleşir, bu yüzden dönüşüm gerekmez — ama TTC fiyatı HT listeyle karşılaştırmak
 * indirimi KDV oranı kadar şişirir. Çağıran ikisini aynı tabandan verir.
 */

/**
 * Fiyatın liste fiyatına göre indirim yüzdesi. Liste yoksa/sıfırsa oran YOKTUR (`null`) — uydurma
 * bir tabana göre indirim göstermek, olmayan bir hesabı doğruymuş gibi sunardı.
 *
 * Fiyat listeden PAHALIYSA negatif döner (zam). Gizlenmez: bazen bilinçli bir karardır (müşteriye
 * özel fiyat listenin üstünde olabilir), bazen hatadır — ikisi de görülmelidir.
 */
export function discountPercentOf(
  listCents: number | null | undefined,
  priceCents: number | null | undefined,
): number | null {
  if (listCents == null || listCents <= 0 || priceCents == null) return null;
  return ((listCents - priceCents) / listCents) * 100;
}

/**
 * İndirim yüzdesinden fiyat — yüzde kutusuna yazılınca fiyat bundan doğar.
 *
 * İndirim tutarı AŞAĞI yuvarlanır (`percentOf`): %30 istendiğinde 29,98 vermek, 30,02 vermekten
 * iyidir — eksik yönde yuvarlanan indirim işletme lehinedir ve müşteriye söylenen oranın altına
 * düşmez. Sonuç sıfırın altına inmez: negatif fiyat diye bir şey yok.
 */
export function priceFromDiscountPercent(
  listCents: number | null | undefined,
  discountPercent: number,
): number | null {
  if (listCents == null || listCents <= 0) return null;
  return Math.max(0, listCents - percentOf(listCents, discountPercent));
}
