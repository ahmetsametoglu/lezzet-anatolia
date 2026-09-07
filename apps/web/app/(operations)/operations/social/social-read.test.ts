import { describe, expect, it } from 'vitest';
import type { ConversationInboxRow } from '@lezzet/types';
import type { MessageWithMedia } from '@/lib/messaging/read';
import { previewOf, remainingLabel, toInboxRows, toMessageViews, toWindowView, WINDOW_SOON_MS } from './social-read';

// 15.5/15.15 — okuma dönüşümlerinin ölçütleri. Üçü de birer KARAR ve karar sınanabilir olmalı:
// pencerenin ne zaman "az kaldı"ya döndüğü, gövdesiz bir mesajın nasıl okunacağı, adsız bir
// konuşmanın satırda ne göstereceği.

const NOW = new Date('2026-08-08T12:00:00.000Z');

function inboxRow(patch: Partial<ConversationInboxRow> = {}): ConversationInboxRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    customerId: '22222222-2222-4222-8222-222222222222',
    source: 'whatsapp',
    externalRef: '+33612345678',
    providerAccountRef: null,
    profileName: null,
    handledBy: 'human',
    aiDraftReply: null,
    aiDraftGeneratedAt: null,
    optIn: false,
    optInAt: null,
    // Hiç sorulmamış hâl (15.12): üç izin hâlinden ilki — ret de bu satırdan ayırt edilebilmeli.
    optInAskedAt: null,
    // Bağ künyesi boş: bu satırın bağını SİSTEM kurmuş (WhatsApp, numaradan) — operatör kararı yok.
    linkedBy: null,
    linkedAt: null,
    linkProof: null,
    windowExpiresAt: null,
    lastMessageAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    customerName: 'Ayşe Kaya',
    messageCount: 3,
    awaitingReply: true,
    lastMessageText: 'Teslimat perşembe olur mu?',
    lastMessageDirection: 'inbound',
    lastMessageKind: 'text',
    ...patch,
  };
}

function message(patch: Partial<MessageWithMedia> = {}): MessageWithMedia {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    conversationId: '11111111-1111-4111-8111-111111111111',
    direction: 'inbound',
    author: 'customer',
    kind: 'text',
    body: { text: 'Merhaba' },
    templateName: null,
    templateCategory: null,
    providerMessageId: null,
    mediaKey: null,
    mediaMime: null,
    mediaTranscript: null,
    // Adres okuma kapısında imzalanıyor (`readConversationDetail`), çeviricinin işi değil —
    // fikstür de onu veri olarak taşıyor.
    mediaUrl: null,
    createdAt: NOW.toISOString(),
    ...patch,
  };
}

describe('toWindowView', () => {
  it('damga yoksa "hiç açılmadı" — kapanmışla AYNI ŞEY DEĞİL', () => {
    // İkisi de "serbest mesaj gönderemezsin"e düşer ama biri kaçırılmış fırsat, öteki kurulmamış
    // ilişkidir; tek kovaya atmak operatöre yanlış eylemi önerirdi.
    expect(toWindowView(null, NOW)).toEqual({ state: 'never', chip: '—', tone: 'idle' });
  });

  it('süresi geçmiş damga kapalıdır', () => {
    const past = new Date(NOW.getTime() - 60_000).toISOString();
    expect(toWindowView(past, NOW)).toEqual({ state: 'closed', chip: 'kapalı', tone: 'closed' });
  });

  it('bol süre kalan pencere olive, eşiğin altına düşen amber', () => {
    const wide = new Date(NOW.getTime() + 20 * 60 * 60 * 1000).toISOString();
    expect(toWindowView(wide, NOW)).toMatchObject({ state: 'open', tone: 'open', chip: '20 sa' });

    const tight = new Date(NOW.getTime() + WINDOW_SOON_MS - 60_000).toISOString();
    expect(toWindowView(tight, NOW)).toMatchObject({ state: 'open', tone: 'soon' });
  });

  it('eşiğin tam üstünde henüz amber DEĞİL, tam üstündeki dakika sınırın kendisidir', () => {
    const atThreshold = new Date(NOW.getTime() + WINDOW_SOON_MS).toISOString();
    expect(toWindowView(atThreshold, NOW).tone).toBe('soon');

    const justAbove = new Date(NOW.getTime() + WINDOW_SOON_MS + 60_000).toISOString();
    expect(toWindowView(justAbove, NOW).tone).toBe('open');
  });
});

describe('remainingLabel', () => {
  it('bir saatin altında DAKİKAYA iner — "0 sa" hem yanlış hem işe yaramaz olurdu', () => {
    expect(remainingLabel(45 * 60_000)).toBe('45 dk');
    expect(remainingLabel(59 * 60_000 + 59_000)).toBe('59 dk');
  });

  it('saniyelere düşen pencere yine de 1 dk gösterir, 0 dk değil', () => {
    expect(remainingLabel(20_000)).toBe('1 dk');
  });

  it('bir saatten fazlası saat cinsinden', () => {
    expect(remainingLabel(3 * 60 * 60_000)).toBe('3 sa');
  });
});

