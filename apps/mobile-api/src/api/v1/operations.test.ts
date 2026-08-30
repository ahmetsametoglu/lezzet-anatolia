import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
// Beklenen şekil ELLE YAZILMAZ, sözleşmeden gelir: uç bir alanı düşürürse iddia değil DERLEME kırılır.
import type { StaffScope } from '@lezzet/types';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, envelopeError, type SignedInUser } from '../../lib/testing';

/**
 * KABUK KAPSAM UCU (30.08 · `/operations/scope`) — çivilenen beş karar:
 *
 *  1. **Kapsamı TAM BİR tesis olan personelde `resolvedId` doludur.** v3'ün üstbaşlık kuyruğu
 *     ("DEPO · STRASBOURG MERKEZ") ve bugünkü davranış (istemci hiç parametre göndermez) buna
 *     dayanır.
 *  2. **Kapsamı ÇOK OLANDA `resolvedId` null'dır ama LİSTE doludur** — arıza tam buydu: ekran
 *     "hangi depoda çalıştığın belli değil" diyor ve çıkış yolu sunamıyordu, çünkü liste hiç
 *     ulaşmıyordu.
 *  3. **Araç listede AYIRT EDİLEBİLİR** (`kind`): kuryenin kapsamındaki panelvan bir depo
 *     seçicisinde seçenek olamaz; süzgeci yüzey uygular, ayrımı sunucu bildirir.
 *  4. **Kapsamı boş ADMİN aktif tesislerin tamamını görür**, kapsamı boş admin OLMAYAN ise BOŞ
 *     liste: kapı kapsam dışını yalnız admine açıyor, ötekine gösterilen her seçenek reddedilecek
 *     bir seçenek olurdu.
 *  5. **Kapı bölüm-üstü ama personele özel:** kurye/muhasebeci girer, müşteri 403 alır.
 */
const db = serviceDb();

let depocu: SignedInUser;
let muhasebeci: SignedInUser;
let yonetici: SignedInUser;
let kurye: SignedInUser;
let musteri: SignedInUser;
let str: { id: string; name: string };
let kehl: { id: string; name: string };
let van: { id: string; name: string };

const scope = (user: SignedInUser) => app.request('/api/v1/operations/scope', { headers: bearer(user.token) });

beforeAll(async () => {
  const [strRow, kehlRow, vanRow] = await Promise.all([
    createTestWarehouse(db, { label: 'STR' }),
    createTestWarehouse(db, { label: 'KEHL' }),
    createTestWarehouse(db, { label: 'VAN', kind: 'vehicle' }),
  ]);
  str = { id: strRow.id, name: strRow.name };
  kehl = { id: kehlRow.id, name: kehlRow.name };
  van = { id: vanRow.id, name: vanRow.name };

  [depocu, muhasebeci, yonetici, kurye, musteri] = await Promise.all([
    createSignedInUser({ prefix: 'ops', label: 'depocu', roles: ['warehouse'], warehouseIds: [str.id] }),
    // Seed'in `muhasebe` künyesinin aynısı: accounting + warehouse, İKİ tesis (`scripts/seed/people.ts`).
    createSignedInUser({
      prefix: 'ops',
      label: 'muhasebeci',
      roles: ['accounting', 'warehouse'],
      warehouseIds: [str.id, kehl.id],
    }),
    createSignedInUser({ prefix: 'ops', label: 'yonetici', roles: ['admin'], warehouseIds: [] }),
    // Kullanıcı bulgusunun hâli: kapsamda tesis DE araç DA var (`seed/people.ts` → kurye).
    createSignedInUser({ prefix: 'ops', label: 'kurye', roles: ['courier'], warehouseIds: [str.id, van.id] }),
    createSignedInUser({ prefix: 'ops', label: 'musteri', roles: ['customer'], warehouseIds: [] }),
  ]);
});

afterAll(async () => {
  await purgeTestData(db, {
    profileIds: [depocu.profileId, muhasebeci.profileId, yonetici.profileId, kurye.profileId, musteri.profileId],
    warehouseIds: [str.id, kehl.id, van.id],
  });
});

describe('GET /operations/scope', () => {
  it('kapsamı tek tesis olan depocuda çözüm HAZIRDIR — liste de tek satır', async () => {
    const body = await envelopeData<StaffScope>(await scope(depocu));

    expect(body.resolvedId).toBe(str.id);
    expect(body.warehouses).toEqual([{ id: str.id, code: expect.any(String), name: str.name, kind: 'facility' }]);
  });

  it('iki tesisli muhasebecide çözüm YOK ama seçenekler VAR', async () => {
    const body = await envelopeData<StaffScope>(await scope(muhasebeci));

    // `null` = "kapsam tek bir tesis değil"; ekran adı yazmaz, SEÇTİRİR.
    expect(body.resolvedId).toBeNull();
    expect(body.warehouses.map((w) => w.id).sort()).toEqual([str.id, kehl.id].sort());
  });

  it('kuryenin kapsamındaki ARAÇ listede ama `kind` ile ayrılmış', async () => {
    const body = await envelopeData<StaffScope>(await scope(kurye));

    expect(body.warehouses.find((w) => w.id === van.id)?.kind).toBe('vehicle');
    expect(body.warehouses.find((w) => w.id === str.id)?.kind).toBe('facility');
  });

  it('kapsamsız yönetici AKTİF tesislerin tamamını görür — admin depo-üstüdür', async () => {
    const body = await envelopeData<StaffScope>(await scope(yonetici));

    expect(body.resolvedId).toBeNull();
    // Paylaşılan DB: küresel sayı iddia EDİLMEZ, kendi kurduğumuz satırların varlığı ölçülür.
    expect(body.warehouses.map((w) => w.id)).toEqual(expect.arrayContaining([str.id, kehl.id, van.id]));
  });

  it('müşteri 403 alır — kabuğun künyesi personelin künyesidir', async () => {
    const res = await scope(musteri);

    expect(res.status).toBe(403);
    expect(await envelopeError(res)).toBe('forbidden');
  });
});
