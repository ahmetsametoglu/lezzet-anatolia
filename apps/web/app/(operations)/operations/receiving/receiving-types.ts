import type { IntakeDifference, IntakeWarning } from '@lezzet/application';

// Mal kabul masasının görünüm modeli (10.4).
// Tasarım: `design/project/Operasyon - Depo Stok Giris.dc.html` (*"· web"*).
//
// **Fiyat alanı YOK ve olamaz:** depocunun yolu (`receiveGoods`) fiyat kabul etmiyor ve bu bir
// ekran kuralı değil TİP sınırı (`IntakeFormLine`'da `unitCostCents` yok). Buraya bir maliyet
// alanı eklemek, kapının reddedeceği bir şeyi ekranda toplamak olurdu.

/** Kabul bekleyen tedarik siparişi — sol listedeki kart. */
export interface PendingPurchase {
  purchaseOrderId: string;
  referenceNo: string | null;
  supplierName: string;
  /** Kaç kalem ısmarlandı. */
  lineCount: number;
  /** Kaç kalemin malı hâlâ gelmedi — "3/5 girildi" ilerlemesi bundan doğar. */
  missingLineCount: number;
  /** Sipariş gönderileli kaç gün oldu; "14 gündür bekliyor" uyarısı. */
  ageDays: number | null;
  /** Kısmen geldi mi — tasarımın "1 kalemi geldi" hâli. */
  isPartial: boolean;
}

/** Kabul tablosundaki bir satır: beklenen ↔ gelen. */
export interface IntakeRow {
  variantId: string;
  title: string;
  /** Siparişte ısmarlanan adet; siparişsiz kabulde `null` (karşılaştırılacak bir şey yok). */
  expectedQty: number | null;
  /** Depocunun saydığı adet. `null` = henüz girilmedi (0 DEĞİL — "gelmedi" ayrı bir karardır). */
  receivedQty: number | null;
  expiryDate: string;
  lotNumber: string;
  location: string;
  /**
   * "Gelmedi" işareti — tasarımın kuralı: *"eksik gelen satır boş bırakılmaz, 'gelmedi' denir"*.
   * Boş satır "henüz saymadım" demektir ve ikisi karışırsa yarım kabul tam sanılır.
   */
  isMissing: boolean;
}

export interface ReceivingData {
  pending: PendingPurchase[];
  /** Depo adı — kapsam tek depoysa dolu. Yöneticide `null`: depo bitirme diyaloğunda seçilir. */
  warehouseName: string | null;
  warehouseId: string | null;
  /** Yöneticinin seçebileceği depolar; depocuda boş (kimlikten gelir, seçim yok). */
  warehouseOptions: { id: string; name: string }[];
  /**
   * Siparişsiz kabulde seçilecek tedarikçiler — doğal tavanlı küme (operatörün elle kurduğu
   * liste), tek turda okunuyor ve sayfalanmıyor (`CLAUDE §1`).
   */
  suppliers: { id: string; name: string }[];
}

/** Kabulün sonucu — uyarılar ve farklar ekrana taşınır, ikisi de İŞ DURDURMAZ. */
export interface ReceiveOutcome {
  warnings: IntakeWarning[];
  differences: IntakeDifference[];
  /** Kaç parti yazıldı. */
  batches: number;
}
