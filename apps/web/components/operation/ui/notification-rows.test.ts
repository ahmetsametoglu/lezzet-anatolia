import { describe, expect, it } from 'vitest';
import { opsNotificationHref, toOpsNotificationRow } from './notification-rows';
import type { MeNotification } from '@lezzet/types';

/*
  OPERASYON ZİL EŞLEMESİ (14.15) — çivilenenler:
  · `document_undeliverable` alert tonuyla, başlıkta referans ve sebep, hedefi SİPARİŞ DETAYI
    (dispatch hedefi aynen taşır — operatör "hangi belge" sorusunu oradan okur)
  · bilinmeyen tür sessizce düşmez: genel başlık + quiet; "uygulamayı güncelleyin" tavsiyesi YOK
    (o mobile özgü — web her dağıtımda sunucuyla eşzamanlı)
  · talep hedefi kuyruğun `?t=` sözleşmesine gider; hedefsiz satır tıklanmaz (`href: null`)
*/

const row = (over: Partial<MeNotification> = {}): MeNotification => ({
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'document_undeliverable',
  targetType: 'order',
  targetId: '00000000-0000-4000-8000-000000000002',
  payload: { referenceNo: 'LA-26-X1' },
  createdAt: '2026-08-26T11:58:00Z',
  readAt: null,
  ...over,
});

describe('toOpsNotificationRow', () => {
  it('ulaştırılamayan belge: alert · başlıkta referans · hedef sipariş detayı', () => {
    const sonuc = toOpsNotificationRow(row());
    expect(sonuc.tone).toBe('alert');
    expect(sonuc.title).toContain('LA-26-X1');
    expect(sonuc.title).toContain('e-postası yok');
    expect(sonuc.href).toBe('/operations/orders/00000000-0000-4000-8000-000000000002');
  });

  it('bilinmeyen tür genel satıra düşer — mobilin sürüm tavsiyesi webe sızmaz', () => {
    const sonuc = toOpsNotificationRow(row({ kind: 'yeni_personel_turu', payload: {}, targetType: null, targetId: null }));
    expect(sonuc).toMatchObject({ tone: 'quiet', title: 'Yeni bir bildirim', href: null });
  });
});

describe('opsNotificationHref', () => {
  it('talep kuyruğun ?t= sözleşmesine; hedefi düşmüş satır tıklanmaz', () => {
    expect(opsNotificationHref({ targetType: 'ticket', targetId: 't-1' })).toBe('/operations/tickets?t=t-1');
    expect(opsNotificationHref({ targetType: 'order', targetId: null })).toBeNull();
  });
});