describe('previewOf', () => {
  it('satır sonlarını boşluğa çevirir — dar sütunda yarım cümle gösterilmemeli', () => {
    expect(previewOf('Merhaba\nsipariş vermek\n istiyorum', 'text')).toBe('Merhaba sipariş vermek istiyorum');
  });

  it('metinsiz türde tür adını okur, boş bırakmaz', () => {
    expect(previewOf(null, 'media')).toBe('[görsel / dosya]');
    expect(previewOf('   ', 'interactive')).toBe('[etkileşimli kart]');
  });

  it('hiç mesaj yoksa bunu SÖYLER — boş önizleme "mesaj yok" diye okunurdu', () => {
    expect(previewOf(null, null)).toBe('Henüz mesaj yok');
  });

  it('BİÇİM İŞARETLERİNİ SÖKER — kuyrukta çıplak yıldız görünmez (07.09)', () => {
    /* Ajan cevapları biçimli üretiliyor ve WhatsApp onları çiziyor; aynı metin deftere düşünce
       kuyruk satırında ham işaret olarak görünüyordu. Balon ÇİZER, satır SÖKER — ikisi zıt ve
       bilinçli: liste satırı okunacak metin değil, tek satırlık bir tarama dizesidir. */
    expect(previewOf('*Fıstıklı Baklava* 4,57 €', 'text')).toBe('Fıstıklı Baklava 4,57 €');
    expect(previewOf('_yarın_ ~iptal~ gönderim', 'text')).toBe('yarın iptal gönderim');
  });

  it('madde listesi tek satıra düzleşir, işaret KALIR', () => {
    // `•` bir biçim işareti değil, düz metinde de okunan bir karakter: kalması satırı bozmuyor,
    // aksine "burada liste vardı" bilgisini taşıyor.
    expect(previewOf('*Boylar*:\n• 225 g — 4,57 €\n• 450 g — 9,15 €', 'text')).toBe('Boylar: • 225 g — 4,57 € • 450 g — 9,15 €');
  });

  it('çarpma işaretini yemez — sökücünün sınır kuralı önizlemede de geçerli', () => {
    expect(previewOf('9*90 g paket', 'text')).toBe('9*90 g paket');
  });
});

describe('toInboxRows', () => {
  it('adsız konuşmada başlık NUMARADIR — boş başlık satırı tanınmaz kılardı', () => {
    const rows = toInboxRows([inboxRow({ customerId: null, customerName: null })], NOW);
    expect(rows[0]).toMatchObject({ title: '+33612345678', unidentified: true });
  });

  it('boşluktan ibaret ad da numaraya düşer', () => {
    expect(toInboxRows([inboxRow({ customerName: '   ' })], NOW)[0]?.title).toBe('+33612345678');
  });

  it('yaş TEK ana göre hesaplanır ve dar biçimdedir', () => {
    const rows = toInboxRows(
      [
        inboxRow({ id: 'a', lastMessageAt: new Date(NOW.getTime() - 18 * 60_000).toISOString() }),
        inboxRow({ id: 'b', lastMessageAt: new Date(NOW.getTime() - 26 * 60 * 60_000).toISOString() }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.ago)).toEqual(['18 dk', 'dün']);
  });

  it('hiç mesajı olmayan konuşmanın yaşı uydurulmaz', () => {
    expect(toInboxRows([inboxRow({ lastMessageAt: null })], NOW)[0]?.ago).toBe('—');
  });
});

describe('toMessageViews', () => {
  it('sırayı DEĞİŞTİRMEZ — okunan şey bir sohbet', () => {
    const views = toMessageViews([message({ id: 'a', body: { text: 'ilk' } }), message({ id: 'b', body: { text: 'ikinci' } })]);
    expect(views.map((v) => v.text)).toEqual(['ilk', 'ikinci']);
  });

  /*
    MEDYADA YER TUTUCU KALKTI (07.09) — dosyanın kendisi çizildiği gün "[görsel / dosya]" yazısı
    onun altında aynı şeyi ikinci kez söylemeye başladı. Balonun boş kalmama güvencesi kayboLMADI,
    yer değiştirdi: `MediaBody` ya dosyayı çiziyor ya "alınamadı" diyor. Bu ikisini tek yer
    tutucuya indirmek, "yazısız fotoğraf" ile "dosyası elimizde yok"u aynı görünüme sokardı.
  */
  it('medyada yer tutucu YOK — dosyayı balon çiziyor, metin yalnız alt yazıdır', () => {
    expect(toMessageViews([message({ kind: 'media', body: { text: null } })])[0]?.text).toBe('');
    expect(toMessageViews([message({ kind: 'media', body: { text: 'ezik geldi' } })])[0]?.text).toBe('ezik geldi');
  });

  it('medya DIŞINDA gövdesiz mesaj hâlâ türünün adıyla okunur', () => {
    // Kart/şablonun çizilecek bir dosyası yok; orada yer tutucu tek okunabilir çıkış.
    expect(toMessageViews([message({ kind: 'interactive', body: { text: null } })])[0]?.text).toBe('[etkileşimli kart]');
  });

  it('medya adresi ve türü balona OLDUĞU GİBİ geçer — çevirici imzalamaz', () => {
    // İmzalama okuma kapısının işi (`readConversationDetail`): süreli adres her okumada yeniden
    // üretilir, saf çevirici ise ağa çıkmamalı.
    const views = toMessageViews([message({ kind: 'media', mediaMime: 'image/jpeg', mediaUrl: 'https://r2.example/imzali' })]);
    expect(views[0]?.mediaMime).toBe('image/jpeg');
    expect(views[0]?.mediaUrl).toBe('https://r2.example/imzali');
  });

  it('şablon etiketi ADI ve ÜCRET SINIFINI birlikte yazar', () => {
    const views = toMessageViews([message({ kind: 'template', templateName: 'order_confirmed', templateCategory: 'utility' })]);
    expect(views[0]?.templateLabel).toBe('order_confirmed · işlem');
  });

  it('şablon değilse etiket YOK — süs bir alan uydurulmaz', () => {
    expect(toMessageViews([message()])[0]?.templateLabel).toBeNull();
  });
});
