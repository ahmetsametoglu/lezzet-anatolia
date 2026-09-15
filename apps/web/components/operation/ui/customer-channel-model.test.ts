import { describe, expect, it } from 'vitest';
import { chatTargetOf, toCustomerChannels } from './customer-channel-model';

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
