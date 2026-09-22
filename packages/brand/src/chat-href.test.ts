import { describe, expect, it } from 'vitest';
import { brand, messengerHref, whatsappHref } from './index';

/*
  Sohbet açan bağlar. İddialar bugünkü numaraya ya da sayfa adresine değil değişmeze yazılıyor: değerler `brand`ten okunuyor, yani
  künye değişince test kırılmaz — kırılması gereken tek şey davranıştır.
*/
const digits = brand.contact.phoneE164.replace(/\D/g, '');

describe('whatsappHref', () => {
  it('metinsiz çağrıda `?text=` HİÇ eklenmez', () => {
    // Boş yuva, operatöre anlamsız bir mesaj düşürürdü.
    expect(whatsappHref()).toBe(`https://wa.me/${digits}`);
  });

  it('boş ve yalnız boşluktan oluşan metin de metinsiz sayılır', () => {
    expect(whatsappHref('')).toBe(`https://wa.me/${digits}`);
    expect(whatsappHref('   \n\t ')).toBe(`https://wa.me/${digits}`);
  });

  it('metin kırpılır ve URL için kodlanır', () => {
    const href = whatsappHref('  Sipariş LZ-26-0142 hakkında  ');
    expect(href).toBe(`https://wa.me/${digits}?text=${encodeURIComponent('Sipariş LZ-26-0142 hakkında')}`);
  });

  it('Türkçe ve Fransızca harfler bozulmadan kodlanır', () => {
    // Ham hâlde bırakılan `ı`/`ş`/`é` bağı bazı istemcilerde kesiyor — kodlama şart.
    const href = whatsappHref('Fıstıklı baklava · livraison à Strasbourg');
    expect(href).toContain('?text=');
    expect(decodeURIComponent(href.split('?text=')[1]!)).toBe('Fıstıklı baklava · livraison à Strasbourg');
  });

  it('numara `wa.me` biçimindedir: yalnız rakam, `+` YOK', () => {
    // `wa.me/+33…` çalışmaz; ayıraç ya da artı kalırsa bağ sessizce bozulur.
    expect(whatsappHref()).toMatch(/^https:\/\/wa\.me\/\d+$/);
    expect(digits).not.toContain('+');
  });
});

describe('messengerHref', () => {
  it('hazır mesajı URL kodlayarak taşır — kodlanmazsa Messenger mesajı yarıda keser', () => {
    const href = messengerHref('Merhaba! Bu sohbeti hesabıma bağlamak istiyorum. LA-WA-ABCDEFGHJKMN');
    expect(href).toBe(
      `${brand.contact.messengerUrl}?text=Merhaba!%20Bu%20sohbeti%20hesab%C4%B1ma%20ba%C4%9Flamak%20istiyorum.%20LA-WA-ABCDEFGHJKMN`,
    );
  });

  it('metinsiz çağrıda `?text=` hiç eklenmez', () => {
    expect(messengerHref()).toBe(brand.contact.messengerUrl);
    expect(messengerHref('   ')).toBe(brand.contact.messengerUrl);
  });
});
