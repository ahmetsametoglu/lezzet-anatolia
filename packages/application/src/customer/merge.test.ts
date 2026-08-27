import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PointsEntryService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { mergeCustomers } from './merge';

/**
 * **KENDİ KENDİNİ GETİRME — birleşmenin ödül sonucu** (`04.7`, kullanıcı yetkilendirdi 27.08).
 *
 * Vaka: kişi kendi taslağını davet eder, taslak sipariş verir, getirene 500 puan yazılır — sonra
 * taslak o kişiye birleştirilir. Ödül *"bize YENİ bir müşteri kazandırdın"* der; birleşme o
 * olgunun hiç gerçekleşmediğini kanıtlar. Olgu çürüdüyse ödül duramaz.
 *
 * Bu dosya üç ayrı iddiayı ayrı ayrı sınıyor, çünkü üçü ayrı sorulara cevap veriyor:
 *   1. **Döngü hiç KURULMUYOR** — `merge_customers`ın `nullif`i (0040). Önce kurulup sonra
 *      kırılsaydı, arada okuyan her sorgu anlamsız veriyi görürdü.
 *   2. **Ödül geri ALINIYOR** — ters satırla, silmeyle değil.
 *   3. **Kapsam DAR** — gerçek bir üçüncü kişi getirmişse ödül DURUR. Bu üçüncüsü en önemlisi:
 *      geniş yazılmış bir geri alma, hakkı olan bir getirenin puanını götürürdü.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const entries = new PointsEntryService(db);

const stamp = Date.now();
const profileIds: string[] = [];
let sira = 0;

async function musteri(ad: string) {
  sira += 1;
  const p = await profiles.insert({
    name: `${ad} ${stamp}`,
    email: `${ad}.${stamp}.${sira}@ornek.fr`,
  });
  profileIds.push(p.id);
  return p;
}

/** Getiren ödülü: kaynağı GETİRİLENİN kimliğidir, getirenin değil (`awardReferralPoints` künyesi). */
async function odulYaz(getiren: string, getirilen: string, puan = 500) {
  await entries.insert({ customerId: getiren, reason: 'referral', refId: getirilen, points: puan });
}

const referralSatirlari = async (customerId: string) =>
  (await entries.listByCustomer(customerId)).rows.filter((e) => e.reason === 'referral');

beforeAll(async () => {
  sira = 0;
});

afterAll(async () => {
  await purgeTestData(db, { profileIds });
});

describe('kendi kendini getirme — birleşme ödülü geri alır', () => {
  it('DÖNGÜ HİÇ KURULMAZ: birleşme sonrası `referredBy` kendisi olmaz, düşer', async () => {
    const hesap = await musteri('Hesap');
    const taslak = await musteri('Taslak');
    await profiles.update({ id: taslak.id, referredBy: hesap.id, isDraft: true });

    await mergeCustomers(db, { targetId: hesap.id, sourceId: taslak.id });

    const sonra = await profiles.getById(hesap.id);
    // Kapanmış kaynağa da bırakılmıyor: "kim getirdi" sorusunun artık cevabı YOK.
    expect(sonra?.referredBy).toBeNull();
  });

  it('ödül TERS SATIRLA geri alınır — satır silinmez, iz kalır', async () => {
    const hesap = await musteri('OdulluHesap');
    const taslak = await musteri('OdulluTaslak');
    await profiles.update({ id: taslak.id, referredBy: hesap.id, isDraft: true });
    await odulYaz(hesap.id, taslak.id);

    const sonuc = await mergeCustomers(db, { targetId: hesap.id, sourceId: taslak.id });

    expect(sonuc.referralRevoked).toBe(500);
    const satirlar = await referralSatirlari(hesap.id);
    // İKİ satır: ödül duruyor, yanına ters satır yazıldı. Toplam sıfır.
    expect(satirlar).toHaveLength(2);
    expect(satirlar.reduce((t, e) => t + e.points, 0)).toBe(0);
  });

  /*
    KAPSAMIN SINIRI. Gerçek bir getirenin hakkı, getirdiği kişinin kaydı başka bir kartla
    birleşti diye gitmez — olgu sürüyor.

    **Bu test bir KOŞULU değil, bir SONUCU çiviliyor ve ayrımı yazıyorum:** uygulamada ayrıca bir
    "kendi getireni mi" kontrolü YOK ve olmasına gerek de yok — ödülün kimliği `(getiren,
    getirilen)` olduğu için hedefin satırlarında aranan şey zaten bulunamıyor. Ölçüldü: koşul
    eklenip kaldırıldığında bu testin sonucu DEĞİŞMİYOR. Yine de vazgeçilmez, çünkü makul ama
    YANLIŞ bir uygulamayı yakalar: geri almayı `referred_by`den yürüyerek yazan biri getirenin
    satırını bulur ve hakkı olan puanı götürürdü. Sınanan şey davranış, kodun şekli değil.
  */
  it('ÜÇÜNCÜ KİŞİ getirmişse ödül DURUR — birleşme onun hakkını götürmez', async () => {
    const getiren = await musteri('GercekGetiren');
    const hesap = await musteri('BirlesenHesap');
    const taslak = await musteri('BirlesenTaslak');
    await profiles.update({ id: taslak.id, referredBy: getiren.id, isDraft: true });
    await odulYaz(getiren.id, taslak.id);

    const sonuc = await mergeCustomers(db, { targetId: hesap.id, sourceId: taslak.id });

    expect(sonuc.referralRevoked).toBe(0);
    const satirlar = await referralSatirlari(getiren.id);
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]?.points).toBe(500);
  });

  it('ödül HİÇ yazılmamışsa sessiz geçer — geri alınacak şey yok', async () => {
    const hesap = await musteri('OdulsuzHesap');
    const taslak = await musteri('OdulsuzTaslak');
    await profiles.update({ id: taslak.id, referredBy: hesap.id, isDraft: true });

    const sonuc = await mergeCustomers(db, { targetId: hesap.id, sourceId: taslak.id });

    expect(sonuc.referralRevoked).toBe(0);
    expect(await referralSatirlari(hesap.id)).toHaveLength(0);
  });

  /*
    HAKKANİYETİN BACKSTOP'U (kullanıcı kararı 25.08, `revokePoints` künyesi): puan çoktan
    harcanmışsa yalnız ELDE OLAN geri alınır, bakiye eksiye DÜŞMEZ. Bizim kayıt düzeltmemiz
    yüzünden müşteriye borç yazılamaz.
  */
  it('puan harcanmışsa yalnız ELDE OLAN geri alınır — müşteriye borç yazılmaz', async () => {
    const hesap = await musteri('HarcayanHesap');
    const taslak = await musteri('HarcayanTaslak');
    await profiles.update({ id: taslak.id, referredBy: hesap.id, isDraft: true });
    await odulYaz(hesap.id, taslak.id);
    // 400'ü harcanmış: elde 100 kaldı.
    await entries.insert({ customerId: hesap.id, reason: 'redemption', refId: randomUUID(), points: -400 });

    const sonuc = await mergeCustomers(db, { targetId: hesap.id, sourceId: taslak.id });

    expect(sonuc.referralRevoked).toBe(100);
    const tumSatirlar = (await entries.listByCustomer(hesap.id)).rows;
    expect(tumSatirlar.reduce((t, e) => t + e.points, 0)).toBe(0); // bakiye sıfır, eksi değil
  });
});
