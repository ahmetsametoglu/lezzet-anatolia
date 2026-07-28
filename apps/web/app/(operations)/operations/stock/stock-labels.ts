import type { StockAdjustmentReason } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';
import { money, shortDate } from '@/components/operation/ui/format';
import type { BatchView } from './stock-types';

// Partinin GÖRSEL DİLİ — tek yerde. Aynı karar (`OfferDecision`) listede rozet, kartta kenar rengi ve
// diyalogda başlık olarak görünür; her birini ayrı yazsaydık biri "imhalık" derken öbürü hâlâ
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
 * **Risk altındaki tutar** — partide kalan malın alış maliyeti (`kalan × birim alış`).
 *
 * Aciliyeti PARAYLA ölçer: "9 adet kaldı" ile "90 € çöpe gidecek" aynı cümle değildir ve karar
 * sırasını belirleyen ikincisidir. Alış fiyatı girilmemiş partide `null` — sayı uydurulmaz.
 * Satılamaz partide bu tutar artık risk değil GERÇEKLEŞMİŞ zarardır; ekran adını ona göre koyar.
 */
function riskCentsOf(batch: BatchView): number | null {
  return batch.purchasePriceCents === null ? null : batch.purchasePriceCents * batch.physicalQty;
}

/** Kart alt satırı — "9,20 €/ad · 128,80 € riskte" (satılamazda "zarar"). */
export function costLine(batch: BatchView): string {
  if (batch.purchasePriceCents === null) return 'alış fiyatı girilmemiş';
  const total = money(riskCentsOf(batch));
  return `${money(batch.purchasePriceCents)}/ad · ${total} ${batch.decision === 'must_discard' ? 'zarar' : 'riskte'}`;
}

/** Bir küme partinin toplam riski; hiçbirinin fiyatı yoksa `null` (toplam uydurulmaz). */
export function totalRiskCents(batches: readonly BatchView[]): number | null {
  const known = batches.map(riskCentsOf).filter((c): c is number => c !== null);
  return known.length === 0 ? null : known.reduce((sum, c) => sum + c, 0);
}

/**
 * Partiden şimdiye kadar ÇIKAN miktar — girişteki adet ile eldeki adedin farkı. Açık teklifte
 * "5 / 22 satıldı" satırını besler.
 *
 * "Satıldı" tam doğru değil: imha ve fire de düşürür. Ama açık teklifi olan bir partide baskın
 * sebep satıştır ve ekran ölçüyü `initial_qty` üzerinden veriyor — uydurma bir "teklif açıldığından
 * beri" sayacı tutmaktansa, elimizdeki gerçek sayıyı doğru adlandırmak yeğdir.
 */
export function movedOutOf(batch: BatchView): number {
  return Math.max(0, batch.initialQty - batch.physicalQty);
}

/**
 * Karar kuyruğunun GRUPLARI — tasarımın üç bölümü. Ayrım tarih TİPİNDEN doğar, aciliyet
 * sıralamasından değil: DLC geçmiş mal satılamaz (tek yol imha), DLC yaklaşan mal bugün karar ister
 * (tarih geçince satış hakkı biter), DDM yaklaşan malın satış hakkı sürer (yalnız kalite düşer).
 *
 * Üçü aynı listede alt alta dursaydı operatör en pahalı hatayı yapardı: satılamaz partiyi indirime
 * sokmak ya da hâlâ satılabilir malı imhaya göndermek.
 */
export type ExpiryGroupKey = 'blocked' | 'dlc' | 'ddm';

export const EXPIRY_GROUPS: Array<{ key: ExpiryGroupKey; title: string; rule: string; tone: OpsTone }> = [
  {
    key: 'blocked',
    title: 'Satılamaz — imha bekliyor',
    rule: 'DLC geçti · teklif yolu kapalı, kayıt depo imha akışıyla düşer',
    tone: 'red',
  },
  {
    key: 'dlc',
    title: 'DLC yaklaşıyor — satış süresi bitiyor',
    rule: 'Tarih geçerse satılamaz — indirimli teklif kararı bugün verilmeli',
    tone: 'amber',
  },
  {
    key: 'ddm',
    title: 'DDM yaklaşıyor — tarihten sonra da satılabilir',
    rule: 'Kalite düşer, satış hakkı sürer · aciliyet düşük',
    tone: 'amber',
  },
];

/** Parti hangi gruba düşer. DLC geçmişi her zaman ilk gruba — güvenlik kuralı tipin önündedir. */
export function groupOf(batch: BatchView): ExpiryGroupKey {
  if (batch.decision === 'must_discard') return 'blocked';
  return batch.variant.product.dateType === 'DLC' ? 'dlc' : 'ddm';
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

/** İmha/fire sebebinin Türkçesi — DB enum'u operatöre ham görünmez. */
export const LOSS_REASON: Record<StockAdjustmentReason, string> = {
  expired: 'Tarihi geçti',
  damaged: 'Hasar / soğuk zincir',
  count_diff: 'Sayım farkı',
  lost: 'Kayıp',
  return_restock: 'İade → stoğa döndü',
};

/**
 * Sebebin TONU — tasarım her sebep çipini kendi rengiyle çiziyor. Renk burada da anlam taşır: tarihi
 * geçen mal bir KURAL sonucudur (kırmızı), hasar/soğuk zincir bir KAZADIR (amber), sayım farkı bir
 * ÖLÇÜM sorunudur (nötr-mavi). Hepsi aynı renkte olsaydı dağılım şeridi yalnız sayı listesi olurdu.
 */
export const LOSS_REASON_TONE: Record<StockAdjustmentReason, OpsTone> = {
  expired: 'red',
  damaged: 'amber',
  count_diff: 'slate',
  lost: 'amber',
  return_restock: 'olive',
};

/**
 * Kaydın TÜRÜ — sebepten türer, ayrı bir alan değil. Tasarım üç tür ayırıyor (İmha · Fire · Sayım
 * farkı) çünkü sorumluluk farklı: imha kuralın sonucudur, fire bir kazadır, sayım farkı bir
 * ölçüm hatasıdır. Stoğa GERİ EKLEME (negatif) bunların hiçbiri değildir, kendi adıyla görünür.
 */
export function lossKind(reason: StockAdjustmentReason, qty: number): { text: string; tone: OpsTone } {
  if (qty < 0) return { text: 'Geri ekleme', tone: 'olive' };
  if (reason === 'expired') return { text: 'İmha', tone: 'red' };
  if (reason === 'count_diff') return { text: 'Sayım farkı', tone: 'slate' };
  return { text: 'Fire', tone: 'amber' };
}
