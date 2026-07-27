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
const damga = Date.now();
const acilanlar: string[] = [];
const authKullanicilari: string[] = [];

/** Testler birbirinin anahtarını kirletmesin diye her senaryo kendi numarasını/e-postasını alır. */
const tel = (n: number) => `+3360000${String(damga).slice(-4)}${n}`;
const posta = (n: number) => `kimlik${damga}-${n}@ornek.fr`;

async function bulVeyaOlustur(input: Parameters<typeof findOrCreateCustomer>[0]) {
  const result = await findOrCreateCustomer(input);
  if (result.status === 'created' || result.status === 'attached') acilanlar.push(result.profile.id);
  return result;
}

afterAll(async () => {
  // Auth kullanıcısı silinince profil satırı `set null` ile YETİM kalır — trigger'ın açtığı satırın
  // sahibi test olduğu için o da toplanır (silme sırası: cleanup.ts).
  await purgeTestData(db, { profileIds: [...new Set(acilanlar)], authUserIds: authKullanicilari });
});

describe('kimlik kurulumu', () => {
  it('anahtarsız gelen kimlik kuramaz — "hesapsız sipariş yok" burada başlar', async () => {
    expect(await bulVeyaOlustur({ name: 'Kimliksiz' })).toEqual({ status: 'insufficient' });
  });

  it('hiç eşleşme yoksa yeni müşteri açılır; telefon E.164 normalize yazılır', async () => {
    const sonuc = await bulVeyaOlustur({ phone: '06 12 34 56 78', name: 'Ayşe' });
    expect(sonuc.status).toBe('created');
    if (sonuc.status !== 'created') return;
    expect(sonuc.profile.phone).toBe('+33612345678');
    expect(sonuc.profile.isDraft).toBe(false);
    await db.from('customer').delete().eq('id', sonuc.profile.id);
  });

  it('WhatsApp taslağı işaretli açılır; adı yoksa numarasıyla anılır', async () => {
    const sonuc = await bulVeyaOlustur({ phone: tel(1), asDraft: true });
    expect(sonuc.status).toBe('created');
    if (sonuc.status !== 'created') return;
    expect(sonuc.profile.isDraft).toBe(true);
    expect(sonuc.profile.name).toBe(sonuc.profile.phone);
  });
});

describe('aynı kişi tek müşteride birleşir', () => {
  it('telefon eşleşirse ona bağlanır — ikinci kayıt AÇILMAZ', async () => {
    const ilk = await bulVeyaOlustur({ phone: tel(2), name: 'Mehmet' });
    const ikinci = await bulVeyaOlustur({ phone: tel(2), name: 'Mehmet Y.' });

    expect(ikinci.status).toBe('attached');
    if (ilk.status !== 'created' || ikinci.status !== 'attached') return;
    expect(ikinci.profile.id).toBe(ilk.profile.id);
    expect(ikinci.profile.name).toBe('Mehmet'); // müşterinin kendi verisi otomatik akışla ezilmez
  });

  it('e-posta eşleşirse ona bağlanır (büyük/küçük harf kimlik ayırmaz)', async () => {
    const ilk = await bulVeyaOlustur({ email: posta(3), name: 'Fatma' });
    const ikinci = await bulVeyaOlustur({ email: posta(3).toUpperCase(), name: 'Fatma' });

    expect(ikinci.status).toBe('attached');
    if (ilk.status !== 'created' || ikinci.status !== 'attached') return;
    expect(ikinci.profile.id).toBe(ilk.profile.id);
  });

  it('ikinci anahtar eksikse tamamlanır — bir sonraki gelişte tek sorguda bulunur', async () => {
    const ilk = await bulVeyaOlustur({ phone: tel(4), name: 'Ali' });
    // Aynı kişi bu kez web'den, e-postasıyla geliyor: telefon eşleşiyor, e-posta karta yazılır.
    const ikinci = await bulVeyaOlustur({ phone: tel(4), email: posta(4) });

    expect(ikinci.status).toBe('attached');
    if (ilk.status !== 'created' || ikinci.status !== 'attached') return;
    expect(ikinci.profile.id).toBe(ilk.profile.id);
    expect(ikinci.profile.email).toBe(posta(4));
  });

  it('iki anahtar İKİ FARKLI müşteriye çıkarsa sessizce seçim yapılmaz — çakışma bildirilir', async () => {
    await bulVeyaOlustur({ phone: tel(5), name: 'Telefonlu' });
    await bulVeyaOlustur({ email: posta(5), name: 'Postalı' });

    const sonuc = await bulVeyaOlustur({ phone: tel(5), email: posta(5) });
    expect(sonuc.status).toBe('conflict'); // admin birleştirir (DOMAIN §10)
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
    const email = posta(6);
    const once = await bulVeyaOlustur({ email, name: 'Önce kayıt', asDraft: true });
    expect(once.status).toBe('created');
    if (once.status !== 'created') return;

    // Giriş: DB trigger'ı (0002) e-postayla eşleşen profili bulup Auth'a bağlar, taslağı kapatır.
    const authUserId = await authKullanicisiAc(email);
    const girdi = await bulVeyaOlustur({ email, authUserId });

    expect(girdi.status).toBe('attached');
    if (girdi.status !== 'attached') return;
    expect(girdi.profile.id).toBe(once.profile.id); // tek profil
    expect(girdi.profile.authUserId).toBe(authUserId);
    expect(girdi.profile.isDraft).toBe(false);
  });

  it('TELEFONLA açılmış taslak + e-postayla giriş İKİ kayıt üretir → çakışma bildirilir', async () => {
    // Trigger yalnız e-postayla eşleştirir; sadece telefonu olan taslağı göremez ve yeni profil açar.
    // Bu gerçek bir kopya durumudur (DOMAIN §10) — kapı sessizce birine yazmaz, admin birleştirir.
    const taslak = await bulVeyaOlustur({ phone: tel(6), asDraft: true });
    if (taslak.status !== 'created') return;

    const authUserId = await authKullanicisiAc(posta(8));
    const girdi = await bulVeyaOlustur({ phone: tel(6), authUserId });

    expect(girdi.status).toBe('conflict');
    if (girdi.status !== 'conflict') return;
    expect(girdi.profileIds).toContain(taslak.profile.id);
    expect(girdi.profileIds).toHaveLength(2);
  });

  it('bir Auth kullanıcısı iki profile bağlanamaz', async () => {
    const authUserId = await authKullanicisiAc(posta(7));
    const triggerProfili = await profiles.findByAuthUserId(authUserId);
    expect(triggerProfili).not.toBeNull(); // trigger girişte profili açtı
    acilanlar.push(triggerProfili!.id);

    const baskasi = await bulVeyaOlustur({ phone: tel(7), name: 'Başkası' });
    if (baskasi.status !== 'created') return;

    await expect(profiles.linkAuthUser(baskasi.profile.id, authUserId)).rejects.toThrow();
    expect((await profiles.findByAuthUserId(authUserId))?.id).toBe(triggerProfili!.id);
  });
});
