import { describe, expect, it } from 'vitest';
import { customerChannelsOf } from './customer-channels';

// 15.32 — "müşteri bizimle hangi kanallardan, en son hangisinden yazıştı". İki yüzey (operasyon web'i,
// native kurye ekranı) aynı cevabı okumalı; bu yüzden karar burada ve burada sınanıyor.

const c = (id: string, source: string, lastInboundAt: string | null, lastMessageAt: string | null) => ({
  id,
  source,
  lastInboundAt,
  lastMessageAt,
});

describe('customerChannelsOf — en son YAZDIĞI kanal önce', () => {
  it('son GELEN mesaj kazanır — bizim son cevabımız kanalı öne almaz', () => {
    const { channels } = customerChannelsOf({
      conversations: [
        c('wa', 'whatsapp', '2026-09-10T10:00:00Z', '2026-09-14T09:00:00Z'),
        c('ig', 'instagram', '2026-09-12T10:00:00Z', '2026-09-12T10:00:00Z'),
      ],
      phone: null,
    });
    expect(channels.map((x) => [x.id, x.latest])).toEqual([
      ['ig', true],
      ['wa', false],
    ]);
  });

  it('hiç yazmadığı kanal arkaya düşer ve "en son" sayılmaz', () => {
    const { channels } = customerChannelsOf({
      conversations: [c('biz', 'whatsapp', null, '2026-09-14T10:00:00Z'), c('o', 'messenger', '2026-09-01T10:00:00Z', null)],
      phone: null,
    });
    expect(channels.map((x) => [x.id, x.latest])).toEqual([
      ['o', true],
      ['biz', false],
    ]);
  });

  it('hiç yazmamış müşteride hiçbir kanal "en son" değil — sıra son harekete göre', () => {
    const { channels } = customerChannelsOf({
      conversations: [c('a', 'whatsapp', null, '2026-09-10T10:00:00Z'), c('b', 'instagram', null, '2026-09-11T10:00:00Z')],
      phone: null,
    });
    expect(channels.map((x) => x.id)).toEqual(['b', 'a']);
    expect(channels.some((x) => x.latest)).toBe(false);
  });

  it('sohbet yoksa boş — kanal uydurulmaz', () => {
    expect(customerChannelsOf({ conversations: [], phone: null }).channels).toEqual([]);
  });

  it('çağıranın dizisi yerinde kalır', () => {
    const girdi = [c('a', 'whatsapp', null, null), c('b', 'instagram', '2026-09-11T10:00:00Z', null)];
    customerChannelsOf({ conversations: girdi, phone: null });
    expect(girdi.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('customerChannelsOf — WhatsApp sohbetini biz açabilir miyiz', () => {
  it('telefon kayıtlı, WhatsApp sohbeti yok → açılabilir', () => {
    expect(
      customerChannelsOf({ conversations: [c('ig', 'instagram', '2026-09-12T10:00:00Z', null)], phone: '+33612345678' }).canStartWhatsapp,
    ).toBe(true);
  });

  it('WhatsApp sohbeti zaten var → ikinci kez açılmaz, var olan kullanılır', () => {
    expect(customerChannelsOf({ conversations: [c('wa', 'whatsapp', null, null)], phone: '+33612345678' }).canStartWhatsapp).toBe(false);
  });

  it('telefon yok ya da boş → açılamaz', () => {
    expect(customerChannelsOf({ conversations: [], phone: null }).canStartWhatsapp).toBe(false);
    expect(customerChannelsOf({ conversations: [], phone: '   ' }).canStartWhatsapp).toBe(false);
  });
});
