import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AddressService, UserProfileService, serviceDb } from '@lezzet/database';
import { mustDelete, purgeTestData } from '@lezzet/database/testing';
import type { ServicePoint } from '@lezzet/sendcloud';
import { providerStub } from './provider.testkit';
import { MAX_SERVICE_POINT_CARRIERS, searchCheckoutServicePoints } from './service-points';

const db = serviceDb();
const stamp = Date.now();
const profileIds: string[] = [];
let customerId: string;
let otherCustomerId: string;
let addressId: string;

const nokta = (id: string, carrierCode: string, distanceM: number): ServicePoint => ({
  id, carrierCode, name: id, street: 'Rue', houseNumber: null, postalCode: '69007', city: 'Lyon', country: 'FR',
  latitude: 45.75, longitude: 4.84, distanceM, active: true, kind: 'servicepoint', openingTimes: null,
});

beforeAll(async () => {
  customerId = (await new UserProfileService(db).insert({ name: `Nokta müşterisi ${stamp}` })).id;
  otherCustomerId = (await new UserProfileService(db).insert({ name: `Başka müşteri ${stamp}` })).id;
  profileIds.push(customerId, otherCustomerId);
  addressId = (
    await new AddressService(db).addForCustomer({
      customerId, recipient: 'Claire', phone: '+33600000000', line1: '17 avenue Jean Jaurès', postalCode: '69007', city: 'Lyon', country: 'FR',
      lat: 45.7497, lng: 4.8416,
    })
  ).id;
});

afterAll(async () => {
  await mustDelete(db, 'error_log', (q) => q.eq('source', 'application-shipping').eq('context->>addressId', addressId));
  await purgeTestData(db, { profileIds });
});

describe('searchCheckoutServicePoints', () => {
  it('bir taşıyıcının araması düşerse ötekilerin noktaları yine gelir, düşen söylenir ve hata kaydı bırakır', async () => {
    const provider = providerStub({
      servicePoints: async ({ carrierCode }) => {
        if (carrierCode === 'dhl') throw new Error('taşıyıcı etkin değil');
        return carrierCode === 'mondial_relay' ? [nokta('mr-uzak', 'mondial_relay', 900)] : [nokta('col-yakin', 'colissimo', 120)];
      },
    });

    const sonuc = await searchCheckoutServicePoints(db, provider, { customerId, addressId, carrierCodes: ['mondial_relay', 'dhl', 'colissimo'] });
    // Yakından uzağa tek liste: taşıyıcı sırası değil müşterinin mesafesi; merkez adresin kendisi, iki yüzey "Adresiniz"i ondan çizer.
    expect(sonuc).toEqual({
      status: 'ok',
      points: [nokta('col-yakin', 'colissimo', 120), nokta('mr-uzak', 'mondial_relay', 900)],
      failedCarriers: ['dhl'],
      origin: { lat: 45.7497, lng: 4.8416 },
    });
    const { data } = await db.from('error_log').select('id').eq('source', 'application-shipping').eq('context->>addressId', addressId);
    expect(data).toHaveLength(1);
  });

  it('başka müşterinin adresiyle arama yapılmaz ve sağlayıcıya çıkılmaz', async () => {
    const provider = providerStub();
    expect(await searchCheckoutServicePoints(db, provider, { customerId: otherCustomerId, addressId, carrierCodes: ['colissimo'] })).toEqual({
      status: 'address_not_found',
    });
  });

  // Liste istemciden gelir; sınır olmasa elle kurulmuş bir istek sağlayıcıya sınırsız arama yaptırırdı.
  it('sağlayıcıya sorulan taşıyıcı sayısı sınırlıdır', async () => {
    const sorulan: string[] = [];
    const provider = providerStub({
      servicePoints: async ({ carrierCode }) => {
        sorulan.push(carrierCode);
        return [];
      },
    });
    const carrierCodes = Array.from({ length: MAX_SERVICE_POINT_CARRIERS + 4 }, (_, i) => `tasiyici-${i}`);
    await searchCheckoutServicePoints(db, provider, { customerId, addressId, carrierCodes });
    expect(sorulan).toHaveLength(MAX_SERVICE_POINT_CARRIERS);
  });
});
