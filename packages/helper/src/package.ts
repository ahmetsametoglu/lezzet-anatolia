/**
 * HAZIR PAKETİN İKİ YÜZEYDE ORTAK KURALLARI (terfi 14.09) — native paket ekranları (vitrin şeridi, paket listesi,
 * paket detayı) ve web'in telefon görünümü aynı iki kuralı okur. Önce iki yüzeyde ayrı yazılıydılar (native
 * `lib/places/place-view.ts` `packageStockStatus`, web `components/customer/ui/package-card.tsx`
 * `stockStatusOfRoute`); aynı eşleme iki dosyada durunca 21.08'deki `unavailable` düzeltmesi gibi bir değişiklik
 * birine yazılıp ötekinde unutulurdu (CLAUDE §1).
 */

/**
 * Paket detayındaki adet seçicinin tavanı — tasarım şablonunun kendi kuralı (`Math.min(20, …)`). Tavan stoktan
 * değil şablondan gelir: paket bütün olarak satılır, teklif partisi kavramı yoktur. Parametrik.
 */
export const PACKAGE_QUANTITY_MAX = 20;

/**
 * **Paketin YOLU → ürün kartının stok dili** (19.22 ekran ucu · 21.08 düzeltmesi).
 *
 * Yol (`CartLineRoute`) ile stok hâli (`StockStatus`) iki ayrı sözlük ama aynı soruyu soruyor. Paketin yolunu
 * ürünün hâline çevirmek, pakete ikinci bir cümle ailesi yazmaktan iyidir: müşteri aynı bilgiyi ürün kartında ve
 * paket kartında farklı kelimelerle okumamalı. Çıkan hâl yer işaretinin kurucusuna (`placeMarkOf`) gider.
 *
 *   `shipping`                            → `shipping` — kargoyla gelir.
 *   `not_shippable_here` · `unavailable`  → `elsewhere`. İkincisi de "başka yerde"dir: kalemler iki depoya
 *                                           dağılmışsa her kalem ağda VARDIR (`soldOut` false) ama hiçbir havuz
 *                                           tam takım veremez; "Stokta" demek alınamayan paketi alınabilir
 *                                           gösterirdi (21.08).
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
