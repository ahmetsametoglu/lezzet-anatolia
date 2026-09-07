import { describe, expect, it } from 'vitest';
import { outboundLanguage, spokenLanguageOf } from './conversation-language';

// 15.28 — giden mesajın DİLİ bir karardır ve sırası bilinçli: konuşma > profil > varsayılan.
// Ters sıra Türkçe yazan müşteriye Fransızca cevap gönderirdi.

describe('outboundLanguage', () => {
  it('konuşmanın dili profili YENER — insan neyle yazıyorsa onunla okur', () => {
    expect(outboundLanguage({ language: 'tr' }, { preferredLanguage: 'fr' }, 'fr')).toEqual({
      language: 'tr',
      basis: 'conversation',
    });
  });

  it('konuşma dili bilinmiyorsa profil tercihi kullanılır', () => {
    expect(outboundLanguage({ language: null }, { preferredLanguage: 'de' }, 'fr')).toEqual({
      language: 'de',
      basis: 'customer',
    });
  });

  it('hiçbir şey bilinmiyorsa ÇAĞIRANIN verdiği varsayılana düşer ve bunu SÖYLER', () => {
    // Dayanak `default`: ekran bunu yazar — varsayılana düşmüş sohbet operatörün dikkat edeceği sohbettir.
    expect(outboundLanguage({ language: null }, null, 'fr')).toEqual({ language: 'fr', basis: 'default' });
  });
});

describe('spokenLanguageOf', () => {
  it('konuştuğumuz üç dil aynen geçer', () => {
    expect(spokenLanguageOf('fr')).toBe('fr');
    expect(spokenLanguageOf('de')).toBe('de');
    expect(spokenLanguageOf('tr')).toBe('tr');
  });

  it('başka dil ya da belirsizlik konuşma diline YAZILMAZ — son bilinen kalır', () => {
    // "ok" → en, Boşnakça → bs, çözülemeyen → und: hiçbiri "bundan sonra böyle yaz" demek değil.
    expect(spokenLanguageOf('en')).toBeNull();
    expect(spokenLanguageOf('bs')).toBeNull();
    expect(spokenLanguageOf('und')).toBeNull();
    expect(spokenLanguageOf(null)).toBeNull();
    expect(spokenLanguageOf(undefined)).toBeNull();
  });
});
