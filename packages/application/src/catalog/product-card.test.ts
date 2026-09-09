import { describe, expect, it } from 'vitest';
import {
  buttonReplyText,
  CARD_ADD_TITLE,
  CARD_OPEN_PREFIX,
  CARD_OPEN_TITLE,
  CAROUSEL_BODY,
  CAROUSEL_FROM,
  CART_ADD_PREFIX,
  productCardInteractive,
  productCardText,
  productCarouselInteractive,
  productCarouselText,
  truncateForMeta,
} from './product-card';

const IMG = 'https://pub-test.r2.dev/catalog/products/fistikli-baklava.chat-1788602400.jpg';

describe('ürün kartı — kanal gövdeleri (08.09)', () => {
  const girdi = {
    imageUrl: IMG,
    title: 'Fıstıklı Baklava',
    body: '500 g — 12,90 €\n1 kg — 24,90 €',
    buttons: [
      { id: `${CART_ADD_PREFIX}v1`, title: '500 g' },
      { id: `${CART_ADD_PREFIX}v2`, title: '1 kg' },
    ],
  };

  it('WhatsApp: görsel başlıklı cevap düğmeleri — gövde ≤1024, düğme başlığı ≤20, en fazla 3', () => {
    const govde = productCardInteractive({ ...girdi, source: 'whatsapp' }) as {
      type: string;
      header: { type: string; image: { link: string } };
      body: { text: string };
      action: { buttons: { type: string; reply: { id: string; title: string } }[] };
    };
    expect(govde.type).toBe('button');
    expect(govde.header).toEqual({ type: 'image', image: { link: IMG } });
    expect(govde.body.text).toBe('Fıstıklı Baklava\n500 g — 12,90 €\n1 kg — 24,90 €');
    expect(govde.action.buttons).toEqual([
      { type: 'reply', reply: { id: 'sepete_ekle:v1', title: '500 g' } },
      { type: 'reply', reply: { id: 'sepete_ekle:v2', title: '1 kg' } },
    ]);
  });

  it('Messenger/IG: ürün kartı (generic) — satırlar alt yazıda " · " ile, düğmeler postback', () => {
    for (const kanal of ['messenger', 'instagram'] as const) {
      const govde = productCardInteractive({ ...girdi, source: kanal }) as {
        type: string;
        payload: { template_type: string; elements: { title: string; subtitle: string; image_url: string; buttons: { type: string; title: string; payload: string }[] }[] };
      };
      expect(govde.type).toBe('template');
      expect(govde.payload.template_type).toBe('generic');
      const kart = govde.payload.elements[0]!;
      expect(kart.title).toBe('Fıstıklı Baklava');
      expect(kart.subtitle).toBe('500 g — 12,90 € · 1 kg — 24,90 €');
      expect(kart.image_url).toBe(IMG);
      expect(kart.buttons[0]).toEqual({ type: 'postback', title: '500 g', payload: 'sepete_ekle:v1' });
    }
  });

  it('görselsiz kart da geçerli — başlık/image_url alanı hiç yazılmaz (boş adres Meta\'da düşerdi)', () => {
    const wa = productCardInteractive({ ...girdi, source: 'whatsapp', imageUrl: null });
    expect(wa).not.toHaveProperty('header');
    const ms = productCardInteractive({ ...girdi, source: 'messenger', imageUrl: null }) as { payload: { elements: object[] } };
    expect(ms.payload.elements[0]).not.toHaveProperty('image_url');
  });

  it('Meta sınırları KURUCUDA zorlanır: dördüncü düğme düşer, uzun başlık kırpılır', () => {
    const dortlu = productCardInteractive({
      ...girdi,
      source: 'whatsapp',
      buttons: [1, 2, 3, 4].map((n) => ({ id: `${CART_ADD_PREFIX}v${n}`, title: `Çok uzun bir boy etiketi ${n}` })),
    }) as { action: { buttons: { reply: { title: string } }[] } };
    expect(dortlu.action.buttons).toHaveLength(3);
    for (const b of dortlu.action.buttons) expect(b.reply.title.length).toBeLessThanOrEqual(20);
    expect(truncateForMeta('abcdef', 4)).toBe('abc…');
    expect(truncateForMeta('abc', 4)).toBe('abc');
  });

  it('"Sepete ekle" üç dilde ≤20 karakter; defter metni başlık + gövde', () => {
    for (const dil of ['tr', 'fr', 'de'] as const) expect(CARD_ADD_TITLE[dil].length).toBeLessThanOrEqual(20);
    expect(productCardText(girdi)).toBe('Fıstıklı Baklava\n500 g — 12,90 €\n1 kg — 24,90 €');
  });

  it('gelen düğme cevabı: önek tanınırsa "Sepete ekle — <boy>" / "Ürün kartı — <kod>", tanınmazsa başlık olduğu gibi', () => {
    expect(buttonReplyText('sepete_ekle:v1', '1 kg')).toBe('Sepete ekle — 1 kg');
    expect(buttonReplyText('sepete_ekle:v1', null)).toBe('Sepete ekle');
    expect(buttonReplyText('urun_karti:fistikli-baklava', 'Boyları gör')).toBe('Ürün kartı — fistikli-baklava');
    expect(buttonReplyText('baska', 'Evet')).toBe('Evet');
    expect(buttonReplyText(null, 'Evet')).toBe('Evet');
  });
});

