import { describe, expect, it } from 'vitest';
import { orderIdOrNull } from './order-id';

/**
 * Yoldaki sipariş kimliğinin süzgeci (08.5) — saf, DB'siz.
 *
 * Testler bir ÖLÇÜMDEN doğdu (09.08, gerçek tarayıcı): `/de/bestellungen/LA-26-DMUF3L` 500
 * veriyordu, çünkü segment doğrudan servise gidiyor ve PostgreSQL uuid ayrıştırması patlıyordu.
 */
describe('orderIdOrNull', () => {
  it('geçerli UUID geçer', () => {
    expect(orderIdOrNull('71cac271-06c1-46ce-92ff-fa6e3399dcac')).toBe('71cac271-06c1-46ce-92ff-fa6e3399dcac');
  });

  it('REFERANS NUMARASI geçmez — arızanın kendisi buydu', () => {
    // Müşterinin e-postasında/faturasında gördüğü biçim. Eskiden 500'e düşüyordu.
    expect(orderIdOrNull('LA-26-DMUF3L')).toBeNull();
  });

  it('boş, boşluklu ve saçma girdiler geçmez', () => {
    expect(orderIdOrNull('')).toBeNull();
    expect(orderIdOrNull('   ')).toBeNull();
    expect(orderIdOrNull('../../etc/passwd')).toBeNull();
    expect(orderIdOrNull('71cac271-06c1-46ce-92ff')).toBeNull(); // yarım UUID
  });
});
