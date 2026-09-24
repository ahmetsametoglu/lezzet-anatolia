import type { ConversationSource, PreferredLanguage } from '@lezzet/types';

/**
 * Sohbetteki ürün kartı Meta kataloğu olmadan kurulur, çünkü katalog kalem başına tek fiyat ister; kart müşterinin kendi fiyatını taşır.
 * Meta sınırlarını aşan metin burada kırpılır ki mesaj sağlayıcıda düşmesin.
 */
export const CART_ADD_PREFIX = 'sepete_ekle:';
/** Karusel kartının "boyları gör" düğmesi: `urun_karti:<kod>` — webhook "Ürün kartı — <kod>" metnine çevirir, ajan `urun_karti(kod)` çağırır. */
export const CARD_OPEN_PREFIX = 'urun_karti:';

export const CARD_ADD_TITLE: Record<PreferredLanguage, string> = {
  tr: 'Sepete ekle',
  fr: 'Ajouter au panier',
  de: 'In den Warenkorb',
};

export const CARD_OPEN_TITLE: Record<PreferredLanguage, string> = {
  tr: 'Boyları gör',
  fr: 'Voir les formats',
  de: 'Größen ansehen',
};

/** Karuselin ana gövdesi — üç dilde elle; ürün adları ve fiyatlar zaten müşteri dilinde geliyor. */
export const CAROUSEL_BODY: Record<PreferredLanguage, string> = {
  tr: 'Seçenekler — kaydırarak bakabilirsiniz:',
  fr: 'Nos options — faites défiler pour voir :',
  de: 'Unsere Auswahl — zum Ansehen wischen:',
};

/** Çok boylu ürünün kart satırı: "3 boy · 12,90 €'dan" — sayı ve fiyat çağırandan, kalıp burada. */
export const CAROUSEL_FROM: Record<PreferredLanguage, (count: number, price: string) => string> = {
  tr: (n, p) => `${n} boy · ${p}'dan`,
  fr: (n, p) => `${n} formats · dès ${p}`,
  de: (n, p) => `${n} Größen · ab ${p}`,
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

/**
 * Gelen düğme cevabı kimlik önekiyle metne çevrilir; ajan onu sıradan bir müşteri mesajı gibi okur.
 * `secim` boy kimliğinden çözülen "Ürün (boy)" adıdır, çünkü tek boylu ürünün düğme başlığı hangi ürün olduğunu söylemez.
 */
export function buttonReplyText(id: string | null | undefined, title: string | null | undefined, secim: string | null = null): string | null {
  if (id?.startsWith(CARD_OPEN_PREFIX)) return `Ürün kartı — ${id.slice(CARD_OPEN_PREFIX.length)}`;
  if (!id?.startsWith(CART_ADD_PREFIX)) return title ?? null;
  const ad = secim ?? title;
  return ad ? `Sepete ekle — ${ad}` : 'Sepete ekle';
}

// Karusel çeşit sorusunun cevabıdır. Meta her kartta görsel ve bütün kartlarda aynı düğme türü ve sayısını
// ister; bu yüzden görselsiz ürün karusele girmez ve her kartta tek hızlı cevap vardır.

const WA_CARD_BODY_MAX = 160;
const CAROUSEL_MIN = 2;
const CAROUSEL_MAX = 10;

export interface ProductCarouselCard {
  title: string;
  /** Tek satır: fiyat ya da "n boy · …'dan". */
  body: string;
  /** Zorunlu: Meta görselsiz kartı reddeder; görselsiz ürün karusele alınmaz. */
  imageUrl: string;
  button: ProductCardButton;
}

export interface ProductCarouselInput {
  source: ConversationSource;
  /** Ana gövde — `CAROUSEL_BODY[dil]`. */
  body: string;
  cards: ProductCarouselCard[];
}

/** Karusel için en az/en çok kart — çağıran bu sınırın dışındaysa karusel yerine tek kart ya da metin. */
export const CAROUSEL_CARD_RANGE = { min: CAROUSEL_MIN, max: CAROUSEL_MAX } as const;

export function productCarouselText(input: ProductCarouselInput): string {
  return [input.body, ...input.cards.map((c) => `• ${c.title} — ${c.body}`)].join('\n').trim();
}

export function productCarouselInteractive(input: ProductCarouselInput): Record<string, unknown> {
  const cards = input.cards.slice(0, CAROUSEL_MAX);
  if (input.source === 'whatsapp') {
    return {
      type: 'carousel',
      body: { text: truncateForMeta(input.body, WA_BODY_MAX) },
      action: {
        cards: cards.map((c, i) => ({
          card_index: i,
          type: 'cta_url',
          header: { type: 'image', image: { link: c.imageUrl } },
          body: { text: truncateForMeta(`${c.title}\n${c.body}`, WA_CARD_BODY_MAX) },
          action: { buttons: [{ type: 'quick_reply', quick_reply: { id: c.button.id, title: truncateForMeta(c.button.title, WA_BUTTON_TITLE_MAX) } }] },
        })),
      },
    };
  }
  return {
    type: 'template',
    payload: {
      template_type: 'generic',
      elements: cards.map((c) => ({
        title: truncateForMeta(c.title, MESSENGER_TITLE_MAX),
        subtitle: truncateForMeta(c.body, MESSENGER_SUBTITLE_MAX),
        image_url: c.imageUrl,
        buttons: [{ type: 'postback', title: truncateForMeta(c.button.title, WA_BUTTON_TITLE_MAX), payload: c.button.id }],
      })),
    },
  };
}
