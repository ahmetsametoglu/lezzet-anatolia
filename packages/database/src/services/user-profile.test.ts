import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { AddressService } from './address.service';
import { UserProfileService } from './user-profile.service';
import type { UserRole } from '@lezzet/types';

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

  it('AYNI telefon iki müşteriye yazılabilir — bu kolon artık kimlik anahtarı DEĞİL (04.10)', async () => {
    // Kural TERSİNE döndü ve dönmesi gerekiyordu: `user_profiles_phone_key` kaldırıldı, çünkü
    // tekillik doğrulanmamış bir dizeyi kimlik anahtarı sayıyordu — kayıtlı olmayan bir numara
    // formdan önceden sahiplenilebiliyordu. Kolon bugün İLETİŞİM numarası ve aynı numarayı iki
    // müşterinin taşıması meşru: aile telefonu, işyeri hattı, eşle ortak numara.
    // Kimlik anahtarının tekilliği `customer_phone` testinde (`customer-phone.test.ts`).
    const phone = `+3361111${String(stamp).slice(-4)}`;
    const first = await profiles.insert({ name: 'Telefonlu', phone });
    createdIds.push(first.id);
    const second = await profiles.insert({ name: 'Aynı hattı paylaşan', phone });
    createdIds.push(second.id);
    expect(second.phone).toBe(phone);

    const withoutPhone = await profiles.insert({ name: 'Telefonsuz' });
    createdIds.push(withoutPhone.id);
    expect(withoutPhone.phone).toBeNull();
  });
});

