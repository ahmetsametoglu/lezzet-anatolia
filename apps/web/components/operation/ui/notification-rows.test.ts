import { describe, expect, it } from 'vitest';
import { opsNotificationHref, toOpsNotificationRow } from './notification-rows';
import type { MeNotification } from '@lezzet/types';

/*
  Operasyon zil eşlemesi: ulaştırılamayan belge alert tonuyla sipariş detayına açılır, bilinmeyen tür genel başlıkla çizilir (mobilin
  "güncelleyin" tavsiyesi webe sızmaz), talep kuyruğun `?t=` sözleşmesine gider ve hedefsiz satır tıklanmaz.
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
    /* Sebep alt satırdadır; panel ikisini de çizer. */
    expect(sonuc.subtitle).toContain('e-postası yok');
    expect(sonuc.href).toBe('/operations/orders/00000000-0000-4000-8000-000000000002');
  });

  it('bilinmeyen tür genel satıra düşer — mobilin sürüm tavsiyesi webe sızmaz', () => {
    const sonuc = toOpsNotificationRow(row({ kind: 'yeni_personel_turu', payload: {}, targetType: null, targetId: null }));
    expect(sonuc).toMatchObject({ tone: 'quiet', title: 'Yeni bir bildirim', href: null });
  });
});

describe('opsNotificationHref', () => {
  it('talep kuyruğun ?t= sözleşmesine; hedefi düşmüş satır tıklanmaz', () => {
    expect(opsNotificationHref({ kind: 'ticket_opened', targetType: 'ticket', targetId: 't-1', payload: {} })).toBe(
      '/operations/tickets?t=t-1',
    );
    expect(opsNotificationHref({ kind: 'document_undeliverable', targetType: 'order', targetId: null, payload: {} })).toBeNull();
  });

  it('yeni personel türleri EKRANLARINA gider (26.08): eşik→tedarik, kapanış→teslimat, başvuru→müşteriler', () => {
    expect(opsNotificationHref({ kind: 'stock_low', targetType: 'variant', targetId: 'v-1', payload: {} })).toBe('/operations/procurement');
    expect(opsNotificationHref({ kind: 'run_close_mismatch', targetType: null, targetId: null, payload: {} })).toBe(
      '/operations/deliveries',
    );
    expect(opsNotificationHref({ kind: 'b2b_application_received', targetType: 'customer', targetId: 'c-1', payload: {} })).toBe(
      '/operations/customers',
    );
  });
});
