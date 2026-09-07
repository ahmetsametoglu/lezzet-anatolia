/**
 * Sepet bağlantısının cevaba EKLENMESİ (15.21) — saf metin kuralı, DB'siz.
 *
 * Deterministik, `OPT_IN_QUESTION` ve `AI_DISCLOSURE` ile aynı gerekçe (`ticket/ai.ts`): modele
 * "bağlantıyı aynen yaz" demek bir ricadır — bir harfi kayan bağlantı müşteriyi boş sayfaya götürür
 * ve kimse hata görmez. Araç bağlantıyı üretir, kabı doldurur; cevap gövdesi kapanırken bağlantı
 * sona eklenir. Model bağlantıyı yine de yazdıysa (yasak ama olur) ikinci kez eklenmez.
 *
 * Ayrı dosyada, çünkü kural saf ve birim testi DB istemez; `ai.ts` DB servislerini import ediyor.
 */

/** Bağlantının önündeki cümle — Türkçe, çünkü çeviri sonra (beyanla aynı kural). */
export const CART_LINK_LINE = 'Sepetiniz hazır — giriş yapıp onaylamak ve ödemek için:';

export function withCartLink(text: string, url: string | null): string {
  if (!url || text.includes(url)) return text;
  return `${text}\n\n${CART_LINK_LINE}\n${url}`;
}
