import { describe, expect, it } from 'vitest';
import { aggregateShipmentStatus, classifyCarrierStatus, isTerminalShipmentStatus } from './carrier-status';

/**
 * Eşleme tablosu ÖLÇÜLMÜŞ taksonomiye karşı sınanır (`GET /api/v3/parcels/statuses`, 28.08 — 35
 * kod). Bu dosyanın varlık sebebi somut: ilk yazımda tablo kalıp aramasıyla kuruluydu ve gerçek
 * listeye karşı koşturulunca yedi kod YANLIŞ, on biri TANINMIYOR çıktı. Aşağıdaki liste o gün
 * ölçülen kodların tamamıdır — sağlayıcı listeyi büyütürse burası eksik kalır ve `unknown`
 * sayacı bunu söyler.
 */
const OLCULEN: ReadonlyArray<readonly [string, string]> = [
  ['READY_TO_SEND', 'created'],
  ['ANNOUNCED', 'created'],
  ['ANNOUNCING', 'created'],
  ['ANNOUNCED_UNCOLLECTED', 'created'],
  ['PICKED_UP_BY_DRIVER', 'handed_over'],
  ['TO_SORTING', 'in_transit'],
  ['SORTING', 'in_transit'],
  ['SORTED', 'in_transit'],
  ['UNSORTED', 'in_transit'],
  ['AT_SORTING_CENTRE', 'in_transit'],
  ['AT_CUSTOMS', 'in_transit'],
  ['DELAYED', 'in_transit'],
  ['SHIPMENT_ON_ROUTE', 'out_for_delivery'],
  ['DRIVER_ON_ROUTE', 'out_for_delivery'],
  ['AWAITING_CUSTOMER_PICKUP', 'out_for_delivery'],
  ['DELIVERY_FAILED', 'out_for_delivery'],
  ['DELIVERED', 'delivered'],
  ['COLLECTED_BY_CUSTOMER', 'delivered'],
  ['RETURNED_TO_SENDER', 'returned'],
  ['REFUSED_BY_RECIPIENT', 'returned'],
  ['CANCELLED', 'cancelled'],
  ['CANCELLED_UPSTREAM', 'cancelled'],
  ['NO_LABEL', 'error'],
  ['ANNOUNCEMENT_FAILED', 'error'],
  ['COLLECT_ERROR', 'error'],
  ['UNDELIVERABLE', 'error'],
  ['ADDRESS_INVALID', 'error'],
  ['CANCELLATION_FAILED', 'error'],
  ['EXCEPTION', 'error'],
];

/** Tanınıyor ama gönderinin yerini söylemiyor — deftere yazılır, ALARMA GİRMEZ. */
const BILGI = ['CANCELLING', 'CANCELLING_UPSTREAM', 'DELIVERY_METHOD_CHANGED', 'DELIVERY_DATE_CHANGED', 'DELIVERY_ADDRESS_CHANGED', 'UNKNOWN'];

