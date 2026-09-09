import { describe, expect, it } from 'vitest';
import { CARD_ADD_TITLE, CART_ADD_PREFIX, cartAddReplyText, productCardInteractive, productCardText, truncateForMeta } from './product-card';

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

  it('gelen düğme cevabı: önek tanınırsa "Sepete ekle — <boy>", tanınmazsa başlık olduğu gibi', () => {
    expect(cartAddReplyText('sepete_ekle:v1', '1 kg')).toBe('Sepete ekle — 1 kg');
    expect(cartAddReplyText('sepete_ekle:v1', null)).toBe('Sepete ekle');
    expect(cartAddReplyText('baska', 'Evet')).toBe('Evet');
    expect(cartAddReplyText(null, 'Evet')).toBe('Evet');
  });
});
