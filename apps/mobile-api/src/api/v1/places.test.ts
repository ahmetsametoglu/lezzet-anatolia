import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeliveryZoneService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
// Sözleşme ihraçları `contracts/index.ts`e ana şeridin satırlarıyla açılır; uç da `router.ts`e
// mount edilene dek 404 verir — dosya, bağlantı tamamlandıktan SONRA koşulmak üzere yazıldı.
import { PlaceResolutionSchema, type PlaceResolution } from '@lezzet/types';
import { app } from '../../app';

/**
 * Yer ucunun taşıması sınanır (biçim denetimi, sözleşme şekli, depo kimliğinin sızmaması); karar dalları motorun testinde. Kod bantları
 * `006xx` ve `007xx` posta kodu referansında yok, çözümü yalnız bu dosyanın kurduğu bölgeler belirler.
 */
const stamp = Date.now();
const db = serviceDb();

const son2 = String(stamp).slice(-2);
const rotaKodu = `006${son2}`;
/** İki ülkede birden rota kodu: ülkesiz soru belirsiz, ülkeli soru o ülkenin yeri. */
const ortakKod = `007${son2}`;
let warehouseId: string;

async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'YERUC' })).id;
  const zones = new DeliveryZoneService(db);
  const zone = await zones.insert({ name: `Yer ucu bölgesi ${stamp}`, warehouseId, weekdays: [4] });
  await zones.replacePostalCodes(zone.id, [
    { country: 'FR', postalCode: rotaKodu },
    { country: 'FR', postalCode: ortakKod },
  ]);
  const zoneDe = await zones.insert({ name: `Yer ucu DE bölgesi ${stamp}`, warehouseId, weekdays: [4] });
  await zones.replacePostalCodes(zoneDe.id, [{ country: 'DE', postalCode: ortakKod }]);
});

afterAll(async () => {
  await purgeTestData(db, { warehouseIds: [warehouseId] });
});

describe('GET /api/v1/places/by-postal-code', () => {
  it('rota içi kod çözülür; saklanacak anahtar (ülke+kod) döner, depo kimliği SIZMAZ', async () => {
    const res = await app.request(`/api/v1/places/by-postal-code?code=${rotaKodu}`);
    expect(res.status).toBe(200);

    const raw = await dataOf<Record<string, unknown>>(res);
    const parsed: PlaceResolution = PlaceResolutionSchema.parse(raw);
    expect(parsed.kind).toBe('resolved');
    if (parsed.kind !== 'resolved') return;
    expect(parsed.place).toEqual({ country: 'FR', postalCode: rotaKodu, placeName: null, places: [], inRoute: true });
    // Motor depo çözer ama zarf taşımaz, çünkü istemcinin depo bilmesi depo seçebilmesi demek olurdu.
    expect(parsed.place).not.toHaveProperty('warehouseId');
  });

  it('boşluklu giriş normalize edilir — aynı yere düşer', async () => {
    const res = await app.request(`/api/v1/places/by-postal-code?code=006%20${son2}`);
    const parsed = PlaceResolutionSchema.parse(await dataOf(res));
    expect(parsed.kind).toBe('resolved');
  });

  it('biçimsiz kod 400 invalid_code — "tanınmadık"la karışmaz', async () => {
    for (const bozuk of ['', '670', 'ABCDE']) {
      const res = await app.request(`/api/v1/places/by-postal-code?code=${bozuk}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ data: null, error: 'invalid_code' });
    }
  });

  it('aynı kod iki ülkede varsa ülkesiz soru belirsiz, ülkeli soru o ülkenin yeridir; tanınmayan ülke yok sayılır', async () => {
    const sor = async (query: string) => PlaceResolutionSchema.parse(await dataOf(await app.request(`/api/v1/places/by-postal-code?${query}`)));
    expect((await sor(`code=${ortakKod}`)).kind).toBe('ambiguous');
    const almanya = await sor(`code=${ortakKod}&country=DE`);
    expect(almanya.kind === 'resolved' ? almanya.place.country : almanya.kind).toBe('DE');
    expect((await sor(`code=${ortakKod}&country=XX`)).kind).toBe('ambiguous');
  });

  it('beş haneli ama hiçbir kayıtta olmayan kod geçerli bir CEVAPTIR: unknown', async () => {
    const res = await app.request(`/api/v1/places/by-postal-code?code=005${son2}`);
    expect(res.status).toBe(200);
    expect((PlaceResolutionSchema.parse(await dataOf(res))).kind).toBe('unknown');
  });
});
