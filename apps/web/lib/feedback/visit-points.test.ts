import { afterAll, describe, expect, it } from 'vitest';
import { PointsEntryService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { awardVisitPoints } from './points';

/**
 * Günlük ziyaret puanı (17.4 · kullanıcı kararı 03.08) — **sınanan şey "günde bir".**
 *
 * Kapının kendisi tek satır (`awardPoints`e `reason: 'visit'` geçiriyor) ama vaadi tek satırlık
 * değil: aynı gün içindeki ikinci ziyaret puan YAZMAMALI. O güvence koda değil **veriye** yazılı
 * (`points_entry_visit_day`, gün bazlı kısmi unique indeks) ve tam da bu yüzden burada ölçülüyor —
 * kodu okuyarak doğrulanamaz, indeks gerçekten var mı diye sormak gerekir.
 *
 * Ziyaret puanının öteki sebeplerden ayrı bir mekanizması olmasının sebebi: `points_entry_source_key`
 * `ref_id is not null` ile sınırlı ve ziyaretin işaret edeceği bir kaynak satır yok. Yani "aynı
 * kaynaktan iki kez puan yok" kuralı bu sebebi hiç görmüyor; onu gören tek şey gün indeksi.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const entries = new PointsEntryService(db);

const stamp = Date.now();
const createdProfiles: string[] = [];

/** Damgalı müşteri — paylaşılan veritabanında başka bir koşunun satırlarına dokunmaz (CLAUDE §4b). */
async function newCustomer(type: 'individual' | 'company' = 'individual'): Promise<string> {
  const profile = await profiles.insert({
    roles: ['customer'],
    type,
    name: `Ziyaret ${stamp}`,
    email: `ziyaret-${stamp}-${createdProfiles.length + 1}@example.test`,
  });
  createdProfiles.push(profile.id);
  return profile.id;
}

afterAll(async () => {
  await purgeTestData(db, { profileIds: createdProfiles });
});

describe('günlük ziyaret puanı', () => {
  it('ilk geliş puan yazar, aynı gündeki ikincisi YAZMAZ', async () => {
    const customerId = await newCustomer();

    const first = await awardVisitPoints(customerId);
    expect(first).not.toBeNull();
    expect(first!.reason).toBe('visit');
    // Değer AYARDAN gelir (`points_visit`, varsayılan 10) — test sabiti yeniden yazmaz, yalnız
    // "sıfırdan büyük bir şey yazıldı" der. Sayıyı burada sabitlemek, ayarı değiştiren kişiye
    // ilgisiz bir kırmızı gösterirdi.
    expect(first!.points).toBeGreaterThan(0);

    // İkinci geliş sessizce boş döner — hata değil, gün içinde ikinci ziyaret normal davranıştır.
    const second = await awardVisitPoints(customerId);
    expect(second).toBeNull();

    // Asıl iddia defterde: KENDİ müşterimizin satırları sayılıyor, küresel bir sayaç değil —
    // başka bir ajanın koşusu o sayıyı oynatırdı (CLAUDE §4b).
    const ledger = await entries.listByCustomer(customerId);
    expect(ledger.rows.filter((r) => r.reason === 'visit')).toHaveLength(1);
  });

  it('şirket müşterisi ziyaret puanı KAZANMAZ', async () => {
    // DOMAIN §14: puan yalnız B2C. Toptancının zaten özel fiyatı var; oyunlaştırma son kullanıcı
    // içindir. Ziyaret sebebi bu kuralın dışında kalsaydı, B2B hesap her gün sessizce puan
    // biriktirir ve kupona çevirmeye kalktığında kapıda reddedilirdi — defterde duran ama
    // harcanamayan bakiye, açıklaması olmayan bir bakiyedir.
    const companyId = await newCustomer('company');
    expect(await awardVisitPoints(companyId)).toBeNull();
  });
});
