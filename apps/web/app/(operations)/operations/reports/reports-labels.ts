import type { ReportTab } from './reports-url';

// Raporlar ekranının sözlüğü: "COGS", "katkı payı", "contribution margin" gibi ham terimler arayüzde kullanılmaz (tasarım §6),
// yerine "malın maliyeti" gibi insan dili. Sözlük tek dosyada durur ki yeni satırı yazan ham terimi de burada görsün.

export const TAB_LABEL: Record<ReportTab, string> = {
  urun: 'Ürün kârlılığı',
  sirket: 'Şirket kârlılığı',
  kanal: 'Kanal',
  export: 'Muhasebe export',
};

/**
 * Doğrudan gider kalemleri, tasarımın kırılımıyla. Malın maliyeti fiilen çıkan partilerin alış fiyatıdır, ortalama değil, çünkü aynı
 * ürün iki partide iki fiyata girmiş olabilir.
 */
export const COST_LABEL = {
  cogs: 'Malın maliyeti',
  delivery: 'Teslimat',
  paymentFee: 'Ödeme komisyonu',
  packaging: 'Paketleme (soğuk zincir)',
} as const;

/**
 * Şirket kârı tablosunun satırları; sıra hesabın sırasıdır: gelirden doğrudan giderler, fire ve genel gider düşülür, kalan şirket
 * kârıdır. Sıra bozulsaydı satırlar birbirinden bağımsız ölçüler gibi okunurdu.
 */
export const PNL_ROWS = [
  { key: 'revenue', label: 'Satış geliri', kind: 'plus' },
  { key: 'directCosts', label: 'Doğrudan giderler', kind: 'minus' },
  { key: 'contribution', label: 'Doğrudan giderler sonrası kâr', kind: 'subtotal' },
  { key: 'lossCost', label: 'Fire (imha · hasar · sayım)', kind: 'minus' },
  { key: 'overhead', label: 'Genel giderler (kira · maaş · araç)', kind: 'minus' },
  { key: 'netProfit', label: 'Şirket kârı', kind: 'total' },
] as const;

export type PnlRowKey = (typeof PNL_ROWS)[number]['key'];

export const NOTES = {
  /** Tasarım §2'nin cümlesi — genel giderin neden dağıtılmadığı. */
  overheadNotAllocated:
    'Genel giderler ürünlere dağıtılmaz — şirket seviyesinde bir kez düşülür. Ürün kararı temiz, şirket kârı gerçek.',
  /** Tasarım §2 — malın maliyetinin kaynağı. */
  realCogs:
    'Malın maliyeti fiilen çıkan partilerin gerçek alış fiyatından gelir, ortalamadan değil. Sipariş kapanışında sabitlenir; geçmiş rakam sonradan değişmez.',
  /** Tasarım §4 — kesinleşen ile bekleyen karışmasın. */
  unpriced:
    'Maliyeti henüz kesinleşmemiş sipariş var: parti seçilmemiş, alış fiyatı boş ya da kart komisyonu gelmedi. Bu siparişlerin kârı hesaba KATILMADI — sıfır sayılsaydı kâr olduğundan büyük görünürdü.',
  emptyPeriod: 'Bu dönemde kapanmış satış yok. Rapor, sipariş teslim edilip kapandıkça dolar.',
  /** Tasarım §2 — hediye siparişin dışlanması sessiz olmamalı. */
  giftExcluded:
    'Hediye (ikram) siparişler satış olarak aktarılmaz, iç raporlarda tam sayılır. Maliyeti muhasebecinin ikram gideridir; liste fiyatı yalnız bilgi içindir.',
  allInvoicesMatched: 'Fatura numarası bekleyen satış yok.',
  /** Tasarım §6 — bu ekranın ne OLMADIĞI. */
  notOfficial:
    'Resmî mali tablo değildir: bilanço, resmî kâr-zarar ve KDV beyanı burada üretilmez — bu rakamlar işletme kararı içindir.',
} as const;

/** Kâr rakamının tonu — negatif kâr SAKLANMAZ (tasarım §4: "rakam saklanmaz, görünür"). */
export function profitTone(cents: number | null): 'olive' | 'red' | 'neutral' {
  if (cents == null) return 'neutral';
  return cents >= 0 ? 'olive' : 'red';
}
