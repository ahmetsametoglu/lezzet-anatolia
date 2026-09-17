import { describe, expect, it } from 'vitest';
import placeMessages from '@lezzet/i18n/customer/place';
import { cardPlaceNoteOf, elsewhereReasonOf, placeMarkOf, showsNoShipChip } from './delivery';

/*
  YER İŞARETİ — "bu ürün BANA nasıl gelir" sorusunun cevabı; native katalog, vitrin ve web telefon görünümü
  aynı kuralı okur. Native'in `place-view.test.ts`i aynı iddiaları kendi yer nesnesiyle
  sürdürüyor; buradaki iki çivi kuralın KENDİSİ:
    · bilmemek "gönderemiyoruz" değildir — yer bilinmiyorsa not GEÇİCİDİR;
    · "kargoyla gelir" kartta yazılmaz — kartın notu yalnız kapalı kapı ve bekleyen bölgedir.
*/

const tr = placeMessages.tr;
const inRoute = { inRoute: true };
const outOfRoute = { inRoute: false };

describe('elsewhereReasonOf', () => {
  it('rota dışı → bölge · rota içi ya da yer yok → kalem', () => {
    expect(elsewhereReasonOf(outOfRoute)).toBe('out_of_route');
    expect(elsewhereReasonOf(inRoute)).toBe('stock');
    expect(elsewhereReasonOf(null)).toBe('stock');
  });
});

describe('placeMarkOf', () => {
  it('kargo hâli bilgi tonunda — rota ne olursa olsun', () => {
    expect(placeMarkOf('shipping', outOfRoute, tr)).toEqual({ label: tr.shipMark, tone: 'info' });
    expect(placeMarkOf('shipping', null, tr)).toEqual({ label: tr.shipMark, tone: 'info' });
  });

  it('satılabilir, tükenmiş ve bilinmeyen hâl SESSİZ', () => {
    expect(placeMarkOf('available', outOfRoute, tr)).toBeNull();
    expect(placeMarkOf('out_of_stock', outOfRoute, tr)).toBeNull();
    expect(placeMarkOf(null, outOfRoute, tr)).toBeNull();
  });

  it('rota DIŞINDA başka yerdeki ürün → kapalı kapı', () => {
    expect(placeMarkOf('elsewhere', outOfRoute, tr)).toEqual({ label: tr.lineBlocked, tone: 'blocked' });
  });

  it('rota İÇİNDE başka yerdeki ürün → bekleyen bölge', () => {
    expect(placeMarkOf('elsewhere', inRoute, tr)).toEqual({ label: tr.awayMark, tone: 'pending' });
  });

  it('YER BİLİNMİYORSA bekleyen — kalıcı ret için rota dışında olduğunu BİLMEK gerekir', () => {
    expect(placeMarkOf('elsewhere', null, tr)).toEqual({ label: tr.awayMark, tone: 'pending' });
  });

  it('cümle müşterinin dilinde', () => {
    expect(placeMarkOf('elsewhere', outOfRoute, placeMessages.fr)?.label).toBe(placeMessages.fr.lineBlocked);
  });
});

describe('cardPlaceNoteOf', () => {
  it('"kargoyla gelir" kartta YAZILMAZ ve soldurmaz', () => {
    expect(cardPlaceNoteOf(placeMarkOf('shipping', outOfRoute, tr), tr)).toEqual({ note: undefined, dimmed: false });
  });

  it('kapalı kapı yazar VE soldurur', () => {
    expect(cardPlaceNoteOf(placeMarkOf('elsewhere', outOfRoute, tr), tr)).toEqual({ note: tr.cardBlocked, dimmed: true });
  });

  it('bekleyen bölge yazar ama soldurmaz — ürün gelebilir', () => {
    expect(cardPlaceNoteOf(placeMarkOf('elsewhere', inRoute, tr), tr)).toEqual({ note: tr.awayMark, dimmed: false });
  });

  it('işaret yoksa not da yok', () => {
    expect(cardPlaceNoteOf(null, tr)).toEqual({ note: undefined, dimmed: false });
  });

  it('geniş kart kapalı kapının GEREKÇESİNİ yazar, kısa işareti değil', () => {
    expect(cardPlaceNoteOf(placeMarkOf('elsewhere', outOfRoute, tr), tr, { wide: true })).toEqual({
      note: tr.lineBlocked,
      dimmed: true,
    });
    // Bekleyen bölgenin cümlesi kart ölçüsüne bağlı değil: tek cümlesi var.
    expect(cardPlaceNoteOf(placeMarkOf('elsewhere', inRoute, tr), tr, { wide: true })).toEqual({
      note: tr.awayMark,
      dimmed: false,
    });
  });
});

describe('showsNoShipChip', () => {
  it('kapalı kapıda kısıt çipi çizilmez — işaret aynı kısıtı daha kesin söylüyor', () => {
    expect(showsNoShipChip(false, 'blocked')).toBe(false);
  });

  it('yer bilinmezken ya da bekleyen bölgede kısıt çipi kalır', () => {
    expect(showsNoShipChip(false, null)).toBe(true);
    expect(showsNoShipChip(false, 'pending')).toBe(true);
  });

  it('kargolanabilen üründe çip yok', () => {
    expect(showsNoShipChip(true, null)).toBe(false);
  });
});
