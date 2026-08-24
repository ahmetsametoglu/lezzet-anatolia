import { describe, expect, it } from 'vitest';
import { render } from '@react-email/render';
import { HeaderCard, InfoBlock, ItemsCard, MessageCard, NoticeCard, QuoteCard, StatusBlock, Timeline } from './email-layout';

/**
 * BLOKLARIN SOL HİZASI — sekiz blok, tek kenar (21.102 · MB-40).
 *
 * ── NEDEN TEST, NEDEN GÖZ DEĞİL ─────────────────────────────────────────────
 * Arıza *"metnin sol kenarı bloktan bloğa zıplıyor"*du ve sayfa kenarından ölçülünce BEŞ ayrı
 * değer çıkmıştı (46 · 54 · 55 · 57 · 59). Kimse bunu hata olarak bildirmedi; *"kartlar farklı
 * genişlikte"* diye, yani YANLIŞ ADLA bildirildi — kutular zaten aynı genişlikteydi.
 *
 * Düzeltme hizayı türetilir yaptı (`TEXT_INSET` tek yerde, `innerX(kenarlık, şerit)` her bloğun iç
 * dolgusunu ondan hesaplar). Geriye gidiş de aynı sessizlikte olur: yeni blok yazan biri
 * `padding: '18px 24px'` yazar, hiçbir şey patlamaz, kenar yeniden zıplar.
 *
 * ── ÖLÇÜM KAYNAĞI TEKRAR ETMEZ ──────────────────────────────────────────────
 * Testin ilk taslağı her blok için kenarlık ve şerit kalınlığını ELLE yazıyordu ve iki bloğu YANLIŞ
 * yazdım (QuoteCard'ın 2 px'i şerit değil `border-left`, StatusBlock'un 4 px'i kenarlık değil ayrı
 * bir hücre). Kaynağı tekrar eden bir test, kaynakla birlikte yanılır.
 *
 * Bu yüzden hiza **render edilmiş HTML'den TOPLANIYOR**: satır dolgusu + soldaki kenarlıklar +
 * varsa şerit hücresinin genişliği + içerik hücresinin sol dolgusu. Bu toplam müşterinin gözünde
 * metnin başladığı yerdir ve sekiz bloğun sekizinde de aynı olmak zorundadır. `innerX` dışarı
 * açılmadı, açılmamalı da — sınanan şey aritmetiği değil, SONUCU.
 *
 * **İlk sondada SAHTE YEŞİL yaşandı** (21.102 künyesi): ölçülen küme boş kaldı ve iddia boşluğa
 * geçti. O yüzden aşağıda önce kümenin dolu olduğu iddia ediliyor.
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
 * Bir bloğun HTML'inde metnin sayfa kenarından uzaklığı.
 *
 * Sıra belgenin kendi sırası: ilk dolgu satırın (`Row`), ikincisi metni taşıyan hücrenin. Aradaki
 * her şey — tablonun kenarlığı, vurgu şeridi — metni sağa iter ve toplama girer.
 */
async function textInset(node: React.ReactElement): Promise<number> {
  const html = await render(node);

  const paddings = [...html.matchAll(/padding:\s*([^;"]+)/g)];
  // Sahte yeşile karşı: render bir şey üretmediyse aşağıdaki toplam `NaN` olur ve iddia anlamsız
  // bir sayıyla kıyaslanırdı. Kümeyi ÖNCE doğruluyoruz.
  expect(paddings.length).toBeGreaterThanOrEqual(2);
  const [satir, icerik] = paddings;
  expect(leftOf(satir?.[1])).toBe(ROW_INSET);

  /* SAYIM İÇERİK HÜCRESİNE KADAR — ilk taslak bütün HTML'i tarıyordu ve `ItemsCard`ta 167 çıktı:
     tablonun İÇİNDEKİ sütun genişlikleri (`<td width="110">`) de toplama giriyordu. Oysa metnin sol
     kenarını yalnız ONDAN ÖNCE gelen şeyler iter — içerideki her şey zaten o kenarın sağında.
     Bu yüzden önek, içerik hücresinin açılış etiketinin SONUNA kadar alınıyor: ata düğümler ve
     önceki kardeşler girer, kendi içeriği girmez. */
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
    // Tek tek doğru olmak yetmez: arıza "hangi blok yanlış" değil, "kaç farklı kenar var"dı.
    // Küme tek elemanlı olmalı; iki elemanlı olduğu an sürüklenme geri gelmiş demektir.
    const kenarlar = new Set<number>();
    for (const [, node] of bloklar) kenarlar.add(await textInset(node));

    expect([...kenarlar]).toEqual([TEXT_INSET]);
  });

  it('şeritli blok da şeritsizle AYNI kenarda — şerit metni sağa itmez, iç dolgudan düşülür', async () => {
    // Kırılgan olan tam bu: `StatusBlock`un 4 px'lik vurgu şeridi ayrı bir HÜCRE, kenarlık değil.
    // Şeridi `innerX`e bildirmeyi unutan bir yazım metni tam 4 px sağa kaydırır ve gözle ancak
    // komşu blokla yan yana görünür (ölçüldü 21.102: 59 ↔ 57).
    const seritli = await textInset(StatusBlock({ tone: 'red', headline: 'İptal', detail: 'Ödeme alınamadı.' }));
    const seritsiz = await textInset(NoticeCard({ title: 'Bilgi', text: 'Kısa not.' }));

    expect(seritli).toBe(seritsiz);
  });
});
