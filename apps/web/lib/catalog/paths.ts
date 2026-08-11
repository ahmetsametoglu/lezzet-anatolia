/**
 * Ürün ekranının rotası — ürüne yazan HER eylem bunu tazeler (tek kaynak).
 *
 * Sabit `lib/`e taşındı (11.08) çünkü artık iki ayrı yerden okunuyor: ürün sekmesinin kendi
 * action'ları ve iki yüzeyin ortak eylemleri (`product-actions`, `product-photo-actions`). Bir tur
 * iki kopya vardı; adres değişse biri sessizce bayat kalır ve o eylem listeyi tazelemeyi bırakırdı.
 *
 * Neden action dosyalarının içinde DEĞİL: `'use server'` modülü yalnız async fonksiyon dışa
 * verebilir — sabit oradan paylaşılamaz.
 */
export const PRODUCTS_PATH = '/operations/products';
