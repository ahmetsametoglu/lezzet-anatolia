import type { PreferredLanguage } from '@lezzet/types';

/**
 * Sepet bağlantısının cevaba EKLENMESİ (15.21) — saf metin kuralı, DB'siz.
 *
 * Deterministik, `OPT_IN_QUESTION` ve `AI_DISCLOSURE` ile aynı gerekçe (`ticket/ai.ts`): modele
 * "bağlantıyı aynen yaz" demek bir ricadır — bir harfi kayan bağlantı müşteriyi boş sayfaya götürür
 * ve kimse hata görmez. Araç bağlantıyı üretir, kabı doldurur; cevap gövdesi kapanırken bağlantı
 * sona eklenir. Model bağlantıyı yine de yazdıysa (yasak ama olur) ikinci kez eklenmez.
 *
 * Ayrı dosyada, çünkü kural saf ve birim testi DB istemez; `ai.ts` DB servislerini import ediyor.
 *
 * ── MESSENGER/IG'DE DÜĞME (08.09, kullanıcı kararı) ─────────────────────────
 * Bu kanallarda ham adres yerine DÜĞME gider: Meta'nın düğme şablonu (metin + `web_url` düğmesi,
 * onay ve alan adı beyaz listesi istemez — MCP doküman aramasıyla ölçüldü). Kural gönderim
 * kapısında (`send.ts`) uygulanır, çağıranlar bilmez: metin `withCartLink`in ürettiği sabit kuyruğu
 * taşıyorsa `splitCartLink` onu geri ayırır — gövde ayrı, bağlantı düğme olarak ayrı mesaj.
 * Aynı sabit iki yönde de kullanılıyor; cümle değişirse iki fonksiyon birlikte değişir, biri
 * geride kalıp düğmeyi sessizce kaybedemez (testi `link-text.test.ts`).
 */

/** Bağlantının önündeki cümle — Türkçe, çünkü çeviri sonra (beyanla aynı kural). */
export const CART_LINK_LINE = 'Sepetiniz hazır — giriş yapıp onaylamak ve ödemek için:';

export function withCartLink(text: string, url: string | null): string {
  if (!url || text.includes(url)) return text;
  return `${text}\n\n${CART_LINK_LINE}\n${url}`;
}

/** `withCartLink`in tersi: kuyruktaki sabit satır + adres varsa ayırır; yoksa metin olduğu gibi, adres `null`. */
export function splitCartLink(text: string): { body: string; url: string | null } {
  const onek = `${CART_LINK_LINE}\n`;
  const basi = text.lastIndexOf(onek);
  if (basi < 0) return { body: text, url: null };
  const url = text.slice(basi + onek.length).trim();
  // Adres tek satır ve boşluksuz olmalı; değilse bu bizim kuyruğumuz değildir, dokunulmaz.
  if (!url || /\s/.test(url)) return { body: text, url: null };
  return { body: text.slice(0, basi).trimEnd(), url };
}

/**
 * Düğme mesajının metni ve düğme yazısı — üç dilde ELLE (`LINK_CONFIRMATION` deseni): çeviri
 * modelinden geçmez, deterministik. Düğme yazısı Meta'da 20 karakterle sınırlı (test zorlar).
 */
export const CART_LINK_BUTTON_TEXT: Record<PreferredLanguage, string> = {
  tr: CART_LINK_LINE.replace(/:$/, '.'),
  fr: 'Votre panier est prêt — connectez-vous pour le confirmer et payer.',
  de: 'Ihr Warenkorb ist bereit — melden Sie sich an, um zu bestätigen und zu bezahlen.',
};

export const CART_LINK_BUTTON_TITLE: Record<PreferredLanguage, string> = {
  tr: 'Sepete git',
  fr: 'Voir le panier',
  de: 'Zum Warenkorb',
};

/**
 * Messenger/Instagram düğme şablonu — `message.attachment` gövdesi (tel katmanı `interactive`
 * alanını olduğu gibi `attachment`a koyar, `cloud-api.ts`). Tek düğme: sepete git.
 */
export function cartLinkButtonTemplate(url: string, language: PreferredLanguage): Record<string, unknown> {
  return {
    type: 'template',
    payload: {
      template_type: 'button',
      text: CART_LINK_BUTTON_TEXT[language],
      buttons: [{ type: 'web_url', url, title: CART_LINK_BUTTON_TITLE[language] }],
    },
  };
}
