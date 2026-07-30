import { describe, expect, it } from 'vitest';
import { OrderStatusEnum } from '@lezzet/types';
import { customerOrderStatus, isActiveForCustomer } from './customer-status';

describe('customerOrderStatus', () => {
  it('iç durumların HEPSİ bir karara bağlanır — yeni durum eklenince burası patlar', () => {
    // Enum'dan türetiliyor: elle liste tutsaydık, yeni bir durum eklendiğinde bu test sessizce
    // eksik kalırdı ve müşteri ekranı bilinmeyen bir hâlle karşılaşırdı.
    for (const status of OrderStatusEnum.options) {
      expect(() => customerOrderStatus(status)).not.toThrow();
    }
  });

  it('taslak müşteriye GÖSTERİLMEZ — uydurma bir hâl verilmez', () => {
    expect(customerOrderStatus('draft')).toBeNull();
  });

  it('operasyonun "hazır" ayrımı müşteriye sızmaz', () => {
    expect(customerOrderStatus('preparing')).toBe('preparing');
    expect(customerOrderStatus('ready')).toBe('preparing');
  });

  it('muhasebe kapanışı ("completed") müşteriye teslim edildi görünür', () => {
    expect(customerOrderStatus('delivered')).toBe('delivered');
    expect(customerOrderStatus('completed')).toBe('delivered');
  });

  it('iptal ve iade kendi hâllerini korur', () => {
    expect(customerOrderStatus('cancelled')).toBe('cancelled');
    expect(customerOrderStatus('returned')).toBe('returning');
  });

  it('müşteri kümesi altı hâlden ibarettir — daralma gerçekten oluyor', () => {
    const seen = new Set(OrderStatusEnum.options.map(customerOrderStatus).filter(Boolean));
    expect(seen.size).toBe(6);
  });
});

describe('isActiveForCustomer', () => {
  it('takip edilecek hareketi olanlar aktiftir', () => {
    expect(isActiveForCustomer('received')).toBe(true);
    expect(isActiveForCustomer('preparing')).toBe(true);
    expect(isActiveForCustomer('on_the_way')).toBe(true);
  });

  it('kapanmışlar aktif değildir — iade dahil', () => {
    expect(isActiveForCustomer('delivered')).toBe(false);
    expect(isActiveForCustomer('cancelled')).toBe(false);
    // İadede topu biz taşıyoruz; yeşil çerçeve "yolda" beklentisi yaratırdı.
    expect(isActiveForCustomer('returning')).toBe(false);
  });
});
