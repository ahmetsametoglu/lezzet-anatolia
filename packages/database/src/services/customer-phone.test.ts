import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CustomerPhoneService } from './customer-phone.service';
import { UserProfileService } from './user-profile.service';

/**
 * **Kimlik anahtarı: doğrulanmış numara** (04.10 · 0001). DOMAIN §10.
 *
 * Sınanan şey dört değişmez ve dördü de "yanlış hesaba bağlanmış konuşma" arızasının ayrı bir
 * ayağı:
 *   1. **Bir numara en çok bir AKTİF hesaba çıkar** — ikinci hesap kanıtı ele geçiremez.
 *   2. **Emeklilik yolu açar, geçmişi silmez** — devredilmiş hattın çözümü budur.
 *   3. **`lastSeenAt` tazelenir, `verifiedAt` DONMUŞTUR** — biri "hâlâ canlı mı", öteki "ne zaman
 *      kanıtlandı"; tek damgaya iki soru sorulsaydı sessizlik tetiği ölçüsünü kaybederdi.
 *   4. **Kimlik ve numara güncellenemez** — bu satır bir kanıttır, bir tercih değil.
 */
const db = serviceDb();
const phones = new CustomerPhoneService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();
const profileIds: string[] = [];
let sira = 0;

/** Her senaryo kendi numarasını alır: aktif tekillik küresel, paylaşılan numara koşuları kirletir. */
function numara(): string {
  sira += 1;
  return `+336${String(stamp).slice(-6)}${String(sira).padStart(2, '0')}`;
}

async function musteri(ad: string): Promise<string> {
  const row = await profiles.insert({ name: `${ad} ${stamp}` });
  profileIds.push(row.id);
  return row.id;
}

/** PostgREST `…+00:00`, JS `…000Z` üretiyor — aynı an, farklı yazım. */
const an = (value: string | null | undefined): number | null => (value ? new Date(value).getTime() : null);

afterAll(async () => {
  // `customer_phone` CASCADE ile gider (profil silinince) — ayrı silme satırı yazılmaz (cleanup.ts).
  await purgeTestData(db, { profileIds });
});

describe('kanıt kaydı', () => {
  it('ilk kanıt bağı KURAR; aynı müşteriden gelen ikincisi yalnız son görülmeyi tazeler', async () => {
    const id = await musteri('Kanıtlı');
    const telefon = numara();

    const ilk = await phones.recordProof(id, telefon);
    expect(ilk.status).toBe('bound');
    expect(ilk.row).toMatchObject({ customerId: id, phone: telefon, retiredAt: null });

    const ikinci = await phones.recordProof(id, telefon);
    expect(ikinci.status).toBe('seen');
    expect(ikinci.row?.id).toBe(ilk.row?.id); // ikinci SATIR açılmadı
  });

  it('`verifiedAt` DONMUŞ, `lastSeenAt` İLERLER — iki damga iki ayrı soruya cevap verir', async () => {
    const id = await musteri('Damgalı');
    const telefon = numara();

    const ilk = await phones.recordProof(id, telefon);
    const kanitAni = an(ilk.row?.verifiedAt);
    const ilkGorulme = an(ilk.row?.lastSeenAt);

    const ikinci = await phones.recordProof(id, telefon);
    expect(an(ikinci.row?.verifiedAt)).toBe(kanitAni); // kanıtın tarihi geriye alınamaz
    expect(an(ikinci.row?.lastSeenAt)).toBeGreaterThanOrEqual(ilkGorulme!);
  });

  it('BAŞKA müşterinin aktif numarası ELE GEÇİRİLEMEZ — ikinci kanıt bağı çevirmez', async () => {
    // Devredilmiş hattın yeni sahibi de numarayı meşru olarak elinde tutar; zilyetlik gerçektir ama
    // BAĞ bayat olabilir. Bağı koparan şey mesajın gelmesi değil, eski bağın emekliye ayrılmasıdır.
    const sahip = await musteri('İlk sahip');
    const yeni = await musteri('Yeni sahip');
    const telefon = numara();

    await phones.recordProof(sahip, telefon);
    const sonuc = await phones.recordProof(yeni, telefon);

    expect(sonuc.status).toBe('taken');
    expect(sonuc.row?.customerId).toBe(sahip); // kimde olduğu SÖYLENİR: çağıran insana taşıyabilsin
    expect((await phones.findActive(telefon))?.customerId).toBe(sahip);
  });
});

