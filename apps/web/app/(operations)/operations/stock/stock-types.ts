// Stok ekranı view-model'leri (09.13) — RSC okur, serileştirilebilir bu tiplere indirger; client
// yalnız bunları görür. TİPLER ŞEMADAN TÜRETİLİR (`&` ile), DB alanları elle yeniden yazılmaz.
//
// KARARLAR SUNUCUDA verilir ve satırla birlikte taşınır: "yaklaşan tarihli mi", "teklife açılabilir
// mi", "kalan raf ömrü %" hepsi `domain-core/stock`'un cevabıdır. Client bunları yeniden hesaplasaydı
// iki takvim doğardı — tarayıcının saati ile sunucunun saati ayrıldığında ekran, sunucunun izin
// vermediği bir eylemi sunar hâle gelirdi.
import type {
  KeysetCursor,
  RecallHit,
  StockAdjustmentDetail,
  StockAdjustmentReason,
} from '@lezzet/types';
import type { BatchView } from '@/lib/stock/batch-types';
import type { StockLevelRow } from '@/lib/stock/level-rows';
import type { OfferHandoff } from './stock-handoff';
import type { LossPeriod, StockScope, StockTab } from './stock-url';

// Parti görünümü İKİ ekranın ortak tipi (stok · fiyatlar) — tanımı `lib/stock`'ta, burada yalnız
// yeniden veriliyor: bu klasördeki 30+ kullanım yerinin yolu değişmesin.
export type { BatchView } from '@/lib/stock/batch-types';

// Seviye satırı da AYNI devri yaşadı (16.08): ürünler önizlemesinin stok bakışı satırı paylaşınca
// tanım `lib/stock/level-rows`a taşındı — bu klasördeki kullanım yerlerinin yolu değişmesin.
// (Kırılım tipi `StockWarehouseSplit`i yalnız lib ve ortak panel okuyor; burada yeniden verilmez.)
export type { StockLevelRow } from '@/lib/stock/level-rows';

/** İmha/fire geçmişi satırı — kayıt + çözülmüş adlar; maliyet cent'e indirgenmiş. */
export type LossRow = StockAdjustmentDetail & {
  title: string;
  /** İşaretli miktarın işareti korunur: + düşüm, − geri ekleme. */
  costCents: number | null;
  /**
   * Kaydı giren personelin adı. `created_by` FK TAŞIMAZ (0010: "personel kimliği auth şemasında"),
   * bu yüzden gömülü `select` ile gelemiyor — sayfadaki kimlikler tek turda ayrıca çözülür.
   * `null` = kayıt kimin girdiği yazılmadan açılmış (eski/otomatik kayıt).
   */
  actorName: string | null;
};

/**
 * Stoktan düşülebilecek parti — düşüm formunun seçeneği (22.26).
 *
 * **Alış fiyatı TAŞIMIYOR** ve bu bir ekran disiplini değil verinin şekli: tasarımın kuralı *"fire
 * maliyeti, imhanın parasal değeri asla görünmez"* — depocu adet düşer, paraya çevirmek raporların
 * işi. Alanı burada susturmak, ekranda unutmaktan güvenlidir.
 */
export interface WriteOffBatch {
  stockId: string;
  title: string;
  expiryDate: string;
  /** Eldeki fiziksel adet — "partide 3 var, 5 düşülemez" cevabını ekran önceden söyleyebilsin. */
  physicalQty: number;
  /** Son tarihi geçmiş mi — düşülecek ilk şey odur, gizlenmesi ters etki yapardı. */
  isExpired: boolean;
  /** Partinin deposu — çok depolu bakışta hangi rafın malı olduğu satırdan okunur. */
  warehouseName: string | null;
}

/** Dönemin sebep dağılımı — "bu çeyrek ne kadar, neden". Sayfalı liste bu soruyu yanıtlayamaz. */
export interface LossSummary {
  byReason: Array<{ reason: StockAdjustmentReason; qty: number; costCents: number }>;
  qty: number;
  costCents: number;
}

/** Geri çağırma sonucu — sorgulanan partiler + onlardan çıkan siparişler. */
export interface RecallResult {
  /** Lot terimiyle eşleşen partiler (stoğu bitmişler dahil). */
  batches: BatchView[];
  hits: RecallHit[];
  /** Arama tavana dayandı mı — sessiz kırpma yok, ekran söyler. */
  truncated: boolean;
}

