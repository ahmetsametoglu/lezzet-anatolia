/**
 * KUTU DÖNGÜSÜNÜN KARARI (Modül 23 · karar §1.4) — "kutu kapandı; sipariş kapandı mı, eksik ne,
 * yeni kutu mu?"
 *
 * Döngünün cümlesi etütte: *"siparişteki her şey konduysa sipariş kapanır, değilse yeni kutu
 * açılır."* Bu motor o cümlenin hesabıdır ve SAFTIR: DB bilmez, kutu satırı okumaz — sipariş
 * kalemleri ile kutulara konan toplamları alır, kalan işi söyler. Kutuların KAÇ tane olduğu
 * kararın girdisi değil (tek kutu döngünün özel hâli — ayrı bir "tek kutulu" kural yok).
 *
 * "Eksik" burada YALNIZ aritmetiktir: istenene karşı konmuş olan. Eksiğin ne OLACAĞI (müşteriye
 * sor / kalanla gönder) bu motorun işi değil — o karar mevcut eksik akışının (`stock/shortfall`)
 * ve yönetim ekranının işidir; ikinci bir karar yolu açılmaz (23.6 görev satırı).
 */

export interface BoxedItem {
  itemId: string;
  /** Sipariş edilen adet. */
  orderedQty: number;
  /** Kutulara ŞU ANA KADAR konan toplam (kapanan + kapanmakta olan kutular). */
  boxedQty: number;
}

export interface BoxCompletion {
  /** Her kalem tamamen kutulandı — sipariş `ready`'e geçebilir. */
  complete: boolean;
  /** Eksik kalan kalemler; boş dizi = eksik yok. */
  missing: Array<{ itemId: string; missingQty: number }>;
}

/**
 * Kutulara konanın siparişle karşılaştırması. Fazla kutulama DÖNMEZ çünkü doğamaz:
 * `record_preparation` sipariş edilenden fazlasını reddeder ve `seal_order_box` Σ kutu =
 * karşılanan eşitliğini zorlar — buradaki `Math.max` savunmadır, davranış değil.
 */
export function boxCompletion(items: readonly BoxedItem[]): BoxCompletion {
  const missing = items
    .map((item) => ({ itemId: item.itemId, missingQty: Math.max(0, item.orderedQty - item.boxedQty) }))
    .filter((item) => item.missingQty > 0);

  return { complete: missing.length === 0, missing };
}
