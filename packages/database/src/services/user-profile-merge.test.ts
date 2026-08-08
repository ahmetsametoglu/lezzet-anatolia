import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { ConversationService } from './conversation.service';
import { PointsBalanceService, PointsEntryService } from './points.service';
import { UserProfileService } from './user-profile.service';

/**
 * Müşteri birleştirme (09.10) — `merge_customers` + `preview_customer_merge` (0040).
 *
 * Bu dosya bir özelliği değil, **geri alınamayan bir eylemi** çiviliyor: birleştirmenin geri alma
 * yolu YOK. O yüzden sınanan şey üç başlıkta toplanıyor:
 *   1. **Kimlik anahtarları hedefe geçiyor mu** — işin asıl sebebi bu (taslakta telefon, web
 *      kaydında e-posta). Geçmezse aynı kişi yarın üçüncü kez taslak açar.
 *   2. **Çakışmalarda hedefinki kalıyor mu** — üç tekillik indeksi taşımayı reddedebilir.
 *   3. **Yasaklar gerçekten yasak mı** — kendine, zincire, personele, anonime birleştirme.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const points = new PointsEntryService(db);
const balances = new PointsBalanceService(db);
const conversations = new ConversationService(db);

const stamp = Date.now();
const profileIds: string[] = [];
const conversationIds: string[] = [];
let sira = 0;

/** Her kayıt kendi anahtarını alır: telefon ve e-posta kısmi unique, paylaşılan değer koşuyu kirletir. */
async function musteri(ad: string, over: { phone?: string | null; email?: string | null } = {}) {
  sira += 1;
  const p = await profiles.insert({
    name: `${ad} ${stamp}`,
    email: over.email === null ? null : (over.email ?? `${ad}.${stamp}.${sira}@ornek.fr`),
    phone: over.phone === null ? null : (over.phone ?? `+336${String(stamp).slice(-6)}${String(sira).padStart(2, '0')}`),
  });
  profileIds.push(p.id);
  return p;
}

afterAll(async () => {
  await purgeTestData(db, { conversationIds, profileIds });
});

describe('kimlik anahtarları hedefe geçer — birleştirmenin asıl sebebi', () => {
  it('taslağın TELEFONU web kaydına geçer; kaynağın anahtarları boşalır', async () => {
    // Gerçek vaka: WhatsApp'tan yazan kişi için taslak açıldı (yalnız telefon), sonra aynı kişi
    // siteye girip e-postayla kendi hesabını kurdu (yalnız e-posta).
    const webKaydi = await musteri('web', { phone: null });
    const taslak = await musteri('taslak', { email: null });
    const telefon = taslak.phone;

    await profiles.merge({ targetId: webKaydi.id, sourceId: taslak.id });

    const hedef = await profiles.getById(webKaydi.id);
    expect(hedef?.phone).toBe(telefon);
    expect(hedef?.email).toBe(webKaydi.email);

    // Kaynağın anahtarları BOŞALIR — kısmi unique indeks aynı numarayı iki satırda tutamaz.
    const kaynak = await profiles.getById(taslak.id);
    expect(kaynak?.phone).toBeNull();
    expect(kaynak?.email).toBeNull();
  });

  it('hedefin DOLU anahtarı EZİLMEZ — hedef kazanır', async () => {
    const hedefKayit = await musteri('dolu-hedef');
    const kaynakKayit = await musteri('dolu-kaynak');

    await profiles.merge({ targetId: hedefKayit.id, sourceId: kaynakKayit.id });

    const hedef = await profiles.getById(hedefKayit.id);
    expect(hedef?.phone).toBe(hedefKayit.phone);
    expect(hedef?.email).toBe(hedefKayit.email);
  });

  it('kaynak SİLİNMEZ, kapanır — bağ ve damga birlikte düşer', async () => {
    const hedefKayit = await musteri('kapanis-hedef');
    const kaynakKayit = await musteri('kapanis-kaynak');

    await profiles.merge({ targetId: hedefKayit.id, sourceId: kaynakKayit.id });

    const kaynak = await profiles.getById(kaynakKayit.id);
    expect(kaynak).not.toBeNull();
    expect(kaynak?.mergedIntoId).toBe(hedefKayit.id);
    expect(kaynak?.mergedAt).not.toBeNull();
    // Davet bağlantısı da düşer: kapanmış bir kaydın kodu çalışmamalı.
    expect(kaynak?.referralCode).toBeNull();
  });
});

