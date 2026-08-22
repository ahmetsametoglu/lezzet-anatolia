import { afterAll, describe, expect, it } from 'vitest';
import { AddressService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import {
  addCustomerAddress,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
  updateCustomerAddress,
} from './addresses';

/**
 * **Müşteri adres kapısı** (21.15) — web hesap sayfasıyla TEK kural olduğunun kanıtı:
 *   · ilk adres kendiliğinden varsayılandır (kural serviste, kapı tekrar etmez),
 *   · sahiplik her eylemde süzülür — başkasının adresi "bulunamadı"dır,
 *   · `isDefault` yazma yolundan sızamaz (JSON gövdeden gelse bile),
 *   · varsayılan silinirse EN YENİ adres devralır,
 *   · boş etiket `null`a iner, boş sokak/şehir adlı rettir.
 *
 * Paylaşılan DB (CLAUDE.md §4b): satırlar damgalı profillere bağlı, hiçbir iddia küresel sayıya
 * bakmaz; temizlik `purgeTestData` ile (adresler profil CASCADE'iyle gider).
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();
/** Bu dosyanın açtığı profiller — purge kimlikle çalışır; adresleri CASCADE götürür. */
const createdIds: string[] = [];
async function createCustomer(tag: string) {
  const row = await profiles.insert({ email: `adres-kapisi-${tag}-${stamp}@ornek.test`, name: `Adres ${tag}`, type: 'individual' });
  createdIds.push(row.id);
  return row;
}
/* Alıcı ve telefon 22.08'de ZORUNLU oldu (kolonlar `not null`) — adres teslim alacak kişi ve
   numarayla birlikte kaydediliyor. Yardımcı ikisini sabit veriyor: bu dosyanın ölçtüğü şey
   varsayılan devri, etiket kırpma ve sahiplik; alıcı/telefon burada yalnız kaydın var olabilmesi
   için dolu. Değerini konu edinen test `extra` ile ezer. */
const write = (line1: string, extra: Partial<Parameters<typeof addCustomerAddress>[1]> = {}) => ({
  label: null,
  recipient: 'Claire Weber',
  phone: '+33612345678',
  line1,
  line2: null,
  postalCode: '67000',
  city: 'Strasbourg',
  ...extra,
});

afterAll(async () => {
  await purgeTestData(db, { profileIds: createdIds });
});

describe('müşteri adres kapısı', () => {
  it('ilk adres varsayılandır; liste varsayılan başta ve sonrası en yeniden eskiye döner', async () => {
    const { id: customerId } = await createCustomer('liste');

    const first = await addCustomerAddress(db, { customerId, ...write('1 Rue A', { label: '  Ev  ' }) });
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;
    expect(first.addresses).toHaveLength(1);
    expect(first.addresses[0]?.isDefault).toBe(true);
    // Etiket kırpılır; boş etiket değil, dolu etiket örneği: '  Ev  ' → 'Ev'.
    expect(first.addresses[0]?.label).toBe('Ev');

    const second = await addCustomerAddress(db, { customerId, ...write('2 Rue B') });
    const third = await addCustomerAddress(db, { customerId, ...write('3 Rue C') });
    expect(second.status).toBe('ok');
    expect(third.status).toBe('ok');
    if (third.status !== 'ok') return;
    // Varsayılan (ilk eklenen) başta; kalanlar en yeniden eskiye.
    expect(third.addresses.map((a) => a.line1)).toEqual(['1 Rue A', '3 Rue C', '2 Rue B']);
  });

  it('sahiplik süzülür: başka müşterinin adresi her eylemde "bulunamadı"dır', async () => {
    const owner = await createCustomer('sahip');
    const intruder = await createCustomer('yabanci');
    const added = await addCustomerAddress(db, { customerId: owner.id, ...write('5 Quai X') });
    if (added.status !== 'ok') throw new Error('kurulum düştü');
    const addressId = added.addresses[0]!.id;

    const patch = { patch: { city: 'Colmar' } };
    expect((await updateCustomerAddress(db, { customerId: intruder.id, addressId, ...patch })).status).toBe('not_found');
    expect((await setDefaultCustomerAddress(db, { customerId: intruder.id, addressId })).status).toBe('not_found');
    expect((await deleteCustomerAddress(db, { customerId: intruder.id, addressId })).status).toBe('not_found');

    // Adres yerinde ve dokunulmamış duruyor.
    const rows = await new AddressService(db).listByCustomer(owner.id);
    expect(rows[0]?.city).toBe('Strasbourg');
  });

  it('güncelleme isDefault sızdırmaz; boş sokak/şehir adlı rettir; boş etiket null olur', async () => {
    const { id: customerId } = await createCustomer('guncelle');
    await addCustomerAddress(db, { customerId, ...write('1 Rue Eski', { label: 'Ev' }) });
    const second = await addCustomerAddress(db, { customerId, ...write('2 Rue Hedef') });
    if (second.status !== 'ok') throw new Error('kurulum düştü');
    const target = second.addresses.find((a) => !a.isDefault)!;

    // JSON gövdeden gelen isDefault TİPİN dışıdır ama çalışma zamanında da sızmamalı.
    const sneaky = { city: 'Colmar', isDefault: true } as { city: string };
    const updated = await updateCustomerAddress(db, { customerId, addressId: target.id, patch: sneaky });
    expect(updated.status).toBe('ok');
    if (updated.status !== 'ok') return;
    const after = updated.addresses.find((a) => a.id === target.id);
    expect(after?.city).toBe('Colmar');
    expect(after?.isDefault).toBe(false);
    // Dokunulmayan alan yerinde.
    expect(after?.line1).toBe('2 Rue Hedef');

    expect((await updateCustomerAddress(db, { customerId, addressId: target.id, patch: { line1: '   ' } })).status).toBe('invalid_address');
    const relabeled = await updateCustomerAddress(db, { customerId, addressId: target.id, patch: { label: '   ' } });
    expect(relabeled.status).toBe('ok');
    if (relabeled.status !== 'ok') return;
    expect(relabeled.addresses.find((a) => a.id === target.id)?.label).toBeNull();
  });

  it('varsayılan yapma bayrağı devreder — iki varsayılan kalmaz', async () => {
    const { id: customerId } = await createCustomer('varsayilan');
    await addCustomerAddress(db, { customerId, ...write('1 Rue A') });
    const second = await addCustomerAddress(db, { customerId, ...write('2 Rue B') });
    if (second.status !== 'ok') throw new Error('kurulum düştü');
    const target = second.addresses.find((a) => !a.isDefault)!;

    const outcome = await setDefaultCustomerAddress(db, { customerId, addressId: target.id });
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.addresses.filter((a) => a.isDefault).map((a) => a.id)).toEqual([target.id]);
  });

  it('varsayılan silinirse EN YENİ adres devralır; son adres silinince liste boş kalır', async () => {
    const { id: customerId } = await createCustomer('sil');
    const first = await addCustomerAddress(db, { customerId, ...write('1 Rue Varsayilan') });
    await addCustomerAddress(db, { customerId, ...write('2 Rue Orta') });
    const third = await addCustomerAddress(db, { customerId, ...write('3 Rue Yeni') });
    if (first.status !== 'ok' || third.status !== 'ok') throw new Error('kurulum düştü');
    const defaultId = first.addresses[0]!.id;
    const newest = third.addresses.find((a) => a.line1 === '3 Rue Yeni')!;

    const afterDelete = await deleteCustomerAddress(db, { customerId, addressId: defaultId });
    expect(afterDelete.status).toBe('ok');
    if (afterDelete.status !== 'ok') return;
    expect(afterDelete.addresses.filter((a) => a.isDefault).map((a) => a.id)).toEqual([newest.id]);

    // Kalanları da sil — boş listede varsayılan devri denenmez, kapı sessizce tamamlar.
    for (const row of afterDelete.addresses) {
      const gone = await deleteCustomerAddress(db, { customerId, addressId: row.id });
      expect(gone.status).toBe('ok');
    }
    expect((await new AddressService(db).listByCustomer(customerId))).toHaveLength(0);
  });
});
