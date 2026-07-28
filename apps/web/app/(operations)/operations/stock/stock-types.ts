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
  StockBatchDetail,
} from '@lezzet/types';
import type { ExpiryFlag, OfferDecision } from '@lezzet/domain-core';
import type { LossPeriod, StockScope, StockTab } from './stock-url';

/**
 * Parti satırı — `StockBatchDetail`'i türetir, üstüne SUNUCUDA verilmiş kararları ekler.
 *
 * `listPriceCents` ve `suggestedOfferCents` yalnız karar bekleyen partilerde doludur: fiyat okuması
 * yalnız onlar için yapılır (bkz. `stock-read`). Fiyatı girilmemiş varyantta ikisi de `null` — sayı
 * UYDURULMAZ, ekran eksikliği söyler.
 */
export type BatchView = StockBatchDetail & {
  /** Ürün ve boy adı çözülmüş hâlde ("Fıstıklı Baklava · 1 kg") — dil yedek zinciri tek yerde. */
  title: string;
  productName: string;
  variantLabel: string;
  flag: ExpiryFlag;
  decision: OfferDecision;
  /** Kalan raf ömrü %; ürünün toplam raf ömrü girilmemişse `null` (eşik kararı verilmez). */
  remainingPercent: number | null;
  /** Son tarihe kalan gün — geçmişse negatif. */
  daysLeft: number;
  /** Girişte MLOR eşiğinin altında kabul edilmiş mi — teklif kararına bağlam. */
  belowMlor: boolean;
  listPriceCents: number | null;
  suggestedOfferCents: number | null;
  offerPriceCents: number | null;
  purchasePriceCents: number | null;
  /**
   * Kararın verildiği EŞİKLER, satırla birlikte taşınır (`Setting`, 0016). Ekran bunları yeniden
   * okumaz ve sabit yazmaz: "%30 indirim öneriliyor" ile "MLOR eşiğinin (%75) altında" cümlelerinin,
   * kararı üreten sayının aynısını söylemesi gerekir. Ayar değişince metin de değişir.
   */
  offerDiscountPercent: number;
  mlorPercent: number;
};

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
}

/**
 * stock-client'ın tuttuğu durum + eylemler; desktop/mobile görünümleri bunu tüketir.
 *
 * `levels` SÜZÜLMÜŞ listedir (parti süzgeci client'ta, çünkü ölçüt sunucudan gelen bir karardır);
 * `data.levels` ise ham ilk sayfadır. İkisi ayrı tutulur ki sayaçlar süzgeçten etkilenmesin.
 */
export interface StockViewProps {
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
  /** Teklif diyaloğunu bu parti için aç. */
  onOpenOffer: (stockId: string) => void;
  onOpenRecall: () => void;
}

/**
 * Listede görünen tam ad. Boy adı BOŞ olabilir (tek boylu üründe varsayılan varyantın etiketi boştur)
 * — o zaman ayraç da yazılmaz, yoksa her satır "Künefe · " diye biterdi.
 */
export function titleOf(productName: string, variantLabel: string): string {
  return variantLabel ? `${productName} · ${variantLabel}` : productName;
}
