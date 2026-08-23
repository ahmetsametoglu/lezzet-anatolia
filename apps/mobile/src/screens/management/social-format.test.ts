import type { MessageKind } from '@lezzet/types';
import { socialPreview, socialStamp, socialTitle, socialWindowOf } from './social-format';

/*
  Sosyal ekranların metin türetmeleri (15.17 · test dalgası 15.18).

  Bu dört fonksiyon "sunum" gibi görünür ama üçü KARAR taşıyor ve üçü de sessizce yanlış olabilir:
  başlık zinciri (yanlış sıra → operatör kimin yazdığını bilemez), metinsiz mesajın etiketi (boş
  balon "mesaj kayboldu" okutur) ve pencere hâli (`never` ile `closed` aynı değildir).

  Testler MOBİLİN jest paketinde: `packages/*` vitest'te koşar, `apps/mobile` kendi koşucusunda.
*/

const KIND_LABELS: Record<MessageKind, string> = {
  text: '[boş mesaj]',
  interactive: '[etkileşimli kart]',
  template: '[kalıp mesaj]',
  media: '[görsel / dosya]',
};

describe('socialTitle — müşteri > profil > ham anahtar', () => {
  it('müşteri adı varsa o kazanır', () => {
    expect(socialTitle({ customerName: 'Ayşe Yılmaz', profileName: 'ayse.g', externalRef: '+33612345678' })).toBe('Ayşe Yılmaz');
  });

  it('müşteri yoksa sağlayıcı profil adı', () => {
    expect(socialTitle({ customerName: null, profileName: 'ayse.g', externalRef: '+33612345678' })).toBe('ayse.g');
  });

  it('ikisi de yoksa HAM ANAHTAR — satır adressiz kalamaz', () => {
    // Messenger/IG'de bu opak bir PSID'dir ve operatöre az şey söyler; ama boş bir başlıktan iyidir.
    expect(socialTitle({ customerName: null, profileName: null, externalRef: 'PSID-123' })).toBe('PSID-123');
  });

  it('yalnız BOŞLUKtan oluşan ad yok sayılır — zincir bir alt basamağa iner', () => {
    // Sağlayıcıdan boşluklu ad gelebiliyor; kırpmadan kabul etmek görünmez bir başlık üretirdi.
    expect(socialTitle({ customerName: '   ', profileName: '  ayse  ', externalRef: 'X' })).toBe('ayse');
    expect(socialTitle({ customerName: '   ', profileName: '   ', externalRef: 'X' })).toBe('X');
  });
});

describe('socialPreview — metinsiz mesaj BOŞ görünmez', () => {
  it('metin varsa metin', () => {
    expect(socialPreview({ lastMessageText: 'Merhaba', lastMessageKind: 'text' }, KIND_LABELS)).toBe('Merhaba');
  });

  it('metinsiz türde TÜRÜN etiketi okunur', () => {
    // Boş balon "mesaj kayboldu" okutur; ses mesajı gelen bir sohbette bu gerçek bir yanlış anlama.
    expect(socialPreview({ lastMessageText: null, lastMessageKind: 'media' }, KIND_LABELS)).toBe('[görsel / dosya]');
    expect(socialPreview({ lastMessageText: '  ', lastMessageKind: 'interactive' }, KIND_LABELS)).toBe('[etkileşimli kart]');
  });

  it('hiç mesaj yoksa boş — uydurma etiket basılmaz', () => {
    expect(socialPreview({ lastMessageText: null, lastMessageKind: null }, KIND_LABELS)).toBe('');
  });
});

describe('socialStamp — bugünse saat, değilse gün.ay', () => {
  const now = new Date('2026-08-23T14:00:00');

  it('aynı gün → saat', () => {
    expect(socialStamp(new Date('2026-08-23T09:05:00').toISOString(), now)).toBe('09:05');
  });

  it('başka gün → gün.ay', () => {
    expect(socialStamp(new Date('2026-08-21T09:05:00').toISOString(), now)).toBe('21.08');
  });

  it('aynı gün SAYISI ama başka ay/yıl → gün.ay (yalnız güne bakmak yanılırdı)', () => {
    expect(socialStamp(new Date('2026-07-23T09:05:00').toISOString(), now)).toBe('23.07');
    expect(socialStamp(new Date('2025-08-23T09:05:00').toISOString(), now)).toBe('23.08');
  });

  it('boş ya da bozuk damga PATLAMAZ, boş döner', () => {
    // Satır bir tarih yüzünden çizilememeli: eksik damga bir gösterim sorunudur, bir çökme değil.
    expect(socialStamp(null, now)).toBe('');
    expect(socialStamp('bozuk-tarih', now)).toBe('');
  });
});

describe('socialWindowOf — `never` ile `closed` AYNI DEĞİL', () => {
  const now = new Date('2026-08-23T14:00:00Z');

  it('damga yoksa `never` — müşteri bize hiç yazmadı', () => {
    // "Kaçırılmış fırsat" ile "kurulmamış ilişki" ayrı cümleler ister; tek kovaya atmak operatöre
    // yanlış eylemi önerirdi (web `WINDOW_NOTE` kararı).
    expect(socialWindowOf(null, now)).toEqual({ state: 'never', hoursLeft: 0 });
  });

  it('geçmiş damga `closed`', () => {
    expect(socialWindowOf('2026-08-23T13:59:00Z', now)).toEqual({ state: 'closed', hoursLeft: 0 });
  });

  it('tam sınırda `closed` — kalan sıfırsa pencere açık değildir', () => {
    expect(socialWindowOf('2026-08-23T14:00:00Z', now).state).toBe('closed');
  });

  it('açık pencerede kalan saat TAVANA yuvarlanır', () => {
    // "23 saat kaldı" demek, 22,3 saati "22" diye kısaltıp erken kapanma izlenimi vermekten iyidir.
    expect(socialWindowOf('2026-08-24T13:00:00Z', now)).toEqual({ state: 'open', hoursLeft: 23 });
    expect(socialWindowOf('2026-08-23T14:01:00Z', now)).toEqual({ state: 'open', hoursLeft: 1 });
  });

  it('bozuk damga `closed` — geçerli sayılıp serbest metne izin VERİLMEZ', () => {
    // Şüphede kalınan yer pahalı taraf olmamalı: yanlışlıkla "açık" demek şablon ücretine düşürür.
    expect(socialWindowOf('bozuk', now).state).toBe('closed');
  });
});