/** Başlık sayaçları — liste sayfalı olduğu için client türetemez, sunucudan gelir. */
export interface StockCounts {
  /** Elde partisi olan boy sayısı. */
  inStock: number;
  /** Karar bekleyen parti sayısı (yaklaşan tarihli + açık teklif). */
  attention: number;
  /** DLC'si geçmiş, yalnız imha yolu kalan parti sayısı. */
  blocked: number;
  /**
   * Kabul bekleyen açık tedarik siparişi sayısı — Mal kabul sekmesinin rozeti (22.26).
   *
   * **Sekme kapalıyken de okunur** ve bu bilinçli bir masraf: tasarımın kuralı *"'bugün ne
   * bekliyorum' bir bakışta okunmalı"* — sayıyı yalnız sekmeye girince göstermek, girmeyene hiç
   * göstermemek olurdu. Okuma tek sorgu (`openProgress`); sekmenin kendi detayları (sipariş künyesi,
   * tedarikçi listesi) yalnız sekme açıkken çekilir.
   */
  pendingIntake: number;
}

/**
 * Kabul bekleyen tedarik siparişi — Mal kabul sekmesindeki kart (22.26; `receiving-types`ten geldi).
 *
 * **Liste depo-üstüdür ve öyle kalır:** tedarik siparişi bir depoya ait değildir, mal kabul edilirken
 * bir kapıdan girer. Depo sorusu okumanın değil YAZMANIN sorusudur — cevabı kabul diyaloğunda verilir
 * ve varsayılan üretilmez (`CLAUDE §1`).
 */
export interface PendingPurchase {
  purchaseOrderId: string;
  referenceNo: string | null;
  supplierName: string;
  /** Kaç kalem ısmarlandı. */
  lineCount: number;
  /** Kaç kalemin malı hâlâ gelmedi — "3/5 girildi" ilerlemesi bundan doğar. */
  missingLineCount: number;
  /** Sipariş gönderileli kaç gün oldu; "14 gündür bekliyor" uyarısı. `null` = hiç gönderilmemiş. */
  ageDays: number | null;
  /** Kısmen geldi mi. */
  isPartial: boolean;
}

/**
 * Mal kabul sekmesinin YALNIZ o sekmede okunan verisi (22.26) — `null` = sekme kapalı.
 *
 * Sayfanın her açılışında sipariş künyelerini ve tedarikçi listesini çekmek, üç sekmede bakılmayan
 * bir listeyi her seferinde kurmak olurdu. Rozetin sayısı `counts.pendingIntake`te ve o hep okunuyor
 * — yani sekmeye girmeyen de "kaç sipariş bekliyor" bilgisini kaybetmiyor.
 */
export interface IntakeTabData {
  pending: PendingPurchase[];
  /**
   * Siparişsiz kabulde seçilecek tedarikçiler — doğal tavanlı küme (operatörün elle kurduğu liste),
   * tek turda okunur ve sayfalanmaz (`CLAUDE §1`).
   */
  suppliers: Array<{ id: string; name: string }>;
  /** Kabulün yazılabileceği depolar — kapsamdan gelir; **varsayılan seçim YOK** (`CLAUDE §1`). */
  warehouseOptions: Array<{ id: string; name: string }>;
  /** Bağlamda tek depo seçiliyse onun kimliği — diyalogda ÖN SEÇİLİ gelir, sorulmadan yazılmaz. */
  warehouseId: string | null;
}

/** Kategori seçeneği — süzgeç menüsünü besler (tavanı sınırlı, tek turda gelir). */
export interface CategoryOption {
  id: string;
  name: string;
}

/** RSC'nin client'a geçirdiği tüm veri. */
export interface StockData {
  /** Seviyelerin İLK SAYFASI — süzgeçler sunucuda uygulanmıştır. */
  levels: StockLevelRow[];
  nextCursor: KeysetCursor | null;
  /** Karar bekleyen TÜM partiler — sayfalanmaz; bir partiyi kaçırmak imhalık malı satmaktır. */
  attention: BatchView[];
  losses: LossRow[];
  lossCursor: KeysetCursor | null;
  /** Düşüm formunun parti seçenekleri — yalnız Çıkışlar sekmesi açıkken dolu (form orada açılıyor). */
  writeOffBatches: WriteOffBatch[];
  /** Seçili dönemin toplamı ve sebep kırılımı — dönemin TAMAMI üzerinden, sayfadan değil. */
  lossSummary: LossSummary;
  counts: StockCounts;
  /** Mal kabul sekmesinin verisi — yalnız o sekme açıkken dolu (yukarıdaki künye). */
  intake: IntakeTabData | null;
  /**
   * **Alış fiyatı/maliyet görünür mü** — depo-üstü kapsamda (yönetici/muhasebe) evet, depoya bağlı
   * personelde hayır (`design/pages/admin-stok.md §6`).
   *
   * Bayrak yalnız ÇİZİMİ yönetir; yetkinin kendisi sunucudadır — kaydeden kapı kapsamı yeniden
   * sorup depoya bağlı personelin gönderdiği maliyeti düşürüyor (`receiveIntakeAction`). Ekran
   * gizlemek bir yetki kontrolü değildir.
   */
  canSeeCost: boolean;
  categories: CategoryOption[];
  /**
   * Kararın verildiği eşik (`Setting`) — ekranda YAZILI durur. "Neden bu parti listede" sorusu
   * ayarlara gitmeden yanıtlanabilmeli; ayrıca temiz hâlde "acaba uyarı mı çalışmıyor" şüphesini keser.
   */
  nearExpiryPercent: number;
  warehouse: StockWarehouseView;
}

