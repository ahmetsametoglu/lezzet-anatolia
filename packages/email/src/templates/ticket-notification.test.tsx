import { describe, expect, it } from 'vitest';
import { render } from '@react-email/render';
import type { PreferredLanguage, TicketNotification } from '@lezzet/types';
import {
  TicketReceivedEmail,
  TicketRepliedEmail,
  TicketStatusChangedEmail,
  ticketReceivedSubject,
  ticketRepliedSubject,
  ticketStatusChangedSubject,
} from './ticket-notification';

/**
 * Talep e-postaları (14.7 · 16.4). Sınanan altı şey: **metin müşterinin dilinde çıkıyor**,
 * **cevabın tam metni mailde**, **öncesi alıntı olarak mailde**, **teyit maili müşterinin kendi
 * anlatımını taşıyor**, **çözülen talepte "yine yazabilirsin" daveti var**, **kapalı ile yeniden
 * açılan ayırt ediliyor**.
 */

const base: TicketNotification = {
  ticketId: '11111111-1111-1111-1111-111111111111',
  subject: null,
  type: 'missing',
  status: 'in_progress',
  customerName: 'Ayşe Kaya',
  locale: 'tr',
  orderReferenceNo: 'LZA-1234',
  openedOn: '22 Temmuz 2026',
  history: [
    {
      sender: 'admin',
      body: 'Eksik gönderilen kalemi tespit ettik.\nBedeli iade edildi; 3-5 iş günü içinde hesabınızda görünür.',
      at: '24 Temmuz, 10:40',
      truncated: false,
    },
    { sender: 'customer', body: 'Kutuda iki kavanoz eksikti.', at: '23 Temmuz, 18:05', truncated: false },
  ],
  previousStatus: null,
  ticketUrl: 'https://example.test/tr/talepler/11111111',
  notificationPreferencesUrl: 'https://example.test/tr/tercihler',
};

const props = { brandName: 'Lezzet Anatolia', postalAddress: 'Lezzet Anatolia · Strasbourg' };

const RENDERERS = {
  received: TicketReceivedEmail,
  replied: TicketRepliedEmail,
  status: TicketStatusChangedEmail,
} as const;

function html(data: TicketNotification, kind: keyof typeof RENDERERS = 'replied'): Promise<string> {
  return render(RENDERERS[kind]({ data, ...props }));
}

describe('cevap maili', () => {
  it('personelin cevabı TAM metniyle mailde — müşteri okumak için tıklamak zorunda değil', async () => {
    const output = await html(base);

    expect(output).toContain('Eksik gönderilen kalemi tespit ettik.');
    expect(output).toContain('3-5 iş günü içinde hesabınızda görünür.');
  });

  it('başlık yoksa künye tip etiketine düşer — boş bir satır gösterilmez', async () => {
    expect(await html(base)).toContain('Eksik ürün');
    expect(await html({ ...base, subject: 'Kargo hasarlı geldi' })).toContain('Kargo hasarlı geldi');
  });

  it('sipariş bağı künyede görünür — "hangi sipariş" ilk sorudur', async () => {
    expect(await html(base)).toContain('LZA-1234');
    expect(await html({ ...base, orderReferenceNo: null })).not.toContain('LZA-1234');
  });

  it('konu satırı talebi tanıtır', () => {
    expect(ticketRepliedSubject(base)).toBe('Talebinize cevap verdik — Eksik ürün');
  });

  it('cevabın ÖNCESİ alıntılanır — "neye cevap verdiler" tıklamayı gerektirmesin', async () => {
    const output = await html(base);

    expect(output).toContain('Önceki mesajlar');
    expect(output).toContain('Kutuda iki kavanoz eksikti.');
    // Müşterinin kendi mesajı "Siz" diye işaretlenir; personelinki markadan ayrılmaz.
    expect(output).toContain('Siz');
  });

  it('tek mesajlık talepte alıntı bloğu HİÇ çizilmez — boş bir başlık gösterilmez', async () => {
    const output = await html({ ...base, history: [base.history[0]!] });

    expect(output).not.toContain('Önceki mesajlar');
  });

  it('kırpılan alıntı kırpıldığını SÖYLER — sessizce kesmek okunanı değiştirirdi', async () => {
    const output = await html({
      ...base,
      history: [base.history[0]!, { ...base.history[1]!, body: 'çok uzun bir anlatım', truncated: true }],
    });

    expect(output).toContain('Mesajın tamamı talep sayfasında.');
  });
});

describe('teyit maili', () => {
  it('müşterinin KENDİ anlatımı mailde — ne ulaştığının kanıtı odur', async () => {
    const received: TicketNotification = {
      ...base,
      status: 'open',
      history: [{ sender: 'customer', body: 'Kutuda iki kavanoz eksikti.', at: '23 Temmuz, 18:05', truncated: false }],
    };
    const output = await html(received, 'received');

    expect(output).toContain('Talebinizi aldık');
    expect(output).toContain('Bize yazdıklarınız');
    expect(output).toContain('Kutuda iki kavanoz eksikti.');
  });

  it('konu satırı talebi tanıtır ve üç dilde çevrilir', () => {
    expect(ticketReceivedSubject(base)).toBe('Talebinizi aldık — Eksik ürün');
    expect(ticketReceivedSubject({ ...base, locale: 'fr' })).toContain('bien reçu');
    expect(ticketReceivedSubject({ ...base, locale: 'de' })).toContain('erhalten');
  });
});

