import { describe, expect, it } from 'vitest';
import { parseSocialUrl, socialLink, socialUrl, SOCIAL_PATH } from './social-url';

// 15.5/15.15 — adres sözleşmesi. Bozuk bağlantı ekranı KIRMAZ; varsayılanlar adrese yazılmaz.

describe('parseSocialUrl', () => {
  it('boş adres varsayılana düşer — ve varsayılan "Tümü / tüm kanallar"dır', () => {
    // Talepler'den bilinçli ayrım: buraya çoğu zaman belirli bir sohbeti okumaya gelinir. Varsayılan
    // "cevap bekliyor" olsaydı, cevaplanmış bir konuşmanın bağlantısı boş kuyrukla açılırdı.
    expect(parseSocialUrl({})).toEqual({ f: 'all', ch: 'all', c: '' });
  });

  it('tanınmayan çip sessizce varsayılana düşer — kanal çipi dahil', () => {
    expect(parseSocialUrl({ f: 'ai' }).f).toBe('all');
    expect(parseSocialUrl({ ch: 'telegram' }).ch).toBe('all');
  });

  it('biçimi bozuk kimlik ELENİR — uydurma dizgeyle okuma turuna çıkılmaz', () => {
    expect(parseSocialUrl({ c: 'sohbet-1' }).c).toBe('');
  });

  it('geçerli kimlik ve çipler taşınır', () => {
    const state = parseSocialUrl({ f: 'awaiting', ch: 'messenger', c: '11111111-1111-4111-8111-111111111111' });
    expect(state).toEqual({ f: 'awaiting', ch: 'messenger', c: '11111111-1111-4111-8111-111111111111' });
  });

  it('aynı anahtar iki kez gelirse İLKİ kazanır', () => {
    expect(parseSocialUrl({ f: ['awaiting', 'all'] }).f).toBe('awaiting');
  });
});

describe('socialUrl', () => {
  it('varsayılan durum ÇIPLAK yol üretir', () => {
    expect(socialUrl({ f: 'all', ch: 'all', c: '' })).toBe(SOCIAL_PATH);
  });

  it('gidiş-dönüş aynı durumu verir', () => {
    const state = { f: 'awaiting' as const, ch: 'instagram' as const, c: '11111111-1111-4111-8111-111111111111' };
    const url = socialUrl(state);
    const params = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
    expect(parseSocialUrl(params)).toEqual(state);
  });
});

describe('socialLink', () => {
  it('dışarıdan gelen köprü SÜZGEÇ TAŞIMAZ — belirli bir sohbet okunmaya geliniyor', () => {
    expect(socialLink('11111111-1111-4111-8111-111111111111')).toBe(
      `${SOCIAL_PATH}?c=11111111-1111-4111-8111-111111111111`,
    );
  });
});
