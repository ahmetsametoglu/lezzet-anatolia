import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { ConversationService } from './conversation.service';
import { CustomerPhoneService } from './customer-phone.service';
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

    const konusma = await conversations.open({ source: 'whatsapp', externalRef: `+33900${String(stamp).slice(-6)}`, customerId: kaynakKayit.id });
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
    // `gainsPhone`ın SORUSU 04.10'da değişti: telefon artık kolonda değil kendi kaydında
    // (`customer_phone`) ve doğrulanmış numaralar TOPLANIR — hedefin numarası olup olmaması
    // önemsiz, biri ötekini dışlamıyor. Sorulan şey artık "kaynakta aktif bir KANIT var mı".
    const webKaydi = await musteri('onizleme-web');
    const taslak = await musteri('onizleme-taslak', { email: null });
    await new CustomerPhoneService(db).recordProof(taslak.id, `+336${String(stamp).slice(-6)}91`);

    const onizleme = await profiles.previewMerge(webKaydi.id, taslak.id);
    expect(onizleme.gainsPhone).toBe(true);
    expect(onizleme.gainsEmail).toBe(false);
  });

  it('kaynakta kanıt YOKSA hedef telefon kazanmaz — kolondaki numara anahtar DEĞİL (04.10)', async () => {
    // Kaynağın `user_profiles.phone`u dolu ama o bir İLETİŞİM numarası: birleştirme onu taşısa da
    // hedefe bir kimlik anahtarı kazandırmıyor. Ön izleme bunu doğru söylemeli, yoksa operatör
    // olmayan bir kazanım görür.
    const hedef = await musteri('onizleme-kanitsiz-hedef');
    const kaynak = await musteri('onizleme-kanitsiz-kaynak', { email: null });

    expect((await profiles.previewMerge(hedef.id, kaynak.id)).gainsPhone).toBe(false);
  });
});

describe('ATOMİKLİK — yarıda kesilirse hiçbir şey taşınmaz', () => {
  /*
    Görev satırının bitti-ölçütünün ikinci yarısı (`04.7`) ve 27.08'e kadar SINANMAMIŞTI. Dosya
    künyesi *"bir satır taşınamazsa hiçbiri taşınmamalı"* diyor; yarısı taşınmış iki kayıt, hiç
    birleştirilmemiş iki kayıttan KÖTÜDÜR — artık hangisinin doğru olduğu belli değildir ve
    operatörün elinde onu anlayacak bir iz yoktur.

    **Kesinti nasıl ZORLANIYOR:** `points_entry_source_key` tekilliği `(müşteri, sebep, kaynak)`
    üçlüsünde ve pozitif satırlarda geçerli. RPC yalnız `visit` çakışmalarını önceden düşürüyor;
    başka bir sebepte aynı `ref_id` iki kayıtta da varsa taşıma o satırda PATLAR. Patladığı yer de
    doğru yer: puan hareketi sırada BEŞİNCİ (sipariş · adres · sepet · talep · konuşma ondan önce
    taşınıyor), yani hata anında dört tablo çoktan yazılmıştır.

    İddia bu yüzden konuşma üzerinden kuruluyor: o, patlama anında ZATEN taşınmış olması gereken
    bir satır. Geri dönmüşse transaction gerçekten bütün.

    **Bu test NEYE karşı duruyor — açıkça yazıyorum, yoksa "Postgres zaten atomik" diye silinir.**
    Doğru: plpgsql fonksiyonu çağıranın transaction'ında koşar, yani bugün bütünlük YAPISALDIR ve
    bu test bugün düşemez. Koruduğu şey gelecekteki bir "iyileştirme": gövdeye bir
    `exception when others then …` bloğu eklemek. O blok hatayı yutar, fonksiyon başarıyla döner ve
    geriye YARIM birleştirilmiş iki kayıt kalır — sipariş ve konuşma hedefte, puan ve anahtarlar
    kaynakta. Böyle bir blok makul bir niyetle eklenir ("çakışmayı zarifçe geç") ve hiçbir tip ya da
    lint kontrolü onu görmez. Görebilecek tek şey budur.
  */
  it('puan tekilliği taşımayı keserse ÖNCE taşınanlar da geri döner', async () => {
    const hedefKayit = await musteri('atom-hedef', { phone: null });
    const kaynakKayit = await musteri('atom-kaynak');

    const konusma = await conversations.open({
      source: 'whatsapp',
      externalRef: `+33901${String(stamp).slice(-6)}`,
      customerId: kaynakKayit.id,
    });
    conversationIds.push(konusma.id);

    // Aynı `(sebep, kaynak)` ikisinde de VAR ve `visit` değil → RPC bunu önceden düşürmüyor.
    // `order` seçildi: `manual` iki CHECK kısıtı istiyor (aktör + not) ve testin konusu o değil.
    const ortakKaynak = randomUUID();
    await points.insert({ customerId: kaynakKayit.id, points: 25, reason: 'order', refId: ortakKaynak });
    await points.insert({ customerId: hedefKayit.id, points: 25, reason: 'order', refId: ortakKaynak });

    await expect(profiles.merge({ targetId: hedefKayit.id, sourceId: kaynakKayit.id })).rejects.toThrow();

    // ── HİÇBİR ŞEY TAŞINMAMIŞ OLMALI ──
    expect((await conversations.getById(konusma.id))?.customerId).toBe(kaynakKayit.id);
    // Kaynak KAPANMAMIŞ: yarım birleşme, kapanmış ama içi boşalmamış bir kayıt bırakırdı.
    const kaynakSonra = await profiles.getById(kaynakKayit.id);
    expect(kaynakSonra?.mergedIntoId).toBeNull();
    expect(kaynakSonra?.email).not.toBeNull(); // anahtarları da boşaltılmamış
    // Ve puan hareketi yerinde: bakiye kaynakta duruyor.
    expect((await balances.getByCustomer(kaynakKayit.id))?.balance).toBe(25);
  });
});