describe('classifyCarrierStatus', () => {
  it.each(OLCULEN)('%s → %s', (code, beklenen) => {
    expect(classifyCarrierStatus(code)).toEqual({ kind: 'status', status: beklenen });
  });

  it.each(BILGI)('%s tanınır ama durumu değiştirmez', (code) => {
    expect(classifyCarrierStatus(code)).toEqual({ kind: 'informational' });
  });

  it('ölçülen taksonominin TAMAMI karşılanıyor — 35 kod', () => {
    expect(OLCULEN.length + BILGI.length).toBe(35);
  });

  /**
   * Sezginin düştüğü yerler — her biri gerçek bir yanlış cevaptı. Ad ve harf benzerliğine bakan
   * bir eşleme bunları bugün de yanlış yapardı; test o kapıyı kapalı tutuyor.
   */
  it('iptal EDİLEMEDİ, iptal EDİLDİ değildir — koli hâlâ canlı', () => {
    expect(classifyCarrierStatus('CANCELLATION_FAILED')).toEqual({ kind: 'status', status: 'error' });
    expect(classifyCarrierStatus('CANCELLING')).toEqual({ kind: 'informational' });
    expect(classifyCarrierStatus('CANCELLED')).toEqual({ kind: 'status', status: 'cancelled' });
  });

  it('teslim noktasından ALINDI = teslim; BEKLİYOR = teslim değil', () => {
    expect(classifyCarrierStatus('COLLECTED_BY_CUSTOMER')).toEqual({ kind: 'status', status: 'delivered' });
    expect(classifyCarrierStatus('AWAITING_CUSTOMER_PICKUP')).toEqual({ kind: 'status', status: 'out_for_delivery' });
  });

  it('bildirildi ama taşıyıcı almadıysa koli hâlâ BİZDE', () => {
    expect(classifyCarrierStatus('ANNOUNCED_UNCOLLECTED')).toEqual({ kind: 'status', status: 'created' });
    expect(classifyCarrierStatus('PICKED_UP_BY_DRIVER')).toEqual({ kind: 'status', status: 'handed_over' });
  });

  it('bilinmeyen kod SAYILIR — bilgi olayıyla karıştırılmaz', () => {
    expect(classifyCarrierStatus('QUANTUM_TELEPORTED')).toEqual({ kind: 'unknown' });
    // Kalıp araması olsaydı bu "DELIVERED içeriyor" diye teslim sayılırdı.
    expect(classifyCarrierStatus('NOT_DELIVERED_YET')).toEqual({ kind: 'unknown' });
    expect(classifyCarrierStatus('')).toEqual({ kind: 'unknown' });
    expect(classifyCarrierStatus(null)).toEqual({ kind: 'unknown' });
    expect(classifyCarrierStatus(undefined)).toEqual({ kind: 'unknown' });
  });

  it('büyük/küçük harf ve boşluk sorun değil', () => {
    expect(classifyCarrierStatus(' delivered ')).toEqual({ kind: 'status', status: 'delivered' });
    expect(classifyCarrierStatus('Ready_To_Send')).toEqual({ kind: 'status', status: 'created' });
  });
});

describe('aggregateShipmentStatus — gönderi, EN GERİDEKİ kolisi kadar ilerlemiştir', () => {
  it('hepsi teslim olmadan gönderi teslim sayılmaz', () => {
    expect(aggregateShipmentStatus(['delivered', 'delivered'])).toBe('delivered');
    expect(aggregateShipmentStatus(['delivered', 'in_transit'])).toBe('in_transit');
    expect(aggregateShipmentStatus(['delivered', 'delivered', 'out_for_delivery'])).toBe('out_for_delivery');
  });

  it('geri dönen koli teslim edilenlerin arkasına saklanmaz', () => {
    expect(aggregateShipmentStatus(['delivered', 'returned'])).toBe('returned');
    // Sapma sırası: `returned` `error`in de önünde — geri dönüş somut, hata belirsiz.
    expect(aggregateShipmentStatus(['error', 'returned'])).toBe('returned');
  });

  it('müdahale isteyen koli bastırılmaz', () => {
    expect(aggregateShipmentStatus(['in_transit', 'error'])).toBe('error');
  });

  it('hepsi iptalse iptal; YARISI iptalse insan bakmalı', () => {
    expect(aggregateShipmentStatus(['cancelled', 'cancelled'])).toBe('cancelled');
    expect(aggregateShipmentStatus(['cancelled', 'in_transit'])).toBe('error');
    // Ölçülemeyen koli varken "hepsi iptal" denemez.
    expect(aggregateShipmentStatus(['cancelled', null])).toBe('error');
  });

  it('ÖLÇÜLEMEYEN koli teslim edilmiş sayılmaz — gönderi terminale taşınmaz', () => {
    expect(aggregateShipmentStatus(['delivered', null])).toBeNull();
    // Terminal olmayan aşamada eksik ölçüm sorun değil: en geri bilinen aşama zaten güvenli.
    expect(aggregateShipmentStatus(['in_transit', null])).toBe('in_transit');
  });

  it('hiçbir koli ölçülemediyse cevap "bilmiyorum"', () => {
    expect(aggregateShipmentStatus([])).toBeNull();
    expect(aggregateShipmentStatus([null, null])).toBeNull();
  });

  it('tek koli kendi durumudur', () => {
    expect(aggregateShipmentStatus(['handed_over'])).toBe('handed_over');
  });
});

describe('isTerminalShipmentStatus', () => {
  it('terminal olan üçü', () => {
    expect(isTerminalShipmentStatus('delivered')).toBe(true);
    expect(isTerminalShipmentStatus('returned')).toBe(true);
    expect(isTerminalShipmentStatus('cancelled')).toBe(true);
  });

  it('error terminal DEĞİL — nöbet onu izlemeyi sürdürür', () => {
    expect(isTerminalShipmentStatus('error')).toBe(false);
    expect(isTerminalShipmentStatus('in_transit')).toBe(false);
  });
});
