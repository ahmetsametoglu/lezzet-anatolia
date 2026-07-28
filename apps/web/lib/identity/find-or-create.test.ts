import { afterAll, describe, expect, it } from 'vitest';
import { UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { findOrCreateCustomer } from './find-or-create';

/**
 * Bul-veya-oluştur (04.4/04.5) — DOMAIN §10. Motor kararının DB'ye doğru bağlandığı doğrulanır:
 * "hangi anahtar kazanır" kararı motorun birim testinde (`domain-core/identity`), burada
 * **kayıt gerçekten tek mi oldu** sorusu test edilir.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();
const createdIds: string[] = [];
const authKullanicilari: string[] = [];

/** Testler birbirinin anahtarını kirletmesin diye her senaryo kendi numarasını/e-postasını alır. */
const phone = (n: number) => `+3360000${String(stamp).slice(-4)}${n}`;
const emailFor = (n: number) => `kimlik${stamp}-${n}@ornek.fr`;

/** Fransız yerel biçimi (boşluklu) — normalize edilince `+336…` olmalı. Damgalı: sabit numara koşular arasında sızar. */
const digits = String(stamp).slice(-8);
const localPhone = `06 ${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)}`;

async function findOrCreate(input: Parameters<typeof findOrCreateCustomer>[0]) {
  const result = await findOrCreateCustomer(input);
  if (result.status === 'created' || result.status === 'attached') createdIds.push(result.profile.id);
  return result;
}

afterAll(async () => {
  // Auth kullanıcısı silinince profil satırı `set null` ile YETİM kalır — trigger'ın açtığı satırın
  // sahibi test olduğu için o da toplanır (silme sırası: cleanup.ts).
  await purgeTestData(db, { profileIds: [...new Set(createdIds)], authUserIds: authKullanicilari });
});

describe('kimlik kurulumu', () => {
  it('anahtarsız gelen kimlik kuramaz — "hesapsız sipariş yok" burada başlar', async () => {
    expect(await findOrCreate({ name: 'Kimliksiz' })).toEqual({ status: 'insufficient' });
  });

  it('hiç eşleşme yoksa yeni müşteri açılır; telefon E.164 normalize yazılır', async () => {
    const outcome = await findOrCreate({ phone: localPhone, name: 'Ayşe' });
    expect(outcome.status).toBe('created');
    if (outcome.status !== 'created') return;
    expect(outcome.profile.phone).toBe(`+336${digits}`); // boşluklar ve baştaki 0 gitti
    expect(outcome.profile.isDraft).toBe(false);
  });

  it('WhatsApp taslağı işaretli açılır; adı yoksa numarasıyla anılır', async () => {
    const outcome = await findOrCreate({ phone: phone(1), asDraft: true });
    expect(outcome.status).toBe('created');
    if (outcome.status !== 'created') return;
    expect(outcome.profile.isDraft).toBe(true);
    expect(outcome.profile.name).toBe(outcome.profile.phone);
  });
});

describe('aynı kişi tek müşteride birleşir', () => {
  it('telefon eşleşirse ona bağlanır — ikinci kayıt AÇILMAZ', async () => {
    const ilk = await findOrCreate({ phone: phone(2), name: 'Mehmet' });
    const ikinci = await findOrCreate({ phone: phone(2), name: 'Mehmet Y.' });

    expect(ikinci.status).toBe('attached');
    if (ilk.status !== 'created' || ikinci.status !== 'attached') return;
    expect(ikinci.profile.id).toBe(ilk.profile.id);
    expect(ikinci.profile.name).toBe('Mehmet'); // müşterinin kendi verisi otomatik akışla ezilmez
  });

  it('e-posta eşleşirse ona bağlanır (büyük/küçük harf kimlik ayırmaz)', async () => {
    const ilk = await findOrCreate({ email: emailFor(3), name: 'Fatma' });
    const ikinci = await findOrCreate({ email: emailFor(3).toUpperCase(), name: 'Fatma' });

    expect(ikinci.status).toBe('attached');
    if (ilk.status !== 'created' || ikinci.status !== 'attached') return;
    expect(ikinci.profile.id).toBe(ilk.profile.id);
  });

  it('ikinci anahtar eksikse tamamlanır — bir sonraki gelişte tek sorguda bulunur', async () => {
    const ilk = await findOrCreate({ phone: phone(4), name: 'Ali' });
    // Aynı kişi bu kez web'den, e-postasıyla geliyor: telefon eşleşiyor, e-posta karta yazılır.
    const ikinci = await findOrCreate({ phone: phone(4), email: emailFor(4) });

    expect(ikinci.status).toBe('attached');
    if (ilk.status !== 'created' || ikinci.status !== 'attached') return;
    expect(ikinci.profile.id).toBe(ilk.profile.id);
    expect(ikinci.profile.email).toBe(emailFor(4));
  });

  it('iki anahtar İKİ FARKLI müşteriye çıkarsa sessizce seçim yapılmaz — çakışma bildirilir', async () => {
    await findOrCreate({ phone: phone(5), name: 'Telefonlu' });
    await findOrCreate({ email: emailFor(5), name: 'Postalı' });

    const outcome = await findOrCreate({ phone: phone(5), email: emailFor(5) });
    expect(outcome.status).toBe('conflict'); // admin birleştirir (DOMAIN §10)
  });
});

describe('Auth bağlama (04.4)', () => {
  /** Gerçek Auth kullanıcısı — bağ FK'lidir, uydurma uuid yazılamaz (kimlik gerçekten doğrulanmalı). */
  async function authKullanicisiAc(email: string): Promise<string> {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    authKullanicilari.push(data.user.id);
    return data.user.id;
  }

  it('E-POSTAYLA açılmış kayıt: giriş yapınca aynı profile bağlanır, taslak düşer (04.4 kriteri)', async () => {
    const email = emailFor(6);
    const before = await findOrCreate({ email, name: 'Önce kayıt', asDraft: true });
    expect(before.status).toBe('created');
    if (before.status !== 'created') return;

    // Giriş: DB trigger'ı (0002) e-postayla eşleşen profili bulup Auth'a bağlar, taslağı kapatır.
    const authUserId = await authKullanicisiAc(email);
    const input = await findOrCreate({ email, authUserId });

    expect(input.status).toBe('attached');
    if (input.status !== 'attached') return;
    expect(input.profile.id).toBe(before.profile.id); // tek profil
    expect(input.profile.authUserId).toBe(authUserId);
    expect(input.profile.isDraft).toBe(false);
  });

  it('TELEFONLA açılmış taslak + e-postayla giriş İKİ kayıt üretir → çakışma bildirilir', async () => {
    // Trigger yalnız e-postayla eşleştirir; sadece telefonu olan taslağı göremez ve yeni profil açar.
    // Bu gerçek bir kopya durumudur (DOMAIN §10) — kapı sessizce birine yazmaz, admin birleştirir.
    const draft = await findOrCreate({ phone: phone(6), asDraft: true });
    if (draft.status !== 'created') return;

    const authUserId = await authKullanicisiAc(emailFor(8));
    const input = await findOrCreate({ phone: phone(6), authUserId });

    expect(input.status).toBe('conflict');
    if (input.status !== 'conflict') return;
    expect(input.profileIds).toContain(draft.profile.id);
    expect(input.profileIds).toHaveLength(2);
  });

  it('bir Auth kullanıcısı iki profile bağlanamaz', async () => {
    const authUserId = await authKullanicisiAc(emailFor(7));
    const triggerProfili = await profiles.findByAuthUserId(authUserId);
    expect(triggerProfili).not.toBeNull(); // trigger girişte profili açtı
    createdIds.push(triggerProfili!.id);

    const baskasi = await findOrCreate({ phone: phone(7), name: 'Başkası' });
    if (baskasi.status !== 'created') return;

    await expect(profiles.linkAuthUser(baskasi.profile.id, authUserId)).rejects.toThrow();
    expect((await profiles.findByAuthUserId(authUserId))?.id).toBe(triggerProfili!.id);
  });
});
