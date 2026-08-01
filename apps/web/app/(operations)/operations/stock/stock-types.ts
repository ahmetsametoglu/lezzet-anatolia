// Stok ekranı view-model'leri (09.13) — RSC okur, serileştirilebilir bu tiplere indirger; client
// yalnız bunları görür. TİPLER ŞEMADAN TÜRETİLİR (`&` ile), DB alanları elle yeniden yazılmaz.
//
// KARARLAR SUNUCUDA verilir ve satırla birlikte taşınır: "yaklaşan tarihli mi", "teklife açılabilir
// mi", "kalan raf ömrü %" hepsi `domain-core/stock`'un cevabıdır. Client bunları yeniden hesaplasaydı
// iki takvim doğardı — tarayıcının saati ile sunucunun saati ayrıldığında ekran, sunucunun izin
// vermediği bir eylemi sunar hâle gelirdi.
import type {
  KeysetCursor,
  ProductStatus,
  RecallHit,
  StockAdjustmentDetail,
  StockAdjustmentReason,
} from '@lezzet/types';
import type { BatchView } from '@/lib/stock/batch-types';
import type { LossPeriod, StockScope, StockTab } from './stock-url';

// Parti görünümü İKİ ekranın ortak tipi (stok · fiyatlar) — tanımı `lib/stock`'ta, burada yalnız
// yeniden veriliyor: bu klasördeki 30+ kullanım yerinin yolu değişmesin.
export type { BatchView } from '@/lib/stock/batch-types';

/**
 * Bir boyun TEK depodaki gerçeği — satır açılınca görünen kırılım (19.5).
 *
 * Satırın toplamı bu parçaların toplamıdır; iki ayrı okumadan gelmez. "3 STR'de + 2 KEHL'de duran
 * maldan 5 kişilik sipariş çıkmaz" (`DOMAIN §17`) — operatörün transfer kararı bu kırılımda doğar,
 * ama kararın kendisi burada VERİLMEZ (Transfer ekranının işi).
 */
export interface StockWarehouseSplit {
  warehouseId: string;
  code: string;
  name: string;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
  /** O depodaki en yakın son tarih — hangi şehirdeki malın daha acil olduğu kırılımda okunur. */
  nearestExpiry: string | null;
}

/**
 * Stok seviyesi satırı — ekranın ana listesi. Satır BOYDUR (satılabilir birim), ama adı ve tarih
 * rejimi üründen gelir.
 *
 * `batches` satırla birlikte taşınır: partiler zaten toplu okundu (depoda duran parti sayısı fiziksel
 * olarak sınırlı), o yüzden satırı açmak yeni bir tur gerektirmez. Ürün formunun tersi bir karar
 * ve sebebi ölçüdür: orada katalogun tamamı taşınıyordu, burada elde ne varsa o kadar.
 */
export interface StockLevelRow {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  /** Listede görünen tam ad — "Fıstıklı Baklava · 1 kg". */
  title: string;
  categoryName: string;
  status: ProductStatus;
  /** Boy satışa kapalıysa stok yine görünür; ekran sebebi söyler. */
  variantActive: boolean;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
  /** Eşik (varsa) ve altına düşmüş mü — "sipariş zamanı" göstergesi. */
  minStockQty: number | null;
  belowMin: boolean;
  /**
   * Depo kırılımı — yalnız MALI OLAN depolar, operatörün seçici sırasıyla (19.5).
   *
   * Boş = hiçbir depoda stok yok. Tek elemanlı = mal tek yerde (satır kodu doğrudan söyler).
   * Çok elemanlı = "N depoda" ipucu + açılır kırılım. Üç hâl de aynı diziden okunur; ayrı bir
   * "kaç depoda" alanı tutmak, sayının listeden sapabileceği ikinci bir gerçek yaratırdı.
   */
  warehouses: StockWarehouseSplit[];
  batches: BatchView[];
  /** En yakın son tarihli parti (FEFO'da ilk çıkacak olan) — yoksa stok yok demektir. */
  nearest: BatchView | null;
  /** Karar bekleyen parti sayısı (yaklaşan · açık teklif · imhalık). */
  attentionCount: number;
}

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
  /** Seçili dönemin toplamı ve sebep kırılımı — dönemin TAMAMI üzerinden, sayfadan değil. */
  lossSummary: LossSummary;
  counts: StockCounts;
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
  /** Geri çağırma sorgusunu aç. Lot verilirse kutu DOLU açılır — satırdaki numarayı elle yeniden
   *  yazdırmak, acil bir akışta en gereksiz adımdır. */
  onOpenRecall: (lot?: string) => void;
}

