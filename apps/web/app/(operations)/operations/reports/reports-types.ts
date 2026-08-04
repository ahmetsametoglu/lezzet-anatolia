import type { Channel } from '@lezzet/types';
import type { PnlRowKey } from './reports-labels';
import type { ReportsUrlState } from './reports-url';

// Raporlar ekranının GÖRÜNÜM MODELİ.
//
// ── HER TUTAR CENT ──────────────────────────────────────────────────────────
// Kâr ve export kapıları **euro** döndürüyor (`domain-core/accounting` sınırında `fromCents`
// uygulanmış), ekranın biçimlendiricisi ise cent bekliyor (`money`, STACK §8). Çeviri TEK yerde,
// okuma katmanında yapılıyor (`reports-read`); görünüm modeline euro sızarsa aynı sayı bir blokta
// yüz kat büyük yazılır ve kimse fark etmez.

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
  /** Dışarı giden veriden düşen hediye siparişler — SESSİZ değil, sayı ve tutarla. */
  excludedGiftCount: number;
  excludedGiftGrossCents: number;
  byVatRate: { rate: number; netCents: number; vatCents: number }[];
}

export interface ReportsData {
  /** Ürün sekmesinin üst şeridi: gelir · doğrudan giderler · kâr. */
  productMetrics: MetricView[];
  variants: VariantProfitRow[];
  pnl: PnlRow[];
  channels: ChannelCard[];
  export: ExportView;
  invoiceQueue: InvoiceQueueRow[];
  /**
   * Maliyeti kesinleşmemiş sipariş sayısı ve cirosu — hesaba KATILMADI.
   *
   * Sıfır sayılsaydı kâr olduğundan büyük görünürdü (CLAUDE.md §1: ölçülemeyen değer sıfır
   * değildir). Ekran bunu ayrı yazıyor, kârın içine karıştırmıyor.
   */
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
