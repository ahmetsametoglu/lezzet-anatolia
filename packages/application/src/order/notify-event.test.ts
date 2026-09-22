import { describe, expect, it } from 'vitest';
import { OrderStatusEnum } from '@lezzet/types';
import { notificationEventOf } from './notify';

describe('notificationEventOf — hangi geçiş hangi haberi doğurur', () => {
  it('gel-al\'da "hazır" müşteriye haberdir; rota ve kargoda aynı durum sessizdir', () => {
    // Rota/kargoda `ready` haber doğursaydı müşteri "hazır" mailinden sonra "yolda" maili alırdı — iki haber, tek olay.
    // Gel-al'da doğurmasaydı müşteri siparişinin hazır olduğunu hiç öğrenmezdi: bu türde "yolda" yok.
    expect(notificationEventOf('ready', 'pickup')).toBe('order_ready_for_pickup');
    expect(notificationEventOf('ready', 'route')).toBeNull();
    expect(notificationEventOf('ready', 'shipping')).toBeNull();
  });

  it('öteki geçişler teslimat türünden bağımsızdır', () => {
    for (const type of ['route', 'shipping', 'pickup'] as const) {
      expect(notificationEventOf('confirmed', type)).toBe('order_confirmed');
      expect(notificationEventOf('delivered', type)).toBe('order_delivered');
      expect(notificationEventOf('preparing', type)).toBeNull();
    }
  });

  it('her iç durum bir karara bağlanır — yeni durum eklenince burası patlar', () => {
    for (const status of OrderStatusEnum.options) {
      expect(() => notificationEventOf(status, 'pickup')).not.toThrow();
    }
  });
});
