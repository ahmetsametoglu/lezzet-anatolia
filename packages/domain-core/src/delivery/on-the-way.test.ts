import { describe, expect, it } from 'vitest';
import { onTheWayMessage, whatsAppLink } from './on-the-way';

/**
 * "Yoldayım" mesajı (11.4). İki şey sınanıyor: mesaj **müşterinin** dilinde mi ve elle girilmiş
 * numara `wa.me`'nin istediği biçime iniyor mu.
 */
describe('mesaj dili', () => {
  it('müşterinin dilinde yazılır — kuryenin ekran dilinde DEĞİL', () => {
    // Operasyon yüzeyi Türkçedir; ekranın diline uyulsaydı Fransız müşteriye Türkçe giderdi.
    expect(onTheWayMessage({ locale: 'fr', customerName: 'Marie' })).toContain('Bonjour Marie');
    expect(onTheWayMessage({ locale: 'de', customerName: 'Anna' })).toContain('Hallo Anna');
    expect(onTheWayMessage({ locale: 'tr', customerName: 'Ayşe' })).toContain('Merhaba Ayşe');
  });

  it('ad yoksa selamlama adsız kurulur, "Bonjour ," yazılmaz', () => {
    expect(onTheWayMessage({ locale: 'fr', customerName: '  ' })).toMatch(/^Bonjour, /);
  });
});

describe('wa.me bağlantısı', () => {
  it('üç yazım biçimi de AYNI numaraya iner', () => {
    const link = (phone: string) => whatsAppLink({ phone, locale: 'fr', customerName: 'Marie' });

    // "+33 6…", "0033 6…" ve yerel "06…" aynı kişidir; kurye hangisini girdiyse çalışmalı.
    for (const written of ['+33 6 12 34 56 78', '0033612345678', '06 12 34 56 78']) {
      expect(link(written)).toContain('https://wa.me/33612345678?text=');
    }
  });

  it('mesaj URL kodlanır — boşluk ve aksan bağlantıyı kırmaz', () => {
    const link = whatsAppLink({ phone: '0612345678', locale: 'fr', customerName: 'Marie' })!;

    expect(link).not.toContain(' ');
    expect(decodeURIComponent(link.split('?text=')[1]!)).toContain('À tout de suite');
  });

  it('numara yoksa bağlantı da yok — çalışmayan düğme gösterilmez', () => {
    expect(whatsAppLink({ phone: null, locale: 'fr' })).toBeNull();
    expect(whatsAppLink({ phone: '', locale: 'fr' })).toBeNull();
    // Ayırt edilemeyecek kadar kısa: yanlış numaraya mesaj göndermektense hiç göndermemek.
    expect(whatsAppLink({ phone: '0612', locale: 'fr' })).toBeNull();
  });

  it('ülke kodu parametrik — Almanya numarası da doğru tamamlanır', () => {
    expect(whatsAppLink({ phone: '0171 1234567', locale: 'de', countryCode: '49' })).toContain('wa.me/491711234567');
  });
});
