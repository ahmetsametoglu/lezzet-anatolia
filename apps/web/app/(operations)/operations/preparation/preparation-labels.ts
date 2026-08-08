import type { ShortfallSuggestion } from '@lezzet/domain-core';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { PreparationOrderView } from './preparation-types';

/**
 * Hazırlık masasının sözlüğü (10.1–10.3).
 *
 * **İÇ TERİM YASAĞI burada uygulanıyor** (`design/pages/depo-hazirlik.md §6`): "FEFO",
 * "rezervasyon", "batch-pinned", "fulfilled_qty" arayüz dilinde geçmez. Karşılıkları sade:
 * *"önce şu tarihli partiden"*, *"ayrılmış"*, *"karşılanan adet"*. Depocu kuralı değil, işi okur.
 */

/** Sipariş kuyruğundaki durum rozeti — üç hâl, üç renk. */
export function queueStatus(order: PreparationOrderView): { label: string; tone: OpsTone } {
  if (order.isComplete) return { label: 'Hazır ✓', tone: 'olive' };
  // "hazırlanıyor 1/3": yarım kalan iş kaybolmamalı — depocu döndüğünde nerede kaldığını
  // listeden okumalı, siparişi açmak zorunda kalmadan (tasarım §4 "yarım kalan hazırlık").
  if (order.pickedLineCount > 0) return { label: `hazırlanıyor ${order.pickedLineCount}/${order.lineCount}`, tone: 'amber' };
  return { label: 'bekliyor', tone: 'slate' };
}

/** Kanal rozeti — B2B'de hacim beklentisi kurar (10–50 koli olabilir). */
export function channelLabel(order: PreparationOrderView): string {
  // "hacimli" eşiği ADET üzerinden ve parametrik: 40 paketin üstü bir arabayı doldurur, depocu
  // kolileri ona göre hazırlar. Eşik burada duruyor çünkü bir görünüm kararı — iş kuralı değil.
  const HACIM_ESIGI = 40;
  if (order.channel !== 'b2b') return 'B2C';
  return order.totalQty >= HACIM_ESIGI ? 'B2B · hacimli' : 'B2B';
}

export const PREP_NOTES = {
  empty: 'Bugün hazırlanacak sipariş yok. Onaylanan siparişler bu listeye kendiliğinden düşer.',
  pick: 'Soldaki kuyruktan bir sipariş seçin; kalemleri ve hangi partiden alınacağı burada görünür.',
  /** Liste yalnız bugünün işi — arşiv yığılmaz (tasarım §6). */
  queueHint: 'Liste yalnız bugünün işi. Yarım kalan iş saklanır — dönünce kaldığı kalemden sürer.',
  /** Onayın ne yaptığını söyler: depocu ayrıca kayıt girmez, günlük ek yük sıfırdır. */
  confirmHint:
    'Onayla birlikte çıkan partiler otomatik kaydedilir — ayrıca kayıt girmezsiniz. "Sorun" ile başka partiden aldığınızı, partide eksik olduğunu ya da kalemin eksik kalacağını söyleyebilirsiniz.',
  /** Kilitli kalem: öneri değil zorunluluk. */
  pinned: 'partiye kilitli, başka partiden verilemez',
  /** Öneri satırının ilk partisi — "önce bu" işareti. Kuralın ADI geçmez, sonucu yazılır. */
  firstBatch: 'önce bu',
  /** Sipariş tamamlanınca ne olacağını önceden söyler. */
  completeHint: 'Tüm kalemler toplanınca sipariş "hazır" olur ve rota/kargoya düşer.',
  /** Sahadaki toplama akışı bu ekranın işi DEĞİL (yüzey formülü). */
  fieldHint: 'Raf karşısındaki toplama akışı cihaz uygulamasında; bu ekran masadan yönetim içindir.',
  /** Eksik kararı diyaloğunun altbilgisi — para depocuya görünmez. */
  moneyHidden: 'Para tarafı otomatik çözülür (iade / düşük tahsilat) — tutar bu yüzeyde görünmez.',
} as const;

/**
 * Motorun eksik tavsiyesini operatörün cümlesine çevirir.
 *
 * **Tavsiye TUTAR TAŞIMAZ** (`domain-core/stock/shortfall`): parasal ölçüt motora girdi olarak
 * verilir, dönen değerde yer almaz. Buradaki cümleler de tutar yazmaz — yazsalardı rol duvarını
 * sözlük katmanından delerlerdi. `high_value` bu yüzden "değerli kalem" diyor, rakam vermiyor.
 *
 * **Cümle SEBEPTEN türüyor, eylemden değil:** aynı tavsiye ("müşteriye sor") üç ayrı sebepten
 * gelebiliyor ve operatörün kararı sebebi bilerek değişir — kalemin tamamı yoksa müşteri sipariş
 * ettiği şeyi hiç almayacaktır, oysa yarısı eksikse konuşulacak bir şey vardır.
 */
export function shortfallAdvice(suggestion: ShortfallSuggestion): string {
  const REASON: Record<ShortfallSuggestion['reason'], string> = {
    complete: 'Bu kalemde eksik yok.',
    line_fully_missing: 'Bu kalemden hiç çıkmadı — müşteri sipariş ettiği ürünü hiç almayacak. Sormak gerekiyor.',
    large_share: 'Eksik, istenen adedin büyük bölümü — müşteriye sormak uygun görünüyor.',
    high_value: 'Eksik kalan değerli bir kalem — müşteriye sormak uygun görünüyor.',
    minor: 'Eksik küçük — "kalanı gönder" uygun görünüyor.',
  };
  return `Sistem önerisi: ${REASON[suggestion.reason]} Karar sizin.`;
}
