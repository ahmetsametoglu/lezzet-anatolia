import type { CartLinkPurpose, ConversationSource, PreferredLanguage } from '@lezzet/types';

/**
 * Sohbet bağlantısı cevaba modelden değil koddan eklenir, çünkü harfi kayan bir bağlantı müşteriyi boş sayfaya götürür ve kimse hatayı görmez.
 * Kuyruğun amacı (sepet, hesap, talep) cümlenin kendisinden okunur, çünkü taslak yolunda metin operatörün elinden geçer ve yan işaret kaybolurdu.
 */

/** Bağlantının önündeki cümle — Türkçe, çünkü çeviri sonra (beyanla aynı kural). */
export const CART_LINK_LINE = 'Sepetiniz hazır — giriş yapıp onaylamak ve ödemek için:';

/** Hesap bağlantısının cümlesi — sepetsiz sohbeti hesaba bağlar; giriş e-posta koduyla, şifresiz. */
export const ACCOUNT_LINK_LINE = 'Sohbetinizi hesabınıza bağlamak için giriş yapın — e-postanıza bir kod gelir, şifre gerekmez:';

/** Talep bağlantısının cümlesi — şikâyetin ve iadenin yeri talep sayfası; sipariş ve ürün orada seçilir. */
export const SUPPORT_LINK_LINE = 'Talebinizi buradan iletebilirsiniz — giriş yapıp siparişinizi ve ürünü seçin, isterseniz fotoğraf ekleyin:';

/**
 * Sohbet bağlantısının amacı: `cart_link`in iki amacı (jetonlu) ve talep (jetonsuz). Talep bir `cart_link` satırı değil;
 * tip bu yüzden şemanın amacını genişletir, ikinci kez yazmaz.
 */
export type ChatLinkPurpose = CartLinkPurpose | 'support';

/** Amaca göre cümle — ekleyen de ayıran da buradan okur. */
const LINK_LINE: Record<ChatLinkPurpose, string> = { cart: CART_LINK_LINE, account: ACCOUNT_LINK_LINE, support: SUPPORT_LINK_LINE };

/** Cevaba eklenecek bağlantı — adresi ve amacı; amaç kuyruğun cümlesini ve düğmesini seçer. */
export type ChatLink = { url: string; purpose: ChatLinkPurpose };

/** Kuyruğun kendisi: cümle, altında adres. Ajanın cevabı, operatörün düğmesi ve defterin Türkçesi aynı biçimi yazar. */
export function linkTail(link: ChatLink): string {
  return `${LINK_LINE[link.purpose]}\n${link.url}`;
}

export function withCartLink(text: string, link: ChatLink | null): string {
  if (!link || text.includes(link.url)) return text;
  return `${text}\n\n${linkTail(link)}`;
}

/**
 * `withCartLink`in tersi: kuyruktaki sabit cümle + adres varsa ayırır ve amacı cümleden okur; yoksa
 * metin olduğu gibi, bağlantı `null`. Bütün cümleler aranır, metnin SONUNA en yakın olan kazanır —
 * kuyruk her zaman sondadır.
 */
export function splitCartLink(text: string): { body: string; link: ChatLink | null } {
  const kuyruk = (Object.keys(LINK_LINE) as ChatLinkPurpose[])
    .map((purpose) => ({ purpose, onek: `${LINK_LINE[purpose]}\n`, basi: text.lastIndexOf(`${LINK_LINE[purpose]}\n`) }))
    .filter((aday) => aday.basi >= 0)
    .sort((a, b) => b.basi - a.basi)[0];
  if (!kuyruk) return { body: text, link: null };
  const url = text.slice(kuyruk.basi + kuyruk.onek.length).trim();
  // Adres tek satır ve boşluksuz olmalı; değilse bu bizim kuyruğumuz değildir, dokunulmaz.
  if (!url || /\s/.test(url)) return { body: text, link: null };
  return { body: text.slice(0, kuyruk.basi).trimEnd(), link: { url, purpose: kuyruk.purpose } };
}

/**
 * Düğme mesajının metni ve düğme yazısı — amaç başına, üç dilde ELLE (`LINK_CONFIRMATION` deseni):
 * çeviri modelinden geçmez, deterministik. Düğme yazısı Meta'da 20 karakterle sınırlı (test zorlar).
 */
export const LINK_BUTTON_TEXT: Record<ChatLinkPurpose, Record<PreferredLanguage, string>> = {
  cart: {
    tr: CART_LINK_LINE.replace(/:$/, '.'),
    fr: 'Votre panier est prêt — connectez-vous pour le confirmer et payer.',
    de: 'Ihr Warenkorb ist bereit – melden Sie sich an, um zu bestätigen und zu bezahlen.',
  },
  account: {
    tr: ACCOUNT_LINK_LINE.replace(/:$/, '.'),
    fr: 'Connectez-vous pour relier cette conversation à votre compte — un code vous est envoyé par e-mail, sans mot de passe.',
    de: 'Melden Sie sich an, um diesen Chat mit Ihrem Konto zu verbinden – Sie erhalten einen Code per E-Mail, ohne Passwort.',
  },
  support: {
    tr: SUPPORT_LINK_LINE.replace(/:$/, '.'),
    fr: 'Envoyez-nous votre demande ici — connectez-vous, choisissez votre commande et le produit, ajoutez une photo si vous le souhaitez.',
    de: 'Senden Sie uns hier Ihre Anfrage – melden Sie sich an, wählen Sie Bestellung und Produkt und fügen Sie bei Bedarf ein Foto hinzu.',
  },
};

export const LINK_BUTTON_TITLE: Record<ChatLinkPurpose, Record<PreferredLanguage, string>> = {
  cart: { tr: 'Sepete git', fr: 'Voir le panier', de: 'Zum Warenkorb' },
  account: { tr: 'Hesabı bağla', fr: 'Relier mon compte', de: 'Konto verbinden' },
  support: { tr: 'Talep oluştur', fr: 'Faire une demande', de: 'Anfrage senden' },
};

/**
 * Kanalın düğme gövdesi; tek düğme bağlantının amacına göre sepete, hesaba ya da talep sayfasına gider.
 * WhatsApp'ta `cta_url` 24 saatlik pencere içinde şablonsuz gider, çünkü şablon yalnız pencere dışı mesaj içindir.
 */
export function cartLinkButton(link: ChatLink, language: PreferredLanguage, source: ConversationSource): Record<string, unknown> {
  const text = LINK_BUTTON_TEXT[link.purpose][language];
  const title = LINK_BUTTON_TITLE[link.purpose][language];
  if (source === 'whatsapp') {
    return {
      type: 'cta_url',
      body: { text },
      action: { name: 'cta_url', parameters: { display_text: title, url: link.url } },
    };
  }
  return {
    type: 'template',
    payload: {
      template_type: 'button',
      text,
      buttons: [{ type: 'web_url', url: link.url, title }],
    },
  };
}
