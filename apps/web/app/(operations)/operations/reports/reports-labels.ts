import type { ReportTab } from './reports-url';

// Raporlar ekranının SÖZLÜĞÜ. Tasarım §6'nın yasağı burada zorlanıyor: **"COGS", "katkı payı",
// "snapshot", "contribution margin" gibi terimler arayüzde ham kullanılmaz** — "malın maliyeti",
// "doğrudan giderler sonrası kâr" gibi insan dili. Sözlüğün tek dosyada durması bunu denetlenebilir
// kılıyor: yeni bir satır eklerken adı buraya yazan kişi, ham terimi de burada görür.

export const TAB_LABEL: Record<ReportTab, string> = {
  urun: 'Ürün kârlılığı',
  sirket: 'Şirket kârlılığı',
  kanal: 'Kanal',
  export: 'Muhasebe export',
};

/**
 * Doğrudan gider kalemleri — tasarımın istediği kırılım.
 *
 * **"COGS" değil "malın maliyeti"** ve altında bir cümle daha var: bu sayı *fiilen çıkan partilerin
 * gerçek alış fiyatından* geliyor, teorik alıştan ya da ortalamadan değil. Fark önemli çünkü aynı
 * ürün iki partide iki fiyata girmiş olabilir ve raporun cevabı "ne kazandım" ise, sayı fiilen
 * ödediğimiz para olmalı.
 */
export const COST_LABEL = {
  cogs: 'Malın maliyeti',
  delivery: 'Teslimat',
  paymentFee: 'Ödeme komisyonu',
  packaging: 'Paketleme (soğuk zincir)',
} as const;

/**
 * Şirket kârı tablosunun satırları — SIRA bir hesap sırasıdır, liste değil.
 *
 * Yukarıdan aşağı okununca hesabın kendisi görünüyor: gelirden doğrudan giderler düşülür (ürün
 * kârı), fire düşülür, genel gider düşülür, kalan şirket kârıdır. Sıra bozulsaydı satırlar
 * birbirinden bağımsız ölçüler gibi okunur ve "neden bu sayı bu" sorusunun cevabı kaybolurdu.
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
    'Maliyeti henüz kesinleşmemiş sipariş var: parti seçilmemiş ya da alış fiyatı boş. Bu siparişlerin kârı hesaba KATILMADI — sıfır sayılsaydı kâr olduğundan büyük görünürdü.',
  emptyPeriod: 'Bu dönemde kapanmış satış yok. Rapor, sipariş teslim edilip kapandıkça dolar.',
  /** Tasarım §2 — hediye siparişin dışlanması sessiz olmamalı. */
  giftExcluded:
    'Hediye (ikram) siparişler dışarı giden veriden düşülür — iç raporlarda tam sayılır. Fark burada yazılı ki dönem cirosu ile export toplamı arasındaki boşluk açıklanamaz kalmasın.',
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
