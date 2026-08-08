import { describe, expect, it } from 'vitest';
import { parseWhatsappUrl, whatsappLink, whatsappUrl, WHATSAPP_PATH } from './whatsapp-url';

// 15.5 — adres sözleşmesi. Bozuk bağlantı ekranı KIRMAZ; varsayılanlar adrese yazılmaz.

describe('parseWhatsappUrl', () => {
  it('boş adres varsayılana düşer — ve varsayılan "Tümü"dür', () => {
    // Talepler'den bilinçli ayrım: buraya çoğu zaman belirli bir sohbeti okumaya gelinir. Varsayılan
    // "cevap bekliyor" olsaydı, cevaplanmış bir konuşmanın bağlantısı boş kuyrukla açılırdı.
    expect(parseWhatsappUrl({})).toEqual({ f: 'all', c: '' });
  });

  it('tanınmayan çip sessizce varsayılana düşer', () => {
    expect(parseWhatsappUrl({ f: 'ai' }).f).toBe('all');
  });

  it('biçimi bozuk kimlik ELENİR — uydurma dizgeyle okuma turuna çıkılmaz', () => {
    expect(parseWhatsappUrl({ c: 'sohbet-1' }).c).toBe('');
  });

  it('geçerli kimlik ve çip taşınır', () => {
    const state = parseWhatsappUrl({ f: 'awaiting', c: '11111111-1111-4111-8111-111111111111' });
    expect(state).toEqual({ f: 'awaiting', c: '11111111-1111-4111-8111-111111111111' });
  });

  it('aynı anahtar iki kez gelirse İLKİ kazanır', () => {
    expect(parseWhatsappUrl({ f: ['awaiting', 'all'] }).f).toBe('awaiting');
  });
});

describe('whatsappUrl', () => {
  it('varsayılan durum ÇIPLAK yol üretir', () => {
    expect(whatsappUrl({ f: 'all', c: '' })).toBe(WHATSAPP_PATH);
  });

  it('gidiş-dönüş aynı durumu verir', () => {
    const state = { f: 'awaiting' as const, c: '11111111-1111-4111-8111-111111111111' };
    const url = whatsappUrl(state);
    const params = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
    expect(parseWhatsappUrl(params)).toEqual(state);
  });
});

describe('whatsappLink', () => {
  it('dışarıdan gelen köprü SÜZGEÇ TAŞIMAZ — belirli bir sohbet okunmaya geliniyor', () => {
    expect(whatsappLink('11111111-1111-4111-8111-111111111111')).toBe(
      `${WHATSAPP_PATH}?c=11111111-1111-4111-8111-111111111111`,
    );
  });
});
