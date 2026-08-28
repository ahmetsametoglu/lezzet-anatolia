import { describe, expect, it } from 'vitest';
import { isTerminalShipmentStatus, mapCarrierStatus } from './carrier-status';

describe('mapCarrierStatus', () => {
  it('BİLİNMEYEN kod null döner — tahmin eden eşleme siparişi yanlış yere taşır', () => {
    expect(mapCarrierStatus('QUANTUM_TELEPORTED')).toBeNull();
    expect(mapCarrierStatus('')).toBeNull();
    expect(mapCarrierStatus(null)).toBeNull();
    expect(mapCarrierStatus(undefined)).toBeNull();
  });

  it('⚠ OUT_FOR_DELIVERY teslim SAYILMAZ — sıra hatasının en pahalısı', () => {
    // İçinde "DELIVER" geçiyor: DELIVERED denetimi önce yapılsaydı dağıtıma çıkan koli teslim
    // edilmiş sayılır, kâr snapshot'ı alınır ve müşteriye teslim maili giderdi.
    expect(mapCarrierStatus('OUT_FOR_DELIVERY')).toBe('out_for_delivery');
    expect(mapCarrierStatus('DELIVERY_ATTEMPT_FAILED')).toBe('out_for_delivery');
    expect(mapCarrierStatus('DELIVERED')).toBe('delivered');
  });

  it('terminal hâller tanınır', () => {
    expect(mapCarrierStatus('CANCELLED')).toBe('cancelled');
    expect(mapCarrierStatus('RETURN_TO_SENDER')).toBe('returned');
  });

  it('aşamalar tanınır', () => {
    expect(mapCarrierStatus('IN_TRANSIT')).toBe('in_transit');
    expect(mapCarrierStatus('AT_SORTING_CENTER')).toBe('in_transit');
    expect(mapCarrierStatus('HANDED_OVER_TO_CARRIER')).toBe('handed_over');
    expect(mapCarrierStatus('PICKED_UP')).toBe('handed_over');
    expect(mapCarrierStatus('ANNOUNCING')).toBe('created');
    expect(mapCarrierStatus('READY_TO_SEND')).toBe('created');
  });

  it('büyük/küçük harf ayrımı yok — sağlayıcı biçimi oynak', () => {
    expect(mapCarrierStatus('delivered')).toBe('delivered');
    expect(mapCarrierStatus('In_Transit')).toBe('in_transit');
  });
});

describe('isTerminalShipmentStatus', () => {
  it('nöbet cron\'u yalnız terminal OLMAYANI yoklar', () => {
    expect(isTerminalShipmentStatus('delivered')).toBe(true);
    expect(isTerminalShipmentStatus('returned')).toBe(true);
    expect(isTerminalShipmentStatus('cancelled')).toBe(true);
    expect(isTerminalShipmentStatus('in_transit')).toBe(false);
    // `error` terminal DEĞİL: düzelme ihtimali var ve nöbetin gözünden düşmemeli.
    expect(isTerminalShipmentStatus('error')).toBe(false);
  });
});
