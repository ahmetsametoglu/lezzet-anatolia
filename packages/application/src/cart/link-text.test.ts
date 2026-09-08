import { describe, expect, it } from 'vitest';
import {
  CART_LINK_BUTTON_TEXT,
  CART_LINK_BUTTON_TITLE,
  CART_LINK_LINE,
  cartLinkButton,
  splitCartLink,
  withCartLink,
} from './link-text';

const URL = 'https://www.lezzetanatolia.fr/fr/panier?link=ABCDEFGH1234';

describe('sepet bağlantısının geri AYRILMASI — Messenger/IG düğmesi (08.09)', () => {
  it('withCartLink → splitCartLink gidiş-dönüş: gövde ve adres kayıpsız ayrılır', () => {
    const govde = 'Sepetinize 2 baklava ekledim.\n\nKargo 11,90 €.';
    expect(splitCartLink(withCartLink(govde, URL))).toEqual({ body: govde, url: URL });
  });

  it('kuyrukta sabit satır yoksa metin olduğu gibi, adres null — sıradan cevap düğmeye dönmez', () => {
    expect(splitCartLink('Merhaba, baklava 4,57 €.')).toEqual({ body: 'Merhaba, baklava 4,57 €.', url: null });
    // Model adresi gövdeye kendi yazdıysa (yasak ama olur) bu bizim kuyruğumuz değildir.
    expect(splitCartLink(`Buyurun: ${URL}`)).toEqual({ body: `Buyurun: ${URL}`, url: null });
  });

  it('yalnız bağlantıdan ibaret metin: gövde BOŞ, adres dolu — kapı tek mesaj (düğme) gönderir', () => {
    expect(splitCartLink(`${CART_LINK_LINE}\n${URL}`)).toEqual({ body: '', url: URL });
  });

  it('Messenger/IG düğme şablonu Meta sınırlarında: tek `web_url` düğmesi, başlık ≤ 20 karakter, üç dilde', () => {
    for (const dil of ['tr', 'fr', 'de'] as const) {
      for (const kanal of ['messenger', 'instagram'] as const) {
        const sablon = cartLinkButton(URL, dil, kanal) as {
          type: string;
          payload: { template_type: string; text: string; buttons: { type: string; url: string; title: string }[] };
        };
        expect(sablon.type).toBe('template');
        expect(sablon.payload.template_type).toBe('button');
        expect(sablon.payload.text).toBe(CART_LINK_BUTTON_TEXT[dil]);
        expect(sablon.payload.text.length).toBeLessThanOrEqual(640);
        expect(sablon.payload.buttons).toEqual([{ type: 'web_url', url: URL, title: CART_LINK_BUTTON_TITLE[dil] }]);
      }
      expect(CART_LINK_BUTTON_TITLE[dil].length).toBeLessThanOrEqual(20);
    }
  });

  it('WhatsApp `cta_url` etkileşimli mesajı: gövde ≤ 1024, düğme yazısı ≤ 20 — pencere içinde şablonsuz', () => {
    for (const dil of ['tr', 'fr', 'de'] as const) {
      const govde = cartLinkButton(URL, dil, 'whatsapp') as {
        type: string;
        body: { text: string };
        action: { name: string; parameters: { display_text: string; url: string } };
      };
      expect(govde.type).toBe('cta_url');
      expect(govde.body.text).toBe(CART_LINK_BUTTON_TEXT[dil]);
      expect(govde.body.text.length).toBeLessThanOrEqual(1024);
      expect(govde.action).toEqual({ name: 'cta_url', parameters: { display_text: CART_LINK_BUTTON_TITLE[dil], url: URL } });
    }
  });
});

describe('sepet bağlantısının cevaba eklenmesi (15.21)', () => {
  it('bağlantı yoksa metin OLDUĞU GİBİ kalır — araç çağrılmayan turda cevap değişmez', () => {
    expect(withCartLink('Merhaba, baklava 4,57 €.', null)).toBe('Merhaba, baklava 4,57 €.');
  });

  it('bağlantı varsa cümleyle birlikte SONA eklenir — gövdeye karışmaz, kendi satırında', () => {
    const sonuc = withCartLink('Sepetinize 2 baklava ekledim.', URL);
    expect(sonuc).toBe(`Sepetinize 2 baklava ekledim.\n\n${CART_LINK_LINE}\n${URL}`);
  });

  it('model bağlantıyı zaten yazdıysa İKİNCİ kez eklenmez — aynı adres iki kez görünmez', () => {
    const govde = `Buyurun: ${URL}`;
    expect(withCartLink(govde, URL)).toBe(govde);
  });
});
