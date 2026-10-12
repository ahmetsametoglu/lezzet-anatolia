import type { Channel } from '@lezzet/types';
import type { PnlRowKey } from './reports-labels';
import type { ReportsUrlState } from './reports-url';

// Raporlar ekranının görünüm modeli; her tutar cent'tir. Kâr ve aktarım kapıları euro döndürür, çeviri okuma katmanında bir kez
// yapılır, çünkü görünüme sızan euro aynı sayıyı bir blokta yüz kat büyük yazardı.

export interface MetricView {
  label: string;
  /** **Cent.** `null` bilinmiyor demektir, sıfır değil. */
  cents: number | null;
  /** Karşılaştırma açıkken önceki dönemin aynı ölçüsü — `null` karşılaştırma kapalı ya da yok. */
  prevCents: number | null;
  tone: 'olive' | 'red' | 'neutral';
}

/** Ürün kârlılığı satırı — bir boy (varyant). */
export interface VariantProfitRow {
  variantId: string;
  title: string;
  qty: number;
  revenueCents: number;
  cogsCents: number;
  grossProfitCents: number;
  lossQty: number;
  lossCostCents: number;
  netProfitCents: number;
  /** Fire düşülmüş net marj — `null` gelir sıfırken (oran tanımsız, sıfır değil). */
  marginPct: number | null;
}

/** Şirket kâr-zarar satırı — sıra bir hesap sırasıdır (`PNL_ROWS`). */
export interface PnlRow {
  key: PnlRowKey;
  label: string;
  kind: 'plus' | 'minus' | 'subtotal' | 'total';
  cents: number;
  prevCents: number | null;
}

export interface ChannelCard {
  channel: Channel;
  orderCount: number;
  revenueCents: number;
  directCostsCents: number;
  contributionCents: number;
  marginPct: number | null;
}

/** Fatura numarası bekleyen satış — export sekmesinin kuyruğu. */
export interface InvoiceQueueRow {
  orderId: string;
  referenceNo: string | null;
  saleDate: string;
  totalCents: number;
  channel: Channel;
}

export interface ExportView {
  orderCount: number;
  grossCents: number;
  netCents: number;
  vatCents: number;
  /** Satış olarak aktarılmayan hediye siparişler; maliyet ve liste değeri bilinmiyorsa `null`. */
  excludedGiftCount: number;
  excludedGiftCostCents: number | null;
  excludedGiftListCents: number | null;
  byVatRate: { rate: number; netCents: number; vatCents: number }[];
  /** Hareket dökümünün dönemi: kaç hareket, kaçı izahsız — dosyaya girmeden görünsün. */
  movementCount: number;
  unexplainedMovementCount: number;
}

export interface ReportsData {
  /** Ürün sekmesinin üst şeridi: gelir · doğrudan giderler · kâr. */
  productMetrics: MetricView[];
  variants: VariantProfitRow[];
  pnl: PnlRow[];
  channels: ChannelCard[];
  export: ExportView;
  invoiceQueue: InvoiceQueueRow[];
  /** Maliyeti kesinleşmemiş siparişlerin sayısı ve cirosu; kâra katılmaz ve ayrı yazılır, sıfır sayılsaydı kâr büyük görünürdü. */
  unpricedCount: number;
  unpricedRevenueCents: number;
  /** Dönemde hiç kapanmış satış var mı — boş hâlin ayrımı. */
  hasSales: boolean;
}

export interface ReportsViewProps {
  data: ReportsData;
  urlState: ReportsUrlState;
  months: string[];
  /** Kâr blokları yalnız yöneticiye — muhasebeci export ve fatura eşleştirmesini görür. */
  canSeeProfit: boolean;
  navPending: boolean;
  onFilter: (next: Partial<ReportsUrlState>) => void;
}
