import { afterAll, expect, it } from 'vitest';
import { UserProfileService, constraintOf, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';

/**
 * **Telefon çarpışmasının ADI** — `updateProfileAction`'ın okunur hata cümlesinin tek dayanağı.
 *
 * Hesap ekranında zaten kayıtlı bir numarayı yazan müşteri, bugüne dek `unexpected` görüyordu
 * ("Bir şeyler ters gitti, tekrar deneyin") — yani kendi doğru numarasını sonsuza kadar tekrar
 * denerdi. Eylem artık kısıt ADINI okuyup `phone_taken` döndürüyor
 * (`account/actions.ts` · `constraintOf(err) === 'user_profiles_phone_key'`).
 *
 * **Kırılgan olan tek varsayım bu ad.** İndeks bir gün yeniden adlandırılırsa hiçbir şey patlamaz:
 * eylem sessizce jenerik cümleye geri düşer ve kimse fark etmez. `typecheck` göremez (dize),
 * `lint` göremez. Görebilecek tek şey bu test.
 *
 * **04.10'un kapanışı DEĞİL:** numaranın doğrulanmadan kimlik anahtarına yazılması sürüyor
 * (`BEKLEYEN(04.10)`, iki yerde). Burada çivilenen şey yalnız çarpışmanın GÖRÜNÜR olması.
 *
 * Paylaşılan-DB disiplini (§4b): numara damgalı, teardown `purgeTestData`.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);

const stamp = Date.now();
// E.164 biçiminde ve damgalı: son 9 hane damgadan geliyor, başka şeridin satırıyla çakışmaz.
const PHONE = `+3360${String(stamp).slice(-7)}`;

const created: string[] = [];

afterAll(async () => {
  await purgeTestData(db, { profileIds: created });
});

it('aynı numara ikinci hesaba yazılamaz ve kısıtın adı `user_profiles_phone_key`dir', async () => {
  const first = await profiles.insert({ name: `Telefon sahibi ${stamp}`, phone: PHONE });
  created.push(first.id);

  const second = await profiles.insert({ name: `Numarayı isteyen ${stamp}` });
  created.push(second.id);

  // Ekranın gördüğü yol: var olan bir karta başkasının numarası yazılmaya çalışılıyor.
  const err = await profiles.update({ id: second.id, phone: PHONE }).then(
    () => null,
    (e: unknown) => e,
  );

  // Önce ihlalin GERÇEKTEN olduğu: kısıt olmasaydı iki hesap tek numarayı paylaşır ve
  // WhatsApp'tan gelen mesaj tek müşteriye çözülemezdi (DOMAIN §10).
  expect(err).not.toBeNull();
  // Sonra adı — okunur cümlenin bağlı olduğu tek dize.
  expect(constraintOf(err)).toBe('user_profiles_phone_key');
});
