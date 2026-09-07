import { describe, expect, it } from 'vitest';
import { CART_LINK_LINE, withCartLink } from './link-text';

const URL = 'https://www.lezzetanatolia.fr/fr/panier?link=ABCDEFGH1234';

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
