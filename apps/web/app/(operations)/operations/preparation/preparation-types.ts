import type { PreparationLine, PreparationOrder } from '@/lib/order/preparation';

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

export interface PreparationOrderView extends Omit<PreparationOrder, 'lines'> {
  lines: PreparationLineView[];
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
  /** Depo adı — başlıkta "Strasbourg deposu"; kapsam tek depoysa dolu, depo-üstü ise `null`. */
  warehouseName: string | null;
}

/**
 * Kalem başına kuryenin/depocunun ekranda kurduğu seçim.
 *
 * `null` = "öneriye dokunulmadı" — onayda sistemin önerdiği partiler gider. Dolu ise operatör
 * sapmış demektir (10.2) ve giden şey onun yazdığıdır. İkisini ayırmak şart: boş diziyi
 * "sapma yok" saymak, kalemin hiç toplanmadığını söyleyen bir seçimle karışırdı.
 */
export type PickDraft = { stockId: string; qty: number }[] | null;
