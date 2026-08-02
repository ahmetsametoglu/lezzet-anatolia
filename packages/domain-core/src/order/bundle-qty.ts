/**
 * Bir siparişte paketten KAÇ ADET alınmış — saf karar (denetim A3).
 *
 * Sipariş kalemleri paketin İÇİNDEKİ varyantları taşır, paketin kendisini değil. "3 paket alındı"
 * bilgisi hiçbir yerde yazılı değildir; kalem adedinin paket içeriğindeki adede oranından TÜRETİLİR.
 *
 * ── NEDEN `domain-core` (iki app kopyası yerine) ─────────────────────────────
 * Aynı gövde `lib/order/reorder.ts` ve `lib/order/customer-orders.ts`'te iki kez yazılıydı ve
 * ikinci kopya, aşağıdaki "neden 1'e düşeriz" gerekçesini de kaybetmişti — çürümenin ilk adımı
 * kopyanın gerekçesini unutmasıdır. Kural DB bilmez, ekran bilmez: girdisi kalemler, çıktısı bir
 * sayı. Yeri motor (`STACK §4`), ve orada birim testiyle korunur.
 *
 * ── NEDEN BOZUK ORANDA 1'E DÜŞÜLÜR ──────────────────────────────────────────
 * Paketin içeriği sipariş verildikten sonra değişmiş olabilir; o zaman oran tam bölünmez. Fazla
 * eklemektense az eklemek, müşterinin sepette fark edip artırabileceği bir hatadır — tersi, fark
 * edilmeden fazla ödeme demektir.
 */
export function bundleQtyOf(
  contents: readonly { variantId: string; qty: number }[],
  items: readonly { variantId: string; qty: number }[],
): number {
  for (const item of items) {
    const inBundle = contents.find((c) => c.variantId === item.variantId);
    if (inBundle && inBundle.qty > 0 && item.qty % inBundle.qty === 0) return item.qty / inBundle.qty;
  }
  return 1;
}
