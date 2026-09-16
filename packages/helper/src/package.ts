/**
 * HAZIR PAKETİN İKİ YÜZEYDE ORTAK KURALLARI — native paket ekranları (vitrin şeridi, paket listesi, paket
 * detayı) ve web'in kartları aynı iki kuralı okur.
 *
 * Burada durmasının sebebi: aynı eşleme iki yüzeyde ayrı yazılırsa bir düzeltme birine yazılıp ötekinde
 * unutulur (`CLAUDE.md §1`).
 */

/**
 * Paket detayındaki adet seçicinin tavanı — stoktan değil şablondan gelir, çünkü paket bütün olarak satılır ve
 * teklif partisi kavramı yoktur. Parametrik.
 */
export const PACKAGE_QUANTITY_MAX = 20;

/**
 * **Paketin YOLU → ürün kartının stok dili.**
 *
 * Yol (`CartLineRoute`) ile stok hâli (`StockStatus`) iki ayrı sözlük ama aynı soruyu soruyor. Paketin yolunu
 * ürünün hâline çevirmek, pakete ikinci bir cümle ailesi yazmaktan iyidir: müşteri aynı bilgiyi ürün kartında ve
 * paket kartında farklı kelimelerle okumamalı. Çıkan hâl yer işaretinin kurucusuna (`placeMarkOf`) gider.
 *
 *   `shipping`                            → `shipping` — kargoyla gelir.
 *   `not_shippable_here` · `unavailable`  → `elsewhere`. İkincisi de "başka yerde"dir: kalemler iki depoya
 *                                           dağılmışsa her kalem ağda VARDIR (`soldOut` false) ama hiçbir havuz
 *                                           tam takım veremez; "Stokta" demek alınamayan paketi alınabilir
 *                                           gösterirdi.
 *   `local` · `null`                      → `null` — iyi haber sessizdir; yer bilinmiyorsa da susulur.
 *
 * `soldOut` burada değil, ÇAĞIRANDA önce bakılır: hiçbir depoda yokken "bu adrese gelmez" demek cevabı olmayan
 * bir soruya cevap vermektir. Rota içi/dışı ayrımı da burada yapılmaz — `elsewhere`in iki alt sebebini
 * `placeMarkOf` (`elsewhereReasonOf`) ayırır; motor ayıramaz, çünkü rota içindeki müşterinin soğuk zincirli
 * paketi yerelde bitince de `not_shippable_here` döner ve o hâl geçicidir.
 *
 * `route` bir `CartLineRoute`tur (`@lezzet/types`); bu paket ona bağlı değil, bakılan değerler adıyla yazılı.
 */
export function packageRouteStatusOf(route: string | null): 'shipping' | 'elsewhere' | null {
  if (route === 'shipping') return 'shipping';
  if (route === 'not_shippable_here' || route === 'unavailable') return 'elsewhere';
  return null;
}
