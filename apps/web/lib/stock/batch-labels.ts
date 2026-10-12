import { money, shortDate } from '@/components/operation/ui/format';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { BatchView } from './batch-types';

// Partinin görsel dili tek yerde, çünkü aynı karar listede rozet, kartta kenar rengi, diyalogda başlık olur ve ayrı metinler
// birbirini yalanlardı. Renk anlam taşır: kırmızı satılamaz, amber karar bekliyor, olive karar verilmiş, nötr sorun yok.

/** Raf ömrü girilmemişse yüzde yazılmaz, çünkü 0 yazmak "bugün bitiyor" demek olurdu. */
export function expiryBadge(batch: BatchView): { text: string; tone: OpsTone } {
  if (batch.decision === 'must_discard') return { text: 'DLC geçti', tone: 'red' };
  if (batch.flag === 'expired_sellable') return { text: 'DDM geçti', tone: 'amber' };
  const pct = batch.remainingPercent;
  if (pct === null) return { text: 'raf ömrü girilmemiş', tone: 'neutral' };
  const text = `%${Math.round(pct)}`;
  if (batch.flag === 'near_expiry') return { text: `${text} · ${batch.variant.product.dateType}`, tone: 'amber' };
  return { text, tone: 'neutral' };
}

/** Kalan günün sözü tek yerde; satır ve iki katlı hücre aynı kelimeyi kullanır. */
function daysLeftWord(daysLeft: number): string {
  return daysLeft === 0 ? 'bugün son gün' : `${daysLeft} gün`;
}

/** Tarih tipiyle yazılır: DLC satışı bitirir, DDM yalnız kaliteyi düşürür ve operatörden tipi ezberlemesi beklenmez. */
export function expiryLine(batch: BatchView): string {
  const kind = batch.variant.product.dateType;
  const date = shortDate(batch.expiryDate);
  if (batch.daysLeft < 0) return `${kind} ${date}’de geçti`;
  return `${kind} ${date} · ${daysLeftWord(batch.daysLeft)}`;
}

/** Aynı bilginin dar kolon biçimi: tarih üstte, tip ve kalan gün altta, böylece dar kolonda kesilmez. */
export function expiryParts(batch: BatchView): { date: string; note: string } {
  const left = batch.daysLeft < 0 ? 'geçti' : daysLeftWord(batch.daysLeft);
  return { date: shortDate(batch.expiryDate), note: `${batch.variant.product.dateType} · ${left}` };
}

/**
 * DLC'si geçmiş partide tek yol imhadır ve imha kaydı depo akışınındır (DOMAIN §4); burada "İmha başlat" düğmesi, admin
 * ekranında olmayan bir yetkiyi varmış gibi gösterirdi.
 */
export function batchAction(batch: BatchView): { label: string; kind: 'offer' | 'edit' | 'discard' } {
  if (batch.decision === 'must_discard') return { label: 'İmha bekliyor', kind: 'discard' };
  if (batch.decision === 'offer_open') return { label: 'Fiyatı güncelle', kind: 'edit' };
  return { label: 'Teklif aç', kind: 'offer' };
}

export function suggestionText(batch: BatchView): string {
  if (batch.decision === 'must_discard') return 'Karar yok — yalnız imha';
  if (batch.offerPriceCents !== null) return 'Teklif açık · fiyatı değiştirebilirsiniz';
  if (batch.suggestedOfferCents === null) return 'Liste fiyatı girilmemiş — öneri yok';
  if (batch.flag === 'expired_sellable') return `DDM geçti · öneri: ${money(batch.suggestedOfferCents)}`;
  return `Öneri: %${batch.offerDiscountPercent} → ${money(batch.suggestedOfferCents)}`;
}

/**
 * Aciliyeti parayla ölçer, çünkü "9 adet kaldı" ile "90 € çöpe gidecek" aynı cümle değildir. Depolar karnesi de bu tutarı
 * okur; alış fiyatı girilmemiş partide `null`, sayı uydurulmaz.
 */
export function riskCentsOf(batch: BatchView): number | null {
  return batch.purchasePriceCents === null ? null : batch.purchasePriceCents * batch.physicalQty;
}

/**
 * Fiyatı bilinmeyen partiler atlanır, dönen sayı bir alt sınırdır; hiçbiri bilinmiyorsa `null`. Boş küme ise gerçekten sıfırdır:
 * riskli parti yokken "bilinmiyor" yazmak sağlıklı depoyu ölçülemeyen gibi gösterirdi.
 */
export function totalRiskCents(batches: readonly BatchView[]): number | null {
  if (batches.length === 0) return 0;
  const known = batches.map(riskCentsOf).filter((c): c is number => c !== null);
  return known.length === 0 ? null : known.reduce((sum, c) => sum + c, 0);
}
