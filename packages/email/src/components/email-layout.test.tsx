import { Fragment, createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@react-email/render';
import { EmailLayout, HeaderCard, InfoBlock, ItemsCard, MessageCard, NoticeCard, QuoteCard, StatusBlock, Timeline } from './email-layout';

/**
 * Blokların metni sayfa kenarından aynı uzaklıkta başlamalı. Uzaklık render edilmiş HTML'den toplanır, çünkü kaynağın aritmetiğini
 * tekrar eden bir test kaynakla birlikte yanılır.
 */

/** Şablonun satır dolgusu — hizanın değişmeyen tabanı (`ROW_INSET`, `email-layout.tsx`). */
const ROW_INSET = 32;
/** Metnin sayfa kenarından hedef uzaklığı (`TEXT_INSET`) — sekiz bloğun buluştuğu tek sayı. */
const TEXT_INSET = 57;

/** `"18px 24px"` → 24 · `"0 0 12px 23px"` → 23 · `"0px 32px 18px"` → 32. CSS kısayazımının SOLU. */
function leftOf(shorthand: string | undefined): number {
  const parts = (shorthand ?? '').trim().split(/\s+/);
  const left = parts.length >= 4 ? parts[3] : (parts[1] ?? parts[0]);
  return Number.parseFloat(left ?? '');
}

/**
 * Bir bloğun HTML'inde metnin sayfa kenarından uzaklığı: ilk dolgu satırın (`Row`), ikincisi metni taşıyan hücrenin. Aradaki
 * kenarlık ve vurgu şeridi metni sağa iter ve toplama girer.
 */
async function textInset(node: React.ReactElement): Promise<number> {
  const html = await render(node);

  const paddings = [...html.matchAll(/padding:\s*([^;"]+)/g)];
  // Render bir şey üretmezse toplam `NaN` olur ve iddia boşluğa geçer; küme önce doğrulanır.
  expect(paddings.length).toBeGreaterThanOrEqual(2);
  const [satir, icerik] = paddings;
  expect(leftOf(satir?.[1])).toBe(ROW_INSET);

  // Metnin sol kenarını yalnız içerik hücresinden önce gelenler iter; tablonun içindeki sütun genişlikleri sayılmaz.
  const onek = html.slice(0, html.indexOf('>', icerik?.index ?? 0));

  // Kenarlık: `border: 1px …` dört kenara birden yazar, yani soldaki de odur; `border-left` zaten
  // adıyla söyler. `border-top` (alıntı satırlarının ayracı) sola dokunmaz, o yüzden eşleşmiyor.
  const borders = [...onek.matchAll(/border(?:-left)?:\s*(\d+)px/g)].reduce((sum, m) => sum + Number(m[1]), 0);

  // Vurgu şeridi ayrı bir HÜCRE olabilir (`StatusBlock`: `<td width="4">`). Yüzdeli genişlikler
  // (`width="100%"`) eşleşmez — onlar yerleşim genişliğidir, metni itmezler.
  const stripes = [...onek.matchAll(/<td width="(\d+)"/g)].reduce((sum, m) => sum + Number(m[1]), 0);

  return ROW_INSET + borders + stripes + leftOf(icerik?.[1]);
}

const bloklar: readonly [ad: string, node: React.ReactElement][] = [
  ['HeaderCard', HeaderCard({ title: 'Sipariş', meta: 'LZA-1234', statusLabel: 'Hazırlanıyor' })],
  ['NoticeCard', NoticeCard({ title: 'Bilgi', text: 'Teslimat saatiniz güncellendi.' })],
  ['InfoBlock', InfoBlock({ icon: '📦', headline: 'Kargo', detail: 'Yarın çıkıyor.' })],
  ['StatusBlock', StatusBlock({ tone: 'green', headline: 'Teslim edildi', detail: 'Afiyet olsun.' })],
  ['MessageCard', MessageCard({ title: 'Mesaj', meta: 'Bugün 10:00', body: 'Merhaba.' })],
  ['QuoteCard', QuoteCard({ title: 'Talep', entries: [{ author: 'Ayşe', at: 'Bugün 10:00', body: 'Ne zaman gelir?', note: null }] })],
  [
    'ItemsCard',
    ItemsCard({
      title: 'Ürünler',
      lines: [{ name: 'Baklava', qty: 2, meta: '500 g', amount: '12,90 €', shortfall: null }],
    }),
  ],
  [
    'Timeline',
    Timeline({
      steps: [{ key: 'received', detail: 'Bugün 10:00', state: 'done' }],
      labels: { received: 'Alındı', prepared: 'Hazırlandı', on_the_way: 'Yolda', delivered: 'Teslim edildi' },
    }),
  ],
];

describe('blokların sol hizası', () => {
  it.each(bloklar)('%s metni ortak kenardan başlıyor', async (_ad, node) => {
    await expect(textInset(node)).resolves.toBe(TEXT_INSET);
  });

  it('SEKİZ BLOK TEK KENARDA buluşuyor — arızanın kendisi beş ayrı değerdi', async () => {
    // Tek tek doğru olmak yetmez; iki ayrı kenar varsa metin okurken zıplar.
    const kenarlar = new Set<number>();
    for (const [, node] of bloklar) kenarlar.add(await textInset(node));

    expect([...kenarlar]).toEqual([TEXT_INSET]);
  });

  it('şeritli blok da şeritsizle AYNI kenarda — şerit metni sağa itmez, iç dolgudan düşülür', async () => {
    // `StatusBlock`un 4 px'lik vurgu şeridi kenarlık değil ayrı bir hücredir; `innerX`e bildirilmezse metin 4 px sağa kayar.
    const seritli = await textInset(StatusBlock({ tone: 'red', headline: 'İptal', detail: 'Ödeme alınamadı.' }));
    const seritsiz = await textInset(NoticeCard({ title: 'Bilgi', text: 'Kısa not.' }));

    expect(seritli).toBe(seritsiz);
  });
});

describe('dar ekran kuralı', () => {
  it('telefonda kap ekrana sığar ve her satırın yatay dolgusu daralır', async () => {
    // Kural yoksa 600 px'lik kap telefonda taşar ve Gmail uygulaması e-postayı sığdırırken tabloların genişliğini bozar.
    const html = await render(
      EmailLayout({
        preview: 'Önizleme',
        locale: 'fr',
        brandName: 'Lezzet Anatolie',
        region: 'Strasbourg',
        footer: { address: 'Adres', notice: 'Bilgi.', preferencesLabel: 'Tercihler', preferencesUrl: 'https://example.test' },
        children: bloklar.map(([ad, node]) => createElement(Fragment, { key: ad }, node)),
      }),
    );
    const media = /@media[^{]*\(max-width:\s*(\d+)px\)\s*\{(.*)\}\s*<\/style>/s.exec(html);
    expect(Number(media?.[1])).toBeGreaterThan(600);
    const kurallar = new Map<string, string>();
    for (const m of (media?.[2] ?? '').matchAll(/\.([\w-]+)\{([^}]*)\}/g)) kurallar.set(m[1] ?? '', m[2] ?? '');
    const kurali = (etiket: string) => kurallar.get(/class="([^"]+)"/.exec(etiket)?.[1] ?? '') ?? '';

    expect(kurali(/<table[^>]*width="600"[^>]*>/.exec(html)?.[0] ?? '')).toMatch(/width:100%/);

    const satirlar = [...html.matchAll(/<td[^>]*>/g)]
      .map((m) => m[0])
      .filter((etiket) => new RegExp(`padding:\\S+ ${ROW_INSET}px`).test(etiket));
    // Başlık, sekiz blok ve alt bilgi; küme boş kalırsa iddia boşluğa geçer.
    expect(satirlar.length).toBeGreaterThanOrEqual(bloklar.length + 2);
    for (const etiket of satirlar) expect(Number(/padding-left:(\d+)px/.exec(kurali(etiket))?.[1])).toBeLessThan(ROW_INSET);
  });
});
