import { describe, expect, it } from 'vitest';
import { brand, whatsappHref } from './index';

/*
  `wa.me` bağı (15.3 · test dalgası 15.18).

  İddialar SEED'e ya da bugünkü numaraya değil, DEĞİŞMEZE yazılıyor: numara `brand`ten okunuyor,
  yani numara değişince test kırılmaz — kırılması gereken tek şey davranıştır.
*/
const digits = brand.contact.phoneE164.replace(/\D/g, '');

describe('whatsappHref', () => {
  it('metinsiz çağrıda `?text=` HİÇ eklenmez', () => {
    // Boş yuva, operatöre anlamsız bir mesaj düşürürdü (15.3 durum notu).
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