describe('ön izleme getiren ödülünü ÖNCEDEN söyler', () => {
  /*
    Hakkaniyetin asıl yükü burada: kayıp, müşterinin o an yaptığı bir şeyden DEĞİL, bizim kayıt
    düzeltmemizden doğuyor — birleştirme operatörün eylemi. En sık hâli de kötü niyet değil kaza
    (aile telefonu, tuşlama hatası). Sessizce alınan puan, doğru olsa bile hakkaniyetsizdir.
  */
  it('kendi kendini getirme varsa ödül TUTARIYLA bildirilir', async () => {
    const hesap = await musteri('OnizlemeHesap', { phone: null });
    const taslak = await musteri('OnizlemeTaslak');
    await profiles.update({ id: taslak.id, referredBy: hesap.id, isDraft: true });
    await points.insert({ customerId: hesap.id, reason: 'referral', refId: taslak.id, points: 500 });

    const on = await profiles.previewMerge(hesap.id, taslak.id);
    expect(on.referralRevoked).toBe(500);
  });

  it('getiren BAŞKASIYSA ön izleme 0 der — uyarı yalnız gerçek vakada çıkar', async () => {
    const getiren = await musteri('OnizlemeGetiren', { phone: null });
    const hesap = await musteri('OnizlemeHesap2', { phone: null });
    const taslak = await musteri('OnizlemeTaslak2');
    await profiles.update({ id: taslak.id, referredBy: getiren.id, isDraft: true });
    await points.insert({ customerId: getiren.id, reason: 'referral', refId: taslak.id, points: 500 });

    expect((await profiles.previewMerge(hesap.id, taslak.id)).referralRevoked).toBe(0);
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

/**
 * ŞİRKET KAYDI BİRLEŞMEZ (kullanıcı kararı 27.08) — ve bu bir kısıtlama değil, bir AYRIM.
 *
 * Birleştirmenin varlık sebebi *"aynı kişi iki kez kaydolmuş"*. Şirket kaydı ile bireysel kayıt ise
 * çoğu zaman kopya DEĞİLDİR: lokanta sahibi işletmesi için faturalı/vadeli, evi için normal
 * fiyattan sipariş verir — aynı insan, iki ayrı müşteri.
 *
 * Ölçülen zarar (27.08): RPC on yedi ticari alanın hiçbirine dokunmuyor ama SİPARİŞLERİ taşıyor.
 * Yani şirketin ödenmemiş faturaları, vade ayarı olmayan bireysel bir kartın üstüne geçiyordu —
 * borç duruyor, freni gidiyordu.
 */
describe('şirket kaydı birleştirilemez — bireysel ve kurumsal AYRI müşteridir', () => {
  it('HEDEF şirketse reddedilir', async () => {
    const hedef = await musteri('SirketHedef');
    const kaynak = await musteri('BireyselKaynak');
    await profiles.update({ id: hedef.id, type: 'company' });

    await expect(profiles.merge({ targetId: hedef.id, sourceId: kaynak.id })).rejects.toThrow(/şirket kaydı birleştirilemez/);
  });

  it('KAYNAK şirketse de reddedilir — yön kapıyı açmaz', async () => {
    const hedef = await musteri('BireyselHedef');
    const kaynak = await musteri('SirketKaynak');
    await profiles.update({ id: kaynak.id, type: 'company' });

    await expect(profiles.merge({ targetId: hedef.id, sourceId: kaynak.id })).rejects.toThrow(/şirket kaydı birleştirilemez/);
  });

  /*
    FAIL-CLOSED. "Şirket mi" sorusunun üretimde İKİ cevabı var — `type = 'company'` (çekirdek yol)
    ve `company_info is not null` (`prices-read`) — ve onları bağlayan bir kısıt YOK; besleme bile
    ayrışmış bir kayıt üretiyor. Tek sinyale bakan kapı, ayrışmanın olduğu satırda sessizce açık
    kalırdı. Bu test o ikinci sinyali tek başına sınıyor: tür `individual`, künye dolu.
  */
  it('türü bireysel ama ŞİRKET KÜNYESİ doluysa yine reddedilir — iki sinyal de kapatır', async () => {
    const hedef = await musteri('KunyeliHedef');
    const kaynak = await musteri('DuzKaynak');
    await profiles.update({ id: hedef.id, companyInfo: { legalName: `Ornek SARL ${stamp}` } });

    const bakim = await profiles.getById(hedef.id);
    expect(bakim?.type).toBe('individual'); // ayrışmanın gerçekten kurulduğunu doğrula
    await expect(profiles.merge({ targetId: hedef.id, sourceId: kaynak.id })).rejects.toThrow(/şirket kaydı birleştirilemez/);
  });

  /*
    TEK İSTİSNA — ve bu test onun SINIRINI da çiziyor. Saf taslak ikinci bir müşteri değildir:
    girişi yok, şirket künyesi yok, ezilecek ticari kimliği yok. İstisna olmasaydı CANLI bir akış
    kesilirdi (ölçüldü 27.08): `merge_customers`ın üretimdeki tek çağrısı WhatsApp bağlamadır ve
    oraya yalnız kaynak saf taslakken girilir; hedef ise şirket olabilir. Şirket hesabı olan
    müşteri WhatsApp'ını bağlayamaz, geçmişi ayrı bir taslakta kalırdı.
  */
  it('KAYNAK saf taslaksa şirket hedefe birleşir — WhatsApp bağlamanın yolu budur', async () => {
    const hedef = await musteri('SirketHesap', { phone: null });
    const taslak = await musteri('WaTaslak', { email: null });
    await profiles.update({ id: hedef.id, type: 'company', companyInfo: { legalName: `Lokanta SARL ${stamp}` } });
    await profiles.update({ id: taslak.id, isDraft: true });

    await profiles.merge({ targetId: hedef.id, sourceId: taslak.id });

    expect((await profiles.getById(taslak.id))?.mergedIntoId).toBe(hedef.id);
    // Şirket künyesi ZARAR GÖRMEDİ — taslak hiçbir ticari alan taşımıyordu.
    expect((await profiles.getById(hedef.id))?.type).toBe('company');
  });

  it('taslak ETİKETİ şirket künyesini ÖRTMEZ — istisna kaynağı da sınıyor', async () => {
    const hedef = await musteri('DuzHedef2', { phone: null });
    const taslakSirket = await musteri('TaslakSirket');
    // Taslak ama şirket künyeli: istisnanın kapsamı dışında.
    await profiles.update({ id: taslakSirket.id, isDraft: true, companyInfo: { legalName: `Sahte SARL ${stamp}` } });

    await expect(profiles.merge({ targetId: hedef.id, sourceId: taslakSirket.id })).rejects.toThrow(/şirket kaydı birleştirilemez/);
  });

  it('iki taraf da bireyselse birleşme ÇALIŞIR — kapı yalnız şirketi kesiyor', async () => {
    const hedef = await musteri('SafHedef', { phone: null });
    const kaynak = await musteri('SafKaynak');

    await profiles.merge({ targetId: hedef.id, sourceId: kaynak.id });
    expect((await profiles.getById(kaynak.id))?.mergedIntoId).toBe(hedef.id);
  });
});

/**
 * İZİNLER KESİŞİR — kısıtlayıcı olan kazanır (kullanıcı kararı 27.08).
 *
 * Kural tek cümleyle: *birleşmiş kart, iki karttan hiçbirinin yapamadığı bir şeyi yapamaz.* İzin
 * bir olgu değil BEYANDIR ve beyan miras kalmaz; aksi hâlde birleştirme bir izin ÜRETİRDİ.
 *
 * İki kapının varsayılanı zıt olduğu için tek kural yetmiyor: kampanya OPT-IN (anahtar yoksa
 * hayır), bildirim OPT-OUT (anahtar yoksa evet).
 */
describe('izinler KESİŞİR, miras kalmaz', () => {
  const izin = (granted: boolean) => ({ granted, at: '2026-08-01T00:00:00Z', source: 'test' });

  it('kampanya: hedef izinli ama kaynak SUSMUŞSA izin DÜŞER — sessizlik rıza değildir', async () => {
    const hedef = await musteri('IzinliHedef', { phone: null });
    const kaynak = await musteri('SessizKaynak');
    await profiles.update({ id: hedef.id, marketingConsent: { email: izin(true) } });

    await profiles.merge({ targetId: hedef.id, sourceId: kaynak.id });

    // Kaynakta hiç anahtar yoktu; opt-in'de yokluk "hayır"dır, dolayısıyla kesişim boş.
    expect((await profiles.getById(hedef.id))?.marketingConsent ?? {}).toEqual({});
  });

  it('kampanya: İKİSİ de izinliyse izin KALIR ve kanıt uydurulmaz', async () => {
    const hedef = await musteri('CiftIzinHedef', { phone: null });
    const kaynak = await musteri('CiftIzinKaynak');
    await profiles.update({ id: hedef.id, marketingConsent: { email: izin(true) } });
    await profiles.update({ id: kaynak.id, marketingConsent: { email: izin(true) } });

    await profiles.merge({ targetId: hedef.id, sourceId: kaynak.id });

    // Hedefin kanıtı OLDUĞU GİBİ duruyor — yeni bir satır imal edilmedi.
    expect((await profiles.getById(hedef.id))?.marketingConsent).toMatchObject({
      email: { granted: true, at: '2026-08-01T00:00:00Z', source: 'test' },
    });
  });

  it('bildirim: kaynaktaki AÇIK RET hedefe geçer — opt-out kapısında ret kazanır', async () => {
    const hedef = await musteri('BildirimHedef', { phone: null });
    const kaynak = await musteri('RedKaynak');
    // Hedefte anahtar YOK (opt-out'ta bu "gönderilir" demek), kaynakta açık ret var.
    await profiles.update({ id: kaynak.id, notificationConsent: { feedbackInvite: izin(false) } });

    await profiles.merge({ targetId: hedef.id, sourceId: kaynak.id });

    expect((await profiles.getById(hedef.id))?.notificationConsent).toMatchObject({
      feedbackInvite: { granted: false },
    });
  });

  it('bildirim: iki taraf da susuyorsa gönderim AÇIK kalır — opt-out varsayılanı korunur', async () => {
    const hedef = await musteri('SessizBildirimHedef', { phone: null });
    const kaynak = await musteri('SessizBildirimKaynak');

    await profiles.merge({ targetId: hedef.id, sourceId: kaynak.id });

    expect((await profiles.getById(hedef.id))?.notificationConsent ?? {}).toEqual({});
  });
});
