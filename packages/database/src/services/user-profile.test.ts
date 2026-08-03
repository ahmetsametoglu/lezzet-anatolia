import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { AddressService } from './address.service';
import { UserProfileService } from './user-profile.service';

/**
 * Kimlik profili ve adres servisleri (04.4/04.5) — DB üstünde. **Ayrı müşteri tablosu yoktur:**
 * müşteri bir roldür, kimlik `user_profiles`'ta yaşar; ticari alanlar aynı satırdadır.
 *
 * Kimlik KARARI burada test edilmez (motorun işi, `domain-core/identity`); burada satır kuralları
 * doğrulanır: anahtar tekilliği, varsayılan adres tekilliği, taslak/B2B işaretleri.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const addresses = new AddressService(db);

const stamp = Date.now();
let customerId: string;
const createdIds: string[] = [];
/** Testin açtığı depolar — künye "sonunda toplanıyor" diyordu ama toplayan yoktu (denetim R). */
const createdWarehouseIds: string[] = [];

beforeAll(async () => {
  const profile = await profiles.insert({ name: `Test Profil ${stamp}`, email: `musteri${stamp}@ornek.fr` });
  customerId = profile.id;
  createdIds.push(profile.id);
});

afterAll(async () => {
  // Depo profillerden SONRA gider ve sırayı purge biliyor: personel kapsamında geçen depo silinemez.
  await purgeTestData(db, { profileIds: createdIds, warehouseIds: createdWarehouseIds });
});

describe('kimlik anahtarları tekildir (04.5)', () => {
  it('aynı e-posta iki müşteriye yazılamaz — kopya sessizce çoğalmaz', async () => {
    await expect(profiles.insert({ name: 'Kopya', email: `musteri${stamp}@ornek.fr` })).rejects.toThrow();
  });

  it('e-posta araması büyük/küçük harf ayırmaz', async () => {
    expect((await profiles.findByEmail(`MUSTERI${stamp}@ORNEK.FR`))?.id).toBe(customerId);
  });

  it('aynı telefon iki müşteriye yazılamaz; boş telefonlar çakışmaz', async () => {
    const phone = `+3361111${String(stamp).slice(-4)}`;
    const first = await profiles.insert({ name: 'Telefonlu', phone: phone });
    createdIds.push(first.id);
    await expect(profiles.insert({ name: 'Kopya telefon', phone: phone })).rejects.toThrow();

    // Telefonsuz iki kayıt yan yana yaşayabilir (kısmi indeks).
    const withoutPhone = await profiles.insert({ name: 'Telefonsuz' });
    createdIds.push(withoutPhone.id);
    expect(withoutPhone.phone).toBeNull();
  });

  it('iki anahtar tek turda aranır — motorun girdisi hazır gelir', async () => {
    const candidates = await profiles.findIdentityCandidates(null, `musteri${stamp}@ornek.fr`);
    expect(candidates).toEqual({ byPhone: null, byEmail: customerId });
  });
});

describe('varsayılanlar ve işaretler', () => {
  it('yeni müşteri: vade KAPALI, kapıda ödeme AÇIK, taslak değil', async () => {
    const profile = await profiles.getById(customerId);
    expect(profile).toMatchObject({ creditEnabled: false, codAllowed: true, isDraft: false, type: 'individual' });
    expect(profile?.companyInfo).toBeNull(); // kanal buradan türer, ayrı kolon yok
  });

  it('B2B onayı verilebilir/geri alınabilir — reddedilen kayıt silinmez', async () => {
    const company = await profiles.insert({
      name: `Restoran ${stamp}`,
      type: 'company',
      companyInfo: { legalName: 'SARL Test', siret: '12345678901234', activityCode: '5610A' },
      b2bApproved: false,
    });
    createdIds.push(company.id);

    expect((await profiles.setB2bApproval(company.id, true)).b2bApproved).toBe(true);
    expect((await profiles.setB2bApproval(company.id, false)).b2bApproved).toBe(false);
    expect(await profiles.getById(company.id)).not.toBeNull();
  });

  it('taslak listesi yalnız taslakları getirir', async () => {
    const draft = await profiles.insert({ name: 'WhatsApp taslağı', phone: `+3362222${String(stamp).slice(-4)}`, isDraft: true });
    createdIds.push(draft.id);

    const page = await profiles.list({ isDraft: true, limit: 50 });
    expect(page.rows.some((r) => r.id === draft.id)).toBe(true);
    expect(page.rows.every((r) => r.isDraft)).toBe(true);
  });
});