describe('kayıtlar taşınır', () => {
  it('konuşma ve puan hareketi hedefe geçer; bakiye toplanır', async () => {
    const hedefKayit = await musteri('tasima-hedef');
    const kaynakKayit = await musteri('tasima-kaynak');

    const konusma = await conversations.open({ externalRef: `+33900${String(stamp).slice(-6)}`, customerId: kaynakKayit.id });
    conversationIds.push(konusma.id);
    await points.insert({ customerId: kaynakKayit.id, points: 40, reason: 'referral' });
    await points.insert({ customerId: hedefKayit.id, points: 10, reason: 'referral' });

    await profiles.merge({ targetId: hedefKayit.id, sourceId: kaynakKayit.id });

    expect((await conversations.getById(konusma.id))?.customerId).toBe(hedefKayit.id);
    // Bakiye defterden TÜRETİLİYOR (`customer_points_balance`) — iki hareket tek bakiyede toplandı.
    expect((await balances.getByCustomer(hedefKayit.id))?.balance).toBe(50);
    // Kaynakta hiçbir hareket kalmadı: görünüm o müşteriyi artık hiç tanımıyor.
    expect(await balances.getByCustomer(kaynakKayit.id)).toBeNull();
  });
});

describe('çakışmada HEDEFİNKİ kalır — ve ön izleme onu ÖNCEDEN söyler', () => {
  it('aynı gün ziyaret puanı iki kayıtta da varsa kaynağınki düşer, bakiyeyi şişirmez', async () => {
    // Tekillik zaten "aynı gün iki kez sayılmasın" diyor; taşımak onu delerdi.
    const hedefKayit = await musteri('ziyaret-hedef');
    const kaynakKayit = await musteri('ziyaret-kaynak');
    await points.insert({ customerId: hedefKayit.id, points: 5, reason: 'visit' });
    await points.insert({ customerId: kaynakKayit.id, points: 5, reason: 'visit' });

    const onizleme = await profiles.previewMerge(hedefKayit.id, kaynakKayit.id);
    expect(onizleme.points).toBe(1);
    expect(onizleme.pointsDropped).toBe(1);
    // Net delta SIFIR: taşınacak tek hareket zaten düşecek olan.
    expect(onizleme.pointsDelta).toBe(0);

    await profiles.merge({ targetId: hedefKayit.id, sourceId: kaynakKayit.id });

    const hareketler = await points.listByCustomer(hedefKayit.id);
    expect(hareketler.rows).toHaveLength(1);
    expect((await balances.getByCustomer(hedefKayit.id))?.balance).toBe(5);
  });

  it('ön izleme hedefin hangi ANAHTARI kazanacağını söyler', async () => {
    const webKaydi = await musteri('onizleme-web', { phone: null });
    const taslak = await musteri('onizleme-taslak', { email: null });

    const onizleme = await profiles.previewMerge(webKaydi.id, taslak.id);
    expect(onizleme.gainsPhone).toBe(true);
    expect(onizleme.gainsEmail).toBe(false);
  });
});

describe('yasaklar', () => {
  it('kendine birleştirme reddedilir', async () => {
    const p = await musteri('kendine');
    await expect(profiles.merge({ targetId: p.id, sourceId: p.id })).rejects.toThrow();
  });

  it('ZİNCİR reddedilir (A→B→C) — izi takip edilemez kılardı', async () => {
    const a = await musteri('zincir-a');
    const b = await musteri('zincir-b');
    const c = await musteri('zincir-c');

    await profiles.merge({ targetId: b.id, sourceId: a.id });
    // a kapandı: ne kaynak ne hedef olabilir.
    await expect(profiles.merge({ targetId: c.id, sourceId: a.id })).rejects.toThrow();
    await expect(profiles.merge({ targetId: a.id, sourceId: c.id })).rejects.toThrow();
  });

  it('anonimleştirilmiş kayıt birleştirilemez — silinmiş bir kimliği geri doldurmak olurdu', async () => {
    const hedefKayit = await musteri('anonim-hedef');
    const kaynakKayit = await musteri('anonim-kaynak');
    await profiles.anonymize(kaynakKayit.id);

    await expect(profiles.merge({ targetId: hedefKayit.id, sourceId: kaynakKayit.id })).rejects.toThrow();
  });

  it('PERSONEL kaydı birleştirilemez — istihdam kaydıdır, denetim izleri ona bağlı', async () => {
    const musteriKayit = await musteri('personel-hedef');
    const personel = await musteri('personel-kaynak');
    await profiles.setRoles(personel.id, ['admin']);

    await expect(profiles.merge({ targetId: musteriKayit.id, sourceId: personel.id })).rejects.toThrow();
  });
});
