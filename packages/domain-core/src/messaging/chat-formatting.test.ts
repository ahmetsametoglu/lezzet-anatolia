import { describe, expect, it } from 'vitest';
import { formatForChannel, rendersChatFormatting, stripChatFormatting } from './chat-formatting';

/*
  Bu testlerin çivilediği kural: biçimlendirme kararı PROMPT'ta değil YÜZEYDE (06.09). Ajan her
  zaman işaretli yazıyor; hangi kanalın çizdiğini burası biliyor. Kural buradan kaçarsa arıza
  sessizdir — Messenger müşterisi `*Fıstıklı Baklava*` diye okur ve kimse fark etmez.
*/

describe('stripChatFormatting', () => {
  it('işareti söker, içeriği bırakır', () => {
    expect(stripChatFormatting('*Fıstıklı Baklava*')).toBe('Fıstıklı Baklava');
    expect(stripChatFormatting('_ücretsiz_')).toBe('ücretsiz');
    expect(stripChatFormatting('~50,81 €~')).toBe('50,81 €');
  });

  it('cümle içindeki vurguyu da söker', () => {
    expect(stripChatFormatting('Bugün *Fıstıklı Baklava* var.')).toBe('Bugün Fıstıklı Baklava var.');
  });

  it('MADDE İŞARETİNİ ve satır yapısını KORUR', () => {
    // Sökülseydi dört boy tek paragrafa yapışırdı — listenin okunabilirliğini taşıyan tek şey bu.
    const liste = '*Fıstıklı Baklava* — 4 boy:\n• 225 g — 4,57 €\n• 450 g — 9,15 €';
    expect(stripChatFormatting(liste)).toBe('Fıstıklı Baklava — 4 boy:\n• 225 g — 4,57 €\n• 450 g — 9,15 €');
  });

  it('ÇARPMA işaretini yemez — yıldız her zaman biçimlendirme değildir', () => {
    // Katalogda "2 × 150 g" kadar "2*150" da geçebilir; bunu vurgu sanmak metni bozardı.
    expect(stripChatFormatting('9*90 g paket')).toBe('9*90 g paket');
    expect(stripChatFormatting('2 * 3 kutu')).toBe('2 * 3 kutu');
  });

  it('yıldızlı madde listesini vurgu sanmaz', () => {
    // Açılıştan sonra boşluk varsa bu bir listedir, kalın metin değil.
    expect(stripChatFormatting('* 225 g\n* 450 g')).toBe('* 225 g\n* 450 g');
  });

  it('kapanmamış işareti olduğu gibi bırakır', () => {
    expect(stripChatFormatting('*yarım kalmış')).toBe('*yarım kalmış');
  });

  it('alt tireli kelimeyi bozmaz', () => {
    // `order_source` gibi teknik bir dize cevaba girerse italik sanılmamalı.
    expect(stripChatFormatting('order_source alanı')).toBe('order_source alanı');
  });
});

describe('rendersChatFormatting', () => {
  it('yalnız WhatsApp çizer', () => {
    expect(rendersChatFormatting('whatsapp')).toBe(true);
    expect(rendersChatFormatting('messenger')).toBe(false);
    expect(rendersChatFormatting('instagram')).toBe(false);
    expect(rendersChatFormatting('ticket')).toBe(false);
  });

  it('TANINMAYAN kanal ÇİZMEZ sayılır', () => {
    // Yanlış yönde hata yapmak (gereksiz sökmek), çıplak yıldız göstermekten ucuzdur.
    expect(rendersChatFormatting('yeni-kanal')).toBe(false);
  });
});

describe('formatForChannel', () => {
  const metin = '*Fıstıklı Baklava* — 4,57 €';

  it('WhatsApp metne DOKUNMAZ', () => {
    expect(formatForChannel(metin, 'whatsapp')).toBe(metin);
  });

  it('Messenger ve Instagram için söker', () => {
    expect(formatForChannel(metin, 'messenger')).toBe('Fıstıklı Baklava — 4,57 €');
    expect(formatForChannel(metin, 'instagram')).toBe('Fıstıklı Baklava — 4,57 €');
  });

  it('talep yüzeyi için söker', () => {
    expect(formatForChannel(metin, 'ticket')).toBe('Fıstıklı Baklava — 4,57 €');
  });
});