describe('varsayılanlar ve işaretler', () => {
  it('yeni müşteri: vade KAPALI, kapıda ödeme AÇIK, taslak değil', async () => {
    const profile = await profiles.getById(customerId);
    expect(profile).toMatchObject({ creditEnabled: false, codAllowed: true, isDraft: false, type: 'individual' });
    expect(profile?.companyInfo).toBeNull(); // kanal buradan türer, ayrı kolon yok
  });

  it('B2B onayı verilebilir — reddedilen kayıt silinmez', async () => {
    const company = await profiles.insert({
      name: `Restoran ${stamp}`,
      type: 'company',
      companyInfo: { legalName: 'SARL Test', siret: '12345678901234', activityCode: '5610A' },
      b2bApproved: false,
    });
    createdIds.push(company.id);

    expect((await profiles.approveB2b(company.id)).b2bApproved).toBe(true);
    expect(await profiles.getById(company.id)).not.toBeNull();
  });

  /**
   * 08.7'nin kapattığı açık: ret ile "sırasını bekliyor" veride ayrışmıyordu ve reddedilen aday
   * ekranda hiç gelmeyecek bir cevabı beklediğini okuyordu.
   */
  it('ret kuyruktan düşürür, gerekçeyi saklar ve hâli ayrıştırır', async () => {
    const company = await profiles.insert({
      name: `Reddedilen ${stamp}`,
      type: 'company',
      companyInfo: { legalName: 'SARL Ret', siret: '99999999999999', activityCode: '5610A' },
      b2bApproved: false,
    });
    createdIds.push(company.id);

    // Başvuru anı: kuyrukta ve "bekliyor".
    const basvurmus = await profiles.getById(company.id);
    expect(basvurmus?.b2bPending).toBe(true);

    const reddedilmis = await profiles.rejectB2b(company.id, { actorId: customerId, reason: 'Faaliyet kodu uyuşmuyor' });
    // `b2bApproved` DEĞİŞMEDİ — ayrım tam da bu yüzden damgada.
    expect(reddedilmis.b2bApproved).toBe(false);
    expect(reddedilmis.b2bRejectReason).toBe('Faaliyet kodu uyuşmuyor');
    expect(reddedilmis.b2bPending).toBe(false);

    // Kuyruk süzgeci reddedileni GÖRMEZ.
    const kuyruk = await profiles.list({ b2bPending: true, limit: 100 });
    expect(kuyruk.rows.some((r) => r.id === company.id)).toBe(false);
  });

  it('künye düzeltilip yeniden başvurulunca ret ESKİR — kayıt kuyruğa döner, geçmiş durur', async () => {
    const company = await profiles.insert({
      name: `Yeniden ${stamp}`,
      type: 'company',
      companyInfo: { legalName: 'SARL Yeniden', siret: '88888888888888', activityCode: '4711D' },
      b2bApproved: false,
    });
    createdIds.push(company.id);
    await profiles.rejectB2b(company.id, { actorId: customerId, reason: 'SIRET doğrulanamadı' });

    // Aday künyeyi DÜZELTİP yeniden başvuruyor; damgayı tetikleyici atar, uygulama yazmaz.
    const yeniden = await profiles.update({
      id: company.id,
      companyInfo: { legalName: 'SARL Yeniden', siret: '88888888888888', activityCode: '5610A' },
    });

    expect(yeniden.b2bPending).toBe(true);
    // Ret SİLİNMEDİ — 09.11'in istediği geçmiş duruyor.
    expect(yeniden.b2bRejectReason).toBe('SIRET doğrulanamadı');
    expect(yeniden.b2bRejectedAt).not.toBeNull();
  });

  it('aynı künyeyle yeniden göndermek yeni başvuru DEĞİLDİR — ret ayakta kalır', async () => {
    const kunye = { legalName: 'SARL Aynı', siret: '77777777777777', activityCode: '5610A' };
    const company = await profiles.insert({ name: `Aynı ${stamp}`, type: 'company', companyInfo: kunye, b2bApproved: false });
    createdIds.push(company.id);
    await profiles.rejectB2b(company.id, { actorId: customerId, reason: 'Adres rota dışı' });

    // Künye değişmeden yeniden yazılıyor: taşıdığı yeni bilgi yok, operatörü aynı karara çağırır.
    const tekrar = await profiles.update({ id: company.id, companyInfo: kunye });
    expect(tekrar.b2bPending).toBe(false);
  });

  it('alakasız bir güncelleme reddedileni kuyruğa geri sokmaz', async () => {
    const company = await profiles.insert({
      name: `Telefonlu ${stamp}`,
      type: 'company',
      companyInfo: { legalName: 'SARL Telefon', siret: '66666666666666', activityCode: '5610A' },
      b2bApproved: false,
    });
    createdIds.push(company.id);
    await profiles.rejectB2b(company.id, { actorId: customerId, reason: 'Künye eksik' });

    // Alakasız alan olarak `name` seçildi, telefon DEĞİL: telefon tekil indeksli ve aynı dosyadaki
    // liste kurgusuyla çakışıyordu — testin ölçtüğü şeyle ilgisi olmayan bir kısıt ihlali.
    const adiDegisen = await profiles.update({ id: company.id, name: `Telefonlu ${stamp} (düzeltildi)` });
    expect(adiDegisen.b2bPending).toBe(false);
  });

  it('gerekçesiz ret yazılamaz — servis kapıda durdurur', async () => {
    await expect(profiles.rejectB2b(customerId, { actorId: customerId, reason: '   ' })).rejects.toThrow(/gerekçesiz/);
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

  it('listStaff: ÇOK ROLLÜ personel tek kez döner — dört tur bir tura indi (talep §5b)', async () => {
    // Ekranlar bunu `STAFF_ROLES.map(listByRole)` ile kuruyordu ve kendi tekilleştirmesini
    // yazıyordu; aynı kişi `admin` + `courier` taşıyabildiği için o adım şarttı. `overlaps` kesişim
    // sorduğu için satır zaten bir kez dönüyor — tekilleştirmenin kendisi ortadan kalkıyor.
    const depo = await createTestWarehouse(db, { label: 'STF' });
    createdWarehouseIds.push(depo.id);
    const cokRollu = await profiles.insert({
      name: `Çok rollü ${stamp}`,
      roles: ['admin', 'courier'],
      warehouseIds: [depo.id],
    });
    createdIds.push(cokRollu.id);

    const personel = await profiles.listStaff();
    // Kendi satırımı sayıyorum: paylaşılan DB'de küresel sayıya bakmak başka ajanın verisine bağımlı olur (§4b).
    expect(personel.filter((p) => p.id === cokRollu.id)).toHaveLength(1);
    // Müşteri personel listesine karışmaz — ayrım rolde, tabloda değil.
    expect(personel.map((p) => p.id)).not.toContain(customerId);
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

/**
 * **Pazarlama izni süzgeci** (`ANALYTICS §6` · operasyon şeridinin talebi 04.08) — analitikteki
 * "N kişi" sayısının gittiği liste.
 *
 * Sınanan şey jsonb yolunun çalışması DEĞİL yalnız; asıl sınanan **kanal ayrımı**: e-postaya izin
 * verenle WhatsApp'a izin veren aynı küme değil ve karıştırılmaları izinsiz gönderim demek.
 */
describe('pazarlama izni süzgeci (ANALYTICS §6)', () => {
  let epostaIzinli: string;
  let whatsappIzinli: string;
  let izinsiz: string;

  beforeAll(async () => {
    const e = await profiles.insert({ name: `İzin E ${stamp}`, email: `izin-e${stamp}@ornek.fr` });
    const w = await profiles.insert({ name: `İzin W ${stamp}`, email: `izin-w${stamp}@ornek.fr` });
    // REDDEDEN müşteri: `granted:false`. "Hiç sorulmadı" (torba boş) ile aynı kovaya düşmemeli —
    // ikisi ayrı hâller (09.10) ama süzgeç açısından ikisi de listenin DIŞINDA kalır.
    const r = await profiles.insert({ name: `İzin Yok ${stamp}`, email: `izin-yok${stamp}@ornek.fr` });
    epostaIzinli = e.id;
    whatsappIzinli = w.id;
    izinsiz = r.id;
    createdIds.push(e.id, w.id, r.id);

    await profiles.update({ id: e.id, marketingConsent: { email: { granted: true, at: new Date().toISOString(), source: 'test' } } });
    await profiles.update({ id: w.id, marketingConsent: { whatsapp: { granted: true, at: new Date().toISOString(), source: 'test' } } });
    await profiles.update({ id: r.id, marketingConsent: { email: { granted: false, at: new Date().toISOString(), source: 'test' } } });
  });

  it('kanal AYRIMI tutar — e-posta süzgeci WhatsApp izinlisini GETİRMEZ', async () => {
    const page = await profiles.list({ marketingConsent: 'email', limit: 200 });
    const idler = page.rows.map((r) => r.id);
    expect(idler).toContain(epostaIzinli);
    expect(idler).not.toContain(whatsappIzinli);
    expect(idler).not.toContain(izinsiz);
  });

  it('`any` ikisinden birini de getirir', async () => {
    const page = await profiles.list({ marketingConsent: 'any', limit: 200 });
    const idler = page.rows.map((r) => r.id);
    expect(idler).toEqual(expect.arrayContaining([epostaIzinli, whatsappIzinli]));
    expect(idler).not.toContain(izinsiz);
  });

  it('REDDEDEN listeye girmez — `granted:false` izin değildir', async () => {
    const page = await profiles.list({ marketingConsent: 'email', limit: 200 });
    expect(page.rows.map((r) => r.id)).not.toContain(izinsiz);
  });

  it('sayaç ile liste AYNI ölçütten çıkar — köprünün iki ucu aynı sayıyı göstermeli', async () => {
    // Küresel sayıya bakılmıyor (`CLAUDE §4b`): başka ajanın verisi toplamı oynatır. Ölçüt şu —
    // sayaç, bu testin kurduğu satırları kapsayacak kadar büyük VE listeyle tutarlı olmalı.
    const [sayac, page] = await Promise.all([
      profiles.countByMarketingConsent('email'),
      profiles.list({ marketingConsent: 'email', limit: 1000 }),
    ]);
    expect(sayac).toBe(page.rows.length);
  });
});

/* Adres artık teslim alacak kişi VE numarayla birlikte doğuyor (kullanıcı kararı 22.08, kolonlar
   `not null`) — fikstürler o değişmeze uydu. Değerler sabit: bu blok varsayılan seçimini ölçüyor,
   alıcı/telefon burada yalnız kaydın var olabilmesi için dolu. */
const DOOR = { recipient: 'Claire Weber', phone: '+33612345678' } as const;

describe('adresler (04.4)', () => {
  it('ilk adres otomatik varsayılandır', async () => {
    const address = await addresses.addForCustomer({ customerId, ...DOOR, line1: '1 rue de la Paix', postalCode: '67000', city: 'Strasbourg' });
    expect(address.isDefault).toBe(true);
  });

  it('varsayılan tekildir — yenisi seçilince eskisi düşer', async () => {
    const ikinci = await addresses.addForCustomer({ customerId, ...DOOR, line1: '2 avenue des Vosges', postalCode: '67000', city: 'Strasbourg' });
    expect(ikinci.isDefault).toBe(false); // ilk adres varsayılan kaldı

    await addresses.setDefault(ikinci.id);
    const list = await addresses.listByCustomer(customerId);
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);
    expect(list[0]!.id).toBe(ikinci.id); // varsayılan başta listelenir
  });

  it('profil silinince adresleri de gider (yetim adres kalmaz)', async () => {
    const temporary = await profiles.insert({ name: `Geçici ${stamp}` });
    createdIds.push(temporary.id); // test yarıda kalırsa da toplanır
    await addresses.addForCustomer({ customerId: temporary.id, ...DOOR, line1: 'x', postalCode: '67000', city: 'Strasbourg' });
    // Servis silme kapalı (kimlik kaydı silinmez, kapatılır) — CASCADE'i doğrudan doğruluyoruz.
    await db.from('user_profiles').delete().eq('id', temporary.id);

    expect(await addresses.listByCustomer(temporary.id)).toHaveLength(0);
  });
});

/**
 * **ARAMA YALNIZ MÜŞTERİ DÖNDÜRÜR** (26.08, ölçülmüş arıza).
 *
 * `user_profiles` müşteriyi ve personeli AYNI tabloda tutuyor (`0001`) ve `search()`ün adı
 * "müşteri arama"ydı ama rol süzgeci YOKTU. Ölçüldü (tarayıcıda, elle sipariş girişi): "Claire"
 * aramasının İLK sonucu bir depo çalışanıydı — operatör farkında olmadan personel adına sipariş
 * açabilirdi. Belirtisi de yoktu: satır geçerli bir profil, sipariş geçerli bir sipariş.
 *
 * Yerinde satışın anonim alıcısı (`roles={system}`, 21.119) aynı deliği daha görünür kıldı.
 */
describe('müşteri arama rol süzer (26.08)', () => {
  const damga = `AramaRol${stamp}`;

  beforeAll(async () => {
    const kur = async (ad: string, roles: UserRole[], ek: Record<string, unknown> = {}) => {
      const row = await profiles.insert({ name: `${damga} ${ad}`, roles, ...ek });
      createdIds.push(row.id);
      return row;
    };
    await kur('Musteri', ['customer']);
    // Depocu kapsamsız olamaz (`user_profiles_warehouse_scope`) — kendi deposunu alıyor.
    const depo = await createTestWarehouse(db, { label: 'ARAMA' });
    createdWarehouseIds.push(depo.id);
    await kur('Depocu', ['warehouse'], { warehouseIds: [depo.id] });
    await kur('Yonetici', ['admin']);
    await kur('Anonim', ['system']);
  });

  it('personeli ve sistem kaydını DIŞLAR, müşteriyi bulur', async () => {
    const sonuc = await profiles.search(damga, 20);
    const adlar = sonuc.map((r) => r.name);

    expect(adlar).toContain(`${damga} Musteri`);
    // Üçü de aynı terimle eşleşiyor ama hiçbiri müşteri değil: seçicide görünmemeli.
    expect(adlar).not.toContain(`${damga} Depocu`);
    expect(adlar).not.toContain(`${damga} Yonetici`);
    expect(adlar).not.toContain(`${damga} Anonim`);
    expect(sonuc).toHaveLength(1);
  });
});
