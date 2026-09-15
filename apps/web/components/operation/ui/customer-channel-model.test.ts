import { describe, expect, it } from 'vitest';
import { appendToDraft, chatContext, chatTargetOf, orderChatContext, toCustomerChannels } from './customer-channel-model';
import { money, shortDate } from './format';

// 15.32 — kanal düğmesinin görünümü. Sıra ve "en son" kararı motorda sınanıyor (`customerChannelsOf`);
// burada yalnız çevirinin sözü: karar AYNEN geçer, yaş dar biçime döner, yazılmamış kanala yaş uydurulmaz.

describe('toCustomerChannels — kanal düğmesinin görünümü', () => {
  const now = new Date('2026-09-14T12:00:00Z');
  const ch = (id: string, source: 'whatsapp' | 'messenger' | 'instagram', lastInboundAt: string | null, latest: boolean) => ({
    id,
    source,
    lastInboundAt,
    lastMessageAt: lastInboundAt,
    latest,
  });

  it('sıra ve "en son" işareti motordan AYNEN geçer; yaş dar biçimde', () => {
    expect(
      toCustomerChannels([ch('ig', 'instagram', '2026-09-12T10:00:00Z', true), ch('wa', 'whatsapp', '2026-09-10T10:00:00Z', false)], now),
    ).toEqual([
      { conversationId: 'ig', source: 'instagram', lastInboundAgo: '2 gün', latest: true },
      { conversationId: 'wa', source: 'whatsapp', lastInboundAgo: '4 gün', latest: false },
    ]);
  });

  it('hiç yazmadığı kanalda yaş YOK — "şimdi" ya da "0 dk" uydurulmaz', () => {
    expect(toCustomerChannels([ch('biz', 'whatsapp', null, false)], now)[0]?.lastInboundAgo).toBeNull();
  });
});

describe('chatTargetOf — listedeki "Mesaj yaz" nereye açılır (15.33)', () => {
  const view = (ids: string[], canStartWhatsapp: boolean) => ({
    channels: ids.map((id, i) => ({ conversationId: id, source: 'whatsapp' as const, lastInboundAgo: null, latest: i === 0 })),
    canStartWhatsapp,
  });

  it('kanal varsa İLKİ — sıra motorun, burada yeniden seçilmez', () => {
    expect(chatTargetOf(view(['ig', 'wa'], true))).toEqual({ kind: 'conversation', conversationId: 'ig' });
  });

  it('sohbet yok, telefon kayıtlı → WhatsApp sohbeti numarayla açılır', () => {
    expect(chatTargetOf(view([], true))).toEqual({ kind: 'start_whatsapp' });
  });

  it('sohbet de telefon da yok → hedef yok, pencere sebebini söyler', () => {
    expect(chatTargetOf(view([], false))).toEqual({ kind: 'none' });
  });
});

describe('orderChatContext — balonun BAĞLAM şeridi (15.39)', () => {
  it('referans · tutar · teslim günü, açan ekranla birlikte', () => {
    expect(orderChatContext('Sipariş detayından', { referenceNo: 'LZA-2451', totalCents: 9240, deliveryDate: '2026-09-17' })).toEqual({
      origin: 'Sipariş detayından',
      summary: `LZA-2451 · ${money(9240)} · ${shortDate('2026-09-17')} teslim`,
    });
  });

  it('gün girilmemişse gün uydurulmaz; referansı olmayan sipariş "Sipariş" diye anılır', () => {
    expect(orderChatContext('Siparişlerden', { referenceNo: null, totalCents: 1200, deliveryDate: null }).summary).toBe(`Sipariş · ${money(1200)}`);
  });
});

describe('chatContext — boş parça', () => {
  it('boş parça atlanır, ayırıcı tek — boş gün ya da referans satıra uydurulmaz', () => {
    expect(chatContext('Yorumdan', ['Fıstıklı Baklava', null, '  ', undefined, '2/5'])).toEqual({
      origin: 'Yorumdan',
      summary: 'Fıstıklı Baklava · 2/5',
    });
  });
});

describe('appendToDraft — "Ekle" (15.39)', () => {
  it('boş taslağa satırın kendisi yazılır', () => {
    expect(appendToDraft('  ', 'LZA-2451')).toBe('LZA-2451');
  });

  it('yazılmış cümle EZİLMEZ — satır sonuna, ayrı satırda', () => {
    expect(appendToDraft('Merhaba, siparişiniz hazır. ', 'LZA-2451')).toBe('Merhaba, siparişiniz hazır.\nLZA-2451');
  });
});
