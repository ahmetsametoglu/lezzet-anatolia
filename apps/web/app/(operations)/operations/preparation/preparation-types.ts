import type { PreparationLine, PreparationOrder } from '@lezzet/application';

// Hazırlık masasının görünüm modeli (10.1–10.3).
//
// **Kapının tipleri OLDUĞU GİBİ kullanılıyor, yeniden yazılmıyor** (`CLAUDE §1`): `PreparationOrder`
// ve `PreparationLine` zaten bu ekran için biçilmiş — para alanı taşımıyorlar, adres taşımıyorlar.
// Üstüne eklenen tek şey ekranın kendi türetimleri.
//
// **Para alanı EKLENMEZ ve eklenemez:** kapı onu hiç döndürmüyor (`preparation.ts` künyesi —
// "dönen görünüm modelinde para alanı YOKTUR"). Buraya bir `totalCents` yazmak, ekranın kendi
// başına ikinci bir okuma yapması demek olurdu; rol duvarı o an delinirdi.

export interface PreparationLineView extends PreparationLine {
  /** Ekranda okunan künye: "Kayseri Mantısı · 500 g" — boy yoksa yalnız ad. */
  title: string;
  /** Kalan adet — `orderedQty - pickedQty`. Sıfır ise satır toplanmış demektir. */
  remainingQty: number;
  /** Toplanmış mı — tasarımın "toplandı ✓" rozeti. */
  isPicked: boolean;
  /**
   * Partiye kilitli teklif kalemi mi. Kilitliyse öneri değil ZORUNLULUK: parti değiştirme
   * seçeneği o satırda **hiç sunulmaz** (tasarımın etkileşim sözleşmesi).
   */
  isPinned: boolean;
  /** Önerilen partiler istenen adedi karşılamıyor — fiziksel eksik sinyali. */
  hasShortfall: boolean;
}

/**
 * Kuyruğun üç kulvarı (10.9). Ayrım hazırlığın NE ZAMAN gerektiğine göre:
 * · `overdue` — günü geçmiş, hâlâ hazırlanmamış. Dünün işi bugünün önüne geçer.
 * · `today` — bugün teslim edilecek.
 * · `shipping` — günü OLMAYAN kargo siparişi; takvimde yeri yok ama hazırlanması gerekiyor.
 *
 * İleri tarihli sipariş bir kulvara girmez — kuyruğa hiç alınmaz.
 */
export type PreparationLane = (typeof PREPARATION_LANES)[number];
export const PREPARATION_LANES = ['overdue', 'today', 'shipping'] as const;

export interface PreparationOrderView extends Omit<PreparationOrder, 'lines'> {
  lines: PreparationLineView[];
  /** Hangi kulvarda — kuyruk sütunu satırları buna göre gruplar. */
  lane: PreparationLane;
  /** "3 kalem · 84 paket" — paket sayısı kalemlerin adet toplamı. */
  totalQty: number;
  /** Tüm kalemler toplandı mı; sipariş "HAZIR"a ancak o zaman geçer. */
  isComplete: boolean;
}

export interface PreparationData {
  orders: PreparationOrderView[];
  /** Başlıktaki "Bugün hazırlanacak 9 · hazır 3" sayacı. */
  readyCount: number;
  /** Kuyruğun süzüldüğü teslim günü (ISO tarih) — başlıkta yazılı. */
  deliveryDate: string;
  /**
   * Depo adı — başlıkta "Strasbourg deposu". **Artık daima dolu** (10.7): kuyruk tek bir deponun
   * kuyruğudur, depo-üstü hâl kalmadı. Depo seçilmemişken sayfa bu veriyi hiç kurmaz.
   */
  warehouseName: string;
}

/**
 * **Depo seçim kartı** (10.8) — boş kapı ekranının yerini alan özet.
 *
 * Kart bir SEÇİM aracıdır ve seçimi bilgiyle besler: operatör hangi depoda iş olduğunu görerek
 * seçsin, adını hatırlayarak değil. Üç sayı da hazırlığın kendi sorularıdır — para, stok, ciro
 * burada YOKTUR (rol duvarı bu ekranda da geçerli).
 */
export interface WarehouseChoiceView {
  id: string;
  /** Belge öneki (`STR`) — kart üstünde, kod okunarak da tanınır. */
  code: string;
  name: string;
  /** Bugün teslim edilecek, henüz hazırlanmamış sipariş. */
  today: number;
  /** Günü OLMAYAN kargo siparişi — takvimde yeri yok, ama hazırlanması gerekiyor. */
  shipping: number;
  /** Günü GEÇMİŞ ve hâlâ hazırlanmamış sipariş — bir gecikme işareti. */
  overdue: number;
}
