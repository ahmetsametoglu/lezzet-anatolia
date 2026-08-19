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
  /** Kuyruğun sahibi — tesis şeridinde hangi çipin seçili çizileceğini bu belirler. */
  warehouseId: string;
}

/**
 * **Bir deponun bekleyen hazırlık işi** (10.8) — karşılama ekranının satırı ve kuyruk ekranının
 * kalıcı şeridi AYNI okumadan beslenir. İki ayrı okuma, bir gün ayrışan iki sayı demekti.
 *
 * Sayıların hepsi hazırlığın kendi sorularıdır — para, ciro, stok değeri burada YOKTUR: rol duvarı
 * (`design/pages/depo-hazirlik.md §6`) seçim ekranında da geçerli ve okuma o alanları hiç
 * getirmiyor.
 */
export interface WarehouseWorkView {
  id: string;
  /** Belge öneki (`STR`) — satır başında, kod okunarak da tanınır. */
  code: string;
  name: string;
  /** Bugün teslim edilecek, henüz hazırlanmamış sipariş. */
  today: number;
  /** Günü OLMAYAN kargo siparişi — takvimde yeri yok, ama hazırlanması gerekiyor. */
  shipping: number;
  /** Günü GEÇMİŞ ve hâlâ hazırlanmamış sipariş — bir gecikme işareti. */
  overdue: number;
  /**
   * Gecikmenin YAŞI: en eski geciken sipariş kaç gün geride (kullanıcı kararı 19.08). Geciken
   * yoksa `null` — sıfır DEĞİL, çünkü "0 gün geciken" ölçülmüş bir yakınlık gibi okunurdu.
   *
   * Sayı değil süre karar verdirir: "2 geciken" iki farklı günü tarif edebilir, "en eskisi 3
   * gündür bekliyor" tek bir günü tarif eder.
   */
  overdueOldestDays: number | null;
  /**
   * Durumu `preparing` — biri toplamaya başlamış ve **bırakmış**. Üç el değmemiş siparişle üç
   * yarım sipariş bambaşka iki gündür: yarım kalan iş kaldığı yerden sürer (tasarım §4) ama
   * sürecek birini bekler.
   */
  inProgress: number;
  /** Bekleyen işin toplam adedi — günün ağırlığı. Sipariş sayısı tek başına onu tarif etmez. */
  unitCount: number;
  /** Bekleyen B2B siparişi — hacim beklentisini kurar (tasarım §2: B2B 10-50 koli olabilir). */
  b2bCount: number;
}

/**
 * Depo seçim satırı — işin üstüne **seçmeden önce bilinmesi gereken engel**.
 *
 * Kurulum eksiği yalnız burada var, şeritte yok ve bu bilinçli: şerit çalışılan depo BELLİYKEN
 * çizilir, orada engel artık bir uyarı değil geçmiş bir karardır. Karşılama ekranında ise tam
 * tersi — kapsamlı personeli olmayan bir depoyu seçmek, girip hiçbir şey yapamamaktır.
 */
export interface WarehouseChoiceView extends WarehouseWorkView {
  /** `@/lib/warehouse/setup-gap` cümlesi; kurulum tamsa `null`. */
  setupGap: string | null;
}

/**
 * Depo işi okumasının kabı — **tavan bilgisi satırda değil kapta** durur, çünkü tarama tavanı
 * kümenin tamamına ait: tavana dayanıldığında hangi deponun sayısının eksildiği bilinmez.
 *
 * Sessiz kırpma yok (`CLAUDE §1`): tavana dayanmışsa ekran bunu YAZAR. Eksik bir sayıyı tam gibi
 * göstermek, operatöre olmayan bir boşluğu doğrulatmaktı.
 */
export interface WarehouseWorkData<T extends WarehouseWorkView = WarehouseWorkView> {
  rows: T[];
  truncated: boolean;
}
