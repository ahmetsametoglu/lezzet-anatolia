import type { StockAdjustmentReason } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { BatchView } from './stock-types';

// Partinin GÖRSEL DİLİ — tek yerde. Aynı karar (`OfferDecision`) listede rozet, kartta kenar rengi ve
// diyalogda başlık olarak üç kez görünür; üçünü ayrı yazsaydık biri "imhalık" derken öbürü hâlâ
// "yaklaşan tarihli" diyebilirdi.
//
// RENK BİR ANLAM TAŞIR, süs değil: kırmızı = satılamaz (güvenlik), amber = karar bekliyor,
// olive = karar verilmiş (teklif açık), nötr = sorun yok.

/**
 * Partinin tarih durumunu KISA söyler: rozetin içine sığan hâli. Yüzde hesaplanamıyorsa (ürünün
 * toplam raf ömrü girilmemiş) yüzde YAZILMAZ — 0 yazmak "bugün bitiyor" demek olurdu.
 */
export function expiryBadge(batch: BatchView): { text: string; tone: OpsTone } {
  if (batch.decision === 'must_discard') return { text: 'DLC geçti', tone: 'red' };
  if (batch.flag === 'expired_sellable') return { text: 'DDM geçti', tone: 'amber' };
  const pct = batch.remainingPercent;
  if (pct === null) return { text: 'raf ömrü girilmemiş', tone: 'neutral' };
  const text = `%${Math.round(pct)}`;
  if (batch.flag === 'near_expiry') return { text: `${text} · ${batch.variant.product.dateType}`, tone: 'amber' };
  return { text, tone: 'neutral' };
}

/**
 * Partinin karar satırındaki eylem: ne yapılabilir ve düğme ne desin.
 *
 * DLC'si geçmiş partide TEK yol imha ve bu ekrandan başlatılmaz — imha kaydı depo akışının işidir
 * (DOMAIN §4: sayım/imha girişini depo yapar). Burada yalnız yönlendirme var; düğmeyi "İmha başlat"
 * diye koyup depoya çıkarmak, admin ekranında olmayan bir yetkiyi varmış gibi gösterirdi.
 */
export function batchAction(batch: BatchView): { label: string; kind: 'offer' | 'edit' | 'discard' } {
  if (batch.decision === 'must_discard') return { label: 'İmha bekliyor', kind: 'discard' };
  if (batch.decision === 'offer_open') return { label: 'Teklifi düzenle', kind: 'edit' };
  return { label: 'Teklif aç', kind: 'offer' };
}

/** İmha/fire sebebinin Türkçesi — DB enum'u operatöre ham görünmez. */
export const LOSS_REASON: Record<StockAdjustmentReason, string> = {
  expired: 'Tarihi geçti',
  damaged: 'Hasar / soğuk zincir',
  count_diff: 'Sayım farkı',
  lost: 'Kayıp',
  return_restock: 'İade → stoğa döndü',
};