describe('durum maili', () => {
  it('çözülen talepte "yine yazabilirsin" daveti var — müşteri ikinci talep açmasın', async () => {
    const output = await html({ ...base, status: 'resolved', previousStatus: 'in_progress' }, 'status');

    expect(output).toContain('Sorun devam ediyor mu?');
    expect(ticketStatusChangedSubject({ ...base, status: 'resolved' })).toContain('çözüldü');
  });

  it('yeniden açılan talep çözülenden ayrı anlatılır', async () => {
    const output = await html({ ...base, status: 'open', previousStatus: 'resolved' }, 'status');

    expect(output).toContain('yeniden açıldı');
    // Kapanış daveti YALNIZ kapanmış talepte: açık talepte "yine yazabilirsin" demek anlamsız.
    expect(output).not.toContain('Sorun devam ediyor mu?');
  });

  it('durum mailinde yazışma HİÇ gösterilmez — ne tam kart ne alıntı', async () => {
    const output = await html({ ...base, status: 'resolved' }, 'status');

    // Cevabın metni başka bir olayın konusu ve o mail zaten gitti; burada tekrarlamak aynı cümleyi
    // iki kez göndermek olurdu. Neyin çözüldüğünü künye kartı söylüyor.
    expect(output).not.toContain('Eksik gönderilen kalemi tespit ettik.');
    expect(output).not.toContain('Önceki mesajlar');
  });
});

describe('dil müşterinin tercihidir', () => {
  const cases: Array<[PreferredLanguage, string, string]> = [
    ['fr', 'Nous avons répondu à votre demande', 'Produit manquant'],
    ['de', 'Wir haben auf Ihre Anfrage geantwortet', 'Fehlender Artikel'],
  ];

  it.each(cases)('%s dilinde gövde ve tip etiketi çevrilir', async (locale, title, typeLabel) => {
    const output = await html({ ...base, locale });

    expect(output).toContain(title);
    expect(output).toContain(typeLabel);
    // Türkçe metin sızmamalı: operasyon yüzeyi Türkçedir, MÜŞTERİYE giden mail değil.
    expect(output).not.toContain('Talebinize cevap verdik');
  });

  it('konu satırı da çevrilir', () => {
    expect(ticketRepliedSubject({ ...base, locale: 'fr' })).toContain('Nous avons répondu');
    expect(ticketStatusChangedSubject({ ...base, locale: 'de', status: 'resolved' })).toContain('gelöst');
  });
});

/**
 * **Telefonda okunabilirlik** (kullanıcı gözlemi 09.08 — gerçek gönderim, Android/Gmail).
 *
 * Şikâyet *"aşağı doğru uzar gider"*di ve ölçüm üç somut sebep gösterdi: durum İKİ kez yazılıyordu,
 * giriş cümlesi başlığı tekrar ediyordu, ve asıl haber (cevabın kendisi) künye kartının ALTINDA
 * kalıyordu — iki satırlık içerik için altı dikey blok.
 *
 * Üçü de burada sabitlendi; biri geri gelirse test kırılır.
 */
describe('telefonda okunabilirlik (09.08)', () => {
  it('durum BİR kez yazılır — hap ile künye aynı kelimeyi tekrarlamaz', async () => {
    const output = await html({ ...base, status: 'in_progress' });
    // 'İnceleniyor' hem üstteki hapta hem künye kartında geçiyordu.
    expect(output.split('İnceleniyor')).toHaveLength(2);
  });

  it('CEVAP künyeden ÖNCE gelir — mailin haberi cevaptır, künye etikettir', async () => {
    const output = await html(base);
    const cevap = output.indexOf('Eksik gönderilen kalemi tespit ettik.');
    const kunye = output.indexOf('LZA-1234');

    expect(cevap).toBeGreaterThan(-1);
    expect(kunye).toBeGreaterThan(-1);
    expect(cevap).toBeLessThan(kunye);
  });

  it('giriş cümlesi başlığı TEKRAR ETMEZ — üç dilde de', async () => {
    for (const locale of ['tr', 'fr', 'de'] as PreferredLanguage[]) {
      const output = await html({ ...base, locale });
      // Başlığın ilk üç kelimesi girişte de geçiyorsa cümle yeniden yazılmış demektir.
      const title = { tr: 'Talebinize cevap verdik', fr: 'Nous avons répondu', de: 'Wir haben auf' }[locale];
      expect(output.split(title)).toHaveLength(2);
    }
  });

  it('düğme ALINTILARDAN önce — eylem cevaba ait, geçmişe değil (referans proje deseni)', async () => {
    const output = await html({ ...base, history: [base.history[0]!, base.history[1]!] });
    expect(output.indexOf('talepler/11111111')).toBeLessThan(output.indexOf('Önceki mesajlar'));
  });

  it('künye kutusuz SATIR — talep mailinde üçüncü bir kart açılmaz', async () => {
    const output = await html(base);
    // Künye bilgisi duruyor (kaybolmadı), ama kendi kartı yok: kart başlığı olan iki blok kaldı.
    expect(output).toContain('LZA-1234');
    expect(output).toContain('Cevabımız');
    expect(output).toContain('Önceki mesajlar');
  });
});