describe('okuma ve emeklilik', () => {
  it('`findActive` yalnız AKTİF satırı görür — emekli numara kimlik çözmez', async () => {
    const id = await musteri('Emekliye ayrılan');
    const telefon = numara();
    const kanit = await phones.recordProof(id, telefon);

    await phones.update({ id: kanit.row!.id, retiredAt: new Date().toISOString() });
    expect(await phones.findActive(telefon)).toBeNull();
    // Satır DURUYOR: "bu numara bir zamanlar kimdeydi" sorusu cevaplanabilir kalmalı.
    expect(await phones.getById(kanit.row!.id)).not.toBeNull();
  });

  it('emeklilik numarayı YENİ sahibine açar — kolon modelinde bu ancak eski bağı silerek olurdu', async () => {
    const eski = await musteri('Hattı bırakan');
    const yeni = await musteri('Hattı devralan');
    const telefon = numara();

    const kanit = await phones.recordProof(eski, telefon);
    await phones.update({ id: kanit.row!.id, retiredAt: new Date().toISOString() });

    const devir = await phones.recordProof(yeni, telefon);
    expect(devir.status).toBe('bound');
    expect((await phones.findActive(telefon))?.customerId).toBe(yeni);
    // Eski bağ kaydı yerinde: geçmiş silinmedi, yalnız süzgecin dışına çıktı.
    expect((await phones.getById(kanit.row!.id))?.customerId).toBe(eski);
  });

  it('bir müşterinin numaraları listelenir; emekli olan listeye girmez', async () => {
    const id = await musteri('Çift hatlı');
    const kisisel = numara();
    const isyeri = numara();
    const eskiHat = numara();

    await phones.recordProof(id, kisisel);
    await phones.recordProof(id, isyeri);
    const emekli = await phones.recordProof(id, eskiHat);
    await phones.update({ id: emekli.row!.id, retiredAt: new Date().toISOString() });

    const liste = await phones.listActiveByCustomer(id);
    // ÇOK NUMARA bilerek serbest (DOMAIN §10, karar ertelendi): kişisel + işyeri meşru bir hâl.
    expect(liste.map((r) => r.phone).sort()).toEqual([kisisel, isyeri].sort());
  });
});

describe('kanıt satırı DÜZELTİLEMEZ', () => {
  it('kimlik ve numara güncelleme sözleşmesinde YOK — yanlış bağın yolu emeklilik, düzeltme değil', async () => {
    const id = await musteri('Sabit kanıt');
    const telefon = numara();
    const kanit = await phones.recordProof(id, telefon);

    // Zod şeması bu alanları hiç tanımıyor: `update` çağrısı tip olarak kurulamaz, çalışma anında
    // da yazmaz. Kural veriye değil SÖZLEŞMEYE konmuş, çünkü buradaki risk kötü niyet değil "şunu
    // bir düzeltiverelim" kolaylığıdır — bir kez açılan kapı kimliği sessizce taşınabilir kılar.
    //
    // **Ret SESSİZ DEĞİL, GÜRÜLTÜLÜ** ve bu daha iyi: şema bilinmeyen alanları düşürünce ortada
    // yazılacak hiçbir kolon kalmıyor, PostgREST de satır döndüremiyor ("Cannot coerce the result
    // to a single JSON object") ve çağrı fırlıyor. Sessizce başarılı dönseydi, çağıran kimliği
    // taşıdığını sanırdı — en tehlikeli hâl bu olurdu.
    await expect(phones.update({ id: kanit.row!.id, customerId: 'baska', phone: '+33600000000' } as unknown as { id: string })).rejects.toThrow();

    const sonra = await phones.getById(kanit.row!.id);
    expect(sonra).toMatchObject({ customerId: id, phone: telefon });
  });
});
