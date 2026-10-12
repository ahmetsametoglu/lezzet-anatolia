import { toCents } from '@lezzet/helper';
import type { ChannelProfit, CompanyProfit, VariantProfit } from '@lezzet/domain-core';
import { PNL_ROWS, profitTone } from './reports-labels';
import type { ChannelCard, MetricView, PnlRow, VariantProfitRow } from './reports-types';

// Raporlar ekranının saf indirgemeleri, kapı çıktısından görünüm satırına: euro→cent çevirisi ve etiketleme. Kâr hesabı motordadır
// (`domain-core/accounting/profit`); ikinci bir hesap aynı sayıyı iki yerde türetir ve bir gün ayrışırdı.

/** Kapılar euro döndürüyor (`fromCents` sınırda uygulanmış); ekran cent konuşuyor (STACK §8). */
const c = (euros: number): number => toCents(euros);

export function toVariantRows(profits: readonly VariantProfit[], titles: ReadonlyMap<string, string>): VariantProfitRow[] {
  return profits.map((profit) => ({
    variantId: profit.variantId,
    // Adı okunamayan boy kimliğiyle gösterilmez: operatöre UUID basmak satırı okunamaz kılar.
    // Kısaltılmış kimlik hiç olmazsa iki satırı birbirinden ayırır.
    title: titles.get(profit.variantId) ?? `#${profit.variantId.slice(0, 8)}`,
    qty: profit.qty,
    revenueCents: c(profit.revenue),
    cogsCents: c(profit.cogs),
    grossProfitCents: c(profit.grossProfit),
    lossQty: profit.lossQty,
    lossCostCents: c(profit.lossCost),
    netProfitCents: c(profit.netProfit),
    marginPct: profit.marginPct,
  }));
}

/**
 * Ürün sekmesinin üst şeridi, tasarımın üç ölçüsü; varyant satırlarından toplanır, çünkü şerit altındaki tablonun toplamıdır. Şirket
 * rakamından okunsaydı (fire ve genel gider dahil) şerit ile tablo birbirini tutmaz, fark hata sanılırdı.
 */
export function toProductMetrics(rows: readonly VariantProfitRow[]): MetricView[] {
  const revenue = rows.reduce((sum, row) => sum + row.revenueCents, 0);
  const cogs = rows.reduce((sum, row) => sum + row.cogsCents, 0);
  const net = rows.reduce((sum, row) => sum + row.netProfitCents, 0);

  return [
    { label: 'Satış geliri', cents: revenue, prevCents: null, tone: 'neutral' },
    { label: 'Malın maliyeti', cents: cogs, prevCents: null, tone: 'neutral' },
    { label: 'Fire düşülmüş kâr', cents: net, prevCents: null, tone: profitTone(net) },
  ];
}

/**
 * Şirket kâr-zarar tablosu, `PNL_ROWS` sırasıyla; sıra bir hesap sırasıdır (gelirden düşe düşe kâra inilir) ve iki yerde tutulsaydı
 * tablo bağımsız ölçüler listesine dönerdi.
 */
export function toPnlRows(pnl: CompanyProfit, previous: CompanyProfit | null): PnlRow[] {
  return PNL_ROWS.map((row) => ({
    key: row.key,
    label: row.label,
    kind: row.kind,
    cents: c(pnl[row.key]),
    prevCents: previous ? c(previous[row.key]) : null,
  }));
}

export function toChannelCards(channels: readonly ChannelProfit[]): ChannelCard[] {
  return channels.map((channel) => ({
    channel: channel.channel,
    orderCount: channel.orderCount,
    revenueCents: c(channel.revenue),
    directCostsCents: c(channel.directCosts),
    contributionCents: c(channel.contribution),
    marginPct: channel.marginPct,
  }));
}
