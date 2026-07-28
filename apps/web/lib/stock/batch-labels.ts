import { money, shortDate } from '@/components/operation/ui/format';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { BatchView } from './batch-types';

// Partinin GÖRSEL DİLİ — İKİ ekranın ortak sözlüğü (stok 09.13 · fiyatlar 09.5). Aynı karar
// (`OfferDecision`) listede rozet, kartta kenar rengi ve diyalogda başlık olarak görünür; her
// ekranın kendi metnini yazması, biri "imhalık" derken öbürünün hâlâ "yaklaşan tarihli" demesi
// demekti.
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
 * Kartın tarih satırı — "DLC 26 Tem 2026 · 3 gün" / "DLC 20 Tem 2026'da geçti".
 *
 * Tarih TİPİYLE birlikte yazılır ve bu bilinçli: DLC ile DDM'in sonucu tamamen farklı (biri satışı
 * bitirir, öbürü kaliteyi düşürür). Yalnız tarihi yazmak, operatörden tipi ezberlemesini istemek olurdu.
 */
export function expiryLine(batch: BatchView): string {
  const kind = batch.variant.product.dateType;
  const date = shortDate(batch.expiryDate);
  if (batch.daysLeft < 0) return `${kind} ${date}’de geçti`;
  if (batch.daysLeft === 0) return `${kind} ${date} · bugün son gün`;
  return `${kind} ${date} · ${batch.daysLeft} gün`;
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
  if (batch.decision === 'offer_open') return { label: 'Fiyatı güncelle', kind: 'edit' };
  return { label: 'Teklif aç', kind: 'offer' };
}

/** Kartın alt satırındaki bir cümlelik özet — sistemin söyleyebildiği en yararlı şey. */
export function suggestionText(batch: BatchView): string {
  if (batch.decision === 'must_discard') return 'Karar yok — yalnız imha';
  if (batch.offerPriceCents !== null) return 'Teklif açık · fiyatı değiştirebilirsiniz';
  if (batch.suggestedOfferCents === null) return 'Liste fiyatı girilmemiş — öneri yok';
  if (batch.flag === 'expired_sellable') return `DDM geçti · öneri: ${money(batch.suggestedOfferCents)}`;
  return `Öneri: %${batch.offerDiscountPercent} → ${money(batch.suggestedOfferCents)}`;
}
