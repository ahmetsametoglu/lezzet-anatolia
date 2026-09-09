import type { ConversationSource, PreferredLanguage } from '@lezzet/types';

/**
 * **ÜRÜN KARTI** (08.09, kullanıcı kararı) — sohbette görsel + ad + fiyat + "Sepete ekle" düğmesi,
 * KATALOGSUZ ve sabit fiyatsız. Saf kurucu: kanalın gövdesini üretir, DB ve ağ bilmez.
 *
 * ── NEDEN KATALOG DEĞİL ─────────────────────────────────────────────────────
 * Meta kataloğu kalem başına TEK fiyat ister; bizim fiyat müşterinin kanalına/kademesine ve bölgeye
 * göre değişiyor. Kart ise müşterinin KENDİ fiyatını taşır (`urun_ara` ile aynı motor) ve her
 * müşteriye ayrı üretilir. Görsel: WhatsApp'ta etkileşimli mesajın görsel başlığı, Messenger/IG'de
 * ürün kartı (generic template). İkisi de 24 saatlik pencere içinde şablonsuz ve onaysız.
 *
 * ── DÜĞME CEVABI METİN OLARAK DÜŞER ─────────────────────────────────────────
 * Müşteri düğmeye basınca WhatsApp `button_reply` (id + başlık), Messenger `postback` (payload +
 * başlık) gönderir; webhook ikisini de "Sepete ekle — <boy>" metnine çevirir (`meta-webhook.ts`),
 * ajan onu sıradan bir müşteri mesajı gibi okur ve `sepete_ekle`yi çağırır. Düğme kimliği
 * `CART_ADD_PREFIX` + boy kimliğidir; başlık müşteri dilinde ve ≤20 karakter (Meta sınırı).
 *
 * Sınırlar Meta'nındır: WhatsApp gövde ≤1024, cevap düğmesi ≤3 ve başlık ≤20; Messenger kart
 * başlığı ≤80, alt yazı ≤80, düğme ≤3. Aşan metin burada kırpılır — sağlayıcıda düşmesin.
 */
export const CART_ADD_PREFIX = 'sepete_ekle:';

export const CARD_ADD_TITLE: Record<PreferredLanguage, string> = {
  tr: 'Sepete ekle',
  fr: 'Ajouter au panier',
  de: 'In den Warenkorb',
};

export interface ProductCardButton {
  /** `sepete_ekle:<variantId>` — webhook bu önekle tanır. */
  id: string;
  /** Müşteri dilinde, ≤20 karakter. */
  title: string;
}

export interface ProductCardInput {
  source: ConversationSource;
  imageUrl: string | null;
  /** Ürün adı — müşteri dilinde. */
  title: string;
  /** Boy ve fiyat satırları — müşteri dilinde, çeviriden geçmez. */
  body: string;
  buttons: ProductCardButton[];
}

const WA_BODY_MAX = 1024;
const WA_BUTTON_TITLE_MAX = 20;
const MESSENGER_TITLE_MAX = 80;
const MESSENGER_SUBTITLE_MAX = 80;
const BUTTONS_MAX = 3;

export function truncateForMeta(text: string, max: number): string {
  const duz = text.trim();
  return duz.length <= max ? duz : `${duz.slice(0, max - 1).trimEnd()}…`;
}

/** Defter metni — kartın "müşteri ne okudu" karşılığı; ekranlar görseli değil bunu gösterir. */
export function productCardText(input: Pick<ProductCardInput, 'title' | 'body'>): string {
  return `${input.title}\n${input.body}`.trim();
}

/** Kanalın etkileşimli gövdesi — tel katmanı olduğu gibi taşır (`cloud-api.ts`). */
export function productCardInteractive(input: ProductCardInput): Record<string, unknown> {
  const buttons = input.buttons.slice(0, BUTTONS_MAX).map((b) => ({ id: b.id, title: truncateForMeta(b.title, WA_BUTTON_TITLE_MAX) }));

  if (input.source === 'whatsapp') {
    return {
      type: 'button',
      ...(input.imageUrl ? { header: { type: 'image', image: { link: input.imageUrl } } } : {}),
      body: { text: truncateForMeta(productCardText(input), WA_BODY_MAX) },
      action: { buttons: buttons.map((b) => ({ type: 'reply', reply: b })) },
    };
  }

  return {
    type: 'template',
    payload: {
      template_type: 'generic',
      elements: [
        {
          title: truncateForMeta(input.title, MESSENGER_TITLE_MAX),
          subtitle: truncateForMeta(input.body.replace(/\s*\n\s*/g, ' · '), MESSENGER_SUBTITLE_MAX),
          ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
          buttons: buttons.map((b) => ({ type: 'postback', title: b.title, payload: b.id })),
        },
      ],
    },
  };
}

/** Webhook'un gelen düğme cevabını metne çevirirken kullandığı kural: önek tanınırsa "Sepete ekle — <başlık>". */
export function cartAddReplyText(id: string | null | undefined, title: string | null | undefined): string | null {
  if (!id?.startsWith(CART_ADD_PREFIX)) return title ?? null;
  return title ? `Sepete ekle — ${title}` : 'Sepete ekle';
}