describe('ürün karuseli — 2–10 kart tek mesajda (09.09)', () => {
  const kartlar = [
    { title: 'Fıstıklı Baklava', body: CAROUSEL_FROM.tr(3, '12,90 €'), imageUrl: `${IMG}#1`, button: { id: `${CARD_OPEN_PREFIX}fistikli-baklava`, title: CARD_OPEN_TITLE.tr } },
    { title: 'Cevizli Baklava', body: '11,90 €', imageUrl: `${IMG}#2`, button: { id: `${CART_ADD_PREFIX}v9`, title: CARD_ADD_TITLE.tr } },
  ];

  it('WhatsApp: `interactive.type = carousel`, kart sırası `card_index`, görsel başlık, tek hızlı cevap, kart metni ≤160', () => {
    const govde = productCarouselInteractive({ source: 'whatsapp', body: CAROUSEL_BODY.tr, cards: kartlar }) as {
      type: string;
      body: { text: string };
      action: { cards: { card_index: number; type: string; header: { type: string; image: { link: string } }; body: { text: string }; action: { buttons: { type: string; quick_reply: { id: string; title: string } }[] } }[] };
    };
    expect(govde.type).toBe('carousel');
    expect(govde.body.text).toBe(CAROUSEL_BODY.tr);
    expect(govde.action.cards.map((c) => c.card_index)).toEqual([0, 1]);
    const ilk = govde.action.cards[0]!;
    expect(ilk.type).toBe('cta_url'); // dokümanın hızlı cevap örneği de böyle
    expect(ilk.header).toEqual({ type: 'image', image: { link: `${IMG}#1` } });
    expect(ilk.body.text).toBe("Fıstıklı Baklava\n3 boy · 12,90 €'dan");
    expect(ilk.action.buttons).toEqual([{ type: 'quick_reply', quick_reply: { id: 'urun_karti:fistikli-baklava', title: 'Boyları gör' } }]);
    for (const c of govde.action.cards) expect(c.body.text.length).toBeLessThanOrEqual(160);
  });

  it('Messenger/IG: generic template, kart başına tek postback; 11. kart düşer', () => {
    const on1 = Array.from({ length: 11 }, (_, i) => ({ ...kartlar[1]!, title: `Ürün ${i}` }));
    const govde = productCarouselInteractive({ source: 'messenger', body: CAROUSEL_BODY.fr, cards: on1 }) as {
      payload: { template_type: string; elements: { title: string; subtitle: string; image_url: string; buttons: { type: string; payload: string }[] }[] };
    };
    expect(govde.payload.template_type).toBe('generic');
    expect(govde.payload.elements).toHaveLength(10);
    expect(govde.payload.elements[0]).toMatchObject({ subtitle: '11,90 €', image_url: `${IMG}#2`, buttons: [{ type: 'postback', payload: 'sepete_ekle:v9' }] });
  });

  it('defter metni: gövde + kart başına bir satır; "…\'dan" kalıbı üç dilde', () => {
    expect(productCarouselText({ source: 'whatsapp', body: CAROUSEL_BODY.tr, cards: kartlar })).toBe(
      "Seçenekler — kaydırarak bakabilirsiniz:\n• Fıstıklı Baklava — 3 boy · 12,90 €'dan\n• Cevizli Baklava — 11,90 €",
    );
    expect(CAROUSEL_FROM.fr(2, '9,90 €')).toBe('2 tailles · dès 9,90 €');
    expect(CAROUSEL_FROM.de(2, '9,90 €')).toBe('2 Größen · ab 9,90 €');
    for (const dil of ['tr', 'fr', 'de'] as const) expect(CARD_OPEN_TITLE[dil].length).toBeLessThanOrEqual(20);
  });
});
