import type { StockAdjustmentReason } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';
import { money } from '@/components/operation/ui/format';
import { riskCentsOf } from '@/lib/stock/batch-labels';
import type { BatchView } from '@/lib/stock/batch-types';

// Stok ekranına ÖZGÜ sözlük. Birden çok ekranın paylaştığı parça (`expiryBadge` · `expiryLine` ·
// `batchAction` · `suggestionText`, ve 19.5'te `riskCentsOf` · `totalRiskCents`)
// `lib/stock/batch-labels`'a taşındı; burada kalanlar yalnız bu ekranın sorduğu sorular: maliyet
// satırı, parti gruplama, imha sebebi sözlüğü.

/** Kart alt satırı — "9,20 €/ad · 128,80 € riskte" (satılamazda "zarar"). */
export function costLine(batch: BatchView): string {
  if (batch.purchasePriceCents === null) return 'alış fiyatı girilmemiş';
  const total = money(riskCentsOf(batch));
  return `${money(batch.purchasePriceCents)}/ad · ${total} ${batch.decision === 'must_discard' ? 'zarar' : 'riskte'}`;
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

// Sebep sözlüğü LIB'E TAŞINDI (16.08 — `lib/stock/loss-labels`): parti geçmişi paneli ortak
// komponente çıkınca metin iki yüzeyin oldu. Re-export bu klasördeki çağıranların yolunu korur.
export { LOSS_REASON } from '@/lib/stock/loss-labels';

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

/**
 * **Parti karışma sinyali** (23.9 · etüt §1.10) — aynı varyantın aynı depoda 2+ AÇIK partisi olan
 * durum sayısı. Lot etiketi BİLİNÇLE ertelendi; bu sayı o kararın SAYISAL ölçütüdür: sıfırda
 * kaldıkça problem hiç doğmadı, tırmanıyorsa lot etiketinin günü geldi — "hissedilirse" değil
 * "ölçülürse" (karar §1.10). Mevcut parti okumasından TÜRER, yeni tablo/sorgu yok.
 *
 * "Açık parti" = fiziksel adedi sıfırdan büyük: tükenmiş parti rafta ayrım sorunu yaratmaz.
 */
export function mixedLotCases(
  batches: ReadonlyArray<Pick<BatchView, 'warehouseId' | 'variantId' | 'physicalQty'>>,
): number {
  const openCounts = new Map<string, number>();
  for (const batch of batches) {
    if (batch.physicalQty <= 0) continue;
    const key = `${batch.warehouseId}:${batch.variantId}`;
    openCounts.set(key, (openCounts.get(key) ?? 0) + 1);
  }
  return [...openCounts.values()].filter((count) => count >= 2).length;
}
