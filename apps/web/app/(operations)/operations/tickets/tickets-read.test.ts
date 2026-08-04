import { describe, expect, it } from 'vitest';
import type { TicketQueueItem } from '@/lib/ticket/ticket-types';
import { ageMinutesOf, toRowViews, toTicketFilter } from './tickets-read';

const NOW = Date.parse('2026-08-03T12:00:00.000Z');

const row = (patch: Partial<TicketQueueItem> = {}): TicketQueueItem => ({
  id: 'ticket-1',
  customerName: 'Ayşe Kaya',
  type: 'damaged',
  status: 'open',
  handledBy: 'human',
  answeredByAi: false,
  source: 'order',
  preview: 'Bir kutu ezilmiş gelmiş',
  previewTranslated: false,
  lastMessageAt: '2026-08-03T11:30:00.000Z',
  awaitingReply: true,
  hasAttachment: true,
  orderReferenceNo: 'LZA-2451',
  returnBound: true,
  ...patch,
});

describe('toTicketFilter', () => {
  it('durum çipleri tek bir duruma iner', () => {
    expect(toTicketFilter('open')).toEqual({ status: 'open' });
    expect(toTicketFilter('in_progress')).toEqual({ status: 'in_progress' });
    expect(toTicketFilter('resolved')).toEqual({ status: 'resolved' });
  });

  it('"Siparişli" çipi KAPANMIŞLARI KAPSAMAZ — kuyruğun odağı yapılacak iştir', () => {
    // Kapsasaydı tek çip, aylar önce çözülmüş her siparişli talebi geri getirir ve şeridin en
    // kalabalık görünümü "bekleyen iş" gibi okunurdu.
    expect(toTicketFilter('with_order')).toEqual({ hasOrder: true, openOnly: true });
  });
});

describe('ageMinutesOf', () => {
  it('damganın yaşını dakika olarak verir', () => {
    expect(ageMinutesOf('2026-08-03T11:30:00.000Z', NOW)).toBe(30);
  });

  it('İLERİ tarihli damga negatife düşmez — "-3 dk önce" diye bir şey yok', () => {
    expect(ageMinutesOf('2026-08-03T12:05:00.000Z', NOW)).toBe(0);
  });

  it('okunamayan damga ekranı kırmaz, sıfır sayılır', () => {
    expect(ageMinutesOf('bozuk-tarih', NOW)).toBe(0);
  });
});

describe('toRowViews', () => {
  it('satırın alanlarını KORUR, yalnız yaş ekler', () => {
    const source = row();
    const [view] = toRowViews([source], NOW);
    expect(view).toEqual({ ...source, ageMinutes: 30 });
  });

  it('tüm satırlar AYNI ana göre yaşlanır', () => {
    const views = toRowViews(
      [row({ id: 'a', lastMessageAt: '2026-08-03T11:00:00.000Z' }), row({ id: 'b', lastMessageAt: '2026-08-03T11:00:00.000Z' })],
      NOW,
    );
    expect(views.map((v) => v.ageMinutes)).toEqual([60, 60]);
  });
});
