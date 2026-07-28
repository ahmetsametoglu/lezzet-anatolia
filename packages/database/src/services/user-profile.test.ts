import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
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

beforeAll(async () => {
  const profile = await profiles.insert({ name: `Test Profil ${stamp}`, email: `musteri${stamp}@ornek.fr` });
  customerId = profile.id;
  createdIds.push(profile.id);
});

afterAll(async () => {
  await purgeTestData(db, { profileIds: createdIds });
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