/**
 * Müşteri listesinin SUNUCU-TARAFLI arama ve daraltmaları (09.9).
 *
 * Süzgeç dizeleri PostgREST'e düz metin olarak gider: yanlışsa tip denetimi değil yalnız DB fark
 * eder. Ve en sinsi hata sessizdir — üç arama alanı `or` yerine AND'lenirse liste HER aramada boş
 * döner; kimse "müşteri yok" ile "sorgu yanlış" arasındaki farkı ekrandan göremez.
 */
describe('liste: sunucu-taraflı arama + daraltma (09.9)', () => {
  const arananAd = `Zeytin Bistro ${stamp}`;
  let arananId: string;
  let vadeliId: string;

  beforeAll(async () => {
    const aranan = await profiles.insert({
      name: arananAd,
      phone: `+3363333${String(stamp).slice(-4)}`,
      email: `bistro${stamp}@ornek.fr`,
      type: 'company',
    });
    arananId = aranan.id;
    const vadeli = await profiles.insert({
      name: `Vadeli Firma ${stamp}`,
      type: 'company',
      creditEnabled: true,
      creditLimitCents: 50000,
      paymentTermDays: 30,
    });
    vadeliId = vadeli.id;
    createdIds.push(aranan.id, vadeli.id);
  });

  it('ada göre bulur', async () => {
    const page = await profiles.list({ query: `Zeytin Bistro ${stamp}`, limit: 50 });
    expect(page.rows.map((r) => r.id)).toContain(arananId);
  });

  it('telefona göre bulur — telefon KİMLİK anahtarıdır (WhatsApp)', async () => {
    const page = await profiles.list({ query: String(stamp).slice(-4), limit: 50 });
    expect(page.rows.map((r) => r.id)).toContain(arananId);
  });

  it('e-postaya göre bulur ve harf ayrımı gözetmez', async () => {
    const page = await profiles.list({ query: `BISTRO${stamp}@ORNEK.FR`, limit: 50 });
    expect(page.rows.map((r) => r.id)).toContain(arananId);
  });

  it('üç alan OR ile bağlanır — ad tutan satır telefonu tutmasa da gelir', async () => {
    // AND'lenseydi burası boş dönerdi: hiçbir müşteri hem adında hem telefonunda "Zeytin" taşımaz.
    const page = await profiles.list({ query: 'Zeytin', limit: 50 });
    expect(page.rows.map((r) => r.id)).toContain(arananId);
  });

  it('eşleşmeyen terim BOŞ döner — "hepsini getir"e düşmez', async () => {
    // Sessiz başarısızlığın klasik hâli: süzgeç kurulamayınca liste süzgeçsiz döner ve operatör
    // aradığı müşteriyi bulduğunu sanır.
    const page = await profiles.list({ query: `yokboyle${stamp}`, limit: 50 });
    expect(page.rows).toHaveLength(0);
  });

  it('yalnız noktalama olan terim süzgeç kurmaz, sorguyu da bozmaz', async () => {
    // `,` `(` `)` PostgREST'in AYRAÇLARI: kaçış olmadan sorgu ikiye bölünür ve istek hata verir.
    await expect(profiles.list({ query: '(),', limit: 5 })).resolves.toBeDefined();
  });

  it('arama ile daraltma BİRLİKTE uygulanır (AND)', async () => {
    // Terim iki firmaya da uyuyor (ikisinde de damga var); `creditEnabled` yalnız birini bırakır.
    const page = await profiles.list({ query: String(stamp), creditEnabled: true, limit: 50 });
    const ids = page.rows.map((r) => r.id);
    expect(ids).toContain(vadeliId);
    expect(ids).not.toContain(arananId);
  });

  it('tip daraltması', async () => {
    const page = await profiles.list({ query: String(stamp), type: 'company', limit: 50 });
    expect(page.rows.every((r) => r.type === 'company')).toBe(true);
    expect(page.rows.map((r) => r.id)).toContain(arananId);
  });

  it('PERSONEL listeye karışmaz — tek tablo, rolle ayrılır', async () => {
    // `user_profiles` müşteriyi ve personeli birlikte taşıyor. Süzgeç olmasa müşteri ekranı depocuyu
    // ve patronu da listelerdi — hem yanlış hem de "N müşteri" sayacını şişirir. Rol kümesi ÇOKLU
    // olabildiği için ölçüt "içerir", eşitlik değil.
    // Depocu kapsamsız açılamaz (DOMAIN §17) — testin kendi deposu, sonunda toplanıyor.
    const depo = await createTestWarehouse(db, { label: 'PRF' });
    createdWarehouseIds.push(depo.id);
    const depocu = await profiles.insert({ name: `Depocu ${stamp}`, roles: ['warehouse'], warehouseIds: [depo.id] });
    createdIds.push(depocu.id);

    const page = await profiles.list({ query: String(stamp), limit: 50 });
    expect(page.rows.map((r) => r.id)).not.toContain(depocu.id);
    expect(page.rows.every((r) => r.roles.includes('customer'))).toBe(true);
  });

  it('sayaçlar TÜM müşteri kümesine ait, süzgeçli listeye değil', async () => {
    // Çip "3 taslak" derken kendi süzgecini saymamalı: "Taslak" çipine basan operatör sayının
    // değişmesini bekler, değişmeyince ekrana güvenmez.
    const { total, draft } = await profiles.counts();
    expect(total).toBeGreaterThanOrEqual(draft);
    const suzulmus = await profiles.list({ isDraft: true, limit: 1 });
    expect(suzulmus.rows).toHaveLength(1);
    // Süzgeç listeyi daralttı ama sayaç aynı kaldı.
    expect((await profiles.counts()).total).toBe(total);
  });

  it('arama SAYFALANIR — tavan yok, imleç var', async () => {
    // `search()` tavanlıdır ve bu bilinçli (seçicinin bulma aracı). Ekranın listesi tavanlı olamaz:
    // ikinci sayfada duran müşteri "yok" görünürdü.
    const ilk = await profiles.list({ query: String(stamp), limit: 1 });
    expect(ilk.rows).toHaveLength(1);
    expect(ilk.nextCursor).not.toBeNull();

    const ikinci = await profiles.list({ query: String(stamp), limit: 1, cursor: ilk.nextCursor! });
    expect(ikinci.rows).toHaveLength(1);
    expect(ikinci.rows[0]!.id).not.toBe(ilk.rows[0]!.id);
  });
});

