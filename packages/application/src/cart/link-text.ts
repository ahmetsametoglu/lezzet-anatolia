import type { CartLinkPurpose, ConversationSource, PreferredLanguage } from '@lezzet/types';

/**
 * Sohbet bağlantısının cevaba EKLENMESİ (15.21 · 15.16 · 15.14) — saf metin kuralı, DB'siz.
 *
 * Deterministik, `OPT_IN_QUESTION` ve `AI_DISCLOSURE` ile aynı gerekçe (`ticket/ai.ts`): modele
 * "bağlantıyı aynen yaz" demek bir ricadır — bir harfi kayan bağlantı müşteriyi boş sayfaya götürür
 * ve kimse hata görmez. Araç bağlantıyı üretir, kabı doldurur; cevap gövdesi kapanırken bağlantı
 * sona eklenir. Model bağlantıyı yine de yazdıysa (yasak ama olur) ikinci kez eklenmez.
 *
 * Ayrı dosyada, çünkü kural saf ve birim testi DB istemez; `ai.ts` DB servislerini import ediyor.
 *
 * ── ÜÇ KANALDA DÜĞME (08.09, kullanıcı kararı) ──────────────────────────────
 * Ham adres yerine DÜĞME gider: Messenger/IG'de düğme şablonu (metin + `web_url`, onay ve alan adı
 * beyaz listesi istemez), WhatsApp'ta `cta_url` etkileşimli mesajı (pencere içinde şablonsuz) — ikisi
 * de MCP doküman aramasıyla ölçüldü. Kural gönderim kapısında (`send.ts`) uygulanır, çağıranlar
 * bilmez: metin `withCartLink`in ürettiği sabit kuyruğu taşıyorsa `splitCartLink` onu geri ayırır —
 * gövde ayrı, bağlantı düğme olarak ayrı mesaj.
 * Aynı sabit iki yönde de kullanılıyor; cümle değişirse iki fonksiyon birlikte değişir, biri
 * geride kalıp düğmeyi sessizce kaybedemez (testi `link-text.test.ts`).
 *
 * ── İKİ AMAÇ, İKİ CÜMLE (15.16 · 10.09) ─────────────────────────────────────
 * Jeton aynı (`cart_link`); müşterinin okuduğu cümle ve düğme amaca göre: `cart` "Sepetiniz hazır"
 * + "Sepete git", `account` "Sohbetinizi hesabınıza bağlamak için" + "Hesabı bağla". Ayırıcı iki
 * cümleyi de tanır ve kuyruğun amacını CÜMLENİN KENDİSİNDEN okur — metinle birlikte ayrı bir işaret
 * taşınmıyor, çünkü taslak yolunda metin operatörün elinden geçer ve yan işaret yolda kaybolurdu.
 *
 * ── ÜÇÜNCÜ AMAÇ: TALEP (15.14 · kullanıcı kararı 10.09) ─────────────────────
 * Şikâyette ajan talep AÇMAZ, talep sayfasının bağlantısını verir. Bu bağlantının JETONU YOK
 * (`cart_link` satırı doğmaz): sayfa kendi oturum kapısını taşıyor ve talebi hesabıyla açan kişi
 * zaten tanınıyor. Kuyruk, ayırıcı ve düğme aynı yoldan gider — yalnız cümle ve düğme yazısı amacın.
 */

/** Bağlantının önündeki cümle — Türkçe, çünkü çeviri sonra (beyanla aynı kural). */
export const CART_LINK_LINE = 'Sepetiniz hazır — giriş yapıp onaylamak ve ödemek için:';

/** Hesap bağlantısının cümlesi (15.16) — sepetsiz sohbeti hesaba bağlar; giriş e-posta koduyla, şifresiz. */
export const ACCOUNT_LINK_LINE = 'Sohbetinizi hesabınıza bağlamak için giriş yapın — e-postanıza bir kod gelir, şifre gerekmez:';

/** Talep bağlantısının cümlesi (15.14) — şikâyetin ve iadenin yeri talep sayfası; sipariş ve ürün orada seçilir. */
export const SUPPORT_LINK_LINE = 'Talebinizi buradan iletebilirsiniz — giriş yapıp siparişinizi ve ürünü seçin, isterseniz fotoğraf ekleyin:';

/**
 * Sohbet bağlantısının amacı — `cart_link`in iki amacı (jetonlu) ve talep (jetonsuz, 15.14). Talep bir
 * `cart_link` satırı değil; tip bu yüzden şemanın amacını GENİŞLETİR, ikinci kez yazmaz.
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
    de: 'Ihr Warenkorb ist bereit — melden Sie sich an, um zu bestätigen und zu bezahlen.',
  },
  account: {
    tr: ACCOUNT_LINK_LINE.replace(/:$/, '.'),
    fr: 'Connectez-vous pour relier cette conversation à votre compte — un code vous est envoyé par e-mail, sans mot de passe.',
    de: 'Melden Sie sich an, um diesen Chat mit Ihrem Konto zu verbinden — Sie erhalten einen Code per E-Mail, ohne Passwort.',
  },
  support: {
    tr: SUPPORT_LINK_LINE.replace(/:$/, '.'),
    fr: 'Envoyez-nous votre demande ici — connectez-vous, choisissez votre commande et le produit, ajoutez une photo si vous le souhaitez.',
    de: 'Senden Sie uns hier Ihre Anfrage — melden Sie sich an, wählen Sie Bestellung und Produkt und fügen Sie bei Bedarf ein Foto hinzu.',
  },
};

export const LINK_BUTTON_TITLE: Record<ChatLinkPurpose, Record<PreferredLanguage, string>> = {
  cart: { tr: 'Sepete git', fr: 'Voir le panier', de: 'Zum Warenkorb' },
  account: { tr: 'Hesabı bağla', fr: 'Relier mon compte', de: 'Konto verbinden' },
  support: { tr: 'Talep oluştur', fr: 'Faire une demande', de: 'Anfrage senden' },
};

/**
 * Kanalın düğme gövdesi — tel katmanı `interactive` alanını olduğu gibi taşır (`cloud-api.ts`):
 * WhatsApp'ta `type: interactive` gövdesi, Messenger/IG'de `message.attachment`. Tek düğme: bağlantının
 * amacına göre sepete, hesaba ya da talep sayfasına.
 *
 * WhatsApp'ınki `cta_url` — 24 saatlik pencere içinde ŞABLONSUZ gider (kullanıcı kararı 08.09;
 * şablon yalnız pencere dışı, işletme-başlatan mesaj içindir). Adres her mesajda ayrı verildiği için
 * yerel ve canlı adres arasında Meta tarafında hiçbir şey değişmez.
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
