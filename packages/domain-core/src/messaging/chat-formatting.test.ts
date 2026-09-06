import { describe, expect, it } from 'vitest';
import {
  chatBlocksToText,
  formatForChannel,
  parseChatFormatting,
  rendersChatFormatting,
  stripChatFormatting,
} from './chat-formatting';

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

describe('parseChatFormatting', () => {
  it('işaretsiz metin tek paragraf olur', () => {
    expect(parseChatFormatting('Merhaba!')).toEqual([{ kind: 'paragraph', spans: [{ text: 'Merhaba!' }] }]);
  });

  it('boş girdi boş dizi', () => {
    expect(parseChatFormatting('')).toEqual([]);
  });

  it('vurguyu span işaretine çevirir, metni bölerken kaybetmez', () => {
    expect(parseChatFormatting('Bugün *Fıstıklı Baklava* var.')).toEqual([
      {
        kind: 'paragraph',
        spans: [{ text: 'Bugün ' }, { text: 'Fıstıklı Baklava', bold: true }, { text: ' var.' }],
      },
    ]);
  });

  it('İÇ İÇE işaret tek span’da BİRLEŞİR', () => {
    // WhatsApp `*_böyle_*` yazmaya izin veriyor; iki ayrı span üretmek çiziciyi
    // "kalının içindeki italik" sorusuyla baş başa bırakırdı.
    expect(parseChatFormatting('*_çok önemli_*')).toEqual([
      { kind: 'paragraph', spans: [{ text: 'çok önemli', bold: true, italic: true }] },
    ]);
  });

  it('ardışık madde satırları TEK liste bloğu olur', () => {
    const blocks = parseChatFormatting('*Fıstıklı Baklava* — 4 boy:\n• 225 g — 4,57 €\n• 450 g — 9,15 €');
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        spans: [{ text: 'Fıstıklı Baklava', bold: true }, { text: ' — 4 boy:' }],
      },
      {
        kind: 'list',
        items: [[{ text: '225 g — 4,57 €' }], [{ text: '450 g — 9,15 €' }]],
      },
    ]);
  });

  it('liste bittikten sonraki metin YENİ paragrafa düşer', () => {
    const blocks = parseChatFormatting('Boylar:\n• 225 g\nSiparişinizi sitemizden verebilirsiniz.');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list', 'paragraph']);
  });

  it('paragraf içindeki satır sonu KORUNUR', () => {
    // Sohbette satır sonu bir yazım kararıdır; yutulsaydı metin tek satıra yapışırdı.
    const blocks = parseChatFormatting('Merhaba!\nNasıl yardımcı olabilirim?');
    expect(blocks).toEqual([{ kind: 'paragraph', spans: [{ text: 'Merhaba!\nNasıl yardımcı olabilirim?' }] }]);
  });

  it('madde içindeki vurgu da çözülür', () => {
    expect(parseChatFormatting('• *225 g* — 4,57 €')).toEqual([
      { kind: 'list', items: [[{ text: '225 g', bold: true }, { text: ' — 4,57 €' }]] },
    ]);
  });

  it('çarpma işaretini vurgu sanmaz — sökücüyle AYNI sınır kuralı', () => {
    expect(parseChatFormatting('9*90 g paket')).toEqual([{ kind: 'paragraph', spans: [{ text: '9*90 g paket' }] }]);
  });
});

describe('ayrıştırıcı ↔ sökücü EŞDEĞERLİĞİ', () => {
  /*
    Bu paketin en değerli testi. İki okuma (sökme ve çizme) aynı söz dizimini ayrı
    kodla yorumluyor; ayrışırlarsa Messenger müşterisinin gördüğü metinle talep
    ekranının çizdiği metin FARKLI olur — ve arıza yalnız tek kanalda görüldüğü için
    bulunması en zor türden olur. Eşdeğerlik burada yapısal olarak çiviliyor.
  */
  const ornekler = [
    'Merhaba!',
    'Bugün *Fıstıklı Baklava* var.',
    '*Fıstıklı Baklava* — 4 boy:\n• 225 g — 4,57 €\n• 450 g — 9,15 €',
    'Boylar:\n• 225 g\nSiparişinizi sitemizden verebilirsiniz.',
    '_ücretsiz_ kargo ~50,81 €~ değil',
    '9*90 g paket · order_source alanı',
    'Merhaba!\nNasıl yardımcı olabilirim?',
    '*_çok önemli_* bir not',
  ];

  it.each(ornekler)('blokların metni sökülmüş metinle birebir aynı: %s', (metin) => {
    expect(chatBlocksToText(parseChatFormatting(metin))).toBe(stripChatFormatting(metin));
  });
});
