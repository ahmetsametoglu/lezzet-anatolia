import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatText } from './chat-text';

/*
  SOHBET ÇİZİCİSİ (06.09) — çivilenenler:
  · üç işaret üç elemana çıkıyor (`strong`/`em`/`s`) ve İÇ İÇE işaret TEK parçada birleşiyor
  · `•` madde satırları gerçek bir listeye dönüyor, ham işaret metinde KALMIYOR
  · paragraf içindeki satır sonu ekranda duruyor — `whitespace-pre-wrap` çizicinin kendi işi,
    çağıranın hatırlaması gereken bir kural değil
  · işaretsiz metin hiçbir şey kazanmıyor: yüzey biçimlendirmeyi öğrenince düz mesajlar aynen kalmalı
  · HTML ÜRETİLMİYOR: müşterinin yazdığı `<script>` kaçırılıyor, çalıştırılmıyor
  · boş/None metin hiç çizmiyor — boş bir balon "mesaj var" der, oysa yok

  Komponent JSX'siz, düz FONKSİYON olarak çağrılıyor: depoda jsdom da testing-library da YOK ve bu
  bilinçli (kök `vitest.config.ts` künyesi), koşucu da test dosyasındaki JSX'i çevirmiyor —
  e-posta şablonlarının testi de aynı deseni kullanıyor. Sınanan şey zaten DOM etkileşimi değil,
  üretilen işaretleme.
*/

const html = (props: Parameters<typeof ChatText>[0]): string => renderToStaticMarkup(ChatText(props));

describe('ChatText', () => {
  it('üç işareti üç elemana çizer', () => {
    const out = html({ text: '*kalın* ve _italik_ ve ~çizili~' });
    expect(out).toContain('<strong class="font-semibold">kalın</strong>');
    expect(out).toContain('<em class="italic">italik</em>');
    expect(out).toContain('<s class="line-through">çizili</s>');
    // İşaretin kendisi ekranda kalmamalı — sökmek yerine çizmenin bütün amacı bu.
    expect(out).not.toContain('*');
    expect(out).not.toContain('~');
  });

  it('iç içe işareti tek parçada birleştirir', () => {
    const out = html({ text: '*_iki birden_*' });
    expect(out).toContain('<strong class="font-semibold"><em class="italic">iki birden</em></strong>');
  });

  it('madde satırlarını listeye çevirir ve ham işareti yutar', () => {
    const out = html({ text: 'Üç boy var:\n• Küçük\n• Orta\n• Büyük' });
    expect(out).toContain('<ul');
    expect(out.match(/<li/g)).toHaveLength(3);
    expect(out).toContain('Küçük');
    // Madde işareti listenin KENDİSİNE dönüştü; metinde ikinci kez çizilmemeli.
    expect(out).not.toContain('•');
    // Listeden önceki cümle kendi paragrafında kalır — ayrıştırıcının satır yapısı korunuyor.
    expect(out).toContain('Üç boy var:');
  });

  it('paragraf içindeki satır sonunu çizicinin kendisi korur', () => {
    const out = html({ text: 'ilk satır\nikinci satır' });
    expect(out).toContain('whitespace-pre-wrap');
    expect(out).toContain('ilk satır\nikinci satır');
  });

  it('işaretsiz metni olduğu gibi bırakır', () => {
    const out = html({ text: 'Kutuda iki kavanoz eksikti.' });
    expect(out).toContain('Kutuda iki kavanoz eksikti.');
    expect(out).not.toContain('<strong');
    expect(out).not.toContain('<em');
  });

  it('çarpma işaretini biçimlendirme sanmaz', () => {
    const out = html({ text: '2*3 kutu ve 100 g * 4' });
    expect(out).not.toContain('<strong');
    expect(out).toContain('2*3 kutu');
  });

  it('müşteri metnindeki HTML çalıştırılmaz, kaçırılır', () => {
    const out = html({ text: '<script>alert(1)</script>' });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('kutu sınıfını ve dili çağırandan alır', () => {
    const out = html({ text: 'merhaba', className: 'balon', lang: 'fr' });
    expect(out).toContain('class="balon"');
    expect(out).toContain('lang="fr"');
  });

  it('metin yoksa hiç çizmez', () => {
    expect(html({ text: '' })).toBe('');
    expect(html({ text: null })).toBe('');
    expect(html({ text: undefined })).toBe('');
  });
});
