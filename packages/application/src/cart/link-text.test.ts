import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_LINK_LINE,
  CART_LINK_LINE,
  LINK_BUTTON_TEXT,
  LINK_BUTTON_TITLE,
  cartLinkButton,
  linkTail,
  splitCartLink,
  withCartLink,
  type ChatLink,
} from './link-text';

const URL = 'https://lezzetanatolie.com/fr/panier?link=ABCDEFGH1234';
const SEPET: ChatLink = { url: URL, purpose: 'cart' };
const HESAP: ChatLink = { url: 'https://lezzetanatolie.com/fr/compte?link=ABCDEFGH1234', purpose: 'account' };

describe('sepet bağlantısının geri AYRILMASI — Messenger/IG düğmesi (08.09)', () => {
  it('withCartLink → splitCartLink gidiş-dönüş: gövde ve adres kayıpsız ayrılır', () => {
    const govde = 'Sepetinize 2 baklava ekledim.\n\nKargo 11,90 €.';
    expect(splitCartLink(withCartLink(govde, SEPET))).toEqual({ body: govde, link: SEPET });
  });

  it('kuyrukta sabit satır yoksa metin olduğu gibi, bağlantı null — sıradan cevap düğmeye dönmez', () => {
    expect(splitCartLink('Merhaba, baklava 4,57 €.')).toEqual({ body: 'Merhaba, baklava 4,57 €.', link: null });
    // Model adresi gövdeye kendi yazdıysa (yasak ama olur) bu bizim kuyruğumuz değildir.
    expect(splitCartLink(`Buyurun: ${URL}`)).toEqual({ body: `Buyurun: ${URL}`, link: null });
  });

  it('yalnız bağlantıdan ibaret metin: gövde BOŞ, bağlantı dolu — kapı tek mesaj (düğme) gönderir', () => {
    expect(splitCartLink(`${CART_LINK_LINE}\n${URL}`)).toEqual({ body: '', link: SEPET });
  });

  it('Messenger/IG düğme şablonu Meta sınırlarında: tek `web_url` düğmesi, başlık ≤ 20 karakter, iki amaç × üç dil', () => {
    for (const link of [SEPET, HESAP]) {
      for (const dil of ['tr', 'fr', 'de'] as const) {
        for (const kanal of ['messenger', 'instagram'] as const) {
          const sablon = cartLinkButton(link, dil, kanal) as {
            type: string;
            payload: { template_type: string; text: string; buttons: { type: string; url: string; title: string }[] };
          };
          expect(sablon.type).toBe('template');
          expect(sablon.payload.template_type).toBe('button');
          expect(sablon.payload.text).toBe(LINK_BUTTON_TEXT[link.purpose][dil]);
          expect(sablon.payload.text.length).toBeLessThanOrEqual(640);
          expect(sablon.payload.buttons).toEqual([{ type: 'web_url', url: link.url, title: LINK_BUTTON_TITLE[link.purpose][dil] }]);
        }
        expect(LINK_BUTTON_TITLE[link.purpose][dil].length).toBeLessThanOrEqual(20);
      }
    }
  });

  it('WhatsApp `cta_url` etkileşimli mesajı: gövde ≤ 1024, düğme yazısı ≤ 20 — pencere içinde şablonsuz', () => {
    for (const link of [SEPET, HESAP]) {
      for (const dil of ['tr', 'fr', 'de'] as const) {
        const govde = cartLinkButton(link, dil, 'whatsapp') as {
          type: string;
          body: { text: string };
          action: { name: string; parameters: { display_text: string; url: string } };
        };
        expect(govde.type).toBe('cta_url');
        expect(govde.body.text).toBe(LINK_BUTTON_TEXT[link.purpose][dil]);
        expect(govde.body.text.length).toBeLessThanOrEqual(1024);
        expect(govde.action).toEqual({ name: 'cta_url', parameters: { display_text: LINK_BUTTON_TITLE[link.purpose][dil], url: link.url } });
      }
    }
  });
});

describe('HESAP bağlantısı — aynı kuyruk, kendi cümlesi (15.16)', () => {
  it('gidiş-dönüşte AMAÇ cümleden okunur — ayrı bir işaret taşınmadan', () => {
    const govde = 'Siparişlerinizi görmek için sohbetinizi hesabınıza bağlayın.';
    const metin = withCartLink(govde, HESAP);
    expect(metin).toBe(`${govde}\n\n${ACCOUNT_LINK_LINE}\n${HESAP.url}`);
    expect(splitCartLink(metin)).toEqual({ body: govde, link: HESAP });
  });

  it('iki cümle birden geçiyorsa SONDAKİ kazanır — kuyruk her zaman sondadır', () => {
    // Operatör eski bir sepet kuyruğunu gövdede bırakıp altına hesap bağlantısı eklemiş olabilir.
    const metin = `${linkTail(SEPET)} (eski)\n\n${linkTail(HESAP)}`;
    expect(splitCartLink(metin).link).toEqual(HESAP);
  });

  it('iki amacın düğme yazısı ve cümlesi AYRI — müşteri hesap bağlantısında "Sepete git" görmez', () => {
    for (const dil of ['tr', 'fr', 'de'] as const) {
      expect(LINK_BUTTON_TITLE.account[dil]).not.toBe(LINK_BUTTON_TITLE.cart[dil]);
      expect(LINK_BUTTON_TEXT.account[dil]).not.toBe(LINK_BUTTON_TEXT.cart[dil]);
    }
  });
});

describe('sepet bağlantısının cevaba eklenmesi (15.21)', () => {
  it('bağlantı yoksa metin OLDUĞU GİBİ kalır — araç çağrılmayan turda cevap değişmez', () => {
    expect(withCartLink('Merhaba, baklava 4,57 €.', null)).toBe('Merhaba, baklava 4,57 €.');
  });

  it('bağlantı varsa cümleyle birlikte SONA eklenir — gövdeye karışmaz, kendi satırında', () => {
    const sonuc = withCartLink('Sepetinize 2 baklava ekledim.', SEPET);
    expect(sonuc).toBe(`Sepetinize 2 baklava ekledim.\n\n${CART_LINK_LINE}\n${URL}`);
  });

  it('model bağlantıyı zaten yazdıysa İKİNCİ kez eklenmez — aynı adres iki kez görünmez', () => {
    const govde = `Buyurun: ${URL}`;
    expect(withCartLink(govde, SEPET)).toBe(govde);
  });
});
