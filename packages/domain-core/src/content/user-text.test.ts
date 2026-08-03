import { describe, expect, it } from 'vitest';
import { buildTranslationBag, resolveUserText } from './user-text';

describe('resolveUserText', () => {
  it('kaynak dil okuyucunun diliyse orijinali verir, çeviri işaretlemez', () => {
    const r = resolveUserText({ text: 'Ürün harikaydı', language: 'tr', translations: { fr: 'Excellent', de: 'Super' } }, 'tr');
    expect(r).toEqual({ text: 'Ürün harikaydı', isTranslated: false, sourceLanguage: 'tr' });
  });

  it('site dilinin çevirisi varsa onu verir ve ÇEVİRİ olarak işaretler', () => {
    const r = resolveUserText({ text: 'Ürün harikaydı', language: 'tr', translations: { fr: 'Le produit était excellent' } }, 'fr');
    expect(r).toEqual({ text: 'Le produit était excellent', isTranslated: true, sourceLanguage: 'tr' });
  });

  it('site dilinde çeviri yoksa ORİJİNALE düşer — başka bir çeviriye değil', () => {
    // Fransız okuyucuya Almanca çeviriyi göstermek onu orijinalden İKİ adım uzaklaştırırdı.
    const r = resolveUserText({ text: 'Ürün harikaydı', language: 'tr', translations: { de: 'Das Produkt war toll' } }, 'fr');
    expect(r).toEqual({ text: 'Ürün harikaydı', isTranslated: false, sourceLanguage: 'tr' });
  });

  it('sistemde olmayan bir dilde yazılmış metni üç dilin hepsinde okutur', () => {
    const bosnakca = { text: 'Proizvod je bio odličan', language: 'bs' as const, translations: { tr: 'Ürün harikaydı', fr: 'Excellent', de: 'Toll' } };
    expect(resolveUserText(bosnakca, 'tr').text).toBe('Ürün harikaydı');
    expect(resolveUserText(bosnakca, 'fr').text).toBe('Excellent');
    expect(resolveUserText(bosnakca, 'de').text).toBe('Toll');
    expect(resolveUserText(bosnakca, 'de').isTranslated).toBe(true);
  });

  it('çeviri henüz koşmadıysa orijinali gösterir — ekran boş kalmaz', () => {
    const r = resolveUserText({ text: 'Proizvod je bio odličan', language: null, translations: null }, 'fr');
    expect(r).toEqual({ text: 'Proizvod je bio odličan', isTranslated: false, sourceLanguage: null });
  });

  it('metinsiz kayıtta null döner — boş string değil', () => {
    expect(resolveUserText({ text: null, language: null, translations: null }, 'tr').text).toBeNull();
    expect(resolveUserText({ text: '   ', language: 'tr', translations: null }, 'tr').text).toBeNull();
  });

  it('boş çeviri torbadaysa yok sayılır, orijinal kazanır', () => {
    const r = resolveUserText({ text: 'Merhaba', language: 'tr', translations: { fr: '  ' } }, 'fr');
    expect(r).toEqual({ text: 'Merhaba', isTranslated: false, sourceLanguage: 'tr' });
  });
});

describe('buildTranslationBag', () => {
  it('kaynak dili torbaya KOYMAZ — orijinal satırda duruyor', () => {
    const bag = buildTranslationBag('tr', { tr: 'Ürün harikaydı', fr: 'Excellent', de: 'Toll' });
    expect(bag).toEqual({ fr: 'Excellent', de: 'Toll' });
    expect(bag).not.toHaveProperty('tr');
  });

  it('kaynak site dillerinden biri değilse ÜÇÜ de torbaya girer', () => {
    const bag = buildTranslationBag('bs', { tr: 'Ürün harikaydı', fr: 'Excellent', de: 'Toll' });
    expect(bag).toEqual({ tr: 'Ürün harikaydı', fr: 'Excellent', de: 'Toll' });
  });

  it('boş çeviriyi atar', () => {
    expect(buildTranslationBag('tr', { tr: 'x', fr: '', de: '  ' })).toEqual({});
  });

  it('kurduğu torba, çözümleyicinin "torbadan gelen çeviridir" varsayımını bozmaz', () => {
    // İki fonksiyon birbirinin sözleşmesine dayanıyor: torbada kaynak dil YOKSA, torbadan okunan
    // her metin gerçekten çeviridir. Ayrı ayrı doğru olup birlikte yanlış olmadıklarını sınar.
    const bag = buildTranslationBag('fr', { tr: 'Merhaba', fr: 'Bonjour', de: 'Hallo' });
    const okunan = resolveUserText({ text: 'Bonjour', language: 'fr', translations: bag }, 'fr');
    expect(okunan.isTranslated).toBe(false);
    expect(okunan.text).toBe('Bonjour');
  });
});