describe('adresler (04.4)', () => {
  it('ilk adres otomatik varsayılandır', async () => {
    const address = await addresses.addForCustomer({ customerId, line1: '1 rue de la Paix', postalCode: '67000', city: 'Strasbourg' });
    expect(address.isDefault).toBe(true);
  });

  it('varsayılan tekildir — yenisi seçilince eskisi düşer', async () => {
    const ikinci = await addresses.addForCustomer({ customerId, line1: '2 avenue des Vosges', postalCode: '67000', city: 'Strasbourg' });
    expect(ikinci.isDefault).toBe(false); // ilk adres varsayılan kaldı

    await addresses.setDefault(ikinci.id);
    const list = await addresses.listByCustomer(customerId);
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);
    expect(list[0]!.id).toBe(ikinci.id); // varsayılan başta listelenir
  });

  it('profil silinince adresleri de gider (yetim adres kalmaz)', async () => {
    const temporary = await profiles.insert({ name: `Geçici ${stamp}` });
    createdIds.push(temporary.id); // test yarıda kalırsa da toplanır
    await addresses.addForCustomer({ customerId: temporary.id, line1: 'x', postalCode: '67000', city: 'Strasbourg' });
    // Servis silme kapalı (kimlik kaydı silinmez, kapatılır) — CASCADE'i doğrudan doğruluyoruz.
    await db.from('user_profiles').delete().eq('id', temporary.id);

    expect(await addresses.listByCustomer(temporary.id)).toHaveLength(0);
  });
});