/** Listenin depo ekseni — kırılım çizilir mi, süzgeç var mı, hangi depoya süzülü (19.5). */
export interface StockWarehouseView {
  /**
   * Başlıktaki evren adı — BAĞLAMIN adı ("Tüm depolar" / "Kehl — sınır deposu"), süzgecin değil.
   * Boş = tek depolu kurulum, eksen hiç görünmez.
   */
  scopeLabel: string;
  /** Satırda "N depoda" ipucu ve açılır kırılım görünür mü (kural 4). */
  showSplit: boolean;
  /** Süzgeç kontrolü çizilir mi (kural 2: yalnız bağlam "tüm depolar" iken). */
  available: boolean;
  active: { id: string; code: string; name: string } | null;
  /** Adresten gelen ama bağlama uymadığı için düşen kod (kural 7). */
  dropped: string | null;
  options: Array<{ id: string; code: string; name: string }>;
}

/**
 * stock-client'ın tuttuğu durum + eylemler; desktop/mobile görünümleri bunu tüketir.
 *
 * `levels` SÜZÜLMÜŞ listedir (parti süzgeci client'ta, çünkü ölçüt sunucudan gelen bir karardır);
 * `data.levels` ise ham ilk sayfadır. İkisi ayrı tutulur ki sayaçlar süzgeçten etkilenmesin.
 */
export interface StockViewProps {
  /**
   * Süzgeç/sekme turu sürüyor — tablo gövdesi soluklaşır (satır varsa) ya da iskelete döner (yoksa).
   * Bu ekranda sekme değişimi ÇOĞUNLUKLA sığdır (`replaceState`, sunucuya gitmez); bayrak yalnız
   * gerçekten gezinilen hâllerde (arama terimi varken sekme, ya da süzgeç) doluyor.
   */
  navPending: boolean;
  data: StockData;
  levels: StockLevelRow[];
  tab: StockTab;
  onTab: (t: StockTab) => void;
  search: string;
  onSearch: (q: string) => void;
  catFilter: string;
  onCatFilter: (id: string) => void;
  scope: StockScope;
  onScope: (s: StockScope) => void;
  /** Seçili depo KODU ('' = tümü) — adreste yaşar, bağlamdan ayrıdır (19.5). */
  warehouseFilter: string;
  onWarehouseFilter: (code: string) => void;
  hasMoreLevels: boolean;
  loadingLevels: boolean;
  onLoadMoreLevels: () => void;
  losses: LossRow[];
  hasMoreLosses: boolean;
  loadingLosses: boolean;
  onLoadMoreLosses: () => void;
  period: LossPeriod;
  onPeriod: (p: LossPeriod) => void;
  selectedId: string | null;
  onSelect: (variantId: string) => void;
  /**
   * Depo kırılımı açık olan boy — aynı anda TEK satır açılır (19.5).
   *
   * Hepsi açılabilseydi liste varyant×depo düz listesine dönerdi ve tam olarak kaçınılan şey o:
   * kırılım bir detaydır, tarama düzeninin kendisi değil.
   */
  openVariantId: string | null;
  onToggleSplit: (variantId: string) => void;
  /** Teklif diyaloğunu bu parti için aç. */
  onOpenOffer: (stockId: string) => void;
  /**
   * Mal kabul formunu aç — sipariş kimliğiyle (siparişten kabul) ya da `null` (irsaliyesiz kabul).
   * İkisi AYNI formdur; kip satırların `expectedQty`sinden okunur.
   */
  onOpenIntake: (purchaseOrderId: string | null) => void;
  /** Stoktan düş tutanağını aç; parti verilirse o satırla dolu başlar (satırdan gelen kısayol). */
  onOpenWriteOff: (stockId?: string) => void;
  /** Geri çağırma sorgusunu aç. Lot verilirse kutu DOLU açılır — satırdaki numarayı elle yeniden
   *  yazdırmak, acil bir akışta en gereksiz adımdır. */
  onOpenRecall: (lot?: string) => void;
  /**
   * Asistan önerisinden gelindi ama devredilen parti LİSTEDE YOK (22.5); `null` = sorun yok.
   *
   * Yalnız bu hâl sayfaya iner: parti bulunduğunda künye teklif diyaloğunun içinde durur, çünkü
   * pencere kendiliğinden açılıp sayfayı örtüyor — arkada kalan künyeyi kimse okuyamaz.
   */
  handoffMissing: OfferHandoff | null;
}

